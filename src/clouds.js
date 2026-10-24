import * as T from "three/webgpu";
import { uploadTextures } from "./gpu-uploads.js";
import * as N from "three/tsl";
import {
  cloudShape,
  cloudLighting,
  cloudTrace,
  cloudShadow,
} from "./cloud-kernels.js";
import { fullscreen, readPixels, ref, texRef } from "./tsl-baking.js";
export const CLOUD_SHADOW_STRENGTH = 0.22;
export const cloudStats = {
  densityBakes: 0,
  lightingBakes: 0,
  skyBakes: 0,
  shadowBakes: 0,
  cacheHit: false,
  dimensions: [256, 48, 256],
  maximumAttenuation: CLOUD_SHADOW_STRENGTH,
};
let densityTarget,
  litTarget,
  shadowTargets,
  skyTargets,
  quads,
  front = 0,
  row = 0,
  phase = 0,
  busy = false,
  lastStart = -Infinity,
  initialized = false;
const state = {
  density: { value: null },
  lit: { value: null },
  sky: { value: null },
  shadow: { value: null },
  eye: { value: new T.Vector3() },
  sun: { value: new T.Vector3(0, 1, 0) },
  time: { value: 0 },
};
function ensureClouds() {
  if (quads) return;
  const target = (w, h, half = false) =>
    new T.RenderTarget(w, h, {
      type: half ? T.HalfFloatType : T.UnsignedByteType,
      depthBuffer: false,
    });
  densityTarget = target(2048, 1536);
  litTarget = target(2048, 1536);
  shadowTargets = [target(512, 512, true), target(512, 512, true)];
  for (const t of shadowTargets) {
    t.texture.generateMipmaps = true;
    t.texture.minFilter = T.LinearMipmapLinearFilter;
  }
  skyTargets = [target(2048, 1024, true), target(2048, 1024, true)];
  for (const t of skyTargets) {
    t.texture.wrapS = T.RepeatWrapping;
  }
  state.density.value = densityTarget.texture;
  state.lit.value = litTarget.texture;
  state.sky.value = skyTargets[0].texture;
  state.shadow.value = shadowTargets[0].texture;
  // QuadMesh uses top-down UVs; packed/cache textures use bottom-up rows.
  const bakeUV = N.uv().flipY();
  const pixel = N.floor(bakeUV.mul(N.vec2(2048, 1536))),
    slice = N.floor(pixel.x.div(256)).add(N.floor(pixel.y.div(256)).mul(8));
  const p = N.vec3(
    N.mod(pixel.x, 256).add(0.5).div(256),
    slice.add(0.5).div(48),
    N.mod(pixel.y, 256).add(0.5).div(256),
  );
  const map = texRef(state, "density"),
    light = texRef(state, "lit"),
    sun = ref(state, "sun", "vec3"),
    time = ref(state, "time");
  const density = cloudShape({ p });
  const flip = N.uniform(0).onRenderUpdate(() =>
    state.density.value.isRenderTargetTexture ? 1 : 0,
  );
  const lighting = cloudLighting({
    map,
    linearSampler: N.sampler(map),
    p,
    sun,
    flipY: flip,
  });
  const azimuth = bakeUV.x.mul(Math.PI * 2),
    altitude = bakeUV.y.mul(Math.PI / 2);
  const ray = N.vec3(
    N.sin(azimuth).mul(N.cos(altitude)),
    N.sin(altitude),
    N.cos(azimuth).mul(N.cos(altitude)),
  );
  const sky = cloudTrace({
    map: light,
    linearSampler: N.sampler(light),
    eye: ref(state, "eye", "vec3"),
    ray,
    sun,
    time,
    flipY: N.float(1),
  });
  const shadow = cloudShadow({
    map,
    linearSampler: N.sampler(map),
    world: bakeUV.sub(0.5).mul(8000),
    sun,
    time,
    flipY: flip,
  });
  quads = [
    N.vec4(density, density, density, 1),
    lighting,
    sky,
    N.vec4(shadow, shadow, shadow, 1),
  ].map((n) => new T.QuadMesh(fullscreen(n)));
}
export function cloudData(U, p, direction) {
  ensureClouds();
  const uv = N.vec2(
    N.atan(direction.x, direction.z).div(Math.PI * 2),
    N.asin(N.clamp(direction.y, 0, 1)).div(Math.PI / 2),
  );
  // Render-target TextureNodes use top-down UVs in both Three backends.
  return texRef(state, "sky").sample(uv.flipY());
}
// Surface materials use a single filtered lookup into the baked sun-projected
// shadow field. The sky and shadows originate from the same cloud density.
export function cloudAt(U, p, direction) {
  ensureClouds();
  const base = p.xz.sub(direction.xz.mul(p.y.div(N.max(direction.y, 0.035))));
  return texRef(state, "shadow").sample(base.div(8000).add(0.5).flipY()).r;
}
function draw(renderer, index, target, band = null) {
  const previous = renderer.getRenderTarget(),
    clear = renderer.autoClear;
  target.viewport.set(0, 0, target.width, target.height);
  target.scissorTest = band !== null;
  if (band !== null) target.scissor.set(0, band * 64, target.width, 64);
  renderer.autoClear = false;
  renderer.setRenderTarget(target);
  quads[index].render(renderer);
  target.scissorTest = false;
  renderer.setRenderTarget(previous);
  renderer.autoClear = clear;
}
function snapshot(U, camera) {
  state.sun.value.copy(U.liveSunDirection.value);
  state.time.value = U.time.value;
  // Sky perspective changes on translation, never on camera rotation.
  state.eye.value.copy(camera.position);
}
export async function prepareClouds(renderer, cache, identity, U, camera) {
  ensureClouds();
  const key = "cloud-volume-v3:" + identity,
    record = await cache.get(key);
  if (record) {
    const t = new T.DataTexture(record.data, 2048, 1536);
    t.minFilter = t.magFilter = T.LinearFilter;
    t.needsUpdate = true;
    state.density.value = t;
    cloudStats.cacheHit = true;
  } else {
    draw(renderer, 0, densityTarget);
    cloudStats.densityBakes++;
    const data = new Uint8Array(2048 * 1536 * 4);
    await readPixels(renderer, densityTarget, 0, 0, 2048, 1536, data);
    await cache.put(key, { data });
    // Cached and cold paths share canonical data orientation on both backends.
    const t = new T.DataTexture(data, 2048, 1536);
    t.minFilter = t.magFilter = T.LinearFilter;
    t.needsUpdate = true;
    state.density.value = t;
  }
  // Native sampling only flips actual render targets, never cached DataTextures.
  await uploadTextures(renderer, [state.density.value]);
  snapshot(U, camera);
  draw(renderer, 1, litTarget);
  draw(renderer, 3, shadowTargets[front]);
  draw(renderer, 2, skyTargets[front]);
  cloudStats.lightingBakes++;
  cloudStats.shadowBakes++;
  cloudStats.skyBakes++;
  initialized = true;
  lastStart = performance.now();
}
export function updateClouds(renderer, now, U, camera) {
  if (!initialized) return;
  if (!busy) {
    if (now - lastStart < 2400) return;
    lastStart = now;
    snapshot(U, camera);
    row = 0;
    phase = 0;
    busy = true;
  }
  // Bound every recurring pass to 64 rows. Neither camera movement nor a
  // weather update submits a whole-volume lighting/sky job in one frame.
  if (phase === 0) {
    draw(renderer, 1, litTarget, row++);
    if (row === 24) {
      phase = 1;
      row = 0;
      cloudStats.lightingBakes++;
    }
  } else if (phase === 1) {
    draw(renderer, 3, shadowTargets[1 - front], row++);
    if (row === 8) {
      phase = 2;
      row = 0;
      cloudStats.shadowBakes++;
    }
  } else {
    draw(renderer, 2, skyTargets[1 - front], row++);
    if (row === 16) {
      front = 1 - front;
      state.sky.value = skyTargets[front].texture;
      state.shadow.value = shadowTargets[front].texture;
      busy = false;
      cloudStats.skyBakes++;
    }
  }
}
export const getCloudTarget = () => shadowTargets[front];

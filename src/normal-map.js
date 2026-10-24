import { normalKernel } from "./native-kernels.js";
import * as T from "three/webgpu";
import * as N from "three/tsl";
import { fullscreen, readPixels } from "./tsl-baking.js";
export async function makeNormal(renderer, source, strength = 3) {
  const w = source.image.width,
    h = source.image.height;
  const target = new T.RenderTarget(w, h, { depthBuffer: false });
  const map = N.texture(source);
  const material = fullscreen(normalKernel({map, linearSampler:N.sampler(map),
    uv:N.uv(), texel:N.vec2(1/w,1/h), strength:N.float(strength)}));
  const scene = new T.Scene(),
    mesh = new T.Mesh(new T.PlaneGeometry(2, 2), material),
    camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(mesh);
  const old = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    const data = new Uint8Array(w * h * 4);
    await readPixels(renderer, target, 0, 0, w, h, data);
    return { data, w, h };
  } finally {
    renderer.setRenderTarget(old);
    mesh.geometry.dispose();
    material.dispose();
    target.dispose();
  }
}

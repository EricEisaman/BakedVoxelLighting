import {cloudAt} from "./clouds.js";
import * as K from "./native-kernels.js";
import * as T from "three/webgpu";
import * as N from "three/tsl";
import { ref, texRef, terrainNode } from "./tsl-baking.js";
const matrices = new WeakMap();
const instanceMatrix = N.Fn((builder) => {
  const source = builder.object.instanceMatrix;
  if (!source) return N.mat4(1);
  let node = matrices.get(source);
  if (!node) {
    const buffer = new T.InstancedInterleavedBuffer(source.array, 16, 1);
    node = N.mat4(
      ...[0, 4, 8, 12].map((offset) =>
        N.instancedBufferAttribute(buffer, "vec4", 16, offset),
      ),
    );
    matrices.set(source, node);
  }
  return node;
});
const yawNode = () =>
  N.varying(
    N.Fn(() => {
      const m = instanceMatrix();
      return N.atan(m.element(0).z.negate(), m.element(0).x);
    })(),
  );
const rotate = (v,a) => K.rotatePlant({v,a});
export function sampleVolume(U,name,p,fallback) {
  const map = texRef(U,name);
  const flipY = N.uniform(0).onRenderUpdate(() => U[name].value?.isRenderTargetTexture ? 1 : 0);
  return K.sampleAtlas({map,linearSampler:N.sampler(map),p,
    origin:ref(U,'volumeMin','vec3'),extent:ref(U,'volumeSize','vec3'),
    dims:ref(U,'bakeDims','vec3'),fallback:N.vec4(...fallback),flipY});
}
const fullFade = new T.Vector2(0, 1);
const fadeRange = N.uniform(fullFade).onObjectUpdate(
  ({ object }) => object.material.userData.fade?.value || fullFade,
);
const fadeMask = K.fadeMask({p:N.screenCoordinate.xy,range:fadeRange});
export function fadeTSL(material) {
  // Three r186 NodeMaterial.copy skips inherited alphaTest's private backing field.
  // Preserve the cutoff explicitly when cloning shared material templates.
  material.alphaTest = material.userData.alphaCutoff ?? material.alphaTest;
  material.userData.fade = { value: new T.Vector2(0, 1) };
  material.maskNode = material.map && material.alphaTest > 0
    ? fadeMask.and((material.opacityNode || N.texture(material.map).a).greaterThan(N.float(material.alphaTest)))
    : fadeMask;
  if(material.alphaTest > 0) material.alphaToCoverage = true;
  return material;
}
const templates = new Map();
export function decorateTSL(original, options, U, grid) {
  const key = JSON.stringify([
    original.map?.uuid,
    original.normalMap?.uuid,
    original.normalScale?.toArray(),
    original.side,
    original.alphaTest,
    original.vertexColors,
    options,
  ]);
  let template = templates.get(key);
  if (!template) {
    template = createDecorated(original, { ...options, fade: false }, U, grid);
    templates.set(key, template);
  }
  const m = template.clone();
  m.alphaTest = template.alphaTest;
  m.color.copy(original.color);
  return options.fade === false ? m : fadeTSL(m);
}
function createDecorated(original, options, U, grid) {
  const {
    wind = 0,
    ground = false,
    fade = true,
    transmission = 0,
    grass = false,
  } = options;
  const m = new T.MeshStandardNodeMaterial();
  // Copy standard properties without copying GLSL hooks or changing NodeMaterial's type.
  for (const key of [
    "color",
    "map",
    "normalMap",
    "normalScale",
    "roughness",
    "metalness",
    "side",
    "alphaTest",
    "alphaToCoverage",
    "transparent",
    "opacity",
    "depthWrite",
    "vertexColors",
  ]) {
    if (original[key] !== undefined)
      m[key] =
        original[key]?.clone && !original[key].isTexture
          ? original[key].clone()
          : original[key];
  }
  m.userData.alphaCutoff = m.alphaTest;
  if(m.map && m.alphaTest > 0) {
    m.maskNode = N.texture(m.map).a.greaterThan(N.float(m.alphaTest));
    m.alphaToCoverage = true;
  }
  m.userData.shading = { wind, ground, transmission, grass };
  if (wind)
    m.positionNode = N.Fn((builder) => {
      const id = builder.object.isInstancedMesh
        ? N.float(N.instanceIndex)
        : N.float(0);
      return K.windPosition({p:N.positionLocal,t:ref(U,'time'),id,
        y:N.positionGeometry.y,v:N.uv().y,strength:N.float(wind)});
    })();
  let base = N.materialColor;
  if (ground) {
    const p = N.positionWorld,
      land = terrainNode(U.terrainField.value, p.xz, grid),
      guv = p.xz.mul(0.8);
    const soil = N.texture(m.map, guv).setUpdateMatrix(false).rgb,
      lush = texRef(U, "groundMap").sample(guv.mul(0.9)).setUpdateMatrix(false).rgb,
      dry = texRef(U, "dryGroundMap").sample(guv.mul(0.9)).setUpdateMatrix(false).rgb;

    const root = texRef(U, "rootField").sample(
      p.xz
        .add(2000)
        .div(4000)
        .mul(grid - 1)
        .add(0.5)
        .div(grid),
    ).r;
    const stone = texRef(U,"rockMap").sample(guv.mul(.5)).setUpdateMatrix(false).rgb;
    const cover = texRef(U,"grassGround").sample(p.xz.add(2000).div(4000));
    m.colorNode = K.groundBlend({p,camera:N.cameraPosition,land,soil,lush,dry,stone,root,cover});
    m.normalNode = N.normalMap(
      N.texture(m.normalMap, guv).setUpdateMatrix(false),
      N.vec2(m.normalScale.x, m.normalScale.y),
    );
    base = m.colorNode;
  }
  if (grass) {
    const detail = N.texture(m.normalMap).xyz.mul(2).sub(1);
    const wn = K.grassNormal({detail,yaw:yawNode()});
    m.normalNode = N.normalize(N.cameraViewMatrix.mul(N.vec4(wn, 0)).xyz);
  }
  const bake = (p) => sampleVolume(U, "bakedAtlas", p, [0.12, 0.16, 0.2, 1]);
  const bent = sampleVolume(
    U,
    "directionAtlas",
    N.positionWorld,
    [0.5, 1, 0.5, 1],
  )
    .rgb.mul(2)
    .sub(1)
    .normalize();
  const indirect = bake(N.positionWorld.add(N.normalWorld.mul(grass ? .15 : 1.1))).rgb;
  const thin = transmission || (grass ? .18 : wind > 0 ? .32 : 0);
  const extra = K.foliageRadiance({n:N.normalWorld,indirect,bent,
    enabled:ref(U,'bakedEnabled'),sun:ref(U,'liveSunDirection','vec3'),
    visibility:bake(N.positionWorld).a.mul(N.float(1).sub(cloudAt(U,N.positionWorld,ref(U,"liveSunDirection","vec3")).mul(.48))),
    lamp:ref(U,'liveLampPosition','vec3').sub(N.positionWorld),
    power:ref(U,'liveLampPower'),thin:N.float(thin),daylight:ref(U,"daylight")});
  m.emissiveNode = N.diffuseColor.rgb.mul(extra);
  return fade ? fadeTSL(m) : m;
}
export function billboardTSL(m, atlas, merged = false) {
  const count = atlas.views,
    rows = atlas.rows || 1;
  const data = N.Fn(() => {
    if (merged)
      return N.vec4(
        N.attribute("plantCenter", "vec3"),
        N.attribute("plantInfo", "vec2").x,
      );
    const matrix = instanceMatrix(),
      center = N.modelWorldMatrix.mul(matrix.element(3)).xyz;
    return N.vec4(
      center,
      N.atan(matrix.element(0).z.negate(), matrix.element(0).x),
    );
  })();
  const angle = N.atan(
    N.cameraPosition.x.sub(data.x),
    N.cameraPosition.z.sub(data.z),
  );
  const atlasUV = N.varying(K.atlasUV({uv:N.uv(),angle,yaw:data.w,
    views:N.float(count),row:merged ? N.attribute('plantInfo','vec2').y : N.float(0),rows:N.float(rows)}));
  m.positionNode = N.Fn(() => {
    const p = N.positionGeometry;
    if (merged) return data.xyz.add(rotate(N.vec3(p.x, p.y, 0), angle));
    const mat = instanceMatrix();
    return mat.mul(N.vec4(rotate(N.vec3(p.x, p.y, 0), angle.sub(data.w)), 1))
      .xyz;
  })();
  const map = N.texture(m.map, atlasUV);
  m.colorNode = map.rgb;
  m.opacityNode = map.a;
  m.maskNode = fadeMask.and(map.a.greaterThan(N.float(m.alphaTest)));
  m.alphaToCoverage = true;
  // Atlas normals were captured in source/world space. Rotate only with the plant,
  // never with the card or current view frame.
  const source = N.texture(m.normalMap, atlasUV).xyz.mul(2).sub(1);
  const wn = rotate(source.normalize(), N.varying(data.w));
  m.normalNode = N.normalize(N.cameraViewMatrix.mul(N.vec4(wn, 0)).xyz);
  // Standard materialColor samples map at its ordinary UV. Explicitly bind both
  // albedo and emissive sampling to the selected atlas frame.
  m.emissiveNode = m.emissiveNode.context({ getUV: () => atlasUV });
  m.userData.billboard = { views: count, rows, normalSpace: "source-world" };
  return m;
}

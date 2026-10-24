import { billboardTSL } from "./tsl-materials.js";
import * as T from "three/webgpu";
import { BakeCache } from "./cache.js";
import { decorate, fadeMaterial } from "./lighting.js";

const cache = new BakeCache("BakedVoxelLightingMerged");
const ready = cache.open();
const frustum = new T.Frustum(),
  matrix = new T.Matrix4();
export const mergedStats = {
  baked: 0,
  hits: 0,
  visible: 0,
  pending: 0,
  sourceDraws: 0,
  mergedDraws: 0,
  errors: [],
};
let mergedTemplate = null;
let atlas = null,
  identity = "",
  busy = false,
  generation = 0;
const bounds = new WeakMap();

function makeAtlas(prototypes) {
  const first = prototypes[0].farAtlas.record,
    w = first.w,
    h = first.h * prototypes.length;
  const colour = new Uint8Array(w * h * 4),
    normal = new Uint8Array(w * h * 4);
  prototypes.forEach((p, i) => {
    colour.set(p.farAtlas.record.data, i * w * first.h * 4);
    normal.set(p.farAtlas.record.normals, i * w * first.h * 4);
  });
  const textures = [colour, normal].map((data) => {
    const t = new T.DataTexture(data, w, h);
    t.magFilter = T.LinearFilter;
    t.minFilter = T.LinearMipmapLinearFilter;
    t.generateMipmaps = false;
    const normalMap = data === normal;
    t.mipmaps = first.mips.map((level,lod) => {
      const pixels=new Uint8Array(level.width*level.height*prototypes.length*4);
      prototypes.forEach((p,row)=>pixels.set(normalMap ? p.farAtlas.record.mips[lod].normals : p.farAtlas.record.mips[lod].data,row*level.width*level.height*4));
      return {data:pixels,width:level.width,height:level.height*prototypes.length};
    });
    t.needsUpdate = true;
    return t;
  });
  textures[0].colorSpace = T.LinearSRGBColorSpace;
  return { textures, views: first.views, rows: prototypes.length };
}
function material() {
  if (mergedTemplate) return fadeMaterial(mergedTemplate.clone());
  const m = decorate(
    new T.MeshStandardMaterial({
      map: atlas.textures[0],
      normalMap: atlas.textures[1],
      alphaTest: 0.32,
      alphaToCoverage: true,
      side: T.DoubleSide,
      roughness: 1,
    }),
    { transmission: 0.32 },
  );
  billboardTSL(m, atlas, true);
  mergedTemplate = m;
  return m;
}
function bake(c, prototypes) {
  const position = [],
    center = [],
    info = [],
    uv = [],
    indices = [],
    normal = [];
  c.trees.forEach((t, i) => {
    const p = prototypes[t.variant],
      a = p.farAtlas.record;
    const v = p.center
      .clone()
      .multiplyScalar(t.scale)
      .applyAxisAngle(new T.Vector3(0, 1, 0), t.rotation)
      .add(new T.Vector3(t.x, t.y, t.z));
    for (const [x, y, u, vv] of [
      [-0.5, -0.5, 0, 0],
      [0.5, -0.5, 1, 0],
      [0.5, 0.5, 1, 1],
      [-0.5, 0.5, 0, 1],
    ]) {
      position.push(x * a.width * t.scale, y * a.height * t.scale, 0);
      center.push(v.x, v.y, v.z);
      info.push(t.rotation, t.variant);
      uv.push(u, vv);
      normal.push(0, 0, 1);
    }
    const k = i * 4;
    indices.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  return {
    position: new Float32Array(position),
    plantCenter: new Float32Array(center),
    plantInfo: new Float32Array(info),
    uv: new Float32Array(uv),
    normal: new Float32Array(normal),
    indices: new Uint32Array(indices),
  };
}
function install(c, record) {
  const g = new T.BufferGeometry();
  for (const [name, size] of [
    ["position", 3],
    ["plantCenter", 3],
    ["plantInfo", 2],
    ["uv", 2],
    ["normal", 3],
  ])
    g.setAttribute(name, new T.BufferAttribute(record[name], size));
  g.setIndex(new T.BufferAttribute(record.indices, 1));
  // Shader rotates each quad about its own tree centre. Ordinary position bounds would be wrong.
  g.boundingSphere = bounds.get(c).clone();
  const mesh = new T.Mesh(g, material());
  mesh.userData.visibilityMerged = true;
  mesh.userData.ownedGeometry = true;
  const group = new T.Group();
  group.add(mesh);
  group.visible = c.levels[3].visible;
  c.unmergedFar = c.levels[3];
  c.unmergedFar.visible = false;
  c.unmergedFar.removeFromParent();
  c.levels[3] = group;
  mergedStats.baked++;
}
export function updateMergedVisibility(clusters, camera, scene, prewarm = false) {
  if (!clusters.atlasIdentity) return;
  if (identity !== clusters.atlasIdentity) {
    generation++;
    identity = clusters.atlasIdentity;
    atlas?.textures.forEach((t) => t.dispose());
    mergedTemplate = null;
    atlas = makeAtlas(clusters.prototypes);
    mergedStats.baked = 0;
    mergedStats.hits = 0;
    for (const c of clusters) {
      c.unmergedFar = null;
      c.sourceFarDraws = new Set(c.trees.map((t) => t.variant)).size;
      bounds.set(
        c,
        new T.Box3()
          .setFromObject(c.levels[0])
          .getBoundingSphere(new T.Sphere()),
      );
      bounds.get(c).radius += 16; // Conservative allowance for camera-facing quad corners.
    }
  }
  camera.updateMatrixWorld();
  matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(matrix, camera.coordinateSystem);
  mergedStats.visible = 0;
  mergedStats.sourceDraws = 0;
  mergedStats.mergedDraws = 0;
  let candidate = null,
    best = Infinity;
  for (const c of clusters) {
    if (
      !c.levels[3]?.visible ||
      !c.trees.length ||
      (!prewarm && !frustum.intersectsSphere(bounds.get(c)))
    )
      continue;
    mergedStats.visible++;
    mergedStats.sourceDraws += c.sourceFarDraws;
    if (c.unmergedFar) {
      mergedStats.mergedDraws++;
      if (c.levels[3].parent !== scene) scene.add(c.levels[3]);
    } else {
      const d = c.center.distanceToSquared(camera.position);
      if (d < best) {
        best = d;
        candidate = c;
      }
    }
  }
  if (busy || !candidate) return;
  busy = true;
  mergedStats.pending = 1;
  const c = candidate,
    version = generation,
    key = `merged-far-v1:${identity}:${c.id}`;
  return (async () => {
    await ready;
    let record = await cache.get(key);
    if (record) mergedStats.hits++;
    else {
      record = bake(c, clusters.prototypes);
      await cache.put(key, record);
    }
    if (version === generation) install(c, record);
  })()
    .catch((e) => mergedStats.errors.push(e.message))
    .finally(() => {
      busy = false;
      mergedStats.pending = 0;
    });
}
export async function clearMergedCache() {
  await ready;
  await cache.clear();
}

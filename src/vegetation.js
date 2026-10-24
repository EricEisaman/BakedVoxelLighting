import {buildGrassBatches} from "./grass-jobs.js";
import * as T from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { random, height } from "./world-data.js";
import { TERRAIN_SIZE, terrainSample } from "./terrain-field.js";
import { decorate, lightUniforms } from "./lighting.js";
import { growPlant } from "./growth.js";
import { captureSurface, instanced, surfaceBillboards, atlasMaterial } from "./impostors.js";
const card = new T.PlaneGeometry(1, 1);
function mergedLeaves(items) {
  const dummy = new T.Object3D(),
    parts = [];
  for (const t of items) {
    const g = card.clone();
    // Represent a small leaf cluster rather than the flat carrier polygon in lighting/captures.
    const normals = g.attributes.normal,
      positions = g.attributes.position;
    for (let i = 0; i < normals.count; i++) {
      const n = new T.Vector3(
        positions.getX(i) * 0.7,
        positions.getY(i) * 0.7,
        0.7,
      ).normalize();
      normals.setXYZ(i, n.x, n.y, n.z);
    }
    dummy.position.set(...t.p);
    dummy.rotation.set(...t.r);
    dummy.scale.set(...t.s);
    dummy.updateMatrix();
    g.applyMatrix4(dummy.matrix);
    const c = new T.Color(t.c),
      colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    g.setAttribute("color", new T.BufferAttribute(colors, 3));
    parts.push(g);
  }
  const result = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return result;
}
function plantMaterials(assets, species, shrub = false) {
  const name = ["oak", "birch", "ash"][species];
  const bark = assets[["bark", "bark-birch", "bark-ash"][species]];
  const wood = decorate(
    new T.MeshStandardMaterial({
      map: bark.map,
      normalMap: bark.normal,
      normalScale: new T.Vector2(0.6, 0.6),
      roughness: 1,
      color: species === 1 ? 0xe2e1d5 : 0xc9bfaa,
    }),
  );
  const leaf = decorate(
    new T.MeshStandardMaterial({
      map: assets[name].map,
      normalMap: assets[name].normal,
      normalScale: new T.Vector2(0.25, 0.25),
      alphaTest: 0.4,
      alphaToCoverage: true,
      side: T.DoubleSide,
      roughness: 0.92,
      color: 0xe3e5bb,
      vertexColors: true,
    }),
    { wind: shrub ? 0.018 : 0.028 },
  );
  return [wood, leaf];
}
function makeModel(plant, assets, low = false) {
  const group = new T.Group(),
    materials = plantMaterials(assets, plant.species, plant.shrub);
  const wood = new T.Mesh(low ? plant.low : plant.high, materials[0]),
    leaf = new T.Mesh(plant.foliage, materials[1]);
  wood.castShadow = leaf.castShadow = true;
  wood.receiveShadow = leaf.receiveShadow = true;
  group.add(wood, leaf);
  return group;
}
export function buildTrees(world, assets) {
  const prototypes = [];
  for (let i = 0; i < 9; i++) {
    const p = growPlant(9801 + i * 137, i % 3);
    p.foliage = mergedLeaves(p.leaves);
    p.model = makeModel(p, assets);
    const box = new T.Box3().setFromObject(p.model),
      size = box.getSize(new T.Vector3());
    p.center = box.getCenter(new T.Vector3());
    p.width = Math.hypot(size.x, size.z) * 1.06;
    p.height = size.y * 1.06;
    prototypes.push(p);
  }
  const clusters = world.clusters.map((c) => {
    const levels = [0, 1].map((level) => {
      const group = new T.Group();
      for (let i = 0; i < 9; i++) {
        const transforms = c.trees
          .filter((t) => t.variant === i)
          .map((t) => ({
            p: [t.x, t.y, t.z],
            r: [0, t.rotation, 0],
            s: [t.scale, t.scale, t.scale],
          }));
        if (!transforms.length) continue;
        const p = prototypes[i],
          m = plantMaterials(assets, p.species);
        const trunk = instanced(level ? p.low : p.high, m[0], transforms),
          leaves = instanced(p.foliage, m[1], transforms);
        trunk.castShadow = leaves.castShadow = true;
        trunk.receiveShadow = leaves.receiveShadow = true;
        group.add(trunk, leaves);
      }
      return group;
    });
    return {
      ...c,
      levels,
      current: -1,
      center: new T.Vector3(c.x, height(c.x, c.z) + 8, c.z),
      kind: "tree",
    };
  });
  clusters.prototypes = prototypes;
  return clusters;
}
function removeLevel(group) {
  if (!group) return;
  group.removeFromParent();
  group.traverse((o) => {
    if (o.isMesh) {
      if (o.isInstancedMesh) o.dispose();
      o.material.dispose();
      if (o.userData.ownedGeometry) o.geometry.dispose();
    }
  });
}
export async function bakeTreeHLOD(
  renderer,
  clusters,
  lights,
  cache,
  identity,
  onProgress,
) {
  if (clusters.atlasIdentity === identity) return;
  const prototypes = clusters.prototypes;
  for (let i = 0; i < prototypes.length; i++) {
    const p = prototypes[i];
    for (const a of [p.atlas, p.farAtlas])
      if (a) {
        a.texture.dispose();
        a.normal.dispose();
      }
    // Capture the exact high-detail foliage; retain actual woody structure at L2.
    const canopy = new T.Group();
    canopy.add(p.model.children[1].clone());
    p.atlas = await captureSurface(
      renderer,
      canopy,
      p.center,
      p.width,
      p.height,
      256,
      16,
      cache,
      `tree-canopy:${identity}:${i}`,
    );
    p.farAtlas = await captureSurface(
      renderer,
      p.model,
      p.center,
      p.width,
      p.height,
      128,
      8,
      cache,
      `tree-far:${identity}:${i}`,
    );
    onProgress(
      `Capturing tree surfaces ${i + 1}/9`,
      0.27 + (0.55 * (i + 1)) / 9,
    );
    await new Promise(requestAnimationFrame);
  }
  for (const c of clusters) {
    removeLevel(c.levels[2]);
    removeLevel(c.levels[3]);
    const middle = new T.Group(),
      far = new T.Group();
    for (let k = 0; k < 9; k++) {
      const p = prototypes[k],
        trees = c.trees.filter((t) => t.variant === k);
      if (!trees.length) continue;
      const transforms = trees.map((t) => ({
        p: [t.x, t.y, t.z],
        r: [0, t.rotation, 0],
        s: [t.scale, t.scale, t.scale],
      }));
      const billboards = trees.map((t) => ({
        p: p.center
          .clone()
          .multiplyScalar(t.scale)
          .applyAxisAngle(new T.Vector3(0, 1, 0), t.rotation)
          .add(new T.Vector3(t.x, t.y, t.z))
          .toArray(),
        r: [0, t.rotation, 0],
        s: [t.scale, t.scale, t.scale],
      }));
      const wood = instanced(
        p.farWood,
        p.model.children[0].material.clone(),
        transforms,
      );
      wood.material = decorate(wood.material);
      wood.castShadow = wood.receiveShadow = true;
      middle.add(wood);
      for (const [group, atlas] of [
        [middle, p.atlas],
        [far, p.farAtlas],
      ]) {
        const mesh = surfaceBillboards(atlas, billboards);
        mesh.userData.ownedGeometry = true;
        group.add(mesh);
      }
    }
    // Keep every tree anchored to its terrain position, including the farthest level.
    c.levels[2] = middle;
    c.levels[3] = far;
  }
  clusters.atlasIdentity = identity;
}
const grassCard = new T.PlaneGeometry(1, 1, 1, 3);
grassCard.translate(0, 0.5, 0);
function grassMaterial(assets, type) {
  const name = ["meadow", "grass", "clover"][type];
  return decorate(
    new T.MeshStandardMaterial({
      map: assets[name].map,
      normalMap: assets[name].normal,
      normalScale: new T.Vector2(0.2, 0.2),
      alphaTest: 0.34,
      alphaToCoverage: true,
      side: T.DoubleSide,
      roughness: 1,
      color: type === 2 ? 0xe3e1cc : 0xe0e4b5,
    }),
    { wind: type === 2 ? 0.025 : 0.065, grass: true },
  );
}
export function grassHabitat(x, z, land) {
  const patch =
    0.5 +
    0.25 * Math.sin(x * 0.073 + Math.sin(z * 0.047) * 2.8) +
    0.25 * Math.sin(z * 0.119 + x * 0.031);
  return {
    density: 0.58 + patch * 0.4,
    clover: 0.06 + land.moisture * patch * 0.36,
    seedheads: 0.07 + (1 - land.moisture) * (1 - patch) * 0.42,
    height: 0.42 + patch * 0.8,
    tint: patch,
  };
}
function* grassPointChunks(x, z, seed, count = 3400, span = 24, flat = false) {
  const rng = random(seed),
    types = [[], [], []];
  for (let i = 0; i < count; i++) {
    if (i && i % 128 === 0) yield;
    const xx = x + (rng() - 0.5) * span,
      zz = z + (rng() - 0.5) * span,
      land = flat
        ? { height: 0, traffic: 0, moisture: 0.5, slope: 0, root: 0 }
        : terrainSample(xx, zz);
    if (
      land.traffic > 0.12 + rng() * 0.25 ||
      land.slope > 0.62 ||
      land.riverDistance < 10
    )
      continue;
    // The same root field drives exposed soil and living ground-cover density.
    if (rng() < T.MathUtils.smoothstep(land.root, 0.08, 0.65) * 0.98) continue;
    const habitat = grassHabitat(xx, zz, land);
    if (rng() > habitat.density) continue;
    const type = rng() < habitat.clover ? 2 : rng() < habitat.seedheads ? 1 : 0,
      scale =
        (type === 2 ? 0.26 + rng() * 0.28 : 0.32 + rng() * 0.52) *
        habitat.height;
    const angle = rng() * Math.PI * .55 + Math.sin(xx*.018+zz*.011)*1.2;
    for (let k = 0; k < 2; k++)
      types[type].push({
        p: [xx, land.height - 0.025, zz],
        r: [0, angle + (k * Math.PI) / 2, 0],
        s: [scale * (type === 2 ? 1.3 : 1.1), scale, scale],
        c: new T.Color()
          .setHSL(0.19 + rng() * 0.04, 0.20, 0.59 + habitat.tint * .18 + rng() * .12)
          .getHex(),
      });
  }
  return types;
}
export function grassPoints(...args) {
  const iterator=grassPointChunks(...args);let result;
  do {result=iterator.next();} while(!result.done);
  return result.value;
}
const yieldWork=()=>new Promise(resolve=>setTimeout(resolve,0));
const grassRequests=[];let grassBusy=false;const grassWaiters=[];
async function pumpGrassJobs(){
 if(grassBusy)return;grassBusy=true;
 try{while(grassRequests.length){
  grassRequests.sort((a,b)=>(a.p.priority+(a.level===2?0:10))-(b.p.priority+(b.level===2?0:10)));
  const {p,level,generation}=grassRequests.shift();
  try{if(generation===p.generation){await yieldWork();await p.build(level,generation);}}
  finally{p.pending.delete(level);}
 }}finally{grassBusy=false;grassWaiters.splice(0).forEach(resolve=>resolve());}
}
export async function finishGrassJobs(){if(grassBusy||grassRequests.length)await new Promise(resolve=>grassWaiters.push(resolve));}
export function buildGrass(assets) {
  const patches = [];
  for (let z = -TERRAIN_SIZE / 2 + 12; z < TERRAIN_SIZE / 2 - 12; z += 24)
    for (let x = -TERRAIN_SIZE / 2 + 12; x < TERRAIN_SIZE / 2 - 12; x += 24) {
      const p = {
        x,
        z,
        seed: 18000 + (x + 492) * 100 + z + 492,
        center: new T.Vector3(x, height(x, z), z),
        levels: [null, null, null, new T.Group()],
        current: -1,
        kind: "grass",
      };
      p.pending = new Set();
      p.generation = 0;
      p.ensure = (level) => {
        if(p.levels[level] || level===3 || p.pending.has(level))return;
        p.pending.add(level);const generation=p.generation;
        grassRequests.push({p,level,generation});
        pumpGrassJobs().catch(console.error);
      };
      p.build = async (level,generation) => {
        if(generation!==p.generation)return;
        if (level === 2 && grass.templates.length === 3) {
          const group=new T.Group(),batches=await buildGrassBatches(x,z,p.seed,2,grass.identity);
          if(generation!==p.generation)return;
          for(let k=0;k<3;k++){
            const batch=batches[k],count=batch.matrices.length/16;if(!count)continue;
            const atlas=grass.templates[k];
            const mesh=new T.InstancedMesh(new T.PlaneGeometry(atlas.record.width,atlas.record.height),atlasMaterial(atlas,.18),count);
            mesh.instanceMatrix.array.set(batch.matrices);mesh.instanceMatrix.needsUpdate=true;
            mesh.instanceColor=new T.InstancedBufferAttribute(batch.colours,3);
            mesh.boundingSphere=new T.Sphere(p.center.clone().add(new T.Vector3(0,.6,0)),32);
            mesh.userData.ownedGeometry=true;mesh.userData.grassCard=true;group.add(mesh);
          }
          await grass.prepare?.(group);
          if(generation!==p.generation){removeLevel(group);return;}
          p.levels[2] = group;
          return;
        }
        const batches = await buildGrassBatches(x,z,p.seed,level,grass.identity);
        if(generation!==p.generation)return;
        const group=new T.Group();
        for(let k=0;k<3;k++){
          const batch=batches[k],count=batch.matrices.length/16;
          if(!count)continue;
          const mesh=new T.InstancedMesh(grassCard,grassMaterial(assets,k),count);
          mesh.instanceMatrix.array.set(batch.matrices);
          mesh.instanceColor=new T.InstancedBufferAttribute(batch.colours,3);
          mesh.instanceMatrix.needsUpdate=true;
          mesh.boundingSphere=new T.Sphere(p.center.clone().add(new T.Vector3(0,.6,0)),32);
          mesh.userData.grassCard=true;mesh.receiveShadow=true;
          group.add(mesh);
        }
        await grass.prepare?.(group);
        if(generation!==p.generation){removeLevel(group);return;}
        p.levels[level] = group;
      };
      p.release = () => {
        p.generation++;
        for (let i = 0; i < 3; i++) {
          removeLevel(p.levels[i]);
          p.levels[i] = null;
        }
      };
      patches.push(p);
    }
  patches.grid=new Map(patches.map(p=>[`${Math.round((p.x+1988)/24)}:${Math.round((p.z+1988)/24)}`,p]));
  patches.active=new Set();
  const grass = { patches, assets, templates: [] };
  return grass;
}
export async function bakeGrassLOD(
  renderer,
  grass,
  lights,
  cache,
  identity,
  onProgress,
) {
  if (grass.identity === identity) return [];
  for (const t of grass.templates) {
    t.texture.dispose();
    t.normal.dispose();
  }
  grass.templates = [];
  for (let k = 0; k < 3; k++) {
    const points = grassPoints(0, 0, 981 + k, 16, 2.4, true),
      source = new T.Group();
    for (const j of [k])
      source.add(
        instanced(grassCard, grassMaterial(grass.assets, j), points[j]),
      );
    const atlas = await captureSurface(
      renderer,
      source,
      new T.Vector3(0, 0.5, 0),
      3.1,
      1.3,
      128,
      8,
      cache,
      `grass-surface:${identity}:${k}`,
    );
    grass.templates.push(atlas);
    removeLevel(source);
  }
  for (const p of grass.patches) p.release();
  grass.identity = identity;
  onProgress("Relightable grass patches cached", 0.96);
  return [];
}
export function updateLOD(items, camera, force, distances, scene) {
  const counts = [0, 0, 0, 0];
  let candidates=items;
  if(items.grid){
    candidates=new Set(items.active);items.active=new Set();
    const gx=Math.floor((camera.position.x+2000)/24),gz=Math.floor((camera.position.z+2000)/24);
    for(let z=gz-9;z<=gz+9;z++)for(let x=gx-9;x<=gx+9;x++){const p=items.grid.get(`${x}:${z}`);if(p)candidates.add(p);}
    counts[3]=items.length-candidates.size;
  }
  for (const c of candidates) {
    const d = c.center.distanceTo(camera.position);
    c.priority=d;
    if (c.kind === "grass" && d > 190) {
      counts[3]++;
      if (c.current !== 3) {
        c.release?.();
        for (const object of c.levels) if (object) object.visible = false;
      }
      c.current = 3;
      continue;
    }
    items.active?.add(c);
    let level =
      force < 0
        ? d < distances[0]
          ? 0
          : d < distances[1]
            ? 1
            : d < distances[2]
              ? 2
              : 3
        : force;
    if (c.kind === "grass" && d > 175) level = 3;
    if (c.kind === "tree" && d > 650 && force >= 0) level = 3;
    counts[level]++;
    c.current = level;
    const weights = [0, 0, 0, 0];
    weights[level] = 1;
    let outgoing = -1,
      incoming = -1,
      blend = 0;
    if (force < 0) {
      for (let i = 0; i < 3; i++) {
        const width = c.kind === "tree" ? [14, 26, 45][i] : [8, 13, 22][i];
        if (Math.abs(d - distances[i]) < width / 2) {
          outgoing = i;
          incoming = i + 1;
          blend = T.MathUtils.smoothstep(
            d,
            distances[i] - width / 2,
            distances[i] + width / 2,
          );
          weights.fill(0);
          weights[i] = 1 - blend;
          weights[i + 1] = blend;
          break;
        }
      }
    }
    if(c.kind==='grass' && level<3){
      c.ensure?.(2);
      for(let i=0;i<3;i++)if(weights[i]>0)c.ensure?.(i);
      for(let i=0;i<3;i++)if(weights[i]>0 && !c.levels[i]){
        const fallback=[2,1,0].find(j=>c.levels[j]);
        if(fallback!==undefined){weights[fallback]+=weights[i];weights[i]=0;}
      }
    }
    if(items.prepareGroup){
      for(let i=0;i<4;i++)if(weights[i]>0 && c.levels[i] && !c.levels[i].userData.pipelineReady){
        items.prepareGroup(c.levels[i]);
        const fallback=[3,2,1,0].find(j=>c.levels[j]?.userData.pipelineReady);
        if(fallback!==undefined){weights[fallback]+=weights[i];weights[i]=0;}
        else weights[i]=0;
      }
    }
    for (let i = 0; i < 4; i++) {
      if (weights[i] > 0) c.ensure?.(i);
      const object = c.levels[i];
      if (!object) continue;
      object.visible = weights[i] > 0;
      if (object.visible && object.parent !== scene) scene.add(object);
      else if (!object.visible && object.parent) object.removeFromParent();
      if (object.visible)
        object.traverse((o) => {
          const fade = o.material?.userData.fade;
          if (fade)
            fade.value.set(
              i === outgoing ? blend : 0,
              i === incoming ? blend : 1,
            );
        });
    }
    if (c.kind === "grass" && d > 190 && force < 0) c.release?.();
  }
  return counts;
}

export function buildShrubs(world, assets) {
  const prototypes = [];
  for (let k = 0; k < 3; k++) {
    const p = growPlant(552 + k * 83, k, true);
    p.foliage = mergedLeaves(p.leaves);
    prototypes.push(p);
  }
  const groups = [];
  for (const c of world.clusters) {
    const rng = random(c.id + 4100),
      group = new T.Group();
    for (let k = 0; k < 3; k++) {
      const transforms = [];
      for (let i = 0; i < 8; i++) {
        const anchor = c.trees[Math.floor(rng() * c.trees.length)];
        if (!anchor) continue;
        const a = rng() * 6.28,
          r = 4 + rng() * 9,
          x = anchor.x + Math.cos(a) * r,
          z = anchor.z + Math.sin(a) * r,
          s = terrainSample(x, z);
        if (s.traffic > 0.14 || s.slope > 0.5) continue;
        const scale = 0.55 + rng() * 0.75;
        transforms.push({
          p: [x, s.height, z],
          r: [0, rng() * 6.28, 0],
          s: [scale, scale, scale],
        });
      }
      if (transforms.length) {
        const m = plantMaterials(assets, k, true);
        group.add(
          instanced(prototypes[k].high, m[0], transforms),
          instanced(prototypes[k].foliage, m[1], transforms),
        );
      }
    }
    groups.push({ group, center: new T.Vector3(c.x, height(c.x, c.z), c.z) });
  }
  return groups;
}
export function updateShrubs(items, camera, scene) {
  for (const p of items) {
    const d = p.center.distanceTo(camera.position),
      fade = 1 - T.MathUtils.smoothstep(d, 150, 205);
    p.group.visible = fade > 0;
    if (fade > 0 && p.group.parent !== scene) scene.add(p.group);
    else if (fade <= 0 && p.group.parent) p.group.removeFromParent();
    if (fade > 0)
      p.group.traverse((o) => {
        if (o.material?.userData.fade)
          o.material.userData.fade.value.set(0, fade);
      });
  }
}

export async function bakeGrassGround(cache, identity, assets) {
  const n = 512,
    key = "grass-ground:" + identity;
  let record = await cache.get(key);
  if (!record) {
    const data = new Uint8Array(n * n * 4),
      profile = assets.meadow.profile;
  const tint = new T.Color(),materialTints=[new T.Color(0xe0e4b5),new T.Color(0xe0e4b5),new T.Color(0xe3e1cc)];
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const wx = ((x + 0.5) / n) * TERRAIN_SIZE - TERRAIN_SIZE / 2,
          wz = ((z + 0.5) / n) * TERRAIN_SIZE - TERRAIN_SIZE / 2,
          s = terrainSample(wx, wz),
          h = grassHabitat(wx, wz, s);
        const coverage =
          s.riverDistance < 10 || s.slope > 0.62
            ? 0
            : h.density *
              (1 - T.MathUtils.smoothstep(s.traffic, 0.08, 0.37)) *
              (1 - T.MathUtils.smoothstep(s.root, 0.08, 0.65) * 0.98);
        const i = (x + z * n) * 4;
        for (let c = 0; c < 3; c++) {
          // Match the material multiplier and mean instance tint of near cards.
          tint.setHSL(.21,.20,.59+h.tint*.18+.06);
          const component=['r','g','b'][c];
          const meadow=profile.colour[c]*materialTints[0][component];
          const seed=assets.grass.profile.colour[c]*materialTints[1][component];
          const clover=assets.clover.profile.colour[c]*materialTints[2][component];
          const mean=(meadow*(1-h.seedheads)+seed*h.seedheads)*(1-h.clover)+clover*h.clover;
          data[i+c]=Math.round(255*mean*tint[component]);
        }
        data[i + 3] = Math.round(coverage * 255);
      }
    record = { data, n };
    await cache.put(key, record);
  }
  const texture = new T.DataTexture(record.data, n, n, T.RGBAFormat);
  texture.minFilter = T.LinearMipmapLinearFilter;
  texture.magFilter = T.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = T.LinearSRGBColorSpace;
  texture.needsUpdate = true;
  lightUniforms.grassGround.value = texture;
  return { key, resolution: n, blockSize: 24 };
}

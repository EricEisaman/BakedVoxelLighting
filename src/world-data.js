import {
  TERRAIN_SIZE,
  terrainHeight,
  terrainSample,
  terrainSamplingGLSL,
} from "./terrain-field.js";
export const WORLD_VERSION = "woodland-16km-habitats-14";
export function random(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const height = terrainHeight;
export const terrainGLSL = terrainSamplingGLSL;
export function makeWorld() {
  const rng = random(851),
    clusters = [],
    trees = [];
  const occupied = new Map();
  for (let cz = 0; cz < 32; cz++)
    for (let cx = 0; cx < 32; cx++) {
      const x = (cx - 15.5) * (TERRAIN_SIZE / 32),
        z = (cz - 15.5) * (TERRAIN_SIZE / 32),
        items = [];
      for (let j = 0; j < 160; j++) {
        const tx = x + (rng() - 0.5) * (TERRAIN_SIZE / 32 - 4),
          tz = z + (rng() - 0.5) * (TERRAIN_SIZE / 32 - 4),
          s = terrainSample(tx, tz);
        if (s.traffic > 0.13 || s.slope > 0.65 || s.riverDistance < 13)
          continue;
        // Coherent forest cores and edges, with sparse individual trees on open hills.
        const suitability =
          Math.max(s.forest, s.wetness * 0.7) *
          (1 - Math.min(0.65, s.slope)) *
          (1 - Math.max(0, s.upland - 0.57) * 2.5);
        if (rng() > 0.018 + 1.7 * Math.pow(suitability, 1.6) * s.clump)
          continue;
        const gx = Math.floor(tx / 4),
          gz = Math.floor(tz / 4);
        let crowded = false;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++)
            for (const p of occupied.get(`${gx + dx},${gz + dz}`) || [])
              if (Math.hypot(tx - p.x, tz - p.z) < 3.3) crowded = true;
        if (crowded) continue;
        const grove = .5 + .5*Math.sin(tx*.009 + Math.sin(tz*.007)*2.3);
        const t = {
          x: tx,
          z: tz,
          y: s.height,
          scale: 0.65 + rng() * 0.8,
          rotation: rng() * Math.PI * 2,
          variant:
            Math.floor(rng() * 3) * 3 +
            (s.wetness > 0.3
              ? rng() < 0.7
                ? 2
                : 1
              : s.forest > 0.55
                ? rng() < 0.75
                  ? 0
                  : 2
                : (grove > .64 ? 1 : grove < .32 ? 2 : 0)),
          seed: Math.floor(rng() * 1e6),
        };
        const key = `${gx},${gz}`;
        if (!occupied.has(key)) occupied.set(key, []);
        occupied.get(key).push(t);
        trees.push(t);
        items.push(t);
      }
      clusters.push({ id: cz * 32 + cx, x, z, trees: items });
    }
  return { clusters, trees, seed: 851 };
}

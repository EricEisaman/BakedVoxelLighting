import { GRASS_TYPES } from "./plant-catalog.js";
export const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (x, z, seed) => {
  let v = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
};
export function patchNoise(x, z, seed = 19) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    u = smooth(0, 1, x - ix),
    v = smooth(0, 1, z - iz);
  const a = hash(ix, iz, seed),
    b = hash(ix + 1, iz, seed),
    c = hash(ix, iz + 1, seed),
    d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function seededRandom(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function grassHabitat(x, z, land) {
  const broad = patchNoise(x * 0.019, z * 0.019, 73),
    fine = patchNoise(x * 0.083, z * 0.083, 127);
  const moisture = land.moisture ?? 0.5,
    shade = Math.min(0.85, (land.forest ?? 0) * 0.7 + (land.root ?? 0) * 0.25);
  const dry = (1 - moisture) * (0.45 + broad * 0.55);
  const yellow =
    smooth(0.48, 0.78, patchNoise(x * 0.037, z * 0.037, 439)) * (1 - shade);
  const purple =
    smooth(0.51, 0.8, patchNoise(x * 0.029 + 30, z * 0.029, 719)) *
    (0.4 + moisture * 0.6) *
    (1 - shade * 0.7);
  const weights = [
    0.26 + shade * 0.28,
    0.3 + moisture * 0.25,
    0.05 + dry * 0.32,
    0.025 + dry * 0.14,
    0.06 + shade * 0.25 + moisture * 0.08,
    yellow * 0.28,
    purple * 0.23,
  ];
  const total = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) weights[i] /= total;
  return {
    weights,
    density: 0.85 + fine * 0.14,
    height: (0.83 + broad * 0.42) * (1 - shade * 0.2),
    tint: 0.91 + fine * 0.1,
    dry,
    shade,
    flow: patchNoise(x * 0.012, z * 0.012, 89) * Math.PI * 2,
    patch: yellow + purple > 0.35 ? 2 : dry > 0.42 ? 1 : 0,
  };
}
export function chooseGrass(weights, random) {
  let u = random;
  for (let k = 0; k < weights.length; k++) {
    u -= weights[k];
    if (u <= 0) return k;
  }
  return weights.length - 1;
}
export function grassAllowed(land, rng) {
  return (
    land.traffic < 0.1 + rng() * 0.22 &&
    land.slope < 0.64 &&
    (land.riverDistance ?? 100) > 8 &&
    rng() > smooth(0.12, 0.78, land.root ?? 0) * 0.94
  );
}
// One source population drives both geometry LODs; thinning happens after sampling.
export function* grassPopulation(
  x,
  z,
  seed,
  count,
  span,
  sample,
  habitatOverride = null,
) {
  const rng = seededRandom(seed);
  for (let i = 0; i < count; i++) {
    const xx = x + (rng() - 0.5) * span,
      zz = z + (rng() - 0.5) * span,
      land = sample(xx, zz);
    if (!grassAllowed(land, rng)) continue;
    const habitat = habitatOverride || grassHabitat(xx, zz, land);
    if (rng() > habitat.density) continue;
    const type = chooseGrass(habitat.weights, rng()),
      form = GRASS_TYPES[type];
    const sy =
      (form.height[0] + rng() * (form.height[1] - form.height[0])) *
      habitat.height;
    const sx = form.width[0] + rng() * (form.width[1] - form.width[0]);
    const tint = habitat.tint * (0.94 + rng() * 0.12);
    yield {
      index: i,
      x: xx,
      z: zz,
      y: land.height - 0.035,
      type,
      sy,
      sx,
      angle: habitat.flow + (rng() - 0.5) * 2.5,
      colour: [
        tint,
        tint * (1.01 - habitat.dry * 0.025),
        tint * (0.96 - habitat.dry * 0.05),
      ],
    };
  }
}

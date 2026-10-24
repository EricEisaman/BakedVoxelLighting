// Pure landscape functions shared with preparation workers; no world generation.
export const TERRAIN_SIZE = 4000;
function hash(x, z) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
export function noise(x, z) {
  const a = Math.floor(x),
    b = Math.floor(z),
    u = x - a,
    v = z - b,
    s = u * u * (3 - 2 * u),
    t = v * v * (3 - 2 * v);
  return (
    (hash(a, b) * (1 - s) + hash(a + 1, b) * s) * (1 - t) +
    (hash(a, b + 1) * (1 - s) + hash(a + 1, b + 1) * s) * t
  );
}
export function fbm(x, z) {
  let a = 1,
    f = 0,
    sum = 0;
  for (let k = 0; k < 5; k++) {
    f += noise(x, z) * a;
    sum += a;
    a *= 0.48;
    x = x * 2.03 + 17;
    z = z * 2.03 - 13;
  }
  return f / sum;
}
// Connected landscape fields: woodland stands, dry uplands and a descending river corridor.
export function riverCenter(z) {
  return -260 + 115 * Math.sin(z * 0.0019) + 38 * Math.sin(z * 0.0061);
}
export function riverLevel(z) {
  return -3 + (z + TERRAIN_SIZE / 2) * 0.0018;
}
export function landscape(x, z) {
  const riverDistance = Math.abs(x - riverCenter(z));
  const forest = fbm(x * 0.0028 + 140, z * 0.0028 - 70);
  let clump = 0;
  const gx = Math.floor(x / 70),
    gz = Math.floor(z / 70);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = gx + dx,
        cz = gz + dz,
        px = (cx + hash(cx, cz)) * 70,
        pz = (cz + hash(cx + 31, cz - 19)) * 70,
        r = 12 + hash(cx - 21, cz + 70) * 22;
      clump = Math.max(
        clump,
        Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (2 * r * r)),
      );
    }
  const upland = fbm(x * 0.0011 - 30, z * 0.0011 + 60);
  return {
    riverDistance,
    clump,
    forest: Math.max(0, Math.min(1, (forest - 0.39) * 3.8)),
    upland,
    wetness: Math.exp(-riverDistance / 40),
  };
}

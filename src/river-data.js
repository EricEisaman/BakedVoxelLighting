import { riverCenter, riverLevel, TERRAIN_SIZE } from "./terrain-math.js";

// Static, metre-scaled channel coordinates. Shared boundary rows have identical
// attributes, so flow, depth and normals stay continuous across culled chunks.
export function buildRiverData(
  heightAt,
  {
    start = TERRAIN_SIZE / 2,
    end = -TERRAIN_SIZE / 2,
    step = 2,
    chunkLength = 64,
  } = {},
) {
  const rows = Math.ceil((start - end) / step);
  const dz = (start - end) / rows;
  const across = 18,
    stride = across + 1;
  const stations = [];
  let distance = 0,
    previous = null;
  for (let i = 0; i <= rows; i++) {
    const z = start - i * dz,
      x = riverCenter(z),
      y = riverLevel(z);
    if (previous) distance += Math.hypot(x - previous.x, z - previous.z);
    const dx = riverCenter(z - 1) - riverCenter(z + 1);
    const length = Math.hypot(dx, 2);
    stations.push({ x, y, z, distance, fx: dx / length, fz: -2 / length });
    previous = { x, z };
  }
  const chunks = [],
    chunkRows = Math.max(1, Math.round(chunkLength / dz));
  for (let first = 0; first < rows; first += chunkRows) {
    const last = Math.min(rows, first + chunkRows),
      count = (last - first + 1) * stride;
    const position = new Float32Array(count * 3),
      normal = new Float32Array(count * 3);
    const coord = new Float32Array(count * 2),
      flow = new Float32Array(count * 4);
    const index = new Uint16Array((last - first) * across * 6);
    for (let row = first; row <= last; row++) {
      const s = stations[row];
      for (let j = 0; j <= across; j++) {
        const lateral = j - across / 2,
          x = s.x + lateral;
        const i = (row - first) * stride + j;
        const depth = s.y - heightAt(x, s.z);
        // Bank friction slows shallow water; the deeper thread carries the flow.
        const speed =
          0.18 + 0.78 * Math.sqrt(Math.max(0, Math.min(1, depth / 1.6)));
        position.set([x, s.y, s.z], i * 3);
        normal.set([0, 0.9999984, -0.0018], i * 3);
        coord.set([lateral, s.distance], i * 2);
        flow.set([s.fx, s.fz, speed, depth], i * 4);
        if (row < last && j < across) {
          const k = ((row - first) * across + j) * 6;
          index.set(
            [i, i + 1, i + stride, i + 1, i + stride + 1, i + stride],
            k,
          );
        }
      }
    }
    chunks.push({ position, normal, coord, flow, index });
  }
  return { chunks, length: distance, downhill: [start, end] };
}

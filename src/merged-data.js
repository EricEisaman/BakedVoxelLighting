export function bakeMergedCluster(trees, prototypes) {
  const count = trees.length;
  const record = {
    position: new Float32Array(count * 12),
    plantCenter: new Float32Array(count * 12),
    plantInfo: new Float32Array(count * 8),
    uv: new Float32Array(count * 8),
    normal: new Float32Array(count * 12),
    indices: new Uint32Array(count * 6),
  };
  trees.forEach((t, i) => {
    const p = prototypes[t.variant],
      c = Math.cos(t.rotation),
      s = Math.sin(t.rotation);
    const [px, py, pz] = p.center;
    const center = [
      t.x + (px * c + pz * s) * t.scale,
      t.y + py * t.scale,
      t.z + (-px * s + pz * c) * t.scale,
    ];
    for (const [j, x, y, u, v] of [
      [0, -0.5, -0.5, 0, 0],
      [1, 0.5, -0.5, 1, 0],
      [2, 0.5, 0.5, 1, 1],
      [3, -0.5, 0.5, 0, 1],
    ]) {
      const vertex = i * 4 + j;
      record.position.set(
        [x * p.width * t.scale, y * p.height * t.scale, 0],
        vertex * 3,
      );
      record.plantCenter.set(center, vertex * 3);
      record.plantInfo.set([t.rotation, t.variant], vertex * 2);
      record.uv.set([u, v], vertex * 2);
      record.normal.set([0, 0, 1], vertex * 3);
    }
    const k = i * 4;
    record.indices.set([k, k + 1, k + 2, k, k + 2, k + 3], i * 6);
  });
  return record;
}

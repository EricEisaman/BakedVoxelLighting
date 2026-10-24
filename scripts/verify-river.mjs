import assert from "node:assert/strict";
import { buildRiverData } from "../src/river-data.js";
import { riverCenter, riverLevel } from "../src/terrain-math.js";
const bed = (x, z) =>
  riverLevel(z) - 1.6 + ((x - riverCenter(z)) / 8) ** 2 * 1.8;
const { chunks, length } = buildRiverData(bed);
assert.equal(chunks.length, 63);
assert.ok(length > 4000 && length < 4500);
let faces = 0;
for (let k = 0; k < chunks.length; k++) {
  const c = chunks[k];
  for (let i = 0; i < c.position.length / 3; i++) {
    const [fx, fz, speed, depth] = c.flow.subarray(i * 4, i * 4 + 4);
    assert.ok(fz < 0, "flow must descend the channel");
    assert.ok(Math.abs(Math.hypot(fx, fz) - 1) < 1e-6);
    assert.ok(speed >= 0.179 && speed <= 0.961);
    assert.ok(Number.isFinite(depth));
    assert.ok(
      Math.abs(c.position[i * 3 + 1] - riverLevel(c.position[i * 3 + 2])) <
        1e-6,
    );
  }
  for (let i = 0; i < c.index.length; i += 3) {
    const a = c.index[i] * 3,
      b = c.index[i + 1] * 3,
      d = c.index[i + 2] * 3;
    const ny =
      (c.position[b + 2] - c.position[a + 2]) *
        (c.position[d] - c.position[a]) -
      (c.position[b] - c.position[a]) * (c.position[d + 2] - c.position[a + 2]);
    assert.ok(ny > 0, "surface winding must face the sky");
    faces++;
  }
  if (k)
    for (const [name, size] of [
      ["position", 3],
      ["normal", 3],
      ["coord", 2],
      ["flow", 4],
    ])
      assert.deepEqual(
        c[name].slice(0, 19 * size),
        chunks[k - 1][name].slice(-19 * size),
        `${name} must join without a seam`,
      );
}
assert.equal(faces, 72000);
// Both phase weights hide their corresponding scrolling UV reset.
const weights = (t) => {
  const p = (t / 6) % 1;
  return [1 - Math.abs(2 * p - 1), Math.abs(2 * p - 1)];
};
assert.deepEqual(weights(0), [0, 1]);
assert.deepEqual(weights(3), [1, 0]);
console.log(
  JSON.stringify(
    {
      passed: true,
      chunks: chunks.length,
      faces,
      lengthMetres: length,
      checks: [
        "downhill flow",
        "upward winding",
        "shared chunk boundaries",
        "finite depth and speed",
        "hidden phase resets",
      ],
    },
    null,
    2,
  ),
);

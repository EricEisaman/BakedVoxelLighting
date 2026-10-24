import assert from "node:assert/strict";
import { growPlant } from "../src/growth.js";
import { GRASS_TYPES, GRASS_COUNT, TREE_TYPES } from "../src/plant-catalog.js";
import { grassPopulation } from "../src/habitat.js";
const forms = [];
for (const shrub of [false, true])
  for (let species = 0; species < (shrub ? 3 : 4); species++) {
    const plant = growPlant(552 + species * 83, species, shrub);
    assert.ok(plant.low.index.count < plant.high.index.count);
    assert.ok(plant.leaves.length > 200);
    for (let k = 0; k < plant.paths.length; k++) {
      const path = plant.paths[k];
      for (let i = 1; i < path.radii.length; i++)
        assert.ok(path.radii[i] <= path.radii[i - 1]);
      for (const p of path.points)
        assert.ok(p.toArray().every(Number.isFinite));
      if (!k || path.points[0].y < 0.1) continue;
      const root = path.points[0];
      let clearance = Infinity;
      for (let j = 0; j < k; j++) {
        const parent = plant.paths[j];
        for (let i = 1; i < parent.points.length; i++) {
          const a = parent.points[i - 1],
            v = parent.points[i].clone().sub(a);
          const t = Math.max(
            0,
            Math.min(1, root.clone().sub(a).dot(v) / v.lengthSq()),
          );
          const radius = parent.radii[i - 1] * (1 - t) + parent.radii[i] * t;
          clearance = Math.min(
            clearance,
            root.distanceTo(a.clone().addScaledVector(v, t)) - radius,
          );
        }
      }
      assert.ok(
        clearance <= path.radii[0] * 0.65 + 0.002,
        `${plant.speciesName} disconnected branch ${k}: ${clearance}`,
      );
    }
    plant.high.computeBoundingBox();
    const box = plant.high.boundingBox;
    forms.push({
      name: plant.speciesName,
      height: box.max.y - box.min.y,
      width: box.max.x - box.min.x,
      leaves: plant.leaves.length,
    });
    for (const g of [plant.high, plant.low, plant.farWood]) g.dispose();
  }
assert.ok(
  forms.find((p) => p.name === "birch").height >
    forms.find((p) => p.name === "oak").height,
);
assert.ok(
  forms.find((p) => p.name === "bramble").height <
    forms.find((p) => p.name === "hazel").height,
);
const sample = () => ({
  height: 0,
  traffic: 0,
  moisture: 0.55,
  slope: 0.1,
  root: 0,
  forest: 0,
  riverDistance: 100,
});
const counts = GRASS_TYPES.map(() => 0),
  heights = [];
for (let k = 0; k < 10; k++)
  for (const p of grassPopulation(
    k * 36,
    k * 18,
    850 + k,
    GRASS_COUNT,
    24,
    sample,
  )) {
    counts[p.type]++;
    heights.push(p.sy);
    assert.ok(p.sx > 0.5);
  }
assert.ok(
  counts.every((n) => n > 100),
  "each plant type must occur in natural patches",
);
assert.ok(Math.max(...heights) > 1.5);
assert.ok(Math.min(...heights) < 0.3);
assert.deepEqual(
  [...grassPopulation(0, 0, 851, 80, 24, sample)],
  [...grassPopulation(0, 0, 851, 80, 24, sample)],
);
assert.equal(TREE_TYPES.length, 4);
console.log(
  JSON.stringify(
    {
      forms,
      grass: counts,
      minHeight: Math.min(...heights),
      maxHeight: Math.max(...heights),
    },
    null,
    2,
  ),
);

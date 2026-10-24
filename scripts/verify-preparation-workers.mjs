import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile, readdir } from "node:fs/promises";

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
try {
  await page.goto("http://127.0.0.1:5173/scripts/worker-fixture.html");
  const report = await page.evaluate(async () => {
    const { WorkerClient } = await import("/src/worker-client.js");
    const { copyTerrainRegion, sampleTerrainRegion } =
      await import("/src/terrain-snapshot.js");
    const { grassLand, generateGrassBatches } =
      await import("/src/grass-data.js");
    const { buildVoxelDetails } = await import("/src/voxel-core.js");
    const { Vector3 } = await import("/node_modules/three/src/math/Vector3.js");
    const { GRASS_TYPES } = await import("/src/plant-catalog.js");
    const voxel = new WorkerClient(
      new Worker("/src/voxel-worker.js", { type: "module" }),
      "fixture voxel",
    );
    const merged = new WorkerClient(
      new Worker("/src/merged-worker.js", { type: "module" }),
      "fixture merge",
    );
    const check = (condition, message) => {
      if (!condition) throw Error(message);
    };
    const same = (a, b) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    try {
      const grid = 257,
        extent = 512,
        pixels = new Float32Array(grid * grid * 4),
        roots = new Float32Array(grid * grid);
      for (let z = 0; z < grid; z++)
        for (let x = 0; x < grid; x++) {
          pixels.set(
            [Math.sin(x * 0.07) + Math.cos(z * 0.09), 0, 0.4, 0.05],
            (z * grid + x) * 4,
          );
          roots[z * grid + x] = (x % 17) / 400;
        }
      const patches = [];
      for (let z = -24; z <= 24; z += 24)
        for (let x = -120; x <= -72; x += 24)
          patches.push({ x, z, seed: x * 100 + z + 8351 });
      const snapshot = copyTerrainRegion(
        pixels,
        roots,
        grid,
        extent,
        -152,
        -56,
        -40,
        56,
      );
      const records = new Map(
        patches.map((p) => [
          p,
          generateGrassBatches({
            ...p,
            level: 0,
            land: grassLand(p.x, p.z, (x, z) =>
              sampleTerrainRegion(snapshot, x, z),
            ),
          }),
        ]),
      );
      const prototypes = [
        {
          species: 0,
          leaves: Array.from({ length: 240 }, (_, i) => ({
            p: [Math.sin(i) * 3, 3 + i * 0.02, Math.cos(i) * 3],
            s: [0.8, 1, 1],
          })),
          paths: [
            {
              points: [
                [0, 0, 0],
                [0, 4, 0],
                [2, 6, 1],
              ],
              radii: [0.3, 0.2, 0.05],
            },
          ],
        },
      ];
      const profiles = Object.fromEntries(
        [...GRASS_TYPES.map((t) => t.name), "oak"].map((name) => [
          name,
          { colour: [0.22, 0.38, 0.1], coverage: 0.63 },
        ]),
      );
      await voxel.run("init", { prototypes, profiles });
      const trees = Array.from({ length: 2500 }, (_, i) => ({
        variant: 0,
        x: -112 + (i % 20) * 2,
        z: -20 + Math.floor(i / 20) * 1.5,
        y: 0,
        scale: 0.8 + (i % 3) * 0.1,
        rotation: i * 0.27,
      }));
      const objects = [
        { p: [-102, 1, 4], r: 2, rock: true },
        { p: [-90, 1, -4], r: 2.2, rock: false },
      ];
      const min = { x: -128, y: -4, z: -32 },
        size = { x: 64, y: 24, z: 64 },
        n = 64;
      const world = {
        treePrototypes: prototypes.map((p) => ({
          ...p,
          paths: p.paths.map((path) => ({
            ...path,
            points: path.points.map((v) => new Vector3(...v)),
          })),
        })),
        materialProfiles: profiles,
        areaIndexes: {
          trees: { query: () => trees },
          objects: { query: () => objects },
          grass: { query: () => patches },
        },
      };
      const expected = buildVoxelDetails(world, n, min, size, records);
      let frames = 0,
        running = true;
      const frame = () => {
        if (running) {
          frames++;
          requestAnimationFrame(frame);
        }
      };
      requestAnimationFrame(frame);
      const started = performance.now();
      const promise = voxel.run(
        "details",
        {
          n,
          min,
          size,
          trees,
          grass: patches,
          objects,
          terrain: snapshot,
          identity: "worker-regression",
        },
        [snapshot.pixels.buffer, snapshot.roots.buffer],
      );
      check(
        snapshot.pixels.byteLength === 0 && snapshot.roots.byteLength === 0,
        "terrain should transfer ownership, not clone",
      );
      const actual = await promise;
      running = false;
      check(
        same(actual.data, expected.data),
        "worker voxel colours/opacity must match reference bytes",
      );
      check(
        same(actual.kinds, expected.kinds),
        "worker material classifications must match reference bytes",
      );
      check(
        JSON.stringify(actual.counts) === JSON.stringify(expected.counts),
        "worker contributor counts changed",
      );
      check(
        frames > 1,
        "main thread must keep presenting while voxel worker runs",
      );
      const durationMs = performance.now() - started;
      const packed = Uint8Array.from({ length: 128 }, (_, i) => i),
        original = packed.slice();
      const reorder = voxel.run("reorder", { packed, n: 4 }, [packed.buffer]);
      check(packed.byteLength === 0, "readback should be transferred");
      const reordered = await reorder;
      for (let y = 0; y < 2; y++)
        for (let z = 0; z < 4; z++)
          for (let x = 0; x < 4; x++)
            for (let c = 0; c < 4; c++)
              check(
                reordered[(x + 4 * (y + 2 * z)) * 4 + c] ===
                  original[(x + 4 * (z + 4 * y)) * 4 + c],
                "voxel layout changed",
              );
      const models = [{ center: [1, 4, -2], width: 8, height: 10 }];
      const cold = await merged.run("merge", {
        key: "worker-merged-regression",
        trees: trees.slice(0, 3),
        prototypes: models,
      });
      const warm = await merged.run("merge", {
        key: "worker-merged-regression",
        trees: trees.slice(0, 3),
        prototypes: models,
      });
      check(
        !cold.hit && warm.hit,
        "merged worker must read and write its cache",
      );
      check(
        same(cold.record.position, warm.record.position),
        "cached merged geometry changed",
      );
      for (let i = 0; i < 3; i++) {
        const t = trees[i],
          p = new Vector3(...models[0].center)
            .multiplyScalar(t.scale)
            .applyAxisAngle(new Vector3(0, 1, 0), t.rotation)
            .add(new Vector3(t.x, t.y, t.z));
        for (let j = 0; j < 4; j++)
          for (let k = 0; k < 3; k++)
            check(
              Math.abs(
                cold.record.plantCenter[(i * 4 + j) * 3 + k] - p.toArray()[k],
              ) < 0.00002,
              "merged tree pivot changed",
            );
      }
      let rejected = false;
      try {
        await voxel.run("invalid", {});
      } catch {
        rejected = true;
      }
      check(
        rejected && voxel.stats.pending === 0,
        "worker error must reject without a stuck request",
      );
      return {
        exactVoxelBytes: true,
        exactKinds: true,
        counts: actual.counts,
        transferred: true,
        frames,
        durationMs,
        worker: voxel.stats,
        merged: merged.stats,
      };
    } finally {
      voxel.worker.terminate();
      merged.worker.terminate();
    }
  });
  const built = await readdir("dist/assets");
  for (const name of ["voxel-worker-", "merged-worker-", "grass-worker-"])
    assert.ok(
      built.some((f) => f.startsWith(name)),
      `production worker bundle missing: ${name}`,
    );
  assert.deepEqual(errors, []);
  await writeFile(
    "evidence/preparation-workers.json",
    JSON.stringify({ report, errors }, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}

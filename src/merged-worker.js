import { BakeCache } from "./cache.js";
import { bakeMergedCluster } from "./merged-data.js";
const cache = new BakeCache("BakedVoxelLightingMerged"),
  ready = cache.open();
self.onmessage = async ({ data: { id, type, key, trees, prototypes } }) => {
  const started = performance.now();
  try {
    await ready;
    let record = await cache.get(key),
      hit = !!record;
    if (!record) {
      record = bakeMergedCluster(trees, prototypes);
      await cache.put(key, record);
    }
    self.postMessage(
      { id, result: { record, hit }, workerMs: performance.now() - started },
      Object.values(record).map((v) => v.buffer),
    );
  } catch (error) {
    self.postMessage({ id, error: error.stack || error.message });
  }
};

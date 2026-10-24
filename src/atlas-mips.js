const worker = new Worker(new URL("./atlas-worker.js", import.meta.url), {
  type: "module",
});
let serial = 0;
const pending = new Map();
worker.onmessage = ({ data }) => {
  pending.get(data.id)?.resolve(data.levels);
  pending.delete(data.id);
};
worker.onerror = (e) => {
  for (const p of pending.values()) p.reject(new Error(e.message));
  pending.clear();
};
export function prepareAtlasMips(record) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, record });
  });
}
export function packPlantAtlas(sources, tileSize = 1024) {
  return new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, sources, tileSize });
  });
}

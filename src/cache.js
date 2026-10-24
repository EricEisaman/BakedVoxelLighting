export class BakeCache {
  constructor(name = "BakedVoxelLighting") {
    this.name = name;
    this.db = null;
    this.hits = 0;
    this.misses = 0;
    this.bytes = 0;
    this.available = true;
    this.warning = "";
  }
  async open() {
    try {
      this.db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(this.name, 1);
        r.onupgradeneeded = () => r.result.createObjectStore("bakes");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } catch (e) {
      this.available = false;
      this.warning = e.message;
    }
  }
  async get(key) {
    if (!this.db) {
      this.misses++;
      return null;
    }
    try {
      const value = await new Promise((resolve, reject) => {
        const r = this.db.transaction("bakes").objectStore("bakes").get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      if (value) {
        this.hits++;
        return value;
      }
      this.misses++;
      return null;
    } catch (e) {
      this.warning = e.message;
      this.misses++;
      return null;
    }
  }
  async put(key, value) {
    if (!this.db) return false;
    try {
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction("bakes", "readwrite");
        tx.objectStore("bakes").put(value, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return true;
    } catch (e) {
      this.warning = e.message;
      return false;
    }
  }
  async clear() {
    if (!this.db) return;
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction("bakes", "readwrite");
      tx.objectStore("bakes").clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    this.hits = 0;
    this.misses = 0;
  }
}
export async function digest(value) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

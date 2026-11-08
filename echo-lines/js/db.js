// IndexedDB storage: everything stays on this device.
const DB_NAME = 'echo-lines';
const DB_VERSION = 1;
export const STORES = ['lessons', 'blobs', 'recordings', 'reviews', 'progress', 'kv'];
const KEYS = { lessons: 'id', blobs: 'id', recordings: 'id', reviews: 'id', progress: 'lessonId', kv: 'k' };

let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          const os = db.createObjectStore(s, { keyPath: KEYS[s] });
          if (s === 'recordings' || s === 'reviews') os.createIndex('lessonId', 'lessonId');
        }
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let out;
    const r = fn(os);
    if (r && 'onsuccess' in r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  }));
}

export const db = {
  get: (store, key) => tx(store, 'readonly', os => os.get(key)),
  all: (store) => tx(store, 'readonly', os => os.getAll()),
  put: (store, value) => tx(store, 'readwrite', os => os.put(value)),
  del: (store, key) => tx(store, 'readwrite', os => os.delete(key)),
  clear: (store) => tx(store, 'readwrite', os => os.clear()),
  byLesson: (store, lessonId) => tx(store, 'readonly', os => os.index('lessonId').getAll(lessonId)),
  async kvGet(k, dflt = null) { const r = await db.get('kv', k); return r ? r.v : dflt; },
  kvSet: (k, v) => db.put('kv', { k, v }),
};

export async function requestPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (_) { /* ignore */ }
  return false;
}
export async function storageEstimate() {
  try { return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null; }
  catch (_) { return null; }
}

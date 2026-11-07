// Small per-device UI preferences (localStorage). Study data lives in IndexedDB.
const KEY = 'shadowing-studio:settings';
const defaults = { showEn: true, showJa: true, showNote: true, rate: 1, repeatGap: 1.5, repeatCount: 1, learnerName: '', reviewerName: '' };
let cache;
export function settings() {
  if (!cache) {
    try { cache = { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch (_) { cache = { ...defaults }; }
  }
  return cache;
}
export function setSetting(k, v) {
  settings()[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (_) { /* private mode */ }
}
export function replaceSettings(obj) {
  cache = { ...defaults, ...(obj || {}) };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (_) { /* */ }
}

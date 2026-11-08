// Offline cache for Echo Lines (network-first, falls back to cache).
const VERSION = 'el-v1';
const PRECACHE = [
 "./",
 "index.html",
 "css/style.css",
 "manifest.webmanifest",
 "icon.svg",
 "icon-180.png",
 "icon-512.png",
 "js/analyze.js",
 "js/app.js",
 "js/clip.js",
 "js/db.js",
 "js/recorder.js",
 "js/speaker.js",
 "js/store.js",
 "js/tts.js",
 "js/util.js",
 "js/views/compare.js",
 "js/views/lesson.js",
 "js/views/pages.js"
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./'))));
});

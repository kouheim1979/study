// Offline cache: app shell + bundled samples. Network-first for code, cache-first for audio.
const VERSION = 'ss-v1';
const PRECACHE = [
 "./",
 "index.html",
 "css/app.css",
 "manifest.webmanifest",
 "icon.svg",
 "icon-180.png","icon-512.png",
 "js/app.js",
 "js/util.js",
 "js/db.js",
 "js/lessons.js",
 "js/progress.js",
 "js/player.js",
 "js/recorder.js",
 "js/recordings.js",
 "js/compare.js",
 "js/settings.js",
 "js/views/lesson.js",
 "js/views/library.js",
 "js/views/editor.js",
 "js/views/recview.js",
 "js/views/review.js",
 "js/views/history.js",
 "samples/index.json",
 "samples/s01-morning-routine.json",
 "samples/audio/s01-morning-routine.mp3",
 "samples/audio/s01-morning-routine-words.mp3",
 "samples/s02-kyoto-weekend.json",
 "samples/audio/s02-kyoto-weekend.mp3",
 "samples/audio/s02-kyoto-weekend-words.mp3",
 "samples/s03-working-from-home.json",
 "samples/audio/s03-working-from-home.mp3",
 "samples/audio/s03-working-from-home-words.mp3",
 "samples/s04-daily-walk.json",
 "samples/audio/s04-daily-walk.mp3",
 "samples/audio/s04-daily-walk-words.mp3"
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (req.headers.has('range')) return; // let the browser stream media ranges itself
  const isAudio = /\.(mp3|m4a)$/.test(url.pathname);
  if (isAudio) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./'))));
});

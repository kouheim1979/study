// Offline cache: app shell + bundled samples. Network-first for code, cache-first for audio.
const VERSION = 'ss-v9-native-repeat-clauses';
const PRECACHE = [
 "./",
 "index.html",
 "css/app.css?v=repeat-clauses-v1",
 "manifest.webmanifest",
 "icon.svg",
 "icon-180.png","icon-512.png",
 "js/app.js?v=repeat-clauses-v1",
 "js/util.js",
 "js/db.js",
 "js/lessons.js",
 "js/progress.js",
 "js/player.js",
 "js/recorder.js",
 "js/recordings.js",
 "js/compare.js",
 "js/settings.js",
 "js/views/lesson.js?v=repeat-clauses-v1",
 "js/repeat-units.mjs?v=repeat-clauses-v1",
 "samples/audio/s01-morning-routine-repeat.mp3?v=repeat-clauses-v1",
 "samples/audio/s02-kyoto-weekend-repeat.mp3?v=repeat-clauses-v1",
 "samples/audio/s03-working-from-home-repeat.mp3?v=repeat-clauses-v1",
 "samples/audio/s04-daily-walk-repeat.mp3?v=repeat-clauses-v1",
 "js/views/library.js",
 "js/views/editor.js",
 "js/views/recview.js",
 "js/views/review.js",
 "js/views/history.js",
 "samples/index.json",
 "samples/s01-morning-routine.json",
 "samples/audio/s01-morning-routine.mp3?v=kokoro-native-v3",
 "samples/audio/s01-morning-routine-words.mp3?v=kokoro-native-v3",
 "samples/s02-kyoto-weekend.json",
 "samples/audio/s02-kyoto-weekend.mp3?v=kokoro-native-v3",
 "samples/audio/s02-kyoto-weekend-words.mp3?v=kokoro-native-v3",
 "samples/s03-working-from-home.json",
 "samples/audio/s03-working-from-home.mp3?v=kokoro-native-v3",
 "samples/audio/s03-working-from-home-words.mp3?v=kokoro-native-v3",
 "samples/s04-daily-walk.json",
 "samples/audio/s04-daily-walk.mp3?v=kokoro-native-v3",
 "samples/audio/s04-daily-walk-words.mp3?v=kokoro-native-v3",
 "samples/audio/s01-morning-routine_01.mp3",
 "samples/audio/s01-morning-routine_02.mp3",
 "samples/audio/s01-morning-routine_03.mp3",
 "samples/audio/s01-morning-routine_04.mp3",
 "samples/audio/s01-morning-routine_05.mp3",
 "samples/audio/s01-morning-routine_w_check.mp3",
 "samples/audio/s01-morning-routine_w_glass.mp3",
 "samples/audio/s01-morning-routine_w_leave.mp3",
 "samples/audio/s01-morning-routine_w_quarter.mp3",
 "samples/audio/s01-morning-routine_w_routine.mp3",
 "samples/audio/s01-morning-routine_w_toast.mp3",
 "samples/audio/s02-kyoto-weekend_01.mp3",
 "samples/audio/s02-kyoto-weekend_02.mp3",
 "samples/audio/s02-kyoto-weekend_03.mp3",
 "samples/audio/s02-kyoto-weekend_04.mp3",
 "samples/audio/s02-kyoto-weekend_05.mp3",
 "samples/audio/s02-kyoto-weekend_06.mp3",
 "samples/audio/s02-kyoto-weekend_w_arrive.mp3",
 "samples/audio/s02-kyoto-weekend_w_autumn.mp3",
 "samples/audio/s02-kyoto-weekend_w_crowded.mp3",
 "samples/audio/s02-kyoto-weekend_w_fresh.mp3",
 "samples/audio/s02-kyoto-weekend_w_quiet.mp3",
 "samples/audio/s02-kyoto-weekend_w_temple.mp3",
 "samples/audio/s02-kyoto-weekend_w_weekend.mp3",
 "samples/audio/s03-working-from-home_01.mp3",
 "samples/audio/s03-working-from-home_02.mp3",
 "samples/audio/s03-working-from-home_03.mp3",
 "samples/audio/s03-working-from-home_04.mp3",
 "samples/audio/s03-working-from-home_05.mp3",
 "samples/audio/s03-working-from-home_06.mp3",
 "samples/audio/s03-working-from-home_w_comfortable.mp3",
 "samples/audio/s03-working-from-home_w_commute.mp3",
 "samples/audio/s03-working-from-home_w_focus.mp3",
 "samples/audio/s03-working-from-home_w_important.mp3",
 "samples/audio/s03-working-from-home_w_lonely.mp3",
 "samples/audio/s03-working-from-home_w_noise.mp3",
 "samples/audio/s03-working-from-home_w_productive.mp3",
 "samples/audio/s04-daily-walk_01.mp3",
 "samples/audio/s04-daily-walk_02.mp3",
 "samples/audio/s04-daily-walk_03.mp3",
 "samples/audio/s04-daily-walk_04.mp3",
 "samples/audio/s04-daily-walk_05.mp3",
 "samples/audio/s04-daily-walk_06.mp3",
 "samples/audio/s04-daily-walk_w_boring.mp3",
 "samples/audio/s04-daily-walk_w_doctor.mp3",
 "samples/audio/s04-daily-walk_w_especially.mp3",
 "samples/audio/s04-daily-walk_w_listen.mp3",
 "samples/audio/s04-daily-walk_w_mind.mp3",
 "samples/audio/s04-daily-walk_w_minute.mp3",
 "samples/audio/s04-daily-walk_w_tired.mp3"
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

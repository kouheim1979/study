// App shell: hash router and view lifecycle.
import { h, $, $$, toast } from './util.js';
import { Recorder } from './recorder.js';
import { getLesson } from './lessons.js';
import { requestPersist } from './db.js';
import { LessonView } from './views/lesson.js?v=repeat-glow-v2';
import { libraryView } from './views/library.js';
import { mineView, newLessonView, editLessonView, destroyEditor } from './views/editor.js';
import { recordingsView, recordingDetailView, destroyRecView } from './views/recview.js';
import { reviewHomeView, reviewSessionView, destroyReview } from './views/review.js';
import { historyView, settingsView } from './views/history.js';

const root = $('#view');
const app = {
  recorder: new Recorder(),
  lessonView: null,
  leaveGuard: null,
  navigate(hash) { if (location.hash === hash) route(); else location.hash = hash; },
  setLeaveGuard(fn) { this.leaveGuard = fn; },
};
window.__app = app; // for debugging / automated tests

function parse() {
  const raw = location.hash.replace(/^#\/?/, '') || 'library';
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { parts, query };
}

let lastHash = location.hash;
let routing = Promise.resolve();
function route() { routing = routing.then(doRoute).catch(err => { console.error(err); showError(err); }); return routing; }

async function doRoute() {
  const { parts, query } = parse();
  const [name, id, sub] = parts;
  const tab = { library: 'library', lesson: 'library', mine: 'library', edit: 'library', recordings: 'recordings', rec: 'recordings', review: 'review', history: 'history', settings: 'settings' }[name] || 'library';
  $$('.tabbar a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));

  // same lesson, different step: keep the player alive
  if (name === 'lesson' && app.lessonView && app.lessonView.lesson.id === id) {
    await app.lessonView.showStep(+sub || 1, query);
    return;
  }
  teardown();
  document.body.dataset.view = name;
  root.replaceChildren(h('p.loading', '読み込み中…'));
  switch (name) {
    case 'lesson': {
      const lesson = await getLesson(id);
      if (!lesson) { root.replaceChildren(h('div.page', h('p', '教材が見つかりません。'), h('a.btn', { href: '#/library' }, '教材一覧へ'))); return; }
      const v = app.lessonView = new LessonView(lesson, app);
      const holder = h('div.lesson-root');
      root.replaceChildren(holder);
      await v.mount(holder);
      await v.showStep(+sub || 1, query);
      return;
    }
    case 'mine': return mineView(root, app);
    case 'edit': return id === 'new' ? newLessonView(root, app) : editLessonView(root, id, query, app);
    case 'recordings': return recordingsView(root, app);
    case 'rec': return recordingDetailView(root, id, app);
    case 'review': return id ? reviewSessionView(root, id, app) : reviewHomeView(root, app);
    case 'history': return historyView(root, app);
    case 'settings': return settingsView(root, app);
    default: return libraryView(root, app);
  }
}

function teardown() {
  if (app.lessonView) { app.lessonView.destroy(); app.lessonView = null; }
  destroyEditor();
  destroyRecView();
  destroyReview();
  app.leaveGuard = null;
}

function showError(err) {
  root.replaceChildren(h('div.page',
    h('h1', 'エラーが発生しました'),
    h('p', String(err && err.message || err)),
    h('a.btn', { href: '#/library' }, '教材一覧へ戻る')));
}

window.addEventListener('hashchange', () => {
  if (app.leaveGuard) {
    const msg = app.leaveGuard();
    if (msg && !confirm(msg)) { history.replaceState(null, '', lastHash); return; }
  }
  lastHash = location.hash;
  route();
});
window.addEventListener('pagehide', () => { if (app.lessonView) { app.lessonView.saveResume(); app.lessonView.flush(); } });
window.addEventListener('beforeunload', e => {
  if (app.leaveGuard && app.leaveGuard()) { e.preventDefault(); e.returnValue = ''; }
});

route();
requestPersist();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
if (!window.indexedDB) toast('このブラウザでは端末内保存が使えません（プライベートブラウズを解除してください）', 6000);

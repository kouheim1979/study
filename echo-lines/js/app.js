// Echo Lines — router and view lifecycle.
import { h, $, $$ } from './util.js';
import * as tts from './tts.js';
import { requestPersist } from './db.js';
import { getLesson, settings } from './store.js';
import { LessonView } from './views/lesson.js';
import { homeView, newView, editView, recListView, recView, destroyRec, logView, settingsView } from './views/pages.js';

const root = $('#view');
const app = {
  lesson: null,
  go(hash) { if (location.hash === hash) route(); else location.hash = hash; },
};
window.__echo = app; // used by automated tests
tts.setPreferredVoice(settings().voiceURI);

let chain = Promise.resolve();
const route = () => (chain = chain.then(run).catch(e => { console.error(e); root.replaceChildren(h('div.page', h('h1', 'エラー'), h('p', String(e.message || e)), h('a.btn', { href: '#/' }, '一覧へ'))); }));

async function run() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const [name = '', id, sub] = path.split('/').map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(qs));
  const tab = { '': 'home', lesson: 'home', new: 'new', edit: 'home', rec: 'rec', log: 'log', settings: 'settings' }[name] || 'home';
  $$('.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.tab === tab ? 'page' : 'false'));
  if (name === 'lesson' && app.lesson && app.lesson.L.id === id) { await app.lesson.showStep(+sub || 1, q); return; }
  if (app.lesson) { app.lesson.destroy(); app.lesson = null; }
  destroyRec();
  document.body.dataset.view = name || 'home';
  switch (name) {
    case 'lesson': {
      const L = await getLesson(id);
      if (!L) { root.replaceChildren(h('div.page', h('p', 'テキストが見つかりません。'), h('a.btn', { href: '#/' }, '一覧へ'))); return; }
      const holder = h('div.lesson-root');
      root.replaceChildren(holder);
      app.lesson = new LessonView(L, app);
      await app.lesson.mount(holder);
      await app.lesson.showStep(+sub || 1, q);
      return;
    }
    case 'new': return newView(root, app);
    case 'edit': return editView(root, id, app);
    case 'rec': return id ? recView(root, id, app) : recListView(root, app);
    case 'log': return logView(root, app);
    case 'settings': return settingsView(root, app);
    default: return homeView(root, app);
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('pagehide', () => { if (app.lesson) { app.lesson.saveResume(); app.lesson.flush(); } });
route();
requestPersist();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

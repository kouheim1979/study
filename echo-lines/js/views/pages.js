// Home, create-from-text, edit, recordings, study log, settings.
import { h, $$, fmtTime, fmtDate, fmtDuration, todayKey, toast, saveFile, pickFile, confirmDialog, extForMime, safeName } from '../util.js';
import { buildLesson, soundNotes, weakForms } from '../analyze.js';
import * as tts from '../tts.js';
import { Speaker } from '../speaker.js';
import { createCompare } from './compare.js';
import { STEPS } from './lesson.js';
import { requestPersist, storageEstimate } from '../db.js';
import {
  listLessons, getLesson, saveLesson, deleteLesson, allProgress, getResume, getDaily, settings, setSetting,
  listRecordings, recordingBlob, deleteRecording, exportBackup, restoreBackup, wipeAll,
} from '../store.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const filt = { q: '', level: '', theme: '', fav: false };

// ---------- home ----------
export async function homeView(root) {
  const [lessons, prog, resume] = await Promise.all([listLessons(), allProgress(), getResume()]);
  const themes = [...new Set(lessons.map(l => l.theme).filter(Boolean))];
  const list = h('div.list');
  const count = h('span.small');
  const search = h('input.search', { type: 'search', placeholder: 'タイトル・本文で検索', value: filt.q, 'aria-label': '検索' });
  search.addEventListener('input', () => { filt.q = search.value; draw(); });
  const chips = (vals, key, all) => {
    const row = h('div.chips.scroll', { role: 'radiogroup' }, [['', all], ...vals.map(v => [v, v])].map(([v, l]) => h('button.chip', {
      type: 'button', role: 'radio', 'aria-checked': String(filt[key] === v),
      onclick: e => { filt[key] = v; $$('.chip', row).forEach(b => b.setAttribute('aria-checked', 'false')); e.currentTarget.setAttribute('aria-checked', 'true'); draw(); },
    }, l)));
    return row;
  };
  function draw() {
    const q = filt.q.trim().toLowerCase();
    const items = lessons.filter(l => (!filt.level || l.level === filt.level) && (!filt.theme || l.theme === filt.theme) &&
      (!filt.fav || (prog.get(l.id) || {}).favorite) && (!q || `${l.title} ${l.text} ${l.theme}`.toLowerCase().includes(q)));
    count.textContent = `${items.length}件`;
    list.replaceChildren(...(items.length ? items.map(l => card(l, prog.get(l.id))) : [h('p.empty', '該当するテキストがありません。')]));
  }
  const rl = resume && lessons.find(l => l.id === resume.lessonId);
  root.replaceChildren(h('div.page',
    h('section.hero',
      h('h1', 'テキストを貼るだけで、シャドーイング教材に'),
      h('p.lead', '英文をアップロードまたは貼り付けると、文とチャンクに自動で分け、キーワード・音のつながりの解説・穴うめ問題まで作ります。読み上げは端末（iPhone）の音声を使います。'),
      h('a.btn.primary.lg', { href: '#/new' }, '＋ テキストから教材を作る')),
    rl ? h('a.card.resume', { href: `#/lesson/${encodeURIComponent(rl.id)}/${resume.step || 1}?c=${resume.chunk || 0}` },
      h('div.small', '前回の続き'), h('b', rl.title), h('div.small', `Step ${resume.step || 1}「${STEPS[(resume.step || 1) - 1].title}」`)) : null,
    h('h2', 'テキスト一覧'),
    search,
    chips(LEVELS.filter(v => lessons.some(l => l.level === v)), 'level', 'すべてのレベル'),
    themes.length ? chips(themes, 'theme', 'すべてのテーマ') : null,
    h('div.row', h('button.chip', { type: 'button', 'aria-pressed': String(filt.fav), onclick: e => { filt.fav = !filt.fav; e.currentTarget.setAttribute('aria-pressed', String(filt.fav)); draw(); } }, '★ お気に入り'), count),
    list));
  draw();
}
function card(l, p) {
  p = p || { steps: {}, completions: [], totalSec: 0 };
  const done = Math.min(6, Object.keys(p.steps).length);
  return h('a.card.item', { href: `#/lesson/${encodeURIComponent(l.id)}/${p.lastStep || 1}` },
    h('div.row.tight', h('span.lv', l.level), l.theme ? h('span.tag', l.theme) : null, l.example ? h('span.tag.ghost', '例文') : null, p.favorite ? h('span.star', '★') : null),
    h('b.t', l.title),
    h('div.excerpt', l.text.slice(0, 90) + (l.text.length > 90 ? '…' : '')),
    h('div.meta', `${l.sentences.length}文・${l.chunks.length}チャンク・ステップ ${done}/6${p.completions.length ? `・完了 ${p.completions.length}回` : ''}${p.totalSec ? `・${fmtDuration(p.totalSec)}` : ''}`),
    h('div.bar-mini', h('div', { style: { width: `${(done / 6) * 100}%` } })));
}

// ---------- create ----------
export function newView(root, app) {
  const title = h('input', { placeholder: '空欄なら最初の文から自動で付けます', 'aria-label': 'タイトル' });
  const theme = h('input', { list: 'themes', placeholder: '例: 日常・仕事・旅行', 'aria-label': 'テーマ' });
  const text = h('textarea', { rows: 9, placeholder: 'ここに英文を貼り付けるか、上のボタンでテキストファイルを選んでください。\n（字幕ファイル .srt / .vtt の時刻や番号、「Tom:」のような話者名は自動で取り除きます）', 'aria-label': '英文' });
  const ja = h('textarea', { rows: 4, placeholder: '任意：和訳を1文ずつ改行して貼り付けると、各文に対応づけます', 'aria-label': '和訳' });
  const size = h('select', { 'aria-label': 'チャンクの長さ' }, [[4, '短め（〜4語）'], [6, 'ふつう（〜6語）'], [8, '長め（〜8語）']].map(([v, l]) => h('option', { value: v, selected: v === settings().chunkWords }, l)));
  const preview = h('div.preview', { 'aria-live': 'polite' });
  const upload = h('button.btn', {
    type: 'button',
    onclick: async () => {
      const f = await pickFile('.txt,.md,.srt,.vtt,text/plain,text/markdown,text/vtt');
      if (!f) return;
      if (f.size > 300000) { toast('ファイルが大きすぎます（300KBまで）'); return; }
      text.value = await f.text();
      if (!title.value) title.value = f.name.replace(/\.[^.]+$/, '');
      draw();
      toast(`「${f.name}」を読み込みました`);
    },
  }, '📄 テキストファイルを選ぶ');
  let built = null;
  function draw() {
    if (!text.value.trim()) { preview.replaceChildren(); built = null; return; }
    built = buildLesson({ text: text.value, ja: ja.value, title: title.value, theme: theme.value, maxWords: +size.value });
    const jaCount = built.sentences.filter(s => s.ja).length;
    preview.replaceChildren(h('div.card',
      h('h3', '自動分析の結果'),
      h('p', `「${built.title}」・推定レベル ${built.level}・${built.sentences.length}文・${built.chunks.length}チャンク${jaCount ? `・和訳 ${jaCount}文` : ''}`),
      jaCount && jaCount !== built.sentences.length ? h('p.warn', `和訳の行数（${ja.value.split('\n').filter(s => s.trim()).length}行）と英文の文数（${built.sentences.length}文）が合っていません。作成後に編集画面で直せます。`) : null,
      h('p.small', 'キーワード: ', built.words.map(w => w.w).join(', ') || '（なし）'),
      h('div.pv-chunks', built.chunks.slice(0, 14).map(c => h('span.pchunk', c.en)), built.chunks.length > 14 ? '…' : '')));
  }
  [text, ja, title, theme].forEach(x => x.addEventListener('input', draw));
  size.addEventListener('change', () => { setSetting('chunkWords', +size.value); draw(); });
  root.replaceChildren(h('form.page.form', {
    onsubmit: async e => {
      e.preventDefault();
      draw();
      if (!built || !built.sentences.length) { toast('英文を入力してください'); return; }
      if (built.sentences.length > 200) { toast('長すぎます。200文以内に分けてください'); return; }
      const l = await saveLesson({ ...built, chunkWords: +size.value });
      toast('教材を作成しました');
      app.go(`#/lesson/${encodeURIComponent(l.id)}/1`);
    },
  },
  h('a.back', { href: '#/' }, '‹ 一覧'),
  h('h1', 'テキストから教材を作る'),
  h('div.row.wrap', upload, h('span.small', '.txt / .md / .srt / .vtt')),
  h('label.field', h('span', '英文 *'), text),
  h('label.field', h('span', '和訳（任意）'), ja),
  h('div.row.wrap', h('label.field', h('span', 'タイトル'), title), h('label.field', h('span', 'テーマ'), theme), h('label.field', h('span', 'チャンクの長さ'), size)),
  h('datalist#themes', ['日常', '仕事', '旅行', '学校', '健康', 'ニュース', '会話', 'スピーチ'].map(t => h('option', { value: t }))),
  preview,
  h('div.row', h('button.btn.primary.lg', { type: 'submit' }, 'この内容で作成 ›')),
  h('p.hint', '入力したテキストはこの端末の中だけに保存され、外部には送信されません。著作権のある教材は個人の学習の範囲で使ってください。')));
}

// ---------- edit ----------
export async function editView(root, id, app) {
  const L0 = await getLesson(id);
  if (!L0 || L0.example) { root.replaceChildren(h('p.page', '編集できるテキストが見つかりません。')); return; }
  const L = JSON.parse(JSON.stringify(L0));
  const list = h('div.edit-list');
  const renumber = () => L.chunks.forEach((c, i) => { c.id = `c${i + 1}`; });
  const reNotes = () => {
    L.sentences.forEach((s, si) => {
      const cs = L.chunks.filter(c => c.s === si);
      s.en = cs.map(c => c.en).join(' ');
      const notes = soundNotes(s.en.split(' '));
      let wi = 0;
      cs.forEach(c => {
        const n = c.en.split(' ').length;
        c.notes = notes.filter(x => x.i >= wi && x.i < wi + n).map(x => x.text);
        const wf = weakForms(c.en.split(' '));
        if (wf.length) c.notes.push(`弱く短く読まれやすい語：${wf.join('・')}`);
        wi += n;
      });
    });
  };
  function draw() {
    renumber();
    list.replaceChildren(...L.chunks.map((c, i) => {
      const en = h('input', { value: c.en, 'aria-label': `チャンク${i + 1}の英文` });
      en.addEventListener('change', () => { c.en = en.value.trim(); });
      const ja = h('input', { value: c.ja || '', placeholder: 'チャンクの意味（任意）', 'aria-label': `チャンク${i + 1}の意味` });
      ja.addEventListener('change', () => { c.ja = ja.value.trim(); });
      const first = i === 0 || L.chunks[i - 1].s !== c.s;
      return h('div.edit-row', first ? h('div.small', `── 文 ${c.s + 1}`) : null, en, ja,
        h('div.row.wrap',
          h('button.btn.xs', { type: 'button', onclick: () => { const w = c.en.split(' '); if (w.length < 2) return; const k = Math.ceil(w.length / 2); L.chunks.splice(i + 1, 0, { ...c, en: w.slice(k).join(' '), ja: '' }); c.en = w.slice(0, k).join(' '); draw(); } }, '分割'),
          i < L.chunks.length - 1 && L.chunks[i + 1].s === c.s ? h('button.btn.xs', { type: 'button', onclick: () => { const n = L.chunks[i + 1]; c.en += ' ' + n.en; c.ja = [c.ja, n.ja].filter(Boolean).join(' '); L.chunks.splice(i + 1, 1); draw(); } }, '次と結合') : null,
          L.chunks.length > 1 ? h('button.btn.xs.danger', { type: 'button', onclick: () => { L.chunks.splice(i, 1); draw(); } }, '削除') : null));
    }));
    sent.replaceChildren(...L.sentences.map((s, si) => {
      const inp = h('input', { value: s.ja || '', placeholder: '和訳（任意）', 'aria-label': `${si + 1}文目の和訳` });
      inp.addEventListener('change', () => { s.ja = inp.value.trim(); });
      return h('label.field', h('span.small', `${si + 1}. ${L.chunks.filter(c => c.s === si).map(c => c.en).join(' ')}`), inp);
    }));
  }
  const sent = h('div');
  const title = h('input', { value: L.title, 'aria-label': 'タイトル' });
  const theme = h('input', { value: L.theme || '', 'aria-label': 'テーマ' });
  const level = h('select', { 'aria-label': 'レベル' }, LEVELS.map(v => h('option', { value: v, selected: v === L.level }, v)));
  const words = h('textarea', { rows: 4, 'aria-label': 'キーワード' });
  words.value = L.words.map(w => w.w).join(', ');
  root.replaceChildren(h('div.page',
    h('a.back', { href: `#/lesson/${encodeURIComponent(L.id)}/1` }, '‹ 練習へ'),
    h('h1', 'テキストを編集'),
    h('div.row.wrap', h('label.field', h('span', 'タイトル'), title), h('label.field', h('span', 'テーマ'), theme), h('label.field', h('span', 'レベル'), level)),
    h('label.field', h('span', 'キーワード（カンマ区切り）'), words),
    h('h2', 'チャンク'), list,
    h('h2', '文ごとの和訳'), sent,
    h('div.sticky',
      h('button.btn.primary', {
        onclick: async () => {
          L.title = title.value.trim() || L.title; L.theme = theme.value.trim(); L.level = level.value;
          L.chunks = L.chunks.filter(c => c.en);
          reNotes();
          const old = new Map(L.words.map(w => [w.w, w]));
          L.words = words.value.split(/[,、\n]/).map(s => s.trim().toLowerCase()).filter(Boolean).map(w => old.get(w) || { w, ja: '', note: '' });
          await saveLesson(L);
          toast('保存しました');
          app.go(`#/lesson/${encodeURIComponent(L.id)}/1`);
        },
      }, '保存'),
      h('span.grow'),
      h('button.btn.danger.sm', { onclick: async () => { if (await confirmDialog('このテキストを削除しますか？（録音は残ります）', '削除')) { await deleteLesson(L.id); app.go('#/'); } } }, '削除'))));
  draw();
}

// ---------- recordings ----------
export async function recListView(root) {
  const recs = await listRecordings();
  root.replaceChildren(h('div.page', h('h1', '録音'),
    h('p.lead', '練習の録音はこの端末に保存されます。'),
    recs.length ? h('ul.cards', recs.map(r => h('li', h('a.card.item', { href: `#/rec/${r.id}` },
      h('b', r.lessonTitle), h('div.meta', `${fmtDate(r.createdAt)}・${{ shadow: 'シャドーイング', repeat: 'リピーティング', import: '取り込み' }[r.mode] || ''}・${fmtTime(r.duration)}`))))) : h('p.empty', 'まだ録音はありません。Step 4・5 で録音できます。')));
}
let recCtx = null;
export function destroyRec() { if (recCtx) { recCtx.destroy(); recCtx = null; } }
export async function recView(root, id, app) {
  destroyRec();
  const r = (await listRecordings()).find(x => x.id === id);
  if (!r) { root.replaceChildren(h('p.page', '録音が見つかりません。')); return; }
  const lesson = await getLesson(r.lessonId);
  const blob = await recordingBlob(r);
  const url = URL.createObjectURL(blob);
  let cmp = null;
  if (lesson) {
    const sp = new Speaker(lesson);
    cmp = createCompare({ rec: r, url, lesson, speaker: sp });
    recCtx = { destroy() { cmp.destroy(); sp.stop(); URL.revokeObjectURL(url); } };
  }
  root.replaceChildren(h('div.page',
    h('a.back', { href: '#/rec' }, '‹ 録音一覧'),
    h('h1', r.lessonTitle),
    h('p.small', `${fmtDate(r.createdAt)}・${fmtTime(r.duration)}`),
    cmp ? h('div.card', h('h3', '聞き比べ'), cmp.el) : h('div.card', h('p.warn', '元のテキストが削除されています。'), h('audio', { controls: true, src: url })),
    h('div.row.wrap',
      h('button.btn', { onclick: () => saveFile(blob, `${safeName(r.lessonTitle)}_${fmtDate(r.createdAt).replace(/[/: ]/g, '')}.${extForMime(r.mime)}`, { preferShare: true }) }, '⬇ ダウンロード'),
      lesson ? h('a.btn', { href: `#/lesson/${encodeURIComponent(lesson.id)}/5` }, 'もう一度練習') : null,
      h('span.grow'),
      h('button.btn.danger', { onclick: async () => { if (await confirmDialog('この録音を削除しますか？', '削除')) { destroyRec(); await deleteRecording(r.id); app.go('#/rec'); } } }, '🗑 削除'))));
}

// ---------- log ----------
export async function logView(root) {
  const [lessons, prog, daily] = await Promise.all([listLessons(), allProgress(), getDaily()]);
  const name = new Map(lessons.map(l => [l.id, l.title]));
  const total = [...prog.values()].reduce((s, p) => s + p.totalSec, 0);
  const comps = [...prog.values()].flatMap(p => p.completions.map(c => ({ ...c, id: p.lessonId }))).sort((a, b) => b.at - a.at);
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, sec: daily[todayKey(d)] || 0 }); }
  const max = Math.max(60, ...days.map(d => d.sec));
  const R = ['ほとんど', '3割', '半分', 'ほぼ全部'];
  root.replaceChildren(h('div.page', h('h1', '学習記録'),
    h('div.stats',
      h('div.stat', h('b', fmtDuration(total)), h('span', '合計')),
      h('div.stat', h('b', fmtDuration(daily[todayKey()] || 0)), h('span', '今日')),
      h('div.stat', h('b', `${comps.length}回`), h('span', '完了'))),
    h('h2', '直近14日'),
    h('div.days', days.map(d => h('div.day', h('div.fill', { style: { height: `${(d.sec / max) * 100}%` }, title: fmtDuration(d.sec) }), h('span', d.label)))),
    h('h2', '完了履歴'),
    comps.length ? h('ul.cards', comps.map(c => h('li.card', h('span.small', fmtDate(c.at)), ' ', h('b', name.get(c.id) || c.id),
      c.total ? h('span.tag', `穴うめ ${c.score}/${c.total}`) : null,
      c.first != null && c.final != null ? h('span.tag', `聞き取り ${R[c.first]} → ${R[c.final]}`) : null))) : h('p.empty', 'Step 6 で「完了を記録」すると追加されます。')));
}

// ---------- settings ----------
export async function settingsView(root, app) {
  const voices = await tts.getVoices();
  const sel = h('select', { 'aria-label': '読み上げの声', onchange: e => { setSetting('voiceURI', e.target.value); tts.setPreferredVoice(e.target.value); } },
    h('option', { value: '' }, '自動（おすすめの英語音声）'),
    voices.map(v => h('option', { value: v.voiceURI, selected: v.voiceURI === settings().voiceURI }, `${v.name}（${v.lang}）`)));
  const est = await storageEstimate();
  root.replaceChildren(h('div.page', h('h1', '設定'),
    h('div.card',
      h('h2', '読み上げの声'),
      tts.ttsSupported() ? sel : h('p.warn', 'このブラウザは音声読み上げに対応していません。'),
      h('div.row.wrap', h('button.btn', { onclick: () => { tts.unlock(); tts.speak('Hello! This is how I sound when I read your text.', { rate: settings().rate }); } }, '🔊 試しに聞く')),
      h('p.small', voices.length ? `この端末の英語音声: ${voices.length}種類` : '英語音声が見つかりません。'),
      h('p.hint', 'iPhoneでは「設定」→「アクセシビリティ」→「読み上げコンテンツ」→「声」→「英語」から、高品質（拡張）の声を追加ダウンロードすると、より自然になります。追加後はこの一覧から選んでください。')),
    h('div.card',
      h('h2', 'バックアップ'),
      h('p.small', 'テキスト・学習記録・録音をまとめて1つのファイルに保存／復元します。'),
      est ? h('p.small', `使用量 約${((est.usage || 0) / 1048576).toFixed(1)}MB`) : null,
      h('div.row.wrap',
        h('button.btn.primary', { onclick: async e => { const b = e.currentTarget; b.disabled = true; try { await saveFile(await exportBackup(), `echo-lines-backup-${todayKey()}.json`, { preferShare: true }); } finally { b.disabled = false; } } }, '⬇ 書き出す'),
        h('button.btn', { onclick: async () => { const f = await pickFile('application/json,.json'); if (!f) return; if (!(await confirmDialog('この端末のデータをバックアップの内容に置き換えます。よろしいですか？', '復元'))) return; try { await restoreBackup(await f.text()); toast('復元しました'); app.go('#/'); } catch (err) { toast(err.message, 5000); } } }, '⬆ 復元する'),
        h('button.btn.sm', { onclick: async () => toast((await requestPersist()) ? '永続保存が有効です' : 'ブラウザに許可されませんでした') }, '永続保存をリクエスト'))),
    h('div.card',
      h('h2', 'データの削除'),
      h('button.btn.danger', { onclick: async () => { if (await confirmDialog('この端末のテキスト・記録・録音をすべて削除します。元に戻せません。', 'すべて削除')) { await wipeAll(); toast('削除しました'); app.go('#/'); } } }, 'すべて削除')),
    h('div.card.about',
      h('h2', 'Echo Lines について'),
      h('p.small', 'ログイン・サーバー不要の英語シャドーイング練習アプリです。テキスト・録音・記録はこの端末（IndexedDB）にだけ保存されます。読み上げは端末に入っている音声合成を使うため、声の質や音のつながりの再現度は端末によって異なります。音のつながり・脱落などの解説は、つづりから自動で推定した目安です。'),
      h('p.small', '例文3本はこのアプリのオリジナルです（CC BY 4.0）。'))));
}

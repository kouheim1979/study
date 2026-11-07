// "My materials": register your own audio + pasted text, then edit chunk timings.
import { h, $, $$, fmtTime, toast, confirmDialog } from '../util.js';
import { Player } from '../player.js';
import { db } from '../db.js';
import { LEVELS, splitText, estimateTimings, parseWords, saveUserLesson, deleteUserLesson, getLesson, audioDuration } from '../lessons.js';

const THEMES = ['日常', '旅行', '仕事', '健康', '学校', '会話', 'ニュース', '文化', 'その他'];
let editorPlayer = null;
export function destroyEditor() {
  if (editorPlayer) { editorPlayer.destroy(); editorPlayer = null; }
  document.removeEventListener('keydown', onKey);
}
let keyHandler = null;
function onKey(e) { if (keyHandler) keyHandler(e); }

export async function mineView(root) {
  const lessons = (await db.all('lessons')).sort((a, b) => b.updatedAt - a.updatedAt);
  root.replaceChildren(h('div.page',
    h('h1', '自分の教材'),
    h('p.lead', '手持ちの音声ファイルと英文を登録して、サンプルと同じ6ステップで練習できます。登録した教材はこの端末の中だけに保存されます。'),
    h('div.row', h('a.btn.primary', { href: '#/edit/new' }, '＋ 新しい教材を登録')),
    h('div.card.note',
      h('p', h('strong', '使える教材の例：'), 'ELLLO（A2レベルの会話など）の音声とスクリプト、QQEnglish Basic English Book 3 など受講中の教材の音声・本文、自分で用意した音声。'),
      h('p.small', '利用規約で個人の学習利用が認められている範囲で使ってください。登録した音声・本文はこのアプリから外部へ送信されず、GitHub などにも含まれません（バックアップファイルには含まれるので取り扱いに注意してください）。')),
    lessons.length ? h('div.lesson-list', lessons.map(l => h('div.card.lesson-card',
      h('div.lc-top', h('span.badge.lv', l.level || '—'), h('span.badge', l.theme || 'テーマなし')),
      h('div.t', l.title),
      h('div.lc-meta', h('span', `⏱ ${fmtTime(l.duration)}`), h('span', `${l.chunks.length}チャンク`), l.credit ? h('span', l.credit) : null),
      h('div.row.wrap',
        h('a.btn.sm.primary', { href: `#/lesson/${encodeURIComponent(l.id)}/1` }, '練習する'),
        h('a.btn.sm', { href: `#/edit/${encodeURIComponent(l.id)}` }, '区間・内容を編集'))))) : h('p.empty', 'まだ登録した教材はありません。')));
}

export async function newLessonView(root, app) {
  const f = {};
  const field = (label, input, hint) => h('label.field', h('span.fl', label), input, hint ? h('span.hint', hint) : null);
  f.title = h('input', { required: true, placeholder: '例: ELLLO #1234 Weekend Plans' });
  f.titleJa = h('input', { placeholder: '任意' });
  f.level = h('select', LEVELS.map(l => h('option', { value: l, selected: l === 'A2' }, l)));
  f.theme = h('input', { list: 'theme-list', placeholder: '例: 日常' });
  f.credit = h('input', { placeholder: '例: ELLLO / QQEnglish Basic English Book 3 Unit 5（個人学習用）' });
  f.audio = h('input', { type: 'file', accept: 'audio/*,video/mp4,.m4a,.mp3,.wav,.aac' });
  f.en = h('textarea', { rows: 8, placeholder: '英文を貼り付けてください。\n例:\nHi, I am Tom. I live in Sydney with my family.' });
  f.mode = 'phrase';
  const modeRow = h('div.chips', { role: 'radiogroup', 'aria-label': 'チャンクの分け方' },
    [['phrase', '文＋カンマで分ける（おすすめ）'], ['sentence', '1文＝1チャンク'], ['line', '1行＝1チャンク']].map(([v, l]) => h('button.chip', {
      type: 'button', role: 'radio', 'aria-checked': String(v === f.mode),
      onclick: e => { f.mode = v; $$('.chip', modeRow).forEach(b => b.setAttribute('aria-checked', 'false')); e.currentTarget.setAttribute('aria-checked', 'true'); preview(); },
    }, l)));
  f.ja = h('textarea', { rows: 5, placeholder: '任意。文の順に1行ずつ（「1行＝1チャンク」の場合はチャンクの順）。' });
  f.words = h('textarea', { rows: 4, placeholder: '任意。1行に1語: 単語 | 意味 | 発音メモ\n例: commute | 通勤する | 後ろを強く' });
  const prev = h('div.preview');
  function preview() {
    const cs = splitText(f.en.value, f.mode);
    prev.replaceChildren(cs.length ? h('p.small', `${cs.length}チャンク: `, cs.slice(0, 12).map(c => h('span.pchunk', c.en)), cs.length > 12 ? '…' : '') : '');
  }
  f.en.addEventListener('input', preview);

  const form = h('form.page.form', {
    onsubmit: async e => {
      e.preventDefault();
      const file = f.audio.files[0];
      if (!f.title.value.trim()) return toast('タイトルを入力してください');
      if (!file) return toast('音声ファイルを選んでください');
      let chunks = splitText(f.en.value, f.mode);
      if (!chunks.length) return toast('英文を貼り付けてください');
      const url = URL.createObjectURL(file);
      const duration = await audioDuration(url);
      URL.revokeObjectURL(url);
      if (!duration) toast('音声の長さを取得できませんでした。区間はあとで調整してください');
      chunks = estimateTimings(chunks, duration || chunks.length * 2).map((c, i) => ({ ...c, id: `c${i + 1}`, ja: '', note: '' }));
      const jaLines = f.ja.value.replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
      const sentenceJa = {};
      if (f.mode === 'line') chunks.forEach((c, i) => { c.ja = jaLines[i] || ''; });
      else jaLines.forEach((t, i) => { sentenceJa[i] = t; });
      const lesson = await saveUserLesson({
        title: f.title.value.trim(), titleJa: f.titleJa.value.trim(), level: f.level.value, theme: f.theme.value.trim() || 'その他',
        credit: f.credit.value.trim(), description: f.credit.value.trim(), duration, chunks, sentenceJa,
        words: parseWords(f.words.value), quiz: [],
        source: { type: 'user', credit: f.credit.value.trim() },
      }, file);
      toast('登録しました。区間の開始・終了を合わせましょう');
      app.navigate(`#/edit/${encodeURIComponent(lesson.id)}?new=1`);
    },
  },
  h('a.back', { href: '#/mine' }, '‹ 自分の教材'),
  h('h1', '教材を登録'),
  field('タイトル *', f.title),
  field('日本語タイトル', f.titleJa),
  h('div.row.wrap', field('レベル', f.level), field('テーマ', f.theme)),
  h('datalist#theme-list', THEMES.map(t => h('option', { value: t }))),
  field('出典・メモ', f.credit, '教材名や回番号など。自分用のメモです。'),
  field('音声ファイル *', f.audio, 'mp3 / m4a / wav など。iPhoneでは「ファイル」アプリやボイスメモから選べます。'),
  field('英文 *', f.en),
  h('div.field', h('span.fl', 'チャンクの分け方'), modeRow, prev),
  field('和訳', f.ja),
  field('単語', f.words),
  h('div.row', h('button.btn.primary.lg', { type: 'submit' }, '登録して区間を編集する ›')));
  root.replaceChildren(form);
}

export async function editLessonView(root, id, query, app) {
  destroyEditor();
  const lesson = await getLesson(id);
  if (!lesson || lesson.kind !== 'user') { root.replaceChildren(h('p.page', '教材が見つかりません。')); return; }
  const L = JSON.parse(JSON.stringify({ ...lesson, audioUrl: undefined }));
  L.sentenceJa = L.sentenceJa || {};
  const p = editorPlayer = new Player();
  if (lesson.audioUrl) await p.load(lesson.audioUrl, lesson.duration);
  let dirty = false;
  let sel = 0;
  let tapMode = false;
  const mark = () => { dirty = true; saveBtn.disabled = false; };

  const seek = h('input.seek', { type: 'range', min: 0, max: p.duration || L.duration || 1, step: 0.01, value: 0, 'aria-label': '再生位置' });
  seek.addEventListener('change', () => p.seek(+seek.value));
  const tLbl = h('span.time', '0:00.0');
  const playBtn = h('button.btn.round.primary', { type: 'button', onclick: () => { p.range = null; p.toggle(); } }, '▶');
  const rateSel = h('select', { onchange: e => p.setRate(+e.target.value), 'aria-label': '再生速度' }, [0.5, 0.75, 1, 1.25].map(r => h('option', { value: r, selected: r === 1 }, `${r}x`)));
  const tapBtn = h('button.btn.lg.tap', { type: 'button', onclick: () => tap() }, '✂ ここで区切る');
  const tapToggle = h('button.btn', { type: 'button', onclick: () => toggleTap() }, '⏱ タップで区切るモード');
  const list = h('div.edit-list');

  function toggleTap() {
    tapMode = !tapMode;
    tapToggle.textContent = tapMode ? '■ 区切りモードを終了' : '⏱ タップで区切るモード';
    tapBtn.hidden = !tapMode;
    if (tapMode) {
      const c = L.chunks[sel] || L.chunks[0];
      p.range = null; p.clearAB();
      p.seek(Math.max(0, (c ? c.start : 0) - 0.3));
      p.play();
      toast('音声に合わせて、各チャンクの終わりで「ここで区切る」（PCはスペースキー）');
    } else p.pause();
  }
  function tap() {
    const t = Math.round(p.time * 1000) / 1000;
    const c = L.chunks[sel];
    if (!c) return;
    if (t <= c.start) { toast('開始より前です'); return; }
    c.end = t;
    if (L.chunks[sel + 1]) { L.chunks[sel + 1].start = t; sel++; }
    else { toggleTap(); toast('最後のチャンクまで区切りました'); }
    mark(); draw();
  }
  keyHandler = e => {
    if (tapMode && e.code === 'Space' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); tap(); }
  };
  document.addEventListener('keydown', onKey);

  p.addEventListener('time', () => {
    const t = p.time;
    seek.max = p.duration || L.duration || 1;
    seek.value = t;
    tLbl.textContent = `${fmtTime(t, 1)} / ${fmtTime(p.duration || L.duration)}`;
    $$('.edit-row', list).forEach((r, i) => {
      const c = L.chunks[i];
      r.classList.toggle('now', !!c && t >= c.start && t < c.end && !p.paused);
    });
  });
  p.addEventListener('state', () => { playBtn.textContent = p.paused ? '▶' : '⏸'; });

  const num = (c, k) => {
    const inp = h('input.num', { type: 'number', step: 0.01, min: 0, value: c[k].toFixed(2), 'aria-label': k === 'start' ? '開始（秒）' : '終了（秒）' });
    inp.addEventListener('change', () => { c[k] = Math.max(0, +inp.value || 0); mark(); draw(); });
    return inp;
  };
  const nudge = (c, k, d) => h('button.btn.xs', { type: 'button', onclick: () => { c[k] = Math.max(0, Math.round((c[k] + d) * 100) / 100); mark(); draw(); p.playRange(k === 'start' ? c.start : Math.max(c.start, c.end - 1.2), c.end); } }, d > 0 ? '+0.1' : '−0.1');
  const text = (c, k, ph) => {
    const inp = h(k === 'note' ? 'textarea' : 'input', { value: c[k] || '', placeholder: ph, rows: k === 'note' ? 2 : undefined, 'aria-label': ph });
    if (k === 'note') inp.value = c[k] || '';
    inp.addEventListener('input', () => { c[k] = inp.value; mark(); });
    return inp;
  };

  function renumber() {
    L.chunks.forEach((c, i) => { c.id = `c${i + 1}`; });
  }
  function draw() {
    renumber();
    list.replaceChildren(...L.chunks.map((c, i) => {
      const bad = c.end <= c.start || (i > 0 && c.start < L.chunks[i - 1].end - 0.01);
      const newSent = h('input', { type: 'checkbox', checked: i === 0 || c.sentence !== L.chunks[i - 1].sentence, disabled: i === 0 });
      newSent.addEventListener('change', () => {
        const base = i === 0 ? 0 : L.chunks[i - 1].sentence;
        const delta = newSent.checked ? 1 : 0;
        const old = c.sentence;
        for (let j = i; j < L.chunks.length; j++) L.chunks[j].sentence = L.chunks[j].sentence - old + base + delta;
        mark(); draw();
      });
      return h('div.edit-row', { class: [i === sel ? 'sel' : '', bad ? 'bad' : ''].join(' '), onclick: () => { sel = i; $$('.edit-row', list).forEach((r, j) => r.classList.toggle('sel', j === i)); } },
        h('div.er-head',
          h('span.er-n', `#${i + 1}`),
          h('button.btn.sm', { type: 'button', onclick: () => p.playRange(c.start, c.end) }, '▶'),
          h('span.small', `${fmtTime(c.start, 2)} – ${fmtTime(c.end, 2)}（${(c.end - c.start).toFixed(2)}秒）`),
          bad ? h('span.tag.c-pron', '要確認') : null,
          h('label.check.small', newSent, ' 文の始まり')),
        text(c, 'en', '英文'),
        text(c, 'ja', 'チャンクの意味（任意）'),
        text(c, 'note', 'リンキング・脱落などの解説（任意）'),
        h('div.er-times',
          h('span.small', '開始'), nudge(c, 'start', -0.1), num(c, 'start'), nudge(c, 'start', 0.1),
          h('button.btn.xs', { type: 'button', onclick: () => { c.start = Math.round(p.time * 1000) / 1000; mark(); draw(); } }, '←現在'),
          h('span.small', '終了'), nudge(c, 'end', -0.1), num(c, 'end'), nudge(c, 'end', 0.1),
          h('button.btn.xs', { type: 'button', onclick: () => { c.end = Math.round(p.time * 1000) / 1000; mark(); draw(); } }, '←現在')),
        h('div.row.wrap',
          h('button.btn.xs', { type: 'button', onclick: () => { const mid = Math.round(((c.start + c.end) / 2) * 1000) / 1000; const words = c.en.split(' '); const half = Math.ceil(words.length / 2); L.chunks.splice(i + 1, 0, { ...c, en: words.slice(half).join(' '), ja: '', note: '', start: mid }); c.en = words.slice(0, half).join(' '); c.end = mid; mark(); draw(); } }, '2つに分割'),
          i < L.chunks.length - 1 ? h('button.btn.xs', { type: 'button', onclick: () => { const n = L.chunks[i + 1]; c.en = `${c.en} ${n.en}`; c.ja = [c.ja, n.ja].filter(Boolean).join(' '); c.note = [c.note, n.note].filter(Boolean).join(' '); c.end = n.end; L.chunks.splice(i + 1, 1); mark(); draw(); } }, '次と結合') : null,
          L.chunks.length > 1 ? h('button.btn.xs.danger', { type: 'button', onclick: () => { L.chunks.splice(i, 1); sel = Math.min(sel, L.chunks.length - 1); mark(); draw(); } }, '削除') : null));
    }));
    drawSentences();
  }

  const sentBox = h('div.sent-ja');
  function drawSentences() {
    const keys = [...new Set(L.chunks.map(c => c.sentence))];
    sentBox.replaceChildren(...keys.map((k, idx) => {
      const inp = h('input', { value: L.sentenceJa[k] || '', placeholder: '和訳（任意）', 'aria-label': `${idx + 1}文目の和訳` });
      inp.addEventListener('input', () => { L.sentenceJa[k] = inp.value; mark(); });
      return h('label.field', h('span.small', `${idx + 1}. ${L.chunks.filter(c => c.sentence === k).map(c => c.en).join(' ')}`), inp);
    }));
  }

  const meta = {
    title: h('input', { value: L.title }), titleJa: h('input', { value: L.titleJa || '' }),
    level: h('select', LEVELS.map(l => h('option', { value: l, selected: l === L.level }, l))),
    theme: h('input', { value: L.theme || '', list: 'theme-list2' }), credit: h('input', { value: L.credit || '' }),
    words: h('textarea', { rows: 4 }), audio: h('input', { type: 'file', accept: 'audio/*,video/mp4,.m4a,.mp3,.wav,.aac' }),
  };
  meta.words.value = (L.words || []).map(w => [w.w, w.ja, w.tip].filter((x, i) => i === 0 || x).join(' | ')).join('\n');
  Object.values(meta).forEach(inp => inp.addEventListener('input', mark));

  const saveBtn = h('button.btn.primary', { type: 'button', disabled: !query.new, onclick: () => save() }, '保存');
  async function save() {
    L.title = meta.title.value.trim() || L.title;
    L.titleJa = meta.titleJa.value.trim();
    L.level = meta.level.value;
    L.theme = meta.theme.value.trim();
    L.credit = meta.credit.value.trim();
    L.description = L.credit;
    L.words = parseWords(meta.words.value);
    L.chunks.sort((a, b) => a.start - b.start);
    renumber();
    const file = meta.audio.files[0] || null;
    if (file) {
      const u = URL.createObjectURL(file);
      L.duration = await audioDuration(u) || L.duration;
      URL.revokeObjectURL(u);
    }
    delete L.sentences;
    await saveUserLesson(L, file);
    dirty = false;
    saveBtn.disabled = true;
    toast('保存しました');
    if (file) app.navigate(`#/edit/${encodeURIComponent(L.id)}?r=${Date.now()}`);
  }
  app.setLeaveGuard(() => (dirty ? '保存していない変更があります。移動しますか？' : null));

  root.replaceChildren(h('div.page.editor',
    h('a.back', { href: '#/mine' }, '‹ 自分の教材'),
    h('h1', '区間と内容の編集'),
    query.new ? h('p.card.note', '区間は文字数から自動で仮に割り当てています。「タップで区切るモード」で音声を聞きながら各チャンクの終わりでボタンを押すか、数値・±0.1ボタンで合わせてください。') : null,
    h('div.editor-player',
      h('div.row', playBtn, seek, rateSel),
      h('div.row.wrap', tLbl, tapToggle, tapBtn)),
    h('details.card', h('summary', '基本情報・単語・音声の差し替え'),
      h('label.field', h('span.fl', 'タイトル'), meta.title),
      h('label.field', h('span.fl', '日本語タイトル'), meta.titleJa),
      h('div.row.wrap', h('label.field', h('span.fl', 'レベル'), meta.level), h('label.field', h('span.fl', 'テーマ'), meta.theme)),
      h('datalist#theme-list2', THEMES.map(t => h('option', { value: t }))),
      h('label.field', h('span.fl', '出典・メモ'), meta.credit),
      h('label.field', h('span.fl', '単語（単語 | 意味 | 発音メモ）'), meta.words),
      h('label.field', h('span.fl', '音声ファイルを差し替える'), meta.audio)),
    h('h2', 'チャンク'),
    list,
    h('div.row', h('button.btn.sm', { type: 'button', onclick: () => { const last = L.chunks[L.chunks.length - 1]; const s = last ? last.end : 0; L.chunks.push({ id: '', en: 'New chunk', ja: '', note: '', start: s, end: Math.min(p.duration || s + 2, s + 2), sentence: last ? last.sentence + 1 : 0 }); mark(); draw(); } }, '＋ チャンクを追加')),
    h('h2', '文ごとの和訳'),
    sentBox,
    h('div.sticky-save',
      saveBtn,
      h('a.btn', { href: `#/lesson/${encodeURIComponent(L.id)}/1`, onclick: async e => { if (dirty) { e.preventDefault(); await save(); app.navigate(`#/lesson/${encodeURIComponent(L.id)}/1`); } } }, '保存して練習 ›'),
      h('span.grow'),
      h('button.btn.danger.sm', { type: 'button', onclick: async () => { if (await confirmDialog('この教材を削除しますか？（録音は残ります）', '削除')) { dirty = false; await deleteUserLesson(L.id); toast('削除しました'); app.navigate('#/mine'); } } }, '教材を削除'))));
  draw();
  tapBtn.hidden = true;
}

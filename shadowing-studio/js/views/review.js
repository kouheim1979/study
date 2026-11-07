// Review exchange. Learner: import result. Reviewer: open request, add timed comments, export result.
import { h, $$, fmtTime, fmtDate, toast, saveFile, pickFile, confirmDialog } from '../util.js';
import { db } from '../db.js';
import { Player } from '../player.js';
import { blobUrlById } from '../lessons.js';
import {
  CATEGORIES, catLabel, SCORE_KEYS, openReviewRequest, buildReviewResult, importReviewResult,
  lessonForSession, chunkAtRec, chunkWindow,
} from '../recordings.js';
import { settings, setSetting } from '../settings.js';

let session = null;
export function destroyReview() { if (session) { session.destroy(); session = null; } }

export async function reviewHomeView(root, app) {
  const all = await db.all('reviews');
  const received = all.filter(r => r.kind === 'received').sort((a, b) => b.importedAt - a.importedAt);
  const authored = all.filter(r => r.kind === 'authored').sort((a, b) => b.updatedAt - a.updatedAt);
  const recs = new Map((await db.all('recordings')).map(r => [r.id, r]));

  const importResult = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      const { rec } = await importReviewResult(await f.text());
      toast('添削結果を取り込みました');
      app.navigate(`#/rec/${rec.id}`);
    } catch (e) { toast(e.message || '読み込めませんでした', 5000); }
  };
  const openRequest = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    try {
      const s = await openReviewRequest(await f.text());
      app.navigate(`#/review/${s.id}`);
    } catch (e) { toast(e.message || '読み込めませんでした', 5000); }
  };

  root.replaceChildren(h('div.page',
    h('h1', '添削'),
    h('p.lead', '録音を講師などに見てもらい、時刻付きのコメントを受け取ります。サーバーは使わず、ファイルで受け渡します。'),
    h('ol.flow',
      h('li', h('strong', '学習者'), '：録音の詳細画面で「添削依頼ファイル」を書き出して送る'),
      h('li', h('strong', '講師'), '：このページの「レビューモード」で開き、聞きながらコメント → 「添削結果」を書き出して返す'),
      h('li', h('strong', '学習者'), '：「添削結果を取り込む」→ 該当箇所を聞き直して練習')),
    h('div.grid2',
      h('div.card',
        h('h2', '学習者として'),
        h('button.btn.primary', { onclick: importResult }, '📥 添削結果を取り込む'),
        h('p.small', '講師から受け取った「添削結果_….json」を選びます。'),
        h('a.btn.sm', { href: '#/recordings' }, '録音一覧から依頼を書き出す')),
      h('div.card',
        h('h2', '講師として（レビューモード）'),
        h('button.btn.primary', { onclick: openRequest }, '📂 添削依頼ファイルを開く'),
        h('p.small', '学習者から受け取った「添削依頼_….json」を選びます。'))),
    received.length ? h('section', h('h2', '受け取った添削'), h('ul.rec-list', received.map(r => {
      const rec = recs.get(r.recordingId);
      return h('li', h('a.card.rec-card', { href: rec ? `#/rec/${rec.id}` : '#/review' },
        h('div.t', rec ? rec.lessonTitle : '（録音が削除されています）'),
        h('div.lc-meta', h('span', `コメント ${r.comments.length}件`), r.reviewer ? h('span', r.reviewer) : null, h('span', fmtDate(r.importedAt)))));
    }))) : null,
    authored.length ? h('section', h('h2', 'レビュー中・レビュー済み'), h('ul.rec-list', authored.map(r => h('li',
      h('a.card.rec-card', { href: `#/review/${r.id}` },
        h('div.t', `${r.lesson.title}${r.learnerName ? `（${r.learnerName}）` : ''}`),
        h('div.lc-meta', h('span', `コメント ${r.comments.length}件`), h('span', `更新 ${fmtDate(r.updatedAt)}`))))))) : null));
}

export async function reviewSessionView(root, id, app) {
  destroyReview();
  const S = await db.get('reviews', id);
  if (!S || S.kind !== 'authored') { root.replaceChildren(h('div.page', h('p', 'レビューが見つかりません。'))); return; }
  const lesson = await lessonForSession(S);
  const rec = { ...S.recording, external: true };
  const mine = new Player();
  const model = new Player();
  await mine.load(await blobUrlById(S.recBlobId), rec.duration);
  if (lesson.audioUrl) model.load(lesson.audioUrl, lesson.duration);
  if (rec.sync && rec.sync.rate) model.setRate(rec.sync.rate);
  const save = async () => { S.updatedAt = Date.now(); await db.put('reviews', S); };
  session = { destroy() { mine.destroy(); model.destroy(); } };
  const dur = () => rec.duration || mine.duration || 1;

  const playBtn = h('button.btn.round.primary', { onclick: () => { model.stop(); mine.range = null; mine.toggle(); } }, '▶');
  const seek = h('input.seek', { type: 'range', min: 0, max: dur(), step: 0.01, value: 0, 'aria-label': '録音の再生位置' });
  let dragging = false;
  seek.addEventListener('input', () => { dragging = true; });
  seek.addEventListener('change', () => { dragging = false; mine.seek(+seek.value); });
  const tLbl = h('span.time');
  const nowEl = h('div.now-chunk');
  const rateSel = h('select', { 'aria-label': '再生速度', onchange: e => mine.setRate(+e.target.value) }, [0.6, 0.75, 0.9, 1].map(r => h('option', { value: r, selected: r === 1 }, `${r}x`)));
  const update = () => {
    const t = mine.time;
    if (!dragging) { seek.max = dur(); seek.value = t; }
    tLbl.textContent = `${fmtTime(t, 1)} / ${fmtTime(dur())}`;
    playBtn.textContent = mine.paused ? '▶' : '⏸';
    const c = chunkAtRec(rec, lesson, t);
    nowEl.textContent = c ? `${c.id.replace('c', '#')} ${c.en}` : '';
    if (formOpen && !timeTouched) tInput.value = t.toFixed(1);
  };
  mine.addEventListener('time', update);
  mine.addEventListener('state', update);

  // comment form
  let cat = 'pron';
  let formOpen = true;
  let timeTouched = false;
  const catRow = h('div.chips', { role: 'radiogroup', 'aria-label': 'コメントの種類' }, CATEGORIES.map(c => h('button.chip', {
    type: 'button', role: 'radio', class: c.color, 'aria-checked': String(c.k === cat),
    onclick: e => { cat = c.k; $$('.chip', catRow).forEach(b => b.setAttribute('aria-checked', 'false')); e.currentTarget.setAttribute('aria-checked', 'true'); },
  }, c.label)));
  const tInput = h('input.num', { type: 'number', step: 0.1, min: 0, value: '0.0', 'aria-label': 'コメントの時刻（秒）' });
  tInput.addEventListener('input', () => { timeTouched = true; });
  const text = h('textarea', { rows: 2, placeholder: '例: "get up" がつながっていません。「ゲラップ」のように t を軽く。' });
  text.addEventListener('focus', () => { if (!mine.paused) mine.pause(); });
  const addBtn = h('button.btn.primary', {
    onclick: async () => {
      const t = Math.max(0, +tInput.value || 0);
      if (!text.value.trim()) return toast('コメントを入力してください');
      const c = chunkAtRec(rec, lesson, t);
      S.comments.push({ id: `m${Date.now().toString(36)}`, t: Math.round(t * 10) / 10, cat, chunkId: c ? c.id : null, text: text.value.trim() });
      text.value = '';
      timeTouched = false;
      await save();
      drawList();
      toast('コメントを追加しました');
    },
  }, '＋ この時刻にコメント');

  const list = h('ul.cmts.review-list');
  function drawList() {
    const cs = [...S.comments].sort((a, b) => a.t - b.t);
    list.replaceChildren(...(cs.length ? cs.map(cm => {
      const ch = lesson.chunks.find(x => x.id === cm.chunkId);
      const c = CATEGORIES.find(x => x.k === cm.cat) || CATEGORIES[5];
      return h('li.cmt',
        h('div.cmt-main', h('span.tag', { class: c.color }, catLabel(cm.cat)), h('span.cmt-t', fmtTime(cm.t, 1)), h('span.cmt-text', cm.text)),
        ch ? h('div.small', `チャンク: ${ch.en}`) : null,
        h('div.cmt-btns',
          h('button.btn.sm', { onclick: () => { model.stop(); mine.playRange(Math.max(0, cm.t - 1), Math.min(dur(), cm.t + 2)); } }, '▶ 聞く'),
          ch && lesson.audioUrl ? h('button.btn.sm', { onclick: () => { mine.stop(); model.playRange(ch.start, ch.end); } }, '▶ お手本') : null,
          h('button.btn.sm.danger', { onclick: async () => { S.comments = S.comments.filter(x => x !== cm); await save(); drawList(); } }, '削除')));
    }) : [h('li.hint', 'まだコメントはありません。')]));
  }

  // chunk jump list
  const chunkList = h('div.chunks.compact', lesson.chunks.filter(c => chunkWindow(rec, c)).map(c => {
    const w = chunkWindow(rec, c);
    return h('div.chunk',
      h('button.cplay', { onclick: () => { model.stop(); mine.playRange(w[0], Math.min(dur(), w[1] + 0.15)); }, 'aria-label': `学習者の録音: ${c.en}` }, '▶'),
      h('div.ctext', h('p.tx-en', c.en), h('p.small', `録音 ${fmtTime(w[0], 1)}〜`)),
      lesson.audioUrl ? h('button.btn.sm', { onclick: () => { mine.stop(); model.playRange(c.start, c.end); } }, 'お手本') : null);
  }));

  const reviewer = h('input', { value: S.reviewer || settings().reviewerName || '', placeholder: '講師名（任意）' });
  reviewer.addEventListener('change', async () => { S.reviewer = reviewer.value.trim(); setSetting('reviewerName', S.reviewer); await save(); });
  const overall = h('textarea', { rows: 3, placeholder: '全体の講評' });
  overall.value = S.overall || '';
  overall.addEventListener('change', async () => { S.overall = overall.value; await save(); });
  const scores = h('div.score-edit', SCORE_KEYS.map(([k, label]) => {
    const row = h('div.score-row', h('span', label), [1, 2, 3, 4, 5].map(n => h('button.star-btn', {
      type: 'button', 'aria-label': `${label} ${n}`, 'aria-pressed': String((S.scores[k] || 0) >= n),
      onclick: async () => { S.scores[k] = n; await save(); $$('.star-btn', row).forEach((b, i) => { b.setAttribute('aria-pressed', String(i < n)); b.textContent = i < n ? '★' : '☆'; }); },
    }, (S.scores[k] || 0) >= n ? '★' : '☆')));
    return row;
  }));

  root.replaceChildren(h('div.page.review',
    h('a.back', { href: '#/review' }, '‹ 添削'),
    h('h1', `レビュー：${lesson.title}`),
    h('p.small', `${S.learnerName ? `学習者 ${S.learnerName}・` : ''}録音 ${fmtDate(rec.createdAt)}・${fmtTime(dur())}`),
    S.message ? h('p.card.note', '学習者からのメッセージ：', S.message) : null,
    !lesson.audioUrl ? h('p.warn', 'お手本音声が含まれていないため、お手本の再生はできません（学習者の録音のみ聞けます）。') : null,
    h('div.card.review-player',
      h('div.row', playBtn, seek),
      h('div.row.wrap', tLbl, rateSel,
        h('button.btn.sm', { onclick: () => mine.seek(Math.max(0, mine.time - 2)) }, '−2秒'),
        h('button.btn.sm', { onclick: () => mine.seek(mine.time + 2) }, '+2秒')),
      nowEl),
    h('div.card',
      h('h3', 'コメントを付ける'),
      catRow,
      h('div.row.wrap', h('label', '時刻（秒） ', tInput), h('button.btn.sm', { onclick: () => { tInput.value = mine.time.toFixed(1); timeTouched = false; } }, '現在位置')),
      text,
      h('div.row', addBtn)),
    h('div.card', h('h3', 'コメント一覧'), list),
    h('details.card', h('summary', 'チャンクごとに聞く'), chunkList),
    h('div.card',
      h('h3', '講評と書き出し'),
      h('label.field', h('span.fl', '講師名'), reviewer),
      scores,
      h('label.field', h('span.fl', '全体の講評'), overall),
      h('div.row.wrap',
        h('button.btn.primary', {
          onclick: async () => {
            S.reviewer = reviewer.value.trim(); S.overall = overall.value; await save();
            const { blob, name } = buildReviewResult(S);
            const r = await saveFile(blob, name, { preferShare: true });
            if (r !== 'cancelled') toast('添削結果を書き出しました。学習者に送ってください');
          },
        }, '📤 添削結果を書き出す'),
        h('span.grow'),
        h('button.btn.danger.sm', {
          onclick: async () => {
            if (!(await confirmDialog('このレビューを削除しますか？', '削除'))) return;
            destroyReview();
            await db.del('blobs', S.recBlobId);
            if (S.modelBlobId) await db.del('blobs', S.modelBlobId);
            await db.del('reviews', S.id);
            app.navigate('#/review');
          },
        }, 'レビューを削除')))));
  drawList();
  update();
}

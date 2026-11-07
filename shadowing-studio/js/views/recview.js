// Recordings list and detail (compare, download, delete, export for review, imported reviews).
import { h, fmtTime, fmtDate, toast, saveFile, confirmDialog, pickFile } from '../util.js';
import { getLesson, listLessons, audioDuration } from '../lessons.js';
import {
  listRecordings, deleteRecording, recordingUrl, recordingBlob, recordingFileName, reviewsFor,
  buildReviewRequest, MODE_LABEL, SCORE_KEYS, saveRecording,
} from '../recordings.js';
import { createCompare } from '../compare.js';
import { settings, setSetting } from '../settings.js';

let current = null;
export function destroyRecView() { if (current) { current.destroy(); current = null; } }

export async function recordingsView(root) {
  const recs = await listRecordings();
  const reviewsCount = new Map();
  for (const r of recs) reviewsCount.set(r.id, (await reviewsFor(r.id)).reduce((n, v) => n + v.comments.length, 0));
  const groups = new Map();
  for (const r of recs) {
    if (!groups.has(r.lessonId)) groups.set(r.lessonId, []);
    groups.get(r.lessonId).push(r);
  }
  root.replaceChildren(h('div.page',
    h('h1', '録音'),
    h('p.lead', '練習の録音はこの端末に保存されます。お手本との聞き比べ、ダウンロード、添削依頼の書き出しができます。'),
    h('div.row.wrap', h('button.btn', { onclick: () => importFlow(root) }, '📁 録音ファイルを取り込む')),
    recs.length ? [...groups.entries()].map(([lid, list]) => h('section',
      h('h2', list[0].lessonTitle || lid),
      h('ul.rec-list', list.map(r => h('li',
        h('a.card.rec-card', { href: `#/rec/${r.id}` },
          h('div.t', fmtDate(r.createdAt)),
          h('div.lc-meta',
            h('span.badge', MODE_LABEL[r.mode] || r.mode),
            h('span', `⏱ ${fmtTime(r.duration)}`),
            reviewsCount.get(r.id) ? h('span.badge.c-good', `添削 ${reviewsCount.get(r.id)}件`) : null))))))) : h('p.empty', 'まだ録音はありません。教材の Step 4・5 で録音できます。')));
}

async function importFlow(root) {
  const lessons = await listLessons();
  const sel = h('select', lessons.map(l => h('option', { value: l.id }, `${l.title}（${l.level}）`)));
  const dlg = h('div.modal', h('div.modal-box',
    h('h3', 'どの教材の録音ですか？'),
    sel,
    h('p.small', 'お手本の最初から録音したファイルを想定しています。ずれは聞き比べ画面で補正できます。'),
    h('div.row.end',
      h('button.btn', { onclick: () => dlg.remove() }, 'キャンセル'),
      h('button.btn.primary', {
        onclick: async () => {
          dlg.remove();
          const f = await pickFile('audio/*,video/mp4,.m4a,.mp3,.wav,.aac,.webm');
          if (!f) return;
          const lesson = await getLesson(sel.value);
          const u = URL.createObjectURL(f);
          const duration = await audioDuration(u);
          URL.revokeObjectURL(u);
          const rec = await saveRecording({ lesson, blob: f, mime: f.type || 'audio/mp4', duration, mode: 'import', name: f.name, sync: { modelStart: 0, leadIn: 0, rate: 1, offset: 0 } });
          toast('取り込みました');
          location.hash = `#/rec/${rec.id}`;
        },
      }, 'ファイルを選ぶ'))));
  document.body.append(dlg);
}

export async function recordingDetailView(root, id, app) {
  destroyRecView();
  const recs = await listRecordings();
  const rec = recs.find(r => r.id === id);
  if (!rec) { root.replaceChildren(h('div.page', h('p', '録音が見つかりません。'), h('a.btn', { href: '#/recordings' }, '録音一覧へ'))); return; }
  const lesson = await getLesson(rec.lessonId).catch(() => null);
  const url = await recordingUrl(rec);
  const reviews = await reviewsFor(rec.id);
  const comments = reviews.flatMap(r => r.comments);
  const L = lesson || { id: rec.lessonId, title: rec.lessonTitle, chunks: [], audioUrl: null };
  current = createCompare({
    rec, lesson: L, recUrl: url, comments,
    onPractice: lesson ? chunkId => app.navigate(`#/lesson/${encodeURIComponent(lesson.id)}/5?ab=${chunkId}`) : null,
  });

  const learner = h('input', { value: settings().learnerName || '', placeholder: '名前（任意）' });
  const msg = h('textarea', { rows: 2, placeholder: '講師へのメッセージ（任意）例: 3文目のリズムを見てください' });
  const incModel = h('input', { type: 'checkbox', checked: lesson && lesson.kind === 'user' });
  const exportBtn = h('button.btn.primary', {
    onclick: async () => {
      setSetting('learnerName', learner.value.trim());
      exportBtn.disabled = true;
      try {
        const { blob, name } = await buildReviewRequest(rec, { includeModel: incModel.checked, learnerName: learner.value.trim(), message: msg.value.trim() });
        const r = await saveFile(blob, name, { preferShare: true });
        if (r !== 'cancelled') toast('添削依頼ファイルを書き出しました。講師に送ってください');
      } catch (e) { toast(e.message || String(e)); }
      exportBtn.disabled = false;
    },
  }, '📤 添削依頼ファイルを書き出す');

  root.replaceChildren(h('div.page',
    h('a.back', { href: '#/recordings' }, '‹ 録音一覧'),
    h('h1', L.title),
    h('p.small', `${fmtDate(rec.createdAt)}・${MODE_LABEL[rec.mode] || rec.mode}・${fmtTime(rec.duration)}${rec.sync && rec.sync.rate !== 1 ? `・速度 ${rec.sync.rate}x` : ''}`),
    !lesson ? h('p.warn', 'この録音の教材がこの端末にありません（お手本との聞き比べはできません）。') : null,
    reviews.map(rv => h('div.card.review-sum',
      h('h3', `添削結果${rv.reviewer ? `（${rv.reviewer}）` : ''}`),
      h('p.small', `添削日 ${fmtDate(rv.reviewedAt || rv.importedAt)}・コメント ${rv.comments.length}件`),
      Object.keys(rv.scores || {}).length ? h('div.scores', SCORE_KEYS.filter(([k]) => rv.scores[k]).map(([k, label]) => h('span.score', `${label} ${'★'.repeat(rv.scores[k])}${'☆'.repeat(5 - rv.scores[k])}`))) : null,
      rv.overall ? h('p.overall', rv.overall) : null,
      h('p.hint', '下のチャンク一覧で、コメントの付いた箇所を「▶ 自分」「▶ お手本」で聞き直せます。'))),
    h('div.card', h('h3', '聞き比べ'), current.el),
    h('div.card',
      h('h3', '保存・添削'),
      h('div.row.wrap',
        h('button.btn', { onclick: async () => saveFile(await recordingBlob(rec), recordingFileName(rec), { preferShare: true }) }, '⬇ 録音をダウンロード'),
        lesson ? h('a.btn', { href: `#/lesson/${encodeURIComponent(lesson.id)}/5` }, 'もう一度練習')
          : null),
      h('details', h('summary', '講師に添削を依頼する'),
        h('p.small', '録音と教材情報（英文・チャンクの時刻）を1つのファイルにまとめます。メールやメッセージ、AirDropなどで講師に送り、講師は同じアプリの「添削」→「レビューモード」で開きます。'),
        h('label.field', h('span.fl', 'あなたの名前'), learner),
        h('label.field', h('span.fl', 'メッセージ'), msg),
        h('label.check', incModel, ' お手本音声も含める（自分の教材の場合は必要。サンプル教材は不要）'),
        h('div.row', exportBtn))),
    h('div.row', h('button.btn.danger', {
      onclick: async () => {
        if (!(await confirmDialog('この録音を削除しますか？取り込んだ添削結果も削除されます。', '削除'))) return;
        destroyRecView();
        await deleteRecording(rec.id);
        toast('削除しました');
        app.navigate('#/recordings');
      },
    }, '🗑 録音を削除'))));
}

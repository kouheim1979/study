// Recordings, review requests (learner -> reviewer) and review results (reviewer -> learner).
import { db } from './db.js';
import { uid, blobToBase64, base64ToBlob, extForMime, safeName, fmtDate } from './util.js';
import { getLesson, blobUrlById, forgetBlobUrl, normalize } from './lessons.js';

export const CATEGORIES = [
  { k: 'pron', label: '発音', color: 'c-pron' },
  { k: 'change', label: '音声変化', color: 'c-change' },
  { k: 'rhythm', label: 'リズム', color: 'c-rhythm' },
  { k: 'into', label: 'イントネーション', color: 'c-into' },
  { k: 'good', label: 'よかった点', color: 'c-good' },
  { k: 'other', label: 'その他', color: 'c-other' },
];
export const catLabel = k => (CATEGORIES.find(c => c.k === k) || CATEGORIES[5]).label;
export const SCORE_KEYS = [['pron', '発音'], ['change', '音声変化'], ['rhythm', 'リズム']];
export const MODE_LABEL = { shadow: 'シャドーイング', repeat: 'リピーティング', import: '取り込み', review: '添削用' };

const REQ = 'shadowing-studio/review-request';
const RES = 'shadowing-studio/review-result';

export async function saveRecording({ lesson, blob, mime, duration, mode, sync = null, marks = null, from = 0, to = null, name = '' }) {
  const blobId = uid('b-');
  await db.put('blobs', { id: blobId, blob, mime, name });
  const rec = {
    id: uid('r-'), lessonId: lesson.id, lessonTitle: lesson.title, createdAt: Date.now(),
    mode, blobId, mime, duration, sync, marks, from, to, name,
  };
  await db.put('recordings', rec);
  return rec;
}
export async function listRecordings(lessonId) {
  const list = lessonId ? await db.byLesson('recordings', lessonId) : await db.all('recordings');
  return list.sort((a, b) => b.createdAt - a.createdAt);
}
export async function deleteRecording(id) {
  const r = await db.get('recordings', id);
  if (!r) return;
  await db.del('blobs', r.blobId);
  forgetBlobUrl(r.blobId);
  await db.del('recordings', id);
  for (const rv of await db.byLesson('reviews', r.lessonId)) {
    if (rv.kind === 'received' && rv.recordingId === id) await db.del('reviews', rv.id);
  }
}
export async function recordingBlob(rec) {
  const b = await db.get('blobs', rec.blobId);
  return b ? b.blob : null;
}
export const recordingUrl = rec => blobUrlById(rec.blobId);
export function recordingFileName(rec) {
  const d = new Date(rec.createdAt);
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `${safeName(rec.lessonTitle)}_${stamp}.${extForMime(rec.mime)}`;
}

// ---- time mapping between the recording and the model audio ----

/** Window [s, e] in recording time where the learner says this chunk. */
export function chunkWindow(rec, chunk) {
  if (rec.marks && rec.marks.length) {
    const ms = rec.marks.filter(m => m.chunkId === chunk.id);
    if (ms.length) { const m = ms[ms.length - 1]; return [m.s, m.e]; }
    return null;
  }
  const sync = rec.sync || { modelStart: 0, leadIn: 0, rate: 1 };
  const off = (sync.leadIn || 0) + (sync.offset || 0);
  const r = sync.rate || 1;
  const s = off + (chunk.start - sync.modelStart) / r;
  const e = off + (chunk.end - sync.modelStart) / r;
  if (e <= 0 || (rec.duration && s >= rec.duration + 0.5)) return null;
  return [Math.max(0, s), rec.duration ? Math.min(rec.duration, e) : e];
}
export function recToModel(rec, t) {
  if (rec.marks && rec.marks.length) return null;
  const s = rec.sync || { modelStart: 0, leadIn: 0, rate: 1 };
  return s.modelStart + (t - (s.leadIn || 0) - (s.offset || 0)) * (s.rate || 1);
}
export function modelToRec(rec, t) {
  if (rec.marks && rec.marks.length) return null;
  const s = rec.sync || { modelStart: 0, leadIn: 0, rate: 1 };
  return (s.leadIn || 0) + (s.offset || 0) + (t - s.modelStart) / (s.rate || 1);
}
export function chunkAtRec(rec, lesson, t) {
  for (const c of lesson.chunks) {
    const w = chunkWindow(rec, c);
    if (w && t >= w[0] && t < w[1]) return c;
  }
  return null;
}

// ---- review request (learner -> reviewer) ----

export async function buildReviewRequest(rec, { includeModel = false, learnerName = '', message = '' } = {}) {
  const lesson = await getLesson(rec.lessonId);
  const blob = await recordingBlob(rec);
  if (!blob) throw new Error('録音データが見つかりません');
  let model = null;
  if (includeModel && lesson && lesson.audioUrl) {
    const mb = await (await fetch(lesson.audioUrl)).blob();
    model = { mime: mb.type || 'audio/mpeg', data: await blobToBase64(mb) };
  }
  const L = lesson || { id: rec.lessonId, title: rec.lessonTitle, chunks: [] };
  const payload = {
    format: REQ, version: 1, createdAt: Date.now(), learnerName, message,
    lesson: {
      id: L.id, title: L.title, titleJa: L.titleJa || '', level: L.level || '', theme: L.theme || '',
      kind: L.kind || (String(L.id).startsWith('u-') ? 'user' : 'sample'), duration: L.duration || 0,
      source: L.source || null,
      chunks: L.chunks.map(c => ({ id: c.id, start: c.start, end: c.end, en: c.en, ja: c.ja || '', sentence: c.sentence })),
    },
    recording: {
      id: rec.id, createdAt: rec.createdAt, mode: rec.mode, mime: rec.mime, duration: rec.duration,
      sync: rec.sync, marks: rec.marks, from: rec.from, to: rec.to,
      data: await blobToBase64(blob),
    },
    model,
  };
  const name = `添削依頼_${safeName(L.title)}_${fmtDate(rec.createdAt).replace(/[/: ]/g, '')}.json`;
  return { blob: new Blob([JSON.stringify(payload)], { type: 'application/json' }), name };
}

/** Reviewer opens a request file -> creates an 'authored' review session. */
export async function openReviewRequest(text) {
  const p = JSON.parse(text);
  if (p.format !== REQ) throw new Error('添削依頼ファイルではありません');
  const existing = (await db.all('reviews')).find(r => r.kind === 'authored' && r.recordingId === p.recording.id);
  if (existing) return existing;
  const recBlobId = uid('b-');
  await db.put('blobs', { id: recBlobId, blob: base64ToBlob(p.recording.data, p.recording.mime), mime: p.recording.mime });
  let modelBlobId = null;
  if (p.model && p.model.data) {
    modelBlobId = uid('b-');
    await db.put('blobs', { id: modelBlobId, blob: base64ToBlob(p.model.data, p.model.mime), mime: p.model.mime });
  }
  const rec = { ...p.recording }; delete rec.data;
  const session = {
    id: uid('v-'), kind: 'authored', lessonId: p.lesson.id, recordingId: rec.id, lesson: p.lesson,
    recording: rec, recBlobId, modelBlobId, learnerName: p.learnerName || '', message: p.message || '',
    comments: [], overall: '', scores: {}, reviewer: '', createdAt: Date.now(), updatedAt: Date.now(),
  };
  await db.put('reviews', session);
  return session;
}

export function buildReviewResult(session) {
  const payload = {
    format: RES, version: 1, createdAt: Date.now(), reviewer: session.reviewer || '',
    lessonId: session.lessonId, lessonTitle: session.lesson.title, recordingId: session.recordingId,
    recordingCreatedAt: session.recording.createdAt,
    overall: session.overall || '', scores: session.scores || {},
    comments: [...session.comments].sort((a, b) => a.t - b.t),
  };
  const name = `添削結果_${safeName(session.lesson.title)}_${fmtDate(Date.now()).replace(/[/: ]/g, '')}.json`;
  return { blob: new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }), name };
}

/** Learner imports a result file. Returns {review, rec}. */
export async function importReviewResult(text) {
  const p = JSON.parse(text);
  if (p.format !== RES) throw new Error('添削結果ファイルではありません');
  const rec = await db.get('recordings', p.recordingId);
  if (!rec) throw new Error('対応する録音がこの端末に見つかりません（録音を削除したか、別の端末で書き出した可能性があります）');
  const review = {
    id: uid('rv-'), kind: 'received', lessonId: p.lessonId, recordingId: p.recordingId,
    reviewer: p.reviewer, overall: p.overall, scores: p.scores || {}, comments: p.comments || [],
    reviewedAt: p.createdAt, importedAt: Date.now(),
  };
  await db.put('reviews', review);
  return { review, rec };
}

export async function reviewsFor(recordingId) {
  return (await db.all('reviews')).filter(r => r.kind === 'received' && r.recordingId === recordingId)
    .sort((a, b) => b.importedAt - a.importedAt);
}

/** A lesson-like object for a review session (works even if the lesson isn't on this device). */
export async function lessonForSession(session) {
  const local = await getLesson(session.lessonId).catch(() => null);
  if (local) return local;
  const l = normalize({ ...session.lesson, sentences: null });
  l.audioUrl = session.modelBlobId ? await blobUrlById(session.modelBlobId) : null;
  return l;
}

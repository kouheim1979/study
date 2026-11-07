// Lesson catalog: bundled samples (fetched) + user lessons (IndexedDB).
import { db } from './db.js';
import { uid } from './util.js';

let sampleIndex = null;
const sampleCache = new Map();
const urlCache = new Map(); // blobId -> object URL

// Cache-bust revised MP3s without deleting the learner's IndexedDB recordings.
// The old service worker cached these same filenames with the previous voice.
export const SAMPLE_ASSET_VERSION = 'kokoro-native-v3';
const sampleUrl = path => `${path}${path.includes('?') ? '&' : '?'}v=${SAMPLE_ASSET_VERSION}`;

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'その他'];

export async function loadSampleIndex() {
  if (!sampleIndex) {
    const r = await fetch(sampleUrl('samples/index.json'));
    if (!r.ok) throw new Error('サンプル一覧を読み込めませんでした');
    sampleIndex = (await r.json()).lessons.map(l => ({ ...l, kind: 'sample' }));
  }
  return sampleIndex;
}

export async function listLessons() {
  const samples = await loadSampleIndex().catch(() => []);
  const users = (await db.all('lessons')).map(l => ({
    id: l.id, title: l.title, titleJa: l.titleJa || '', level: l.level, theme: l.theme,
    description: l.description || '', duration: l.duration, chunkCount: l.chunks.length,
    text: l.chunks.map(c => c.en).join(' '), kind: 'user', createdAt: l.createdAt,
  }));
  return [...samples, ...users];
}

export function blobUrl(blobId, blob) {
  if (urlCache.has(blobId)) return urlCache.get(blobId);
  const u = URL.createObjectURL(blob);
  urlCache.set(blobId, u);
  return u;
}
export async function blobUrlById(blobId) {
  if (urlCache.has(blobId)) return urlCache.get(blobId);
  const b = await db.get('blobs', blobId);
  return b ? blobUrl(blobId, b.blob) : null;
}
export function forgetBlobUrl(blobId) {
  const u = urlCache.get(blobId);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(blobId);
}

/** Returns a full lesson with `audioUrl` (and `wordsAudioUrl` for samples). */
export async function getLesson(id) {
  if (id.startsWith('u-')) {
    const l = await db.get('lessons', id);
    if (!l) return null;
    const audioUrl = l.audioBlobId ? await blobUrlById(l.audioBlobId) : null;
    return normalize({ ...l, audioUrl, kind: 'user' });
  }
  if (sampleCache.has(id)) return sampleCache.get(id);
  const idx = await loadSampleIndex();
  const meta = idx.find(l => l.id === id);
  if (!meta) return null;
  const r = await fetch(sampleUrl(meta.file));
  const l = await r.json();
  const full = normalize({ ...l, audioUrl: sampleUrl(l.audio), wordsAudioUrl: sampleUrl(l.wordsAudio), kind: 'sample' });
  sampleCache.set(id, full);
  return full;
}

/** Ensure sentences exist (user lessons may only have chunks). */
export function normalize(l) {
  l.chunks = (l.chunks || []).map((c, i) => ({ id: c.id || `c${i + 1}`, sentence: c.sentence ?? 0, note: '', ja: '', ...c }));
  if (!l.sentences || !l.sentences.length) {
    const groups = new Map();
    for (const c of l.chunks) {
      if (!groups.has(c.sentence)) groups.set(c.sentence, []);
      groups.get(c.sentence).push(c);
    }
    const sj = l.sentenceJa || {};
    l.sentences = [...groups.entries()].map(([k, cs]) => ({
      en: cs.map(c => c.en).join(' '),
      ja: sj[k] || cs.map(c => c.ja).filter(Boolean).join('／'),
      chunkIds: cs.map(c => c.id),
    }));
  }
  l.words = l.words || [];
  l.quiz = l.quiz || [];
  return l;
}

export function chunkAt(lesson, t) {
  const cs = lesson.chunks;
  for (let i = 0; i < cs.length; i++) {
    if (t >= cs[i].start && t < cs[i].end) return cs[i];
  }
  return null;
}

// ---------- user lessons ----------

/** Split pasted English into sentences / chunks. mode: 'line' | 'sentence' | 'phrase' */
export function splitText(text, mode) {
  const lines = text.replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
  if (mode === 'line') return lines.map((l, i) => ({ en: l, sentence: i }));
  const joined = lines.join(' ').replace(/\s+/g, ' ');
  const sentences = joined.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)?.map(s => s.trim()).filter(Boolean) || [];
  const out = [];
  sentences.forEach((s, si) => {
    if (mode === 'sentence') { out.push({ en: s, sentence: si }); return; }
    // phrase: split after commas / semicolons, and long runs before common connectors
    let parts = s.split(/(?<=[,;:])\s+/);
    parts = parts.flatMap(p => splitLong(p));
    parts.forEach(p => out.push({ en: p, sentence: si }));
  });
  return out;
}
function splitLong(p) {
  const words = p.split(' ');
  if (words.length <= 7) return [p];
  const connectors = /^(and|but|or|so|because|when|that|which|who|if|to|with|for|before|after|while|than)$/i;
  for (let i = 3; i < words.length - 2; i++) {
    if (connectors.test(words[i])) {
      return [words.slice(0, i).join(' '), ...splitLong(words.slice(i).join(' '))];
    }
  }
  return [p];
}

/** Rough initial timings: proportional to text length, leaving small gaps. */
export function estimateTimings(chunks, duration, lead = 0.3) {
  const weights = chunks.map(c => c.en.replace(/[^a-z0-9]/gi, '').length + 4);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const usable = Math.max(0.5, duration - lead - 0.3);
  let t = lead;
  return chunks.map((c, i) => {
    const d = usable * weights[i] / total;
    const out = { ...c, start: round(t), end: round(t + d) };
    t += d;
    return out;
  });
}
const round = x => Math.round(x * 1000) / 1000;

export function parseWords(text) {
  return text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [w, ja = '', tip = ''] = l.split(/\s*[|｜\t]\s*|\s+[=＝:：]\s+/);
    return { w: w.trim(), ja: ja.trim(), tip: tip.trim(), ipa: '', pos: '' };
  }).filter(w => w.w);
}

export async function saveUserLesson(lesson, audioFile) {
  const now = Date.now();
  const l = { ...lesson };
  delete l.audioUrl; delete l.kind; delete l.wordsAudioUrl;
  if (!l.id) l.id = uid('u-');
  if (!l.createdAt) l.createdAt = now;
  l.updatedAt = now;
  if (audioFile) {
    if (l.audioBlobId) { await db.del('blobs', l.audioBlobId); forgetBlobUrl(l.audioBlobId); }
    l.audioBlobId = uid('b-');
    await db.put('blobs', { id: l.audioBlobId, blob: audioFile, mime: audioFile.type, name: audioFile.name || '' });
  }
  await db.put('lessons', l);
  return l;
}

export async function deleteUserLesson(id) {
  const l = await db.get('lessons', id);
  if (!l) return;
  if (l.audioBlobId) { await db.del('blobs', l.audioBlobId); forgetBlobUrl(l.audioBlobId); }
  await db.del('lessons', id);
}

export function audioDuration(url) {
  return new Promise(res => {
    const a = new Audio();
    a.preload = 'metadata';
    const done = v => { a.src = ''; res(v); };
    a.onloadedmetadata = () => {
      if (isFinite(a.duration)) return done(a.duration);
      // some webm files report Infinity until seeked
      a.currentTime = 1e7;
      a.ontimeupdate = () => { a.ontimeupdate = null; done(isFinite(a.duration) ? a.duration : 0); };
    };
    a.onerror = () => done(0);
    a.src = url;
  });
}

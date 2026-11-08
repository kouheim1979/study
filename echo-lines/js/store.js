// Lessons, progress, recordings, settings and backup — all on this device (IndexedDB + localStorage).
import { db, STORES } from './db.js';
import { uid, todayKey, blobToBase64, base64ToBlob } from './util.js';
import { buildLesson } from './analyze.js';

// ---------- built-in example texts (original, CC BY 4.0) ----------
export const EXAMPLES = [
  {
    id: 'ex-coffee', theme: '日常', title: 'A Coffee Break',
    text: `Every afternoon at three, I take a short coffee break. I leave my desk and walk to a small cafe near the office. The owner knows me, so she starts making my latte when I open the door. I sit by the window and look at the people outside. After ten minutes, I feel relaxed and ready to work again.`,
    ja: `毎日午後3時に、少しコーヒー休憩をとります。\n机を離れて、会社の近くの小さなカフェまで歩きます。\n店主は私のことを知っているので、ドアを開けるとラテを作り始めてくれます。\n窓際に座って、外の人たちを眺めます。\n10分たつと、リラックスしてまた仕事に戻る気持ちになります。`,
  },
  {
    id: 'ex-rain', theme: '旅行', title: 'Rain on Holiday',
    text: `We planned to go hiking on the second day of our trip, but it rained all morning. At first, we were a little disappointed. Then our host told us about a quiet museum in the old town. It was full of beautiful paintings, and we didn't have to wait in line. In the end, the rainy day was one of the best parts of our holiday.`,
    ja: `旅行の2日目にハイキングに行く予定でしたが、午前中ずっと雨でした。\n最初は少しがっかりしました。\nすると、宿の人が旧市街にある静かな美術館のことを教えてくれました。\n美しい絵がたくさんあり、列に並ぶ必要もありませんでした。\n結局、雨の日は旅行で一番よかった時間の一つになりました。`,
  },
  {
    id: 'ex-online', theme: '仕事', title: 'Online Meetings',
    text: `Online meetings are convenient, but they can also be tiring. It's hard to read people's faces on a small screen, so we often talk at the same time. To make meetings better, our team decided to share the agenda the day before. We also turn on our cameras only when it's really necessary. Now our meetings are shorter, and everyone gets a chance to speak.`,
    ja: `オンライン会議は便利ですが、疲れることもあります。\n小さな画面では表情が読み取りにくいので、よく同時に話してしまいます。\n会議を良くするため、私たちのチームは前日に議題を共有することにしました。\nまた、本当に必要なときだけカメラをオンにします。\n今では会議が短くなり、全員が発言できるようになりました。`,
  },
];

function exampleLesson(e) {
  return { ...buildLesson({ text: e.text, ja: e.ja, title: e.title, theme: e.theme }), id: e.id, example: true, createdAt: 0 };
}

export async function listLessons() {
  const mine = (await db.all('lessons')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return [...mine, ...EXAMPLES.map(exampleLesson)];
}
export async function getLesson(id) {
  const e = EXAMPLES.find(x => x.id === id);
  if (e) return exampleLesson(e);
  return db.get('lessons', id);
}
export async function saveLesson(lesson) {
  const now = Date.now();
  const l = { ...lesson, id: lesson.id && !lesson.example ? lesson.id : uid('t-'), updatedAt: now, createdAt: lesson.createdAt || now };
  delete l.example;
  await db.put('lessons', l);
  return l;
}
export const deleteLesson = id => db.del('lessons', id);

// ---------- progress ----------
let queue = Promise.resolve();
const serial = task => { const run = queue.then(task); queue = run.catch(() => {}); return run; };
const blank = id => ({ lessonId: id, favorite: false, totalSec: 0, steps: {}, completions: [], lastStep: 1, lastChunk: 0, ratings: {}, updatedAt: 0 });
export async function getProgress(id) { return { ...blank(id), ...(await db.get('progress', id) || {}) }; }
export async function allProgress() {
  const m = new Map();
  for (const p of await db.all('progress')) m.set(p.lessonId, { ...blank(p.lessonId), ...p });
  return m;
}
export function updateProgress(id, fn) {
  return serial(async () => {
    const p = await getProgress(id);
    const n = fn(p) || p;
    n.updatedAt = Date.now();
    await db.put('progress', n);
    return n;
  });
}
export async function addStudyTime(id, sec) {
  if (sec <= 0) return;
  await updateProgress(id, p => { p.totalSec += sec; });
  await serial(async () => {
    const d = await db.kvGet('daily', {});
    d[todayKey()] = (d[todayKey()] || 0) + sec;
    await db.kvSet('daily', d);
  });
}
export const setResume = (lessonId, step, chunk) => serial(() => db.kvSet('last', { lessonId, step, chunk, at: Date.now() }));
export const getResume = () => db.kvGet('last', null);
export const getDaily = () => db.kvGet('daily', {});

// ---------- recordings ----------
export async function saveRecording({ lesson, blob, mime, duration, mode, marks = [], name = '' }) {
  const blobId = uid('b-');
  await db.put('blobs', { id: blobId, blob, mime, name });
  const rec = { id: uid('r-'), lessonId: lesson.id, lessonTitle: lesson.title, createdAt: Date.now(), mode, blobId, mime, duration, marks };
  await db.put('recordings', rec);
  return rec;
}
export async function listRecordings(lessonId) {
  const l = lessonId ? await db.byLesson('recordings', lessonId) : await db.all('recordings');
  return l.sort((a, b) => b.createdAt - a.createdAt);
}
export async function recordingBlob(rec) { const b = await db.get('blobs', rec.blobId); return b ? b.blob : null; }
export async function deleteRecording(id) {
  const r = await db.get('recordings', id);
  if (!r) return;
  await db.del('blobs', r.blobId);
  await db.del('recordings', id);
}

// ---------- settings ----------
const SKEY = 'echo-lines:settings';
const defaults = { rate: 0.9, voiceURI: '', showEn: true, showJa: true, showNote: true, gap: 1.5, repeat: 1, chunkWords: 6 };
let cache;
export function settings() {
  if (!cache) { try { cache = { ...defaults, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch (_) { cache = { ...defaults }; } }
  return cache;
}
export function setSetting(k, v) { settings()[k] = v; try { localStorage.setItem(SKEY, JSON.stringify(cache)); } catch (_) { /* */ } }
function replaceSettings(o) { cache = { ...defaults, ...(o || {}) }; try { localStorage.setItem(SKEY, JSON.stringify(cache)); } catch (_) { /* */ } }

// ---------- backup ----------
const FORMAT = 'echo-lines/backup';
export async function exportBackup() {
  const data = {};
  for (const s of STORES) {
    const rows = await db.all(s);
    if (s === 'blobs') {
      data.blobs = [];
      for (const b of rows) data.blobs.push({ id: b.id, mime: b.mime || b.blob.type, name: b.name || '', data: await blobToBase64(b.blob) });
    } else data[s] = rows;
  }
  return new Blob([JSON.stringify({ format: FORMAT, version: 1, exportedAt: Date.now(), settings: settings(), data })], { type: 'application/json' });
}
export async function restoreBackup(text) {
  const p = JSON.parse(text);
  if (p.format !== FORMAT) throw new Error('Echo Lines のバックアップファイルではありません');
  for (const s of STORES) await db.clear(s);
  for (const s of STORES) {
    for (const row of p.data[s] || []) {
      if (s === 'blobs') await db.put('blobs', { id: row.id, mime: row.mime, name: row.name, blob: base64ToBlob(row.data, row.mime) });
      else await db.put(s, row);
    }
  }
  replaceSettings(p.settings);
}
export async function wipeAll() {
  for (const s of STORES) await db.clear(s);
  try { localStorage.removeItem(SKEY); } catch (_) { /* */ }
  replaceSettings({});
}

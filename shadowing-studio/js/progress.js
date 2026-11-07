// Study progress, favorites, study time, completion history, resume point.
import { db } from './db.js';
import { todayKey } from './util.js';

export const STEPS = [
  { n: 1, key: 'listen', label: '聞く', title: '初回リスニング', icon: '👂' },
  { n: 2, key: 'words', label: '単語', title: '単語の意味と発音', icon: '🔤' },
  { n: 3, key: 'chunks', label: '意味', title: 'チャンクごとの意味理解', icon: '🧩' },
  { n: 4, key: 'repeat', label: 'リピート', title: 'リピーティング', icon: '🔁' },
  { n: 5, key: 'shadow', label: 'シャドー', title: 'シャドーイング', icon: '🗣️' },
  { n: 6, key: 'check', label: '確認', title: '和訳と理解度の確認', icon: '✅' },
];

const blank = lessonId => ({ lessonId, favorite: false, totalSec: 0, steps: {}, completions: [], lastStep: 1, lastPos: 0, updatedAt: 0, ratings: {} });

export async function getProgress(lessonId) {
  return { ...blank(lessonId), ...(await db.get('progress', lessonId) || {}) };
}
export async function allProgress() {
  const map = new Map();
  for (const p of await db.all('progress')) map.set(p.lessonId, { ...blank(p.lessonId), ...p });
  return map;
}
// Read-modify-write updates are serialized so concurrent saves never overwrite each other.
let queue = Promise.resolve();
function serial(task) {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}
export function updateProgress(lessonId, fn) {
  return serial(async () => {
    const p = await getProgress(lessonId);
    const next = fn(p) || p;
    next.updatedAt = Date.now();
    await db.put('progress', next);
    return next;
  });
}
export const toggleFavorite = id => updateProgress(id, p => { p.favorite = !p.favorite; });
export const markStep = (id, n) => updateProgress(id, p => { p.steps[n] = Date.now(); });

export async function addStudyTime(lessonId, sec) {
  if (sec <= 0) return;
  await updateProgress(lessonId, p => { p.totalSec += sec; });
  await serial(async () => {
    const daily = await db.kvGet('daily', {});
    const k = todayKey();
    daily[k] = (daily[k] || 0) + sec;
    await db.kvSet('daily', daily);
  });
}

export async function addCompletion(lessonId, entry) {
  return updateProgress(lessonId, p => {
    p.completions.push({ at: Date.now(), ...entry });
    p.steps[6] = Date.now();
  });
}

export async function setResume(lessonId, step, pos) {
  await db.kvSet('last', { lessonId, step, pos, at: Date.now() });
  await updateProgress(lessonId, p => { p.lastStep = step; p.lastPos = pos; });
}
export const getResume = () => db.kvGet('last', null);
export const getDaily = () => db.kvGet('daily', {});

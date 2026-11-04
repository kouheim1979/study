import { getHistory, getMistakes, getSessions } from '../storage.js';

export function calculateOverallStats() {
  const history = getHistory();
  const correct = history.filter((x) => x.isCorrect).length;
  return {
    total: history.length,
    correct,
    rate: history.length ? Math.round((correct / history.length) * 100) : 0,
    mistakes: getMistakes().length
  };
}

export function calculatePartStats() {
  const history = getHistory();
  return [1, 2, 3, 4, 5, 6, 7].map((part) => {
    const rows = history.filter((x) => x.part === part);
    const correct = rows.filter((x) => x.isCorrect).length;
    return {
      part,
      total: rows.length,
      correct,
      rate: rows.length ? Math.round((correct / rows.length) * 100) : 0
    };
  });
}

export function calculateTagStats() {
  const map = {};
  getHistory().forEach((row) => {
    (row.tags || []).forEach((tag) => {
      map[tag] = map[tag] || { tag, total: 0, correct: 0 };
      map[tag].total += 1;
      if (row.isCorrect) map[tag].correct += 1;
    });
  });
  return Object.values(map)
    .map((x) => ({ ...x, rate: x.total ? Math.round((x.correct / x.total) * 100) : 0 }))
    .sort((a, b) => a.rate - b.rate);
}

export function calculateDifficultyStats() {
  return ['easy', 'medium', 'hard', 'unknown'].map((difficulty) => {
    const rows = getHistory().filter((x) => x.difficulty === difficulty);
    const correct = rows.filter((x) => x.isCorrect).length;
    return {
      difficulty,
      total: rows.length,
      correct,
      rate: rows.length ? Math.round((correct / rows.length) * 100) : 0
    };
  });
}

export function calculateSessionStats() {
  const sessions = getSessions();
  const totalSec = sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
  return {
    completed: sessions.filter((x) => x.status === 'completed'),
    abandoned: sessions.filter((x) => x.status === 'abandoned'),
    recent: sessions.slice(0, 10),
    totalSec,
    avgSec: sessions.length ? Math.round(totalSec / sessions.length) : 0
  };
}

export function getUnfinishedQuestionsFromSessions() {
  const out = [];
  getSessions()
    .filter((s) => s.status === 'abandoned')
    .forEach((s) => (s.unfinishedQuestionIds || []).forEach((id) => out.push({ sessionId: s.sessionId, questionId: id })));
  return out;
}

export function isTodayLocal(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export function calculateTodaySummary() {
  const history = getHistory().filter((x) => isTodayLocal(x.answeredAt));
  const sessions = getSessions().filter((x) => isTodayLocal(x.startedAt));
  const correct = history.filter((x) => x.isCorrect).length;
  return {
    answers: history.length,
    correct,
    rate: history.length ? Math.round((correct / history.length) * 100) : 0,
    timeSec: sessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0)
  };
}

export function getRecommendedAction() {
  const ov = calculateOverallStats();
  const partStats = calculatePartStats();
  const p5 = partStats.find((x) => x.part === 5);
  const listeningRows = partStats.filter((x) => x.part >= 1 && x.part <= 4);
  const listeningAttempts = listeningRows.reduce((sum, x) => sum + x.total, 0);
  const listeningCorrect = listeningRows.reduce((sum, x) => sum + x.correct, 0);
  const listeningRate = listeningAttempts ? Math.round((listeningCorrect / listeningAttempts) * 100) : 0;
  const ss = calculateSessionStats();

  if (ov.total === 0) return 'まずは「全部モード」で実力チェックしてみましょう。';
  if (ov.mistakes > 0) return '苦手問題が残っています。まずは「苦手復習」がおすすめです。';
  if (p5 && p5.total >= 3 && p5.rate < 70) return 'Part 5の文法・語彙問題を重点的に練習しましょう。';
  if (listeningAttempts >= 3 && listeningRate < 70) return 'Listening（Part 1〜4）を重点的に練習しましょう。';
  if (ss.abandoned.length > ss.completed.length) return '途中終了が多めです。短めのPart別演習から始めましょう。';
  if (ov.rate >= 80) return '良いペースです。全部モードで総合力を確認しましょう。';
  return 'ランダム演習で弱点の偏りをチェックしましょう。';
}

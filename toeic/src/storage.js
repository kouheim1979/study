import {
  HISTORY_KEY,
  MISTAKES_KEY,
  SETTINGS_KEY,
  SESSIONS_KEY,
  DEFAULT_SETTINGS
} from './constants.js';
import { getQuestionById } from './questions/index.js';

export function safeParse(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (_) {
    return defaultValue;
  }
}

export function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

export function normalizeHistory(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const q = getQuestionById(r && r.questionId) || null;
    return {
      questionId: String((r && r.questionId) || 'unknown'),
      part: (r && typeof r.part === 'number') ? r.part : (q ? q.part : null),
      selectedIndex: (r && Number.isInteger(r.selectedIndex)) ? r.selectedIndex : null,
      correctIndex: (r && Number.isInteger(r.correctIndex)) ? r.correctIndex : null,
      isCorrect: Boolean(r && r.isCorrect),
      answeredAt: (r && r.answeredAt) ? String(r.answeredAt) : new Date().toISOString(),
      difficulty: (r && r.difficulty) || ((q && q.difficulty) || 'unknown'),
      tags: Array.isArray(r && r.tags) ? r.tags : ((q && q.tags) || []),
      mode: (r && r.mode) ? String(r.mode) : 'unknown'
    };
  });
}

export function normalizeSessions(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((s) => {
    const total = Number(s && s.totalQuestions) || 0;
    const ans = Number(s && s.answeredCount) || 0;
    const cor = Number(s && s.correctCount) || 0;
    return {
      sessionId: String((s && s.sessionId) || (`s_${Date.now()}`)),
      mode: String((s && s.mode) || 'unknown'),
      part: ('part' in (s || {})) ? s.part : null,
      startedAt: String((s && s.startedAt) || new Date().toISOString()),
      endedAt: s && s.endedAt ? String(s.endedAt) : null,
      status: String((s && s.status) || 'in_progress'),
      totalQuestions: total,
      answeredCount: ans,
      correctCount: cor,
      wrongCount: Number(s && s.wrongCount) || Math.max(0, ans - cor),
      unansweredCount: Math.max(0, total - ans),
      accuracy: ans ? Math.round((cor / ans) * 100) : 0,
      questionIds: Array.isArray(s && s.questionIds) ? s.questionIds : [],
      answeredQuestionIds: Array.isArray(s && s.answeredQuestionIds) ? s.answeredQuestionIds : [],
      unfinishedQuestionIds: Array.isArray(s && s.unfinishedQuestionIds) ? s.unfinishedQuestionIds : [],
      durationSeconds: Number(s && s.durationSeconds) || 0,
      resultRecords: Array.isArray(s && s.resultRecords) ? s.resultRecords : []
    };
  });
}

export function getHistory() {
  return normalizeHistory(safeParse(HISTORY_KEY, []));
}

export function saveHistory(rows) {
  safeSet(HISTORY_KEY, normalizeHistory(rows));
}

export function getMistakes() {
  const m = safeParse(MISTAKES_KEY, []);
  return Array.isArray(m) ? [...new Set(m.map(String))] : [];
}

export function saveMistakes(rows) {
  safeSet(MISTAKES_KEY, [...new Set((Array.isArray(rows) ? rows : []).map(String))]);
}

export function getSessions() {
  return normalizeSessions(safeParse(SESSIONS_KEY, []));
}

export function saveSessions(rows) {
  safeSet(SESSIONS_KEY, normalizeSessions(rows));
}

export function getSettings() {
  const settings = safeParse(SETTINGS_KEY, {});
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { ...DEFAULT_SETTINGS };
  }
  return { ...DEFAULT_SETTINGS, ...settings };
}

export function saveSettings(settings) {
  safeSet(SETTINGS_KEY, { ...DEFAULT_SETTINGS, ...settings });
}

export function closeStaleSessions() {
  const sessions = getSessions();
  let changed = false;
  const now = new Date().toISOString();
  sessions.forEach((x) => {
    if (x.status === 'in_progress') {
      x.status = 'abandoned';
      if (!x.endedAt) x.endedAt = now;
      const st = Date.parse(x.startedAt) || Date.now();
      const en = Date.parse(x.endedAt) || Date.now();
      x.durationSeconds = Math.max(0, Math.round((en - st) / 1000));
      x.unansweredCount = Math.max(0, x.totalQuestions - x.answeredCount);
      x.accuracy = x.answeredCount ? Math.round((x.correctCount / x.answeredCount) * 100) : 0;
      changed = true;
    }
  });
  if (changed) saveSessions(sessions);
}

import { getHistory, saveHistory, getMistakes, saveMistakes, getSessions, saveSessions } from '../storage.js';

export function createSessionId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function inferSessionPart(mode) {
  if (/^part[1-7]$/.test(mode)) return Number(mode.slice(4));
  if (mode === 'all') return 'all';
  if (mode === 'miniMock') return 'mock';
  return null;
}

export function createSession(mode, questions) {
  const now = new Date().toISOString();
  const questionIds = (Array.isArray(questions) ? questions : []).map((q) => q.id);
  return {
    sessionId: createSessionId(), mode, part: inferSessionPart(mode), startedAt: now, endedAt: null, status: 'in_progress',
    totalQuestions: questionIds.length, answeredCount: 0, correctCount: 0, wrongCount: 0, unansweredCount: questionIds.length, accuracy: 0,
    questionIds, answeredQuestionIds: [], unfinishedQuestionIds: [...questionIds], durationSeconds: 0, resultRecords: []
  };
}

export function saveNewSession(session) {
  if (!session) return session;
  const sessions = getSessions();
  sessions.unshift(session);
  saveSessions(sessions);
  return session;
}

export function updateSessionStore(session) {
  if (!session) return session;
  const sessions = getSessions();
  const index = sessions.findIndex((x) => x.sessionId === session.sessionId);
  if (index >= 0) sessions[index] = session;
  else sessions.unshift(session);
  saveSessions(sessions);
  return session;
}

export function calculateSessionDurationSeconds(session) {
  if (!session || !session.startedAt) return 0;
  const st = Date.parse(session.startedAt);
  if (Number.isNaN(st)) return 0;
  const en = Date.parse(session.endedAt || new Date().toISOString());
  const end = Number.isNaN(en) ? Date.now() : en;
  return Math.max(0, Math.round((end - st) / 1000));
}

export function finalizeSession(session, status) {
  if (!session) return null;
  session.status = status;
  session.endedAt = new Date().toISOString();
  session.unansweredCount = Math.max(0, session.totalQuestions - session.answeredCount);
  session.accuracy = session.answeredCount ? Math.round((session.correctCount / session.answeredCount) * 100) : 0;
  session.durationSeconds = calculateSessionDurationSeconds(session);
  return updateSessionStore(session);
}

export function applyMistakeUpdate(questionId, isCorrect) {
  if (!questionId) return getMistakes();
  const mistakes = new Set(getMistakes().map(String));
  const qid = String(questionId);
  if (isCorrect) mistakes.delete(qid);
  else mistakes.add(qid);
  const updated = [...mistakes];
  saveMistakes(updated);
  return updated;
}

export function saveAnswerResult(question, selectedIndex, isCorrect, mode) {
  if (!question || !question.id) return null;
  const history = getHistory();
  const record = {
    questionId: question.id, part: question.part, selectedIndex, correctIndex: question.answer, isCorrect,
    answeredAt: new Date().toISOString(), difficulty: question.difficulty, tags: question.tags, mode
  };
  history.push(record);
  saveHistory(history);
  applyMistakeUpdate(question.id, isCorrect);
  return record;
}

export function markSessionAnswered(session, question, isCorrect) {
  if (!session || !question || !question.id) return session;
  session.answeredCount += 1;
  if (isCorrect) session.correctCount += 1;
  else session.wrongCount += 1;
  session.answeredQuestionIds = [...new Set([...(session.answeredQuestionIds || []), question.id])];
  session.unfinishedQuestionIds = (session.questionIds || []).filter((id) => !session.answeredQuestionIds.includes(id));
  session.resultRecords = [...(session.resultRecords || []), { questionId: question.id, part: question.part, isCorrect }];
  session.unansweredCount = Math.max(0, session.totalQuestions - session.answeredCount);
  session.accuracy = session.answeredCount ? Math.round((session.correctCount / session.answeredCount) * 100) : 0;
  return updateSessionStore(session);
}

export function recordAnswerToSessionAndHistory(session, question, selectedIndex, isCorrect, mode) {
  const historyRecord = saveAnswerResult(question, selectedIndex, isCorrect, mode);
  const updatedSession = markSessionAnswered(session, question, isCorrect);
  return { historyRecord, session: updatedSession };
}

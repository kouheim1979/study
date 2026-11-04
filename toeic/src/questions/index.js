import { PART1_QUESTIONS } from './part1.js';
import { PART2_QUESTIONS } from './part2.js';
import { PART3_QUESTIONS } from './part3.js';
import { PART4_QUESTIONS } from './part4.js';
import { PART5_QUESTIONS } from './part5.js';
import { PART6_QUESTIONS } from './part6.js';
import { PART7_QUESTIONS } from './part7.js';

export function inferCategory(q) {
  if (q.part === 5) {
    if ((q.tags || []).includes('前置詞')) return 'preposition';
    if ((q.tags || []).includes('接続詞')) return 'conjunction';
    if ((q.tags || []).includes('品詞')) return 'parts-of-speech';
    if ((q.tags || []).includes('語彙')) return 'vocabulary';
    return 'grammar';
  }
  if ((q.tags || []).includes('メール文')) return 'email';
  if ((q.tags || []).includes('お知らせ文')) return 'notice';
  if ((q.tags || []).includes('広告文')) return 'advertisement';
  if ((q.tags || []).includes('スケジュール文')) return 'schedule';
  if ((q.tags || []).includes('業務連絡文') || (q.tags || []).includes('社内連絡文')) return 'business';
  return 'reading';
}

export function normalizeQuestion(q) {
  return {
    ...q,
    category: q.category || inferCategory(q)
  };
}

export const QUESTION_DATA = [
  ...PART1_QUESTIONS,
  ...PART2_QUESTIONS,
  ...PART3_QUESTIONS,
  ...PART4_QUESTIONS,
  ...PART5_QUESTIONS,
  ...PART6_QUESTIONS,
  ...PART7_QUESTIONS
].map(normalizeQuestion);

export const qMap = Object.fromEntries(
  QUESTION_DATA.map((q) => [q.id, q])
);

export function getQuestionById(questionId) {
  return qMap[String(questionId)] || null;
}

export function getQuestionsByPart(part) {
  return QUESTION_DATA.filter((q) => q.part === Number(part));
}

export function getListeningQuestions() {
  return QUESTION_DATA.filter((q) => q.part >= 1 && q.part <= 4);
}

export function getReadingQuestions() {
  return QUESTION_DATA.filter((q) => q.part >= 5 && q.part <= 7);
}

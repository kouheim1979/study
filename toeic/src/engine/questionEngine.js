import {
  QUESTION_DATA,
  getQuestionsByPart as getQuestionsByPartFromData,
  getListeningQuestions as getListeningQuestionsFromData,
  getReadingQuestions as getReadingQuestionsFromData
} from '../questions/index.js';
import { getMistakes } from '../storage.js';
import { shuffle } from '../utils.js';

export function validateQuestion(q) {
  return Boolean(
    q && typeof q === 'object' && typeof q.id === 'string' && typeof q.part === 'number' &&
      typeof q.question === 'string' && Array.isArray(q.choices) && q.choices.length >= 2 &&
      Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length
  );
}

export function getValidQuestions() { return QUESTION_DATA.filter(validateQuestion); }
export function getAllQuestions() { return getValidQuestions(); }
export function getRandomQuestions() { return shuffle(getValidQuestions()); }
export function getQuestionsByPart(part) { return getQuestionsByPartFromData(Number(part)).filter(validateQuestion); }
export function getQuestionsByPartMode(mode) { return getQuestionsByPart(Number(String(mode).replace('part', ''))); }
export function getListeningQuestions() { return getListeningQuestionsFromData().filter(validateQuestion); }
export function getReadingQuestions() { return getReadingQuestionsFromData().filter(validateQuestion); }
export function getMistakeQuestions() {
  const ids = getMistakes();
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const set = new Set(ids.map(String));
  return getValidQuestions().filter((q) => set.has(q.id));
}

function takePart(part, count) { return shuffle(getQuestionsByPart(part)).slice(0, count); }
export function getMiniMockQuestions() {
  return [
    ...takePart(1, 3), ...takePart(2, 4), ...takePart(3, 4), ...takePart(4, 4),
    ...takePart(5, 8), ...takePart(6, 4), ...takePart(7, 4)
  ];
}

export function getQuestionsByMode(mode) {
  switch (mode) {
    case 'part1': case 'part2': case 'part3': case 'part4': case 'part5': case 'part6': case 'part7':
      return getQuestionsByPartMode(mode);
    case 'listening': return shuffle(getListeningQuestions());
    case 'reading': return shuffle(getReadingQuestions());
    case 'random': return getRandomQuestions();
    case 'all': return shuffle(getReadingQuestions());
    case 'mistake': return getMistakeQuestions();
    case 'miniMock': return getMiniMockQuestions();
    default: return [];
  }
}

export function getByMode(mode) { return getQuestionsByMode(mode); }

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepeatUnits, repeatRecordingMarks } from '../js/repeat-units.mjs';

const sample = {
  sentences: [
    { en: 'I get up at six thirty every morning.', ja: '毎朝6時半', chunkIds: ['c1', 'c2', 'c3'] },
    { en: 'First, I open the window and drink a glass of water.', chunkIds: ['c4', 'c5', 'c6'] },
  ],
  chunks: [
    { id: 'c1', start: 0, end: 2, en: 'I get up', ja: '起きる', sentence: 0 },
    { id: 'c2', start: 2, end: 4, en: 'at six thirty', sentence: 0 },
    { id: 'c3', start: 4, end: 6, en: 'every morning.', sentence: 0 },
    { id: 'c4', start: 6.4, end: 9.4, en: 'First,', sentence: 1 },
    { id: 'c5', start: 9.4, end: 16.4, en: 'I open the window', sentence: 1 },
    { id: 'c6', start: 16.4, end: 22.4, en: 'and drink a glass of water.', sentence: 1 },
  ],
};

test('repeating groups the whole short sentence, rather than its meaning chunks', () => {
  const units = buildRepeatUnits(sample);
  assert.equal(units[0].label, '1文目');
  assert.equal(units[0].en, sample.sentences[0].en);
  assert.deepEqual(units[0].chunks.map(c => c.id), ['c1', 'c2', 'c3']);
  assert.equal(units[0].start, 0);
  assert.equal(units[0].end, 6);
});

test('long sentences split at original meaning boundaries only', () => {
  const units = buildRepeatUnits(sample);
  assert.equal(units.length, 3);
  assert.equal(units[1].label, '2文目（1/2）');
  assert.equal(units[2].label, '2文目（2/2）');
  assert.equal(units[1].start, 6.4);
  assert.equal(units[1].end, 16.4);
  assert.equal(units[2].start, 16.4);
  assert.equal(units[2].end, 22.4);
  assert.equal(units[1].en, 'First, I open the window');
});

test('a long atomic chunk is preserved rather than arbitrarily cut mid-word', () => {
  const lesson = {
    sentences: [{ en: 'A sentence.', chunkIds: ['only'] }],
    chunks: [{ id: 'only', en: 'A sentence.', start: 0, end: 16 }],
  };
  const units = buildRepeatUnits(lesson);
  assert.equal(units.length, 1);
  assert.equal(units[0].end, 16);
});

test('recording comparison gets a proportional mark for each source chunk', () => {
  const unit = buildRepeatUnits(sample)[0];
  const marks = repeatRecordingMarks(unit, 11, 20);
  assert.deepEqual(marks.map(m => m.chunkId), ['c1', 'c2', 'c3']);
  assert.deepEqual(marks.map(m => [m.s, m.e]), [[11, 14], [14, 17], [17, 20]]);
  assert.ok(marks.every(m => m.estimated));
});

test('user lessons work with inferred sentence IDs', () => {
  const lesson = {
    sentences: [{ en: 'Hello world' }],
    chunks: [{ id: 'one', sentence: 0, en: 'Hello', start: 0, end: 1 },
             { id: 'two', sentence: 0, en: 'world', start: 1, end: 2 }],
  };
  assert.equal(buildRepeatUnits(lesson).length, 1);
});

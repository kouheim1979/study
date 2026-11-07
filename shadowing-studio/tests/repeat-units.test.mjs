import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepeatUnits, repeatRecordingMarks, MAX_FALLBACK_CLAUSE_SECONDS } from '../js/repeat-units.mjs';

const sample = {
  sentences: [
    { en: 'I get up at six thirty every morning.', ja: '毎朝', chunkIds: ['c1', 'c2', 'c3'] },
    { en: 'First, I open the window and drink a glass of water.', chunkIds: ['c4', 'c5', 'c6'] },
  ],
  chunks: [
    { id: 'c1', start: 0, end: 2, en: 'I get up', sentence: 0 },
    { id: 'c2', start: 2, end: 4, en: 'at six thirty', sentence: 0 },
    { id: 'c3', start: 4, end: 6, en: 'every morning.', sentence: 0 },
    { id: 'c4', start: 6.4, end: 9.4, en: 'First,', sentence: 1 },
    { id: 'c5', start: 9.4, end: 16.4, en: 'I open the window', sentence: 1 },
    { id: 'c6', start: 16.4, end: 22.4, en: 'and drink a glass of water.', sentence: 1 },
  ],
};

test('generated repeat metadata takes precedence over estimated original audio cuts', () => {
  const lesson = {
    ...sample,
    repeatAudioUrl: 'samples/audio/example-repeat.mp3?v=repeat-clauses-v1',
    repeatUnits: [
      { sentenceIndex: 0, part: 1, partCount: 2, chunkIds: ['c1', 'c2'], en: 'I get up at six thirty', start: .12, end: 3.8 },
      { sentenceIndex: 0, part: 2, partCount: 2, chunkIds: ['c3'], en: 'every morning.', start: 4.04, end: 5.5 },
    ],
  };
  const units = buildRepeatUnits(lesson);
  assert.equal(units.length, 2);
  assert.equal(units[0].label, '1文目・節1/2');
  assert.equal(units[0].start, .12);
  assert.equal(units[0].end, 3.8);
  assert.deepEqual(units[0].chunks.map(c => c.id), ['c1', 'c2']);
  assert.equal(units[1].start, 4.04);
});

test('recording marks use source original chunk ratios, not new repeat-track offset', () => {
  const lesson = {
    ...sample,
    repeatAudioUrl: 'samples/audio/repeat.mp3',
    repeatUnits: [{ sentenceIndex: 0, part: 1, partCount: 2, chunkIds: ['c1', 'c2'],
                    en: 'I get up at six thirty', start: 24, end: 26 }],
  };
  const marks = repeatRecordingMarks(buildRepeatUnits(lesson)[0], 10, 18);
  assert.deepEqual(marks.map(m => [m.s, m.e]), [[10, 14], [14, 18]]);
  assert.ok(marks.every(m => m.estimated));
});

test('user-uploaded lessons group near 5 seconds at original chunk boundaries', () => {
  const units = buildRepeatUnits(sample);
  assert.equal(MAX_FALLBACK_CLAUSE_SECONDS, 5.2);
  assert.equal(units.length, 5);
  assert.equal(units[0].en, 'I get up at six thirty');
  assert.equal(units[0].start, 0);
  assert.equal(units[0].end, 4);
  assert.equal(units[1].en, 'every morning.');
});

test('never cut in the middle of an indivisible uploaded chunk', () => {
  const lesson = {
    sentences: [{ en: 'A sentence.', chunkIds: ['only'] }],
    chunks: [{ id: 'only', en: 'A sentence.', start: 0, end: 16 }],
  };
  assert.equal(buildRepeatUnits(lesson).length, 1);
});

test('missing repeat chunk IDs fail loudly rather than silently cutting other text', () => {
  const lesson = {
    ...sample, repeatAudioUrl: 'example.mp3',
    repeatUnits: [{ sentenceIndex: 0, part: 1, partCount: 1,
                    chunkIds: ['missing'], en: 'Incorrect', start: 0, end: 1 }],
  };
  assert.throws(() => buildRepeatUnits(lesson), /unknown chunk ID/);
});

test('user lessons with inferred sentence numbers are still supported', () => {
  const lesson = {
    sentences: [{ en: 'Hello world' }],
    chunks: [{ id: 'one', sentence: 0, en: 'Hello', start: 0, end: 1 },
             { id: 'two', sentence: 0, en: 'world', start: 1, end: 2 }],
  };
  assert.equal(buildRepeatUnits(lesson).length, 1);
});

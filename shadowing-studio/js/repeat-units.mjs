// Group repeating practice into complete sentences, splitting only unusually long ones.
// The existing chunk boundaries remain the safe place to divide long sentences.
// These are audio-time offsets; the player applies playback-rate adjustments.
export const LONG_SENTENCE_SECONDS = 12;

export function buildRepeatUnits(lesson, maxSeconds = LONG_SENTENCE_SECONDS) {
  const chunks = lesson.chunks || [];
  const byId = new Map(chunks.map(c => [c.id, c]));
  const sentences = lesson.sentences || [];
  const result = [];

  for (let si = 0; si < sentences.length; si++) {
    const sent = sentences[si];
    const cs = sent.chunkIds?.length
      ? sent.chunkIds.map(id => byId.get(id)).filter(Boolean)
      : chunks.filter(c => c.sentence === si);
    if (!cs.length) continue;

    // Most sentences are one practice unit. Don't split just because the
    // original author divided the text into learning/meaning chunks.
    const groups = [];
    let group = [];
    for (const c of cs) {
      if (group.length && c.end - group[0].start > maxSeconds) {
        groups.push(group);
        group = [];
      }
      group.push(c);
    }
    if (group.length) groups.push(group);

    groups.forEach((part, pi) => {
      const whole = groups.length === 1;
      result.push({
        sentenceIndex: si,
        part: pi + 1,
        partCount: groups.length,
        label: whole ? `${si + 1}文目` : `${si + 1}文目（${pi + 1}/${groups.length}）`,
        en: whole ? sent.en || part.map(c => c.en).join(' ') : part.map(c => c.en).join(' '),
        ja: whole ? sent.ja || '' : part.map(c => c.ja).filter(Boolean).join('／'),
        start: part[0].start,
        end: part[part.length - 1].end,
        chunks: part,
      });
    });
  }
  return result;
}

/** Approximate which part of a learner's full-sentence repeat covers each
 * phrase. Recording timing cannot be known precisely without alignment.
 * Include chunk IDs so existing compare/review features keep working.
 */
export function repeatRecordingMarks(unit, start, end) {
  const span = Math.max(0.001, unit.end - unit.start);
  const duration = Math.max(0, end - start);
  return unit.chunks.map(c => ({
    chunkId: c.id,
    s: Math.max(0, start + duration * (c.start - unit.start) / span),
    e: Math.max(0, start + duration * (c.end - unit.start) / span),
    estimated: true,
  }));
}

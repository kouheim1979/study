// Step 4 uses curated, independently synthesized clause audio for sample lessons.
// Fallback for user-imported lessons: group existing meaning chunks into ~5s units.
// Never slice the existing sentence audio for bundled sample repeating.
export const MAX_FALLBACK_CLAUSE_SECONDS = 5.2;

function withLabel(unit, chunks) {
  const si = unit.sentenceIndex;
  const part = unit.part;
  const partCount = unit.partCount;
  return {
    ...unit,
    label: partCount > 1 ? `${si + 1}文目・節${part}/${partCount}` : `${si + 1}文目`,
    chunks,
  };
}

export function buildRepeatUnits(lesson, maxSeconds = MAX_FALLBACK_CLAUSE_SECONDS) {
  const chunks = lesson.chunks || [];
  const byId = new Map(chunks.map(c => [c.id, c]));

  // Exact sample-only timing: start/end are sample-accurate offsets measured
  // while concatenating freshly generated clause PCM. No old audio cuts.
  if (lesson.repeatAudioUrl && lesson.repeatUnits?.length) {
    return lesson.repeatUnits.map(unit => {
      const cs = (unit.chunkIds || []).map(id => byId.get(id)).filter(Boolean);
      if (!cs.length || cs.length !== unit.chunkIds.length)
        throw new Error('Repeat lesson contains an unknown chunk ID');
      return withLabel(unit, cs);
    });
  }

  // User-imported lessons don't have purpose-synthesized clause recordings.
  // Retain their uploaded audio and only divide at existing safe chunk edges.
  const result = [];
  for (let si = 0; si < (lesson.sentences || []).length; si++) {
    const sent = lesson.sentences[si];
    const cs = sent.chunkIds?.length
      ? sent.chunkIds.map(id => byId.get(id)).filter(Boolean)
      : chunks.filter(c => c.sentence === si);
    if (!cs.length) continue;
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
    groups.forEach((part, pi) => result.push(withLabel({
      sentenceIndex: si,
      part: pi + 1,
      partCount: groups.length,
      chunkIds: part.map(c => c.id),
      en: groups.length === 1 ? sent.en || part.map(c => c.en).join(' ') : part.map(c => c.en).join(' '),
      ja: groups.length === 1 ? sent.ja || '' : part.map(c => c.ja).filter(Boolean).join('／'),
      start: part[0].start,
      end: part[part.length - 1].end,
    }, part)));
  }
  return result;
}

/** Approximate the learner's speech span for each source chunk in a clause.
 * The recording has no forced phoneme alignment; do not misrepresent these
 * proportional boundaries as exact. Reference track timings remain intact.
 */
export function repeatRecordingMarks(unit, start, end) {
  const first = unit.chunks[0];
  const last = unit.chunks[unit.chunks.length - 1];
  const span = Math.max(.001, last.end - first.start);
  const duration = Math.max(0, end - start);
  return unit.chunks.map(c => ({
    chunkId: c.id,
    s: Math.max(0, start + duration * (c.start - first.start) / span),
    e: Math.max(0, start + duration * (c.end - first.start) / span),
    estimated: true,
  }));
}

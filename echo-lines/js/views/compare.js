// Compare a recording with the spoken model, chunk by chunk.
import { h, $$, fmtTime, toast } from '../util.js';
import { Clip } from '../clip.js';
import { wait } from '../speaker.js';

export function markFor(rec, chunkId) {
  const ms = (rec.marks || []).filter(m => m.chunkId === chunkId);
  return ms.length ? ms[ms.length - 1] : null;
}

/** @returns {{el, destroy}} */
export function createCompare({ rec, url, lesson, speaker }) {
  const clip = new Clip(url, rec.duration);
  let seqTok = null;
  const dur = () => rec.duration || clip.duration || 1;
  const stopAll = () => { if (seqTok) seqTok.cancel = true; seqTok = null; clip.stop(); speaker.stop(); };

  const playBtn = h('button.btn.round.primary', { 'aria-label': '自分の録音を再生', onclick: () => { if (seqTok || !clip.paused) { stopAll(); upd(); return; } speaker.stop(); clip.end = null; if (clip.time >= dur() - 0.05) clip.seek(0); clip.play(); } }, '▶');
  const seek = h('input.seek', { type: 'range', min: 0, max: dur(), step: 0.01, value: 0, 'aria-label': '録音の再生位置' });
  let drag = false;
  seek.addEventListener('input', () => { drag = true; });
  seek.addEventListener('change', () => { drag = false; clip.seek(+seek.value); });
  const tLbl = h('span.time');
  const now = h('div.now-line');

  const chunkAtRec = t => lesson.chunks.find(c => { const m = markFor(rec, c.id); return m && t >= m.s && t < m.e; });
  let last;
  function upd() {
    const playing = !!seqTok || !clip.paused;
    playBtn.textContent = playing ? '⏸' : '▶';
    if (!drag) { seek.max = dur(); seek.value = clip.time; }
    tLbl.textContent = `${fmtTime(clip.time)} / ${fmtTime(dur())}`;
    const c = !clip.paused ? chunkAtRec(clip.time) : null;
    if (!seqTok) now.textContent = c ? c.en : '';
    const id = c ? c.id : null;
    if (id !== last) { last = id; $$('.cmp-row', el).forEach(r => r.classList.toggle('now', r.dataset.id === id)); }
  }
  clip.addEventListener('time', upd);
  clip.addEventListener('state', upd);

  async function seq(items) {
    stopAll();
    const tok = seqTok = { cancel: false };
    upd();
    for (const it of items) {
      if (tok.cancel) break;
      now.textContent = it.label;
      if (it.kind === 'model') await speaker.playChunk(lesson.chunks.indexOf(it.c));
      else await clip.range(it.s, it.e);
      if (tok.cancel) break;
      await wait(300);
    }
    if (seqTok === tok) seqTok = null;
    upd();
  }
  const items = (c, which) => {
    const m = markFor(rec, c.id);
    const out = [];
    if (which !== 'mine') out.push({ kind: 'model', c, label: `お手本: ${c.en}` });
    if (which !== 'model') { if (m) out.push({ kind: 'mine', s: m.s, e: Math.min(dur(), m.e + 0.2), label: `自分: ${c.en}` }); else toast('この録音にはこのチャンクの位置がありません'); }
    return out;
  };

  const rows = lesson.chunks.filter(c => markFor(rec, c.id)).map(c => h('div.cmp-row', { dataset: { id: c.id } },
    h('div.cmp-en', c.en),
    h('div.cmp-btns',
      h('button.btn.sm', { onclick: () => seq(items(c, 'model')) }, '🔊 お手本'),
      h('button.btn.sm', { onclick: () => seq(items(c, 'mine')) }, '🎤 自分'),
      h('button.btn.sm.primary', { onclick: () => seq(items(c)) }, '続けて'))));

  const el = h('section.compare',
    h('div.row', playBtn, seek),
    h('div.row', tLbl, h('span.grow'), h('button.btn.sm', { onclick: () => seq(lesson.chunks.flatMap(c => (markFor(rec, c.id) ? items(c) : []))) }, '全部を交互に（お手本→自分）')),
    now,
    rows.length ? h('div.cmp-list', rows) : h('p.hint', 'チャンクの位置情報がない録音です。上のプレーヤーで聞いてください。'),
    h('p.hint', 'チャンクの位置は読み上げのタイミングから求めた目安です。'));
  upd();
  return { el, destroy() { stopAll(); clip.destroy(); } };
}

// "Model vs my voice" comparison panel. Used after recording, in the recordings tab,
// and with imported review comments.
import { h, $$, fmtTime, toast } from './util.js';
import { Player } from './player.js';
import { chunkWindow, recToModel, modelToRec, chunkAtRec, catLabel, CATEGORIES } from './recordings.js';
import { db } from './db.js';

function once(player, s, e) {
  return new Promise(res => { player._cancel = res; player.playRange(s, e, { onEnd: res }); });
}

/**
 * @param {object} o {rec, lesson, recUrl, comments:[{t,cat,text,chunkId}], onPractice(chunkId)}
 * @returns {{el: HTMLElement, destroy(): void, playComment(c): void, stop(): void}}
 */
export function createCompare({ rec, lesson, recUrl, comments = [], onPractice = null }) {
  const model = new Player();
  const mine = new Player();
  const linear = !(rec.marks && rec.marks.length);
  const rate = (rec.sync && rec.sync.rate) || 1;
  model.setRate(rate);
  if (lesson.audioUrl) model.load(lesson.audioUrl, lesson.duration);
  mine.load(recUrl, rec.duration);
  let source = 'mine';
  let seq = null; // sequence token
  let dragging = false;

  const recDur = () => rec.duration || mine.duration || 1;
  const active = () => (source === 'mine' ? mine : model);
  const stopAll = () => {
    if (seq) seq.cancel = true;
    seq = null;
    for (const p of [model, mine]) {
      p.stop();
      if (p._cancel) { const c = p._cancel; p._cancel = null; c(); }
    }
  };
  const unlockBoth = () => { model.unlock(); mine.unlock(); };

  const playBtn = h('button.btn.round.primary', { 'aria-label': '再生', onclick: () => togglePlay() }, '▶');
  const seek = h('input.seek', { type: 'range', min: 0, max: recDur(), step: 0.01, value: 0, 'aria-label': '再生位置' });
  const timeLbl = h('span.time', '0:00');
  const nowText = h('div.now-chunk', '');
  const segModel = h('button', { type: 'button', onclick: () => switchTo('model'), 'aria-pressed': 'false' }, 'お手本');
  const segMine = h('button', { type: 'button', onclick: () => switchTo('mine'), 'aria-pressed': 'true' }, '自分の声');
  const offLbl = h('span.small', '');
  const showOffset = () => { offLbl.textContent = `ずれ補正 ${((rec.sync && rec.sync.offset) || 0).toFixed(2)}秒`; };

  async function nudge(d) {
    if (!rec.sync) rec.sync = { modelStart: 0, leadIn: 0, rate: 1, offset: 0 };
    rec.sync.offset = Math.round(((rec.sync.offset || 0) + d) * 100) / 100;
    showOffset();
    if (!rec.external) await db.put('recordings', rec).catch(() => {});
  }

  function posRec() {
    if (source === 'mine' || !linear) return mine.time;
    return modelToRec(rec, model.time);
  }

  function setSeg(src) {
    segModel.setAttribute('aria-pressed', String(src === 'model'));
    segMine.setAttribute('aria-pressed', String(src === 'mine'));
  }

  function switchTo(src) {
    unlockBoth();
    if (src === source) return;
    if (src === 'model' && !lesson.audioUrl) { toast('お手本音声がありません'); return; }
    const wasPlaying = !!seq || !active().paused;
    const t = posRec();
    stopAll();
    source = src;
    setSeg(src);
    if (src === 'model') {
      if (linear) {
        model.seek(Math.max(0, recToModel(rec, t)));
        if (wasPlaying) model.play();
      } else {
        const c = chunkAtRec(rec, lesson, t) || lesson.chunks[0];
        if (c) { if (wasPlaying) model.playRange(c.start, c.end); else model.seek(c.start); }
      }
    } else {
      mine.seek(Math.max(0, t || 0));
      if (wasPlaying) mine.play();
    }
    update();
  }

  function togglePlay() {
    unlockBoth();
    if (seq) { stopAll(); update(); return; }
    const p = active();
    if (p.paused) {
      if (source === 'mine' && mine.time >= recDur() - 0.05) mine.seek(0);
      p.play();
    } else p.pause();
  }

  async function playSeq(list) {
    unlockBoth();
    stopAll();
    if (!list.length) return;
    const tok = seq = { cancel: false };
    update();
    for (const [p, s, e, label] of list) {
      if (tok.cancel) break;
      nowText.textContent = label;
      await once(p, s, e);
      p._cancel = null;
      if (tok.cancel) break;
      await new Promise(r => setTimeout(r, 250));
    }
    if (seq === tok) seq = null;
    update();
  }

  function pairFor(c, which = 'both') {
    const w = chunkWindow(rec, c);
    const items = [];
    if (which !== 'mine' && lesson.audioUrl) items.push([model, c.start, c.end, `お手本: ${c.en}`]);
    if (which !== 'model' && w) items.push([mine, w[0], Math.min(recDur(), w[1] + 0.15), `自分: ${c.en}`]);
    if (which === 'mine' && !w) toast('この録音にはこのチャンクが含まれていません');
    return items;
  }

  seek.addEventListener('input', () => { dragging = true; timeLbl.textContent = `${fmtTime(+seek.value)} / ${fmtTime(recDur())}`; });
  seek.addEventListener('change', () => {
    dragging = false;
    const t = +seek.value;
    if (source === 'model' && linear) model.seek(Math.max(0, recToModel(rec, t)));
    else mine.seek(t);
  });

  let lastChunk;
  function update() {
    const playing = !!seq || !active().paused;
    playBtn.textContent = playing ? '⏸' : '▶';
    playBtn.setAttribute('aria-label', playing ? '一時停止' : '再生');
    const t = posRec() || 0;
    if (!dragging) { seek.max = recDur(); seek.value = Math.min(t, recDur()); }
    timeLbl.textContent = `${fmtTime(t)} / ${fmtTime(recDur())}`;
    const c = source === 'model' && !seq
      ? lesson.chunks.find(x => model.time >= x.start && model.time < x.end)
      : chunkAtRec(rec, lesson, mine.time);
    if (!seq) nowText.textContent = c ? c.en : '';
    if (c !== lastChunk) {
      lastChunk = c;
      $$('.cmp-chunk', el).forEach(r => r.classList.toggle('now', !!c && r.dataset.id === c.id));
    }
  }
  for (const p of [model, mine]) { p.addEventListener('time', update); p.addEventListener('state', update); }

  const chunkOf = cm => cm.chunkId || (chunkAtRec(rec, lesson, cm.t) || {}).id;
  const byChunk = new Map();
  for (const cm of comments) {
    const cid = chunkOf(cm);
    if (!byChunk.has(cid)) byChunk.set(cid, []);
    byChunk.get(cid).push(cm);
  }

  function playComment(cm) {
    const c = lesson.chunks.find(x => x.id === chunkOf(cm));
    const w = c ? chunkWindow(rec, c) : null;
    const s = w ? Math.min(w[0], cm.t - 0.3) : cm.t - 1;
    const e = w ? Math.max(w[1], cm.t + 0.8) : cm.t + 2.5;
    source = 'mine';
    setSeg('mine');
    playSeq([[mine, Math.max(0, s), Math.min(recDur(), e), `自分 ${fmtTime(cm.t, 1)}: ${cm.text}`]]);
  }

  function commentItem(cm) {
    const cat = CATEGORIES.find(x => x.k === cm.cat) || CATEGORIES[5];
    const c = lesson.chunks.find(x => x.id === chunkOf(cm));
    return h('li.cmt',
      h('div.cmt-main',
        h('span.tag', { class: cat.color }, catLabel(cm.cat)),
        h('span.cmt-t', fmtTime(cm.t, 1)),
        h('span.cmt-text', cm.text)),
      h('div.cmt-btns',
        h('button.btn.sm', { onclick: () => playComment(cm) }, '▶ 自分'),
        c && lesson.audioUrl ? h('button.btn.sm', { onclick: () => playSeq(pairFor(c, 'model')) }, '▶ お手本') : null,
        onPractice && c ? h('button.btn.sm.primary', { onclick: () => { destroy(); onPractice(c.id); } }, 'この区間を練習') : null));
  }

  const placed = new Set();
  const chunkRows = lesson.chunks.filter(c => chunkWindow(rec, c)).map(c => {
    const cms = byChunk.get(c.id) || [];
    cms.forEach(x => placed.add(x));
    return h('div.cmp-chunk', { dataset: { id: c.id } },
      h('div.cmp-text', h('span.en', c.en), c.ja ? h('span.ja', c.ja) : null),
      h('div.cmp-btns',
        h('button.btn.sm', { onclick: () => playSeq(pairFor(c, 'model')), disabled: !lesson.audioUrl }, 'お手本'),
        h('button.btn.sm', { onclick: () => playSeq(pairFor(c, 'mine')) }, '自分'),
        h('button.btn.sm.primary', { onclick: () => playSeq(pairFor(c)) }, '続けて')),
      cms.length ? h('ul.cmts', cms.map(commentItem)) : null);
  });
  const unplaced = comments.filter(cm => !placed.has(cm));

  const el = h('section.compare',
    h('div.cmp-head',
      h('div.seg', { role: 'group', 'aria-label': '聞く音声' }, segModel, segMine),
      playBtn),
    h('div.cmp-seek', seek, timeLbl),
    nowText,
    linear && lesson.audioUrl ? h('div.row.wrap',
      h('button.btn.sm', { onclick: () => nudge(-0.05) }, '−0.05'),
      offLbl,
      h('button.btn.sm', { onclick: () => nudge(0.05) }, '+0.05'),
      h('span.hint', '切り替えたときに位置がずれる場合に調整')) : null,
    h('div.row', h('button.btn', {
      onclick: () => playSeq(lesson.chunks.flatMap(c => (chunkWindow(rec, c) ? pairFor(c) : []))),
    }, '全チャンクを交互に再生（お手本→自分）')),
    unplaced.length ? h('div.cmp-other', h('h4', 'コメント'), h('ul.cmts', unplaced.map(commentItem))) : null,
    h('div.cmp-list', chunkRows.length ? chunkRows : h('p.hint', 'チャンクの位置を特定できませんでした。上のプレーヤーで聞き比べてください。')));
  showOffset();
  update();

  function destroy() { stopAll(); model.destroy(); mine.destroy(); }
  return { el, destroy, playComment, stop: stopAll };
}

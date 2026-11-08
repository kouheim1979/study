// Plays a lesson with the device's speech engine: whole text, one chunk, or an A–B chunk range (loop),
// and reports which chunk is being spoken (word-boundary events, or a time-based estimate).
import * as tts from './tts.js';
import { settings } from './store.js';

export class Speaker extends EventTarget {
  constructor(lesson) {
    super();
    this.lesson = lesson;
    this.cur = 0;
    this.playing = false;
    this.tok = null;
    this.loop = { a: null, b: null, on: false };
  }
  get rate() { return settings().rate || 1; }

  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  setCur(i) { if (i !== this.cur) { this.cur = i; this.emit('chunk', i); } }
  setPlaying(v) { if (v !== this.playing) { this.playing = v; this.emit('state', v); } }

  stop() {
    if (this.tok) { this.tok.cancel = true; if (this.tok.wake) this.tok.wake(); }
    this.tok = null;
    clearInterval(this.timer);
    tts.cancel();
    this.setPlaying(false);
  }

  setLoop(a, b) { this.loop = { a: Math.min(a, b), b: Math.max(a, b), on: true }; this.emit('loop'); }
  clearLoop() { this.loop = { a: null, b: null, on: false }; this.emit('loop'); }

  /** Group chunk indices [from..to] by sentence so each sentence is spoken naturally in one go. */
  groups(from, to) {
    const cs = this.lesson.chunks;
    const out = [];
    for (let i = from; i <= to; i++) {
      const last = out[out.length - 1];
      if (last && cs[last[last.length - 1]].s === cs[i].s) last.push(i);
      else out.push([i]);
    }
    return out;
  }

  /** Speak chunk indices as one utterance; tracks the current chunk. Resolves {ok, duration}. */
  async speakGroup(idx, tok, hooks = {}) {
    const cs = this.lesson.chunks;
    const parts = idx.map(i => cs[i].en);
    const text = parts.join(' ');
    const starts = [];
    let pos = 0;
    for (const p of parts) { starts.push(pos); pos += p.length + 1; }
    let gotBoundary = false;
    const t0 = { v: 0 };
    this.setCur(idx[0]);
    const est = tts.estimateSeconds(text, this.rate);
    clearInterval(this.timer);
    const res = await tts.speak(text, {
      rate: this.rate,
      onStart: () => {
        t0.v = performance.now();
        if (hooks.onStart) hooks.onStart(idx[0]);
        this.timer = setInterval(() => {
          if (gotBoundary || tok.cancel) return;
          const frac = (performance.now() - t0.v) / 1000 / est;
          const ch = Math.min(text.length - 1, Math.floor(frac * text.length));
          let k = 0;
          while (k + 1 < starts.length && starts[k + 1] <= ch) k++;
          if (idx[k] !== this.cur && hooks.onChunk) hooks.onChunk(idx[k]);
          this.setCur(idx[k]);
        }, 120);
      },
      onBoundary: ci => {
        gotBoundary = true;
        let k = 0;
        while (k + 1 < starts.length && starts[k + 1] <= ci) k++;
        if (idx[k] !== this.cur && hooks.onChunk) hooks.onChunk(idx[k]);
        this.setCur(idx[k]);
      },
    });
    clearInterval(this.timer);
    return res;
  }

  /** Continuous playback from chunk i (or the A–B loop). hooks: {onStart(i), onChunk(i), onSentenceEnd()} */
  async playFrom(i = 0, hooks = {}, { once = false } = {}) {
    this.stop();
    tts.unlock();
    const tok = this.tok = { cancel: false };
    this.setPlaying(true);
    const n = this.lesson.chunks.length;
    do {
      let from = i, to = n - 1;
      if (this.loop.on) { from = this.loop.a; to = this.loop.b; if (i >= from && i <= to) from = i; }
      for (const g of this.groups(from, to)) {
        if (tok.cancel) break;
        await this.speakGroup(g, tok, hooks);
        if (tok.cancel) break;
        if (hooks.onSentenceEnd) hooks.onSentenceEnd(g[g.length - 1]);
        await wait(280, tok);
      }
      i = this.loop.on ? this.loop.a : 0;
    } while (this.loop.on && !once && !tok.cancel);
    if (this.tok === tok) { this.tok = null; this.setPlaying(false); }
    return !tok.cancel;
  }

  /** Speak one chunk. Resolves {ok, duration}. */
  async playChunk(i, { keepToken = null } = {}) {
    if (!keepToken) this.stop();
    tts.unlock();
    const tok = keepToken || (this.tok = { cancel: false });
    this.setPlaying(true);
    const r = await this.speakGroup([i], tok);
    if (!keepToken && this.tok === tok) { this.tok = null; this.setPlaying(false); }
    return r;
  }

  /** Speak several chunks (e.g. one sentence) once. */
  async playIdx(idx) {
    this.stop();
    tts.unlock();
    const tok = this.tok = { cancel: false };
    this.setPlaying(true);
    const r = await this.speakGroup(idx, tok);
    if (this.tok === tok) { this.tok = null; this.setPlaying(false); }
    return r;
  }

  /** Speak arbitrary text (word practice). */
  async say(text, rate) {
    this.stop();
    tts.unlock();
    this.setPlaying(true);
    const r = await tts.speak(text, { rate: rate || this.rate });
    this.setPlaying(false);
    return r;
  }
}

export function wait(ms, tok) {
  return new Promise(res => {
    const t = setTimeout(res, ms);
    if (tok) tok.wake = () => { clearTimeout(t); res(); };
  });
}

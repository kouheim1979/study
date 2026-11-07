// Audio player with range playback, A–B repeat and precise stop (rAF polling).
export class Player extends EventTarget {
  constructor({ baseRate = 1 } = {}) {
    super();
    // Displayed 1.0x can correspond to a small natural-speech playback lift.
    // Keep this at 1 for user recordings and user-added lessons.
    this.baseRate = baseRate;
    const a = this.audio = new Audio();
    a.preload = 'auto';
    a.setAttribute('playsinline', '');
    a.preservesPitch = true; a.webkitPreservesPitch = true;
    this.range = null;      // {s, e, loop, onEnd}
    this.ab = { a: null, b: null, on: false };
    this.rate = 1;
    this.src = null;
    this._raf = null;
    const emit = type => this.dispatchEvent(new Event(type));
    a.addEventListener('play', () => { this._loop(); emit('state'); });
    a.addEventListener('pause', () => emit('state'));
    a.addEventListener('ended', () => {
      const r = this.range;
      if (r && r.loop) { this.seek(r.s); this.play(); return; }
      if (!r && this.ab.on && this.ab.b != null) { this.seek(this.ab.a); this.play(); return; }
      this.range = null;
      emit('state');
      if (r && r.onEnd) r.onEnd();
    });
    a.addEventListener('loadedmetadata', () => emit('meta'));
    a.addEventListener('ratechange', () => emit('rate'));
    a.addEventListener('error', () => emit('error'));
  }
  get time() { return this.audio.currentTime || 0; }
  get duration() { return isFinite(this.audio.duration) ? this.audio.duration : (this.knownDuration || 0); }
  get paused() { return this.audio.paused; }
  get effectiveRate() { return this.rate * this.baseRate; }

  load(src, knownDuration = 0) {
    this.knownDuration = knownDuration;
    if (this.src === src) return Promise.resolve();
    this.stop();
    this.src = src;
    this.audio.src = src;
    this.audio.load();
    this.audio.playbackRate = this.effectiveRate;
    return new Promise(res => {
      const done = () => { this.audio.removeEventListener('loadedmetadata', done); res(); };
      this.audio.addEventListener('loadedmetadata', done);
      setTimeout(done, 4000);
    });
  }
  /** iOS: call inside a tap handler before any awaited work so later play() calls are allowed. */
  unlock() {
    if (this._unlocked || !this.audio.paused) return;
    this._unlocked = true;
    const p = this.audio.play();
    this.audio.pause();
    if (p && p.catch) p.catch(() => {});
  }
  setRate(r) {
    this.rate = r;
    this.audio.playbackRate = this.effectiveRate;
    this.audio.defaultPlaybackRate = this.effectiveRate;
  }
  seek(t) {
    try { this.audio.currentTime = Math.max(0, t); } catch (_) { /* not ready */ }
    this.dispatchEvent(new Event('time'));
  }
  async play() {
    this.audio.playbackRate = this.effectiveRate;
    try { await this.audio.play(); this._unlocked = true; return true; }
    catch (e) { this.dispatchEvent(new CustomEvent('blocked', { detail: e })); return false; }
  }
  pause() { this.audio.pause(); }
  stop() { this.range = null; this.audio.pause(); }
  toggle() { return this.audio.paused ? this.play() : (this.pause(), true); }

  /** Play [s, e). loop repeats. onEnd fires once when e is reached (not when interrupted). */
  playRange(s, e, { loop = false, onEnd = null } = {}) {
    this.range = { s, e, loop, onEnd };
    this.seek(s);
    return this.play();
  }
  playFrom(t) { this.range = null; this.seek(t); return this.play(); }

  setA(t) { this.ab.a = t; if (this.ab.b != null && this.ab.b <= t) this.ab.b = null; this.ab.on = this.ab.b != null; this._emitAB(); }
  setB(t) { if (this.ab.a == null) this.ab.a = 0; if (t <= this.ab.a) return false; this.ab.b = t; this.ab.on = true; this._emitAB(); return true; }
  setAB(a, b) { this.ab = { a, b, on: true }; this._emitAB(); }
  clearAB() { this.ab = { a: null, b: null, on: false }; this._emitAB(); }
  _emitAB() { this.dispatchEvent(new Event('ab')); }

  _loop() {
    cancelAnimationFrame(this._raf);
    const tick = () => {
      const a = this.audio;
      if (a.paused) { this.dispatchEvent(new Event('time')); return; }
      const t = a.currentTime;
      const r = this.range;
      if (r && t >= r.e - 0.015) {
        if (r.loop) { this.seek(r.s); }
        else { this.range = null; a.pause(); if (r.onEnd) r.onEnd(); }
      } else if (!r && this.ab.on && this.ab.b != null && t >= this.ab.b) {
        this.seek(this.ab.a);
      }
      this.dispatchEvent(new Event('time'));
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  destroy() { this.stop(); cancelAnimationFrame(this._raf); this.audio.removeAttribute('src'); this.audio.load(); this.src = null; }
}

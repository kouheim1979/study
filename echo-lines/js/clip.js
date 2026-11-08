// Plays a recorded audio file, optionally just a [start, end) range (used for "my voice" playback).
export class Clip extends EventTarget {
  constructor(url, knownDuration = 0) {
    super();
    this.a = new Audio(url);
    this.a.preload = 'auto';
    this.a.setAttribute('playsinline', '');
    this.known = knownDuration;
    this.end = null;
    this.onEnd = null;
    const emit = t => this.dispatchEvent(new Event(t));
    this.a.addEventListener('play', () => { this.loop(); emit('state'); });
    this.a.addEventListener('pause', () => emit('state'));
    this.a.addEventListener('ended', () => { const cb = this.onEnd; this.end = null; this.onEnd = null; emit('state'); if (cb) cb(); });
  }
  get time() { return this.a.currentTime || 0; }
  get duration() { return isFinite(this.a.duration) ? this.a.duration : this.known; }
  get paused() { return this.a.paused; }
  seek(t) { try { this.a.currentTime = Math.max(0, t); } catch (_) { /* */ } this.dispatchEvent(new Event('time')); }
  play() { return this.a.play().then(() => true, () => false); }
  pause() { this.a.pause(); }
  stop() { const cb = this.onEnd; this.end = null; this.onEnd = null; this.a.pause(); if (cb) cb(); }
  range(s, e) {
    return new Promise(res => {
      this.stop();
      this.end = e;
      this.onEnd = res;
      this.seek(s);
      this.play();
    });
  }
  loop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (this.a.paused) { this.dispatchEvent(new Event('time')); return; }
      if (this.end != null && this.a.currentTime >= this.end) {
        const cb = this.onEnd; this.end = null; this.onEnd = null; this.a.pause(); if (cb) cb();
      }
      this.dispatchEvent(new Event('time'));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  destroy() { this.stop(); cancelAnimationFrame(this.raf); this.a.removeAttribute('src'); this.a.load(); }
}

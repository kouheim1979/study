// Text-to-speech using the device's built-in voices (iPhone: Siri / Samantha etc.).
const synth = window.speechSynthesis || null;
let voices = [];
let unlocked = false;
const keep = new Set(); // keep utterances referenced (Chrome GC bug)

export const ttsSupported = () => !!(synth && window.SpeechSynthesisUtterance);

function loadVoices() {
  if (!synth) return [];
  voices = synth.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang));
  return voices;
}
if (synth) {
  loadVoices();
  if ('onvoiceschanged' in synth) synth.addEventListener('voiceschanged', loadVoices);
}

/** English voices; resolves after the async voice list arrives (iOS). */
export function getVoices(timeout = 1500) {
  if (voices.length || !synth) return Promise.resolve(voices);
  return new Promise(res => {
    const t0 = Date.now();
    const poll = () => {
      if (loadVoices().length || Date.now() - t0 > timeout) return res(voices);
      setTimeout(poll, 100);
    };
    poll();
  });
}

let preferredURI = '';
export function setPreferredVoice(uri) { preferredURI = uri || ''; }
export function pickVoice() {
  if (!voices.length) loadVoices();
  if (preferredURI) { const v = voices.find(x => x.voiceURI === preferredURI); if (v) return v; }
  const score = v => (/en-US/i.test(v.lang) ? 4 : /en-GB/i.test(v.lang) ? 2 : 0) +
    (/samantha|ava|allison|google us english/i.test(v.name) ? 3 : 0) + (v.localService ? 1 : 0) +
    (/enhanced|premium/i.test(v.name) ? 2 : 0);
  return [...voices].sort((a, b) => score(b) - score(a))[0] || null;
}

/** Call synchronously inside a tap handler before any await (iOS needs a user gesture). */
export function unlock() {
  if (unlocked || !synth) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  } catch (_) { /* ignore */ }
}

export function cancel() { if (synth) synth.cancel(); }

/**
 * Speak text. Resolves {ok, duration} at the end (or on cancel/error).
 * onBoundary(charIndex) fires on word boundaries when the browser supports it.
 */
export function speak(text, { rate = 1, onStart, onBoundary } = {}) {
  return new Promise(resolve => {
    if (!synth) return resolve({ ok: false, duration: 0 });
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = rate;
    keep.add(u);
    let t0 = 0, done = false;
    const est = estimateSeconds(text, rate);
    const finish = ok => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      keep.delete(u);
      resolve({ ok, duration: t0 ? (performance.now() - t0) / 1000 : 0 });
    };
    u.onstart = () => { t0 = performance.now(); if (onStart) onStart(); };
    u.onend = () => finish(true);
    u.onerror = e => finish(e && (e.error === 'interrupted' || e.error === 'canceled') ? false : false);
    if (onBoundary) u.onboundary = e => { if (e.name === 'word' || e.name == null) onBoundary(e.charIndex); };
    // Safety net: some engines never fire onend.
    const guard = setTimeout(() => finish(true), est * 1000 * 2.5 + 4000);
    synth.speak(u);
  });
}

/** Rough speech length in seconds (about 2.6 words/s at rate 1). */
export function estimateSeconds(text, rate = 1) {
  const words = (text.match(/[A-Za-z0-9']+/g) || []).length;
  const pauses = (text.match(/[,.;:!?]/g) || []).length * 0.25;
  return (words / 2.6 + pauses + 0.2) / Math.max(0.3, rate);
}

// speak.js by Alon Zakai (copyright Mozilla Foundation), built on eSpeak.
// The unmodified English synthesizer is distributed under GPLv3.
// Authors, source and build instructions for this exact release:
// https://github.com/kripken/speak.js/tree/9c6f642f7d78bab51d16b2e8b79cdf205643ec35
// The license is included alongside this worker in COPYING.txt.
importScripts('./speakGenerator.js');

self.onmessage = ({ data }) => {
  const { id, text, rate } = data;
  try {
    const wav = generateSpeech(text, { speed: Math.round(175 * rate) });
    const header = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    // The English generator writes a 44-byte header followed by mono 16-bit PCM.
    if (wav.length <= 44 || header.getUint16(22, true) !== 1 || header.getUint16(34, true) !== 16) {
      throw new Error('Invalid speech audio');
    }
    const sampleRate = header.getUint32(24, true);
    const samples = new Float32Array(Math.floor((wav.length - 44) / 2));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = header.getInt16(44 + 2 * i, true) / 32768;
    }
    self.postMessage({ id, sampleRate, samples }, [samples.buffer]);
  } catch (_) {
    self.postMessage({ id, error: true });
  }
};

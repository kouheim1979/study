// Microphone recording via MediaRecorder (Safari: audio/mp4, Chrome/Firefox: webm/ogg).
export class Recorder {
  static supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }
  static pickMime() {
    const cands = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (_) { /* */ } }
    return '';
  }
  constructor() { this.stream = null; this.mr = null; this.parts = []; this.t0 = 0; }
  get recording() { return !!(this.mr && this.mr.state === 'recording'); }

  async ensureStream() {
    if (this.stream && this.stream.getAudioTracks().some(t => t.readyState === 'live')) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    return this.stream;
  }
  async start() {
    const stream = await this.ensureStream();
    const mime = Recorder.pickMime();
    this.parts = [];
    this.mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    this.mr.ondataavailable = e => { if (e.data && e.data.size) this.parts.push(e.data); };
    await new Promise((res, rej) => {
      this.mr.onstart = () => { this.t0 = performance.now(); res(); };
      this.mr.onerror = e => rej(e.error || e);
      this.mr.start(500);
    });
  }
  /** Seconds since recording started. */
  elapsed() { return this.t0 ? (performance.now() - this.t0) / 1000 : 0; }
  stop() {
    return new Promise(res => {
      if (!this.mr || this.mr.state === 'inactive') return res(null);
      const duration = this.elapsed();
      this.mr.onstop = () => {
        const type = this.mr.mimeType || (this.parts[0] && this.parts[0].type) || 'audio/webm';
        const blob = new Blob(this.parts, { type });
        this.parts = [];
        this.release();
        res({ blob, mime: type, duration });
      };
      this.mr.stop();
    });
  }
  /** Turn the microphone off (also restores normal speaker routing on iPhone). */
  release() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
  }
}

export function micErrorMessage(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'マイクの使用が許可されていません。設定アプリ → Safari → マイク（またはブラウザのサイト設定）で許可してください。録音ファイルの取り込みも使えます。';
  if (n === 'NotFoundError') return 'マイクが見つかりませんでした。録音済みファイルを取り込んでください。';
  if (!Recorder.supported()) return 'このブラウザは録音に対応していません。録音済みファイルを取り込んでください。';
  return 'マイクを開始できませんでした（' + (e && (e.message || e.name) || '不明なエラー') + '）。';
}

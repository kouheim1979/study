export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

export function pad2(n) {
  return String(Math.max(0, Number(n) || 0)).padStart(2, '0');
}

export function formatDuration(seconds) {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec < 60) return `${sec}秒`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}時間${pad2(m)}分${pad2(s)}秒`;
  return `${m}分${pad2(s)}秒`;
}

export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function fillBlankText(text, choice) {
  const src = String(text || '');
  if (!src) return '';
  if (choice === null || choice === undefined) return src;
  const token = String(choice);
  const blankRe = /(_____|____|___|\[blank\]|（空欄）|空欄)/;
  return blankRe.test(src) ? src.replace(blankRe, token) : src;
}

export function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

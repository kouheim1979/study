// Small DOM / data helpers shared by all views.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** h('div.card#x', {onclick, class, dataset, ...}, ...children) */
export function h(tag, attrs, ...children) {
  if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    if (attrs != null) children.unshift(attrs);
    attrs = {};
  }
  const m = tag.match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const node = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') node.classList.add(part.slice(1)); else node.id = part.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach(c => node.classList.add(c));
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'html') node.innerHTML = v;
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  append(node, children);
  return node;
}
function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function fmtTime(sec, digits = 0) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const ss = digits ? s.toFixed(digits).padStart(3 + digits, '0') : String(Math.floor(s)).padStart(2, '0');
  return `${m}:${ss}`;
}
export function fmtDuration(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}時間${m}分`;
  if (m) return `${m}分${s ? s + '秒' : ''}`;
  return `${s}秒`;
}
export function fmtDate(ts, withTime = true) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
  return withTime ? `${date} ${p(d.getHours())}:${p(d.getMinutes())}` : date;
}
export function todayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const uid = (prefix = '') =>
  prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}
export function base64ToBlob(b64, type = 'application/octet-stream') {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type });
}
export function extForMime(mime = '') {
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'audio';
}
export function safeName(s) {
  return String(s || 'file').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
}

/** Save or share a file. On iPhone the share sheet lets the user save to Files / AirDrop / mail. */
export async function saveFile(blob, filename, { preferShare = false } = {}) {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  if (preferShare && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  return 'downloaded';
}

export function pickFile(accept) {
  return new Promise(res => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    input.addEventListener('change', () => { res(input.files[0] || null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}
export function readText(file) { return file.text(); }

let toastTimer;
export function toast(msg, ms = 2600) {
  let t = $('#toast');
  if (!t) { t = h('div#toast', { role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function confirmDialog(message, okLabel = 'OK') {
  return new Promise(res => {
    const close = v => { dlg.remove(); res(v); };
    const dlg = h('div.modal', { role: 'dialog', 'aria-modal': 'true' },
      h('div.modal-box',
        h('p', message),
        h('div.row.end',
          h('button.btn', { onclick: () => close(false) }, 'キャンセル'),
          h('button.btn.primary', { onclick: () => close(true) }, okLabel))));
    document.body.append(dlg);
  });
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

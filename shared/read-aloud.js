/* 音読練習（2回読み上げ → 自分が1回まねして言う）— R.E.M.S. Reader / Kids Reader 共通
   使い方：リーダー側で window.ReadAloud.init({ getPage }) を呼ぶ。
   getPage() は { doc, n, canvas, imageUrl } を返す（doc: PDF.jsの文書、n: PDF内ページ番号、
   canvas: 表示中のcanvas、imageUrl: 画像表示中ならその画像URL）。ページが変わったら ReadAloud.pageChanged() を呼ぶ。 */
(function () {
  "use strict";
  const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const PREF_KEY = "read-aloud-v1";
  let pref = { rate: 0.85, times: 2, wait: 1.3, auto: true, main: true };
  try { Object.assign(pref, JSON.parse(localStorage.getItem(PREF_KEY) || "{}")); } catch (e) {}
  const savePref = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch (e) {} };

  let opts = null, sentences = [], idx = 0, playing = false, runId = 0, loadId = 0, voice = null, ui = null, ocrP = null, waitTimer = 0;
  const synth = window.speechSynthesis;

  /* ===== 声 ===== */
  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices().filter(v => /^en[-_]/i.test(v.lang));
    const pref = ["Samantha", "Google US English", "Microsoft Aria", "Karen", "Daniel", "Moira"];
    voice = vs.find(v => pref.some(p => v.name.includes(p)) && /en[-_]US/i.test(v.lang)) || vs.find(v => /en[-_]US/i.test(v.lang)) || vs[0] || null;
  }
  if (synth) { pickVoice(); synth.addEventListener?.("voiceschanged", pickVoice); }
  function speak(text, myRun) {
    return new Promise(res => {
      if (!synth || myRun !== runId) return res(false);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US"; if (voice) u.voice = voice; u.rate = pref.rate;
      let done = false; const fin = ok => { if (!done) { done = true; clearTimeout(guard); res(ok); } };
      u.onend = () => fin(true); u.onerror = () => fin(false);
      /* iOSでonendが来ないことがあるので保険 */
      const guard = setTimeout(() => fin(true), 4000 + text.length * 160 / pref.rate);
      synth.speak(u);
    });
  }
  const sleep = (ms, myRun) => new Promise(r => { waitTimer = setTimeout(r, ms); if (myRun !== runId) r(); });

  /* ===== 英文の取り出し ===== */
  const JA = /[぀-ヿ㐀-鿿！-｠]/g;
  function cleanLine(s) {
    return s.replace(/(^|\s)[|l1](?=\s+[a-z])/g, "$1I") /* OCRの I の読み違い */
      .replace(/[\u3000-\u30ff\u3400-\u9fff\uff01-\uff60]+[0-9０-９]*/g, " ").replace(/[•●▪■□◆◇★☆▶►→⇒※]/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .replace(/\s+([,.!?;:])/g, "$1").replace(/\s+/g, " ").trim();
  }
  function toSentences(lines, keepLines) {
    const out = [], whole = new Set();
    let buf = "";
    const push = s => {
      s = s.trim().replace(/^[\-–—:;,.\d\)\(\[\]\s]+(?=[A-Za-z"'])/, "");
      if (!/[A-Za-z]{2,}/.test(s)) return;
      if (/^(page|p\.)\s*\d+$/i.test(s)) return;
      if (s.length > 220) { s.split(/(?<=[,;:])\s+/).forEach(x => push(x)); return; }
      if (out[out.length - 1] !== s) out.push(s);
    };
    for (const raw of lines) {
      let line = cleanLine(raw);
      if (/^(p\.|page)\s*\d+$/i.test(line) || /^\d+$/.test(line)) continue;
      line = line.replace(/^[A-Z][a-z]?\s*:\s+/, ""); /* 話し手ラベル A: B: */
      /* 1. cat 2. dog のような番号つき語句は分ける */
      if (/^\d+[.)]\s+\S/.test(line) && /\s\d+[.)]\s+\S/.test(line)) {
        if (buf) { push(buf); buf = ""; }
        line.replace(/^\d+[.)]\s+/, "").split(/\s+\d+[.)]\s+/).forEach(x => push(x)); continue;
      }
      if (!line || !/[A-Za-z]/.test(line)) { if (buf) { push(buf); buf = ""; } continue; }
      /* 「Change 〜」の行は分けずに1つのまま */
      if (/^change\b/i.test(line)) { if (buf) { if (keepLines) whole.add(buf); push(buf); buf = ""; } whole.add(line.trim()); push(line); continue; }
      if (keepLines) { /* 行ごとにまとめる（折り返しはつなげる） */
        if (buf && !/[.!?]["')]?$/.test(buf)) buf += " " + line; else { if (buf) { whole.add(buf); push(buf); } buf = line; }
        continue;
      }
      if (false) { if (buf) { push(buf); buf = ""; } whole.add(line.trim()); push(line); continue; }
      /* 前の行が文の途中で、この行が小文字で始まるならつなげる */
      if (buf && !/[.!?:"')]$/.test(buf) && /^[a-z]/.test(line)) buf += " " + line;
      else { if (buf) push(buf); buf = line; }
      if (/[.!?]["')]?$/.test(buf)) { push(buf); buf = ""; }
    }
    if (buf) { if (keepLines) whole.add(buf); push(buf); }
    /* 1行に複数の文があれば分ける */
    return out.flatMap(s => whole.has(s) ? [s] : s.split(/(?<=[a-z0-9"')][.!?])\s+(?=[A-Z"'])/)).map(s => s.trim()).filter(s => /[A-Za-z]{2,}/.test(s));
  }
  async function textFromDoc(doc, n) {
    const pg = await doc.getPage(n);
    const tc = await pg.getTextContent();
    const lines = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4], h = Math.abs(it.transform[3]) || it.height || 10;
      let L = lines.find(l => Math.abs(l.y - y) <= Math.max(2, h * 0.45));
      if (!L) { L = { y, h: 0, parts: [] }; lines.push(L); }
      L.h = Math.max(L.h, h);
      L.parts.push({ x, s: it.str });
    }
    lines.sort((a, b) => b.y - a.y);
    const [, y0, , y1] = pg.view, H = (y1 - y0) || 1;
    return lines.map(l => ({ s: l.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(" "), h: l.h, cy: 1 - (l.y - y0) / H }));
  }
  /* まん中の文だけ：ページ中央付近でいちばん大きい文字の行を選ぶ */
  function pickMain(lines) {
    const en = lines.filter(l => (l.s.match(/[A-Za-z]/g) || []).length >= 2);
    const mid = en.filter(l => l.cy > 0.1 && l.cy < 0.92);
    const pool = mid.length ? mid : en;
    const maxH = Math.max(0, ...pool.map(l => l.h));
    const main = pool.filter(l => l.h >= maxH * 0.78 || /^\W*change\b/i.test(l.s));
    return main.length ? main : en;
  }
  function loadTesseract() {
    return ocrP || (ocrP = new Promise((ok, ng) => {
      if (window.Tesseract) return ok(window.Tesseract);
      const s = document.createElement("script"); s.src = TESSERACT;
      s.onload = () => window.Tesseract ? ok(window.Tesseract) : ng(Error("OCR"));
      s.onerror = () => { ocrP = null; ng(Error("文字読み取りの部品を読み込めません")); };
      document.head.append(s);
    }));
  }
  async function textFromImage(src) {
    const T = await loadTesseract();
    const r = await T.recognize(src, "eng");
    const ls = (r.data.lines || []).filter(l => (l.text.match(/[A-Za-z]/g) || []).length >= 2);
    if (!ls.length) return r.data.text.split("\n").map(t => ({ s: t, h: 1, cy: .5 })).filter(l => (l.s.match(/[A-Za-z]/g) || []).length >= 2);
    const H = (src.height || src.naturalHeight || Math.max(...ls.map(l => l.bbox.y1)) * 1.05) || 1;
    return ls.map(l => ({ s: l.text, h: l.bbox.y1 - l.bbox.y0, cy: (l.bbox.y0 + l.bbox.y1) / 2 / H }));
  }

  /* ===== 画面 ===== */
  const CSS = `
  #ra-panel{position:fixed;left:0;right:0;bottom:0;z-index:80;background:#fff;color:#222;border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.25);max-height:58vh;display:flex;flex-direction:column;font-family:inherit;padding-bottom:env(safe-area-inset-bottom)}
  #ra-panel[hidden]{display:none}
  .ra-head{display:flex;align-items:center;gap:8px;padding:10px 12px 6px}
  .ra-head b{flex:1;font-size:.95rem}
  .ra-x{border:0;background:#eee;border-radius:10px;padding:7px 11px;font-weight:800}
  .ra-status{margin:0 12px 6px;padding:10px 12px;border-radius:12px;background:#f2f6ff;font-weight:800;font-size:.95rem;display:flex;align-items:center;gap:8px;min-height:44px}
  .ra-status.you{background:#fff1d6;color:#9a5a00}
  .ra-bar{height:5px;background:#eee;border-radius:3px;margin:0 12px 6px;overflow:hidden}.ra-bar i{display:block;height:100%;width:0;background:#f59f00}
  .ra-ctrl{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px;align-items:center}
  .ra-ctrl button,.ra-ctrl select{border:1px solid #ddd;background:#fff;border-radius:10px;padding:8px 10px;font-size:.84rem;font-weight:800}
  .ra-ctrl .ra-go{background:#2f9e44;border-color:#2f9e44;color:#fff;font-size:.95rem;padding:9px 16px}
  .ra-ctrl .ra-go.stop{background:#e03131;border-color:#e03131}
  .ra-ctrl label{font-size:.76rem;color:#666;display:flex;align-items:center;gap:4px}
  .ra-list{overflow:auto;padding:0 12px 12px;display:flex;flex-direction:column;gap:6px;-webkit-overflow-scrolling:touch}
  .ra-s{text-align:left;border:1px solid #e5e5e5;background:#fafafa;border-radius:12px;padding:9px 11px;font-size:1rem;line-height:1.4}
  .ra-s.on{border-color:#2f9e44;background:#ebfbee;box-shadow:inset 4px 0 #2f9e44}
  .ra-s.you{border-color:#f59f00;background:#fff4e0;box-shadow:inset 4px 0 #f59f00}
  .ra-note{font-size:.8rem;color:#777;padding:6px 12px 14px;line-height:1.6}
  .ra-btn{border:2px solid #e9d9c4;background:#fff;border-radius:12px;min-height:42px;padding:0 12px;font-weight:800;font-size:.86rem;white-space:nowrap}
  .fs-ra{position:absolute;z-index:3;bottom:max(14px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);border:0;border-radius:29px;height:58px;padding:0 18px;font-weight:900;font-size:1rem;color:#fff;background:rgba(47,158,68,.9)}
  `;
  function build() {
    const p = document.createElement("section"); p.id = "ra-panel"; p.hidden = true; p.setAttribute("aria-label", "音読練習");
    p.innerHTML = `
      <div class="ra-head"><b>🔊 音読練習 <small style="font-weight:600;color:#888">2回きく → 1回いう</small></b><button class="ra-x" type="button">✕ とじる</button></div>
      <div class="ra-status" role="status" aria-live="polite">　</div>
      <div class="ra-bar"><i></i></div>
      <div class="ra-ctrl">
        <button class="ra-go" type="button">▶ スタート</button>
        <label>はやさ<select class="ra-rate"><option value="0.7">ゆっくり</option><option value="0.85">ふつう</option><option value="1">はやい</option></select></label>
        <label>きく<select class="ra-times"><option value="1">1回</option><option value="2">2回</option><option value="3">3回</option></select></label>
        <label>いう時間<select class="ra-wait"><option value="1">みじかめ</option><option value="1.3">ふつう</option><option value="1.8">ながめ</option></select></label>
        <label><input type="checkbox" class="ra-main"> まん中の文だけ</label>
        <label><input type="checkbox" class="ra-auto"> 次のページも</label>
      </div>
      <div class="ra-list"></div>`;
    document.body.append(p);
    const q = s => p.querySelector(s);
    ui = { p, status: q(".ra-status"), bar: q(".ra-bar i"), go: q(".ra-go"), list: q(".ra-list"), rate: q(".ra-rate"), times: q(".ra-times"), wait: q(".ra-wait"), auto: q(".ra-auto"), main: q(".ra-main") };
    ui.rate.value = String(pref.rate); ui.times.value = String(pref.times); ui.wait.value = String(pref.wait); ui.auto.checked = !!pref.auto;
    ui.rate.onchange = () => { pref.rate = +ui.rate.value; savePref(); };
    ui.times.onchange = () => { pref.times = +ui.times.value; savePref(); };
    ui.wait.onchange = () => { pref.wait = +ui.wait.value; savePref(); };
    ui.auto.onchange = () => { pref.auto = ui.auto.checked; savePref(); };
    ui.main.checked = pref.main !== false;
    ui.main.onchange = () => { pref.main = ui.main.checked; savePref(); stop(); load(); };
    q(".ra-x").onclick = close;
    ui.go.onclick = () => playing ? stop() : start(idx);
  }
  { const st = document.createElement("style"); st.textContent = CSS; document.head.append(st); }
  function setStatus(html, you) { ui.status.innerHTML = html; ui.status.classList.toggle("you", !!you); }
  function renderList() {
    ui.list.replaceChildren();
    sentences.forEach((s, i) => {
      const b = document.createElement("button"); b.type = "button"; b.className = "ra-s"; b.textContent = s;
      b.onclick = () => { stop(); idx = i; start(i, true); };
      ui.list.append(b);
    });
  }
  function mark(i, cls) {
    [...ui.list.children].forEach((b, k) => { b.classList.toggle("on", k === i && cls === "on"); b.classList.toggle("you", k === i && cls === "you"); });
    const b = ui.list.children[i]; if (b) b.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /* ===== 練習の流れ ===== */
  async function start(from, single) {
    if (!synth) { setStatus("このブラウザは読み上げに対応していません"); return; }
    if (!sentences.length) return;
    synth.cancel();
    const my = ++runId; playing = true; ui.go.textContent = "■ ストップ"; ui.go.classList.add("stop");
    for (let i = from; i < sentences.length; i++) {
      if (my !== runId) return;
      idx = i; const s = sentences[i];
      for (let t = 1; t <= pref.times; t++) {
        if (my !== runId) return;
        mark(i, "on"); setStatus("🔊 きいてね（" + t + "/" + pref.times + "）　" + (i + 1) + "/" + sentences.length);
        ui.bar.style.transition = "none"; ui.bar.style.width = "0";
        await speak(s, my);
        if (t < pref.times) await sleep(450, my);
      }
      if (my !== runId) return;
      /* あなたの番：文の長さに合わせて待つ */
      const words = s.split(/\s+/).length;
      const ms = Math.round((900 + words * 430 / pref.rate) * pref.wait);
      mark(i, "you"); setStatus("🎤 あなたの番！ まねして言ってみよう", true);
      ui.bar.style.transition = "none"; ui.bar.style.width = "0"; void ui.bar.offsetWidth;
      ui.bar.style.transition = "width " + ms + "ms linear"; ui.bar.style.width = "100%";
      await sleep(ms, my);
      if (single) break;
    }
    if (my !== runId) return;
    playing = false; ui.go.textContent = "▶ スタート"; ui.go.classList.remove("stop"); ui.bar.style.width = "0";
    doneKey = curKey;
    if (!single && pref.auto && opts.next && opts.next()) { setStatus("➡️ 次のページへ"); autoContinue = true; return; }
    idx = single ? idx : 0; mark(-1); setStatus(single ? "もう一度タップで くり返せます" : "🎉 このページはおしまい！");
  }
  let autoContinue = false, curKey = "", doneKey = "", skipped = 0;
  function stop() {
    runId++; playing = false; clearTimeout(waitTimer); synth && synth.cancel();
    if (ui) { ui.go.textContent = "▶ スタート"; ui.go.classList.remove("stop"); ui.bar.style.transition = "none"; ui.bar.style.width = "0"; mark(-1); setStatus("とまりました。▶で つづきから"); }
  }

  async function load() {
    const my = ++loadId; sentences = []; idx = 0; renderList();
    setStatus('<span class="ra-spin">⏳</span> ページの英文を さがしています…');
    let lines = [], src = null;
    try {
      src = await opts.getPage();
      if (my !== loadId) return;
      curKey = src && src.key || "";
      if (src && src.doc) lines = await textFromDoc(src.doc, src.n);
    } catch (e) {}
    const pick = ls => (pref.main ? pickMain(ls) : ls).map(l => typeof l === "string" ? l : l.s);
    let list = toSentences(pick(lines), pref.main);
    if (list.length < 1 && src && (src.canvas || src.imageUrl)) {
      setStatus("🔍 文字を よみとっています…（はじめは少し時間がかかります）");
      try {
        const img = src.canvas && src.canvas.width ? src.canvas : src.imageUrl;
        const ocr = await textFromImage(img);
        if (my !== loadId) return;
        list = toSentences(pick(ocr), pref.main);
      } catch (e) { if (my !== loadId) return; setStatus("文字を よみとれませんでした（" + (e.message || e) + "）"); return; }
    }
    if (my !== loadId) return;
    sentences = list; renderList();
    if (!list.length) {
      /* 連続練習中なら英文のないページは飛ばす（3ページまで） */
      if (autoContinue && skipped < 3 && opts.next && opts.next()) { skipped++; setStatus("➡️ 英文のないページを とばします"); return; }
      autoContinue = false; skipped = 0;
      setStatus("このページには 読み上げる英文が見つかりませんでした"); return;
    }
    skipped = 0;
    setStatus("英文 " + list.length + " こ。▶スタート か、文をタップ");
    if (autoContinue) { autoContinue = false; if (curKey && curKey === doneKey) { setStatus("🎉 さいごのページまで おわりました！"); return; } start(0); }
  }

  function open() { if (!ui) build(); ui.p.hidden = false; autoContinue = false; load(); }
  function close() { stop(); autoContinue = false; if (ui) ui.p.hidden = true; }

  window.ReadAloud = {
    init(o) { opts = o; },
    open, close,
    toggle() { ui && !ui.p.hidden ? close() : open(); },
    isOpen: () => !!(ui && !ui.p.hidden),
    pageChanged() {
      if (!ui || ui.p.hidden) return;
      let k = ""; try { k = opts.getPage().key || ""; } catch (e) {}
      if (k && k === curKey && (sentences.length || !autoContinue)) return; /* 同じページの再描画（回転など） */
      if (playing && !autoContinue) stop();
      load();
    },
    /* テスト用 */
    _toSentences: toSentences,
  };
})();

// Six-step practice screen driven by the device's speech engine.
import { h, $$, fmtTime, toast, saveFile, pickFile, extForMime, safeName } from '../util.js';
import { Recorder, micErrorMessage } from '../recorder.js';
import * as tts from '../tts.js';
import { Speaker, wait } from '../speaker.js';
import { makeCloze } from '../analyze.js';
import { createCompare } from './compare.js';
import {
  settings, setSetting, getProgress, updateProgress, addStudyTime, setResume,
  saveRecording, listRecordings, recordingBlob,
} from '../store.js';

export const STEPS = [
  { n: 1, label: '聞く', title: '英文を見ずに聞く', icon: '👂' },
  { n: 2, label: '単語', title: 'キーワードの意味と発音', icon: '🔤' },
  { n: 3, label: '意味', title: 'チャンクごとに意味をとる', icon: '🧩' },
  { n: 4, label: 'リピート', title: 'リピーティング', icon: '🔁' },
  { n: 5, label: 'シャドー', title: 'シャドーイング', icon: '🗣️' },
  { n: 6, label: '確認', title: '和訳と理解度チェック', icon: '✅' },
];
const GUIDE = {
  1: 'まずは英文を見ずに、音だけで内容をつかみます。何回聞いてもかまいません。最後にどれくらい聞き取れたか自己評価しましょう。',
  2: 'テキストから自動で選んだキーワードです。単語だけ／ゆっくり／文の中で、の3通りで聞き比べ、意味をメモしておきましょう。',
  3: 'チャンク（意味のかたまり）ごとに、英語の順番のまま意味をとります。解説は音のつながり・脱落などを自動で見つけた目安です。',
  4: '1チャンク聞いたら、ポーズの間に同じように声に出します。慣れたらポーズを短く、英文をOFFにして挑戦しましょう。',
  5: '読み上げを聞きながら、少し遅れて同時に声に出します。録音して、お手本とチャンクごとに聞き比べましょう（イヤホン推奨）。',
  6: '文ごとの和訳で理解を確かめ、自動で作られた穴うめ問題に答えます。最初のリスニングと比べて振り返りましょう。',
};
const RATINGS = ['ほとんど聞き取れない', '3割くらい', '半分くらい', 'ほぼ全部'];
const RATES = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5];

export class LessonView {
  constructor(lesson, app) {
    this.L = lesson;
    this.app = app;
    this.sp = new Speaker(lesson);
    this.rec = new Recorder();
    this.step = 0;
    this.acc = 0;
    this.lastAct = Date.now();
    this.compare = null;
    this.task = null;
  }

  async mount(root) {
    this.root = root;
    this.prog = await getProgress(this.L.id);
    root.replaceChildren(this.render());
    this.applyToggles();
    root.addEventListener('pointerdown', () => { this.lastAct = Date.now(); });
    this.sp.addEventListener('chunk', () => this.highlight());
    this.sp.addEventListener('state', () => this.renderState());
    this.sp.addEventListener('loop', () => this.renderLoop());
    this.timer = setInterval(() => {
      if (document.visibilityState === 'visible' && (this.sp.playing || this.rec.recording || Date.now() - this.lastAct < 60000)) this.acc++;
      if (this.acc >= 15) this.flush();
    }, 1000);
    this.onVis = () => { if (document.visibilityState === 'hidden') { this.flush(); this.sp.stop(); } };
    document.addEventListener('visibilitychange', this.onVis);
  }
  flush() {
    const s = this.acc; this.acc = 0;
    if (s) addStudyTime(this.L.id, s).then(() => { this.prog.totalSec += s; this.renderMeta(); }).catch(() => {});
  }
  destroy() {
    this.cancelTask();
    this.sp.stop();
    if (this.rec.recording) this.rec.stop();
    this.rec.release();
    if (this.compare) this.compare.destroy();
    this.flush();
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVis);
  }

  // ---------- layout ----------
  render() {
    const L = this.L;
    this.fav = h('button.icon-btn.fav', { 'aria-label': 'お気に入り', onclick: async () => { this.prog = await updateProgress(L.id, p => { p.favorite = !p.favorite; }); this.renderMeta(); } }, '☆');
    this.meta = h('span.meta');
    this.nav = h('nav.steps', { 'aria-label': 'ステップ' }, STEPS.map(s => h('a.step', { href: `#/lesson/${encodeURIComponent(L.id)}/${s.n}`, dataset: { n: s.n } }, h('b', String(s.n)), h('span', s.label))));
    this.toggles = h('div.toggles', { role: 'group', 'aria-label': '表示の切り替え' }, ['showEn:英文', 'showJa:和訳', 'showNote:解説'].map(x => {
      const [k, label] = x.split(':');
      return h('button.toggle', { type: 'button', 'aria-pressed': String(!!settings()[k]), onclick: e => { setSetting(k, !settings()[k]); e.currentTarget.setAttribute('aria-pressed', String(settings()[k])); $$('.shown', this.body).forEach(n => n.classList.remove('shown')); this.applyToggles(); } }, label);
    }));
    this.body = h('div.body');
    this.body.addEventListener('click', e => this.onClick(e));
    return h('div.lesson',
      h('header.l-head',
        h('a.back', { href: '#/' }, '‹ 一覧'),
        h('div.l-title', h('h1', L.title), h('div.sub', h('span.lv', L.level), L.theme ? h('span.tag', L.theme) : null, this.meta)),
        !L.example ? h('a.icon-btn', { href: `#/edit/${encodeURIComponent(L.id)}`, 'aria-label': '編集' }, '✎') : null,
        this.fav),
      this.nav, this.toggles, this.body, this.bar());
  }
  applyToggles() {
    const s = settings();
    this.root.classList.toggle('no-en', !s.showEn);
    this.root.classList.toggle('no-ja', !s.showJa);
    this.root.classList.toggle('no-note', !s.showNote);
  }
  renderMeta() {
    this.fav.textContent = this.prog.favorite ? '★' : '☆';
    this.fav.classList.toggle('on', !!this.prog.favorite);
    this.meta.textContent = `学習 ${Math.round(this.prog.totalSec / 60)}分${this.prog.completions.length ? `・完了 ${this.prog.completions.length}回` : ''}`;
    $$('.step', this.nav).forEach(a => {
      const n = +a.dataset.n;
      a.classList.toggle('done', !!this.prog.steps[n]);
      a.classList.toggle('active', n === this.step);
    });
  }

  bar() {
    this.playBtn = h('button.btn.round.primary', { 'aria-label': '再生', onclick: () => this.togglePlay() }, '▶');
    const rate = h('select.rate', { 'aria-label': '読み上げの速さ', onchange: e => setSetting('rate', +e.target.value) },
      RATES.map(r => h('option', { value: r, selected: r === settings().rate }, `${r}x`)));
    this.loopLbl = h('span.loop-lbl');
    this.loopBox = h('div.loop-box', this.loopLbl, h('button.btn.xs', { onclick: () => this.sp.clearLoop(), 'aria-label': 'A–B解除' }, '✕ 解除'));
    this.posLbl = h('span.pos');
    return h('div.bar',
      h('div.bar-row',
        h('button.btn.icon', { onclick: () => this.move(-1), 'aria-label': '前のチャンク' }, '⏮'),
        this.playBtn,
        h('button.btn.icon', { onclick: () => this.move(1), 'aria-label': '次のチャンク' }, '⏭'),
        rate,
        h('button.btn.ab', { onclick: () => this.setAB('a'), 'aria-label': '今のチャンクをAに' }, 'A'),
        h('button.btn.ab', { onclick: () => this.setAB('b'), 'aria-label': '今のチャンクをBに' }, 'B')),
      h('div.bar-row.small', this.posLbl, this.loopBox));
  }
  setAB(k) {
    const lp = this.sp.loop;
    if (k === 'a') { this.pendingA = this.sp.cur; this.sp.loop = { a: this.sp.cur, b: null, on: false }; this.renderLoop(); toast(`A = チャンク${this.sp.cur + 1}。続けて B を押してください`); return; }
    const a = lp.a != null ? lp.a : 0;
    this.sp.setLoop(a, this.sp.cur);
    toast(`チャンク${this.sp.loop.a + 1}〜${this.sp.loop.b + 1} をくり返します。▶で再生`);
  }
  renderLoop() {
    const lp = this.sp.loop;
    this.loopBox.hidden = lp.a == null;
    if (lp.a != null) this.loopLbl.textContent = lp.on ? `A–Bリピート：チャンク ${lp.a + 1}〜${lp.b + 1}` : `A：チャンク ${lp.a + 1}（Bを設定）`;
    $$('[data-i]', this.body).forEach(r => { const i = +r.dataset.i; r.classList.toggle('in-loop', lp.on && i >= lp.a && i <= lp.b); });
  }
  renderState() {
    const p = this.sp.playing || !!this.task;
    this.playBtn.textContent = p ? '⏸' : '▶';
    this.playBtn.setAttribute('aria-label', p ? '停止' : '再生');
  }
  highlight() {
    const i = this.sp.cur;
    this.posLbl.textContent = `チャンク ${i + 1} / ${this.L.chunks.length}`;
    $$('[data-i]', this.body).forEach(r => r.classList.toggle('now', this.sp.playing && +r.dataset.i === i));
    if (this.sp.playing && (this.step === 3 || this.step === 5)) {
      const row = this.body.querySelector(`[data-i="${i}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  togglePlay() {
    if (this.sp.playing || this.task) { this.cancelTask(); this.sp.stop(); return; }
    this.sp.playFrom(this.sp.loop.on ? this.sp.loop.a : this.sp.cur).then(() => this.saveResume());
  }
  move(d) {
    const i = Math.max(0, Math.min(this.L.chunks.length - 1, this.sp.cur + d));
    const was = this.sp.playing;
    this.sp.stop();
    this.sp.setCur(i);
    this.highlight();
    if (was) this.sp.playFrom(i);
  }
  saveResume() { setResume(this.L.id, this.step, this.sp.cur).catch(() => {}); }

  shownMask(t) {
    const el = t.closest('.en, .ja, .note');
    if (!el || el.classList.contains('shown')) return null;
    const s = settings();
    const hid = (el.classList.contains('en') && !s.showEn) || (el.classList.contains('ja') && !s.showJa) || (el.classList.contains('note') && !s.showNote);
    return hid ? el : null;
  }
  onClick(e) {
    const m = this.shownMask(e.target);
    if (m) { m.classList.add('shown'); return; }
    if (e.target.closest('input, textarea, a, select')) return;
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const i = +row.dataset.i;
    if (e.target.closest('.loop')) { this.cancelTask(); this.sp.setLoop(i, i); this.sp.playFrom(i); return; }
    if (this.step === 4 && !e.target.closest('.play')) { this.runRepeat(i); return; }
    this.cancelTask();
    this.sp.playChunk(i);
  }

  chunkRow(c, i, extra) {
    const memo = c.ja;
    return h('div.chunk', { dataset: { i } },
      h('button.play', { type: 'button', 'aria-label': `読み上げ: ${c.en}` }, '▶'),
      h('div.txt',
        h('p.en', c.en),
        memo ? h('p.ja', memo) : null,
        c.notes.length ? h('ul.note', c.notes.map(n => h('li', n))) : null,
        extra),
      h('button.loop', { type: 'button', 'aria-label': 'このチャンクをくり返す' }, '⟲'));
  }
  sentenceJa(si) { return (this.L.sentences[si] || {}).ja || ''; }

  cancelTask() {
    if (this.task) { this.task.cancel = true; if (this.task.wake) this.task.wake(); this.task = null; if (this.onCancel) this.onCancel(); }
  }

  // ---------- steps ----------
  async showStep(n, q = {}) {
    n = Math.max(1, Math.min(6, n | 0 || 1));
    if (this.rec.recording) await this.finishShadow();
    this.cancelTask();
    this.sp.stop();
    if (this.compare) { this.compare.destroy(); this.compare = null; }
    this.onCancel = null;
    this.step = n;
    this.toggles.hidden = n <= 2;
    this.root.classList.toggle('blind', n === 1);
    const s = STEPS[n - 1];
    this.body.replaceChildren(h('h2.st', `${s.icon} Step ${n}　${s.title}`), h('p.guide', GUIDE[n]));
    if (!tts.ttsSupported()) this.body.append(h('p.warn', 'このブラウザは音声読み上げに対応していません。iPhoneのSafari、またはChrome・Edgeなどで開いてください。'));
    await this[`s${n}`](this.body);
    this.body.append(this.nextNav(n));
    if (q.c != null && this.L.chunks[+q.c]) this.sp.setCur(+q.c);
    this.highlight();
    this.renderLoop();
    this.renderMeta();
    this.saveResume();
    window.scrollTo(0, 0);
  }
  nextNav(n) {
    const id = encodeURIComponent(this.L.id);
    return h('div.next',
      n > 1 ? h('a.btn', { href: `#/lesson/${id}/${n - 1}` }, `‹ Step ${n - 1}`) : h('span'),
      n < 6 ? h('button.btn.primary', { onclick: async () => { this.prog = await updateProgress(this.L.id, p => { p.steps[n] = Date.now(); }); this.app.go(`#/lesson/${id}/${n + 1}`); } }, `できた！ Step ${n + 1}「${STEPS[n].title}」へ ›`) : h('span'));
  }
  rating(key, label) {
    const cur = (this.prog.ratings || {})[key];
    const box = h('div.rating', h('p.small', label), h('div.chips', { role: 'radiogroup', 'aria-label': label }, RATINGS.map((r, i) => h('button.chip', {
      type: 'button', role: 'radio', 'aria-checked': String(cur === i),
      onclick: async e => {
        const b = e.currentTarget;
        $$('.chip', box).forEach(x => x.setAttribute('aria-checked', 'false'));
        b.setAttribute('aria-checked', 'true');
        this.prog = await updateProgress(this.L.id, p => { p.ratings = { ...(p.ratings || {}), [key]: i }; });
      },
    }, r))));
    return box;
  }

  s1(b) {
    let count = 0;
    const cnt = h('b', '0回');
    b.append(h('div.card.center',
      h('div.big', '👂'),
      h('p', '英文・和訳は表示されません。'),
      h('button.btn.primary.lg', { onclick: () => { this.sp.clearLoop(); count++; cnt.textContent = `${count}回`; this.sp.playFrom(0); } }, '▶ 最初から通して聞く'),
      h('p.small', '聞いた回数: ', cnt)),
    this.rating('first', '内容をどれくらい聞き取れましたか？'));
  }

  s2(b) {
    const words = this.L.words;
    if (!words.length) { b.append(h('p.card', 'キーワードが見つかりませんでした。次のステップへ進んでください。')); return; }
    const memo = this.prog.wordJa || {};
    b.append(h('div.words', words.map(w => {
      const ci = this.L.chunks.findIndex(c => new RegExp(`\\b${w.w}\\b`, 'i').test(c.en));
      const inp = h('input', { value: memo[w.w] || w.ja || '', placeholder: '意味をメモ（任意）', 'aria-label': `${w.w} の意味` });
      inp.addEventListener('change', async () => { this.prog = await updateProgress(this.L.id, p => { p.wordJa = { ...(p.wordJa || {}), [w.w]: inp.value.trim() }; }); });
      return h('div.word',
        h('div.w', w.w),
        w.note ? h('div.small', '発音: ', w.note) : null,
        ci >= 0 ? h('div.small', '文中: ', this.L.chunks[ci].en) : null,
        inp,
        h('div.row.wrap',
          h('button.btn.sm', { onclick: () => this.sp.say(w.w, 0.85) }, '▶ 単語'),
          h('button.btn.sm', { onclick: () => this.sp.say(w.w, 0.55) }, '▶ ゆっくり'),
          ci >= 0 ? h('button.btn.sm', { onclick: () => this.sp.playChunk(ci) }, '▶ 文の中で') : null,
          h('a.btn.sm', { href: `https://ejje.weblio.jp/content/${encodeURIComponent(w.w)}`, target: '_blank', rel: 'noopener noreferrer' }, '辞書 ↗')));
    })));
    b.append(h('p.hint', '「辞書 ↗」は外部の辞書サイトを開きます（押したときだけ通信します）。'));
  }

  s3(b) {
    b.append(h('p.hint', '▶やテキストのタップでそのチャンクを読み上げ、⟲でくり返し。OFFにした項目はタップで1つずつ表示できます。'));
    let prevS = -1;
    const box = h('div.chunks');
    this.L.chunks.forEach((c, i) => {
      if (c.s !== prevS) {
        prevS = c.s;
        const ja = this.sentenceJa(c.s);
        box.append(h('div.sent-head', h('span.small', `文 ${c.s + 1}`), ja ? h('span.ja', ja) : null));
      }
      const memo = (this.prog.chunkJa || {})[c.id] || '';
      const inp = h('input.memo', { value: memo, placeholder: 'このチャンクの意味をメモ（任意）', 'aria-label': `${c.en} の意味メモ` });
      inp.addEventListener('change', async () => { this.prog = await updateProgress(this.L.id, p => { p.chunkJa = { ...(p.chunkJa || {}), [c.id]: inp.value.trim() }; }); });
      box.append(this.chunkRow({ ...c, ja: '' }, i, inp));
    });
    b.append(box);
  }

  s4(b) {
    const s = settings();
    const gap = h('select', { 'aria-label': 'ポーズの長さ', onchange: e => setSetting('gap', +e.target.value) }, [[1, '短め'], [1.5, 'ふつう'], [2, '長め'], [3, 'たっぷり']].map(([v, l]) => h('option', { value: v, selected: v === s.gap }, `${l}（×${v}）`)));
    const rep = h('select', { 'aria-label': '回数', onchange: e => setSetting('repeat', +e.target.value) }, [1, 2, 3].map(v => h('option', { value: v, selected: v === s.repeat }, `${v}回ずつ`)));
    this.recChk = h('input', { type: 'checkbox' });
    this.status = h('div.status', { 'aria-live': 'polite' }, h('span.st', '待機中'), h('div.prog', h('div.fill')));
    this.startBtn = h('button.btn.primary.lg', { onclick: () => (this.task ? this.cancelTask() : this.runRepeat(this.sp.loop.on ? this.sp.loop.a : 0)) }, '▶ リピーティング開始');
    this.onCancel = () => { this.startBtn.textContent = '▶ リピーティング開始'; this.setStatus('idle'); this.renderState(); };
    this.slot = h('div');
    b.append(h('div.card',
      h('div.row.wrap', h('label', 'ポーズ ', gap), h('label', '回数 ', rep), Recorder.supported() ? h('label.check', this.recChk, ' 録音する') : null),
      h('div.row.center', this.startBtn), this.status),
    h('p.hint', 'テキストをタップすると、そのチャンクから始めます。A–Bを設定していればその範囲だけを練習します。'),
    h('div.chunks', this.L.chunks.map((c, i) => this.chunkRow({ ...c, ja: (this.prog.chunkJa || {})[c.id] || '' }, i))),
    this.slot);
  }
  setStatus(kind, text, sec) {
    if (!this.status) return;
    const st = this.status.querySelector('.st');
    const fill = this.status.querySelector('.fill');
    this.status.dataset.kind = kind;
    fill.style.transition = 'none'; fill.style.width = '0%';
    if (kind === 'model') st.textContent = `🔊 ${settings().showEn ? text : 'お手本を聞いて…'}`;
    else if (kind === 'you') { st.textContent = '🎤 あなたの番：声に出して言いましょう'; fill.getBoundingClientRect(); fill.style.transition = `width ${sec}s linear`; fill.style.width = '100%'; }
    else st.textContent = kind === 'done' ? 'おつかれさまでした！' : '待機中';
  }
  async runRepeat(start) {
    this.cancelTask();
    this.sp.stop();
    tts.unlock();
    if (this.compare) { this.compare.destroy(); this.compare = null; }
    const tok = this.task = { cancel: false };
    const record = this.recChk && this.recChk.checked;
    const marks = [];
    if (record) { try { await this.rec.start(); } catch (e) { this.task = null; toast(micErrorMessage(e), 6000); return; } }
    this.startBtn.textContent = '■ 停止';
    this.renderState();
    const { gap, repeat } = settings();
    const last = this.sp.loop.on ? this.sp.loop.b : this.L.chunks.length - 1;
    for (let i = start; i <= last && !tok.cancel; i++) {
      const c = this.L.chunks[i];
      for (let k = 0; k < repeat && !tok.cancel; k++) {
        this.setStatus('model', c.en);
        this.sp.setCur(i);
        $$('[data-i]', this.body).forEach(r => r.classList.toggle('now', +r.dataset.i === i));
        const r = await this.sp.playChunk(i, { keepToken: tok });
        this.sp.setPlaying(false);
        if (tok.cancel) break;
        const spoken = r.duration > 0.2 ? r.duration : tts.estimateSeconds(c.en, settings().rate);
        const sec = spoken * gap + 0.5;
        const s = this.rec.elapsed();
        this.setStatus('you', '', sec);
        await wait(sec * 1000, tok);
        if (record) marks.push({ chunkId: c.id, s: Math.max(0, s - 0.1), e: this.rec.elapsed() });
      }
    }
    const finished = !tok.cancel;
    if (this.task === tok) this.task = null;
    if (this.startBtn) this.startBtn.textContent = '▶ リピーティング開始';
    this.setStatus(finished ? 'done' : 'idle');
    this.renderState();
    if (record) {
      const r = await this.rec.stop();
      if (r && marks.length) {
        const rec = await saveRecording({ lesson: this.L, ...r, mode: 'repeat', marks });
        toast('録音を保存しました');
        this.showCompare(rec, this.slot);
      }
    }
  }

  async s5(b) {
    const ok = Recorder.supported();
    this.recBtn = h('button.btn.rec.lg', { disabled: !ok, onclick: () => (this.rec.recording ? this.finishShadow() : this.startShadow()) }, '● 録音しながらシャドーイング');
    this.recState = h('div.rec-state', { 'aria-live': 'polite' });
    this.slot = h('div');
    const list = h('div.recent');
    b.append(h('div.card',
      h('div.row.wrap.center',
        h('button.btn.lg', { onclick: () => { this.cancelTask(); this.sp.playFrom(this.sp.loop.on ? this.sp.loop.a : 0, {}, { once: false }); } }, '▶ 読み上げに合わせて練習'),
        this.recBtn),
      this.recState,
      h('p.hint', ok ? 'A–Bを設定していればその範囲だけを録音します。録音中はイヤホンを使うと読み上げの音が入りにくくなります。' : 'このブラウザは録音に対応していません。ボイスメモなどで録音したファイルを取り込めます。'),
      h('div.row.wrap', h('button.btn.sm', { onclick: () => this.importRec() }, '📁 録音ファイルを取り込む'), h('a.btn.sm', { href: '#/rec' }, '録音一覧'))),
    this.slot,
    h('div.chunks', this.L.chunks.map((c, i) => this.chunkRow({ ...c, ja: (this.prog.chunkJa || {})[c.id] || '' }, i))),
    list);
    const recs = (await listRecordings(this.L.id)).slice(0, 5);
    if (recs.length) list.append(h('h3', 'この教材の録音'), h('ul.links', recs.map(r => h('li', h('a', { href: `#/rec/${r.id}` }, `${new Date(r.createdAt).toLocaleString('ja-JP')}（${fmtTime(r.duration)}）`)))));
  }
  async startShadow() {
    this.cancelTask();
    this.sp.stop();
    tts.unlock(); // must happen inside the tap, before awaiting the microphone
    if (this.compare) { this.compare.destroy(); this.compare = null; }
    try { await this.rec.start(); } catch (e) { toast(micErrorMessage(e), 6000); return; }
    this.recBtn.textContent = '■ 録音を終了';
    this.recBtn.classList.add('on');
    const marks = this.marks = [];
    const begin = i => {
      const t = this.rec.elapsed();
      if (marks.length) marks[marks.length - 1].e = t;
      marks.push({ chunkId: this.L.chunks[i].id, s: Math.max(0, t - 0.15), e: t + 3 });
    };
    const tick = () => { if (this.rec.recording) { this.recState.textContent = `● 録音中 ${fmtTime(this.rec.elapsed())}`; this.recTimer = setTimeout(tick, 300); } };
    tick();
    const from = this.sp.loop.on ? this.sp.loop.a : 0;
    const done = await this.sp.playFrom(from, {
      onStart: i => begin(i),
      onChunk: i => begin(i),
      onSentenceEnd: () => { if (marks.length) marks[marks.length - 1].e = this.rec.elapsed() + 0.6; },
    }, { once: true });
    if (done) { await wait(900); this.finishShadow(); }
  }
  async finishShadow() {
    if (!this.rec.recording || this.finishing) return;
    this.finishing = true;
    clearTimeout(this.recTimer);
    this.sp.stop();
    const r = await this.rec.stop();
    this.finishing = false;
    if (this.recBtn) { this.recBtn.textContent = '● 録音しながらシャドーイング'; this.recBtn.classList.remove('on'); }
    if (this.recState) this.recState.textContent = '';
    if (!r || !r.blob.size) { toast('録音が空でした'); return; }
    const marks = (this.marks || []).map(m => ({ ...m, e: Math.min(m.e, r.duration) }));
    const rec = await saveRecording({ lesson: this.L, ...r, mode: 'shadow', marks });
    toast('録音を保存しました。下で聞き比べできます');
    if (this.step === 5) this.showCompare(rec, this.slot);
  }
  async importRec() {
    const f = await pickFile('audio/*,video/mp4,.m4a,.mp3,.wav,.aac,.webm');
    if (!f) return;
    const url = URL.createObjectURL(f);
    const a = new Audio(url);
    const duration = await new Promise(res => { a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0); });
    URL.revokeObjectURL(url);
    const rec = await saveRecording({ lesson: this.L, blob: f, mime: f.type || 'audio/mp4', duration, mode: 'import', marks: [], name: f.name });
    toast('取り込みました');
    this.showCompare(rec, this.slot);
  }
  async showCompare(rec, slot) {
    if (this.compare) this.compare.destroy();
    const blob = await recordingBlob(rec);
    const url = URL.createObjectURL(blob);
    this.compare = createCompare({ rec, url, lesson: this.L, speaker: this.sp });
    slot.replaceChildren(h('div.card',
      h('h3', '聞き比べ'),
      this.compare.el,
      h('div.row.wrap',
        h('button.btn.sm', { onclick: () => saveFile(blob, `${safeName(this.L.title)}_${rec.id}.${extForMime(rec.mime)}`, { preferShare: true }) }, '⬇ 録音を保存'),
        h('a.btn.sm', { href: `#/rec/${rec.id}` }, '録音の詳細'))));
    slot.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  s6(b) {
    const L = this.L;
    const box = h('div.sentences', L.sentences.map((s, si) => {
      const idx = L.chunks.map((c, i) => (c.s === si ? i : -1)).filter(i => i >= 0);
      return h('div.sentence',
        h('button.play', { type: 'button', 'aria-label': `${si + 1}文目を読み上げ`, onclick: e => { e.stopPropagation(); this.sp.playIdx(idx); } }, '▶'),
        h('div.txt', h('p.en', s.en), s.ja ? h('p.ja', s.ja)
          : h('p.small', '和訳は未入力です。', h('a', { href: `https://translate.google.com/?sl=en&tl=ja&text=${encodeURIComponent(s.en)}`, target: '_blank', rel: 'noopener noreferrer' }, '翻訳サイトで確認 ↗'))));
    }));
    b.append(h('h3', '文ごとの和訳'), box);
    const qs = makeCloze(L, 5, (L.text || '').length);
    let result = null;
    if (qs.length) {
      const ans = qs.map(() => -1);
      const out = h('p.result', { 'aria-live': 'polite' });
      const fs = qs.map((q, qi) => h('fieldset.q', h('legend', `Q${qi + 1}. ${q.q}`),
        h('button.btn.xs', { type: 'button', onclick: () => this.sp.say(q.sentence) }, '🔊 文を聞く'),
        q.choices.map((c, ci) => h('label.choice', h('input', { type: 'radio', name: `q${qi}`, onchange: () => { ans[qi] = ci; } }), ' ', c))));
      b.append(h('h3', '穴うめチェック（自動作成）'), h('div.quiz', fs, h('button.btn', {
        onclick: () => {
          let sc = 0;
          qs.forEach((q, qi) => {
            $$('.choice', fs[qi]).forEach((lab, ci) => { lab.classList.toggle('ok', ci === q.answer); lab.classList.toggle('ng', ci === ans[qi] && ci !== q.answer); });
            if (ans[qi] === q.answer) sc++;
          });
          result = { score: sc, total: qs.length };
          out.textContent = `${qs.length}問中 ${sc}問 正解`;
        },
      }, '答え合わせ'), out));
    }
    const first = (this.prog.ratings || {}).first;
    const doneBox = h('div');
    b.append(h('h3', 'ふりかえり'),
      first != null ? h('p.small', `Step 1 の自己評価：「${RATINGS[first]}」`) : null,
      this.rating('final', 'いま通して聞くと、どれくらい聞き取れますか？'),
      h('div.row.center', h('button.btn.primary.lg', {
        onclick: async () => {
          this.flush();
          const r = this.prog.ratings || {};
          this.prog = await updateProgress(L.id, p => {
            p.completions.push({ at: Date.now(), score: result ? result.score : null, total: result ? result.total : null, first: r.first ?? null, final: r.final ?? null });
            p.steps[6] = Date.now();
          });
          this.renderMeta();
          toast(`完了を記録しました（${this.prog.completions.length}回目）`);
          doneBox.replaceChildren(h('div.card.done', h('p', '🎉 おつかれさまでした！'), h('div.row.wrap.center',
            h('a.btn', { href: `#/lesson/${encodeURIComponent(L.id)}/5` }, 'もう一度シャドーイング'),
            h('a.btn', { href: '#/log' }, '学習記録'),
            h('a.btn.primary', { href: '#/new' }, '新しいテキストで作る'))));
        },
      }, '✓ 完了を記録')), doneBox);
  }
}

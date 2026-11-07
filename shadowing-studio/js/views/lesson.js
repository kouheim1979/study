// Lesson practice screen: the six steps, shared player bar, display toggles, recording.
import { h, $, $$, fmtTime, toast, sleep, pickFile, saveFile } from '../util.js';
import { Player } from '../player.js';
import { micErrorMessage, Recorder } from '../recorder.js';
import { chunkAt, audioDuration, blobUrl } from '../lessons.js';
import { STEPS, getProgress, updateProgress, toggleFavorite, markStep, addStudyTime, addCompletion, setResume } from '../progress.js';
import { saveRecording, listRecordings, recordingUrl, recordingFileName, recordingBlob, reviewsFor, MODE_LABEL } from '../recordings.js';
import { createCompare } from '../compare.js';
import { settings, setSetting } from '../settings.js';

const RATES = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
const RATINGS = ['ほとんど聞き取れない', '3割くらい', '半分くらい', 'ほぼ全部'];

const STEP_GUIDE = {
  1: '英文を見ずに、まずは全体を通して聞きます。内容をどれくらいつかめたか、最後に自己評価してください。2〜3回聞いてもかまいません。',
  2: '知らない単語・発音があいまいな単語を確認します。「単語」で単独の発音、「文中」で実際の文の中での聞こえ方を比べましょう。',
  3: 'チャンク（意味のかたまり）ごとに、英語の語順のまま意味をとります。和訳をOFFにすると、タップするまで訳を隠せます。',
  4: 'お手本を1チャンク聞いたら、ポーズの間に同じように声に出します（リピーティング）。音声変化の解説も参考に、まねして言いましょう。',
  5: 'お手本を聞きながら、少し遅れて同時に声に出します（シャドーイング）。慣れたら英文をOFFに。録音して自分の声と聞き比べましょう。イヤホン推奨。',
  6: '文ごとの和訳で理解を確かめ、内容の確認問題に答えます。最初のリスニングと比べてどれくらい聞き取れるようになったか振り返りましょう。',
};

export class LessonView {
  constructor(lesson, app) {
    this.lesson = lesson;
    this.app = app;
    this.player = new Player({ baseRate: lesson.kind === 'sample' ? (lesson.appPlaybackRateAt1x || 1.08) : 1 });
    this.player.setRate(settings().rate || 1);
    this.wordPlayer = null;
    this.step = 0;
    this.prog = null;
    this.compare = null;
    this.tok = null;
    this.studyAcc = 0;
    this.lastAct = Date.now();
    this.lastChunkId = null;
    this.lastResumeSave = 0;
  }

  get recorder() { return this.app.recorder; }

  async mount(root) {
    this.root = root;
    this.prog = await getProgress(this.lesson.id);
    if (this.lesson.audioUrl) await this.player.load(this.lesson.audioUrl, this.lesson.duration);
    root.replaceChildren(this.render());
    this.applyToggles();
    const act = () => { this.lastAct = Date.now(); };
    root.addEventListener('pointerdown', act);
    root.addEventListener('keydown', act);
    this.timer = setInterval(() => this.tick(), 1000);
    this.onHide = () => { if (document.visibilityState === 'hidden') this.flush(); };
    document.addEventListener('visibilitychange', this.onHide);
    this.player.addEventListener('time', () => this.onTime());
    this.player.addEventListener('state', () => this.onState());
    this.player.addEventListener('ab', () => this.renderAB());
    this.player.addEventListener('meta', () => this.onTime());
    this.player.addEventListener('blocked', () => toast('再生できませんでした。もう一度 ▶ を押してください。'));
  }

  tick() {
    const active = document.visibilityState === 'visible' &&
      (!this.player.paused || this.recorder.recording || Date.now() - this.lastAct < 60000);
    if (active) this.studyAcc++;
    if (this.studyAcc >= 15) this.flush();
    if (!this.player.paused && Date.now() - this.lastResumeSave > 8000) this.saveResume();
  }
  flush() {
    const sec = this.studyAcc;
    this.studyAcc = 0;
    if (sec) addStudyTime(this.lesson.id, sec).then(() => { if (this.prog) { this.prog.totalSec += sec; this.renderMeta(); } }).catch(() => {});
  }
  saveResume() {
    this.lastResumeSave = Date.now();
    setResume(this.lesson.id, this.step, Math.round(this.player.time * 10) / 10).catch(() => {});
  }

  destroy() {
    this.cancelTask();
    if (this.recorder.recording) this.recorder.stop();
    this.recorder.release();
    this.saveResume();
    this.flush();
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onHide);
    if (this.compare) this.compare.destroy();
    this.player.destroy();
    if (this.wordPlayer) this.wordPlayer.destroy();
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  // ---------- layout ----------
  render() {
    const L = this.lesson;
    this.favBtn = h('button.icon-btn.fav', { 'aria-label': 'お気に入り', onclick: () => this.toggleFav() }, '☆');
    this.metaEl = h('span.meta');
    this.stepNav = h('nav.steps', { 'aria-label': '練習ステップ' }, STEPS.map(s =>
      h('a.step', { href: `#/lesson/${encodeURIComponent(L.id)}/${s.n}`, dataset: { n: s.n } },
        h('span.n', String(s.n)), h('span.l', s.label))));
    this.togglesEl = h('div.toggles', { role: 'group', 'aria-label': '表示切り替え' },
      this.toggleBtn('showEn', '英文'), this.toggleBtn('showJa', '和訳'), this.toggleBtn('showNote', '解説'));
    this.body = h('div.step-body');
    this.body.addEventListener('click', e => this.onBodyClick(e));
    const view = h('div.lesson-view',
      h('header.lesson-head',
        h('a.back', { href: '#/library', 'aria-label': '教材一覧へ' }, '‹ 教材'),
        h('div.lh-main',
          h('h1', L.title),
          h('div.sub', h('span.badge.lv', L.level || '—'), h('span.badge', L.theme || 'テーマなし'),
            L.titleJa ? h('span', L.titleJa) : null,
            L.kind === 'sample' ? h('span', 'お手本音声: Kokoro-82M') : null, this.metaEl)),
        L.kind === 'user' ? h('a.icon-btn', { href: `#/edit/${encodeURIComponent(L.id)}`, 'aria-label': '教材を編集' }, '✎') : null,
        this.favBtn),
      this.stepNav,
      this.togglesEl,
      this.body,
      this.renderPlayerBar());
    this.renderFav();
    this.renderMeta();
    return view;
  }

  toggleBtn(key, label) {
    return h('button.toggle', {
      type: 'button', dataset: { key }, 'aria-pressed': String(!!settings()[key]),
      onclick: e => {
        setSetting(key, !settings()[key]);
        e.currentTarget.setAttribute('aria-pressed', String(settings()[key]));
        $$('.revealed', this.body).forEach(x => x.classList.remove('revealed'));
        this.applyToggles();
      },
    }, label);
  }
  applyToggles() {
    const s = settings();
    this.root.classList.toggle('hide-en', !s.showEn);
    this.root.classList.toggle('hide-ja', !s.showJa);
    this.root.classList.toggle('hide-note', !s.showNote);
  }
  renderFav() {
    this.favBtn.textContent = this.prog.favorite ? '★' : '☆';
    this.favBtn.classList.toggle('on', !!this.prog.favorite);
    this.favBtn.setAttribute('aria-pressed', String(!!this.prog.favorite));
  }
  renderMeta() {
    const done = this.prog.completions.length;
    this.metaEl.textContent = `学習 ${Math.round(this.prog.totalSec / 60)}分${done ? ` ・完了 ${done}回` : ''}`;
    $$('.step', this.stepNav).forEach(a => {
      const n = +a.dataset.n;
      a.classList.toggle('done', !!this.prog.steps[n]);
      a.classList.toggle('active', n === this.step);
      if (n === this.step) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
  }
  async toggleFav() { this.prog = await toggleFavorite(this.lesson.id); this.renderFav(); }

  renderPlayerBar() {
    const p = this.player;
    this.seek = h('input.seek', { type: 'range', min: 0, max: this.lesson.duration || 1, step: 0.01, value: 0, 'aria-label': '再生位置' });
    this.seek.addEventListener('input', () => { this.dragging = true; this.timeLbl.textContent = fmtTime(+this.seek.value); });
    this.seek.addEventListener('change', () => { this.dragging = false; p.seek(+this.seek.value); });
    this.abBand = h('div.ab-band');
    this.timeLbl = h('span.time', '0:00');
    this.durLbl = h('span.time.dur', fmtTime(this.lesson.duration));
    this.playBtn = h('button.btn.round.primary', { 'aria-label': '再生', onclick: () => this.togglePlay() }, '▶');
    const rateSel = h('select.rate', { 'aria-label': '再生速度', onchange: e => { p.setRate(+e.target.value); setSetting('rate', +e.target.value); } },
      RATES.map(r => h('option', { value: r, selected: r === p.rate },
        this.lesson.kind === 'sample' && r === 0.9 ? '0.9x（ゆっくり）' :
        this.lesson.kind === 'sample' && r === 1 ? '1.0x（標準）' : `${r}x`)));
    this.abLbl = h('span.ab-lbl');
    this.abClear = h('button.btn.sm', { onclick: () => p.clearAB(), 'aria-label': 'A–B解除' }, '✕');
    this.abNudge = h('span.ab-nudge',
      h('button.btn.xs', { onclick: () => this.nudgeAB('a', -0.1), 'aria-label': 'Aを0.1秒前へ' }, 'A−'),
      h('button.btn.xs', { onclick: () => this.nudgeAB('a', 0.1), 'aria-label': 'Aを0.1秒後へ' }, 'A+'),
      h('button.btn.xs', { onclick: () => this.nudgeAB('b', -0.1), 'aria-label': 'Bを0.1秒前へ' }, 'B−'),
      h('button.btn.xs', { onclick: () => this.nudgeAB('b', 0.1), 'aria-label': 'Bを0.1秒後へ' }, 'B+'));
    this.bar = h('div.playerbar',
      h('div.pb-seek', h('div.seek-wrap', this.abBand, this.seek), h('div.pb-times', this.timeLbl, this.durLbl)),
      h('div.pb-row',
        h('button.btn.icon', { onclick: () => this.jumpChunk(-1), 'aria-label': '前のチャンク' }, '⏮'),
        this.playBtn,
        h('button.btn.icon', { onclick: () => this.jumpChunk(1), 'aria-label': '次のチャンク' }, '⏭'),
        rateSel,
        h('button.btn.ab', { onclick: () => { p.setA(p.time); toast(`A = ${fmtTime(p.time, 1)}`); }, 'aria-label': 'A地点を設定' }, 'A'),
        h('button.btn.ab', { onclick: () => { if (!p.setB(p.time)) toast('B は A より後ろに設定してください'); }, 'aria-label': 'B地点を設定' }, 'B')),
      h('div.pb-ab', this.abLbl, this.abNudge, this.abClear));
    this.renderAB();
    return this.bar;
  }
  nudgeAB(k, d) {
    const ab = this.player.ab;
    if (ab[k] == null) return;
    const v = Math.max(0, Math.round((ab[k] + d) * 100) / 100);
    if (k === 'a' && ab.b != null && v >= ab.b) return;
    if (k === 'b' && v <= ab.a) return;
    ab[k] = v;
    this.renderAB();
  }
  renderAB() {
    const ab = this.player.ab;
    const d = this.player.duration || this.lesson.duration || 1;
    const show = ab.a != null;
    this.bar.querySelector('.pb-ab').hidden = !show;
    if (show) {
      this.abLbl.textContent = ab.on ? `A–Bリピート ${fmtTime(ab.a, 1)} – ${fmtTime(ab.b, 1)}` : `A ${fmtTime(ab.a, 1)} – B を設定`;
      const right = ab.b != null ? ab.b : ab.a + 0.05 * d;
      Object.assign(this.abBand.style, { display: 'block', left: `${(ab.a / d) * 100}%`, width: `${Math.max(0.5, ((right - ab.a) / d) * 100)}%` });
      this.abBand.classList.toggle('partial', !ab.on);
    } else this.abBand.style.display = 'none';
  }

  togglePlay() {
    const p = this.player;
    this.cancelTask(false);
    if (!p.paused) { p.pause(); return; }
    if (p.ab.on && (p.time < p.ab.a || p.time >= p.ab.b)) p.seek(p.ab.a);
    else if (p.time >= (p.duration || 0) - 0.05) p.seek(0);
    p.range = null;
    p.play();
  }
  jumpChunk(dir) {
    const cs = this.lesson.chunks;
    if (!cs.length) return;
    const t = this.player.time;
    let i = cs.findIndex(c => t >= c.start && t < c.end);
    if (i < 0) i = dir > 0 ? cs.findIndex(c => c.start > t) - 1 : cs.findIndex(c => c.start > t);
    if (dir < 0 && i >= 0 && t - cs[i].start > 0.6) i += 1; // restart current chunk first
    const j = Math.max(0, Math.min(cs.length - 1, i + dir));
    const wasPlaying = !this.player.paused;
    this.player.range = null;
    this.player.seek(cs[j].start);
    if (wasPlaying) this.player.play();
  }

  onState() {
    const playing = !this.player.paused;
    this.playBtn.textContent = playing ? '⏸' : '▶';
    this.playBtn.setAttribute('aria-label', playing ? '一時停止' : '再生');
    if (!playing) this.saveResume();
    if (this.step === 1 && playing && this.player.time < 0.5) this.countListen();
  }
  onTime() {
    const t = this.player.time;
    if (!this.dragging) { this.seek.max = this.player.duration || this.lesson.duration || 1; this.seek.value = t; this.timeLbl.textContent = fmtTime(t); }
    this.durLbl.textContent = fmtTime(this.player.duration || this.lesson.duration);
    const c = chunkAt(this.lesson, t);
    const id = c ? c.id : null;
    if (id !== this.lastChunkId) {
      this.lastChunkId = id;
      $$('[data-cid]', this.body).forEach(r => r.classList.toggle('now', r.dataset.cid === id));
      if (id && !this.player.paused && this.follow) {
        const row = this.body.querySelector(`[data-cid="${id}"]`);
        if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  playChunk(c, opts = {}) {
    this.cancelTask(false);
    this.player.unlock();
    return this.player.playRange(c.start, c.end, opts);
  }
  loopChunk(c) {
    this.cancelTask(false);
    this.player.setAB(c.start, c.end);
    this.player.playFrom(c.start);
    toast('このチャンクをA–Bリピート中（✕で解除）');
  }

  onBodyClick(e) {
    const masked = this.maskedTarget(e.target);
    if (masked) { masked.classList.add('revealed'); return; }
    const row = e.target.closest('[data-cid]');
    if (!row) return;
    const c = this.lesson.chunks.find(x => x.id === row.dataset.cid);
    if (!c) return;
    if (e.target.closest('.cloop')) return this.loopChunk(c);
    if (e.target.closest('.cplay, .ctext')) {
      return this.playChunk(c);
    }
  }

  /** The hidden (masked) text element under the tap, if any. */
  maskedTarget(target) {
    const el = target.closest('.tx-en, .tx-ja, .tx-note');
    if (!el || el.classList.contains('revealed')) return null;
    const s = settings();
    const hidden = (el.classList.contains('tx-en') && !s.showEn) || (el.classList.contains('tx-ja') && !s.showJa) || (el.classList.contains('tx-note') && !s.showNote);
    return hidden ? el : null;
  }

  chunkRow(c, extra = null) {
    return h('div.chunk', { dataset: { cid: c.id } },
      h('button.cplay', { type: 'button', 'aria-label': `再生: ${c.en}` }, '▶'),
      h('div.ctext',
        h('p.tx-en', c.en),
        c.ja ? h('p.tx-ja', c.ja) : null,
        c.note ? h('p.tx-note', c.note) : null,
        extra),
      h('button.cloop', { type: 'button', 'aria-label': 'このチャンクをA–Bリピート', title: 'A–Bリピート' }, '⟲'));
  }

  cancelTask(stopPlayer = true) {
    if (this.tok) {
      this.tok.cancel = true;
      if (this.tok.wake) this.tok.wake();
      this.tok = null;
      if (this.player._cancel) { const c = this.player._cancel; this.player._cancel = null; c(); }
      if (this.onTaskCancel) this.onTaskCancel();
    }
    if (stopPlayer) this.player.stop();
  }

  // ---------- steps ----------
  async showStep(n, query = {}) {
    n = Math.min(6, Math.max(1, n | 0 || 1));
    if (this.recorder.recording && n !== this.step) await this.finishShadowRec();
    this.cancelTask();
    if (this.compare) { this.compare.destroy(); this.compare = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
    this.step = n;
    this.onTaskCancel = null;
    this.status = null;
    this.follow = n === 3 || n === 5;
    this.togglesEl.hidden = n === 1 || n === 2;
    this.root.classList.toggle('step-1', n === 1);
    const s = STEPS[n - 1];
    const body = this.body;
    body.replaceChildren(
      h('div.step-title', h('span.step-icon', s.icon), h('h2', `Step ${n}　${s.title}`)),
      h('p.guide', STEP_GUIDE[n]));
    if (!this.lesson.audioUrl) body.append(h('p.warn', 'この教材には音声がありません。教材の編集画面で音声ファイルを登録してください。'));
    await this[`step${n}`](body);
    body.append(this.nextNav(n));
    this.lastChunkId = undefined;
    this.onTime();
    this.renderMeta();
    if (query.ab) {
      const c = this.lesson.chunks.find(x => x.id === query.ab);
      if (c) { this.player.setAB(c.start, c.end); this.player.seek(c.start); toast('添削箇所をA–Bリピートに設定しました。▶で再生'); const row = body.querySelector(`[data-cid="${c.id}"]`); if (row) { row.classList.add('flash'); row.scrollIntoView({ block: 'center' }); } }
    } else if (query.t != null && !isNaN(+query.t)) this.player.seek(+query.t);
    this.saveResume();
    window.scrollTo(0, 0);
  }

  nextNav(n) {
    const L = this.lesson;
    return h('div.next-nav',
      n > 1 ? h('a.btn', { href: `#/lesson/${encodeURIComponent(L.id)}/${n - 1}` }, `‹ Step ${n - 1}`) : h('span'),
      n < 6 ? h('button.btn.primary', {
        onclick: async () => {
          this.prog = await markStep(L.id, n);
          this.app.navigate(`#/lesson/${encodeURIComponent(L.id)}/${n + 1}`);
        },
      }, `できた！ Step ${n + 1}「${STEPS[n].title}」へ ›`) : h('span'));
  }

  ratingRow(key, label) {
    const cur = this.prog.ratings ? this.prog.ratings[key] : undefined;
    const row = h('div.rating', { role: 'radiogroup', 'aria-label': label },
      h('p.small', label),
      h('div.chips', RATINGS.map((r, i) => h('button.chip', {
        type: 'button', role: 'radio', 'aria-checked': String(cur === i),
        onclick: async ev => {
          const btn = ev.currentTarget;
          $$('.chip', row).forEach(b => b.setAttribute('aria-checked', 'false'));
          btn.setAttribute('aria-checked', 'true');
          this.prog = await updateProgress(this.lesson.id, p => { p.ratings = { ...(p.ratings || {}), [key]: i }; });
        },
      }, r))));
    return row;
  }

  countListen() {
    const now = Date.now();
    if (now - (this.lastListen || 0) < 3000) return;
    this.lastListen = now;
    this.listens = (this.listens || 0) + 1;
    if (this.listenEl) this.listenEl.textContent = `${this.listens}回目`;
  }

  // Step 1: listening without the script
  step1(body) {
    this.listens = 0;
    this.listenEl = h('span.count', '0回');
    body.append(
      h('div.card.center',
        h('div.big-ear', '👂'),
        h('p', '英文・和訳は表示されません。まず音だけに集中しましょう。'),
        h('div.row.center',
          h('button.btn.primary.lg', { onclick: () => { this.player.clearAB(); this.player.unlock(); this.player.playFrom(0); } }, '▶ 最初から通して聞く')),
        h('p.small', '再生回数: ', this.listenEl)),
      this.ratingRow('first', '内容をどれくらい聞き取れましたか？（あとで最終チェックと比べます）'));
  }

  // Step 2: words
  step2(body) {
    const L = this.lesson;
    if (!L.words.length) {
      body.append(h('p.card', 'この教材には単語リストがありません。教材の編集画面で「単語 | 意味 | メモ」の形で追加できます。チャンクの解説を見ながら次へ進んでもかまいません。'));
      return;
    }
    if (L.wordsAudioUrl && !this.wordPlayer) { this.wordPlayer = new Player(); this.wordPlayer.load(L.wordsAudioUrl); }
    const known = (this.prog.known || {});
    const list = h('div.words');
    for (const w of L.words) {
      const chunk = L.chunks.find(c => c.id === w.chunkId) ||
        L.chunks.find(c => c.en.toLowerCase().split(/[^a-z']+/).includes(w.w.toLowerCase()));
      const cb = h('input', { type: 'checkbox', checked: !!known[w.w] });
      cb.addEventListener('change', async () => { this.prog = await updateProgress(L.id, p => { p.known = { ...(p.known || {}), [w.w]: cb.checked }; }); });
      list.append(h('div.word-card',
        h('div.wc-head', h('span.w', w.w), w.ipa ? h('span.ipa', w.ipa) : null, w.pos ? h('span.badge', w.pos) : null),
        h('div.wc-ja', w.ja || ''),
        w.tip ? h('div.wc-tip', '発音: ', w.tip) : null,
        chunk ? h('div.wc-ex', '文中: ', chunk.en) : null,
        h('div.row.wrap',
          h('button.btn.sm', { onclick: () => this.playWord(w, 1) }, '▶ 単語'),
          h('button.btn.sm', { onclick: () => this.playWord(w, 0.7) }, '▶ ゆっくり'),
          chunk && L.audioUrl ? h('button.btn.sm', { onclick: () => this.playChunk(chunk) }, '▶ 文中で聞く') : null,
          h('label.check', cb, ' 覚えた'))));
    }
    body.append(list);
  }
  playWord(w, rate) {
    this.cancelTask();
    if (this.wordPlayer && w.end) {
      this.wordPlayer.setRate(rate);
      this.wordPlayer.playRange(w.start, w.end);
      return;
    }
    if (window.speechSynthesis) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(w.w);
      u.lang = 'en-US'; u.rate = rate;
      speechSynthesis.speak(u);
      toast('端末の合成音声で読み上げています');
    } else toast('この教材には単語音声がありません。「文中で聞く」を使ってください。');
  }

  // Step 3: chunk meaning
  step3(body) {
    body.append(h('p.hint', '▶ またはテキストをタップでそのチャンクを再生、⟲でA–Bリピート。非表示にした項目はタップで1つずつ表示できます。'),
      h('div.chunks', this.lesson.chunks.map(c => this.chunkRow(c))));
  }

  // Step 4: repeating
  step4(body) {
    const s = settings();
    const gapSel = h('select', { 'aria-label': 'ポーズの長さ', onchange: e => setSetting('repeatGap', +e.target.value) },
      [[1, '短め（×1.0）'], [1.5, 'ふつう（×1.5）'], [2, '長め（×2.0）'], [3, 'たっぷり（×3.0）']].map(([v, l]) => h('option', { value: v, selected: v === s.repeatGap }, l)));
    const cntSel = h('select', { 'aria-label': '繰り返し回数', onchange: e => setSetting('repeatCount', +e.target.value) },
      [1, 2, 3].map(v => h('option', { value: v, selected: v === s.repeatCount }, `${v}回ずつ`)));
    this.recCheck = h('input', { type: 'checkbox' });
    this.status = h('div.repeat-status', { 'aria-live': 'polite' }, h('span.st-label', '待機中'), h('div.st-bar', h('div.st-fill')));
    this.startBtn = h('button.btn.primary.lg', { onclick: () => (this.tok ? this.cancelTask() : this.runRepeat(0)) }, '▶ リピーティング開始');
    this.onTaskCancel = () => { this.startBtn.textContent = '▶ リピーティング開始'; this.setStatus('idle'); };
    body.append(
      h('div.card',
        h('div.row.wrap', h('label', 'ポーズ ', gapSel), h('label', '回数 ', cntSel),
          Recorder.supported() ? h('label.check', this.recCheck, ' 練習を録音する') : null),
        h('div.row.center', this.startBtn),
        this.status),
      h('p.hint', 'チャンクの▶で1つだけ再生、テキストをタップするとそこから開始します（停止中のみ）。'),
      h('div.chunks', this.lesson.chunks.map(c => this.chunkRow(c))),
      this.compareSlot = h('div'));
    body.querySelector('.chunks').addEventListener('click', e => {
      const row = e.target.closest('[data-cid]');
      if (row && e.target.closest('.ctext') && !this.tok && !this.maskedTarget(e.target)) {
        e.stopPropagation();
        this.runRepeat(this.lesson.chunks.findIndex(c => c.id === row.dataset.cid));
      }
    }, true);
  }
  setStatus(kind, c, sec) {
    if (!this.status) return;
    const label = this.status.querySelector('.st-label');
    const fill = this.status.querySelector('.st-fill');
    this.status.dataset.kind = kind;
    fill.style.transition = 'none';
    fill.style.width = '0%';
    if (kind === 'model') label.textContent = `🔊 お手本: ${settings().showEn ? c.en : '（英文非表示）'}`;
    else if (kind === 'you') {
      label.textContent = '🎤 あなたの番：声に出して言ってみましょう';
      fill.getBoundingClientRect();
      fill.style.transition = `width ${sec}s linear`;
      fill.style.width = '100%';
    } else label.textContent = kind === 'done' ? 'おつかれさまでした！' : '待機中';
  }
  async runRepeat(startIdx) {
    this.cancelTask();
    if (this.compare) { this.compare.destroy(); this.compare = null; }
    this.player.unlock();
    this.player.clearAB();
    const tok = this.tok = { cancel: false };
    const record = this.recCheck && this.recCheck.checked;
    const marks = [];
    if (record) {
      try { await this.recorder.start(); } catch (e) { this.tok = null; toast(micErrorMessage(e), 6000); return; }
    }
    this.startBtn.textContent = '■ 停止';
    const { repeatGap, repeatCount } = settings();
    const cs = this.lesson.chunks;
    for (let i = Math.max(0, startIdx); i < cs.length && !tok.cancel; i++) {
      const c = cs[i];
      for (let k = 0; k < repeatCount && !tok.cancel; k++) {
        this.setStatus('model', c);
        await new Promise(res => { this.player._cancel = res; this.player.playRange(c.start, c.end, { onEnd: res }); });
        this.player._cancel = null;
        if (tok.cancel) break;
        const gap = ((c.end - c.start) / this.player.effectiveRate) * repeatGap + 0.4;
        const s = this.recorder.elapsed();
        this.setStatus('you', c, gap);
        await new Promise(res => { tok.wake = res; setTimeout(res, gap * 1000); });
        if (record) marks.push({ chunkId: c.id, s: Math.max(0, s - 0.1), e: this.recorder.elapsed() });
      }
    }
    const finished = !tok.cancel;
    if (this.tok === tok) this.tok = null;
    this.startBtn.textContent = '▶ リピーティング開始';
    this.setStatus(finished ? 'done' : 'idle');
    if (record) {
      const r = await this.recorder.stop();
      if (r && marks.length) {
        const rec = await saveRecording({ lesson: this.lesson, ...r, mode: 'repeat', marks });
        toast('録音を保存しました');
        this.showCompare(rec, this.compareSlot);
      }
    }
  }

  // Step 5: shadowing + recording
  async step5(body) {
    const supported = Recorder.supported();
    this.recBtn = h('button.btn.rec.lg', { onclick: () => (this.recorder.recording ? this.finishShadowRec() : this.startShadowRec()), disabled: !supported || !this.lesson.audioUrl }, '● 録音しながらシャドーイング');
    this.recState = h('div.rec-state', { 'aria-live': 'polite' });
    this.compareSlot = h('div');
    const recent = h('div.recent');
    body.append(
      h('div.card',
        h('div.row.wrap.center',
          h('button.btn.lg', { onclick: () => { this.cancelTask(); this.player.unlock(); const ab = this.player.ab; this.player.playFrom(ab.on ? ab.a : 0); } }, '▶ お手本だけで練習'),
          this.recBtn),
        this.recState,
        h('p.hint', supported
          ? 'A–Bを設定している場合は、その区間だけを録音します。iPhoneではイヤホンを使うと、お手本の音が録音に入りにくく聞き比べやすくなります。'
          : 'このブラウザでは録音できません。ボイスメモなどで録音したファイルを取り込んでください。'),
        h('div.row.wrap',
          h('button.btn.sm', { onclick: () => this.importRecording() }, '📁 録音ファイルを取り込む'),
          h('a.btn.sm', { href: '#/recordings' }, '録音一覧'))),
      this.compareSlot,
      h('div.chunks', this.lesson.chunks.map(c => this.chunkRow(c))),
      recent);
    const recs = (await listRecordings(this.lesson.id)).slice(0, 5);
    if (recs.length) {
      recent.append(h('h3', 'この教材の録音'), h('ul.rec-mini', recs.map(r => h('li',
        h('a', { href: `#/rec/${r.id}` }, `${new Date(r.createdAt).toLocaleString('ja-JP')}　${MODE_LABEL[r.mode] || ''}　${fmtTime(r.duration)}`)))));
    }
  }
  async startShadowRec() {
    this.cancelTask();
    if (this.compare) { this.compare.destroy(); this.compare = null; }
    const p = this.player;
    p.unlock();
    const ab = p.ab;
    const from = ab.on ? ab.a : 0;
    const to = ab.on ? ab.b : (p.duration || this.lesson.duration);
    try { await this.recorder.start(); } catch (e) { toast(micErrorMessage(e), 6000); return; }
    this.recBtn.textContent = '■ 録音を終了';
    this.recBtn.classList.add('on');
    this.recRun = { from, to, rate: p.effectiveRate, leadIn: 0 };
    const ok = await p.playRange(from, to, { onEnd: () => setTimeout(() => this.finishShadowRec(), 400) });
    this.recRun.leadIn = this.recorder.elapsed();
    if (!ok) {
      await this.recorder.stop();
      this.recBtn.textContent = '● 録音しながらシャドーイング';
      this.recBtn.classList.remove('on');
      toast('お手本を再生できませんでした。もう一度押してください。');
      return;
    }
    const tick = () => {
      if (!this.recorder.recording) return;
      this.recState.textContent = `● 録音中 ${fmtTime(this.recorder.elapsed())}`;
      this.recTimer = setTimeout(tick, 250);
    };
    tick();
  }
  async finishShadowRec() {
    if (!this.recorder.recording || this.finishing) return;
    this.finishing = true;
    clearTimeout(this.recTimer);
    this.player.stop();
    const run = this.recRun;
    const r = await this.recorder.stop();
    this.finishing = false;
    if (this.recBtn) { this.recBtn.textContent = '● 録音しながらシャドーイング'; this.recBtn.classList.remove('on'); }
    if (this.recState) this.recState.textContent = '';
    if (!r || !r.blob.size) { toast('録音データが空でした'); return; }
    const rec = await saveRecording({
      lesson: this.lesson, ...r, mode: 'shadow',
      sync: { modelStart: run.from, leadIn: run.leadIn, rate: run.rate, offset: 0 }, from: run.from, to: run.to,
    });
    toast('録音を保存しました。下で聞き比べできます');
    if (this.step === 5) this.showCompare(rec, this.compareSlot);
  }
  async importRecording() {
    const f = await pickFile('audio/*,video/mp4,.m4a,.mp3,.wav,.aac,.webm,.caf');
    if (!f) return;
    const url = URL.createObjectURL(f);
    const duration = await audioDuration(url);
    URL.revokeObjectURL(url);
    const ab = this.player.ab;
    const from = ab.on ? ab.a : 0;
    const rec = await saveRecording({
      lesson: this.lesson, blob: f, mime: f.type || 'audio/mp4', duration, mode: 'import', name: f.name,
      sync: { modelStart: from, leadIn: 0, rate: 1, offset: 0 }, from,
    });
    toast('録音ファイルを取り込みました（開始位置がずれる場合は「ずれ補正」で調整）', 4000);
    this.showCompare(rec, this.compareSlot);
  }
  async showCompare(rec, slot) {
    if (this.compare) this.compare.destroy();
    const url = await recordingUrl(rec);
    const comments = (await reviewsFor(rec.id)).flatMap(r => r.comments);
    this.player.stop();
    this.compare = createCompare({ rec, lesson: this.lesson, recUrl: url, comments });
    slot.replaceChildren(h('div.card',
      h('h3', '聞き比べ'),
      this.compare.el,
      h('div.row.wrap',
        h('button.btn.sm', { onclick: async () => saveFile(await recordingBlob(rec), recordingFileName(rec), { preferShare: true }) }, '⬇ 録音を保存'),
        h('a.btn.sm', { href: `#/rec/${rec.id}` }, '詳細・添削依頼'))));
    slot.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // Step 6: translation + comprehension
  step6(body) {
    const L = this.lesson;
    const sents = h('div.sentences', L.sentences.map((s, i) => {
      const cs = L.chunks.filter(c => (s.chunkIds || []).includes(c.id));
      const play = cs.length ? () => this.playChunk({ start: cs[0].start, end: cs[cs.length - 1].end }) : null;
      return h('div.sentence',
        h('button.cplay', { type: 'button', onclick: e => { e.stopPropagation(); if (play) play(); }, disabled: !play, 'aria-label': `${i + 1}文目を再生` }, '▶'),
        h('div.ctext', h('p.tx-en', s.en), s.ja ? h('p.tx-ja', s.ja) : null));
    }));
    body.append(h('h3', '文ごとの和訳'), sents);

    let quizResult = null;
    if (L.quiz.length) {
      const answers = new Array(L.quiz.length).fill(-1);
      const resultEl = h('p.quiz-result', { 'aria-live': 'polite' });
      const qs = L.quiz.map((q, qi) => h('fieldset.quiz-q',
        h('legend', `Q${qi + 1}. ${q.q}`),
        q.choices.map((ch, ci) => h('label.choice',
          h('input', { type: 'radio', name: `q${qi}`, value: ci, onchange: () => { answers[qi] = ci; } }), ' ', ch))));
      body.append(h('h3', '内容の確認'), h('div.quiz', qs,
        h('button.btn', {
          onclick: () => {
            let score = 0;
            L.quiz.forEach((q, qi) => {
              const fs = qs[qi];
              $$('.choice', fs).forEach((lab, ci) => {
                lab.classList.toggle('correct', ci === q.answer);
                lab.classList.toggle('wrong', ci === answers[qi] && ci !== q.answer);
              });
              if (answers[qi] === q.answer) score++;
            });
            quizResult = { score, total: L.quiz.length };
            resultEl.textContent = `${L.quiz.length}問中 ${score}問 正解`;
          },
        }, '答え合わせ'), resultEl));
    }
    const first = this.prog.ratings && this.prog.ratings.first;
    body.append(h('h3', 'ふりかえり'),
      first != null ? h('p.small', `Step 1 の自己評価: 「${RATINGS[first]}」`) : null,
      this.ratingRow('final', 'いま、通して聞くとどれくらい聞き取れますか？'),
      h('div.row.center', h('button.btn.primary.lg', {
        onclick: async () => {
          this.flush();
          const r = this.prog.ratings || {};
          this.prog = await addCompletion(L.id, {
            quizScore: quizResult ? quizResult.score : null, quizTotal: quizResult ? quizResult.total : null,
            firstRating: r.first ?? null, finalRating: r.final ?? null,
          });
          this.renderMeta();
          toast(`完了を記録しました（${this.prog.completions.length}回目）`);
          doneEl.replaceChildren(h('div.card.done-card',
            h('p', '🎉 おつかれさまでした！ 完了履歴に記録しました。'),
            h('div.row.wrap.center',
              h('a.btn', { href: `#/lesson/${encodeURIComponent(L.id)}/5` }, 'もう一度シャドーイング'),
              h('a.btn', { href: '#/history' }, '学習記録を見る'),
              h('a.btn.primary', { href: '#/library' }, '次の教材を選ぶ'))));
        },
      }, '✓ この教材の完了を記録')));
    const doneEl = h('div');
    body.append(doneEl);
  }
}

export { blobUrl };

// End-to-end check in headless Chromium. Speech synthesis is replaced by a timed fake
// (headless Linux has no voices), the microphone by Chromium's fake device.
//   npx http-server -p 8080 -c-1     (repository root)
//   BASE=http://127.0.0.1:8080/echo-lines/ node echo-lines/tests/e2e.cjs [screenshotDir]
const { chromium, devices } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8080/echo-lines/';
const SHOTS = process.argv[2] || null;
const results = [];
const ok = (n, c, d = '') => { results.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? `  (${d})` : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'el-e2e-'));

const FAKE_TTS = () => {
  const log = window.__spoken = [];
  class U { constructor(t) { this.text = t; this.rate = 1; this.volume = 1; } }
  let cur = null, timers = [];
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const synth = {
    speaking: false,
    getVoices: () => [{ name: 'Fake US', lang: 'en-US', voiceURI: 'fake-us', localService: true, default: true }],
    addEventListener() {},
    speak(u) {
      if (cur) { const p = cur; cur = null; clear(); p.onerror && p.onerror({ error: 'interrupted' }); }
      cur = u; log.push(u.text);
      const words = u.text.split(/\s+/);
      const per = 90 / (u.rate || 1);
      timers.push(setTimeout(() => {
        u.onstart && u.onstart();
        let pos = 0;
        words.forEach((w, i) => { const ci = pos; timers.push(setTimeout(() => u.onboundary && u.onboundary({ name: 'word', charIndex: ci }), i * per)); pos += w.length + 1; });
        timers.push(setTimeout(() => { if (cur === u) { cur = null; u.onend && u.onend(); } }, words.length * per + 50));
      }, 20));
    },
    cancel() { if (cur) { const p = cur; cur = null; clear(); p.onerror && p.onerror({ error: 'canceled' }); } },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = U;
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], isMobile: false, permissions: ['microphone'], acceptDownloads: true });
  await ctx.addInitScript(FAKE_TTS);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${n}.png`) }); };
  const spoken = () => p.evaluate(() => window.__spoken.slice());
  const lv = () => p.evaluate(() => { const v = window.__echo.lesson; return v ? { cur: v.sp.cur, playing: v.sp.playing, loop: v.sp.loop } : null; });

  // 1. home with examples
  await p.goto(BASE);
  await p.waitForSelector('.item');
  ok('初回から例文テキストが表示される', (await p.locator('.list .item').count()) >= 3);
  await shot('01-home');

  // 2. upload a text file -> automatic decomposition
  const txt = path.join(tmp, 'my-text.txt');
  fs.writeFileSync(txt, `1\n00:00:01,000 --> 00:00:03,000\nTom: Hi, I'm Tom. I want to check in, please.\n\n2\n00:00:04,000 --> 00:00:07,000\nLast weekend, I took a train to Kyoto with my sister, and we wanted to visit some old temples before it got crowded.\nWould you like to join us next time? It was a lot of fun.`);
  await p.click('a[data-tab="new"]');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('button:has-text("テキストファイルを選ぶ")')]);
  await fc.setFiles(txt);
  await p.waitForSelector('.preview .card');
  const pv = await p.textContent('.preview');
  ok('テキストファイルを読み込み、字幕の番号・時刻・話者名を除去', pv.includes('5文') && !(await p.textContent('.pv-chunks')).match(/-->|Tom:|^1 /), pv.slice(0, 40));
  ok('文とチャンクに自動分解される', /5文・\d+チャンク/.test(pv), pv.match(/\d+文・\d+チャンク/)?.[0]);
  await p.fill('textarea[aria-label="和訳"]', 'こんにちは、トムです。\nチェックインをお願いします。\n先週末、妹と電車で京都に行きました。\n次は一緒に来ませんか？\nとても楽しかったです。');
  await p.fill('input[aria-label="テーマ"]', '旅行');
  await shot('02-create');
  await p.click('button:has-text("この内容で作成")');
  await p.waitForSelector('.st');
  ok('作成後すぐに Step 1 が開く', (await p.textContent('.st')).includes('Step 1'));
  const id = decodeURIComponent(p.url().split('#/lesson/')[1].split('/')[0]);

  // 3. step 1: whole-text read aloud
  await p.click('button:has-text("最初から通して聞く")');
  await p.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 8000 });
  const sp1 = await spoken();
  ok('端末の読み上げで文ごとに再生される', sp1.some(s => s.startsWith('Hi')), sp1.slice(0, 2).join(' | '));
  await p.click('.bar .btn.round');
  await p.locator('.rating .chip').nth(1).click();

  // 4. step 2: keywords
  await p.click('a.step[data-n="2"]');
  await p.waitForSelector('.word');
  const kw = await p.locator('.word .w').allTextContents();
  ok('キーワードを自動抽出（固有名詞は除外）', kw.length >= 3 && !kw.includes('kyoto'), kw.join(','));
  await p.locator('.word').first().locator('button:has-text("▶ 単語")').click();
  await p.waitForTimeout(300);
  ok('単語を読み上げる', (await spoken()).includes(kw[0]));
  await p.locator('.word input').first().fill('テスト意味');
  await p.locator('.word input').first().dispatchEvent('change');

  // 5. step 3: chunks, notes, highlight, toggles
  await p.click('a.step[data-n="3"]');
  await p.waitForSelector('.chunk');
  const notes = await p.locator('.note').allTextContents();
  ok('音のつながり・脱落・弱形の解説を自動生成', notes.some(n => /wanna|ワナ/.test(n)) && notes.some(n => /弱く短く/.test(n)) && notes.some(n => /つながり|弾音/.test(n)));
  ok('和訳が文に対応づけられる', (await p.textContent('.chunks')).includes('先週末、妹と電車で京都に行きました'));
  await p.locator('.chunk').nth(2).locator('.play').click();
  await p.waitForTimeout(150);
  const hl = await p.locator('.chunk.now').getAttribute('data-i').catch(() => null);
  ok('読み上げ中のチャンクを強調', hl === '2', `now=${hl}`);
  await p.waitForFunction(() => !window.__echo.lesson.sp.playing, null, { timeout: 6000 });
  await p.getByRole('button', { name: '和訳' }).click();
  const masked = await p.locator('.sent-head .ja').first().evaluate(e => getComputedStyle(e).color);
  ok('和訳の表示を切り替えられる', masked === 'rgba(0, 0, 0, 0)');
  await p.getByRole('button', { name: '和訳' }).click();
  await p.locator('.chunk').nth(3).locator('.loop').click();
  await p.waitForTimeout(2600);
  const st = await lv();
  ok('チャンクのA–Bリピート（くり返し再生）', st.loop.on && st.loop.a === 3 && st.loop.b === 3 && st.playing, JSON.stringify(st.loop));
  await p.click('.bar .btn.round');
  await p.click('.loop-box button');
  await p.selectOption('select.rate', '0.7');
  ok('読み上げ速度を変更できる', (await p.evaluate(() => JSON.parse(localStorage.getItem('echo-lines:settings')).rate)) === 0.7);
  await p.selectOption('select.rate', '1.5');

  // 6. step 4: repeating with recording
  await p.click('a.step[data-n="4"]');
  await p.waitForSelector('.status');
  await p.locator('label.check:has-text("録音する") input').check();
  await p.click('button:has-text("リピーティング開始")');
  await p.waitForFunction(() => document.querySelector('.status').dataset.kind === 'you', null, { timeout: 6000 });
  ok('リピーティング：読み上げのあとに発声用ポーズ', true);
  await p.waitForFunction(() => document.querySelectorAll('.status[data-kind="you"]').length && window.__spoken.length > 0 && document.querySelector('.chunk.now')?.dataset.i === '1', null, { timeout: 12000 });
  ok('リピーティング：次のチャンクへ自動で進む', true);
  await p.click('button:has-text("■ 停止")');
  await p.waitForSelector('.compare', { timeout: 8000 });
  ok('リピーティングの録音をチャンクごとに聞き比べ', (await p.locator('.cmp-row').count()) >= 1);

  // 7. step 5: shadowing with recording, compare
  await p.click('a.step[data-n="5"]');
  await p.waitForSelector('button.btn.rec');
  await p.click('button.btn.rec');
  await p.waitForTimeout(500);
  ok('読み上げを聞きながら録音できる', await p.evaluate(() => window.__echo.lesson.rec.recording));
  await p.waitForSelector('.compare', { timeout: 30000 });
  ok('最後まで読み上げると録音が自動で保存される', true);
  const rows = await p.locator('.cmp-row').count();
  const nChunks = await p.locator('.chunks .chunk').count();
  ok('シャドーイング録音の全チャンクに位置が付く', rows === nChunks, `${rows}/${nChunks}`);
  await shot('03-compare');
  await p.locator('.cmp-row').first().locator('button:has-text("続けて")').click();
  await p.waitForTimeout(200);
  ok('聞き比べ：お手本（読み上げ）→自分の声', (await spoken()).length > 0);
  await p.locator('.compare .btn.round').click(); // stop
  const dl = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("録音を保存")')]);
  const recFile = path.join(tmp, dl[0].suggestedFilename());
  await dl[0].saveAs(recFile);
  ok('録音をダウンロードできる', fs.statSync(recFile).size > 500);

  // 8. step 6: translation, cloze quiz, complete
  await p.click('a.step[data-n="6"]');
  await p.waitForSelector('.sentences');
  const qn = await p.locator('.q').count();
  ok('穴うめ問題を自動作成', qn >= 2, `${qn}問`);
  for (let i = 0; i < qn; i++) await p.locator('.q').nth(i).locator('input').first().check();
  await p.click('button:has-text("答え合わせ")');
  ok('答え合わせ', /問中 \d+問 正解/.test(await p.textContent('.result')));
  await p.locator('.rating .chip').nth(3).click();
  await p.click('button:has-text("完了を記録")');
  await p.waitForSelector('.done');

  // 9. reload -> history / resume / memo restored
  await p.reload();
  await p.waitForSelector('.st');
  await p.goto(BASE + '#/');
  await p.waitForSelector('.resume');
  ok('再読み込み後「前回の続き」', (await p.textContent('.resume')).includes('my-text'));
  await p.goto(BASE + '#/log');
  await p.waitForSelector('.stats');
  ok('完了履歴と学習時間が残る', (await p.textContent('.cards')).includes('穴うめ') && !/^0秒/.test((await p.textContent('.stat b')).trim()), (await p.textContent('.stat b')));
  await p.goto(BASE + `#/lesson/${encodeURIComponent(id)}/2`);
  await p.waitForSelector('.word input');
  ok('単語の意味メモが残る', (await p.locator('.word input').first().inputValue()) === 'テスト意味');
  await shot('04-step2');

  // 10. edit, backup / restore
  await p.goto(BASE + `#/edit/${encodeURIComponent(id)}`);
  await p.waitForSelector('.edit-row');
  const before = await p.locator('.edit-row').count();
  await p.locator('.edit-row').first().locator('button:has-text("分割")').click();
  await p.click('.sticky .btn.primary');
  await p.waitForSelector('.st');
  await p.click('a.step[data-n="3"]');
  await p.waitForSelector('.chunk');
  ok('チャンクを分割して保存できる', (await p.locator('.chunks .chunk').count()) === before + 1);
  await p.goto(BASE + '#/settings');
  const [bk] = await Promise.all([p.waitForEvent('download'), p.click('button:has-text("書き出す")')]);
  const bkFile = path.join(tmp, 'backup.json');
  await bk.saveAs(bkFile);
  await p.click('button:has-text("すべて削除")');
  await p.click('.modal .btn.primary');
  await p.waitForSelector('.item');
  ok('全削除で自分のテキストが消える', !(await p.textContent('.list')).includes("Hi, I'm Tom"));
  await p.goto(BASE + '#/settings');
  const [fc2] = await Promise.all([p.waitForEvent('filechooser'), p.click('button:has-text("復元する")')]);
  await fc2.setFiles(bkFile);
  await p.click('.modal .btn.primary');
  await p.waitForSelector('.item');
  ok('バックアップから復元', (await p.textContent('.list')).includes("Hi, I'm Tom"));
  await p.goto(BASE + '#/rec');
  ok('録音も復元される', (await p.locator('.cards .item').count()) === 2);

  // 11. paste flow + search
  await p.goto(BASE + '#/new');
  await p.fill('textarea[aria-label="英文"]', 'The museum opens at ten. We should get there early because it gets crowded on weekends.');
  await p.click('button:has-text("この内容で作成")');
  await p.waitForSelector('.st');
  await p.goto(BASE + '#/');
  await p.fill('input.search', 'opens at ten');
  ok('貼り付けで作成・検索できる', (await p.locator('.list .item').count()) === 1);

  ok('JavaScriptエラーなし', errors.length === 0, errors.join(' | '));
  await browser.close();
  const fail = results.filter(x => !x).length;
  console.log(`\n${results.length - fail}/${results.length} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

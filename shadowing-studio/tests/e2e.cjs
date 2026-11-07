// End-to-end check of the main learning flow in headless Chromium (fake microphone).
//   npx http-server .. -p 8080   (serve the repository root)
//   BASE=http://127.0.0.1:8080/shadowing-studio/ node tests/e2e.cjs [screenshotDir]
// Flow: choose lesson -> chunk/A–B playback -> record -> compare -> export review request ->
//       reviewer comments -> export result -> learner imports -> replay -> reload & history restore
//       + backup/restore + register own lesson.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = process.env.BASE || 'http://127.0.0.1:8080/shadowing-studio/';
const SHOTS = process.argv[2] || null;
const results = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-e2e-'));

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], permissions: ['microphone'], acceptDownloads: true, hasTouch: true, isMobile: false });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, `${n}.png`) }); };
  const download = async (clickFn, name) => {
    const [d] = await Promise.all([p.waitForEvent('download'), clickFn()]);
    const f = path.join(tmp, name || d.suggestedFilename());
    await d.saveAs(f);
    return f;
  };
  const choose = async (clickFn, file) => {
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), clickFn()]);
    await fc.setFiles(file);
  };
  const app = () => p.evaluate(() => { const v = window.__app.lessonView; return v ? { t: v.player.time, paused: v.player.paused, ab: v.player.ab, rate: v.player.rate } : null; });

  // 1. choose lesson
  await p.goto(BASE);
  await p.waitForSelector('.lesson-card');
  const n = await p.locator('.lesson-list .lesson-card').count();
  ok('サンプル教材が3本以上表示される', n >= 3, `${n}本`);
  await p.getByRole('radio', { name: 'A2', exact: true }).click();
  const a2 = await p.locator('.lesson-list .lesson-card').count();
  ok('レベルで絞り込める', a2 === 2, `A2=${a2}`);
  await p.getByRole('radio', { name: 'すべてのレベル' }).click();
  await p.fill('input.search', 'Kyoto');
  ok('キーワード検索できる', (await p.locator('.lesson-list .lesson-card').count()) === 1);
  await p.fill('input.search', '');
  await p.getByRole('radio', { name: '健康' }).click();
  ok('テーマで絞り込める', (await p.locator('.lesson-list .lesson-card').count()) === 1);
  await p.getByRole('radio', { name: 'すべてのテーマ' }).click();
  await shot('01-library');
  await p.locator('.lesson-card', { hasText: 'My Morning Routine' }).click();
  await p.waitForSelector('.step-title');
  ok('教材を開くとStep 1で英文全文が表示される', (await p.locator('.intro-script .intro-sentence').count()) === 5);
  ok('最初の英文が表示される', (await p.locator('.intro-script').innerText()).includes('I get up at six thirty every morning.'));

  // 2. chunk playback, highlight, speed, A–B
  const lesson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 's01-morning-routine.json'), 'utf8'));
  const c2 = lesson.chunks[1], c3 = lesson.chunks[2];
  await p.click('a.step[data-n="3"]');
  await p.waitForSelector('[data-cid="c2"]');
  await p.click('[data-cid="c2"] .cplay');
  await p.waitForTimeout(350);
  const hl = await p.locator('.chunk.now').getAttribute('data-cid').catch(() => null);
  ok('再生中のチャンクが強調される', hl === 'c2', `now=${hl}`);
  await p.waitForFunction(() => window.__app.lessonView.player.paused, null, { timeout: 5000 });
  let st = await app();
  ok('チャンク単位で再生して終わりで止まる', st.t >= c2.end - 0.05 && st.t <= c2.end + 0.15, `stop=${st.t.toFixed(2)} end=${c2.end}`);
  await p.selectOption('select.rate', '0.75');
  st = await app();
  ok('再生速度を変更できる', st.rate === 0.75);
  await p.click('[data-cid="c3"] .cloop');
  await p.waitForTimeout((c3.end - c3.start) / 0.75 * 1000 + 900);
  st = await app();
  ok('A–B区間リピート（ループ）', st.ab.on && !st.paused && st.t >= c3.start - 0.05 && st.t <= c3.end + 0.05, `t=${st.t.toFixed(2)} ab=${st.ab.a}-${st.ab.b}`);
  await shot('02-ab-repeat');
  await p.click('.pb-ab button[aria-label="A–B解除"]');
  await p.click('.lesson-play, .playerbar .btn.round');
  await p.selectOption('select.rate', '1');
  await p.getByRole('button', { name: '和訳' }).click();
  const jaColor = await p.locator('[data-cid="c1"] .tx-ja').evaluate(e => getComputedStyle(e).color);
  ok('和訳を個別に非表示にできる', jaColor === 'rgba(0, 0, 0, 0)', jaColor);
  await p.click('[data-cid="c1"] .tx-ja');
  const jaColor2 = await p.locator('[data-cid="c1"] .tx-ja').evaluate(e => getComputedStyle(e).color);
  ok('非表示の和訳をタップで1つだけ表示', jaColor2 !== 'rgba(0, 0, 0, 0)');
  await p.getByRole('button', { name: '和訳' }).click();

  // 2b. repeating: newly generated short clauses -> speaking pause, then next clause.
  await p.click('a.step[data-n="4"]');
  await p.waitForSelector('.repeat-status');
  const repeatItems = p.locator('.repeat-unit');
  ok('リピーティングは新規合成した節単位で表示', (await repeatItems.count()) === 10);
  ok('最初の節は自然な短いまとまり', (await repeatItems.first().locator('.tx-en').innerText()).includes('at six thirty'));
  await p.locator('label.check:has-text("練習を録音する") input').check();
  await p.click('button:has-text("リピーティング開始")');
  await p.waitForFunction(() => document.querySelector('.repeat-status').dataset.kind === 'you', null, { timeout: 15000 });
  ok('リピーティング：節専用お手本のあとに発声用のポーズ', true);
  await p.waitForFunction(() => document.querySelector('.repeat-status').dataset.kind === 'model' && /2文目/.test(document.querySelector('.st-label').textContent), null, { timeout: 30000 });
  ok('リピーティング：次の文へ自動で進む', true);
  await p.click('button:has-text("■ 停止")');
  await p.waitForSelector('section.compare', { timeout: 8000 });
  ok('リピーティング：文全体を録音して既存のチャンクと聞き比べ可能', (await p.locator('.cmp-chunk').count()) >= 3);

  // 3. record while shadowing, then compare
  await p.click('a.step[data-n="5"]');
  await p.waitForSelector('button.btn.rec');
  await p.click('[data-cid="c1"] .cloop'); // record only the first sentence area (A–B)
  await p.evaluate(() => { const v = window.__app.lessonView; v.player.stop(); v.player.setAB(0, 3.2); });
  await p.click('button.btn.rec');
  await p.waitForTimeout(800);
  const recording = await p.evaluate(() => window.__app.recorder.recording);
  ok('お手本を再生しながら録音できる', recording);
  await p.waitForSelector('section.compare', { timeout: 10000 });
  ok('A–B区間の終わりで録音が自動終了し保存される', true);
  await shot('03-compare');
  await p.click('section.compare .seg button:has-text("お手本")');
  await p.click('section.compare .btn.round');
  await p.waitForTimeout(500);
  const modelPlaying = await p.evaluate(() => [...document.querySelectorAll('audio')].length >= 0 && document.querySelector('section.compare .btn.round').textContent === '⏸');
  ok('聞き比べ：お手本を再生', modelPlaying);
  await p.click('section.compare .seg button:has-text("自分の声")');
  await p.waitForTimeout(500);
  const minePressed = await p.locator('section.compare .seg button:has-text("自分の声")').getAttribute('aria-pressed');
  ok('聞き比べ：再生中に自分の声へ切り替え', minePressed === 'true' && (await p.locator('section.compare .btn.round').textContent()) === '⏸');
  await p.click('section.compare .btn.round');

  // 4. export review request
  await p.click('a:has-text("詳細・添削依頼")');
  await p.waitForSelector('text=講師に添削を依頼する');
  const recId = p.url().split('#/rec/')[1];
  const recFile = await download(() => p.click('button:has-text("録音をダウンロード")'));
  ok('録音をダウンロードできる', fs.statSync(recFile).size > 1000, path.basename(recFile));
  await p.click('summary:has-text("講師に添削を依頼する")');
  await p.fill('textarea[placeholder^="講師へのメッセージ"]', '1文目を見てください');
  const reqFile = await download(() => p.click('button:has-text("添削依頼ファイルを書き出す")'), 'request.json');
  const req = JSON.parse(fs.readFileSync(reqFile, 'utf8'));
  ok('添削依頼に録音と教材情報が含まれる', req.recording.data.length > 1000 && req.lesson.chunks.length === lesson.chunks.length);

  // 5. reviewer: open request, add timed comments, export result
  await p.goto(BASE + '#/review');
  await choose(() => p.click('button:has-text("添削依頼ファイルを開く")'), reqFile);
  await p.waitForSelector('.review-player');
  await shot('04-review-mode');
  await p.getByRole('radio', { name: '音声変化' }).click();
  await p.fill('.review input.num', '0.6');
  await p.fill('.review textarea[placeholder^="例"]', 'get up をつなげて「ゲラップ」のように');
  await p.click('button:has-text("この時刻にコメント")');
  await p.getByRole('radio', { name: 'リズム' }).click();
  await p.fill('.review input.num', '1.8');
  await p.fill('.review textarea[placeholder^="例"]', 'six thirty の強弱をはっきり');
  await p.click('button:has-text("この時刻にコメント")');
  await p.waitForFunction(() => document.querySelectorAll('.review-list .cmt').length === 2, null, { timeout: 3000 }).catch(() => {});
  ok('レビューモードで時刻付きコメントを追加', (await p.locator('.review-list .cmt').count()) === 2);
  await p.click('.score-row:first-child .star-btn:nth-of-type(4)');
  await p.fill('textarea[placeholder="全体の講評"]', 'よく聞けています');
  await p.locator('textarea[placeholder="全体の講評"]').blur();
  const resFile = await download(() => p.click('button:has-text("添削結果を書き出す")'), 'result.json');
  const res = JSON.parse(fs.readFileSync(resFile, 'utf8'));
  ok('添削結果を書き出せる', res.comments.length === 2 && res.recordingId === recId && res.comments[0].chunkId);

  // 6. learner: import result, jump to the commented part
  await p.goto(BASE + '#/review');
  await choose(() => p.click('button:has-text("添削結果を取り込む")'), resFile);
  await p.waitForSelector('.review-sum');
  ok('添削結果を取り込むと録音詳細にコメントが表示', (await p.locator('.compare .cmt').count()) === 2);
  await shot('05-imported-review');
  await p.locator('.compare .cmt').first().locator('button:has-text("▶ 自分")').click();
  await p.waitForTimeout(400);
  ok('コメント箇所の自分の録音を再生', (await p.locator('section.compare .btn.round').textContent()) === '⏸');
  await p.locator('.compare .cmt').first().locator('button:has-text("この区間を練習")').click();
  await p.waitForSelector('.ab-lbl');
  await p.waitForTimeout(300);
  st = await app();
  ok('「この区間を練習」で該当チャンクがA–B設定される', st.ab.on && Math.abs(st.ab.a - lesson.chunks[0].start) < 0.01, `ab=${st.ab.a}-${st.ab.b}`);

  // 7. finish step 6
  await p.click('a.step[data-n="6"]');
  await p.waitForSelector('.quiz');
  for (let i = 0; i < lesson.quiz.length; i++) await p.locator('.quiz-q').nth(i).locator('input').nth(lesson.quiz[i].answer).check();
  await p.click('button:has-text("答え合わせ")');
  ok('理解度確認（クイズ）', (await p.textContent('.quiz-result')).includes(`${lesson.quiz.length}問 正解`));
  await p.locator('.rating .chip').nth(3).click();
  await p.click('button:has-text("完了を記録")');
  await p.waitForSelector('.done-card');
  await p.click('.btn.primary:has-text("次の教材を選ぶ")');
  await p.waitForSelector('.lesson-card');

  // 8. reload and check that history/recordings/reviews are restored
  await p.reload();
  await p.waitForSelector('.lesson-card');
  ok('再読み込み後「前回の続き」が表示される', await p.locator('.resume').isVisible());
  await p.goto(BASE + '#/history');
  await p.waitForSelector('.stats');
  const histText = await p.textContent('.history');
  ok('再読み込み後も完了履歴が残る', histText.includes('My Morning Routine') && histText.includes(`${lesson.quiz.length}/${lesson.quiz.length}`));
  const total = await p.textContent('.stat .v');
  ok('学習時間が記録される', !/^0秒$/.test(total.trim()), total);
  await shot('06-history');
  await p.goto(BASE + '#/recordings');
  await p.waitForSelector('.rec-card');
  ok('再読み込み後も録音と添削件数が残る', (await p.textContent('.rec-card')).includes('添削 2件'));

  // 9. backup -> wipe -> restore
  await p.goto(BASE + '#/settings');
  const backupFile = await download(() => p.click('button:has-text("バックアップを書き出す")'), 'backup.json');
  await p.click('button:has-text("データをすべて削除")');
  await p.click('.modal .btn.primary');
  await p.waitForSelector('.lesson-card');
  await p.goto(BASE + '#/recordings');
  await p.waitForSelector('.empty');
  await p.goto(BASE + '#/settings');
  await choose(() => p.click('button:has-text("バックアップから復元")'), backupFile);
  await p.click('.modal .btn.primary');
  await p.waitForSelector('.lesson-card');
  await p.goto(BASE + '#/recordings');
  await p.waitForSelector('.rec-card');
  ok('バックアップから録音・添削を復元', (await p.textContent('.rec-card')).includes('添削 2件'));

  // 10. register own lesson (audio + pasted text), edit timings, practice
  const audioPath = path.join(__dirname, '..', 'samples', 'audio', 's04-daily-walk.mp3');
  await p.goto(BASE + '#/edit/new');
  await p.fill('input[placeholder^="例: ELLLO #"]', 'My own lesson');
  await p.locator('input[type="file"]').setInputFiles(audioPath);
  await p.fill('textarea[placeholder^="英文を貼り付け"]', 'My doctor told me to walk for thirty minutes a day. At first, I thought it would be boring.');
  await p.fill('textarea[placeholder^="任意。文の順"]', '医者に1日30分歩くように言われました。\n最初は退屈だろうと思っていました。');
  await p.fill('textarea[placeholder^="任意。1行に1語"]', 'boring | 退屈な | ボーリング');
  await p.click('button:has-text("登録して区間を編集する")');
  await p.waitForSelector('.edit-row');
  const rows = await p.locator('.edit-row').count();
  ok('貼り付けた英文がチャンクに分割される', rows >= 3, `${rows}チャンク`);
  const end0 = p.locator('.edit-row').first().locator('input.num').nth(1);
  await end0.fill('1.95');
  await end0.dispatchEvent('change');
  await p.click('.sticky-save .btn.primary');
  await p.waitForTimeout(300);
  await p.goto(BASE + '#/mine');
  await p.click('a:has-text("区間・内容を編集")');
  await p.waitForSelector('.edit-row');
  const saved = await p.locator('.edit-row').first().locator('input.num').nth(1).inputValue();
  ok('区間の終了時刻をあとから編集・保存できる', saved === '1.95', saved);
  await p.goto(BASE + '#/mine');
  await p.click('a:has-text("練習する")');
  await p.waitForSelector('.step-title');
  await p.click('a.step[data-n="3"]');
  await p.waitForSelector('[data-cid="c1"]');
  ok('自分の教材で練習画面が開く', (await p.locator('.chunk').count()) === rows);
  await p.click('a.step[data-n="6"]');
  ok('自分の教材の文ごとの和訳', (await p.textContent('.sentences')).includes('最初は退屈だろう'));
  await p.goto(BASE + '#/library');
  await p.waitForSelector('.lesson-card');
  await p.locator('.lesson-card', { hasText: 'My Morning Routine' }).click();
  await p.waitForSelector('.step-title');
  await p.click('.fav');
  await p.waitForFunction(() => document.querySelector('.fav').textContent === '★');
  await p.goto(BASE + '#/library');
  await p.waitForSelector('.lesson-card');
  await p.click('button.chip:has-text("お気に入り")');
  ok('お気に入りで絞り込める', (await p.locator('.lesson-list .lesson-card').count()) === 1);

  ok('JavaScriptエラーなし', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

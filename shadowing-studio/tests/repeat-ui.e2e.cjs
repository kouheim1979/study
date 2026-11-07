// Browser smoke test for sentence-based repeating, active glow and follow-scroll.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const context = await browser.newContext({ viewport: {width: 390, height: 844}, hasTouch: true });
    const page = await context.newPage();
    const failures = [];
    page.on('pageerror', err => failures.push(err.message));
    await page.goto('http://127.0.0.1:8080/shadowing-studio/#/lesson/s01-morning-routine/4');
    try {
      await page.waitForSelector('.repeat-unit', { timeout: 20000 });
    } catch (error) {
      console.error('Current URL:', page.url());
      console.error('Screen text:', (await page.locator('body').innerText().catch(() => '')).slice(0, 3000));
      console.error('Browser errors:', failures);
      throw error;
    }
    const list = page.locator('.repeat-unit');
    assert.equal(await list.count(), 10, 'My Morning Routine uses 10 freshly synthesized clauses, not 5 long sentences');
    assert.match(await list.first().locator('.tx-en').textContent(), /I get up at six thirty/);
    const u = await page.evaluate(() => window.__app.lessonView.repeatUnits[0]);
    assert.equal(u.chunks.length, 2);
    assert.ok(u.start > 0 && u.end > u.start);
    assert.equal(await page.evaluate(() => window.__app.lessonView.player.src.includes('-repeat.mp3')), true, 'Step 4 uses fresh repeat-only MP3');
    await list.first().locator('.repeat-play').click();
    const firstRange = await page.evaluate(() => window.__app.lessonView.player.range);
    assert.ok(Math.abs(firstRange.s-u.start) < .01);
    assert.ok(Math.abs(firstRange.e-u.end) < .01);
    await page.waitForFunction(() => document.querySelector('.repeat-unit')?.classList.contains('now'), null, { timeout: 5000 });
    const activeColor = await list.first().evaluate(el => getComputedStyle(el).backgroundColor);
    const idleColor = await list.nth(1).evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(activeColor, idleColor, 'Active sentence must visibly glow');
    await page.locator('button:has-text("リピーティング開始")').click();
    await page.waitForFunction(() => document.querySelector('.repeat-status').dataset.kind === 'you', null, { timeout: 15000 });
    assert.match(await page.locator('.repeat-status .st-label').textContent(), /1文目/);
    assert.equal(await list.first().evaluate(el => el.classList.contains('now') && el.classList.contains('speaking')), true,
      'Keep the active sentence highlighted during the speaking pause');
    await page.locator('button:has-text("■ 停止")').click();
    // Exercise the same follow-scroll path used when the next sentence
    // becomes active. A local Python HTTP server may not serve MP3 byte
    // ranges, making a direct seek to later audio unreliable in Chromium.
    await page.evaluate(() => window.__app.lessonView.setRepeatHighlight(3, 'model'));
    assert.equal(await list.nth(3).evaluate(el => el.classList.contains('now')), true);
    await page.waitForTimeout(800);
    const visible = await list.nth(3).evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    });
    assert.ok(visible, 'Automatically scroll newly active sentence into view');
    await context.close();
    assert.deepEqual(failures, []);
    console.log('PASS: 10 new natural clause units, dedicated repeat audio, glow and scroll');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exit(1); });

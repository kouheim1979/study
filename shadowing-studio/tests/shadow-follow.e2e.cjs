// Regression: Step 5 must retain a visible, glowing active phrase on iPhone.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:8080/shadowing-studio/#/lesson/s01-morning-routine/5');
    await page.waitForSelector('.shadow-follow', { timeout: 20000 });
    assert.match(await page.locator('.shadow-follow-text').innerText(), /▶/);

    // A genuine tap starts playback; the current phrase must light up.
    await page.getByRole('button', { name: 'お手本だけで練習' }).click();
    await page.waitForFunction(() =>
      document.querySelector('.step-body .chunk.now') &&
      document.querySelector('.shadow-follow')?.dataset.active === 'true', null, { timeout: 10000 });
    const active = page.locator('.step-body .chunk.now');
    const highlightedText = await active.locator('.tx-en').innerText();
    assert.ok(highlightedText.trim());
    assert.equal((await page.locator('.shadow-follow-text').innerText()).trim(), highlightedText.trim());
    const currentColor = await active.evaluate(el => getComputedStyle(el).backgroundColor);
    const idleColor = await page.locator('.step-body .chunk:not(.now)').first().evaluate(el => getComputedStyle(el).backgroundColor);
    assert.notEqual(currentColor, idleColor, 'Step 5 phrase must glow more brightly than idle text');

    // Even a fixed bottom audio player cannot cover the active line.
    // scrollIntoView uses smooth scrolling; let the iPhone-sized viewport settle.
    await page.waitForTimeout(850);
    const position = await active.evaluate(el => {
      const r = el.getBoundingClientRect();
      const header = document.querySelector('.topbar').getBoundingClientRect();
      const player = document.querySelector('.playerbar').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, headerBottom: header.bottom, playerTop: player.top };
    });
    console.log('Shadow phrase viewport', position);
    assert.ok(position.bottom <= position.playerTop + 10, 'Active phrase cannot hide under bottom player bar');

    // The pinned now-reading phrase stays visible while moving through the text.
    await page.locator('.playerbar .btn.round').click(); // pause
    await page.locator('.chunks .chunk').nth(5).scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    const strip = await page.locator('.shadow-follow').evaluate(el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, text: el.innerText };
    });
    assert.ok(strip.top >= -1 && strip.bottom < 844, 'Current-text strip must remain on screen');

    await page.locator('.toggles button[data-key="showEn"]').click();
    assert.match(await page.locator('.shadow-follow-text').innerText(), /英文は非表示/);
    await page.locator('.toggles button[data-key="showEn"]').click();
    assert.equal((await page.locator('.shadow-follow-text').innerText()).trim(), highlightedText.trim());
    assert.deepEqual(errors, []);
    console.log('PASS: Step 5 glowing active phrase, sticky current text, safe scroll and English visibility toggle');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });

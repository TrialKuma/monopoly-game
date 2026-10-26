'use strict';
// Fresh browser storage only; never touches the user's preview or save.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  const out = path.join(__dirname, '../work/departure-qa'); fs.mkdirSync(out, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.CITY_PREVIEW_URL || 'http://127.0.0.1:8876/');
    await page.waitForFunction(() => window.GameProgression && window.GamePresentation);
    await page.locator('[data-map-id="harbor"]').click();
    assert.equal(await page.locator('#start-play-btn').textContent(), '出发 · ¥250');
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.entries.length), 0);
    assert.equal(await page.locator('#harbor-wishlist, #harbor-target').count(), 0);
    for (const [width, height] of [[390, 844], [320, 568]]) {
      await page.setViewportSize({ width, height });
      await page.locator('#start-play-btn').scrollIntoViewIfNeeded();
      const fit = await page.locator('#start-play-btn').boundingBox();
      assert(fit.x >= 0 && fit.x + fit.width <= width && fit.y + fit.height <= height + 1);
      await page.screenshot({ path: path.join(out, `menu-${width}.png`) });
    }
    console.log('PASS 390/320 departure price shown before map entry, concise menu, no admission while browsing');
    const sid = await page.evaluate(() => state.sessionId);
    await page.evaluate(() => { window.qaSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw Error('quota'); }; });
    await page.locator('#start-play-btn').click();
    assert.match(await page.locator('#start-entry-error').textContent(), /保存失败/);
    assert.equal(await page.evaluate(() => state.sessionId), sid);
    assert.equal(await page.locator('#start-screen').isVisible(), true);
    assert.equal(await page.evaluate(() => state.modal.visible), false);
    await page.evaluate(() => { Storage.prototype.setItem = window.qaSetItem; });
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.entries.length), 0);
    console.log('PASS failed save stays in the menu without replacing the board or charging');
    await page.evaluate(() => {
      const realEnter = GameProgression.enter;
      GameProgression.enter = input => { window.qaDebitState = { sid: state.sessionId, inMenu: !document.querySelector('#start-screen').classList.contains('hidden') }; return realEnter(input); };
      startNewGame(); startNewGame();
    });
    await page.locator('[data-action="flip"]').waitFor();
    assert.deepEqual(await page.evaluate(() => qaDebitState), { sid, inMenu: true });
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), 950);
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.entries.length), 1);
    assert.equal(await page.evaluate(() => state.runId), await page.evaluate(() => GameProgression.getProfile().profile.entries[0].runId));
    assert.equal(await page.locator('[data-action="enter"]').count(), 0);
    assert.equal(await page.locator('#event-message').textContent(), '');
    await page.evaluate(() => { window.qaRandom = Math.random; Math.random = () => .1; });
    await page.locator('[data-action="flip"]').click();
    await page.locator('[data-action="continue"]').waitFor();
    assert.equal(await page.locator('#event-title').textContent(), '你先手');
    assert.equal(await page.locator('#event-message').textContent(), '对手获后手补偿 双骰卡 ×1');
    await page.screenshot({ path: path.join(out, 'initiative-320.png') });
    await page.locator('[data-action="continue"]').click();
    await page.waitForFunction(() => state.isFormalRun && !departureJob);
    await page.evaluate(() => { Math.random = window.qaRandom; });
    assert.equal(await page.locator('#center-description').textContent(), '');
    console.log('PASS one durable debit before board replacement, double entry blocked, initiative only shows first player and compensation');
    await page.evaluate(() => { state.players[0].cash = 400; state.players[1].cash = 100; state.round = 31; finishGame('rounds'); });
    await page.locator('.drama-skip').click(); await page.locator('[data-city-replay]').click();
    assert.equal(await page.locator('#start-screen').isVisible(), true);
    const replayWallet = await page.evaluate(() => GameProgression.getProfile().profile.wallet);
    assert.equal(replayWallet, 1350); assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.entries.length), 1);
    assert.equal(await page.locator('#start-play-btn').textContent(), '出发 · ¥250');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('town:embark', { detail: { mapId: 'alpine' } })));
    assert.equal(await page.locator('#start-play-btn').textContent(), '出发 · ¥350');
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), replayWallet);
    await page.locator('#start-showcase-btn').click();
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), replayWallet);
    await page.locator('#showcase-exit-btn').click();
    assert.equal(await page.locator('#start-screen').isVisible(), true);
    assert.equal(await page.locator('#start-play-btn').textContent(), '出发 · ¥350');
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.entries.length), 1);
    assert.deepEqual(errors, []);
    console.log('PASS replay, town material destination and showcase exit return to priced menu without another debit; no browser exceptions');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

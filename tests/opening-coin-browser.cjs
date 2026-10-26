'use strict';
// Every case runs in a fresh isolated profile; no user save or existing tab is touched.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  const output = path.join(__dirname, '../work/opening-coin-qa'); fs.mkdirSync(output, { recursive: true });
  const positions = [];
  const centered = async (page, width, height, phase) => {
    const result = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON(), overlay = document.querySelector('#event-overlay');
      return { overlay: rect('#event-overlay'), card: rect('#event-card'), coin: rect('.opening-coin-lift'), stage: rect('.opening-coin-stage'), parentIsBody: overlay.parentElement === document.body, position: getComputedStyle(overlay).position, align: getComputedStyle(overlay).alignItems };
    });
    assert.equal(result.parentIsBody, true, 'coin is outside the board-choice dock'); assert.equal(result.position, 'fixed'); assert.equal(result.align, 'center');
    assert(Math.abs(result.card.x + result.card.width / 2 - width / 2) < 1, `${phase}: card horizontally centered`);
    assert(Math.abs(result.card.y + result.card.height / 2 - height / 2) < 1, `${phase}: card vertically centered`);
    assert(Math.abs(result.coin.x + result.coin.width / 2 - width / 2) < 1, `${phase}: coin horizontally centered`);
    assert(Math.abs(result.coin.y + result.coin.height / 2 - height / 2) < (phase === 'tossing' ? 85 : 25), `${phase}: coin stays in viewport center`);
    assert(result.card.left >= 0 && result.card.right <= width && result.card.top >= 0 && result.card.bottom <= height, `${phase}: card fits viewport`);
    positions.push({ width, height, phase, ...result }); return result;
  };
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.CITY_PREVIEW_URL || 'http://127.0.0.1:8876/');
    await page.waitForFunction(() => typeof coinFlipForFirstPlayer === 'function' && window.GameProgression);
    const prepare = async (reduced = false) => {
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await page.evaluate(() => {
        initializeGame('harbor'); hideStartScreen(); window.coinTestFinished = false; window.coinTestResult = null;
        window.coinTestPromise = coinFlipForFirstPlayer(state.sessionId).then(result => { window.coinTestResult = result; window.coinTestFinished = true; });
      });
    };
    const flip = async humanFirst => {
      await page.evaluate(humanFirst => {
        const original = Math.random;
        Math.random = () => humanFirst ? .1 : .9;
        document.querySelector('[data-action="flip"]').click();
        queueMicrotask(() => { Math.random = original; });
      }, humanFirst);
    };
    const begin = async (humanFirst, reduced = false) => { await prepare(reduced); await flip(humanFirst); };
    for (const [width, height, humanFirst] of [[390, 844, true], [320, 568, false], [768, 1024, true]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => { initializeGame('harbor'); hideStartScreen(); showModal({ title: '测试征用', boardTargets: [1], buttons: [{ id: 'cancel', label: '取消' }] }); });
      assert.equal(await page.locator('#board-choice-dock #event-overlay').count(), 1, 'test really begins with the overlay docked');
      await prepare(); await page.waitForFunction(() => state.modal.openingCoin?.phase === 'ready'); await page.waitForTimeout(250);
      await centered(page, width, height, 'ready'); await page.screenshot({ path: path.join(output, `ready-${width}.png`) });
      await flip(humanFirst);
      await page.waitForFunction(() => state.modal.openingCoin?.phase === 'tossing');
      const early = await page.evaluate(() => ({ active: !!openingCoinJob, actions: document.querySelectorAll('#event-actions button').length, roll: document.querySelector('#roll-btn').disabled, restart: document.querySelector('#restart-btn').disabled, resolved: state.initiativeResolved }));
      assert.deepEqual(early, { active: true, actions: 0, roll: true, restart: true, resolved: false });
      const a = await page.locator('.opening-coin-spin').evaluate(el => getComputedStyle(el).transform);
      await page.waitForTimeout(330);
      const b = await page.locator('.opening-coin-spin').evaluate(el => getComputedStyle(el).transform);
      assert.notEqual(a, b, 'coin really changes its 3D orientation');
      await centered(page, width, height, 'tossing');
      await page.screenshot({ path: path.join(output, `toss-${width}.png`) });
      await page.waitForFunction(() => state.modal.openingCoin?.phase === 'settled');
      const result = await page.evaluate(() => {
        const spin = document.querySelector('.opening-coin-spin'), rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { side: spin.closest('.opening-coin-stage').dataset.coinSide, facing: new DOMMatrix(getComputedStyle(spin).transform).m33, first: state.firstPlayerIndex, card: rect('#event-card'), button: rect('#event-actions [data-action="continue"]'), scroll: document.documentElement.scrollWidth, title: document.querySelector('#event-title').textContent };
      });
      assert.equal(result.side, humanFirst ? 'human' : 'ai'); assert.equal(result.first, humanFirst ? 0 : 1);
      assert.deepEqual(await page.evaluate(() => state.players.map(player => player.cards.map(card => card.cardId))), humanFirst ? [[], ['boost']] : [['boost'], []]);
      assert.equal(await page.locator('#event-message').textContent(), `${humanFirst ? '对手' : '你'}获后手补偿 双骰卡 ×1`);
      assert(humanFirst ? result.facing > .99 : result.facing < -.99, 'settled visible face agrees with the actual winner');
      assert(result.card.left >= 0 && result.card.right <= width && result.card.top >= 0 && result.card.bottom <= height);
      assert(result.button.left > width / 2 - 35 && result.button.right <= width && result.button.bottom <= height, 'confirmation stays right and visible');
      assert(result.scroll <= width); await page.screenshot({ path: path.join(output, `settled-${width}.png`) });
      await centered(page, width, height, 'settled');
      await page.locator('[data-action="continue"]').click(); assert.equal(await page.evaluate(() => coinTestPromise.then(() => coinTestResult)), humanFirst);
    }
    console.log('PASS 320/390/768 ready, toss and result stay centered outside the board dock, with correct 3D faces and right-side confirmation');
    await begin(true); await page.waitForFunction(() => !!openingCoinJob);
    await page.evaluate(() => initializeGame('compact')); await page.waitForTimeout(1850);
    assert.equal(await page.evaluate(() => state.initiativeResolved), false); assert.equal(await page.evaluate(() => openingCoinJob), null);
    await begin(false); await page.waitForFunction(() => !!openingCoinJob);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await page.waitForTimeout(1850);
    assert.equal(await page.evaluate(() => state.initiativeResolved), false); assert.equal(await page.evaluate(() => openingCoinJob), null);
    console.log('PASS restart and pagehide cancel animation without showing stale results');
    const started = Date.now(); await begin(false, true); await page.waitForFunction(() => state.modal.openingCoin?.phase === 'settled');
    assert(Date.now() - started < 1500, 'reduced-motion path skips the full toss');
    assert.equal(await page.locator('.opening-coin-spin').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await page.evaluate(() => state.firstPlayerIndex), 1);
    await page.locator('[data-action="continue"]').click(); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'centering-result.json'), JSON.stringify({ ok: true, positions, browserErrors: errors }, null, 2));
    console.log('PASS reduced motion, correct outcome and zero browser exceptions');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
// This uses a fresh browser profile; no user save or existing tab is touched.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  const output = path.join(__dirname, '../work/opening-compensation-qa'); fs.mkdirSync(output, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [], results = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.CITY_PREVIEW_URL || 'http://127.0.0.1:8876/');
    await page.waitForFunction(() => typeof coinFlipForFirstPlayer === 'function' && window.GameCardBag);
    for (const humanFirst of [true, false]) {
      await page.evaluate(() => {
        initializeGame('harbor'); hideStartScreen();
        window.openingQaPromise = coinFlipForFirstPlayer(state.sessionId);
      });
      assert.deepEqual(await page.evaluate(() => state.players.map(player => player.cards)), [[], []]);
      await page.evaluate(humanFirst => {
        const original = Math.random; Math.random = () => humanFirst ? .1 : .9;
        document.querySelector('[data-action="flip"]').click();
        queueMicrotask(() => { Math.random = original; });
      }, humanFirst);
      await page.waitForFunction(() => state.modal.openingCoin?.phase === 'settled');
      const result = await page.evaluate(() => ({
        cards: state.players.map(player => player.cards.map(card => card.cardId)),
        cash: state.players.map(player => player.cash),
        first: state.firstPlayerIndex,
        message: document.querySelector('#event-message').textContent,
        width: document.documentElement.scrollWidth,
        card: document.querySelector('#event-card').getBoundingClientRect().toJSON(),
        compensation: { ...state.openingCompensation },
      }));
      assert.deepEqual(result.cards, humanFirst ? [[], ['boost']] : [['boost'], []]);
      assert.deepEqual(result.cash, humanFirst ? [1700, 2100] : [2100, 1700]);
      assert.equal(result.first, humanFirst ? 0 : 1);
      assert.equal(result.message, `${humanFirst ? '对手' : '你'}获后手补偿 ¥400 · 双骰卡 ×1`);
      assert(result.width <= 390 && result.card.left >= 0 && result.card.right <= 390 && result.card.bottom <= 844);
      await page.screenshot({ path: path.join(output, `${humanFirst ? 'human' : 'ai'}-first.png`) });
      await page.locator('[data-action="continue"]').click();
      assert.equal(await page.evaluate(() => openingQaPromise), humanFirst);
      results.push(result);
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ results, errors }, null, 2));
    console.log('PASS 390 portrait real coin flip: either first player receives no card, second player receives one optional double-dice card, short compensation text fits, zero browser exceptions');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

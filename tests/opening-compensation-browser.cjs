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
    for (const [map, startCash] of Object.entries({classic:1600,compact:1600,expansion:2000,harbor:1700,alpine:1900})) for (const humanFirst of [true, false]) {
      await page.evaluate(map => {
        initializeGame(map); hideStartScreen();
        window.openingQaPromise = coinFlipForFirstPlayer(state.sessionId);
      }, map);
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
        activeDouble: state.players.map(player => player.effects.speedBoost),
        first: state.firstPlayerIndex,
        message: document.querySelector('#event-message').textContent,
        width: document.documentElement.scrollWidth,
        card: document.querySelector('#event-card').getBoundingClientRect().toJSON(),
        compensation: { ...state.openingCompensation },
      }));
      assert.deepEqual(result.cards, humanFirst ? [[], ['boost']] : [['boost'], []]);
      assert.deepEqual(result.cash, [startCash, startCash]);
      assert.deepEqual(result.activeDouble, [false, false]);
      assert.deepEqual(result.compensation, {playerId:humanFirst?'ai':'human',amount:0,cardId:'boost'});
      assert.equal(result.first, humanFirst ? 0 : 1);
      assert.equal(result.message, `${humanFirst ? '对手' : '你'}获后手补偿 双骰卡 ×1`);
      assert(result.width <= 390 && result.card.left >= 0 && result.card.right <= 390 && result.card.bottom <= 844);
      await page.screenshot({ path: path.join(output, `${map}-${humanFirst ? 'human' : 'ai'}-first.png`) });
      await page.locator('[data-action="continue"]').click();
      assert.equal(await page.evaluate(() => openingQaPromise), humanFirst);
      results.push({map,...result});
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ results, errors }, null, 2));
    console.log('PASS all five maps / both initiative outcomes at 390 portrait: equal starting cash, no first-player card, exactly one optional second-player double-dice card, no cash compensation, text fits, zero browser exceptions');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
// Isolated profiles only: never read or mutate the user's game tab or save.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const base = process.env.CITY_PREVIEW_URL || 'http://127.0.0.1:8876/', out = path.join(__dirname, '../work/fireworks-qa');
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }), page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message)); await page.goto(base); await page.waitForFunction(() => CityScene?.ready);
    for (const mapId of ['classic', 'compact', 'expansion', 'harbor', 'alpine']) {
      await page.evaluate(mapId => { initializeGame(mapId); hideStartScreen(); state.busy = false; state.phase = 'await_roll'; state.currentPlayerIndex = 0; window.qaLots = state.board.filter(tile => tile.lot && !tile.isLargeSecondary).slice(0, 2); qaLots.forEach((tile, index) => { tile.lot.ownerId = index ? 'ai' : 'human'; tile.lot.level = 2; }); state.players[0].position = qaLots[0].index; render(); CityScene.setTimeMode('day'); CityScene.setWeather('clear'); }, mapId);
      await page.waitForFunction(() => qaLots.every(tile => document.querySelector(`[data-scene-tile-index="${tile.index}"]`)?.dataset.loadedModel?.endsWith('_2')), null, { timeout: 90000 });
      assert.equal(await page.evaluate(() => CityScene.getCelebrationState().launches), 0, `${mapId}: loading models never celebrates`);
      await page.evaluate(() => { qaLots.forEach(tile => tile.lot.level = 3); render(); });
      await page.waitForFunction(() => CityScene.getCelebrationState().active === 2);
      assert.equal(await page.evaluate(() => CityScene.getCelebrationState().particles), 144);
      await page.evaluate(() => render()); assert.equal(await page.evaluate(() => CityScene.getCelebrationState().launches), 2, 'repaint does not replay');
      if (mapId === 'compact') { await page.waitForTimeout(520); await page.screenshot({ path: path.join(out, 'board-portrait.png') }); }
      await page.waitForFunction(() => CityScene.getCelebrationState().active === 0); assert.equal(await page.evaluate(() => CityScene.getCelebrationState().bursts), 0);
    }
    await page.evaluate(() => { CityScene.reset(); }); assert.equal(await page.evaluate(() => CityScene.getCelebrationState().pending), 0);
    assert.deepEqual(errors, []); await context.close();
    console.log('PASS all five maps: both owners, real snapshot transitions, model-load/repaint suppression, 390px rendering and cleanup');

    for (const reducedMotion of ['no-preference', 'reduce']) {
      const townContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion }), town = await townContext.newPage(), townErrors = [];
      town.on('pageerror', error => townErrors.push(error.message));
      await town.route('**/fireworks-smoke.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#afcfd0}#view{height:100dvh;width:100vw;touch-action:none}</style><div id="view"></div>' }));
      await town.goto(new URL('fireworks-smoke.html', base).href);
      await town.evaluate(async () => {
        const { createTownScene } = await import('./town-scene.js?v=20261025-celebrate1');
        window.qaState = { profile: { town: { size: 6, cards: { harbor_villa: { star: 2, unlocked: true } }, buildings: [0, 1].map(i => ({ id: `house-${i}`, cardId: 'harbor_villa', x: 2 + i, y: 2, rotation: 0, stored: false })) } }, catalog: [{ id: 'harbor_villa', region: 'harbor', family: 'villa', footprint: [1, 1] }], selection: null, preview: null };
        window.qaScene = createTownScene(document.getElementById('view')); qaScene.update(qaState);
      });
      await town.waitForFunction(() => qaScene.getState().ready, null, { timeout: 90000 });
      assert.equal(await town.evaluate(() => qaScene.getState().celebration.launches), 0);
      await town.evaluate(() => { qaState.profile.town.cards.harbor_villa.star = 3; qaScene.update(qaState); });
      if (reducedMotion === 'reduce') assert.equal(await town.evaluate(() => qaScene.getState().celebration.active), 0);
      else {
        assert.equal(await town.evaluate(() => qaScene.getState().celebration.active), 1, 'one family merge celebrates one representative, not every copy');
        await town.waitForTimeout(540); await town.screenshot({ path: path.join(out, 'town-portrait.png') });
        await town.waitForFunction(() => qaScene.getState().celebration.active === 0);
        await town.evaluate(() => { qaState.profile.town.buildings.push({ id: 'house-2', cardId: 'harbor_villa', x: 1, y: 2, rotation: 0, stored: false }); qaScene.update(qaState); });
        assert.equal(await town.evaluate(() => qaScene.getState().celebration.launches), 1, 'placing a 3-star house does not repeat the merge show');
      }
      await town.evaluate(async () => { qaScene.dispose(); const { createTownScene } = await import('./town-scene.js?v=20261025-celebrate1'); qaScene = createTownScene(document.getElementById('view')); qaScene.update(qaState); });
      await town.waitForFunction(() => qaScene.getState().ready); assert.equal(await town.evaluate(() => qaScene.getState().celebration.launches), 0, 'reopening town does not celebrate saved stars');
      await town.evaluate(() => qaScene.dispose()); assert.equal(await town.locator('canvas').count(), 0); assert.deepEqual(townErrors, []); await townContext.close();
    }
    console.log('PASS town actual GLBs, two same-family buildings, merge/repaint/place/reopen deduplication, reduced motion and close disposal');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

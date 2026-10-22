'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'work/progression-qa');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const requested = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!requested.startsWith(root + path.sep) || !fs.existsSync(requested) || !fs.statSync(requested).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(requested)] || 'application/octet-stream' }); fs.createReadStream(requested).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    if (!await page.evaluate(() => !!window.GameProgression)) await page.addScriptTag({ path: path.join(root, 'progression.js') });
    if (!await page.locator('link[href^="progression.css"]').count()) await page.addStyleTag({ path: path.join(root, 'progression.css') });
    await page.locator('.city-menu-button').click();
    await page.getByRole('heading', { name: '我的小城', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), 1200);
    await page.locator('[data-city-buy="garden"]').click();
    await page.locator('.city-message').filter({ hasText: '城市印章' }).waitFor();
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.projectLevels.garden), 0);
    await page.screenshot({ path: path.join(out, '01-empty-city.png') });
    await page.evaluate(() => {
      GameProgression.resetResult();
      GameProgression.enter({ runId: 'browser-qa', mapId: 'classic', price: 100 });
      window.qaInput = { eligible: true, runId: 'browser-qa', mapId: 'classic', mapName: '经典环线', mode: 'rounds', reason: 'rounds', rounds: 30, humanCash: 10000, winnerId: 'human', collectionCount: 3 };
      window.qaResult = GameProgression.settle(window.qaInput);
      for (const [mapId, price] of [['harbor', 250], ['alpine', 350]]) {
        GameProgression.enter({ runId: 'collect-' + mapId, mapId, price });
        GameProgression.settle({ ...window.qaInput, runId: 'collect-' + mapId, mapId, humanCash: 1000 });
      }
      GameProgression.showResult(window.qaResult, { onReplay() { window.qaReplay = true; }, onHome() { window.qaHome = true; } });
    });
    await page.getByRole('heading', { name: '本局结算', exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, '02-settlement.png') });
    await page.locator('.city-finish-links [data-city-tab="city"]').click();
    for (const id of ['garden', 'waterfront', 'skyline']) await page.locator(`[data-city-buy="${id}"]`).click();
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), 11100);
    assert.equal(await page.locator('.city-project.is-built').count(), 3);
    await page.screenshot({ path: path.join(out, '03-built-city.png') });
    await page.getByRole('tab', { name: '本机榜', exact: true }).click();
    assert.equal(await page.locator('.city-ranking b').textContent(), '10,000');
    await page.locator('[data-city-map]').selectOption('compact');
    await page.locator('.city-ranking-empty').waitFor();
    await page.locator('[data-city-map]').selectOption('classic');
    await page.screenshot({ path: path.join(out, '04-local-board.png') });
    await page.getByRole('button', { name: '返回结算', exact: true }).click();
    for (const [width, height] of [[320, 568], [360, 640], [430, 932], [844, 390], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      const bounds = await page.locator('#city-dialog').evaluate(el => ({ rect: el.getBoundingClientRect().toJSON(), scroll: el.scrollWidth, client: el.clientWidth }));
      assert(bounds.rect.left >= 0 && bounds.rect.right <= width, `dialog horizontal fit at ${width}`);
      assert(bounds.rect.top >= 0 && bounds.rect.bottom <= height, `dialog vertical fit at ${width}`);
      assert(bounds.scroll <= bounds.client, `dialog content overflow at ${width}`);
    }
    await page.getByRole('button', { name: '再来一局', exact: true }).click();
    assert.equal(await page.evaluate(() => window.qaReplay), true);
    assert.equal(await page.locator('#city-dialog').evaluate(el => el.open), false);
    await page.reload();
    if (!await page.evaluate(() => !!window.GameProgression)) await page.addScriptTag({ path: path.join(root, 'progression.js') });
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), 11100);
    const duplicate = await page.evaluate(() => GameProgression.settle({ eligible: true, runId: 'browser-qa', mapId: 'classic', mapName: '经典环线', mode: 'rounds', reason: 'rounds', rounds: 30, humanCash: 10000, winnerId: 'human', collectionCount: 3 }));
    assert.equal(duplicate.duplicate, true); assert.equal(duplicate.profile.wallet, 11100);
    // Enter through the actual game flow, then finish a controlled late-game state.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator('#start-play-btn').click();
    await page.locator('[data-action="rounds"]').click();
    await page.locator('[data-action="enter"]').click();
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), 11000);
    await page.locator('[data-action="flip"]').click();
    await page.locator('.drama-skip').click();
    await page.waitForFunction(() => state.isFormalRun === true, null, { timeout: 10000 }).catch(async error => { await page.screenshot({ path: path.join(out, 'integration-start-failure.png') }); throw error; });
    const actual = await page.evaluate(() => {
      state.round = getMaxRounds() + 1;
      state.players[0].cash = state.players[0].displayedCash = 700;
      state.players[1].cash = state.players[1].displayedCash = 1200;
      finishGame('rounds');
      const result = state.citySettlement;
      finishGame('rounds');
      return { result, wallet: GameProgression.getProfile().profile.wallet, history: loadHistory() };
    });
    assert.equal(actual.result.ok, true); assert.equal(actual.result.amount, 700);
    assert.equal(actual.wallet, 11700); assert.equal(actual.history.length, 1);
    assert.equal(actual.result.receipt.collectionCount, 1);
    await page.getByRole('button', { name: '查看本局结算', exact: true }).click();
    await page.getByRole('heading', { name: '本局结算', exact: true }).waitFor();
    await page.screenshot({ path: path.join(out, '05-real-finish-320.png') });
    await page.locator('[data-city-home]').scrollIntoViewIfNeeded();
    const bottomAction = await page.locator('[data-city-home]').boundingBox();
    assert(bottomAction.y >= 0 && bottomAction.y + bottomAction.height <= 568, 'end actions remain reachable at 320x568');
    await page.locator('[data-city-home]').click();
    await page.locator('#start-play-btn').waitFor();
    await page.locator('#start-showcase-btn').click();
    const preview = await page.evaluate(() => {
      finishGame('rounds');
      return { formal: state.isFormalRun, result: state.citySettlement, wallet: GameProgression.getProfile().profile.wallet, history: loadHistory() };
    });
    assert.equal(preview.formal, false); assert.equal(preview.result.skipped, true);
    assert.equal(preview.wallet, 11700); assert.equal(preview.history.length, 1);
    await page.reload();
    const afterReload = await page.evaluate(receipt => {
      const duplicate = GameProgression.settle({ ...receipt, humanCash: receipt.cash, eligible: true });
      return { duplicate, profile: GameProgression.getProfile().profile };
    }, actual.result.receipt);
    assert.equal(afterReload.duplicate.duplicate, true); assert.equal(afterReload.profile.wallet, 11700);
    assert.deepEqual(afterReload.profile.projectLevels, { garden: 1, waterfront: 1, skyline: 1 });
    await page.evaluate(() => {
      for (const [mapId, price] of [['classic', 100], ['harbor', 250], ['alpine', 350]]) {
        const runId = 'upgrade-' + mapId;
        GameProgression.enter({ runId, mapId, price });
        GameProgression.settle({ runId, mapId, mapName: mapId, eligible: true, mode: 'rounds', reason: 'rounds', rounds: 30, humanCash: 1000, winnerId: 'human', collectionCount: 3 });
      }
      GameProgression.open();
    });
    const levelOne = await page.evaluate(() => Object.fromEntries(['garden', 'water', 'tower'].map(id => { const r = document.querySelector('.city-' + id).getBoundingClientRect(); return [id, { width: r.width, height: r.height }]; })));
    for (const id of ['garden', 'waterfront', 'skyline']) for (const level of [2, 3]) {
      await page.locator(`[data-city-buy="${id}"][data-city-level="${level}"]`).click();
      assert.equal(await page.evaluate(id => GameProgression.getProfile().profile.projectLevels[id], id), level);
    }
    const levelThree = await page.evaluate(() => Object.fromEntries(['garden', 'water', 'tower'].map(id => { const r = document.querySelector('.city-' + id).getBoundingClientRect(); return [id, { width: r.width, height: r.height }]; })));
    assert(levelThree.garden.width > levelOne.garden.width + 8, 'garden expands and gains flowers');
    assert(levelThree.water.width > levelOne.water.width + 15, 'waterfront gains a longer deck');
    assert(levelThree.tower.height > levelOne.tower.height + 25, 'landmark grows through three visible heights');
    assert.equal(await page.locator('.city-project button:disabled').count(), 3);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#city-dialog').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: path.join(out, '06-level-three-city.png') });
    assert.deepEqual(errors, []);
    console.log('PASS vault seed, real ticket entry, collectible costs, three visible upgrade tiers, real finishGame settlement, duplicate/reload idempotence, showcase exclusion, local board and five viewport sizes');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exit(1); });

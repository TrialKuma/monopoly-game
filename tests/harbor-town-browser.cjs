'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { createStore, STORAGE_KEY, buildingCardOffers } = require('../progression.js');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'work/harbor-town-qa');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const requested = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!requested.startsWith(root + path.sep) || !fs.existsSync(requested) || !fs.statSync(requested).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(requested)] || 'application/octet-stream' }); fs.createReadStream(requested).pipe(res);
});
const pass = message => console.log('PASS ' + message);
async function fit(page, width, height, suffix) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(() => document.querySelector('.town-builder')?.getBoundingClientRect().width === innerWidth);
  const bounds = await page.evaluate(() => Object.fromEntries(['.town-builder', '.town-header', '.town-view', '.town-side', '.town-bottom-bar'].map(selector => {
    const node = document.querySelector(selector), rect = node?.getBoundingClientRect();
    return [selector, rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth } : null];
  })));
  fs.writeFileSync(path.join(out, `bounds-${width}-${suffix}.json`), JSON.stringify(bounds, null, 2));
  await page.screenshot({ path: path.join(out, `${suffix}-${width}.png`) });
  for (const [selector, rect] of Object.entries(bounds)) {
    if (!rect) continue;
    assert(rect.left >= -.5 && rect.right <= width + .5, `${selector} horizontal fit at ${width}: ${JSON.stringify(rect)}`);
    assert(rect.top >= -.5 && rect.bottom <= height + .5, `${selector} vertical fit at ${width}: ${JSON.stringify(rect)}`);
    assert(rect.scrollWidth <= rect.clientWidth + 1, `${selector} content width at ${width}`);
  }
}
async function coordinate(page, axis, value) {
  const field = page.locator(`[data-town-coordinate="${axis}"]`);
  await field.fill(String(value)); await field.press('Tab');
}
async function pickBuilding(page, buildingId) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(id => TownBuilder.getState().scene?.buildingCenters?.some(item => item.id === id), buildingId, { timeout: 90000 });
  const point = await page.evaluate(id => TownBuilder.getState().scene.buildingCenters.find(item => item.id === id), buildingId);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(id => TownBuilder.getState().selectedBuilding === id && TownBuilder.getState().mode === 'inspect', buildingId);
}
async function skipDrama(page) {
  await page.locator('.drama-skip').waitFor({ state: 'visible', timeout: 30000 }); await page.locator('.drama-skip').click();
}
function legacyFixture() {
  const data = new Map(), store = createStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }, () => '2026-10-24T08:00:00.000Z');
  store.enter({ runId: 'legacy-classic', mapId: 'classic', price: 100 });
  store.settle({ eligible: true, runId: 'legacy-classic', mapId: 'classic', mapName: '经典环线', mode: 'rounds', reason: 'rounds', rounds: 30, humanCash: 3000, winnerId: 'human', collectionCount: 3 });
  store.buy('garden', 1); store.enter({ runId: 'legacy-harbor', mapId: 'harbor', price: 250 });
  store.settle({ eligible: true, runId: 'legacy-harbor', mapId: 'harbor', mapName: '潮汐港湾', mode: 'rounds', reason: 'rounds', rounds: 30, humanCash: 1200, winnerId: 'ai', collectionCount: 1 });
  const profile = store.read().profile; profile.version = 2; delete profile.town;
  for (const receipt of profile.receipts) { delete receipt.buildingCards; delete receipt.cardRewardVersion; }
  return profile;
}
async function admissionQuotaCase(browser, base) {
  const initial = createStore({ getItem: () => null, setItem() {} }).read().profile, raw = JSON.stringify(initial);
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  try {
    await context.addInitScript(({ key, raw }) => {
      const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
      set.call(localStorage, key, raw); window.qaReadOriginalTownSave = () => get.call(localStorage, key);
      Storage.prototype.setItem = function () { throw new DOMException('Storage full', 'QuotaExceededError'); };
    }, { key: STORAGE_KEY, raw });
    const page = await context.newPage(); await page.goto(base); await page.waitForFunction(() => window.GameProgression?.town && window.GameHarbor);
    await page.locator('[data-map-id="harbor"]').click();
    assert.equal(await page.locator('#harbor-target, #harbor-wishlist').count(), 0);
    await page.locator('#start-play-btn').click();
    assert.match(await page.locator('#start-entry-error').innerText(), /保存失败/);
    const profile = await page.evaluate(() => GameProgression.getProfile().profile);
    assert.equal(profile.wallet, 1200); assert.equal(profile.entries.length, 0);
    assert.equal(await page.evaluate(() => window.qaReadOriginalTownSave()), raw);
    pass('admission save failure leaves the ticket unpaid, shows a visible error and preserves original bytes');
  } finally { await context.close(); }
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); fs.mkdirSync(out, { recursive: true });
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  let page;
  try {
    if (process.env.HARBOR_TOWN_CASE === 'quota') { await admissionQuotaCase(browser, base); return; }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base); await page.waitForFunction(() => window.GameProgression?.town && window.TownBuilder && window.GameHarbor);
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), 1200);
    const denied = await page.evaluate(() => GameProgression.settle({ eligible: true, runId: 'unpaid', mapId: 'harbor', mapName: '潮汐港湾', mode: 'rounds', reason: 'rounds', rounds: 30, humanCash: 9000, winnerId: 'human', buildingCards: [{ cardId: 'harbor_villa', count: 5 }] }));
    assert.equal(denied.error, 'unpaid'); assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), 1200);
    await page.locator('.city-menu-button').click(); await page.getByRole('heading', { name: '我的城镇', exact: true }).waitFor();
    await fit(page, 390, 844, '01-empty'); await fit(page, 320, 568, '01-empty'); await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-town-card="harbor_finance"]').click();
    assert.equal(await page.locator('[data-town-action="target"], .town-card-target').count(), 0);
    await page.locator('.town-card-detail [data-town-trip="harbor"]').click();
    await page.locator('#start-play-btn').waitFor();
    assert.equal(await page.evaluate(() => selectedMapId), 'harbor');
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), 1200, 'no ticket until actual confirmation');
    // Fixed random seed exercises this family's full merge flow; distribution is checked separately.
    let qaRunId;
    for (let seed = 0; seed < 100; seed++) {
      const candidate = 'town-browser-random-' + seed;
      if (buildingCardOffers(candidate).includes('harbor_finance')) { qaRunId = candidate; break; }
    }
    assert(qaRunId);
    await page.evaluate(runId => { GameProgression.createRunId = () => runId; }, qaRunId);
    await page.locator('#start-play-btn').click();
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), 950);
    await page.evaluate(() => { window.qaRandom = Math.random; Math.random = () => .1; });
    await page.locator('[data-action="flip"]').click(); await page.locator('#event-actions [data-action="continue"]').click();
    await page.waitForFunction(() => state.isFormalRun === true && state.phase === 'await_roll');
    await page.evaluate(() => { Math.random = window.qaRandom; });
    const started = await page.evaluate(() => ({ runId: state.runId, hasWishlist: 'wishlist' in state.harborCollection, profile: GameProgression.getProfile().profile }));
    assert.equal(started.hasWishlist, false); assert.equal(started.runId, qaRunId); assert.equal(started.profile.entries.length, 1);
    // A controlled late-game fixture pays the actual purchase/build functions,
    // then reaches the normal fixed-round ending. The vault is never overwritten.
    const ended = await page.evaluate(() => {
      const human = state.players.find(player => player.id === 'human'); human.cash = human.displayedCash = 10000;
      for (const family of ['finance', 'villa']) {
        const tile = state.board.find(item => !item.isLargeSecondary && item.lot && (item.lot.landmarkKey || item.lot.theme.key) === family);
        if (!tile) throw Error('Missing harbor family: ' + family);
        if (!buyLot(human, tile, false)) throw Error('Purchase failed: ' + family);
        while (tile.lot.level < 3) buildLot(human, tile, false);
      }
      state.round = 31; state.players[1].cash = state.players[1].displayedCash = 200; finishGame('rounds');
      const receipt = state.citySettlement; finishGame('rounds');
      return { receipt, profile: GameProgression.getProfile().profile, humanCash: human.cash };
    });
    assert.equal(ended.receipt.ok, true); assert.equal(ended.profile.wallet, 950 + ended.humanCash);
    assert.deepEqual(ended.receipt.receipt.buildingCards, [{ cardId: 'harbor_finance', count: 2 }, { cardId: 'harbor_villa', count: 2 }]);
    assert.equal(ended.profile.receipts.length, 1); assert.equal(ended.profile.town.cards.harbor_finance.duplicates, 1);
    assert.equal(ended.receipt.receipt.cardRewardVersion, 3);
    assert.equal(new Set(ended.receipt.receipt.buildingCardDraft.offers).size, 3);
    assert(ended.receipt.receipt.buildingCardDraft.offers.includes('harbor_finance'));
    await skipDrama(page); await page.getByRole('heading', { name: '本局结算', exact: true }).waitFor();
    assert.match(await page.locator('#city-dialog').innerText(), /建设奖励：海港商会 ×2/);
    await page.locator('#city-dialog [data-building-card-option="harbor_finance"]').click();
    await page.locator('#city-dialog [data-building-card-claim]').click();
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.town.cards.harbor_finance.duplicates), 2);
    assert.equal(await page.evaluate(() => GameProgression.getPendingBuildingCards().rows.length), 0);
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), ended.profile.wallet);
    await page.screenshot({ path: path.join(out, '02-earned-cards-390.png') });
    await page.locator('#city-dialog [data-town-open]').click();
    await page.getByRole('heading', { name: '我的城镇', exact: true }).waitFor();
    await page.locator('.town-card-detail [data-town-action="build"]').click();
    await coordinate(page, 'x', 3); await coordinate(page, 'y', 3);
    await page.locator('[data-town-action="rotate"]').click();
    const preview = await page.evaluate(() => TownBuilder.getState().preview); assert.equal(preview.rotation, 1); assert.equal(preview.valid, true);
    const buttons = await page.locator('.town-edit-actions button').evaluateAll(nodes => nodes.map(node => ({ action: node.dataset.townAction, x: node.getBoundingClientRect().x })));
    assert(buttons.find(button => button.action === 'confirm-place').x > buttons.find(button => button.action === 'cancel').x);
    await page.locator('[data-town-action="confirm-place"]').click();
    await page.waitForFunction(() => GameProgression.getProfile().profile.town.buildings.length === 1 && TownBuilder.getState().scene?.ready, null, { timeout: 90000 });
    let built = await page.evaluate(() => GameProgression.getProfile().profile), id = built.town.buildings[0].id;
    assert.deepEqual(built.town.buildings[0], { id, cardId: 'harbor_finance', x: 2, y: 2, rotation: 1, stored: false });
    assert.equal(built.wallet, ended.profile.wallet - 300); assert.equal(built.town.cards.harbor_finance.duplicates, 2);
    await fit(page, 390, 844, '03-built'); await fit(page, 320, 568, '03-built'); await page.setViewportSize({ width: 390, height: 844 });
    await pickBuilding(page, id); await page.locator('[data-town-action="move"]').click();
    await coordinate(page, 'x', 4); await coordinate(page, 'y', 4); await page.locator('[data-town-action="rotate"]').click();
    await page.locator('[data-town-action="confirm-place"]').click();
    built = await page.evaluate(() => GameProgression.getProfile().profile);
    assert.deepEqual(built.town.buildings[0], { id, cardId: 'harbor_finance', x: 3, y: 3, rotation: 2, stored: false });
    assert.equal(built.wallet, ended.profile.wallet - 300);
    await pickBuilding(page, id); await page.locator('[data-town-action="store"]').click();
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.town.buildings[0].stored), true);
    await page.locator('[data-town-shelf="storage"]').click(); await page.locator(`[data-town-stored="${id}"]`).click();
    await page.locator('[data-town-action="restore"]').click(); await coordinate(page, 'x', 2); await coordinate(page, 'y', 3);
    await page.locator('[data-town-action="confirm-place"]').click();
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.wallet), ended.profile.wallet - 300);
    await page.locator('[data-town-shelf="collection"]').click(); await page.locator('[data-town-card="harbor_finance"]').click();
    await page.locator('[data-town-action="merge"]').click();
    const merged = await page.evaluate(() => GameProgression.getProfile().profile);
    assert.equal(merged.town.cards.harbor_finance.star, 2); assert.equal(merged.town.cards.harbor_finance.duplicates, 0);
    assert.equal(merged.town.buildings[0].id, id); assert.equal(merged.wallet, ended.profile.wallet - 300);
    await page.locator('[data-town-section="land"]').click();
    await page.locator('[data-town-action="expand"]').click(); await page.locator('[data-town-action="confirm-expand"]').click();
    const finalProfile = await page.evaluate(() => GameProgression.getProfile().profile);
    assert.equal(finalProfile.town.size, 8); assert.equal(finalProfile.town.landStage, 1);
    assert.equal(finalProfile.wallet, merged.wallet - 500);
    assert.equal(finalProfile.collections.harbor_shell, merged.collections.harbor_shell - 2);
    await fit(page, 390, 844, '04-merged-expanded'); await fit(page, 320, 568, '04-merged-expanded');
    await page.reload(); await page.waitForFunction(() => window.GameProgression?.town && window.TownBuilder);
    assert.deepEqual(await page.evaluate(() => GameProgression.getProfile().profile), finalProfile);
    const duplicate = await page.evaluate(receipt => GameProgression.settle({ ...receipt, humanCash: receipt.cash, eligible: true,
      buildingCardDraft: true,
      buildingCards: [{ cardId: 'harbor_finance', count: 2 }, { cardId: 'harbor_villa', count: 2 }],
    }), ended.receipt.receipt);
    assert.equal(duplicate.duplicate, true); assert.equal(duplicate.profile.wallet, finalProfile.wallet);
    await page.locator('.city-menu-button').click(); await page.waitForFunction(() => TownBuilder.getState().scene?.ready, null, { timeout: 90000 });
    assert.equal(await page.evaluate(() => TownBuilder.getState().scene.buildings), 1);
    await page.screenshot({ path: path.join(out, '05-reloaded-320.png') });
    assert.deepEqual(errors, []); pass('actual ticket → construction milestones → five cards → town place/rotate/move/store/restore/merge/expand → reload, at 390 and 320 px');
    await context.close();

    const legacy = legacyFixture(), legacyContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await legacyContext.addInitScript(({ key, profile }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(profile)); }, { key: STORAGE_KEY, profile: legacy });
    page = await legacyContext.newPage(); await page.goto(base); await page.waitForFunction(() => window.GameProgression?.town);
    const migrated = await page.evaluate(() => GameProgression.getProfile().profile);
    assert.equal(migrated.version, 5); assert.equal(migrated.wallet, legacy.wallet); assert.equal(migrated.earned, legacy.earned);
    assert.deepEqual(migrated.entries, legacy.entries); assert.deepEqual(migrated.projectLevels, legacy.projectLevels); assert.deepEqual(migrated.collections, legacy.collections);
    assert.equal(migrated.town.cards.harbor_villa.unlocked, false);
    const boundary = await page.evaluate(() => {
      const base = { eligible: true, mapId: 'harbor', mapName: '潮汐港湾', mode: 'rounds', reason: 'rounds', rounds: 30, humanCash: 1200, winnerId: 'ai', collectionCount: 1 };
      const old = GameProgression.settle({ ...base, runId: 'legacy-harbor' });
      const denied = GameProgression.settle({ ...base, runId: 'new-unpaid', buildingCards: [{ cardId: 'harbor_onsen', count: 1 }] });
      const entry = GameProgression.enter({ runId: 'new-paid', mapId: 'harbor', price: 250 });
      const paid = GameProgression.settle({ ...base, runId: 'new-paid', buildingCards: [{ cardId: 'harbor_onsen', count: 1 }] });
      const repeat = GameProgression.settle({ ...base, runId: 'new-paid', buildingCards: [{ cardId: 'harbor_onsen', count: 1 }] });
      return { old, denied, entry, paid, repeat };
    });
    assert.equal(boundary.old.duplicate, true); assert.equal(boundary.denied.error, 'unpaid'); assert.equal(boundary.entry.ok, true);
    assert.equal(boundary.paid.ok, true); assert.equal(boundary.repeat.duplicate, true); assert.equal(boundary.paid.profile.wallet, legacy.wallet - 250 + 1200);
    assert.equal(boundary.paid.profile.town.cards.harbor_onsen.star, 1); assert.equal(boundary.paid.profile.town.cards.harbor_villa.star, 0);
    await legacyContext.close(); pass('actual browser v2 migration preserves old records, rejects unpaid reward, and grants a new admitted run once');
    for (const failure of ['corrupt', 'blocked']) {
      const raw = failure === 'corrupt' ? '{"version":3,"wallet":42,"town":null}' : JSON.stringify(legacy);
      const failureContext = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
      await failureContext.addInitScript(({ key, raw, blocked }) => {
        const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
        set.call(localStorage, key, raw); window.qaReadOriginalTownSave = () => get.call(localStorage, key);
        if (blocked) {
          Storage.prototype.getItem = function () { throw new DOMException('Storage disabled', 'SecurityError'); };
          Storage.prototype.setItem = function () { throw new DOMException('Storage disabled', 'SecurityError'); };
        }
      }, { key: STORAGE_KEY, raw, blocked: failure === 'blocked' });
      page = await failureContext.newPage(); await page.goto(base); await page.waitForFunction(() => window.GameProgression?.town && window.TownBuilder);
      await page.locator('.city-menu-button').click();
      await page.getByRole('heading', { name: '仓库', exact: true }).waitFor();
      assert.match(await page.locator('.city-message-error').innerText(), /存档|存储/);
      assert.equal(await page.evaluate(() => document.querySelector('.town-builder').hidden), true);
      assert.equal(await page.evaluate(() => document.body.classList.contains('town-open')), false);
      assert.equal(await page.evaluate(() => window.qaReadOriginalTownSave()), raw, `${failure} original bytes preserved`);
      assert.equal(await page.locator('#city-dialog').evaluate(dialog => dialog.open), true);
      await failureContext.close(); pass(`${failure} town save opens a visible recovery message and preserves the original bytes`);
    }
    await admissionQuotaCase(browser, base);
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: true, viewportWidths: [390, 320], actualRunId: started.runId, earnedCards: ended.receipt.receipt.buildingCards, finalTown: finalProfile.town, finalWallet: finalProfile.wallet, browserErrors: errors }, null, 2));
  } catch (error) {
    if (page && !page.isClosed()) { await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(out, 'failure.txt'), String(error.stack)); }
    throw error;
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

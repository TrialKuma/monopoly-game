'use strict';
// A fresh Chrome profile owns this fixture. The user's current game and save
// are never opened or changed by this regression.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { createStore, STORAGE_KEY, BUILDING_CARDS, PROJECTS, TownPlan, validProfile } = require('../progression.js');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'work/town-expansion-qa');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary' };
const server = http.createServer((req, res) => {
  const requested = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!requested.startsWith(root + path.sep) || !fs.existsSync(requested) || !fs.statSync(requested).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(requested)] || 'application/octet-stream' }); fs.createReadStream(requested).pipe(res);
});
const pass = message => console.log('PASS ' + message);
function fixture() {
  const data = new Map(), store = createStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }, () => '2026-10-25T12:00:00.000Z');
  for (const card of BUILDING_CARDS) {
    for (const count of [5, 2]) {
      const runId = `expansion-fixture-${card.id}-${count}`;
      assert.equal(store.enter({ runId, mapId: 'harbor', price: 250 }).ok, true);
      assert.equal(store.settle({ eligible: true, runId, mapId: 'harbor', mapName: '潮汐港湾', mode: 'rounds', reason: 'rounds', rounds: 30, humanCash: 2000, winnerId: 'human', collectionCount: 3, buildingCards: [{ cardId: card.id, count }] }).ok, true);
    }
    assert.equal(store.town.merge({ cardId: card.id, expectedStar: 2 }).ok, true);
    assert.equal(store.town.merge({ cardId: card.id, expectedStar: 3 }).ok, true);
  }
  for (const [mapId, count] of [['classic', 4], ['alpine', 3]]) for (let i = 0; i < count; i++) {
    const runId = 'materials-' + mapId + '-' + i, price = mapId === 'alpine' ? 350 : 100;
    assert.equal(store.enter({ runId, mapId, price }).ok, true);
    assert.equal(store.settle({ eligible: true, runId, mapId, mapName: mapId, mode: 'rounds', reason: 'rounds', rounds: 30, humanCash: 2000, winnerId: 'human', collectionCount: 3, buildingCards: [] }).ok, true);
  }
  const placements = [
    ['harbor_villa', 0, 0, 0], ['harbor_shop', 2, 0, 0], ['harbor_hotel', 4, 0, 0],
    ['harbor_tower', 1, 2, 0], ['harbor_finance', 3, 2, 0],
    ['harbor_skyscraper', 0, 4, 0], ['harbor_onsen', 4, 4, 1]
  ];
  for (const [cardId, x, y, rotation] of placements) assert.equal(store.town.place({ cardId, x, y, rotation }).ok, true);
  const profile = store.read().profile; assert.equal(validProfile(profile), true); return profile;
}
async function contextFor(browser, base, profile, viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion });
  await context.addInitScript(({ key, profile }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(profile)); }, { key: STORAGE_KEY, profile });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base); await page.waitForFunction(() => window.GameProgression?.town && window.TownBuilder);
  await page.locator('.city-menu-button').click();
  await page.waitForFunction(() => TownBuilder.getState().scene?.ready, null, { timeout: 90000 });
  return { context, page, errors };
}
async function snapshot(page) { return page.evaluate(() => ({ scene: TownBuilder.getState().scene, profile: GameProgression.getProfile().profile })); }
async function fit(page, viewport) {
  const bounds = await page.evaluate(() => Object.fromEntries(['.town-builder', '.town-header', '.town-view', '.town-side'].map(selector => {
    const node = document.querySelector(selector), r = node?.getBoundingClientRect(); return [selector, r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, scroll: node.scrollWidth, width: node.clientWidth } : null];
  })));
  for (const [selector, rect] of Object.entries(bounds)) {
    if (!rect) continue;
    assert(rect.left >= -.5 && rect.right <= viewport.width + .5, `${selector} horizontal fit: ${JSON.stringify(rect)}`);
    assert(rect.top >= -.5 && rect.bottom <= viewport.height + .5, `${selector} vertical fit: ${JSON.stringify(rect)}`);
    assert(rect.scroll <= rect.width + 1, `${selector} horizontal overflow`);
  }
}
async function sampleAnimation(page) {
  await page.evaluate(() => {
    window.qaExpansionFrames = []; window.qaExpansionStarted = false; window.qaExpansionDone = false;
    const start = performance.now();
    function sample(now) {
      const scene = TownBuilder.getState().scene;
      if (scene) window.qaExpansionFrames.push({ time: now - start, ...scene });
      if (scene?.expansion?.active) window.qaExpansionStarted = true;
      if (window.qaExpansionStarted && !scene?.expansion?.active) { window.qaExpansionDone = true; return; }
      if (now - start < 10000) requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}
async function prepareExpand(page) {
  await page.locator('[data-town-section="land"]').click();
  await page.locator('[data-town-action="expand"]').click();
  await page.waitForFunction(() => TownBuilder.getState().mode === 'expand');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
function assertGrowth(before, after, frames, district) {
  const active = frames.filter(frame => frame.expansion?.active);
  assert(active.length >= 4, 'multiple rendered expansion frames');
  assert(active.some(frame => frame.expansion.progress > .2 && frame.expansion.progress < .8), 'visible intermediate expansion');
  assert(active.every(frame => frame.expansion.fromWidth === district.fromWidth && frame.expansion.fromHeight === district.fromHeight));
  assert(active.every(frame => frame.expansion.newCellCount === district.w * district.h), 'only the purchased district opens');
  const area = scene => scene.landScreenBounds.width * scene.landScreenBounds.height;
  assert(area(after) > area(before) * 1.08, 'land occupies more screen area');
  let maxScreenDrift = 0, maxWorldDrift = 0;
  for (const frame of [...frames, after]) {
    assert(Math.abs(frame.cameraSpan - before.cameraSpan) < 1e-6, 'camera span remains fixed');
    assert(Math.abs(frame.buildingScalePixels - before.buildingScalePixels) < 1e-6, 'building pixels remain fixed');
    for (const old of before.buildingCenters) {
      const current = frame.buildingCenters.find(item => item.id === old.id); assert(current, 'existing building remains present');
      const screenDrift = Math.hypot(current.x - old.x, current.y - old.y), worldDrift = Math.hypot(current.worldX - old.worldX, current.worldZ - old.worldZ);
      maxScreenDrift = Math.max(maxScreenDrift, screenDrift); maxWorldDrift = Math.max(maxWorldDrift, worldDrift);
      assert(screenDrift < .75, `stage ${district.stage}: existing building drifted ${screenDrift.toFixed(2)}px`);
      assert(worldDrift < 1e-6, 'existing world coordinates never move');
    }
  }
  for (let i = 1; i < active.length; i++) {
    assert(active[i].expansion.progress >= active[i - 1].expansion.progress, 'progress never reverses');
    assert(active[i].visualWidth + 1e-6 >= active[i - 1].visualWidth && active[i].visualHeight + 1e-6 >= active[i - 1].visualHeight, 'neither land axis shrinks');
    assert(area(active[i]) + 1e-3 >= area(active[i - 1]), 'screen land never shrinks');
  }
  assert.equal(after.visualWidth, district.width); assert.equal(after.visualHeight, district.height);
  assert.equal(after.land.stage, district.stage); assert.equal(after.expansion.active, false);
  const duration = active.at(-1).time - active[0].time;
  assert(duration >= 650 && duration < 5000, `bounded readable animation: ${duration}`);
  assert(after.renderCalls < 180, `batched rendering remains bounded: ${after.renderCalls}`);
  assert(after.geometryCount < 280, `geometry count remains bounded: ${after.geometryCount}`);
  return { stage: district.stage, sampledFrames: frames.length, activeFrames: active.length, duration, maxScreenDrift, maxWorldDrift, landScreenAreaRatio: area(after) / area(before), renderCalls: after.renderCalls, geometryCount: after.geometryCount };
}
async function coordinates(page, x, y) {
  for (const [axis, value] of [['x', x + 1], ['y', y + 1]]) {
    const input = page.locator(`[data-town-coordinate="${axis}"]`); await input.fill(String(value)); await input.press('Tab');
  }
}
async function buildInNewDistrict(page, district) {
  await page.locator('[data-town-section="buildings"]').click();
  await page.locator('[data-town-card="harbor_villa"]').click();
  await page.locator('[data-town-action="build"]').click();
  await coordinates(page, district.width - 1, district.height - 1);
  assert.equal(await page.evaluate(() => TownBuilder.getState().preview.valid), true);
  const before = await snapshot(page);
  await page.locator('[data-town-action="confirm-place"]').click();
  const after = await snapshot(page), added = after.profile.town.buildings.at(-1);
  assert.equal(added.x, district.width - 1); assert.equal(added.y, district.height - 1);
  assert.equal(after.profile.wallet, before.profile.wallet - 120); assert.equal(after.profile.town.buildings.length, before.profile.town.buildings.length + 1);
  assert(after.scene.buildingCenters.some(item => item.id === added.id));
}
async function landscapes(page, viewport) {
  await page.locator('[data-town-section="landscape"]').click();
  const before = await snapshot(page);
  for (const project of PROJECTS) {
    await page.locator(`[data-town-project="${project.id}"]`).click();
    for (const level of [1, 2, 3]) {
      const prior = await snapshot(page);
      await page.locator(`[data-town-action="landscape"][data-project-level="${level}"]`).click();
      await page.waitForFunction(({ id, level }) => TownBuilder.getState().scene.projects.some(project => project.id === id && project.level === level), { id: project.id, level });
      const after = await snapshot(page);
      assert.equal(after.profile.projectLevels[project.id], level);
      assert.equal(after.profile.wallet, prior.profile.wallet - project.coins[level - 1]);
      assert.equal(after.profile.collections[project.collectionId], prior.profile.collections[project.collectionId] - project.items[level - 1]);
      assert.deepEqual(after.profile.town.buildings, before.profile.town.buildings);
    }
    assert.equal(await page.locator('[data-town-action="landscape"]').count(), 0);
  }
  await fit(page, viewport); await page.screenshot({ path: path.join(out, `${viewport.width}-all-public-landscapes.png`) });
  return snapshot(page);
}
async function shortageCase(browser, base) {
  let value = null; const store = createStore({ getItem: () => value, setItem: (_, next) => { value = next; } });
  store.enter({ runId: 'one-shell', mapId: 'harbor', price: 250 });
  store.settle({ eligible: true, runId: 'one-shell', mapId: 'harbor', mapName: '港湾', mode: 'rounds', reason: 'rounds', rounds: 30, winnerId: 'ai', humanCash: 3000, collectionCount: 1, buildingCards: [{ cardId: 'harbor_villa', count: 1 }] });
  store.town.place({ cardId: 'harbor_villa', x: 0, y: 0 });
  const run = await contextFor(browser, base, store.read().profile, { width: 320, height: 568 });
  try {
    const page = run.page, before = await snapshot(page); await prepareExpand(page);
    assert.equal(await page.locator('[data-town-action="confirm-expand"]').isDisabled(), true);
    const denied = await page.evaluate(() => GameProgression.town.expand({ expectedStage: 1 })); assert.equal(denied.error, 'missing_collection');
    assert.deepEqual((await snapshot(page)).profile, before.profile);
    await page.screenshot({ path: path.join(out, '320-missing-material.png') });
    await page.locator('[data-town-action="cancel"]').click();
    await page.locator('[data-town-section="buildings"]').click(); await page.locator('[data-town-action="build"]').click(); await coordinates(page, 6, 0);
    assert.equal(await page.evaluate(() => TownBuilder.getState().preview.valid), false);
    assert.equal(await page.locator('[data-town-action="confirm-place"]').isDisabled(), true);
    assert.deepEqual((await snapshot(page)).profile, before.profile); assert.deepEqual(run.errors, []);
    pass('missing materials and locked district placement disable confirmation and leave all balances untouched');
  } finally { await run.context.close(); }
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); fs.mkdirSync(out, { recursive: true });
  const base = `http://127.0.0.1:${server.address().port}`, profile = fixture(), results = [];
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  let page;
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
      const run = await contextFor(browser, base, profile, viewport); page = run.page; const stages = [];
      await fit(page, viewport); await page.screenshot({ path: path.join(out, `${viewport.width}-before.png`) });
      for (const district of TownPlan.districts) {
        await prepareExpand(page); const before = await snapshot(page); await sampleAnimation(page);
        await page.locator('[data-town-action="confirm-expand"]').click();
        await page.waitForFunction(() => TownBuilder.getState().scene?.expansion?.active);
        assert.equal(await page.locator('.town-canvas').getAttribute('aria-busy'), 'true');
        assert.equal(await page.locator('[data-town-action="close"]').isEnabled(), true);
        if (district.stage === 1 || district.stage === 4) await page.screenshot({ path: path.join(out, `${viewport.width}-stage${district.stage}-mid.png`) });
        await page.waitForFunction(() => window.qaExpansionDone, null, { timeout: 10000 });
        const after = await snapshot(page), frames = await page.evaluate(() => window.qaExpansionFrames);
        fs.writeFileSync(path.join(out, `${viewport.width}-stage${district.stage}-frames.json`), JSON.stringify({ before: before.scene, after: after.scene, frames }, null, 2));
        assert.equal(after.profile.wallet, before.profile.wallet - district.coins);
        assert.equal(after.profile.collections[district.collectionId], before.profile.collections[district.collectionId] - district.count);
        assert.deepEqual(after.profile.town.buildings, before.profile.town.buildings);
        stages.push(assertGrowth(before.scene, after.scene, frames, district));
        const duplicate = await page.evaluate(expectedStage => GameProgression.town.expand({ expectedStage }), district.stage);
        assert.equal(duplicate.duplicate, true); assert.deepEqual((await snapshot(page)).profile, after.profile);
        await fit(page, viewport); await page.screenshot({ path: path.join(out, `${viewport.width}-stage${district.stage}-after.png`) });
        await buildInNewDistrict(page, district);
      }
      const completed = await landscapes(page, viewport);
      await page.reload(); await page.waitForFunction(() => window.GameProgression?.town && window.TownBuilder); await page.locator('.city-menu-button').click();
      await page.waitForFunction(() => TownBuilder.getState().scene?.ready, null, { timeout: 90000 });
      const restored = await snapshot(page); assert.deepEqual(restored.profile, completed.profile); assert.deepEqual(restored.scene.projects.map(p => [p.id, p.level]).sort(), [['garden', 3], ['skyline', 3], ['waterfront', 3]]);
      assert.equal(restored.scene.land.stage, 4); assert.equal(restored.scene.expansion.active, false); assert.deepEqual(run.errors, []);
      results.push({ viewport, stages, projectLevels: restored.profile.projectLevels, finalWallet: restored.profile.wallet, browserErrors: run.errors });
      await run.context.close(); pass(`${viewport.width}px: four paid districts, stable building anchors, new land construction, all nine landscape upgrades and reload`);
    }
    await shortageCase(browser, base);
    const interrupted = await contextFor(browser, base, profile, { width: 390, height: 844 }); page = interrupted.page;
    await prepareExpand(page); await page.locator('[data-town-action="confirm-expand"]').click();
    await page.waitForFunction(() => TownBuilder.getState().scene?.expansion?.active); await page.locator('[data-town-action="close"]').click();
    assert.equal(await page.evaluate(() => TownBuilder.getState().open), false); await page.locator('.city-menu-button').click();
    await page.waitForFunction(() => TownBuilder.getState().scene?.ready, null, { timeout: 90000 });
    const resumed = await snapshot(page); assert.equal(resumed.profile.wallet, profile.wallet - 500); assert.equal(resumed.profile.collections.harbor_shell, profile.collections.harbor_shell - 2);
    assert.equal(resumed.scene.land.stage, 1); assert.equal(resumed.scene.visualWidth, 8); assert.equal(resumed.scene.visualHeight, 6); assert.equal(resumed.scene.expansion.active, false);
    assert.deepEqual(interrupted.errors, []); await interrupted.context.close(); pass('closing during an expansion saves its payment once and reopens with the district completed');
    const quiet = await contextFor(browser, base, profile, { width: 320, height: 568 }, 'reduce'); page = quiet.page;
    for (const district of TownPlan.districts) {
      await prepareExpand(page); await page.locator('[data-town-action="confirm-expand"]').click();
      await page.waitForFunction(stage => TownBuilder.getState().scene?.land.stage === stage && !TownBuilder.getState().scene.expansion.active, district.stage, { timeout: 1000 });
    }
    const reduced = await snapshot(page); assert.equal(reduced.scene.visualWidth, 10); assert.equal(reduced.scene.visualHeight, 10); assert.equal(reduced.profile.wallet, profile.wallet - 4100);
    await fit(page, { width: 320, height: 568 }); await page.screenshot({ path: path.join(out, '320-reduced-motion.png') });
    assert.deepEqual(quiet.errors, []); await quiet.context.close(); pass('reduced motion quietly opens all four districts at the correct total cost');
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify({ ok: true, results }, null, 2));
  } catch (error) {
    if (page && !page.isClosed()) { await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); fs.writeFileSync(path.join(out, 'failure.txt'), String(error.stack)); }
    throw error;
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

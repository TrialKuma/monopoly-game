'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { createStore, validProfile } = require('../progression.js');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'work/settlement-card-qa');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/progression.css"><link rel="stylesheet" href="/settlement-card.css"><style>*{box-sizing:border-box}body{margin:0;background:#d9e7dd;font-family:Arial,sans-serif}.start-panel{padding:20px}</style></head><body><div id="start-screen"><div class="start-panel"><div id="start-map-options"><button data-map-id="harbor" aria-pressed="true"><span class="map-option-title">潮汐港湾</span></button></div></div></div><script>window.TownBuilder={open(){window.townOpened=true}};</script><script src="/town-plan.js"></script><script src="/progression.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); return; }
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': ({ '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
async function fit(page, width) {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
  await page.locator('[data-building-card-draft]').scrollIntoViewIfNeeded();
  const bounds = await page.evaluate(() => [...document.querySelectorAll('.city-dialog, .building-card-draft, .building-card-option, .building-card-choice-actions')].map(node => {
    const r = node.getBoundingClientRect(); return { class: node.className, left: r.left, right: r.right, scroll: node.scrollWidth, width: node.clientWidth };
  }));
  for (const b of bounds) { assert.ok(b.left >= -.5 && b.right <= width + .5, JSON.stringify(b)); assert.ok(b.scroll <= b.width + 1, JSON.stringify(b)); }
  const confirmed = await page.locator('[data-building-card-claim]').boundingBox(), draft = await page.locator('[data-building-card-draft]').boundingBox();
  assert.ok(confirmed.x + confirmed.width / 2 > draft.x + draft.width / 2, 'confirmation stays on right');
  assert.equal(await page.locator('[data-building-card-option] img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), true);
  await page.screenshot({ path: path.join(out, `choice-${width}.png`), fullPage: true });
}
(async () => {
  fs.mkdirSync(out, { recursive: true }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(base); await page.waitForFunction(() => window.GameProgression);
    await page.evaluate(() => {
      GameProgression.enter({ runId: 'browser-choice', mapId: 'harbor', price: 250 });
      const result = GameProgression.settle({ eligible: true, runId: 'browser-choice', mapId: 'harbor', mapName: '潮汐港湾', mode: 'rounds', reason: 'rounds', winnerId: 'human', rounds: 30, humanCash: 2400, collectionCount: 2, buildingCardDraft: true, buildingCards: [{ cardId: 'harbor_villa', count: 2 }] });
      GameProgression.showResult(result);
    });
    await page.locator('[data-building-card-option]').first().waitFor();
    assert.equal(await page.locator('[data-building-card-option]').count(), 3); assert.equal(await page.locator('[data-building-card-claim]').isDisabled(), true);
    assert.match(await page.locator('.city-result').innerText(), /建设奖励：海湾公馆 ×2/);
    await page.locator('[data-building-card-option] img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    await fit(page, 390); await fit(page, 320);
    const offers = await page.locator('[data-building-card-option]').evaluateAll(buttons => buttons.map(button => button.dataset.buildingCardOption));
    const selected = offers[0], beforeSelection = await page.evaluate(() => GameProgression.getProfile().profile);
    await page.locator(`[data-building-card-option="${selected}"]`).click();
    assert.equal(await page.locator('[data-building-card-claim]').isDisabled(), false);
    assert.deepEqual(await page.evaluate(() => GameProgression.getProfile().profile), beforeSelection, 'selecting does not claim');
    assert.doesNotMatch(await page.locator('#city-dialog').innerText(), /心愿|目标|必定出现/);
    assert.equal(await page.evaluate(() => typeof GameProgression.town.setTarget), 'undefined');
    const saved = await page.evaluate(() => localStorage.getItem('monopoly_city_v1'));
    await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
    await page.locator('[data-building-card-claim]').click();
    assert.match(await page.locator('.building-card-choice-error').innerText(), /保存失败/);
    assert.equal(await page.evaluate(() => localStorage.getItem('monopoly_city_v1')), saved);
    await page.reload(); await page.locator('.city-menu-button').waitFor();
    assert.match(await page.locator('.city-menu-button').innerText(), /1 份待领取/);
    await page.locator('.city-menu-button').click();
    assert.equal(await page.locator('[data-building-card-claim]').isDisabled(), true, 'refresh requires an explicit selection again');
    assert.deepEqual(await page.locator('[data-building-card-option]').evaluateAll(buttons => buttons.map(button => button.dataset.buildingCardOption)), offers);
    assert.equal(await page.evaluate(() => !!window.townOpened), false, 'town entry resumes saved choice');
    await page.locator(`[data-building-card-option="${selected}"]`).click(); await page.locator('[data-building-card-claim]').click();
    assert.equal(await page.locator('[data-building-card-option]').count(), 0);
    const claimed = await page.evaluate(() => GameProgression.getProfile().profile); assert.equal(claimed.town.cards[selected].unlocked, true); assert.equal(claimed.town.cards[selected].duplicates, beforeSelection.town.cards[selected].unlocked ? beforeSelection.town.cards[selected].duplicates + 1 : 0);
    await page.locator('#city-dialog [data-town-open]').click(); assert.equal(await page.evaluate(() => window.townOpened), true);
    await page.reload(); assert.equal(await page.evaluate(cardId => GameProgression.claimBuildingCard({ runId: 'browser-choice', cardId }).duplicate, selected), true);
    assert.deepEqual(await page.evaluate(() => GameProgression.getProfile().profile), claimed);
    await page.evaluate(() => GameProgression.open('city')); assert.equal(await page.locator('[data-building-card-option]').count(), 0);
    let legacyRaw = null;
    const legacyStore = createStore({ getItem: () => legacyRaw, setItem: (_, value) => { legacyRaw = value; } });
    legacyStore.enter({ runId: 'legacy-target-pending', mapId: 'harbor', price: 250 });
    legacyStore.settle({ eligible: true, runId: 'legacy-target-pending', mapId: 'harbor', mapName: '潮汐港湾', mode: 'rounds', reason: 'rounds', winnerId: 'human', rounds: 30, humanCash: 1500, collectionCount: 2, buildingCardDraft: true, buildingCards: [] });
    const legacy = legacyStore.read().profile;
    legacy.receipts[0].cardRewardVersion = 2;
    legacy.receipts[0].buildingCardDraft = { targetCardId: 'harbor_finance', offers: ['harbor_hotel', 'harbor_finance', 'harbor_skyscraper'] };
    assert.equal(validProfile(legacy), true);
    await page.evaluate(profile => localStorage.setItem('monopoly_city_v1', JSON.stringify(profile)), legacy); await page.reload();
    await page.locator('.city-menu-button').click();
    assert.deepEqual(await page.locator('[data-building-card-option]').evaluateAll(buttons => buttons.map(button => button.dataset.buildingCardOption)), legacy.receipts[0].buildingCardDraft.offers);
    assert.doesNotMatch(await page.locator('#city-dialog').innerText(), /心愿|目标|必定出现/);
    await page.locator('[data-building-card-option="harbor_finance"]').click(); await page.locator('[data-building-card-claim]').click();
    assert.equal(await page.evaluate(() => GameProgression.getProfile().profile.town.cards.harbor_finance.unlocked), true);
    assert.deepEqual(errors, []);
    console.log('PASS random result choice without wishlist, right-side confirmation, 320/390 portrait fit, blocked-save retry, fixed reload offers, one-time claim and legacy pending reward');
  } finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });

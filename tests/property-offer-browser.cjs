'use strict';
// A fresh profile exercises real landing choices, money changes and model inspection.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  const output = path.join(__dirname, '../work/property-offer-qa'); fs.mkdirSync(output, { recursive: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.CITY_PREVIEW_URL || 'http://127.0.0.1:8876/');
    await page.waitForFunction(() => window.CityScene?.ready && window.GamePresentation);
    const open = async (map, level = 0, owned = false) => page.evaluate(({map, level, owned}) => {
      initializeGame(map); hideStartScreen(); state.currentPlayerIndex = 0;
      const player = state.players[0]; player.cash = player.displayedCash = 5000;
      const tile = map==='classic'?state.board[3]:state.board.find(t => t.lot && !t.isLargeSecondary && !t.lot.isLarge);
      tile.lot.ownerId = owned ? player.id : null; tile.lot.level = level;
      player.position = tile.index; render();
      window.offerPending = resolveLanding(player, tile, state.sessionId);
      return {name:tile.name,index:tile.index,price:owned?tile.lot.buildCosts[level+1]:tile.lot.price,rent:tile.lot.tolls[level]};
    }, {map, level, owned});
    for (const [width,height] of [[320,568],[390,844]]) {
      await page.setViewportSize({width,height});
      for (const map of ['classic','compact','expansion','harbor','alpine']) {
        const offer = await open(map);
        await page.locator('.property-offer-overlay.visible').waitFor();
        const layout = await page.evaluate(() => {
          const root = document.querySelector('.property-offer-overlay'), price = root.querySelector('.property-offer-price strong'), rent = root.querySelector('.property-offer-rent');
          return {text:root.innerText,price:price.textContent,priceSize:parseFloat(getComputedStyle(price).fontSize),rentSize:parseFloat(getComputedStyle(rent).fontSize),card:root.querySelector('.event-card').getBoundingClientRect().toJSON(),buy:root.querySelector('[data-action="buy"]').getBoundingClientRect().toJSON(),skip:root.querySelector('[data-action="skip"]').getBoundingClientRect().toJSON(),width:document.documentElement.scrollWidth};
        });
        assert.equal(layout.price, `¥${offer.price}`);
        assert(layout.priceSize > layout.rentSize*2);
        assert(!/操作后现金|查看满级|Lv\.3/.test(layout.text));
        assert(layout.buy.x > layout.skip.x && layout.width <= width);
        assert(layout.card.left >= 0 && layout.card.right <= width && layout.card.top >= 0 && layout.card.bottom <= height);
        if(map==='classic') { await page.waitForTimeout(500); await page.screenshot({path:path.join(output,`offer-${width}.png`),animations:'disabled'}); }
        await page.locator('[data-action="skip"]').click(); await page.evaluate(() => offerPending);
        assert.equal(await page.evaluate(() => state.players[0].cash),5000);
        await open(map);
        await page.locator('[data-action="buy"]').click();
        await page.locator('.drama-kind-buy').waitFor();
        assert.equal(await page.locator('.drama-title').textContent(),offer.name);
        assert.equal(await page.locator('.drama-amount,.drama-purchase-ribbon,.drama-message').count(),0);
        assert(!/¥|买入花费|购买成功/.test(await page.locator('.drama-card').innerText()));
        assert.equal(await page.evaluate(() => state.players[0].cash),5000-offer.price);
        assert.equal(await page.evaluate(i => state.board[i].lot.ownerId,offer.index),'human');
        if(map==='classic') { await page.waitForTimeout(650); await page.screenshot({path:path.join(output,`purchased-${width}.png`),animations:'disabled'}); }
        await page.locator('.drama-skip').click(); await page.evaluate(() => offerPending);
      }
      const upgrade = await open('classic',1,true);
      assert.equal(await page.locator('.property-offer-price strong').textContent(),`¥${upgrade.price}`);
      assert(!/操作后现金|查看满级/.test(await page.locator('#event-card').innerText()));
      await page.waitForTimeout(500); await page.screenshot({path:path.join(output,`upgrade-${width}.png`),animations:'disabled'});
      await page.locator('[data-action="build"]').click();await page.locator('.drama-kind-build').waitFor();
      assert.deepEqual(await page.evaluate(i=>({cash:state.players[0].cash,level:state.board[i].lot.level}),upgrade.index),{cash:5000-upgrade.price,level:2});
      await page.locator('.drama-skip').click();await page.evaluate(()=>offerPending);
    }
    // Normal inspection cannot expose a future model, even with the old override argument.
    await page.setViewportSize({width:390,height:844});
    const tile = await open('classic');await page.locator('[data-action="skip"]').click();await page.evaluate(()=>offerPending);
    assert.equal(await page.evaluate(i=>CityScene.inspectTile(i,3),tile.index),false);
    assert.equal(await page.locator('#property-inspector [data-inspect-building]').count(),0);
    for(const level of [1,2,3]) {
      await page.evaluate(({index,level})=>{state.board[index].lot.level=level;state.board[index].lot.ownerId='human';render();CityScene.inspectTile(index,3);},{index:tile.index,level});
      await page.locator('#city-building-inspection[open]').waitFor();
      assert.equal(await page.locator('#city-building-inspection').getAttribute('data-level'),String(level));
      assert.equal(await page.locator('[data-model-level]').count(),0);
      await page.locator('[data-model-close]').click();
    }
    assert.equal(await page.evaluate(()=>CityScene.inspectTile(state.board.find(t=>t.special?.type==='bank').index)),true);
    await page.locator('[data-model-close]').click();
    assert.deepEqual(errors,[]);
    console.log('PASS 320/390 portrait, all five maps: clear price hierarchy, cancel/payment once, concise success, upgrades and earned-level-only inspection');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

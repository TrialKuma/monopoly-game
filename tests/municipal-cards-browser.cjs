'use strict';
// Fresh browser profile: city grant, paid arrival, next-turn bag use, and full-cost resale.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const output=path.join(__dirname,'../work/municipal-cards-qa');fs.mkdirSync(output,{recursive:true});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8876/');
    await page.waitForFunction(()=>window.CityScene?.ready&&window.GameCards);
    for(const [width,height] of [[320,568],[390,844]]) for(const cardId of ['buyProperty','sellProperty']) {
      await page.setViewportSize({width,height});
      const data=await page.evaluate(cardId=>{
        initializeGame('classic');hideStartScreen();startAiTurnWithDelay=async()=>{};
        const human=state.players[0],ai=state.players[1];human.cash=human.displayedCash=5000;ai.cash=ai.displayedCash=1600;
        const tile=cardId==='sellProperty'?state.board.find(t=>t.isLargeSecondary):state.board[3];
        tile.lot.ownerId='ai';tile.lot.level=2;render();
        const random=Math.random;Math.random=()=>cardId==='buyProperty'?.1:.9;
        window.cityPending=resolveLanding(human,state.board[0],state.sessionId);Math.random=random;
        const primary=tile.isLargeSecondary?state.board[tile.largePrimaryIndex]:tile;
        return{index:tile.index,primary:primary.index,name:primary.name,cost:getPropertyCost(tile.lot),rent:GamePresentation.rentFor(tile).total};
      },cardId);
      await page.locator('.drama-card').waitFor();
      assert.equal(await page.evaluate(()=>state.players[0].cards.length),1);
      assert.equal(await page.evaluate(()=>state.players[0].cash),5000);
      assert.equal(await page.evaluate(i=>state.board[i].lot.ownerId,data.index),'ai');
      await page.locator('.drama-skip').click();await page.evaluate(()=>cityPending);
      await page.evaluate(index=>{window.cityPending=(async()=>{await animateMovement(state.players[0],index,state.sessionId);await resolveLanding(state.players[0],state.board[index],state.sessionId);setHumanTurnStatus();render();})();},data.index);
      await page.locator('.drama-kind-rent').waitFor();
      assert.equal(await page.evaluate(()=>state.players[0].cash),5000-data.rent);
      await page.locator('.drama-skip').click();await page.evaluate(()=>cityPending);
      const early=await page.evaluate(()=>({usable:GameCards.getSnapshot().cards[0].usable,reason:GameCards.getSnapshot().cards[0].reason}));
      assert.equal(early.usable,false);assert.match(early.reason,/下回合/);
      await page.evaluate(()=>{endTurn();endTurn();});
      assert.equal(await page.evaluate(()=>GameCards.getSnapshot().cards[0].usable),true);
      await page.locator('[data-open-card-bag]:visible').first().click();
      await page.locator('#card-bag-dialog [data-use-card]').click();
      await page.locator('.property-offer-overlay.visible').waitFor();
      assert.equal(await page.locator('.property-offer-price strong').textContent(),`¥${data.cost}`);
      assert.equal(await page.locator('.property-offer-price>span').textContent(),cardId==='buyProperty'?'买入价':'原主获补偿');
      assert.equal(await page.locator('[data-city-target]').count(),0);
      const layout=await page.evaluate(()=>{const root=document.querySelector('#event-card');return{card:root.getBoundingClientRect().toJSON(),confirm:root.querySelector('[data-action="confirm"]').getBoundingClientRect().toJSON(),cancel:root.querySelector('[data-action="cancel"]').getBoundingClientRect().toJSON(),width:document.documentElement.scrollWidth};});
      assert(layout.width<=width&&layout.card.top>=0&&layout.card.bottom<=height&&layout.confirm.x>layout.cancel.x);
      await page.waitForTimeout(500);await page.screenshot({path:path.join(output,`${cardId}-${width}.png`),animations:'disabled'});
      // A cancelled quote preserves both the card and settled visit.
      await page.locator('[data-action="cancel"]').click();await page.waitForFunction(()=>!state.cardUsePending);
      assert.equal(await page.evaluate(()=>state.players[0].cards.length),1);
      await page.locator('[data-open-card-bag]:visible').first().click();await page.locator('#card-bag-dialog [data-use-card]').click();
      await page.locator('[data-action="confirm"]').click();await page.locator('.drama-card').waitFor();
      const after=await page.evaluate(i=>({cash:state.players.map(p=>p.cash),bank:state.bankPool,owner:state.board[i].lot.ownerId,level:state.board[i].lot.level,cards:state.players[0].cards.length,price:getLotPurchasePrice(state.board[i].lot)}),data.index);
      assert.deepEqual(after.cash,[5000-data.rent-(cardId==='buyProperty'?data.cost:0),1600+data.rent+data.cost]);
      assert.equal(after.bank,0);assert.equal(after.owner,cardId==='buyProperty'?'human':null);assert.equal(after.level,2);assert.equal(after.cards,0);
      if(cardId==='buyProperty')assert.equal(await page.locator('.drama-amount').count(),0);
      await page.locator('.drama-skip').click();await page.waitForFunction(()=>!state.cardUsePending);
      if(cardId==='sellProperty'){
        assert.equal(after.price,data.cost);
        await page.evaluate(index=>{window.cityPending=resolveLanding(state.players[0],state.board[index],state.sessionId);},data.index);
        await page.locator('.property-offer-overlay.visible').waitFor();
        assert.equal(await page.locator('.property-offer-price strong').textContent(),`¥${data.cost}`);
        assert.match(await page.locator(`.scene-tile[data-scene-tile-index="${data.primary}"] .scene-tile-meta`).textContent(),new RegExp(`¥${data.cost}`));
        await page.locator('[data-action="skip"]').click();await page.evaluate(()=>cityPending);
      }
    }
    assert.deepEqual(errors,[]);
    console.log('PASS 320/390 municipal grant, rent-before-trade, next own turn, cancellation, primary/secondary full-cost transfer and resale price UI');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

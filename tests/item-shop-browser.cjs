'use strict';
// Fresh profile, controlled landing; all choices, payment, inventory and rendering are production code.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8876/');await page.waitForFunction(()=>window.CityScene?.ready&&window.GameCards?.getShopSnapshot);
    assert(await page.locator('link[href*="item-shop.css"]').count(),'item shop stylesheet is integrated');
    const open=async cash=>page.evaluate(cash=>{
      initializeGame('harbor');hideStartScreen();state.currentPlayerIndex=0;state.busy=true;state.phase='locked';
      const p=state.players[0],tile=state.board.find(t=>t.special?.type==='chance');p.position=tile.index;p.cash=cash;
      drawItemShopOffers=()=>['shield','launch','combo'].map(id=>CARD_POOL.find(c=>c.id===id));render();
      window.shopPending=resolveLanding(p,tile,state.sessionId).then(()=>{setHumanTurnStatus();render();});
    },cash);
    for(const [width,height] of [[320,568],[390,844]]) {
      await page.setViewportSize({width,height});await open(160);
      await page.locator('.item-shop-overlay.visible').waitFor();
      const bounds=await page.evaluate(()=>({panel:document.querySelector('.item-shop-overlay .event-card').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('.item-shop-actions button')].map(b=>({id:b.dataset.action,...b.getBoundingClientRect().toJSON()})),scroll:document.documentElement.scrollWidth}));
      assert(bounds.scroll<=width);assert(bounds.panel.left>=0&&bounds.panel.right<=width&&bounds.panel.top>=0&&bounds.panel.bottom<=height);
      for(const button of bounds.buttons)assert(button.left>=0&&button.right<=width&&button.top>=0&&button.bottom<=height,`${width}: ${button.id} fits`);
      assert(bounds.buttons[3].y>bounds.buttons[0].y&&bounds.buttons[3].right>width*.8,'exit below the cards on the right');
      assert.equal(await page.locator('.item-shop-card:disabled').count(),2);
      const out=path.join(__dirname,'../work/item-shop-qa');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,`shop-${width}.png`)});
      await page.locator('.item-shop-card[data-action="shield"]').click();await page.evaluate(()=>window.shopPending);
      const after=await page.evaluate(()=>({cash:state.players[0].cash,shield:state.players[0].effects.shield,bag:GameCards.getSnapshot()}));
      assert.equal(after.cash,20);assert.equal(after.shield,false);assert.equal(after.bag.count,2);assert.equal(after.bag.cards.filter(card=>card.source.type==='shop').length,1);
      await page.locator('[data-open-card-bag]:visible').first().click();await page.locator('#card-bag-dialog[open]').waitFor();
      assert.deepEqual((await page.locator('#card-bag-list .bag-card h3').allTextContents()).sort(),['双骰卡','护盾术'].sort());
      await page.locator('#card-bag-close').click();
      await open(50);assert.equal(await page.locator('.item-shop-card:disabled').count(),3);
      await page.locator('.item-shop-leave').click();await page.evaluate(()=>window.shopPending);
      assert.equal(await page.evaluate(()=>state.players[0].cash),50);assert.equal(await page.evaluate(()=>GameCards.getSnapshot().count),1);
    }
    assert.deepEqual(errors,[]);console.log('PASS 320/390 real shop purchase -> bag, correct price/no auto-use, disabled affordability, right-side free exit, zero overflow and browser exceptions');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

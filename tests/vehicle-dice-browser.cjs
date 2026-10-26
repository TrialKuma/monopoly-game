'use strict';
// A fresh profile exercises real shop, inventory, selector, roll and rent settlement UI.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const output=path.join(__dirname,'../work/vehicle-dice-qa');
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],reports=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8876/');
  await page.waitForFunction(()=>window.CityScene?.ready&&window.GameVehicle&&window.GameCardBag);
  const shot=async name=>{await page.waitForTimeout(650);await page.screenshot({path:path.join(output,name),animations:'disabled'});};
  const assertSelector=async width=>{
   const layout=await page.locator('#vehicle-dice-selector').evaluate(el=>({
    rect:el.getBoundingClientRect().toJSON(),scroll:document.documentElement.scrollWidth,
    buttons:[...el.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {count:Number(b.dataset.vehicleDice),disabled:b.disabled,selected:b.getAttribute('aria-pressed'),...r.toJSON(),hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b};})
   }));
   assert(layout.scroll<=width,'document fits portrait width');
   assert(layout.rect.left>=0&&layout.rect.right<=width,'selector fits portrait width');
   for(const b of layout.buttons)assert(b.width>=44&&b.height>=32&&b.hit,'selector buttons are visible tappable controls');
   return layout;
  };
  for(const [width,height] of [[320,568],[390,844]]){
   await page.setViewportSize({width,height});
   await page.evaluate(()=>{
    initializeGame('classic');hideStartScreen();state.initiativeResolved=true;
    const p=state.players[0],tile=state.board.find(t=>t.special?.type==='chance');
    p.cash=p.displayedCash=1200;p.position=tile.index;state.currentPlayerIndex=0;state.busy=true;state.phase='locked';
    startAiTurnWithDelay=async()=>{};
    CityScene.setTimeMode('day');CityScene.setWeather('clear');CityScene.setSeason('summer');
    render();window.vehicleShopPending=resolveLanding(p,tile,state.sessionId).then(()=>{setHumanTurnStatus();render();});
   });
   await page.locator('.item-shop-overlay.visible').waitFor();
   const product=page.locator('.item-shop-card[data-action="motorcycle"]');
   assert.equal(await product.locator('.card-price').innerText(),'¥400');
   await shot(`motorcycle-shop-${width}.png`);
   await product.click();await page.evaluate(()=>vehicleShopPending);
   assert.deepEqual(await page.evaluate(()=>({cash:state.players[0].cash,vehicle:state.players[0].vehicle,card:state.players[0].cards[0].cardId})),{cash:800,vehicle:null,card:'motorcycle'});
   await page.locator('[data-open-card-bag]:visible').first().click();
   const motor=page.locator('.bag-card').filter({has:page.getByRole('heading',{name:'机车卡',exact:true})});
   await motor.locator('[data-use-card]').click();
   await page.locator('.drama-skip').click();
   await page.waitForFunction(()=>!state.cardUsePending&&state.players[0].vehicle==='motorcycle');
   assert.equal(await page.evaluate(()=>state.players[0].cash),800);
   assert.equal(await page.evaluate(()=>state.players[0].cards.length),0);
   await page.locator('#vehicle-dice-selector').waitFor({state:'visible'});
   const single=await assertSelector(width);
   assert.equal(single.buttons.find(b=>b.count===1).selected,'true');
   await page.locator('[data-vehicle-dice="2"]').click();
   assert.equal(await page.locator('.dice-pair-face').count(),2);
   const double=await assertSelector(width);
   assert.equal(double.buttons.find(b=>b.count===2).selected,'true');
   await shot(`motorcycle-double-${width}.png`);
   // A known simple rental target isolates movement and payment from unrelated landing choices.
   const rent=await page.evaluate(()=>{
    const p=state.players[0];p.position=0;
    state.board.forEach(t=>{if(t.lot){t.lot.ownerId=null;t.lot.level=0;}});
    const tile=state.board[3];tile.lot.ownerId='ai';tile.lot.level=1;
    window.vehicleLandingCount=0;window.vehicleOriginalResolve=resolveLanding;
    resolveLanding=async(...args)=>{vehicleLandingCount++;return vehicleOriginalResolve(...args);};
    let face=0;rollDice=()=>[1,2][face++%2];render();
    return tile.lot.tolls[1];
   });
   await page.locator('#roll-btn').click();
   await page.waitForFunction(()=>state.animation.diceResult&&state.lastDice===3);
   assert.deepEqual(await page.evaluate(()=>state.lastDiceFaces),[1,2]);
   await page.locator('.drama-kind-rent').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>state.players[0].cash),800-rent);
   await page.locator('.drama-skip').click();
   await page.waitForFunction(()=>state.currentPlayerIndex===1&&!state.cardUsePending);
   assert.equal(await page.evaluate(()=>vehicleLandingCount),1);
   assert.equal(await page.locator('#vehicle-dice-selector').isVisible(),false);
   // Advance the inert opponent and set another known starting position; the preference survives.
   await page.evaluate(()=>{endTurn();state.players[0].position=0;grantInventoryCard('human','launch',{type:'test_fixture'});vehicleLandingCount=0;render();});
   assert.equal(await page.evaluate(()=>state.players[0].vehicleDiceCount),2);
   assert.equal(await page.locator('[data-vehicle-dice="2"]').getAttribute('aria-pressed'),'true');
   await page.locator('[data-vehicle-dice="1"]').click();
   await page.locator('[data-open-card-bag]:visible').first().click();
   const launch=page.locator('.bag-card').filter({has:page.getByRole('heading',{name:'命定骰',exact:true})});
   await launch.locator('[data-use-card]').click();
   await page.locator('#event-actions [data-action="3"]').click();
   await page.waitForFunction(()=>!state.cardUsePending&&state.players[0].effects.fixedDiceFace===3);
   assert.equal(await page.evaluate(()=>state.players[0].position),0,'card use itself must not move');
   assert.equal(await page.evaluate(()=>state.players[0].cash),800-rent,'card use itself must not settle a tile');
   assert.equal(await page.locator('[data-vehicle-dice="2"]').isDisabled(),true);
   assert.equal(await page.locator('.dice-pair-face').count(),0);
   assert.deepEqual(await page.evaluate(()=>getDiceDisplay().faces),[3]);
   const fixed=await assertSelector(width);
   await shot(`fixed-single-${width}.png`);
   await page.evaluate(()=>{window.vehicleRandomCalls=0;rollDice=()=>{vehicleRandomCalls++;return 6;};});
   await page.locator('#roll-btn').click();
   await page.locator('.drama-kind-rent').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>vehicleRandomCalls),0,'fixed roll never samples the random die');
   assert.equal(await page.evaluate(()=>state.players[0].position),3);
   assert.equal(await page.evaluate(()=>vehicleLandingCount),1);
   assert.equal(await page.evaluate(()=>state.players[0].cash),800-rent*2);
   assert.equal(await page.evaluate(()=>state.players[0].effects.fixedDiceFace),null);
   await page.locator('.drama-skip').click();
   await page.waitForFunction(()=>state.currentPlayerIndex===1);
   assert.equal(await page.evaluate(()=>state.players[0].cards.length),0);
   await page.evaluate(()=>{resolveLanding=vehicleOriginalResolve;});
   reports.push({width,height,price:400,rent,single,double,fixed});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,reports,errors},null,2));
  console.log('PASS 320/390: real ¥400 purchase → stored card → equip → persistent physical single/double selector → independent double roll → fixed single roll → exactly-once actual movement/rent/turn; no browser errors/overflow.');
  await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

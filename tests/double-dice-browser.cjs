'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.join(__dirname,'../work/harbor-cycle-dice-qa');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[],reports=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8876/');await page.waitForFunction(()=>window.CityScene?.ready&&window.GameCardBag);
 for(const [width,height] of [[320,568],[390,844]]){
  await page.setViewportSize({width,height});
  await page.evaluate(()=>{initializeGame('harbor');grantInventoryCard('human','boost',{type:'test_fixture'});hideStartScreen();state.currentPlayerIndex=0;state.initiativeResolved=true;state.busy=false;state.phase='await_roll';setHumanTurnStatus();render();CityScene.setTimeMode('day');CityScene.setWeather('clear');CityScene.setSeason('summer');CityScene.resetView();});
  assert.equal(await page.evaluate(()=>getMaxRounds()),40);
  assert.equal(await page.evaluate(()=>GameCards.getSnapshot().count),1);
  await page.locator('[data-open-card-bag]:visible').first().click();
  await page.locator('[data-use-card]').click();
  await page.locator('#event-actions [data-action="self"]').click();
  await page.locator('.drama-skip').click();
  await page.waitForFunction(()=>!state.cardUsePending&&state.players[0].effects.speedBoost);
  assert.equal(await page.evaluate(()=>GameCards.getSnapshot().count),0);
  const initial=await page.evaluate(()=>state.players[0].harborCursor);
  await page.evaluate(()=>{let i=0;rollDice=()=>[2,5][i++%2];});
  await page.locator('#roll-btn').click();
  await page.waitForFunction(()=>state.animation.diceRolling&&state.lastDiceFaces.length===2);
  assert.equal(await page.locator('.dice-pair-face svg').count(),2);
  const roll=await page.evaluate(()=>[...document.querySelectorAll('.dice-pair-face')].map(e=>({animation:getComputedStyle(e).animationName,...e.getBoundingClientRect().toJSON()})));
  assert(roll.every(r=>r.width>=32&&r.left>=0&&r.right<=width),'both physical dice fit the portrait console');
  assert(roll.every(r=>r.animation==='doubleDiceRoll'),'two dice each animate');
  await page.waitForFunction(()=>state.animation.diceResult&&state.lastDice===7);
  const result=await page.evaluate(()=>({faces:state.lastDiceFaces,total:state.lastDice,title:document.querySelector('#center-title').textContent,overflow:document.documentElement.scrollWidth}));
  assert.deepEqual(result.faces,[2,5]);assert.equal(result.total,7);assert.match(result.title,/2 \+ 5 = 7/);assert(result.overflow<=width);
  await page.screenshot({path:path.join(out,`double-dice-${width}.png`)});
  await page.waitForFunction(initial=>state.players[0].harborCursor===initial+7&&state.modal.visible,initial,{timeout:15000});
  assert.equal(await page.evaluate(()=>state.players[0].effects.speedBoost),false);
  assert.equal(await page.evaluate(()=>state.players[0].position),7);
  reports.push({width,height,roll,result});
 }
 await page.evaluate(()=>{hideModal(false);state.animation.diceRolling=true;render();});
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.dice-pair-face').first().evaluate(e=>getComputedStyle(e).animationName),'none');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({reports,errors},null,2));
 console.log('PASS 320/390 test-supplied inventory card -> target self -> two animated dice -> 2+5=7 -> seven actual route steps; reduced motion and no overflow/errors.');
 await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

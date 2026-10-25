'use strict';
// Isolated browser profile: this never edits the user's running save or tab.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8876/');await page.waitForFunction(()=>window.CityScene?.ready&&window.GameHarbor);
  await page.locator('[data-map-id="harbor"]').click();
  await page.evaluate(()=>{initializeGame('harbor');hideStartScreen();state.busy=false;state.phase='await_roll';state.currentPlayerIndex=0;state.players[0].position=7;render();CityScene.setTimeMode('day');});
  await page.evaluate(async()=>{await(await import('./scene-model-cache.js?v=20261025-harbor1')).loadSharedModelAsset('regions/harbor.glb');});
  for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[844,390]]){
   await page.setViewportSize({width,height});
   const bounds=await page.evaluate(()=>{const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();return {roll:rect('#roll-btn'),routes:rect('#harbor-route-control'),board:rect('#board-stage'),scroll:document.documentElement.scrollWidth,width:innerWidth};});
   assert(bounds.scroll<=width,`${width}: no horizontal overflow`);
   if(height>width){for(const key of ['roll','routes'])assert(bounds[key].left>=0&&bounds[key].right<=width&&bounds[key].top>=0&&bounds[key].bottom<=height,`${width}: ${key} remains reachable`);assert(bounds.board.height>=200,`${width}: map keeps usable height`);}
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-harbor-route="resort"]').click();
  assert.equal(await page.evaluate(()=>GameHarbor.getState().route),'resort');
  const travel=await page.evaluate(async()=>{const p=state.players[0],sid=state.sessionId;p.position=7;resetHarborJourney(p);render();await new Promise(resolve=>setTimeout(resolve,550));await animateMovement(p,1,sid);return {position:p.position,duration:CityScene.getMovementDuration(p.id),modal:state.modal.visible,next:document.querySelector('.scene-travel-arrow')?.dataset.next};});
  assert.equal(travel.position,18,'actual move takes the selected alternative bridge');assert.equal(travel.modal,false,'crossing never asks for a fork confirmation');assert(travel.duration>=190);
  assert.equal(travel.next,'19','heading follows the actual chosen branch');
  await page.evaluate(()=>{state.players[0].effects.reversed=true;render();});
  const reverse=await page.evaluate(async()=>{await animateMovement(state.players[0],1,state.sessionId);return state.players[0].position;});assert.equal(reverse,7,'reverse traverses the same bridge');
  await page.evaluate(()=>{CityScene.setViewMode('overview');render();});
  assert.equal(await page.evaluate(()=>CityScene.getView().local),false);
  assert.deepEqual(errors,[]);console.log('PASS harbor scene at five viewports, visible portrait controls, selected-branch real movement, reversed bridge, route heading, overview and zero browser exceptions');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

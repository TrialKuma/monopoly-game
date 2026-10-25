'use strict';
// Isolated browser context; no live user tab or save is read or altered.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const output=path.join(__dirname,'../work/dice-display-qa');fs.mkdirSync(output,{recursive:true});
 const reports=[],errors=[];
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8876/');
  await page.waitForFunction(()=>typeof getDiceDisplay==='function'&&window.GamePresentation);
  await page.evaluate(()=>{
   window.diceQaRender=render;window.diceQaFrames=[];
   window.readDiceUi=()=>{const el=document.querySelector('#center-dice'),pair=[...el.querySelectorAll('.dice-pair-face')],rect=el.getBoundingClientRect();return {...getDiceDisplay(),pairCount:pair.length,blankCount:el.querySelectorAll('.dice-ready-mark').length,background:getComputedStyle(pair[0]||el).backgroundImage,colors:pair.map(face=>getComputedStyle(face).backgroundImage),rect:{left:rect.left,right:rect.right,width:rect.width,height:rect.height}}};
   render=()=>{diceQaRender();diceQaFrames.push(readDiceUi())};
   sleep=()=>Promise.resolve();startAiTurnWithDelay=async()=>{};showContinueModal=async()=>{};resolveLanding=async()=>{};rollDice=()=>2;playSound=()=>{};
  });
  for(const width of [320,390]){
   await page.setViewportSize({width,height:width===320?568:844});
   await page.evaluate(()=>{initializeGame('harbor');state.players.forEach(player=>grantInventoryCard(player.id,'boost',{type:'test_fixture'}));hideStartScreen();state.initiativeResolved=true;state.currentPlayerIndex=1;setAiTurnStatus();render();});
   await page.evaluate(()=>playAiTurn());
   const humanReady=await page.evaluate(()=>readDiceUi());
   assert.equal(humanReady.actorId,'human');assert.equal(humanReady.stage,'ready');assert.equal(humanReady.count,1);assert.equal(humanReady.pairCount,0);assert.equal(humanReady.blankCount,1);assert.deepEqual(humanReady.faces,[]);
   assert.match(humanReady.background,/63, 170, 160/);assert(humanReady.rect.left>=0&&humanReady.rect.right<=width);
   await page.locator('.board-center').screenshot({path:path.join(output,`human-ready-${width}.png`)});
   const aiFrames=await page.evaluate(()=>diceQaFrames.filter(frame=>frame.actorId==='ai'&&frame.stage==='result'&&frame.count===2));
   assert(aiFrames.length);assert(aiFrames.every(frame=>frame.pairCount===2&&frame.colors.every(color=>/219, 116, 104/.test(color))));
   await page.evaluate(()=>playHumanTurn());assert.equal(await page.evaluate(()=>state.players[0].position),2);
   const humanRolls=await page.evaluate(()=>diceQaFrames.filter(frame=>frame.actorId==='human'&&frame.stage==='rolling'));
   assert(humanRolls.length&&humanRolls.every(frame=>frame.count===1&&frame.pairCount===0));
   await page.evaluate(async()=>{state.currentPlayerIndex=0;setHumanTurnStatus();showModal=async()=> 'self';await GameCards.use(state.players[0].cards[0].instanceId);});
   const boosted=await page.evaluate(()=>readDiceUi());assert.equal(boosted.count,2);assert.equal(boosted.pairCount,2);assert.equal(boosted.blankCount,2);assert.deepEqual(boosted.faces,[]);assert(boosted.colors.every(color=>/63, 170, 160/.test(color)));assert(boosted.rect.right<=width);
   await page.locator('.board-center').screenshot({path:path.join(output,`human-double-ready-${width}.png`)});
   await page.evaluate(async()=>{state.currentPlayerIndex=1;setAiTurnStatus();render();await animateDiceRoll(state.sessionId,'turn',2);});
   const aiResult=await page.evaluate(()=>readDiceUi());assert.equal(aiResult.count,2);assert(aiResult.colors.every(color=>/219, 116, 104/.test(color)));
   await page.locator('.board-center').screenshot({path:path.join(output,`ai-double-result-${width}.png`)});
   await page.evaluate(()=>animateDiceRoll(state.sessionId,'bank',2));const bank=await page.evaluate(()=>readDiceUi());assert.equal(bank.count,1);assert.equal(bank.pairCount,0);assert.equal(bank.purpose,'bank');assert.match(bank.background,/219, 116, 104/);
   reports.push({width,humanReady,boosted,aiResult,bank});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,reports,errors},null,2));
  console.log('PASS 320/390 actual AI double-card turn → human one-die turn → human activated double; actor colors and bank single die; zero browser exceptions.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});

'use strict';
// A disposable browser context; the live game tab and profile are untouched.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.join(__dirname,'../work/pawn-ground-motion-qa');
const probe=`
window.pawnMotionQa={
 ready:()=>snapshot?.mapId==='harbor'&&loadedBundles.has('regions/harbor.glb')&&[...lotViews.values()].every(v=>v.label.dataset.loadedModel===v.label.dataset.modelKey),
 settled:()=>{const p=cameraSubject();return p&&!p.active&&Math.hypot(p.group.position.x-cameraFocus.x,p.group.position.z-cameraFocus.z)<.39;},
 read(){const p=cameraSubject();return{actor:snapshot.currentPlayerId,active:p.active,position:p.group.position.toArray(),target:p.target.toArray(),scale:p.group.scale.x,rotation:p.group.rotation.y,facing:p.facing,teleport:p.teleport,duration:p.duration,progress:p.duration?Math.min(1,(performance.now()-p.started)/p.duration):1,focus:cameraFocus.toArray(),screen:p.group.position.clone().project(camera).toArray(),following:cameraView.following};},
 trace(){window.pawnMotionFrames=[];window.pawnMotionSampling=true;const sample=()=>{if(!window.pawnMotionSampling)return;window.pawnMotionFrames.push({time:performance.now(),...this.read()});requestAnimationFrame(sample);};sample();}
};`;
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const reports=[];
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/\/scene\.js(?:\?|$)/,async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\n'+probe});});
  await page.goto(process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8876/');
  await page.waitForFunction(()=>window.CityScene?.ready&&window.pawnMotionQa);
  await page.evaluate(()=>{initializeGame('harbor');hideStartScreen();state.initiativeResolved=true;state.busy=false;state.phase='await_roll';render();CityScene.setTimeMode('day');CityScene.setSeason('summer');CityScene.setWeather('clear');});
  await page.waitForFunction(()=>pawnMotionQa.ready(),null,{timeout:25000});
  const cases=[
   {name:'human-local-forward',cursor:7,actor:0,direction:1,width:390},
   {name:'human-bridge-forward',cursor:17,actor:0,direction:1,width:390,screenshot:true},
   {name:'ai-bridge-reverse',cursor:18,actor:1,direction:-1,width:390,screenshot:true},
   {name:'ai-local-forward',cursor:18,actor:1,direction:1,width:390},
   {name:'human-local-reverse',cursor:8,actor:0,direction:-1,width:390},
   {name:'human-bridge-320',cursor:26,actor:0,direction:1,width:320,screenshot:true},
   {name:'ai-bridge-reverse-320',cursor:27,actor:1,direction:-1,width:320},
   {name:'human-teleport',cursor:7,actor:0,direction:1,width:390,teleport:24}
  ];
  for(const item of cases){
   await page.setViewportSize({width:item.width,height:item.width===320?568:844});
   await page.evaluate(({cursor,actor,direction})=>{
    state.currentPlayerIndex=actor;state.busy=false;state.phase='await_roll';state.animation.currentTile=null;state.animation.landedTile=null;
    const p=currentPlayer(),nav=getMapNavigation();p.harborCursor=cursor;p.position=nav.cycle[((cursor%70)+70)%70];p.harborAnchor=p.position;p.harborSalaryMin=cursor;p.harborSalaryMax=cursor;p.harborSalaryDistance=0;p.harborFreshSalary=false;p.effects.reversed=direction<0;
    const other=state.players.find(player=>player.id!==p.id);other.position=15;resetHarborJourney(other);
    render();CityScene.setViewMode('local');CityScene.resetView();
   },item);
   await page.waitForFunction(()=>pawnMotionQa.settled(),null,{timeout:20000});
   const initial=await page.evaluate(()=>pawnMotionQa.read());
   await page.evaluate(({direction,teleport})=>{
    pawnMotionQa.trace();window.pawnMotionDone=false;state.busy=true;state.phase='locked';
    if(teleport!==undefined){currentPlayer().position=teleport;resetHarborJourney(currentPlayer());render();setTimeout(()=>{window.pawnMotionDone=true;},600);}
    else animateMovement(currentPlayer(),1,state.sessionId,{direction,payStart:false}).then(ok=>{window.pawnMotionOk=ok;window.pawnMotionDone=true;state.animation.currentTile=null;render();});
   },item);
   if(item.screenshot){await page.waitForFunction(()=>{const p=pawnMotionQa.read();return p.active&&p.progress>=.35;},null,{timeout:10000});await page.screenshot({path:path.join(output,`${item.name}-crossing.png`)});}
   await page.waitForFunction(()=>pawnMotionDone,null,{timeout:20000});
   await page.waitForFunction(()=>pawnMotionQa.settled(),null,{timeout:20000});
   const report=await page.evaluate(()=>{window.pawnMotionSampling=false;return {frames:pawnMotionFrames,end:pawnMotionQa.read(),ok:window.pawnMotionOk,position:currentPlayer().position,cursor:currentPlayer().harborCursor};});
   assert(report.frames.length>=3,`${item.name}: enough real frames`);
   assert.equal(report.end.actor,item.actor?'ai':'human');assert.equal(report.end.active,false);assert.equal(report.end.following,true);
   assert(Math.hypot(...report.end.position.map((v,i)=>v-report.end.target[i]))<1e-8,`${item.name}: exact destination`);
   assert(report.frames.every(f=>Math.abs(f.position[1]-.265)<1e-8),`${item.name}: no road-wide jumping arc`);
   if(item.teleport!==undefined){assert(report.frames.some(f=>f.teleport&&f.active&&f.scale<.9),'teleport keeps its separate shrink/fade-style transfer');assert.equal(report.position,item.teleport);}
   else{
    assert.equal(report.ok,true);assert.equal(report.cursor,item.cursor+item.direction);
    assert(report.frames.every(f=>(!f.active||!f.teleport)&&f.scale===1),`${item.name}: walk remains full scale`);
    assert(report.frames.every(f=>Math.abs(f.screen[0])<.98&&Math.abs(f.screen[1])<.98),`${item.name}: pawn remains inside phone while camera follows`);
    const traveled=report.frames.filter(f=>f.active&&f.progress>.15&&f.progress<.85);assert(traveled.length>=2,`${item.name}: continuous intermediate positions`);
    assert(Math.abs(report.end.rotation-report.end.facing)<1e-8,`${item.name}: final facing is retained`);
    if(item.name.includes('bridge'))assert(report.end.duration>500,`${item.name}: bridge does not collapse into an instant tile step`);
   }
   const summary={...item,initial,frames:report.frames.length,end:report.end,position:report.position,maxProjection:Math.max(...report.frames.flatMap(f=>f.screen.slice(0,2).map(Math.abs)))};
   reports.push(summary);fs.writeFileSync(path.join(output,`${item.name}.json`),JSON.stringify(report,null,2));
   console.log(`PASS ${item.name}: ${report.frames.length} frames, projection ${summary.maxProjection.toFixed(3)}`);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({reports,errors},null,2));await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

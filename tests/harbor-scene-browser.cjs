'use strict';
// Isolated context; never opens the user's active tab or reads their save.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const output=path.join(__dirname,'../work/harbor-cycle-browser-qa');
const shared=[28,29,30,31,32,33,0,1,2,3,4,5,6,7,8,9,10,11],right=[20,21,22,23,24,25,26,27,28],left=[19,18,17,16,15,14,13,12,11];
const itinerary=[...shared,...right,...left.slice(0,-1),...[...shared].reverse(),...left,...right.slice(0,-1)];
assert.equal(itinerary.length,70);
const mod=n=>((n%70)+70)%70;
const probe=`window.__harborCycleQa={read(){const p=cameraSubject();return{currentId:snapshot?.currentPlayerId,journey:snapshot?.harborJourney,playerJourneys:snapshot?.players?.map(p=>({id:p.id,journey:p.harborJourney})),arrows:streetArrows.map(a=>({from:a.userData.streetFrom,to:a.userData.streetTo,actualFrom:a.userData.actualFrom,actualTo:a.userData.actualTo,branch:a.userData.streetBranch})),pawn:p?{id:snapshot.currentPlayerId,x:p.group.position.x,z:p.group.position.z,active:p.active}:null,focus:{x:cameraFocus.x,z:cameraFocus.z}};},settled(){const p=cameraSubject();return p&&!p.active&&Math.hypot(p.group.position.x-cameraFocus.x,p.group.position.z-cameraFocus.z)<.39;}};`;
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[],reports=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/\/scene\.js(?:\?|$)/,async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\n'+probe});});
  await page.goto(process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8876/');await page.waitForFunction(()=>window.CityScene?.ready&&window.GameHarbor&&window.__harborCycleQa);
  await page.evaluate(()=>{initializeGame('harbor');hideStartScreen();state.initiativeResolved=true;state.busy=false;state.phase='await_roll';render();CityScene.setTimeMode('day');CityScene.resetView();const update=CityScene.update;CityScene.update=function(data){if(window.harborQaRecording){const p=data.players.find(p=>p.id===data.currentPlayerId);if(p&&window.harborQaMoves.at(-1)!==p.position)window.harborQaMoves.push(p.position);if(data.routeChoice||state.modal.visible)window.harborQaInterrupted=true;}return update(data);};});
  await page.waitForSelector('#harbor-route-diagram svg',{state:'attached'});
  async function prepare(cursor=6,playerIndex=0,direction=1){
   await page.evaluate(({cursor,playerIndex,direction})=>{state.busy=false;state.phase='await_roll';state.currentPlayerIndex=playerIndex;const p=currentPlayer(),nav=getMapNavigation();p.harborCursor=cursor;p.position=nav.cycle[((cursor%70)+70)%70];p.harborAnchor=p.position;p.harborSalaryMin=cursor;p.harborSalaryMax=cursor;p.harborSalaryDistance=0;p.harborFreshSalary=false;p.effects.reversed=direction<0;state.animation.currentTile=null;state.animation.landedTile=null;render();CityScene.setViewMode('local');CityScene.resetView();},{cursor,playerIndex,direction});
  }
  async function checkJourney(cursor,direction,playerId='human'){
   const outgoing=cursor+(direction<0?-1:0),phase=mod(outgoing)<35?'red':'yellow',central=(phase==='red'?1:-1)*direction;
   const report=await page.evaluate(()=>({journey:getHarborJourney(currentPlayer()),badge:document.querySelector('.harbor-phase-badge')?.dataset.phase,badgeText:document.querySelector('.harbor-phase-badge')?.textContent,scene:__harborCycleQa.read(),next:document.querySelector('.scene-travel-arrow')?.dataset.next,diagram:[...document.querySelectorAll('#harbor-route-diagram [data-route-edge]')].map(l=>({branch:l.dataset.branch,from:[Number(l.getAttribute('x1')),Number(l.getAttribute('y1'))],to:[Number(l.getAttribute('x2')),Number(l.getAttribute('y2'))],a:[Number(l.dataset.ax),Number(l.dataset.ay)],b:[Number(l.dataset.bx),Number(l.dataset.by)]}))}));
   assert.equal(report.journey.phase,phase,`cursor ${cursor}, direction ${direction}: phase`);assert.equal(report.journey.travelDirection,direction);assert.equal(report.journey.centralDirection,central);assert.equal(report.journey.nextTileIndex,itinerary[mod(cursor+direction)]);assert.equal(report.badge,phase);assert.equal(report.badgeText.includes('逆行'),direction<0);
   assert.equal(report.scene.currentId,playerId);assert.equal(report.scene.playerJourneys.find(p=>p.id===playerId).journey.phase,phase);assert.equal(report.next,String(itinerary[mod(cursor+direction)]));
   assert.equal(report.scene.arrows.length,35);for(const a of report.scene.arrows){const reverse=(a.branch==='shared'?central:direction)<0;assert.equal(a.actualFrom,reverse?a.to:a.from);assert.equal(a.actualTo,reverse?a.from:a.to);}
   assert.equal(report.diagram.length,35);for(const a of report.diagram){const reverse=(a.branch==='shared'?central:direction)<0;assert.deepEqual(a.from,reverse?a.b:a.a);assert.deepEqual(a.to,reverse?a.a:a.b);}
   return{cursor,direction,phase,centralDirection:central,next:report.journey.nextTileIndex};
  }
  async function travel(cursor,steps,direction){
   await page.evaluate(({steps,direction})=>{window.harborQaTravelDone=false;window.harborQaTravelResult=null;window.harborQaMoves=[];window.harborQaInterrupted=false;window.harborQaRecording=true;state.busy=true;state.phase='locked';window.harborQaTravel=animateMovement(currentPlayer(),steps,state.sessionId,{direction,payStart:false}).then(ok=>{window.harborQaTravelResult=ok;window.harborQaTravelDone=true;window.harborQaRecording=false;state.animation.currentTile=null;render();});},{steps,direction});
   await page.waitForFunction(()=>harborQaTravelDone,null,{timeout:30000});
   const r=await page.evaluate(()=>({ok:harborQaTravelResult,cursor:currentPlayer().harborCursor,position:currentPlayer().position,moves:harborQaMoves,interrupted:harborQaInterrupted,pending:GameHarbor.getState().pendingChoice,modal:state.modal.visible}));
   assert.equal(r.ok,true);assert.equal(r.cursor,cursor+steps*direction);assert.equal(r.position,itinerary[mod(r.cursor)]);assert.deepEqual(r.moves,Array.from({length:steps},(_,i)=>itinerary[mod(cursor+(i+1)*direction)]));assert.equal(r.interrupted,false,'automatic junction passage must never open a route card');assert.equal(r.pending,null);assert.equal(r.modal,false);return r;
  }
  await prepare();assert.equal(await page.locator('#harbor-route-control').count(),0);
  assert.deepEqual(await page.evaluate(()=>{const h=GameHarbor.getState();return{tiles:h.totalTiles,phase:h.lapTiles,cycle:h.cycleTiles,automatic:h.navigation.automatic,canChange:h.canChangeRoute,choices:h.choices};}),{tiles:34,phase:35,cycle:70,automatic:true,canChange:false,choices:[]});
  assert.equal(await page.evaluate(()=>GameHarbor.setRoute('resort').ok),false);
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
   await page.setViewportSize({width,height});const b=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();return{roll:rect('#roll-btn'),board:rect('#board-stage'),scroll:document.documentElement.scrollWidth};});
   assert(b.scroll<=width);if(height>width){assert(b.roll.left>=0&&b.roll.right<=width&&b.roll.top>=0&&b.roll.bottom<=height);assert(b.board.height>=200);}reports.push({viewport:{width,height},boardHeight:b.board.height});
  }
  await page.setViewportSize({width:390,height:844});
  // Both directions at -1/0/1 and either 35-step boundary use the outgoing
  // itinerary edge, including negative cursors after rewind across zero.
  for(const cursor of [-1,0,1,34,35,36,69,70,71])for(const direction of [1,-1]){await prepare(cursor,0,direction);reports.push(await checkJourney(cursor,direction));await travel(cursor,1,direction);await checkJourney(cursor+direction,direction);}
  console.log('PASS actual forward/reverse movement and world/UI arrows at all red/yellow phase boundaries');
  // Every repeated junction occurrence has an unambiguous exit; reversing
  // those exact three steps restores the original itinerary cursor.
  for(const cursor of [16,25,34,51,60,69]){await prepare(cursor);await travel(cursor,3,1);await page.evaluate(()=>{currentPlayer().effects.reversed=true;render();});await travel(cursor+3,3,-1);await checkJourney(cursor,-1);}
  console.log('PASS all six junction occurrences without prompts; three-step reverse retraces the same route');
  // Switching the active player changes the camera subject and route arrows,
  // while the human remains elsewhere on the map.
  await prepare(68,1,-1);await travel(68,3,-1);await checkJourney(65,-1,'ai');
  await page.waitForFunction(()=>__harborCycleQa.settled(),null,{timeout:20000});const ai=await page.evaluate(()=>({view:CityScene.getView(),scene:__harborCycleQa.read()}));assert.equal(ai.scene.currentId,'ai');assert.equal(ai.view.following,true);assert.equal(ai.view.elevation,.78);
  await prepare(8,0,1);await page.waitForFunction(()=>__harborCycleQa.settled(),null,{timeout:20000});assert.equal(await page.evaluate(()=>__harborCycleQa.read().currentId),'human');
  for(const [width,height] of [[320,568],[390,844]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>{state.busy=false;state.phase='await_roll';CityScene.setViewMode('overview');render();});const o=await page.evaluate(()=>{const r=document.querySelector('#city-canvas-wrap').getBoundingClientRect();return{local:CityScene.getView().local,width:r.width,height:r.height,points:state.board.map(t=>CityScene.projectTile(t.index))};});assert.equal(o.local,false);assert(o.points.every(p=>p&&p.x>=0&&p.x<=o.width&&p.y>=0&&p.y<=o.height),`${width}: complete S route fits overview`);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({reports,errors},null,2));console.log('PASS AI reverse camera, return to human, phone layout, whole-map overview and no browser exceptions');await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

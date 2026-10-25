const {chromium}=require('C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const output='work/harbor-projects-qa';
const probe=`
window.harborProjectsProbe={
 ready:()=>snapshot?.mapId==='harbor'&&loadedBundles.has('regions/harbor.glb')&&[...lotViews.values()].every(v=>v.label.dataset.loadedModel===v.label.dataset.modelKey),
 focus(id){const entry=harborSceneRoot.userData.harborProjects[id];cameraView.mode='local';cameraView.following=false;cameraView.modified=id==='water';if(id==='water'){cameraView.yaw=-1.05;cameraView.elevation=.78;}cameraBrowseTarget=entry.anchor.clone();cameraBrowseTarget.y=.2;resize();},
 settled:()=>!cameraBrowseTarget||cameraFocus.distanceTo(cameraBrowseTarget)<.025,
 scene:()=>Object.values(harborSceneRoot?.userData.harborProjects||{}).map(entry=>({id:entry.id,stage:entry.stage,revision:entry.revision,scale:entry.group.scale.toArray(),animating:!!entry.animation})),
 center:()=>cameraFocus.toArray()
};`;
async function fingerprint(page){return page.evaluate(()=>JSON.stringify({cash:state.players[0].cash,cards:state.players[0].cards,projects:state.harborProjects,modal:state.modal,busy:state.busy,phase:state.phase,turn:state.currentPlayerIndex,positions:state.players.map(player=>player.position)}));}
async function bounds(page){return page.evaluate(()=>{const panel=document.querySelector('#harbor-project-panel'),r=panel.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,bodyScroll:document.documentElement.scrollWidth};});}
(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const reports=[];
 try{
  for(const viewport of [{width:390,height:844},{width:320,height:568}]){
   const context=await browser.newContext({viewport,isMobile:true,hasTouch:true});
   await context.route('**/scene.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+probe});});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto('http://127.0.0.1:8876/');await page.waitForFunction(()=>window.CityScene?.ready&&window.GameHarborProjects);
   await page.evaluate(()=>{initializeGame('harbor');hideStartScreen();state.initiativeResolved=true;state.busy=false;state.phase='await_roll';state.currentPlayerIndex=0;for(const tile of state.board)if(tile.lot){tile.lot.ownerId='ai';tile.lot.level=3;}render();CityScene.setTimeMode('day');CityScene.setSeason('summer');CityScene.setWeather('clear');});
   await page.waitForFunction(()=>harborProjectsProbe.ready(),{timeout:20000});
   const initial=await page.evaluate(()=>({cash:state.players[0].cash,cards:state.players[0].cards.length}));
   for(const stage of [0,1,2,3]){
    if(stage)await page.evaluate(stage=>{for(const project of GameHarborProjects.getSnapshot())for(const index of project.indices){state.board[index].lot.ownerId='human';state.board[index].lot.level=stage;}syncHarborProjects();render();},stage);
    await page.waitForFunction(()=>harborProjectsProbe.scene().every(project=>!project.animating));
    const projects=await page.evaluate(()=>GameHarborProjects.getSnapshot());assert(projects.every(project=>project.points===stage*3&&project.stage===stage));
    const before=await fingerprint(page),sceneBefore=await page.evaluate(()=>harborProjectsProbe.scene());
    await page.evaluate(()=>{for(let i=0;i<4;i++){GameHarborProjects.getSnapshot();syncHarborProjects();render();}});
    assert.equal(await fingerprint(page),before,'repeated read, render and settled mutation hooks cannot grant the same reward twice');
    assert.deepEqual(await page.evaluate(()=>harborProjectsProbe.scene()),sceneBefore,'unchanged stages neither rebuild nor replay the garden animation');
    for(const id of ['water','promenade']){
     await page.evaluate(id=>harborProjectsProbe.focus(id),id);await page.waitForFunction(()=>harborProjectsProbe.settled());
     if(viewport.width===390||stage===0||stage===3)await page.screenshot({path:`${output}/${id}-stage${stage}-${viewport.width}.png`});
     const badge=page.locator(`[data-harbor-project="${id}"]`);await badge.click();
     assert.equal(await page.locator('#harbor-project-panel').getAttribute('aria-modal'),'false');
     assert.equal(await page.locator('[data-harbor-locate]').count(),3);
     assert.equal(await page.locator('.harbor-project-rewards [data-earned="true"]').count(),stage);
     assert.deepEqual(await page.locator('[data-harbor-locate] b').allTextContents(),Array(3).fill(`Lv.${stage}`),'enemy-owned level 3 buildings contribute/display zero');
     const panelBounds=await bounds(page);assert(panelBounds.left>=0&&panelBounds.right<=viewport.width&&panelBounds.bottom<=viewport.height);assert(panelBounds.scrollWidth<=panelBounds.clientWidth+1&&panelBounds.bodyScroll<=viewport.width);
     if(stage===0||stage===3)await page.screenshot({path:`${output}/${id}-details-stage${stage}-${viewport.width}.png`});
     await page.locator('[data-harbor-project-close]').click();assert.equal(await fingerprint(page),before,'opening/closing details never grants rewards or changes the turn');
    }
    reports.push({viewport,stage,projects,scene:await page.evaluate(()=>harborProjectsProbe.scene())});
   }
   const rewardTotals=await page.evaluate(()=>({cash:state.players[0].cash,cards:state.players[0].cards.length,bonus:GameHarborProjects.getSnapshot().reduce((sum,p)=>sum+p.collectionBonus,0)}));
   assert.equal(rewardTotals.cash-initial.cash,200);assert.equal(rewardTotals.cards-initial.cards,2);assert.equal(rewardTotals.bonus,2);
   await page.evaluate(()=>{state.busy=true;state.phase='moving';state.currentPlayerIndex=1;render();});
   const busyBefore=await fingerprint(page);await page.locator('[data-harbor-project="promenade"]').click();
   await page.locator('[data-harbor-locate="30"]').click();await page.waitForFunction(()=>harborProjectsProbe.settled());
   assert.equal(await fingerprint(page),busyBefore,'locating a building while AI is busy never changes game state');assert.equal(await page.evaluate(()=>CityScene.getView().following),false);
   await page.screenshot({path:`${output}/busy-locate-${viewport.width}.png`});
   await page.evaluate(()=>{state.busy=false;state.phase='await_roll';state.currentPlayerIndex=0;render();CityScene.resetView();CityScene.setViewMode('overview');});
   await page.waitForFunction(()=>CityScene.getHarborProjectsState().length===2&&CityScene.getHarborProjectsState().every(project=>project.visible));
   await page.screenshot({path:`${output}/overview-stage3-${viewport.width}.png`});
   // Losing ownership lowers today's contribution, never removes earned stages.
   await page.evaluate(()=>{for(const index of [6,7,9])state.board[index].lot.ownerId='ai';syncHarborProjects();render();});
   await page.locator('[data-harbor-project="water"]').click();assert.deepEqual(await page.locator('[data-harbor-locate] b').allTextContents(),['Lv.0','Lv.0','Lv.0']);assert.equal(await page.locator('.harbor-project-rewards [data-earned="true"]').count(),3);
   await page.locator('[data-harbor-project-close]').click();
   // Existing game dialogs remain authoritative while a non-modal garden
   // detail is open. Neither inspection nor locating resolves the game prompt.
   await page.locator('[data-harbor-project="promenade"]').click();
   await page.evaluate(()=>{void showModal({label:'行动提示',title:'继续对局',message:'',buttons:[{id:'continue',text:'继续'}]});});
   const modalBefore=await fingerprint(page);
   await page.evaluate(()=>CityScene.locateTile(30));assert.equal(await fingerprint(page),modalBefore);
   assert.equal(await page.locator('#event-actions [data-action="continue"]').evaluate(button=>{const r=button.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===button;}),true,'garden detail never covers the current game dialog button');
   await page.locator('#event-actions [data-action="continue"]').click();
   assert.equal(await page.evaluate(()=>state.modal.visible),false);
   await page.evaluate(()=>{initializeGame('compact');hideStartScreen();state.busy=false;state.phase='await_roll';render();});
   assert.equal(await page.locator('[data-harbor-project]').count(),0,'changing map clears garden labels');assert.equal(await page.evaluate(()=>GameHarborProjects.getSnapshot().length),0);
   assert.deepEqual(errors,[]);await context.close();
  }
  fs.writeFileSync(`${output}/results.json`,JSON.stringify(reports,null,2));console.log(`PASS ${reports.length} phone/stage combinations, both project panels, own-only contribution, automatic rewards once, AI-busy locate, overview and map cleanup`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

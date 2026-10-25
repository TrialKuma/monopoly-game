// A fresh browser context owns all fixture state. Existing tabs and saves are
// never read. Scene probes are appended only to the intercepted test response.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const output=path.join(__dirname,'../work/harbor-main-island-qa');
const streets=[
 {name:'central-lower',indices:[28,29,30,31,32,33,0],position:30},
 {name:'central-middle',indices:[0,1,2,3,4,5],position:2},
 {name:'central-upper',indices:[5,6,7,8,9,10,11],position:7},
 {name:'merchant-arrival',indices:[12,13],position:12},
 {name:'merchant-waterfront',indices:[14,15,16],position:15},
 {name:'merchant-return',indices:[17,18,19],position:18},
 {name:'resort-arrival',indices:[20,21],position:20},
 {name:'resort-waterfront',indices:[22,23,24],position:23},
 {name:'resort-return',indices:[25,26,27],position:26},
];
const scenes=[
 {name:'central-s',indices:[28,29,30,31,32,33,0,1,2,3,4,5,6,7,8,9,10,11],position:0},
 {name:'civic-hall',indices:[33,0,1],position:0},
 {name:'central-services',indices:[4,5,6,7,8,9,10,11],position:5},
 {name:'merchant-services',indices:[11,12,13,14,15,16,17,18,19],position:16},
 {name:'resort-services',indices:[20,21,22,23,24,25,26,27,28],position:23},
];
const probe=`
window.__streetQa={
 ready(){return snapshot?.mapId==='harbor'&&loadedBundles.has('regions/harbor.glb')&&lotViews.size===31&&[...lotViews.values()].every(v=>v.label.dataset.loadedModel===v.label.dataset.modelKey&&v.building.children.length&&!v.building.children[0].userData.pendingModel);},
 settled(){const pawn=cameraSubject();return pawn&&!pawn.active&&Math.hypot(pawn.group.position.x-cameraFocus.x,pawn.group.position.z-cameraFocus.z)<.39;},
 inspect(indices){world.updateMatrixWorld(true);return indices.map(index=>{const v=lotViews.get(index),s=stepViews.get(index),model=v?.building.children[0];let meshes=0,textures=0;model?.traverse(n=>{if(n.isMesh){meshes++;for(const m of Array.isArray(n.material)?n.material:[n.material])if(m&&Object.values(m).some(value=>value?.isTexture))textures++;}});return{index,name:v?.tile.name,secondary:!v,level:v?.tile.lot?.level,large:v?.tile.lot?.isLarge,parcelSize:v?[v.w,v.d]:null,landmarkScale:model?.userData.harborLandmarkScale,loaded:v?.label.dataset.loadedModel,meshes,textures,center:s.center.toArray(),walk:s.walk.toArray(),normal:s.normal.toArray(),parcelRotation:v?.group.rotation.y,front:model?new THREE.Vector3(0,0,1).transformDirection(model.matrixWorld).toArray():null,parcelFront:v?new THREE.Vector3(0,0,1).transformDirection(v.group.matrixWorld).toArray():null};});},
 focus(indices){
  world.updateMatrixWorld(true);const bounds=new THREE.Box3(),points=[];
  indices.forEach(i=>{const v=lotViews.get(i);if(v)bounds.union(new THREE.Box3().setFromObject(v.group));bounds.expandByPoint(stepViews.get(i).walk);});
  bounds.getCenter(cameraFocus);cameraFocus.y=.2;cameraFocusReady=true;
  const normal=stepViews.get(indices.find(i=>![0,5,11,28].includes(i))??indices[0]).normal;
  cameraView={...cameraView,mode:'local',following:false,modified:true,yaw:Math.atan2(normal.x,normal.z)+.3,elevation:.85,zoom:1};resize();
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(new THREE.Vector3(x,y,z).project(camera));
  const fit=Math.max(...points.flatMap(p=>[Math.abs(p.x),Math.abs(p.y)]));cameraView.zoom=Math.min(1.25,.82/fit);resize();
 },
 paths(indices){return indices.slice(1).map((index,i)=>({edge:[indices[i],index],points:harborEdgePath(indices[i],index,stepViews,THREE).map(p=>p.toArray())}));}
};`;

(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],reports=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/\/scene\.js(?:\?|$)/,async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\n'+probe});});
  await page.goto(process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8876/');
  await page.waitForFunction(()=>window.CityScene?.ready&&window.__streetQa);
  await page.evaluate(()=>{
   initializeGame('harbor');hideStartScreen();state.initiativeResolved=true;state.busy=false;state.phase='await_roll';state.currentPlayerIndex=0;
   state.board.forEach(t=>{if(t.lot){t.lot.level=3;t.lot.ownerId=t.index%2?'human':'ai';}});
   state.players[0].position=18;resetHarborJourney(state.players[0]);state.animation.currentTile=null;
   render();CityScene.setTimeMode('day');CityScene.setSeason('summer');CityScene.setWeather('clear');CityScene.resetView();
  });
  await page.waitForFunction(()=>__streetQa.ready(),null,{timeout:90000});
  await page.waitForTimeout(1200);
  const allViews=await page.evaluate(()=>__streetQa.inspect(Array.from({length:34},(_,i)=>i)));
  await page.waitForSelector('#harbor-route-diagram svg',{state:'attached'});
  const diagram=await page.evaluate(()=>{const svg=document.querySelector('#harbor-route-diagram svg');return{edges:svg.querySelectorAll('line').length,points:[...svg.querySelectorAll('circle')].map(c=>({x:Number(c.getAttribute('cx')),y:Number(c.getAttribute('cy'))}))};});
  assert.equal(diagram.edges,35,'the route diagram must retain all graph connections');
  assert.equal(diagram.points.length,34,'the route diagram must retain all physical stops');
  const diagramScale=(diagram.points[11].y-diagram.points[28].y)/(allViews[11].walk[2]-allViews[28].walk[2]);
  for(let i=0;i<34;i++){
   assert(Math.abs(diagram.points[i].x-diagram.points[0].x-diagramScale*(allViews[i].walk[0]-allViews[0].walk[0]))<.001,`diagram stop ${i} must follow the displayed street X coordinate without distortion`);
   assert(Math.abs(diagram.points[i].y-diagram.points[0].y-diagramScale*(allViews[i].walk[2]-allViews[0].walk[2]))<.001,`diagram stop ${i} must follow the displayed street Z coordinate without distortion`);
   assert(diagram.points[i].x>=10&&diagram.points[i].x<=280&&diagram.points[i].y>=10&&diagram.points[i].y<=235,'all route points fit in the diagram');
  }
  const parcels=allViews.filter(v=>!v.secondary);
  assert.equal(parcels.length,31,'all 31 primary parcels must be present');
  assert.equal(parcels.filter(v=>v.large).length,3,'all three large estates must be present');
  for(const v of parcels){
   assert(v.loaded?.startsWith('harbor_')&&v.meshes>0&&v.textures>0,`actual textured regional GLB required at tile ${v.index}: ${JSON.stringify(v)}`);
   if(v.level!=null)assert.equal(v.level,3,`owned building ${v.index} must exercise max-level silhouette`);
   const dot=(a,b)=>a[0]*b[0]+a[2]*b[2];
   assert(dot(v.front,v.normal)>.9999,`model ${v.index} must face its road`);
   assert(dot(v.parcelFront,v.normal)>.9999,`whole parcel ${v.index} must face its road`);
  }
  const publicViews=parcels.filter(v=>v.level==null);
  assert.equal(publicViews.length,18,'three new central services join the existing civic and functional buildings');
  for(const v of publicViews){assert.deepEqual(v.landmarkScale,v.index===0?[1.95,2.05,1.85]:[1.5,1.5,1.5]);assert.deepEqual(v.parcelSize,v.index===0?[2.65,2.5]:[2.15,2.10]);}
  for(const v of parcels.filter(v=>v.level!=null)){
   assert.deepEqual(v.landmarkScale,v.large?[1.65,1.55,1.65]:[1.28,1.28,1.28]);
   assert.deepEqual(v.parcelSize,v.large?[4.2,2.45]:[1.85,1.85]);
  }
  await page.setViewportSize({width:1280,height:900});
  for(const {name,indices,position} of streets){
   await page.evaluate(({indices,position})=>{state.players[0].position=position;render();__streetQa.focus(indices);},{indices,position});
   await page.waitForTimeout(650);
   const report=await page.evaluate(indices=>({views:__streetQa.inspect(indices),paths:__streetQa.paths(indices)}),indices);
   if(name.startsWith('central-')){
    const a=report.views[0].walk,b=report.views.at(-1).walk,dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
    for(const v of report.views)assert(Math.abs((v.walk[0]-a[0])*dz-(v.walk[2]-a[2])*dx)/length<.001,`${name}: stop ${v.index} must lie on the authored straight street`);
    assert(report.paths.every(e=>e.points.length===2),`${name}: a street must not detour around a building`);
   }
   reports.push({name,...report});
  }
  for(const {name,indices,position} of scenes){
   await page.evaluate(({indices,position})=>{state.players[0].position=position;resetHarborJourney(state.players[0]);render();__streetQa.focus(indices);},{indices,position});
   await page.waitForTimeout(300);await page.screenshot({path:path.join(output,`${name}.png`)});
  }
  await page.setViewportSize({width:1600,height:1100});
  await page.evaluate(()=>CityScene.setViewMode('overview'));await page.waitForTimeout(400);
  await page.screenshot({path:path.join(output,'overview-desktop.png')});
  for(const [width,height] of [[320,568],[390,844]]){
   await page.setViewportSize({width,height});
   for(const {name,position} of [{name:'civic-hall',position:0},{name:'central-estate',position:2},{name:'central-service',position:5}]){
    await page.evaluate(position=>{state.players[0].position=position;resetHarborJourney(state.players[0]);render();CityScene.setViewMode('local');CityScene.resetView();},position);
    await page.waitForFunction(()=>__streetQa.settled(),null,{timeout:15000});
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>CityScene.getView().following),true);
    assert.equal(await page.evaluate(()=>CityScene.getView().local),true);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth)<=width,'portrait layout must not overflow');
    await page.screenshot({path:path.join(output,`${name}-follow-${width}.png`)});
   }
  }
  await page.setViewportSize({width:1600,height:1100});
  for(const level of [0,1]){
   await page.evaluate(level=>{state.board.forEach(t=>{if(t.lot){t.lot.level=level;t.lot.ownerId=level?'human':null;}});render();CityScene.setViewMode('overview');},level);
   await page.waitForTimeout(350);await page.screenshot({path:path.join(output,`overview-level-${level}.png`)});
  }
  assert.deepEqual(errors,[],'the rendered scene must have no runtime errors');
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({allViews,publicViews,diagram,reports,errors},null,2));
  console.log('PASS compact harbor: 31 textured GLB frontages, 18 public buildings, enlarged estates and homes, central streets, undistorted diagram, 320/390 follow views and levels 0/1/3 overview.');
  await context.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

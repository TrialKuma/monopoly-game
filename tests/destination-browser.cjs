'use strict';
// Alpine destination controller. Harbor uses the archipelago path covered by
// harbor-scene-browser.cjs and check-harbor-paths.mjs instead of this controller.
// Start the local preview at 8876, or provide CITY_PREVIEW_URL.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.resolve(__dirname,'../work/destination-qa');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const map of ['alpine']){
   await page.goto(process.env.CITY_PREVIEW_URL||'http://127.0.0.1:8876');await page.waitForFunction(()=>window.CityScene?.ready);
   await page.locator(`[data-map-id="${map}"]`).click();
   await page.locator('#start-play-btn').click();
   await page.evaluate(()=>{window.qaRandom=Math.random;Math.random=()=>.1;});
   await page.locator('[data-action="flip"]').click();await page.locator('#event-actions [data-action="continue"]').click();
   await page.waitForFunction(()=>state.isFormalRun===true);await page.evaluate(()=>{Math.random=window.qaRandom;CityScene.setTimeMode('day');CityScene.setSeason('spring');CityScene.setWeather('clear');});
   await page.waitForFunction(()=>CityScene.getAtmosphere()?.destination?.ready,null,{timeout:30000});await page.waitForTimeout(1400);
   await page.screenshot({path:path.join(out,`${map}-portrait-start.png`)});
   await page.evaluate(()=>CityScene.setViewMode('overview'));await page.waitForTimeout(350);
   await page.screenshot({path:path.join(out,`${map}-portrait-overview.png`)});
   await page.evaluate(()=>{state.players[0].position=7;render();CityScene.setViewMode('local');});await page.waitForTimeout(1800);
   await page.screenshot({path:path.join(out,`${map}-portrait-inner.png`)});
   await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>CityScene.setViewMode('overview'));await page.waitForTimeout(400);
   await page.screenshot({path:path.join(out,`${map}-desktop.png`)});
   // A controlled developed-city fixture checks the hero's clearance against
   // upgraded property silhouettes; this is separate from the real entry flow.
   await page.evaluate(()=>{state.board.forEach(tile=>{if(tile.lot&&!tile.isLargeSecondary){tile.lot.level=tile.lot.isLarge?3:(tile.index%3)+1;tile.lot.ownerId=tile.index%2?'human':'ai';}});render();});
   await page.waitForTimeout(800);await page.screenshot({path:path.join(out,`${map}-developed-desktop.png`)});
   const contract=await page.evaluate(async mapId=>{
    const THREE=await import('./assets/vendor/three/three.module.min.js');
    const {createDestinationScene}=await import('./scene-destinations.js?v=20261023-1');
    const world=new THREE.Group(),bounds={w:mapId==='harbor'?9:10.8,d:14.4};
    const controller=createDestinationScene({THREE,world,boardBounds:bounds,mapId});await controller.loading;
    const root=world.children[0],name=mapId==='harbor'?'harbor_lighthouse':'alpine_windmill',model=root.getObjectByName(name);
    const transforms=()=>{const values=[];model.traverse(n=>values.push(...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray()));return values;};
    const before=transforms();for(let i=0;i<30;i++)controller.tick(.1,{});const after=transforms();
    const moving=before.some((v,i)=>Math.abs(v-after[i])>.0001);
    controller.tick(.1,{reduced:true});const reduced=JSON.stringify(transforms())===JSON.stringify(after);
    controller.tick(.1,{paused:true});const paused=JSON.stringify(transforms())===JSON.stringify(after);
    controller.setVisible(false);const centerVisible=root.visible&&model.visible&&!root.getObjectByName(`destination_${mapId}_outskirts`).visible;
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()).toArray(),state=controller.getState();
    controller.dispose();controller.dispose();const detached=world.children.length===0;
    // A late cached resolution cannot revive a scene removed during a map switch.
    const late=createDestinationScene({THREE,world,boardBounds:bounds,mapId});late.dispose();await late.loading;
    return {state,moving,reduced,paused,centerVisible,detached,lateDetached:world.children.length===0,size};
   },map);
   assert.equal(contract.state.ready,true);assert.equal(contract.state.failed,false);assert(contract.state.clips>0);
   for(const key of ['moving','reduced','paused','centerVisible','detached','lateDetached'])assert.equal(contract[key],true,`${map}: ${key}`);
   assert(contract.size.every(Number.isFinite));assert(contract.size[0]<3.5&&contract.size[2]<3.5,'animated landmark footprint');
   results.push({map,...contract});await page.setViewportSize({width:390,height:844});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2));
  console.log('PASS alpine destination: actual paid entry, generated textures/clips, moving parts, pause/reduced motion, scenery toggle, late load teardown and mobile/desktop capture');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});

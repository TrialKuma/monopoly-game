'use strict';
// Independent preview, fresh Chrome contexts, and no writes to the player's save.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root=path.resolve(__dirname,'..'), out=path.join(root,'work/town-district-qa'); fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});
async function runCase(browser,base,viewport,reducedMotion='no-preference'){
  const context=await browser.newContext({viewport,hasTouch:viewport.width<500,isMobile:viewport.width<500,reducedMotion});
  try{
    await context.addInitScript(()=>{window.qaWrites=[];for(const method of ['setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){qaWrites.push(method);return original.apply(this,args);};}});
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base+'/town-review.html');
    await page.waitForFunction(()=>window.TownReview?.getState().ready,null,{timeout:90000});
    const initial=await page.evaluate(()=>TownReview.getState());assert.equal(initial.land.cellCount,36);
    for(const id of ['garden','waterfront','skyline']){
      const point=await page.evaluate(id=>TownReview.getState().projects.find(project=>project.id===id),id);
      await page.mouse.click(point.x,point.y);
      await page.waitForFunction(id=>TownReview.getState().projects.find(project=>project.id===id).level===1,id);
      assert.equal((await page.evaluate(()=>TownReview.getState())).lastPick.projectId,id,'the project itself is selectable');
      await page.locator(`[data-project="${id}"]`).click();await page.locator(`[data-project="${id}"]`).click();
    }
    const upgraded=await page.evaluate(()=>TownReview.getState());assert(upgraded.projects.every(project=>project.level===3));
    await page.screenshot({path:path.join(out,`projects3-${viewport.width}${reducedMotion==='reduce'?'-reduce':''}.png`)});
    const reports=[];
    for(let stage=1;stage<=4;stage++){
      const before=await page.evaluate(()=>TownReview.getState());
      await page.evaluate(()=>{window.qaFrames=[];window.qaDone=false;const started=performance.now();function sample(){const s=TownReview.getState();qaFrames.push(s);if((qaFrames.some(f=>f.expansion.active)&&!s.expansion.active)||performance.now()-started>2500){qaDone=true;return;}requestAnimationFrame(sample);}requestAnimationFrame(sample);});
      await page.locator('#play').click();await page.waitForFunction(stage=>TownReview.getState().land.stage===stage&&!TownReview.getState().expansion.active,stage);
      const after=await page.evaluate(()=>TownReview.getState()),frames=await page.evaluate(()=>qaFrames);
      const dimensions=[[6,6,36],[8,6,48],[8,8,64],[10,8,80],[10,10,100]][stage];
      assert.deepEqual([after.land.width,after.land.height,after.land.cellCount],dimensions);
      let drift=0;for(const frame of [...frames,after]){
        assert.equal(frame.cameraSpan,before.cameraSpan);assert.equal(frame.buildingScalePixels,before.buildingScalePixels);
        for(const old of before.buildingCenters){const item=frame.buildingCenters.find(item=>item.id===old.id);drift=Math.max(drift,Math.hypot(old.x-item.x,old.y-item.y));assert.equal(item.worldX,old.worldX);assert.equal(item.worldZ,old.worldZ);}
      }
      assert(drift<.01,'existing houses stay fixed on screen');
      if(reducedMotion!=='reduce'){
        const active=frames.filter(frame=>frame.expansion.active);assert(active.length>3,'multiple animation frames');assert(active.some(frame=>frame.expansion.progress>.25&&frame.expansion.progress<.85));
        assert(active.every(frame=>frame.expansion.newCellCount===after.land.cellCount-before.land.cellCount));
        for(let i=1;i<active.length;i++){assert(active[i].visualWidth>=active[i-1].visualWidth);assert(active[i].visualHeight>=active[i-1].visualHeight);}
      }
      assert(after.renderCalls<160);assert(after.geometryCount<240);
      reports.push({stage,width:after.land.width,height:after.land.height,added:after.land.cellCount-before.land.cellCount,drift,renderCalls:after.renderCalls,geometryCount:after.geometryCount});
    }
    await page.screenshot({path:path.join(out,`complete-${viewport.width}${reducedMotion==='reduce'?'-reduce':''}.png`)});
    assert.equal(await page.locator('#play').isDisabled(),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal page overflow');
    assert.deepEqual(await page.evaluate(()=>qaWrites),[]);assert.deepEqual(errors,[]);
    await page.locator('#reset').click();assert.equal((await page.evaluate(()=>TownReview.getState())).land.stage,0);
    return {viewport,reducedMotion,reports};
  } finally{await context.close();}
}
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;try{browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const base=`http://127.0.0.1:${server.address().port}`,results=[];for(const viewport of [{width:320,height:760},{width:390,height:844},{width:1280,height:800}])results.push(await runCase(browser,base,viewport));results.push(await runCase(browser,base,{width:390,height:844},'reduce'));fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});

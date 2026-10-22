// Browser acceptance checks for the actual portrait UI. Uses an isolated profile.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.resolve(__dirname,'../work/portrait-qa');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8876');await page.waitForFunction(()=>window.CityScene?.ready);
 await page.screenshot({path:path.join(out,'01-menu.png')});
 await page.locator('#start-play-btn').click();await page.locator('[data-action="rounds"]').click();await page.locator('[data-action="enter"]').click();await page.locator('[data-action="flip"]').click();
 await page.locator('.drama-skip').waitFor();await page.screenshot({path:path.join(out,'02-initiative.png')});
 await page.locator('.drama-skip').click();
 for(let i=0;i<30;i++){
  if(await page.locator('.drama-skip').isVisible())await page.locator('.drama-skip').click();
  else if(await page.locator('#roll-btn').isEnabled())break;
  await page.waitForTimeout(150);
 }
 await page.locator('#roll-btn:enabled').waitFor();
 const layout=await page.evaluate(()=>({viewport:{w:innerWidth,h:innerHeight},body:{w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight},stage:document.getElementById('board-stage').getBoundingClientRect().toJSON(),roll:document.getElementById('roll-btn').getBoundingClientRect().toJSON(),camera:window.CityScene.getView()}));
 assert.equal(layout.body.w,390);assert(layout.roll.bottom<=844);assert(layout.stage.height>=300);assert.equal(layout.camera.local,true);
 await page.screenshot({path:path.join(out,'03-local.png')});
 await page.getByRole('button',{name:'查看整张地图',exact:true}).click();await page.screenshot({path:path.join(out,'04-overview.png')});
 await page.getByRole('button',{name:'切换局部跟随镜头',exact:true}).click();
 await page.locator('[data-mobile-panel="rules"]').click();await page.screenshot({path:path.join(out,'05-rules.png')});await page.locator('#mobile-sheet-close').click();
 assert.equal(await page.evaluate(()=>document.activeElement?.dataset.mobilePanel),'rules','closing the drawer restores focus after removing inert');
 await page.locator('#roll-btn').click();
 for(let i=0;i<50;i++){
  if(await page.locator('.drama-skip').isVisible()||await page.locator('#event-overlay.visible').isVisible())break;
  await page.waitForTimeout(100);
 }
 await page.waitForTimeout(400);await page.screenshot({path:path.join(out,'06-landing.png')});
 const before=await page.evaluate(()=>({round:state.round,phase:state.phase,position:state.players[0].position}));
 await page.waitForTimeout(11000);
 const after=await page.evaluate(()=>({round:state.round,phase:state.phase,position:state.players[0].position}));assert.deepEqual(after,before,'decisions do not automatically advance');
 for(const [width,height] of [[320,568],[360,640],[430,932],[820,1180],[844,390],[1440,900]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(180);
  const bounds=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,roll:document.getElementById('roll-btn').getBoundingClientRect().toJSON(),event:document.querySelector('#event-overlay.visible .event-card,.drama-layer:not([hidden]) .drama-card')?.getBoundingClientRect().toJSON()}));
  assert(bounds.w<=width,`horizontal overflow ${width}`);
  if(width<=600||height>width){assert(bounds.roll.bottom<=height,`roll below viewport ${width}x${height}`);if(bounds.event)assert(bounds.event.bottom<=height+1,'event below viewport');}
  await page.screenshot({path:path.join(out,`size-${width}x${height}.png`)});
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({layout,errors,testedSizes:6},null,2));
 console.log('PASS portrait UI, manual events, camera switch, drawer and 6 resize sizes');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

const {chromium}=require('C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu']});
 const rows=[];
 try{for(const rate of [1,4,6]){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate});
  await page.goto('http://127.0.0.1:8876/art/full-ai-city/experiments/meshopt/benchmark.html');await page.waitForFunction(()=>typeof window.runExperiment==='function');
  const result=await page.evaluate(()=>window.runExperiment());if(errors.length)throw Error(errors.join('\n'));
  rows.push({cpuThrottleRate:rate,...result});console.log(JSON.stringify({cpuThrottleRate:rate,decoderImportAndReadyMs:result.decoderImportAndReadyMs,rows:result.rows}));await context.close();
 }}finally{await browser.close()}
 fs.writeFileSync(path.join(__dirname,'browser-benchmark.json'),JSON.stringify({testedAt:new Date().toISOString(),method:'Headless desktop Chrome, 390x844 mobile viewport, CPU throttle 1/4/6; no WebGL renderer. This is a CPU slowdown proxy, not real ARM/iOS/mobile hardware. 60 decode runs include output allocation; 3 GLTF parses include image decode. Files fetched from local server and are not a network benchmark.',results:rows},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});

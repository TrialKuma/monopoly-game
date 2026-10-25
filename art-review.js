import * as THREE from './assets/vendor/three/three.module.min.js';
import { makeStudioEnvironment } from './scene-environment.js?v=20261025-facade2';
import { GLTFLoader } from './assets/vendor/three/addons/loaders/GLTFLoader.js';
import { createOwnershipRoofs } from './scene-ownership-roofs.js?v=20261025-items1';
import { createFunctionalLandmark } from './scene-functional-landmarks.js?v=20261025-items1';
import { createThermalSteam } from './scene-thermal-steam.js?v=20261025-facade2';

const $=id=>document.getElementById(id),region=$('region'),family=$('family'),level=$('level'),stage=$('stage');
const params=new URLSearchParams(location.search),candidateMode=params.get('stage')==='candidate';
const reviewRoofs=createOwnershipRoofs({THREE}), reviewResources=new Set();
const ownerLabel=document.createElement('label'),ownerChoice=document.createElement('select');
ownerLabel.append('产权',ownerChoice);ownerChoice.add(new Option('原色 / 无主','none'));ownerChoice.add(new Option('你的建筑 · 青绿屋顶','human'));ownerChoice.add(new Option('对手建筑 · 砖红屋顶','ai'));
ownerChoice.value=['human','ai'].includes(params.get('owner'))?params.get('owner'):'none';
ownerLabel.hidden=candidateMode;document.querySelector('nav').append(ownerLabel);
ownerChoice.addEventListener('change',()=>{const query=new URLSearchParams(location.search);query.set('owner',ownerChoice.value);history.replaceState(null,'',`${location.pathname}?${query}`);pivot.children.forEach(model=>reviewRoofs.set(model,ownerChoice.value));render();});
function clearReviewAdditions(){reviewRoofs.clear();reviewResources.forEach(resource=>resource.dispose());reviewResources.clear();}
const versionLabel=document.createElement('label'),versionChoice=document.createElement('select');
versionLabel.append('版本',versionChoice);
versionChoice.add(new Option('正式 Blender 建筑','published'));versionChoice.add(new Option('历史 AI 候选','candidate'));
versionChoice.value=candidateMode?'candidate':'published';document.querySelector('nav').prepend(versionLabel);
versionChoice.addEventListener('change',()=>{
  const query=new URLSearchParams(location.search);query.set('map',region.value);query.set('family',family.value);query.set('level',level.value);
  if(versionChoice.value==='candidate')query.set('stage','candidate');else query.delete('stage');
  location.search=query.toString();
});
const productionProgress=document.createElement('p');productionProgress.hidden=true;productionProgress.setAttribute('role','status');
document.querySelector('header>div').append(productionProgress);
async function loadProductionProgress(){
  try{
    if(!candidateMode){
      const response=await fetch(`./art/blender-city/release.json?review=${Date.now()}`);if(!response.ok)return;
      const release=await response.json();
      if(release.sourceType!=='authored_blender_reference_rebuild')return;
      productionProgress.textContent=`Blender 建筑 · ${release.playableBuildings||0} 件棋盘建筑 · ${release.landmarks||0} 件主景 · ${release.farBuildings||0} 件远景`;
      productionProgress.hidden=false;return;
    }
    const response=await fetch(`./art/full-ai-city/approved-assets.json?review=${Date.now()}`);if(!response.ok)return;
    const ledger=await response.json(),approved=Object.values(ledger.assets||{}).filter(row=>row.status==='approved').length;
    productionProgress.textContent=`历史 AI 制作记录 · ${approved} / 147 件曾记录单体验收 · 不是当前正式版本`;
    productionProgress.hidden=false;
  }catch{} // Unavailable production records do not imply any completed assets.
}
loadProductionProgress();
const galleryLink=document.createElement('a');galleryLink.textContent='整套建筑对照 ↗';galleryLink.style.fontSize='13px';document.querySelector('nav').append(galleryLink);
const upgradeLink=document.createElement('a');upgradeLink.textContent='二级 → 满级对照 ↗';upgradeLink.style.fontSize='13px';upgradeLink.hidden=candidateMode;document.querySelector('nav').append(upgradeLink);
if(candidateMode){document.querySelector('h1').textContent='历史 AI 建筑 · 制作记录';document.querySelector('header p').textContent='当前显示旧 AI 候选，正式游戏已改用 Blender 建筑。右侧为该件当时送入 Pixal3D 的参考图。';}
const entries=[['villa','住宅','core'],['shop','商铺','core'],['hotel','旅馆','core'],['tower','公馆','core'],['onsen','温泉庄园','landmarks'],['finance','商会','landmarks'],['skyscraper','大酒店','landmarks'],['civic_hall','市政厅','public'],['vault_bank','银行','public'],['builders_guild','工坊','public'],['card_pavilion','卡牌店','public'],['chance_wheel','幸运亭','public'],['teleport_gate','交通门','public'],['rush_station','快线站','public'],['junction_hub','路口驿站','public']];
entries.push(['hero','景观地标','scenic']);
const scenic={harbor:['lighthouse','海港灯塔'],alpine:['windmill','山谷风车']};
entries.forEach(([key,label])=>family.add(new Option(label,key)));
if([...region.options].some(option=>option.value===params.get('map')))region.value=params.get('map');
if(entries.some(entry=>entry[0]===params.get('family')))family.value=params.get('family');
if(['1','2','3'].includes(params.get('level')))level.value=params.get('level');
const referenceTabs=document.createElement('div');referenceTabs.className='views';referenceTabs.hidden=true;
document.querySelector('.reference-scroll').before(referenceTabs);
const referenceCaption=document.createElement('p');referenceCaption.className='caption';document.querySelector('.reference-scroll').after(referenceCaption);
let referenceViews=[],selectedReference='front';
function projectURL(path){
  const normal=String(path).replaceAll('\\','/'),marker='/monopoly/',index=normal.indexOf(marker);
  return './'+(index>=0?normal.slice(index+marker.length):normal.replace(/^\.\//,''));
}
function selectReference(view){
  const row=referenceViews.find(item=>item.view===view);if(!row)return;
  selectedReference=view;const url=projectURL(row.path);$('reference').src=url;$('reference-link').href=url;
  $('reference').hidden=false;$('reference-link').hidden=false;
  referenceCaption.textContent=`${candidateMode?'历史建模输入':'沿用三视图设计'} · ${{front:'正面',right:'右侧',back:'背面'}[view]}`;
  referenceTabs.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.refView===view)));
}
function setReferenceViews(views){
  referenceViews=views||[];referenceTabs.replaceChildren();referenceTabs.hidden=!referenceViews.length;referenceCaption.textContent='';
  $('reference').style.maxHeight=referenceViews.length?'490px':'';$('reference').style.objectFit='contain';
  for(const row of referenceViews){const button=document.createElement('button');button.textContent={front:'正面',right:'右侧',back:'背面'}[row.view];button.dataset.refView=row.view;button.addEventListener('click',()=>selectReference(row.view));referenceTabs.append(button);}
  selectReference(selectedReference);
}
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;stage.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e9e8df');const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,100);
const environment=makeStudioEnvironment(renderer);scene.environment=environment.texture;scene.environmentIntensity=.4;
scene.add(new THREE.HemisphereLight('#fff8eb','#a5b7a0',1.3));const sun=new THREE.DirectionalLight('#fff0da',2.5);sun.position.set(-4,8,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-4,right:4,top:6,bottom:-4,near:.1,far:25});sun.shadow.bias=-.00005;sun.shadow.normalBias=.006;sun.shadow.radius=3;scene.add(sun);const fill=new THREE.DirectionalLight('#d5eafa',.8);fill.position.set(5,4,-3);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#e9e8df',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.receiveShadow=true;scene.add(floor);
const pivot=new THREE.Group();scene.add(pivot);let bundle=null,candidateReceipt=null,candidateInputs=[],currentRegion='',request=0,yaw=.6,elevation=.45,zoom=1,bounds=new THREE.Box3(),disposed=false;
async function sha256(bytes){const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');}
async function loadReviewModel(file){
  const loader=new GLTFLoader();
  if(!candidateMode)return {gltf:await loader.loadAsync(`${file}?v=20261025-facade2`),report:null};
  const stamp=Date.now(),response=await fetch(`${file.replace(/\.glb$/,'.json')}?review=${stamp}`);
  if(!response.ok)throw Error('这栋建筑尚未完成候选导出。');const report=await response.json();
  const modelResponse=await fetch(`${file}?review=${stamp}`);if(!modelResponse.ok)throw Error('候选模型尚未载入。');
  const bytes=await modelResponse.arrayBuffer(),hash=await sha256(bytes);
  if(hash!==report.processedCandidate?.sha256)throw Error('这栋建筑正在更新，稍后重新选择即可查看。');
  // Bind the displayed model to its own immutable inference receipt, even while
  // another seed or reference revision is in progress in the production queue.
  if(!report.inferenceReport?.path)throw Error('这栋建筑尚缺实际建模输入记录。');
  const receiptResponse=await fetch(projectURL(report.inferenceReport.path));
  if(!receiptResponse.ok)throw Error('实际建模输入记录暂时无法载入。');
  const receiptBytes=await receiptResponse.arrayBuffer();
  if(await sha256(receiptBytes)!==report.inferenceReport.sha256)throw Error('实际建模输入记录与该模型不匹配。');
  const receipt=JSON.parse(new TextDecoder().decode(receiptBytes));
  if(receipt.input_views?.length!==3)throw Error('这栋建筑尚缺完整的三视图输入。');
  return {gltf:await loader.parseAsync(bytes,'./'),report,inputs:receipt.input_views.map((row,index)=>({...row,view:['front','right','back'][index]}))};
}
const motionToggle=document.createElement('button');motionToggle.type='button';motionToggle.textContent='播放建筑动效';motionToggle.hidden=true;
document.querySelector('.views').append(motionToggle);
let mixer=null,movingParts=[],motionFrame=0,motionPlaying=false,lastMotionTime=0,motionElapsed=0;
function stopMotion(){
  cancelAnimationFrame(motionFrame);motionFrame=0;motionPlaying=false;motionToggle.textContent='播放建筑动效';motionToggle.setAttribute('aria-pressed','false');
  mixer?.stopAllAction();mixer?.uncacheRoot(mixer.getRoot());mixer=null;
  for(const part of movingParts)part.node.rotation.copy(part.rotation);movingParts=[];motionToggle.hidden=true;
}
function setupMotion(object){
  stopMotion();
  if(bundle.animations?.length){mixer=new THREE.AnimationMixer(object);for(const clip of bundle.animations)mixer.clipAction(clip).play();}
  // Hero clips already animate their articulated parts. Public lot buildings
  // have no clips and use the game's wheel/pendulum motion instead.
  if(!mixer)object.traverse(node=>{if(node.userData.lifePart||node.userData.thermalSteam)movingParts.push({node,rotation:node.rotation.clone(),kind:node.userData.thermalSteam?'steam':node.userData.lifePart});});
  motionToggle.hidden=!mixer&&!movingParts.length;motionElapsed=0;
}
function animateMotion(time){
  if(disposed||!motionPlaying)return;const delta=Math.min(.05,(time-lastMotionTime)/1000);lastMotionTime=time;motionElapsed+=delta;mixer?.update(delta);
  for(const part of movingParts){if(part.kind==='steam')part.node.material.uniforms.time.value=motionElapsed;else part.node.rotation.z=part.rotation.z+(part.kind==='wheel'?motionElapsed*.35:Math.sin(motionElapsed*.8)*.08);}
  render();motionFrame=requestAnimationFrame(animateMotion);
}
motionToggle.addEventListener('click',()=>{
  motionPlaying=!motionPlaying;motionToggle.textContent=motionPlaying?'暂停建筑动效':'播放建筑动效';motionToggle.setAttribute('aria-pressed',String(motionPlaying));
  if(motionPlaying){lastMotionTime=performance.now();motionFrame=requestAnimationFrame(animateMotion);}else cancelAnimationFrame(motionFrame);
});
function disposeBundle(gltf){if(!gltf)return;const resources=new Set(),images=new Set();gltf.scene.traverse(n=>{if(n.geometry)resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])if(m){resources.add(m);for(const value of Object.values(m))if(value?.isTexture){resources.add(value);const data=value.source?.data;for(const bitmap of Array.isArray(data)?data:[data])if(bitmap?.close)images.add(bitmap);}}});resources.forEach(x=>x.dispose());images.forEach(bitmap=>bitmap.close());}
function render(){if(disposed)return;const w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight),aspect=w/h;renderer.setSize(w,h,false);if(bounds.isEmpty())return;const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),v=Math.max(size.y*.7,Math.hypot(size.x,size.z)*.65/aspect,.65)/zoom;camera.left=-v*aspect;camera.right=v*aspect;camera.top=v;camera.bottom=-v;camera.position.set(center.x+Math.sin(yaw)*12,center.y+Math.sin(elevation)*12,center.z+Math.cos(yaw)*12);camera.lookAt(center);camera.updateProjectionMatrix();renderer.render(scene,camera);}
async function update(){
 const token=++request,map=region.value;
 galleryLink.href=`./art-board.html?map=${map}${candidateMode?'&artStage=candidate':''}`;
 upgradeLink.href=`./art/blender-city/level3-review.html#${map}`;
 const heroOption=[...family.options].find(option=>option.value==='hero');heroOption.disabled=!scenic[map];
 if(family.value==='hero'&&!scenic[map])family.value='villa';
 const selected=entries.find(x=>x[0]===family.value),hero=selected[2]==='scenic',publicBuilding=selected[2]==='public';level.disabled=publicBuilding||hero;
 const currentQuery=new URLSearchParams(location.search);currentQuery.set('map',map);currentQuery.set('family',family.value);currentQuery.set('level',level.value);
 history.replaceState(null,'',`${location.pathname}?${currentQuery}`);
 const asset=hero?scenic[map][0]:family.value+(publicBuilding?'':`_${level.value}`),key=`${map}_${asset}`;
 stopMotion();clearReviewAdditions();pivot.clear();bounds.makeEmpty();renderer.clear();
 const ref=`./art/regions/references/${map}-${selected[2]}-three-views.png`;setReferenceViews([]);$('reference').hidden=candidateMode;$('reference-link').hidden=candidateMode;
 if(candidateMode)referenceCaption.textContent='实际三视图载入中…';else{$('reference').src=ref;$('reference-link').href=ref;}
 $('title').textContent=hero?scenic[map][1]:selected[1]+(publicBuilding?'':` · Lv.${level.value}`);$('status').textContent='加载中';$('error').hidden=true;
 const file=candidateMode?`./art/full-ai-city/candidates/${map}/${asset}.glb`:hero?`./assets/models/harbor/${key}.glb`:`./assets/models/regions/${map}.glb`;
 try{
   if(currentRegion!==file){
     pivot.clear();disposeBundle(bundle);bundle=null;candidateReceipt=null;candidateInputs=[];currentRegion='';
     const {gltf:loaded,report,inputs=[]}=await loadReviewModel(file);
     if(token!==request||disposed){disposeBundle(loaded);return;}bundle=loaded;candidateReceipt=report;candidateInputs=inputs;currentRegion=file;
   }
   const source=candidateMode?bundle.scene.getObjectByName(`${map}__${asset}`):bundle.scene.getObjectByName(key);
   if(!source)throw Error(candidateMode?'这栋建筑尚未完成候选导出。':'这栋建筑尚未成功加载，请刷新后重试。');
   pivot.clear();const object=source.clone(true);object.position.set(0,0,0);let triangles=0;
   ownerChoice.disabled=publicBuilding||hero;
   if(!candidateMode){
     const steam=createThermalSteam({THREE,model:object,own:resource=>{reviewResources.add(resource);return resource;}});if(steam)object.add(steam);
     if(!publicBuilding&&!hero)reviewRoofs.set(object,ownerChoice.value);
     else if(publicBuilding){
       const type={civic_hall:'start',vault_bank:'bank',builders_guild:'construction',card_pavilion:'card_draw',chance_wheel:'chance',teleport_gate:'teleport',rush_station:'rush',junction_hub:'junction'}[family.value];
       const service=createFunctionalLandmark({THREE,mapId:map,type,model:object,own:resource=>{reviewResources.add(resource);return resource;}});
       if(service)object.add(service);
     }
   }
   object.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;}});
   pivot.add(object);bounds.setFromObject(object);setupMotion(object);$('status').textContent=`${candidateMode?'待审核 · ':''}${Math.round(triangles).toLocaleString()} 面`;$('status').dataset.model=key;
   const neural=candidateMode||['reviewed_pixal_multiview','pixal_native_multiview'].includes(source.userData.sourceType);
   $('caption').textContent=neural?'这是历史 Pixal3D 模型，由正、侧、背三张参考图生成。拖动可检查四面。':'这栋建筑沿用原三视图，在 Blender 中重建屋顶、梁柱、窗框和附楼，直接用于正式游戏。拖动可检查四面。';
   setReferenceViews(candidateMode?candidateInputs:source.userData.referenceViews);render();
   if(candidateMode){
     try{
       const response=await fetch(`./art/full-ai-city/approved-assets.json?review=${Date.now()}`);if(!response.ok)return;
       const registry=await response.json();if(token!==request||disposed)return;
       const approval=registry.assets?.[`${map}/${asset}`];
       if(approval?.status==='approved'&&approval.candidate.sha256===candidateReceipt.processedCandidate.sha256)$('status').textContent=`历史验收记录 · ${Math.round(triangles).toLocaleString()} 面`;
     }catch{} // A missing ledger never upgrades a pending model's review status.
   }
 }catch(error){if(token!==request||disposed)return;$('status').textContent='未载入';$('error').textContent=error.message;$('error').hidden=false;if(candidateMode)referenceCaption.textContent='尚无可核对的完整模型与输入。';}
}
for(const el of [region,family,level])el.addEventListener('change',update);
document.querySelector('.views').addEventListener('click',e=>{const button=e.target.closest('[data-view]');if(!button)return;const view=button.dataset.view;yaw={iso:.6,front:0,side:Math.PI/2,back:Math.PI,left:-Math.PI/2}[view];elevation=view==='iso'?.45:0;zoom=1;selectReference({front:'front',side:'right',back:'back'}[view]);document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();});
let drag=null;stage.addEventListener('pointerdown',e=>{drag={id:e.pointerId,x:e.clientX,y:e.clientY,yaw,elevation};stage.setPointerCapture(e.pointerId);});stage.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;yaw=drag.yaw+(e.clientX-drag.x)*.008;elevation=Math.max(-.1,Math.min(1.2,drag.elevation+(e.clientY-drag.y)*.006));render();});for(const event of ['pointerup','pointercancel'])stage.addEventListener(event,()=>drag=null);stage.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.7,Math.min(2.3,zoom*Math.exp(-e.deltaY*.001)));render();},{passive:false});
const observer=new ResizeObserver(render);observer.observe(stage);window.addEventListener('pagehide',()=>{disposed=true;request++;stopMotion();observer.disconnect();clearReviewAdditions();disposeBundle(bundle);floor.geometry.dispose();floor.material.dispose();environment.dispose();renderer.dispose();},{once:true});update();

import * as THREE from './assets/vendor/three/three.module.min.js';
import { GLTFLoader } from './assets/vendor/three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from './assets/vendor/three/addons/utils/BufferGeometryUtils.js';
import { createSceneLife } from './scene-life.js?v=20260912-21';

// All route positions, ownership and prices come from the game. This view never
// changes a rule or finishes an action; its animation is entirely cosmetic.
const STEP = 1.65;
const PALETTE = { cream: '#f3ecdc', edge: '#d9cbb3', grass: '#bac8a6', green: '#6b947b', leaf: '#70947a', dark: '#254d48', roof: '#bc7155', teal: '#438b88', gold: '#d6ac61', path: '#eee5d5', water: '#8dc8c5' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const modelLibrary = new Map();
const authoredModels = new Set();
const assetEnvelopes = new Map();
const loadedBundles = new Set();
const modelResources = new Set();
const lotViews = new Map();
const pawnViews = new Map();
const stepViews = new Map();
const resources = new Set();
const materials = new Map();
const pulses = [];
let scene, camera, renderer, world, labels, wrap, observer, frame = 0;
let snapshot = null, mapKey = '', lastTime = 0, width = 1, height = 1;
let rendererWidth = 0, rendererHeight = 0;
let boardBounds, light, ground, disposed = false, selectedIndex = null;
let modelLoadStarted = false;
let modelsLoading = false;
let renderDirty = false;
let inspection = null;
let studioEnvironment = null;
let travelArrow = null;
let sceneLife = null, cameraControls = null, timeMode = 'auto';
let cameraView = { yaw:null, elevation:null, zoom:1, modified:false, facingYaw:null };
let cameraGesture = { pointers:new Map(), dragged:false, pinchDistance:0 };
let suppressSceneClickUntil = 0;
const CAMERA_LIMITS = { minZoom:.65, maxZoom:2.4, minElevation:.35, maxElevation:1.24 };
const LANDMARKS = { classic: { 5:'finance', 7:'skyscraper', 14:'onsen' }, compact: { 2:'finance', 11:'onsen' }, expansion: { 7:'skyscraper', 26:'onsen' } };
const SPECIAL_MODELS = { bank:'vault_bank',construction:'builders_guild',card_draw:'card_pavilion',chance:'chance_wheel',teleport:'teleport_gate',rush:'rush_station',junction:'junction_hub' };
const ASSET_BUNDLES = [
  {file:'city-kit.glb',authored:false,pattern:/^(villa_[123]|shop_[123]|hotel_[123]|tower_[123]|plot_0|city_hall|bank|construction|card_station|tree|streetlamp|fountain)$/},
  {file:'landmarks.glb',authored:true,pattern:/^(skyscraper|finance|onsen)_[123]$/},
  {file:'specials.glb',authored:true,pattern:/^(civic_hall|vault_bank|builders_guild|card_pavilion|chance_wheel|teleport_gate|rush_station|junction_hub)$/},
  {file:'life-specials.glb',authored:true,pattern:/^(chance_wheel|builders_guild)$/},
  {file:'compact-specials.glb',authored:true,pattern:/^compact_(civic_hall|vault_bank|builders_guild|card_pavilion|chance_wheel|teleport_gate|rush_station)$/},
  {file:'expansion-specials.glb',authored:true,pattern:/^expansion_(civic_hall|vault_bank|builders_guild|card_pavilion|chance_wheel|teleport_gate|rush_station)$/},
];
const projection = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const api = { update, effect, reset, projectTile, inspectTile, closeInspection, resetView:()=>resetCameraView(true), zoomBy:factor=>changeCameraView(0,0,factor), getView:()=>({...cameraView}), setTimeMode:setCityTimeMode, getTimeMode:()=>sceneLife?.getTimeMode()||timeMode, refreshAssets:()=>loadModelKit(true), ready: false };
window.CityScene = api;

function own(resource) { resources.add(resource); return resource; }
function material(color, options = {}) {
  const key = color + JSON.stringify(options);
  if (!materials.has(key)) materials.set(key, own(new THREE.MeshStandardMaterial({ color, roughness: .78, ...options })));
  return materials.get(key);
}
function mesh(geometry, color, parent, x = 0, y = 0, z = 0, options) {
  const item = new THREE.Mesh(own(geometry), typeof color === 'string' ? material(color, options) : color);
  item.position.set(x, y, z); item.castShadow = true; item.receiveShadow = true;
  parent.add(item); return item;
}
function box(parent, w, h, d, color, x = 0, y = h / 2, z = 0, options) {
  return mesh(new THREE.BoxGeometry(w, h, d), color, parent, x, y, z, options);
}
function cylinder(parent, r, h, color, x = 0, y = h / 2, z = 0, sides = 24) {
  return mesh(new THREE.CylinderGeometry(r, r, h, sides), color, parent, x, y, z);
}
function rounded(parent, w, h, d, radius, color, x = 0, y = 0, z = 0) {
  const s = new THREE.Shape(); const a = -w / 2, b = -d / 2, r = radius;
  s.moveTo(a + r, b); s.lineTo(a + w - r, b); s.quadraticCurveTo(a + w, b, a + w, b + r);
  s.lineTo(a + w, b + d - r); s.quadraticCurveTo(a + w, b + d, a + w - r, b + d);
  s.lineTo(a + r, b + d); s.quadraticCurveTo(a, b + d, a, b + d - r);
  s.lineTo(a, b + r); s.quadraticCurveTo(a, b, a + r, b);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  return mesh(g, color, parent, x, y, z);
}
function roundedFrame(parent,w,h,d,radius,thickness,color,y=0){
  const draw=(path,width,depth,r)=>{
    const x=-width/2,z=-depth/2;
    path.moveTo(x+r,z);path.lineTo(x+width-r,z);path.quadraticCurveTo(x+width,z,x+width,z+r);
    path.lineTo(x+width,z+depth-r);path.quadraticCurveTo(x+width,z+depth,x+width-r,z+depth);
    path.lineTo(x+r,z+depth);path.quadraticCurveTo(x,z+depth,x,z+depth-r);
    path.lineTo(x,z+r);path.quadraticCurveTo(x,z,x+r,z);path.closePath();return path;
  };
  const shape=draw(new THREE.Shape(),w,d,radius);
  shape.holes.push(draw(new THREE.Path(),w-2*thickness,d-2*thickness,Math.max(.008,radius-thickness)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:8});geometry.rotateX(-Math.PI/2);
  const frame=mesh(geometry,color,parent,0,y,0);frame.castShadow=false;return frame;
}
function tree(parent, x, z, size = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(size); parent.add(g);
  const source = modelLibrary.get('tree');
  if (source) { g.add(cloneModel(source, .42, .8)); return g; }
  cylinder(g, .045, .34, '#987654');
  mesh(new THREE.IcosahedronGeometry(.23, 1), PALETTE.leaf, g, 0, .47, 0);
  mesh(new THREE.IcosahedronGeometry(.18, 1), '#92ad86', g, -.08, .65, .015);
  return g;
}
function lamp(parent, x, z) {
  cylinder(parent, .022, .46, PALETTE.dark, x, .23, z, 8);
  box(parent, .085, .11, .085, '#f5df9e', x, .5, z, { emissive: '#edc370', emissiveIntensity: .22 });
  box(parent, .13, .025, .13, PALETTE.dark, x, .57, z);
}
function bench(parent, x, z, angle = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = angle; parent.add(g);
  for (let i = 0; i < 3; i++) box(g, .5, .035, .035, '#bc9470', 0, .16, (i - 1) * .045);
  box(g, .5, .06, .03, '#bc9470', 0, .27, -.085);
  box(g, .5, .06, .03, '#bc9470', 0, .35, -.085);
  box(g, .035, .18, .2, PALETTE.dark, -.17, .09);
  box(g, .035, .18, .2, PALETTE.dark, .17, .09);
}
function makeStudioEnvironment(targetRenderer){
  const room=new THREE.Scene();room.background=new THREE.Color('#b8c6c0');
  const panels=[];
  [[-4,5,3,4.2,5.2],[5,3,-2,3,4],[0,7,-5,5,3]].forEach(([x,y,z,w,h],i)=>{
    const geometry=new THREE.PlaneGeometry(w,h);const mat=new THREE.MeshBasicMaterial({color:new THREE.Color(i===0?1.8:1.2,i===0?1.55:1.35,i===0?1.12:1.45),side:THREE.DoubleSide});
    const panel=new THREE.Mesh(geometry,mat);panel.position.set(x,y,z);panel.lookAt(0,1,0);room.add(panel);panels.push(panel);
  });
  const generator=new THREE.PMREMGenerator(targetRenderer);const target=generator.fromScene(room,.04,.1,40);
  generator.dispose();panels.forEach((p)=>{p.geometry.dispose();p.material.dispose();});return target;
}
function mount() {
  wrap = document.getElementById('city-canvas-wrap');
  labels = document.getElementById('city-labels');
  if (!wrap || !labels) return false;
  if (renderer) return true;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    rendererWidth=0;rendererHeight=0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .96;
    renderer.setClearColor('#dce4da', 0);
    renderer.domElement.setAttribute('aria-hidden', 'true');
    wrap.removeAttribute('aria-hidden');wrap.tabIndex=0;wrap.setAttribute('role','group');wrap.setAttribute('aria-label','城市棋盘视角');wrap.setAttribute('aria-describedby','city-camera-help');
    wrap.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    studioEnvironment=makeStudioEnvironment(renderer);scene.environment=studioEnvironment.texture;scene.environmentIntensity=.35;
    camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .1, 100);
    camera.position.set(8.4, 16, 13.8); camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight('#fff6e7', '#94aaa0', 1.0));
    light = new THREE.DirectionalLight('#fff0d6', 2.4);
    light.position.set(-7, 15, 5); light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048); light.shadow.camera.left = -14; light.shadow.camera.right = 14;
    light.shadow.camera.top = 14; light.shadow.camera.bottom = -14; light.shadow.camera.far = 50;
    light.shadow.normalBias = .012; light.shadow.bias = -.00005;
    scene.add(light);
    const fill = new THREE.DirectionalLight('#d4eeed', .4); fill.position.set(8, 7, -6); scene.add(fill);
    world = new THREE.Group(); scene.add(world);
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
      event.preventDefault(); document.body.classList.remove('scene-ready'); api.ready = false;
    });
    renderer.domElement.addEventListener('webglcontextrestored', () => { if (snapshot) update(snapshot); });
    observer = new ResizeObserver(resize); observer.observe(wrap);
    labels.addEventListener('click', (event) => {
      if(!canSelectScene()||isSuppressedSceneClick(event))return;
      const button = event.target.closest('[data-scene-tile-index]');
      if (!button) return;
      selectSceneTile(Number(button.dataset.sceneTileIndex));
    });
    const refreshHoveredLabel=(event)=>{if(event.target.closest?.('.scene-tile'))requestAnimationFrame(()=>{arrangeLabels();positionLabels();});};
    labels.addEventListener('pointerover',refreshHoveredLabel);
    labels.addEventListener('pointerout',refreshHoveredLabel);
    renderer.domElement.addEventListener('click',(event)=>{
      if(!canSelectScene()||isSuppressedSceneClick(event))return;
      const rect=renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      raycaster.setFromCamera(pointer,camera);
      const hit=raycaster.intersectObjects([...lotViews.values()].map((view)=>view.group),true)[0];
      if(!hit)return;
      let node=hit.object;while(node&&node.userData.tileIndex===undefined)node=node.parent;
      if(node)selectSceneTile(node.userData.tileIndex);
    });
    mountCameraControls();
    disposed = false; resize(); frame = requestAnimationFrame(tick);
    return true;
  } catch (error) {
    document.body.classList.remove('scene-ready');
    console.warn('The miniature city could not start. The accessible board remains available.', error);
    renderer?.dispose(); renderer = null; api.ready = false;
    return false;
  }
}
function selectSceneTile(index){
  selectedIndex=index;
  labels.querySelectorAll('.scene-tile').forEach((node)=>node.classList.toggle('is-selected',Number(node.dataset.sceneTileIndex)===index));
  effect({type:'select',tiles:[index]});
  window.dispatchEvent(new CustomEvent('city:select',{detail:{index}}));
}
function canSelectScene(){
  const drama=document.getElementById('drama-layer');
  const modal=document.getElementById('event-overlay');
  return Boolean(snapshot&&!inspection&&snapshot.phase!=='presenting'&&(!drama||drama.hidden)&&(!modal?.classList.contains('visible')||snapshot.targetSelection));
}
function canMoveCamera(){return canSelectScene()&&!document.getElementById('event-overlay')?.classList.contains('visible')&&!document.body.classList.contains('mode-start');}
function isSuppressedSceneClick(event){return event.detail!==0&&performance.now()<suppressSceneClickUntil;}
function resetCameraView(apply=false){
  cancelCameraGesture();cameraView={yaw:null,elevation:null,zoom:1,modified:false,facingYaw:cameraView.facingYaw};
  if(apply)resize();
}
function changeCameraView(yawDelta=0,elevationDelta=0,zoomFactor=1){
  if(!canMoveCamera()||!Number.isFinite(zoomFactor)||zoomFactor<=0)return false;
  if(cameraView.yaw===null)resize();
  cameraView.yaw+=yawDelta;
  cameraView.elevation=THREE.MathUtils.clamp(cameraView.elevation+elevationDelta,CAMERA_LIMITS.minElevation,CAMERA_LIMITS.maxElevation);
  cameraView.zoom=THREE.MathUtils.clamp(cameraView.zoom*zoomFactor,CAMERA_LIMITS.minZoom,CAMERA_LIMITS.maxZoom);
  cameraView.modified=true;
  lotViews.forEach(view=>{view.screenPoint=null;});
  resize();return true;
}
function cameraSurface(target){return Boolean(target?.closest?.('#city-canvas-wrap,[data-scene-tile-index]'));}
function cancelCameraGesture(){
  const stage=wrap?.parentElement;
  const captured=[...cameraGesture.pointers.keys()];
  if(cameraGesture.dragged)suppressSceneClickUntil=performance.now()+650;
  cameraGesture={pointers:new Map(),dragged:false,pinchDistance:0};
  captured.forEach(id=>{try{if(stage?.hasPointerCapture(id))stage.releasePointerCapture(id);}catch(_){}});
  stage?.classList.remove('is-camera-dragging');
}
function cameraPointerDown(event){
  if(!canMoveCamera()||!cameraSurface(event.target)||(event.pointerType==='mouse'&&event.button!==0)||cameraGesture.pointers.size>=2)return;
  cameraGesture.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,type:event.pointerType});
  if(cameraGesture.pointers.size===2){
    const [a,b]=[...cameraGesture.pointers.values()];cameraGesture.pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);cameraGesture.dragged=true;
    cameraGesture.pointers.forEach((_,id)=>{try{wrap.parentElement.setPointerCapture(id);}catch(_){}});
    event.preventDefault();
  }
}
function cameraPointerMove(event){
  const entry=cameraGesture.pointers.get(event.pointerId);if(!entry)return;
  if(!canMoveCamera()){cancelCameraGesture();return;}
  const dx=event.clientX-entry.x,dy=event.clientY-entry.y;entry.x=event.clientX;entry.y=event.clientY;
  if(cameraGesture.pointers.size===2){
    const [a,b]=[...cameraGesture.pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);
    if(cameraGesture.pinchDistance>4&&distance>4)changeCameraView(0,0,distance/cameraGesture.pinchDistance);
    cameraGesture.pinchDistance=distance;cameraGesture.dragged=true;event.preventDefault();
  }else{
    if(!cameraGesture.dragged&&Math.hypot(entry.x-entry.startX,entry.y-entry.startY)<(entry.type==='touch'?8:6))return;
    if(!cameraGesture.dragged){cameraGesture.dragged=true;try{wrap.parentElement.setPointerCapture(event.pointerId);}catch(_){}}
    changeCameraView(-dx*.007,dy*.004);event.preventDefault();
  }
  wrap.parentElement.classList.add('is-camera-dragging');suppressSceneClickUntil=performance.now()+650;
}
function cameraPointerUp(event){
  if(!cameraGesture.pointers.has(event.pointerId))return;
  cameraGesture.pointers.delete(event.pointerId);
  try{if(wrap.parentElement.hasPointerCapture(event.pointerId))wrap.parentElement.releasePointerCapture(event.pointerId);}catch(_){}
  if(cameraGesture.dragged)suppressSceneClickUntil=performance.now()+650;
  if(!cameraGesture.pointers.size)cancelCameraGesture();
  else{cameraGesture.pinchDistance=0;cameraGesture.pointers.forEach(entry=>{entry.startX=entry.x;entry.startY=entry.y;});}
}
function syncCameraControls(){
  if(!cameraControls)return;
  const allowed=canMoveCamera();
  cameraControls.querySelectorAll('button').forEach(button=>{button.disabled=!allowed||(button.dataset.camera==='out'&&cameraView.zoom<=CAMERA_LIMITS.minZoom)||(button.dataset.camera==='in'&&cameraView.zoom>=CAMERA_LIMITS.maxZoom);});
  cameraControls.querySelector('output').textContent=`${Math.round(cameraView.zoom*100)}%`;
  const timeSelect=cameraControls.querySelector('select');timeSelect.disabled=!allowed;timeSelect.value=timeMode;
  if(!allowed&&cameraGesture.pointers.size)cancelCameraGesture();
}
function setCityTimeMode(mode){
  if(!['auto','day','dusk','night'].includes(mode))return false;
  timeMode=mode;sceneLife?.setTimeMode(mode);renderDirty=true;
  if(cameraControls)cameraControls.querySelector('select').value=mode;
  return true;
}
function mountCameraControls(){
  const stage=wrap.parentElement;
  cameraControls=document.createElement('div');cameraControls.className='city-camera-controls';cameraControls.setAttribute('role','group');cameraControls.setAttribute('aria-label','调整棋盘视角');
  cameraControls.innerHTML='<span id="city-camera-help" class="city-camera-help">拖动转一转 · 滚轮或双指缩放。键盘方向键转动，＋ / − 缩放，Home 回正。</span><button type="button" data-camera="left" aria-label="向左转动棋盘" title="向左转">↶</button><button type="button" data-camera="right" aria-label="向右转动棋盘" title="向右转">↷</button><span class="city-camera-divider"></span><button type="button" data-camera="out" aria-label="缩小棋盘" title="缩小">−</button><output aria-label="棋盘缩放比例">100%</output><button type="button" data-camera="in" aria-label="放大棋盘" title="放大">＋</button><button type="button" data-camera="reset" class="city-camera-reset">回正</button>';
  const timeControl=document.createElement('label');timeControl.className='city-time-control';timeControl.innerHTML='<span>光照</span><select aria-label="小城光照"><option value="auto">自动</option><option value="day">白天</option><option value="dusk">黄昏</option><option value="night">夜晚</option></select>';cameraControls.appendChild(timeControl);
  timeControl.querySelector('select').value=timeMode;
  timeControl.addEventListener('change',event=>{event.stopPropagation();setCityTimeMode(event.target.value);});
  stage.appendChild(cameraControls);
  cameraControls.addEventListener('click',event=>{
    const action=event.target.closest('[data-camera]');if(!action||action.disabled)return;event.stopPropagation();
    if(action.dataset.camera==='reset')resetCameraView(true);
    else if(action.dataset.camera==='left'||action.dataset.camera==='right')changeCameraView(action.dataset.camera==='left'?-.25:.25);
    else changeCameraView(0,0,action.dataset.camera==='in'?1.18:1/1.18);
  });
  stage.addEventListener('pointerdown',cameraPointerDown);
  stage.addEventListener('pointermove',cameraPointerMove);
  stage.addEventListener('pointerup',cameraPointerUp);stage.addEventListener('pointercancel',cameraPointerUp);
  // A click can leave the board before it reaches the drag threshold.
  window.addEventListener('pointerup',cameraPointerUp);window.addEventListener('pointercancel',cameraPointerUp);
  // Touch initially captures on its label/canvas. Transferring that capture to
  // the stage is part of starting a drag, not the end of the gesture.
  stage.addEventListener('lostpointercapture',event=>{if(event.target===stage&&!stage.hasPointerCapture(event.pointerId)&&cameraGesture.pointers.has(event.pointerId))cameraPointerUp(event);});
  stage.addEventListener('click',event=>{if(isSuppressedSceneClick(event)&&!event.target.closest('.city-camera-controls')){event.preventDefault();event.stopImmediatePropagation();}},true);
  stage.addEventListener('wheel',event=>{
    if(!canMoveCamera()||!cameraSurface(event.target))return;
    event.preventDefault();const unit=event.deltaMode===1?16:event.deltaMode===2?height:1;
    changeCameraView(0,0,Math.exp(-THREE.MathUtils.clamp(event.deltaY*unit,-160,160)*.0018));
  },{passive:false});
  stage.addEventListener('keydown',event=>{
    if(!canMoveCamera()||event.altKey||event.ctrlKey||event.metaKey||event.target.matches('select')||!(event.target===wrap||event.target.closest('.city-camera-controls')))return;
    const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','_','Home'];if(!keys.includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(event.key==='Home')resetCameraView(true);
    else if(['+','=','-','_'].includes(event.key))changeCameraView(0,0,['+','='].includes(event.key)?1.15:1/1.15);
    else changeCameraView(event.key==='ArrowLeft'?-.18:event.key==='ArrowRight'?.18:0,event.key==='ArrowUp'?.08:event.key==='ArrowDown'?-.08:0);
  });
  window.addEventListener('blur',cancelCameraGesture);
}
function clearMap() {
  sceneLife?.dispose();sceneLife=null;
  world?.clear(); labels?.replaceChildren(); lotViews.clear(); pawnViews.clear(); stepViews.clear();
  travelArrow = null;
  resources.forEach((resource) => resource.dispose?.()); resources.clear(); materials.clear(); pulses.length = 0;
}
function reset() {
  closeInspection();
  resetCameraView();cameraView.facingYaw=null;
  clearMap(); snapshot = null; mapKey = ''; selectedIndex = null;
  document.body.classList.remove('scene-ready'); api.ready = false;
}
function tilePosition(tile) {
  return new THREE.Vector3((tile.x - boardBounds.cx) * STEP, .14, (tile.y - boardBounds.cy) * STEP);
}
function inward(position) {
  const x = position.x, z = position.z;
  if(snapshot?.mapId!=='classic'){
    const edges=boundaryEdges(position),distance=Math.min(...edges.map((edge)=>edge.distance));
    // Corners join the two inner pavements with one short diagonal. Every other
    // step follows its actual boundary, including long, shallow rectangles.
    const vector=new THREE.Vector3();
    edges.filter((edge)=>edge.distance<distance+.001).forEach((edge)=>vector.add(edge.normal));
    return vector.normalize();
  }
  const vector = new THREE.Vector3(-x, 0, -z);
  if (Math.abs(x) > Math.abs(z) * 1.18) vector.z = 0; else vector.x = 0;
  return vector.normalize();
}
function boundaryEdges(position){
  const left=(boardBounds.minX-boardBounds.cx)*STEP,right=(boardBounds.maxX-boardBounds.cx)*STEP;
  const back=(boardBounds.minY-boardBounds.cy)*STEP,front=(boardBounds.maxY-boardBounds.cy)*STEP;
  return [
    {side:'north',distance:Math.abs(position.z-back),normal:new THREE.Vector3(0,0,1),rotation:0},
    {side:'south',distance:Math.abs(position.z-front),normal:new THREE.Vector3(0,0,-1),rotation:Math.PI},
    {side:'west',distance:Math.abs(position.x-left),normal:new THREE.Vector3(1,0,0),rotation:Math.PI/2},
    {side:'east',distance:Math.abs(position.x-right),normal:new THREE.Vector3(-1,0,0),rotation:-Math.PI/2},
  ];
}
function boundaryFor(position){return boundaryEdges(position).sort((a,b)=>a.distance-b.distance)[0];}
function buildMap(data) {
  clearMap();
  const xs = data.board.map((tile) => tile.x), ys = data.board.map((tile) => tile.y);
  boardBounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  boardBounds.cx = (boardBounds.minX + boardBounds.maxX) / 2;
  boardBounds.cy = (boardBounds.minY + boardBounds.maxY) / 2;
  boardBounds.w = (boardBounds.maxX - boardBounds.minX + 1) * STEP;
  boardBounds.d = (boardBounds.maxY - boardBounds.minY + 1) * STEP;
  rounded(world, boardBounds.w + 1.2, .38, boardBounds.d + 1.2, .48, '#d0bc9c', 0, -.42);
  rounded(world, boardBounds.w + 1.28, .10, boardBounds.d + 1.28, .49, PALETTE.cream, 0, -.08);
  rounded(world, boardBounds.w + .82, .08, boardBounds.d + .82, .36, '#bbcbaa', 0, .01);
  ground = mesh(new THREE.PlaneGeometry(200, 200), '#dbe3d7', world, 0, -.44, 0);
  ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  makePark(data.mapId);
  data.board.forEach((tile) => makeStep(tile));
  makeRoads(data);
  data.board.filter((tile) => !tile.isLargeSecondary).forEach((tile) => makeLot(tile, data));
  data.players.forEach((player) => makePawn(player));
  if(data.mapId!=='classic'){
    travelArrow=document.createElement('span');travelArrow.className='scene-travel-arrow';travelArrow.setAttribute('role','img');
    travelArrow.innerHTML='<svg viewBox="0 0 28 20" aria-hidden="true"><path d="M3 10H23M17 4L23 10L17 16"/></svg>';
    labels.appendChild(travelArrow);
  }
  try{
    sceneLife=createSceneLife({THREE,scene,world,renderer,light,snapshot:data,lotViews,boardBounds,requestRender:()=>{renderDirty=true;}});
    sceneLife.setTimeMode(timeMode);
  }catch(error){console.warn('City atmosphere is temporarily unavailable.',error);sceneLife=null;}
  resize();
}
function makePark(mapId) {
  const parks = [{ x: 0, z: 0, w: boardBounds.w - 4.7, d: boardBounds.d - 4.65 }];
  parks.forEach((p) => {
    if (p.w < 1 || p.d < 1) return;
    const g = new THREE.Group(); g.position.set(p.x, .1, p.z); world.add(g);
    rounded(g, p.w, .035, p.d, .22, '#acbf9c');
    rounded(g, p.w - .2, .018, .4, .15, '#e2d8c1', 0, .04);
    rounded(g, .4, .018, p.d - .2, .15, '#e2d8c1', 0, .045);
    cylinder(g, Math.min(.86, p.d * .36), .08, PALETTE.cream, 0, .085);
    cylinder(g, Math.min(.73, p.d * .3), .045, PALETTE.water, 0, .14);
    const fountain = modelLibrary.get('fountain');
    if (fountain) { const fountainModel = cloneModel(fountain, .95, .65); fountainModel.position.y = .16; g.add(fountainModel); }
    else {
      cylinder(g, .13, .38, '#eee5d0', 0, .31);
      cylinder(g, .29, .05, PALETTE.cream, 0, .5);
      mesh(new THREE.SphereGeometry(.10, 16, 12), '#fbf2d9', g, 0, .58, 0);
    }
    const tx = p.w / 2 - .35, tz = p.d / 2 - .34;
    [[-tx,-tz],[tx,-tz],[-tx,tz],[tx,tz]].forEach(([x,z], i) => tree(g, x, z, .92 + (i % 2) * .15));
    if (p.d > 2.4) {
      [[-tx,0],[tx,0],[-tx*.55,-tz],[tx*.55,tz]].forEach(([x,z]) => tree(g,x,z,.77));
      bench(g, -.95, .70); bench(g, .95, -.70, Math.PI);
      lamp(g,-1.2,-.75); lamp(g,1.2,.75);
      for (const side of [-1,1]) {
        rounded(g, 1.1, .05, .36, .1, '#728f67', side * (tx - .6), .055, -tz);
        for (let i = 0; i < 5; i++) mesh(new THREE.IcosahedronGeometry(.075, 0), i%2 ? '#e4b87c' : '#cb866c', g, side*(tx-.98+i*.18), .16, -tz);
      }
    }
  });
}
function numberTexture(number) {
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8dcc7'; ctx.beginPath(); ctx.arc(48,48,42,0,Math.PI*2); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#c7b79a'; ctx.stroke();
  ctx.font = '600 39px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#716752'; ctx.fillText(String(number + 1).padStart(2,'0'),48,51);
  const texture = own(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function makeStep(tile) {
  const modern=snapshot?.mapId!=='classic';
  const center = tilePosition(tile), walk = center.clone().add(inward(center).multiplyScalar(modern?.84:.63)); walk.y = .205;
  const disc = mesh(new THREE.PlaneGeometry(.30,.30), own(new THREE.MeshBasicMaterial({ map:numberTexture(tile.index), transparent:true, depthWrite:false })), world, walk.x, walk.y, walk.z);
  disc.rotation.x = -Math.PI/2; disc.castShadow = false;
  const ring = mesh(new THREE.RingGeometry(modern?.24:.15,modern?.33:.195,36), own(new THREE.MeshBasicMaterial({ color:'#efba68', transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false })), world, walk.x, .218, walk.z);
  ring.rotation.x = -Math.PI/2;
  stepViews.set(tile.index, { center, walk, ring });
}
function makeRoads(data) {
  const edges = new Set(); const connections = [];
  const addEdge = (a,b) => { if (!stepViews.has(a)||!stepViews.has(b)) return; const key=[a,b].sort((x,y)=>x-y).join(':'); if(edges.has(key))return; edges.add(key); connections.push([a,b]); };
  if (data.navigation?.next) Object.entries(data.navigation.next).forEach(([a,b]) => addEdge(Number(a),Number(b)));
  else data.board.forEach((tile,i)=>addEdge(tile.index,data.board[(i+1)%data.board.length].index));
  connections.forEach(([a,b]) => {
    const start = stepViews.get(a).walk, end = stepViews.get(b).walk;
    const length = start.distanceTo(end); const midpoint = start.clone().add(end).multiplyScalar(.5);
    const road = box(world,data.mapId==='classic'?.16:.34,.014,length, data.mapId==='classic'?'#d3c7af':'#e7dac0',midpoint.x,.197,midpoint.z);
    road.rotation.y = Math.atan2(end.x-start.x,end.z-start.z); road.castShadow=false;
    if(data.mapId!=='classic'){
      const shape=new THREE.Shape();shape.moveTo(-.085,-.07);shape.lineTo(0,.08);shape.lineTo(.085,-.07);shape.lineTo(0,-.025);shape.closePath();
      const arrow=mesh(new THREE.ShapeGeometry(shape),own(new THREE.MeshBasicMaterial({color:'#a99161',side:THREE.DoubleSide})),world,midpoint.x,.216,midpoint.z);
      arrow.rotation.set(-Math.PI/2,0,-Math.atan2(end.x-start.x,-(end.z-start.z)));arrow.castShadow=false;
    }
  });
}
function makeLot(tile, data) {
  const center = tilePosition(tile);
  const secondary = data.board.find((item) => item.isLargeSecondary && item.largePrimaryIndex === tile.index);
  const position = secondary ? center.clone().add(tilePosition(secondary)).multiplyScalar(.5) : center.clone();
  const w = 1.43 + (secondary && secondary.x !== tile.x ? STEP : 0);
  const d = 1.43 + (secondary && secondary.y !== tile.y ? STEP : 0);
  const group = new THREE.Group(); group.position.copy(position); group.userData.tileIndex=tile.index; world.add(group);
  const boundary=boundaryFor(position),modern=data.mapId!=='classic';
  rounded(group,w,.08,d,.13,PALETTE.cream,0,-.07);
  rounded(group,w-.12,.03,d-.12,.09,tile.lot ? '#c5cfad' : '#ded3bc',0,.011);
  const ownerMaterial = own(new THREE.MeshStandardMaterial({ color:'#c5b696', roughness:.84, emissive:'#000000' }));
  // A single closed deed boundary, in parcel coordinates. The two physical
  // steps of a large lot share this one frame, independent of its frontage.
  const ownerFrame=roundedFrame(group,w-.055,.024,d-.055,.105,.070,ownerMaterial,.044);
  ownerFrame.name='ownership_frame';ownerFrame.visible=false;
  const pulseMaterial = own(new THREE.MeshBasicMaterial({ color:PALETTE.gold, transparent:true, opacity:0, depthWrite:false }));
  // Event emphasis sits outside the parcel; ownership keeps its own color.
  const outline=roundedFrame(group,w+.12,.014,d+.12,.18,.035,pulseMaterial,.014);outline.name='event_frame';
  const building = new THREE.Group(); building.position.y=.048; group.add(building);
  const flag = new THREE.Group(); flag.position.set(-w/2+.19,.045,d/2-.26); group.add(flag);
  if(modern){const front=Math.abs(boundary.normal.x)>.5?w:d,span=Math.abs(boundary.normal.x)>.5?d:w;flag.position.copy(boundary.normal.clone().multiplyScalar(front/2-.23)).add(new THREE.Vector3(boundary.normal.z,0,-boundary.normal.x).multiplyScalar(-span/2+.19));flag.position.y=.045;flag.rotation.y=boundary.rotation;}
  cylinder(flag,.017,.38,PALETTE.dark,0,.19,0,8);
  const flagCloth = box(flag,.21,.12,.012,ownerMaterial,.09,.32,0);
  const outward = inward(position).multiplyScalar(-1);
  // Back-row names sit along the walk in front of their buildings; placing them
  // beyond the far edge would project the text directly over the roofs.
  if(outward.z<-.2)outward.z*=-1;
  const anchor = position.clone().add(outward.multiplyScalar(.91)); anchor.y=.07;
  const button = document.createElement('button'); button.type='button'; button.className='scene-tile'; button.dataset.sceneTileIndex=String(tile.index);
  button.dataset.side=boundary.side;
  button.innerHTML='<span class="scene-tile-name"></span><span class="scene-tile-meta"></span>';
  button.querySelector('.scene-tile-name').textContent=tile.name;
  labels.appendChild(button);
  const view={tile, mapId:data.mapId, boundary, group, building, ownerMaterial, ownerFrame, flag, flagCloth, outline, label:button, anchor, w, d, signature:'', modelName:'', born:0};
  lotViews.set(tile.index,view); updateLot(view,tile,data,true);
  if (secondary) {
    // Both physical step positions remain separately selectable even when they share a deed.
    const step = document.createElement('button'); step.type='button'; step.className='scene-secondary-step'; step.dataset.sceneTileIndex=String(secondary.index);
    step.textContent=String(secondary.index+1).padStart(2,'0'); step.setAttribute('aria-label',`${secondary.name} 第二步位，第 ${secondary.index+1} 格`);
    labels.appendChild(step); stepViews.get(secondary.index).label=step;
  }
}
function cloneModel(source, targetWidth, maxHeight = 2) {
  const object=source.clone(true); object.position.set(0,0,0);
  const bounds=new THREE.Box3().setFromObject(object); const size=bounds.getSize(new THREE.Vector3());
  const scale=Math.min(targetWidth/Math.max(size.x,size.z,.001),maxHeight/Math.max(size.y,.001));
  object.scale.multiplyScalar(scale);
  const adjusted=new THREE.Box3().setFromObject(object); const center=adjusted.getCenter(new THREE.Vector3());
  object.position.x-=center.x; object.position.z-=center.z; object.position.y-=adjusted.min.y;
  object.traverse((child)=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true;}});
  return object;
}
function cloneAuthoredModel(source){
  // Landmark levels are authored in game-world units. Never fit each level into
  // a common height: that would make the final tower shorter and the estate shrink.
  const object=source.clone(true);object.position.set(0,0,0);
  object.traverse((child)=>{if(child.isMesh){child.castShadow=!child.material?.transparent;child.receiveShadow=true;}});
  return object;
}
function resolveAsset(tile,data,level=tile.lot?.level||0){
  const family=tile.lot?.landmarkKey||LANDMARKS[data.mapId]?.[tile.isLargeSecondary?tile.largePrimaryIndex:tile.index];
  const fallback=tile.isStart?'city_hall':tile.lot?(level===0?'plot_0':`${tile.lot.theme?.key||'villa'}_${level}`):({bank:'bank',construction:'construction',card_draw:'card_station'}[tile.special?.type]||'card_station');
  const shared=tile.isStart?'civic_hall':tile.lot?(level===0?'plot_0':family?`${family}_${level}`:fallback):(SPECIAL_MODELS[tile.special?.type]||fallback);
  const themedSpecial=!tile.lot&&['compact','expansion'].includes(data.mapId)&&shared!=='junction_hub';
  const desired=themedSpecial?`${data.mapId}_${shared}`:shared;
  const key=modelLibrary.has(desired)?desired:modelLibrary.has(shared)?shared:fallback;
  return {family,desired,key,source:modelLibrary.get(key),authored:authoredModels.has(key),level};
}
function lotModelRotation(view){return view.mapId==='classic'?(view.d>view.w?Math.PI/2:0):(view.readableRotation??view.boundary.rotation);}
function createLotModel(tile,data,level,view=null){
  const asset=resolveAsset(tile,data,level);let model;
  if(asset.source){
    if(asset.authored)model=cloneAuthoredModel(asset.source);
    else model=cloneModel(asset.source,tile.lot?.isLarge?1.15:1.055,tile.lot?.theme?.key==='tower'?1.85:1.45);
  }else{
    model=new THREE.Group();
    if(tile.lot)proceduralBuilding(model,tile.lot.theme?.key||'villa',level);
    else proceduralSpecial(model,tile.isStart?'city_hall':tile.special?.type||'card_station');
  }
  if(view){
    model.userData.cityBaseRotationY=model.rotation.y;
    model.rotation.y+=lotModelRotation(view);
    const setback=inward(view.group.position).multiplyScalar(-.10);
    model.position.x+=setback.x;model.position.z+=setback.z;
  }
  return {model,asset};
}
function calculateEnvelope(source){
  // Measure original individual parts before batching materials. A thin spire
  // must not inflate the framing box of the entire wide podium.
  const copy=source.clone(true);copy.position.set(0,0,0);copy.updateMatrixWorld(true);
  const pieces=[];const bounds=new THREE.Box3();
  copy.traverse((child)=>{if(child.isMesh){const box=new THREE.Box3().setFromObject(child);pieces.push(box);bounds.union(box);}});
  const limits=[0,.65,1.25,2.2,3.2,Math.max(4.3,bounds.max.y+.05)];const boxes=[];
  for(let i=0;i<limits.length-1;i++){
    const band=new THREE.Box3();
    pieces.forEach((box)=>{if(box.max.y>=limits[i]&&box.min.y<=limits[i+1])band.union(new THREE.Box3(new THREE.Vector3(box.min.x,Math.max(box.min.y,limits[i]),box.min.z),new THREE.Vector3(box.max.x,Math.min(box.max.y,limits[i+1]),box.max.z)));});
    if(!band.isEmpty())boxes.push(band);
  }
  return {bounds,boxes};
}
function optimizeModel(source) {
  // The editable Blender kit contains individual windows, trim and shingles.
  // Batch those static details by material once, keeping the browser draw count low.
  const object=source.clone(true);object.position.set(0,0,0);object.updateMatrixWorld(true);
  const batches=new Map();const result=new THREE.Group();result.name=source.name;
  const movingRoots=new Set();
  const isMoving=child=>child.name?.startsWith('life_')||Boolean(child.userData?.lifePart);
  object.traverse(child=>{
    if(child===object||!isMoving(child))return;
    let parent=child.parent;while(parent&&parent!==object){if(isMoving(parent))return;parent=parent.parent;}
    movingRoots.add(child);
    const copy=child.clone(true);child.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);
    copy.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;modelResources.add(part.geometry);}});
    result.add(copy);
  });
  object.traverse((child)=>{
    if(!child.isMesh)return;
    let parent=child;while(parent&&parent!==object){if(movingRoots.has(parent))return;parent=parent.parent;}
    if(Array.isArray(child.material)){const copy=child.clone();child.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);copy.castShadow=true;copy.receiveShadow=true;modelResources.add(copy.geometry);result.add(copy);return;}
    const key=child.material.uuid;
    if(!batches.has(key))batches.set(key,{material:child.material,geometries:[]});
    const geometry=child.geometry.clone();geometry.applyMatrix4(child.matrixWorld);
    batches.get(key).geometries.push(geometry);
  });
  batches.forEach(({material,geometries})=>{
    const merged=mergeGeometries(geometries,false);
    if(merged){modelResources.add(merged);const item=new THREE.Mesh(merged,material);item.castShadow=true;item.receiveShadow=true;result.add(item);geometries.forEach((g)=>g.dispose());}
    else geometries.forEach((g)=>{modelResources.add(g);result.add(new THREE.Mesh(g,material));});
  });
  return result;
}
function saleSign(parent) {
  box(parent,.55,.025,.40,'#d6c8a8',0,.025);
  for (const x of [-.16,.16]) box(parent,.025,.28,.025,PALETTE.dark,x,.16,.03);
  box(parent,.48,.20,.035,PALETTE.cream,0,.32,.03);
  const coin=mesh(new THREE.CircleGeometry(.062,20),PALETTE.gold,parent,0,.33,.05); coin.castShadow=false;
  for(const x of [-.34,.34]) for(const z of [-.26,.26]) box(parent,.035,.07,.035,'#f3ede0',x,.035,z);
}
function proceduralBuilding(parent, theme, level) {
  if (!level) { saleSign(parent); return; }
  const height=.27+level*.28, roof=theme==='shop'||theme==='tower'?PALETTE.teal:theme==='hotel'?'#ba806d':PALETTE.roof;
  const wall=theme==='hotel'?'#e7c1a5':theme==='tower'?'#c5d7d1':PALETTE.cream;
  const w=theme==='tower'?.65:.86, d=.70;
  box(parent,w+.10,.065,d+.10,'#ddcfb7');
  box(parent,w,height,d,wall,0,.065+height/2);
  for(let floor=0;floor<level;floor++) {
    const y=.21+floor*.28;
    for(let col=0;col<3;col++) {
      box(parent,.12,.13,.015,PALETTE.dark,(col-1)*.23,y,d/2+.012);
      box(parent,.15,.025,.03,'#f9efd9',(col-1)*.23,y-.078,d/2+.026);
      box(parent,.015,.13,.13,PALETTE.dark,w/2+.012,y,(col-1)*.21);
    }
    box(parent,w+.03,.035,d+.03,'#fbf2df',0,.34+floor*.28);
  }
  box(parent,.17,.24,.025,PALETTE.dark,0,.19,d/2+.026);
  if(theme==='villa'||theme==='hotel') {
    const roofMesh=mesh(new THREE.CylinderGeometry(.0,.62,.28,4),roof,parent,0,height+.2,0); roofMesh.rotation.y=Math.PI/4; roofMesh.scale.z=.87;
    box(parent,.09,.23,.1,wall,-.22,height+.25,-.13);
  } else {
    box(parent,w+.12,.07,d+.12,roof,0,height+.10);
    box(parent,w*.7,.10,d*.68,wall,0,height+.18);
    if(theme==='tower'){box(parent,.20,.28,.25,roof,0,height+.36);cylinder(parent,.014,.30,PALETTE.gold,0,height+.63,0,8);}
    if(theme==='shop')for(let i=0;i<6;i++)box(parent,.15,.055,.21,i%2?PALETTE.cream:roof,(i-2.5)*.15,.39,d/2+.10);
  }
  tree(parent,-.50,-.19,.56);
}
function proceduralSpecial(parent, type) {
  if(type==='city_hall'||type==='bank'){
    box(parent,.98,.11,.76,PALETTE.cream); box(parent,.80,.42,.60,'#e9dbbb',0,.29);
    for(let i=0;i<4;i++)cylinder(parent,.048,.40,PALETTE.cream,(i-1.5)*.21,.3,.34,12);
    const roof=mesh(new THREE.CylinderGeometry(0,.68,.23,4),PALETTE.teal,parent,0,.62,0);roof.rotation.y=Math.PI/4;roof.scale.z=.82;
    if(type==='city_hall'){cylinder(parent,.015,.35,PALETTE.gold,0,.90,0,8);box(parent,.18,.11,.015,PALETTE.roof,.08,1,0);}
    else {const coin=mesh(new THREE.CylinderGeometry(.16,.16,.065,24),PALETTE.gold,parent,0,.87,0);coin.rotation.x=Math.PI/2;}
  } else if(type==='construction') {
    box(parent,.65,.37,.56,PALETTE.cream);box(parent,.74,.075,.65,PALETTE.gold,0,.42);
    box(parent,.065,.95,.065,PALETTE.gold,-.37,.5,-.25);box(parent,.9,.055,.055,PALETTE.gold,-.1,.97,-.25);
    box(parent,.015,.30,.015,PALETTE.dark,.29,.80,-.25);box(parent,.12,.08,.10,PALETTE.gold,.29,.63,-.25);
  }else{
    cylinder(parent,.43,.09,PALETTE.cream);cylinder(parent,.35,.065,PALETTE.teal,0,.12);
    const g=new THREE.Group();parent.add(g);g.position.y=.46;g.rotation.set(-.15,Math.PI/7,-.15);
    box(g,.38,.52,.09,'#fcf1d6',0,0);box(g,.28,.4,.012,type==='teleport'||type==='junction'?PALETTE.teal:'#bb8f68',0,0,.052);
    mesh(new THREE.OctahedronGeometry(.105,0),PALETTE.gold,g,0,.04,.075);
    lamp(parent,-.43,.2);tree(parent,.43,-.23,.61);
  }
}
function updateLot(view,tile,data,initial=false) {
  view.tile=tile;
  const owner=data.players.find((p)=>p.id===tile.lot?.ownerId);
  const color=owner?.id==='human'?'#348d87':owner?.id==='ai'?'#d77b59':'#c5b696';
  view.ownerMaterial.color.set(color);view.ownerFrame.visible=Boolean(owner);view.flag.visible=Boolean(owner);
  const level=tile.lot?.level||0;
  const asset=resolveAsset(tile,data,level);
  const modelName=asset.desired;
  const signature=`${modelName}:${asset.key}:${Boolean(asset.source)}`;
  if(view.signature!==signature){
    view.building.clear(); view.signature=signature;view.modelName=modelName;
    view.building.add(createLotModel(tile,data,level,view).model);
    view.label.dataset.modelKey=asset.desired;view.label.dataset.loadedModel=asset.key;
    if(!initial){view.born=performance.now();view.building.scale.y=reducedMotion.matches?1:.78;effect({type:'upgrade',tiles:[tile.index]});}
  }
  if(tile.lot&&level===0&&owner)view.building.visible=false;else view.building.visible=true;
  const meta=view.label.querySelector('.scene-tile-meta');
  if(tile.lot){
    const rent=data.rents?.[tile.index]??tile.lot.tolls?.[level]??0;
    meta.textContent=owner?`${owner.id==='human'?'你':'对手'} · Lv.${level} · ¥${rent}`:level>0?`Lv.${level}待售 · 买下即用 · ¥${tile.lot.price}`:`空地待售 ¥${tile.lot.price}`;
    view.label.style.setProperty('--owner-color',owner?color:'#b8ab90');
    view.label.dataset.owner=owner?.id||'none';
    view.label.dataset.rent=String(rent);
    view.label.dataset.level=String(level);view.label.classList.toggle('is-built-for-sale',!owner&&level>0);
    view.label.querySelector('.scene-tile-name').dataset.level=String(level);
  }else {meta.textContent=tile.isStart?'起点 · 征用':tile.special?.label||'城市事件';view.label.style.setProperty('--owner-color','#ab9569');}
  view.label.title=`第 ${tile.index+1} 格 · ${tile.name}${tile.lot?.isLarge?' · 双格地产':''} · ${meta.textContent}`;
  view.label.setAttribute('aria-label',view.label.title);
  view.label.classList.toggle('is-landmark',Boolean(tile.lot?.isLarge));
}
function makePawn(player) {
  const g=new THREE.Group(); world.add(g);
  const color=player.id==='human'?'#318d88':'#d67c59';
  cylinder(g,.20,.07,PALETTE.cream,0,.035);
  cylinder(g,.145,.15,color,0,.13);
  mesh(new THREE.SphereGeometry(.145,20,14),color,g,0,.29,0);
  const face=mesh(new THREE.SphereGeometry(.108,20,14), '#f5d9b0', g,0,.315,.071);face.scale.z=.68;
  for(const x of [-.035,.035])mesh(new THREE.SphereGeometry(.012,8,6),PALETTE.dark,g,x,.337,.145);
  if(player.id==='human'){cylinder(g,.17,.045,PALETTE.teal,0,.43,0);cylinder(g,.12,.08,PALETTE.teal,0,.49,0);}
  else{mesh(new THREE.SphereGeometry(.16,20,10),PALETTE.roof,g,0,.419,-.008).scale.y=.4;box(g,.15,.025,.09,PALETTE.roof,0,.413,.135);}
  const shield=mesh(new THREE.SphereGeometry(.36,24,16),own(new THREE.MeshStandardMaterial({color:'#a4ede0',emissive:'#5bcab9',emissiveIntensity:.15,transparent:true,opacity:.16,roughness:.12,metalness:.25,depthWrite:false})),g,0,.26,0);
  shield.visible=false;
  const anchor=document.createElement('span');anchor.className=`scene-pawn-anchor pawn-${player.id}`;anchor.dataset.playerAnchor=player.id;
  anchor.textContent=player.id==='human'?'你':'对手';labels.appendChild(anchor);
  const pos=pawnPosition(player);g.position.copy(pos);
  pawnViews.set(player.id,{group:g,anchor,shield,position:player.position,from:pos.clone(),target:pos.clone(),started:0,duration:220,active:false,teleport:false});
}
function pawnPosition(player){
  const step=stepViews.get(player.position)||stepViews.values().next().value;
  const pos=step.walk.clone();pos.y=.235;
  if(snapshot?.mapId==='classic'){pos.x+=player.id==='human'?-.15:.15;pos.z+=player.id==='human'?.04:-.04;}
  else{
    const normal=inward(step.center),tangent=new THREE.Vector3(normal.z,0,-normal.x);
    pos.add(tangent.multiplyScalar(player.id==='human'?-.20:.20)).add(normal.multiplyScalar(.045));
  }
  return pos;
}
function update(data){
  if(inspection&&inspection.sessionId!==data?.sessionId)closeInspection();
  snapshot=data;if(!data?.board?.length||!mount())return;
  const key=`${data.sessionId}:${data.mapId}:${data.board.length}`;
  if(key!==mapKey){resetCameraView();cameraView.facingYaw=null;mapKey=key;buildMap(data);}
  if(data.selectedTile!==undefined){
    selectedIndex=data.selectedTile;
    labels.querySelectorAll('.scene-tile').forEach((node)=>node.classList.toggle('is-selected',Number(node.dataset.sceneTileIndex)===selectedIndex));
  }
  data.board.filter((tile)=>!tile.isLargeSecondary).forEach((tile)=>{const view=lotViews.get(tile.index);if(view)updateLot(view,tile,data);});
  data.players.forEach((player)=>{
    const view=pawnViews.get(player.id);if(!view)return;
    if(view.position!==player.position){
      view.from.copy(view.group.position);view.target.copy(pawnPosition(player));view.position=player.position;view.started=performance.now();
      view.teleport=view.from.distanceTo(view.target)>STEP*2.2;view.duration=reducedMotion.matches?0:view.teleport?470:190;view.active=true;
    }
    view.shield.visible=Boolean(player.effects?.shield||player.effects?.shieldCharges||player.effects?.rentShield);
    view.anchor.classList.toggle('is-current',data.currentPlayerId===player.id);
    if(data.mapId!=='classic')view.anchor.textContent=`${player.id==='human'?'你':'对手'} · ${String(player.position+1).padStart(2,'0')}`;
    view.anchor.title=`${player.name}当前位于第 ${player.position+1} 格 · ${data.board[player.position]?.name||''}`;
  });
  const current=data.players.find((player)=>player.id===data.currentPlayerId);
  stepViews.forEach((step,index)=>{
    const landed=index===data.animation?.landedTile,moving=index===data.animation?.currentTile;
    const standing=data.mapId!=='classic'&&index===current?.position;
    step.ring.material.opacity=(landed||moving) ? .85 : standing ? .70 : 0;
    step.ring.material.color.set(landed||moving?'#e6b253':current?.id==='ai'?'#d77b59':'#348d87');
  });
  sceneLife?.update(data);syncCameraControls();
  renderer.render(scene,camera);document.body.classList.add('scene-ready');api.ready=true;
  arrangeLabels();positionLabels();loadModelKit();
}
function effect(event={}){
  sceneLife?.effect(event);
  const now=performance.now();
  renderDirty=true;
  const color=event.type==='select'?'#efcc79':/shield/.test(event.type)?'#88d8c6':/seize|confisc|takeover|征用/.test(event.type)?'#d78560':/rent/.test(event.type)?'#e6bd64':'#87bdb0';
  const affected=new Set();
  (event.tiles||[]).forEach((entry,i)=>{
    const index=Number(typeof entry==='object'?entry.index:entry);
    const primary=snapshot?.board.find((tile)=>tile.index===index)?.largePrimaryIndex;
    const view=lotViews.get(primary??index);if(!view)return;
    if(affected.has(view))return;affected.add(view);
    // One pulse owns each outer frame, even when both steps of a large lot
    // occur in the event or a fresh event replaces a selection highlight.
    for(let n=pulses.length-1;n>=0;n--)if(pulses[n].view===view)pulses.splice(n,1);
    view.outline.material.color.set(color);
    pulses.push({view,started:now+i*(reducedMotion.matches?0:110),duration:reducedMotion.matches?400:1600,type:event.type});
    view.label.classList.remove('is-event');void view.label.offsetWidth;view.label.classList.add('is-event');
  });
  if(event.type==='shield'){
    const pawn=pawnViews.get(event.fromId||event.playerId||snapshot?.currentPlayerId);
    if(pawn){pawn.shield.visible=true;pawn.shieldUntil=now+1300;}
  }
}
function project(point){projection.copy(point).project(camera);return{x:(projection.x*.5+.5)*width,y:(-.5*projection.y+.5)*height};}
function projectTile(index){const step=stepViews.get(Number(index));return step&&camera?project(step.center):null;}
function arrangeLabels(){
  if(!camera)return;
  const placed=[];
  const candidates=[...lotViews.values()].map((view)=>{
    const point=project(view.anchor),visible=point.x>=10&&point.x<=width-10&&point.y>=8&&point.y<=height-8;
    view.label.hidden=!visible;
    const hovered=!cameraGesture.dragged&&view.label.matches(':hover');
    return {view,visible,hovered,point:hovered&&view.screenPoint?{...view.screenPoint}:point,w:view.label.offsetWidth,h:view.label.offsetHeight};
  }).filter(item=>item.visible).sort((a,b)=>Number(b.hovered)-Number(a.hovered)||a.point.y-b.point.y);
  const offsets=[];
  for(let x=-7;x<=7;x++)for(let y=-7;y<=7;y++)offsets.push({x:x*7,y:y*7,d:x*x+y*y});
  offsets.sort((a,b)=>a.d-b.d||Math.abs(a.x)-Math.abs(b.x));
  candidates.forEach((item)=>{
    const original={...item.point};let best=null;
    for(const offset of offsets){
      const point={x:THREE.MathUtils.clamp(original.x+offset.x,item.w/2+5,width-item.w/2-5),y:THREE.MathUtils.clamp(original.y+offset.y,item.h/2+5,height-item.h/2-7)};
      let overlap=0;
      for(const prev of placed){
        const ox=(item.w+prev.w)/2+3-Math.abs(point.x-prev.point.x);
        const oy=(item.h+prev.h)/2+3-Math.abs(point.y-prev.point.y);
        if(ox>0&&oy>0)overlap+=ox*oy;
      }
      const cost=overlap*10000+(point.x-original.x)**2+(point.y-original.y)**2;
      if(!best||cost<best.cost)best={point,cost};
      if(overlap===0){best={point,cost};break;}
    }
    item.point=best.point;
    item.view.screenPoint=item.point;placed.push(item);
  });
}
function positionLabels(){
  if(!camera)return;
  lotViews.forEach((view)=>{const p=view.screenPoint||project(view.anchor);view.label.style.transform=`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`;});
  stepViews.forEach((step)=>{if(step.label){const p=project(step.walk);step.label.hidden=p.x<8||p.x>width-8||p.y<8||p.y>height-8;step.label.style.transform=`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`;}});
  pawnViews.forEach((view)=>{const p=project(view.group.position.clone().add(new THREE.Vector3(0,.76,0)));view.anchor.hidden=p.x<12||p.x>width-12||p.y<8||p.y>height-8;view.anchor.style.transform=`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`;});
  if(travelArrow){
    const current=snapshot.players.find((player)=>player.id===snapshot.currentPlayerId);
    const route=current?.effects?.reversed?snapshot.navigation?.prev:snapshot.navigation?.next;
    const next=route?.[current?.position],from=stepViews.get(current?.position),to=stepViews.get(next);
    travelArrow.hidden=!from||!to||Boolean(snapshot.gameOver);
    if(from&&to){
      const a=project(from.walk),b=project(to.walk),x=a.x+(b.x-a.x)*.60,y=a.y+(b.y-a.y)*.60;
      travelArrow.hidden=travelArrow.hidden||x<15||x>width-15||y<12||y>height-12;
      travelArrow.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) rotate(${Math.atan2(b.y-a.y,b.x-a.x)}rad)`;
      travelArrow.dataset.player=current.id;travelArrow.dataset.from=String(current.position);travelArrow.dataset.next=String(next);
      travelArrow.setAttribute('aria-label',`${current.id==='human'?'你':'对手'}${current.effects?.reversed?'逆行':''}下一步：第 ${next+1} 格 ${snapshot.board[next]?.name||''}`);
    }
  }
}
function framingForLot(view){
  const asset=resolveAsset(view.tile,snapshot,view.tile.lot?3:0);
  const envelope=assetEnvelopes.get(asset.desired);
  const rotation=new THREE.Matrix4().makeRotationY(lotModelRotation(view));
  const offset=inward(view.group.position).multiplyScalar(-.10).add(view.group.position);offset.y+=.05;
  const boxes=envelope?.boxes||(
    asset.family==='skyscraper'?[
      new THREE.Box3(new THREE.Vector3(-1.12,0,-.47),new THREE.Vector3(1.12,.8,.47)),
      new THREE.Box3(new THREE.Vector3(-.47,.8,-.40),new THREE.Vector3(.47,3.2,.40)),
      new THREE.Box3(new THREE.Vector3(-.20,3.2,-.20),new THREE.Vector3(.20,4.05,.20)),
    ]:asset.family==='finance'?[new THREE.Box3(new THREE.Vector3(-1.12,0,-.47),new THREE.Vector3(1.12,.65,.47)),new THREE.Box3(new THREE.Vector3(-.76,.65,-.40),new THREE.Vector3(.76,2.85,.40))]:
    asset.family==='onsen'?[new THREE.Box3(new THREE.Vector3(-1.35,0,-.50),new THREE.Vector3(1.35,1.40,.50))]:
    [new THREE.Box3(new THREE.Vector3(-.61,0,-.53),new THREE.Vector3(.61,view.tile.lot?(view.tile.lot.theme?.key==='tower'?1.95:1.52):1.75,.53))]
  );
  return boxes.map((box)=>box.clone().applyMatrix4(rotation).translate(offset));
}
function resize(){
  if(!renderer||!wrap)return;
  const rect=wrap.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
  if(rendererWidth!==width||rendererHeight!==height){renderer.setSize(width,height,false);rendererWidth=width;rendererHeight=height;}
  labels.classList.toggle('scene-labels-compact',width<720);
  labels.classList.toggle('scene-labels-tiny',width<460);
  if(boardBounds){
    // A wide game canvas needs a more frontal view; a portrait canvas keeps the
    // familiar high three-quarter miniature view. The route itself never moves.
    const aspect=width/height;
    const wide=THREE.MathUtils.clamp((aspect-1.05)/.85,0,1);
    let yaw=THREE.MathUtils.lerp(.65,.10,wide);
    let elevation=THREE.MathUtils.lerp(.91,.62,wide);
    if(snapshot?.mapId==='expansion'){
      // Turn toward the long side on a phone: the 28-step rectangle then uses
      // the available height instead of squeezing ten buildings across 390px.
      const portrait=THREE.MathUtils.clamp((1.40-aspect)/.65,0,1);
      yaw=THREE.MathUtils.lerp(.10,-1.47,portrait);elevation=THREE.MathUtils.lerp(.62,.93,portrait);
    }
    if(cameraView.facingYaw===null)cameraView.facingYaw=yaw;
    if(cameraView.modified){yaw=cameraView.yaw;elevation=cameraView.elevation;}
    else{cameraView.yaw=yaw;cameraView.elevation=elevation;}
    camera.position.set(Math.sin(yaw)*22,Math.tan(elevation)*22,Math.cos(yaw)*22);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
    if(snapshot?.mapId!=='classic')lotViews.forEach((view)=>{
      // Choose a readable initial frontage once. Buildings remain physical
      // objects when the player rotates the camera, never facing billboards.
      if(view.readableRotation===undefined&&['chance','card_draw','bank','rush','teleport'].includes(view.tile.special?.type)){
        view.readableRotation=Math.round(cameraView.facingYaw/(Math.PI/2))*(Math.PI/2);
        view.building?.children.forEach((model)=>{model.rotation.y=(model.userData.cityBaseRotationY||0)+view.readableRotation;});
      }
      const normal=view.boundary.normal.clone();
      if(normal.x*Math.sin(yaw)+normal.z*Math.cos(yaw)<0)normal.negate();
      const depth=Math.abs(normal.x)>.5?view.w:view.d;
      view.anchor.copy(view.group.position).add(normal.multiplyScalar(depth/2+.26));view.anchor.y=.07;
    });
    camera.left=-1;camera.right=1;camera.top=1;camera.bottom=-1;camera.updateProjectionMatrix();
    const xs=[],ys=[];
    const include=(point)=>{const p=point.clone().project(camera);xs.push(p.x);ys.push(p.y);};
    for(const x of [-boardBounds.w/2-.66,boardBounds.w/2+.66])for(const z of [-boardBounds.d/2-.66,boardBounds.d/2+.66])for(const y of [-.44,.1])include(new THREE.Vector3(x,y,z));
    lotViews.forEach((view)=>{
      // Reserve full-level silhouettes at their real locations for a stable
      // camera across upgrades, while keeping podiums and spires separate.
      framingForLot(view).forEach((box)=>{for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])include(new THREE.Vector3(x,y,z));});
      include(view.anchor);
    });
    const spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys);
    const vertical=Math.max(spanY/2*height/Math.max(1,height-30),spanX/(2*aspect)*width/Math.max(1,width-30))/cameraView.zoom;
    const centerY=(Math.max(...ys)+Math.min(...ys))/2;
    const centerX=(Math.max(...xs)+Math.min(...xs))/2;
    camera.left=centerX-vertical*aspect;camera.right=centerX+vertical*aspect;camera.top=vertical+centerY;camera.bottom=-vertical+centerY;camera.updateProjectionMatrix();
  }
  lotViews.forEach(view=>{view.screenPoint=null;});
  arrangeLabels();positionLabels();
  syncCameraControls();
  renderDirty=true;
}
function inspectTile(index,level){
  let tile=snapshot?.board?.find((item)=>item.index===Number(index));
  if(!tile)return false;
  if(tile.isLargeSecondary)tile=snapshot.board[tile.largePrimaryIndex];
  cancelCameraGesture();
  closeInspection();
  const dialog=document.createElement('dialog');dialog.id='city-building-inspection';dialog.className='city-model-dialog';dialog.setAttribute('aria-labelledby','city-model-title');
  dialog.innerHTML=`<header class="city-model-header"><div><p class="city-model-eyebrow">${tile.lot?'建造预览':'地标近看'}</p><h2 id="city-model-title"></h2></div><button type="button" class="city-model-close" data-model-close aria-label="关闭近看">✕</button></header><div class="city-model-stage"><div class="city-model-canvas"></div><span class="city-model-level-badge"></span><p class="city-model-hint">拖动转一转 · 看看每一面</p></div><footer class="city-model-footer"><div class="city-model-levels" role="group" aria-label="预览建筑等级"><button type="button" data-model-level="1">Lv.1</button><button type="button" data-model-level="2">Lv.2</button><button type="button" data-model-level="3">Lv.3</button></div><div class="city-model-view-tools" role="group" aria-label="调整建筑视角"><button type="button" data-model-turn="-1" aria-label="向左转动建筑">↶</button><button type="button" data-model-turn="1" aria-label="向右转动建筑">↷</button><span></span><button type="button" data-model-zoom="-1" aria-label="缩小建筑">−</button><button type="button" data-model-zoom="1" aria-label="放大建筑">＋</button><button type="button" data-model-reset>恢复视角</button></div><p class="city-model-disclaimer">${tile.lot?'这里可以看看升级后的样子，不改变当前对局。':'拖动或缩放，看看这座城市地标的细节。'}</p></footer>`;
  const returnFocus=document.activeElement;
  document.body.appendChild(dialog);document.body.classList.add('city-inspection-open');
  const requestedLevel=Number(level??(tile.lot?.level||3));
  const state={dialog,tile,mapId:snapshot.mapId,sessionId:snapshot.sessionId,level:tile.lot?THREE.MathUtils.clamp(Number.isFinite(requestedLevel)?Math.round(requestedLevel):3,1,3):0,returnFocus,renderer:null,scene:null,camera:null,pivot:null,environment:null,observer:null,resources:[],angle:0,zoom:1,elevation:.78,bounds:null,drag:null};
  inspection=state;
  syncCameraControls();
  dialog.querySelector('#city-model-title').textContent=tile.name;
  dialog.querySelector('.city-model-levels').hidden=!tile.lot;
  dialog.addEventListener('cancel',(event)=>{event.preventDefault();event.stopPropagation();closeInspection();});
  dialog.addEventListener('click',(event)=>{
    event.stopPropagation();
    if(event.target===dialog||event.target.closest('[data-model-close]')){closeInspection();return;}
    const selectedLevel=event.target.closest('[data-model-level]');
    if(selectedLevel){state.level=Number(selectedLevel.dataset.modelLevel);renderInspectionModel();return;}
    const turn=event.target.closest('[data-model-turn]');
    if(turn){state.angle+=Number(turn.dataset.modelTurn)*Math.PI/6;renderInspection();return;}
    const zoom=event.target.closest('[data-model-zoom]');
    if(zoom){state.zoom=THREE.MathUtils.clamp(state.zoom+Number(zoom.dataset.modelZoom)*.18,.75,1.8);renderInspection();return;}
    if(event.target.closest('[data-model-reset]')){state.angle=0;state.zoom=1;state.elevation=state.bounds?.max.y>2.5?.57:.78;renderInspection();}
  });
  dialog.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeInspection();}
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();state.angle+=(event.key==='ArrowLeft'?-1:1)*Math.PI/12;renderInspection();}
  });
  dialog.showModal();
  try{
    state.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
    state.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));state.renderer.shadowMap.enabled=true;state.renderer.shadowMap.type=THREE.PCFShadowMap;
    state.renderer.outputColorSpace=THREE.SRGBColorSpace;state.renderer.toneMapping=THREE.ACESFilmicToneMapping;state.renderer.toneMappingExposure=.96;
    const canvasWrap=dialog.querySelector('.city-model-canvas');canvasWrap.appendChild(state.renderer.domElement);
    state.scene=new THREE.Scene();state.camera=new THREE.OrthographicCamera(-3,3,3,-3,.1,80);state.pivot=new THREE.Group();state.scene.add(state.pivot);
    state.environment=makeStudioEnvironment(state.renderer);state.scene.environment=state.environment.texture;state.scene.environmentIntensity=.4;
    state.scene.add(new THREE.HemisphereLight('#fff8e7','#a7c1b6',.8));
    const sun=new THREE.DirectionalLight('#fff0d8',2.4);sun.position.set(-5,10,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-5;sun.shadow.camera.right=5;sun.shadow.camera.top=7;sun.shadow.camera.bottom=-5;sun.shadow.camera.far=30;sun.shadow.radius=4;sun.shadow.normalBias=.008;sun.shadow.bias=-.00005;state.scene.add(sun);
    const rim=new THREE.DirectionalLight('#d9f5ed',.6);rim.position.set(6,6,-4);state.scene.add(rim);
    const floorGeometry=new THREE.PlaneGeometry(60,60),floorMaterial=new THREE.MeshStandardMaterial({color:'#e8e3d7',roughness:1});
    state.resources.push(floorGeometry,floorMaterial);const floor=new THREE.Mesh(floorGeometry,floorMaterial);floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;state.scene.add(floor);
    state.renderer.domElement.addEventListener('pointerdown',(event)=>{event.preventDefault();state.drag={id:event.pointerId,x:event.clientX,y:event.clientY,angle:state.angle,elevation:state.elevation};state.renderer.domElement.setPointerCapture(event.pointerId);});
    state.renderer.domElement.addEventListener('pointermove',(event)=>{if(!state.drag||event.pointerId!==state.drag.id)return;state.angle=state.drag.angle+(event.clientX-state.drag.x)*.009;state.elevation=THREE.MathUtils.clamp(state.drag.elevation+(event.clientY-state.drag.y)*.005,.30,1.12);renderInspection();});
    const endDrag=()=>{state.drag=null;};state.renderer.domElement.addEventListener('pointerup',endDrag);state.renderer.domElement.addEventListener('pointercancel',endDrag);
    state.observer=new ResizeObserver(()=>renderInspection());state.observer.observe(canvasWrap);
    renderInspectionModel();
    dialog.querySelector('[data-model-close]').focus({preventScroll:true});
    if(loadedBundles.size<ASSET_BUNDLES.length)void loadModelKit(true);
    return true;
  }catch(error){
    console.warn('The building preview could not start.',error);
    dialog.querySelector('.city-model-canvas').innerHTML='<p class="city-model-unavailable">暂时无法打开建筑预览，可以关闭后继续对局。</p>';
    return false;
  }
}
function renderInspectionModel(){
  const state=inspection;if(!state?.renderer||!state.pivot)return;
  state.pivot.clear();
  const data={mapId:state.mapId};const current=createLotModel(state.tile,data,state.level);
  state.pivot.add(current.model);
  const highest=createLotModel(state.tile,data,state.tile.lot?3:0).model;highest.updateMatrixWorld(true);
  state.bounds=new THREE.Box3().setFromObject(highest);
  state.elevation=state.bounds.max.y>2.5?.57:.78;
  state.dialog.dataset.tileIndex=String(state.tile.index);state.dialog.dataset.modelKey=current.asset.desired;state.dialog.dataset.loadedModel=current.asset.key;state.dialog.dataset.level=String(state.level);
  state.dialog.querySelector('.city-model-level-badge').textContent=state.tile.lot?`Lv.${state.level}${state.level===3?' · 满级':''}`:'城市地标';
  state.dialog.querySelectorAll('[data-model-level]').forEach((button)=>{const selected=Number(button.dataset.modelLevel)===state.level;button.classList.toggle('is-active',selected);button.setAttribute('aria-pressed',String(selected));});
  renderInspection();
}
function renderInspection(){
  const state=inspection;if(!state?.renderer||!state.bounds)return;
  const area=state.dialog.querySelector('.city-model-canvas').getBoundingClientRect();if(area.width<1||area.height<1)return;
  state.renderer.setSize(area.width,area.height,false);state.pivot.rotation.y=state.angle;
  const centerY=(state.bounds.min.y+state.bounds.max.y)*.46;
  state.camera.position.set(5.8,centerY+Math.tan(state.elevation)*10,8.15);state.camera.lookAt(0,centerY,0);state.camera.updateMatrixWorld(true);
  state.camera.left=-1;state.camera.right=1;state.camera.top=1;state.camera.bottom=-1;state.camera.updateProjectionMatrix();
  const rot=new THREE.Matrix4().makeRotationY(state.angle),points=[];
  // Every level uses the same full-level viewing frame, so changing Lv.1→Lv.3
  // reveals genuine growth instead of resizing each building to fill the picture.
  for(const x of [state.bounds.min.x-.14,state.bounds.max.x+.14])for(const y of [-.06,state.bounds.max.y+.08])for(const z of [state.bounds.min.z-.14,state.bounds.max.z+.14])points.push(new THREE.Vector3(x,y,z).applyMatrix4(rot).project(state.camera));
  const minX=Math.min(...points.map((p)=>p.x)),maxX=Math.max(...points.map((p)=>p.x));
  const minY=Math.min(...points.map((p)=>p.y)),maxY=Math.max(...points.map((p)=>p.y));
  const aspect=area.width/area.height,half=Math.max((maxY-minY)/2,(maxX-minX)/(2*aspect))*1.10/state.zoom;
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
  state.camera.left=cx-half*aspect;state.camera.right=cx+half*aspect;state.camera.top=cy+half;state.camera.bottom=cy-half;state.camera.updateProjectionMatrix();
  state.renderer.render(state.scene,state.camera);
}
function closeInspection(){
  const state=inspection;if(!state)return;inspection=null;
  state.observer?.disconnect();state.environment?.dispose();state.resources.forEach((resource)=>resource.dispose?.());state.renderer?.dispose();state.renderer?.forceContextLoss();
  if(state.dialog.open)state.dialog.close();state.dialog.remove();document.body.classList.remove('city-inspection-open');
  syncCameraControls();
  if(state.returnFocus?.isConnected)state.returnFocus.focus({preventScroll:true});
}
function tick(time){
  if(disposed)return;frame=requestAnimationFrame(tick);
  if(!snapshot||document.hidden||time-lastTime<24)return;
  const delta=Math.min(.1,(time-lastTime)/1000);lastTime=time;
  sceneLife?.setInteractionPaused(Boolean(inspection||cameraGesture.pointers.size));
  const living=sceneLife?.tick(time,delta);
  const moving=[...pawnViews.values()].some((view)=>view.active||view.shieldUntil)||[...lotViews.values()].some((view)=>view.born)||pulses.length;
  if(!moving&&!renderDirty&&!living)return;renderDirty=false;
  pawnViews.forEach((view)=>{
    if(view.active){
      const t=view.duration===0?1:Math.min(1,(time-view.started)/view.duration);
      if(view.teleport){
        if(t<.5){view.group.position.copy(view.from);view.group.scale.setScalar(1-t*1.8);}
        else{view.group.position.copy(view.target);view.group.scale.setScalar(.1+(t-.5)*1.8);}
        view.group.rotation.y=t*Math.PI*2;
      }else{const ease=t*t*(3-2*t);view.group.position.lerpVectors(view.from,view.target,ease);view.group.position.y+=Math.sin(t*Math.PI)*(reducedMotion.matches?0:.20);}
      if(t===1){view.active=false;view.group.position.copy(view.target);view.group.scale.setScalar(1);view.group.rotation.y=0;}
    }
    if(view.shieldUntil&&time>view.shieldUntil){view.shieldUntil=0;const p=snapshot.players.find((p)=>p.id===view.anchor.dataset.playerAnchor);view.shield.visible=Boolean(p?.effects?.shield);}
  });
  lotViews.forEach((view)=>{
    if(view.born){const t=Math.min(1,(time-view.born)/650);view.building.scale.y=reducedMotion.matches?1:1-Math.pow(1-t,3)*.22;if(t===1){view.born=0;view.building.scale.y=1;}}
  });
  for(let i=pulses.length-1;i>=0;i--){const pulse=pulses[i];const elapsed=time-pulse.started;if(elapsed<0)continue;const t=elapsed/pulse.duration;
    if(t>=1){pulse.view.outline.material.opacity=0;pulse.view.label.classList.remove('is-event');pulses.splice(i,1);continue;}
    pulse.view.outline.material.opacity=reducedMotion.matches?.45:Math.sin(t*Math.PI)*.83;
  }
  positionLabels();renderer.render(scene,camera);
}
async function loadModelKit(force=false){
  if(modelsLoading||(modelLoadStarted&&!force))return;modelLoadStarted=true;modelsLoading=true;
  const remaining=ASSET_BUNDLES.filter((bundle)=>force||!loadedBundles.has(bundle.file));
  const results=await Promise.allSettled(remaining.map(bundle=>new GLTFLoader().loadAsync(`./assets/models/${bundle.file}?v=20260912-21${force?`&refresh=${Date.now()}`:''}`)));
  // Fetch concurrently, register in declared order so animated replacements
  // consistently supersede their static fallback, regardless of network order.
  results.forEach((result,i)=>{
    const bundle=remaining[i];
    if(result.status==='rejected'){console.info(`The fallback city model remains available for ${bundle.file}.`,result.reason?.message);return;}
    const gltf=result.value;
    gltf.scene.traverse((object)=>{
      if(!bundle.pattern.test(object.name))return;
      if(bundle.authored){authoredModels.add(object.name);assetEnvelopes.set(object.name,calculateEnvelope(object));}
      modelLibrary.set(object.name,optimizeModel(object));
    });
    loadedBundles.add(bundle.file);
  });
  modelsLoading=false;
  if(snapshot){const saved=snapshot;buildMap(saved);update(saved);}
  if(inspection)renderInspectionModel();
  window.dispatchEvent(new CustomEvent('city:models-ready',{detail:{count:modelLibrary.size,bundles:[...loadedBundles]}}));
}
window.addEventListener('pagehide',()=>{disposed=true;closeInspection();cancelAnimationFrame(frame);observer?.disconnect();clearMap();modelResources.forEach((resource)=>resource.dispose());studioEnvironment?.dispose();renderer?.dispose();});
window.dispatchEvent(new CustomEvent('city:ready'));

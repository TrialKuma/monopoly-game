import * as THREE from './assets/vendor/three/three.module.min.js';
import { makeStudioEnvironment } from './scene-environment.js?v=20261025-facade2';
import { mergeGeometries } from './assets/vendor/three/addons/utils/BufferGeometryUtils.js';
import { createSceneLife } from './scene-life.js?v=20261027-night1';
import { createStreetFoundation } from './scene-streets.js?v=20261025-harbor-main-island1';
import { createHarborIslands, addHarborBridge, updateHarborProjectVisuals, tickHarborProjectVisuals } from './scene-harbor-islands.js?v=20261027-night1';
import { harborWalkOffset, harborEdgePath, harborParcelRotation, harborVisualPosition } from './scene-harbor-paths.js?v=20261025-harbor-main-island1';
import { harborLandmarkSpec } from './scene-harbor-landmarks.js?v=20261025-harbor-main-island1';
import { createRegionalPark } from './scene-regional-parks.js?v=20261027-night1';
import { createOwnershipRoofs } from './scene-ownership-roofs.js?v=20261025-items1';
import { createFunctionalLandmark } from './scene-functional-landmarks.js?v=20261025-items1';
import { createThermalSteam } from './scene-thermal-steam.js?v=20261025-facade2';
import { createLevelThreeTracker, createBuildingFireworks, buildingRoofAnchor } from './scene-fireworks.js?v=20261025-celebrate1';
import { loadSharedModelAsset, forgetSharedModelAsset, releaseSharedModelAsset, releaseSupersededModelAssets, ownsSharedModelResource, disposeSharedModelAssets } from './scene-model-cache.js?v=20261025-harbor1';

// All route positions, ownership and prices come from the game. This view never
// changes a rule or finishes an action; its animation is entirely cosmetic.
const STEP = 1.80;
const WALK_SETBACK = 1.04;
const SPECIAL_COLORS = { start:'#429faa', bank:'#d6ad48', construction:'#d49a43', card_draw:'#a482cd', chance:'#cc8cb4', teleport:'#54adc8', rush:'#78a369', junction:'#6e9daa' };
const PALETTE = { cream: '#f3ecdc', edge: '#d9cbb3', grass: '#bac8a6', green: '#6b947b', leaf: '#70947a', dark: '#254d48', roof: '#bc7155', teal: '#438b88', gold: '#d6ac61', path: '#eee5d5', water: '#8dc8c5' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const modelLibrary = new Map();
const authoredModels = new Set();
const assetEnvelopes = new Map();
const loadedBundles = new Set();
const modelPriorities = new Map();
const bundleRequests = new Map();
const failedBundles = new Set();
const modelResources = new Set();
const modelGeometryRegions = new WeakMap();
const obsoleteModelGeometry = new Set();
const installedModelSources = new Map();
const lotViews = new Map();
const pawnViews = new Map();
const stepViews = new Map();
const streetArrows = [];
const harborProjectBadges = new Map();
let harborSceneRoot = null;
const resources = new Set();
const materials = new Map();
const pulses = [];
let ownershipRoofs = null;
const roofController = () => ownershipRoofs ||= createOwnershipRoofs({THREE});
let scene, camera, renderer, world, labels, wrap, observer, frame = 0;
let snapshot = null, mapKey = '', lastTime = 0, width = 1, height = 1;
let rendererWidth = 0, rendererHeight = 0;
let boardBounds, light, ground, disposed = false, selectedIndex = null;
let assetRefreshFrame = 0, sceneryRefreshNeeded = false;
let renderDirty = false;
let inspection = null;
let studioEnvironment = null;
let travelArrow = null;
let sceneLife = null, cameraControls = null, timeMode = 'auto';
let streetFoundation=null;
let buildingFireworks=null, levelThreeTracker=null;
const pendingCelebrations=new Map();
let seasonMode = 'auto', weatherMode = 'auto', outskirtsVisible=true, lastAtmosphereReadout = 0;
const ATMOSPHERE_MODES = {
  time: { auto:'自然流转', dawn:'清晨', day:'白天', dusk:'夕照', night:'月夜' },
  season: { auto:'四季轮换', spring:'春日', summer:'盛夏', autumn:'金秋', winter:'冬日' },
  weather: { auto:'随季节', clear:'晴朗', rain:'下雨', snow:'飘雪' },
};
try {
  const saved = JSON.parse(localStorage.getItem('monopoly.city.atmosphere.v1') || '{}');
  if (Object.hasOwn(ATMOSPHERE_MODES.time,saved.time)) timeMode=saved.time;
  if (Object.hasOwn(ATMOSPHERE_MODES.season,saved.season)) seasonMode=saved.season;
  if (Object.hasOwn(ATMOSPHERE_MODES.weather,saved.weather)) weatherMode=saved.weather;
  if(typeof saved.outskirts==='boolean')outskirtsVisible=saved.outskirts;
} catch (_) { /* Private browsing can disable local preferences. */ }
let cameraView = { yaw:null, elevation:null, zoom:1, modified:false, facingYaw:null, mode:'local', following:true };
let propertyCameraView = null;
let routeCameraView = null;
const cameraFocus = new THREE.Vector3(0,.2,0);
let cameraFocusReady = false, lastLocalCamera = false;
let localFramingBias = 0;
let cameraBrowseTarget = null;
let followedPlayerId=null;
let cameraGesture = { pointers:new Map(), dragged:false, pinchDistance:0 };
let suppressSceneClickUntil = 0;
const CAMERA_LIMITS = { minZoom:.65, maxZoom:2.4, minElevation:.35, maxElevation:1.24 };
const LANDMARKS = { classic: { 5:'finance', 7:'skyscraper', 14:'onsen' }, compact: { 2:'finance', 11:'onsen' }, expansion: { 7:'skyscraper', 26:'onsen' } };
const SPECIAL_MODELS = { bank:'vault_bank',construction:'builders_guild',card_draw:'card_pavilion',chance:'card_pavilion',teleport:'teleport_gate',rush:'rush_station',junction:'junction_hub' };
const ASSET_BUNDLES = [
  {file:'city-kit.glb',version:'20260911-12',authored:false,pattern:/^(plot_0|tree|streetlamp|fountain)$/},
  ...['classic','compact','expansion','harbor','alpine'].map(mapId=>({file:`regions/${mapId}.glb`,mapId,version:'20261025-facade2',authored:true,pattern:new RegExp(`^${mapId}_(?:(?:villa|shop|hotel|tower|skyscraper|finance|onsen)_[123]|civic_hall|vault_bank|builders_guild|card_pavilion|chance_wheel|teleport_gate|rush_station|junction_hub)$`)})),
];
const projection = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const api = { update, effect, reset, projectTile, locateTile, inspectTile, closeInspection, resetView:()=>resetCameraView(true), setViewMode:setCameraMode, zoomBy:factor=>changeCameraView(0,0,factor), getView:()=>({...cameraView,local:isLocalCamera(),target:{x:cameraFocus.x,z:cameraFocus.z}}), setTimeMode:setCityTimeMode, getTimeMode:()=>sceneLife?.getTimeMode()||timeMode, setSeason:mode=>setCityClimate('season',mode), setWeather:mode=>setCityClimate('weather',mode), getAtmosphere:()=>sceneLife?.getAtmosphere(), refreshAssets:()=>loadModelKit(true), ready: false };
window.CityScene = api;
api.releaseInactiveAssets=()=>queueMicrotask(()=>retireInactiveModels(snapshot?.mapId));
api.getMovementDuration=id=>snapshot?.mapId==='harbor'&&pawnViews.get(id)?.duration?Math.ceil(pawnViews.get(id).duration)+32:0;
api.getCelebrationState=()=>({...buildingFireworks?.getState(),pending:pendingCelebrations.size});
api.getHarborProjectsState=()=>[...harborProjectBadges].map(([id,view])=>({id,stage:view.stage,points:view.points,visible:!view.button.hidden,screen:view.screenPoint||project(view.anchor)}));

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
function mount() {
  wrap = document.getElementById('city-canvas-wrap');
  labels = document.getElementById('city-labels');
  if (!wrap || !labels) return false;
  if (renderer) return true;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    rendererWidth=0;rendererHeight=0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
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
      const project=event.target.closest('[data-harbor-project]');
      if(project&&!isSuppressedSceneClick(event)){
        window.dispatchEvent(new CustomEvent('city:harbor-project',{detail:{id:project.dataset.harborProject}}));return;
      }
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
  if(snapshot?.targetSelection?.kind==='property'){
    const tile=snapshot.board.find(tile=>tile.index===index);
    index=tile?.isLargeSecondary?tile.largePrimaryIndex:index;
    if(!snapshot.targetSelection.indices.includes(index))return;
  }
  selectedIndex=index;
  labels.querySelectorAll('.scene-tile').forEach((node)=>node.classList.toggle('is-selected',Number(node.dataset.sceneTileIndex)===index));
  effect({type:'select',tiles:[index]});
  window.dispatchEvent(new CustomEvent('city:select',{detail:{index}}));
}
function canSelectScene(){
  const drama=document.getElementById('drama-layer');
  const modal=document.getElementById('event-overlay');
  return Boolean(snapshot&&!inspection&&snapshot.phase!=='presenting'&&(!drama||drama.hidden)&&(!modal?.classList.contains('visible')||snapshot.routeChoice||snapshot.targetSelection&&!snapshot.targetSelection.suspended));
}
function canMoveCamera(){return canSelectScene()&&(!document.getElementById('event-overlay')?.classList.contains('visible')||snapshot?.routeChoice||snapshot?.targetSelection?.kind==='property')&&!document.body.classList.contains('mode-start');}
function isSuppressedSceneClick(event){return event.detail!==0&&performance.now()<suppressSceneClickUntil;}
function isLocalCamera(){
  // Board-wide card and city-hall choices must keep every legal target visible.
  return cameraView.mode==='local'&&!snapshot?.targetSelection&&!document.body?.classList.contains('mode-start')&&!document.body?.classList.contains('mode-showcase')&&snapshot?.phase!=='preview';
}
function cameraSubject(){
  // Turn changes only change the destination, never the existing focus, angle
  // or zoom. The same easing carries the view between both players.
  return pawnViews.get(snapshot?.currentPlayerId)||pawnViews.get(snapshot?.players?.[0]?.id)||pawnViews.values().next().value;
}
function resetCameraView(apply=false){
  cameraBrowseTarget=null;
  cancelCameraGesture();cameraView={yaw:null,elevation:null,zoom:1,modified:false,facingYaw:cameraView.facingYaw,mode:apply?cameraView.mode:'local',following:true};
  // A new board starts at its pawn. Returning from an inspection eases back
  // from the current focus instead of jumping to a new point.
  if(!apply){cameraFocusReady=false;localFramingBias=0;}
  if(apply)resize();
}
function setCameraMode(mode){
  if(!['local','overview'].includes(mode)||!canMoveCamera())return false;
  cameraBrowseTarget=null;cameraView.mode=mode;cameraView.zoom=1;cameraView.following=true;
  cameraFocusReady=false;cancelCameraGesture();resize();return true;
}
function changeCameraView(yawDelta=0,elevationDelta=0,zoomFactor=1){
  if(!canMoveCamera()||!Number.isFinite(zoomFactor)||zoomFactor<=0)return false;
  if(cameraView.yaw===null)resize();
  cameraView.yaw+=yawDelta;
  cameraView.elevation=THREE.MathUtils.clamp(cameraView.elevation+elevationDelta,CAMERA_LIMITS.minElevation,CAMERA_LIMITS.maxElevation);
  cameraView.zoom=THREE.MathUtils.clamp(cameraView.zoom*zoomFactor,CAMERA_LIMITS.minZoom,CAMERA_LIMITS.maxZoom);
  // Orbit and zoom change how the player's neighbourhood is viewed, not the
  // subject being followed. followCamera pauses only while fingers are held
  // down, then eases back automatically when the gesture ends.
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
  const local=isLocalCamera(),modeButton=cameraControls.querySelector('[data-camera="mode"]'),resetButton=cameraControls.querySelector('[data-camera="reset"]');
  if(modeButton){modeButton.hidden=Boolean(snapshot?.targetSelection)||document.body.classList.contains('mode-showcase')||document.body.classList.contains('mode-start')||snapshot?.phase==='preview';modeButton.style.display=modeButton.hidden?'none':'';modeButton.textContent=local?'全图':'局部';modeButton.setAttribute('aria-label',local?'查看整张地图':'切换局部跟随镜头');modeButton.setAttribute('aria-pressed',String(!local));}
  if(resetButton){resetButton.textContent=local?'跟随':'回正';resetButton.setAttribute('aria-label',local?'恢复跟随当前行动的棋子':'恢复默认棋盘视角');resetButton.setAttribute('aria-pressed',String(local&&cameraView.following));}
  wrap.dataset.cameraMode=local?'local':'overview';wrap.dataset.cameraFollowing=String(local&&cameraView.following);
  cameraControls.querySelectorAll('select').forEach(select=>{
    select.disabled=!allowed;select.value=select.dataset.atmosphere==='time'?timeMode:select.dataset.atmosphere==='season'?seasonMode:weatherMode;
  });
  const outskirtsToggle=cameraControls.querySelector('[data-outskirts-toggle]');if(outskirtsToggle){outskirtsToggle.disabled=!allowed;outskirtsToggle.checked=outskirtsVisible;}
  if(!allowed&&cameraGesture.pointers.size)cancelCameraGesture();
}
function setCityTimeMode(mode){
  if(!Object.hasOwn(ATMOSPHERE_MODES.time,mode))return false;
  timeMode=mode;sceneLife?.setTimeMode(mode);renderDirty=true;
  syncCameraControls();saveAtmospherePreferences();
  return true;
}
function setCityClimate(kind,mode){
  if(!['season','weather'].includes(kind)||!Object.hasOwn(ATMOSPHERE_MODES[kind],mode))return false;
  if(kind==='season'){seasonMode=mode;sceneLife?.setSeason(mode);}
  else{weatherMode=mode;sceneLife?.setWeather(mode);}
  renderDirty=true;syncCameraControls();saveAtmospherePreferences();return true;
}
function saveAtmospherePreferences(){
  try{localStorage.setItem('monopoly.city.atmosphere.v1',JSON.stringify({time:timeMode,season:seasonMode,weather:weatherMode,outskirts:outskirtsVisible}));}catch(_){}
}
function syncAtmosphereReadout(){
  const atmosphere=sceneLife?.getAtmosphere();if(!atmosphere||!wrap)return;
  const period=atmosphere.night>.72?'月夜':atmosphere.warmth>.4?(atmosphere.hour<12?'晨光':'夕照'):'日光';
  const weatherLabel=ATMOSPHERE_MODES.weather[atmosphere.weather]||'晴朗';
  const seasonLabel=ATMOSPHERE_MODES.season[atmosphere.season]||'春日';
  const label=`${seasonLabel} · ${weatherLabel} · ${period}`;
  const badge=cameraControls?.querySelector('.city-atmosphere-current');
  if(badge&&badge.textContent!==label)badge.textContent=label;
  const symbol=cameraControls?.querySelector('.city-atmosphere-symbol');
  if(symbol)symbol.textContent=atmosphere.weather==='snow'?'❄':atmosphere.weather==='rain'?'☂':atmosphere.night>.72?'☾':'☼';
  wrap.dataset.season=atmosphere.season;wrap.dataset.weather=atmosphere.weather;
  wrap.dataset.timeMode=timeMode;wrap.dataset.night=atmosphere.night.toFixed(2);
  wrap.dataset.outskirts=String(outskirtsVisible);
  wrap.dataset.roofSnow=Number(atmosphere.roofSnow||0).toFixed(2);
}
function mountCameraControls(){
  const stage=wrap.parentElement;
  cameraControls=document.createElement('div');cameraControls.className='city-camera-controls';cameraControls.setAttribute('role','group');cameraControls.setAttribute('aria-label','调整棋盘视角');
  cameraControls.innerHTML='<span id="city-camera-help" class="city-camera-help">拖动旋转，双指或滚轮缩放；方向键转动，＋ / − 缩放，Home 恢复跟随。</span><button type="button" data-camera="mode" class="city-camera-mode">全图</button><button type="button" data-camera="left" aria-label="向左转动棋盘" title="向左转">↶</button><button type="button" data-camera="right" aria-label="向右转动棋盘" title="向右转">↷</button><span class="city-camera-divider"></span><button type="button" data-camera="out" aria-label="缩小棋盘" title="缩小">−</button><output aria-label="棋盘缩放比例">100%</output><button type="button" data-camera="in" aria-label="放大棋盘" title="放大">＋</button><button type="button" data-camera="reset" class="city-camera-reset">跟随</button>';
  const atmosphereControl=document.createElement('details');atmosphereControl.className='city-atmosphere';
  atmosphereControl.innerHTML='<summary title="切换季节、天气与光照"><span class="city-atmosphere-symbol" aria-hidden="true">☼</span><span class="city-atmosphere-current">小城气候</span><span class="city-atmosphere-expand" aria-hidden="true">⌄</span></summary><div class="city-atmosphere-panel"></div>';
  const atmospherePanel=atmosphereControl.querySelector('.city-atmosphere-panel');
  for(const [kind,title] of [['time','光照'],['season','季节'],['weather','天气']]){
    const row=document.createElement('label');row.className='city-time-control';
    row.innerHTML=`<span>${title}</span><select data-atmosphere="${kind}" aria-label="小城${title}">${Object.entries(ATMOSPHERE_MODES[kind]).map(([value,text])=>`<option value="${value}">${text}</option>`).join('')}</select>`;
    row.querySelector('select').value=kind==='time'?timeMode:kind==='season'?seasonMode:weatherMode;
    atmospherePanel.appendChild(row);
  }
  const climateHint=document.createElement('p');climateHint.textContent='换个季节，换种心情。';atmospherePanel.appendChild(climateHint);
  const outskirtsControl=document.createElement('label');outskirtsControl.className='city-outskirts-control';outskirtsControl.innerHTML='<span>周边小景</span><input type="checkbox" data-outskirts-toggle aria-label="显示周边小景">';
  outskirtsControl.querySelector('input').checked=outskirtsVisible;atmospherePanel.insertBefore(outskirtsControl,climateHint);
  atmosphereControl.addEventListener('change',event=>{
    event.stopPropagation();if(event.target.hasAttribute('data-outskirts-toggle')){outskirtsVisible=event.target.checked;sceneLife?.setOutskirtsVisible(outskirtsVisible);renderDirty=true;saveAtmospherePreferences();return;}const kind=event.target.dataset.atmosphere;
    if(kind==='time')setCityTimeMode(event.target.value);else setCityClimate(kind,event.target.value);
  });
  atmosphereControl.addEventListener('keydown',event=>{if(event.key==='Escape'){atmosphereControl.open=false;atmosphereControl.querySelector('summary').focus();event.stopPropagation();}});
  cameraControls.appendChild(atmosphereControl);
  stage.appendChild(cameraControls);
  cameraControls.addEventListener('click',event=>{
    const action=event.target.closest('[data-camera]');if(!action||action.disabled)return;event.stopPropagation();
    if(action.dataset.camera==='reset')resetCameraView(true);
    else if(action.dataset.camera==='mode')setCameraMode(isLocalCamera()?'overview':'local');
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
  buildingFireworks?.dispose();buildingFireworks=null;pendingCelebrations.clear();
  sceneLife?.dispose();sceneLife=null;
  streetFoundation?.dispose();streetFoundation=null;
  harborSceneRoot=null;harborProjectBadges.clear();cameraBrowseTarget=null;
  ownershipRoofs?.clear();
  world?.clear(); labels?.replaceChildren(); lotViews.clear(); pawnViews.clear(); stepViews.clear();
  travelArrow = null;streetArrows.length=0;
  resources.forEach((resource) => resource.dispose?.()); resources.clear(); materials.clear(); pulses.length = 0;
}
function retireInactiveModels(activeMap){
  // Called only after clearMap has detached buildings, weather bindings and
  // scenic borrowers. Retain common props and the currently selected region.
  for(const [name,model] of modelLibrary){
    const region=/^(classic|compact|expansion|harbor|alpine)_/.exec(name)?.[1];
    if(!region||region===activeMap)continue;
    model.traverse(node=>{if(node.geometry){if(!ownsSharedModelResource(node.geometry))node.geometry.dispose();modelResources.delete(node.geometry);obsoleteModelGeometry.delete(node.geometry);}});
    modelLibrary.delete(name);modelPriorities.delete(name);authoredModels.delete(name);assetEnvelopes.delete(name);
  }
  // Forced refreshes can leave earlier derived meshes outside modelLibrary
  // while existing borrowers finish. Retire those generations with their map.
  for(const geometry of modelResources){
    const region=modelGeometryRegions.get(geometry);
    if(region&&region!==activeMap){if(!ownsSharedModelResource(geometry))geometry.dispose();modelResources.delete(geometry);obsoleteModelGeometry.delete(geometry);}
  }
  for(const bundle of ASSET_BUNDLES)if(bundle.mapId&&bundle.mapId!==activeMap){
    installedModelSources.delete(bundle.file);
    loadedBundles.delete(bundle.file);failedBundles.delete(bundle.file);bundleRequests.delete(bundle.file);
    releaseSharedModelAsset(bundle.file);
  }
  for(const mapId of ['classic','compact','expansion','harbor','alpine'])if(mapId!==activeMap)releaseSharedModelAsset(`regions-far/${mapId}.glb`);
  if(activeMap!=='harbor')releaseSharedModelAsset('harbor/harbor_lighthouse.glb');
  if(activeMap!=='alpine')releaseSharedModelAsset('harbor/alpine_windmill.glb');
}
function reset() {
  closeInspection();
  cancelAnimationFrame(assetRefreshFrame);assetRefreshFrame=0;sceneryRefreshNeeded=false;
  resetCameraView();cameraView.facingYaw=null;
  clearMap();levelThreeTracker?.reset();retireInactiveModels(null); snapshot = null; mapKey = ''; selectedIndex = null; propertyCameraView = null; routeCameraView = null;
  document.body.classList.remove('scene-ready'); api.ready = false;
}
function tilePosition(tile) {
  const center=snapshot?.mapId==='harbor'?harborVisualPosition(tile):tile;
  return new THREE.Vector3((center.x - boardBounds.cx) * STEP, .14, (center.y - boardBounds.cy) * STEP);
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
  if(snapshot?.mapId==='harbor'){
    const gx=position.x/STEP+boardBounds.cx,gy=position.z/STEP+boardBounds.cy;
    const distance=item=>{const center=harborVisualPosition(item);return Math.hypot(center.x-gx,center.y-gy);};
    const tile=snapshot.board.reduce((best,item)=>distance(item)<distance(best)?item:best);
    return [harborBoundaryForTile(tile)];
  }
  const left=(boardBounds.minX-boardBounds.cx)*STEP,right=(boardBounds.maxX-boardBounds.cx)*STEP;
  const back=(boardBounds.minY-boardBounds.cy)*STEP,front=(boardBounds.maxY-boardBounds.cy)*STEP;
  return [
    {side:'north',distance:Math.abs(position.z-back),normal:new THREE.Vector3(0,0,1),rotation:0},
    {side:'south',distance:Math.abs(position.z-front),normal:new THREE.Vector3(0,0,-1),rotation:Math.PI},
    {side:'west',distance:Math.abs(position.x-left),normal:new THREE.Vector3(1,0,0),rotation:Math.PI/2},
    {side:'east',distance:Math.abs(position.x-right),normal:new THREE.Vector3(-1,0,0),rotation:-Math.PI/2},
  ];
}
function harborBoundaryForTile(tile){
  const normal=harborWalkOffset(tile,THREE).normalize();
  return {side:Math.abs(normal.x)>Math.abs(normal.z)?(normal.x>0?'west':'east'):(normal.z>0?'north':'south'),distance:0,normal,rotation:Math.atan2(normal.x,normal.z)};
}
function boundaryFor(position){return boundaryEdges(position).sort((a,b)=>a.distance-b.distance)[0];}
function parcelLocalDirection(group,direction){return direction.clone().applyAxisAngle(new THREE.Vector3(0,1,0),-group.rotation.y);}
function parcelFrontDepth(view,worldNormal){
  if(view.parcelRotation==null)return Math.abs(worldNormal.x)>.5?view.w:view.d;
  const normal=parcelLocalDirection(view.group,worldNormal);
  return Math.abs(normal.x)*view.w+Math.abs(normal.z)*view.d;
}
function lotWorldSetback(view){return (view.mapId==='harbor'?view.boundary.normal.clone():inward(view.group.position)).multiplyScalar(-(view.landmarkSpec?.modelSetback??.10));}
function buildMap(data) {
  clearMap();
  buildingFireworks=createBuildingFireworks({THREE,parent:world,reducedMotion:()=>reducedMotion.matches,requestRender:()=>{renderDirty=true;}});
  retireInactiveModels(data.mapId);
  const positions = data.board.map((tile) => data.mapId==='harbor'?harborVisualPosition(tile):tile);
  const xs = positions.map((tile) => tile.x), ys = positions.map((tile) => tile.y);
  boardBounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  boardBounds.cx = (boardBounds.minX + boardBounds.maxX) / 2;
  boardBounds.cy = (boardBounds.minY + boardBounds.maxY) / 2;
  boardBounds.w = (boardBounds.maxX - boardBounds.minX + 1) * STEP;
  boardBounds.d = (boardBounds.maxY - boardBounds.minY + 1) * STEP;
  streetFoundation=createStreetFoundation({THREE,world,boardBounds,mapId:data.mapId,islands:data.mapId==='harbor'});
  ground = mesh(new THREE.PlaneGeometry(200, 200), data.mapId==='harbor'?'#609eaa':'#dbe3d7', world, 0, -.44, 0);
  ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  if(data.mapId==='harbor')harborSceneRoot=createHarborIslands({THREE,world,boardBounds,data,own});else makePark(data.mapId);
  data.board.forEach((tile) => makeStep(tile));
  makeRoads(data);
  data.board.filter((tile) => !tile.isLargeSecondary).forEach((tile) => makeLot(tile, data));
  streetFoundation.finish();
  data.players.forEach((player) => makePawn(player));
  syncHarborProjects(data);
  if(data.mapId!=='classic'){
    travelArrow=document.createElement('span');travelArrow.className='scene-travel-arrow';travelArrow.setAttribute('role','img');
    travelArrow.innerHTML='<svg viewBox="0 0 28 20" aria-hidden="true"><path d="M3 10H23M17 4L23 10L17 16"/></svg>';
    labels.appendChild(travelArrow);
  }
  try{
    sceneLife=createSceneLife({THREE,scene,world,renderer,light,snapshot:data,lotViews,boardBounds,requestRender:()=>{renderDirty=true;}});
    sceneLife.setTimeMode(timeMode);
    sceneLife.setSeason(seasonMode);sceneLife.setWeather(weatherMode);sceneLife.setOutskirtsVisible(outskirtsVisible);syncAtmosphereReadout();
  }catch(error){console.warn('City atmosphere is temporarily unavailable.',error);sceneLife=null;}
  resize();
}
function makePark(mapId) {
  createRegionalPark({THREE,world,boardBounds,mapId,own,loadSceneryBundle:file=>loadSharedModelAsset(file,{version:'20261025-facade2'}),requestRender:()=>{renderDirty=true;}});
}
function numberTexture(number) {
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff9e7'; ctx.beginPath(); ctx.arc(48,48,43,0,Math.PI*2); ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#b6a381'; ctx.stroke();
  ctx.font = '700 39px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#536657'; ctx.fillText(String(number + 1).padStart(2,'0'),48,51);
  const texture = own(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function makeStep(tile) {
  const center = tilePosition(tile), edges=snapshot?.mapId==='harbor'?[harborBoundaryForTile(tile)]:boundaryEdges(center), nearest=Math.min(...edges.map(edge=>edge.distance));
  const sides=edges.filter(edge=>edge.distance<nearest+.001), corner=sides.length>1;
  // A corner needs clearance on both axes; normalising a diagonal would push
  // its landing point back inside the corner building's footprint.
  const offset=snapshot?.mapId==='harbor'?harborWalkOffset(tile,THREE):new THREE.Vector3();if(snapshot?.mapId!=='harbor')sides.forEach(side=>offset.addScaledVector(side.normal,WALK_SETBACK));
  const walk=center.clone().add(offset);walk.y=.255;
  const size=corner?.76:.66, routeColor=tile.isStart?SPECIAL_COLORS.start:SPECIAL_COLORS[tile.special?.type];
  const landing=new THREE.Group();landing.position.copy(walk);landing.position.y=.205;landing.name='landing_pad_'+tile.index;landing.userData.cosmetic=true;world.add(landing);
  if(snapshot?.mapId==='harbor'){const angle=harborParcelRotation(tile);if(angle!=null)landing.rotation.y=angle;}
  rounded(landing,size,.026,size,corner?.19:.16,routeColor||'#c2b191');
  rounded(landing,size-.075,.018,size-.075,corner?.16:.13,'#faf2db',0,.027);
  const disc = mesh(new THREE.PlaneGeometry(corner?.49:.43,corner?.49:.43), own(new THREE.MeshBasicMaterial({ map:numberTexture(tile.index), transparent:true, depthWrite:false })), world, walk.x, walk.y, walk.z);
  disc.rotation.x = -Math.PI/2; disc.castShadow = false;
  const ring = mesh(new THREE.RingGeometry(corner?.39:.34,corner?.445:.395,40), own(new THREE.MeshBasicMaterial({ color:'#efba68', transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false })), world, walk.x, .261, walk.z);
  ring.rotation.x = -Math.PI/2;
  ring.castShadow=false;
  stepViews.set(tile.index, { center, walk, ring, landing, corner, normal:offset.clone().normalize() });
}
function makeRoads(data) {
  const edges = new Set(); const connections = [];
  const addEdge = (a,b) => { if (!stepViews.has(a)||!stepViews.has(b)) return; const key=[a,b].sort((x,y)=>x-y).join(':'); if(edges.has(key))return; edges.add(key); connections.push([a,b]); };
  if(data.navigation?.edges) data.navigation.edges.forEach(edge=>addEdge(edge.from,edge.to));
  else if (data.navigation?.next) Object.entries(data.navigation.next).forEach(([a,b]) => addEdge(Number(a),Number(b)));
  else data.board.forEach((tile,i)=>addEdge(tile.index,data.board[(i+1)%data.board.length].index));
  const paths=connections.map(([a,b])=>data.mapId==='harbor'?harborEdgePath(a,b,stepViews,THREE):[stepViews.get(a).walk,stepViews.get(b).walk]);
  connections.forEach(([a,b],edgeIndex) => {
    const path=paths[edgeIndex];
    if(data.mapId==='harbor'&&['11:12','11:20','19:28','27:28'].includes([a,b].sort((x,y)=>x-y).join(':')))addHarborBridge({THREE,world,path,paths,own});
    for(let segment=1;segment<path.length;segment++){
    const start=path[segment-1],end=path[segment];
    streetFoundation?.road(start,end);
    const length = start.distanceTo(end); const midpoint = start.clone().add(end).multiplyScalar(.5);
    const routeBranch=data.navigation?.edges?.find(edge=>edge.from===a&&edge.to===b)?.branch;
    const roadColor=data.mapId==='harbor'?(routeBranch==='merchant'?'#d1ae72':routeBranch==='resort'?'#8fbec6':'#d0c9a2'):'#e2d2b5';
    if(data.mapId==='harbor'){const deck=box(world,.64,.10,length,'#c1bca5',midpoint.x,.13,midpoint.z);deck.rotation.y=Math.atan2(end.x-start.x,end.z-start.z);deck.castShadow=false;}
    const road = box(world,.30,.014,length,roadColor,midpoint.x,.197,midpoint.z);
    road.rotation.y = Math.atan2(end.x-start.x,end.z-start.z); road.castShadow=false;
    if(length>.40){
      const shape=new THREE.Shape();shape.moveTo(-.085,-.07);shape.lineTo(0,.08);shape.lineTo(.085,-.07);shape.lineTo(0,-.025);shape.closePath();
      const arrow=mesh(new THREE.ShapeGeometry(shape),own(new THREE.MeshBasicMaterial({color:'#a99161',side:THREE.DoubleSide})),world,midpoint.x,.216,midpoint.z);
      arrow.name=`street_direction_${a}_${b}_${segment}`;arrow.userData.streetFrom=a;arrow.userData.streetTo=b;
      arrow.rotation.set(-Math.PI/2,0,-Math.atan2(end.x-start.x,-(end.z-start.z)));arrow.castShadow=false;
      if(data.mapId==='harbor'){arrow.userData.streetBranch=routeBranch;arrow.userData.forwardRotation=arrow.rotation.z;streetArrows.push(arrow);}
    }
    }
  });
  syncHarborStreetArrows(data);
}
function syncHarborStreetArrows(data){
  if(data.mapId!=='harbor')return;
  const current=data.players.find(player=>player.id===data.currentPlayerId);
  const journey=current?.harborJourney||data.harborJourney;
  const travel=journey?.travelDirection??(current?.effects?.reversed?-1:1);
  const central=journey?.centralDirection??travel;
  for(const arrow of streetArrows){
    const reverse=(arrow.userData.streetBranch==='shared'?central:travel)<0;
    arrow.rotation.z=arrow.userData.forwardRotation+(reverse?Math.PI:0);
    arrow.material.color.set(arrow.userData.streetBranch==='shared'?(journey?.phase==='yellow'?'#c2942f':'#c96368'):'#a99161');
    arrow.userData.actualFrom=reverse?arrow.userData.streetTo:arrow.userData.streetFrom;
    arrow.userData.actualTo=reverse?arrow.userData.streetFrom:arrow.userData.streetTo;
  }
}
function makeLot(tile, data) {
  const center = tilePosition(tile);
  const secondary = data.board.find((item) => item.isLargeSecondary && item.largePrimaryIndex === tile.index);
  const position = secondary ? center.clone().add(tilePosition(secondary)).multiplyScalar(.5) : center.clone();
  const parcelRotation=data.mapId==='harbor'?harborParcelRotation(tile):null;
  const landmarkSpec=data.mapId==='harbor'?harborLandmarkSpec(tile):null;
  const streetAlignedLarge=Boolean(secondary&&parcelRotation!=null);
  // Reviewed large models are wide across their frontage. Their two landing
  // positions stay separate; one full-width deed follows the shared street.
  const w = landmarkSpec?.width??(1.43 + (streetAlignedLarge || secondary && secondary.x !== tile.x ? STEP : 0));
  const d = landmarkSpec?.depth??(1.43 + (!streetAlignedLarge && secondary && secondary.y !== tile.y ? STEP : 0));
  const group = new THREE.Group(); group.position.copy(position); group.userData.tileIndex=tile.index; world.add(group);
  // Rotate the complete parcel, including large estates and their deed frames.
  if(parcelRotation!=null)group.rotation.y=parcelRotation;
  // A merged parcel's midpoint can be closer to another street. Its primary
  // tile owns the frontage, so never infer that direction from a neighbour.
  const boundary=data.mapId==='harbor'?harborBoundaryForTile(tile):boundaryFor(position),modern=data.mapId!=='classic';
  rounded(group,w,.08,d,.13,PALETTE.cream,0,-.07);
  rounded(group,w-.12,.03,d-.12,.09,tile.lot ? streetFoundation.theme.garden : streetFoundation.theme.pavement,0,.011);
  streetFoundation.parcel(group,w,d,!!tile.lot);
  const ownerMaterial = own(new THREE.MeshStandardMaterial({ color:'#c5b696', roughness:.84, emissive:'#000000' }));
  // A single closed deed boundary, in parcel coordinates. The two physical
  // steps of a large lot share this one frame, independent of its frontage.
  const ownerFrame=roundedFrame(group,w-.055,.024,d-.055,.105,.070,ownerMaterial,.044);
  ownerFrame.name='ownership_frame';ownerFrame.visible=false;
  const pulseMaterial = own(new THREE.MeshBasicMaterial({ color:PALETTE.gold, transparent:true, opacity:0, depthWrite:false }));
  // Event emphasis sits outside the parcel; ownership keeps its own color.
  const outline=roundedFrame(group,w+.12,.014,d+.12,.18,.035,pulseMaterial,.014);outline.name='event_frame';
  const building = new THREE.Group(); building.position.y=.048; building.userData.snowTarget=true; group.add(building);
  const flag = new THREE.Group(); flag.position.set(-w/2+.19,.045,d/2-.26); group.add(flag);
  if(modern){
    const normal=parcelLocalDirection(group,boundary.normal),tangent=new THREE.Vector3(normal.z,0,-normal.x);
    const front=parcelRotation!=null?Math.abs(normal.x)*w+Math.abs(normal.z)*d:Math.abs(normal.x)>.5?w:d;
    const span=parcelRotation!=null?Math.abs(tangent.x)*w+Math.abs(tangent.z)*d:Math.abs(normal.x)>.5?d:w;
    flag.position.copy(normal.multiplyScalar(front/2-.23)).add(tangent.multiplyScalar(-span/2+.19));flag.position.y=.045;flag.rotation.y=boundary.rotation-group.rotation.y;
  }
  cylinder(flag,.017,.38,PALETTE.dark,0,.19,0,8);
  const flagCloth = box(flag,.21,.12,.012,ownerMaterial,.09,.32,0);
  const outward = (data.mapId==='harbor'?boundary.normal.clone():inward(position)).multiplyScalar(-1);
  // Back-row names sit along the walk in front of their buildings; placing them
  // beyond the far edge would project the text directly over the roofs.
  if(outward.z<-.2)outward.z*=-1;
  const anchor = position.clone().add(outward.multiplyScalar(.91)); anchor.y=.07;
  const button = document.createElement('button'); button.type='button'; button.className='scene-tile'; button.dataset.sceneTileIndex=String(tile.index);
  button.dataset.side=boundary.side;
  button.innerHTML='<span class="scene-tile-name"></span><span class="scene-tile-meta"></span>';
  button.querySelector('.scene-tile-name').textContent=tile.name;
  if(!tile.lot)button.querySelector('.scene-tile-name').dataset.service=({start:'市政',bank:'金库',construction:'城建',card_draw:'抽卡',chance:'商店',teleport:'传送',rush:'快线',junction:data.mapId==='harbor'?'航线':'分岔'})[tile.isStart?'start':tile.special?.type]||'';
  labels.appendChild(button);
  const view={tile, mapId:data.mapId, boundary, parcelRotation, landmarkSpec, group, building, ownerMaterial, ownerFrame, flag, flagCloth, outline, label:button, anchor, w, d, signature:'', modelName:'', born:0};
  if(parcelRotation!=null){anchor.copy(position).addScaledVector(boundary.normal,parcelFrontDepth(view,boundary.normal)/2+.26);anchor.y=.07;}
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
  // Reviewed regional models are packaged in game-world units. Never fit each level into
  // a common height: that would make the final tower shorter and the estate shrink.
  const object=source.clone(true);object.position.set(0,0,0);
  object.traverse((child)=>{if(child.isMesh){child.castShadow=!child.material?.transparent;child.receiveShadow=true;}});
  return object;
}
function resolveAsset(tile,data,level=tile.lot?.level||0){
  const family=tile.lot?.landmarkKey||LANDMARKS[data.mapId]?.[tile.isLargeSecondary?tile.largePrimaryIndex:tile.index];
  const fallback=tile.isStart?'city_hall':tile.lot?(level===0?'plot_0':`${tile.lot.theme?.key||'villa'}_${level}`):({bank:'bank',construction:'construction',card_draw:'card_station'}[tile.special?.type]||'card_station');
  const shared=tile.isStart?'civic_hall':tile.lot?(level===0?'plot_0':family?`${family}_${level}`:fallback):(SPECIAL_MODELS[tile.special?.type]||fallback);
  // Every occupied parcel and public building uses the selected region's own
  // architecture. Level-zero plots remain playable while the art downloads.
  const desired=tile.lot&&level===0?shared:`${data.mapId}_${shared}`;
  const key=desired;
  return {family,desired,key,source:modelLibrary.get(key),authored:authoredModels.has(key),level};
}
function lotModelRotation(view){
  const frontage=view.mapId==='classic'?(view.d>view.w?Math.PI/2:0):(view.parcelRotation!=null?view.boundary.rotation:view.readableRotation??view.boundary.rotation);
  return frontage-view.group.rotation.y;
}
function createLotModel(tile,data,level,view=null,ownResource=own){
  const asset=resolveAsset(tile,data,level);let model;
  if(asset.source){
    if(asset.authored)model=cloneAuthoredModel(asset.source);
    else model=cloneModel(asset.source,tile.lot?.isLarge?1.15:1.055,tile.lot?.theme?.key==='tower'?1.85:1.45);
  }else{
    model=new THREE.Group();
    if(tile.lot&&level===0)saleSign(model);
    else model.userData.pendingModel=asset.desired;
  }
  if(asset.source){
    const steam=createThermalSteam({THREE,model,own:ownResource});if(steam)model.add(steam);
    if(tile.lot)roofController().set(model,tile.lot.ownerId);
    else {
      const service=createFunctionalLandmark({THREE,mapId:data.mapId,type:tile.isStart?'start':tile.special?.type,model,own:ownResource});
      if(service){model.userData.functionalBounds=new THREE.Box3().setFromObject(service);model.add(service);}
    }
  }
  // Scale the reviewed shell and any fittings together, after measuring the
  // authored model. Housing, estates and public buildings share this contract;
  // gameplay and label semantics still come exclusively from tile.lot/special.
  const landmarkSpec=data.mapId==='harbor'?harborLandmarkSpec(tile):null;
  if(landmarkSpec){model.scale.multiply(new THREE.Vector3(...landmarkSpec.scale));model.userData.harborParcelScale=[...landmarkSpec.scale];model.userData.harborLandmarkScale=[...landmarkSpec.scale];}
  if(view){
    model.userData.cityBaseRotationY=model.rotation.y;
    model.rotation.y+=lotModelRotation(view);
    const setback=parcelLocalDirection(view.group,lotWorldSetback(view));
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
  // Combine static surfaces once while retaining authored colors and independently
  // moving components. Runtime copies share these resources across placements.
  const object=source.clone(true);object.position.set(0,0,0);object.updateMatrixWorld(true);
  const batches=new Map();const result=new THREE.Group();result.name=source.name;result.userData={...source.userData};
  const region=/^(classic|compact|expansion|harbor|alpine)_/.exec(source.name)?.[1];
  const remember=geometry=>{modelResources.add(geometry);if(region)modelGeometryRegions.set(geometry,region);};
  const movingRoots=new Set();
  const isMoving=child=>child.name?.startsWith('life_')||Boolean(child.userData?.lifePart);
  object.traverse(child=>{
    if(child===object||!isMoving(child))return;
    let parent=child.parent;while(parent&&parent!==object){if(isMoving(parent))return;parent=parent.parent;}
    movingRoots.add(child);
    const copy=child.clone(true);child.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);
    copy.traverse(part=>{if(part.isMesh){part.castShadow=true;part.receiveShadow=true;remember(part.geometry);}});
    result.add(copy);
  });
  object.traverse((child)=>{
    if(!child.isMesh)return;
    let parent=child;while(parent&&parent!==object){if(movingRoots.has(parent))return;parent=parent.parent;}
    if(Array.isArray(child.material)){const copy=child.clone();child.matrixWorld.decompose(copy.position,copy.quaternion,copy.scale);copy.castShadow=true;copy.receiveShadow=true;remember(copy.geometry);result.add(copy);return;}
    const key=child.material.uuid;
    if(!batches.has(key))batches.set(key,{material:child.material,geometries:[]});
    const geometry=child.geometry.clone();geometry.applyMatrix4(child.matrixWorld);
    batches.get(key).geometries.push(geometry);
  });
  batches.forEach(({material,geometries})=>{
    const merged=mergeGeometries(geometries,false);
    if(merged){remember(merged);const item=new THREE.Mesh(merged,material);item.castShadow=true;item.receiveShadow=true;result.add(item);geometries.forEach((g)=>g.dispose());}
    else geometries.forEach((g)=>{remember(g);result.add(new THREE.Mesh(g,material));});
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
function updateLot(view,tile,data,initial=false) {
  view.tile=tile;
  const purchaseSelected=data.targetSelection?.kind==='property'&&data.selectedTile===tile.index;
  if(purchaseSelected){view.outline.material.color.set('#efbb46');view.outline.material.opacity=.85;}
  else if(view.purchaseSelected)view.outline.material.opacity=0;
  view.purchaseSelected=purchaseSelected;
  view.label.classList.toggle('is-purchase-target',purchaseSelected);
  const owner=data.players.find((p)=>p.id===tile.lot?.ownerId);
  const specialColor=!tile.lot?(tile.isStart?SPECIAL_COLORS.start:SPECIAL_COLORS[tile.special?.type]):null;
  const color=owner?.id==='human'?'#348d87':owner?.id==='ai'?'#d77b59':specialColor||'#c5b696';
  view.ownerMaterial.color.set(color);view.ownerFrame.visible=Boolean(owner||specialColor);view.flag.visible=Boolean(owner);
  view.ownerFrame.name=specialColor?'special_tile_frame':'ownership_frame';
  view.ownerMaterial.emissive.set(specialColor||'#000000');view.ownerMaterial.emissiveIntensity=specialColor?.09:0;
  const level=tile.lot?.level||0;
  const asset=resolveAsset(tile,data,level);
  const modelName=asset.desired;
  const signature=`${modelName}:${asset.key}:${asset.source?.uuid||'fallback'}`;
  if(view.signature!==signature){
    view.building.children.forEach(model=>ownershipRoofs?.release(model));
    view.modelResources?.forEach(resource=>{resource.dispose?.();resources.delete(resource);});
    view.modelResources=new Set();
    view.building.clear(); view.signature=signature;view.modelName=modelName;
    view.building.add(createLotModel(tile,data,level,view,resource=>{view.modelResources.add(resource);return own(resource);}).model);
    view.label.dataset.modelKey=asset.desired;view.label.dataset.loadedModel=asset.source?asset.key:'';
    if(!initial){view.born=performance.now();view.building.scale.y=reducedMotion.matches?1:.78;effect({type:'upgrade',tiles:[tile.index]});}
  }
  if(tile.lot&&view.building.children[0])roofController().set(view.building.children[0],owner?.id);
  if(tile.lot&&level===0&&owner)view.building.visible=false;else view.building.visible=true;
  const meta=view.label.querySelector('.scene-tile-meta');
  if(tile.lot){
    const rent=data.rents?.[tile.index]??tile.lot.tolls?.[level]??0;
    const price=data.purchasePrices?.[tile.index]??tile.lot.price;
    meta.textContent=owner?`${owner.id==='human'?'你':'对手'} · Lv.${level} · ¥${rent}`:level>0?`Lv.${level}待售 · ¥${price}`:`空地待售 ¥${price}`;
    view.label.style.setProperty('--owner-color',owner?color:'#b8ab90');
    view.label.dataset.owner=owner?.id||'none';
    view.label.dataset.rent=String(rent);
    view.label.dataset.level=String(level);view.label.classList.toggle('is-built-for-sale',!owner&&level>0);
    view.label.querySelector('.scene-tile-name').dataset.level=String(level);
  }else {meta.textContent=tile.isStart?'起点 · 市政卡':tile.special?.label||'城市事件';view.label.style.setProperty('--owner-color',specialColor||'#ab9569');view.label.dataset.special=tile.isStart?'start':tile.special?.type||'';}
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
  pawnViews.set(player.id,{group:g,anchor,shield,position:player.position,from:pos.clone(),target:pos.clone(),started:0,duration:220,active:false,teleport:false,facing:0});
}
function pawnPosition(player){
  const step=stepViews.get(player.position)||stepViews.values().next().value;
  const pos=step.walk.clone();pos.y=.265;
  const normal=step.normal||inward(step.center),tangent=new THREE.Vector3(normal.z,0,-normal.x);
  const sharing=snapshot?.players?.some(other=>other.id!==player.id&&other.position===player.position);
  if(sharing)pos.addScaledVector(tangent,player.id==='human'?-.17:.17);
  return pos;
}
// Brief acceleration/braking at each tile, with steady travel across a long
// bridge. A whole road segment must not read as a single airborne leap.
function pawnTravelProgress(t,duration){
  const ramp=Math.min(.16,70/Math.max(1,duration));
  if(t<ramp)return t*t/(2*ramp*(1-ramp));
  if(t>1-ramp)return 1-(1-t)*(1-t)/(2*ramp*(1-ramp));
  return (t-ramp/2)/(1-ramp);
}
function updatePawnMotion(view,time,delta){
  if(!view.active)return;
  const t=view.duration===0?1:THREE.MathUtils.clamp((time-view.started)/view.duration,0,1);
  if(view.teleport){
    if(t<.5){view.group.position.copy(view.from);view.group.scale.setScalar(1-t*1.8);}
    else{view.group.position.copy(view.target);view.group.scale.setScalar(.1+(t-.5)*1.8);}
    view.group.rotation.y=(view.facing||0)+t*Math.PI*2;
  }else{
    const progress=pawnTravelProgress(t,view.duration);
    let from=view.from,to=view.target;
    if(view.path?.length>1){
      let distance=progress*view.pathLength;
      for(let i=0;i<view.pathLengths.length;i++){
        const length=view.pathLengths[i];
        if(distance<=length||i===view.pathLengths.length-1){
          from=view.path[i];to=view.path[i+1];
          view.group.position.lerpVectors(from,to,Math.min(1,distance/Math.max(.0001,length)));break;
        }
        distance-=length;
      }
    }else view.group.position.lerpVectors(from,to,progress);
    const dx=to.x-from.x,dz=to.z-from.z;
    if(Math.hypot(dx,dz)>.001){
      view.facing=Math.atan2(dx,dz);
      const angle=Math.atan2(Math.sin(view.facing-view.group.rotation.y),Math.cos(view.facing-view.group.rotation.y));
      view.group.rotation.y+=angle*(1-Math.exp(-delta/.055));
    }
  }
  if(t===1){
    view.active=false;view.group.position.copy(view.target);view.group.scale.setScalar(1);
    view.group.rotation.y=view.facing||0;
  }
}
function update(data){
  if(inspection&&inspection.sessionId!==data?.sessionId)closeInspection();
  snapshot=data;if(!data?.board?.length||!mount())return;
  const key=`${data.sessionId}:${data.mapId}:${data.board.length}`;
  if(key!==mapKey){propertyCameraView=null;routeCameraView=null;resetCameraView();cameraView.facingYaw=null;mapKey=key;buildMap(data);}
  syncHarborStreetArrows(data);
  levelThreeTracker ||= createLevelThreeTracker();
  const reached=levelThreeTracker.observe(key,data.board.filter(tile=>tile.lot&&!tile.isLargeSecondary).map(tile=>({id:tile.index,level:tile.lot.level,owner:tile.lot.ownerId})),data.phase!=='preview'&&!document.body.classList.contains('mode-start')&&!document.body.classList.contains('mode-showcase'));
  for(const entry of reached.slice(0,2))pendingCelebrations.set(entry.id,{owner:entry.owner,expires:performance.now()+5000});
  // A purchase gets its own full-board view. Gestures here must not change
  // the player's saved local view when the purchase closes.
  if(data.targetSelection?.kind==='property'&&!propertyCameraView){
    propertyCameraView={...cameraView};cancelCameraGesture();
    cameraView={...cameraView,yaw:null,elevation:null,zoom:1,modified:false};resize();
  }else if(data.targetSelection?.kind!=='property'&&propertyCameraView){
    cancelCameraGesture();cameraView=propertyCameraView;propertyCameraView=null;resize();
  }
  // Looking around at a fork is temporary; movement resumes the prior view.
  if(data.routeChoice&&!routeCameraView){routeCameraView={...cameraView};}
  else if(!data.routeChoice&&routeCameraView){cancelCameraGesture();cameraView=routeCameraView;routeCameraView=null;resize();}
  if(lastLocalCamera!==isLocalCamera())resize();
  if(data.selectedTile!==undefined){
    selectedIndex=data.selectedTile;
    labels.querySelectorAll('.scene-tile').forEach((node)=>node.classList.toggle('is-selected',Number(node.dataset.sceneTileIndex)===selectedIndex));
  }
  data.board.filter((tile)=>!tile.isLargeSecondary).forEach((tile)=>{const view=lotViews.get(tile.index);if(view)updateLot(view,tile,data);});
  flushBuildingCelebrations(performance.now());
  data.players.forEach((player)=>{
    const view=pawnViews.get(player.id);if(!view)return;
    const nextPawnPosition=pawnPosition(player);
    if(view.position!==player.position||view.target.distanceToSquared(nextPawnPosition)>.0001){
      const previousIndex=view.position;
      view.from.copy(view.group.position);view.target.copy(nextPawnPosition);view.position=player.position;view.started=performance.now();
      const harborWalking=data.mapId==='harbor'&&data.navigation?.edges?.some(edge=>(edge.from===previousIndex&&edge.to===player.position)||(edge.to===previousIndex&&edge.from===player.position));
      view.path=harborWalking?harborEdgePath(previousIndex,player.position,stepViews,THREE):null;
      if(view.path?.length){view.path[0]=view.from.clone();view.path[view.path.length-1]=view.target.clone();view.path.forEach(point=>point.y=.265);view.pathLengths=view.path.slice(1).map((point,i)=>point.distanceTo(view.path[i]));view.pathLength=view.pathLengths.reduce((a,b)=>a+b,0);}
      view.teleport=!harborWalking&&view.from.distanceTo(view.target)>STEP*2.2;view.duration=reducedMotion.matches?0:view.teleport?470:harborWalking?harborMovementDuration(view.pathLength):190;view.active=true;
    }
    view.shield.visible=Boolean(player.effects?.shield||player.effects?.shieldCharges||player.effects?.rentShield);
    view.anchor.classList.toggle('is-current',data.currentPlayerId===player.id);
    view.anchor.textContent=`${player.id==='human'?'你':'对手'} · ${String(player.position+1).padStart(2,'0')}`;
    view.anchor.title=`${player.name}当前位于第 ${player.position+1} 格 · ${data.board[player.position]?.name||''}`;
  });
  const current=data.players.find((player)=>player.id===data.currentPlayerId);
  stepViews.forEach((step,index)=>{
    const landed=index===data.animation?.landedTile,moving=index===data.animation?.currentTile;
    const standing=index===current?.position;
    step.ring.material.opacity=(landed||moving) ? .85 : standing ? .70 : 0;
    step.ring.material.color.set(landed||moving?'#e6b253':current?.id==='ai'?'#d77b59':'#348d87');
  });
  syncHarborProjects(data);sceneLife?.update(data);syncCameraControls();
  renderer.render(scene,camera);document.body.classList.add('scene-ready');api.ready=true;
  arrangeLabels();positionLabels();loadModelKit();
}
function flushBuildingCelebrations(now){
  for(const [index,pending] of pendingCelebrations){
    const view=lotViews.get(index),tile=view?.tile;
    if(now>pending.expires||tile?.lot?.level!==3||tile.lot.ownerId!==pending.owner){pendingCelebrations.delete(index);continue;}
    // Wait for the reviewed regional mesh, so the launch clears the actual
    // roof rather than the temporary loading plinth or construction scale.
    if(!resolveAsset(tile,snapshot).source)continue;
    const anchor=buildingRoofAnchor(THREE,view.building,1);
    buildingFireworks?.launch({key:index,anchor,color:pending.owner==='human'?'#62d2b4':'#f59370',now});
    pendingCelebrations.delete(index);
  }
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
function locateTile(index){
  const tile=snapshot?.board?.find(tile=>tile.index===Number(index));
  const view=tile&&lotViews.get(tile.isLargeSecondary?tile.largePrimaryIndex:tile.index);
  if(!view||inspection)return false;
  // Looking at a project contributor never selects a game target or resolves
  // a modal. A board-wide purchase keeps its existing full-map framing.
  effect({type:'select',tiles:[view.tile.index]});
  if(snapshot.targetSelection)return true;
  cancelCameraGesture();cameraView.mode='local';cameraView.following=false;
  cameraBrowseTarget=view.group.position.clone();cameraBrowseTarget.y=.2;
  resize();wrap?.focus?.({preventScroll:true});return true;
}
function syncHarborProjects(data){
  if(!harborSceneRoot)return;
  const projects=data.harborProjects||[];
  updateHarborProjectVisuals(harborSceneRoot,projects);
  const active=new Set();
  for(const project of projects){
    const landscape=harborSceneRoot.userData.harborProjects?.[project.id];if(!landscape?.anchor)continue;
    active.add(project.id);let view=harborProjectBadges.get(project.id);
    if(!view){
      const button=document.createElement('button');button.type='button';button.className='harbor-project-badge';button.dataset.harborProject=project.id;
      button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','harbor-project-panel');button.innerHTML='<b></b><span></span><div class="harbor-project-progress" aria-hidden="true"><span><i></i></span><span><i></i></span><span><i></i></span></div>';
      button.querySelector('b').dataset.short=project.id==='water'?'水庭':'花园';
      const leader=document.createElement('span');leader.className='harbor-project-leader';leader.setAttribute('aria-hidden','true');
      labels.appendChild(leader);labels.appendChild(button);view={button,leader,anchor:landscape.labelAnchor||landscape.anchor};harborProjectBadges.set(project.id,view);
    }
    view.anchor=landscape.labelAnchor||landscape.anchor;view.center=landscape.anchor;view.stage=project.stage;view.points=project.points;
    view.button.dataset.stage=String(project.stage);view.button.querySelector('b').textContent=project.name;view.button.querySelector(':scope > span').textContent=`${project.points}/${project.maxPoints}`;
    view.button.setAttribute('aria-label',`${project.name}，我的建设度 ${project.points}/${project.maxPoints}，查看阶段奖励`);
    view.button.querySelectorAll('.harbor-project-progress span').forEach((bar,index)=>bar.style.setProperty('--part',`${THREE.MathUtils.clamp((project.points-index*3)/3,0,1)*100}%`));
  }
  for(const [id,view] of harborProjectBadges)if(!active.has(id)){view.button.remove();view.leader.remove();harborProjectBadges.delete(id);}
}
function arrangeLabels(){
  if(!camera)return;
  const placed=[];
  const candidates=[...lotViews.values()].map((view)=>{
    const overview=snapshot?.mapId==='harbor'&&width<720&&!isLocalCamera();
    const important=view.tile.lot?.isLarge||view.tile.isStart||view.tile.special?.type==='junction'||view.tile.index===selectedIndex||view.tile.index===snapshot?.players?.find(player=>player.id===snapshot.currentPlayerId)?.position;
    const point=project(view.anchor),visible=(!overview||important)&&point.x>=10&&point.x<=width-10&&point.y>=8&&point.y<=height-8;
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
  harborProjectBadges.forEach((view,id)=>{
    const overview=!isLocalCamera(),anchor=project(view.anchor),center=project(view.center);view.button.classList.toggle('is-overview',overview);
    const half=(view.button.offsetWidth||(overview?58:116))/2;
    // In full-map view the two small progress buttons sit on the surrounding
    // sea, connected to their courts, rather than covering the central town.
    const point=overview?{x:id==='water'?width-half-12:half+12,y:THREE.MathUtils.clamp(anchor.y,74,height-24)}:anchor;
    view.screenPoint=point;
    view.button.hidden=snapshot?.phase==='preview'||document.body.classList.contains('mode-start')||point.x<half+5||point.x>width-half-5||point.y<62||point.y>height-22;
    view.button.style.transform=`translate(${point.x.toFixed(1)}px,${point.y.toFixed(1)}px) translate(-50%,-50%)`;
    view.leader.hidden=!overview||view.button.hidden;
    const endX=point.x+(id==='water'?-half:half),dx=endX-center.x,dy=point.y-center.y;
    view.leader.style.width=`${Math.hypot(dx,dy).toFixed(1)}px`;view.leader.style.transform=`translate(${center.x.toFixed(1)}px,${center.y.toFixed(1)}px) rotate(${Math.atan2(dy,dx)}rad)`;
  });
  lotViews.forEach((view)=>{const p=view.screenPoint||project(view.anchor);view.label.style.transform=`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`;});
  stepViews.forEach((step)=>{if(step.label){const p=project(step.walk);step.label.hidden=p.x<8||p.x>width-8||p.y<8||p.y>height-8;step.label.style.transform=`translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`;}});
  const pawnLabels=[];
  pawnViews.forEach((view)=>{
    const point=project(view.group.position.clone().add(new THREE.Vector3(0,.76,0)));
    view.anchor.hidden=point.x<12||point.x>width-12||point.y<8||point.y>height-8;
    if(!view.anchor.hidden)pawnLabels.push({view,point,w:view.anchor.offsetWidth||48,h:view.anchor.offsetHeight||22});
  });
  pawnLabels.sort((a,b)=>a.point.x-b.point.x);
  for(let i=1;i<pawnLabels.length;i++){
    const left=pawnLabels[i-1],right=pawnLabels[i],gap=6;
    if(right.point.x-left.point.x<(left.w+right.w)/2+gap&&Math.abs(right.point.y-left.point.y)<(left.h+right.h)/2+3){
      // Pawns sharing a landing stand a little apart; their wider name badges
      // need separate room too, especially when the full map is on a phone.
      const total=left.w+right.w+gap,center=THREE.MathUtils.clamp((left.point.x+right.point.x)/2,total/2+5,width-total/2-5);
      left.point.x=center-(right.w+gap)/2;right.point.x=center+(left.w+gap)/2;
    }
  }
  pawnLabels.forEach(({view,point,w})=>{point.x=THREE.MathUtils.clamp(point.x,w/2+5,width-w/2-5);view.anchor.style.transform=`translate(${point.x.toFixed(1)}px,${point.y.toFixed(1)}px) translate(-50%,-50%)`;});
  if(travelArrow){
    const current=snapshot.players.find((player)=>player.id===snapshot.currentPlayerId);
    const route=current?.effects?.reversed?snapshot.navigation?.prev:snapshot.navigation?.next;
    const next=snapshot.nextSteps?.[current?.id]??route?.[current?.position],from=stepViews.get(current?.position),to=stepViews.get(next);
    travelArrow.hidden=!from||!to||Boolean(snapshot.gameOver)||Boolean(snapshot.routeChoice);
    if(from&&to){
      const heading=snapshot.mapId==='harbor'?harborEdgePath(current.position,next,stepViews,THREE)[1]:to.walk;
      const a=project(from.walk),b=project(heading||to.walk),x=a.x+(b.x-a.x)*.60,y=a.y+(b.y-a.y)*.60;
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
  const rotation=new THREE.Matrix4().makeRotationY(view.group.rotation.y+lotModelRotation(view));
  if(view.landmarkSpec)rotation.scale(new THREE.Vector3(...view.landmarkSpec.scale));
  const offset=lotWorldSetback(view).add(view.group.position);offset.y+=.05;
  // Some early roofs are deeper than their taller upgrades. Reserve every
  // authored harbor level so enlarged eaves fit and upgrading never zooms out.
  const harborLevels=view.mapId==='harbor'&&view.tile.lot?[1,2,3].flatMap(level=>assetEnvelopes.get(resolveAsset(view.tile,snapshot,level).desired)?.boxes||[]):null;
  const boxes=(harborLevels?.length?harborLevels:envelope?.boxes)||(
    asset.family==='skyscraper'?[
      new THREE.Box3(new THREE.Vector3(-1.12,0,-.47),new THREE.Vector3(1.12,.8,.47)),
      new THREE.Box3(new THREE.Vector3(-.47,.8,-.40),new THREE.Vector3(.47,3.2,.40)),
      new THREE.Box3(new THREE.Vector3(-.20,3.2,-.20),new THREE.Vector3(.20,4.05,.20)),
    ]:asset.family==='finance'?[new THREE.Box3(new THREE.Vector3(-1.12,0,-.47),new THREE.Vector3(1.12,.65,.47)),new THREE.Box3(new THREE.Vector3(-.76,.65,-.40),new THREE.Vector3(.76,2.85,.40))]:
    asset.family==='onsen'?[new THREE.Box3(new THREE.Vector3(-1.35,0,-.50),new THREE.Vector3(1.35,1.40,.50))]:
    [new THREE.Box3(new THREE.Vector3(-.61,0,-.53),new THREE.Vector3(.61,view.tile.lot?(view.tile.lot.theme?.key==='tower'?1.95:1.52):1.75,.53))]
  );
  const serviceBounds=!view.tile.lot&&view.building?.children[0]?.userData.functionalBounds;
  return [...boxes,...(serviceBounds?[serviceBounds]:[])].map((box)=>box.clone().applyMatrix4(rotation).translate(offset));
}
function harborMovementDuration(distance){
  // Long bridges take longer to cross instead of accelerating the pawn beyond
  // the delayed camera. Presentation waits for this actual animation duration.
  return Math.max(190,distance*112);
}
function localFramingTarget(){
  if(snapshot?.mapId!=='harbor'||cameraView.modified||!cameraView.following)return 0;
  const player=snapshot.players?.find(player=>player.id===snapshot.currentPlayerId);
  const tile=snapshot.board?.find(tile=>tile.index===player?.position);
  const view=tile&&lotViews.get(tile.isLargeSecondary?tile.largePrimaryIndex:tile.index);
  if(!view?.tile.lot?.isLarge)return 0;
  const pawn=cameraSubject();if(!pawn)return 0;
  const dx=view.group.position.x-pawn.group.position.x,dz=view.group.position.z-pawn.group.position.z;
  // Give a wide estate room beside the pawn without changing building scale,
  // the viewing angle, or the ground point tracked by the delayed camera.
  return THREE.MathUtils.clamp((dx*Math.cos(cameraView.yaw)-dz*Math.sin(cameraView.yaw))*.6,-1.4,1.4);
}
function frameLocalEstate(delta){
  if(!camera||!isLocalCamera()){localFramingBias=0;return false;}
  // Holding the view or inspecting a model must not add automatic movement.
  if(inspection||cameraGesture.pointers.size)return false;
  const target=localFramingTarget(),difference=target-localFramingBias;
  if(Math.abs(difference)<.0001)return false;
  if(reducedMotion.matches&&(cameraSubject()?.active||typeof snapshot?.animation?.currentTile==='number'))return false;
  const change=reducedMotion.matches||Math.abs(difference)<.001?difference:difference*(1-Math.exp(-delta/.30));
  localFramingBias+=change;camera.left+=change;camera.right+=change;camera.updateProjectionMatrix();
  lotViews.forEach(view=>{view.screenPoint=null;});arrangeLabels();
  return true;
}
function followCamera(delta){
  if(!camera||!cameraFocusReady||!isLocalCamera()||(!cameraView.following&&!cameraBrowseTarget)||inspection||cameraGesture.pointers.size)return false;
  const pawn=cameraSubject();if(!pawn)return false;
  const switchingPlayer=followedPlayerId!==snapshot.currentPlayerId;followedPlayerId=snapshot.currentPlayerId;
  // Track the acting pawn's ground position only. Dice and effects do not
  // make the camera bob or turn; a new turn uses the same delayed translation.
  const subject=cameraBrowseTarget||pawn.group.position;
  const dx=subject.x-cameraFocus.x,dz=subject.z-cameraFocus.z;
  const followScale=Math.max(1,cameraView.zoom);
  const distance=Math.hypot(dx,dz),deadZone=cameraBrowseTarget?.02:.36/followScale;
  if(distance<=deadZone+.001)return false;
  let amount;
  if(reducedMotion.matches){
    // In reduced motion the whole trip completes before one static reframe.
    if(!cameraBrowseTarget&&(pawn.active||typeof snapshot?.animation?.currentTile==='number'))return false;
    amount=1;
  }else{
    // A dead zone absorbs small changes (including co-located pawn spacing).
    // Exponential easing is stable at different frame rates; bounded travel
    // also gives teleports a comfortable transition without forcing rotation.
    // A tighter zoom has less visible ground: shorten the lag proportionally
    // so normal walking cannot carry the pawn outside the phone's viewport.
    const crossingHarbor=!cameraBrowseTarget&&snapshot?.mapId==='harbor'&&!switchingPlayer&&(pawn.active||typeof snapshot?.animation?.currentTile==='number');
    const lag=crossingHarbor?.32/Math.pow(followScale,1.8):.32/followScale;
    const speedLimit=crossingHarbor?26:18;
    amount=Math.min((1-Math.exp(-delta/lag))*(distance-deadZone),speedLimit*delta)/distance;
  }
  const x=dx*amount,z=dz*amount;
  cameraFocus.x+=x;cameraFocus.z+=z;camera.position.x+=x;camera.position.z+=z;
  camera.updateMatrixWorld(true);
  lotViews.forEach(view=>{view.screenPoint=null;});arrangeLabels();
  return true;
}
function resize(){
  if(!renderer||!wrap)return;
  const rect=wrap.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);
  if(rendererWidth!==width||rendererHeight!==height){renderer.setSize(width,height,false);rendererWidth=width;rendererHeight=height;}
  labels.classList.toggle('scene-labels-compact',width<720);
  labels.classList.toggle('scene-labels-tiny',width<460);
  if(boardBounds){
    const local=isLocalCamera();lastLocalCamera=local;
    // Keep facades and pawn faces visible on a phone. Changing canvas shape
    // only blends between shallow three-quarter angles, never a top-down view.
    const aspect=width/height;
    const wide=THREE.MathUtils.clamp((aspect-1.05)/.85,0,1);
    let yaw=THREE.MathUtils.lerp(.65,.10,wide);
    const portraitElevation=.78,wideElevation=.62;
    let elevation=THREE.MathUtils.lerp(portraitElevation,wideElevation,wide);
    if(snapshot?.mapId==='expansion'){
      // Turn toward the long side on a phone: the 28-step rectangle then uses
      // the available height instead of squeezing ten buildings across 390px.
      const portrait=THREE.MathUtils.clamp((1.40-aspect)/.65,0,1);
      yaw=THREE.MathUtils.lerp(.10,-1.47,portrait);elevation=THREE.MathUtils.lerp(wideElevation,portraitElevation,portrait);
    }
    if(cameraView.facingYaw===null)cameraView.facingYaw=yaw;
    if(cameraView.modified){yaw=cameraView.yaw;elevation=cameraView.elevation;}
    else{cameraView.yaw=yaw;cameraView.elevation=elevation;}
    camera.position.set(Math.sin(yaw)*22,Math.tan(elevation)*22,Math.cos(yaw)*22);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
    if(snapshot?.mapId!=='classic')lotViews.forEach((view)=>{
      // Choose a readable initial frontage once. Buildings remain physical
      // objects when the player rotates the camera, never facing billboards.
      if(view.parcelRotation==null&&view.readableRotation===undefined&&['chance','card_draw','bank','rush','teleport'].includes(view.tile.special?.type)){
        view.readableRotation=Math.round(cameraView.facingYaw/(Math.PI/2))*(Math.PI/2);
        view.building?.children.forEach((model)=>{model.rotation.y=(model.userData.cityBaseRotationY||0)+lotModelRotation(view);});
      }
      const normal=view.boundary.normal.clone();
      if(normal.x*Math.sin(yaw)+normal.z*Math.cos(yaw)<0)normal.negate();
      const depth=parcelFrontDepth(view,normal);
      view.anchor.copy(view.group.position).add(normal.multiplyScalar(depth/2+.26));view.anchor.y=.07;
    });
    if(local){
      if(!cameraFocusReady){
        const pawn=cameraSubject();
        cameraFocus.set(pawn?.group.position.x||0,.2,pawn?.group.position.z||0);cameraFocusReady=true;
      }
      camera.position.add(cameraFocus);camera.lookAt(cameraFocus);camera.updateMatrixWorld(true);
      // Keep nearby buildings legible on a phone instead of fitting the full
      // island into its narrow width. A small upward framing bias leaves room
      // above the pawn for tall buildings and below it for the action bar.
      const vertical=Math.max(3.9,3.5/aspect)/cameraView.zoom,centerY=.55;
      camera.left=-vertical*aspect+localFramingBias;camera.right=vertical*aspect+localFramingBias;camera.top=vertical+centerY;camera.bottom=-vertical+centerY;camera.updateProjectionMatrix();
    }else{
    localFramingBias=0;
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
  }
  lotViews.forEach(view=>{view.screenPoint=null;});
  arrangeLabels();positionLabels();
  syncCameraControls();
  renderDirty=true;
}
function inspectTile(index){
  let tile=snapshot?.board?.find((item)=>item.index===Number(index));
  if(!tile)return false;
  if(tile.isLargeSecondary)tile=snapshot.board[tile.largePrimaryIndex];
  if(!tile||tile.lot&&!(tile.lot.level>0))return false;
  cancelCameraGesture();
  closeInspection();
  const dialog=document.createElement('dialog');dialog.id='city-building-inspection';dialog.className='city-model-dialog';dialog.setAttribute('aria-labelledby','city-model-title');
  dialog.innerHTML=`<header class="city-model-header"><div><p class="city-model-eyebrow">${tile.lot?'建筑近看':'地标近看'}</p><h2 id="city-model-title"></h2></div><button type="button" class="city-model-close" data-model-close aria-label="关闭近看">✕</button></header><div class="city-model-stage"><div class="city-model-canvas"></div><span class="city-model-level-badge"></span><p class="city-model-hint" aria-live="polite"></p></div><footer class="city-model-footer"><div class="city-model-view-tools" role="group" aria-label="调整建筑视角"><button type="button" data-model-turn="-1" aria-label="向左转动建筑">↶</button><button type="button" data-model-turn="1" aria-label="向右转动建筑">↷</button><span></span><button type="button" data-model-zoom="-1" aria-label="缩小建筑">−</button><button type="button" data-model-zoom="1" aria-label="放大建筑">＋</button><button type="button" data-model-reset>恢复视角</button></div></footer>`;
  const returnFocus=document.activeElement;
  document.body.appendChild(dialog);document.body.classList.add('city-inspection-open');
  const state={dialog,tile,mapId:snapshot.mapId,sessionId:snapshot.sessionId,level:tile.lot?THREE.MathUtils.clamp(Math.floor(tile.lot.level),1,3):0,returnFocus,renderer:null,scene:null,camera:null,pivot:null,environment:null,observer:null,resources:[],angle:0,zoom:1,elevation:.78,bounds:null,drag:null};
  inspection=state;
  syncCameraControls();
  dialog.querySelector('#city-model-title').textContent=tile.name;
  dialog.addEventListener('cancel',(event)=>{event.preventDefault();event.stopPropagation();closeInspection();});
  dialog.addEventListener('click',(event)=>{
    event.stopPropagation();
    if(event.target===dialog||event.target.closest('[data-model-close]')){closeInspection();return;}
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
    void loadModelKit(false,true);
    return true;
  }catch(error){
    console.warn('The building preview could not start.',error);
    dialog.querySelector('.city-model-canvas').innerHTML='<p class="city-model-unavailable">暂时无法查看建筑</p>';
    return false;
  }
}
function renderInspectionModel(){
  const state=inspection;if(!state?.renderer||!state.pivot)return;
  state.pivot.children.forEach(model=>ownershipRoofs?.release(model));
  state.modelResources?.forEach(resource=>resource.dispose?.());state.modelResources=[];
  const ownPreview=resource=>{state.modelResources.push(resource);return resource;};
  state.pivot.clear();
  const data={mapId:state.mapId};const current=createLotModel(state.tile,data,state.level,null,ownPreview);
  state.pivot.add(current.model);
  state.pivot.rotation.y=0;state.pivot.updateMatrixWorld(true);
  state.bounds=new THREE.Box3().setFromObject(current.model);
  if(state.bounds.isEmpty())state.bounds.set(new THREE.Vector3(-.5,0,-.5),new THREE.Vector3(.5,1,.5));
  state.dialog.querySelector('.city-model-hint').textContent=current.asset.source?'':failedBundles.has(`regions/${state.mapId}.glb`)?'建筑未载入，重新打开可重试':'建筑加载中…';
  state.elevation=state.bounds.max.y>2.5?.57:.78;
  state.dialog.dataset.tileIndex=String(state.tile.index);state.dialog.dataset.modelKey=current.asset.desired;state.dialog.dataset.loadedModel=current.asset.source?current.asset.key:'';state.dialog.dataset.level=String(state.level);
  state.dialog.querySelector('.city-model-level-badge').textContent=state.tile.lot?`Lv.${state.level}${state.level===3?' · 满级':''}`:'城市地标';
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
  // Frame the building that is actually on the board, including after its model loads.
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
  state.pivot?.children.forEach(model=>ownershipRoofs?.release(model));
  state.modelResources?.forEach(resource=>resource.dispose?.());
  state.observer?.disconnect();state.environment?.dispose();state.resources.forEach((resource)=>resource.dispose?.());state.renderer?.dispose();state.renderer?.forceContextLoss();
  if(state.dialog.open)state.dialog.close();state.dialog.remove();document.body.classList.remove('city-inspection-open');
  syncCameraControls();
  if(state.returnFocus?.isConnected)state.returnFocus.focus({preventScroll:true});
}
function tick(time){
  if(disposed)return;frame=requestAnimationFrame(tick);
  if(document.body.classList.contains('town-open')){lastTime=time;return;}
  if(!snapshot||document.hidden||time-lastTime<24)return;
  const delta=Math.min(.1,(time-lastTime)/1000);lastTime=time;
  sceneLife?.setInteractionPaused(Boolean(inspection||cameraGesture.pointers.size));
  const living=sceneLife?.tick(time,delta);
  flushBuildingCelebrations(time);
  const celebrating=buildingFireworks?.tick(time);
  const projectsGrowing=harborSceneRoot&&tickHarborProjectVisuals(harborSceneRoot,time,{reducedMotion:reducedMotion.matches,night:sceneLife?.getNightFactor()||0});
  if(time-lastAtmosphereReadout>250){lastAtmosphereReadout=time;syncAtmosphereReadout();}
  const moving=[...pawnViews.values()].some((view)=>view.active||view.shieldUntil)||[...lotViews.values()].some((view)=>view.born)||pulses.length;
  pawnViews.forEach((view)=>{
    updatePawnMotion(view,time,delta);
    if(view.shieldUntil&&time>view.shieldUntil){view.shieldUntil=0;const p=snapshot.players.find((p)=>p.id===view.anchor.dataset.playerAnchor);view.shield.visible=Boolean(p?.effects?.shield);}
  });
  const cameraMoving=followCamera(delta),framingMoving=frameLocalEstate(delta);
  if(!moving&&!renderDirty&&!living&&!cameraMoving&&!framingMoving&&!celebrating&&!projectsGrowing)return;renderDirty=false;
  lotViews.forEach((view)=>{
    if(view.born){const t=Math.min(1,(time-view.born)/650);view.building.scale.y=reducedMotion.matches?1:1-Math.pow(1-t,3)*.22;if(t===1){view.born=0;view.building.scale.y=1;}}
  });
  for(let i=pulses.length-1;i>=0;i--){const pulse=pulses[i];const elapsed=time-pulse.started;if(elapsed<0)continue;const t=elapsed/pulse.duration;
    if(t>=1){pulse.view.outline.material.opacity=pulse.view.purchaseSelected?.85:0;pulse.view.label.classList.remove('is-event');pulses.splice(i,1);continue;}
    pulse.view.outline.material.opacity=pulse.view.purchaseSelected?.85:reducedMotion.matches?.45:Math.sin(t*Math.PI)*.83;
  }
  positionLabels();renderer.render(scene,camera);
}
function installModelBundle(bundle,gltf){
  const priority=ASSET_BUNDLES.indexOf(bundle),entries=[];
  let matched=0;
  gltf.scene.traverse(object=>{
    if(!bundle.pattern.test(object.name))return;
    matched++;
    // The movable replacement wins even when its smaller file arrives first.
    if(priority<(modelPriorities.get(object.name)??-1))return;
    entries.push({name:object.name,model:optimizeModel(object),envelope:bundle.authored?calculateEnvelope(object):null});
  });
  if(!matched)throw Error(`No compatible models in ${bundle.file}`);
  entries.forEach(({name,model,envelope})=>{
    modelLibrary.get(name)?.traverse(node=>{if(node.geometry)obsoleteModelGeometry.add(node.geometry);});
    modelLibrary.set(name,model);modelPriorities.set(name,priority);
    if(bundle.authored){authoredModels.add(name);assetEnvelopes.set(name,envelope);}
  });
  loadedBundles.add(bundle.file);failedBundles.delete(bundle.file);
  installedModelSources.set(bundle.file,gltf);
}
function retireReplacedModels(){
  // This runs after the map and inspection have dropped their previous copies.
  const retained=new Set();modelLibrary.forEach(model=>model.traverse(node=>{if(node.geometry)retained.add(node.geometry);}));
  for(const geometry of obsoleteModelGeometry){
    if(!retained.has(geometry)){if(!ownsSharedModelResource(geometry))geometry.dispose();modelResources.delete(geometry);}
  }
  obsoleteModelGeometry.clear();
  for(const [file,gltf] of installedModelSources)releaseSupersededModelAssets(file,gltf);
}
function scheduleModelRefresh(bundle,force=false){
  if(!snapshot&&!inspection)return;
  if(bundle.mapId&&bundle.mapId!==snapshot?.mapId&&bundle.mapId!==inspection?.mapId)return;
  sceneryRefreshNeeded=sceneryRefreshNeeded||bundle.file==='city-kit.glb'||(force&&!!bundle.mapId);
  if(assetRefreshFrame)return;
  assetRefreshFrame=requestAnimationFrame(()=>{
    assetRefreshFrame=0;const rebuildScenery=sceneryRefreshNeeded;sceneryRefreshNeeded=false;
    if(disposed)return;
    if(snapshot){
      if(rebuildScenery)buildMap(snapshot);
      else snapshot.board.filter(tile=>!tile.isLargeSecondary).forEach(tile=>{const view=lotViews.get(tile.index);if(view)updateLot(view,tile,snapshot,true);});
      // Preserve the current pawns, camera and atmosphere when only buildings arrive.
      update(snapshot);if(!rebuildScenery)resize();
    }
    if(inspection)renderInspectionModel();
    if(rebuildScenery)retireReplacedModels();
    window.dispatchEvent(new CustomEvent('city:models-ready',{detail:{count:modelLibrary.size,bundles:[...loadedBundles]}}));
  });
}
async function loadModelKit(force=false,retryMissing=false){
  if(disposed||!snapshot)return;
  const needed=ASSET_BUNDLES.filter(bundle=>!bundle.mapId||bundle.mapId===snapshot.mapId);
  const requests=[];
  needed.forEach(bundle=>{
    const pending=bundleRequests.get(bundle.file);
    if(pending){requests.push(pending);return;}
    if(!force&&(loadedBundles.has(bundle.file)||failedBundles.has(bundle.file)&&!retryMissing))return;
    const request=Promise.resolve()
      .then(()=>loadSharedModelAsset(bundle.file,{version:bundle.version,force}))
      .then(gltf=>{if(!disposed&&(!bundle.mapId||bundle.mapId===snapshot?.mapId)){try{installModelBundle(bundle,gltf);scheduleModelRefresh(bundle,force);}catch(error){forgetSharedModelAsset(bundle.file,gltf);throw error;}}})
      .catch(error=>{if(!disposed&&error?.name!=='AbortError'&&(!bundle.mapId||bundle.mapId===snapshot?.mapId)){failedBundles.add(bundle.file);if(inspection)renderInspectionModel();console.info(`City model ${bundle.file} could not load. Open a building preview to retry.`,error?.message);}})
      .finally(()=>{if(bundleRequests.get(bundle.file)===request)bundleRequests.delete(bundle.file);});
    bundleRequests.set(bundle.file,request);requests.push(request);
  });
  // Callers may await the batch, but each successful package installs immediately.
  return Promise.allSettled(requests);
}
window.addEventListener('pagehide',()=>{disposed=true;closeInspection();cancelAnimationFrame(frame);cancelAnimationFrame(assetRefreshFrame);observer?.disconnect();clearMap();modelResources.forEach(resource=>{if(!ownsSharedModelResource(resource))resource.dispose();});modelResources.clear();disposeSharedModelAssets();studioEnvironment?.dispose();renderer?.dispose();});
window.dispatchEvent(new CustomEvent('city:ready'));

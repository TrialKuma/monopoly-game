import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import {harborEdgePath,harborWalkOffset} from '../scene-harbor-paths.js';

const source=fs.readFileSync(new URL('../scene.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
function fixture(width=390,height=620){
  const classes=new Set(),media={matches:false};
  const context=vm.createContext({THREE,harborEdgePath,harborWalkOffset,console,performance,CustomEvent:class{},
    window:{matchMedia:()=>media,addEventListener(){},dispatchEvent(){}},
    document:{body:{classList:{contains:key=>classes.has(key)}},getElementById:()=>null},
  });
  const run=code=>vm.runInContext(code,context);
  run(source);context.size={width,height};
  run(`
    camera=new THREE.OrthographicCamera(-10,10,7,-7,.1,100);
    renderer={setSize(){}};wrap={dataset:{},getBoundingClientRect:()=>size};labels={classList:{toggle(){}}};
    boardBounds={w:14.4,d:12.6};snapshot={phase:'idle',mapId:'classic',currentPlayerId:'human',players:[{id:'human',position:0},{id:'ai',position:0}],animation:{currentTile:null}};
    pawnViews.set('human',{group:new THREE.Group(),active:false,anchor:{style:{}}});
    pawnViews.set('ai',{group:new THREE.Group(),active:false,anchor:{style:{}}});
    resize();
  `);
  const position=()=>run('cameraFocus.clone()');
  const move=(x,z,y=.265)=>{context.destination={x,y,z};run('pawnViews.get("human").group.position.set(destination.x,destination.y,destination.z)');};
  const step=(seconds=1/60)=>run(`followCamera(${seconds})`);
  return {run,position,move,step,classes,media,context};
}

// Local framing begins with whichever pawn acts first, including an AI opening.
{
  const f=fixture();
  f.run('snapshot.currentPlayerId="ai";pawnViews.get("ai").group.position.set(8,.265,-4);cameraFocusReady=false;resize()');
  assert.deepEqual(f.position(),new THREE.Vector3(8,.2,-4));
  f.move(-9,7);assert.equal(f.step(),false,'an inactive human pawn is not followed');
  f.run('snapshot.currentPlayerId="missing"');assert.equal(f.step(),true,'an incomplete snapshot still has a safe pawn fallback');
}

// Default gameplay focuses locally; menu/showcase retain their established map view.
{
  const f=fixture();assert.equal(f.run('api.getView().local'),true);
  assert.ok(f.run('camera.right-camera.left')<=7.01,'portrait shows approximately four tiles across');
  f.classes.add('mode-start');f.run('resize()');assert.equal(f.run('api.getView().local'),false);
  assert.ok(f.run('camera.right-camera.left')>14,'menu still fits the whole board');
  f.classes.delete('mode-start');f.classes.add('mode-showcase');f.run('resize()');
  assert.equal(f.run('api.getView().local'),false);f.classes.clear();
  f.run('resize()');assert.equal(f.run('api.getView().local'),true);
  f.run('snapshot.targetSelection={};resize()');assert.equal(f.run('api.getView().local'),false);
  assert.ok(f.run('camera.right-camera.left')>14,'board-wide target choices remain accessible');
  f.run('snapshot.targetSelection=null;resize()');assert.equal(f.run('api.getView().local'),true);
}

// Small spacing changes and animated jumps do not move the camera.
{
  const f=fixture(),initial=f.position();
  f.move(.2,.1,4);assert.equal(f.step(),false);assert.deepEqual(f.position(),initial);
  f.run('pawnViews.get("ai").group.position.set(12,.265,12)');assert.equal(f.step(),false);
  f.move(3,0);assert.equal(f.step(),true);
  assert.ok(f.position().x>0&&f.position().x<.3,'one frame does not lock to the pawn');
  for(let i=0;i<180;i++)f.step();
  assert.ok(Math.abs(3-f.position().x-.36)<.005,'follow settles inside a stable dead zone');
  assert.equal(f.position().y,.2,'pawn bounce never affects camera height');
}

// Both players remain identifiable while standing on the same landing.
{
  const f=fixture();
  f.run(`pawnViews.get('human').anchor.offsetWidth=46;pawnViews.get('ai').anchor.offsetWidth=60;positionLabels()`);
  const badges=f.run(`[...pawnViews.values()].map(view=>({transform:view.anchor.style.transform,width:view.anchor.offsetWidth,hidden:view.anchor.hidden}))`);
  assert.ok(badges.every(badge=>!badge.hidden));
  const centers=badges.map(badge=>Number(badge.transform.match(/translate\(([-\d.]+)px/)[1]));
  assert.ok(Math.abs(centers[1]-centers[0])>=59,'player name badges do not overlap');
}

// Follow is time based and keeps the same angle, including long teleports.
{
  const a=fixture(),b=fixture(),yaw=a.run('cameraView.yaw');a.move(15,-9);b.move(15,-9);
  const before=a.run('camera.quaternion.clone()');
  for(let i=0;i<60;i++)a.step(1/60);
  for(let i=0;i<30;i++)b.step(1/30);
  assert.ok(a.position().distanceTo(b.position())<.08,'similar travel across frame rates');
  assert.equal(a.run('cameraView.yaw'),yaw);assert.deepEqual(a.run('camera.quaternion.clone()'),before);
  assert.ok(a.position().distanceTo(new THREE.Vector3(15,.2,-9))>.36,'teleport is eased, not snapped');
}

// Orbit/zoom keep following; only an active gesture pauses it until release.
{
  const f=fixture();f.run('changeCameraView(.3,0,1.15)');
  assert.equal(f.run('cameraView.following'),true);const held=f.position();
  const angle=f.run('cameraView.yaw'),zoom=f.run('cameraView.zoom');
  f.run('cameraGesture.pointers.set(1,{x:0,y:0})');
  f.move(7,3);assert.equal(f.step(),false);assert.deepEqual(f.position(),held);
  f.run('cameraPointerUp({pointerId:1})');assert.equal(f.step(),true);
  assert.equal(f.run('cameraView.yaw'),angle);assert.equal(f.run('cameraView.zoom'),zoom);
  const released=f.position();f.run('resetCameraView(true)');assert.deepEqual(f.position(),released);assert.equal(f.step(),true);
  assert.equal(f.run('setCameraMode("overview")'),true);const overview=f.run('camera.position.clone()');
  f.move(-8,-5);assert.equal(f.step(),false);assert.deepEqual(f.run('camera.position.clone()'),overview);
  f.run('setCameraMode("local")');assert.ok(f.position().distanceTo(new THREE.Vector3(-8,.2,-5))<.001);
}

// Respect reduced motion: one reframe after the complete movement, no per-step panning.
{
  const f=fixture();f.media.matches=true;f.move(8,-4);
  f.run('snapshot.animation.currentTile=3');assert.equal(f.step(),false);
  f.run('snapshot.animation.currentTile=null;pawnViews.get("human").active=true');assert.equal(f.step(),false);
  f.run('pawnViews.get("human").active=false');assert.equal(f.step(),true);
  assert.deepEqual(f.position(),new THREE.Vector3(8,.2,-4));assert.equal(f.step(),false);
  f.run('snapshot.currentPlayerId="ai";pawnViews.get("ai").group.position.set(-7,.265,3);snapshot.animation.currentTile=7');
  assert.equal(f.step(),false,'AI travel also waits until the full move finishes');
  f.run('snapshot.animation.currentTile=null');assert.equal(f.step(),true);
  assert.deepEqual(f.position(),new THREE.Vector3(-7,.2,3));
  f.run('snapshot.currentPlayerId="human"');assert.equal(f.step(),true);
  assert.deepEqual(f.position(),new THREE.Vector3(8,.2,-4),'reduced motion reframes to the returning player');
}

// A turn may change during a held gesture or overview; neither overrides user control.
{
  const f=fixture();f.run('changeCameraView(.3,.1,1.4);cameraGesture.pointers.set(1,{x:0,y:0})');
  const held=f.position(),angle=f.run('cameraView.yaw'),zoom=f.run('cameraView.zoom');
  f.run('snapshot.currentPlayerId="ai";pawnViews.get("ai").group.position.set(9,.265,-4)');
  assert.equal(f.step(),false);assert.deepEqual(f.position(),held);
  f.run('cameraPointerUp({pointerId:1})');assert.equal(f.step(),true);
  assert.ok(f.position().distanceTo(held)<=18/60+.001,'release eases toward the active opponent');
  assert.equal(f.run('cameraView.yaw'),angle);assert.equal(f.run('cameraView.zoom'),zoom);
  f.run('setCameraMode("overview")');const overview=f.run('camera.position.clone()');
  f.run('snapshot.currentPlayerId="human"');f.move(-8,5);
  assert.equal(f.step(),false);assert.deepEqual(f.run('camera.position.clone()'),overview);
  f.run('snapshot.currentPlayerId="ai"');assert.equal(f.step(),false);
  assert.deepEqual(f.run('camera.position.clone()'),overview);
}

// The fastest ordinary route stays inside the local viewport on each aspect and map.
const game=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const createBoard=game.slice(game.indexOf('function createBoard('),game.indexOf('function prepareOpeningLots('));
const maps=vm.runInNewContext(game.slice(0,game.indexOf('const CARD_POOL'))+createBoard+';Object.values(MAP_PRESETS).map(map=>({map,board:createBoard(map)}));');

// Exercise the production presentation snapshot, scene update and animation
// tick together. This must move the camera without directly moving a pawn in
// the test: real game positions are the only source of the animated target.
const presentation=fs.readFileSync(new URL('../presentation.js',import.meta.url),'utf8');
const snapshotFunction=presentation.slice(presentation.indexOf('  function snapshot()'),presentation.indexOf('  function syncCityScene()'));
const realNavigation=game.slice(game.indexOf('function getMapNavigation('),game.indexOf('const HARBOR_FAMILIES'))+
  game.slice(game.indexOf('function resetHarborJourney('),game.indexOf('function chooseAiHarborRoute('))+
  game.slice(game.indexOf('function getNextTileIndex('),game.indexOf('function previewMovement('));
const gameplay=vm.createContext({});
vm.runInContext(game.slice(0,game.indexOf('const CARD_POOL'))+createBoard+
  game.slice(game.indexOf('function defaultEffects()'),game.indexOf('function getMaxRounds('))+
  game.slice(game.indexOf('function currentPlayer()'),game.indexOf('function getPlayerById('))+
  'let state,selected=null;function rentFor(){return {total:0};}'+realNavigation+snapshotFunction,gameplay);
for(const {map,board} of maps){
  gameplay.mapId=map.id;
  vm.runInContext(`state={sessionId:17,currentMapId:mapId,board:createBoard(getMapConfig(mapId)),
    players:PLAYER_DEFS.map(p=>({...p,position:0,selectedRoute:'merchant',harborLastBranch:'merchant',harborTrail:[],harborAnchor:0,harborDistance:0,effects:defaultEffects()})),currentPlayerIndex:0,
    phase:'await_roll',animation:{currentTile:null,landedTile:null},targetSelection:null};`,gameplay);
  const f=fixture(),data=()=>vm.runInContext('snapshot()',gameplay);let now=1000;
  f.context.performance={now:()=>now};f.context.requestAnimationFrame=()=>1;
  f.context.document.body.classList.add=key=>f.classes.add(key);
  f.context.document.createElement=()=>({dataset:{},style:{},classList:{toggle(){}},setAttribute(){}});
  f.context.snapshotData=data();
  f.run(`snapshot=snapshotData;mapKey=snapshot.sessionId+':'+snapshot.mapId+':'+snapshot.board.length;
    world=new THREE.Group();renderer.render=()=>{};labels.querySelectorAll=()=>[];labels.appendChild=()=>{};
    mount=()=>true;loadModelKit=()=>{};pawnViews.clear();
    const xs=snapshot.board.map(tile=>tile.x),zs=snapshot.board.map(tile=>tile.y);
    const cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;
    boardBounds={w:(Math.max(...xs)-Math.min(...xs))*STEP,d:(Math.max(...zs)-Math.min(...zs))*STEP};
    for(const tile of snapshot.board){const center=new THREE.Vector3((tile.x-cx)*STEP,.14,(tile.y-cz)*STEP);
      const offset=snapshot.mapId==='harbor'?harborWalkOffset(tile,THREE):new THREE.Vector3();
      stepViews.set(tile.index,{center,walk:center.clone().add(offset),normal:offset.lengthSq()?offset.clone().normalize():new THREE.Vector3(0,0,1),ring:{material:{color:new THREE.Color()}}});}
    snapshot.players.forEach(makePawn);cameraFocusReady=false;resize();update(snapshotData);
  `);
  assert.equal(f.run('pawnViews.has(snapshot.players.find(p=>!p.isAi).id)'),true,'the real player definition has a scene pawn');
  const initial=f.position(),defaultView=f.run('({...cameraView})');f.run('changeCameraView(.2,0,1.15)');
  const yaw=f.run('cameraView.yaw');
  for(let step=0;step<5;step++){
    vm.runInContext('{const p=state.players.find(p=>!p.isAi);p.position=getNextTileIndex(p,p.position,1,true);state.animation.currentTile=p.position;}',gameplay);
    f.context.snapshotData=data();f.run('update(snapshotData)');
    assert.equal(f.run('pawnViews.get(snapshot.players.find(p=>!p.isAi).id).active'),true,'state movement starts the real pawn animation');
    for(let frame=0;frame<6;frame++){now+=32;f.run(`tick(${now})`);}
  }
  vm.runInContext('state.animation.currentTile=null;',gameplay);f.context.snapshotData=data();f.run('update(snapshotData)');
  for(let frame=0;frame<60;frame++){now+=32;f.run(`tick(${now})`);}
  assert.ok(f.position().distanceTo(initial)>1,`${map.id}: changing game position moves the camera after manual orbit/zoom`);
  assert.equal(f.run('cameraView.yaw'),yaw,'following preserves the chosen angle');
  assert.ok(f.run('Math.hypot(cameraFocus.x-pawnViews.get("human").group.position.x,cameraFocus.z-pawnViews.get("human").group.position.z)')<.37);
  const humanFocus=f.position();
  vm.runInContext('state.currentPlayerIndex=1;state.players[1].position=10;state.animation.currentTile=10;',gameplay);
  f.context.snapshotData=data();f.run('update(snapshotData)');
  assert.deepEqual(f.position(),humanFocus,'switching to the opponent never snaps the focus in update');
  now+=32;f.run(`tick(${now})`);
  assert.ok(f.position().distanceTo(humanFocus)<=18*.032+.001,'the first opponent frame has bounded translation');
  for(let frame=0;frame<90;frame++){now+=32;f.run(`tick(${now})`);}
  assert.ok(f.position().distanceTo(humanFocus)>1,`${map.id}: the opponent turn is followed`);
  assert.ok(f.run('Math.hypot(cameraFocus.x-pawnViews.get("ai").group.position.x,cameraFocus.z-pawnViews.get("ai").group.position.z)')<.37);
  const aiFocus=f.position();
  for(let step=0;step<3;step++){
    vm.runInContext('{const p=currentPlayer();p.position=getNextTileIndex(p,p.position,1,true);state.animation.currentTile=p.position;}',gameplay);
    f.context.snapshotData=data();f.run('update(snapshotData)');
    for(let frame=0;frame<6;frame++){now+=32;f.run(`tick(${now})`);}
  }
  vm.runInContext('state.animation.currentTile=null;',gameplay);f.context.snapshotData=data();f.run('update(snapshotData)');
  for(let frame=0;frame<45;frame++){now+=32;f.run(`tick(${now})`);}
  assert.ok(f.position().distanceTo(aiFocus)>1,`${map.id}: walking during the opponent turn moves the camera`);
  assert.ok(f.run('Math.hypot(cameraFocus.x-pawnViews.get("ai").group.position.x,cameraFocus.z-pawnViews.get("ai").group.position.z)')<.37);
  const beforeReturn=f.position();
  vm.runInContext('state.currentPlayerIndex=0;',gameplay);f.context.snapshotData=data();f.run('update(snapshotData)');
  assert.deepEqual(f.position(),beforeReturn,'returning to the player does not snap the focus');
  now+=32;f.run(`tick(${now})`);
  assert.ok(f.position().distanceTo(beforeReturn)<=18*.032+.001,'the first returning frame also eases');
  for(let frame=0;frame<90;frame++){now+=32;f.run(`tick(${now})`);}
  assert.ok(f.run('Math.hypot(cameraFocus.x-pawnViews.get("human").group.position.x,cameraFocus.z-pawnViews.get("human").group.position.z)')<.37);
  assert.equal(f.run('cameraView.yaw'),yaw,'all turn transitions preserve manual orientation');
  assert.equal(f.run('cameraView.zoom'),1.15,'all turn transitions preserve manual zoom');

  // Real presentation snapshots and production update() enter a temporary,
  // movable full-board municipal view, then restore the player's local view.
  let modalVisible=true;
  f.context.document.getElementById=id=>id==='event-overlay'?{classList:{contains:key=>key==='visible'&&modalVisible}}:id==='drama-layer'?{hidden:true}:null;
  const modeButton={dataset:{camera:'mode'},style:{},setAttribute(){}},resetButton={dataset:{camera:'reset'},style:{},setAttribute(){}},output={};
  f.context.controls={querySelectorAll:selector=>selector==='button'?[modeButton,resetButton]:[],querySelector:selector=>selector==='output'?output:selector==='[data-camera="mode"]'?modeButton:selector==='[data-camera="reset"]'?resetButton:null};
  f.run('cameraControls=controls;wrap.parentElement={classList:{add(){},remove(){}},setPointerCapture(){},hasPointerCapture(){return false;}}');
  const saved=JSON.parse(f.run('JSON.stringify(cameraView)'));
  vm.runInContext(`{const props=state.board.filter(t=>t.lot&&!t.isLargeSecondary);state.modal={visible:true,boardTargets:[props.find(t=>!t.lot.isLarge).index,props.find(t=>t.lot.isLarge).index]};}`,gameplay);
  f.context.snapshotData=data();f.run('update(snapshotData)');
  assert.equal(f.run('isLocalCamera()'),false,`${map.id}: municipal choice fits the full board`);
  assert.equal(f.run('canMoveCamera()'),true,'property choice permits orbit and zoom while its panel is visible');
  assert.equal(f.run('cameraView.zoom'),1);assert.equal(f.run('cameraView.yaw'),defaultView.yaw);assert.equal(f.run('cameraView.elevation'),defaultView.elevation);
  assert.equal(modeButton.hidden,true,'local/overview switch is hidden during board-wide selection');
  assert.equal(resetButton.disabled,false);
  const selections=[];
  f.context.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
  f.context.window.dispatchEvent=event=>selections.push(event);
  f.run('selectSceneTile(snapshot.targetSelection.indices[0])');
  assert.equal(selections.length,1);assert.equal(selections[0].type,'city:select');
  const selectedBefore=f.run('selectedIndex');
  for(const invalid of [-1,9999,0,board.find(tile=>tile.lot&&!tile.isLargeSecondary&&!data().targetSelection.indices.includes(tile.index)).index]){
    f.context.invalidIndex=invalid;f.run('selectSceneTile(invalidIndex)');
    assert.equal(f.run('selectedIndex'),selectedBefore,'scene rejects an ineligible step before changing highlight');
    assert.equal(selections.length,1,'scene never dispatches an ineligible property target');
  }
  f.run('selectSceneTile(snapshot.board.find(tile=>tile.isLargeSecondary&&snapshot.targetSelection.indices.includes(tile.largePrimaryIndex)).index)');
  assert.equal(selections.length,2);
  assert.equal(selections[1].detail.index,data().targetSelection.indices[1],'scene normalizes the secondary half before dispatch');
  assert.equal(f.run('selectedIndex'),data().targetSelection.indices[1],'selection highlight uses the primary land parcel');
  f.context.pointerTarget={closest:()=>true};
  f.run(`cameraPointerDown({target:pointerTarget,pointerType:'touch',pointerId:101,clientX:100,clientY:100,preventDefault(){}});
    cameraPointerMove({pointerId:101,clientX:130,clientY:114,preventDefault(){}});`);
  assert.notEqual(f.run('cameraView.yaw'),defaultView.yaw,'touch dragging rotates the visible choice board');
  f.run(`cameraPointerDown({target:pointerTarget,pointerType:'touch',pointerId:102,clientX:210,clientY:114,preventDefault(){}});
    cameraPointerMove({pointerId:102,clientX:250,clientY:114,preventDefault(){}});
    cameraPointerUp({pointerId:102});cameraPointerUp({pointerId:101});`);
  assert.ok(f.run('cameraView.zoom')>1,'two-finger pinch zoom works through a property modal');
  const browsing=JSON.parse(f.run('JSON.stringify(cameraView)'));
  vm.runInContext('selected=state.modal.boardTargets[1];',gameplay);
  f.context.snapshotData=data();f.run('update(snapshotData)');
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(cameraView)')),browsing,'changing the preview preserves manual browsing orientation and zoom');
  function checkSuspendedHome(stage){
    const remembered=f.run('propertyCameraView'),selected=f.run('selectedIndex');
    f.run(`cameraPointerDown({target:pointerTarget,pointerType:'touch',pointerId:202,clientX:80,clientY:90,preventDefault(){}})`);
    assert.equal(f.run('cameraGesture.pointers.size'),1);
    vm.runInContext('var resumedMunicipalModal=state.modal;state.modal={visible:true,boardContext:{indices:resumedMunicipalModal.boardTargets,selectedTarget:selected}};',gameplay);
    f.context.snapshotData=data();f.run('update(snapshotData)');
    assert.equal(f.run('snapshot.targetSelection.suspended'),true,`${map.id} ${stage}: real snapshot marks the temporary home confirmation suspended`);
    assert.equal(f.run('propertyCameraView'),remembered,'home confirmation never replaces or releases the saved camera');
    assert.deepEqual(JSON.parse(f.run('JSON.stringify(cameraView)')),browsing,'opening home does not reset the browsing angle/zoom');
    assert.equal(f.run('selectedIndex'),selected);
    assert.equal(f.run('canSelectScene()'),false,'home confirmation blocks the actual scene-click entry gate');
    assert.equal(f.run('canMoveCamera()'),false);
    assert.equal(f.run('cameraGesture.pointers.size'),0,'home confirmation cancels a held touch without changing the view');
    assert.equal(resetButton.disabled,true);
    assert.equal(f.run('changeCameraView(.4,.1,1.4)'),false,'buttons/wheel cannot alter the suspended view');
    f.run(`cameraPointerDown({target:pointerTarget,pointerType:'touch',pointerId:203,clientX:80,clientY:90,preventDefault(){}});
      cameraPointerMove({pointerId:203,clientX:140,clientY:130,preventDefault(){}});`);
    assert.equal(f.run('cameraGesture.pointers.size'),0,'new touch input is rejected while suspended');
    assert.deepEqual(JSON.parse(f.run('JSON.stringify(cameraView)')),browsing);
    vm.runInContext('state.modal=resumedMunicipalModal;',gameplay);
    f.context.snapshotData=data();f.run('update(snapshotData)');
    assert.equal(f.run('propertyCameraView'),remembered);
    assert.deepEqual(JSON.parse(f.run('JSON.stringify(cameraView)')),browsing,'continue game resumes the same browsing view');
    assert.equal(f.run('selectedIndex'),selected);assert.equal(f.run('canSelectScene()'),true);assert.equal(f.run('canMoveCamera()'),true);
    assert.equal(resetButton.disabled,false);
  }
  checkSuspendedHome('target picker');
  vm.runInContext('state.modal.boardTargets=[selected];',gameplay);
  f.context.snapshotData=data();f.run('update(snapshotData)');
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(cameraView)')),browsing,'the confirmation quote preserves the same browsing view');
  checkSuspendedHome('quote');
  modalVisible=false;vm.runInContext('state.modal={visible:false};',gameplay);
  f.context.snapshotData=data();f.run('update(snapshotData)');
  assert.deepEqual(JSON.parse(f.run('JSON.stringify(cameraView)')),saved,'leaving the municipal flow restores the exact saved view');
  assert.equal(f.run('isLocalCamera()'),true);assert.equal(modeButton.hidden,false);
  assert.equal(f.run('propertyCameraView'),null);
  modalVisible=true;
  assert.equal(f.run('canMoveCamera()'),false,'ordinary blocking modal cannot move the camera');
  f.run('snapshot.targetSelection={kind:"dice",indices:[1]}');
  assert.equal(f.run('canSelectScene()'),true,'ordinary target picking still receives board clicks');
  assert.equal(f.run('canMoveCamera()'),false,'non-property target modal does not accidentally gain orbit gestures');
}

let checkedFrames=0;
for(const [width,height] of [[390,620],[360,560],[740,380]])for(const {map,board} of maps)for(const zoom of [1,2.4]){
  const f=fixture(width,height);f.context.map=map;
  f.run('snapshot.mapId=map.id;snapshot.animation.currentTile=0');
  const cx=(Math.min(...board.map(t=>t.x))+Math.max(...board.map(t=>t.x)))/2;
  const cz=(Math.min(...board.map(t=>t.y))+Math.max(...board.map(t=>t.y)))/2;
  const coords=tile=>({x:(tile.x-cx)*1.8,z:(tile.y-cz)*1.8});
  if(map.id==='harbor'){
    const steps=new Map(board.map(tile=>{const p=coords(tile),center=new THREE.Vector3(p.x,.265,p.z);return[tile.index,{center,walk:center.clone().add(harborWalkOffset(tile,THREE))}];}));
    const covered=new Set();
    for(const branch of ['merchant','resort'])for(const direction of [1,-1]){
      let index=0;const initial=steps.get(0).walk;f.move(initial.x,initial.z);f.run(`cameraFocusReady=false;resize();changeCameraView(0,0,${zoom})`);
      for(let n=0;n<24;n++){
        const next=direction>0?(index===7?(branch==='resort'?18:8):map.navigation.next[index]):(index===28?(branch==='resort'?27:17):map.navigation.prev[index]);
        covered.add(direction>0?`${index}:${next}`:`${next}:${index}`);
        const route=harborEdgePath(index,next,steps,THREE),lengths=route.slice(1).map((p,i)=>p.distanceTo(route[i])),total=lengths.reduce((a,b)=>a+b,0),duration=Math.max(190,Math.min(650,total*112));
        for(let segment=1;segment<route.length;segment++){
          const from=route[segment-1],to=route[segment],frames=Math.max(3,Math.ceil(duration/1000*60*lengths[segment-1]/total));
          for(let frame=1;frame<=frames;frame++){
            f.move(from.x+(to.x-from.x)*frame/frames,from.z+(to.z-from.z)*frame/frames);f.step(1/60);
            const point=f.run('pawnViews.get("human").group.position.clone().project(camera)');
            assert(Math.abs(point.x)<.97&&Math.abs(point.y)<.97,`harbor ${branch} direction ${direction} ${width}x${height} zoom ${zoom} edge ${index}→${next}: actual curved route stays visible`);checkedFrames++;
          }
        }
        index=next;
      }
      assert.equal(index,0,'both camera tours complete their actual branch lap');
    }
    assert.equal(covered.size,35,'camera framing checks every branch edge in both directions');
    continue;
  }
  let tile=board[0],from=coords(tile);f.move(from.x,from.z);f.run(`cameraFocusReady=false;resize();changeCameraView(0,0,${zoom})`);
  for(let i=0;i<board.length;i++){
    tile=board[map.navigation.next[tile.index]];const to=coords(tile);
    for(let frame=1;frame<=11;frame++){
      f.move(from.x+(to.x-from.x)*frame/11,from.z+(to.z-from.z)*frame/11);f.step(1/60);
      const point=f.run('pawnViews.get("human").group.position.clone().project(camera)');
      assert.ok(Math.abs(point.x)<.97&&Math.abs(point.y)<.97,`${map.id} ${width}x${height} zoom ${zoom}: pawn stays visible during movement (${point.x}, ${point.y})`);checkedFrames++;
    }
    from=to;
  }
}
console.log(`PASS acting-player camera, smooth round-trip turn changes, gesture release, overview, reduced motion, ${maps.length} municipal modal orbit/pinch/save/restore flows with suspended home input locks at both stages, ${maps.length} real snapshot/update/tick paths and ${checkedFrames} route frames at normal/maximum zoom`);

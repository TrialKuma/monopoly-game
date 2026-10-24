import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';

const source=fs.readFileSync(new URL('../scene.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
function fixture(width=390,height=620){
  const classes=new Set(),media={matches:false};
  const context=vm.createContext({THREE,console,performance,CustomEvent:class{},
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
const gameplay=vm.createContext({});
vm.runInContext(game.slice(0,game.indexOf('const CARD_POOL'))+createBoard+
  game.slice(game.indexOf('function defaultEffects()'),game.indexOf('function getMaxRounds('))+
  game.slice(game.indexOf('function currentPlayer()'),game.indexOf('function getPlayerById('))+
  'let state,selected=null;function rentFor(){return {total:0};}'+snapshotFunction,gameplay);
for(const {map,board} of maps){
  gameplay.mapId=map.id;
  vm.runInContext(`state={sessionId:17,currentMapId:mapId,board:createBoard(getMapConfig(mapId)),
    players:PLAYER_DEFS.map(p=>({...p,position:0,effects:defaultEffects()})),currentPlayerIndex:0,
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
      stepViews.set(tile.index,{center,walk:center.clone(),normal:new THREE.Vector3(0,0,1),ring:{material:{color:new THREE.Color()}}});}
    snapshot.players.forEach(makePawn);cameraFocusReady=false;resize();update(snapshotData);
  `);
  assert.equal(f.run('pawnViews.has(snapshot.players.find(p=>!p.isAi).id)'),true,'the real player definition has a scene pawn');
  const initial=f.position();f.run('changeCameraView(.2,0,1.15)');
  const yaw=f.run('cameraView.yaw');
  for(let step=0;step<5;step++){
    vm.runInContext('{const p=state.players.find(p=>!p.isAi);p.position=getMapConfig().navigation.next[p.position];state.animation.currentTile=p.position;}',gameplay);
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
    vm.runInContext('{const p=currentPlayer();p.position=getMapConfig().navigation.next[p.position];state.animation.currentTile=p.position;}',gameplay);
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
}

let checkedFrames=0;
for(const [width,height] of [[390,620],[360,560],[740,380]])for(const {map,board} of maps)for(const zoom of [1,2.4]){
  const f=fixture(width,height);f.context.map=map;
  f.run('snapshot.mapId=map.id');
  const cx=(Math.min(...board.map(t=>t.x))+Math.max(...board.map(t=>t.x)))/2;
  const cz=(Math.min(...board.map(t=>t.y))+Math.max(...board.map(t=>t.y)))/2;
  const coords=tile=>({x:(tile.x-cx)*1.8,z:(tile.y-cz)*1.8});
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
console.log(`PASS acting-player camera, smooth round-trip turn changes, gesture release, overview, reduced motion, ${maps.length} real snapshot/update/tick paths and ${checkedFrames} route frames at normal/maximum zoom`);

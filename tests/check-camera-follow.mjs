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
    boardBounds={w:14.4,d:12.6};snapshot={phase:'idle',mapId:'classic',players:[{id:'human',position:0}],animation:{currentTile:null}};
    pawnViews.set('human',{group:new THREE.Group(),active:false,anchor:{style:{}}});
    pawnViews.set('ai',{group:new THREE.Group(),active:false,anchor:{style:{}}});
    resize();
  `);
  const position=()=>run('cameraFocus.clone()');
  const move=(x,z,y=.265)=>{context.destination={x,y,z};run('pawnViews.get("human").group.position.set(destination.x,destination.y,destination.z)');};
  const step=(seconds=1/60)=>run(`followCamera(${seconds})`);
  return {run,position,move,step,classes,media,context};
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

// Manual orbit/zoom suspends following; returning resumes from the current location.
{
  const f=fixture();f.run('changeCameraView(.3,0,1.15)');
  assert.equal(f.run('cameraView.following'),false);const held=f.position();
  f.move(7,3);assert.equal(f.step(),false);assert.deepEqual(f.position(),held);
  f.run('resetCameraView(true)');assert.deepEqual(f.position(),held);assert.equal(f.step(),true);
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
}

// The fastest ordinary route stays inside the local viewport on each aspect and map.
const game=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const createBoard=game.slice(game.indexOf('function createBoard('),game.indexOf('function prepareOpeningLots('));
const maps=vm.runInNewContext(game.slice(0,game.indexOf('const CARD_POOL'))+createBoard+';Object.values(MAP_PRESETS).map(map=>({map,board:createBoard(map)}));');
let checkedFrames=0;
for(const [width,height] of [[390,620],[360,560],[740,380]])for(const {map,board} of maps){
  const f=fixture(width,height);f.context.map=map;
  f.run('snapshot.mapId=map.id');
  const cx=(Math.min(...board.map(t=>t.x))+Math.max(...board.map(t=>t.x)))/2;
  const cz=(Math.min(...board.map(t=>t.y))+Math.max(...board.map(t=>t.y)))/2;
  const coords=tile=>({x:(tile.x-cx)*1.8,z:(tile.y-cz)*1.8});
  let tile=board[0],from=coords(tile);f.move(from.x,from.z);f.run('cameraFocusReady=false;resize()');
  for(let i=0;i<board.length;i++){
    tile=board[map.navigation.next[tile.index]];const to=coords(tile);
    for(let frame=1;frame<=11;frame++){
      f.move(from.x+(to.x-from.x)*frame/11,from.z+(to.z-from.z)*frame/11);f.step(1/60);
      const point=f.run('pawnViews.get("human").group.position.clone().project(camera)');
      assert.ok(Math.abs(point.x)<.97&&Math.abs(point.y)<.97,`${map.id} ${width}x${height}: pawn stays visible during movement (${point.x}, ${point.y})`);checkedFrames++;
    }
    from=to;
  }
}
console.log(`PASS local camera defaults, delayed follow, manual control, overview, reduced motion and ${checkedFrames} route frames`);

import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const THREE=await import(pathToFileURL(root+'assets/vendor/three/three.module.min.js'));
class Node {constructor(){this.dataset={};this.nodes=new Map();this.classList={toggle(){},add(){},remove(){}};this.style={setProperty(){}};}querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Node());return this.nodes.get(key);}setAttribute(){}appendChild(){}replaceChildren(){}}
const context=vm.createContext({THREE,console,document:{createElement:()=>new Node()},window:{matchMedia:()=>({matches:false}),addEventListener(){},dispatchEvent(){}},performance,CustomEvent:class{}});
const run=code=>vm.runInContext(code,context);
run(fs.readFileSync(root+'scene.js','utf8').replace(/^import .*;\r?\n/gm,''));
run('world=new THREE.Group();labels=document.createElement("div");');
const game=fs.readFileSync(root+'game.js','utf8');
const createBoard=game.slice(game.indexOf('function createBoard('),game.indexOf('function prepareOpeningLots('));
const maps=vm.runInNewContext(game.slice(0,game.indexOf('const CARD_POOL'))+createBoard+';Object.fromEntries(Object.values(MAP_PRESETS).map(map=>[map.id,{map,board:createBoard(map)}]));');
let ownedParcels=0,largeParcels=0,rayChecks=0;
for(const mapId of ['classic','compact','expansion']){
 const {board}=maps[mapId];board.forEach(t=>{if(t.lot&&!t.isLargeSecondary){t.lot.ownerId=t.index%2?'human':'ai';t.lot.level=1;}});
 context.data={mapId,sessionId:'frames',board,players:[{id:'human'},{id:'ai'}]};
 run('clearMap();snapshot=data;');
 run(`var px=data.board.map(t=>t.x),py=data.board.map(t=>t.y);boardBounds={minX:Math.min(...px),maxX:Math.max(...px),minY:Math.min(...py),maxY:Math.max(...py)};boardBounds.cx=(boardBounds.minX+boardBounds.maxX)/2;boardBounds.cy=(boardBounds.minY+boardBounds.maxY)/2;data.board.forEach(t=>stepViews.set(t.index,{center:tilePosition(t)}));data.board.filter(t=>!t.isLargeSecondary).forEach(t=>makeLot(t,data));`);
 const views=run('[...lotViews.values()]');
 for(const view of views){
  assert.equal(view.ownerFrame.visible,!!view.tile.lot);assert.equal(view.group.getObjectsByProperty('name','ownership_frame').length,1);
  if(!view.tile.lot)continue;
  ownedParcels++;if(view.tile.lot.isLarge)largeParcels++;
  const frame=view.ownerFrame,outline=view.outline;
  assert.notEqual(frame.material,outline.material);assert.equal(frame.material.emissive.getHex(),0);
  frame.geometry.computeBoundingBox();const b=frame.geometry.boundingBox;
  assert.ok(Math.abs(b.min.x+(view.w-.055)/2)<1e-6&&Math.abs(b.max.z-(view.d-.055)/2)<1e-6,'frame uses merged parcel bounds');
  const positions=frame.geometry.attributes.position;
  for(let i=0;i<positions.count;i++)assert.ok(Math.abs(positions.getX(i))<=view.w/2&&Math.abs(positions.getZ(i))<=view.d/2,'every vertex contained in parcel');
  const w=view.w-.055,d=view.d-.055,t=.070,r=.105;
  const points=[[0,d/2-t/2],[0,-d/2+t/2],[w/2-t/2,0],[-w/2+t/2,0]];
  for(const x of [-1,1])for(const z of [-1,1])points.push([x*(w/2-r*.25-t*.375),z*(d/2-r*.25-t*.375)]);
  const ray=new THREE.Raycaster();
  for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5,.73]){
   view.group.rotation.y=rotation;worldUpdate();
   for(const [x,z] of points){ray.set(view.group.localToWorld(new THREE.Vector3(x,.7,z)),new THREE.Vector3(0,-1,0));assert.ok(ray.intersectObject(frame).length>0,'closed frame at sides and rounded corners after rotation');assert.equal(ray.intersectObject(outline).length,0,'event outline never covers deed frame');rayChecks++;}
   ray.set(view.group.localToWorld(new THREE.Vector3(0,.7,0)),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(frame).length,0,'frame center is open, including merged lot seam');
  }
  view.group.rotation.y=0;context.view=view;
  const deedColor=frame.material.color.getHex();run('effect({type:"select",tiles:[view.tile.index]});effect({type:"rent",tiles:[view.tile.index,view.tile.index]})');assert.equal(run('pulses.filter(p=>p.view===view).length'),1,'new event owns one outer frame');assert.equal(frame.material.color.getHex(),deedColor);assert.equal(frame.material.emissive.getHex(),0);
  view.tile.lot.ownerId=null;run('updateLot(view,view.tile,data,true)');assert.equal(frame.visible,false,'unowned loses ownership boundary');
  view.tile.lot.ownerId='ai';run('updateLot(view,view.tile,data,true)');assert.equal(frame.visible,true);assert.equal(frame.material.color.getHexString(),'d77b59','ownership transfer recolors whole boundary');
 }
 console.log(`PASS ${mapId}: ${views.filter(v=>v.tile.lot).length} real parcel frames`);
}
function worldUpdate(){run('world.updateMatrixWorld(true)');}
run(`modelLibrary.set('vault_bank',new THREE.Group());modelLibrary.set('compact_vault_bank',new THREE.Group());modelLibrary.set('expansion_vault_bank',new THREE.Group());var bankTile={index:4,special:{type:'bank'}};`);
assert.equal(run("resolveAsset(bankTile,{mapId:'classic'}).key"),'vault_bank');
assert.equal(run("resolveAsset(bankTile,{mapId:'compact'}).key"),'compact_vault_bank');
assert.equal(run("resolveAsset(bankTile,{mapId:'expansion'}).key"),'expansion_vault_bank');
run("modelLibrary.delete('compact_vault_bank')");assert.equal(run("resolveAsset(bankTile,{mapId:'compact'}).key"),'vault_bank');
console.log(JSON.stringify({ownedParcels,largeParcels,rayChecks,modelRouting:'passed',failures:0}));

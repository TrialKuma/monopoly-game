import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { GLTFLoader } from '../assets/vendor/three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../assets/vendor/three/addons/utils/BufferGeometryUtils.js';

class Element {
  constructor(){this.dataset={};this.nodes=new Map();this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};}
  querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Element());return this.nodes.get(key);}
  setAttribute(){} appendChild(){} replaceChildren(){}
}
const context=vm.createContext({THREE,GLTFLoader,mergeGeometries,performance,console,CustomEvent:class{},document:{createElement:()=>new Element()},window:{matchMedia:()=>({matches:false}),addEventListener(){},dispatchEvent(){}}});
const run=code=>vm.runInContext(code,context);
run(fs.readFileSync(new URL('../scene.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''));
run('world=new THREE.Group(); labels=document.createElement("div"); numberTexture=()=>new THREE.Texture();');
const source=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const createBoard=source.slice(source.indexOf('function createBoard('),source.indexOf('function prepareOpeningLots('));
const maps=vm.runInNewContext(source.slice(0,source.indexOf('const CARD_POOL'))+createBoard+';Object.values(MAP_PRESETS).map(map=>({map,board:createBoard(map)}));');
const files=['city-kit','landmarks','specials','life-specials','compact-specials','expansion-specials'];
for(const file of files){
  const bytes=fs.readFileSync(new URL('../assets/models/'+file+'.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  context.gltf=gltf;context.file=file+'.glb';run('installModelBundle(ASSET_BUNDLES.find(bundle=>bundle.file===file),gltf)');
}
let landings=0,corners=0,clearanceChecks=0,sharedChecks=0;
for(const {map,board} of maps){
  board.forEach(tile=>{if(tile.lot){tile.lot.level=3;tile.lot.ownerId='ai';}});
  context.data={mapId:map.id,board,players:[{id:'human',position:0},{id:'ai',position:0}],navigation:map.navigation};
  run('clearMap();snapshot=data;');
  run(`var xs=data.board.map(t=>t.x),ys=data.board.map(t=>t.y);boardBounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};boardBounds.cx=(boardBounds.minX+boardBounds.maxX)/2;boardBounds.cy=(boardBounds.minY+boardBounds.maxY)/2;boardBounds.w=(boardBounds.maxX-boardBounds.minX+1)*STEP;boardBounds.d=(boardBounds.maxY-boardBounds.minY+1)*STEP;data.board.forEach(makeStep);data.board.filter(t=>!t.isLargeSecondary).forEach(t=>makeLot(t,data));world.updateMatrixWorld(true);`);
  const steps=run('[...stepViews.entries()]');
  // Actual authored meshes, not nominal plot rectangles: test a pawn-sized
  // capsule footprint at every landing, including both steps of large lots.
  const meshes=[];for(const view of run('[...lotViews.values()]'))view.building.traverse(n=>{if(n.isMesh)meshes.push(n);});
  const ray=new THREE.Raycaster();
  function assertPawnClear(position,name){
    for(let i=0;i<9;i++){
      const angle=(i-1)*Math.PI/4,r=i===0?0:.195;
      ray.set(new THREE.Vector3(position.x+Math.cos(angle)*r,position.y+6,position.z+Math.sin(angle)*r),new THREE.Vector3(0,-1,0));ray.near=0;ray.far=5.975;
      const hit=ray.intersectObjects(meshes,false)[0];assert.equal(hit,undefined,name+' must clear actual roof/wall geometry');clearanceChecks++;
    }
  }
  for(const [index,step] of steps){
    landings++;if(step.corner)corners++;
    assert.equal(step.landing.name,'landing_pad_'+index);assert.ok(step.landing.children.length>=2);
    context.index=index;run('data.players[0].position=index;data.players[1].position=(index+3)%data.board.length');
    const position=run('pawnPosition(data.players[0])');assert.equal(position.x,step.walk.x);assert.equal(position.z,step.walk.z);assertPawnClear(position,map.id+' '+index);
    run('data.players[1].position=index');const players=run('data.players.map(p=>pawnPosition(p))');
    assert.ok(players[0].distanceTo(players[1])>.33,'co-located pawns get separate places');sharedChecks++;
    players.forEach(p=>assertPawnClear(p,map.id+' shared '+index));
    const next=run('stepViews.get(snapshot.navigation.next[index]).walk');assert.ok(step.walk.distanceTo(next)> .7,'corner markers do not collapse onto adjacent steps');
  }
  console.log('PASS '+map.id+': '+steps.length+' landing pads with authored buildings at max level');
}
assert.equal(corners,12);assert.equal(landings,68);assert.equal(sharedChecks,68);
console.log(JSON.stringify({landings,corners,sharedChecks,clearanceChecks,failures:0}));

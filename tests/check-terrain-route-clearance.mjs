import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import {createRegionalPark,createRegionalSurroundings} from '../scene-regional-parks.js';
import {buildDestinationGarden} from '../scene-garden-kit.js';

// The actual production board, landing positions and default portrait camera
// drive this check. No fixed map-size fixture or enclosing scenery box stands
// in for geometry: a sea under the board is safe; a stone above a route is not.
const gameCode=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const sceneCode=fs.readFileSync(new URL('../scene.js',import.meta.url),'utf8');
const mapIds=['classic','compact','expansion','harbor','alpine'];
const boardContext=vm.createContext({});
vm.runInContext(gameCode.slice(0,gameCode.indexOf('const CARD_POOL'))+
  gameCode.slice(gameCode.indexOf('function createBoard('),gameCode.indexOf('function prepareOpeningLots(')),boardContext);
const geometryMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const originalRemove=THREE.Object3D.prototype.removeFromParent;
const totals={maps:0,newMeshes:0,routeRays:0,parcelRays:0,cameraRays:0,allLandscapeCameraHits:0};

class Element {
  constructor(){this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.dataset={};}
  appendChild(){}setAttribute(){}
}
function productionLayout(mapId){
  const {map,board}=vm.runInContext(`({map:MAP_PRESETS.${mapId},board:createBoard(MAP_PRESETS.${mapId})})`,boardContext);
  const context=vm.createContext({THREE,performance,console,CustomEvent:class{},window:{matchMedia:()=>({matches:false}),addEventListener(){},dispatchEvent(){}},document:{createElement:()=>new Element()}});
  const run=code=>vm.runInContext(code,context);
  run(sceneCode.replace(/^import .*;\r?\n/gm,''));context.data={mapId,board,players:[{id:'human',position:0},{id:'ai',position:0}],navigation:map.navigation};
  run(`world=new THREE.Group();labels=document.createElement('div');snapshot=data;numberTexture=()=>own(new THREE.Texture());
    var xs=data.board.map(t=>t.x),zs=data.board.map(t=>t.y);
    boardBounds={minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...zs),maxY:Math.max(...zs)};
    boardBounds.cx=(boardBounds.minX+boardBounds.maxX)/2;boardBounds.cy=(boardBounds.minY+boardBounds.maxY)/2;
    boardBounds.w=(boardBounds.maxX-boardBounds.minX+1)*STEP;boardBounds.d=(boardBounds.maxY-boardBounds.minY+1)*STEP;
    data.board.forEach(makeStep);
    wrap={getBoundingClientRect:()=>({width:390,height:844}),dataset:{}};renderer={setSize(){}};
    camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,200);isLocalCamera=()=>true;cameraFocusReady=true;
    labels.classList={toggle(){}};arrangeLabels=()=>{};positionLabels=()=>{};syncCameraControls=()=>{};resize();`);
  const bounds=run('boardBounds'),steps=run('[...stepViews.values()].map(s=>({walk:s.walk.clone(),normal:s.normal.clone()}))');
  const cameraDirection=run('camera.position.clone().sub(cameraFocus).normalize()');
  const tileCenters=run('data.board.map(tile=>tilePosition(tile))');
  const shared=[];
  for(const tile of board){context.index=tile.index;run('data.players.forEach(p=>p.position=index)');shared.push(run('data.players.map(p=>pawnPosition(p))'));}
  run('resources.forEach(r=>r.dispose());');
  return {board,map,bounds,steps,cameraDirection,tileCenters,shared};
}
function snapshotMesh(mesh){
  const copy=new THREE.Mesh(mesh.geometry,geometryMaterial);copy.name=mesh.name;
  copy.matrixWorld.copy(mesh.matrixWorld);copy.matrixAutoUpdate=false;
  return {mesh:copy,bounds:new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(mesh.matrixWorld)};
}
function hasNewLayer(node){for(let p=node;p;p=p.parent)if(p.userData.terrainLayer)return true;return false;}
function rayHit(rows,origin,direction,far){
  const ray=new THREE.Raycaster(origin,direction,0,far),point=new THREE.Vector3();
  for(const row of rows){
    const broad=ray.ray.intersectBox(row.bounds,point);
    if(!broad||point.distanceTo(origin)>far)continue;
    const hits=[];THREE.Mesh.prototype.raycast.call(row.mesh,ray,hits);
    if(hits.length)return {name:row.mesh.name,point:hits[0].point.toArray().map(n=>Number(n.toFixed(3)))};
  }
  return null;
}
function verticalHit(rows,x,z,minY){return rayHit(rows,new THREE.Vector3(x,12,z),new THREE.Vector3(0,-1,0),12-minY);}
function cameraHit(rows,target,direction){
  // Orthographic rays are parallel. Stop at the pawn, never behind it where
  // distant fountains and trees are perfectly legitimate background scenery.
  const origin=target.clone().addScaledVector(direction,45);
  return rayHit(rows,origin,direction.clone().negate(),44.98);
}
const describe=hit=>hit?`${hit.name||'mesh'} at ${hit.point.join(', ')}`:'none';

try{
  for(const mapId of mapIds){
    const layout=productionLayout(mapId),{bounds,steps,board,cameraDirection,tileCenters,shared}=layout;
    const resources=new Set(),own=r=>{resources.add(r);return r;},world=new THREE.Group(),fresh=[],captured=new Set();
    // Static batching deliberately discards authoring metadata. Capture the
    // actual new meshes at that boundary, after world transforms are final.
    THREE.Object3D.prototype.removeFromParent=function(){
      if(this.isMesh&&hasNewLayer(this)&&!captured.has(this)){fresh.push(snapshotMesh(this));captured.add(this);}
      return originalRemove.call(this);
    };
    try{
      if(['harbor','alpine'].includes(mapId)){
        const root=new THREE.Group(),perimeter=new THREE.Group();root.add(perimeter);world.add(root);
        buildDestinationGarden({THREE,own,root,perimeter,mapId,w:bounds.w,d:bounds.d,innerW:bounds.w-4.7,innerD:bounds.d-4.65,waves:[],boats:[],steam:[]});
      }else{
        createRegionalPark({THREE,world,boardBounds:bounds,mapId,own});
        const root=new THREE.Group();world.add(root);createRegionalSurroundings({THREE,root,own,boardBounds:bounds,mapId});
      }
    }finally{THREE.Object3D.prototype.removeFromParent=originalRemove;}
    world.updateMatrixWorld(true);
    world.traverse(node=>{if(node.isMesh&&hasNewLayer(node)&&!captured.has(node))fresh.push(snapshotMesh(node));});
    assert(fresh.length>0,`${mapId} must exercise newly authored terrain, not only the old garden`);
    const all=[];world.traverse(node=>{if(node.isMesh)all.push(snapshotMesh(node));});
    const count={routeRays:0,parcelRays:0,cameraRays:0,allLandscapeCameraHits:0};
    const failures=[];
    function checkVertical(x,z,height,label,key){
      count[key]++;const hit=verticalHit(fresh,x,z,height);if(hit&&failures.length<8)failures.push(`${label}: ${describe(hit)}`);
    }
    // Sample the actual connected route, its .25-radius walking corridor, and
    // both displaced pawns when sharing one landing. Includes all four corners.
    for(const [index,step] of steps.entries()){
      const nextIndex=layout.map.navigation?.next?.[index]??(index+1)%steps.length,next=steps[nextIndex].walk;
      const segments=Math.ceil(step.walk.distanceTo(next)/.14);
      for(let j=0;j<=segments;j++){
        const p=step.walk.clone().lerp(next,j/segments);
        for(let k=0;k<9;k++){
          const a=(k-1)*Math.PI/4,r=k? .25:0;
          checkVertical(p.x+Math.cos(a)*r,p.z+Math.sin(a)*r,.235,`route ${index} segment ${j}`, 'routeRays');
        }
      }
      for(const pawn of shared[index])for(let k=0;k<9;k++){
        const a=(k-1)*Math.PI/4,r=k?.20:0;
        checkVertical(pawn.x+Math.cos(a)*r,pawn.z+Math.sin(a)*r,.265,`shared landing ${index}`, 'routeRays');
      }
    }
    // Every physical tile, including the secondary half of large parcels, is
    // protected. This checks the real 1.43-wide deed area, not the empty center.
    assert(/const w = 1\.43 \+/.test(sceneCode)&&/const d = 1\.43 \+/.test(sceneCode),'update parcel sampling if production footprint changes');
    for(const [index,p] of tileCenters.entries())for(let x=0;x<=10;x++)for(let z=0;z<=10;z++){
      checkVertical(p.x-.715+x*.143,p.z-.715+z*.143,.18,`parcel ${index}`, 'parcelRays');
    }
    for(const [index,step] of steps.entries())for(const p of [step.walk,...shared[index]])for(const h of [.17,.31,.47]){
      const target=new THREE.Vector3(p.x,.265+h,p.z);count.cameraRays++;
      const hit=cameraHit(fresh,target,cameraDirection);
      if(hit&&failures.length<8)failures.push(`portrait pawn ${index}, height ${h}: ${describe(hit)}`);
      if(cameraHit(all,target,cameraDirection))count.allLandscapeCameraHits++;
    }
    // Negative and positive controls prevent a disabled picking function or a
    // broad bounding box from producing an unearned green result.
    const probe=new THREE.Mesh(new THREE.BoxGeometry(.12,.4,.12),geometryMaterial),p=steps[0].walk;
    probe.position.set(p.x,.4,p.z);probe.updateMatrixWorld(true);
    assert(verticalHit([snapshotMesh(probe)],p.x,p.z,.235),'an intruding stone must fail');
    const target=new THREE.Vector3(p.x,.575,p.z);
    probe.position.copy(target).addScaledVector(cameraDirection,1);probe.updateMatrixWorld(true);
    assert(cameraHit([snapshotMesh(probe)],target,cameraDirection),'an object between the camera and pawn must fail');
    probe.position.copy(target).addScaledVector(cameraDirection,-1);probe.updateMatrixWorld(true);
    assert.equal(cameraHit([snapshotMesh(probe)],target,cameraDirection),null,'scenery behind the pawn must not be treated as foreground occlusion');
    const sea=new THREE.Mesh(new THREE.PlaneGeometry(200,200),geometryMaterial);sea.rotation.x=-Math.PI/2;sea.position.y=-.43;sea.updateMatrixWorld(true);
    assert.equal(verticalHit([snapshotMesh(sea)],p.x,p.z,.235),null,'a sea below the board must not fail from its huge bounding box');
    probe.geometry.dispose();sea.geometry.dispose();resources.forEach(r=>r.dispose());
    assert.deepEqual(failures,[],`${mapId} new terrain obstructs the board or a default portrait pawn`);
    totals.maps++;totals.newMeshes+=fresh.length;for(const key of Object.keys(count))totals[key]+=count[key];
    console.log(JSON.stringify({mapId,board:board.length,bounds:{w:bounds.w,d:bounds.d},newMeshes:fresh.length,...count,failures:0}));
  }
  console.log(`PASS all five production maps: new terrain preserves routes, parcels and default portrait pawn sightlines`);
  console.log(JSON.stringify(totals));
}finally{THREE.Object3D.prototype.removeFromParent=originalRemove;geometryMaterial.dispose();}

import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import {createCityOutskirts} from '../scene-outskirts.js';
import {createRegionalPark} from '../scene-regional-parks.js';

let checks=0;
async function test(name,run){await run();checks++;console.log(`PASS ${name}`);}
const pending=()=>new Promise(()=>{});
function fixture(mapId='compact',w=12.6,d=10.8,loadSceneryBundle=pending){
 const world=new THREE.Group(),borrowed=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial());world.add(borrowed);let requests=0;
 const api=createCityOutskirts({THREE,world,boardBounds:{w,d},mapId,loadSceneryBundle,requestRender:()=>requests++});
 return {world,root:world.getObjectByName('city_outskirts'),api,borrowed,requests:()=>requests};
}
function shapeData(root){const values=[];root.updateMatrixWorld(true);root.traverse(n=>{if(n.isMesh){values.push(Array.from(n.geometry.attributes.position.array));values.push(n.matrixWorld.toArray());}});return values;}
function fakeBundle(mapId,regional=true){
 const scene=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:'#ccc9a9'}),geometry=new THREE.BoxGeometry(1,1,1);
 for(const key of ['villa_3','shop_2','hotel_2','tower_2']){const group=new THREE.Group();group.name=regional?`${mapId}_${key}`:key;const mesh=new THREE.Mesh(geometry,material);mesh.position.y=.5;group.add(mesh);scene.add(group);}
 return {scene,material,geometry};
}

await test('regional landscape is clear of the board, has low near edges and stays within a mobile draw budget',()=>{
 for(const [mapId,w,d] of [['classic',12.6,10.8],['compact',16.2,12.6],['expansion',19.8,18]]){
  const f=fixture(mapId,w,d);let count=0,triangles=0,shadowDraws=0;f.root.updateMatrixWorld(true);
  f.root.traverse(node=>{
   if(!node.isMesh)return;count++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;
   if(node.castShadow)shadowDraws++;const intersections=[];node.raycast({},intersections);assert.equal(intersections.length,0);
   const positions=node.geometry.attributes.position;
   for(let i=0;i<positions.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld);
    assert(v.toArray().every(Number.isFinite));assert(Math.abs(v.x)>w/2+.64||Math.abs(v.z)>d/2+.64,`${mapId} intersects plinth ${v.toArray()}`);
    const outward=Math.max(Math.abs(v.x)-w/2,Math.abs(v.z)-d/2);
    assert(v.y<1.31&&v.y>-.47,`${mapId} landscape height ${v.y}`);if(outward<1.55)assert(v.y<.12,`${mapId} near edge ${v.toArray()}`);
    assert(Math.abs(v.x)<w/2+5.3&&Math.abs(v.z)<d/2+5.3);
   }
  });
  assert(shadowDraws<=12,`${mapId} shadow pass stays bounded`);assert(count>=10&&count<=24,`${mapId} ${count} landscape draws`);assert(triangles<200000,`${mapId} ${triangles} landscape triangles`);f.api.dispose();
 }
});
await test('all four edges and corners carry distinct regional environments',()=>{
 const themes=new Set();for(const mapId of ['classic','compact','expansion']){const f=fixture(mapId);themes.add(f.root.userData.theme);for(let i=0;i<4;i++){assert(f.root.getObjectByName(`outskirts_district_${i}`));assert(f.root.getObjectByName(`outskirts_corner_garden_${i}`));}assert(!f.root.getObjectByName('outskirts_neighbourhood_homes'),'no provisional block buildings');f.api.dispose();}assert.equal(themes.size,3);
});
await test('scenery geometry is deterministic and independent of gameplay randomness',()=>{
 const random=Math.random;let first,second;try{let seed=0;Math.random=()=>++seed%100/100;first=fixture('expansion');Math.random=()=>.73;second=fixture('expansion');assert.deepEqual(shapeData(first.root),shapeData(second.root));}finally{Math.random=random;first?.api.dispose();second?.api.dispose();}
});
await test('night lighting, visibility and paused updates consume no gameplay RNG or extra frame requests',()=>{
 const f=fixture(),random=Math.random;Math.random=()=>{throw new Error('gameplay RNG consumed');};try{
  assert.equal(f.api.tick(.1),false);assert.equal(f.api.tick(.1,{paused:true,reduced:true,night:1}),true);assert.equal(f.api.tick(.1,{night:1}),false);
  assert.equal(f.api.setVisible(false),true);assert.equal(f.api.tick(.1,{night:0}),false);assert.equal(f.root.visible,false);assert.equal(f.borrowed.visible,true);assert.equal(f.requests(),2);
  f.api.setVisible(false);assert.equal(f.requests(),2);f.api.setVisible(true);assert.equal(f.api.tick(.1,{night:0}),true);assert.equal(f.requests(),3);
 }finally{Math.random=random;f.api.dispose();}assert.equal(f.api.setVisible(true),false);
});
await test('real regional nodes replace every neighbourhood plot and stay separately owned',async()=>{
 for(const mapId of ['classic','compact','expansion']){
  const bundle=fakeBundle(mapId),requests=[],f=fixture(mapId,12.6,10.8,async file=>{requests.push(file);return bundle;});await f.api.loading;
  assert.deepEqual(requests,[`regions/${mapId}.glb`]);assert.equal(f.api.getState().regional,true);assert.equal(f.api.getState().ready,true);assert.equal(f.api.getState().buildings,mapId==='expansion'?11:12);
  const neighbourhood=f.root.getObjectByName('outskirts_regional_neighbourhood');assert(neighbourhood);let draws=0;neighbourhood.traverse(n=>{if(n.isMesh)draws++;});assert.equal(draws,1,'regional copies merge by material');
  let releases=0;bundle.geometry.addEventListener('dispose',()=>releases++);bundle.material.addEventListener('dispose',()=>releases++);f.api.dispose();assert.equal(releases,0,'cache owns source resources');bundle.geometry.dispose();bundle.material.dispose();
 }
});
await test('regional network failure never substitutes old architecture, and late loads cannot revive removed scenes',async()=>{
 const bundle=fakeBundle('compact',false),calls=[],f=fixture('compact',12.6,10.8,async file=>{calls.push(file);if(file.startsWith('regions/'))throw new Error('network');return bundle;});await f.api.loading;
 assert.deepEqual(calls,['regions/compact.glb']);assert.equal(f.api.getState().failed,true);assert.equal(f.api.getState().buildings,0);f.api.dispose();
 let resolve;const late=fixture('classic',12.6,10.8,()=>new Promise(r=>resolve=r));late.api.dispose();resolve(fakeBundle('classic'));await late.api.loading;assert.equal(late.world.children.length,1);assert.equal(late.api.getState().ready,false);
});
await test('an incomplete regional bundle cannot silently leave empty house plots',async()=>{
 const bundle=fakeBundle('classic');bundle.scene.getObjectByName('classic_villa_3').removeFromParent();
 const f=fixture('classic',12.6,10.8,async()=>bundle);await f.api.loading;
 assert.equal(f.api.getState().ready,false);assert.equal(f.api.getState().failed,true);assert.equal(f.api.getState().buildings,0);
 assert(!f.root.getObjectByName('outskirts_regional_neighbourhood'));f.api.dispose();bundle.geometry.dispose();bundle.material.dispose();
});
await test('disposal releases owned geometry and materials exactly once while preserving the board',()=>{
 const f=fixture(),resources=new Set();f.root.traverse(n=>{if(n.isMesh){resources.add(n.geometry);resources.add(n.material);}});let releases=0,borrowed=0;resources.forEach(r=>r.addEventListener('dispose',()=>releases++));f.borrowed.geometry.addEventListener('dispose',()=>borrowed++);f.borrowed.material.addEventListener('dispose',()=>borrowed++);f.api.dispose();f.api.dispose();assert.equal(releases,resources.size);assert.equal(borrowed,0);assert.equal(f.world.children.length,1);assert.equal(f.api.tick(.1),false);
});
await test('all regional courtyard parks fit inside their playable-route clearance',()=>{
 for(const [mapId,w,d] of [['classic',12.6,10.8],['compact',10.8,9],['expansion',18,10.8]]){
  const world=new THREE.Group(),owned=new Set(),bounds={w,d};const root=createRegionalPark({THREE,world,boardBounds:bounds,mapId,own:r=>{owned.add(r);return r;}});assert(root);const box=new THREE.Box3().setFromObject(root);
  assert(box.min.x>-(bounds.w-4.7)/2&&box.max.x<(bounds.w-4.7)/2);assert(box.min.z>-(bounds.d-4.65)/2&&box.max.z<(bounds.d-4.65)/2);let draws=0;root.traverse(n=>{if(n.isMesh)draws++;});assert(draws<24);owned.forEach(r=>r.dispose());
 }
});
console.log(`${checks} regional scenery checks passed.`);

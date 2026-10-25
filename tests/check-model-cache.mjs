import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import {createModelAssetCache,reviewModelURL} from '../scene-model-cache.js';

const drain=()=>new Promise(resolve=>setImmediate(resolve));let checks=0;
async function check(name,run){await run();checks++;console.log('PASS '+name);}
await check('unpublished packs can be checked in the actual game without changing formal files',()=>{
  const region='./assets/models/regions/harbor.glb?v=test&refresh=9';
  assert.equal(reviewModelURL(region),region);
  assert.equal(reviewModelURL(region,true),'./art/full-ai-city/packed/harbor.glb?v=test&refresh=9');
  assert.equal(reviewModelURL('./assets/models/harbor/alpine_windmill.glb?v=test',true),'./art/full-ai-city/packed/alpine_windmill.glb?v=test');
  assert.equal(reviewModelURL('./assets/models/regions-far/classic.glb',true),'./art/full-ai-city/packed/classic-far.glb');
  for(const url of ['./assets/models/city-kit.glb','./assets/models/regions/unknown.glb','https://example.com/regions/classic.glb'])assert.equal(reviewModelURL(url,true),url);
});
function fixture(){
  const requests=[],cache=createModelAssetCache({now:()=>1234,load:url=>new Promise((resolve,reject)=>requests.push({url,resolve,reject}))});
  return {requests,cache};
}
function asset(region='alpine',{valid=true,image=null}={}){
  const released={geometry:0,material:0,texture:0,bitmap:0};
  const bitmap=image||{width:2048,height:2048,close(){released.bitmap++;}};
  const texture=new THREE.Texture(bitmap),material=new THREE.MeshStandardMaterial({map:texture,roughnessMap:texture});
  const geometry=new THREE.BoxGeometry(),scene=new THREE.Group(),root=new THREE.Group();root.name=valid?`${region}_villa_1`:'unrelated_root';scene.add(root);root.add(new THREE.Mesh(geometry,material));root.add(new THREE.Mesh(geometry,[material,material]));
  geometry.addEventListener('dispose',()=>released.geometry++);material.addEventListener('dispose',()=>released.material++);texture.addEventListener('dispose',()=>released.texture++);
  return {gltf:{scene,animations:[]},released,geometry,material,texture,bitmap};
}

await check('board and scenery coalesce pending loads and borrow the same decoded resources',async()=>{
  const f=fixture(),a=f.cache.load('regions/alpine.glb'),b=f.cache.load('regions/alpine.glb'),forced=f.cache.load('regions/alpine.glb',{force:true});
  assert.equal(a,b);assert.equal(a,forced);await drain();assert.equal(f.requests.length,1);
  const source=asset();f.requests[0].resolve(source.gltf);assert.equal(await a,source.gltf);assert.equal(await f.cache.load('regions/alpine.glb'),source.gltf);
  for(const resource of [source.geometry,source.material,source.texture])assert(f.cache.owns(resource));
  f.cache.dispose();f.cache.dispose();assert.deepEqual(source.released,{geometry:1,material:1,texture:1,bitmap:1});
});
await check('force refresh has a fresh URL, deduplicates in flight, and keeps existing borrowers valid',async()=>{
  const f=fixture(),a=f.cache.load('regions/alpine.glb');await drain();const first=asset();f.requests[0].resolve(first.gltf);await a;
  const b=f.cache.load('regions/alpine.glb',{force:true}),c=f.cache.load('regions/alpine.glb',{force:true}),normal=f.cache.load('regions/alpine.glb');
  assert.equal(b,c);assert.equal(b,normal);await drain();assert.equal(f.requests.length,2);assert(f.requests[1].url.endsWith('&refresh=1234-1'));
  const second=asset();f.requests[1].resolve(second.gltf);assert.equal(await b,second.gltf);assert.equal(await f.cache.load('regions/alpine.glb'),second.gltf);
  assert.deepEqual(first.released,{geometry:0,material:0,texture:0,bitmap:0},'old live scene copies must not lose textures during asynchronous refresh');
  f.cache.forget('regions/alpine.glb',first.gltf);assert.equal(await f.cache.load('regions/alpine.glb'),second.gltf,'stale invalidation cannot erase the replacement');
  f.cache.dispose();for(const source of [first,second])assert.deepEqual(source.released,{geometry:1,material:1,texture:1,bitmap:1});
});
await check('completed borrower rebuild releases old generations without touching the installed source',async()=>{
  const f=fixture(),firstLoad=f.cache.load('regions/alpine.glb');await drain();const first=asset();f.requests[0].resolve(first.gltf);await firstLoad;
  const secondLoad=f.cache.load('regions/alpine.glb',{force:true});await drain();const second=asset();f.requests[1].resolve(second.gltf);await secondLoad;
  f.cache.releaseSuperseded('regions/alpine.glb',first.gltf);
  assert.equal(first.released.texture,0,'old borrower remains valid until its replacement is installed');
  assert.equal(second.released.texture,0,'latest download remains valid before installation');
  f.cache.releaseSuperseded('regions/alpine.glb',second.gltf);f.cache.releaseSuperseded('regions/alpine.glb',second.gltf);
  assert.deepEqual(first.released,{geometry:1,material:1,texture:1,bitmap:1});
  assert.equal(second.released.texture,0);assert.equal(f.cache.getState().sources,1);
  assert.equal(await f.cache.load('regions/alpine.glb'),second.gltf);f.cache.dispose();assert.equal(second.released.texture,1);
});
await check('network failures and malformed regional files leave a retryable cache slot',async()=>{
  const f=fixture(),first=f.cache.load('regions/alpine.glb');await drain();f.requests[0].reject(new Error('network'));await assert.rejects(first,/network/);assert.equal(f.cache.getState().entries,0);
  const second=f.cache.load('regions/alpine.glb');await drain();const invalid=asset('alpine',{valid:false});f.requests[1].resolve(invalid.gltf);await assert.rejects(second,/No compatible models/);assert.equal(f.cache.getState().entries,0);assert.deepEqual(invalid.released,{geometry:1,material:1,texture:1,bitmap:1});
  const third=f.cache.load('regions/alpine.glb');await drain();const valid=asset();f.requests[2].resolve(valid.gltf);assert.equal(await third,valid.gltf);f.cache.dispose();
});
await check('a failed forced refresh can retry without invalidating already displayed source resources',async()=>{
  const f=fixture(),initial=f.cache.load('regions/alpine.glb');await drain();const valid=asset();f.requests[0].resolve(valid.gltf);await initial;
  const refresh=f.cache.load('regions/alpine.glb',{force:true});await drain();f.requests[1].reject(new Error('temporary'));await assert.rejects(refresh,/temporary/);assert.equal(valid.released.texture,0);
  const retry=f.cache.load('regions/alpine.glb');await drain();const next=asset();f.requests[2].resolve(next.gltf);await retry;f.cache.dispose();assert.equal(valid.released.texture,1);assert.equal(next.released.texture,1);
});
await check('disposal rejects late arrivals and immediately releases their geometry, materials, textures and bitmaps',async()=>{
  const f=fixture(),pending=f.cache.load('regions/alpine.glb');await drain();f.cache.dispose();const source=asset();f.requests[0].resolve(source.gltf);
  await assert.rejects(pending,{name:'AbortError'});assert.deepEqual(source.released,{geometry:1,material:1,texture:1,bitmap:1});
  await assert.rejects(f.cache.load('regions/harbor.glb'),{name:'AbortError'});assert.equal(f.requests.length,1);assert.equal(f.cache.getState().sources,0);
});
await check('closing before a queued load starts performs no download',async()=>{
  const f=fixture(),pending=f.cache.load('regions/alpine.glb');f.cache.dispose();await assert.rejects(pending,{name:'AbortError'});assert.equal(f.requests.length,0);
});
await check('one bitmap used by multiple source textures closes only once',async()=>{
  const f=fixture();let closes=0;const image={close(){closes++;}},a=asset('classic',{image}),b=asset('alpine',{image});
  const pa=f.cache.load('regions/classic.glb'),pb=f.cache.load('regions/alpine.glb');await drain();f.requests[0].resolve(a.gltf);f.requests[1].resolve(b.gltf);await Promise.all([pa,pb]);f.cache.dispose();
  assert.equal(closes,1);assert.equal(a.released.texture,1);assert.equal(b.released.texture,1);
});
await check('retiring a region releases all its generations and leaves the active region usable',async()=>{
  const f=fixture(),a=f.cache.load('regions/classic.glb'),b=f.cache.load('regions/alpine.glb');await drain();
  const first=asset('classic'),active=asset('alpine');f.requests[0].resolve(first.gltf);f.requests[1].resolve(active.gltf);await Promise.all([a,b]);
  const refresh=f.cache.load('regions/classic.glb',{force:true});await drain();const newer=asset('classic');f.requests[2].resolve(newer.gltf);await refresh;
  f.cache.releaseFile('regions/classic.glb');
  for(const source of [first,newer])assert.deepEqual(source.released,{geometry:1,material:1,texture:1,bitmap:1});
  assert.equal(active.released.texture,0);assert.equal(await f.cache.load('regions/alpine.glb'),active.gltf);
  assert.equal(f.cache.getState().sources,1);f.cache.dispose();
});
await check('switching away and immediately back cannot install or erase an obsolete download',async()=>{
  const f=fixture(),old=f.cache.load('regions/classic.glb');await drain();f.cache.releaseFile('regions/classic.glb');
  const current=f.cache.load('regions/classic.glb');await drain();const discarded=asset('classic'),active=asset('classic');
  f.requests[0].resolve(discarded.gltf);await assert.rejects(old,{name:'AbortError'});
  assert.deepEqual(discarded.released,{geometry:1,material:1,texture:1,bitmap:1});
  assert.equal(f.cache.load('regions/classic.glb'),current,'late rejection cannot delete the replacement cache slot');
  f.requests[1].resolve(active.gltf);assert.equal(await current,active.gltf);assert.equal(f.cache.getState().sources,1);f.cache.dispose();
});
await check('town lease protects a shared source until its final borrower closes',async()=>{
  const f=fixture(),endA=f.cache.retain('regions/harbor.glb'),endB=f.cache.retain('regions/harbor.glb');
  const pending=f.cache.load('regions/harbor.glb');await drain();
  f.cache.releaseFile('regions/harbor.glb');const source=asset('harbor');f.requests[0].resolve(source.gltf);
  assert.equal(await pending,source.gltf);assert.equal(source.released.texture,0);
  endA();endA();assert.equal(source.released.texture,0,'one borrower remains');
  endB();assert.equal(source.released.texture,1);assert.equal(f.cache.getState().sources,0);
  f.cache.dispose();assert.equal(source.released.texture,1);
});
console.log(JSON.stringify({checks,failures:0}));

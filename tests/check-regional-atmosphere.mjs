import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const THREE = await import(pathToFileURL(root + 'assets/vendor/three/three.module.min.js'));
const { createRegionalAtmosphere } = await import(pathToFileURL(root + 'scene-regional-atmosphere.js'));
const maps = ['classic', 'compact', 'expansion', 'harbor', 'alpine'];
const results = [];
const check = (name, fn) => { fn(); results.push(name); console.log('PASS ' + name); };
function fixture(mapId, bounds = {w:11.55, d:9.9}) {
  const world = new THREE.Group(), scene = new THREE.Scene(); scene.add(world);
  const original = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .5), new THREE.MeshStandardMaterial({color:'#ab9988'}));
  original.name = 'existing-board'; world.add(original);
  const effect = createRegionalAtmosphere({THREE, world, boardBounds:bounds, mapId});
  const group = world.getObjectByName(`regional_atmosphere_${mapId}`);
  const close = () => { effect.dispose(); original.geometry.dispose(); original.material.dispose(); };
  return {world, scene, original, effect, group, bounds, close};
}
function transforms(world) {
  const rows = [];
  world.traverse(node => {
    if (node.instanceMatrix) rows.push([node.name, [...node.instanceMatrix.array]]);
    else if (node.isPoints || node.isLine || node.isMesh) rows.push([node.name, [...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()]]);
  });
  return rows;
}

check('destinations receive only their own accents', () => {
  for (const mapId of maps) {
    const f = fixture(mapId), state = f.effect.getState();
    assert.equal(state.mapId, mapId); assert.equal(f.group.userData.cosmetic, true);
    assert.equal(state.mistPatches > 0, ['expansion','alpine'].includes(mapId));
    assert.equal(state.pollen > 0, mapId === 'classic');
    assert.equal(!!state.coast, mapId === 'harbor');
    assert.equal(state.time, 0); f.close();
  }
});
check('mist stays outside playable bounds for small, standard and large boards', () => {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  for (const bounds of [{w:3,d:3},{w:11.55,d:9.9},{w:18.15,d:13.2}]) for (const mapId of ['expansion','alpine']) {
    const f = fixture(mapId,bounds), mist = f.group.getObjectByName('regional_perimeter_mist');
    assert(mist.count <= 12, 'mist draw remains bounded');
    for (let frame=0;frame<1200;frame++) {
      f.effect.tick(.1, {night:.4,rain:.6});
      if (frame % 120) continue;
      for (let i=0;i<mist.count;i++) {
        mist.getMatrixAt(i,matrix); matrix.decompose(position,rotation,scale);
        assert([...matrix.elements].every(Number.isFinite));
        // Use the full billboard half-width for both axes, conservative under
        // any camera yaw. Its entire scenic patch must remain off the board.
        assert(Math.abs(position.x)-scale.x*.5>bounds.w*.5 || Math.abs(position.z)-scale.x*.5>bounds.d*.5, `${mapId}: mist patch ${i} overlaps playable bounds`);
        assert(position.y>0 && scale.y<1.5, 'mist stays low rather than covering roof silhouettes');
      }
    }
    f.close();
  }
});
check('particles and mist do not intercept taps or add shadow lights', () => {
  for (const mapId of maps) {
    const f = fixture(mapId); f.effect.tick(.1);
    const additions = f.world.children.filter(node=>node!==f.original), hits=[];
    f.world.updateMatrixWorld(true);
    for (const node of additions) {
      new THREE.Raycaster(new THREE.Vector3(0,20,0),new THREE.Vector3(0,-1,0)).intersectObject(node,true,hits);
      node.traverse(child=>{assert(!child.isLight,'no new real-time lights'); if(child.isMesh){assert.equal(child.castShadow,false);assert.equal(child.material.depthWrite,false,'translucent accents do not write depth');}});
    }
    assert.equal(hits.length,0); f.close();
  }
});
check('paused and reduced-motion playback freezes clocks and geometry without catch-up', () => {
  for (const mapId of maps) {
    const f=fixture(mapId); for(let i=0;i<30;i++)f.effect.tick(.04,{season:'spring'});
    f.effect.tick(0,{paused:true,season:'spring'});
    const before=f.effect.getState(), pose=transforms(f.world);
    for(let i=0;i<100;i++)assert.equal(f.effect.tick(.1,{paused:true,season:'spring'}),false);
    assert.deepEqual(f.effect.getState(),before); assert.deepEqual(transforms(f.world),pose);
    f.effect.tick(0,{reduced:true,season:'spring'}); const reduced=f.effect.getState(), frozen=transforms(f.world);
    for(let i=0;i<100;i++)assert.equal(f.effect.tick(.1,{reduced:true,season:'spring'}),false);
    assert.deepEqual(f.effect.getState(),reduced); assert.deepEqual(transforms(f.world),frozen);
    const pollen=f.group.getObjectByName('regional_garden_pollen'); if(pollen)assert.equal(pollen.visible,false);
    f.effect.tick(200,{season:'spring'}); assert(Math.abs(f.effect.getState().time-before.time-.1)<1e-9,'large delta is capped instead of advancing by the hidden interval');
    f.close();
  }
});
check('invalid frame deltas keep all transforms finite', () => {
  for(const mapId of maps){
    const f=fixture(mapId); const before=f.effect.getState().time;
    for(const delta of [NaN,Infinity,-5,undefined])f.effect.tick(delta);
    assert.equal(f.effect.getState().time,before);
    for(const [,values] of transforms(f.world))assert(values.every(Number.isFinite));
    f.close();
  }
});
check('hiding perimeter accents hides every attached root and freezes both clocks', () => {
  for(const mapId of maps){
    const f=fixture(mapId);f.effect.tick(.1);f.effect.setVisible(false);f.effect.tick(0);
    const before=f.effect.getState(),pose=transforms(f.world);
    for(const child of f.world.children)if(child!==f.original)assert.equal(child.visible,false,mapId+': independent wave root follows the same switch');
    for(let i=0;i<100;i++)assert.equal(f.effect.tick(.1),false);
    assert.deepEqual(f.effect.getState(),before);assert.deepEqual(transforms(f.world),pose);
    f.effect.setVisible(true);f.effect.tick(.04);
    assert.equal(f.group.visible,true);assert(f.effect.getState().time>before.time);
    if(before.coast){assert.equal(f.effect.getState().coast.visible,true);assert(f.effect.getState().coast.elapsed>before.coast.elapsed);}
    f.close();
  }
});
check('accent ticks do not use gameplay randomness or create another animation loop', () => {
  const fixtures=maps.map(mapId=>fixture(mapId));
  const originalRandom=Math.random, originalRaf=globalThis.requestAnimationFrame, originalTimeout=globalThis.setTimeout;
  let randomCalls=0,frames=0,timers=0;
  try{
    Math.random=()=>{randomCalls++;return .5;};
    globalThis.requestAnimationFrame=()=>{frames++;return 0;};globalThis.setTimeout=()=>{timers++;return 0;};
    for(let i=0;i<160;i++)for(const f of fixtures)f.effect.tick(.04,{night:i/160,rain:.6});
  }finally{
    Math.random=originalRandom;
    if(originalRaf===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=originalRaf;
    globalThis.setTimeout=originalTimeout;
  }
  assert.equal(randomCalls,0);assert.equal(frames,0);assert.equal(timers,0);fixtures.forEach(f=>f.close());
});
check('teardown disposes owned resources once and leaves the board untouched', () => {
  for(const mapId of maps){
    const f=fixture(mapId),resources=new Set(),disposed=new Map();let boardDisposed=0;
    f.original.geometry.addEventListener('dispose',()=>boardDisposed++);f.original.material.addEventListener('dispose',()=>boardDisposed++);
    f.world.traverse(node=>{if(node===f.original)return;if(node.geometry)resources.add(node.geometry);if(node.material)for(const m of Array.isArray(node.material)?node.material:[node.material])resources.add(m);});
    for(const resource of resources)resource.addEventListener('dispose',()=>disposed.set(resource,(disposed.get(resource)||0)+1));
    f.effect.dispose();f.effect.dispose();
    assert.deepEqual(f.world.children,[f.original]);assert.equal(boardDisposed,0);
    for(const resource of resources)assert.equal(disposed.get(resource),1,'each owned geometry/material released once');
    assert.equal(f.effect.getState().disposed,true);assert.equal(f.effect.tick(.1),false);
    f.original.geometry.dispose();f.original.material.dispose();
  }
});
console.log(JSON.stringify({checks:results.length,results,failures:0},null,2));

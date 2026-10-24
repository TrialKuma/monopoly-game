import assert from 'node:assert/strict';
import {createSceneLife} from '../scene-life.js';
import {createThermalSteam} from '../scene-thermal-steam.js';
import {loadGeometryGLB} from './gltf-geometry-fixture.mjs';
import {THREE,regionalFixture,requestedMap,runMapWorkers} from './regional-scene-fixture.mjs';

// Tests use the actual exported bath and production scene functions. Browser
// events and WebGL presentation are substituted; no claim of pixel rendering.
function events(extra={}){
  const listeners=new Map();
  return {...extra,
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    emit(type,value={}){for(const fn of listeners.get(type)||[])fn(value);},
    count(){return [...listeners.values()].reduce((sum,list)=>sum+list.size,0);},
  };
}
function disposeGLTF(gltf){
  const owned=new Set();gltf.scene.traverse(node=>{
    if(node.geometry)owned.add(node.geometry);
    for(const material of Array.isArray(node.material)?node.material:[node.material])if(material){
      owned.add(material);for(const value of Object.values(material))if(value?.isTexture)owned.add(value);
    }
  });owned.forEach(resource=>resource.dispose());
}

async function motionLifecycle(mapId){
  const gltf=await loadGeometryGLB(new URL(`../art/blender-city/models/${mapId}/onsen_3/model.glb`,import.meta.url));
  const originalGlobals=new Map(['window','document'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  const media=events({matches:false}),doc=events({hidden:false});
  globalThis.window={matchMedia:()=>media};globalThis.document=doc;
  const owned=new Set();let controller;
  try{
    const scene=new THREE.Scene(),world=new THREE.Group();scene.add(world);
    scene.background=new THREE.Color('#cdddee');scene.environmentIntensity=.35;
    const light=new THREE.DirectionalLight('#fff0d6',2.4);light.position.set(-7,15,5);scene.add(light);
    scene.add(new THREE.HemisphereLight('#fff6e7','#94aaa0',1));
    const group=new THREE.Group();world.add(group);group.userData.tileIndex=7;
    const makeBath=()=>{
      const model=gltf.scene.getObjectByName(`${mapId}_onsen_3`).clone(true);
      assert(model.userData.thermalPools?.length>=2,'motion exercises the real authored upgraded bath');
      const steam=createThermalSteam({THREE,model,own:resource=>(owned.add(resource),resource)});
      assert(steam);model.add(steam);return {model,steam};
    };
    let current=makeBath();group.add(current.model);
    const snapshot={mapId,board:Array.from({length:22},(_,index)=>({index})),players:[]};
    const lotViews=new Map([[7,{building:group}]]);
    let time=0;
    controller=createSceneLife({THREE,scene,world,light,renderer:{toneMappingExposure:.96,getPixelRatio:()=>1.5},boardBounds:{w:11.55,d:9.9},snapshot,lotViews});
    const step=(count=1)=>{for(let i=0;i<count;i++)controller.tick(time+=40,.04);};
    const clock=()=>current.steam.material.uniforms.time.value;
    step(10);assert(clock()>0,'game life advances the attached real bath vapor');
    let before=clock();controller.setInteractionPaused(true);step(50);
    assert.equal(clock(),before,'camera/inspection interaction freezes vapor');
    controller.setTimeMode('night');step();assert.equal(clock(),before,'forced lighting refresh must not animate a paused bath');
    controller.setInteractionPaused(false);step();assert(clock()>before&&clock()-before<=.101,'resume never catches up the paused interval');
    before=clock();doc.hidden=true;doc.emit('visibilitychange');step(200);assert.equal(clock(),before,'hidden tab freezes vapor');
    doc.hidden=false;doc.emit('visibilitychange');step();assert(clock()>before&&clock()-before<=.101,'visible tab resumes one bounded step');
    media.matches=true;media.emit('change',{matches:true});step();before=clock();step(100);
    assert.equal(clock(),before,'reduced motion freezes shader time');
    controller.setWeather('rain');step();assert.equal(clock(),before,'manual climate under reduced motion leaves vapor stationary');
    media.matches=false;media.emit('change',{matches:false});step();assert(clock()>before,'live preference change resumes vapor');
    const removed=current,removedTime=clock();removed.model.removeFromParent();current=makeBath();group.add(current.model);
    controller.update(snapshot);step(5);
    assert.equal(removed.steam.material.uniforms.time.value,removedTime,'replacement drops old vapor clock references');
    assert(clock()>removedTime,'replacement vapor binds to the ongoing scene clock');
    controller.dispose();controller.dispose();assert.equal(media.count(),0);assert.equal(doc.count(),0);
    const disposedTime=clock();step(20);assert.equal(clock(),disposedTime,'disposed life cannot update model-owned shaders');
    let released=0;for(const resource of owned){resource.addEventListener('dispose',()=>released++);resource.dispose();}
    assert.equal(released,4,'two successive bath instances release their two caller-owned resources');owned.clear();
    return 9;
  }finally{
    controller?.dispose();owned.forEach(resource=>resource.dispose());disposeGLTF(gltf);
    for(const [name,descriptor] of originalGlobals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  }
}

async function replacementLifecycle(mapId){
  const fixture=await regionalFixture(mapId);
  let disposed=false;
  try{
    const views=fixture.build({level:1,steps:false,owners:'human'});
    const view=views.find(item=>item.modelName===`${mapId}_onsen_1`);
    assert(view,`${mapId}: actual board includes a thermal parcel`);
    fixture.context.thermalView=view;
    const baseline=fixture.run('resources.size');let replacements=0,disposals=0;
    for(const level of [2,3,2,1,2,3,2,1,2,3,2,1]){
      const previous=view.building.children[0],oldResources=[...view.modelResources];
      assert.equal(oldResources.length,2,'only one vapor buffer and material are owned by this lot');
      const released=new Map(oldResources.map(resource=>[resource,0]));
      for(const resource of oldResources)resource.addEventListener('dispose',()=>released.set(resource,released.get(resource)+1));
      fixture.context.nextThermalLevel=level;
      fixture.run('thermalView.tile.lot.level=nextThermalLevel;updateLot(thermalView,thermalView.tile,data,true);world.updateMatrixWorld(true);');
      assert.equal(previous.parent,null,'old bath is detached');
      for(const resource of oldResources){
        assert.equal(released.get(resource),1,'old vapor GPU resource is disposed exactly once');
        fixture.context.retiredThermalResource=resource;
        assert.equal(fixture.run('resources.has(retiredThermalResource)'),false,'global resource owner releases retired vapor');disposals++;
      }
      assert.equal(fixture.run('resources.size'),baseline,'repeated upgrades/downgrades do not accumulate resources');
      assert.equal(view.modelResources.size,2);
      const current=view.building.children[0],steam=current.getObjectByName('thermal_pool_steam');
      assert(steam?.isPoints,'production createLotModel installs live vapor');
      assert.equal(steam.geometry.attributes.position.count,current.userData.thermalPools.length*12);
      // Ordinary updates with identical asset and ownership must reuse resources.
      const active=[...view.modelResources];fixture.run('updateLot(thermalView,thermalView.tile,data,true);');
      assert.deepEqual([...view.modelResources],active);replacements++;
    }
    const finalResources=[...view.modelResources],released=new Map(finalResources.map(resource=>[resource,0]));
    for(const resource of finalResources)resource.addEventListener('dispose',()=>released.set(resource,released.get(resource)+1));
    fixture.dispose();disposed=true;
    for(const resource of finalResources)assert.equal(released.get(resource),1,'map reset releases the current vapor exactly once');
    assert.equal(fixture.run('resources.size'),0);disposals+=finalResources.length;
    return {replacements,disposals};
  }finally{if(!disposed)fixture.dispose();}
}

if(process.argv.includes('--life-only')){
  const mapId=requestedMap()||'compact';const motionChecks=await motionLifecycle(mapId);
  console.log(JSON.stringify({mapId,motionChecks,failures:0}));
}else if(requestedMap()){
  const mapId=requestedMap(),replacement=await replacementLifecycle(mapId),motionChecks=await motionLifecycle(mapId);
  console.log(JSON.stringify({mapId,...replacement,motionChecks,failures:0}));
}else{
  const results=runMapWorkers(import.meta.url);
  console.log(JSON.stringify({maps:results.length,replacements:results.reduce((sum,row)=>sum+row.replacements,0),disposals:results.reduce((sum,row)=>sum+row.disposals,0),motionChecks:results.reduce((sum,row)=>sum+row.motionChecks,0),failures:0}));
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import {createCityOutskirts} from '../scene-outskirts.js';
import {buildDestinationGarden,batchGardenBuilding} from '../scene-garden-kit.js';
import {loadGeometryGLB,regionalAssetURL} from './gltf-geometry-fixture.mjs';
import {createModelAssetCache} from '../scene-model-cache.js';

const maps=['classic','compact','expansion','harbor','alpine'];
const mapId=process.argv.find(arg=>arg.startsWith('--map='))?.slice(6);
if(!mapId){
  assert(!process.argv.some(arg=>arg.startsWith('--region-file=')),'candidate asset requires --map');
  for(const map of maps){
    const worker=spawnSync(process.execPath,['--max-old-space-size=768',fileURLToPath(import.meta.url),`--map=${map}`],{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
    if(worker.error)throw worker.error;
    assert.equal(worker.status,0,`${map} scenery failed:\n${worker.stdout}\n${worker.stderr}`);process.stdout.write(worker.stdout);
  }
  console.log('PASS all five actual loaded regional scenery budgets (one 768 MiB worker per map)');process.exit(0);
}
assert(maps.includes(mapId));
const game=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
const createBoard=game.slice(game.indexOf('function createBoard('),game.indexOf('function prepareOpeningLots('));
const board=vm.runInNewContext(game.slice(0,game.indexOf('const CARD_POOL'))+createBoard+`;createBoard(MAP_PRESETS[${JSON.stringify(mapId)}]);`);
const xs=board.map(tile=>tile.x),zs=board.map(tile=>tile.y);
const sceneCode=fs.readFileSync(new URL('../scene.js',import.meta.url),'utf8'),step=Number(sceneCode.match(/^const STEP = ([\d.]+);/m)?.[1]);assert(Number.isFinite(step)&&step>0,'read the production board spacing');
const boardBounds={w:(Math.max(...xs)-Math.min(...xs)+1)*step,d:(Math.max(...zs)-Math.min(...zs)+1)*step};
const world=new THREE.Group(),loaded=[],resolvedNames=[],downloads=[];let queue=Promise.resolve();
class FixtureGLTFLoader{
  loadAsync(url){
    const file=url.replace(/^\.\/assets\/models\//,'').split('?')[0];
    downloads.push(file);
    const asset=file===`regions/${mapId}.glb`?regionalAssetURL(mapId):new URL('../assets/models/'+file,import.meta.url);
    const task=queue.then(async()=>{
      const gltf=await loadGeometryGLB(asset),find=gltf.scene.getObjectByName;
      gltf.scene.getObjectByName=function(name){resolvedNames.push(name);return find.call(this,name);};loaded.push(gltf);return gltf;
    });queue=task.catch(()=>{});return task;
  }
}
const assetCache=createModelAssetCache({load:url=>new FixtureGLTFLoader().loadAsync(url)});
// The board and scenery request the same actual regional source concurrently.
const boardSource=assetCache.load(`regions/${mapId}.glb`);
let api,disposeAssets=()=>{};
if(['harbor','alpine'].includes(mapId)){
  // Run the production destination controller, substituting only file transport
  // so both its asynchronous hero and regional-village branches execute in Node.
  const code=fs.readFileSync(new URL('../scene-destinations.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const module=new Function('loadSharedModelAsset','disposeSharedModelAssets','buildDestinationGarden','batchGardenBuilding',code+';return {createDestinationScene,disposeDestinationAssets};')(assetCache.load,assetCache.dispose,buildDestinationGarden,batchGardenBuilding);
  api=module.createDestinationScene({THREE,world,boardBounds,mapId});disposeAssets=module.disposeDestinationAssets;
}else api=createCityOutskirts({THREE,world,boardBounds,mapId,loadSceneryBundle:assetCache.load});
try{
  await api.loading;const sharedSource=await boardSource;
  assert.equal(downloads.filter(file=>file===`regions/${mapId}.glb`).length,1,'board and scenery decode the region only once');
  assert.equal(await assetCache.load(`regions/${mapId}.glb`),sharedSource,'later consumers receive the same GLTF resource tree');
  const state=api.getState();assert(state.ready&&!state.failed,`${mapId} finishes actual GLB loading`);
  assert(!resolvedNames.includes(`${mapId}_villa_2`),'detailed neural villa_2 is never expanded into distant scenery');
  if(mapId!=='expansion')assert(resolvedNames.includes(`${mapId}_villa_3`),'distant houses use the lightweight regional villa_3');
  const neighbourhood=world.getObjectByName(['harbor','alpine'].includes(mapId)?`destination_${mapId}_village`:'outskirts_regional_neighbourhood');
  assert(neighbourhood,`${mapId} has a populated real regional neighbourhood`);
  const expectedBuildings={classic:12,compact:12,expansion:11,harbor:2,alpine:4}[mapId];
  assert.equal(state.regionalBuildings??state.buildings,expectedBuildings);
  function measure(root){
    let triangles=0,bytes=0,draws=0;
    root.traverse(node=>{if(!node.isMesh)return;draws++;triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;
      for(const attribute of Object.values(node.geometry.attributes))bytes+=attribute.array.byteLength;if(node.geometry.index)bytes+=node.geometry.index.array.byteLength;
    });return {triangles,geometryMiB:bytes/1048576,draws};
  }
  const buildings=measure(neighbourhood),complete=measure(world);
  assert(buildings.triangles<200000,`${mapId}: ${buildings.triangles} loaded neighbourhood triangles exceed 200k`);
  assert(buildings.geometryMiB<20,`${mapId}: loaded neighbourhood geometry must stay below 20 MiB`);
  assert(buildings.draws<=20,`${mapId}: loaded neighbourhood draw count`);
  assert(complete.triangles<600000,`${mapId}: complete scenery, including the AI centerpiece, exceeds 600k triangles`);
  assert(complete.draws<=75,`${mapId}: complete scenery draw count`);
  console.log(`PASS ${mapId}: actual loaded scenery uses lightweight regional houses, with no neural-villa duplication`);
  console.log(JSON.stringify({mapId,buildings:expectedBuildings,neighbourhood:buildings,complete,pixelsRendered:false,failures:0}));
}finally{
  api.dispose();disposeAssets();assetCache.dispose();
}

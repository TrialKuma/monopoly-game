import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import {GLTFLoader} from '../assets/vendor/three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from '../assets/vendor/three/addons/utils/BufferGeometryUtils.js';
import {createStreetFoundation} from '../scene-streets.js';
import {createOwnershipRoofs} from '../scene-ownership-roofs.js';
import {createFunctionalLandmark} from '../scene-functional-landmarks.js';
import {createThermalSteam} from '../scene-thermal-steam.js';
import {createLevelThreeTracker} from '../scene-fireworks.js';
import {harborWalkOffset,harborEdgePath,harborParcelRotation,harborVisualPosition} from '../scene-harbor-paths.js';
import {harborLandmarkSpec} from '../scene-harbor-landmarks.js';
import {addHarborBridge} from '../scene-harbor-islands.js';
import {loadGeometryGLB,regionalAssetURL} from './gltf-geometry-fixture.mjs';

export {THREE};
export const MAP_IDS=['classic','compact','expansion','harbor','alpine'];
export const requestedMap=()=>process.argv.find(arg=>arg.startsWith('--map='))?.slice(6);

// A detail-rich GLB is parsed once per worker. Exiting between maps releases
// Three.js arrays, VM closures and source buffers instead of retaining 5 kits.
export function runMapWorkers(testUrl){
  assert(!process.argv.some(arg=>arg.startsWith('--region-file=')),'--region-file requires --map=<region>');
  const results=[];
  for(const mapId of MAP_IDS){
    const result=spawnSync(process.execPath,['--max-old-space-size=768',fileURLToPath(testUrl),...process.argv.slice(2),`--map=${mapId}`],{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
    if(result.error)throw result.error;
    assert.equal(result.status,0,`${mapId} worker failed:\n${result.stderr}\n${result.stdout}`);
    process.stdout.write(result.stdout);
    const last=result.stdout.trim().split(/\r?\n/).at(-1);results.push(JSON.parse(last));
  }
  return results;
}

class Element{
  constructor(){this.dataset={};this.nodes=new Map();this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};}
  querySelector(key){if(!this.nodes.has(key))this.nodes.set(key,new Element());return this.nodes.get(key);}
  setAttribute(){}appendChild(){}replaceChildren(){}
}

export async function regionalFixture(mapId){
  assert(MAP_IDS.includes(mapId),`unknown map ${mapId}`);
  const assetUrl=regionalAssetURL(mapId);
  assert(fs.existsSync(assetUrl),`required regional GLB is missing: ${fileURLToPath(assetUrl)}`);
  const context=vm.createContext({THREE,GLTFLoader,mergeGeometries,createStreetFoundation,createOwnershipRoofs,createFunctionalLandmark,createThermalSteam,createLevelThreeTracker,harborWalkOffset,harborEdgePath,harborParcelRotation,harborVisualPosition,harborLandmarkSpec,addHarborBridge,performance,console,CustomEvent:class{},document:{createElement:()=>new Element(),body:{classList:{remove(){}}}},window:{matchMedia:()=>({matches:false}),addEventListener(){},dispatchEvent(){}}});
  const run=code=>vm.runInContext(code,context);
  run(fs.readFileSync(new URL('../scene.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''));
  run('world=new THREE.Group();labels=document.createElement("div");numberTexture=()=>own(new THREE.Texture());');
  const game=fs.readFileSync(new URL('../game.js',import.meta.url),'utf8');
  const boardFunction=game.slice(game.indexOf('function createBoard('),game.indexOf('function prepareOpeningLots('));
  const {map,board}=vm.runInNewContext(game.slice(0,game.indexOf('const CARD_POOL'))+boardFunction+`;({map:MAP_PRESETS[${JSON.stringify(mapId)}],board:createBoard(MAP_PRESETS[${JSON.stringify(mapId)}])});`);
  const gltf=await loadGeometryGLB(assetUrl);
  context.regionalGLTF=gltf;context.bundleFile=`regions/${mapId}.glb`;
  // Shared roots exist as routing sentinels: all actual board geometry must
  // still come from the selected regional file, including every public site.
  run(`for(const name of ['civic_hall','vault_bank','builders_guild','card_pavilion','chance_wheel','teleport_gate','rush_station','junction_hub']){const shared=new THREE.Group();shared.name='shared_'+name;modelLibrary.set(name,shared);}installModelBundle(ASSET_BUNDLES.find(bundle=>bundle.file===bundleFile),regionalGLTF);`);
  assert.equal(run('loadedBundles.has(bundleFile)'),true);
  function build({level=3,steps=true,owners='ai'}={}){
    board.forEach(tile=>{if(tile.lot){tile.lot.level=level;tile.lot.ownerId=owners==='alternating'?(tile.index%2?'human':'ai'):owners;}});
    context.data={mapId,sessionId:'regional-fixture',board,players:[{id:'human',position:0},{id:'ai',position:0}],navigation:map.navigation};
    context.realSteps=steps;
    run(`clearMap();snapshot=data;
      var positions=data.board.map(t=>data.mapId==='harbor'?harborVisualPosition(t):t);
      var px=positions.map(t=>t.x),py=positions.map(t=>t.y);boardBounds={minX:Math.min(...px),maxX:Math.max(...px),minY:Math.min(...py),maxY:Math.max(...py)};
      boardBounds.cx=(boardBounds.minX+boardBounds.maxX)/2;boardBounds.cy=(boardBounds.minY+boardBounds.maxY)/2;boardBounds.w=(boardBounds.maxX-boardBounds.minX+1)*STEP;boardBounds.d=(boardBounds.maxY-boardBounds.minY+1)*STEP;
      streetFoundation=createStreetFoundation({THREE,world,boardBounds,mapId:data.mapId,islands:data.mapId==='harbor'});
      if(realSteps)data.board.forEach(makeStep);else data.board.forEach(t=>stepViews.set(t.index,{center:tilePosition(t)}));
      data.board.filter(t=>!t.isLargeSecondary).forEach(t=>makeLot(t,data));streetFoundation.finish();world.updateMatrixWorld(true);`);
    const views=run('[...lotViews.values()]');
    for(const view of views){
      context.view=view;const asset=run('resolveAsset(view.tile,data)');assert.equal(asset.key,asset.desired,`${mapId} ${view.tile.index} must use its regional root`);assert(asset.key.startsWith(mapId+'_'));assert.equal(asset.authored,true);
      let geometryCount=0;view.building.traverse(n=>{if(n.isMesh){geometryCount++;n.geometry.computeBoundingBox();n.geometry.computeBoundingSphere();}});assert(geometryCount>0,`${asset.key} has actual GLB surfaces`);
    }
    assert(run('world.getObjectByName("regional_streets_"+data.mapId).children.some(mesh=>mesh.isInstancedMesh&&mesh.count>0)'),'real street foundation contains populated paving geometry');
    return views;
  }
  function dispose(){
    run('clearMap();modelResources.forEach(r=>r.dispose());modelResources.clear();modelLibrary.clear();assetEnvelopes.clear();authoredModels.clear();modelPriorities.clear();regionalGLTF=null;');
    const geometries=new Set(),materials=new Set(),textures=new Set();gltf.scene.traverse(n=>{if(!n.isMesh)return;geometries.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m);});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();});textures.forEach(t=>t.dispose());
  }
  return {context,run,map,board,build,dispose,assetPath:fileURLToPath(assetUrl),imageHeaders:gltf.geometryTest.imageHeaders};
}

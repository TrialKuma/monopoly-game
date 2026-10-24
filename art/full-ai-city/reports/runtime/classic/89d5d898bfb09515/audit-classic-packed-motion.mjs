import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {regionalFixture,THREE} from '../tests/regional-scene-fixture.mjs';
import {loadGeometryGLB} from '../tests/gltf-geometry-fixture.mjs';

const fixture=await regionalFixture('classic');
const registry=JSON.parse(fs.readFileSync(new URL('../art/full-ai-city/approved-assets.json',import.meta.url)));
const result={package:fixture.assetPath,sha256:crypto.createHash('sha256').update(fs.readFileSync(fixture.assetPath)).digest('hex'),imagePixelsRendered:false,checks:[]};
assert.equal(result.sha256,'89d5d898bfb095153396b58386462fbb4bba912cf26ab55c134f36204196583f');
const findParts=root=>{const result=[];root.traverse(node=>{if(node.userData.lifePart)result.push(node);});return result;};
const maxDiff=(a,b)=>Math.max(...a.map((value,index)=>Math.abs(value-b[index])));
const axis=node=>new THREE.Vector3(0,0,1).transformDirection(node.matrixWorld);
const world=new THREE.Group(),lotViews=new Map();
let tile=100;
try{
  const actual=fixture.build({level:3});
  for(const view of actual){
    for(const part of findParts(view.building))result.checks.push({actualBoardTile:view.tile.index,part:part.name,kind:part.userData.lifePart});
  }
  assert.equal(result.checks.filter(r=>r.kind==='wheel').length,1);
  assert.equal(result.checks.filter(r=>r.kind==='pendulum').length,1);
  for(const asset of ['chance_wheel','builders_guild']){
    const name='classic_'+asset;
    fixture.context.auditName=name;
    const packed=fixture.context.regionalGLTF.scene.getObjectByName(name);
    const installed=fixture.run('modelLibrary.get(auditName)');
    const entry=registry.assets['classic/'+asset];
    assert.equal(packed.userData.sourceSha256,entry.candidate.sha256);
    const approved=await loadGeometryGLB(new URL('../'+entry.candidate.path,import.meta.url));
    const a=findParts(approved.scene),b=findParts(packed),c=findParts(installed);
    assert.equal(a.length,1);assert.equal(b.length,1);assert.equal(c.length,1);
    assert.equal(c[0].userData.lifePart,a[0].userData.lifePart);
    assert.equal(c[0].name,a[0].name);
    // Packer copies the actual moving mesh and its measured local transform.
    for(const key of ['position','quaternion','scale'])assert(maxDiff(a[0][key].toArray(),b[0][key].toArray())<1e-10,key+' survives packing');
    for(const key of Object.keys(a[0].geometry.attributes)){
      const source=a[0].geometry.attributes[key].array,final=c[0].geometry.attributes[key].array;
      assert.equal(source.length,final.length);for(let i=0;i<source.length;i++)assert.equal(source[i],final[i]);
    }
    assert.deepEqual(a[0].geometry.index.array,c[0].geometry.index.array);
    packed.updateWorldMatrix(true,true);installed.updateWorldMatrix(true,true);
    const zeroError=maxDiff(b[0].matrixWorld.toArray(),c[0].matrixWorld.toArray());
    assert(zeroError<1e-10,'optimizer preserves complete packed zero pose');
    const selectionAxis=new THREE.Vector3(...c[0].userData.selectionConfig.axis).normalize();
    assert(axis(c[0]).distanceTo(selectionAxis)<1e-8,'measured axle survives uniform placement and flattening');
    for(const rotation of [0,Math.PI/2,Math.PI,-Math.PI/2]){
      const building=installed.clone(true);building.rotation.y=rotation;building.position.set(tile*.01,.2,tile*.02);building.userData.tileIndex=tile;
      world.add(building);lotViews.set(tile++,{building});
    }
    result.checks.push({asset,sourceSha256:entry.candidate.sha256,part:c[0].name,kind:c[0].userData.lifePart,movingTriangles:c[0].geometry.index.count/3,packedZeroPoseMatrixMaxError:zeroError,measuredAxis:selectionAxis.toArray(),actualAxis:axis(c[0]).toArray(),geometryAttributesExactlyEqual:true});
  }
  world.updateMatrixWorld(true);
  const moving=findParts(world),before=new Map(moving.map(node=>[node,{axis:axis(node),origin:node.getWorldPosition(new THREE.Vector3()),q:node.quaternion.clone()}]));
  const staticBefore=new Map();world.traverse(node=>{if(node.isMesh&&!node.userData.lifePart)staticBefore.set(node,node.matrixWorld.clone());});
  const dummy=()=>({getState:()=>({night:0,season:'spring',rain:0}),tick(){},refresh(){},dispose(){},needsWork:()=>false,setVisible:()=>true});
  const code=fs.readFileSync(new URL('../scene-life.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const media={matches:false,addEventListener(){},removeEventListener(){}},document={hidden:false,addEventListener(){},removeEventListener(){}};
  const factory=new Function('createCityLighting','createCityWeather','createCityOutskirts','createDestinationScene','window','document',code+';return createSceneLife;')(dummy,dummy,dummy,()=>null,{matchMedia:()=>media},document);
  const life=factory({THREE,scene:new THREE.Scene(),world,light:new THREE.DirectionalLight(),renderer:{getPixelRatio:()=>1},snapshot:{mapId:'classic',board:[]},lotViews,boardBounds:{w:11,d:10}});
  assert.equal(life.stats().movingParts,8);
  life.effect({triggerTiles:[...lotViews.keys()]});
  for(let i=1;i<=30;i++)life.tick(i*40,.04);
  world.updateMatrixWorld(true);
  for(const node of moving){const initial=before.get(node);assert(node.quaternion.angleTo(initial.q)>.001);assert(axis(node).distanceTo(initial.axis)<1e-9,'driver rotates around preserved local Z, including rotated board placements');assert(node.getWorldPosition(new THREE.Vector3()).distanceTo(initial.origin)<1e-9,'axle anchor remains fixed');}
  for(const [node,matrix]of staticBefore)assert(maxDiff(node.matrixWorld.toArray(),matrix.toArray())<1e-12,'only original moving component changes');
  life.setInteractionPaused(true);const paused=moving.map(node=>node.quaternion.clone());life.tick(2000,.04);moving.forEach((node,i)=>assert(node.quaternion.angleTo(paused[i])<1e-7));
  life.dispose();world.updateMatrixWorld(true);
  for(const node of moving)assert(node.quaternion.angleTo(before.get(node).q)<1e-7,'disposal restores original pose');
  result.driver={production:'scene-life.js',parts:8,boardRotations:[0,90,180,-90],eventDrivenMotion:true,worldAxlesFixed:true,staticBuildingMatricesUnchanged:true,pausedUnchanged:true,disposalRestoresPose:true};
  result.status='PASS';
  fs.writeFileSync(new URL('./classic-packed-motion-audit.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}finally{fixture.dispose();}

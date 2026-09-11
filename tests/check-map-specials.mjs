import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const THREE=await import(pathToFileURL(root+'assets/vendor/three/three.module.min.js'));
const {GLTFLoader}=await import(pathToFileURL(root+'assets/vendor/three/addons/loaders/GLTFLoader.js'));
const {mergeGeometries}=await import(pathToFileURL(root+'assets/vendor/three/addons/utils/BufferGeometryUtils.js'));
const context=vm.createContext({THREE,GLTFLoader,mergeGeometries,console,window:{matchMedia:()=>({matches:false}),addEventListener(){},dispatchEvent(){}},CustomEvent:class{},performance});
vm.runInContext(fs.readFileSync(root+'scene.js','utf8').replace(/^import .*;\r?\n/gm,''),context);
const run=code=>vm.runInContext(code,context);
const names=['civic_hall','vault_bank','builders_guild','card_pavilion','chance_wheel','teleport_gate','rush_station'];
let normals=0,models=0,pivots=0,poses=0;const results=[];
for(const map of (process.argv[2]?.split(',')||['compact','expansion'])){
 const bytes=fs.readFileSync(root+`assets/models/${map}-specials.glb`);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert.ok((json.buffers||[]).every(b=>!b.uri),'all model data embedded');assert.equal((json.images||[]).length,0);
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 for(const suffix of names){
  const name=`${map}_${suffix}`,source=gltf.scene.getObjectByName(name);assert.ok(source,name+' root exists');
  source.position.set(0,0,0);source.updateMatrixWorld(true);context.source=source;const model=run('optimizeModel(source)');models++;
  source.updateMatrixWorld(true);model.updateMatrixWorld(true);
  const original=new THREE.Box3().setFromObject(source),merged=new THREE.Box3().setFromObject(model);
  assert.ok(original.min.distanceTo(merged.min)<.0001&&original.max.distanceTo(merged.max)<.0001,name+' batching preserves geometry');
  const dynamic=[];model.traverse(node=>{
   if(node.userData.lifePart||/^life_(wheel_rotor|crane_pendulum)$/.test(node.name))dynamic.push(node);
   if(!node.isMesh)return;
   const attr=node.geometry.attributes.normal;assert.ok(attr,name+' mesh has normals');
   for(let i=0;i<attr.count;i++){const length=Math.hypot(attr.getX(i),attr.getY(i),attr.getZ(i));assert.ok(Number.isFinite(length)&&Math.abs(length-1)<.001,name+' finite unit normals');normals++;}
  });
  if(['builders_guild','chance_wheel'].includes(suffix))assert.ok(dynamic.length>0,name+' articulated node preserved');
  pivots+=dynamic.length;
  const envelope=new THREE.Box3();
  for(let step=0;step<32;step++){
   dynamic.forEach(node=>{node.rotation.z=node.userData.lifePart==='pendulum'?Math.sin(step/31*Math.PI*2)*.13:step/32*Math.PI*2;});
   model.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(model);envelope.union(bounds);poses++;
   assert.ok(bounds.min.y>=-.001&&bounds.max.y<=1.751,name+' animated height stays within contract');
   for(const turn of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const transformed=bounds.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(turn));
    // Every frontage uses a 0.10 unit setback on a 1.43 unit parcel.
    assert.ok(transformed.min.x>=-.6151&&transformed.max.x<=.6151&&transformed.min.z>=-.6151&&transformed.max.z<=.6151,name+' animated model stays inside parcel after rotation and setback');
   }
  }
  const size=envelope.getSize(new THREE.Vector3());results.push({name,animatedBounds:size.toArray().map(n=>+n.toFixed(3)),dynamic:dynamic.map(n=>n.name)});
 }
}
console.log(JSON.stringify({models,pivots,poses,normals,failures:0,results},null,2));

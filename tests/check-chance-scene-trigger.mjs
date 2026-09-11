import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const THREE=await import(pathToFileURL(root+'assets/vendor/three/three.module.min.js'));
const {GLTFLoader}=await import(pathToFileURL(root+'assets/vendor/three/addons/loaders/GLTFLoader.js'));
const {mergeGeometries}=await import(pathToFileURL(root+'assets/vendor/three/addons/utils/BufferGeometryUtils.js'));
const {createSceneLife}=await import(pathToFileURL(root+'scene-life.js'));
const source=fs.readFileSync(root+'scene.js','utf8');
const body=source.slice(source.indexOf('function optimizeModel('),source.indexOf('function saleSign('));
const optimize=new Function('THREE','mergeGeometries','modelResources',body+';return optimizeModel;')(THREE,mergeGeometries,new Set());
const bytes=fs.readFileSync(root+'assets/models/compact-specials.glb');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const asset=optimize(gltf.scene.getObjectByName('compact_chance_wheel'));
function run(event){
 const scene=new THREE.Scene(),world=new THREE.Group(),light=new THREE.DirectionalLight();scene.add(world,light);
 const model=asset.clone(true);model.userData.tileIndex=7;world.add(model);
 const controller=createSceneLife({THREE,scene,world,light,boardBounds:{w:9.9,d:8.25},snapshot:{board:Array(18)},lotViews:new Map([[7,{building:model}]])});
 const wheel=model.getObjectByName('life_compact_wheel_rotor');assert.ok(wheel);
 controller.tick(100,.05);const before=wheel.rotation.z;controller.effect(event);controller.tick(150,.05);const delta=wheel.rotation.z-before;
 controller.dispose();assert.equal(controller.stats().disposed,true);return delta;
}
const idle=run({tiles:[9]}),direct=run({tiles:[7]}),trigger=run({tiles:[9],triggerTiles:[7]}),duplicate=run({tiles:[7,7],triggerTiles:[7,7]});
assert.ok(trigger>idle*10,'chance origin wheel accelerates when only bank is highlighted');assert.ok(Math.abs(direct-trigger)<1e-10);assert.ok(Math.abs(direct-duplicate)<1e-10,'union triggers a movable part once');
console.log(JSON.stringify({idle,direct,trigger,duplicate,failures:0}));

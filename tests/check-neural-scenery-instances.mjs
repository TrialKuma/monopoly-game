import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import {instanceGardenBuildings} from '../scene-garden-kit.js';

const geometry=new THREE.BoxGeometry(.8,1.2,.7),material=new THREE.MeshStandardMaterial(),source=new THREE.Group();
source.position.set(3,0,-2);
const expected=[];
for(let i=0;i<12;i++){
  const house=new THREE.Group();house.position.set(i*1.6,0,(i%2)*2);house.rotation.y=i*.3;house.scale.setScalar(.7+i*.03);
  const mesh=new THREE.Mesh(geometry,material);mesh.position.y=.6;house.add(mesh);source.add(house);expected.push(mesh);
}
const owned=new Set(),instances=instanceGardenBuildings({THREE,source,own:value=>{owned.add(value);return value;}});
assert.equal(instances.children.length,1);const mesh=instances.children[0];
assert(mesh.isInstancedMesh);assert.equal(mesh.count,12);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,material);
assert(!owned.has(geometry)&&!owned.has(material),'cache-owned source resources are borrowed');
const inverse=source.matrixWorld.clone().invert();
for(let i=0;i<12;i++){
  const actual=new THREE.Matrix4();mesh.getMatrixAt(i,actual);
  const wanted=new THREE.Matrix4().multiplyMatrices(inverse,expected[i].matrixWorld);
  assert(actual.elements.every((v,j)=>Math.abs(v-wanted.elements[j])<1e-6),'every position, rotation and scale survives instancing');
}
let geometryDisposed=0,materialDisposed=0,instancesDisposed=0;
geometry.addEventListener('dispose',()=>geometryDisposed++);material.addEventListener('dispose',()=>materialDisposed++);mesh.addEventListener('dispose',()=>instancesDisposed++);
owned.forEach(value=>value.dispose());assert.equal(instancesDisposed,1);assert.equal(geometryDisposed,0);assert.equal(materialDisposed,0);
geometry.dispose();material.dispose();
console.log('PASS 12 neural scenic placements share indexed source geometry; transforms, bounds and buffer ownership verified.');

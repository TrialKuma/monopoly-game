import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import {loadGeometryGLB} from './gltf-geometry-fixture.mjs';
import {createThermalSteam} from '../scene-thermal-steam.js';

let baths=0,pools=0,rays=0;
for(const map of ['classic','compact','expansion','harbor','alpine']) {
  // Load one small source model at a time, rather than retaining five kits.
  for(const level of [1,2,3]) {
    const asset=await loadGeometryGLB(new URL(`../art/blender-city/models/${map}/onsen_${level}/model.glb`,import.meta.url));
    const model=asset.scene.getObjectByName(`${map}_onsen_${level}`);
    assert(model,`${map}/${level}: real exported bath`);
    model.updateMatrixWorld(true);
    const anchors=model.userData.thermalPools;
    assert(Array.isArray(anchors)&&anchors.length>0,`${map}/${level}: authored water surface anchors`);
    if(level===3)assert(anchors.length>=2,`${map}: level three has distinct bathing areas`);
    const bounds=new THREE.Box3().setFromObject(model),ray=new THREE.Raycaster();
    for(const [x,y,z,w,d] of anchors) {
      assert(w>.1&&d>.1,'bath water remains visible at map scale');
      assert(bounds.containsPoint(new THREE.Vector3(x-w/2,y,z-d/2))&&bounds.containsPoint(new THREE.Vector3(x+w/2,y,z+d/2)),'anchors stay on the authored parcel');
      let exposed=0;
      for(const [dx,dz] of [[0,0],[-.22,-.22],[.22,-.22],[-.22,.22],[.22,.22]]) {
        ray.set(new THREE.Vector3(x+dx*w,bounds.max.y+1,z+dz*d),new THREE.Vector3(0,-1,0));
        const hit=ray.intersectObject(model,true)[0];rays++;
        const material=Array.isArray(hit?.object.material)?hit.object.material[hit.face.materialIndex]:hit?.object.material;
        if(hit&&Math.abs(hit.point.y-y)<.035&&/water foliage/.test(material.name))exposed++;
      }
      assert(exposed>=3,`${map}/onsen_${level}: ${exposed}/5 exposed samples; the main bath must not be hidden by a roof`);pools++;
    }
    const owned=new Set(),steam=createThermalSteam({THREE,model,own:r=>(owned.add(r),r)});
    assert.equal(owned.size,2,'one buffer and one material per spa');
    assert.equal(steam.geometry.attributes.position.count,anchors.length*12);
    assert(steam.geometry.attributes.position.count<=48,'bounded particle budget');
    assert.equal(steam.material.depthWrite,false);assert.equal(steam.castShadow,false);
    assert.equal(steam.userData.cosmetic,true);
    const hits=[];steam.raycast(ray,hits);assert.equal(hits.length,0,'steam never intercepts tile selection');
    steam.onBeforeRender({domElement:{height:1266}});assert.equal(steam.material.uniforms.pixelHeight.value,1266);
    let disposed=0;for(const resource of owned){resource.addEventListener('dispose',()=>disposed++);resource.dispose();}assert.equal(disposed,2);
    const resources=new Set();model.traverse(node=>{if(node.geometry)resources.add(node.geometry);for(const mat of Array.isArray(node.material)?node.material:[node.material])if(mat){resources.add(mat);for(const value of Object.values(mat))if(value?.isTexture)resources.add(value);}});resources.forEach(r=>r.dispose());
    baths++;
  }
}
assert.equal(createThermalSteam({THREE,model:new THREE.Group()}),null);
console.log(`PASS ${baths} baths / ${pools} real exposed water surfaces / ${rays} roof-clearance rays; bounded steam resources and non-interactive vapor.`);

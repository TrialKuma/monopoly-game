import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import {createFunctionalLandmark,FUNCTIONAL_TYPES} from '../scene-functional-landmarks.js';
import {loadGeometryGLB,regionalAssetURL} from './gltf-geometry-fixture.mjs';
import {regionalFixture} from './regional-scene-fixture.mjs';

const names={start:'civic_hall',bank:'vault_bank',construction:'builders_guild',card_draw:'card_pavilion',chance:'chance_wheel',teleport:'teleport_gate',rush:'rush_station',junction:'junction_hub'};
const mapIds=['classic','compact','expansion','harbor','alpine'];
const shapes=new Map(), totals={buildings:0,triangles:0,maxDraws:0,resourceChecks:0,footprintChecks:0,landingRays:0,cameraRays:0};
for(const mapId of mapIds){
  const gltf=await loadGeometryGLB(regionalAssetURL(mapId));
  let localTriangles=0;
  for(const type of FUNCTIONAL_TYPES){
    const model=gltf.scene.getObjectByName(`${mapId}_${names[type]}`).clone(true);
    model.position.set(0,0,0);model.updateMatrixWorld(true);
    const baseBounds=new THREE.Box3().setFromObject(model),sourceSize=baseBounds.getSize(new THREE.Vector3());
    const sourceGeometry=[],sourceMaterials=[];
    model.traverse(n=>{if(n.isMesh){sourceGeometry.push(n.geometry.uuid);sourceMaterials.push(n.material.uuid);}});
    const owned=new Set(),service=createFunctionalLandmark({THREE,mapId,type,model,own:r=>(owned.add(r),r)});
    assert(service?.isGroup);assert.equal(service.userData.functionalService,type);assert(service.userData.silhouette);
    assert(service.children.length>0&&service.children.length<=2,'opaque parts merge to one surface plus an optional glow surface');
    assert.equal(owned.size,service.children.length*2,'only final merged geometry and material are retained');
    const bounds=new THREE.Box3().setFromObject(service);
    assert(bounds.min.y>=-.001&&bounds.max.y<1.9,`${mapId} ${type} stays at a modest public-building height`);
    assert(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x),Math.abs(bounds.min.z),Math.abs(bounds.max.z))<=.651,`${mapId} ${type}: accessory stays inside parcel envelope`);
    for(const quarter of [0,1,2,3]){
      // The largest (0.10 m) scene setback is applied before checking the
      // inside edge against a pawn's 0.195 m body and its 1.04 m walk offset.
      const turned=bounds.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(quarter*Math.PI/2));
      assert(Math.max(turned.max.x+.10,turned.max.z+.10)<1.04-.195);totals.footprintChecks++;
    }
    let triangles=0,hash=createHash('sha256');
    service.traverse(n=>{if(n.isMesh){
      assert(owned.has(n.geometry)&&owned.has(n.material));
      assert.equal(n.material.userData.functionalService,type);
      for(const attr of ['position','normal','color'])assert(Array.from(n.geometry.getAttribute(attr).array).every(Number.isFinite));
      assert(n.material.vertexColors);assert.equal(n.material.transparent,false);
      triangles+=(n.geometry.index?.count||n.geometry.getAttribute('position').count)/3;
      for(const attr of ['position','color'])hash.update(Buffer.from(n.geometry.getAttribute(attr).array.buffer));
      const hit=[],box=new THREE.Box3().setFromObject(n),center=box.getCenter(new THREE.Vector3());
      n.raycast(new THREE.Raycaster(new THREE.Vector3(center.x,5,center.z),new THREE.Vector3(0,-1,0)),hit);assert.equal(hit.length,0,'decoration cannot consume board interactions');
    }});
    assert(triangles<6500,`${mapId} ${type}: ${triangles} triangles is a compact addition`);
    if(!shapes.has(type))shapes.set(type,new Set());shapes.get(type).add(hash.digest('hex'));
    const afterGeometry=[],afterMaterials=[];model.traverse(n=>{if(n.isMesh){afterGeometry.push(n.geometry.uuid);afterMaterials.push(n.material.uuid);}});
    assert.deepEqual(afterGeometry,sourceGeometry);assert.deepEqual(afterMaterials,sourceMaterials);
    assert.deepEqual(new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).toArray(),sourceSize.toArray(),'regional source is untouched until caller mounts attachment');
    let disposal=0;for(const resource of owned){resource.addEventListener('dispose',()=>disposal++);resource.dispose();}
    assert.equal(disposal,owned.size);totals.resourceChecks+=owned.size;
    totals.buildings++;totals.triangles+=triangles;totals.maxDraws=Math.max(totals.maxDraws,service.children.length);localTriangles+=triangles;
  }
  const resources=new Set();gltf.scene.traverse(n=>{if(n.geometry)resources.add(n.geometry);if(n.material){for(const m of Array.isArray(n.material)?n.material:[n.material]){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}}});resources.forEach(r=>r.dispose());
  // Drive production placement, quarter-turns, camera-readable rotations and
  // the outward setback. Cosmetic raycast no-ops are intentionally bypassed:
  // a click-transparent structure can still physically hide a pawn.
  const fixture=await regionalFixture(mapId),geometryMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  try {
    const views=fixture.build({level:3,steps:true,owners:'alternating'});
    fixture.run(`wrap={getBoundingClientRect:()=>({width:390,height:844}),dataset:{}};renderer={setSize(){}};
      camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,200);isLocalCamera=()=>true;cameraFocusReady=true;
      arrangeLabels=()=>{};positionLabels=()=>{};syncCameraControls=()=>{};resize();world.updateMatrixWorld(true);`);
    const direction=fixture.run('camera.position.clone().sub(cameraFocus).normalize()'),rows=[];
    for(const view of views)view.building.traverse(n=>{if(n.isMesh&&n.material.userData.functionalService){
      const copy=new THREE.Mesh(n.geometry,geometryMaterial);copy.name=n.name;copy.matrixAutoUpdate=false;copy.matrixWorld.copy(n.matrixWorld);
      rows.push(copy);
    }});
    assert(rows.length>0,'production createLotModel must install the service structures');
    const ray=new THREE.Raycaster();
    function verticalHit(x,z){ray.set(new THREE.Vector3(x,8,z),new THREE.Vector3(0,-1,0));ray.near=0;ray.far=7.735;return ray.intersectObjects(rows,false)[0];}
    function cameraHit(target){ray.set(target.clone().addScaledVector(direction,45),direction.clone().negate());ray.near=0;ray.far=44.98;return ray.intersectObjects(rows,false)[0];}
    for(const tile of fixture.board){
      fixture.context.index=tile.index;fixture.run('data.players[0].position=index;data.players[1].position=(index+1)%data.board.length');
      const single=fixture.run('pawnPosition(data.players[0])');fixture.run('data.players.forEach(p=>p.position=index)');
      for(const pawn of [single,...fixture.run('data.players.map(p=>pawnPosition(p))')]){
        for(let i=0;i<9;i++){
          const angle=i*Math.PI/4,r=i?.195:0,hit=verticalHit(pawn.x+Math.cos(angle)*r,pawn.z+Math.sin(angle)*r);totals.landingRays++;
          assert.equal(Boolean(hit),false,`${mapId} landing ${tile.index} intersects ${hit?.object.name||'no accessory'}`);
        }
        for(const h of [.17,.31,.47]){
          const hit=cameraHit(new THREE.Vector3(pawn.x,.265+h,pawn.z));totals.cameraRays++;
          assert.equal(Boolean(hit),false,`${mapId} portrait pawn ${tile.index} hidden by ${hit?.object.name||'no accessory'}`);
        }
      }
    }
    // Prove that the diagnostic detects geometry despite production no-pick
    // flags, and ignores a shape located behind the pawn.
    const probe=new THREE.Mesh(new THREE.BoxGeometry(.12,.3,.12),geometryMaterial),target=new THREE.Vector3(0,.575,0);
    rows.length=0;rows.push(probe);probe.position.set(0,.4,0);probe.updateMatrixWorld(true);assert(verticalHit(0,0));
    probe.position.copy(target).addScaledVector(direction,1);probe.updateMatrixWorld(true);assert(cameraHit(target));
    probe.position.copy(target).addScaledVector(direction,-1);probe.updateMatrixWorld(true);assert.equal(cameraHit(target),undefined);
    probe.geometry.dispose();
  }finally{fixture.dispose();geometryMaterial.dispose();}
  console.log(`PASS ${mapId}: eight distinctive public structures, ${localTriangles} added triangles`);
}
for(const type of FUNCTIONAL_TYPES)assert.equal(shapes.get(type).size,5,`${type} retains five regional palettes or cap structures`);
assert.equal(createFunctionalLandmark({THREE,mapId:'classic',type:'villa',model:new THREE.Group()}),null);
assert.equal(createFunctionalLandmark({THREE,mapId:'classic',type:'bank',model:new THREE.Group()}),null);
console.log(JSON.stringify(totals));

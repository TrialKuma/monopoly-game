// Strict release audit. A pending queue is intentionally not a passing release.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Matrix4,Vector3,Quaternion,Box3} from '../assets/vendor/three/three.module.min.js';
import {verifyApproval,scalar} from './ai-city-fixture.mjs';
import {verifyNormalTextureRemoval} from './fidelity-wheel-fixture.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const maps=['classic','compact','expansion','harbor','alpine'];
const families=['villa','shop','hotel','tower','skyscraper','finance','onsen'];
const publics=['civic_hall','vault_bank','builders_guild','card_pavilion','chance_wheel','teleport_gate','rush_station','junction_hub'];
const names=[...families.flatMap(f=>[1,2,3].map(l=>`${f}_${l}`)),...publics];
const requested=process.argv.find(a=>a.startsWith('--map='))?.slice(6);
const candidate=process.argv.includes('--candidate');
const registry=JSON.parse(fs.readFileSync(path.join(root,'art/full-ai-city/approved-assets.json'),'utf8'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function local(value){
  // Historical inference receipts retain this machine's original absolute path.
  // Resolve their project-relative suffix for verification after a clean clone.
  const normalized=value.replaceAll('\\','/'),marker='/monopoly/',index=normalized.indexOf(marker);
  const resolved=path.resolve(root,index>=0?normalized.slice(index+marker.length):normalized);
  assert(!path.relative(root,resolved).startsWith('..'),'receipt stays inside project');return resolved;
}
function receipt(row){const bytes=fs.readFileSync(local(row.path));assert.equal(hash(bytes),row.sha256,`exact reviewed bytes: ${row.path}`);return bytes;}
function glb(bytes){
  assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
  assert.equal(bytes.readUInt32LE(24+length),0x004e4942);
  return {doc:JSON.parse(bytes.subarray(20,20+length)),bin:bytes.subarray(28+length)};
}
function images({doc,bin}){return (doc.images||[]).map(image=>{
  assert.equal(typeof image.bufferView,'number');assert(!image.uri,'no external textures');const v=doc.bufferViews[image.bufferView];
  return hash(bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength));
});}
function transform(node){return node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3().fromArray(node.translation||[0,0,0]),new Quaternion().fromArray(node.rotation||[0,0,0,1]),new Vector3().fromArray(node.scale||[1,1,1]));}
// One already-reviewed rotor has 500 disclosed vertex-colored occlusion caps.
// This exact-source exception must not permit arbitrary untextured buildings.
function verifyReviewedColorRepair(packed,node,primitive,entry,source,processing){
  const originalSha='7b02e48fcfab206058d07adb79960975b92527a75d1cabf0cb292d5b1ec8d23c';
  const label='only the frozen Alpine rotor or its exact normal-binding-only derivative uses interpolated cap colors';
  assert.equal(entry.candidate.sha256,processing.processedCandidate.sha256,label);
  let approval=entry;
  if(entry.candidate.sha256!==originalSha){
    const shading=processing.shadingOnlyRefinement;
    assert(shading&&!processing.localWheelTextureRepair&&shading.sourceCandidate.sha256===originalSha,label);
    const prior=JSON.parse(receipt(shading.sourceProcessingReport));
    assert.equal(prior.processedCandidate.sha256,originalSha,label);
    assert.deepEqual(processing.componentLocalRepair,prior.componentLocalRepair,label);
    verifyNormalTextureRemoval(glb(receipt(shading.sourceCandidate)),source,shading.removedNormalTextureMaterials);
    approval=entry.previousDecisions?.find(row=>row.status==='approved'&&row.candidate.sha256===originalSha&&row.processingReport.sha256===shading.sourceProcessingReport.sha256);
    assert(approval,label);receipt(approval.processingReport);receipt(approval.candidate);
  }
  assert.equal(node.name,'alpine__chance_wheel__neural_wheel');
  assert.equal(node.extras?.lifePart,'wheel');
  const link=processing.componentLocalRepair;
  assert.equal(link?.newFacesAdded,500);
  const repair=JSON.parse(receipt(link.localRepair));receipt(link.verification);receipt(link.tool);
  assert.equal(repair.output.sha256,originalSha);assert.equal(repair.addedCapTriangles,500);
  assert(repair.colorRepairReason.length>30&&approval.reviewNote.includes('vertex-color interpolation'),'color interpolation is explicitly disclosed and reviewed');
  const originalNode=source.doc.nodes.find(n=>n.name===node.name);
  const original=source.doc.meshes[originalNode.mesh].primitives.filter(p=>!source.doc.materials[p.material].pbrMetallicRoughness.baseColorTexture);
  assert.equal(original.length,1);
  const before=original[0];
  assert.deepEqual(packed.doc.materials[primitive.material],source.doc.materials[before.material],'cap material remains exactly reviewed');
  assert.deepEqual(Object.keys(primitive.attributes).sort(),Object.keys(before.attributes).sort());
  assert(primitive.attributes.COLOR_0!==undefined,'color-repaired cap cannot become plain white');
  assert.equal(packed.doc.accessors[primitive.indices].count,1500,'exactly 500 disclosed cap faces');
  for(const [a,b] of [[primitive.indices,before.indices],...Object.keys(before.attributes).map(k=>[primitive.attributes[k],before.attributes[k]])]){
    const actual=packed.doc.accessors[a],expected=source.doc.accessors[b];
    for(const key of ['count','type','componentType','normalized'])assert.equal(actual[key],expected[key],`cap accessor ${key}`);
    const arity={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[actual.type];
    for(let i=0;i<actual.count;i++)for(let k=0;k<arity;k++)assert.equal(scalar(packed,a,i,k),scalar(source,b,i,k),'original cap geometry, UV, normals, indices and colors preserved');
  }
  for(let i=0;i<1500;i++){
    const vertex=scalar(packed,primitive.indices,i);
    for(let k=0;k<4;k++){const c=scalar(packed,primitive.attributes.COLOR_0,vertex,k);assert(Number.isFinite(c)&&c>=0&&c<=1,'valid cap vertex color');}
  }
}
function measure(packed,index,entry,source,processing){
  const {doc}=packed;
  const box=new Box3(),parts=[];let triangles=0;
  function visit(i,parent){
    const n=doc.nodes[i],world=parent.clone().multiply(transform(n));if(n.extras?.lifePart)parts.push(n.extras.lifePart);
    if(n.mesh!==undefined)for(const primitive of doc.meshes[n.mesh].primitives){
      assert.equal(primitive.mode??4,4);const position=doc.accessors[primitive.attributes.POSITION];
      assert(position.min.every(Number.isFinite)&&position.max.every(Number.isFinite));
      const denominator=position.normalized?({5120:127,5121:255,5122:32767,5123:65535}[position.componentType]):1;
      assert(denominator);const convert=values=>values.map(v=>position.normalized?Math.max(-1,v/denominator):v);
      box.union(new Box3(new Vector3().fromArray(convert(position.min)),new Vector3().fromArray(convert(position.max))).applyMatrix4(world));
      triangles+=(primitive.indices===undefined?position:doc.accessors[primitive.indices]).count/3;
      for(const semantic of ['NORMAL','TEXCOORD_0'])assert.equal(doc.accessors[primitive.attributes[semantic]].count,position.count,`${semantic} retained`);
      if(!doc.materials[primitive.material].pbrMetallicRoughness.baseColorTexture){
        verifyReviewedColorRepair(packed,n,primitive,entry,source,processing);
        assert.throws(()=>verifyReviewedColorRepair(packed,n,primitive,{...entry,candidate:{...entry.candidate,sha256:'0'.repeat(64)}},source,processing),/only the frozen Alpine rotor/);
        const missingColor={...primitive,attributes:{...primitive.attributes}};delete missingColor.attributes.COLOR_0;
        assert.throws(()=>verifyReviewedColorRepair(packed,n,missingColor,entry,source,processing));
        const changedMaterial={...packed,doc:{...doc,materials:doc.materials.map((m,i)=>i===primitive.material?{...m,pbrMetallicRoughness:{...m.pbrMetallicRoughness,baseColorFactor:[0,0,0,1]}}:m)}};
        assert.throws(()=>verifyReviewedColorRepair(changedMaterial,n,primitive,entry,source,processing),/cap material remains exactly reviewed/);
      }
    }
    for(const child of n.children||[])visit(child,world);
  }
  visit(index,new Matrix4());return {box,size:box.getSize(new Vector3()),triangles,parts};
}
const rawSources=new Set(),referenceSets=new Set();let verified=0;
for(const map of requested?[requested]:maps){
  assert(maps.includes(map));
  const file=candidate?`art/full-ai-city/packed/${map}.glb`:`assets/models/regions/${map}.glb`;
  const bytes=fs.readFileSync(local(file)),packed=glb(bytes),roots=packed.doc.scenes[packed.doc.scene||0].nodes;
  assert(bytes.length<99_000_000,'regional package remains a downloadable file');
  assert.deepEqual(roots.map(i=>packed.doc.nodes[i].name).sort(),names.map(name=>`${map}_${name}`).sort(),'exact 29 gameplay assets');
  const textures=new Set(images(packed)),heights=new Map();
  for(const name of names){
    const key=`${map}/${name}`,entry=registry.assets[key];assert.equal(entry?.status,'approved',`${key}: real visual decision required`);
    const {candidate:source,inference,processing}=verifyApproval(entry);
    assert(!rawSources.has(inference.output_sha256),`${key}: unique neural generation, not another region or level scaled/recolored`);rawSources.add(inference.output_sha256);
    const referenceKey=inference.input_views.map(v=>v.sha256).join(':');assert(!referenceSets.has(referenceKey),`${key}: individually designed multiview reference`);referenceSets.add(referenceKey);
    const index=roots.find(i=>packed.doc.nodes[i].name===`${map}_${name}`),node=packed.doc.nodes[index],extra=node.extras;
    assert.equal(extra.sourceType,'pixal_native_multiview');assert.equal(extra.reviewStatus,'approved');assert.equal(extra.sourceSha256,entry.candidate.sha256);assert.equal(extra.rawSourceSha256,inference.output_sha256);
    assert.deepEqual(extra.referenceViews.map(v=>v.sha256),inference.input_views.map(v=>v.sha256),'review page displays actual model inputs');
    assert(transform(node).equals(new Matrix4()),'root identity supports gameplay placement');
    const m=measure(packed,index,entry,source,processing),large=['skyscraper','finance','onsen'].includes(extra.family),isPublic=publics.includes(extra.family);
    assert(Math.abs(m.box.min.y)<.002,'grounded model');assert(Math.abs(m.box.min.x+m.box.max.x)<.002&&Math.abs(m.box.min.z+m.box.max.z)<.002,'centered model');
    const [w,h,d]=large?[2.7,2.6,1.15]:isPublic?[1.12,1.5,1.12]:[1.05,1.85,1.05];assert(m.size.x<=w&&m.size.y<=h&&m.size.z<=d,`${key}: parcel clearance`);
    const budget=large?46000:entry.budgetReason?.length>=30?(entry.triangleBudget===65000?65000:46000):32000;
    assert(m.triangles>=10000&&m.triangles<=budget,`${key}: geometry budget (${m.triangles})`);
    assert(images(source).every(image=>textures.has(image)),'approved embedded texture bytes survive packaging');
    if(name==='chance_wheel')assert(m.parts.includes('wheel'),'separate moving neural wheel');
    if(name==='builders_guild')assert(m.parts.includes('pendulum'),'separate moving neural crane load');
    if(['chance_wheel','builders_guild'].includes(name)){
      assert(entry.motionReview&&entry.motionReview.frames.length>=3,'actual motion was visually reviewed');receipt(entry.motionReview.report);entry.motionReview.frames.forEach(receipt);
      assert.equal(source.doc.animations?.length||0,0,'scene-life drives public parts once, without a second GLTF clip');
    }
    if(!isPublic)heights.set(`${extra.family}_${extra.level}`,m.size.y);
    verified++;
  }
  for(const family of families)assert(heights.get(`${family}_1`)<heights.get(`${family}_2`)&&heights.get(`${family}_2`)<heights.get(`${family}_3`),`${map}/${family}: upgrade shapes visibly grow`);
  console.log(`PASS ${map}: 29 unique native three-view models; approved geometry, texture provenance, bounds and animation parts`);
}
console.log(`Verified ${verified} gameplay buildings. Generated or queued assets without visual approval cannot pass.`);
await import('./check-building-previews.mjs');

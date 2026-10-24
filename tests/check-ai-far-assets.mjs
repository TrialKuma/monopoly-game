import assert from 'node:assert/strict';
import {json,read,glb,imageHashes,verifyApproval,verifyPackManifest} from './ai-city-fixture.mjs';
const candidate=process.argv.includes('--candidate'),requested=process.argv.find(a=>a.startsWith('--map='))?.slice(6);
const maps=['classic','compact','expansion','harbor','alpine'],names=['villa_3','shop_2','hotel_2','tower_2','junction_hub'];
const near=json('art/full-ai-city/approved-assets.json'),far=json('art/full-ai-city/approved-far-assets.json');
let count=0;
for(const map of requested?[requested]:maps){
  assert(maps.includes(map));const file=candidate?`art/full-ai-city/packed/${map}-far.glb`:`assets/models/regions-far/${map}.glb`;
  const bytes=read(file),asset=glb(bytes),manifest=verifyPackManifest(file,bytes),roots=asset.doc.scenes[asset.doc.scene||0].nodes;
  assert(bytes.length<6*1024*1024,'five lightweight scenic buildings per region');assert.deepEqual(roots.map(i=>asset.doc.nodes[i].name).sort(),names.map(n=>`${map}_${n}`).sort());
  const textures=new Set(imageHashes(asset));
  for(const name of names){
    const key=`${map}/${name}`,entry=far.assets[key],approval=verifyApproval(entry),nearEntry=near.assets[key];
    assert.equal(entry.nearSourceSha256,nearEntry.candidate.sha256,'same currently approved architectural design');assert.equal(entry.inferenceReport.sha256,nearEntry.inferenceReport.sha256,'far LOD derives from same actual neural source');
    const node=asset.doc.nodes[roots.find(i=>asset.doc.nodes[i].name===`${map}_${name}`)],row=manifest.assets.find(r=>r.name===node.name);
    assert.equal(node.extras.nearSourceSha256,nearEntry.candidate.sha256);assert.equal(node.extras.sourceSha256,entry.candidate.sha256);assert.equal(node.extras.sourceType,'pixal_native_multiview');
    const ceiling=entry.triangleBudget===20000?20000:13000;
    if(ceiling>13000){assert(entry.budgetReason?.length>=30,'complex far roof requires an explicit visual justification');assert.equal(node.extras.triangleBudget,20000);assert.equal(node.extras.budgetReason,entry.budgetReason);}
    assert(row.triangles>=1000&&row.triangles<=ceiling,'reviewed per-building far geometry ceiling');assert(imageHashes(approval.candidate).every(h=>textures.has(h)));
    assert(approval.processing.textureSizes.every(t=>t.size[0]<=512&&t.size[1]<=512),'far texture budget');count++;
  }
  console.log(`PASS ${map}: 5 visually reviewed source-derived far LODs`);
}
console.log(`Verified ${count} far LOD derivatives; these are not counted as additional AI buildings.`);

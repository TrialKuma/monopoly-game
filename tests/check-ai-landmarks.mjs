import assert from 'node:assert/strict';
import {json,read,glb,imageHashes,verifyApproval,verifyPackManifest,verifyAnimation} from './ai-city-fixture.mjs';
const candidate=process.argv.includes('--candidate');
const registry=json('art/full-ai-city/approved-assets.json');
const sourceHashes=new Set(Object.entries(registry.assets)
  .filter(([key])=>!['harbor/lighthouse','alpine/windmill'].includes(key))
  .map(([,entry])=>json(entry.inferenceReport.path).output_sha256));
for(const [region,name] of [['harbor','lighthouse'],['alpine','windmill']]){
  const key=`${region}/${name}`,rootName=`${region}_${name}`,entry=registry.assets[key],approval=verifyApproval(entry);
  assert(entry.motionReview,'actually rendered poses reviewed with the static model');
  const file=candidate?`art/full-ai-city/packed/${rootName}.glb`:`assets/models/harbor/${rootName}.glb`;
  const bytes=read(file),asset=glb(bytes),manifest=verifyPackManifest(file,bytes),roots=asset.doc.scenes[asset.doc.scene||0].nodes;
  assert.deepEqual(roots.map(i=>asset.doc.nodes[i].name),[rootName]);const extra=asset.doc.nodes[roots[0]].extras;
  assert.equal(extra.sourceType,'pixal_native_multiview');assert.equal(extra.sourceSha256,entry.candidate.sha256);assert.equal(extra.rawSourceSha256,approval.inference.output_sha256);
  assert(!sourceHashes.has(extra.rawSourceSha256),'centerpiece must have its own native generation, distinct from every playable building');sourceHashes.add(extra.rawSourceSha256);
  assert.deepEqual(extra.referenceViews.map(v=>v.sha256),approval.inference.input_views.map(v=>v.sha256));
  const textures=new Set(imageHashes(asset));assert(imageHashes(approval.candidate).every(h=>textures.has(h)));
  const moving=verifyAnimation(asset,rootName),row=manifest.assets[0];
  assert(row.triangles>=15000&&row.triangles<=46000,`${key}: source-derived mobile mesh budget`);assert(bytes.length<4*1024*1024);
  assert(row.bounds.min.every(Number.isFinite)&&row.bounds.max.every(Number.isFinite));assert(Math.abs(row.bounds.min[1])<.002);assert(row.size[0]<=2.8+.002&&row.size[1]<=3.7+.002&&row.size[2]<=2.8+.002);
  console.log(`PASS ${key}: ${row.triangles} triangles; native three-view source, frozen visual evidence, ${moving} moving neural component(s)`);
}

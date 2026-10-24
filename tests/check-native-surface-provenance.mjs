import assert from 'node:assert/strict';
import {json,verifyNativeSurfaceExport,verifyNativeUVTransfer,verifyLocalSurfaceRepair,verifyPostNativeUVCorrection,verifyApproval} from './ai-city-fixture.mjs';

const approved=Object.entries(json('art/full-ai-city/approved-assets.json').assets)
  .map(([key,entry])=>({key,entry,processing:json(entry.processingReport.path)}));
const entries=approved.filter(item=>item.processing.nativeSurfaceExport);
assert(entries.length>0,'at least one actually reviewed direct-field derivative is required');
for(const {key,entry,processing} of entries)verifyApproval(entry);
const {key,processing}=entries[0];
for(const [label,alter] of [
  ['another raw model',p=>{p.source.rawGLB.sha256='0'.repeat(64);}],
  ['another neural field',p=>{p.nativeSurfaceExport.tensorArchive.sha256='0'.repeat(64);}],
  ['an unrecorded geometry change',p=>{p.triangles++;}],
  ['a substituted raw-UV rebake',p=>{p.derivation.rebakedFromRawUV=true;}],
]){
  const changed=structuredClone(processing);alter(changed);
  assert.throws(()=>verifyNativeSurfaceExport(changed),undefined,`${key}: reject ${label}`);
}
const repairs=approved.filter(item=>item.processing.localSurfaceRepair);
for(const {processing} of repairs){
  const repair=processing.localSurfaceRepair,raw=processing.source.rawGLB;verifyLocalSurfaceRepair(repair,raw);
  for(const alter of [r=>r.source.sha256='0'.repeat(64),r=>r.newTriangles++,r=>r.regions=[]]){
    const changed=structuredClone(repair);alter(changed);assert.throws(()=>verifyLocalSurfaceRepair(changed,raw));
  }
}
const uvTransfers=approved.filter(item=>item.processing.textureOnlyReprocessing?.nativeUVReceipt);
for(const {entry,processing} of uvTransfers){
  verifyApproval(entry);
  for(const alter of [p=>p.triangles++,p=>p.textureOnlyReprocessing.positionsUnchanged=false,p=>p.source.rawGLB.sha256='0'.repeat(64)]){
    const changed=structuredClone(processing);alter(changed);assert.throws(()=>verifyNativeUVTransfer(changed));
  }
}
const corrections=approved.filter(item=>item.processing.postNativeUVCorrection);
for(const {processing} of corrections){
  verifyPostNativeUVCorrection(processing);
  for(const alter of [p=>p.processedCandidate.sha256='0'.repeat(64),p=>p.postNativeUVCorrection.output.sha256='0'.repeat(64),p=>p.postNativeUVCorrection.verification.changedTriangles++,p=>p.nativeSurfaceExport.source.sha256='0'.repeat(64)]){
    const changed=structuredClone(processing);alter(changed);assert.throws(()=>verifyPostNativeUVCorrection(changed));
  }
}
console.log(`PASS ${entries.length} reviewed direct-field sources, ${uvTransfers.length} geometry-preserving native UV transfers, ${repairs.length} disclosed local repairs, ${corrections.length} bounded post-export UV corrections and ${4+repairs.length*3+uvTransfers.length*3+corrections.length*4} mismatched-provenance rejections`);

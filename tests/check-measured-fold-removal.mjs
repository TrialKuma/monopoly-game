import assert from 'node:assert/strict';
import {json,receipt,verifyMeasuredFoldRemoval,verifyLocalSurfaceRepair} from './ai-city-fixture.mjs';

const repair=json('art/full-ai-city/reports/local-repairs/alpine/builders_guild/edeb9fecf18db92dc/repair.json');
const proof=JSON.parse(receipt(repair.sourcePreservation));receipt(proof.tool);
verifyMeasuredFoldRemoval(repair,proof);
const workshopEntry=json('art/full-ai-city/approved-assets.json').assets['alpine/builders_guild'];
const workshop=JSON.parse(receipt(workshopEntry.processingReport));
assert.equal(workshop.localSurfaceRepair.source.sha256,repair.nativeOutput.sha256);
// Both proof formats contain removedRegionCounts. Route the actual repair
// entry by its exact reviewed source, never by that shared optional field.
verifyLocalSurfaceRepair(workshop.localSurfaceRepair,workshop.source.rawGLB);
for(const [name,alter] of [
  ['different raw',p=>p.source.sha256='0'.repeat(64)],
  ['different repaired source',p=>p.repaired.sha256='0'.repeat(64)],
  ['changed original images',p=>p.originalImagesExact=false],
  ['missing surviving source surface',p=>p.survivingTrianglesExact--],
  ['undeclared added geometry',p=>p.addedTriangles++],
  ['duplicate source IDs',p=>p.removedSourceTriangleIds[0]=p.removedSourceTriangleIds[1]],
  ['out-of-range source ID',p=>p.removedSourceTriangleIds[0]=p.originalTriangles],
  ['missing source IDs',p=>p.removedSourceTriangleIds.pop()],
  ['large distant wall deletion',p=>p.removedFaceCentroidsBlender[0]=[0,0,0]],
  ['outside the measured roof depth',p=>p.removedFaceCentroidsBlender[0][0]+=1],
  ['non-finite coordinates',p=>p.removedFaceCentroidsBlender[0][0]=NaN],
  ['distorted normalization',p=>p.nativeToNormalizedGLTF[0][0]*=2],
  ['failed correspondence',p=>p.affineMaxError=.01],
]){
  const changed=structuredClone(proof);alter(changed);
  assert.throws(()=>verifyMeasuredFoldRemoval(repair,changed),undefined,name);
}
for(const [name,alter] of [
  ['no explicit removal regions',r=>r.repairs=[]],
  ['wrong per-region counts',r=>r.repairs[1].localFoldFacesToDelete++],
  ['whole-roof region',r=>r.repairs[1].specification.roi=[-1,1,0,1]],
]){
  const changed=structuredClone(repair);alter(changed);
  assert.throws(()=>verifyMeasuredFoldRemoval(changed,proof),undefined,name);
}
console.log('PASS measured 800-fold cleanup with exact surviving-surface proof and 16 invalid-proof rejections');

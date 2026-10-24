import assert from 'node:assert/strict';
import {json,receipt,verifyWheelSourceCleanup} from './ai-city-fixture.mjs';

const repair=json('art/full-ai-city/reports/local-repairs/expansion/chance_wheel/5b62a9340c33b44a/repair.json');
const proof=JSON.parse(receipt(repair.sourcePreservation));receipt(proof.tool);
verifyWheelSourceCleanup(repair,proof);
let rejected=0;
for(const [name,alter] of [
  ['different immutable raw',p=>p.source.sha256='0'.repeat(64)],
  ['different repaired source',p=>p.repaired.sha256='0'.repeat(64)],
  ['different measured normalization',p=>p.normalized.sha256='0'.repeat(64)],
  ['changed native images',p=>p.originalImagesExact=false],
  ['missing surviving source surface',p=>p.survivingTrianglesExact--],
  ['undeclared new geometry',p=>p.addedTriangles++],
  ['duplicate removed IDs',p=>p.removedSourceTriangleIds[0]=p.removedSourceTriangleIds[1]],
  ['out of range removed ID',p=>p.removedSourceTriangleIds[0]=p.originalTriangles],
  ['missing removed ID',p=>p.removedSourceTriangleIds.pop()],
  ['unrelated wall deletion',p=>p.removedFaceCentroidsBlender[0]=[0,0,.6]],
  ['wheel-disc deletion',p=>p.removedFaceCentroidsBlender[0]=[.3,-.14,.3]],
  ['outside backing depth',p=>p.removedFaceCentroidsBlender[0]=[.49,-.2,.3]],
  ['outside lintel region',p=>p.removedFaceCentroidsBlender[0]=[-.4,.19,.53]],
  ['non-finite removed position',p=>p.removedFaceCentroidsBlender[0][0]=NaN],
  ['distorted normalization',p=>p.nativeToNormalizedGLTF[0][0]*=2],
  ['failed measured correspondence',p=>p.affineMaxError=.1],
  ['wrong backing count',p=>p.removedRegionCounts.extraneousDiscBacking++],
  ['unknown extra removal region',p=>p.removedRegionCounts.wholeRoof=1],
]){
  const changed=structuredClone(proof);alter(changed);
  assert.throws(()=>verifyWheelSourceCleanup(repair,changed),undefined,name);rejected++;
}
for(const [name,alter] of [
  ['whole wall exception',r=>r.artifactCleanup.foldCleanup.bounds.x=[-1,1]],
  ['wrong repair deletion count',r=>r.artifactCleanup.deletedTriangles++],
  ['missing covering repair',r=>r.repairs=[]],
  ['moved covering repair',r=>r.repairs[0].specification.forceRoi=[-.3,-.2,.5,.6]],
  ['recessed wall donor',r=>r.repairs[0].specification.donorDepth=.387],
]){
  const changed=structuredClone(repair);alter(changed);
  assert.throws(()=>verifyWheelSourceCleanup(changed,proof),undefined,name);rejected++;
}
console.log(`PASS exact 2777-face wheel source cleanup, surviving-surface proof and ${rejected} invalid-proof rejections`);

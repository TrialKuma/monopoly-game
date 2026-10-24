import assert from 'node:assert/strict';
import {json,receipt,glb,scalar,imageHashes,hash,verifyNativeUVTransfer} from './ai-city-fixture.mjs';
import {verifyMechanicalAccounting,verifyMechanicalDerivative} from './mechanical-surface-fixture.mjs';

const entry=json('art/full-ai-city/approved-assets.json').assets['compact/chance_wheel'];
assert(entry?.status==='approved');
const processing=JSON.parse(receipt(entry.processingReport)),context={candidateReceipt:entry.candidate};
const repair=JSON.parse(receipt(processing.componentLocalRepair.localRepair));
const verification=JSON.parse(receipt(processing.componentLocalRepair.verification));
const original=29989,api={receipt,glb,scalar,imageHashes,...context};
verifyNativeUVTransfer(processing,context);
verifyMechanicalDerivative(processing,original,api);
let rejected=0;
for(const [name,change] of [['different portable copy',r=>r.sha256='0'.repeat(64)],['different portable size',r=>r.bytes++]]){
  const candidateReceipt=structuredClone(entry.candidate);change(candidateReceipt);
  assert.throws(()=>verifyMechanicalDerivative(processing,original,{...api,candidateReceipt}),undefined,name);rejected++;
}
for(const [name,change] of [
  ['unrecorded final triangle',p=>p.triangles++],
  ['different static source',p=>p.derivedFromStaticCandidate.sha256='0'.repeat(64)],
  ['different final output',p=>p.componentSeparation.output.sha256='0'.repeat(64)],
  ['undeclared caps',p=>p.componentSeparation.newFacesAdded++],
  ['unrecorded split',p=>p.componentSeparation.splitSourceTriangles++],
  ['moved original vertices',p=>p.componentSeparation.originalVerticesMoved=1],
  ['missing local proof',p=>delete p.componentLocalRepair],
  ['whole building animation',p=>p.animation.node='compact__chance_wheel'],
  ['second animation driver',p=>p.animation.autoplayClip=true],
  ['altered wheel axis',p=>p.componentSeparation.selection.axis[0]+=.1],
  ['rewritten native transfer',p=>p.textureOnlyReprocessing.positionsUnchanged=false],
  ['different raw',p=>p.source.rawGLB.sha256='0'.repeat(64)],
]){
  const changed=structuredClone(processing);change(changed);
  assert.throws(()=>verifyNativeUVTransfer(changed,context),undefined,name);rejected++;
}
for(const [name,change] of [
  ['different repair input',r=>r.source.sha256='0'.repeat(64)],
  ['different repair output',r=>r.output.sha256='0'.repeat(64)],
  ['false source count',r=>r.sourceTriangles++],
  ['extra stationary geometry',r=>r.staticTriangles++],
  ['missing partition proof',r=>delete r.sourceFacePartitionProof],
  ['incomplete original coverage',r=>r.sourceFacePartitionProof.comparedTriangles--],
  ['duplicate original face IDs',r=>r.sourceFacePartitionProof.partitionedFaces[0].sourceTriangle=r.sourceFacePartitionProof.partitionedFaces[1].sourceTriangle],
  ['out-of-range original face',r=>r.sourceFacePartitionProof.partitionedFaces[0].sourceTriangle=original],
  ['unrecorded split increment',r=>r.sourceFacePartitionProof.partitionedFaces[0].outputTriangles++],
  ['lost original surface',r=>r.sourceFacePartitionProof.partitionedFaces[0].partitionArea+=.001],
  ['missing cap record',r=>r.patches.pop()],
  ['invalid cap donor',r=>r.patches[0].donorOriginalTriangle=-1],
  ['invented UV extrapolation',r=>r.patches[0].barycentricUvWeights[0]=[2,-1,0]],
  ['nonfinite closure area',r=>r.patches[0].area=NaN],
  ['building-scale new surface',r=>r.patches[0].area=1],
  ['original texture changed',r=>r.embeddedImageHashesUnchanged=false],
]){
  const changed=structuredClone(repair);change(changed);
  assert.throws(()=>verifyMechanicalAccounting(processing,original,changed,verification),undefined,name);rejected++;
}
for(const [name,change] of [
  ['open extracted wheel',v=>v.boundaryEdgesAtWeld1e6=1],
  ['nonmanifold extraction',v=>v.nonManifoldEdgesAtWeld1e6=1],
  ['wrong verified output',v=>v.outputSha256='0'.repeat(64)],
]){
  const changed=structuredClone(verification);change(changed);
  assert.throws(()=>verifyMechanicalAccounting(processing,original,repair,changed),undefined,name);rejected++;
}
// Recheck actual decoded binary properties, not just claimed booleans/counts.
for(const [name,change] of [
  ['actual static wall translated',asset=>asset.doc.nodes.find(n=>n.mesh===0).translation=[.01,0,0]],
  ['actual rotor rescaled',asset=>asset.doc.nodes.find(n=>n.name===processing.animation.node).scale=[2,2,2]],
  ['actual material replaced',asset=>asset.doc.materials[0].alphaMode='BLEND'],
  ['extra autoplay clip',asset=>asset.doc.animations=[{}]],
]){
  const mutated={...api,glb:bytes=>{const asset=glb(bytes);if(hash(bytes)===processing.processedCandidate.sha256)change(asset);return asset;}};
  assert.throws(()=>verifyMechanicalDerivative(processing,original,mutated),undefined,name);rejected++;
}
console.log(`PASS exact 29,989 original triangles, 1,274 clipping increment, 426 bounded closure faces, original images/materials and donor UV; ${rejected} invalid mechanical-proof/binary rejections`);

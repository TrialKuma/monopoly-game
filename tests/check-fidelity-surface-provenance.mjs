// Frozen fixtures: later approvals must not erase evidence needed by these
// regressions or change what counts as an allowed bounded repair.
import assert from 'node:assert/strict';
import {json,receipt,glb,scalar,imageHashes,hash,verifySourceTransfer} from './ai-city-fixture.mjs';
import {verifyExportedSurfaceRepair,verifyAtlasIslandRepair,verifyKyotoStyleRepair} from './fidelity-surface-fixture.mjs';

const cases=[
  ['classic/shop_1','fa883844f2fcbd31-dd11bcec12d4d850',verifyExportedSurfaceRepair],
  ['classic/shop_3','5b0249302fef71e8-bfe0b7a809dd9617',verifyExportedSurfaceRepair],
  ['classic/hotel_2','6cba35c64f229986-c1f5d5ece86b1724',verifyExportedSurfaceRepair],
  ['classic/builders_guild','b70021e3e1a7db8b-b756af5a54f438a0',verifyAtlasIslandRepair],
  ['compact/villa_2','a5a8f33f417bc0d4-395c2a171e74a12c',verifyKyotoStyleRepair],
].map(([id,name,verify])=>{
  const processing=json(`art/full-ai-city/processed/${id}/${name}.json`);
  const candidateReceipt={...processing.processedCandidate,path:`assets/models/regions-ai/full/${id}/${name.split('-')[0]}.glb`};
  return {id,processing,context:{candidateReceipt},verify};
});
const api={receipt,glb,scalar,imageHashes,verifySourceTransfer};let rejected=0;
for(const c of cases){
  c.verify(c.processing,c.context,api);
  for(const mutate of [
    p=>{p.source.rawGLB.sha256='0'.repeat(64);},
    p=>{p.promotedFrom.sha256='0'.repeat(64);},
    p=>{p.processingTool.sha256='0'.repeat(64);},
  ]){
    const p=structuredClone(c.processing);mutate(p);assert.throws(()=>c.verify(p,c.context,api),undefined,`${c.id}: altered provenance rejected`);rejected++;
  }
  // Check the binary comparison too: it must reject changed geometry even if
  // the receipt-reading layer has already returned an otherwise valid asset.
  const altered={...api,glb(bytes){
    const asset=glb(bytes);
    if(hash(bytes)===c.context.candidateReceipt.sha256){
      asset.bin=Buffer.from(asset.bin);
      const primitive=asset.doc.meshes.flatMap(m=>m.primitives).sort((a,b)=>asset.doc.accessors[b.indices].count-asset.doc.accessors[a.indices].count)[0],a=asset.doc.accessors[primitive.attributes.POSITION],v=asset.doc.bufferViews[a.bufferView];
      assert.equal(a.componentType,5126);
      const offset=(v.byteOffset||0)+(a.byteOffset||0);asset.bin.writeFloatLE(asset.bin.readFloatLE(offset)+.01,offset);
    }
    return asset;
  }};
  assert.throws(()=>c.verify(c.processing,c.context,altered),undefined,`${c.id}: actual moved vertex rejected`);rejected++;
}
for(const c of cases.filter(c=>c.processing.localSurfaceRepair)){
  const p=structuredClone(c.processing);p.localSurfaceRepair.originalUVLoopsChanged.push(0);
  assert.throws(()=>c.verify(p,c.context,api));rejected++;
}
console.log(`PASS ${cases.length} frozen post-export repairs and ${rejected} altered-source/tool/geometry/UV rejections`);

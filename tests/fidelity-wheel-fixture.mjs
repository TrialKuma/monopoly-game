// Exact binary contracts for the two already-repaired wheels in this batch.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const identity=(a,b,label)=>{assert(a&&b,label);assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.equal(a.sha256,b.sha256,label);if(a.bytes!==undefined&&b.bytes!==undefined)assert.equal(a.bytes,b.bytes,label);};
const bytesAt=(asset,index)=>{const row=asset.doc.bufferViews[index];assert(row);return asset.bin.subarray(row.byteOffset||0,(row.byteOffset||0)+row.byteLength);};

export function verifyNormalTextureRemoval(before,after,removed){
  const expected=structuredClone(before.doc),actual=[];
  expected.materials.forEach((material,index)=>{if(Object.hasOwn(material,'normalTexture')){delete material.normalTexture;actual.push(index);}});
  assert(actual.length>0,'normal-only derivative must remove an existing normal binding');
  assert.deepEqual(removed,actual,'exact removed normal material indices');
  assert.deepEqual(after.doc,expected,'normal-only derivative cannot change any other GLTF field');
  assert(before.bin.equals(after.bin),'normal-only derivative retains the entire binary payload');
  return actual;
}

export function verifyFidelityWheel(processing,context={},api){
  const {receipt,glb,imageHashes,verifySourceTransfer}=api;
  const local=processing.localWheelTextureRepair;
  assert(!(local&&processing.shadingOnlyRefinement),'wheel stages must remain distinct');
  const link=local?processing.priorShadingOnlyRefinement:processing.shadingOnlyRefinement;
  assert(link&&['alpine','harbor'].includes(processing.region)&&processing.asset==='chance_wheel','bounded wheel workflow only');
  const finalReceipt=context.candidateReceipt||processing.processedCandidate;
  identity(finalReceipt,processing.processedCandidate,'exact reviewed final wheel');
  const prior=JSON.parse(receipt(link.sourceProcessingReport));
  identity(prior.processedCandidate,link.sourceCandidate,'normal removal starts with the exact prior mechanical result');
  identity(processing.geometryAndMotionInheritedFrom,link.sourceProcessingReport,'inherited mechanical report identity');
  identity(processing.source.rawGLB,prior.source.rawGLB,'same original neural source');
  assert.notEqual(finalReceipt.sha256,link.sourceCandidate.sha256,'a derivative must name its own output');
  assert(!prior.shadingOnlyRefinement&&!prior.localWheelTextureRepair,'no cyclic or hidden wheel stage');
  for(const key of ['region','asset','triangles','source','inferenceReport','reference','derivedFromStaticCandidate','componentSeparation','componentLocalRepair'])assert.deepEqual(processing[key],prior[key],`wheel retains prior ${key}`);
  for(const key of ['driver','node','lifePart','autoplayClip','axis','speed'])assert.deepEqual(processing.animation?.[key],prior.animation?.[key],`wheel retains animation ${key}`);
  assert.equal(link.allBinaryPayloadBytesUnchanged,true);assert.equal(link.geometryUVImagesHierarchyAnimationUnchanged,true);
  assert(link.reason?.length>30);receipt(processing.processingTool);
  verifySourceTransfer(prior,{candidateReceipt:link.sourceCandidate});
  const mechanical=prior.componentLocalRepair;
  assert(mechanical,'prior mechanical repair must remain disclosed');
  const repair=JSON.parse(receipt(mechanical.localRepair));receipt(mechanical.verification);receipt(mechanical.tool);
  identity(repair.output,link.sourceCandidate,'exact original mechanical output');
  const original=glb(receipt(link.sourceCandidate));
  const shaded=local?glb(receipt(local.sourceCandidate)):glb(receipt(finalReceipt));
  verifyNormalTextureRemoval(original,shaded,link.removedNormalTextureMaterials);
  assert.deepEqual(imageHashes(original),imageHashes(shaded),'normal removal preserves actual embedded images');
  if(!local){assert.deepEqual(processing.bake.priorBake,prior.bake);return {kind:'normal-binding-only',sourceSha256:link.sourceCandidate.sha256};}

  assert.equal(processing.region,'harbor');
  identity(local.sourceRaw,processing.source.rawGLB,'wheel color samples this exact original neural source');receipt(local.sourceRaw);
  assert.deepEqual(processing.bake.priorBake.priorBake,prior.bake,'color stage retains earlier bake provenance');
  const result=glb(receipt(finalReceipt)),expected=structuredClone(shaded.doc),proof=local.preservation;
  const wheel=expected.nodes[local.wheelNode];assert.equal(wheel?.extras?.lifePart,'wheel');
  assert.equal(expected.meshes[wheel.mesh].primitives.length,1,'only the inspected wheel primitive');
  const part=expected.meshes[wheel.mesh].primitives[0],oldMaterial=expected.materials[part.material];
  const oldTexture=oldMaterial.pbrMetallicRoughness.baseColorTexture.index;
  const imageIndex=expected.images.length,textureIndex=expected.textures.length,materialIndex=expected.materials.length,viewIndex=expected.bufferViews.length;
  assert.equal(result.doc.images.length,imageIndex+1);assert.equal(result.doc.textures.length,textureIndex+1);assert.equal(result.doc.materials.length,materialIndex+1);assert.equal(result.doc.bufferViews.length,viewIndex+1);
  const addedImage=result.doc.images[imageIndex],addedView=result.doc.bufferViews[viewIndex];
  assert.equal(addedImage.bufferView,viewIndex);assert.equal(addedImage.mimeType,'image/png');assert(!addedImage.uri);
  assert.equal(addedView.buffer,0);assert.equal(addedView.byteOffset%4,0);assert(addedView.byteOffset>=shaded.bin.length&&addedView.byteOffset<=shaded.bin.length+3,'append-only image payload');
  const png=bytesAt(result,viewIndex);assert(png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),1024);
  expected.images.push(addedImage);expected.bufferViews.push(addedView);
  expected.textures.push({...structuredClone(expected.textures[oldTexture]),source:imageIndex});
  const material=structuredClone(oldMaterial);material.name='harbor_wheel_original_color_resample';material.pbrMetallicRoughness.baseColorTexture.index=textureIndex;
  expected.materials.push(material);part.material=materialIndex;
  assert.equal(result.doc.buffers.length,1);expected.buffers[0].byteLength=result.bin.length;
  assert.deepEqual(result.doc,expected,'only one wheel material/image/texture may be appended');
  assert(result.bin.subarray(0,shaded.bin.length).equals(shaded.bin),'all original binary bytes remain intact');
  assert.equal(proof.addedImageIndex,imageIndex);assert.equal(proof.preservedBufferViews.length,viewIndex);
  proof.preservedBufferViews.forEach((row,index)=>{assert.equal(row.bufferView,index);assert.equal(row.sha256,digest(bytesAt(shaded,index)));assert(bytesAt(shaded,index).equals(bytesAt(result,index)));});
  for(const key of ['positionsIndicesNormalsUVHierarchyAnimationUnchanged','allOriginalBufferViewsAndImagesUnchanged','stationaryBuildingAndPointerKeepOriginalMaterial'])assert.equal(proof[key],true,key);
  assert.deepEqual(imageHashes(result).slice(0,imageIndex),imageHashes(shaded),'all original images retained');
  assert.equal(local.atlasSize,1024);assert.equal(local.conservativeWheelUVBoundingBoxesIncluded,true,'subpixel wheel UV islands must retain original colors');
  const triangles=expected.accessors[part.indices].count/3;
  assert.equal(local.wheelUVCornerMidpointCentroidSamplesPreserved,triangles*7);
  assert(local.selectedFrontPlateFaces>0&&local.selectedFrontPlateFaces<triangles&&local.sourcePlateTriangles>local.selectedFrontPlateFaces);
  assert.deepEqual(local.paintRadius,[.029,.147]);assert.deepEqual(local.sourceLocalDepth,[-.02,.009]);assert.deepEqual(local.targetLocalDepth,[-.015,.015]);
  assert(local.changedPixels>0&&local.changedPixels<1024*1024*.01);assert.equal(local.changedPixels+local.untouchedPixels,1024*1024);
  assert.equal(local.allPixelsOutsideSelectedWheelUVUnchangedBeforeEncoding,true);assert.equal(local.overlappingPaintUVPixelsSkipped,0);assert.equal(local.distanceRejectedPixels,0);
  assert(local.sourceDistanceQuantiles.length===4&&local.sourceDistanceQuantiles.every(Number.isFinite)&&local.sourceDistanceQuantiles[2]<.02&&local.sourceDistanceQuantiles[3]<.023);
  return {kind:'bounded-wheel-color',sourceSha256:link.sourceCandidate.sha256};
}

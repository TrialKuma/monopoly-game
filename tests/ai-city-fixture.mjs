// Shared receipt and binary checks for the actual neural release files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyMechanicalDerivative} from './mechanical-surface-fixture.mjs';
export const root=fileURLToPath(new URL('..',import.meta.url));
export const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function local(value){
  const normalized=value.replaceAll('\\','/'),marker='/monopoly/',index=normalized.indexOf(marker);
  const resolved=path.resolve(root,index>=0?normalized.slice(index+marker.length):normalized);
  assert(!path.relative(root,resolved).startsWith('..'),'receipt stays inside project');return resolved;
}
export const read=value=>fs.readFileSync(local(value));
export const json=value=>JSON.parse(read(value));
export function receipt(row){const bytes=read(row.path);assert.equal(hash(bytes),row.sha256,`exact reviewed bytes: ${row.path}`);return bytes;}
export function glb(bytes){
  assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);assert.equal(bytes.readUInt32LE(24+length),0x004e4942);
  return {doc:JSON.parse(bytes.subarray(20,20+length)),bin:bytes.subarray(28+length)};
}
export function imageHashes({doc,bin}){return (doc.images||[]).map(image=>{
  assert.equal(typeof image.bufferView,'number');assert(!image.uri,'embedded texture');const view=doc.bufferViews[image.bufferView],start=view.byteOffset||0;
  return hash(bin.subarray(start,start+view.byteLength));
});}
export function scalar({doc,bin},index,item,component=0){
  const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],arity={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type];
  const width={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a.componentType];assert(arity&&width);
  const offset=(v.byteOffset||0)+(a.byteOffset||0)+item*(v.byteStride||arity*width)+component*width;
  const signed=a.componentType===5120||a.componentType===5122;
  const value=a.componentType===5126?bin.readFloatLE(offset):signed?bin.readIntLE(offset,width):bin.readUIntLE(offset,width);
  return a.normalized?Math.max(-1,value/(2**(width*8-(signed?1:0))-1)):value;
}
function sameProof(a,b,message){assert(a&&b,message);assert.equal(a.sha256,b.sha256,message);assert.equal(a.bytes,b.bytes,message);}
function archivedProof(row){
  assert.match(row.sha256,/^[a-f0-9]{64}$/);assert(row.bytes>0);local(row.path);
  // Neural fields are large local reproduction inputs, excluded from Git.
  // Release checks validate their immutable capture receipts. An explicit
  // archive audit also hashes any available local tensor/intermediate files.
  if(process.argv.includes('--verify-source-archives')&&fs.existsSync(local(row.path)))receipt(row);
}
function verifySurvivingSurfaceProof(repaired,proof){
  sameProof(proof.source,repaired.source,'fold cleanup starts with the exact immutable raw');
  sameProof(proof.repaired,repaired.nativeOutput,'surviving-surface proof names the actual repaired source');
  assert.equal(proof.status,'surviving_source_positions_uv_and_image_bytes_exactly_preserved');
  assert.equal(proof.originalImagesExact,true);
  assert.equal(proof.originalTriangles,repaired.originalTriangles);
  assert.equal(proof.originalTrianglesDeleted,repaired.originalTrianglesDeleted);
  assert.equal(proof.addedTriangles,repaired.newTriangles);
  assert.equal(proof.survivingTrianglesExact,proof.originalTriangles-proof.originalTrianglesDeleted);
  assert(Number.isInteger(proof.originalTrianglesDeleted)&&proof.originalTrianglesDeleted>0&&proof.originalTrianglesDeleted<proof.originalTriangles*.005,'only individually measured defective folds may be removed');
  const ids=proof.removedSourceTriangleIds,points=proof.removedFaceCentroidsBlender;
  assert.equal(ids.length,proof.originalTrianglesDeleted);assert.equal(new Set(ids).size,ids.length);
  assert(ids.every(id=>Number.isInteger(id)&&id>=0&&id<proof.originalTriangles),'exact unique source triangle IDs');
  assert.equal(points.length,ids.length);assert(points.every(p=>p.length===3&&p.every(Number.isFinite)));
  assert(Number.isFinite(proof.affineMaxError)&&proof.affineMaxError<=2e-6,'measured native-to-normalized correspondence');
  const affine=proof.nativeToNormalizedGLTF;
  assert(affine.length===4&&affine.every(row=>row.length===3&&row.every(Number.isFinite)));
  const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0),basis=affine.slice(0,3),scale2=dot(basis[0],basis[0]);
  assert(scale2>0&&scale2<100);
  basis.forEach((a,i)=>basis.forEach((b,j)=>assert(Math.abs(dot(a,b)-(i===j?scale2:0))<2e-5,'normalization cannot distort the source')));
  sameProof(proof.normalized,repaired.normalizedOutput,'measured normalization belongs to the repaired source');
  return {points,dot};
}
export function verifyMeasuredFoldRemoval(repaired,proof){
  const {points,dot}=verifySurvivingSurfaceProof(repaired,proof);
  const regions=repaired.repairs.filter(r=>r.localFoldFacesToDelete>0),counts=regions.map(()=>0);
  assert(regions.length>0,'removed faces require explicit measured regions');
  for(const region of regions){
    const {specification:s,measuredRoofPlane:plane}=region;
    assert.equal(s.planeRepair,true);assert(plane.length===3&&plane.every(Number.isFinite));
    assert.equal(region.depthDeficitThreshold,.007);assert(region.planeFitResidualMax<=.012001);
    assert(s.roi.length===4&&s.roi.every(Number.isFinite));
    assert(s.roi[1]>s.roi[0]&&s.roi[3]>s.roi[2]&&(s.roi[1]-s.roi[0])*(s.roi[3]-s.roi[2])<.01,'removal is a small local surface region');
    for(const axis of [s.u,s.v,s.n])assert(axis.length===3&&axis.every(Number.isFinite)&&Math.abs(dot(axis,axis)-1)<1e-6);
    assert(Math.abs(dot(s.u,s.v))+Math.abs(dot(s.u,s.n))+Math.abs(dot(s.v,s.n))<1e-6);
  }
  for(const point of points){
    const matching=regions.flatMap((region,index)=>{
      const {specification:s,measuredRoofPlane:p}=region,u=dot(point,s.u),v=dot(point,s.v),depth=dot(point,s.n),deficit=p[0]*u+p[1]*v+p[2]-depth;
      return u>=s.roi[0]-1e-6&&u<=s.roi[1]+1e-6&&v>=s.roi[2]-1e-6&&v<=s.roi[3]+1e-6&&deficit>=.007-1e-6&&deficit<=.065+1e-6?[index]:[];
    });
    assert.equal(matching.length,1,'each removed face is inside exactly one measured inward-fold region');counts[matching[0]]++;
  }
  regions.forEach((region,i)=>assert.equal(counts[i],region.localFoldFacesToDelete,'exact per-region removal count'));
  assert.equal(counts.reduce((a,b)=>a+b,0),proof.originalTrianglesDeleted);
  return proof;
}
export function verifyWheelSourceCleanup(repaired,proof){
  const {points}=verifySurvivingSurfaceProof(repaired,proof);
  // These bounds are a reviewed exception for this one source, not a generic
  // permission to delete arbitrary fragments from future wheel buildings.
  assert.equal(repaired.source.sha256,'f05d41993222025adb14f0e8fe59abe48fa2bf8eeaedcf8d409a054e47e1b0c0');
  assert.equal(repaired.nativeOutput.sha256,'5b62a9340c33b44a9c0fde68827bb5af831830e8cc651578bdfbc597705212b9');
  assert.equal(proof.originalTriangles,955686);assert.equal(proof.originalTrianglesDeleted,2777);
  assert.equal(proof.survivingTrianglesExact,952909);assert.equal(proof.addedTriangles,3700);
  const cleanup=repaired.artifactCleanup;
  assert.equal(cleanup.deletedTriangles,2777);assert.equal(cleanup.backingDeletedTriangles,2527);
  assert.equal(cleanup.foldCleanup.deletedTriangles,250);
  assert.deepEqual(cleanup.foldCleanup.bounds,{x:[-.45,-.34],y:[.177,.204],z:[.466,.509]});
  const lintel=repaired.repairs.find(r=>r.specification.forceRoi);
  assert(lintel,'the removed inward lintel is covered by its recorded local repair');
  assert.deepEqual(lintel.specification.forceRoi,[-.204,-.177,.466,.509]);
  assert.deepEqual(lintel.specification.n,[-1,0,0]);
  assert.equal(lintel.specification.donorDepth,.41);assert.equal(lintel.specification.donorMaxDepth,.438);
  let backing=0,fold=0;
  const between=(n,a,b)=>n>=a-1e-6&&n<=b+1e-6;
  for(const [x,y,z] of points){
    const inBacking=between(x,.28,.51)&&between(y,-.174,-.10)&&between(z,.155,.45)&&Math.hypot(x-.265,z-.298)>=.164-1e-6;
    const inFold=between(x,-.45,-.34)&&between(y,.177,.204)&&between(z,.466,.509);
    assert.equal(Number(inBacking)+Number(inFold),1,'deleted source triangles stay in exactly one reviewed region, outside the original wheel disc');
    backing+=Number(inBacking);fold+=Number(inFold);
  }
  assert.equal(backing,2527);assert.equal(fold,250);
  assert.deepEqual(proof.removedRegionCounts,{extraneousDiscBacking:backing,foldedLintel:fold});
  return proof;
}
export function verifyLocalSurfaceRepair(repair,raw){
  const repaired=JSON.parse(receipt(repair.receipt));
  sameProof(repaired.source,raw,'bounded repair starts with this exact neural raw');
  sameProof(repaired.nativeOutput,repair.source,'recorded repair output is the actual processing input');
  archivedProof(repair.source);
  const tool=repaired.processingTool||repaired.tool;receipt(tool);
  for(const key of ['method','newTriangles','newVertices','originalVerticesMoved','originalTrianglesDeleted'])assert.deepEqual(repair[key],repaired[key],`repair ${key} remains disclosed`);
  assert.deepEqual(repair.regions,repaired.repairs,'each local repair region remains recorded');
  assert(repaired.newTriangles>0&&repaired.newTriangles<repaired.originalTriangles*.05,'only bounded local repairs');
  assert(repaired.newVertices>0&&repaired.originalVerticesMoved===0,'original neural vertices remain unmoved');
  if(repaired.originalTrianglesDeleted){
    assert(repaired.sourcePreservation,'deleting defective folds needs an independent surviving-surface proof');
    const preservation=JSON.parse(receipt(repaired.sourcePreservation));receipt(preservation.tool);
    if(repaired.source.sha256==='f05d41993222025adb14f0e8fe59abe48fa2bf8eeaedcf8d409a054e47e1b0c0')verifyWheelSourceCleanup(repaired,preservation);
    else verifyMeasuredFoldRemoval(repaired,preservation);
  }else assert.equal(repaired.originalTrianglesDeleted,0,'no undisclosed original face deletion');
  assert(repaired.repairs.length>0&&repaired.method.length>30);
  const sourceReview=repaired.visualReview||repaired.sourceVisualReview;
  assert(sourceReview,'local source repair was inspected before reduction');
  if(repaired.sourceVisualReview){
    assert.equal(sourceReview.status,'reviewed_for_derivative_processing');
    assert(sourceReview.note.length>=30&&['front','back','left','right','iso'].every(view=>sourceReview.views.includes(view)),'source repair review describes all five views');
  }
  if(repaired.reviewImages){
    assert(repaired.reviewImages.length>=5,'local source repair has five-view evidence');
    const preserved=new Map(),directory=path.dirname(local(repair.receipt.path));
    for(const filename of fs.readdirSync(directory).filter(name=>/^evidence-preservation-[a-f0-9]{16}\.json$/.test(name))){
      const bytes=fs.readFileSync(path.join(directory,filename));
      assert.equal(hash(bytes).slice(0,16),filename.slice(22,38),'preservation receipt identity');
      const evidence=JSON.parse(bytes);sameProof(evidence.repairReceipt,repair.receipt,'preserved evidence belongs to this exact source repair');
      assert.equal(evidence.status,'review_evidence_preserved_byte_identically');
      assert.equal(evidence.originalReceiptUnmodified,true);assert.equal(evidence.imagePixelsAndBytesUnchanged,true);
      for(const row of evidence.preserved){sameProof(row.original,row.preserved,'preserved evidence bytes');receipt(row.preserved);if(row.kind==='review-images')preserved.set(local(row.original.path),row.preserved);}
    }
    for(const image of repaired.reviewImages){
      const copy=preserved.get(local(image.path));
      if(copy)sameProof(copy,image,'preserved source review image');
      receipt(copy||image);
    }
  }
  return {repaired,tool};
}
export function verifyNativeUVTransfer(processing,context={}){
  const transfer=processing.textureOnlyReprocessing,uv=JSON.parse(receipt(transfer.nativeUVReceipt));
  assert.equal(uv.status,'uv_ready_for_original_texture_transfer');assert.equal(uv.operation,'native_uv_only');
  assert.equal(uv.newNeuralInference,false);assert.deepEqual(uv.geometryOperations,[]);assert.equal(uv.sourceTexturePixelsChanged,false);
  sameProof(uv.sourceRaw,processing.source.rawGLB,'UV charts belong to this exact neural source');
  sameProof(uv.candidate,transfer.sourceCandidate,'UV charts retain the exact source-derived mobile surface');
  sameProof(uv.sourceProcessingReport,transfer.sourceProcessingReport,'frozen geometry processing report');
  const original=JSON.parse(receipt(uv.sourceProcessingReport)),input=JSON.parse(receipt(uv.inputProof));
  sameProof(original.processedCandidate,uv.candidate,'original candidate identity');sameProof(original.source.rawGLB,uv.sourceRaw,'original raw identity');
  for(const [key,other] of [['candidate','candidate'],['candidateReport','sourceProcessingReport'],['sourceRaw','sourceRaw'],['output','input']])sameProof(input[key],uv[other],`native UV input ${key}`);
  receipt(input.tool);receipt(uv.adapter);receipt(uv.nativeExporterReference);receipt(processing.processingTool);
  archivedProof(uv.input);archivedProof(uv.output);archivedProof(uv.candidate);
  assert.equal(input.candidateTriangleCornerPositionsExactlyEqual,true);assert.equal(input.geometryChanged,false);assert.equal(input.texturesChanged,false);
  assert.equal(uv.triangles,original.triangles);verifyMechanicalDerivative(processing,uv.triangles,{receipt,glb,scalar,imageHashes,...context});assert.equal(input.arrays.faces.shape[0],uv.triangles);
  assert.equal(uv.inputTriangleSignature,uv.outputTriangleSignature);assert.match(uv.inputTriangleSignature,/^[a-f0-9]{64}$/);
  assert.equal(uv.maximumPositionChange,0);assert.equal(uv.sameTriangleCornerPositionMultiset,true);assert.equal(uv.windingPreserved,true);assert.equal(uv.additionalRemeshOrSimplification,false);
  for(const key of ['positionsUnchanged','faceIndicesUnchanged','cornerNormalsUnchanged','exportedTriangleCornerPositionsExactlyUnchanged'])assert.equal(transfer[key],true,`UV transfer preserves ${key}`);
  assert.equal(transfer.additionalRemeshOrSimplification,false);
  return uv;
}
export function verifyNativeSurfaceExport(processing,context={}){
  const link=processing.nativeSurfaceExport,exported=JSON.parse(receipt(link.receipt));
  const inference=JSON.parse(receipt(processing.inferenceReport));
  assert.equal(exported.status,'exported_pending_visual_review');
  assert.equal(exported.sameNativeRun,true);assert.equal(exported.newNeuralInference,false);assert.equal(exported.rawUnchanged,true);
  sameProof(exported.rawGLB,processing.source.rawGLB,'native export uses this exact raw model');
  assert.equal(exported.rawGLB.sha256,inference.output_sha256);
  sameProof(link.source,exported.output,'normalized mobile source');archivedProof(link.source);
  sameProof(link.tensorArchive,exported.tensorArchive,'same original neural field');archivedProof(link.tensorArchive);
  receipt(exported.adapter);receipt(exported.nativeExporterSnapshot);receipt(processing.processingTool);
  const captureLink=exported.sourceExportReceipt||link.receipt,captured=JSON.parse(receipt(captureLink));
  sameProof(captureLink,inference.native_mobile_export_receipt,'capture was recorded by the actual inference');
  assert(['exported_pending_visual_review','frozen_field_ready_for_optional_export'].includes(captured.status));
  assert.equal(captured.rawSourceReplaced,false);assert.equal(captured.sameNativeRun,true);assert.equal(captured.rawUnchanged,true);
  sameProof(captured.rawGLB,exported.rawGLB,'capture and replay raw identity');sameProof(captured.tensorArchive,exported.tensorArchive,'capture and replay field identity');receipt(captured.adapter);
  assert.equal(captured.originalParameters.grid_size,1024);assert.equal(captured.originalParameters.texture_size,4096);assert.equal(captured.originalParameters.decimation_target,1000000);
  assert.deepEqual(exported.originalParameters,captured.originalParameters);
  for(const key of ['grid_size','aabb','attr_layout'])assert.deepEqual(exported.mobileParameters[key],captured.originalParameters[key],'field sampling coordinate system stays unchanged');
  assert([1024,2048].includes(exported.mobileParameters.texture_size));
  assert.equal(processing.derivation.rebakedFromRawUV,false);assert.equal(processing.derivation.normalizedTrianglesPreserved,true);
  assert.equal(processing.bake.hitCoverageAreaWeighted,undefined,'direct neural sampling has no raw-image ray coverage');
  assert.equal(processing.bake.nearestLookupSuccessFraction,undefined,'direct neural sampling is not raw-UV nearest transfer');
  verifyMechanicalDerivative(processing,exported.actualTriangles,{receipt,glb,scalar,imageHashes,...context});
  if(exported.nativePostprocessOverride){
    receipt(exported.nativePostprocessOverride.original);assert.equal(exported.nativePostprocessOverride.sharedCodeModified,false);
    assert(exported.nativePostprocessOverride.scope.length>30,'local exporter changes are explicitly recorded');
  }
  if(exported.geometrySurfaceInput){
    const surface=JSON.parse(receipt(exported.geometrySurfaceInput.receipt));
    for(const key of ['sourceRaw','candidate','candidateReport','fieldReceipt','output','tool'])sameProof(surface[key],exported.geometrySurfaceInput[key],`frozen surface ${key}`);
    sameProof(surface.sourceRaw,exported.rawGLB,'derived surface and neural field originate in the same model');
    sameProof(surface.fieldReceipt,captureLink,'surface coordinates use the same captured field');
    const originalProcessing=JSON.parse(receipt(surface.candidateReport));receipt(surface.tool);archivedProof(surface.candidate);archivedProof(surface.output);
    sameProof(originalProcessing.processedCandidate,surface.candidate,'exact source-derived low mesh');sameProof(originalProcessing.source.rawGLB,exported.rawGLB,'low mesh raw provenance');
    if(originalProcessing.geometryOnly){
      assert.equal(originalProcessing.status,'geometry_ready_for_native_field');
      assert.equal(originalProcessing.geometryReady,true);assert.equal(originalProcessing.processingComplete,false);
      assert.equal(surface.geometryOnly,true);assert.equal(surface.geometryStageStatus,originalProcessing.status);
      sameProof(originalProcessing.geometryOnlyFieldReceipt,captureLink,'geometry-only low uses this captured field');
      sameProof(originalProcessing.geometryPreExport,surface.geometryPreExport,'geometry pre-export snapshot');
      archivedProof(originalProcessing.geometryPreExport);
      const preservation=originalProcessing.geometryExportPreservation;
      assert.deepEqual(surface.geometryExportPreservation,preservation);
      assert.equal(preservation.allOrientedTrianglesExactlyPreserved,true);assert.equal(preservation.maximumPositionChange,0);
      assert.equal(preservation.trianglesCompared,surface.triangles);
      assert.equal(originalProcessing.geometryValidation.hasUV,false);assert.equal(originalProcessing.geometryValidation.images,0);
      assert.equal(processing.renderedSource.views.length,5,'raw source views rendered once at native finalization');
    }else assert(!surface.geometryOnly,'no undisclosed geometry-only stage');
    if(originalProcessing.lowSurfaceRepair){
      const link=originalProcessing.lowSurfaceRepair,repair=JSON.parse(receipt(link.receipt));
      assert.deepEqual(surface.lowSurfaceRepair,link,'surface discloses post-reduction triangle repairs');
      assert.deepEqual(processing.lowSurfaceRepair,link,'final report discloses post-reduction triangle repairs');
      sameProof(repair.output,surface.candidate,'repaired low geometry is the actual input');
      sameProof(link.output,repair.output,'repair link identifies the exact output');
      sameProof(link.sourceCandidate,repair.sourceCandidate,'repair preserves the exact prior low mesh');
      receipt(repair.tool);receipt(repair.sourceReport);receipt(repair.originalSurfaceProof);
      assert.equal(repair.newVertices,0);assert.equal(repair.originalVerticesMoved,0);assert.equal(repair.originalTrianglesDeleted,0);
      assert.equal(repair.finalTriangles,repair.originalTriangles+repair.newTriangles);
      assert.equal(repair.finalTriangles,surface.triangles);
      assert(repair.newTriangles>0&&repair.newTriangles<repair.originalTriangles*.002,'bounded triangle-gap closure');
      assert.equal(repair.components.length,repair.newTriangles);
      assert(repair.components.every(c=>c.vertices.length===3&&c.perimeter>0&&c.perimeter<.08&&c.area>0&&c.area<.00021));
      assert.equal(repair.closedSurfaceEdgeIncidence,2);
      // These small low-mesh inputs are retained as exact release provenance.
      const before=glb(receipt(repair.sourceCandidate)),after=glb(receipt(repair.output));
      assert.equal(repair.originalBinaryPrefixBytes,before.bin.length);
      assert.deepEqual(after.bin.subarray(0,before.bin.length),before.bin,'existing attributes and image bytes are unchanged');
      const a=before.doc.meshes[0].primitives[0],b=after.doc.meshes[0].primitives[0];
      assert.deepEqual(a.attributes,b.attributes);assert.equal(a.material,b.material);
      assert.equal(before.doc.accessors[a.indices].count,repair.originalTriangles*3);
      assert.equal(after.doc.accessors[b.indices].count,repair.finalTriangles*3);
      for(let i=0;i<repair.originalTriangles*3;i++)assert.equal(scalar(before,a.indices,i),scalar(after,b.indices,i),'all existing faces remain exact');
      assert.match(processing.geometryOrigin,/74.*triangle|triangle.*74/i);
    }else assert(!surface.lowSurfaceRepair&&!processing.lowSurfaceRepair,'no undisclosed post-reduction repair');
    if(originalProcessing.localSurfaceRepair){
      assert.deepEqual(surface.localSurfaceRepair,originalProcessing.localSurfaceRepair,'coordinate preparation discloses prior local repairs');
      assert.deepEqual(processing.localSurfaceRepair,surface.localSurfaceRepair,'final report discloses prior local repairs');
      const {tool}=verifyLocalSurfaceRepair(surface.localSurfaceRepair,exported.rawGLB);
      sameProof(surface.normalizationInput,surface.localSurfaceRepair.source,'normalization was fitted from the repaired source');
      sameProof(surface.localRepairTool,tool,'actual frozen repair implementation');
      assert.equal(surface.repairAppliedBeforeReduction,true);
      for(const key of ['normalizationInput','localSurfaceRepair','localRepairTool','repairAppliedBeforeReduction'])assert.deepEqual(surface[key],exported.geometrySurfaceInput[key],`frozen repair proof ${key}`);
      assert(/repair/i.test(processing.geometryOrigin),'final geometry origin explicitly distinguishes repaired surfaces');
    }else{
      assert(!surface.localSurfaceRepair&&!processing.localSurfaceRepair&&!surface.localRepairTool&&!surface.repairAppliedBeforeReduction,'no unrecorded surface repair');
      if(surface.normalizationInput)sameProof(surface.normalizationInput,exported.rawGLB,'unrepaired normalization uses original raw');
    }
    assert.equal(originalProcessing.rawSourceUnchanged,true);assert.equal(surface.triangles,exported.actualTriangles);
    assert.equal(surface.maximumPositionChangeFromWelding,0);assert.equal(surface.originalSplitVertices-surface.exactCoincidentVerticesMerged,surface.vertices);
    assert(Number.isFinite(surface.sampledNormalizationReconstructionMaxError)&&surface.sampledNormalizationReconstructionMaxError<=2e-6,'verified inverse normalization');
    const a=surface.rawBlenderToNormalizedBlender,b=surface.inverse;
    assert(a.length===4&&b.length===4&&[...a,...b].every(row=>row.length===4&&row.every(Number.isFinite)));
    for(let row=0;row<4;row++)for(let col=0;col<4;col++)assert(Math.abs(a[row].reduce((sum,v,k)=>sum+v*b[k][col],0)-(row===col?1:0))<1e-5,'actual inverse transform');
    assert.equal(exported.mobileParameters.remesh,false);assert.equal(exported.mobileParameters.decimation_target,0,'no second mesh simplification');
    assert.equal(exported.nativePostprocessOverride.noNewGeometryAuthored,true);
    assert.equal(exported.nativePostprocessOverride.counts.facesBeforeUnwrap,surface.triangles);
    const lookup=exported.nativeFieldLookup;
    assert(lookup.sampleCount>0&&lookup.quantiles50_95_99_100.length===4&&lookup.quantiles50_95_99_100.every(Number.isFinite));
    assert(lookup.quantiles50_95_99_100[1]<=.01&&lookup.quantiles50_95_99_100[2]<=.02&&lookup.fractionOverTwoPercent<=.01,'low surface remains near the original neural field');
  }
  return exported;
}
export function verifyPostNativeUVCorrection(processing){
  const link=processing.postNativeUVCorrection,{proof,...declared}=link;
  const frozen=JSON.parse(receipt(proof));assert.deepEqual(declared,frozen,'post-export correction is bound to its frozen proof');
  const correction=JSON.parse(receipt(link.receipt)),original=JSON.parse(receipt(link.sourceProcessingReport));
  assert(!original.postNativeUVCorrection,'single explicit post-export correction');
  verifyNativeSurfaceExport(original);
  sameProof(original.processedCandidate,link.sourceCandidate,'exact original field-sampled candidate');
  sameProof(correction.source,link.sourceCandidate,'UV correction input');sameProof(correction.output,link.output,'UV correction output');
  sameProof(link.output,processing.processedCandidate,'final candidate includes the declared UV correction');
  for(const key of ['nativeSurfaceExport','source','inferenceReport','localSurfaceRepair','derivation','bake','triangles'])assert.deepEqual(processing[key],original[key],`UV correction preserves ${key}`);
  receipt(link.tool);receipt(link.verificationTool);assert.equal(link.evidence.length,5);link.evidence.forEach(receipt);
  assert.equal(link.visualReview.status,'reviewed_for_derivative_processing');assert(link.visualReview.notes.length>=30);
  assert.equal(link.method,correction.method);assert(link.method.length>=30);
  const verification=link.verification;
  for(const key of ['perTrianglePositionsExactlyPreserved','perTriangleNormalsExactlyPreserved','embeddedImagesExactlyPreserved','materialsExactlyPreserved','changedTriangleIdsExactlyMatchReceipt','allReplacementUVsExactlyMatchRecordedOriginalDonor','originalRawUnchanged'])assert.equal(verification[key],true,key);
  assert.equal(verification.newTriangles,0);assert.equal(verification.triangles,processing.triangles);
  assert.equal(verification.changedTriangles,correction.changedTriangles);assert.equal(verification.changedUVLoops,correction.originalUVLoopsChanged);
  assert(verification.changedTriangles>0&&verification.changedTriangles<processing.triangles*.01,'bounded local UV correction');
  const before=glb(receipt(link.sourceCandidate)),after=glb(receipt(link.output));
  assert.deepEqual(imageHashes(before),imageHashes(after),'actual embedded image bytes are unchanged');
  for(const key of ['materials','nodes','scenes','scene','animations'])assert.deepEqual(before.doc[key],after.doc[key],`UV correction preserves ${key}`);
  assert.equal(before.doc.meshes.length,1);assert.equal(after.doc.meshes.length,1);
  assert.equal(before.doc.meshes[0].primitives.length,1);assert.equal(after.doc.meshes[0].primitives.length,1);
  const a=before.doc.meshes[0].primitives[0],b=after.doc.meshes[0].primitives[0];
  assert.equal(a.material,b.material);assert.equal(a.mode??4,4);assert.equal(b.mode??4,4);
  assert.equal(before.doc.accessors[a.indices].count,processing.triangles*3);assert.equal(after.doc.accessors[b.indices].count,processing.triangles*3);
  const donors=new Map(correction.donorTriangleMapping.map(row=>[row.targetTriangle,row.donorTriangle]));
  assert.equal(donors.size,verification.changedTriangles,'each changed triangle has exactly one donor');
  for(const [target,donor] of donors)for(const index of [target,donor])assert(Number.isInteger(index)&&index>=0&&index<processing.triangles);
  let changedTriangles=0,changedLoops=0;
  for(let triangle=0;triangle<processing.triangles;triangle++){
    let triangleChanged=false;
    for(let corner=0;corner<3;corner++){
      const ai=scalar(before,a.indices,triangle*3+corner),bi=scalar(after,b.indices,triangle*3+corner);
      for(const attribute of ['POSITION','NORMAL'])for(let axis=0;axis<3;axis++)assert.equal(scalar(before,a.attributes[attribute],ai,axis),scalar(after,b.attributes[attribute],bi,axis),'actual geometry and normals preserved');
      let loopChanged=false;
      const donor=donors.get(triangle),ui=donor===undefined?ai:scalar(before,a.indices,donor*3+corner);
      for(let axis=0;axis<2;axis++){
        const uv=scalar(after,b.attributes.TEXCOORD_0,bi,axis);
        assert.equal(uv,scalar(before,a.attributes.TEXCOORD_0,ui,axis),'only the recorded original donor UV may replace a corner');
        loopChanged ||= uv!==scalar(before,a.attributes.TEXCOORD_0,ai,axis);
      }
      if(loopChanged){changedLoops++;triangleChanged=true;}
    }
    assert.equal(triangleChanged,donors.has(triangle),'exact declared triangle set');if(triangleChanged)changedTriangles++;
  }
  assert.equal(changedTriangles,verification.changedTriangles);assert.equal(changedLoops,verification.changedUVLoops);
  return frozen;
}
export function verifySourceTransfer(processing,context={}){
  if(processing.postNativeUVCorrection)return verifyPostNativeUVCorrection(processing);
  if(processing.nativeSurfaceExport)return verifyNativeSurfaceExport(processing,context);
  if(processing.textureOnlyReprocessing?.nativeUVReceipt)verifyNativeUVTransfer(processing,context);
  if(processing.localSurfaceRepair)verifyLocalSurfaceRepair(processing.localSurfaceRepair,processing.source.rawGLB);
  const bake=processing.bake;
  if(bake.notRayCoverage){
    // Nearest-neighbour lookup always finds some triangle. Its success rate is
    // not evidence of correspondence; bound distances and numerical error too.
    assert.equal(bake.hitCoverageAreaWeighted,undefined,'nearest lookup is not ray coverage');
    assert.equal(bake.nearestLookupSuccessFraction,1);
    assert.deepEqual(bake.sourceDistanceQuantileLevels,[.5,.95,.99,1]);
    assert(bake.sourceDistanceQuantiles.every(Number.isFinite));
    assert(bake.sourceDistanceQuantiles[1]<=.01&&bake.sourceDistanceQuantiles[2]<=.02,'source correspondence stays close');
    assert(bake.overTwoPercentMaxEdge<=.01&&bake.distanceReviewRequired===false,'no unresolved source-distance outliers');
    assert(bake.closestSourceVertexFallbackFraction<=.001,'degenerate UV fallback remains exceptional');
    assert(bake.barycentricPointReconstructionErrorQuantiles.every(v=>Number.isFinite(v)&&v<.001),'stable nearest-source UV interpolation');
    assert.equal(bake.visualGeometryReviewRequired,true,'numerical transfer cannot approve visual geometry');
    receipt(processing.textureTransferTool);
  }else assert(bake.hitCoverageAreaWeighted>.97,'source texture bake coverage');
}
export function verifyApproval(entry){
  assert.equal(entry?.status,'approved');assert.equal(entry.sourceType,'pixal_native_multiview');
  const candidate=glb(receipt(entry.candidate)),inference=JSON.parse(receipt(entry.inferenceReport)),processing=JSON.parse(receipt(entry.processingReport));receipt(entry.reference);
  assert.equal(inference.generation_started,true);assert.equal(inference.pipeline_config,'pipeline_mv.json');assert.equal(inference.view_count,3);assert.equal(inference.input_unchanged,true);
  assert.equal(inference.input_views.length,3);assert.equal(new Set(inference.input_views.map(v=>v.sha256)).size,3);inference.input_views.forEach(receipt);
  if(fs.existsSync(local(inference.output)))assert.equal(hash(read(inference.output)),inference.output_sha256);
  assert.equal(processing.source.rawGLB.sha256,inference.output_sha256);assert.equal(processing.processedCandidate.sha256,entry.candidate.sha256);assert.equal(processing.rawSourceUnchanged,true);
  verifySourceTransfer(processing,{candidateReceipt:entry.candidate});assert(entry.reviewNote.length>=30&&entry.reviewViews.length>=5);
  assert.deepEqual(entry.reviewImages.map(row=>row.path),entry.reviewViews);entry.reviewImages.forEach(receipt);entry.sourceComparisonImages.forEach(receipt);
  if(entry.reviewSheet){
    receipt(entry.reviewSheet);assert.equal(entry.reviewSheet.sha256,processing.reviewSheet.sha256);
    if(processing.reviewSheet.candidateSha256){
      assert.equal(processing.reviewSheet.candidateSha256,entry.candidate.sha256,'contact sheet shows this exact candidate');
      assert.deepEqual(processing.reviewSheet.sourceImages.map(row=>row.sha256),[...entry.sourceComparisonImages.slice(0,2),...entry.reviewImages].map(row=>row.sha256),'contact sheet uses the frozen reviewed pixels');
    }
  }
  if(entry.motionReview){receipt(entry.motionReview.report);assert(entry.motionReview.frames.length>=3);entry.motionReview.frames.forEach(receipt);}
  return {candidate,inference,processing};
}
export function verifyPackManifest(file,bytes){
  const manifest=json(file.replace(/\.glb$/,'-manifest.json'));assert.equal(manifest.sha256,hash(bytes));assert.equal(manifest.bytes,bytes.length);return manifest;
}
export function verifyAnimation(asset,rootName){
  const {doc}=asset,root=doc.nodes.findIndex(n=>n.name===rootName),moving=new Set();assert(root>=0);assert(doc.animations?.length,'actual exported motion clips');
  for(const clip of doc.animations){assert(clip.channels.length>0);for(const channel of clip.channels){
    const index=channel.target.node,node=doc.nodes[index];assert(index!==root&&!/structure|body$/i.test(node.name),'structural building stays still');moving.add(index);
    const sampler=clip.samplers[channel.sampler],input=doc.accessors[sampler.input],output=doc.accessors[sampler.output],arity={SCALAR:1,VEC3:3,VEC4:4}[output.type];
    assert(input.count>=3&&input.max[0]>input.min[0]);assert.equal(output.componentType,5126);assert(arity);
    let changes=false;for(let sample=0;sample<output.count;sample++)for(let axis=0;axis<arity;axis++){
      const value=scalar(asset,sampler.output,sample,axis);assert(Number.isFinite(value));if(Math.abs(value-scalar(asset,sampler.output,0,axis))>.001)changes=true;
    }assert(changes,`${node.name}: component actually moves`);
  }}
  assert(moving.size<doc.nodes.filter(n=>n.mesh!==undefined).length,'at least one static mesh remains');return moving.size;
}

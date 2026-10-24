// Post-export repairs have their own source stage. They must never be treated
// as the older pre-reduction native-source repair receipt shape.
import assert from 'node:assert/strict';

const equalReceipt=(a,b,label)=>{assert(a&&b,label);assert.equal(a.sha256,b.sha256,label);if(a.bytes&&b.bytes)assert.equal(a.bytes,b.bytes,label);};
const pointKey=p=>p.map(v=>Object.is(v,-0)?0:v).join(',');
const blender=p=>[p[0],-p[2],p[1]];
const inside=(p,b)=>p.every((v,i)=>v>=b[0][i]-1e-6&&v<=b[1][i]+1e-6);
function canonical(row){
  const keys=row.p.map(pointKey),rot=[0,1,2].sort((a,b)=>[...keys.slice(a),...keys.slice(0,a)].join(';').localeCompare([...keys.slice(b),...keys.slice(0,b)].join(';')))[0];
  return {...row,p:[...row.p.slice(rot),...row.p.slice(0,rot)],uv:[...row.uv.slice(rot),...row.uv.slice(0,rot)],n:[...row.n.slice(rot),...row.n.slice(0,rot)],key:[...keys.slice(rot),...keys.slice(0,rot)].join(';')};
}
function rows(asset,api,{identity=false,position=v=>v}={}){
  const out=[];
  if(identity){
    assert(!asset.doc.animations?.length&&!asset.doc.skins?.length,'static local repair cannot add animation or skinning');
    for(const n of asset.doc.nodes){
      assert.deepEqual(n.translation||[0,0,0],[0,0,0]);assert.deepEqual(n.rotation||[0,0,0,1],[0,0,0,1]);assert.deepEqual(n.scale||[1,1,1],[1,1,1]);
      assert(!n.matrix||n.matrix.every((v,i)=>v===(i%5===0?1:0)),'local positions remain in the same coordinates');
    }
  }
  for(let mesh=0;mesh<asset.doc.meshes.length;mesh++)for(let primitive=0;primitive<asset.doc.meshes[mesh].primitives.length;primitive++){
    const p=asset.doc.meshes[mesh].primitives[primitive];assert.equal(p.mode??4,4);assert(p.indices!==undefined);
    const count=asset.doc.accessors[p.indices].count;assert.equal(count%3,0);
    for(let t=0;t<count/3;t++){
      const ids=[0,1,2].map(c=>api.scalar(asset,p.indices,t*3+c));
      const read=(key,n)=>ids.map(i=>Array.from({length:n},(_,a)=>api.scalar(asset,p.attributes[key],i,a)));
      out.push({id:out.length,mesh,primitive,triangle:t,material:p.material,p:read('POSITION',3).map(position),uv:read('TEXCOORD_0',2),n:read('NORMAL',3)});
    }
  }
  return out;
}
function matchTriangles(before,after){
  const buckets=new Map();
  after.map(canonical).forEach(row=>{const list=buckets.get(row.key)||[];list.push(row);buckets.set(row.key,list);});
  const matches=[];
  for(const a of before.map(canonical)){
    const available=buckets.get(a.key);assert(available?.length,'every original oriented triangle remains at its exact float32 positions');
    // Coincident faces are resolved by their existing UVs rather than trusting
    // Blender's regrouped primitive or vertex order.
    const distances=available.map(b=>a.uv.flat().reduce((sum,v,i)=>sum+Math.abs(v-b.uv.flat()[i]),0));
    const index=distances.indexOf(Math.min(...distances));matches.push([a,available.splice(index,1)[0]]);
  }
  return {matches,extra:[...buckets.values()].flat()};
}
function nearest(b){
  assert.equal(b.notRayCoverage,true);assert.equal(b.nearestLookupSuccessFraction,1);
  assert.deepEqual(b.sourceDistanceQuantileLevels,[.5,.95,.99,1]);assert(b.sourceDistanceQuantiles.every(Number.isFinite));
  assert(b.sourceDistanceQuantiles[1]<=.01&&b.sourceDistanceQuantiles[2]<=.02);
  assert(b.overTwoPercentMaxEdge<=.01&&b.distanceReviewRequired===false);
  assert(b.closestSourceVertexFallbackFraction<=.001);
  assert(b.barycentricPointReconstructionErrorQuantiles.every(v=>Number.isFinite(v)&&v<.001));
}
function stage(processing,field,link,api){
  const frozen=JSON.parse(api.receipt(processing.promotedFrom));
  assert.deepEqual(frozen[field],processing[field],`${field} is bound to its immutable reviewed report`);
  equalReceipt(frozen.processedCandidate,processing.processedCandidate,'final candidate belongs to the frozen repair report');
  equalReceipt(frozen.source.rawGLB,processing.source.rawGLB,'frozen raw identity');
  api.receipt(processing.processingTool);
  const prior=JSON.parse(api.receipt(link));
  equalReceipt(prior.source.rawGLB,processing.source.rawGLB,'repair preserves original neural provenance');
  return {frozen,prior};
}
const imageCache=new WeakMap();
function materialImages(asset,material,api){
  if(!imageCache.has(asset))imageCache.set(asset,api.imageHashes(asset));
  const m=asset.doc.materials[material],images=imageCache.get(asset),pbr=m.pbrMetallicRoughness;
  return [pbr.baseColorTexture,pbr.metallicRoughnessTexture].filter(Boolean).map(t=>images[asset.doc.textures[t.index].source]);
}
function materialIdentity(asset,index,api){
  const m=structuredClone(asset.doc.materials[index]);delete m.name;
  if(!imageCache.has(asset))imageCache.set(asset,api.imageHashes(asset));
  for(const t of [m.pbrMetallicRoughness?.baseColorTexture,m.pbrMetallicRoughness?.metallicRoughnessTexture,m.normalTexture,m.occlusionTexture,m.emissiveTexture].filter(Boolean))t.index=imageCache.get(asset)[asset.doc.textures[t.index].source];
  return m;
}

export function verifyExportedSurfaceRepair(processing,context,api){
  const r=processing.localSurfaceRepair;
  equalReceipt(context.candidateReceipt||processing.processedCandidate,processing.processedCandidate,'verified final local-repair candidate');
  assert(!r.receipt&&r.sourceCandidate&&r.repairs,'explicit post-export repair schema');
  const {prior,frozen}=stage(processing,'localSurfaceRepair',processing.priorLocalizedRepair,api);
  equalReceipt(prior.processedCandidate,r.sourceCandidate,'local repair starts with the frozen texture refresh');
  assert(!prior.localSurfaceRepair,'single bounded post-export surface repair');
  api.verifySourceTransfer(prior,{candidateReceipt:r.sourceCandidate});
  assert.deepEqual(processing.localSurfaceRepairTools,frozen.localSurfaceRepairTools,'repair tool receipts remain frozen');
  for(const name of ['repair_legacy_atlas_regions.py','fix_customnormals_helper.py','bake_nearest_surface.py'])api.receipt(processing.localSurfaceRepairTools[name]);
  assert.equal(r.originalVertexPositionsAndTopologyUnchanged,true);assert.equal(r.rawSourceUnchanged,true);assert.equal(r.newInferenceCalls,0);
  const before=api.glb(api.receipt(r.sourceCandidate)),after=api.glb(api.receipt(context.candidateReceipt||processing.processedCandidate));
  const originals=rows(before,api,{identity:true}),finals=rows(after,api,{identity:true});
  const {matches,extra}=matchTriangles(originals,finals),key=`${processing.region}/${processing.asset}`;
  const configurations={
    'classic/shop_1':{uv:[5254,16921,19860,19876],extra:0},
    'classic/hotel_2':{uv:[],extra:0,normal:[[-.405,.17,.36],[-.31,.255,.65]],corners:59},
    'classic/shop_3':{uv:[],extra:16,normal:[[-.23,.16,.82],[-.075,.28,.89]],corners:50},
  };
  const c=configurations[key];assert(c,'bounded reviewed local repair asset');
  assert.equal(extra.length,c.extra);assert.equal(finals.length,processing.triangles);
  const changed=[],oldImages=materialImages(before,0,api),originalMaterial=materialIdentity(before,0,api);let changedNormals=0;
  for(const [a,b] of matches){
    const uvChanged=a.uv.some((uv,i)=>uv.some((v,k)=>Math.abs(v-b.uv[i][k])>1e-6));
    if(uvChanged)changed.push(a.id);
    if(!c.uv.includes(a.id)){
      assert.deepEqual(materialImages(after,b.material,api),oldImages,'all original surface textures remain byte-identical');
      assert.deepEqual(materialIdentity(after,b.material,api),originalMaterial,'original material properties and texture roles remain unchanged');
    }
    for(let corner=0;corner<3;corner++){
      // int8 normalized export can shift a retained normal by under one degree.
      const delta=Math.hypot(...a.n[corner].map((v,i)=>v-b.n[corner][i]));
      if(delta>.02){assert(c.normal&&inside(blender(a.p[corner]),c.normal),'large normal changes stay within the inspected defective corner region');changedNormals++;}
    }
  }
  assert.deepEqual(changed.sort((a,b)=>a-b),c.uv,'only the exact inspected UV faces change');
  assert.deepEqual(r.originalUVLoopsChanged,[...c.uv.flatMap(id=>[id*3,id*3+1,id*3+2])].sort((a,b)=>a-b),'reported changed loops match actual faces');
  if(c.normal){
    const n=r.repairs.normalRepair;assert.equal(n.correctedCorners,c.corners);assert.equal(n.geometryAndUVUnchanged,true);
    assert.equal(n.minimumDotThreshold,-.01);assert.equal(n.creaseDegrees,55);assert(changedNormals>0&&changedNormals<=c.corners,'only reported reversed corners receive large corrections');
  }else assert.equal(changedNormals,0);
  if(r.repairs.localAtlas){const a=r.repairs.localAtlas;assert.deepEqual([...a.changedOriginalFaces].sort((a,b)=>a-b),c.uv);assert.equal(a.trianglesAdded,0);assert.equal(a.newMaterials,1);nearest(a.sourceTransfer);}
  if(c.extra){
    const patch=r.repairs.roofGapClosure;assert.equal(patch.trianglesAdded,c.extra);assert.equal(patch.originalTrianglesRemoved,0);assert.equal(patch.newMaterials,1);nearest(patch.sourceTransfer);
    const bounds=[patch.boundsBlender.min,patch.boundsBlender.max];assert.deepEqual(bounds[0].slice(0,2),[-.214,.258]);assert.deepEqual(bounds[1].slice(0,2),[-.089,.258]);
    assert(bounds[0][2]>.83&&bounds[1][2]<.875,'fixed small rear dormer fascia');
    for(const triangle of extra)for(const p of triangle.p)assert(inside(blender(p),bounds),'added faces remain inside the recorded fascia strip');
    assert.equal(patch.sourceProfileSamples.length,9);assert(patch.sourceProfileSamples.every(s=>Number.isInteger(s.sourceFace)&&Number.isFinite(s.roofHeight)));
    for(const t of extra)for(const point of t.p){
      const [x,y,z]=blender(point),sample=patch.sourceProfileSamples.find(s=>Math.abs(s.x-x)<1e-6);
      assert(sample&&Math.abs(y-.258)<1e-6,'fascia uses only the nine sampled source roof stations');
      assert(Math.min(Math.abs(z-(sample.roofHeight+.0003)),Math.abs(z-(sample.roofHeight-.022)))<1e-6,'fascia retains the measured roof profile and fixed strip height');
    }
  }
  return {originalTriangles:originals.length,addedTriangles:extra.length,changedUVFaces:changed,changedNormals};
}

export function verifyAtlasIslandRepair(processing,context,api){
  equalReceipt(context.candidateReceipt||processing.processedCandidate,processing.processedCandidate,'verified final atlas-repair candidate');
  const proof=JSON.parse(api.receipt(processing.localAtlasIslandRepair));
  const {prior}=stage(processing,'localAtlasIslandRepair',proof.inputReport,api);
  api.receipt(proof.tool);api.receipt(proof.source);equalReceipt(proof.source,processing.source.rawGLB,'local atlas uses the actual original neural texture');
  equalReceipt(proof.input,prior.processedCandidate,'local atlas input');equalReceipt(proof.output,processing.processedCandidate,'local atlas output');
  api.verifySourceTransfer(prior,{candidateReceipt:proof.input});nearest(proof.sampling);
  assert.deepEqual(proof.faceIds,[7749,22722],'the two measured guild UV slivers');
  const before=api.glb(api.receipt(proof.input)),after=api.glb(api.receipt(context.candidateReceipt||proof.output));
  for(const key of ['nodes','scenes','scene','animations','materials','meshes','skins'])assert.deepEqual(after.doc[key],before.doc[key],`UV seam repair preserves ${key}`);
  const a=rows(before,api),b=rows(after,api);assert.equal(a.length,b.length);const changed=[];
  for(let i=0;i<a.length;i++){
    assert.deepEqual(b[i].p,a[i].p,'guild positions remain exactly unchanged');assert.deepEqual(b[i].n,a[i].n,'guild normals remain exactly unchanged');
    const changedUV=JSON.stringify(a[i].uv)!==JSON.stringify(b[i].uv);if(changedUV)changed.push(i);
    if(proof.faceIds.includes(i)){
      const j=proof.faceIds.indexOf(i);
      for(let corner=0;corner<3;corner++)for(let axis=0;axis<2;axis++){
        const desired=axis===0?proof.newBlenderUVs[j][corner][axis]:1-proof.newBlenderUVs[j][corner][axis];
        assert(Math.abs(b[i].uv[corner][axis]-desired)<1e-6,'new UV corners equal the measured unused atlas squares');
      }
    }
  }
  assert.deepEqual(changed,proof.faceIds);assert.deepEqual(proof.verification.exactChangedUVFaces,changed);
  for(const [role,row] of Object.entries(proof.maps)){api.receipt(row);assert(api.imageHashes(after).includes(row.sha256),`${role} image is embedded exactly`);}
  for(const key of ['triangleCornerPositionsByteIdentical','triangleCornerNormalsByteIdentical','noFacesAddedOrRemoved','nodeHierarchyAndAnimationUnchanged','meshPrimitiveAndMaterialReferencesUnchanged','allUnrelatedBufferViewsByteIdentical'])assert.equal(proof.verification[key],true);
  const editable=new Set();
  for(let m=0;m<before.doc.meshes.length;m++)for(const p of before.doc.meshes[m].primitives)for(const index of [p.indices,...Object.values(p.attributes)])editable.add(before.doc.accessors[index].bufferView);
  before.doc.images.forEach(i=>editable.add(i.bufferView));
  before.doc.bufferViews.forEach((v,i)=>{if(!editable.has(i)){const w=after.doc.bufferViews[i];assert.deepEqual(after.bin.subarray(w.byteOffset||0,(w.byteOffset||0)+w.byteLength),before.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),'unrelated binary, including animation, remains exact');}});
  return proof;
}

export function verifyKyotoStyleRepair(processing,context,api){
  equalReceipt(context.candidateReceipt||processing.processedCandidate,processing.processedCandidate,'verified final Kyoto candidate');
  const r=processing.localStyleRefinement,{prior}=stage(processing,'localStyleRefinement',processing.priorRefinement,api);
  equalReceipt(r.sourceCandidate,prior.processedCandidate,'style repair starts with the exact fine source-derived LOD');
  api.receipt(r.referenceArtwork);api.receipt(processing.styleRefinementTool);api.receipt(processing.normalRefinementTool);
  api.verifySourceTransfer(prior,{candidateReceipt:r.sourceCandidate});
  assert.equal(`${processing.region}/${processing.asset}`,'compact/villa_2');assert.equal(r.trianglesAdded,0);assert.equal(r.trianglesRemoved,0);
  assert.deepEqual(r.ridge.regionBlender,{x:[-.35,.35],y:[-.105,.025],zAbove:.974});assert.equal(r.ridge.verticesMoved,132);assert(r.ridge.maximumMovement<.026);
  assert.equal(r.noren.faces,59);assert.equal(r.roofDenoise.enabled,false);
  const before=api.glb(api.receipt(r.sourceCandidate)),after=api.glb(api.receipt(context.candidateReceipt||processing.processedCandidate));
  let changedCorners=0;
  const expected=rows(before,api,{identity:true,position:p=>{
    const [x,y,z]=blender(p);if(Math.abs(x)<.35&&y>-.105&&y<.025&&z>.974){changedCorners++;return [p[0],Math.fround(.974),p[2]];}return p;
  }});
  const {matches,extra}=matchTriangles(expected,rows(after,api,{identity:true}));assert.equal(extra.length,0);assert(changedCorners>0);
  let changedUV=0;
  for(const [a,b] of matches)if(a.uv.some((v,i)=>v.some((x,j)=>Math.abs(x-b.uv[i][j])>1e-6))){
    changedUV++;const center=blender(a.p[0].map((v,i)=>(v+a.p[1][i]+a.p[2][i])/3));
    assert(inside(center,[[-.075,-.290,.175],[.175,-.268,.317]]),'only existing noren faces receive reference artwork UV');
  }
  assert.equal(changedUV,r.noren.faces);return r;
}

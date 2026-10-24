// A native UV/field export can be followed by measured component clipping.
// Count changes require the actual frozen source, bounded repair and partition.
import assert from 'node:assert/strict';

const finite=v=>Number.isFinite(v);
const identity=(a,b,label)=>{assert(a&&b,label);assert.equal(a.sha256,b.sha256,label);if(a.bytes!==undefined&&b.bytes!==undefined)assert.equal(a.bytes,b.bytes,label);};
export function verifyMechanicalAccounting(processing,expected,repair,verification){
  const part=processing.componentSeparation,link=processing.componentLocalRepair;
  assert(part&&link&&processing.animation,'changed triangle count requires explicit mechanical provenance');
  for(const row of [part,repair]){
    assert.equal(row.originalVerticesMoved,0);assert.equal(row.embeddedImageHashesUnchanged,true);assert.equal(row.originalMaterialUnchanged,true);
  }
  identity(processing.derivedFromStaticCandidate,part.source,'exact pre-motion surface');
  identity(repair.source,part.source,'repair input');identity(repair.output,part.output,'repair output');identity(part.output,processing.processedCandidate,'final motion candidate');
  assert.equal(verification.sourceSha256,part.source.sha256);assert.equal(verification.outputSha256,part.output.sha256);
  assert.equal(part.originalTriangles,expected);assert.equal(repair.sourceTriangles,expected);
  assert.equal(part.staticTriangles,repair.staticTriangles);assert.equal(part.movingTriangles,repair.movingOriginalOrRetriangulatedTriangles+repair.addedCapTriangles);
  assert.equal(part.finalTriangles,part.staticTriangles+part.movingTriangles);assert.equal(processing.triangles,part.finalTriangles);
  assert.equal(part.newFacesAdded,repair.addedCapTriangles);assert.equal(link.newFacesAdded,repair.addedCapTriangles);
  assert.equal(part.splitSourceTriangles,repair.splitSourceTriangles);assert.equal(link.splitSourceTriangles,repair.splitSourceTriangles);assert.equal(link.originalVerticesMoved,0);
  assert(Number.isInteger(repair.addedCapTriangles)&&repair.addedCapTriangles>0&&repair.addedCapTriangles<=650,'bounded mechanical closure only');
  assert(repair.addedCapTriangles<expected*.025&&part.movingTriangles<expected*.1&&part.staticTriangles>expected*.9,'repair is confined to the mechanical component');
  const partition=repair.sourceFacePartitionProof;assert(partition,'per-original-face clipping proof required');
  assert.equal(partition.comparedTriangles,expected);assert.equal(partition.allOriginalVerticesUnmoved,true);
  assert(finite(partition.maxAbsolutePerFaceAreaError)&&partition.maxAbsolutePerFaceAreaError<1e-8);
  assert(finite(partition.sumAbsolutePerFaceAreaError)&&partition.sumAbsolutePerFaceAreaError<1e-5);
  // splitSourceTriangles counts disc-boundary intersections in the executed
  // tool. Pointer subtraction can additionally split faces; the per-face list
  // is the complete accounting authority for the actual triangle increment.
  const split=partition.partitionedFaces,ids=new Set();assert(Number.isInteger(repair.splitSourceTriangles)&&repair.splitSourceTriangles>0&&repair.splitSourceTriangles<=split.length);
  let extra=0;
  for(const face of split){
    assert(Number.isInteger(face.sourceTriangle)&&face.sourceTriangle>=0&&face.sourceTriangle<expected&&!ids.has(face.sourceTriangle),'unique original triangle IDs');ids.add(face.sourceTriangle);
    assert(Number.isInteger(face.outputTriangles)&&face.outputTriangles>1);extra+=face.outputTriangles-1;
    assert(finite(face.originalArea)&&face.originalArea>0&&finite(face.partitionArea));assert(Math.abs(face.originalArea-face.partitionArea)<1e-8,'each clipped original surface is conserved');
  }
  assert.equal(expected+extra+repair.addedCapTriangles,processing.triangles,'exact split plus cap increment, not an inequality');
  assert.equal(repair.patches.length,repair.addedCapTriangles);
  for(const patch of repair.patches){
    assert(Number.isInteger(patch.donorOriginalTriangle)&&patch.donorOriginalTriangle>=0&&patch.donorOriginalTriangle<expected);
    assert(finite(repair.radius)&&repair.radius>0&&repair.radius<.3);
    assert(finite(patch.area)&&patch.area>0&&patch.area<Math.PI*repair.radius**2/2,'closure triangle stays within measured disc-scale area');
    assert.equal(patch.barycentricUvWeights.length,3);
    for(const weights of patch.barycentricUvWeights){assert.equal(weights.length,3);assert(weights.every(v=>finite(v)&&v>=-1e-6&&v<=1+1e-6));assert(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-6);}
  }
  assert.equal(verification.movingTriangles,part.movingTriangles);assert.equal(verification.boundaryEdgesAtWeld1e6,0);assert.equal(verification.nonManifoldEdgesAtWeld1e6,0);
  assert.equal(verification.originalMaterialsExactlyEqual,true);assert.equal(verification.embeddedImageHashesExactlyEqual,true);
  assert.equal(processing.animation.node,part.selection.name);assert.equal(processing.animation.lifePart,'wheel');assert.equal(part.selection.lifePart,'wheel');
  assert.deepEqual(part.selection.center,repair.center);assert.deepEqual(part.selection.axis,repair.axis);assert.equal(part.selection.radius,repair.radius);
  assert.equal(processing.animation.driver,'scene-life');assert.equal(processing.animation.autoplayClip,false);
  return {partition,extra};
}

const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const subtract=(a,b)=>a.map((v,i)=>v-b[i]);
const area=points=>Math.hypot(...cross(subtract(points[1],points[0]),subtract(points[2],points[0])))/2;
function transform(point,node){
  assert(!node.matrix,'component proof uses explicit rigid node transforms');
  const scale=node.scale||[1,1,1];assert(scale.every(v=>Math.abs(v-1)<1e-9),'no component rescaling');
  const q=node.rotation||[0,0,0,1],t=node.translation||[0,0,0];assert(Math.abs(Math.hypot(...q)-1)<1e-6);
  const uv=cross(q.slice(0,3),point),uuv=cross(q.slice(0,3),uv);
  return point.map((v,i)=>v+2*(q[3]*uv[i]+uuv[i])+t[i]);
}
function meshTriangles(asset,node,scalar){
  const rows=[];
  for(const primitive of asset.doc.meshes[node.mesh].primitives){
    assert(primitive.indices!==undefined&&(primitive.mode===undefined||primitive.mode===4));
    const count=asset.doc.accessors[primitive.indices].count;assert.equal(count%3,0);
    for(let k=0;k<count;k+=3){
      const ids=[0,1,2].map(i=>scalar(asset,primitive.indices,k+i));
      rows.push({points:ids.map(id=>transform([0,1,2].map(c=>scalar(asset,primitive.attributes.POSITION,id,c)),node)),uv:ids.map(id=>[0,1].map(c=>scalar(asset,primitive.attributes.TEXCOORD_0,id,c)))});
    }
  }
  return rows;
}
function verifyActualPartition(before,after,partition){
  const split=new Map(partition.partitionedFaces.map(row=>[row.sourceTriangle,row])),used=new Set(),grid=new Map(),cell=1e-4;
  const center=t=>[0,1,2].map(k=>t.points.reduce((sum,p)=>sum+p[k],0)/3);
  const bucket=p=>p.map(v=>Math.floor(v/cell));
  after.forEach((row,i)=>{const key=bucket(center(row)).join(',');if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);});
  const sameTriangle=(a,b)=>[0,1,2].some(offset=>a.every((p,i)=>p.every((v,k)=>Math.abs(v-b[(i+offset)%3][k])<2e-7)));
  for(let sourceId=0;sourceId<before.length;sourceId++){
    if(split.has(sourceId))continue;
    const original=before[sourceId],base=bucket(center(original));let match;
    search:for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const i of grid.get([base[0]+dx,base[1]+dy,base[2]+dz].join(','))||[]){
      if(!used.has(i)&&sameTriangle(original.points,after[i].points)){match=i;break search;}
    }
    assert(match!==undefined,'every uncut original triangle remains in the actual final geometry');used.add(match);
  }
  const originals=[...split].map(([id,proof])=>({id,proof,points:before[id].points,area:0,count:0}));
  function contains(points,p){
    const a=subtract(points[1],points[0]),b=subtract(points[2],points[0]),c=subtract(p,points[0]),n=cross(a,b),length=Math.hypot(...n);
    if(length<1e-14||Math.abs(n.reduce((sum,v,k)=>sum+v*c[k],0))/length>2e-7)return false;
    const omit=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),axes=[0,1,2].filter(k=>k!==omit),[i,j]=axes,den=a[i]*b[j]-a[j]*b[i];
    const u=(c[i]*b[j]-c[j]*b[i])/den,v=(a[i]*c[j]-a[j]*c[i])/den;
    return Math.min(u,v,1-u-v)>=-1e-3&&Math.max(u,v,1-u-v)<=1.001;
  }
  for(let i=0;i<after.length;i++)if(!used.has(i)){
    const piece=after[i],candidates=originals.filter(row=>piece.points.every(p=>contains(row.points,p)));
    assert(candidates.length,'every retriangulated fragment lies on a declared original triangle');
    // Adjacent coplanar triangles can share tiny cut slivers. Resolve them by
    // the remaining exact per-source partition count, never inventing a face.
    const match=candidates.find(row=>row.count<row.proof.outputTriangles);assert(match,'partition cannot duplicate original surface');
    match.count++;match.area+=area(piece.points);
  }
  for(const row of originals){assert.equal(row.count,row.proof.outputTriangles);assert(Math.abs(row.area-row.proof.originalArea)<1e-8,'actual per-source partition area');}
}
export function verifyMechanicalDerivative(processing,expected,api){
  if(processing.triangles===expected)return;
  const {receipt,glb,scalar,imageHashes}=api,part=processing.componentSeparation,link=processing.componentLocalRepair;
  assert(link&&part,'normalization cannot silently add geometry');
  const repair=JSON.parse(receipt(link.localRepair)),verification=JSON.parse(receipt(link.verification));
  identity(link.localRepair,part.localRepair,'frozen local repair');identity(link.verification,part.verification,'frozen geometric verification');identity(link.tool,part.tool,'executed mechanical repair tool');
  identity(repair.tool,link.tool,'repair tool identity');identity(repair.verification,link.verification,'verification identity');receipt(link.tool);
  const {partition}=verifyMechanicalAccounting(processing,expected,repair,verification);
  const prior=JSON.parse(receipt(repair.sourceProcessingReport));
  identity(prior.processedCandidate,part.source,'frozen original processing identity');identity(prior.source.rawGLB,processing.source.rawGLB,'original raw identity');assert.equal(prior.triangles,expected);
  for(const key of ['nativeSurfaceExport','textureOnlyReprocessing','derivation','bake'])assert.deepEqual(prior[key],processing[key],`component cannot rewrite prior ${key}`);
  // A frozen processing report may name a scratch output. Validate the exact
  // approved copy explicitly; never search for an arbitrary matching file.
  const finalReceipt=api.candidateReceipt||processing.processedCandidate;
  identity(finalReceipt,processing.processedCandidate,'exact final copy identity');
  const source=glb(receipt(repair.source)),result=glb(receipt(finalReceipt));
  assert.deepEqual(imageHashes(source),imageHashes(result),'actual embedded image bytes');assert.deepEqual(source.doc.materials,result.doc.materials,'actual original materials');assert(!(result.doc.animations||[]).length,'scene-life has no second autoplay animation');
  const originalNodes=source.doc.nodes.filter(n=>n.mesh!==undefined),movingNodes=result.doc.nodes.filter(n=>n.mesh!==undefined&&n.name===processing.animation.node),staticNodes=result.doc.nodes.filter(n=>n.mesh!==undefined&&n.name!==processing.animation.node);
  assert.equal(originalNodes.length,1);assert.equal(movingNodes.length,1);assert.equal(staticNodes.length,1);
  // Parent nodes cannot hide a changed whole-building transform.
  for(const model of [source,result])for(const node of model.doc.nodes.filter(n=>n.mesh===undefined))assert(!node.matrix&&!node.translation&&!node.rotation&&!node.scale);
  const before=meshTriangles(source,originalNodes[0],scalar),moving=meshTriangles(result,movingNodes[0],scalar),stationary=meshTriangles(result,staticNodes[0],scalar);
  assert.equal(before.length,expected);assert.equal(moving.length,part.movingTriangles);assert.equal(stationary.length,part.staticTriangles);
  assert.equal(movingNodes[0].extras.lifePart,'wheel');assert.deepEqual(movingNodes[0].translation,repair.center);
  for(const face of partition.partitionedFaces)assert(Math.abs(area(before[face.sourceTriangle].points)-face.originalArea)<1e-9,'partition proof uses actual source triangles');
  const caps=moving.slice(repair.movingOriginalOrRetriangulatedTriangles);assert.equal(caps.length,repair.addedCapTriangles);
  for(let i=0;i<caps.length;i++){
    const patch=repair.patches[i];assert(Math.abs(area(caps[i].points)-patch.area)<1e-8,'actual closure area matches its receipt');
    for(let corner=0;corner<3;corner++)for(let channel=0;channel<2;channel++){
      const weights=patch.barycentricUvWeights[corner],donor=before[patch.donorOriginalTriangle];
      const expectedUV=weights.reduce((sum,w,k)=>sum+w*donor.uv[k][channel],0);assert(Math.abs(expectedUV-caps[i].uv[corner][channel])<2/65535,'new UV is interpolated from the declared original donor');
    }
  }
  const originalArea=before.reduce((sum,t)=>sum+area(t.points),0),partitionArea=[...stationary,...moving.slice(0,repair.movingOriginalOrRetriangulatedTriangles)].reduce((sum,t)=>sum+area(t.points),0);
  assert(Math.abs(originalArea-partitionArea)<1e-6,'actual original geometry area conserved before adding caps');
  verifyActualPartition(before,[...stationary,...moving.slice(0,repair.movingOriginalOrRetriangulatedTriangles)],partition);
  return {repair,verification,extraTriangles:processing.triangles-expected};
}

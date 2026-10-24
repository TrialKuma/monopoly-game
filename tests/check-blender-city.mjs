// Audit the authored release on disk. This checks geometry and provenance;
// portrait screenshots and artistic acceptance remain separate evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Matrix4,Vector3,Quaternion,Box3} from '../assets/vendor/three/three.module.min.js';
import {glb,verifyAnimation} from './ai-city-fixture.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const sourceType='authored_blender_reference_rebuild';
const maps=['classic','compact','expansion','harbor','alpine'];
const families=['villa','shop','hotel','tower','skyscraper','finance','onsen'];
const publics=['civic_hall','vault_bank','builders_guild','card_pavilion','chance_wheel','teleport_gate','rush_station','junction_hub'];
const names=[...families.flatMap(name=>[1,2,3].map(level=>`${name}_${level}`)),...publics];
const farNames=['villa_3','shop_2','hotel_2','tower_2','junction_hub'];
const requested=process.argv.find(arg=>arg.startsWith('--map='))?.slice(6);
assert(!requested||maps.includes(requested),'known region');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function read(file){const resolved=path.resolve(root,file);assert(!path.relative(root,resolved).startsWith('..'),'project-relative provenance');return fs.readFileSync(resolved);}
const json=file=>JSON.parse(read(file));
const transform=node=>node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3().fromArray(node.translation||[0,0,0]),new Quaternion().fromArray(node.rotation||[0,0,0,1]),new Vector3().fromArray(node.scale||[1,1,1]));
const referenceSets=new Set(),geometrySets=new Set();let nearCount=0,farCount=0,heroCount=0;
function verifyReferences(views,key,{far=false}={}){
  assert.deepEqual(views.map(row=>row.view),['front','right','back'],`${key}: complete original three views`);
  for(const view of views){assert.equal(hash(read(view.path)),view.sha256,`${key}: original reference bytes`);}
  if(!far){const signature=views.map(row=>row.sha256).join(':');assert(!referenceSets.has(signature),`${key}: individually designed views`);referenceSets.add(signature);}
}
function measure(asset,index){
  const box=new Box3(),parts=[],geometry=crypto.createHash('sha256');let triangles=0,meshCount=0;
  function visit(i,parent){
    const node=asset.doc.nodes[i],world=parent.clone().multiply(transform(node));
    if(node.extras?.lifePart)parts.push({kind:node.extras.lifePart,index:i,node});
    if(node.mesh!==undefined)for(const primitive of asset.doc.meshes[node.mesh].primitives){
      meshCount++;assert.equal(primitive.mode??4,4,'triangle surfaces');
      const position=asset.doc.accessors[primitive.attributes.POSITION];
      assert.equal(position.componentType,5126,'authored position precision');
      assert(position.min.every(Number.isFinite)&&position.max.every(Number.isFinite),'finite bounds');
      box.union(new Box3(new Vector3().fromArray(position.min),new Vector3().fromArray(position.max)).applyMatrix4(world));
      triangles+=(primitive.indices===undefined?position:asset.doc.accessors[primitive.indices]).count/3;
      const normal=asset.doc.accessors[primitive.attributes.NORMAL];assert.equal(normal?.count,position.count,'exported shading normals');
      const material=asset.doc.materials[primitive.material];assert(material?.pbrMetallicRoughness,'explicit PBR material');
      assert(primitive.attributes.COLOR_0!==undefined||material.pbrMetallicRoughness.baseColorFactor,'authored surface color');
      // Values and part transforms, not node labels, distinguish actual geometry.
      geometry.update(JSON.stringify(world.elements));
      for(const a of [primitive.attributes.POSITION,primitive.indices].filter(value=>value!==undefined)){
        const accessor=asset.doc.accessors[a],view=asset.doc.bufferViews[accessor.bufferView];
        const elementBytes=({5121:1,5123:2,5125:4,5126:4}[accessor.componentType])*({SCALAR:1,VEC3:3}[accessor.type]);
        const offset=(view.byteOffset||0)+(accessor.byteOffset||0),stride=view.byteStride||elementBytes;
        assert(elementBytes>0&&stride>=elementBytes,'valid geometric accessor');
        if(stride===elementBytes)geometry.update(asset.bin.subarray(offset,offset+accessor.count*elementBytes));
        else for(let vertex=0;vertex<accessor.count;vertex++)geometry.update(asset.bin.subarray(offset+vertex*stride,offset+vertex*stride+elementBytes));
      }
    }
    for(const child of node.children||[])visit(child,world);
  }
  visit(index,new Matrix4());return {box,size:box.getSize(new Vector3()).toArray(),triangles,parts,meshCount,fingerprint:geometry.digest('hex')};
}
function packageFile(file,region,expected,{far=false,hero=false,nearManifest=null}={}){
  const bytes=read(file),asset=glb(bytes),manifest=json(file.replace(/\.glb$/,'-manifest.json'));
  assert.equal(manifest.sourceType,sourceType);assert.equal(manifest.sha256,hash(bytes));assert.equal(manifest.bytes,bytes.length);assert.equal(manifest.region,region);
  assert(bytes.length<=(hero?8:far?16:90)*1048576,`${region}: downloadable package budget`);
  const roots=asset.doc.scenes[asset.doc.scene||0].nodes;
  assert.deepEqual(roots.map(i=>asset.doc.nodes[i].name).sort(),expected.map(name=>`${region}_${name}`).sort(),'complete roots without old fallback');
  assert.deepEqual(manifest.assets.map(row=>row.name).sort(),expected.map(name=>`${region}_${name}`).sort(),'manifest describes every exported building');
  assert.equal(manifest.binarySegments?.length,expected.length,'one exact source-binary segment per building');
  for(const segment of manifest.binarySegments){
    const source=glb(read(segment.source));assert.equal(hash(source.bin),segment.sha256,'source embedded payload');
    assert.equal(hash(asset.bin.subarray(segment.offset,segment.offset+segment.bytes)),segment.sha256,'colors, UV, ORM pixels and animation payload survive packaging exactly');
  }
  const heights=new Map();
  for(const name of expected){
    const key=`${region}/${name}`,index=roots.find(i=>asset.doc.nodes[i].name===`${region}_${name}`),node=asset.doc.nodes[index],extra=node.extras;
    const row=manifest.assets.find(value=>value.name===node.name);
    assert.equal(extra?.sourceType,sourceType);assert.equal(row.source?.sourceType,sourceType);
    assert.notEqual(extra.reviewStatus,'approved','authored models must not inherit neural visual approval');
    assert(!extra.rawSourceSha256&&!extra.inferenceReport,'no fabricated neural source for authored geometry');
    assert.deepEqual(extra.referenceViews,row.source.referenceViews,'viewer and release use the same references');verifyReferences(extra.referenceViews,key,{far});
    assert(transform(node).equals(new Matrix4()),`${key}: identity placement root`);
    const measured=measure(asset,index),m=measured;
    const originalBytes=read(extra.sourceFile);assert.equal(hash(originalBytes),extra.sourceSha256,'bound authored GLB bytes');
    const processingBytes=read(extra.processingReport),processing=JSON.parse(processingBytes);
    assert.equal(hash(processingBytes),extra.processingReportSha256,'bound source processing record');
    assert.equal(processing.sha256,extra.sourceSha256);assert.equal(processing.bytes,originalBytes.length);
    if(extra.storageCompression){
      assert.deepEqual(extra.storageCompression,processing.storageCompression,'published storage provenance');
      const compression=extra.storageCompression,reportBytes=read(compression.report.path),report=JSON.parse(reportBytes);
      assert.equal(hash(reportBytes),compression.report.sha256,'immutable quantization evidence');
      assert.equal(report.after.sha256,extra.sourceSha256);assert.equal(report.after.bytes,originalBytes.length);
      assert.equal(report.positionChanged,false);assert.equal(report.topologyChanged,false);assert.equal(report.animationChanged,false);
      assert(report.maxNormalError<=1/32767&&report.maxUVError<=1/65535&&report.maxColorError<=1/510,'declared quantization errors remain within bounds');
      if(key==='compact/villa_2')assert.equal(report.maxColorError,0,'accepted benchmark colors remain exact');
    }
    const original=glb(originalBytes),originalRoots=original.doc.scenes[original.doc.scene||0].nodes;
    assert.equal(originalRoots.length,1);assert.equal(measure(original,originalRoots[0]).fingerprint,m.fingerprint,'original geometry and transforms survive packaging exactly');
    assert(Math.abs(m.box.min.y)<.002,`${key}: ground contact`);
    assert(Math.abs(m.box.min.x+m.box.max.x)<.002&&Math.abs(m.box.min.z+m.box.max.z)<.002,`${key}: centered parcel`);
    assert.equal(m.triangles,row.triangles,`${key}: measured triangle count`);
    m.size.forEach((value,i)=>assert(Math.abs(value-row.size[i])<.0002,`${key}: measured size`));
    for(const [edge,point] of [['min',m.box.min],['max',m.box.max]])point.toArray().forEach((value,i)=>assert(Math.abs(value-row.bounds[edge][i])<.0002,`${key}: measured bounds`));
    assert(m.meshCount>0&&m.triangles>500,`${key}: real architectural surfaces`);
    if(far){
      assert(m.triangles<=20000,`${key}: lightweight far geometry`);
      const near=nearManifest.assets.find(value=>value.name===node.name);assert(near,`${key}: corresponding near architecture`);
      assert.deepEqual(extra.referenceViews,near.source.referenceViews,`${key}: same regional design in distance`);farCount++;
    }else{
      assert(!geometrySets.has(m.fingerprint),`${key}: geometry differs across architecture and levels`);geometrySets.add(m.fingerprint);
      if(hero){
        assert(m.triangles<=60000,`${key}: hero geometry budget`);assert(m.size[0]<=2.802&&m.size[1]<=3.702&&m.size[2]<=2.802,'hero clearance');verifyAnimation(asset,node.name);heroCount++;
      }else{
        const large=['skyscraper','finance','onsen'].includes(extra.family),isPublic=publics.includes(extra.family);
        assert.equal(extra.family,name.replace(/_[123]$/,''));assert.equal(extra.level,isPublic?0:Number(name.at(-1)));
        const limits=large?[2.7,2.6,1.15]:isPublic?[1.12,1.5,1.12]:[1.05,1.85,1.05];m.size.forEach((value,i)=>assert(value<=limits[i]+.002,`${key}: parcel clearance`));
        assert(m.triangles<=(large?80000:50000),`${key}: phone geometry budget`);
        if(name==='chance_wheel')assert(m.parts.some(part=>part.kind==='wheel'),'separate wheel animation pivot');
        if(name==='builders_guild')assert(m.parts.some(part=>part.kind==='pendulum'),'separate crane animation pivot');
        for(const part of m.parts){assert.notEqual(part.index,index,'building root stays still');assert(part.node.children?.length||part.node.mesh!==undefined,'moving part contains geometry');}
        if(!isPublic)heights.set(name,m.size[1]);nearCount++;
      }
    }
  }
  if(!far&&!hero){
    assert.equal(asset.doc.animations?.length||0,0,'public parts are driven once by the game');
    for(const family of families)assert(heights.get(`${family}_1`)<heights.get(`${family}_2`)&&heights.get(`${family}_2`)<heights.get(`${family}_3`),`${region}/${family}: levels visibly grow`);
  }
  console.log(`PASS ${file}: ${expected.length} authored buildings, original references, actual bounds and geometry`);return manifest;
}
for(const map of requested?[requested]:maps){
  const nearManifest=packageFile(`assets/models/regions/${map}.glb`,map,names);
  packageFile(`assets/models/regions-far/${map}.glb`,map,farNames,{far:true,nearManifest});
  if(map==='harbor')packageFile('assets/models/harbor/harbor_lighthouse.glb',map,['lighthouse'],{hero:true});
  if(map==='alpine')packageFile('assets/models/harbor/alpine_windmill.glb',map,['windmill'],{hero:true});
}
if(!requested){
  const release=json('art/blender-city/release.json');assert.equal(release.sourceType,sourceType);
  assert.equal(release.playableBuildings,nearCount);assert.equal(release.landmarks,heroCount);assert.equal(release.farBuildings,farCount);
  assert.equal(nearCount,145);assert.equal(heroCount,2);assert.equal(farCount,25);
}
console.log(`PASS ${nearCount} playable, ${heroCount} hero, ${farCount} distant Blender buildings; no claim of measured phone FPS or user visual approval`);
await import('./check-building-previews.mjs');

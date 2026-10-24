// Byte-preserving authored GLB packaging. No model generation, deformation,
// neural approval copying or Blender re-export happens in this step.
// node art/blender-city/publish.mjs --publish
// node art/blender-city/publish.mjs --smoke --map=compact --assets=villa_1,chance_wheel --source-root=art/blender-city/drafts
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Matrix4,Vector3,Quaternion,Box3} from '../../assets/vendor/three/three.module.min.js';

const ROOT=fileURLToPath(new URL('../../',import.meta.url)),HERE='art/blender-city';
export const SOURCE='authored_blender_reference_rebuild';
export const MAPS=['classic','compact','expansion','harbor','alpine'];
export const FAMILIES=['villa','shop','hotel','tower','skyscraper','finance','onsen'];
export const PUBLIC=['civic_hall','vault_bank','builders_guild','card_pavilion','chance_wheel','teleport_gate','rush_station','junction_hub'];
export const ASSETS=[...FAMILIES.flatMap(family=>[1,2,3].map(level=>`${family}_${level}`)),...PUBLIC];
export const FAR=['villa_3','shop_2','hotel_2','tower_2','junction_hub'];
const HEROES={harbor:'harbor_lighthouse',alpine:'alpine_windmill'};
const TABLES=['bufferViews','accessors','samplers','images','textures','materials','meshes','nodes','animations'];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function local(relative){const absolute=path.resolve(ROOT,relative);assert(!path.relative(ROOT,absolute).startsWith('..'),'files stay in this project');return absolute;}
const read=file=>fs.readFileSync(local(file));
const json=file=>JSON.parse(read(file));
const receipt=file=>{const bytes=read(file);return {path:file,sha256:hash(bytes),bytes:bytes.length};};
function write(file,bytes){const target=local(file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target+'.pending',bytes);fs.renameSync(target+'.pending',target);}
const writeJSON=(file,value)=>write(file,JSON.stringify(value,null,2)+'\n');
const matrix=node=>node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3().fromArray(node.translation||[0,0,0]),new Quaternion().fromArray(node.rotation||[0,0,0,1]),new Vector3().fromArray(node.scale||[1,1,1]));

export function parseGLB(bytes){
  assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  let doc,bin;
  for(let cursor=12;cursor<bytes.length;){const length=bytes.readUInt32LE(cursor),kind=bytes.readUInt32LE(cursor+4),chunk=bytes.subarray(cursor+8,cursor+8+length);assert.equal(chunk.length,length);if(kind===0x4e4f534a)doc=JSON.parse(chunk);else if(kind===0x004e4942)bin=chunk;else throw Error('Unsupported GLB chunk');cursor+=8+length;}
  assert(doc&&bin&&doc.buffers?.length===1,'one embedded binary buffer');
  assert(!doc.buffers[0].uri&&!doc.skins?.length&&!doc.cameras?.length,'self-contained rigid architecture');
  for(const image of doc.images||[])assert(image.bufferView!==undefined&&!image.uri,'embedded textures');
  for(const view of doc.bufferViews||[])assert(!view.extensions&&(!view.buffer||view.buffer===0),'uncompressed buffers for explicit remapping');
  const supported=new Set(['KHR_materials_ior','KHR_materials_specular','KHR_materials_emissive_strength','KHR_materials_clearcoat','KHR_materials_transmission','KHR_materials_volume','KHR_materials_unlit','KHR_texture_transform','KHR_mesh_quantization']);
  for(const extension of doc.extensionsUsed||[])assert(supported.has(extension),`unhandled GLB extension ${extension}`);
  assert(!doc.extensions,'root extension remapping must be implemented explicitly');
  return {doc,bin};
}
export function encodeGLB(doc,bin){
  const payload=Buffer.from(JSON.stringify(doc)),jsonLength=(payload.length+3)&~3,binLength=(bin.length+3)&~3;
  const result=Buffer.alloc(28+jsonLength+binLength);result.write('glTF');result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
  result.writeUInt32LE(jsonLength,12);result.writeUInt32LE(0x4e4f534a,16);result.fill(32,20,20+jsonLength);payload.copy(result,20);
  result.writeUInt32LE(binLength,20+jsonLength);result.writeUInt32LE(0x004e4942,24+jsonLength);bin.copy(result,28+jsonLength);return result;
}
export function measure(doc,rootIndices=doc.scenes[doc.scene||0].nodes){
  const box=new Box3(),parts=[];let triangles=0,primitives=0;const usedMaterials=new Set();
  function visit(index,parent){
    const node=doc.nodes[index],world=parent.clone().multiply(matrix(node));if(node.extras?.lifePart)parts.push(node.extras.lifePart);
    if(node.mesh!==undefined)for(const primitive of doc.meshes[node.mesh].primitives){
      assert.equal(primitive.mode??4,4);const a=doc.accessors[primitive.attributes.POSITION];assert(a.min.every(Number.isFinite)&&a.max.every(Number.isFinite));
      assert.equal(a.componentType,5126,'authored floating positions');box.union(new Box3(new Vector3().fromArray(a.min),new Vector3().fromArray(a.max)).applyMatrix4(world));
      triangles+=(primitive.indices===undefined?a:doc.accessors[primitive.indices]).count/3;primitives++;usedMaterials.add(primitive.material);
      assert.equal(doc.accessors[primitive.attributes.NORMAL]?.count,a.count,'normals');assert.equal(doc.accessors[primitive.attributes.COLOR_0]?.count,a.count,'authored face colors');
    }
    for(const child of node.children||[])visit(child,world);
  }
  rootIndices.forEach(index=>visit(index,new Matrix4()));assert(!box.isEmpty()&&Number.isInteger(triangles));
  return {size:box.getSize(new Vector3()).toArray(),bounds:{min:box.min.toArray(),max:box.max.toArray()},triangles,parts,primitives,materials:usedMaterials.size};
}
function reference(catalog,region,asset){
  if(asset===HEROES[region]){const old=catalog.heroes?.[asset]?.previousManifest?.assets?.[0]?.source;assert(old,`${asset}: frozen reference record`);return {family:asset.slice(region.length+1),level:0,referenceViews:old.referenceViews};}
  const entry=catalog.regions?.[region]?.[asset];assert(entry,`${region}/${asset}: original reference design`);return entry;
}
function inspectSource(catalog,region,asset,{far=false,smoke=false,sourceRoot=HERE+'/models'}={}){
  const folder=`${far?HERE+'/far':sourceRoot}/${region}/${asset}`,file=folder+'/model.glb',recordFile=folder+'/model.json',record=json(recordFile),bytes=read(file),parsed=parseGLB(bytes);
  assert.equal(record.sha256,hash(bytes),`${file}: receipt is current`);assert.equal(record.bytes,bytes.length);assert.equal(record.sourceType,SOURCE);
  if(record.storageCompression){
    const compression=record.storageCompression,reportBytes=read(compression.report.path),report=JSON.parse(reportBytes);
    assert.equal(hash(reportBytes),compression.report.sha256,`${file}: compression evidence`);
    assert.equal(report.after.sha256,record.sha256);assert.equal(report.after.bytes,bytes.length);assert.equal(compression.afterSha256,record.sha256);
    assert.equal(report.before.sha256,compression.originalSha256);assert.equal(report.before.bytes,compression.originalBytes);
    assert.equal(report.positionChanged,false);assert.equal(report.topologyChanged,false);assert.equal(report.animationChanged,false);
    assert(report.maxNormalError<=1/32767&&report.maxUVError<=1/65535&&report.maxColorError<=1/510,'bounded source storage quantization');
    if(region==='compact'&&asset==='villa_2')assert.equal(report.maxColorError,0,'accepted Kyoto benchmark retains exact source colors');
  }
  const roots=parsed.doc.scenes[parsed.doc.scene||0].nodes,name=asset===HEROES[region]?asset:`${region}_${asset}`;
  assert.equal(roots.length,1,'single authored building');const node=parsed.doc.nodes[roots[0]];assert.equal(node.name,name);assert(matrix(node).equals(new Matrix4()),`${name}: root identity; fix fit before publishing`);
  assert.equal(node.extras?.sourceType,SOURCE);const ref=reference(catalog,region,asset);
  assert.deepEqual(ref.referenceViews.map(row=>row.view),['front','right','back']);
  ref.referenceViews.forEach(row=>assert.equal(hash(read(row.path)),row.sha256,`${name}: existing reference bytes`));
  if(asset!==HEROES[region]){assert.deepEqual(node.extras.referenceViews,ref.referenceViews);assert.deepEqual(record.referenceViews,ref.referenceViews);}
  const measured=measure(parsed.doc),hero=asset===HEROES[region],large=['skyscraper','finance','onsen'].includes(ref.family),publicBuilding=PUBLIC.includes(asset);
  const limits=hero?[2.8,3.7,2.8]:large?[2.7,2.6,1.15]:publicBuilding?[1.12,1.5,1.12]:[1.05,1.85,1.05];
  measured.size.forEach((size,i)=>assert(size<=limits[i]+.002,`${name}: parcel clearance; no packing deformation`));
  assert(Math.abs(measured.bounds.min[1])<.002,'grounded');assert(Math.abs(measured.bounds.min[0]+measured.bounds.max[0])<.002&&Math.abs(measured.bounds.min[2]+measured.bounds.max[2])<.002,'centered');
  assert(measured.triangles>500&&measured.triangles<=(far?20000:hero?60000:large?80000:50000),`${name}: ${measured.triangles} triangles exceeds mobile budget`);
  assert(measured.materials<=3,`${name}: compact material set`);
  // Smoke accepts draft vertex colors. Actual delivery also needs its ORM atlas.
  if(!smoke){
    assert(record.surface?.textureSize>0&&parsed.doc.images?.length,`${name}: final surface atlas required`);
    for(const material of parsed.doc.materials||[])assert(material.pbrMetallicRoughness?.metallicRoughnessTexture&&material.occlusionTexture,`${name}: ORM material mapping`);
    for(const image of parsed.doc.images||[]){
      const view=parsed.doc.bufferViews[image.bufferView],png=parsed.bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength);
      assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a',`${name}: lossless authored ORM`);
      const limit=far?512:2048;assert(png.readUInt32BE(16)<=limit&&png.readUInt32BE(20)<=limit,`${name}: embedded atlas dimensions exceed ${limit}`);
    }
    assert(fs.existsSync(local(folder+'/source.blend'))||far,`${name}: editable Blender source`);
  }
  if(hero)assert(parsed.doc.animations?.length,`${name}: exported moving component animation`);
  else assert(!parsed.doc.animations?.length,`${name}: public parts animated by game only`);
  if(asset==='chance_wheel')assert(measured.parts.includes('wheel'));
  if(asset==='builders_guild')assert(measured.parts.includes('pendulum'));
  let nearSourceSha256;
  if(far){nearSourceSha256=hash(read(`${HERE}/models/${region}/${asset}/model.glb`));assert.equal(record.nearSourceSha256,nearSourceSha256,`${name}: far derivative must match current near source`);}
  const thermalPools=node.extras?.thermalPools;
  if(ref.family==='onsen'){
    assert(Array.isArray(thermalPools)&&thermalPools.length>0&&thermalPools.length<=4,`${name}: authored bath surfaces required`);
    for(const pool of thermalPools){
      assert(Array.isArray(pool)&&pool.length===5&&pool.every(Number.isFinite),`${name}: finite pool coordinates`);
      const [x,y,z,w,d]=pool;assert(w>.1&&d>.1,`${name}: readable bath size`);
      assert(x-w/2>=measured.bounds.min[0]-.002&&x+w/2<=measured.bounds.max[0]+.002&&y>=0&&y<=measured.bounds.max[1]&&z-d/2>=measured.bounds.min[2]-.002&&z+d/2<=measured.bounds.max[2]+.002,`${name}: water anchors remain on the parcel`);
    }
  }
  const provenance={sourceType:SOURCE,region,asset,family:ref.family,level:ref.level,referenceViews:ref.referenceViews,sourceFile:file,sourceSha256:hash(bytes),processingReport:recordFile,processingReportSha256:hash(read(recordFile)),builder:record.builder,builderSha256:record.builderSha256,pipelineSha256:record.pipelineSha256,authoredArchitecture:true,...(record.storageCompression?{storageCompression:record.storageCompression}:{}),...(far?{nearSourceSha256,detailLevel:'far'}:{detailLevel:hero?'hero':'near'})};
  if(thermalPools)provenance.thermalPools=structuredClone(thermalPools);
  return {region,asset,name,bytes,parsed,record,measured,provenance};
}
function remapMaterial(value,textureOffset){
  if(!value||typeof value!=='object')return;
  for(const [key,item] of Object.entries(value)){if(key.endsWith('Texture')&&item&&typeof item==='object'&&'index' in item)item.index+=textureOffset;else remapMaterial(item,textureOffset);}
}
export function mergeSources(sources){
  const doc={asset:{version:'2.0',generator:'Blender regional architecture; byte-preserving authored pack'},scene:0,scenes:[{nodes:[]}],...Object.fromEntries(TABLES.map(table=>[table,[]]))},chunks=[],rows=[],segments=[];let binaryLength=0;
  for(const source of sources){
    const part=structuredClone(source.parsed.doc),bin=source.parsed.bin,offsets=Object.fromEntries(TABLES.map(key=>[key,doc[key].length]));
    const padding=(4-binaryLength%4)%4;if(padding){chunks.push(Buffer.alloc(padding));binaryLength+=padding;}
    const start=binaryLength;chunks.push(bin);binaryLength+=bin.length;
    for(const view of part.bufferViews||[]){view.buffer=0;view.byteOffset=(view.byteOffset||0)+start;}
    for(const accessor of part.accessors||[]){if(accessor.bufferView!==undefined)accessor.bufferView+=offsets.bufferViews;if(accessor.sparse)for(const key of ['indices','values'])accessor.sparse[key].bufferView+=offsets.bufferViews;}
    for(const image of part.images||[])image.bufferView+=offsets.bufferViews;
    for(const texture of part.textures||[]){assert(!texture.extensions,'texture extensions need explicit remapping');if(texture.source!==undefined)texture.source+=offsets.images;if(texture.sampler!==undefined)texture.sampler+=offsets.samplers;}
    for(const material of part.materials||[])remapMaterial(material,offsets.textures);
    for(const mesh of part.meshes||[])for(const primitive of mesh.primitives){assert(!primitive.extensions,'primitive extensions need explicit remapping');for(const key of Object.keys(primitive.attributes))primitive.attributes[key]+=offsets.accessors;if(primitive.indices!==undefined)primitive.indices+=offsets.accessors;if(primitive.material!==undefined)primitive.material+=offsets.materials;for(const target of primitive.targets||[])for(const key of Object.keys(target))target[key]+=offsets.accessors;}
    for(const node of part.nodes||[]){if(node.mesh!==undefined)node.mesh+=offsets.meshes;if(node.children)node.children=node.children.map(index=>index+offsets.nodes);assert(node.skin===undefined&&node.camera===undefined);}
    for(const animation of part.animations||[]){for(const sampler of animation.samplers){sampler.input+=offsets.accessors;sampler.output+=offsets.accessors;}for(const channel of animation.channels)channel.target.node+=offsets.nodes;}
    const roots=part.scenes[part.scene||0].nodes;assert.equal(roots.length,1);part.nodes[roots[0]].extras={...source.provenance};
    for(const table of TABLES)doc[table].push(...(part[table]||[]));doc.scenes[0].nodes.push(roots[0]+offsets.nodes);
    for(const kind of ['extensionsUsed','extensionsRequired'])doc[kind]=[...new Set([...(doc[kind]||[]),...(part[kind]||[])])].sort();
    const {size,bounds,triangles}=source.measured;rows.push({name:source.name,size,bounds,triangles,source:source.provenance});
    segments.push({source:source.provenance.sourceFile,sha256:hash(bin),offset:start,bytes:bin.length});
  }
  const bin=Buffer.concat(chunks);doc.buffers=[{byteLength:bin.length}];for(const key of Object.keys(doc))if(Array.isArray(doc[key])&&!doc[key].length)delete doc[key];
  for(const part of segments)assert.equal(hash(bin.subarray(part.offset,part.offset+part.bytes)),part.sha256,'source geometry, colors, UV and texture bytes copied exactly');
  const bytes=encodeGLB(doc,bin),roundTrip=parseGLB(bytes);assert.equal(measure(roundTrip.doc).triangles,sources.reduce((sum,source)=>sum+source.measured.triangles,0));
  return {bytes,rows,segments};
}
function pack(sources,file){
  const packed=mergeSources(sources),manifest={schemaVersion:3,region:sources[0].region,coordinateSystem:'glTF Y-up; +Z front',sourceType:SOURCE,assets:packed.rows,binarySegments:packed.segments,packedAtUtc:new Date().toISOString(),sha256:hash(packed.bytes),bytes:packed.bytes.length};
  assert(packed.bytes.length<90*1048576,'package download budget');write(file,packed.bytes);const manifestPath=file.replace(/\.glb$/,'-manifest.json');writeJSON(manifestPath,manifest);
  return {path:file,sha256:manifest.sha256,bytes:manifest.bytes,assets:sources.length,triangles:manifest.assets.reduce((sum,row)=>sum+row.triangles,0),manifestPath,manifestSha256:hash(read(manifestPath))};
}
function validateGrowth(sources,region){
  for(const family of FAMILIES){const levels=[1,2,3].map(level=>sources.find(source=>source.asset===`${family}_${level}`));assert(levels.every(Boolean),`${region}/${family}: complete levels`);const heights=levels.map(row=>row.measured.size[1]);assert(heights[0]<heights[1]&&heights[1]<heights[2],`${region}/${family}: upgrade heights ${heights.join(', ')} must strictly grow; fix the source fit, not the pack`);}
}
function previewInputs(sources){
  return sources.map(source=>{
    const file=`${HERE}/renders/${source.region}/${source.asset}.png`,binding=json(file.replace(/\.png$/,'.json')),png=read(file);
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a','actual exported-model PNG');
    assert.equal(binding.sourceModelSha256,source.record.sha256,`${source.name}: preview belongs to this exact source GLB`);assert.equal(binding.pngSha256,hash(png));assert.equal(binding.view,'iso');
    return {source,file,png,bindingFile:file.replace(/\.png$/,'.json')};
  });
}
function packPreviews(region,inputs,modelPackSha256,stage){
  const rows=inputs.map(({source,file,png,bindingFile})=>{
    const target=`assets/buildings/regions/${region}/${source.asset}.png`;write(`${stage}/${source.asset}.png`,png);
    return {asset:source.asset,rootName:source.name,view:'iso',sourceType:SOURCE,path:target,sha256:hash(png),bytes:png.length,modelPackSha256,sourceModelSha256:source.record.sha256,sourceRender:file,sourceRenderSha256:hash(png),renderBinding:receipt(bindingFile)};
  });
  const manifest={region,sourceType:SOURCE,method:'Exact PNG rendered from the corresponding exported Blender GLB; copied without image generation.',assets:rows};writeJSON(`${stage}/manifest.json`,manifest);return {map:region,path:`assets/buildings/regions/${region}/manifest.json`,assets:rows.length,sha256:hash(read(`${stage}/manifest.json`))};
}
export function main(args=process.argv.slice(2)){
  const option=(name,fallback)=>args.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
  const smoke=args.includes('--smoke'),publish=args.includes('--publish'),region=option('map','all'),selected=region==='all'?MAPS:[region],catalog=json(HERE+'/reference-catalog.json'),sourceRoot=option('source-root',HERE+'/models');
  assert(selected.every(map=>MAPS.includes(map)));assert(!(smoke&&publish));assert(!publish||region==='all','publish complete five-map release together');assert(smoke||sourceRoot===HERE+'/models','only a smoke test may use draft source folders');
  if(smoke){
    const names=option('assets','villa_1').split(',');assert(region!=='all','smoke names one map');
    const sources=names.map(asset=>inspectSource(catalog,region,asset,{smoke:sourceRoot!==HERE+'/models',sourceRoot}));const output=pack(sources,`${HERE}/packing-smoke/${region}.glb`);
    console.log(JSON.stringify({mode:'smoke',formalFilesChanged:false,...output},null,2));return;
  }
  const ready=new Map();
  // Every selected source, far derivative and PNG is verified before staging;
  // publishing requires the whole set. Existing formal files survive failure.
  for(const map of selected){
    const near=ASSETS.map(asset=>inspectSource(catalog,map,asset)),far=FAR.map(asset=>inspectSource(catalog,map,asset,{far:true}));validateGrowth(near,map);
    const hero=HEROES[map]?[inspectSource(catalog,map,HEROES[map])]:[];ready.set(map,{near,far,hero,previews:previewInputs(near)});
  }
  if(args.includes('--check')){console.log(`PASS preflight ${selected.length} maps; no files written`);return;}
  const packages=[],previews=[],stage=HERE+'/packed';
  for(const [map,models] of ready){
    const near=pack(models.near,`${stage}/${map}.glb`);packages.push({map,role:'playable',...near,target:`assets/models/regions/${map}.glb`});
    packages.push({map,role:'far_derivative',...pack(models.far,`${stage}/${map}-far.glb`),target:`assets/models/regions-far/${map}.glb`});
    if(models.hero.length)packages.push({map,role:'centerpiece',...pack(models.hero,`${stage}/${HEROES[map]}.glb`),target:`assets/models/harbor/${HEROES[map]}.glb`});
    previews.push(packPreviews(map,models.previews,near.sha256,`${stage}/previews/${map}`));
  }
  if(!publish){writeJSON(`${stage}/staging.json`,{sourceType:SOURCE,status:'staged',packages,previews});console.log(`STAGED ${selected.length} maps; formal files unchanged`);return;}
  assert.equal(packages.filter(row=>row.role==='playable').reduce((sum,row)=>sum+row.assets,0),145);assert.equal(packages.filter(row=>row.role==='far_derivative').reduce((sum,row)=>sum+row.assets,0),25);assert.equal(packages.filter(row=>row.role==='centerpiece').length,2);
  const installed=[];
  for(const item of packages){
    write(item.target,read(item.path));const targetManifest=item.target.replace(/\.glb$/,'-manifest.json');write(targetManifest,read(item.manifestPath));
    const {target,...entry}=item;installed.push({...entry,path:target,manifestPath:targetManifest});
  }
  for(const map of MAPS){for(const asset of ASSETS)write(`assets/buildings/regions/${map}/${asset}.png`,read(`${stage}/previews/${map}/${asset}.png`));write(`assets/buildings/regions/${map}/manifest.json`,read(`${stage}/previews/${map}/manifest.json`));}
  const editableSources=[...ready.values()].flatMap(({near,hero})=>[...near,...hero]).map(source=>receipt(path.posix.dirname(source.provenance.sourceFile)+'/source.blend'));
  const storageReports=[...ready.values()].flatMap(({near,hero})=>[...near,...hero]).filter(source=>source.record.storageCompression).map(source=>({region:source.region,asset:source.asset,...source.record.storageCompression}));
  const release={schemaVersion:1,sourceType:SOURCE,status:'published',publishedAtUtc:new Date().toISOString(),playableBuildings:145,landmarks:2,farBuildings:25,uiPreviews:145,packages:installed,previews,editableSources,referenceCatalog:receipt(HERE+'/reference-catalog.json'),publisher:receipt(HERE+'/publish.mjs'),benchmark:catalog.benchmark,geometryPolicy:'Source positions and topology are unchanged by storage compression. Normal, UV and color storage uses bounded quantization recorded per asset; it is not lossless. Packaging then preserves each source binary payload exactly without deformation or rescaling.',storageCompression:{method:'NORMAL SNORM16; in-range TEXCOORD UNORM16; COLOR_0 UNORM8 except exact UNORM16 for compact/villa_2. ORM image bytes and animation are unchanged.',assets:storageReports},validation:{packaging:'Source and compression-report hashes, all three reference images, exact embedded binary copy, parcel bounds, growth, mobile geometry limits, moving public components and exact-model PNG bindings checked.',visualAcceptance:'Browser scene review is recorded separately. This status is publication, not a claim of user visual approval.',phonePerformanceMeasured:false},newAIInferenceCalls:0};
  // Release appears last, only after all 147 near/hero, 25 far and 145 PNGs exist.
  writeJSON(HERE+'/release.json',release);console.log(JSON.stringify({status:'published',playableBuildings:145,landmarks:2,farBuildings:25,uiPreviews:145,release:HERE+'/release.json'},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();

// Experiment only: no source assets, approval receipts or runtime code are modified.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const crypto=require('node:crypto'),zlib=require('node:zlib');
const MeshoptEncoder=require('./vendor/meshopt_encoder.js');
const MeshoptDecoder=require('./vendor/meshopt_decoder.js');
const ROOT=path.resolve(__dirname,'../../../..'),EXT='EXT_meshopt_compression';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const relative=p=>path.relative(ROOT,p).replaceAll('\\','/');
function read(buffer){
 assert.equal(buffer.toString('ascii',0,4),'glTF');assert.equal(buffer.readUInt32LE(4),2);assert.equal(buffer.readUInt32LE(8),buffer.length);
 const size=buffer.readUInt32LE(12),doc=JSON.parse(buffer.toString('utf8',20,20+size));
 const start=20+size;assert.equal(buffer.readUInt32LE(start+4),0x004e4942);
 return {doc,bin:buffer.subarray(start+8,start+8+buffer.readUInt32LE(start))};
}
function encodeGlb(doc,bin){
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((-json.length>>>0)%4,32)]);
 bin=Buffer.concat([bin,Buffer.alloc((-bin.length>>>0)%4)]);
 const h=Buffer.alloc(20),b=Buffer.alloc(8);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+bin.length,8);h.writeUInt32LE(json.length,12);h.writeUInt32LE(0x4e4f534a,16);b.writeUInt32LE(bin.length,0);b.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([h,json,b,bin]);
}
const componentBytes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
async function main(){
 await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
 const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'art/full-ai-city/approved-assets.json')));
 const keys=['classic/shop_1','alpine/villa_2','classic/skyscraper_1','classic/chance_wheel'];
 const results=[];
 for(const key of keys){
  const entry=registry.assets[key];assert.equal(entry.status,'approved');
  const source=path.join(ROOT,entry.candidate.path),original=fs.readFileSync(source);assert.equal(sha(original),entry.candidate.sha256);
  const {doc:src,bin:oldbin}=read(original),doc=structuredClone(src);assert.equal(src.buffers.length,1);assert(!src.extensionsUsed?.includes(EXT));
  const imageViews=new Set((src.images||[]).map(x=>x.bufferView));
  const indexAccessors=new Set((src.meshes||[]).flatMap(m=>m.primitives.map(p=>p.indices)).filter(x=>x!==undefined));
  const chunks=[],checks=[];let offset=0,fallback=0;
  function append(bytes){const start=offset;chunks.push(bytes);offset+=bytes.length;const padding=(-offset>>>0)%4;if(padding){chunks.push(Buffer.alloc(padding));offset+=padding;}return start;}
  for(let v=0;v<src.bufferViews.length;v++){
   const old=src.bufferViews[v],view=doc.bufferViews[v],raw=oldbin.subarray(old.byteOffset||0,(old.byteOffset||0)+old.byteLength);
   const accessors=(src.accessors||[]).map((a,i)=>({a,i})).filter(x=>x.a.bufferView===v);
   let mode=null,stride=0;
   if(!imageViews.has(v)&&accessors.length&&!accessors.some(x=>x.a.sparse)){
    if(accessors.length===1&&indexAccessors.has(accessors[0].i)){
     stride=componentBytes[accessors[0].a.componentType];if([2,4].includes(stride))mode='INDICES';
    }else{
     stride=old.byteStride||(accessors.length===1?componentBytes[accessors[0].a.componentType]*components[accessors[0].a.type]:0);
     if(stride>0&&stride<=256&&stride%4===0)mode='ATTRIBUTES';
    }
   }
   if(mode&&raw.length%stride===0){
    const count=raw.length/stride,compressed=Buffer.from(MeshoptEncoder.encodeGltfBuffer(raw,count,stride,mode));
    const decoded=new Uint8Array(raw.length);MeshoptDecoder.decodeGltfBuffer(decoded,count,stride,compressed,mode,'NONE');
    assert.deepEqual(Buffer.from(decoded),raw,`${key} view ${v} exact bytes`);
    view.buffer=1;view.byteOffset=fallback;fallback+=raw.length;fallback=(fallback+3)&~3;
    view.extensions={...(view.extensions||{}),[EXT]:{buffer:0,byteOffset:append(compressed),byteLength:compressed.length,byteStride:stride,count,mode,filter:'NONE'}};
    checks.push({view:v,kind:mode,rawBytes:raw.length,encodedBytes:compressed.length,sha256:sha(raw),decodedSha256:sha(decoded),exact:true});
   }else{
    view.buffer=0;view.byteOffset=append(raw);
    checks.push({view:v,kind:imageViews.has(v)?'IMAGE_UNCHANGED':'UNCOMPRESSED',rawBytes:raw.length,encodedBytes:raw.length,sha256:sha(raw),decodedSha256:sha(raw),exact:true});
   }
  }
  doc.buffers=[{byteLength:offset},{byteLength:fallback,extensions:{[EXT]:{fallback:true}}}];
  for(const k of ['extensionsUsed','extensionsRequired'])doc[k]=[...new Set([...(doc[k]||[]),EXT])];
  for(const key of Object.keys(src))if(!['bufferViews','buffers','extensionsUsed','extensionsRequired'].includes(key))assert.deepEqual(doc[key],src[key],`unchanged ${key}`);
  const encoded=encodeGlb(doc,Buffer.concat(chunks)),reparsed=read(encoded);
  // Verify the serialized GLB, not just intermediate encoder arrays.
  for(let v=0;v<src.bufferViews.length;v++){
   const view=reparsed.doc.bufferViews[v],e=view.extensions?.[EXT];let bytes;
   if(e){bytes=new Uint8Array(e.count*e.byteStride);MeshoptDecoder.decodeGltfBuffer(bytes,e.count,e.byteStride,reparsed.bin.subarray(e.byteOffset,e.byteOffset+e.byteLength),e.mode,e.filter);}
   else bytes=reparsed.bin.subarray(view.byteOffset,view.byteOffset+view.byteLength);
   assert.equal(sha(bytes),checks[v].sha256,`${key} serialized view ${v}`);
  }
  const safe=key.replace('/','--'),originalPath=path.join(__dirname,`${safe}.original.glb`),encodedPath=path.join(__dirname,`${safe}.meshopt.glb`);
  fs.writeFileSync(originalPath,original);fs.writeFileSync(encodedPath,encoded);
  assert.equal(sha(fs.readFileSync(source)),entry.candidate.sha256,'approved source unchanged');
  const brotli=b=>zlib.brotliCompressSync(b,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:5}}).length;
  results.push({asset:key,approvedSource:entry.candidate,originalFile:relative(originalPath),meshoptFile:relative(encodedPath),originalBytes:original.length,meshoptBytes:encoded.length,savedPercent:100*(1-encoded.length/original.length),originalGzipBytes:zlib.gzipSync(original,{level:9}).length,meshoptGzipBytes:zlib.gzipSync(encoded,{level:9}).length,originalBrotli5Bytes:brotli(original),meshoptBrotli5Bytes:brotli(encoded),sourceSha256:sha(original),meshoptSha256:sha(encoded),animationCount:(src.animations||[]).length,allViewBytesExact:true,jsonSemanticsExact:true,views:checks});
 }
 const vendorFiles=['meshopt_encoder.js','meshopt_decoder.js','meshopt_decoder.module.js','README.md','LICENSE.md'];
 const official={project:'zeux/meshoptimizer',version:'0.25',license:'MIT',files:vendorFiles.map(file=>({file:`vendor/${file}`,url:`https://raw.githubusercontent.com/zeux/meshoptimizer/v0.25/${file==='LICENSE.md'?'': 'js/'}${file}`,sha256:sha(fs.readFileSync(path.join(__dirname,'vendor',file)))}))};
 const report={scope:'Experiment only; no runtime sources/packs modified',encoding:'EXT_meshopt_compression v0 ATTRIBUTES/INDICES, filter NONE; no quantization, reordering, simplification, texture recompression or triangle index rotation',verifiedAt:new Date().toISOString(),officialDependency:official,results};
 fs.writeFileSync(path.join(__dirname,'comparison.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(results.map(({asset,originalBytes,meshoptBytes,savedPercent,originalGzipBytes,meshoptGzipBytes,originalBrotli5Bytes,meshoptBrotli5Bytes,animationCount,allViewBytesExact})=>({asset,originalBytes,meshoptBytes,savedPercent,originalGzipBytes,meshoptGzipBytes,originalBrotli5Bytes,meshoptBrotli5Bytes,animationCount,allViewBytesExact})),null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});

// Source storage compression: exact POSITION, index semantics, animation and
// embedded ORM; bounded normal/UV quantization and optional COLOR_0 UNORM8.
// No topology simplification. Apply mode records per-asset errors and hashes.
// node art/blender-city/compress_storage.mjs --input=art/blender-city/models/alpine/skyscraper_3/model.glb --output=art/blender-city/storage-study/alpine-skyscraper3.glb
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {parseGLB,encodeGLB,measure} from './publish.mjs';
import {MAPS,ASSETS} from './publish.mjs';

const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const COMPONENT_BYTES={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const ARITY={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const align=value=>(value+3)&~3;
function local(file){const result=path.resolve(ROOT,file);assert(!path.relative(ROOT,result).startsWith('..'));return result;}
function elementBytes(accessor){
  const bytes=COMPONENT_BYTES[accessor.componentType];assert(bytes&&ARITY[accessor.type]);
  if(accessor.type.startsWith('MAT')){const columns=Number(accessor.type.at(-1));return columns*align(columns*bytes);}
  return bytes*ARITY[accessor.type];
}
function scalar(asset,accessorIndex,index,axis,{raw=false}={}){
  const a=asset.doc.accessors[accessorIndex],view=asset.doc.bufferViews[a.bufferView],offset=(view.byteOffset||0)+(a.byteOffset||0)+index*(view.byteStride||elementBytes(a))+axis*COMPONENT_BYTES[a.componentType];
  const method={5120:'readInt8',5121:'readUInt8',5122:'readInt16LE',5123:'readUInt16LE',5125:'readUInt32LE',5126:'readFloatLE'}[a.componentType];
  const value=asset.bin[method](offset);if(raw||!a.normalized)return value;
  if(a.componentType===5120)return Math.max(-1,value/127);if(a.componentType===5122)return Math.max(-1,value/32767);
  return value/({5121:255,5123:65535,5125:4294967295}[a.componentType]);
}
function usage(doc){
  const semantics=new Map(),indices=new Set(),animated=new Set();
  function note(accessor,semantic){if(!semantics.has(accessor))semantics.set(accessor,new Set());semantics.get(accessor).add(semantic);}
  for(const mesh of doc.meshes||[])for(const primitive of mesh.primitives){
    for(const [semantic,index] of Object.entries(primitive.attributes))note(index,semantic);
    if(primitive.indices!==undefined)indices.add(primitive.indices);
    for(const target of primitive.targets||[])for(const [semantic,index] of Object.entries(target))note(index,'MORPH_'+semantic);
  }
  for(const animation of doc.animations||[])for(const sampler of animation.samplers){animated.add(sampler.input);animated.add(sampler.output);}
  return {semantics,indices,animated};
}
export function compress(bytes,{color8=false}={}){
  const input=parseGLB(bytes),doc=structuredClone(input.doc),{semantics,indices,animated}=usage(doc),views=[],chunks=[];let binaryLength=0,quantizedNormals=false;
  const report={schemaVersion:1,method:`NORMAL SNORM16 and in-range TEXCOORD UNORM16${color8?', COLOR_0 UNORM8':''}; exact POSITION, indices semantics, topology, animation and embedded ORM`,before:{bytes:bytes.length,sha256:hash(bytes)},attributes:[],images:[],positionChanged:false,colorChanged:color8,topologyChanged:false,animationChanged:false};
  function append(payload,target,stride){
    const padding=align(binaryLength)-binaryLength;if(padding){chunks.push(Buffer.alloc(padding));binaryLength+=padding;}
    const index=views.length;views.push({buffer:0,byteOffset:binaryLength,byteLength:payload.length,...(target?{target}:{}),...(stride?{byteStride:stride}:{})});chunks.push(payload);binaryLength+=payload.length;return index;
  }
  for(let index=0;index<doc.accessors.length;index++){
    const original=input.doc.accessors[index],a=doc.accessors[index];assert(!a.sparse&&a.bufferView!==undefined,'explicit non-sparse authored accessor');
    const oldView=input.doc.bufferViews[a.bufferView],oldSize=elementBytes(a),oldStride=oldView.byteStride||oldSize,roles=[...(semantics.get(index)||[])],arity=ARITY[a.type];
    let component=a.componentType,normalized=!!a.normalized,convert=null,skipReason=null,maxError=0,min=null,max=null;
    if(!animated.has(index)&&roles.length===1&&roles[0]==='NORMAL'&&a.componentType===5126){
      assert.equal(a.type,'VEC3');component=5122;normalized=true;convert=value=>Math.round(Math.max(-1,Math.min(1,value))*32767);quantizedNormals=true;
    }else if(!animated.has(index)&&roles.length===1&&/^TEXCOORD_\d+$/.test(roles[0])&&a.componentType===5126){
      assert.equal(a.type,'VEC2');let inRange=true;
      for(let vertex=0;vertex<a.count;vertex++)for(let axis=0;axis<2;axis++){const value=scalar(input,index,vertex,axis);assert(Number.isFinite(value));if(value<0||value>1)inRange=false;}
      if(inRange){component=5123;normalized=true;convert=value=>Math.round(value*65535);}else skipReason='UV is outside [0,1]; float32 preserved';
    }else if(color8&&!animated.has(index)&&roles.length===1&&roles[0]==='COLOR_0'&&a.componentType===5123&&a.normalized){
      assert.equal(a.type,'VEC4');component=5121;normalized=true;convert=value=>Math.round(value*255);
    }else if(indices.has(index)&&a.componentType===5125){
      let maximum=0;for(let vertex=0;vertex<a.count;vertex++)maximum=Math.max(maximum,scalar(input,index,vertex,0,{raw:true}));
      if(maximum<65536){component=5123;normalized=false;convert=value=>value;}
    }
    const newSize=convert?COMPONENT_BYTES[component]*arity:oldSize;
    // glTF vertex attributes must start each element on a four-byte boundary;
    // a SNORM16 VEC3 uses eight-byte stride, not an invalid tightly packed six.
    const stride=roles.length?align(newSize):newSize,payload=Buffer.alloc(stride*a.count);
    if(convert){
      min=Array(arity).fill(Infinity);max=Array(arity).fill(-Infinity);
      for(let vertex=0;vertex<a.count;vertex++)for(let axis=0;axis<arity;axis++){
        const value=scalar(input,index,vertex,axis);assert(Number.isFinite(value));if(roles[0]==='NORMAL')assert(value>=-1.000001&&value<=1.000001,'valid source normal');
        const stored=convert(value),offset=vertex*stride+axis*COMPONENT_BYTES[component];
        if(component===5122)payload.writeInt16LE(stored,offset);else if(component===5121)payload.writeUInt8(stored,offset);else payload.writeUInt16LE(stored,offset);
        const decoded=normalized?component===5122?Math.max(-1,stored/32767):stored/(component===5121?255:65535):stored;
        maxError=Math.max(maxError,Math.abs(decoded-value));min[axis]=Math.min(min[axis],stored);max[axis]=Math.max(max[axis],stored);
      }
      a.componentType=component;if(normalized)a.normalized=true;else delete a.normalized;
      if(a.min)a.min=min;if(a.max)a.max=max;
    }else{
      const start=(oldView.byteOffset||0)+(original.byteOffset||0);
      for(let vertex=0;vertex<a.count;vertex++)input.bin.copy(payload,vertex*stride,start+vertex*oldStride,start+vertex*oldStride+oldSize);
    }
    a.bufferView=append(payload,roles.length?34962:indices.has(index)?34963:oldView.target,stride!==newSize?stride:undefined);delete a.byteOffset;
    report.attributes.push({index,semantic:roles.join('+')|| (indices.has(index)?'INDICES':animated.has(index)?'ANIMATION':'OTHER'),type:a.type,count:a.count,beforeComponent:original.componentType,afterComponent:component,normalized,converted:!!convert,maxAbsoluteError:maxError,beforeBytes:oldStride*a.count,afterBytes:payload.length,...(skipReason?{skipReason}:{})});
  }
  const imageViews=new Map();
  for(let index=0;index<doc.images.length;index++){
    const image=doc.images[index],old=input.doc.bufferViews[image.bufferView],payload=input.bin.subarray(old.byteOffset||0,(old.byteOffset||0)+old.byteLength);
    if(!imageViews.has(image.bufferView))imageViews.set(image.bufferView,append(payload));image.bufferView=imageViews.get(image.bufferView);
    report.images.push({index,bytes:payload.length,sha256:hash(payload),unchanged:true});
  }
  doc.bufferViews=views;doc.buffers=[{byteLength:binaryLength}];
  if(quantizedNormals)for(const key of ['extensionsUsed','extensionsRequired'])doc[key]=[...new Set([...(doc[key]||[]),'KHR_mesh_quantization'])].sort();
  const result=encodeGLB(doc,Buffer.concat(chunks)),output=parseGLB(result);
  // Re-read actual output, independently of quantization's own running errors.
  for(const row of report.attributes){
    const a=input.doc.accessors[row.index];if(a.type.startsWith('MAT'))continue;
    let actual=0;for(let vertex=0;vertex<a.count;vertex++)for(let axis=0;axis<ARITY[a.type];axis++)actual=Math.max(actual,Math.abs(scalar(input,row.index,vertex,axis)-scalar(output,row.index,vertex,axis)));
    row.verifiedMaxAbsoluteError=actual;
    const limit=row.semantic==='NORMAL'?1/32767:/^TEXCOORD_/.test(row.semantic)?1/65535:color8&&row.semantic==='COLOR_0'?1/510:0;assert(actual<=limit+1e-15,`${row.semantic}: ${actual} exceeds ${limit}`);
    if(!row.converted)assert.equal(actual,0,'unconverted values remain exact');
  }
  for(const row of report.images){const image=output.doc.images[row.index],view=output.doc.bufferViews[image.bufferView];assert.equal(hash(output.bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength)),row.sha256,'embedded ORM bytes unchanged');}
  assert.deepEqual(output.doc.nodes,input.doc.nodes,'all roots, transforms, pivots and extras unchanged');assert.deepEqual(output.doc.animations,input.doc.animations,'all clip routing unchanged');assert.deepEqual(output.doc.meshes,input.doc.meshes,'all primitive attribute references and index topology unchanged');
  assert.deepEqual(measure(output.doc),measure(input.doc),'exact bounds and triangle counts');
  report.after={bytes:result.length,sha256:hash(result)};report.savedBytes=bytes.length-result.length;report.savedFraction=report.savedBytes/bytes.length;
  report.maxNormalError=Math.max(0,...report.attributes.filter(row=>row.semantic==='NORMAL').map(row=>row.verifiedMaxAbsoluteError));report.maxUVError=Math.max(0,...report.attributes.filter(row=>/^TEXCOORD_/.test(row.semantic)).map(row=>row.verifiedMaxAbsoluteError));
  report.maxColorError=Math.max(0,...report.attributes.filter(row=>row.semantic==='COLOR_0').map(row=>row.verifiedMaxAbsoluteError));
  return {bytes:result,report};
}
export function main(args=process.argv.slice(2)){
  const option=name=>args.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
  if(args.includes('--apply')){
    const region=option('map');assert(MAPS.includes(region),'--apply requires one frozen --map');
    const names=[...ASSETS,...(region==='harbor'?['harbor_lighthouse']:region==='alpine'?['alpine_windmill']:[])],results=[];
    const tool={path:'art/blender-city/compress_storage.mjs',sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url)))};
    for(const asset of names){
      const folder=`art/blender-city/models/${region}/${asset}`,source=folder+'/model.glb',recordFile=folder+'/model.json',before=fs.readFileSync(local(source)),record=JSON.parse(fs.readFileSync(local(recordFile)));
      assert.equal(record.sha256,hash(before),`${region}/${asset}: frozen source receipt`);
      const color8=args.includes('--color8')&&!(region==='compact'&&asset==='villa_2'),configuration=`normal16_uv16_color${color8?8:16}`;
      if(record.storageCompression?.configuration===configuration&&record.storageCompression?.afterSha256===hash(before)){console.log(`STORAGE_ALREADY_CURRENT ${region}/${asset}`);continue;}
      const backup=`work/storage-originals/${region}/${asset}/${hash(before).slice(0,16)}`;fs.mkdirSync(path.dirname(local(backup)),{recursive:true});
      if(!fs.existsSync(local(backup+'.glb')))fs.writeFileSync(local(backup+'.glb'),before);
      if(!fs.existsSync(local(backup+'.json')))fs.copyFileSync(local(recordFile),local(backup+'.json'));
      const {bytes,report}=compress(before,{color8});report.source=source;report.output=source;report.tool=tool;report.configuration=configuration;report.editableSource=folder+'/source.blend';
      report.originalEditableSourceUnchanged=true;report.previewPolicy='Old PNG receipt must be regenerated from the new exported bytes before publication.';
      const reportPath=`art/blender-city/reports/storage-compression/${region}/${asset}-${report.after.sha256.slice(0,16)}.json`,reportBytes=Buffer.from(JSON.stringify(report,null,2)+'\n');
      fs.mkdirSync(path.dirname(local(reportPath)),{recursive:true});fs.writeFileSync(local(reportPath),reportBytes);
      const updated={...record,sha256:report.after.sha256,bytes:report.after.bytes,storageCompression:{configuration,afterSha256:report.after.sha256,originalSha256:report.before.sha256,originalBytes:report.before.bytes,report:{path:reportPath,sha256:hash(reportBytes)},maxNormalError:report.maxNormalError,maxUVError:report.maxUVError,maxColorError:report.maxColorError}};
      // A concurrent author must never be silently overwritten by this pass.
      assert.equal(hash(fs.readFileSync(local(source))),report.before.sha256,`${region}/${asset}: author changed source while compressing`);
      fs.writeFileSync(local(source+'.pending'),bytes);fs.renameSync(local(source+'.pending'),local(source));fs.writeFileSync(local(recordFile+'.pending'),JSON.stringify(updated,null,2)+'\n');fs.renameSync(local(recordFile+'.pending'),local(recordFile));
      results.push({asset,before:report.before.bytes,after:report.after.bytes,configuration});console.log(`STORAGE_COMPRESSED ${region}/${asset} ${report.before.bytes} -> ${report.after.bytes} ${configuration}`);
    }
    console.log(JSON.stringify({region,changed:results.length,beforeBytes:results.reduce((sum,row)=>sum+row.before,0),afterBytes:results.reduce((sum,row)=>sum+row.after,0),requiresRerender:true,results}));return;
  }
  const source=option('input'),target=option('output');assert(source&&target,'--input and --output required');
  assert(target.startsWith('art/blender-city/storage-study/'),'experiment outputs must stay in storage-study; production mutation is not enabled');assert.notEqual(local(source),local(target));
  const {bytes,report}=compress(fs.readFileSync(local(source)),{color8:args.includes('--color8')});report.source=source;report.output=target;report.tool={path:'art/blender-city/compress_storage.mjs',sha256:hash(fs.readFileSync(fileURLToPath(import.meta.url)))};
  fs.mkdirSync(path.dirname(local(target)),{recursive:true});fs.writeFileSync(local(target),bytes);fs.writeFileSync(local(target.replace(/\.glb$/,'-compression.json')),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({source,target,beforeBytes:report.before.bytes,afterBytes:report.after.bytes,savedFraction:report.savedFraction,maxNormalError:report.maxNormalError,maxUVError:report.maxUVError,maxColorError:report.maxColorError,sourceUnchanged:hash(fs.readFileSync(local(source)))===report.before.sha256},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();

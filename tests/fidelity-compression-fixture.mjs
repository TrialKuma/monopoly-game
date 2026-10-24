// Storage-only windmill compression: verify bytes, not just report booleans.
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';

const same=(a,b,label)=>{assert(a&&b,label);assert.equal(a.sha256,b.sha256,label);if(a.bytes!==undefined&&b.bytes!==undefined)assert.equal(a.bytes,b.bytes,label);};
const bytesAt=(asset,index)=>{const v=asset.doc.bufferViews[index];assert(v&&v.buffer===0);const start=v.byteOffset||0;assert(start>=0&&start+v.byteLength<=asset.bin.length);return asset.bin.subarray(start,start+v.byteLength);};
const imageAt=(asset,index)=>{const image=asset.doc.images[index];assert(image&&!image.uri);return bytesAt(asset,image.bufferView);};

function jpegSize(bytes){
  assert.equal(bytes.readUInt16BE(0),0xffd8,'actual JPEG SOI');
  let offset=2;
  while(offset+4<=bytes.length){
    assert.equal(bytes[offset++],0xff,'JPEG segment marker');
    while(bytes[offset]===0xff)offset++;
    const marker=bytes[offset++];
    if(marker===0xda||marker===0xd9)break;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    const length=bytes.readUInt16BE(offset);assert(length>=2&&offset+length<=bytes.length);
    if([0xc0,0xc1,0xc2].includes(marker)){
      assert.equal(bytes[offset+2],8,'eight-bit JPEG color');
      const height=bytes.readUInt16BE(offset+3),width=bytes.readUInt16BE(offset+5),components=bytes[offset+7];
      assert.equal(components,3,'RGB/YCC JPEG, no unexpected alpha or grayscale');
      assert.equal(length,8+3*components);
      return {size:[width,height],sampling:Array.from({length:components},(_,i)=>bytes[offset+9+i*3])};
    }
    offset+=length;
  }
  assert.fail('JPEG has no supported image header');
}

function pngRGB(bytes){
  assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'actual PNG signature');
  let offset=8,width,height,ended=false;const idat=[];
  while(offset+12<=bytes.length){
    const length=bytes.readUInt32BE(offset),kind=bytes.toString('ascii',offset+4,offset+8);assert(offset+12+length<=bytes.length);
    const data=bytes.subarray(offset+8,offset+8+length);
    if(kind==='IHDR'){
      assert.equal(offset,8);assert.equal(length,13);width=data.readUInt32BE(0);height=data.readUInt32BE(4);
      assert.deepEqual([...data.subarray(8)],[8,2,0,0,0],'eight-bit noninterlaced true-color PNG; no palette quantization');
      assert(width>0&&height>0&&width*height<=2048*2048);
    }else if(kind==='IDAT')idat.push(data);
    else if(kind==='IEND'){assert.equal(length,0);ended=true;break;}
    offset+=length+12;
  }
  assert(ended&&idat.length&&width&&height);
  const stride=width*3,encoded=inflateSync(Buffer.concat(idat),{maxOutputLength:(stride+1)*height});
  assert.equal(encoded.length,(stride+1)*height);const pixels=Buffer.alloc(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){
    const filter=encoded[y*(stride+1)];assert(filter<=4,'valid PNG row filter');
    for(let x=0;x<stride;x++){
      const index=y*stride+x,a=x>=3?pixels[index-3]:0,b=y?pixels[index-stride]:0,c=y&&x>=3?pixels[index-stride-3]:0;
      const predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);
      pixels[index]=(encoded[y*(stride+1)+1+x]+predictor)&255;
    }
  }
  return {size:[width,height],pixels};
}

export function verifyTextureCompression(processing,context={},api){
  const {receipt,glb,verifySourceTransfer}=api,r=processing.textureCompression;
  assert(r&&processing.region==='alpine'&&processing.asset==='windmill','bounded reviewed windmill compression');
  const finalReceipt=context.candidateReceipt||processing.processedCandidate;
  same(finalReceipt,processing.processedCandidate,'exact final compressed candidate');
  const frozen=JSON.parse(receipt(processing.promotedFrom));
  assert.deepEqual(frozen.textureCompression,r,'compression contract is frozen with its reviewed candidate');
  same(frozen.processedCandidate,processing.processedCandidate,'frozen compressed output');
  same(frozen.textureCompressionTool,processing.textureCompressionTool,'frozen compression tool');
  receipt(processing.textureCompressionTool);receipt(processing.processingTool);
  same(processing.priorCompressionReport,r.sourceProcessingReport,'exact preceding report');
  const prior=JSON.parse(receipt(r.sourceProcessingReport));
  same(prior.processedCandidate,r.sourceCandidate,'compression starts with the exact inspected texture refresh');
  assert(!prior.textureCompression,'no cyclic compression chain');
  for(const key of ['region','asset','triangles','source','inferenceReport','reference','componentSeparation','componentLocalRepair','derivedFromStaticCandidate'])assert.deepEqual(processing[key],prior[key],`compression retains ${key}`);
  for(const key of ['driver','autoplayClip','node','lifePart','clip','durationSeconds','clipReceipt'])assert.deepEqual(processing.animation?.[key],prior.animation?.[key],`compression retains animation ${key}`);
  verifySourceTransfer(prior,{candidateReceipt:r.sourceCandidate});
  const beforeBytes=receipt(r.sourceCandidate),afterBytes=receipt(finalReceipt),before=glb(beforeBytes),after=glb(afterBytes);
  assert.equal(beforeBytes.length,r.originalBytes);assert.equal(afterBytes.length,r.outputBytes);
  assert.equal(r.hardBudgetBytes,4*1024*1024);assert.equal(r.runtimeMetadataReserveBytes,8192);
  assert(afterBytes.length<r.hardBudgetBytes-r.runtimeMetadataReserveBytes,'existing 4 MiB budget plus runtime metadata reserve');
  assert(afterBytes.length<beforeBytes.length);
  assert.equal(r.newInferenceCalls,0);assert.equal(r.geometryUVNormalsAndAnimationAccessorBytesUnchanged,true);assert.equal(r.nodesMeshesSceneAndAnimationJSONUnchanged,true);

  const expected=structuredClone(before.doc);
  assert.equal(expected.materials.length,1);assert.equal(expected.images.length,3);assert.equal(expected.textures.length,3);
  assert.equal(expected.buffers.length,1);assert(!expected.buffers[0].uri);
  const material=expected.materials[0],pbr=material.pbrMetallicRoughness;
  assert(!material.normalTexture,'removed legacy normal was already unbound');
  assert.equal(pbr.baseColorTexture.index,1);assert.equal(pbr.metallicRoughnessTexture.index,2);
  const bindings=[];const visit=value=>{if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(key.endsWith('Texture')&&child&&typeof child.index==='number')bindings.push(child.index);visit(child);}};
  visit(material);assert(bindings.every(index=>index!==0),'removed texture has no material use');
  assert.deepEqual(expected.textures.map(texture=>texture.source),[0,1,2]);
  const imageViews=expected.images.map(image=>image.bufferView),removed=imageViews[0];
  assert.equal(new Set(imageViews).size,3);assert(!expected.accessors.some(a=>a.bufferView===removed),'discarded image is not a geometry or motion buffer');
  assert.equal(bytesAt(before,removed).length,r.removedUnreferencedLegacyNormalImageBytes);
  const map=new Map();expected.bufferViews.forEach((view,index)=>{if(index!==removed)map.set(index,map.size);});
  assert.equal(after.doc.bufferViews.length,expected.bufferViews.length-1);
  expected.bufferViews=expected.bufferViews.flatMap((view,index)=>{
    if(index===removed)return [];
    const actual=after.doc.bufferViews[map.get(index)];assert(actual&&actual.byteOffset%4===0);
    const row={...view,byteOffset:actual.byteOffset,byteLength:actual.byteLength};
    if(!imageViews.slice(1).includes(index)){
      assert.equal(actual.byteLength,view.byteLength);assert(bytesAt(before,index).equals(bytesAt(after,map.get(index))),'every nonimage buffer byte is retained, including all geometry/UV/normals/animation');
    }
    return [row];
  });
  assert.equal(after.doc.accessors.length,expected.accessors.length);assert.equal(r.preservedAccessors.length,expected.accessors.length);
  expected.accessors.forEach((a,index)=>{assert(map.has(a.bufferView));a.bufferView=map.get(a.bufferView);assert.deepEqual(r.preservedAccessors[index],{accessor:index,bufferBytesUnchanged:true});});
  expected.images=expected.images.slice(1).map(image=>({...image,bufferView:map.get(image.bufferView)}));
  expected.textures=expected.textures.slice(1).map(texture=>({...texture,source:texture.source-1}));
  pbr.baseColorTexture.index=0;pbr.metallicRoughnessTexture.index=1;
  assert.equal(after.doc.buffers.length,1);assert(after.doc.buffers[0].byteLength<=after.bin.length&&after.bin.length-after.doc.buffers[0].byteLength<4);
  expected.buffers=[{byteLength:after.doc.buffers[0].byteLength}];
  assert.deepEqual(after.doc,expected,'only the unused image/texture/view removal, exact index remapping and encoded image storage may change');

  const baseBefore=imageAt(before,1),baseAfter=imageAt(after,0),ormBefore=imageAt(before,2),ormAfter=imageAt(after,1);
  assert.equal(after.doc.images[0].mimeType,'image/jpeg');assert.equal(after.doc.images[1].mimeType,'image/png');
  assert.deepEqual(jpegSize(baseBefore).size,[2048,2048]);const jpeg=jpegSize(baseAfter);assert.deepEqual(jpeg.size,[2048,2048]);assert.deepEqual(jpeg.sampling,[0x11,0x11,0x11],'actual 4:4:4 JPEG chroma');
  assert.deepEqual(r.baseColor.size,jpeg.size);assert.equal(r.baseColor.beforeBytes,baseBefore.length);assert.equal(r.baseColor.afterBytes,baseAfter.length);
  assert.equal(r.baseColor.encoding,'JPEG quality 92, 4:4:4 chroma, optimized entropy');
  assert(r.baseColor.pixelPSNRdB>38&&Number.isFinite(r.baseColor.pixelPSNRdB));assert(r.baseColor.meanAbsolute8BitError<2);
  const oldPNG=pngRGB(ormBefore),newPNG=pngRGB(ormAfter);assert.deepEqual(oldPNG.size,[1024,1024]);assert.deepEqual(newPNG.size,oldPNG.size);assert.deepEqual(r.orm.size,newPNG.size);
  assert.equal(r.orm.beforeBytes,ormBefore.length);assert.equal(r.orm.afterBytes,ormAfter.length);
  assert.equal(r.orm.encoding,'Lossless true-color PNG after bounded six-bit roughness/metallic quantization; R unchanged');
  const max=[0,0,0],sum=[0,0,0];
  for(let i=0;i<oldPNG.pixels.length;i++){
    const channel=i%3,a=oldPNG.pixels[i],b=newPNG.pixels[i],desired=channel===0?a:Math.round(Math.round(a/255*63)/63*255);
    assert.equal(b,desired,'actual ORM pixels follow the exact bounded scalar quantizer, retaining R');
    const delta=Math.abs(b-a);max[channel]=Math.max(max[channel],delta);sum[channel]+=delta;
  }
  assert.deepEqual(max,[0,2,2]);assert.deepEqual(r.orm.maximum8BitChannelError,max);
  sum.forEach((value,index)=>assert(Math.abs(value/(1024*1024)-r.orm.meanAbsolute8BitChannelError[index])<1e-6,'actual ORM error matches the frozen report'));
  return {sourceBytes:beforeBytes.length,compressedBytes:afterBytes.length,geometryAndMotionExact:true,ormMaximumError:max};
}

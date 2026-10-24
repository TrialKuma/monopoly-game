import { GLTFLoader } from '../../../../assets/vendor/three/addons/loaders/GLTFLoader.js';
const EXT='EXT_meshopt_compression';
const initStart=performance.now();
const {MeshoptDecoder}=await import('./vendor/meshopt_decoder.module.js');
await MeshoptDecoder.ready;
const decoderImportAndReadyMs=performance.now()-initStart;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
const rawArray=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength);
const parseGlb=buffer=>{const v=new DataView(buffer),size=v.getUint32(12,true);return{doc:JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,size))),bin:new Uint8Array(buffer,28+size)}};
const stats=times=>{const a=[...times].sort((a,b)=>a-b);return{medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],maxMs:a.at(-1),samples:a.length}};
async function fingerprint(gltf){
 const nodes=[];gltf.scene.traverse(n=>nodes.push(n));const rows=[];
 for(const n of nodes){
  const row={name:n.name,position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray()};
  if(n.geometry){
   row.attributes={};for(const [name,a]of Object.entries(n.geometry.attributes))row.attributes[name]={type:a.array.constructor.name,itemSize:a.itemSize,count:a.count,normalized:a.normalized,sha256:await digest(rawArray(a.array))};
   if(n.geometry.index)row.indices=await digest(rawArray(n.geometry.index.array));
   row.groups=n.geometry.groups;
   row.materials=[];
   for(const m of Array.isArray(n.material)?n.material:[n.material]){
    const mr={name:m.name,color:m.color?.toArray(),roughness:m.roughness,metalness:m.metalness,side:m.side,alphaTest:m.alphaTest,normalScale:m.normalScale?.toArray(),textures:{}};
    for(const key of ['map','normalMap','metalnessMap','roughnessMap','aoMap','emissiveMap'])if(m[key]){
     const t=m[key],im=t.source.data,c=new OffscreenCanvas(im.width,im.height),ctx=c.getContext('2d');ctx.drawImage(im,0,0);
     mr.textures[key]={width:im.width,height:im.height,colorSpace:t.colorSpace,wrapS:t.wrapS,wrapT:t.wrapT,magFilter:t.magFilter,minFilter:t.minFilter,flipY:t.flipY,sha256:await digest(ctx.getImageData(0,0,im.width,im.height).data)};
    }
    row.materials.push(mr);
   }
  }rows.push(row);
 }
 return{nodes:rows,animations:gltf.animations.map(a=>({name:a.name,duration:a.duration,tracks:a.tracks.map(t=>({name:t.name,times:Array.from(t.times),values:Array.from(t.values)}))}))};
}
function dispose(gltf){const textures=new Set(),mats=new Set();gltf.scene.traverse(n=>{n.geometry?.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])if(m){mats.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v)}});textures.forEach(t=>{t.source.data.close?.();t.dispose()});mats.forEach(m=>m.dispose())}
window.runExperiment=async()=>{
 const comparison=await(await fetch('./comparison.json')).json(),rows=[];
 for(const item of comparison.results){
  const safe=item.asset.replace('/','--');
  const [original,compressed]=await Promise.all(['original','meshopt'].map(async variant=>(await fetch(`./${safe}.${variant}.glb`)).arrayBuffer()));
  const {doc,bin}=parseGlb(compressed),views=doc.bufferViews.map(v=>v.extensions?.[EXT]).filter(Boolean);
  function decodeAll(){for(const e of views){const target=new Uint8Array(e.count*e.byteStride);MeshoptDecoder.decodeGltfBuffer(target,e.count,e.byteStride,bin.subarray(e.byteOffset,e.byteOffset+e.byteLength),e.mode,e.filter)}}
  for(let i=0;i<8;i++)decodeAll();const decodeTimes=[];for(let i=0;i<60;i++){const s=performance.now();decodeAll();decodeTimes.push(performance.now()-s)}
  let originalFingerprint,compressedFingerprint;const parseTimes={original:[],meshopt:[]};
  for(let i=0;i<3;i++)for(const[variant,bytes]of[['original',original],['meshopt',compressed]]){
   const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),s=performance.now(),gltf=await loader.parseAsync(bytes,'');parseTimes[variant].push(performance.now()-s);
   if(i===0){const fp=await fingerprint(gltf);if(variant==='original')originalFingerprint=fp;else compressedFingerprint=fp}dispose(gltf);
  }
  if(JSON.stringify(originalFingerprint)!==JSON.stringify(compressedFingerprint))throw Error(item.asset+' Three loader arrays/materials/image pixels mismatch');
  rows.push({asset:item.asset,decodeWithAllocation:stats(decodeTimes),parseIncludingTextureDecode:{original:stats(parseTimes.original),meshopt:stats(parseTimes.meshopt)},threeGeometryTransformsMaterialsTexturePixelsExact:true,decodedGeometryBytes:views.reduce((n,e)=>n+e.count*e.byteStride,0)});
 }
 const result={decoderImportAndReadyMs,decoderSupported:MeshoptDecoder.supported,userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,noRendererCreated:true,rows};document.getElementById('result').textContent=JSON.stringify(result,null,2);return result;
};

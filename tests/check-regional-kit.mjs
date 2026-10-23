import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Matrix4,Vector3,Quaternion,Box3} from '../assets/vendor/three/three.module.min.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const maps=['classic','compact','expansion','harbor','alpine'];
const families=['villa','shop','hotel','tower','skyscraper','finance','onsen'];
const publicNames=['civic_hall','vault_bank','builders_guild','card_pavilion','chance_wheel','teleport_gate','rush_station','junction_hub'];
const requested=process.argv.find(a=>a.startsWith('--map='))?.slice(6);
const suffix=process.argv.find(a=>a.startsWith('--suffix='))?.slice(9)||'';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const approvedHouses=JSON.parse(fs.readFileSync(path.join(root,'art/regions/approved-ai-houses.json'))).houses;

function readGLB(filename){
  const bytes=fs.readFileSync(filename);
  assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length));
  return {bytes,json,binary:bytes.subarray(28+length)};
}
function embeddedImages(asset){
  return (asset.json.images||[]).map(image=>{
    assert.equal(typeof image.bufferView,'number','game assets embed their textures');
    const view=asset.json.bufferViews[image.bufferView],start=view.byteOffset||0;
    return hash(asset.binary.subarray(start,start+view.byteLength));
  });
}
function transform(node){
  if(node.matrix)return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(new Vector3().fromArray(node.translation||[0,0,0]),new Quaternion().fromArray(node.rotation||[0,0,0,1]),new Vector3().fromArray(node.scale||[1,1,1]));
}
function measure(asset,index){
  const box=new Box3(),parts=[],primitives=[];let triangles=0;
  function visit(i,parent){
    const node=asset.json.nodes[i],world=parent.clone().multiply(transform(node));
    if(node.extras?.lifePart)parts.push(node.extras.lifePart);
    if(node.mesh!==undefined)for(const p of asset.json.meshes[node.mesh].primitives){
      assert.equal(p.mode??4,4,'triangle primitive');
      const positions=asset.json.accessors[p.attributes.POSITION];
      assert(positions.min?.every(Number.isFinite)&&positions.max?.every(Number.isFinite));
      assert(positions.min.every((v,i)=>v<=positions.max[i]));
      const local=new Box3(new Vector3().fromArray(positions.min),new Vector3().fromArray(positions.max));
      box.union(local.applyMatrix4(world));
      triangles+=(p.indices===undefined?positions:asset.json.accessors[p.indices]).count/3;
      primitives.push(p);
    }
    for(const child of node.children||[])visit(child,world);
  }
  visit(index,new Matrix4());return {box,size:box.getSize(new Vector3()),triangles,parts,primitives};
}

let count=0;
for(const map of requested?[requested]:maps){
  assert(maps.includes(map));
  const asset=readGLB(path.join(root,`assets/models/regions/${map}${suffix}.glb`));
  const expected=[...families.flatMap(f=>[1,2,3].map(l=>`${map}_${f}_${l}`)),...publicNames.map(n=>`${map}_${n}`)];
  const top=asset.json.scenes[asset.json.scene||0].nodes.map(i=>asset.json.nodes[i]);
  assert.deepEqual(top.map(n=>n.name).sort(),expected.sort(),`${map}: exact 29 gameplay roots`);
  const heights=new Map();
  for(const name of expected){
    const i=asset.json.nodes.findIndex(n=>n.name===name),node=asset.json.nodes[i],m=measure(asset,i);
    assert(transform(node).equals(new Matrix4()),`${name}: root stays at ground-centre identity`);
    assert(Math.abs(m.box.min.y)<.002,`${name}: bottom sits on the tile, no vertical drift`);
    assert(Math.abs(m.box.min.x+m.box.max.x)<.14,`${name}: no preview staging or large horizontal drift`);
    const family=node.extras.family,large=['skyscraper','finance','onsen'].includes(family),isPublic=publicNames.includes(family);
    const [width,depth,height]=large?[2.7,1.15,2.6]:isPublic?[1.12,1.12,1.5]:[1.05,1.05,1.85];
    assert(m.size.x<=width+.002&&m.size.z<=depth+.002&&m.size.y<=height+.002,`${name}: actual GLB playable bounds`);
    const ai=node.extras.sourceType==='reviewed_pixal_multiview';
    if(family==='villa'&&node.extras.level===2&&!suffix.includes('manual')&&approvedHouses[map]?.status==='ready_for_runtime'){
      assert(ai,`${name}: an approved AI house must not regress to an intermediate authored export`);
    }
    assert(m.triangles>1000&&m.triangles<=(ai?250000:large?35000:23000),`${name}: explicit triangle budget`);
    if(ai){
      assert.equal(family,'villa');assert.equal(node.extras.level,2);
      assert(node.extras.budgetException?.length>20);
      const source=readGLB(path.join(root,node.extras.sourceFile));
      const approval=approvedHouses[map];
      assert.equal(approval?.status,'ready_for_runtime','AI source passed visual review before inclusion');
      assert.equal(approval.sha256,node.extras.sourceSha256,'runtime mesh is the exact approved revision');
      assert.equal(hash(source.bytes),node.extras.sourceSha256,'source receipt identifies the exact reviewed AI model');
      const images=embeddedImages(asset);
      assert(embeddedImages(source).every(image=>images.includes(image)),'original embedded image bytes survive import/export');
      assert(m.primitives.every(p=>p.attributes.TEXCOORD_0!==undefined),'every AI primitive retains UV coordinates');
      assert(m.primitives.some(p=>asset.json.materials[p.material].pbrMetallicRoughness?.baseColorTexture),'AI texture remains bound to its mesh');
    }
    if(family==='chance_wheel')assert(m.parts.includes('wheel'),'rotating wheel survives as an independent node');
    if(family==='builders_guild')assert(m.parts.includes('pendulum'),'crane load survives as an independent node');
    if(!isPublic)heights.set(`${family}_${node.extras.level}`,m.size.y);
    count++;
  }
  for(const family of families)assert(heights.get(`${family}_1`)<heights.get(`${family}_2`)&&heights.get(`${family}_2`)<heights.get(`${family}_3`),`${map}/${family}: levels add visible height`);
  console.log(`PASS ${map}${suffix}: 29 GLB roots, bounds, grounding, levels, materials and animation parts`);
}
console.log(`Verified ${count} actual exported assets. Visual approval remains separate.`);

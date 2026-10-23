import assert from 'node:assert/strict';
import {THREE,requestedMap,runMapWorkers,regionalFixture} from './regional-scene-fixture.mjs';
const mapId=requestedMap();
if(!mapId){
 const results=runMapWorkers(import.meta.url),totals={maps:results.length,ownedParcels:0,largeParcels:0,specialFrames:0,rayChecks:0,regionalRoutes:0,failures:0};
 for(const row of results)for(const key of ['ownedParcels','largeParcels','specialFrames','rayChecks','regionalRoutes'])totals[key]+=row[key];
 console.log(JSON.stringify(totals));process.exit(0);
}
const fixture=await regionalFixture(mapId),{context,run}=fixture;
let ownedParcels=0,largeParcels=0,rayChecks=0,specialFrames=0,regionalRoutes=0;
try{
 const views=fixture.build({level:1,steps:false,owners:'alternating'});
 for(const view of views){
  context.view=view;assert.equal(view.ownerFrame.visible,true);
  if(!view.tile.lot){
   specialFrames++;assert.equal(view.group.getObjectsByProperty('name','special_tile_frame').length,1);assert.equal(view.flag.visible,false,'public sites have no player owner');
   const color=view.ownerMaterial.color.getHexString();assert(!['348d87','d77b59','c5b696'].includes(color));run('effect({type:"select",tiles:[view.tile.index]})');assert.equal(view.ownerMaterial.color.getHexString(),color);assert(view.label.dataset.special);continue;
  }
  assert.equal(view.group.getObjectsByProperty('name','ownership_frame').length,1);ownedParcels++;if(view.tile.lot.isLarge)largeParcels++;
  const frame=view.ownerFrame,outline=view.outline;assert.notEqual(frame.material,outline.material);assert.equal(frame.material.emissive.getHex(),0);
  frame.geometry.computeBoundingBox();const b=frame.geometry.boundingBox;assert(Math.abs(b.min.x+(view.w-.055)/2)<1e-6&&Math.abs(b.max.z-(view.d-.055)/2)<1e-6,'one frame spans the merged parcel');
  const positions=frame.geometry.attributes.position;for(let i=0;i<positions.count;i++)assert(Math.abs(positions.getX(i))<=view.w/2&&Math.abs(positions.getZ(i))<=view.d/2,'frame stays inside the deed');
  const w=view.w-.055,d=view.d-.055,t=.070,r=.105,points=[[0,d/2-t/2],[0,-d/2+t/2],[w/2-t/2,0],[-w/2+t/2,0]];
  for(const x of [-1,1])for(const z of [-1,1])points.push([x*(w/2-r*.25-t*.375),z*(d/2-r*.25-t*.375)]);
  const ray=new THREE.Raycaster();
  for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5,.73]){
   view.group.rotation.y=rotation;run('world.updateMatrixWorld(true)');
   for(const [x,z] of points){ray.set(view.group.localToWorld(new THREE.Vector3(x,.7,z)),new THREE.Vector3(0,-1,0));assert(ray.intersectObject(frame).length>0,'closed frame survives rotation');assert.equal(ray.intersectObject(outline).length,0,'event line does not cover ownership');rayChecks++;}
   ray.set(view.group.localToWorld(new THREE.Vector3(0,.7,0)),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(frame).length,0,'merged plot seam remains open');
  }
  view.group.rotation.y=0;const deedColor=frame.material.color.getHex();run('effect({type:"select",tiles:[view.tile.index]});effect({type:"rent",tiles:[view.tile.index,view.tile.index]})');assert.equal(run('pulses.filter(p=>p.view===view).length'),1);assert.equal(frame.material.color.getHex(),deedColor);assert.equal(frame.material.emissive.getHex(),0);
  view.tile.lot.ownerId=null;run('updateLot(view,view.tile,data,true)');assert.equal(frame.visible,false);
  view.tile.lot.ownerId='ai';run('updateLot(view,view.tile,data,true)');assert.equal(frame.visible,true);assert.equal(frame.material.color.getHexString(),'d77b59');
 }
 // Every family/level and public category in this actual file must beat the
 // shared fallback. Repeat in all 5 workers, not only the previous 3 maps.
 const routes=[];
 for(const family of ['villa','shop','hotel','tower','skyscraper','finance','onsen'])for(let level=1;level<=3;level++)routes.push({legacy:`${family}_${level}`,tile:{index:999,lot:{level,theme:{key:family},...(['skyscraper','finance','onsen'].includes(family)?{landmarkKey:family}:{})}}});
 const specialTypes={vault_bank:'bank',builders_guild:'construction',card_pavilion:'card_draw',chance_wheel:'chance',teleport_gate:'teleport',rush_station:'rush',junction_hub:'junction'};
 routes.push({legacy:'civic_hall',tile:{index:999,isStart:true}});for(const [legacy,type] of Object.entries(specialTypes))routes.push({legacy,tile:{index:999,special:{type}}});
 for(const {legacy,tile} of routes){context.routingTile=tile;context.legacy=legacy;run('modelLibrary.set(legacy,new THREE.Group())');const resolved=run('resolveAsset(routingTile,data)');assert.equal(resolved.key,`${mapId}_${legacy}`);assert.equal(resolved.authored,true);assert(resolved.source);regionalRoutes++;}
 context.regionalBank=`${mapId}_vault_bank`;run('var retainedBank=modelLibrary.get(regionalBank);modelLibrary.delete(regionalBank)');assert.equal(run('resolveAsset({index:999,special:{type:"bank"}},data).key'),'vault_bank','missing regional model retains shared fallback');run('modelLibrary.set(regionalBank,retainedBank)');
 assert.equal(regionalRoutes,29);console.log(`PASS ${mapId}: ${ownedParcels} ownership frames, ${specialFrames} public frames and all 29 regional routes`);
 console.log(JSON.stringify({mapId,ownedParcels,largeParcels,specialFrames,rayChecks,regionalRoutes,failures:0}));
}finally{fixture.dispose();}
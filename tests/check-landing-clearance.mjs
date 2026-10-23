import assert from 'node:assert/strict';
import {THREE,requestedMap,runMapWorkers,regionalFixture} from './regional-scene-fixture.mjs';
const mapId=requestedMap();
if(!mapId){
 const results=runMapWorkers(import.meta.url),totals={maps:results.length,landings:0,corners:0,sharedChecks:0,clearanceChecks:0,failures:0};
 for(const row of results)for(const key of ['landings','corners','sharedChecks','clearanceChecks'])totals[key]+=row[key];
 console.log(JSON.stringify(totals));process.exit(0);
}
const fixture=await regionalFixture(mapId),{context,run,board}=fixture;
const levels=(process.argv.find(arg=>arg.startsWith('--levels='))?.slice(9)||'1,2,3').split(',').map(Number);
assert(levels.length>0&&new Set(levels).size===levels.length&&levels.every(level=>[1,2,3].includes(level)),'--levels must select unique building levels from 1,2,3');
let landings=0,corners=0,clearanceChecks=0,sharedChecks=0;
try{
 for(const level of levels){
 const views=fixture.build({level,steps:true}),steps=run('[...stepViews.entries()]'),meshes=[];
 for(const view of views)view.building.traverse(n=>{if(n.isMesh)meshes.push(n);});
 const ray=new THREE.Raycaster();
 // Bounding boxes are a broad-phase filter only; candidate surfaces still use
 // Three.js's exact triangle intersection, including roof overhangs and rails.
 const candidates=meshes.map(mesh=>({mesh,bounds:new THREE.Box3().setFromObject(mesh)}));
 function assertPawnClear(position,label){
  for(let i=0;i<9;i++){
   const angle=(i-1)*Math.PI/4,r=i===0?0:.195,x=position.x+Math.cos(angle)*r,z=position.z+Math.sin(angle)*r;
   ray.set(new THREE.Vector3(x,position.y+6,z),new THREE.Vector3(0,-1,0));ray.near=0;ray.far=5.975;
   const nearby=candidates.filter(({bounds})=>x>=bounds.min.x&&x<=bounds.max.x&&z>=bounds.min.z&&z<=bounds.max.z).map(({mesh})=>mesh);
   const hit=ray.intersectObjects(nearby,false)[0];
   // Never attach a whole Mesh/typed-array tree to an assertion failure: a
   // genuine clearance regression must report one point, not exhaust the heap.
   assert.equal(Boolean(hit),false,`${label} must clear actual regional roof/wall geometry${hit?`; hit ${hit.object.name||hit.object.type} at ${hit.point.toArray().map(v=>v.toFixed(3)).join(',')}`:''}`);clearanceChecks++;
  }
 }
 for(const [index,step] of steps){
  landings++;if(step.corner)corners++;assert.equal(step.landing.name,'landing_pad_'+index);assert(step.landing.children.length>=2);
  context.index=index;run('data.players[0].position=index;data.players[1].position=(index+3)%data.board.length');
  const position=run('pawnPosition(data.players[0])');assert.equal(position.x,step.walk.x);assert.equal(position.z,step.walk.z);assertPawnClear(position,`${mapId} level ${level} tile ${index}`);
  run('data.players[1].position=index');const players=run('data.players.map(p=>pawnPosition(p))');assert(players[0].distanceTo(players[1])>.33);sharedChecks++;players.forEach(p=>assertPawnClear(p,`${mapId} level ${level} shared ${index}`));
  const next=run('stepViews.get(snapshot.navigation.next[index]).walk');assert(step.walk.distanceTo(next)>.7,'corner markers do not collapse onto adjacent steps');
 }
 }
 assert.equal(corners,4*levels.length);assert.equal(landings,board.length*levels.length);assert.equal(sharedChecks,board.length*levels.length);
 console.log(`PASS ${mapId}: ${landings} landing pads with the selected regional GLB at levels ${levels.join(',')}`);
 console.log(JSON.stringify({mapId,levels,assetPath:fixture.assetPath,imageHeaders:fixture.imageHeaders,landings,corners,sharedChecks,clearanceChecks,failures:0}));
}finally{fixture.dispose();}

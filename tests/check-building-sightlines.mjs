import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,extname} from 'node:path';
import {THREE,requestedMap,runMapWorkers,regionalFixture} from './regional-scene-fixture.mjs';

// Default cameras must preserve the center of both head and chest. Peripheral
// samples remain a reported statistic: a grazing edge is not a hidden pawn.
// Explicit angle experiments report observations without imposing that gate;
// --strict additionally requires every sampled ray to remain unobstructed.
const arg=(name,fallback)=>process.argv.find(a=>a.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const report=resolve(arg('report','work/building-sightlines.json'));
const workRoot=resolve('work');
const reportsRoot=resolve('reports');
assert([workRoot,reportsRoot].some(root=>report.startsWith(root+'\\')||report.startsWith(root+'/')),'report path must remain under work or reports');
const levels=arg('levels','1,2,3').split(',').map(Number);
assert(levels.length&&new Set(levels).size===levels.length&&levels.every(n=>[1,2,3].includes(n)),'--levels selects unique 1,2,3');
const overrides={};for(const key of ['yaw','elevation']){const value=arg(key,null);if(value!==null){overrides[key]=Number(value);assert(Number.isFinite(overrides[key]),`--${key} must be a finite angle in radians`);}}
const enforceCenters=Object.keys(overrides).length===0;
const auditMode=enforceCenters?'default camera: head and chest centers must be clear; peripheral samples are reported':'angle experiment: observed obstruction without a visibility tolerance';
const mapId=requestedMap();
const mapReport=id=>report.slice(0,report.length-extname(report).length)+`.${id}.json`;
const counters=()=>({tiles:0,poses:0,targets:0,rays:0,blockedRays:0,blockedTargets:0,fullyBlockedTargets:0,blockedCenters:0,bothCentersBlockedPoses:0,anyBlockedPoses:0,tilesWithBlockedRays:0,tilesWithBothCentersBlocked:0});
const sourceCode=fs.readFileSync(new URL('../scene.js',import.meta.url),'utf8');
const digest=data=>createHash('sha256').update(data).digest('hex');

if(!mapId){
  const results=runMapWorkers(import.meta.url),maps=results.map(row=>JSON.parse(fs.readFileSync(row.report,'utf8')));
  const totals=counters();for(const row of results)for(const key of Object.keys(totals))totals[key]+=row.counts[key];
  const combined={mode:auditMode,centerGate:{enabled:enforceCenters,passed:totals.blockedCenters===0},viewport:{width:390,height:844},cameraOverrides:overrides,levels,sceneSha256:digest(sourceCode),counts:totals,blockedRayRatio:totals.blockedRays/totals.rays,maps};
  fs.mkdirSync(dirname(report),{recursive:true});fs.writeFileSync(report,JSON.stringify(combined,null,2)+'\n');
  console.log(`OBSERVATION all maps: ${totals.blockedRays}/${totals.rays} rays obstructed; ${totals.bothCentersBlockedPoses}/${totals.poses} pawn poses lose both centers. Details: ${report}`);
  console.log(JSON.stringify({maps:maps.length,levels,counts:totals,blockedRayRatio:combined.blockedRayRatio,report}));
  if(enforceCenters)assert.equal(totals.blockedCenters,0,'default portrait camera must keep every sampled head/chest center visible');
  if(process.argv.includes('--strict'))assert.equal(totals.blockedRays,0,'strict visibility gate');
  process.exit(0);
}

const fixture=await regionalFixture(mapId),{context,run,board}=fixture;
const geometryMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const counts=counters(),perLevel=[],findings=[],meshHits=new Map(),assetHits=new Map();
let cameraDetails,productionCamera;
// The production pawn has its head sphere at .29 with a face centered at .315,
// and a .15-high chest centered at .13. Sample their central readable regions,
// not the hat tip, so a surviving tiny hat cannot count as a visible character.
assert(sourceCode.includes('SphereGeometry(.145,20,14)')&&sourceCode.includes('cylinder(g,.145,.15,color,0,.13)'),'update sightline samples if pawn body geometry changes');
const regions=[{part:'head',height:.315,radius:.085},{part:'chest',height:.15,radius:.065}];
const samples=[[0,0],...Array.from({length:8},(_,i)=>[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)])];
const ray=new THREE.Raycaster(),broadPoint=new THREE.Vector3();
const vector=point=>point.toArray().map(v=>Number(v.toFixed(4)));

function snapshotMesh(mesh,view){
  // Source picking is intentionally ignored: a cosmetic raycast no-op does
  // not make an opaque awning or decorative sign visually transparent.
  const copy=new THREE.Mesh(mesh.geometry,geometryMaterial);
  copy.name=mesh.name;copy.matrixAutoUpdate=false;copy.matrixWorld.copy(mesh.matrixWorld);
  return {mesh:copy,bounds:new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(mesh.matrixWorld),tileIndex:view?.tile.index??-1,tileName:view?.tile.name??'diagnostic probe',asset:view?.label.dataset.modelKey??'probe'};
}
function trace(rows,target,towardCamera){
  const origin=target.clone().addScaledVector(towardCamera,45);
  ray.set(origin,towardCamera.clone().negate());ray.near=0;ray.far=44.98;
  let nearest=null;
  for(const row of rows){
    const point=ray.ray.intersectBox(row.bounds,broadPoint);
    if(!point||(!row.bounds.containsPoint(origin)&&point.distanceTo(origin)>ray.far))continue;
    const hits=[];THREE.Mesh.prototype.raycast.call(row.mesh,ray,hits);
    for(const hit of hits)if(!nearest||hit.distance<nearest.distance)nearest={distance:hit.distance,row,point:vector(hit.point)};
  }
  return nearest;
}
function isVisible(mesh){for(let n=mesh;n;n=n.parent)if(!n.visible)return false;return true;}

try{
  for(const level of levels){
    const views=fixture.build({level,steps:true,owners:'alternating'});
    // Execute the real portrait defaults and public-building frontage rotation.
    // Orthographic camera translation during following leaves all these rays
    // parallel; their origin is therefore expressed relative to each pawn.
    run(`wrap={getBoundingClientRect:()=>({width:390,height:844}),dataset:{}};renderer={setSize(){}};
      camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,200);isLocalCamera=()=>true;cameraFocusReady=true;
      cameraView.yaw=null;cameraView.elevation=null;cameraView.modified=false;cameraView.facingYaw=null;
      arrangeLabels=()=>{};positionLabels=()=>{};syncCameraControls=()=>{};resize();world.updateMatrixWorld(true);`);
    productionCamera=run('({yaw:cameraView.yaw,elevation:cameraView.elevation,zoom:cameraView.zoom})');
    if(Object.keys(overrides).length){
      context.sightlineCamera={...productionCamera,...overrides};
      run(`cameraView.yaw=sightlineCamera.yaw;cameraView.elevation=sightlineCamera.elevation;cameraView.modified=true;cameraView.facingYaw=sightlineCamera.yaw;
        lotViews.forEach(view=>{view.readableRotation=undefined;});resize();world.updateMatrixWorld(true);`);
    }
    const towardCamera=run('camera.position.clone().sub(cameraFocus).normalize()');
    const right=run('new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).normalize()');
    const up=run('new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1).normalize()');
    cameraDetails=run('({yaw:cameraView.yaw,elevation:cameraView.elevation,zoom:cameraView.zoom})');
    const rows=[];for(const view of views)view.building.traverse(mesh=>{if(mesh.isMesh&&isVisible(mesh))rows.push(snapshotMesh(mesh,view));});
    assert(rows.length>views.length,'audit includes merged source surfaces as well as functional decorations');
    // Positive/negative controls also prove a no-pick mesh cannot fool the test.
    const probe=new THREE.Mesh(new THREE.BoxGeometry(.12,.20,.12),geometryMaterial),target=new THREE.Vector3(0,.58,0);
    probe.raycast=()=>{};probe.position.copy(target).addScaledVector(towardCamera,1);probe.updateMatrixWorld(true);
    assert(trace([snapshotMesh(probe)],target,towardCamera),'opaque no-pick geometry must obscure a pawn');
    probe.position.copy(target).addScaledVector(towardCamera,-1);probe.updateMatrixWorld(true);
    assert.equal(trace([snapshotMesh(probe)],target,towardCamera),null,'geometry behind a pawn must not count');
    probe.position.copy(target).addScaledVector(towardCamera,1).addScaledVector(right,1);probe.updateMatrixWorld(true);
    const falseBroad=snapshotMesh(probe);falseBroad.bounds.expandByScalar(10);
    assert.equal(trace([falseBroad],target,towardCamera),null,'an AABB overlap without a triangle hit must remain clear');probe.geometry.dispose();
    const local=counters(),blockedTiles=new Set(),bothBlockedTiles=new Set();
    for(const tile of board){
      local.tiles++;
      context.index=tile.index;
      const poses=[];
      for(const playerIndex of [0,1]){
        context.playerIndex=playerIndex;
        run('data.players[playerIndex].position=index;data.players[1-playerIndex].position=(index+1)%data.board.length');
        poses.push({mode:'single',player:playerIndex?'ai':'human',position:run('pawnPosition(data.players[playerIndex])')});
      }
      run('data.players.forEach(p=>p.position=index)');
      run('data.players.map(p=>pawnPosition(p))').forEach((position,i)=>poses.push({mode:'shared',player:i?'ai':'human',position}));
      for(const pose of poses){
        local.poses++;let poseBlocked=0,centerBlocked=0;
        for(const region of regions){
          local.targets++;let blocked=0;const examples=[];
          for(const [sampleIndex,[sx,sy]] of samples.entries()){
            const point=pose.position.clone().add(new THREE.Vector3(0,region.height,0)).addScaledVector(right,sx*region.radius).addScaledVector(up,sy*region.radius);
            const hit=trace(rows,point,towardCamera);local.rays++;
            if(!hit)continue;
            blocked++;local.blockedRays++;
            if(sampleIndex===0){centerBlocked++;local.blockedCenters++;}
            const obstacle={tileIndex:hit.row.tileIndex,tileNumber:hit.row.tileIndex+1,tileName:hit.row.tileName,asset:hit.row.asset,mesh:hit.row.mesh.name,point:hit.point};
            examples.push({sample:sampleIndex,...obstacle});
            const key=`${hit.row.tileIndex}:${hit.row.asset}`;assetHits.set(key,{...obstacle,rays:(assetHits.get(key)?.rays??0)+1});
            meshHits.set(hit.row.mesh.name,(meshHits.get(hit.row.mesh.name)||0)+1);
          }
          if(blocked){
            local.blockedTargets++;poseBlocked+=blocked;blockedTiles.add(tile.index);
            if(blocked===samples.length)local.fullyBlockedTargets++;
            findings.push({level,tileIndex:tile.index,tileNumber:tile.index+1,tileName:tile.name,mode:pose.mode,player:pose.player,part:region.part,pawnPosition:vector(pose.position),blocked,samples:samples.length,centerBlocked:examples.some(h=>h.sample===0),obstacles:examples});
          }
        }
        if(poseBlocked)local.anyBlockedPoses++;
        if(centerBlocked===2){local.bothCentersBlockedPoses++;bothBlockedTiles.add(tile.index);}
      }
    }
    local.tilesWithBlockedRays=blockedTiles.size;local.tilesWithBothCentersBlocked=bothBlockedTiles.size;
    assert.equal(local.poses,board.length*4);assert.equal(local.rays,board.length*4*2*9);
    for(const key of Object.keys(counts))counts[key]+=local[key];
    perLevel.push({level,counts:local,blockedRayRatio:local.blockedRays/local.rays,tilesWithBlockedRays:[...blockedTiles].map(n=>n+1),tilesWithBothCentersBlocked:[...bothBlockedTiles].map(n=>n+1)});
  }
  const output={mapId,mode:auditMode,centerGate:{enabled:enforceCenters,passed:counts.blockedCenters===0},geometry:'double-sided opaque surfaces; no-pick ignored',viewport:{width:390,height:844},productionCamera,cameraOverrides:overrides,camera:cameraDetails,sampling:{poses:['single human','single ai','shared human','shared ai'],parts:regions,samplesPerPart:9},levels,assetPath:fixture.assetPath,assetSha256:digest(fs.readFileSync(fixture.assetPath)),sceneSha256:digest(sourceCode),counts,perLevel,blockedRayRatio:counts.blockedRays/counts.rays,obstacles:[...assetHits.values()].sort((a,b)=>b.rays-a.rays),meshes:[...meshHits].sort((a,b)=>b[1]-a[1]),findings};
  const outputPath=mapReport(mapId);fs.mkdirSync(dirname(outputPath),{recursive:true});fs.writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n');
  console.log(`OBSERVATION ${mapId}: ${counts.blockedRays}/${counts.rays} building sightlines blocked (${(100*counts.blockedRays/counts.rays).toFixed(2)}%); both head/chest centers hidden in ${counts.bothCentersBlockedPoses}/${counts.poses} poses.`);
  console.log(JSON.stringify({mapId,levels,cameraOverrides:overrides,camera:cameraDetails,counts,blockedRayRatio:output.blockedRayRatio,report:outputPath}));
  if(enforceCenters)assert.equal(counts.blockedCenters,0,`${mapId}: default portrait camera must keep every sampled head/chest center visible`);
  if(process.argv.includes('--strict'))assert.equal(counts.blockedRays,0,`${mapId}: strict visibility gate`);
}finally{fixture.dispose();geometryMaterial.dispose();}

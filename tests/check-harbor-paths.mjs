import assert from 'node:assert/strict';
import {THREE,regionalFixture} from './regional-scene-fixture.mjs';
import {createHarborIslands,addHarborBridge} from '../scene-harbor-islands.js';
import {harborEdgePath,harborWalkOffset} from '../scene-harbor-paths.js';

// Use the production route graph, landing offsets and published regional GLB,
// including every alternative edge. A valid pad alone does not prove that the
// token can travel between pads without going through a neighboring building.
const fixture=await regionalFixture('harbor');
const {run,context,map}=fixture;
const resources=new Set(),own=item=>{resources.add(item);return item;};
const totals={map:'harbor',edges:map.navigation.edges.length,levels:3,buildingRays:0,terrainRays:0,islandSamples:0,bridges:0,animatedFrames:0,animatedRays:0,failures:[]};
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);

function rowsFrom(nodes){
  const rows=[];
  for(const node of nodes)node.traverse(mesh=>{
    if(!mesh.isMesh)return;
    // Restore geometric picking even where decorative runtime meshes disable
    // hit testing for UI performance. Box bounds are only a broad-phase filter.
    const copy=new THREE.Mesh(mesh.geometry,material);copy.name=mesh.name;
    copy.matrixWorld.copy(mesh.matrixWorld);copy.matrixAutoUpdate=false;
    rows.push({mesh:copy,bounds:new THREE.Box3().setFromObject(mesh),owner:node.userData.auditTile});
  });
  return rows;
}
function hitsAt(rows,x,z,minY=.28){
  ray.set(new THREE.Vector3(x,8,z),down);ray.near=0;ray.far=8-minY;
  const meshes=rows.filter(row=>x>=row.bounds.min.x&&x<=row.bounds.max.x&&z>=row.bounds.min.z&&z<=row.bounds.max.z&&row.bounds.max.y>=minY);
  const hits=[];
  for(const row of meshes){const intersections=[];THREE.Mesh.prototype.raycast.call(row.mesh,ray,intersections);if(intersections.length){const first=intersections.sort((a,b)=>a.distance-b.distance)[0];hits.push({owner:row.owner,name:row.mesh.name||'mesh',point:first.point.toArray().map(v=>+v.toFixed(3))});}}
  return hits;
}
function checkPaths(rows,steps,key,level){
  for(const edge of map.navigation.edges){
    const route=harborEdgePath(edge.from,edge.to,steps,THREE);
    for(let segment=1;segment<route.length;segment++){
    const a=route[segment-1],b=route[segment];
    for(let sample=0;sample<9;sample++){
      const p=a.clone().lerp(b,sample/8);
      for(let radial=0;radial<9;radial++){
        const angle=(radial-1)*Math.PI/4,radius=radial?.195:0;
        totals[key]++;
        const hits=hitsAt(rows,p.x+Math.cos(angle)*radius,p.z+Math.sin(angle)*radius);
        if(hits.length){
          const found=totals.failures.find(row=>row.kind===key&&row.level===level&&row.edge?.[0]===edge.from&&row.edge?.[1]===edge.to&&row.owner===hits[0].owner);
          if(found)found.count++;
          else totals.failures.push({kind:key,level,edge:[edge.from,edge.to],segment,sample,radial,count:1,...hits[0]});
        }
      }
    }
    }
  }
}
try{
  assert.equal(map.navigation.edges.length,35);
  for(const level of [1,2,3]){
    const views=fixture.build({level,steps:true});
    context.addHarborBridge=addHarborBridge;
    context.harborEdgePath=harborEdgePath;context.harborWalkOffset=harborWalkOffset;
    run('makeRoads(data);streetFoundation.finish();world.updateMatrixWorld(true)');
    const steps=run('new Map([...stepViews.entries()])');
    for(const edge of map.navigation.edges){
      const forward=harborEdgePath(edge.from,edge.to,steps,THREE),reverse=harborEdgePath(edge.to,edge.from,steps,THREE).reverse();
      assert.equal(forward.length,reverse.length,'reverse motion shares the paved footway');
      forward.forEach((point,index)=>assert(point.distanceTo(reverse[index])<.000001));
      assert(forward[0].equals(steps.get(edge.from).walk));assert(forward.at(-1).equals(steps.get(edge.to).walk));
      assert(forward.every(point=>point.toArray().every(Number.isFinite)));
    }
    views.forEach(view=>{view.building.userData.auditTile=view.tile.index;});
    checkPaths(rowsFrom(views.map(view=>view.building)),steps,'buildingRays',level);
    if(level===3){
      const world=run('world'),bounds=run('boardBounds');
      const islands=createHarborIslands({THREE,world,boardBounds:bounds,own});
      world.updateMatrixWorld(true);
      const bridges=world.children.filter(child=>child.name==='harbor_sea_bridge');
      totals.bridges=bridges.length;assert.equal(bridges.length,4,'both branches have departure and return bridges');
      islands.userData.auditTile='terrain';bridges.forEach((bridge,index)=>{bridge.userData.auditTile=`bridge-${index}`;});
      checkPaths(rowsFrom([islands,...bridges]),steps,'terrainRays',level);
      const land=islands.children.filter(child=>child.name.startsWith('land_'));
      assert.equal(land.length,3,'three separately authored island surfaces');
      const landRows=rowsFrom(land),overlaps=[];
      for(let gx=1;gx<=11;gx+=.08)for(let gy=.2;gy<=10.6;gy+=.08){
        totals.islandSamples++;
        const hits=hitsAt(landRows,(gx-bounds.cx)*1.8,(gy-bounds.cy)*1.8,-.01);
        const names=[...new Set(hits.map(hit=>hit.name))];
        if(names.length>1){const key=names.join('|'),existing=overlaps.find(row=>row.key===key);if(existing){existing.count++;if(existing.points.length<3)existing.points.push([+gx.toFixed(2),+gy.toFixed(2)]);}else overlaps.push({key,islands:names,count:1,points:[[+gx.toFixed(2),+gy.toFixed(2)]]});}
      }
      if(overlaps.length)totals.failures.push({kind:'island_overlap',samples:overlaps});
      // A concrete obstruction must fail, while a water plane under the route
      // must pass: these guards prevent an accidentally inert ray test.
      const probe=new THREE.Mesh(new THREE.BoxGeometry(.12,.4,.12),material),first=steps.get(0).walk;
      probe.position.set(first.x,.5,first.z);probe.updateMatrixWorld(true);
      assert(hitsAt(rowsFrom([probe]),first.x,first.z).length);
      probe.position.y=-.6;probe.updateMatrixWorld(true);
      assert.equal(hitsAt(rowsFrom([probe]),first.x,first.z).length,0);
      probe.geometry.dispose();
      // Run the real scene update + tick, not a copy of its interpolation. Each
      // edge is exercised forward/backward, including an occupied destination.
      context.requestAnimationFrame=()=>1;
      context.document.body.classList.add=()=>{};context.document.body.classList.contains=()=>false;
      run(`renderer={render(){}};scene=new THREE.Scene();camera=new THREE.OrthographicCamera();
        mount=()=>true;loadModelKit=()=>{};arrangeLabels=()=>{};positionLabels=()=>{};syncCameraControls=()=>{};syncAtmosphereReadout=()=>{};followCamera=()=>false;
        isLocalCamera=()=>true;lastLocalCamera=true;mapKey=data.sessionId+':'+data.mapId+':'+data.board.length;
        data.currentPlayerId='human';data.animation={};`);
      const animatedObstacles=rowsFrom([...views.map(view=>view.building),islands,...bridges]);
      for(const edge of map.navigation.edges)for(const reverse of [false,true])for(const sharing of [false,true]){
        const from=reverse?edge.to:edge.from,to=reverse?edge.from:edge.to;
        const rival=sharing?to:map.routePositions.findIndex((_,index)=>index!==from&&index!==to);
        run(`pawnViews.forEach(view=>view.group.removeFromParent());pawnViews.clear();data.players[0].position=${from};data.players[1].position=${rival};data.players.forEach(makePawn);data.players[0].position=${to};update(data);pawnViews.get('human').started=1000;`);
        const view=run("pawnViews.get('human')");
        assert(view.active&&!view.teleport,'a graph-connected bridge is walking, never a teleport');
        assert(view.path?.length>=2);assert(view.duration>=190&&view.duration<=650);
        const advertised=run("api.getMovementDuration('human')");assert(advertised>=view.duration,'the rules cannot advance before the complete path animation');
        const expected=harborEdgePath(from,to,steps,THREE);expected[0]=view.from.clone();expected[expected.length-1]=view.target.clone();expected.forEach(point=>point.y=.265);
        assert.equal(expected.length,view.path.length);
        for(let frame=0;frame<=8;frame++){
          const t=frame/8,time=frame===8?1000+Math.ceil(advertised)+1:1000+t*view.duration;
          run(`lastTime=${time-25};tick(${time})`);
          let remaining=(t*t*(3-2*t))*view.pathLength,point=expected[0].clone();
          for(let segment=1;segment<expected.length;segment++){
            const length=expected[segment-1].distanceTo(expected[segment]);
            if(remaining<=length||segment===expected.length-1){point.lerpVectors(expected[segment-1],expected[segment],Math.min(1,remaining/Math.max(.0001,length)));break;}
            remaining-=length;
          }
          assert(Math.hypot(view.group.position.x-point.x,view.group.position.z-point.z)<.000001,`actual tick must stay on paved edge ${from}→${to}`);
          totals.animatedFrames++;
          for(let radial=0;radial<9;radial++){
            const angle=(radial-1)*Math.PI/4,radius=radial?.195:0,p=view.group.position;
            const hits=hitsAt(animatedObstacles,p.x+Math.cos(angle)*radius,p.z+Math.sin(angle)*radius,p.y+.025);totals.animatedRays++;
            if(hits.length&&!totals.failures.some(row=>row.kind==='animation'&&row.edge[0]===from&&row.edge[1]===to&&row.sharing===sharing))totals.failures.push({kind:'animation',edge:[from,to],sharing,frame,radial,...hits[0]});
          }
        }
        assert.equal(view.active,false,'full advertised duration reaches the destination before the next step');
        assert(view.group.position.equals(view.target));
      }
    }
  }
  console.log(JSON.stringify(totals,null,2));
  assert.equal(totals.failures.length,0,'harbor paths must clear actual building, bridge and landscape geometry; islands must remain separate');
  console.log(`PASS 35 harbor edges at 9 positions × 9 pawn-radius samples, all three building levels, four bridges and separate islands.`);
}finally{resources.forEach(resource=>resource.dispose());material.dispose();fixture.dispose();}

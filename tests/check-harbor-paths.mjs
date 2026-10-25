import assert from 'node:assert/strict';
import {THREE,regionalFixture} from './regional-scene-fixture.mjs';
import {createHarborIslands,addHarborBridge,updateHarborProjectVisuals,tickHarborProjectVisuals} from '../scene-harbor-islands.js';
import {harborEdgePath,harborWalkOffset,harborVisualPosition,harborParcelRotation} from '../scene-harbor-paths.js';
import {harborWalkSetback} from '../scene-harbor-landmarks.js';

// Use the production route graph, landing offsets and published regional GLB,
// including every alternative edge. A valid pad alone does not prove that the
// token can travel between pads without going through a neighboring building.
const fixture=await regionalFixture('harbor');
const {run,context,map}=fixture;
const resources=new Set(),own=item=>{resources.add(item);return item;};
const totals={map:'harbor',edges:map.navigation.edges.length,levels:3,buildingRays:0,terrainRays:0,islandSamples:0,shoreSamples:0,straightParcels:0,rotatedPavers:0,parcelPairs:0,roadParcelPairs:0,bridges:0,animatedFrames:0,animatedRays:0,failures:[]};
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
const BRIDGES=new Set(['11:12','11:20','19:28','27:28']);
const isBridge=edge=>BRIDGES.has([edge.from,edge.to].sort((a,b)=>a-b).join(':'));

function rowsFrom(nodes){
  const rows=[];
  for(const node of nodes)node.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(let parent=mesh;parent&&parent!==node.parent;parent=parent.parent)if(!parent.visible)return;
    // Restore geometric picking even where decorative runtime meshes disable
    // hit testing for UI performance. Box bounds are only a broad-phase filter.
    const instances=mesh.isInstancedMesh?mesh.count:1;
    mesh.geometry.computeBoundingBox();
    for(let index=0;index<instances;index++){
      const copy=new THREE.Mesh(mesh.geometry,material);copy.name=mesh.name;
      const matrix=new THREE.Matrix4();if(mesh.isInstancedMesh)mesh.getMatrixAt(index,matrix);
      copy.matrixWorld.copy(mesh.matrixWorld).multiply(matrix);copy.matrixAutoUpdate=false;
      rows.push({mesh:copy,bounds:mesh.geometry.boundingBox.clone().applyMatrix4(copy.matrixWorld),owner:node.userData.auditTile});
    }
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
    const a=route[segment-1],b=route[segment],samples=Math.max(8,Math.ceil(a.distanceTo(b)/.14));
    for(let sample=0;sample<=samples;sample++){
      const p=a.clone().lerp(b,sample/samples);
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
function checkStraightStreets(views,steps){
  assert.equal(views.length,31,'all 31 primary parcels are inspected');
  assert.equal(steps.size,34,'all 34 landing pads are inspected');
  const bends=[[33,0,1],[4,5,6]].map(([before,index,after])=>{
    const incoming=steps.get(index).walk.clone().sub(steps.get(before).walk).normalize(),outgoing=steps.get(after).walk.clone().sub(steps.get(index).walk).normalize();
    assert(incoming.dot(outgoing)<Math.cos(35*Math.PI/180),`S bend ${index} remains clearly visible`);
    return incoming.x*outgoing.z-incoming.z*outgoing.x;
  });
  assert(bends[0]*bends[1]<0,'the shared boulevard bends in opposite directions to form an S');
  const paving=run('world.getObjectByName("regional_streets_harbor")').children.filter(node=>node.isInstancedMesh);
  const axis=new THREE.Vector3(0,0,1),matrix=new THREE.Matrix4(),position=new THREE.Vector3();
  for(const indices of [[29,30,31,32,33],[1,2,3,4],[6,7,8,9,10]]){
    const first=steps.get(indices[0]),last=steps.get(indices.at(-1));
    const direction=last.walk.clone().sub(first.walk).normalize();
    for(const [order,index] of indices.entries()){
      const step=steps.get(index),normal=step.walk.clone().sub(step.center).setY(0).normalize();
      const walkOffset=step.walk.clone().sub(first.walk);
      assert(walkOffset.clone().cross(direction).length()<1e-6,`landing ${index} lies on its straight street`);
      assert(Math.abs(normal.dot(direction))<1e-6,`parcel ${index} faces perpendicular to the street`);
      if(order)assert.equal(harborEdgePath(indices[order-1],index,steps,THREE).length,2,`street ${indices[order-1]}→${index} must not detour around buildings`);
    }
  }
  for(const pair of [[30,31],[2,3],[7,8]])assert(Math.abs(steps.get(pair[0]).walk.distanceTo(steps.get(pair[1]).walk)-2.34)<1e-6,'large estates retain full-width two-step frontage');
  for(const indices of [[12,13,14,15,16,17,18,19],[20,21,22,23,24,25,26,27]])for(let i=1;i<indices.length-1;i++){
    const tangent=steps.get(indices[i+1]).walk.clone().sub(steps.get(indices[i-1]).walk).normalize();
    assert(Math.abs(tangent.dot(steps.get(indices[i]).normal))<.06,`coastal parcel ${indices[i]} follows its curved street tangent`);
  }
  for(const [index,step] of steps){
    assert(Math.abs(Math.hypot(step.walk.x-step.center.x,step.walk.z-step.center.z)-harborWalkSetback({index}))<1e-6,`stop ${index} uses its parcel's street setback`);
    assert(axis.clone().transformDirection(step.landing.matrixWorld).dot(step.normal)>.999999,`landing ${index} faces its authored street`);
  }
  for(const view of views){
      const index=view.tile.index,step=steps.get(index),normal=step.normal;
      assert(Math.abs(view.group.rotation.y-harborParcelRotation(view.tile))<1e-6);
      for(const [name,node] of [['parcel',view.group],['building',view.building.children[0]],['deed',view.ownerFrame],['event',view.outline],['flag',view.flag],['landing',step.landing]]){
        assert(axis.clone().transformDirection(node.matrixWorld).dot(normal)>.999999,`${name} ${index} must share its street-facing rotation`);
      }
      const actual=harborVisualPosition(view.tile),bounds=run('boardBounds');
      assert(Math.hypot(step.center.x-(actual.x-bounds.cx)*1.8,step.center.z-(actual.y-bounds.cy)*1.8)<1e-6,'actual scene uses visual centers');
      let parcelPavers=0;
      for(const mesh of paving)for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,matrix);matrix.premultiply(mesh.matrixWorld);position.setFromMatrixPosition(matrix);
        const local=view.group.worldToLocal(position.clone());
        if(Math.abs(local.y-.025)>1e-5||Math.abs(local.x)>view.w/2||Math.abs(local.z)>view.d/2)continue;
        assert(axis.clone().transformDirection(matrix).dot(normal)>.999999,`paving ${index} rotates with its parcel`);
        parcelPavers++;totals.rotatedPavers++;
      }
      assert(parcelPavers>=12,`rotated parcel ${index} retains its complete paved border`);
      totals.straightParcels++;
  }
  for(const edge of map.navigation.edges)assert.equal(harborEdgePath(edge.from,edge.to,steps,THREE).length,2,`edge ${edge.from}→${edge.to} is direct`);
}
function segmentDistance(a,b,p){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
function crosses(a,b,c,d){
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(q.z-p.z)*(r.x-p.x);
  return cross(a,b,c)*cross(a,b,d)<-1e-10&&cross(c,d,a)*cross(c,d,b)<-1e-10;
}
function segmentGap(a,b,c,d){return crosses(a,b,c,d)?0:Math.min(segmentDistance(a,b,c),segmentDistance(a,b,d),segmentDistance(c,d,a),segmentDistance(c,d,b));}
function checkParcelClearance(views,steps){
  const corners=view=>[[-view.w/2,-view.d/2],[view.w/2,-view.d/2],[view.w/2,view.d/2],[-view.w/2,view.d/2]].map(([x,z])=>view.group.localToWorld(new THREE.Vector3(x,0,z)));
  const polygons=views.map(view=>({view,points:corners(view)}));
  function overlaps(a,b){
    for(const polygon of [a,b])for(let i=0;i<4;i++){
      const p=polygon[i],q=polygon[(i+1)%4],axis={x:-(q.z-p.z),z:q.x-p.x},length=Math.hypot(axis.x,axis.z);axis.x/=length;axis.z/=length;
      const pa=a.map(v=>v.x*axis.x+v.z*axis.z),pb=b.map(v=>v.x*axis.x+v.z*axis.z);
      if(Math.min(...pa)>=Math.max(...pb)-.001||Math.min(...pb)>=Math.max(...pa)-.001)return false;
    }return true;
  }
  for(let i=0;i<polygons.length;i++)for(let j=i+1;j<polygons.length;j++){
    totals.parcelPairs++;
    if(overlaps(polygons[i].points,polygons[j].points))totals.failures.push({kind:'parcel_overlap',tiles:[polygons[i].view.tile.index,polygons[j].view.tile.index]});
  }
  for(const edge of map.navigation.edges){
    const [a,b]=harborEdgePath(edge.from,edge.to,steps,THREE);
    const bridge=isBridge(edge);
    for(const {view,points} of polygons){
      totals.roadParcelPairs++;
      const localA=view.group.worldToLocal(a.clone()),localB=view.group.worldToLocal(b.clone());
      const within=p=>Math.abs(p.x)<view.w/2&&Math.abs(p.z)<view.d/2;
      const gap=within(localA)||within(localB)?0:Math.min(...points.map((point,i)=>segmentGap(a,b,point,points[(i+1)%4])));
      if(gap<(bridge?.425:.32)-.001)totals.failures.push({kind:'road_parcel_overlap',edge:[edge.from,edge.to],tile:view.tile.index,gap:+gap.toFixed(4)});
    }
  }
  for(let i=0;i<map.navigation.edges.length;i++)for(let j=i+1;j<map.navigation.edges.length;j++){
    const a=map.navigation.edges[i],b=map.navigation.edges[j];
    if([a.from,a.to].some(index=>[b.from,b.to].includes(index)))continue;
    const [a1,a2]=harborEdgePath(a.from,a.to,steps,THREE),[b1,b2]=harborEdgePath(b.from,b.to,steps,THREE);
    if(segmentGap(a1,a2,b1,b2)<.64-.001)totals.failures.push({kind:'unconnected_streets_overlap',edges:[[a.from,a.to],[b.from,b.to]]});
  }
}
function checkShoreSupport(islands,views,steps,bounds){
  const footprints=islands.userData.islandFootprints;
  function inside(x,z,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
  function check(index,point,kind){
    const island=footprints[index>=12&&index<=19?0:index>=20&&index<=27?2:1],x=point.x/1.8+bounds.cx,z=point.z/1.8+bounds.cy;
    totals.shoreSamples++;
    if(!inside(x,z,island.points))totals.failures.push({kind:'shore_support',tile:index,part:kind,island:island.name,point:[+x.toFixed(4),+z.toFixed(4)]});
  }
  for(const view of views)for(let i=0;i<4;i++)for(let t=0;t<=4;t++){
    const corners=[[-view.w/2,-view.d/2],[view.w/2,-view.d/2],[view.w/2,view.d/2],[-view.w/2,view.d/2]],a=corners[i],b=corners[(i+1)%4];
    check(view.tile.index,view.group.localToWorld(new THREE.Vector3(a[0]+(b[0]-a[0])*t/4,0,a[1]+(b[1]-a[1])*t/4)),'parcel');
  }
  for(const [index,step] of steps){
    const mesh=step.landing.children[0];mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;
    for(const x of [box.min.x,box.max.x])for(const z of [box.min.z,box.max.z])check(index,mesh.localToWorld(new THREE.Vector3(x,0,z)),'landing');
  }
  for(const edge of map.navigation.edges){
    if(isBridge(edge))continue;
    const [a,b]=harborEdgePath(edge.from,edge.to,steps,THREE),direction=b.clone().sub(a).normalize(),side=new THREE.Vector3(-direction.z,0,direction.x).multiplyScalar(.34);
    for(let i=0;i<=12;i++)for(const sign of [-1,1])check(edge.from,a.clone().lerp(b,i/12).addScaledVector(side,sign),'street');
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
    checkStraightStreets(views,steps);
    if(level===3)checkParcelClearance(views,steps);
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
      const islands=createHarborIslands({THREE,world,boardBounds:bounds,data:run('data'),own});
      world.updateMatrixWorld(true);
      const footprints=islands.userData.islandFootprints,span=points=>Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]));
      assert(span(footprints[1].points)/span(footprints.flatMap(p=>p.points))>=.4,'the main island occupies at least forty percent of the archipelago width');
      assert(islands.getObjectByName('harbor_central_plaza'),'the shared island retains a clear scenic court');
      checkShoreSupport(islands,views,steps,bounds);
      const bridges=world.children.filter(child=>child.name==='harbor_sea_bridge');
      totals.bridges=bridges.length;assert.equal(bridges.length,4,'both branches have departure and return bridges');
      islands.userData.auditTile='terrain';bridges.forEach((bridge,index)=>{bridge.userData.auditTile=`bridge-${index}`;});
      const projects=islands.userData.harborProjects;
      assert.deepEqual(Object.keys(projects).sort(),['promenade','water']);
      const nodeIds=[];islands.traverse(node=>nodeIds.push(node.uuid));
      for(const stage of [0,1,2,3]){
        const snapshots=['water','promenade'].map(id=>({id,stage,points:stage*3}));
        const changes=updateHarborProjectVisuals(islands,snapshots);
        assert.equal(changes.length,stage===0?0:2);assert(changes.every(change=>change.celebrate));
        const now=1000+stage*2000;
        tickHarborProjectVisuals(islands,now);tickHarborProjectVisuals(islands,now+550);
        const scaleBefore=projects.water.group.scale.clone();
        assert.deepEqual(updateHarborProjectVisuals(islands,snapshots.map(p=>({...p,points:Math.max(0,p.points-2)}))),[],'unchanged permanent stages never recreate or restart visual effects');
        assert(projects.water.group.scale.equals(scaleBefore),'a same-stage redraw does not make the reveal animation jump');
        tickHarborProjectVisuals(islands,now+1101);assert.equal(tickHarborProjectVisuals(islands,now+1200),false,'an upgrade stops requesting frames when the short reveal finishes');
        for(const entry of Object.values(projects)){
          assert.equal(entry.stage,stage);entry.stages.forEach((group,i)=>{if(group)assert.equal(group.visible,i<=stage);});
          assert(entry.group.scale.equals(new THREE.Vector3(1,1,1)));
          assert(entry.anchor.toArray().every(Number.isFinite));
        }
        const nextIds=[];islands.traverse(node=>nextIds.push(node.uuid));assert.deepEqual(nextIds,nodeIds,'all growth stages update the same prebuilt scene instance');
        world.updateMatrixWorld(true);
        for(const entry of Object.values(projects))assert(new THREE.Box3().setFromObject(entry.group).max.y-entry.group.getWorldPosition(new THREE.Vector3()).y<=1.6,'court monuments stay below the center-height limit');
        checkPaths(rowsFrom([islands,...bridges]),steps,'terrainRays','project-'+stage);
      }
      const initialMax=createHarborIslands({THREE,world,boardBounds:bounds,data:{...run('data'),harborProjects:[{id:'water',stage:3},{id:'promenade',stage:3}]},own});
      assert(Object.values(initialMax.userData.harborProjects).every(entry=>entry.stage===3&&!entry.animation),'the first presentation of an existing stage never celebrates');
      assert.equal(tickHarborProjectVisuals(initialMax,1000),false);initialMax.removeFromParent();
      const land=islands.children.filter(child=>child.name.startsWith('land_'));
      assert.equal(land.length,3,'three separately authored island surfaces');
      const landRows=rowsFrom(land),overlaps=[];
      for(let a=0;a<3;a++)for(let b=a+1;b<3;b++){
        const first=islands.userData.islandFootprints[a],second=islands.userData.islandFootprints[b];
        const polygon=island=>island.points.map(([x,z])=>({x,z})),p=polygon(first),q=polygon(second);
        const channel=Math.min(...p.flatMap((point,i)=>q.map((other,j)=>segmentGap(point,p[(i+1)%p.length],other,q[(j+1)%q.length]))));
        assert(channel>.12,`${first.name} and ${second.name} retain an open water channel`);
      }
      for(let gx=bounds.minX-.8;gx<=bounds.maxX+.8;gx+=.08)for(let gy=bounds.minY-.8;gy<=bounds.maxY+.8;gy+=.08){
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
        assert(view.path?.length>=2);assert(view.duration>=190&&view.pathLength/(view.duration/1000)<=9,'long bridges extend travel time rather than exceeding the camera-safe walking speed');
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
  console.log(`PASS all 31 parcels, 34 stops and 35 direct edges; at most 0.14 m between collision samples, three building levels, four bridges and separate islands.`);
}finally{resources.forEach(resource=>resource.dispose());material.dispose();fixture.dispose();}

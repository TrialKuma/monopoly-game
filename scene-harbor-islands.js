// Harbor geography follows the authored streets in scene-harbor-paths.js;
// this layer never changes the movement graph or generates gameplay rewards.
import { harborWalkOffset, harborEdgePath, harborVisualPosition, harborParcelRotation, harborStreetPosition, harborCoastLayout } from './scene-harbor-paths.js?v=20261025-harbor-main-island1';
import { harborLandmarkSpec } from './scene-harbor-landmarks.js?v=20261025-harbor-main-island1';
import { createHarborProjectVisuals, updateHarborProjectVisuals } from './scene-harbor-projects.js?v=20261025-harbor-projects1';
export { updateHarborProjectVisuals, tickHarborProjectVisuals } from './scene-harbor-projects.js?v=20261025-harbor-projects1';

export function createHarborIslands({THREE,world,boardBounds,data,own}) {
  const root=new THREE.Group();root.name='harbor_three_islands';root.userData.cosmetic=true;world.add(root);
  const step=1.8,cx=boardBounds.cx,cy=boardBounds.cy;
  const materials=new Map();
  const mat=color=>{if(!materials.has(color))materials.set(color,own(new THREE.MeshStandardMaterial({color,roughness:.84})));return materials.get(color);};
  const geo=own(new THREE.BoxGeometry(1,1,1));
  function box(x,y,z,w,h,d,color,angle=0){const m=new THREE.Mesh(geo,mat(color));m.position.set((x-cx)*step,y,(z-cy)*step);m.scale.set(w,h,d);m.rotation.y=angle;m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
  function shape(points,y,height,color,scale=1){
    const center=points.reduce((a,p)=>[a[0]+p[0]/points.length,a[1]+p[1]/points.length],[0,0]);
    const s=new THREE.Shape();points.forEach(([x,z],i)=>{const px=(center[0]+(x-center[0])*scale-cx)*step,pz=(center[1]+(z-center[1])*scale-cy)*step;i?s.lineTo(px,pz):s.moveTo(px,pz);});s.closePath();
    const g=own(new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:true,bevelSize:.08,bevelThickness:.035,bevelSegments:1}));g.rotateX(Math.PI/2);
    const m=new THREE.Mesh(g,mat(color));m.position.y=y+height;m.castShadow=true;m.receiveShadow=true;root.add(m);return m;
  }
  // A broad convex town island joins the three S streets. Its surface is a
  // continuous warm stone district, not a grass ribbon following the route.
  const centralPoints=[];
  const surround=(x,z,r=.34)=>{for(let i=0;i<8;i++)centralPoints.push([x+Math.cos(i*Math.PI/4)*r,z+Math.sin(i*Math.PI/4)*r]);};
  for(const tile of data.board.filter(t=>t.index<12||t.index>=28)){
    const walk=harborStreetPosition(tile);surround(walk.x,walk.y,.48);
    if(tile.isLargeSecondary)continue;
    const a=harborVisualPosition(tile),secondary=data.board.find(t=>t.isLargeSecondary&&t.largePrimaryIndex===tile.index),b=secondary&&harborVisualPosition(secondary),spec=harborLandmarkSpec(tile),angle=harborParcelRotation(tile)||0;
    const x=b?(a.x+b.x)/2:a.x,z=b?(a.y+b.y)/2:a.y,c=Math.cos(angle),s=Math.sin(angle);
    for(const px of [-spec.width/2,spec.width/2])for(const pz of [-spec.depth/2,spec.depth/2])surround(x+(px*c+pz*s)/step,z+(-px*s+pz*c)/step);
  }
  function hull(points){const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);const lower=[],upper=[];for(const p of sorted){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(const p of sorted.reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}lower.pop();upper.pop();return lower.concat(upper);}
  const coast=harborCoastLayout();
  function crescent(first,last){const arc=(offset,reverse=false)=>Array.from({length:42},(_,i)=>{const t=reverse?1-i/41:i/41,a=(first+(last-first)*t)*Math.PI/180;return[coast.x+Math.cos(a)*(coast.rx+offset),coast.z+Math.sin(a)*(coast.rz+offset)];});return[...arc(1.85),...arc(-.46,true)];}
  const islands=[
    {name:'商贸岛',points:crescent(-112,-248),grass:'#aab58a'},
    {name:'港口岛',points:hull(centralPoints),grass:'#c9c3a5'},
    {name:'度假岛',points:crescent(-68,68),grass:'#99b99a'},
  ];
  root.userData.islandFootprints=islands.map(island=>({name:island.name,points:island.points.map(point=>[...point])}));
  for(const island of islands){
    const shoal=shape(island.points,-.40,.035,'#77c0bd',1.05);shoal.name='shallow_'+island.name;
    const sand=shape(island.points,-.35,.08,'#e6d2a0',1.025);sand.name='shore_'+island.name;
    shape(island.points,-.28,.26,'#b6ad8e');
    const land=shape(island.points,-.02,.10,island.grass);land.name='land_'+island.name;
  }
  // Open channels remain visibly water, with narrow quays and breakwaters.
  const ocean=new THREE.Mesh(own(new THREE.PlaneGeometry(180,180)),mat('#609eaa'));ocean.name='harbor_ocean';ocean.userData.preserveGroundColor=true;ocean.rotation.x=-Math.PI/2;ocean.position.y=-.415;ocean.receiveShadow=true;root.add(ocean);
  function inside(x,z,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
  const onLand=(x,z,radius=0)=>islands.some(island=>Array.from({length:8},(_,i)=>[x+Math.cos(i*Math.PI/4)*radius/step,z+Math.sin(i*Math.PI/4)*radius/step]).every(point=>inside(...point,island.points)));
  // Props use the same footway points as actual pawns, not a guessed ring.
  const tiles=data?.board||[],steps=new Map(tiles.map(tile=>{const position=harborVisualPosition(tile),center=new THREE.Vector3((position.x-cx)*step,.255,(position.y-cy)*step);return[tile.index,{center,walk:center.clone().add(harborWalkOffset(tile,THREE))}];}));
  const paths=(data?.navigation?.edges||[]).map(edge=>harborEdgePath(edge.from,edge.to,steps,THREE));
  const parcels=tiles.filter(tile=>!tile.isLargeSecondary).map(tile=>{
    const a=harborVisualPosition(tile),secondary=tiles.find(other=>other.isLargeSecondary&&other.largePrimaryIndex===tile.index),b=secondary&&harborVisualPosition(secondary),spec=harborLandmarkSpec(tile);
    return {x:b?(a.x+b.x)/2:a.x,z:b?(a.y+b.y)/2:a.y,angle:harborParcelRotation(tile)||0,w:spec?.width??(secondary?3.23:1.43),d:spec?.depth??1.43};
  });
  function clear(x,z,radius=.3){
    if(parcels.some(parcel=>{const dx=(x-parcel.x)*step,dz=(z-parcel.z)*step,c=Math.cos(parcel.angle),s=Math.sin(parcel.angle);return Math.abs(dx*c-dz*s)<parcel.w/2+radius+.12&&Math.abs(dx*s+dz*c)<parcel.d/2+radius+.12;}))return false;
    const wx=(x-cx)*step,wz=(z-cy)*step;
    for(const route of paths)for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((wx-a.x)*dx+(wz-a.z)*dz)/Math.max(.0001,dx*dx+dz*dz)));if(Math.hypot(wx-a.x-t*dx,wz-a.z-t*dz)<radius+.42)return false;}
    return true;
  }
  const waveGeo=own(new THREE.PlaneGeometry(.38,.026)),waveMat=own(new THREE.MeshBasicMaterial({color:'#bce4dd',transparent:true,opacity:.5,depthWrite:false}));
  const waterPoints=[];
  for(let i=0;i<290;i++){const x=-5+(i*2.371)%27,z=-3+(i*1.727)%25;if(!onLand(x,z,.24))waterPoints.push([x,z]);}
  const ripples=own(new THREE.InstancedMesh(waveGeo,waveMat,waterPoints.length)),matrix=new THREE.Matrix4();ripples.name='harbor_water_ripples';
  waterPoints.forEach(([x,z],i)=>{matrix.makeRotationX(-Math.PI/2).setPosition((x-cx)*step,-.397,(z-cy)*step);ripples.setMatrixAt(i,matrix);});ripples.instanceMatrix.needsUpdate=true;ripples.computeBoundingSphere();root.add(ripples);
  // Moorings emphasize the narrow water channels. Poles and hulls are checked
  // together, so a safe pier cannot accidentally leave its mast in a footway.
  const moorings=[[-149,1],[-207,1],[-31,-1],[27,-1]].map(([degrees,side])=>{const a=degrees*Math.PI/180;return[coast.x+Math.cos(a)*(coast.rx-.5),coast.z+Math.sin(a)*(coast.rz-.5),side];});
  for(const [x,z,side] of moorings){
    if(!clear(x,z,.52)||!clear(x+side*.25,z+.24,.48))continue;
    box(x,-.01,z,.8,.13,.28,'#b58e66');
    for(let n=0;n<7;n++)box(x+(n-3)*.055,.07,z,.07,.022,.30,n%2?'#d2b289':'#c6a173');
    for(const end of [-1,1])box(x+end*.17,.14,z,.07,.15,.07,'#527774');
    const hull=box(x+side*.25,-.21,z+.24,.30,.13,.68,'#efddba',.1*side);hull.name='harbor_fishing_boat';
    box(x+side*.25,-.12,z+.24,.22,.09,.38,'#a75f50',.1*side);
    box(x+side*.25,.12,z+.24,.025,.5,.025,'#d6b375');
  }
  // Salt gardens, cliff shelves and a central court create different ground
  // layers without adding foliage over houses or the playable promenade.
  const rockGeo=own(new THREE.IcosahedronGeometry(1,0)),bushGeo=own(new THREE.IcosahedronGeometry(1,1));
  const gardenPlantings=[];
  function plant(x,z,base,width,height,color){gardenPlantings.push({x,z,y:base+height/2,width,height,color});}
  function flowers(x,z,base,seed=0){
    for(let j=0;j<3;j++)plant(x+(j-1)*.045/step,z+((j+seed)%2?.035:-.035)/step,base,.075,.055,(j+seed)%2?'#e6ce98':'#ce9693');
  }
  const coastGardens=[-128,-146,-164,-182,-200,-218,-234,-52,-34,-16,2,20,38,55].map(degrees=>{const a=degrees*Math.PI/180;return[coast.x+Math.cos(a)*(coast.rx+.75),coast.z+Math.sin(a)*(coast.rz+.75)];});
  for(const [x,z] of coastGardens){
    if(!clear(x,z,.32)||!onLand(x,z,.36))continue;
    box(x,.08,z,.62,.12,.62,'#d9c9a1');box(x,.15,z,.48,.03,.48,'#817b5c');
    for(let j=0;j<3;j++){const bush=new THREE.Mesh(bushGeo,mat(j%2?'#729881':'#8aa278'));bush.position.set((x-cx)*step+(j-1)*.12,.25,(z-cy)*step);bush.scale.set(.16,.14,.19);root.add(bush);}
  }
  for(let i=0;i<48;i++){const j=i%24,a=((i<24?-121:-59)+j*(i<24?-5:5))*Math.PI/180,x=coast.x+Math.cos(a)*(coast.rx+2),z=coast.z+Math.sin(a)*(coast.rz+2);if(!clear(x,z,.24)||onLand(x,z))continue;const rock=new THREE.Mesh(rockGeo,mat(i%2?'#b9b29a':'#94a8a0'));rock.position.set((x-cx)*step,-.15,(z-cy)*step);rock.scale.set(.20+(j%3)*.05,.12,.24);root.add(rock);}
  // Small offshore skerries keep the wider camera view composed as an
  // archipelago; none connect the three playable islands across a bridge.
  for(const [x,z,r] of [[-4.4,5,.36],[-3.8,14,.44],[3.8,21,.40],[13.2,20.3,.48],[20.4,4,.38],[21,13,.45]]){
    const points=Array.from({length:7},(_,i)=>[x+Math.cos(i*Math.PI*2/7)*r,z+Math.sin(i*Math.PI*2/7)*r*.65]);
    const shelf=shape(points,-.39,.07,'#85b5ac',1.35);shelf.name='offshore_shoal';
    const rock=shape(points,-.32,.19,'#b0b39a');rock.name='offshore_skerry';
  }
  const scenicCourts=[];
  function courtNear(targetX,targetZ){
    for(const radius of [2.65,2.45,2.25,2.05]){
      const choices=[];
      for(let x=targetX-1.2;x<=targetX+1.2;x+=.2)for(let z=targetZ-1.2;z<=targetZ+1.2;z+=.2){
        if(!inside(x,z,islands[1].points)||!onLand(x,z,radius+.1)||!clear(x,z,radius+.08))continue;
        choices.push({x,z,radius,score:Math.hypot(x-targetX,z-targetZ)});
      }
      choices.sort((a,b)=>a.score-b.score);if(choices.length)return choices[0];
    }
    return null;
  }
  function courtBase(court,name){
    const {x,z,radius}=court;
    const outline=Array.from({length:8},(_,i)=>[x+Math.cos((i+.5)*Math.PI/4)*radius/step,z+Math.sin((i+.5)*Math.PI/4)*radius/step]);
    shape(outline,.075,.035,'#b9ab8c').name=name;
    shape(outline,.112,.018,'#e1d2b1',.91);
    scenicCourts.push(court);
    return (dx,dz,y,w,h,d,color,angle=0)=>box(x+dx/step,y,z+dz/step,w,h,d,color,angle);
  }
  // Two large landscaped courts fill the broad sides of the S. Their clear
  // radius includes all walls, planting and the small pergola canopy.
  const waterCourt=courtNear(5.6,6.8);
  if(waterCourt){
    const b=courtBase(waterCourt,'harbor_central_plaza'),r=waterCourt.radius;
    b(0,0,.15,1.65,.08,2.40,'#b5bda7');b(0,0,.20,1.43,.04,2.18,'#6d9f9e');b(0,0,.225,1.22,.012,1.97,'#88c8bd');
    for(const side of [-1,1]){
      for(let j=-3;j<=3;j++)b(j*.225,side*1.15,.24,.205,.07,.13,j%2?'#d3cfb5':'#bfc6ae');
      for(let j=-2;j<=2;j++)b(side*.77,j*.39,.24,.13,.07,.36,j%2?'#d3cfb5':'#bfc6ae');
    }
    for(const [x,z,w] of [[-.17,-.64,.44],[.20,-.14,.29],[-.10,.38,.48],[.21,.67,.24]])b(x,z,.234,w,.004,.018,'#c0e4d5');
    for(const side of [-1,1]){
      b(side*1.2,0,.20,.45,.18,2.65,'#c4b38f');b(side*1.2,0,.30,.34,.025,2.50,'#7e9f80');
      for(let j=0;j<7;j++){
        const x=waterCourt.x+side*1.2/step,z=waterCourt.z+(j-3)*.32/step;
        plant(x,z,.315,.34,.20+(j%2)*.045,j%2?'#88a77a':'#648b70');
        if(j===1||j===5)flowers(x,z,.51,j);
      }
      b(0,side*1.5,.14,1.80,.04,.35,'#bcad8d');b(0,side*1.76,.105,1.96,.025,.22,'#d5c4a2');
    }
    const canopyZ=-Math.min(r-.45,1.85);
    for(const dx of [-.55,.55])b(dx,canopyZ,.53,.055,.85,.055,'#9c8662');
    b(0,canopyZ,.95,1.45,.08,.72,'#8aa598');
    for(let j=0;j<6;j++)b((j-2.5)*.23,canopyZ,1.01,.075,.055,.85,'#d3bd91');
  }
  const promenadeCourt=courtNear(8.6,12.8);
  if(promenadeCourt){
    const b=courtBase(promenadeCourt,'harbor_promenade_court'),r=promenadeCourt.radius;
    for(let j=-3;j<=3;j++)b(j*.47,0,.138,.025,.012,3.35,'#b9aa8a');
    for(let j=-3;j<=3;j++)b(0,j*.47,.138,3.35,.012,.025,'#b9aa8a');
    b(0,0,.15,1.30,.025,1.30,'#b4c1ac',Math.PI/4);b(0,0,.17,.88,.025,.88,'#819e93',Math.PI/4);b(0,0,.19,.35,.025,.35,'#dbbb73',Math.PI/4);
    for(const side of [-1,1]){
      b(side*1.65,0,.20,.40,.18,2.65,'#c5b48f');b(side*1.65,0,.302,.29,.024,2.50,'#81a180');
      for(let j=-3;j<=3;j++){
        const x=promenadeCourt.x+side*1.65/step,z=promenadeCourt.z+j*.33/step;
        plant(x,z,.317,.31,.21+(j%2)*.025,j%2?'#648b70':'#88a77a');if(j===-2||j===2)flowers(x,z,.51,j);
      }
      for(let slat=-1;slat<=1;slat++)b(0,side*1.65+slat*.115,.31,1.75,.055,.09,'#ab8b63');
      for(const y of [.43,.55])b(0,side*1.84,y,1.75,.07,.055,'#b99b6f');
      for(const leg of [-1,1]){
        b(leg*.62,side*1.65,.20,.065,.25,.29,'#668575');
        b(leg*.62,side*1.84,.38,.05,.43,.05,'#668575');
      }
    }
  }
  // Courtyard paving and shallow pocket gardens occupy the spaces between
  // streets even while lots are still empty. Everything stays below a pawn.
  let courtCount=0;
  for(let x=3.4;x<=11.8;x+=1.05)for(let z=2.4;z<=17.4;z+=1.05){
    if(!inside(x,z,islands[1].points)||!onLand(x,z,.82)||!clear(x,z,.80)||scenicCourts.some(c=>Math.hypot(x-c.x,z-c.z)<(c.radius+.9)/step))continue;
    const park=courtCount++%3===0;
    box(x,.085,z,1.48,.018,1.48,park?'#b5bd93':'#dfd2b2').name='harbor_pocket_court';
    for(const side of [-1,1])box(x+side*.36,.103,z,.035,.012,1.32,'#b7a88c');
    box(x,.103,z,1.32,.012,.035,'#b7a88c');
    if(park){
      box(x,.12,z,.82,.05,.82,'#d9c8a1');box(x,.151,z,.69,.012,.69,'#8ca884');
      for(const dx of [-.17,.17])for(const dz of [-.17,.17])plant(x+dx/step,z+dz/step,.16,.28,.24,(dx===dz)?'#648b70':'#88a77a');
      flowers(x,z,.38,courtCount);
    }else{
      box(x+.24,.16,z+.24,.31,.10,.31,'#d3c3a0');box(x+.24,.215,z+.24,.25,.012,.25,'#91aa86');
      plant(x+.24,z+.24,.225,.26,.21,'#88a77a');if(courtCount%2)flowers(x+.24,z+.24,.42,courtCount);
    }
  }
  // Shared low-poly foliage batches add volume without a draw call per leaf.
  const plantingColors=[...new Set(gardenPlantings.map(p=>p.color))],plantMatrix=new THREE.Matrix4();
  for(const color of plantingColors){
    const rows=gardenPlantings.filter(p=>p.color===color),mesh=own(new THREE.InstancedMesh(bushGeo,mat(color),rows.length));mesh.name='harbor_court_planting';mesh.castShadow=true;mesh.receiveShadow=true;
    rows.forEach((p,i)=>{plantMatrix.makeScale(p.width/2,p.height/2,p.width/2).setPosition((p.x-cx)*step,p.y,(p.z-cy)*step);mesh.setMatrixAt(i,plantMatrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();root.add(mesh);
  }
  for(const [id,court] of [['water',waterCourt],['promenade',promenadeCourt]])if(court){
    createHarborProjectVisuals({THREE,root,id,center:new THREE.Vector3((court.x-cx)*step,0,(court.z-cy)*step),radius:court.radius,own});
  }
  updateHarborProjectVisuals(root,data?.harborProjects||[]);
  return root;
}

export function addHarborBridge({THREE,world,path,paths=[],start,end,own}){
  const group=new THREE.Group();group.name='harbor_sea_bridge';group.userData.cosmetic=true;world.add(group);
  path ||= [start,end];
  const material=own(new THREE.MeshStandardMaterial({color:'#e6cf9f',roughness:.83}));
  const trim=own(new THREE.MeshStandardMaterial({color:'#83a79c',roughness:.72}));
  function box(parent,w,h,d,x,y,z,mat=material){const m=new THREE.Mesh(own(new THREE.BoxGeometry(w,h,d)),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);}
  function clearRail(point){
    for(const route of paths)for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/Math.max(.0001,dx*dx+dz*dz)));
      if(Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz)<.32)return false;
    }
    return true;
  }
  for(let index=1;index<path.length;index++){
    const a=path[index-1],b=path[index],length=a.distanceTo(b),mid=a.clone().add(b).multiplyScalar(.5),part=new THREE.Group();part.position.set(mid.x,0,mid.z);part.rotation.y=Math.atan2(b.x-a.x,b.z-a.z);group.add(part);
    box(part,.85,.17,length,0,.09,0);
    part.updateWorldMatrix(true,false);
    // Rail gaps follow every adjoining street, including the shared return
    // route. A bridge must never fence a pawn out of the merge point.
    const n=Math.max(2,Math.ceil(length/.22));
    for(const side of [-1,1])for(let i=1;i<n-1;i++){
      const z=-length/2+(i+.5)*length/n,center=part.localToWorld(new THREE.Vector3(side*.41,.43,z));
      const q1=part.localToWorld(new THREE.Vector3(side*.41,.43,z-length/n*.5)),q2=part.localToWorld(new THREE.Vector3(side*.41,.43,z+length/n*.5));
      if(!clearRail(center)||!clearRail(q1)||!clearRail(q2))continue;
      box(part,.04,.045,length/n+.005,side*.41,.43,z,trim);
      if(i%2===0)box(part,.055,.27,.055,side*.41,.29,z,trim);
    }
    if(length>1)for(const f of [.28,.72])box(part,.58,.54,.20,0,-.22,-length/2+length*f);
  }
  return group;
}

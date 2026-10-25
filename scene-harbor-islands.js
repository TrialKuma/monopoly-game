// Harbor geography follows the playable graph. Coordinates use the same grid
// as game.js; this layer never changes movement or generates gameplay rewards.
export function createHarborIslands({THREE,world,boardBounds,own}) {
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
  const islands=[
    {name:'商贸岛',points:[[1.2,.9],[2.6,.2],[4.5,.35],[4.45,1.45],[3.15,2.3],[3.1,6.6],[4.75,8.4],[4.65,9.55],[3.3,9.45],[1.2,7.1]],grass:'#a8b485'},
    {name:'港口岛',points:[[5.35,.35],[6.55,.35],[7.4,1.7],[7.4,9.15],[6.65,10.65],[5.35,10.55],[5.05,8.7],[4.15,6.55],[4.1,2.2]],grass:'#b4bc8b'},
    {name:'度假岛',points:[[7.65,.35],[9.4,.2],[10.8,.9],[10.8,7.1],[8.7,9.45],[7.65,9.55],[7.65,8.4],[8.9,6.6],[8.85,2.3],[7.65,1.65]],grass:'#97b895'},
  ];
  for(const island of islands){
    const shoal=shape(island.points,-.40,.035,'#77c0bd',1.10);shoal.name='shallow_'+island.name;
    const sand=shape(island.points,-.35,.08,'#e6d2a0',1.06);sand.name='shore_'+island.name;
    shape(island.points,-.28,.26,'#b6ad8e');
    const land=shape(island.points,-.02,.10,island.grass);land.name='land_'+island.name;
  }
  // Open channels remain visibly water, with narrow quays and breakwaters.
  const ocean=new THREE.Mesh(own(new THREE.PlaneGeometry(180,180)),mat('#609eaa'));ocean.name='harbor_ocean';ocean.userData.preserveGroundColor=true;ocean.rotation.x=-Math.PI/2;ocean.position.y=-.415;ocean.receiveShadow=true;root.add(ocean);
  const waveGeo=own(new THREE.PlaneGeometry(.38,.026)),waveMat=own(new THREE.MeshBasicMaterial({color:'#bce4dd',transparent:true,opacity:.5,depthWrite:false}));
  for(let i=0;i<90;i++){const x=1+(i*2.371)%10,z=-.5+(i*1.727)%12;if((x>3.3&&x<4.1&&z>2.7&&z<7)||(x>7.85&&x<8.7&&z>2.7&&z<7)||x<.9||x>11.1||z<.1||z>10.8){const m=new THREE.Mesh(waveGeo,waveMat);m.rotation.x=-Math.PI/2;m.position.set((x-cx)*step,-.397,(z-cy)*step);root.add(m);}}
  // Docks, mooring bollards and small boats sit away from token corridors.
  for(const [x,z,side] of [[3.45,3.1,1],[3.45,5.6,1],[8.55,4.0,-1],[8.55,6.4,-1]]){
    box(x,-.01,z,.8,.13,.28,'#b58e66');
    for(let n=0;n<7;n++)box(x+(n-3)*.055,.07,z,.07,.022,.30,n%2?'#d2b289':'#c6a173');
    for(const end of [-1,1])box(x+end*.17,.14,z,.07,.15,.07,'#527774');
    const hull=box(x+side*.25,-.21,z+.24,.30,.13,.68,'#efddba',.1*side);hull.name='harbor_fishing_boat';
    box(x+side*.25,-.12,z+.24,.22,.09,.38,'#a75f50',.1*side);
    box(x+side*.25,.12,z+.24,.025,.5,.025,'#d6b375');
  }
  // Low salt gardens and terraced planting do not compete with the board.
  const rockGeo=own(new THREE.IcosahedronGeometry(1,0)),bushGeo=own(new THREE.IcosahedronGeometry(1,1));
  for(const [x,z] of [[1.35,2],[1.30,3.2],[1.3,4.5],[1.35,5.7],[1.65,7.2],[10.65,2.1],[10.7,3.4],[10.7,5.2],[10.6,6.7],[9.9,8.1],[5.8,7.9],[6.05,4.25]]){
    box(x,.08,z,.62,.12,.68,'#d9c9a1');box(x,.15,z,.48,.03,.54,'#817b5c');
    for(let j=0;j<3;j++){const bush=new THREE.Mesh(bushGeo,mat(j%2?'#729881':'#8aa278'));bush.position.set((x-cx)*step+(j-1)*.15,.25,(z-cy)*step);bush.scale.set(.19,.16,.22);root.add(bush);}
  }
  for(let i=0;i<28;i++){const left=i<14,j=i%14,x=left?1.0+Math.sin(j*.7)*.15:11+Math.sin(j*.7)*.15,z=1+j*.49;const rock=new THREE.Mesh(rockGeo,mat(i%2?'#b9b29a':'#94a8a0'));rock.position.set((x-cx)*step,-.15,(z-cy)*step);rock.scale.set(.20+(j%3)*.07,.12,.24);root.add(rock);}
  // A low civic garden fills the central island without covering a route.
  const plazaX=6.6,plazaZ=4.5;
  box(plazaX,.08,plazaZ,1.72,.06,2.90,'#d4c89f');
  box(plazaX,.117,plazaZ,1.56,.02,2.70,'#e5dabc');
  for(const [radius,h,color] of [[.53,.09,'#bac6b0'],[.43,.115,'#759f9d'],[.36,.125,'#91c9c1']]){
    const pool=new THREE.Mesh(own(new THREE.CylinderGeometry(radius,radius,.035,32)),mat(color));pool.position.set((plazaX-cx)*step,h+.10,(plazaZ-cy)*step);pool.receiveShadow=true;root.add(pool);
  }
  for(const z of [3.95,5.05]){
    box(plazaX,.30,z,.72,.06,.22,'#aa8864');
    for(const side of [-1,1])box(plazaX+side*.14,.20,z,.05,.20,.18,'#64877c');
  }
  for(const z of [3.05,5.55]){box(6.65,.095,z,1.2,.06,.46,'#c1bc94');box(6.65,.15,z,1.0,.05,.30,'#91a880');}
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

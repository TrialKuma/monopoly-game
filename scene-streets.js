// Regional paving and masonry. This module adds geometric edge detail without
// adding hit targets, touching game state, or owning an animation clock.
export const STREET_THEMES = {
  classic: { stone:'#c6ae88', trim:'#efddba', pavement:'#d6c3a2', joint:'#aa967a', garden:'#7e9d71', accent:'#778b83' },
  compact: { stone:'#8e9189', trim:'#c0bdad', pavement:'#b9b6a6', joint:'#777e76', garden:'#8ca477', accent:'#887454' },
  expansion: { stone:'#9e8980', trim:'#c9bc9d', pavement:'#b3a593', joint:'#746e68', garden:'#719181', accent:'#796a5d' },
  harbor: { stone:'#c5ad82', trim:'#f0dcac', pavement:'#e4cfa6', joint:'#a99574', garden:'#7d9c72', accent:'#bca06a' },
  alpine: { stone:'#a39d87', trim:'#d7c7a7', pavement:'#bdb39b', joint:'#827e70', garden:'#87a375', accent:'#9e8060' },
};

export function createStreetFoundation({THREE,world,boardBounds,mapId,islands=false}) {
  const theme=STREET_THEMES[mapId]||STREET_THEMES.classic;
  const root=new THREE.Group();root.name=`regional_streets_${mapId}`;root.userData.cosmetic=true;world.add(root);
  const resources=new Set(),groups=new Map(),dummy=new THREE.Object3D(),tint=new THREE.Color();
  const own=x=>{resources.add(x);return x;};
  const mat=color=>own(new THREE.MeshStandardMaterial({color,roughness:.82}));
  const mats={stone:mat(theme.stone),trim:mat(theme.trim),paving:mat(theme.pavement),joint:mat(theme.joint),garden:mat(theme.garden),accent:mat(theme.accent)};
  function roundedGeometry(w,h,d,r,bevel=.008){
    const s=new THREE.Shape(),x=-w/2,z=-d/2;
    s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+d-r);s.quadraticCurveTo(x+w,z+d,x+w-r,z+d);s.lineTo(x+r,z+d);s.quadraticCurveTo(x,z+d,x,z+d-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);
    const g=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,curveSegments:3});g.rotateX(-Math.PI/2);return own(g);
  }
  const block=roundedGeometry(1,.16,1,.045,.012);
  function add(kind,x,y,z,w,h,d,angle=0,shade=0,color='#ffffff'){
    const key=kind;if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({x,y,z,w,h,d,angle,shade,color});
  }
  function surface(w,h,d,r,material,x,y,z){const m=new THREE.Mesh(roundedGeometry(w,h,d,r),mats[material]);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;m.raycast=()=>{};root.add(m);return m;}
  const w=boardBounds.w,d=boardBounds.d;
  if(!islands){
  surface(w+1.18,.37,d+1.18,.46,'joint',0,-.42,0);
  surface(w+1.27,.075,d+1.27,.48,'trim',0,-.075,0);
  surface(w+.82,.08,d+.82,.33,'garden',0,.005,0);
  // Two offset masonry courses build a real edge below the paving cap.
  for(let row=0;row<2;row++){
    for(const side of [-1,1]){
      const count=Math.floor((w+.7)/.56),step=(w+.7)/count;
      for(let i=0;i<count;i++)add('stone',-w/2-.35+(i+.5)*step,-.36+row*.155,side*(d/2+.56),step-.015,.14,.18,0,((i+row)%5-2)*.025);
      const depthCount=Math.floor((d+.65)/.56),depthStep=(d+.65)/depthCount;
      for(let i=0;i<depthCount;i++)add('stone',side*(w/2+.56),-.36+row*.155,-d/2-.325+(i+.5)*depthStep,.18,.14,depthStep-.015,0,((i+row*2)%5-2)*.025);
    }
  }
  // Outer pavement: small chamfered slabs, inset drain stones and a curb.
  for(const side of [-1,1]){
    for(let axis=-w/2+.05;axis<w/2;axis+=.31){
      add('paving',axis,.09,side*(d/2+.24),.292,.025,.28,0,Math.sin(axis*7)*.025);
      add('trim',axis,.12,side*(d/2+.44),.292,.055,.115);
    }
    for(let axis=-d/2+.05;axis<d/2;axis+=.31){
      add('paving',side*(w/2+.24),.09,axis,.28,.025,.292,0,Math.sin(axis*5)*.025);
      add('trim',side*(w/2+.44),.12,axis,.115,.055,.292);
    }
  }
  }
  function parcel(group,width,depth,isProperty,edgeTint='#ffffff'){
    // Keep this below the existing deed frame. Geometry occupies only the plot,
    // never the inset walk where the token actually lands.
    const nx=Math.max(3,Math.round((width-.16)/.28)),nz=Math.max(3,Math.round((depth-.16)/.28));
    const sx=(width-.16)/nx,sz=(depth-.16)/nz;
    group.updateMatrix();
    const point=new THREE.Vector3();
    for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
      const edge=ix===0||iz===0||ix===nx-1||iz===nz-1;
      if(!edge&&isProperty)continue;
      point.set(-width/2+.08+(ix+.5)*sx,.025,-depth/2+.08+(iz+.5)*sz).applyMatrix4(group.matrix);
      add(edge?'paving':'accent',point.x,point.y,point.z,sx-.012,.018,sz-.012,group.rotation.y,((ix*7+iz*3)%5-2)*.022,edge?edgeTint:'#ffffff');
    }
  }
  function road(a,b){
    const distance=a.distanceTo(b),angle=Math.atan2(b.x-a.x,b.z-a.z),count=Math.max(2,Math.ceil(distance/.20));
    for(let i=1;i<count;i++){
      const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      for(const side of [-1,1])add('paving',x+Math.cos(angle)*side*.205,.186,z-Math.sin(angle)*side*.205,.19,.014,distance/count-.012,angle,((i+side)%3)*.02);
    }
  }
  function finish(){
    for(const [key,items] of groups){
      const m=own(new THREE.InstancedMesh(block,mats[key],items.length));m.name=`regional_${key}_masonry`;m.castShadow=true;m.receiveShadow=true;m.raycast=()=>{};
      items.forEach((it,i)=>{dummy.position.set(it.x,it.y,it.z);dummy.rotation.set(0,it.angle,0);dummy.scale.set(it.w,it.h/.16,it.d);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);tint.set(it.color).multiplyScalar(1+it.shade);m.setColorAt(i,tint);});
      m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;root.add(m);
    }
    groups.clear();root.userData.drawCount=root.children.length;
  }
  return {theme,parcel,road,finish,dispose(){root.removeFromParent();resources.forEach(x=>x.dispose());resources.clear();}};
}

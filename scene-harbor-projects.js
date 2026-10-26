// Permanent court upgrades are built once. Snapshot stages only reveal the
// authored additions; local UI animation never changes points or rewards.
import { createGroundLightPools } from './scene-scenic-lighting.js?v=20261027-night1';
export function createHarborProjectVisuals({THREE,root,id,center,radius,own}){
  const group=new THREE.Group();group.name='harbor_project_'+id;group.position.copy(center);root.add(group);
  const stages=[null,...[1,2,3].map(stage=>{const g=new THREE.Group();g.name=`harbor_project_${id}_stage_${stage}`;g.visible=false;group.add(g);return g;})];
  const materials=new Map(),glowMaterials=[],lampPositions=[];
  function mat(color,{glow=false,metal=false}={}){const key=color+':'+glow+':'+metal;if(!materials.has(key)){const m=own(new THREE.MeshStandardMaterial({color,roughness:metal?.38:.76,metalness:metal?.38:0,emissive:glow?color:'#000000',emissiveIntensity:glow?.55:0}));materials.set(key,m);if(glow){m.userData.projectBaseEmissive=.55;glowMaterials.push(m);}}return materials.get(key);}
  const boxGeo=own(new THREE.BoxGeometry(1,1,1)),budGeo=own(new THREE.IcosahedronGeometry(1,1));
  function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function box(parent,x,y,z,w,h,d,color,options){const m=mesh(parent,boxGeo,mat(color,options),x,y,z);m.scale.set(w,h,d);return m;}
  function cylinder(parent,x,y,z,r,h,color,options,segments=16){return mesh(parent,own(new THREE.CylinderGeometry(r,r,h,segments)),mat(color,options),x,y,z);}
  function tube(parent,points,width,color,options){return mesh(parent,own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),16,width,6,false)),mat(color,options));}
  function lamp(parent,x,z){
    cylinder(parent,x,.22,z,.13,.11,'#b9ad8d');box(parent,x,.47,z,.045,.48,.045,'#597f75');
    const head=box(parent,x,.75,z,.17,.20,.17,'#f2d890',{glow:true});head.name='harbor_project_lantern';head.userData.nightLightAnchor=true;
    box(parent,x,.87,z,.22,.045,.22,'#608779');lampPositions.push([x,.165,z]);
  }
  // Stage 1: an intentionally visible ring of low flower urns and lanterns.
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*(id==='water'?1.60:1.20),z=sz*1.27;lamp(stages[1],x,z);
    const px=sx*(id==='water'?1.68:1.32),pz=sz*.77;
    cylinder(stages[1],px,.27,pz,.17,.22,'#c8b594');
    const bush=mesh(stages[1],budGeo,mat('#7c9e78'),px,.45,pz);bush.scale.set(.20,.17,.20);
    for(let j=0;j<3;j++){const bud=mesh(stages[1],budGeo,mat(j%2?'#e4c58b':'#d79693'),px+(j-1)*.09,.58,pz+(j%2?.04:-.04));bud.scale.set(.055,.045,.055);}
  }
  const lampPools=createGroundLightPools({THREE,parent:stages[1],own,positions:lampPositions,radius:.70});
  if(id==='water'){
    // Stage 2: a compact tiered fountain sits in the existing water basin.
    cylinder(stages[2],0,.31,0,.34,.15,'#b8c7b2');cylinder(stages[2],0,.51,0,.095,.35,'#789d91');
    const bowl=mesh(stages[2],own(new THREE.SphereGeometry(.31,18,8,0,Math.PI*2,0,Math.PI/2)),mat('#a9c5b3'),0,.69,0);bowl.scale.y=.32;bowl.rotation.x=Math.PI;
    cylinder(stages[2],0,.90,0,.025,.40,'#b8e0d6',{glow:true},8);
    for(let i=0;i<4;i++){const a=i*Math.PI/2,c=Math.cos(a),s=Math.sin(a);tube(stages[2],[[0,1.10,0],[c*.25,1.03,s*.25],[c*.42,.72,s*.42],[c*.49,.28,s*.49]],.016,'#b8e0d6',{glow:true});}
    // Stage 3: the shell stands beside the rear pergola. The front terrace
    // sits behind a tall estate from the normal camera, so would hide it.
    const shellX=-1.30,shellZ=-1.67;
    cylinder(stages[3],shellX,.27,shellZ,.33,.19,'#bbad8a');cylinder(stages[3],shellX,.47,shellZ,.12,.27,'#bf9148',{metal:true});
    const shell=new THREE.Group();shell.position.set(shellX,.88,shellZ);shell.rotation.y=-.15;stages[3].add(shell);
    const shape=new THREE.Shape();shape.moveTo(-.13,-.28);shape.lineTo(.13,-.28);shape.lineTo(.50,0);
    for(let i=1;i<=24;i++){const a=i*Math.PI/24;shape.lineTo(Math.cos(a)*.50,Math.sin(a)*.50);}shape.closePath();
    const shellGeo=own(new THREE.ExtrudeGeometry(shape,{depth:.075,bevelEnabled:true,bevelThickness:.022,bevelSize:.025,bevelSegments:2,steps:1}));
    mesh(shell,shellGeo,mat('#d8ad57',{metal:true}),0,0,-.04);
    for(let i=0;i<=8;i++){const a=i*Math.PI/8;tube(shell,[[0,-.23,.065],[Math.cos(a)*.23,Math.sin(a)*.20,.10],[Math.cos(a)*.45,Math.sin(a)*.45,.065]],.015,'#f2d38d',{metal:true});}
  }else{
    // Stage 2: a bronze harbor anchor makes the promenade a civic square.
    cylinder(stages[2],0,.28,0,.42,.21,'#b9b99a');cylinder(stages[2],0,.43,0,.31,.10,'#758f80');
    box(stages[2],0,.81,.02,.075,.69,.075,'#668c80',{metal:true});box(stages[2],0,.98,.02,.57,.065,.075,'#668c80',{metal:true});
    mesh(stages[2],own(new THREE.TorusGeometry(.115,.035,8,20)),mat('#668c80',{metal:true}),0,1.20,.02);
    tube(stages[2],[[-.42,.72,.02],[-.30,.55,.02],[0,.52,.02],[.30,.55,.02],[.42,.72,.02]],.047,'#668c80',{metal:true});
    for(const side of [-1,1]){const fluke=box(stages[2],side*.39,.70,.02,.14,.08,.09,'#668c80',{metal:true});fluke.rotation.z=side*.65;}
    // Stage 3: the anchor becomes the relief on a gold harbor medal.
    const medal=cylinder(stages[3],0,.87,-.105,.59,.07,'#d4a856',{metal:true},32);medal.rotation.x=Math.PI/2;
    mesh(stages[3],own(new THREE.TorusGeometry(.58,.035,8,40)),mat('#f0d28d',{metal:true}),0,.87,-.055);
    for(let i=0;i<12;i++){const a=i*Math.PI/6,bud=mesh(stages[3],budGeo,mat('#f5df9e',{glow:true}),Math.cos(a)*.50,.87+Math.sin(a)*.50,-.01);bud.scale.set(.027,.027,.02);}
  }
  // A warm illuminated inlay rewards the final stage without tall towers or
  // point lights. It stays within the existing octagonal courtyard footprint.
  const inlayRadius=Math.min(radius-.28,2.32),gold=mat('#e1bd68',{glow:true,metal:true});
  const inlay=mesh(stages[3],own(new THREE.TorusGeometry(inlayRadius,.018,6,64)),gold,0,.153,0);inlay.rotation.x=Math.PI/2;
  for(let i=0;i<8;i++){const a=(i+.5)*Math.PI/4;const stud=mesh(stages[3],budGeo,gold,Math.cos(a)*inlayRadius,.18,Math.sin(a)*inlayRadius);stud.scale.set(.06,.035,.06);}
  root.updateWorldMatrix(true,true);
  const entry={id,anchor:group.localToWorld(new THREE.Vector3(0,.48,0)),labelAnchor:group.localToWorld(new THREE.Vector3(1.19,.30,-1.91)),group,stage:0,stages,initialized:false,revision:0,animation:null,glowMaterials,lampPools,night:0};
  (root.userData.harborProjects||={})[id]=entry;return entry;
}

export function updateHarborProjectVisuals(root,projects=[]){
  const entries=root?.userData?.harborProjects;if(!entries)return[];
  const changes=[];
  for(const entry of Object.values(entries)){
    const project=projects.find(p=>p.id===entry.id),requested=Number(project?.stage??0),stage=Math.max(0,Math.min(3,Number.isFinite(requested)?Math.floor(requested):0));
    const first=!entry.initialized,from=entry.stage;entry.initialized=true;
    if(!first&&stage===from)continue;
    entry.stage=stage;entry.stages.forEach((g,i)=>{if(g)g.visible=i<=stage;});
    if(stage!==from){entry.revision++;changes.push({id:entry.id,from,to:stage,celebrate:!first&&stage>from,anchor:entry.anchor});}
    entry.animation=!first&&stage>from?{started:null}:null;
    entry.group.scale.set(1,1,1);for(const material of entry.glowMaterials)material.emissiveIntensity=material.userData.projectBaseEmissive+entry.night*2.4;
  }
  return changes;
}

export function tickHarborProjectVisuals(root,time,options={}){
  const entries=root?.userData?.harborProjects;if(!entries)return false;
  const reduced=options.reducedMotion??globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  let dirty=false;
  for(const entry of Object.values(entries)){
    const night=Number.isFinite(options.night)?Math.max(0,Math.min(1,options.night)):entry.night;
    if(night!==entry.night){entry.night=night;dirty=true;entry.lampPools.update(night);for(const material of entry.glowMaterials)material.emissiveIntensity=material.userData.projectBaseEmissive+night*2.4;}
    if(!entry.animation)continue;dirty=true;
    if(entry.animation.started===null)entry.animation.started=time;
    const t=reduced?1:Math.min(1,Math.max(0,(time-entry.animation.started)/1100)),pulse=Math.sin(t*Math.PI);
    entry.group.scale.setScalar(1+pulse*.035);
    for(const material of entry.glowMaterials)material.emissiveIntensity=material.userData.projectBaseEmissive+entry.night*2.4+pulse*.55;
    if(t===1){entry.animation=null;entry.group.scale.setScalar(1);}
  }
  return dirty;
}

// Public projects live on the fixed coast, outside every buildable district.
// Their levels come from the same profile as land and collectible houses.
export function buildTownProjects({ THREE, parent, levels = {}, box, rounded, ellipsoid, tree, material, own }) {
  const p = { stone:'#c3bda4', cream:'#eee3c9', sand:'#d6c5a0', rock:'#8ea69d', grass:'#91ad82', leaf:'#4f8b76', teal:'#397879', dark:'#315c62', gold:'#dfb868', wood:'#ad845d', water:'#6eb8bb', glass:'#a8dbd5', flower:'#e8a67e' };
  const definitions = [
    {id:'garden', name:'海岸花园', x:-6.5,z:-1.65},
    {id:'waterfront', name:'滨水码头', x:-6.3,z:3.75},
    {id:'skyline', name:'海角灯塔', x:1.8,z:-6.35},
  ];
  function cylinder(g, r1, r2, h, color, x, y, z, n=16) {
    const mesh = new THREE.Mesh(own(new THREE.CylinderGeometry(r1,r2,h,n)), material(color)); mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true; g.add(mesh); return mesh;
  }
  function beam(g, a, b, radius, color) {
    const delta = new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
    const mesh = cylinder(g,radius,radius,delta.length(),color,...a,8); mesh.position.addScaledVector(delta,.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return mesh;
  }
  function ring(g, radius, tube, color, x,y,z) {
    const mesh = new THREE.Mesh(own(new THREE.TorusGeometry(radius,tube,5,24)),material(color)); mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.castShadow=true;g.add(mesh);return mesh;
  }
  function bench(g,x,z,yaw=0) {
    const b=new THREE.Group();b.position.set(x,0,z);b.rotation.y=yaw;g.add(b);
    box(b,.65,.07,.21,p.wood,0,.35,0);box(b,.65,.17,.035,p.teal,0,.46,-.1);
    for(const dx of [-.25,.25])box(b,.05,.2,.19,p.dark,dx,.22,0);
  }
  function planter(g,x,z,w=.65,d=.32) {
    rounded(g,w,.16,d,.09,p.cream,x,.17,z);
    rounded(g,w-.08,.035,d-.08,.06,p.sand,x,.34,z);
    for(let i=0;i<4;i++) {const xx=x+(i-1.5)*w/4;ellipsoid(g,.13,.12,.12,p.leaf,xx,.39,z);ellipsoid(g,.055,.05,.055,i%2?p.gold:p.flower,xx,.49,z+.02,0);}
  }
  function lantern(g,x,z,y=.82) {
    cylinder(g,.035,.05,y-.2,p.teal,x,(y+.2)/2,z,8);box(g,.16,.17,.16,p.gold,x,y+.08,z);cylinder(g,0,.14,.1,p.teal,x,y+.22,z,4);
  }
  function yacht(g,x,z,rotation=0,sail=false) {
    const boat=new THREE.Group();boat.position.set(x,-.26,z);boat.rotation.y=rotation;g.add(boat);
    const shape=new THREE.Shape();shape.moveTo(-.25,-.55);shape.lineTo(.25,-.55);shape.lineTo(.29,.15);shape.quadraticCurveTo(.22,.45,0,.65);shape.quadraticCurveTo(-.22,.45,-.29,.15);shape.closePath();
    const geo=own(new THREE.ExtrudeGeometry(shape,{depth:.17,bevelEnabled:false,curveSegments:4}));geo.rotateX(-Math.PI/2);
    const hull=new THREE.Mesh(geo,material(p.cream));boat.add(hull);hull.castShadow=true;
    rounded(boat,.39,.035,.75,.12,p.wood,0,.18,0);box(boat,.38,.06,.14,p.cream,0,.24,.23);
    if(sail){
      cylinder(boat,.025,.035,1.7,p.dark,0,1.02,-.03,8);
      const sailGeo=own(new THREE.BufferGeometry());sailGeo.setAttribute('position',new THREE.Float32BufferAttribute([.035,.45,-.05,.035,1.83,-.05,.035,.46,.77],3));sailGeo.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0,1,1,0],2));sailGeo.computeVertexNormals();
      const sailMesh=new THREE.Mesh(sailGeo,material(p.cream,{side:THREE.DoubleSide}));boat.add(sailMesh);sailMesh.castShadow=true;
      beam(boat,[0,.44,-.03],[0,.44,.77],.025,p.gold);
      const jib=sailMesh.clone();jib.geometry=own(sailGeo.clone());jib.scale.set(1,.7,-.57);jib.position.y=.14;boat.add(jib);
    }else{rounded(boat,.32,.2,.34,.06,p.teal,0,.2,-.13);box(boat,.36,.035,.39,p.cream,0,.41,-.13);}
  }
  const result=[];
  for(const def of definitions) {
    const level=Math.max(0,Math.min(3,Number(levels[def.id])||0));
    const g=new THREE.Group();g.position.set(def.x,0,def.z);g.name=`town-public-${def.id}-${level}`;g.userData.projectId=def.id;parent.add(g);
    if(def.id==='garden') {
      rounded(g,3.05,.29,3.05,.7,p.rock,0,-.34,0);rounded(g,2.83,.19,2.85,.6,p.sand,0,-.06,0);rounded(g,2.62,.04,2.65,.5,p.grass,0,.13,0);
      rounded(g,2.6,.035,.38,.08,p.cream,0,.18,.87);rounded(g,.35,.035,1.92,.08,p.cream,.86,.18,-.1);
      if(level===0) {rounded(g,1.45,.08,1.35,.2,p.sand,-.18,.17,-.15);for(const x of [-.75,.4])planter(g,x,.35,.5,.25);}
      if(level>=1) {
        for(const [x,z] of [[-.78,-.85],[.55,-.85],[-.78,.4],[.55,.4]])planter(g,x,z,.7,.38);
        bench(g,-.8,.95);lantern(g,1,.95,.66);
        const grove=new THREE.Group();grove.position.y=-.1;g.add(grove);tree(grove,-1.02,-.2,.54);
      }
      if(level===1) {rounded(g,.82,.035,.85,.25,p.cream,.1,.17,-.2);cylinder(g,.22,.3,.16,p.cream,.1,.28,-.2);ellipsoid(g,.28,.21,.28,p.leaf,.1,.45,-.2);}
      if(level===2) {
        cylinder(g,.66,.71,.09,p.cream,0,.24,-.22,20);cylinder(g,.56,.59,.06,p.water,0,.3,-.22,20);ring(g,.63,.045,p.cream,0,.31,-.22);
        cylinder(g,.09,.16,.45,p.cream,0,.5,-.22);cylinder(g,.3,.1,.07,p.gold,0,.74,-.22,16);cylinder(g,.25,.25,.025,p.water,0,.79,-.22,16);ellipsoid(g,.045,.21,.045,p.water,0,.96,-.22);
      }
      if(level===3) {
        const hall=new THREE.Group();hall.position.set(-.12,.19,-.24);g.add(hall);
        rounded(hall,1.35,.11,1.22,.08,p.cream,0,0,0);
        for(const x of [-.58,.58])for(const z of [-.52,0,.52])box(hall,.055,.82,.055,p.cream,x,.48,z);
        for(const z of [-.52,.52])for(const x of [-.58,0,.58])box(hall,.055,.82,.055,p.cream,x,.48,z);
        box(hall,1.18,.045,1.06,p.cream,0,.88,0);
        for(const x of [-.59,.59]) {box(hall,.018,.64,1,p.glass,x,.49,0);for(const z of [-.26,.26])box(hall,.035,.68,.035,p.cream,x,.5,z);}
        box(hall,1.1,.64,.018,p.glass,0,.49,-.525);
        for(const z of [-.56,0,.56]) {beam(hall,[-.67,.89,z],[0,1.39,z],.025,p.cream);beam(hall,[0,1.39,z],[.67,.89,z],.025,p.cream);}
        for(const side of [-1,1]) {const roof=box(hall,.84,.025,1.15,p.glass,side*.34,1.13,0);roof.rotation.z=side*-.64;}
        box(hall,.055,.055,1.2,p.gold,0,1.4,0);cylinder(hall,0,.08,.12,p.gold,0,1.48,-.58,8);cylinder(hall,0,.08,.12,p.gold,0,1.48,.58,8);
        planter(hall,-.28,.1,.4,.3);planter(hall,.28,-.1,.4,.3);
        rounded(g,.65,.08,.34,.08,p.cream,-.12,.18,.54);
      }
    } else if(def.id==='waterfront') {
      rounded(g,2.5,.025,3.6,.7,'#a9d1c6',-.05,-.407,.4);
      rounded(g,1.24,.25,1.05,.25,p.rock,.5,-.3,-1);rounded(g,1.2,.07,1,.2,p.cream,.5,-.04,-1);
      const deck=(x,z,w,d)=>{box(g,w,.12,d,p.wood,x,-.015,z);for(let dz=-d/2+.08;dz<d/2;dz+=.17)box(g,w+.015,.018,.023,p.cream,x,.054,z+dz);};
      const post=(x,z)=>{cylinder(g,.05,.065,.6,p.wood,x,-.13,z,8);cylinder(g,.08,.08,.05,p.cream,x,.2,z,8);};
      if(level===0){for(const z of [-.6,.5])for(const x of [.05,.8])post(x,z);box(g,.7,.08,.3,p.wood,.43,.02,-.63);}
      if(level>=1){deck(.42,-.02,.78,1.94);for(const z of [-.85,.8])for(const x of [.05,.8])post(x,z);for(const x of [.05,.8])box(g,.04,.035,1.65,p.cream,x,.38,-.05);lantern(g,.84,-.83,.74);}
      if(level>=2){deck(-.15,.82,1.92,.46);for(const x of [-1.03,.8])post(x,.82);yacht(g,-.6,-.12,-.08,false);bench(g,.42,-1.03);}
      if(level===3){
        deck(-.97,1.35,.32,1.25);post(-.97,1.91);yacht(g,-.28,1.61,.05,true);
        for(const [x,z,w,d] of [[-1.38,.6,.22,2.6],[-.24,2.18,2.45,.25]]) {box(g,w,.29,d,p.rock,x,-.23,z);box(g,w+.04,.055,d+.04,p.cream,x,-.06,z);}
        const canopy=box(g,.93,.045,.69,p.teal,.44,.89,-.5);canopy.rotation.z=.06;for(const x of [.05,.82])for(const z of [-.75,-.25])box(g,.04,.86,.04,p.cream,x,.43,z);
      }
    } else {
      ellipsoid(g,1.7,.025,1.32,'#a9d1c6',0,-.4,0);
      rounded(g,2.53,.3,2.1,.7,p.rock,0,-.34,0);rounded(g,2.24,.22,1.85,.55,p.sand,0,-.05,0);rounded(g,2.02,.06,1.65,.45,p.grass,0,.17,0);
      cylinder(g,.79,.83,.08,p.cream,0,.25,0,20);
      if(level===0){cylinder(g,.44,.47,.035,p.sand,0,.3,0,16);for(const x of [-.65,.65])cylinder(g,.06,.07,.22,p.cream,x,.39,0,8);}
      if(level>=1){
        for(let i=0;i<9;i++){const a=Math.PI*.1+i*Math.PI*1.8/8;const x=Math.cos(a)*.78,z=Math.sin(a)*.78;cylinder(g,.025,.025,.34,p.teal,x,.46,z,6);}
        ring(g,.78,.025,p.teal,0,.63,0);bench(g,-.65,.59,.6);planter(g,.7,.45,.42,.27);
      }
      if(level>=2){
        const h=level===3?1.65:1.12;
        cylinder(g,.3,.43,h,p.cream,0,.3+h/2,0,12);
        cylinder(g,.35,.38,.2,p.teal,0,.76,0,12);box(g,.17,.32,.03,p.dark,0,.48,.43);
        for(const y of [.98,1.5])if(y<h+.18){box(g,.12,.17,.025,p.dark,0,y,.33);box(g,.025,.17,.12,p.dark,.33,y,0);}
        cylinder(g,.5,.45,.1,p.cream,0,h+.36,0,16);cylinder(g,.3,.3,.39,p.gold,0,h+.6,0,12);
        for(let i=0;i<8;i++){const a=i*Math.PI/4;box(g,.04,.42,.04,p.teal,Math.sin(a)*.28,h+.6,Math.cos(a)*.28);}
        cylinder(g,.02,.49,.25,p.teal,0,h+.93,0,12);cylinder(g,.025,.025,.2,p.gold,0,h+1.15,0,8);
        if(level===3){
          ring(g,.5,.035,p.gold,0,h+.44,0);ring(g,.5,.035,p.cream,0,h+.79,0);
          for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.sin(a)*.48,z=Math.cos(a)*.48;beam(g,[x,h+.43,z],[x*.8,h+.97,z*.8],.018,p.gold);ellipsoid(g,.045,.06,.045,p.gold,x,h+.8,z,0);}
          for(const x of [-.85,.85])lantern(g,x,-.35,.72);
        }
      }
    }
    // All details retain a project id after batching by the scene.
    result.push({...def,level,group:g});
  }
  return result;
}

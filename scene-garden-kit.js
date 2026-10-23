import { mergeGeometries } from './assets/vendor/three/addons/utils/BufferGeometryUtils.js';

// Authored landscape shapes shared by destination gardens. All random-looking
// variation is a pure function of a local seed, independent of the dice RNG.
export function createGardenKit({ THREE, own, root, palette }) {
  const up = new THREE.Vector3(0, 1, 0);
  const noise = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const material = (color, extra = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: .86, ...extra }));
  const colors = {
    stone: material(palette.stone), stoneLight: material(palette.stoneLight), stoneDark: material(palette.stoneDark),
    path: material(palette.path), mortar: material(palette.mortar), soil: material(palette.soil), grass: material(palette.grass),
    timber: material(palette.timber), timberLight: material(palette.timberLight), metal: material(palette.metal),
    foliage: material('#ffffff', { vertexColors: true }), leaf: material(palette.leaf), leafLight: material(palette.leafLight),
    flowers: material(palette.flowers), flowerLight: material(palette.flowerLight), foam: material('#e6f1e7'),
    water: material(palette.water, { roughness: .26, metalness: .18 }),
    warm: material('#ffd786', { emissive: '#ffb951', emissiveIntensity: .3 }),
  };
  // Explicit plant roles survive static batching. Decorative stone, fabric,
  // windows and warm lights must not be guessed from a color or map name.
  for(const [key,kind] of Object.entries({grass:'grass',leaf:'leaf',leafLight:'crown',foliage:'evergreen',flowers:'crown',flowerLight:'crown'}))colors[key].userData.seasonalKind=kind;
  const cached = new Map();
  function geo(key, build) { if (!cached.has(key)) cached.set(key, own(build())); return cached.get(key); }
  const sphere = geo('pebble', () => new THREE.IcosahedronGeometry(1, 1));
  const flowerBud = geo('flower-bud', () => new THREE.IcosahedronGeometry(1, 0));
  const cylinder = geo('rod', () => new THREE.CylinderGeometry(1, 1, 1, 8));
  const circle = geo('disc', () => new THREE.CylinderGeometry(1, 1, 1, 24));
  function add(geometry, mat, position = [0, 0, 0], scale = [1, 1, 1], yaw = 0, parent = root) {
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.y = yaw;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.raycast = () => {}; parent.add(mesh); return mesh;
  }
  function roundedPolygon(points, radius = .07) {
    const shape = new THREE.Shape();
    points.forEach((p, i) => {
      const previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
      const before = new THREE.Vector2(...previous).sub(new THREE.Vector2(...p)).normalize().multiplyScalar(radius).add(new THREE.Vector2(...p));
      const after = new THREE.Vector2(...next).sub(new THREE.Vector2(...p)).normalize().multiplyScalar(radius).add(new THREE.Vector2(...p));
      if (!i) shape.moveTo(before.x, before.y); else shape.lineTo(before.x, before.y);
      shape.quadraticCurveTo(p[0], p[1], after.x, after.y);
    }); shape.closePath(); return shape;
  }
  function slabGeometry(seed = 0) {
    return geo(`slab${seed % 5}`, () => {
      // A chamfered stone has 60 triangles, not the hundreds produced by a
      // bevelled curved extrusion. Its broad face reads cleanly on a phone.
      const outline=[[-.44,-.38],[.44,-.38],[.50,-.32],[.50,.32],[.44,.38],[-.44,.38],[-.50,.32],[-.50,-.32]];
      const positions=[],uv=[],indices=[],rings=[[.94,0],[1,.023],[1,.13],[.94,.155]];
      rings.forEach(([scale,y],row)=>outline.forEach(([x,z],i)=>{positions.push(x*scale,y,z*scale);uv.push(x+.5,z+.5);if(row<3){const k=row*8+i,n=row*8+(i+1)%8;indices.push(k,k+8,n,n,k+8,n+8);}}));
      for(let i=1;i<7;i++){indices.push(0,i,i+1);indices.push(24,25+i,24+i);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);
      const result=g.toNonIndexed();g.dispose();result.computeVertexNormals();return result;
    });
  }
  function stone(x, y, z, sx, sy, sz, seed = 0, mat = colors.stone, parent = root) {
    return add(slabGeometry(seed), mat, [x,y,z], [sx,sy/.155,sz], noise(seed)*.10-.05, parent);
  }
  function rod(a, b, radius, mat = colors.timber, parent = root) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start);
    const mesh = add(cylinder, mat, start.clone().add(end).multiplyScalar(.5).toArray(), [radius,direction.length(),radius], 0, parent);
    mesh.quaternion.setFromUnitVectors(up, direction.normalize()); return mesh;
  }
  function curve(points) { return new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal'); }
  function ribbon(points, width, mat, parent = root, segments = 48, profile = () => 0) {
    const route = curve(points), positions = [], uv = [], indices = [];
    for (let i=0;i<=segments;i++) {
      const t=i/segments, p=route.getPoint(t), tangent=route.getTangent(t), n=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
      const half = typeof width === 'function' ? width(t)/2 : width/2;
      for(const side of [-1,1]){const q=p.clone().addScaledVector(n,side*half);positions.push(q.x,q.y+profile(t,side),q.z);uv.push(t,side>0?1:0);}
      if(i<segments){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const mesh=add(own(geometry),mat,[0,0,0],[1,1,1],0,parent);mesh.castShadow=false;return route;
  }
  function island(x,z,rx,rz,y,height,seed=0,mat=colors.grass,parent=root) {
    const points=[];for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=1+(noise(seed+i)-.5)*.11;points.push([Math.cos(a)*rx*r,Math.sin(a)*rz*r]);}
    const shape=roundedPolygon(points,.12),geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:true,bevelThickness:.045,bevelSize:.055,bevelSegments:2,curveSegments:3});geometry.rotateX(-Math.PI/2);
    return add(own(geometry),mat,[x,y,z],[1,1,1],0,parent);
  }
  function pavedPath(points,width=.65,seed=0,parent=root) {
    const route=ribbon(points,width,colors.mortar,parent),length=route.getLength(),rows=Math.max(2,Math.ceil(length/.28));
    for(let i=0;i<=rows;i++) {
      const t=i/rows,p=route.getPoint(t),tangent=route.getTangent(t),n=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
      const columns=width>.75?3:2;
      for(let j=0;j<columns;j++){
        const q=p.clone().addScaledVector(n,(j-(columns-1)/2)*width/columns+(noise(seed+i*7+j)-.5)*.055);
        const tile=stone(q.x,q.y+.004,q.z,width/columns*.86,.032,.29,seed+i*7+j,(i+j)%7===0?colors.stoneLight:colors.path,parent);tile.rotation.y=Math.atan2(tangent.x,tangent.z)+(noise(i+seed)-.5)*.16;
      }
    } return route;
  }
  function wall(points,height=.42,seed=0,parent=root,cap=true) {
    const route=curve(points),count=Math.max(1,Math.ceil(route.getLength()/.39)),courses=Math.max(1,Math.ceil(height/.19));
    for(let course=0;course<courses;course++)for(let i=0;i<count;i++){
      const t=Math.min(1,(i+(course%2)*.45+.2)/count),p=route.getPoint(t),direction=route.getTangent(t);
      const block=stone(p.x,p.y+course*height/courses,p.z,.39,height/courses*.87,.30,seed+course*11+i,(i+course)%5===0?colors.stoneDark:colors.stone,parent);
      block.rotation.y=Math.atan2(direction.x,direction.z)+Math.PI/2;
    }
    if(cap)for(let i=0;i<count;i++){const p=route.getPoint((i+.5)/count),t=route.getTangent((i+.5)/count);const tile=stone(p.x,p.y+height,p.z,.41,.065,.39,seed+i,colors.stoneLight,parent);tile.rotation.y=Math.atan2(t.x,t.z)+Math.PI/2;}
    return route;
  }
  function bankEllipse(x,z,rx,rz,y,height,seed,parent=root,gap=()=>false) {
    const count=Math.ceil(Math.PI*2*Math.sqrt((rx*rx+rz*rz)/2)/.35);
    for(let i=0;i<count;i++){
      const a=i/count*Math.PI*2;if(gap(a))continue;
      const points=[];for(let j=0;j<3;j++){const b=(i+j*.52)/count*Math.PI*2;points.push([x+Math.cos(b)*rx,y,z+Math.sin(b)*rz]);}
      wall(points,height,seed+i,parent,true);
    }
  }
  function boulder(x,y,z,sx,sy,sz,seed=0,parent=root) {
    const geometry=geo(`boulder${seed%7}`,()=>{
      const g=new THREE.IcosahedronGeometry(1,1),p=g.attributes.position;
      for(let i=0;i<p.count;i++){const r=.88+noise(seed*3+i)*.24;p.setXYZ(i,p.getX(i)*r,p.getY(i)*r,p.getZ(i)*r);}g.computeVertexNormals();return g;
    }); return add(geometry,seed%3===0?colors.stoneDark:colors.stone,[x,y,z],[sx,sy,sz],noise(seed)*6.2,parent);
  }
  function bush(x,y,z,size=.35,seed=0,parent=root,bloom=false) {
    for(let i=0;i<5;i++){
      const a=i*2.4+seed,r=i?size*.42:0,scale=size*(.47+noise(seed+i)*.23);
      add(sphere,i%3?colors.leaf:colors.leafLight,[x+Math.cos(a)*r,y+scale*.65,z+Math.sin(a)*r],[scale,scale*.76,scale],a,parent);
    }
    if(bloom)for(let i=0;i<9;i++){
      const a=i*2.399+seed,r=Math.sqrt((i+.5)/9)*size*.72;
      add(flowerBud,i%3?colors.flowers:colors.flowerLight,[x+Math.cos(a)*r,y+size*.64+noise(i+seed)*.13,z+Math.sin(a)*r],[.045,.035,.045],a,parent);
    }
  }
  function fir(x,y,z,size=1,seed=0,parent=root) {
    rod([x,y,z],[x,y+size*.77,z],size*.047,colors.timber,parent);
    const foliage=geo(`fir${seed%5}`,()=>{
      const positions=[],rgb=[],indices=[],uv=[],rings=[[0,.11],[.09,.44],[.17,.34],[.28,.22],[.30,.36],[.43,.24],[.51,.14],[.54,.26],[.67,.15],[.75,.08],[.79,.16],[.91,.075],[1,0]];
      const segments=10,base=new THREE.Color(palette.leaf),light=new THREE.Color(palette.leafLight);
      rings.forEach(([h,r],row)=>{for(let j=0;j<segments;j++){
        const a=j/segments*Math.PI*2+(row%3)*.12,rad=r*(1+(noise(seed+j*4+row)-.5)*.26);
        positions.push(Math.cos(a)*rad,h,Math.sin(a)*rad);uv.push(j/segments,h);
        const c=base.clone().lerp(light,.15+noise(j+row*4)*.4);rgb.push(c.r,c.g,c.b);
        if(row<rings.length-1){const k=row*segments+j,n=row*segments+(j+1)%segments;indices.push(k,k+segments,n,n,k+segments,n+segments);}
      }});
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(positions.length),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));g.setIndex(indices);g.computeVertexNormals();return g;
    });add(foliage,colors.foliage,[x,y+size*.16,z],[size,size*1.35,size],noise(seed)*6.28,parent);
    for(let i=0;i<3;i++){const a=seed+i*2.1;rod([x,y+size*.4,z],[x+Math.cos(a)*size*.24,y+size*.47,z+Math.sin(a)*size*.24],size*.018,colors.timber,parent);}
  }
  function broadTree(x,y,z,size=1,seed=0,parent=root) {
    rod([x,y,z],[x,y+size*.8,z],.06*size,colors.timber,parent);
    for(let i=0;i<5;i++){
      const a=i*2.4+seed,dx=Math.cos(a)*size*.25,dz=Math.sin(a)*size*.25;
      rod([x,y+size*.4,z],[x+dx,y+size*.87,z+dz],.026*size,colors.timber,parent);
      add(sphere,i%2?colors.leafLight:colors.leaf,[x+dx,y+size*(.82+(i%2)*.2),z+dz],[size*.36,size*.38,size*.33],a,parent);
    }
  }
  function stoneArch(x,y,z,length=2.0,width=.8,height=.55,yaw=0,parent=root) {
    const group=new THREE.Group();group.position.set(x,y,z);group.rotation.y=yaw;parent.add(group);
    const span=length*.42,rise=height*.72,shape=new THREE.Shape();
    shape.moveTo(-length/2,0);shape.lineTo(-span,0);
    for(let i=0;i<=16;i++){const a=Math.PI-i/16*Math.PI;shape.lineTo(Math.cos(a)*span,Math.sin(a)*rise);}
    shape.lineTo(length/2,0);shape.lineTo(length/2,height);shape.lineTo(-length/2,height);shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:1,curveSegments:2});g.translate(0,0,-width/2);add(own(g),colors.stone,[0,0,0],[1,1,1],0,group);
    for(const side of [-1,1]){
      for(let i=0;i<11;i++){
        const a=(i+.5)/11*Math.PI,b=.18,r=.04;const wedge=stone(Math.cos(a)*span,Math.sin(a)*rise-.015,side*(width/2+.025),b,.12,.09,30+i,colors.stoneLight,group);wedge.rotation.z=Math.atan2(Math.cos(a)*rise,-Math.sin(a)*span);wedge.rotation.y=0;
      }
      rod([-length/2,height+.25,side*width*.46],[length/2,height+.25,side*width*.46],.025,colors.metal,group);
      for(let i=0;i<6;i++)rod([-length/2+i*length/5,height,side*width*.46],[-length/2+i*length/5,height+.27,side*width*.46],.02,colors.metal,group);
    }
    pavedPath([[-length/2,height+.025,0],[0,height+.025,0],[length/2,height+.025,0]],width*.86,41,group);
    return group;
  }
  function woodBridge(points,width=.72,parent=root) {
    const route=curve(points),length=route.getLength(),count=Math.ceil(length/.16);
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,p=route.getPoint(t),tangent=route.getTangent(t),n=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
      rod(p.clone().addScaledVector(n,-width/2).toArray(),p.clone().addScaledVector(n,width/2).toArray(),.064,i%4?colors.timber:colors.timberLight,parent);
      if(i%3===0||i===count-1)for(const side of [-1,1]){const q=p.clone().addScaledVector(n,side*width*.48);rod([q.x,q.y-.16,q.z],[q.x,q.y+.33,q.z],.034,colors.timber,parent);}
    }
    for(const side of [-1,1]){
      let last=null;for(let i=0;i<=12;i++){const t=i/12,p=route.getPoint(t),tangent=route.getTangent(t),n=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();p.addScaledVector(n,side*width*.48);p.y+=.27;if(last)rod(last.toArray(),p.toArray(),.022,colors.timberLight,parent);last=p;}
    }return route;
  }
  function lantern(x,y,z,parent=root) {
    rod([x,y,z],[x,y+.63,z],.024,colors.metal,parent);
    add(circle,colors.metal,[x,y+.65,z],[.11,.045,.11],0,parent);
    add(circle,colors.warm,[x,y+.56,z],[.075,.15,.075],0,parent);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;rod([x+Math.cos(a)*.08,y+.48,z+Math.sin(a)*.08],[x+Math.cos(a)*.08,y+.65,z+Math.sin(a)*.08],.009,colors.metal,parent);}
  }
  function meadowStrip(points,widths,heights,seed=0,parent=root) {
    const route=curve(points),segments=48,cross=6,positions=[],uv=[],indices=[];
    for(let i=0;i<=segments;i++){
      const t=i/segments,p=route.getPoint(t),direction=route.getTangent(t),n=new THREE.Vector3(-direction.z,0,direction.x).normalize();
      for(let j=0;j<=cross;j++){
        const u=j/cross,w=typeof widths==='function'?widths(t):widths,h=heights(t,u),q=p.clone().addScaledVector(n,(u-.5)*w);
        positions.push(q.x,p.y+h,q.z);uv.push(t,u);
        if(i<segments&&j<cross){const a=i*(cross+1)+j;indices.push(a,a+1,a+cross+1,a+1,a+cross+2,a+cross+1);}
      }
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();add(own(g),colors.grass,[0,0,0],[1,1,1],0,parent);
  }
  function finish() {
    // Bake nested static parts into one mesh per material and parent branch.
    for(const branch of [root,...root.children.filter(c=>c.userData.gardenBatch)]){
      const batches=new Map(),materialIds=new Map(),remove=[];branch.updateMatrixWorld(true);const inverse=new THREE.Matrix4().copy(branch.matrixWorld).invert();
      branch.traverse(node=>{
        if(!node.isMesh||node.userData.gardenDynamic||node.parent===null)return;
        let p=node.parent;while(p!==branch&&p){if(p.userData.gardenDynamic||p.userData.gardenBatch)return;p=p.parent;}
        if(!p)return;
        if(!materialIds.has(node.material))materialIds.set(node.material,materialIds.size);
        const key=materialIds.get(node.material)+String(node.castShadow);let geometry=node.geometry.clone();if(geometry.index){const indexed=geometry;geometry=indexed.toNonIndexed();indexed.dispose();}
        // Standardize optional attributes so trees share batches safely.
        if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
        if(geometry.attributes.color&&!node.material.vertexColors)geometry.deleteAttribute('color');
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld));
        if(!batches.has(key))batches.set(key,{material:node.material,shadow:node.castShadow,geometries:[]});batches.get(key).geometries.push(geometry);remove.push(node);
      });
      remove.forEach(node=>node.removeFromParent());
      for(const {material,shadow,geometries} of batches.values()){
        const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());if(!merged)throw new Error('Garden batch attributes must match');
        const mesh=add(own(merged),material,[0,0,0],[1,1,1],0,branch);mesh.name='garden_batch';mesh.castShadow=shadow;
      }
    }
    return colors;
  }
  return { colors, noise, add, material, stone, rod, ribbon, island, pavedPath, wall, bankEllipse, boulder, bush, fir, broadTree, stoneArch, woodBridge, lantern, meadowStrip, curve, finish, sphere, circle };
}

// Complete authored courtyard and terrain, kept separate from AI asset loading.
export function buildDestinationGarden({THREE,own,root,perimeter,mapId,w,d,innerW,innerD,waves,boats,steam}) {
  const alpine=mapId==='alpine',heroZ=-innerD*.25,plots=[];
  const palette=alpine
    ?{stone:'#9fa99c',stoneLight:'#cbd1bd',stoneDark:'#758d87',path:'#d4cbb2',mortar:'#989c89',soil:'#8e9071',grass:'#91ad7f',timber:'#86664b',timberLight:'#b99b72',metal:'#4d6966',leaf:'#3e7460',leafLight:'#75a080',flowers:'#d9a773',flowerLight:'#eee3bc',water:'#69b6b2'}
    :{stone:'#c6b794',stoneLight:'#e6d9b9',stoneDark:'#9d977c',path:'#e8ddc0',mortar:'#a9a58b',soil:'#a5926c',grass:'#a8bb85',timber:'#957051',timberLight:'#c3a27c',metal:'#456b66',leaf:'#608e63',leafLight:'#91ad6d',flowers:'#d78a9a',flowerLight:'#f7cf9b',water:'#51adb6'};
  const garden=createGardenKit({THREE,own,root,palette});
  const {colors:c,noise,add,material,stone,rod,ribbon,island,pavedPath,wall,bankEllipse,boulder,bush,fir,broadTree,stoneArch,woodBridge,lantern,meadowStrip,circle}=garden;
  perimeter.userData.gardenBatch=true;
  function disc(x,y,z,r,h,mat,parent=root){return add(circle,mat,[x,y,z],[r,h,r],0,parent);}
  function dynamicGroup(parent=perimeter){const group=new THREE.Group();group.userData.gardenDynamic=true;parent.add(group);return group;}
  function rimPath(cx,cz,rx,rz,y,start,end,seed,parent=root){const points=[];for(let i=0;i<=20;i++){const a=start+(end-start)*i/20;points.push([cx+Math.cos(a)*rx,y,cz+Math.sin(a)*rz]);}pavedPath(points,.45,seed,parent);}
  function planting(x,z,rx,rz,seed,parent=root,y=.12){island(x,z,rx,rz,y,.045,seed,c.soil,parent);for(let i=0;i<5;i++){const a=i*2.4+seed,r=Math.sqrt((i+.5)/5);bush(x+Math.cos(a)*rx*r*.7,y+.05,z+Math.sin(a)*rz*r*.7,.19+noise(seed+i)*.13,seed+i,parent,i%2===0);}}

  // Connected island garden; all tall pieces stay within the courtyard or
  // outside the board. The fountain origin is shared with scene-life.
  island(0,0,innerW*.48,innerD*.48,-.02,.115,12,c.grass);
  const lakeRX=innerW*.44,lakeRZ=innerD*.235;
  island(0,heroZ,lakeRX+.08,lakeRZ+.08,.057,.025,19,c.stoneDark);
  island(0,heroZ,lakeRX,lakeRZ,.095,.012,19,c.water).castShadow=false;
  bankEllipse(0,heroZ,lakeRX+.06,lakeRZ+.03,.035,.115,100,root,a=>a>1.15&&a<1.7);
  island(0,heroZ,1.52,1.51,.04,.17,27,c.stone);
  bankEllipse(0,heroZ,1.53,1.5,.025,.16,170,root,a=>a>1.1&&a<1.8);
  island(0,heroZ,1.46,1.44,.215,.012,27,c.path);
  for(const side of [-1,1]){const x=side*(innerW/2-.48);planting(x,heroZ+1.1,.26,.48,200+side);boulder(x,.14,heroZ-.75,.19,.13,.26,220+side);}
  island(0,2,Math.min(1.67,innerW*.41),1.23,.065,.08,40,c.mortar);
  rimPath(0,2,1.25,1.0,.17,0,Math.PI*2,260);
  bankEllipse(0,2,1.57,1.21,.06,.08,290,root,a=>Math.abs(Math.cos(a))<.35);
  disc(0,.19,2,.85,.12,c.stoneLight);disc(0,.26,2,.70,.05,c.water);disc(0,.42,2,.13,.32,c.stone);disc(0,.62,2,.34,.08,c.stoneLight);disc(0,.79,2,.075,.27,c.stone);
  pavedPath([[0,.14,innerD*.46],[-.28,.14,3.7],[-.45,.17,2.95]],.75,320);
  pavedPath([[.15,.19,1.03],[.75,.20,.58],[1.03,.20,.15]],.71,350);
  const bridgeStart=heroZ+1.38;
  if(alpine){
    ribbon([[1.55,.105,heroZ+.95],[1.25,.105,-.9],[1.55,.105,.1],[1.9,.105,.65]],.58,c.water);
    woodBridge([[.55,.26,bridgeStart],[1.07,.32,bridgeStart+.5],[1.05,.25,.17]],.74);
    pavedPath([[-.4,.22,heroZ+1.34],[.12,.24,heroZ+1.45],[.55,.26,bridgeStart]],.6,370);
    for(let i=0;i<8;i++)boulder(1.7+Math.sin(i*1.9)*.18,.14,heroZ+1.1+i*.29,.19,.12,.16,400+i);
    planting(-1.73,.15,.54,.76,430);fir(-2.05,.13,-.15,.77,8);fir(-1.77,.13,-.55,.57,11);
    boulder(-1.78,.23,.7,.36,.24,.24,49);boulder(-2.22,.19,.52,.24,.18,.36,50);
  }else{
    stoneArch(.57,-.08,(bridgeStart+.21)/2,.21-bridgeStart,.76,.33,Math.PI/2);
    pavedPath([[.1,.24,heroZ+1.25],[.4,.25,bridgeStart],[.57,.25,bridgeStart]],.65,370);
    planting(-1.3,.15,.45,.66,430);broadTree(-1.39,.15,-.1,.69,23);bush(-1.4,.14,.7,.25,33,root,true);
  }
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)stone(.55+(j-1)*.27,.10+i*.027,.75-i*.15,.3,.09,.29,80+i*3+j,c.stoneLight);
  for(const side of [-1,1]){
    planting(side*(innerW/2-.55),2.8,.34,.65,450+side);lantern(side*1.49,.15,1.15);
    const x=side*1.5,z=3.52;stone(x,.32,z,.66,.08,.31,478,c.stoneLight);for(const dx of [-.22,.22])stone(x+dx,.13,z,.14,.19,.22,479,c.stone);
  }

  if(alpine){
    // Rising terrain, irregular rock strata and overlapping branch-layer crowns.
    for(const side of [-1,1]){
      const edge=w/2+.7;
      const slope=[[side*(edge+1.75),-.15,-d/2-1.7],[side*(edge+1.50),-.12,-d*.26],[side*(edge+1.8),-.16,d*.13],[side*(edge+1.25),-.20,d/2+1.25]];
      meadowStrip(slope,t=>3.4+Math.sin(t*Math.PI)*.6,(t,u)=>.12+Math.sin(u*Math.PI)*(.65+Math.sin(t*5)*.15),41+side,perimeter);
      pavedPath([[side*(edge+.25),-.10,-d/2-.6],[side*(edge+.05),-.10,-d*.2],[side*(edge+.42),-.11,d*.18],[side*(edge+.1),-.15,d/2+.7]],.53,500+side,perimeter);
      wall([[side*(edge-.12),-.32,-d/2-.5],[side*(edge-.25),-.32,-d*.2],[side*(edge+.13),-.33,d*.18],[side*(edge-.2),-.36,d/2+.7]],.18,530+side,perimeter);
      for(let cluster=0;cluster<7;cluster++){
        const z=-d/2-.9+cluster*(d+1.8)/6,x=side*(edge+1.3+noise(cluster+side+80)*.9),seed=600+cluster*9+(side+1)*60,size=.85+noise(seed)*.45;
        for(let j=0;j<3;j++){
          const tx=x+Math.sin(j*2.3+seed)*.48,tz=z+Math.cos(j*2.3+seed)*.38;
          if(![-d*.28,d*.25].some(pz=>Math.hypot(Math.abs(tx)-(edge+2),tz-pz)<1.14))fir(tx,.38,tz,size*(j===0?1:.67+.12*j),seed+j,perimeter);
        }
        for(let j=0;j<3;j++)boulder(side*(edge+2.55+noise(seed+j)*.4),.18+j*.13,z+(j-1)*.35,.62,.46+noise(j+seed)*.3,.66,seed+j,perimeter);
        if(cluster%2===0){bush(side*(edge+.62),-.08,z+.5,.35,seed,perimeter,true);lantern(side*(edge+.23),-.08,z+.15,perimeter);}
      }
      // These terraced lookout clearings accept the forthcoming regional kit.
      for(const z of [-d*.28,d*.25]){island(side*(edge+2.0),z,.86,.77,.42,.12,730,c.path,perimeter);bankEllipse(side*(edge+2.0),z,.86,.77,.12,.37,740,perimeter);pavedPath([[side*(edge+.35),-.07,z+.65],[side*(edge+1.1),.18,z+.56],[side*(edge+1.6),.55,z+.37]],.53,760,perimeter);plots.push({x:side*(edge+2),y:.59,z,rotation:-side*Math.PI/2,width:1.35,height:1.75,asset:z<0?'hotel_2':'villa_3'});}
    }
    const back=-d/2-2.4;
    meadowStrip([[-w/2-3,-.15,back],[0,-.1,back-1.0],[w/2+3,-.15,back]],4.8,(t,u)=>Math.sin(u*Math.PI)*(1.25+Math.sin(t*11)**2*1.4),900,perimeter);
    for(let i=0;i<18;i++){const x=-w/2-2.9+i*(w+5.8)/17,z=back-1.9+noise(i+28)*.7,h=.65+Math.sin(i*.8)**2*.8;boulder(x,h*.35,z,.9,h,.9,910+i,perimeter);if(i%2===0)fir(x,.3,back+.55,.94+noise(i)*.45,930+i,perimeter);}
    const cableZ=-d/2-1.45;rod([-w/2-1.2,1.8,cableZ],[w/2+1.2,1.8,cableZ],.014,c.metal,perimeter);
    for(const side of [-1,1]){rod([side*(w/2+1.2),-.15,cableZ],[side*(w/2+1.2),1.85,cableZ],.06,c.stone,perimeter);rod([side*(w/2+1.2)-.23,1.75,cableZ],[side*(w/2+1.2)+.23,1.75,cableZ],.045,c.metal,perimeter);}
    for(let i=0;i<2;i++){const cabin=dynamicGroup(),paint=material(i?'#bd7656':'#568f87');island(0,0,.24,.18,-.16,.28,3,paint,cabin);add(garden.sphere,material('#bad9d2'),[0,.09,.12],[.18,.11,.09],0,cabin);rod([0,.14,0],[0,.45,0],.022,c.metal,cabin);boats.push({object:cabin,cable:true,z:cableZ,phase:i*Math.PI});}
  }else{
    const sea=add(own(new THREE.PlaneGeometry(110,110)),c.water,[0,-.43,0],[1,1,1],0,perimeter);sea.rotation.x=-Math.PI/2;sea.castShadow=false;
    for(const side of [-1,1]){
      const edge=w/2+.72,quay=[[side*(edge+.45),-.14,-d/2-1.2],[side*(edge+.12),-.12,-d*.23],[side*(edge+.65),-.13,d*.2],[side*(edge+.3),-.14,d/2+1.1]];
      ribbon(quay,1.15,c.path,perimeter);wall([[side*(edge+1.0),-.42,-d/2-1.2],[side*(edge+.68),-.42,-d*.23],[side*(edge+1.18),-.42,d*.2],[side*(edge+.87),-.42,d/2+1.1]],.28,1000+side,perimeter);pavedPath(quay,.65,1030+side,perimeter);
      for(let i=0;i<6;i++){const z=-d/2+.3+i*(d-.6)/5,x=side*(edge+.42+Math.sin(i)*.2);lantern(x,-.10,z,perimeter);if(i%2===0){planting(x+side*.31,z+.55,.30,.47,1100+i,perimeter,-.11);broadTree(x+side*.4,-.08,z+.6,.86,1120+i,perimeter);}}
      // Stone arches join the promenade to planted islets, then timber piers.
      const z=side*d*.22,isletX=side*(edge+2.6);
      island(isletX,z,1.15,1.43,-.39,.26,1220+side,c.stone,perimeter);bankEllipse(isletX,z,1.13,1.4,-.43,.30,1240+side,perimeter);island(isletX,z,1.05,1.32,-.1,.02,1220+side,c.path,perimeter);
      stoneArch(side*(edge+1.55),-.41,z,1.35,.75,.31,0,perimeter);planting(isletX-side*.22,z-.65,.56,.43,1270,perimeter,-.06);broadTree(isletX-side*.25,-.05,z-.7,.90,1280,perimeter);
      woodBridge([[isletX+side*.55,-.06,z+.4],[isletX+side*1.2,-.08,z+.55],[isletX+side*1.9,-.08,z+.5]],.79,perimeter);
      for(let j=0;j<7;j++)boulder(isletX+Math.sin(j*2.4)*1.1,-.31,z+Math.cos(j*2.4)*1.35,.32,.2,.34,1300+j,perimeter);
      plots.push({x:isletX,y:-.035,z:z+.22,rotation:-side*Math.PI/2,width:1.2,height:1.55,asset:side<0?'shop_2':'villa_3'});
      const boat=dynamicGroup();boat.position.set(isletX+side*1.7,-.30,z+1.08);boat.rotation.y=side*.32;
      add(own(new THREE.SphereGeometry(1,16,8)),material(side>0?'#db9b66':'#e9debe'),[0,0,0],[.25,.13,.65],0,boat);stone(0,.06,0,.33,.045,.75,1330,c.timber,boat);rod([0,.1,0],[0,.97,0],.023,c.metal,boat);
      const sail=new THREE.Shape();sail.moveTo(.025,.23);sail.lineTo(.025,.92);sail.quadraticCurveTo(.35,.57,.47,.25);sail.closePath();add(own(new THREE.ShapeGeometry(sail)),material('#f5e9cf',{side:THREE.DoubleSide}),[0,0,0],[1,1,1],0,boat);boats.push({object:boat,y:boat.position.y,phase:side});
    }
    for(const side of [-1,1]){const z=side*(d/2+1.05);pavedPath([[-w/2-.9,-.13,z],[0,-.13,z+side*.25],[w/2+.9,-.13,z]],.8,1400+side,perimeter);wall([[-w/2-1,-.43,z+side*.42],[0,-.43,z+side*.7],[w/2+1,-.43,z+side*.42]],.29,1450+side,perimeter);for(let i=0;i<3;i++){const x=(i-1)*(w*.34);planting(x,z+side*.8,.65,.43,1500+i,perimeter,-.15);broadTree(x,-.08,z+side*.9,.72+(i%2)*.15,1510+i,perimeter);}}
  }

  garden.finish();
  root.userData.landscape={design:'connected-garden-v2',regionalTheme:alpine?'Alpine':'Mediterranean',staticDraws:0,triangles:0};
  root.traverse(node=>{if(node.isMesh&&!node.parent?.userData.gardenDynamic){root.userData.landscape.staticDraws++;root.userData.landscape.triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;}});
  for(let i=0;i<7;i++){const x=(i%2?-1:1)*(Math.min(lakeRX-.22,1.7)+noise(i)*.13),z=heroZ-1.2+(i%4)*.71;const ring=add(own(new THREE.RingGeometry(.13,.145,20)),own(new THREE.MeshBasicMaterial({color:'#dbf2e6',transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false})),[x,.113,z]);ring.rotation.x=-Math.PI/2;ring.castShadow=false;waves.push(ring);}
  if(alpine){
    const pixels=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5),i=(y*32+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(Math.max(0,1-r)**2*255);}
    const mist=own(new THREE.DataTexture(pixels,32,32));mist.needsUpdate=true;
    for(let i=0;i<6;i++){const puff=new THREE.Sprite(own(new THREE.SpriteMaterial({map:mist,color:'#f4fff7',transparent:true,opacity:.22,depthWrite:false})));root.add(puff);steam.push({object:puff,phase:i/6,x:Math.sin(i*2.4)*.3,z:heroZ+.9+Math.cos(i*3.1)*.14});}
  }
  return {warm:c.warm,plots};
}

// Regional buildings are authored GLB nodes, batched once per family and cloned
// over the prepared plots. Their source materials stay owned by the GLTF cache.
export function batchGardenBuilding({THREE,source,own}) {
  const copy=source.clone(true);copy.position.set(0,0,0);copy.updateMatrixWorld(true);
  const result=new THREE.Group(),batches=new Map();result.name=source.name;
  copy.traverse(node=>{
    if(!node.isMesh)return;
    if(Array.isArray(node.material)){const mesh=node.clone();node.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);result.add(mesh);return;}
    let geometry=node.geometry.clone();if(geometry.index){const indexed=geometry;geometry=indexed.toNonIndexed();indexed.dispose();}
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    if(geometry.attributes.color&&!node.material.vertexColors)geometry.deleteAttribute('color');geometry.applyMatrix4(node.matrixWorld);
    const key=node.material;if(!batches.has(key))batches.set(key,{material:node.material,parts:[]});batches.get(key).parts.push(geometry);
  });
  for(const {material,parts} of batches.values()){
    const merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!merged)throw new Error('Regional scenery attributes must match');
    const mesh=new THREE.Mesh(own(merged),material);mesh.castShadow=!material.transparent;mesh.receiveShadow=true;mesh.raycast=()=>{};result.add(mesh);
  }return result;
}

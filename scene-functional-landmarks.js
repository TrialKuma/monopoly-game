import { mergeGeometries } from './assets/vendor/three/addons/utils/BufferGeometryUtils.js';

// Public buildings keep their regional Blender shell. These built-in fittings
// expose the service at board scale: a vault, gantry, card marquee, wheel,
// portal, platform clock or direction tower. No floating sprites or microtext.
const REGIONS = {
  classic: { stone:'#f2e3c7', dark:'#405864', timber:'#876349', metal:'#bd975a', roof:'#4a6571', light:'#fff1ce' },
  compact: { stone:'#eee1c8', dark:'#354a50', timber:'#806044', metal:'#b59b64', roof:'#454f62', light:'#fff1d4' },
  expansion: { stone:'#e4d6bd', dark:'#3d5b61', timber:'#7d6754', metal:'#c1a06b', roof:'#567c7a', light:'#fff2d3' },
  harbor: { stone:'#f7edda', dark:'#3a6772', timber:'#a67d55', metal:'#c3a06c', roof:'#bf7a58', light:'#fff4dc' },
  alpine: { stone:'#e8dcc3', dark:'#4a5c54', timber:'#795540', metal:'#b39a6a', roof:'#5f736a', light:'#fff1cd' },
};
const SERVICE = { start:'#479f9c', bank:'#d6ad4d', construction:'#db9d4e', card_draw:'#9977bf', chance:'#d68fa5', teleport:'#65bfca', rush:'#83a76e', junction:'#6f9db3' };
export const FUNCTIONAL_TYPES = Object.freeze(Object.keys(SERVICE));

/** Call before rotating the cloned building; own receives only finished assets.
 *  It may be the scene's resource tracker or an inspection-specific tracker.
 *  Fittings use the shell's authored units within a 1.30 x 1.30 envelope.
 *  The harbor renderer then scales the shell and fittings as one building;
 *  its larger parcel, road clearance and framing share the same dimensions.
 */
export function createFunctionalLandmark({ THREE, mapId, type, model, own = resource => resource }) {
  if (!FUNCTIONAL_TYPES.includes(type) || !model) return null;
  const p = REGIONS[mapId] || REGIONS.classic;
  const accent = SERVICE[type];
  const root = new THREE.Group(); root.name = `public_service_${mapId}_${type}`;
  root.userData.functionalService = type; root.userData.cosmetic = true;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) return null;
  const h = bounds.max.y, front = Math.min(.53, bounds.max.z + .035);
  const drafts = [], groups = new Map();
  function add(geometry, color, position = [0,0,0], rotation = [0,0,0], scale = [1,1,1], finish = 'solid') {
    const mesh = new THREE.Object3D();
    mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.scale.set(...scale); mesh.updateMatrix();
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(mesh.matrix); geometry.dispose();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
    const c = new THREE.Color(color), rgb = new Float32Array(g.getAttribute('position').count*3);
    for(let i=0;i<rgb.length;i+=3){rgb[i]=c.r;rgb[i+1]=c.g;rgb[i+2]=c.b;}
    g.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
    if(!groups.has(finish))groups.set(finish,[]); groups.get(finish).push(g); drafts.push(g);
  }
  const box = (w,y,d,color,x=0,cy=y/2,z=0,rotation=[0,0,0]) => add(new THREE.BoxGeometry(w,y,d),color,[x,cy,z],rotation);
  const rod = (a,b,r,color,sides=8) => {
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
    const e=new THREE.Euler().setFromQuaternion(q);
    add(new THREE.CylinderGeometry(r,r,direction.length(),sides),color,start.add(end).multiplyScalar(.5).toArray(),[e.x,e.y,e.z]);
  };
  const disc = (r,depth,color,x,y,z,finish='solid') => add(new THREE.CylinderGeometry(r,r,depth,32),color,[x,y,z],[Math.PI/2,0,0],[1,1,1],finish);
  const ring = (r,t,color,x,y,z,finish='solid',arc=Math.PI*2,turn=0) => add(new THREE.TorusGeometry(r,t,6,40,arc),color,[x,y,z],[0,0,turn],[1,1,1],finish);
  function plate(w,height,depth,color,x,y,z,rotation=[0,0,0]) {
    const r=Math.min(.035,w*.08,height*.08),s=new THREE.Shape(),l=-w/2,b=-height/2;
    s.moveTo(l+r,b);s.lineTo(l+w-r,b);s.quadraticCurveTo(l+w,b,l+w,b+r);s.lineTo(l+w,b+height-r);s.quadraticCurveTo(l+w,b+height,l+w-r,b+height);
    s.lineTo(l+r,b+height);s.quadraticCurveTo(l,b+height,l,b+height-r);s.lineTo(l,b+r);s.quadraticCurveTo(l,b,l+r,b);
    const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:1,curveSegments:3});g.translate(0,0,-depth/2);add(g,color,[x,y,z],rotation);
  }
  function polygon(points,depth,color,x,y,z) {
    const s=new THREE.Shape();points.forEach(([u,v],i)=>i?s.lineTo(u,v):s.moveTo(u,v));s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false});g.translate(0,0,-depth/2);add(g,color,[x,y,z]);
  }
  function cap(x,y,z,w,d) {
    // One coherent regional construction language, applied to every service.
    if(mapId==='compact'){
      box(w,.044,d,p.roof,x,y,z);box(w+.08,.022,d+.055,p.dark,x,y-.025,z);
      for(const s of [-1,1])box(.11,.035,d+.055,p.roof,x+s*(w/2+.015),y+.016,z,[0,0,s*.14]);
    }else if(mapId==='alpine'){
      for(const s of [-1,1])box(w*.56,.028,d+.06,p.roof,x+s*w*.24,y+.06,z,[0,0,-s*.33]);
      box(.035,.035,d+.07,p.timber,x,y+.11,z);
    }else if(mapId==='harbor'){
      box(w,.038,d,p.stone,x,y,z);
      for(let i=0;i<Math.ceil(w/.08);i++)rod([x-w/2+.04+i*.08,y+.03,z-d/2],[x-w/2+.04+i*.08,y+.03,z+d/2],.024,p.roof,8);
    }else if(mapId==='expansion'){
      box(w,.035,d,p.metal,x,y,z);box(w*.78,.04,d*.85,p.dark,x,y+.035,z);box(w*.56,.035,d*.72,p.metal,x,y+.07,z);
    }else{
      box(w,.028,d,p.stone,x,y,z);box(w+.035,.018,d+.035,p.metal,x,y-.02,z);
      for(const s of [-1,1])add(new THREE.SphereGeometry(.026,10,6),p.metal,[x+s*w*.40,y+.035,z]);
    }
  }
  function clock(x,y,z,r=.135,face=1) {
    disc(r+.022,.055,p.dark,x,y,z);disc(r,.014,p.light,x,y,z+.035*face);ring(r+.003,.012,p.metal,x,y,z+.046*face);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;rod([x+Math.sin(a)*r*.76,y+Math.cos(a)*r*.76,z+.049*face],[x+Math.sin(a)*r*.89,y+Math.cos(a)*r*.89,z+.049*face],.005,p.dark,6);}
    rod([x,y,z+.054*face],[x+r*.43,y+r*.34,z+.054*face],.009,p.dark);rod([x,y,z+.054*face],[x-r*.22,y+r*.61,z+.054*face],.007,p.dark);disc(.017,.012,p.metal,x,y,z+.059*face);
  }
  function arrow(x,y,z,w,reverse=false) {
    const pts=[[-w*.5,-.052],[w*.25,-.052],[w*.5,0],[w*.25,.052],[-w*.5,.052]].map(([a,b])=>[reverse?-a:a,b]);
    polygon(pts,.042,p.metal,x,y,z);
    polygon(pts.map(([a,b])=>[a*.88,b*.63]),.015,accent,x,y,z+.031);
  }
  function deckCard(x,y,z,tilt,motif) {
    const w=.235,ht=.35;
    plate(w+.025,ht+.025,.036,p.metal,x,y,z,[0,0,tilt]);plate(w,ht,.013,p.light,x,y,z+.026,[0,0,tilt]);
    // Bold suits replace tiny illegible writing. They remain part of the sign.
    if(motif===0)polygon([[0,.075],[.055,0],[0,-.075],[-.055,0]],.018,accent,x,y,z+.047);
    else if(motif===1){disc(.039,.018,accent,x-.023,y+.015,z+.045);disc(.039,.018,accent,x+.023,y+.015,z+.045);polygon([[-.061,.014],[.061,.014],[0,-.074]],.018,accent,x,y,z+.045);}
    else {for(const [u,v] of [[0,.039],[-.038,-.015],[.038,-.015]])disc(.035,.018,p.dark,x+u,y+v,z+.045);box(.027,.06,.019,p.dark,x,y-.052,z+.045);}
  }

  if(type==='start'){
    // Civic standards form a gate around the already-authored clock tower.
    for(const side of [-1,1]){
      box(.14,.10,.14,p.stone,side*.49,.05,.23);rod([side*.49,.10,.23],[side*.49,1.02,.23],.018,p.metal);
      plate(.17,.32,.025,accent,side*.49,.78,.24);
      box(.115,.045,.018,p.light,side*.49,.82,.263);box(.045,.13,.019,p.light,side*.49,.78,.264);
      cap(side*.49,1.02,.23,.16,.12);
    }
    for(const side of [-1,1])box(.30,.025,.12,p.stone,side*.25,.04,.56);
    root.userData.silhouette='civic-standards';
  }else if(type==='bank'){
    const cy=h+.13,z=.16;
    box(.48,.14,.31,p.stone,0,h-.025,z-.06);
    disc(.225,.14,p.dark,0,cy,z);disc(.194,.045,p.metal,0,cy,z+.09);disc(.158,.025,p.dark,0,cy,z+.125);
    ring(.179,.012,p.light,0,cy,z+.126);ring(.080,.012,p.metal,0,cy,z+.15);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;disc(.014,.018,p.light,Math.sin(a)*.181,cy+Math.cos(a)*.181,z+.13);}
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod([0,cy,z+.162],[Math.sin(a)*.072,cy+Math.cos(a)*.072,z+.162],.012,p.metal);}
    disc(.024,.03,p.light,0,cy,z+.17);cap(0,cy+.25,z-.035,.50,.24);
    // Coin trays at the entrance reinforce the vault silhouette at ground level.
    for(let i=0;i<3;i++)add(new THREE.CylinderGeometry(.055,.055,.025,20),p.metal,[.43,.11+i*.026,front]);
    root.userData.silhouette='vault-drum';
  }else if(type==='construction'){
    const top=Math.max(1.20,h+.30),z=-.04;
    for(const x of [-.47,.47]){
      box(.085,top-.08,.085,p.timber,x,(top+.08)/2,z);
      for(let y=.29;y<top-.08;y+=.25){box(.12,.027,.12,p.metal,x,y,z);}
    }
    box(1.12,.065,.13,p.metal,0,top,z);box(1.12,.035,.11,p.dark,0,top-.16,z);
    for(let i=0;i<5;i++){const x=-.53+i*.213;rod([x,top-.14,z+.045],[x+.20,top-.02,z+.045],.012,p.metal);}
    rod([-.47,top-.37,z],[.05,top-.02,z],.025,p.timber);rod([.47,top-.37,z],[.15,top-.02,z],.025,p.timber);
    const hx=.24,hz=.23;box(.15,.08,.17,p.dark,hx,top-.03,hz);rod([hx,top-.08,hz],[hx,top-.37,hz],.009,p.dark);
    ring(.036,.01,p.metal,hx,top-.40,hz,'solid',Math.PI*1.45,Math.PI*.75);
    box(.20,.12,.16,p.timber,hx,top-.51,hz);for(const x of [hx-.06,hx+.06])box(.02,.13,.18,p.metal,x,top-.51,hz);
    for(let i=0;i<3;i++)box(.25,.033,.11,p.stone,-.40,.10+i*.036,front);
    root.userData.silhouette='open-truss-gantry';
  }else if(type==='card_draw'){
    const cy=h+.10,z=.16;
    for(const x of [-.40,.40])rod([x,h-.16,z-.05],[x,cy+.19,z-.05],.022,p.timber);
    cap(0,cy+.26,z-.07,.92,.27);box(.90,.035,.21,p.metal,0,cy-.22,z-.02);
    deckCard(-.225,cy-.015,z,-.16,1);deckCard(.225,cy-.015,z,.16,2);deckCard(0,cy+.025,z+.045,0,0);
    // Separate front counter with a broad striped valance, scaled for a phone.
    box(.80,.055,.12,accent,0,Math.min(.56,h*.61),front);
    for(const x of [-.30,-.10,.10,.30])box(.065,.055,.125,p.light,x,Math.min(.56,h*.61),front+.003);
    root.userData.silhouette='card-marquee';
  }else if(type==='chance'){
    const cy=h+.11,z=.12,r=.30;
    for(const x of [-.23,.23])rod([x,h-.13,z-.05],[0,cy,z-.05],.031,p.metal);
    // A freestanding wheel at roof level is visible over adjacent homes.
    disc(r+.035,.075,p.dark,0,cy,z);disc(r,.025,p.light,0,cy,z+.051);
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5,b=(i+1)*Math.PI/5;
      polygon([[0,0],[Math.sin(a)*r,Math.cos(a)*r],[Math.sin(b)*r,Math.cos(b)*r]],.015,i%2?accent:p.metal,0,cy,z+.071);
      rod([0,cy,z+.085],[Math.sin(a)*r,cy+Math.cos(a)*r,z+.085],.006,p.light,6);
      disc(.014,.016,p.light,Math.sin(a)*(r+.013),cy+Math.cos(a)*(r+.013),z+.054);
    }
    ring(r+.016,.012,p.metal,0,cy,z+.055);disc(.052,.04,p.metal,0,cy,z+.096);disc(.023,.014,p.light,0,cy,z+.124);
    polygon([[-.046,.06],[.046,.06],[0,-.02]],.04,p.dark,0,cy+r+.045,z+.10);
    root.userData.silhouette='rooftop-prize-wheel';
  }else if(type==='teleport'){
    const cy=.55,z=Math.min(.39,front),r=.29;
    for(const x of [-.39,.39]){box(.12,.12,.24,p.stone,x,.06,z-.05);box(.075,.72,.14,p.dark,x,.46,z-.05);cap(x,.85,z-.05,.17,.23);}
    // Paired vertical ring and ground pad read as an active gateway, not a house.
    ring(r+.04,.027,p.metal,0,cy,z);ring(r,.014,accent,0,cy,z+.025,'glow');
    for(const side of [-1,1])ring(r-.045,.008,p.light,0,cy,z+.035,'glow',Math.PI*.58,side<0?Math.PI*.18:Math.PI*1.18);
    add(new THREE.CylinderGeometry(.29,.29,.027,40),p.dark,[0,.055,z-.05]);
    add(new THREE.TorusGeometry(.265,.011,6,40),accent,[0,.073,z-.05],[Math.PI/2,0,0],[1,1,1],'glow');
    for(const x of [-.39,.39])disc(.026,.018,accent,x,.66,z+.035,'glow');
    root.userData.silhouette='active-portal';
  }else if(type==='rush'){
    const y=Math.max(.62,h*.72),z=front-.04;
    for(const x of [-.48,.48])rod([x,.06,z+.04],[x,y,z+.04],.025,p.dark);
    cap(0,y,z-.02,1.10,.31);
    for(const x of [-.45,-.15,.15,.45])rod([x,y-.09,z-.11],[x,y-.01,z+.10],.012,p.metal);
    const cy=h+.11;box(.29,.34,.23,p.stone,0,cy,-.015);clock(0,cy,.13,.135);clock(0,cy,-.15,.135,-1);
    cap(0,cy+.19,-.015,.39,.30);
    // Two inset rails and sleepers belong to the platform, not the pawn road.
    for(const x of [-.42,-.21,0,.21,.42])box(.04,.018,.20,p.timber,x,.063,.53);
    for(const z0 of [.47,.59])box(1.04,.018,.016,p.metal,0,.078,z0);
    root.userData.silhouette='platform-and-clock';
  }else if(type==='junction'){
    const y=h+.08,z=.09;
    box(.11,.57,.11,p.timber,0,y-.07,z);cap(0,y+.27,z,.19,.18);
    arrow(-.04,y+.12,z+.07,.61);arrow(.04,y-.03,z+.08,.61,true);arrow(-.04,y-.18,z+.07,.61);
    // Physical route-map display reinforces the branching sign silhouette.
    plate(.38,.29,.05,p.metal,0,.40,front);plate(.33,.24,.012,p.light,0,.40,front+.034);
    const origin=[-.09,.33,front+.05];for(const [x,y0] of [[-.09,.47],[.10,.47],[.11,.34]]){rod(origin,[x,y0,front+.05],.012,accent);disc(.022,.016,p.dark,x,y0,front+.056);}
    root.userData.silhouette='direction-tower';
  }
  for(const [finish,geometries] of groups){
    const geometry=own(mergeGeometries(geometries,false));
    const material=own(new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:finish==='glow'?.38:.72,metalness:finish==='glow'?.14:.10,emissive:finish==='glow'?accent:'#000000',emissiveIntensity:finish==='glow'?.35:0}));
    material.name=`public-service-${type}-${finish}`;material.userData.functionalService=type;
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`${root.name}_${finish}`;mesh.castShadow=finish!=='glow';mesh.receiveShadow=true;
    // The parent building remains selectable; decorative fittings never steal clicks.
    mesh.raycast=()=>{};root.add(mesh);
  }
  drafts.forEach(geometry=>geometry.dispose());
  root.updateMatrixWorld(true);
  return root;
}

import { GLTFLoader } from './assets/vendor/three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from './assets/vendor/three/addons/utils/BufferGeometryUtils.js';

// Destination art is cosmetic. The generated meshes keep their UVs and rigid
// part animation clips; they never enter the board's static mesh batching.
const cache = new Map();
const THEMES = {
  harbor: { file:'harbor/harbor_lighthouse.glb', name:'harbor_lighthouse', water:'#63acb9', stone:'#dacba7', land:'#b4c79c', roof:'#307f84', flower:'#e6988f' },
  alpine: { file:'harbor/alpine_windmill.glb', name:'alpine_windmill', water:'#7abfc4', stone:'#c4c7b2', land:'#adc4a3', roof:'#477e73', flower:'#d9ad84' },
};
function loadModel(file) {
  if (!cache.has(file)) cache.set(file, new GLTFLoader().loadAsync(`./assets/models/${file}?v=20261023-1`).catch(error => {cache.delete(file);throw error;}));
  return cache.get(file);
}
export function createDestinationScene({THREE, world, boardBounds, mapId, requestRender=()=>{}}) {
  const theme=THEMES[mapId];if(!theme)return null;
  const root=new THREE.Group();root.name=`destination_${mapId}`;root.userData.cosmetic=true;world.add(root);
  const perimeter=new THREE.Group();perimeter.name=`destination_${mapId}_outskirts`;root.add(perimeter);
  let scenicParent=root;
  const owned=new Set(),mixers=[],waves=[],glows=[],boats=[],steam=[];
  const own=r=>{owned.add(r);return r;};
  const mat=(color,extra={})=>own(new THREE.MeshStandardMaterial({color,roughness:.78,...extra}));
  const cream=mat(theme.stone),edge=mat('#b8a889'),timber=mat('#ad8059'),iron=mat('#456b66'),leaf=mat(mapId==='alpine'?'#538577':'#7fa779'),flower=mat(theme.flower);
  const water=mat(theme.water,{roughness:.28,metalness:.18,emissive:theme.water,emissiveIntensity:.08});
  const grass=mat(theme.land),warm=mat('#ffdc91',{emissive:'#ffcf73',emissiveIntensity:.2});
  const cube=own(new THREE.BoxGeometry(1,1,1)),cylinder=own(new THREE.CylinderGeometry(1,1,1,16)),sphere=own(new THREE.SphereGeometry(1,12,8));
  const w=boardBounds.w,d=boardBounds.d,innerW=w-4.7,innerD=d-4.65;
  let elapsed=0,disposed=false,visible=true,ready=false,failed=false;
  function mesh(geo,material,x=0,y=0,z=0,parent=scenicParent){const obj=new THREE.Mesh(geo,material);obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;obj.raycast=()=>{};parent.add(obj);return obj;}
  function box(x,y,z,sx,sy,sz,material,parent=scenicParent){const obj=mesh(cube,material,x,y,z,parent);obj.scale.set(sx,sy,sz);return obj;}
  function disc(x,y,z,r,h,material,parent=scenicParent){const obj=mesh(cylinder,material,x,y,z,parent);obj.scale.set(r,h,r);return obj;}
  function roundedPad(x,y,z,width,depth,r,height,material){
    const s=new THREE.Shape(),a=-width/2,b=-depth/2;
    s.moveTo(a+r,b);s.lineTo(a+width-r,b);s.quadraticCurveTo(a+width,b,a+width,b+r);s.lineTo(a+width,b+depth-r);s.quadraticCurveTo(a+width,b+depth,a+width-r,b+depth);s.lineTo(a+r,b+depth);s.quadraticCurveTo(a,b+depth,a,b+depth-r);s.lineTo(a,b+r);s.quadraticCurveTo(a,b,a+r,b);
    const geo=own(height?new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:false,curveSegments:6}):new THREE.ShapeGeometry(s,6));geo.rotateX(-Math.PI/2);return mesh(geo,material,x,y,z);
  }
  function rod(a,b,r,material,parent=scenicParent){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),dir=to.clone().sub(from),obj=mesh(cylinder,material,0,0,0,parent);obj.position.copy(from).add(to).multiplyScalar(.5);obj.scale.set(r,dir.length(),r);obj.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());return obj;}
  function rail(a,b,count=8){rod([a[0],.22,a[1]],[b[0],.22,b[1]],.025,iron);for(let i=0;i<=count;i++){const t=i/count;rod([a[0]+(b[0]-a[0])*t,-.14,a[1]+(b[1]-a[1])*t],[a[0]+(b[0]-a[0])*t,.23,a[1]+(b[1]-a[1])*t],.022,iron);}}
  function pine(x,z,size=1){const trunk=mesh(cylinder,timber,x,-.17+size*.25,z);trunk.scale.set(.055*size,.5*size,.055*size);for(let j=0;j<3;j++){const crown=mesh(own(new THREE.ConeGeometry((.35-j*.065)*size,.55*size,9)),leaf,x,-.17+.3*size+j*.23*size,z);crown.rotation.y=j*.4;}}
  function planter(x,z,base=0){disc(x,.13+base,z,.24,.18,cream);disc(x,.23+base,z,.20,.025,leaf);for(let i=0;i<5;i++){const a=i*Math.PI*.4;const bud=mesh(sphere,flower,x+Math.cos(a)*.12,.3+base,z+Math.sin(a)*.12);bud.scale.set(.072,.065,.072);}}
  function lantern(x,z){rod([x,-.15,z],[x,.53,z],.024,iron);box(x,.59,z,.14,.17,.14,warm);disc(x,.69,z,.12,.045,iron);const halo=mesh(own(new THREE.CircleGeometry(.26,20)),own(new THREE.MeshBasicMaterial({color:'#ffc16f',transparent:true,opacity:0,depthWrite:false})),x,-.12,z);halo.rotation.x=-Math.PI/2;halo.castShadow=false;glows.push(halo);}

  // A shaped central garden and an inlet establish the scene at local-camera
  // distance. All tall scenic objects stay in the empty courtyard or outside
  // the board; the numbered landing strip is never used for decoration.
  roundedPad(0,.03,0,innerW,innerD,.3,.08,grass);
  const pond=roundedPad(0,.117,-innerD*.23,innerW-.25,innerD*.45,.35,0,water);pond.castShadow=false;
  roundedPad(0,.08,-innerD*.25,Math.min(3.15,innerW-.6),2.85,.38,.18,cream);
  for(let i=0;i<3;i++)box(0,.09+i*.035,-innerD*.25+1.57-i*.13,1.05,.07,.24,cream);
  // A separate fountain court aligns with the existing life module below.
  disc(0,.19,2,.85,.12,cream);disc(0,.26,2,.70,.05,water);disc(0,.42,2,.13,.32,cream);disc(0,.62,2,.34,.08,cream);disc(0,.79,2,.075,.27,cream);
  box(0,.14,1.1,.48,.035,2.2,cream);
  for(const side of [-1,1]){planter(side*(innerW/2-.35),.45);planter(side*(innerW/2-.35),3.15);lantern(side*(innerW/2-.35),1.6);}
  for(let i=0;i<9;i++){const ring=mesh(own(new THREE.RingGeometry(.17,.19,24)),own(new THREE.MeshBasicMaterial({color:'#d5f4ed',transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false})),Math.sin(i*4.2)*(innerW/2-.35),.122,-innerD*.43+i*.47);ring.rotation.x=-Math.PI/2;ring.castShadow=false;waves.push(ring);}

  scenicParent=perimeter;
  if(mapId==='harbor'){
    // Continuous sea, stone quays, railings and timber piers give the island a
    // coherent waterfront instead of separate decorative slabs.
    const sea=mesh(own(new THREE.PlaneGeometry(110,110)),water,0,-.435,0);sea.rotation.x=-Math.PI/2;sea.castShadow=false;
    for(const side of [-1,1]){
      const x=side*(w/2+1.22);box(x,-.25,0,.65,.25,d+2.8,cream);
      rail([x+side*.28,-d/2-1.4],[x+side*.28,d/2+1.4],25);
      for(let i=0;i<8;i++){lantern(x,-d/2+.2+i*1.9);if(i%2===0)planter(x,-d/2+.9+i*1.9,-.16);}
      const pierZ=side*d*.24;box(x+side*.95,-.22,pierZ,1.6,.15,.82,timber);
      for(let step=0;step<3;step++)box(side*(w/2+.7+step*.14),-.01-step*.04,pierZ,.22,.08,.78,timber);
      for(let k=0;k<9;k++)box(x+side*(.35+k*.16),-.135,pierZ,.035,.016,.83,edge);
      for(const dz of [-.32,.32])for(const dx of [.4,1.55])disc(x+side*dx,-.25,pierZ+dz,.055,.65,timber);
      const boat=new THREE.Group();boat.position.set(x+side*2.1,-.30,pierZ+.4);boat.rotation.y=side*.3;perimeter.add(boat);
      const hull=mesh(own(new THREE.SphereGeometry(1,16,8)),mat(side>0?'#e9b37b':'#ede4ce'),0,0,0,boat);hull.scale.set(.23,.12,.65);
      box(0,.10,0,.30,.10,.60,timber,boat);rod([0,.1,0],[0,.95,0],.024,iron,boat);
      const sail=new THREE.Shape();sail.moveTo(.025,.22);sail.lineTo(.025,.91);sail.lineTo(.47,.25);sail.closePath();mesh(own(new THREE.ShapeGeometry(sail)),mat('#f8eed4',{side:THREE.DoubleSide}),0,0,0,boat);
      boats.push({object:boat,y:boat.position.y,phase:side});
    }
    for(const side of [-1,1])box(0,-.25,side*(d/2+1.2),w+3,.25,.65,cream);
  }else{
    // Broad faceted ridges and grouped firs frame the spa. Lower foreground
    // silhouettes keep the player's route readable from every camera angle.
    const rock=mat('#8eaaa0'),snow=mat('#e5eee2'),forestFloor=mat('#8cae91'),trail=mat('#c6b89a');
    for(const side of [-1,1]){
      // A continuous forest edge, with staggered clusters and a walking trail,
      // gives the low camera a landscape rather than a row of identical rocks.
      roundedPad(side*(w/2+1.62),-.36,0,2.35,d+2.1,.8,.19,forestFloor);
      roundedPad(side*(w/2+.82),-.158,0,.40,d+.9,.19,.018,trail);
      for(let i=0;i<10;i++){
        const z=-d/2+.12+i*1.5,x=side*(w/2+1.5+(i%3)*.27);
        pine(x,z,1.02+(i%3)*.21);
        if(i%3!==1)pine(x+side*.52,z+.48,.64+(i%2)*.2);
        const ledge=mesh(own(new THREE.DodecahedronGeometry(.34,0)),rock,x-side*.34,-.10,z-.45);ledge.scale.set(1.1,.62,1.45);ledge.rotation.y=i*.8;
        if(i%3===1){
          box(side*(w/2+.83),.10,z,.23,.09,.63,timber);
          for(const dz of [-.23,.23])box(side*(w/2+.83),-.015,z+dz,.18,.19,.07,iron);
          planter(x+side*.4,z-.5,-.20);
        }
      }
    }
    for(let i=0;i<5;i++){
      const x=(i-2)*2.5,z=-d/2-3.1,height=1.7+(i%3)*.7;
      mesh(own(new THREE.ConeGeometry(2.0,height,6)),rock,x,-.3+height/2,z);
      mesh(own(new THREE.ConeGeometry(.70,height*.32,6)),snow,x,-.3+height*.84,z);
    }
    // Small cable-car cabins visibly travel along a real cable in the distance.
    const back=-d/2-1.45;rod([-w/2-1.2,1.8,back],[w/2+1.2,1.8,back],.018,iron);
    for(const side of [-1,1])rod([side*(w/2+1.2),-.3,back],[side*(w/2+1.2),1.85,back],.07,cream);
    for(let i=0;i<2;i++){const cabin=new THREE.Group();perimeter.add(cabin);box(0,0,0,.42,.35,.30,mat(i?'#b96d4e':'#447f80'),cabin);box(0,.04,.155,.3,.13,.015,mat('#b9dad6'),cabin);rod([0,.17,0],[0,.45,0],.025,iron,cabin);boats.push({object:cabin,cable:true,z:back,phase:i*Math.PI});}
    // Soft steam is decorative and uses a deterministic local clock. It does
    // not consume the dice's random sequence or cover the numbered route.
    const pixels=new Uint8Array(32*32*4);
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5),i=(y*32+x)*4;
      pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(Math.max(0,1-r)**2*255);
    }
    const mist=own(new THREE.DataTexture(pixels,32,32));mist.needsUpdate=true;
    for(let i=0;i<6;i++){
      const puff=new THREE.Sprite(own(new THREE.SpriteMaterial({map:mist,color:'#f4fff7',transparent:true,opacity:.22,depthWrite:false})));
      root.add(puff);steam.push({object:puff,phase:i/6,x:Math.sin(i*2.4)*.3,z:-innerD*.25+.9+Math.cos(i*3.1)*.14});
    }
  }
  // Merge landscape construction by material, retaining boats, glow pools and
  // ripples as separate animated objects. A railing is one draw, not 50.
  const dynamic=new Set([...waves,...glows]);
  for(const parent of [root,perimeter]){const batches=new Map();
  for(const node of [...parent.children])if(node.isMesh&&!dynamic.has(node)){
    const key=node.material.uuid+String(node.castShadow)+String(!!node.geometry.index);node.updateMatrix();
    if(!batches.has(key))batches.set(key,{material:node.material,shadow:node.castShadow,parts:[]});
    batches.get(key).parts.push(node.geometry.clone().applyMatrix4(node.matrix));parent.remove(node);
  }
  batches.forEach(({material,shadow,parts})=>{const geo=mergeGeometries(parts,false);if(geo){const obj=mesh(own(geo),material,0,0,0,parent);obj.castShadow=shadow;parts.forEach(g=>g.dispose());}else parts.forEach(g=>{mesh(own(g),material,0,0,0,parent).castShadow=shadow;});});
  }
  scenicParent=root;
  const loading=loadModel(theme.file).then(gltf=>{
    if(disposed)return;
    const model=gltf.scene.clone(true);model.name=theme.name;
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    const scale=Math.min(2.8/Math.max(size.x,size.z),3.7/size.y);model.scale.multiplyScalar(scale);
    const fit=new THREE.Box3().setFromObject(model),center=fit.getCenter(new THREE.Vector3());
    model.position.set(-center.x,.26-fit.min.y,-innerD*.25-center.z);
    model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;n.raycast=()=>{};}});
    root.add(model);
    const mixer=new THREE.AnimationMixer(model);gltf.animations.forEach(clip=>mixer.clipAction(clip).play());mixers.push(mixer);
    ready=true;root.userData.modelReady=true;root.userData.animationClips=gltf.animations.length;requestRender();
  }).catch(error=>{if(!disposed){failed=true;console.warn(`Destination model ${theme.file} unavailable`,error.message);}});
  function tick(delta,{night=0,reduced=false,paused=false}={}){
    if(disposed)return false;
    const dt=Math.min(.1,Math.max(0,delta||0));if(!paused&&!reduced){elapsed+=dt;mixers.forEach(m=>m.update(dt));}
    warm.emissiveIntensity=.2+night*1.6;glows.forEach(g=>g.material.opacity=night*.22);
    waves.forEach((r,i)=>{const phase=(elapsed*.23+i/9)%1;r.scale.setScalar(.4+phase*1.8);r.material.opacity=(1-phase)*.25;});
    steam.forEach(p=>{const phase=(elapsed*.13+p.phase)%1;p.object.position.set(p.x+Math.sin(phase*3+p.phase)*.10,.52+phase*.85,p.z);p.object.scale.setScalar(.22+phase*.34);p.object.material.opacity=Math.sin(phase*Math.PI)*.30;});
    if(visible)boats.forEach(b=>{if(b.cable)b.object.position.set(Math.sin(elapsed*.17+b.phase)*(w/2+.6),1.35,b.z);else{b.object.position.y=b.y+Math.sin(elapsed*.75+b.phase)*.025;b.object.rotation.z=Math.sin(elapsed*.5+b.phase)*.025;}});
    return !paused&&!reduced;
  }
  function dispose(){if(disposed)return;disposed=true;mixers.forEach(m=>{m.stopAllAction();m.uncacheRoot(m.getRoot());});root.removeFromParent();owned.forEach(r=>r.dispose());owned.clear();}
  return {tick,dispose,loading,getState:()=>({ready,failed,clips:root.userData.animationClips||0}),setVisible:value=>{visible=!!value;perimeter.visible=visible;requestRender();}};
}
export function disposeDestinationAssets(){cache.forEach(p=>p.then(g=>g.scene.traverse(n=>{if(!n.isMesh)return;n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material]){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}})).catch(()=>{}));cache.clear();}
if(typeof window!=='undefined')window.addEventListener('pagehide',disposeDestinationAssets);

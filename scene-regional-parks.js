import { createGardenKit } from './scene-garden-kit.js?v=20261025-landscape3';

const PALETTES={
  classic:{stone:'#b9b4a1',stoneLight:'#ded4b9',stoneDark:'#8c9682',path:'#d6c9aa',mortar:'#a4a18c',soil:'#817b58',grass:'#9bb17e',timber:'#86704e',timberLight:'#b79a6c',metal:'#475e55',leaf:'#537450',leafLight:'#83a16b',flowers:'#cc879c',flowerLight:'#efcf9b',water:'#76aaa5'},
  compact:{stone:'#a6aaa2',stoneLight:'#d1cbbb',stoneDark:'#788e85',path:'#c9c1ae',mortar:'#989e8e',soil:'#8b806a',grass:'#9caf88',timber:'#76614c',timberLight:'#a9986f',metal:'#53615c',leaf:'#547e67',leafLight:'#88aa7b',flowers:'#d49cac',flowerLight:'#edc6cd',water:'#78b5b3'},
  expansion:{stone:'#a4afaa',stoneLight:'#cbd0bd',stoneDark:'#72898a',path:'#c0c8bb',mortar:'#8f9b97',soil:'#8c8d72',grass:'#94ae86',timber:'#806b51',timberLight:'#b6a17a',metal:'#4b6866',leaf:'#527b62',leafLight:'#80a078',flowers:'#c9a167',flowerLight:'#e4ce8d',water:'#6fa5ae'},
};

function regionalPieces({THREE,kit,root,own,mapId}){
  const {add,colors:c,rod,taperedRod,stone,island,bush,broadTree,noise,circle,sphere,leafCluster,rootFlare,groundCover,topiary,hedgeSegment}=kit;
  const disc=(x,y,z,r,h,mat,parent=root)=>add(circle,mat,[x,y,z],[r,h,r],0,parent);
  const smallDiscGeometry=own(new THREE.CylinderGeometry(1,1,1,8)),petalGeometry=own(new THREE.IcosahedronGeometry(1,0));
  const collar=(x,y,z,r,h,mat,parent=root)=>add(smallDiscGeometry,mat,[x,y,z],[r,h,r],0,parent);
  function clippedTree(x,y,z,size=1,parent=root){
    // A planted urn and exposed roots distinguish the formal promenade trees.
    disc(x,y+.035,z,size*.16,.07,c.stoneDark,parent);disc(x,y+.085,z,size*.145,.04,c.stoneLight,parent);
    topiary(x,y+.08,z,size,31,parent);groundCover(x,y+.10,z,size*.12,33,parent);
  }
  function hedge(cx,cz,rx,rz,y,parent=root){
    // Clipped octagons form a deliberate parterre, with small leaf breaks on
    // the rim instead of a necklace of intersecting balls.
    const points=Array.from({length:8},(_,i)=>{const a=(i+.5)*Math.PI/4;return [cx+Math.cos(a)*rx,y,cz+Math.sin(a)*rz];});
    for(let i=0;i<8;i++)hedgeSegment(points[i],points[(i+1)%8],.14,.12,parent);
  }
  function parterre(cx,cz,rx,rz,y,parent=root){
    const base=stone(cx,y-.015,cz,rx*2.28,.045,rz*2.78,0,c.stoneLight,parent);base.rotation.y=0;
    const soil=stone(cx,y+.02,cz,rx*2.08,.025,rz*2.48,0,c.soil,parent);soil.rotation.y=0;
    hedge(cx,cz,rx,rz,y+.045,parent);
    for(const [i,[sx,sz]] of [[-1,-1],[1,-1],[1,1],[-1,1]].entries())bush(cx+sx*rx*.35,y+.05,cz+sz*rz*.32,.14,40+i,parent,true);
    // Pale gravel diagonals remain readable between the four planting lobes.
    for(const angle of [-.65,.65]){const path=stone(cx,y+.055,cz,.065,.018,Math.min(rx,rz)*1.9,0,c.path,parent);path.rotation.y=angle;}
  }
  function cherry(x,y,z,size=1,seed=0,parent=root){
    rootFlare(x,y,z,size,seed,parent);taperedRod([x,y,z],[x-.07*size,y+.70*size,z+.025],.065*size,c.timber,parent);
    for(let i=0;i<5;i++){
      const a=i*2.399+seed,dx=Math.cos(a)*size*.31,dz=Math.sin(a)*size*.30,h=size*(.83+(i%2)*.14),fork=[x+dx*.55,y+h*.76,z+dz*.6];
      taperedRod([x-.05*size,y+size*(.35+i*.045),z],fork,.033*size,c.timber,parent);
      for(const sign of [-1,1])taperedRod(fork,[x+dx+Math.sin(a)*sign*size*.08,y+h,z+dz+Math.cos(a)*sign*size*.08],.014*size,c.timberLight,parent);
      leafCluster(x+dx,y+h,z+dz,size*.44,size*.35,size*.40,seed+i,parent,'bloom');
    }
    groundCover(x,y+.005,z,size*.25,seed,parent);
    for(let i=0;i<12;i++){const a=i*2.399,r=size*(.25+noise(seed+i)*.35);add(petalGeometry,c.flowerLight,[x+Math.cos(a)*r,y+.009,z+Math.sin(a)*r],[.018,.006,.026],a,parent);}
  }
  function bamboo(a,b,y,parent=root){
    const start=new THREE.Vector3(a[0],y,a[1]),end=new THREE.Vector3(b[0],y,b[1]),count=Math.max(2,Math.ceil(start.distanceTo(end)/.13));
    for(let i=0;i<=count;i++){const p=start.clone().lerp(end,i/count),h=.42+noise(i)*.04;rod([p.x,y,p.z],[p.x,y+h,p.z],.018,c.timberLight,parent);for(const h of [.12,.31])collar(p.x,y+h,p.z,.023,.022,c.timber,parent);}
    for(const h of [.12,.31])rod([a[0],y+h,a[1]],[b[0],y+h,b[1]],.021,c.timber,parent);
    // Living bamboo rises behind the woven screen, with clear joint collars and
    // long, folded leaf sprays. It does not project toward the playing route.
    for(let j=0;j<3;j++){
      const p=start.clone().lerp(end,.2+j*.3),h=.72+noise(j)*.26,lean=(j-1)*.045;
      taperedRod([p.x,y,p.z+.07],[p.x+lean,y+h,p.z+.10],.021,c.leaf,parent);
      for(let k=1;k<4;k++){collar(p.x+lean*k/4,y+h*k/4,p.z+.07,.025,.019,c.leafLight,parent);}
      for(const side of [-1,1]){
        const tip=[p.x+side*.19,y+h*.82,p.z+.10];rod([p.x,y+h*.66,p.z+.09],tip,.009,c.leaf,parent);
        const spray=leafCluster(tip[0],tip[1],tip[2],.33,.22,.22,j+side,parent,'needle');spray.rotation.y=side*Math.PI/2;spray.rotation.z=side*.28;
      }
    }
  }
  function stoneLantern(x,y,z,parent=root){
    stone(x,y,z,.32,.06,.35,0,c.stoneDark,parent);stone(x,y+.06,z,.24,.045,.27,0,c.stoneLight,parent);
    collar(x,y+.25,z,.062,.29,c.stone,parent);collar(x,y+.14,z,.087,.035,c.stoneLight,parent);collar(x,y+.365,z,.09,.035,c.stoneLight,parent);
    stone(x,y+.385,z,.26,.05,.30,0,c.stoneLight,parent);stone(x,y+.43,z,.19,.13,.22,0,c.stoneDark,parent);
    for(const side of [-1,1]){
      const pane=stone(x,y+.445,z+side*.088,.10,.085,.012,0,c.warm,parent);pane.rotation.y=0;
      const sidePane=stone(x+side*.088,y+.445,z,.012,.085,.11,0,c.warm,parent);sidePane.rotation.y=0;
    }
    for(const dx of [-.09,.09])for(const dz of [-.085,.085])rod([x+dx,y+.43,z+dz],[x+dx,y+.565,z+dz],.018,c.stoneLight,parent);
    for(let tier=0;tier<3;tier++){const cap=stone(x,y+.56+tier*.025,z,.36-tier*.085,.038,.40-tier*.09,0,tier?c.stone:c.stoneDark,parent);cap.rotation.y=0;}
    disc(x,y+.67,z,.048,.08,c.stone,parent);add(sphere,c.stoneLight,[x,y+.72,z],[.04,.037,.04],0,parent);
  }
  function bench(x,y,z,angle=0,parent=root){
    const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=angle;parent.add(g);
    for(let i=0;i<4;i++){const slat=stone(0,.23,(i-1.5)*.052,.64,.027,.058,i,i%2?c.timber:c.timberLight,g);slat.rotation.y=0;}
    for(const dx of [-.24,.24]){
      rod([dx-.035,0,-.065],[dx,.25,-.065],.022,c.metal,g);rod([dx+.035,0,.075],[dx,.42,.10],.022,c.metal,g);
      rod([dx,.34,-.075],[dx,.34,.095],.018,c.metal,g);rod([dx,.23,-.075],[dx,.34,-.075],.016,c.metal,g);
      const foot=stone(dx,.002,0,.11,.022,.24,0,c.metal,g);foot.rotation.y=0;
    }
    for(const h of [.32,.385]){const slat=stone(0,h,.092,.64,.045,.045,0,c.timberLight,g);slat.rotation.y=0;slat.rotation.x=-.10;}
  }
  // One shared fabric material and one faceted scalloped canopy per park.
  const umbrellaMaterial=kit.material((mapId==='classic'?c.flowerLight:c.leafLight).color);
  let umbrellaGeometry=null;
  function cafe(x,y,z,parent=root){
    disc(x,y+.36,z,.20,.04,c.path,parent);rod([x,y,z],[x,y+.35,z],.03,c.metal,parent);disc(x,y+.025,z,.11,.035,c.metal,parent);
    for(const side of [-1,1]){disc(x+side*.34,y+.22,z,.11,.035,c.timberLight,parent);for(const dz of [-.05,.05])rod([x+side*.34,y,z+dz],[x+side*.34,y+.23,z+dz],.018,c.metal,parent);rod([x+side*.42,y+.2,z-.08],[x+side*.42,y+.43,z-.08],.02,c.metal,parent);rod([x+side*.42,y+.43,z-.08],[x+side*.42,y+.43,z+.08],.02,c.metal,parent);}
    if(!umbrellaGeometry){const p=[],uv=[];for(let i=0;i<10;i++){
      const a=i*Math.PI/5,b=(i+1)*Math.PI/5,mid=(a+b)/2,A=[Math.cos(a)*.46,0,Math.sin(a)*.46],B=[Math.cos(b)*.46,0,Math.sin(b)*.46],M=[Math.cos(mid)*.47,-.035,Math.sin(mid)*.47];
      for(const v of [[0,.15,0],B,A,A,B,M]){p.push(...v);uv.push(0,0);}}
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();umbrellaGeometry=own(geometry);}
    rod([x,y+.36,z],[x,y+1.13,z],.018,c.timber,parent);add(umbrellaGeometry,umbrellaMaterial,[x,y+.96,z],[1,1,1],0,parent);
    for(let i=0;i<10;i++){const a=i*Math.PI/5;rod([x,y+1.1,z],[x+Math.cos(a)*.45,y+.955,z+Math.sin(a)*.45],.006,c.timberLight,parent);}
    disc(x,y+.40,z,.05,.012,c.stoneLight,parent);disc(x+.075,y+.405,z,.02,.04,c.stoneLight,parent);
  }
  function pavilion(x,y,z,size=.8,parent=root){
    const g=new THREE.Group();g.name='regional_garden_pavilion';g.position.set(x,y,z);g.scale.setScalar(size);parent.add(g);
    for(let j=0;j<3;j++)disc(0,j*.055,0,.72-j*.06,.06,c.stoneLight,g);
    // Only the paved garden plinth is procedural. Its actual pavilion borrows
    // the same authored Blender architecture used by the playable city.
    const anchor=new THREE.Group();anchor.position.y=.14;anchor.userData.regionalScenicAsset='junction_hub';anchor.userData.scenicWidth=1.18;anchor.userData.scenicHeight=1.34;g.add(anchor);
  }
  function treeGrate(x,y,z,size=.4,parent=root){
    const base=stone(x,y,z,size*1.18,.025,size*1.45,0,c.stoneLight,parent);base.rotation.y=0;
    for(const side of [-1,1]){
      for(let i=0;i<5;i++){const grate=stone(x+(i-2)*size*.20,y+.029,z+side*size*.23,size*.055,.014,size*.42,0,c.metal,parent);grate.rotation.y=0;}
      rod([x-size*.52,y+.035,z+side*size*.44],[x+size*.52,y+.035,z+side*size*.44],.009,c.metal,parent);
    }
  }
  function streetBed(x,y,z,rx=.8,rz=.5,parent=root){
    const soil=stone(x,y,z,rx*2,.05,rz*2.5,0,c.soil,parent);soil.rotation.y=0;
    for(const side of [-1,1]){
      const long=stone(x,y+.025,z+side*rz,.1,.09,rx*2+.16,0,c.stoneLight,parent);long.rotation.y=Math.PI/2;
      const short=stone(x+side*rx,y+.025,z,.1,.09,rz*2.5,0,c.stoneLight,parent);short.rotation.y=0;
      for(let i=0;i<5;i++){const px=x+(i-2)*rx*.43;rod([px,y+.09,z+side*rz],[px,y+.28,z+side*rz],.011,c.metal,parent);}
      rod([x-rx*.92,y+.24,z+side*rz],[x+rx*.92,y+.24,z+side*rz],.013,c.metal,parent);
    }
    for(const side of [-1,1])groundCover(x+side*rx*.65,y+.06,z,rz*.4,side+9,parent);
  }
  function pondPlants(x,y,z,seed=0,parent=root){
    for(let i=0;i<3;i++){const a=i*2.399+seed,r=.12+i*.045;disc(x+Math.cos(a)*r,y,z+Math.sin(a)*r,.065+i*.014,.008,c.leaf,parent);}
    groundCover(x+.24,y,z-.06,.11,seed,parent,'reeds');
  }
  return {disc,clippedTree,hedge,parterre,cherry,bamboo,stoneLantern,bench,cafe,pavilion,treeGrate,streetBed,pondPlants};
}

// Resource ownership stays with scene.js. The water feature remains at (0,0),
// so existing people, fountain spray and seasonal effects keep their anchor.
export function createRegionalPark({THREE,world,boardBounds,mapId,own,loadSceneryBundle=null,requestRender=()=>{}}){
  if(!PALETTES[mapId])return null;
  const w=boardBounds.w-4.7,d=boardBounds.d-4.65;if(w<1||d<1)return null;
  const root=new THREE.Group();root.name=`regional_park_${mapId}`;root.userData.cosmetic=true;root.userData.seasonalScenery=true;world.add(root);
  const kit=createGardenKit({THREE,own,root,palette:PALETTES[mapId]});
  const {colors:c,island,pavedPath,bankEllipse,boulder,bush,broadTree,stoneArch,woodBridge,lantern,stone}=kit;
  const {disc,clippedTree,hedge,parterre,cherry,bamboo,stoneLantern,bench,cafe,pavilion,treeGrate,streetBed,pondPlants}=regionalPieces({THREE,kit,root,own,mapId});
  island(0,0,w*.45,d*.45,.08,.025,2,c.grass);
  const tx=w/2-.70,tz=d/2-.70;
  if(mapId==='classic'){
    pavedPath([[-w*.46,.14,0],[0,.14,0],[w*.46,.14,0]],.65,11);pavedPath([[0,.14,-d*.46],[0,.14,0],[0,.14,d*.46]],.65,12);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const x=sx*w*.27,z=sz*d*.27;parterre(x,z,Math.min(.72,w*.15),Math.min(.56,d*.16),.13);
      clippedTree(sx*tx,.12,sz*tz,.85);stone(x,.17,z,.25,.07,.25,1,c.stoneLight);disc(x,.28,z,.11,.16,c.stone);
    }
    for(const side of [-1,1]){bench(side*1.12,.14,.64,side*Math.PI/2);lantern(side*1.15,.14,-.65);}
    for(const side of [-1,1]){
      for(let i=0;i<5;i++){const tile=stone(side*w*.39,.145,(i-2)*d*.13,.13,.02,.22,20+i,c.stoneLight);tile.rotation.y=0;}
    }
  }else if(mapId==='compact'){
    // A loop of stepping stones and a little raised bridge make a pond garden,
    // with clustered cherry crowns and bamboo screens rather than beach props.
    island(0,0,Math.min(1.3,w*.29),Math.min(1.02,d*.30),.12,.025,20,c.water);
    bankEllipse(0,0,Math.min(1.32,w*.29),Math.min(1.04,d*.30),.105,.075,26);
    pavedPath([[-w*.43,.145,d*.29],[-w*.27,.145,.65],[-.9,.145,-d*.27],[.35,.145,-d*.34],[w*.4,.145,-d*.12]],.47,44);
    woodBridge([[.72,.21,.55],[1.06,.32,.05],[1.0,.21,-.48]],.48);
    for(const [i,[x,z]] of [[-tx,-tz],[tx,tz],[-tx,tz]].entries()){cherry(x,.14,z,.9+(i%2)*.1,100+i);boulder(x*.72,.19,z*.72,.26,.18,.35,17+i);}
    bamboo([-tx+.05,-tz],[tx*.45,-tz],.13);bamboo([tx,-tz*.5],[tx,tz*.5],.13);
    stoneLantern(-1.45,.15,.35);stoneLantern(.55,.15,-tz*.85);bench(tx*.4,.15,tz*.88);
    for(let i=0;i<6;i++)stone(-.5+i*.18,.17,.7+Math.sin(i)*.13,.16,.04,.17,63+i,c.stoneDark);
    pondPlants(-.73,.157,-.15,6);pondPlants(.1,.157,-.64,7);
    // Raked gravel and offset moss stones provide a dry garden beside the pond.
    island(-tx*.65,tz*.68,.45,.30,.13,.016,3,c.path);
    for(let i=0;i<5;i++)kit.ribbon([[-tx*.65-.36,.158,tz*.68+(i-2)*.072],[-tx*.65,.158,tz*.68+(i-2)*.072+.035],[-tx*.65+.36,.158,tz*.68+(i-2)*.072]],.012,c.mortar,root,16);
    boulder(-tx*.65,.20,tz*.68,.13,.12,.15,14);kit.groundCover(-tx*.65,.15,tz*.68,.20,18);
  }else{
    pavedPath([[-w*.46,.14,0],[0,.14,0],[w*.46,.14,0]],.76,70);pavedPath([[0,.14,-d*.46],[0,.14,0],[0,.14,d*.46]],.76,71);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const x=sx*w*.29,z=sz*d*.30;streetBed(x,.12,z,Math.min(.9,w*.16),Math.min(.65,d*.17));
      const pavilionClearing=sx===1&&sz===-1&&w>4&&d>3;
      for(let i=0;i<3;i++){if(!pavilionClearing)broadTree(x+(i-1)*.46,.16,z+(i%2)*.22,.76,87+i);bush(x+(i-1)*.4,.16,z-.3,.17,92+i);}
      bench(x,.17,z-sz*.56,sz<0?0:Math.PI);
    }
    if(w>4&&d>3)pavilion(w*.28,.18,-d*.29,.78);
    for(const side of [-1,1]){lantern(side*1.15,.15,.7);lantern(side*1.15,.15,-.7);}
    for(const side of [-1,1]){treeGrate(side*w*.41,.13,0,.38);broadTree(side*w*.41,.17,0,.67,9+side);}
  }
  // Common fountain is deliberately compact so every regional garden retains
  // the same animation anchor without obscuring its paths and planting.
  disc(0,.17,0,.81,.04,c.stoneDark);disc(0,.19,0,.76,.09,c.stoneLight);disc(0,.25,0,.64,.035,c.water);disc(0,.39,0,.11,.29,c.stone);disc(0,.55,0,.27,.06,c.stoneLight);disc(0,.66,0,.055,.17,c.stone);
  for(let i=0;i<16;i++){const a=i*Math.PI/8,p=stone(Math.cos(a)*.70,.245,Math.sin(a)*.70,.20,.035,.16,i,c.stoneLight);p.rotation.y=-a+Math.PI/2;}
  kit.finish();root.userData.regionalTheme=mapId;
  if(mapId==='expansion'&&loadSceneryBundle){
    root.architectureLoading=loadSceneryBundle(`regions/${mapId}.glb`).then(bundle=>{
      if(!root.parent)return;fillRegionalScenicBuildings({THREE,root,bundle,mapId});requestRender();
    }).catch(error=>{if(root.parent&&error?.name!=='AbortError')console.warn('Regional park architecture unavailable',error.message);});
  }
  return root;
}

export function fillRegionalScenicBuildings({THREE,root,bundle,mapId}){
  const anchors=[];root.traverse(node=>{if(node.userData.regionalScenicAsset&&!node.userData.scenicModelReady)anchors.push(node);});
  for(const anchor of anchors){
    const source=bundle.scene.getObjectByName(`${mapId}_${anchor.userData.regionalScenicAsset}`);if(!source)continue;
    const model=source.clone(true);model.position.set(0,0,0);model.name=`scenic_${source.name}`;model.userData.cosmetic=true;
    let bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    model.scale.setScalar(Math.min(anchor.userData.scenicWidth/Math.max(size.x,size.z,.001),anchor.userData.scenicHeight/Math.max(size.y,.001)));
    bounds=new THREE.Box3().setFromObject(model);const center=bounds.getCenter(new THREE.Vector3());model.position.set(-center.x,-bounds.min.y,-center.z);
    model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.raycast=()=>{};}});
    anchor.add(model);anchor.userData.scenicModelReady=true;
  }
}

// The surrounding district has a low inner promenade and real regional
// buildings on the distant terrace. Each edge is authored in outward-local Z.
export function createRegionalSurroundings({THREE,root,own,boardBounds,mapId}){
  const palette=PALETTES[mapId]||PALETTES.classic,kit=createGardenKit({THREE,own,root,palette}),plots=[];
  const {colors:c,add,material,island,pavedPath,ribbon,wall,bush,broadTree,stone,rod,stoneArch,woodBridge,boulder,lantern}=kit;
  const {clippedTree,parterre,cherry,bamboo,stoneLantern,bench,cafe,pavilion,treeGrate,streetBed,pondPlants}=regionalPieces({THREE,kit,root,own,mapId});
  const w=boardBounds.w,d=boardBounds.d,urban=mapId==='expansion',japanese=mapId==='compact';
  // A continuous sculpted outer terrace joins the four districts and corner
  // gardens. Its central opening preserves the complete playable plinth.
  function roundedOutline(path,width,depth,radius){
    const x=-width/2,z=-depth/2,r=radius;path.moveTo(x+r,z);path.lineTo(x+width-r,z);path.quadraticCurveTo(x+width,z,x+width,z+r);path.lineTo(x+width,z+depth-r);path.quadraticCurveTo(x+width,z+depth,x+width-r,z+depth);path.lineTo(x+r,z+depth);path.quadraticCurveTo(x,z+depth,x,z+depth-r);path.lineTo(x,z+r);path.quadraticCurveTo(x,z,x+r,z);path.closePath();return path;
  }
  const terrace=roundedOutline(new THREE.Shape(),w+9.1,d+9.1,1.5);
  terrace.holes.push(roundedOutline(new THREE.Path(),w+1.36,d+1.36,.1));
  const terraceGeometry=own(new THREE.ExtrudeGeometry(terrace,{depth:.10,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:1,curveSegments:5}));terraceGeometry.rotateX(-Math.PI/2);add(terraceGeometry,c.grass,[0,-.43,0]);
  const sections=[{x:0,z:d/2+.8,rotation:0,length:w},{x:w/2+.8,z:0,rotation:Math.PI/2,length:d},{x:0,z:-d/2-.8,rotation:Math.PI,length:w},{x:-w/2-.8,z:0,rotation:-Math.PI/2,length:d}];
  const asphalt=material('#7d8b88'),stripe=material('#ddd7bf');
  sections.forEach((section,s)=>{
    const g=new THREE.Group();g.name=`outskirts_district_${s}`;g.position.set(section.x,0,section.z);g.rotation.y=section.rotation;root.add(g);
    const half=section.length/2-.35;
    ribbon([[-half,-.32,2],[0,-.32,2],[half,-.32,2]],3.8,c.grass,g);
    pavedPath([[-half,-.26,.28],[0,-.26,.28],[half,-.26,.28]],.35,10+s,g);
    wall([[-half,-.43,.1],[0,-.43,.1],[half,-.43,.1]],.10,20+s,g);
    if(urban){
      ribbon([[-half,-.27,1.2],[0,-.27,1.2],[half,-.27,1.2]],.94,asphalt,g);
      pavedPath([[-half,-.25,2.0],[0,-.25,2.0],[half,-.25,2.0]],.55,30+s,g);
      for(const x of [-half*.8,half*.8])for(let k=0;k<5;k++)stone(x+(k-2)*.14,-.252,1.2,.085,.008,.88,1,stripe,g);
      for(let i=0;i<4;i++){
        const x=(i-1.5)*section.length*.20;treeGrate(x,-.24,2.2,.42,g);broadTree(x,-.205,2.2,.86,45+i,g);bench(x+.46,-.22,2.55,0,g);
        for(const side of [-1,1]){rod([x+side*.35,-.24,1.72],[x+side*.35,.05,1.72],.025,c.metal,g);stone(x+side*.35,.055,1.72,.06,.025,.07,0,c.stoneLight,g);}
        if(i%2===0){streetBed(x-.65,-.24,2.55,.28,.20,g);bush(x-.65,-.16,2.55,.24,39+i,g,true);}
      }
      if(s===2)pavilion(0,-.22,3.05,.94,g);
    }else if(japanese){
      ribbon([[-half,-.29,1.24],[-half*.35,-.29,1.5],[half*.35,-.29,1.2],[half,-.29,1.45]],.85,c.water,g);
      wall([[-half,-.40,.75],[0,-.40,.9],[half,-.40,.95]],.12,50+s,g);
      woodBridge([[-half*.22,-.20,1.02],[-half*.18,-.04,1.42],[-half*.15,-.20,1.93]],.53,g);
      pavedPath([[-half,-.25,2.17],[0,-.25,2.1],[half,-.25,2.25]],.43,60+s,g);
      for(let i=0;i<4;i++){const x=(i-1.5)*section.length*.21;cherry(x,-.24,2.35,.88+(i%2)*.1,70+i,g);bamboo([x-.45,2.8],[x+.45,2.8],-.23,g);stoneLantern(x+.4,-.24,1.93,g);boulder(x-.4,-.21,1.76,.23,.15,.25,20+i,g);}
      for(const x of [-half*.6,half*.58]){pondPlants(x,-.279,1.35,4+s,g);kit.groundCover(x+.3,-.24,1.95,.18,s+31,g,'reeds');}
    }else{
      pavedPath([[-half,-.26,1.4],[0,-.26,1.4],[half,-.26,1.4]],.55,80+s,g);
      for(let i=0;i<4;i++){const x=(i-1.5)*section.length*.21;parterre(x,2.12,.54,.39,-.24,g);clippedTree(x,-.23,2.85,.87,g);lantern(x+.43,-.25,.92,g);}
      for(const side of [-1,1]){cafe(side*half*.58,-.24,1.25,g);bench(side*half*.85,-.23,2.12,Math.PI/2,g);}
    }
    for(let i=0;i<3;i++){
      const x=(i-1)*section.length*.28;
      if(urban&&s===2&&i===1)continue;
      const position=new THREE.Vector3(x,-.27,3.32);g.updateMatrix();position.applyMatrix4(g.matrix);
      plots.push({x:position.x,y:position.y,z:position.z,rotation:section.rotation+Math.PI,width:urban?1.1:1.2,height:urban?2.4:1.5,asset:urban?(i===1?'tower_2':'hotel_2'):(i===1?'shop_2':'villa_2')});
    }
  });
  for(const [i,[sx,sz]] of [[-1,-1],[1,-1],[1,1],[-1,1]].entries()){
    const x=sx*(w/2+2.35),z=sz*(d/2+2.35),g=new THREE.Group();g.name=`outskirts_corner_garden_${i}`;root.add(g);
    island(x,z,1.2,1.2,-.36,.09,100+i,c.grass,g);
    if(japanese){cherry(x,-.25,z,1.1,110+i,g);boulder(x+.5,-.2,z-.35,.35,.24,.3,115+i,g);bush(x-.45,-.24,z+.45,.3,120+i,g);}
    else{broadTree(x-.25,-.25,z-.15,.94,130+i,g);broadTree(x+.4,-.25,z+.35,.7,140+i,g);bush(x-.5,-.24,z+.44,.32,150+i,g,true);}
  }
  kit.finish();root.traverse(node=>{if(node.isMesh){
    // Trees and furniture ground the diorama with short contact shadows. Flat
    // paths, the terrace and water do not enter the shadow pass.
    node.geometry.computeBoundingBox();node.castShadow=node.geometry.boundingBox.max.y>.34&&node.material!==c.warm;node.raycast=()=>{};
  }});
  root.userData.theme=mapId==='compact'?'japanese_town':mapId==='expansion'?'art_deco_district':'french_garden_town';
  root.userData.landscape={draws:0,triangles:0};root.traverse(n=>{if(n.isMesh){root.userData.landscape.draws++;root.userData.landscape.triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;}});
  return {plots,warm:c.warm,theme:root.userData.theme};
}

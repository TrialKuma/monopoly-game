import { createGardenKit } from './scene-garden-kit.js?v=20261024-1';

const PALETTES={
  classic:{stone:'#b9b4a1',stoneLight:'#ded4b9',stoneDark:'#8c9682',path:'#d6c9aa',mortar:'#a4a18c',soil:'#817b58',grass:'#9bb17e',timber:'#86704e',timberLight:'#b79a6c',metal:'#475e55',leaf:'#537450',leafLight:'#83a16b',flowers:'#cc879c',flowerLight:'#efcf9b',water:'#76aaa5'},
  compact:{stone:'#a6aaa2',stoneLight:'#d1cbbb',stoneDark:'#788e85',path:'#c9c1ae',mortar:'#989e8e',soil:'#8b806a',grass:'#9caf88',timber:'#76614c',timberLight:'#a9986f',metal:'#53615c',leaf:'#547e67',leafLight:'#88aa7b',flowers:'#d49cac',flowerLight:'#edc6cd',water:'#78b5b3'},
  expansion:{stone:'#a4afaa',stoneLight:'#cbd0bd',stoneDark:'#72898a',path:'#c0c8bb',mortar:'#8f9b97',soil:'#8c8d72',grass:'#94ae86',timber:'#806b51',timberLight:'#b6a17a',metal:'#4b6866',leaf:'#527b62',leafLight:'#80a078',flowers:'#c9a167',flowerLight:'#e4ce8d',water:'#6fa5ae'},
};

function regionalPieces({THREE,kit,root,own,mapId}){
  const {add,colors:c,rod,stone,island,bush,broadTree,noise,circle,sphere}=kit;
  const disc=(x,y,z,r,h,mat,parent=root)=>add(circle,mat,[x,y,z],[r,h,r],0,parent);
  function clippedTree(x,y,z,size=1,parent=root){rod([x,y,z],[x,y+.65*size,z],.045*size,c.timber,parent);add(sphere,c.leaf,[x,y+size*.85,z],[size*.33,size*.4,size*.33],.3,parent);add(sphere,c.leafLight,[x+size*.08,y+size*.92,z-.03],[size*.28,size*.27,size*.29],.6,parent);}
  function hedge(cx,cz,rx,rz,y,parent=root){for(let i=0;i<18;i++){const a=i/18*Math.PI*2;add(sphere,i%4?c.leaf:c.leafLight,[cx+Math.cos(a)*rx,y+.12,cz+Math.sin(a)*rz],[.19,.16,.19],a,parent);}}
  function parterre(cx,cz,rx,rz,y,parent=root){island(cx,cz,rx,rz,y,.02,6,c.soil,parent);hedge(cx,cz,rx,rz,y,parent);for(let i=0;i<5;i++){const a=i*2.4;bush(cx+Math.cos(a)*rx*.45,y+.03,cz+Math.sin(a)*rz*.45,.18,40+i,parent,true);}}
  function cherry(x,y,z,size=1,seed=0,parent=root){
    rod([x,y,z],[x-.07*size,y+.7*size,z],.055*size,c.timber,parent);
    for(let i=0;i<6;i++){const a=i*2.4+seed,dx=Math.cos(a)*size*.3,dz=Math.sin(a)*size*.28;rod([x-.05*size,y+.46*size,z],[x+dx,y+.88*size,z+dz],.027*size,c.timber,parent);add(sphere,i%3?c.flowers:c.flowerLight,[x+dx,y+size*(.82+(i%2)*.13),z+dz],[size*.31,size*.23,size*.28],a,parent);}
    for(let i=0;i<7;i++){const a=i*2.4;add(sphere,c.flowerLight,[x+Math.cos(a)*size*.43,y+.013,z+Math.sin(a)*size*.4],[.026,.009,.025],a,parent);}
  }
  function bamboo(a,b,y,parent=root){
    const start=new THREE.Vector3(a[0],y,a[1]),end=new THREE.Vector3(b[0],y,b[1]),count=Math.max(2,Math.ceil(start.distanceTo(end)/.13));
    for(let i=0;i<=count;i++){const p=start.clone().lerp(end,i/count),h=.45+noise(i)*.05;rod([p.x,y,p.z],[p.x,y+h,p.z],.019,c.timberLight,parent);}
    for(const h of [.12,.34])rod([a[0],y+h,a[1]],[b[0],y+h,b[1]],.025,c.timber,parent);
  }
  function stoneLantern(x,y,z,parent=root){
    stone(x,y,z,.28,.07,.28,0,c.stone,parent);disc(x,y+.23,z,.058,.31,c.stone,parent);stone(x,y+.38,z,.24,.055,.24,0,c.stoneLight,parent);
    add(circle,c.warm,[x,y+.47,z],[.072,.13,.072],0,parent);
    for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;rod([x+Math.cos(a)*.09,y+.4,z+Math.sin(a)*.09],[x+Math.cos(a)*.09,y+.55,z+Math.sin(a)*.09],.017,c.stone,parent);}
    add(own(new THREE.ConeGeometry(.23,.13,4)),c.stoneDark,[x,y+.59,z],[1,1,1],Math.PI/4,parent);disc(x,y+.68,z,.03,.10,c.stone,parent);
  }
  function bench(x,y,z,angle=0,parent=root){
    const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=angle;parent.add(g);
    for(const dz of [-.08,0,.08])rod([-.3,.23,dz],[.3,.23,dz],.025,c.timberLight,g);
    for(const dx of [-.24,.24]){rod([dx,0,-.07],[dx,.26,-.07],.026,c.metal,g);rod([dx,0,.07],[dx,.42,.07],.026,c.metal,g);}
    for(const h of [.33,.4])rod([-.3,h,.07],[.3,h,.07],.026,c.timber,g);
  }
  function cafe(x,y,z,parent=root){
    disc(x,y+.36,z,.20,.04,c.path,parent);rod([x,y,z],[x,y+.35,z],.03,c.metal,parent);disc(x,y+.025,z,.11,.035,c.metal,parent);
    for(const side of [-1,1]){disc(x+side*.34,y+.22,z,.11,.035,c.timberLight,parent);for(const dz of [-.05,.05])rod([x+side*.34,y,z+dz],[x+side*.34,y+.23,z+dz],.018,c.metal,parent);rod([x+side*.42,y+.2,z-.08],[x+side*.42,y+.43,z-.08],.02,c.metal,parent);rod([x+side*.42,y+.43,z-.08],[x+side*.42,y+.43,z+.08],.02,c.metal,parent);}
    rod([x,y+.36,z],[x,y+1.0,z],.018,c.timber,parent);add(own(new THREE.ConeGeometry(.46,.15,10)),kit.material((mapId==='classic'?c.flowerLight:c.leafLight).color),[x,y+1.04,z],[1,1,1],0,parent);
  }
  function pavilion(x,y,z,size=.8,parent=root){
    const g=new THREE.Group();g.name='regional_garden_pavilion';g.position.set(x,y,z);g.scale.setScalar(size);parent.add(g);
    for(let j=0;j<3;j++)disc(0,j*.055,0,.72-j*.06,.06,c.stoneLight,g);
    // Only the paved garden plinth is procedural. Its actual pavilion borrows
    // the same regional AI architecture used by the playable city.
    const anchor=new THREE.Group();anchor.position.y=.14;anchor.userData.regionalScenicAsset='junction_hub';anchor.userData.scenicWidth=1.18;anchor.userData.scenicHeight=1.34;g.add(anchor);
  }
  return {disc,clippedTree,hedge,parterre,cherry,bamboo,stoneLantern,bench,cafe,pavilion};
}

// Resource ownership stays with scene.js. The water feature remains at (0,0),
// so existing people, fountain spray and seasonal effects keep their anchor.
export function createRegionalPark({THREE,world,boardBounds,mapId,own,loadSceneryBundle=null,requestRender=()=>{}}){
  if(!PALETTES[mapId])return null;
  const w=boardBounds.w-4.7,d=boardBounds.d-4.65;if(w<1||d<1)return null;
  const root=new THREE.Group();root.name=`regional_park_${mapId}`;root.userData.cosmetic=true;root.userData.seasonalScenery=true;world.add(root);
  const kit=createGardenKit({THREE,own,root,palette:PALETTES[mapId]});
  const {colors:c,island,pavedPath,bankEllipse,boulder,bush,broadTree,stoneArch,woodBridge,lantern,stone}=kit;
  const {disc,clippedTree,hedge,parterre,cherry,bamboo,stoneLantern,bench,cafe,pavilion}=regionalPieces({THREE,kit,root,own,mapId});
  island(0,0,w*.45,d*.45,.08,.025,2,c.grass);
  const tx=w/2-.70,tz=d/2-.70;
  if(mapId==='classic'){
    pavedPath([[-w*.46,.14,0],[0,.14,0],[w*.46,.14,0]],.65,11);pavedPath([[0,.14,-d*.46],[0,.14,0],[0,.14,d*.46]],.65,12);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const x=sx*w*.27,z=sz*d*.27;parterre(x,z,Math.min(.72,w*.15),Math.min(.56,d*.16),.13);
      clippedTree(sx*tx,.12,sz*tz,.85);stone(x,.17,z,.25,.07,.25,1,c.stoneLight);disc(x,.28,z,.11,.16,c.stone);
    }
    for(const side of [-1,1]){bench(side*1.12,.14,.64,side*Math.PI/2);lantern(side*1.15,.14,-.65);}
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
  }else{
    pavedPath([[-w*.46,.14,0],[0,.14,0],[w*.46,.14,0]],.76,70);pavedPath([[0,.14,-d*.46],[0,.14,0],[0,.14,d*.46]],.76,71);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const x=sx*w*.29,z=sz*d*.30;island(x,z,Math.min(.9,w*.16),Math.min(.65,d*.17),.12,.05,80,c.soil);
      const pavilionClearing=sx===1&&sz===-1&&w>4&&d>3;
      for(let i=0;i<3;i++){if(!pavilionClearing)broadTree(x+(i-1)*.46,.16,z+(i%2)*.22,.76,87+i);bush(x+(i-1)*.4,.16,z-.3,.17,92+i);}
      bench(x,.17,z-sz*.56,sz<0?0:Math.PI);
    }
    if(w>4&&d>3)pavilion(w*.28,.18,-d*.29,.78);
    for(const side of [-1,1]){lantern(side*1.15,.15,.7);lantern(side*1.15,.15,-.7);}
  }
  // Common fountain is deliberately compact so every regional garden retains
  // the same animation anchor without obscuring its paths and planting.
  disc(0,.19,0,.76,.09,c.stoneLight);disc(0,.25,0,.64,.035,c.water);disc(0,.39,0,.11,.29,c.stone);disc(0,.55,0,.27,.06,c.stoneLight);disc(0,.66,0,.055,.17,c.stone);
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
  const {clippedTree,parterre,cherry,bamboo,stoneLantern,bench,cafe,pavilion}=regionalPieces({THREE,kit,root,own,mapId});
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
      for(let i=0;i<4;i++){const x=(i-1.5)*section.length*.20;for(let j=0;j<2;j++)broadTree(x+j*.35,-.24,2.2,.72,45+i+j,g);bench(x,-.22,2.55,0,g);}
      if(s===2)pavilion(0,-.22,3.05,.94,g);
    }else if(japanese){
      ribbon([[-half,-.29,1.24],[-half*.35,-.29,1.5],[half*.35,-.29,1.2],[half,-.29,1.45]],.85,c.water,g);
      wall([[-half,-.40,.75],[0,-.40,.9],[half,-.40,.95]],.12,50+s,g);
      woodBridge([[-half*.22,-.20,1.02],[-half*.18,-.04,1.42],[-half*.15,-.20,1.93]],.53,g);
      pavedPath([[-half,-.25,2.17],[0,-.25,2.1],[half,-.25,2.25]],.43,60+s,g);
      for(let i=0;i<4;i++){const x=(i-1.5)*section.length*.21;cherry(x,-.24,2.35,.88+(i%2)*.1,70+i,g);bamboo([x-.45,2.8],[x+.45,2.8],-.23,g);stoneLantern(x+.4,-.24,1.93,g);boulder(x-.4,-.21,1.76,.23,.15,.25,20+i,g);}
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

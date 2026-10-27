import * as THREE from './assets/vendor/three/three.module.min.js';
import { makeStudioEnvironment } from './scene-environment.js?v=20261025-facade2';
import {GLTFLoader} from './assets/vendor/three/addons/loaders/GLTFLoader.js';
const $=id=>document.getElementById(id),region=$('region'),board=$('board'),cards=$('cards'),params=new URLSearchParams(location.search);
const candidate=params.get('artStage')==='candidate';
if([...region.options].some(o=>o.value===params.get('map')))region.value=params.get('map');
const families=[['villa','住宅'],['shop','商铺'],['hotel','旅馆'],['tower','公馆'],['skyscraper','大酒店'],['finance','商会'],['onsen','温泉庄园']];
const familyReview=families.some(([name])=>name===params.get('family'))?params.get('family'):null;
const publics=[['civic_hall','市政厅'],['vault_bank','银行'],['builders_guild','工坊'],['card_pavilion','卡牌店'],['chance_wheel','幸运亭'],['teleport_gate','交通门'],['rush_station','快线站'],['junction_hub','路口驿站']];
const assets=[...families.flatMap(([family,label])=>[1,2,3].map(level=>({name:`${family}_${level}`,family,level,label:`${label} · Lv.${level}`}))),...publics.map(([name,label])=>({name,family:name,level:1,label}))].filter(asset=>!familyReview||asset.family===familyReview);
if(familyReview){document.body.classList.add('family-review');document.querySelector('h1').textContent=`${families.find(([name])=>name===familyReview)[1]} · 三级对照`;}
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.setClearColor('#e9e8df');board.prepend(renderer.domElement);
let bundle=null,views=[],view=params.get('view')==='top'?'top':'iso',token=0,disposed=false,frame=0;
const topButton=document.createElement('button');topButton.dataset.view='top';topButton.textContent='俯视';document.querySelector('nav').insertBefore(topButton,$('status'));
document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
const environment=makeStudioEnvironment(renderer);
function dispose(gltf){if(!gltf)return;const resources=new Set(),images=new Set();gltf.scene.traverse(n=>{if(n.geometry)resources.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])if(m){resources.add(m);for(const value of Object.values(m))if(value?.isTexture){resources.add(value);const data=value.source?.data;for(const image of Array.isArray(data)?data:[data])if(image?.close)images.add(image);}}});resources.forEach(r=>r.dispose());images.forEach(i=>i.close());}
function draw(){
  frame=0;if(disposed)return;const w=board.clientWidth,h=cards.clientHeight;renderer.setSize(w,h,false);renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true);
  for(const item of views){
    const card=item.card,x=card.offsetLeft,y=h-card.offsetTop-card.offsetHeight+38,width=card.clientWidth,height=card.clientHeight-40;
    if(height<=0)continue;const {camera,center}=item,size=item.framing||item.size,aspect=width/height,v=Math.max(size.y*.64,Math.hypot(size.x,size.z)*.65/aspect,.3);
    camera.left=-v*aspect;camera.right=v*aspect;camera.top=v;camera.bottom=-v;
    const yaw=view==='iso'||view==='top'?.55:view==='back'?Math.PI:0,elevation=view==='top'?1.35:view==='iso'?.38:0,horizontal=view==='top'?Math.cos(elevation)*12:12;camera.position.set(center.x+Math.sin(yaw)*horizontal,center.y+Math.sin(elevation)*12,center.z+Math.cos(yaw)*horizontal);camera.lookAt(center);camera.updateProjectionMatrix();
    renderer.setViewport(x,y,width,height);renderer.setScissor(x,y,width,height);renderer.render(item.scene,camera);
  }
  renderer.setScissorTest(false);
}
function requestDraw(){if(!frame&&!disposed)frame=requestAnimationFrame(draw);}
async function load(){
  const current=++token,map=region.value;views=[];cards.replaceChildren();dispose(bundle);bundle=null;$('error').hidden=true;$('status').textContent='模型载入中';requestDraw();
  const url=candidate&&familyReview?`./art/full-ai-city/packed/families/${map}-${familyReview}.glb`:candidate?`./art/full-ai-city/packed/${map}.glb`:`./assets/models/regions/${map}.glb`;
  try{
    const gltf=await new GLTFLoader().loadAsync(`${url}?v=20261028-global-roofs2`);if(current!==token||disposed){dispose(gltf);return;}bundle=gltf;let authored=0,loaded=0;
    for(const asset of assets){
      const source=gltf.scene.getObjectByName(`${map}_${asset.name}`);if(!source)throw new Error(`缺少${asset.label}，整套资源尚未完成。`);
      const card=document.createElement('a');card.className='card';const query=new URLSearchParams({map,family:asset.family,level:String(asset.level)});if(candidate)query.set('stage','candidate');card.href=`./art-review.html?${query}`;
      const title=document.createElement('b');title.textContent=asset.label;const detail=document.createElement('span');let triangles=0;source.traverse(n=>{if(n.isMesh)triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;});
      const rebuilt=source.userData.sourceType==='authored_blender_reference_rebuild';authored+=Number(rebuilt);loaded++;detail.textContent=rebuilt?'Blender · 三视图重建':source.userData.sourceType==='pixal_native_multiview'?'历史 AI 模型':'历史资源';card.append(title,detail);cards.append(card);
      const scene=new THREE.Scene(),object=source.clone(true);scene.add(object);scene.add(new THREE.HemisphereLight('#fff8eb','#a5b7a0',1.3));const sun=new THREE.DirectionalLight('#fff0da',2.5);sun.position.set(-4,8,6);scene.add(sun);const fill=new THREE.DirectionalLight('#d5eafa',.8);fill.position.set(5,4,-3);scene.add(fill);
      scene.environment=environment.texture;scene.environmentIntensity=.4;
      const bounds=new THREE.Box3().setFromObject(object);views.push({family:asset.family,card,scene,camera:new THREE.OrthographicCamera(-2,2,2,-2,.1,100),center:bounds.getCenter(new THREE.Vector3()),size:bounds.getSize(new THREE.Vector3())});
    }
    // The same camera scale within each family preserves visible upgrade size.
    for(const [family] of families){const group=views.filter(item=>item.family===family),framing=new THREE.Vector3();group.forEach(item=>framing.max(item.size));group.forEach(item=>{item.framing=framing;item.center.y=framing.y*.5;});}
    $('status').textContent=candidate?`历史 AI 候选 · ${loaded} / ${assets.length} 栋载入${familyReview?' · 同一镜头比例':''}`:`${authored} / ${assets.length} 栋 Blender 重建 · 同族升级保持同一镜头比例`;$('status').dataset.ready=String(candidate?loaded===assets.length:authored===assets.length);requestDraw();
  }catch(error){if(current!==token||disposed)return;$('status').textContent='未载入完整建筑集';$('error').textContent=error.message;$('error').hidden=false;requestDraw();}
}
region.addEventListener('change',load);document.querySelector('nav').addEventListener('click',event=>{const button=event.target.closest('[data-view]');if(!button)return;view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));requestDraw();});
const observer=new ResizeObserver(requestDraw);observer.observe(board);window.addEventListener('pagehide',()=>{disposed=true;token++;cancelAnimationFrame(frame);observer.disconnect();dispose(bundle);environment.dispose();renderer.dispose();},{once:true});load();

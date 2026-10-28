import { loadSharedModelAsset, disposeSharedModelAssets, regionalSceneryDirectory } from './scene-model-cache.js?v=20261028-global-roofs2';
import { buildDestinationGarden, batchGardenBuilding, instanceGardenBuildings } from './scene-garden-kit.js?v=20261025-terrain3';
import { createScenicWindowLights, createGroundLightPools, proceduralLampPositions } from './scene-scenic-lighting.js?v=20261027-night1';

// Destination art is cosmetic. The authored meshes keep their colors and rigid
// part animation clips; they never enter the board's static mesh batching.
const THEMES = {
  harbor: { file:'harbor/harbor_lighthouse.glb', name:'harbor_lighthouse', water:'#63acb9', stone:'#dacba7', land:'#b4c79c', roof:'#307f84', flower:'#e6988f' },
  alpine: { file:'harbor/alpine_windmill.glb', name:'alpine_windmill', water:'#7abfc4', stone:'#c4c7b2', land:'#adc4a3', roof:'#477e73', flower:'#d9ad84' },
};
function loadModel(file) {
  return loadSharedModelAsset(file,{version:'20261025-facade2'});
}
export function createDestinationScene({THREE, world, boardBounds, mapId, requestRender=()=>{}, loadSceneryBundle=loadModel}) {
  const theme=THEMES[mapId];if(!theme)return null;
  const root=new THREE.Group();root.name=`destination_${mapId}`;root.userData.cosmetic=true;root.userData.seasonalScenery=true;world.add(root);
  const perimeter=new THREE.Group();perimeter.name=`destination_${mapId}_outskirts`;root.add(perimeter);
  const owned=new Set(),mixers=[],waves=[],glows=[],boats=[],steam=[];
  const own=r=>{owned.add(r);return r;};
  const windowLights=createScenicWindowLights({THREE,own});
  const w=boardBounds.w,d=boardBounds.d,innerW=w-4.7,innerD=d-4.65;
  let elapsed=0,disposed=false,visible=true,ready=false,failed=false,regionReady=false,heroReady=false;
  const {warm,plots}=buildDestinationGarden({THREE,own,root,perimeter,mapId,w,d,innerW,innerD,waves,boats,steam});
  const lampPools=createGroundLightPools({THREE,parent:perimeter,own,positions:proceduralLampPositions({THREE,root:perimeter,material:warm}),radius:.62});
  const waterClocks=new Set();root.traverse(node=>{const materials=Array.isArray(node.material)?node.material:[node.material];for(const mat of materials)if(mat?.userData.landscapeTime)waterClocks.add(mat.userData.landscapeTime);});
  const regionLoading=loadSceneryBundle(`${regionalSceneryDirectory}/${mapId}.glb`).then(gltf=>{
    if(disposed)return;
    for(const plot of plots)if(!gltf.scene.getObjectByName(`${mapId}_${plot.asset}`))throw new Error(`Missing regional building ${mapId}_${plot.asset}`);
    const prepared=new Map(),village=new THREE.Group();let allInstanceable=true;root.userData.regionalBuildings=0;
    for(const plot of plots){
      const name=`${mapId}_${plot.asset}`,source=gltf.scene.getObjectByName(name);if(!source)continue;
      const instanceable=['pixal_native_multiview','authored_blender_reference_rebuild'].includes(source.userData.sourceType);allInstanceable=allInstanceable&&instanceable;
      if(!prepared.has(name))prepared.set(name,instanceable?source:batchGardenBuilding({THREE,source,own}));
      const building=prepared.get(name).clone(true);building.name=`scenic_${name}`;building.rotation.y=plot.rotation;
      let bounds=new THREE.Box3().setFromObject(building),size=bounds.getSize(new THREE.Vector3());building.scale.setScalar(Math.min(plot.width/Math.max(size.x,size.z),plot.height/size.y));
      bounds=new THREE.Box3().setFromObject(building);const center=bounds.getCenter(new THREE.Vector3());building.position.set(plot.x-center.x,plot.y-bounds.min.y,plot.z-center.z);
      village.add(building);root.userData.regionalBuildings++;
    }
    if(village.children.length){const batch=(allInstanceable?instanceGardenBuildings:batchGardenBuilding)({THREE,source:village,own});batch.name=`destination_${mapId}_village`;perimeter.add(batch);}
    windowLights.bind(perimeter);regionReady=true;ready=heroReady;requestRender();
  }).catch(error=>{if(!disposed){failed=true;ready=false;console.warn(`Regional scenery ${mapId} unavailable`,error.message);}});
  const heroLoading=loadSceneryBundle(theme.file).then(gltf=>{
    if(disposed)return;
    const model=gltf.scene.clone(true);model.name=theme.name;
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    const scale=Math.min(2.8/Math.max(size.x,size.z),3.7/size.y);model.scale.multiplyScalar(scale);
    const fit=new THREE.Box3().setFromObject(model),center=fit.getCenter(new THREE.Vector3());
    model.position.set(-center.x,.26-fit.min.y,-innerD*.25-center.z);
    model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;n.raycast=()=>{};}});
    root.add(model);
    windowLights.bind(model);
    const mixer=new THREE.AnimationMixer(model);gltf.animations.forEach(clip=>mixer.clipAction(clip).play());mixers.push(mixer);
    heroReady=true;ready=regionReady;root.userData.modelReady=true;root.userData.animationClips=gltf.animations.length;requestRender();
  }).catch(error=>{if(!disposed){failed=true;ready=false;console.warn(`Destination model ${theme.file} unavailable`,error.message);}});
  const loading=Promise.all([heroLoading,regionLoading]);
  function tick(delta,{night=0,reduced=false,paused=false}={}){
    if(disposed)return false;
    const dt=Math.min(.1,Math.max(0,delta||0));if(!paused&&!reduced){elapsed+=dt;mixers.forEach(m=>m.update(dt));}
    waterClocks.forEach(clock=>{clock.value=elapsed;});
    const darkness=Math.max(0,Math.min(1,Number.isFinite(night)?night:0));
    const windowsChanged=windowLights.update(darkness),poolsChanged=lampPools.update(darkness);
    warm.emissiveIntensity=.2+darkness*2.8;glows.forEach(g=>g.material.opacity=darkness*.45);
    waves.forEach((r,i)=>{const phase=(elapsed*.23+i/9)%1;r.scale.setScalar(.4+phase*1.8);r.material.opacity=(1-phase)*.25;});
    steam.forEach(p=>{const phase=(elapsed*.13+p.phase)%1;p.object.position.set(p.x+Math.sin(phase*3+p.phase)*.10,.52+phase*.85,p.z);p.object.scale.setScalar(.22+phase*.34);p.object.material.opacity=Math.sin(phase*Math.PI)*.30;});
    if(visible)boats.forEach(b=>{if(b.cable)b.object.position.set(Math.sin(elapsed*.17+b.phase)*(w/2+.6),1.35,b.z);else{b.object.position.y=b.y+Math.sin(elapsed*.75+b.phase)*.025;b.object.rotation.z=Math.sin(elapsed*.5+b.phase)*.025;}});
    return windowsChanged||poolsChanged||(!paused&&!reduced);
  }
  function dispose(){if(disposed)return;disposed=true;windowLights.dispose();mixers.forEach(m=>{m.stopAllAction();m.uncacheRoot(m.getRoot());});root.removeFromParent();owned.forEach(r=>r.dispose());owned.clear();}
  return {tick,dispose,loading,getState:()=>({ready,failed,clips:root.userData.animationClips||0,regionalBuildings:root.userData.regionalBuildings||0,landscape:root.userData.landscape}),setVisible:value=>{visible=!!value;perimeter.visible=visible;requestRender();}};
}
export const disposeDestinationAssets=disposeSharedModelAssets;

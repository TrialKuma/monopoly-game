import { loadSharedModelAsset, disposeSharedModelAssets, regionalSceneryDirectory } from './scene-model-cache.js?v=20261025-facade2';
import { createRegionalSurroundings, fillRegionalScenicBuildings } from './scene-regional-parks.js?v=20261025-terrain3';
import { batchGardenBuilding, instanceGardenBuildings } from './scene-garden-kit.js?v=20261025-terrain3';

// Regional architecture is shared by all scenic copies. The selected map owns
// only its merged placement geometry, never the GLTF cache's materials/textures.
function loadBundle(file){
  return loadSharedModelAsset(file,{version:file==='city-kit.glb'?'20260911-12':'20261025-facade2'});
}
export function createCityOutskirts({THREE,world,boardBounds,mapId='classic',requestRender=()=>{},loadSceneryBundle=loadBundle}){
  const root=new THREE.Group();root.name='city_outskirts';root.userData.cosmetic=true;world.add(root);
  const owned=new Set(),own=value=>{owned.add(value);return value;};
  let disposed=false,lastNight=-1,ready=false,failed=false,regional=false;
  // The two destination scenes own their own perimeter and should not allocate
  // an invisible second district when scene-life creates this common controller.
  const supported=['classic','compact','expansion'].includes(mapId);
  const scenery=supported?createRegionalSurroundings({THREE,root,own,boardBounds,mapId}):null;
  const loading=supported?loadSceneryBundle(`${regionalSceneryDirectory}/${mapId}.glb`).then(gltf=>({gltf,regional:true})).then(bundle=>{
    if(disposed||!bundle)return;
    for(const plot of scenery.plots){
      const asset=plot.asset==='villa_2'?'villa_3':plot.asset;
      if(!bundle.gltf.scene.getObjectByName(`${mapId}_${asset}`))throw new Error(`Missing regional building ${mapId}_${asset}`);
    }
    if(bundle.regional)fillRegionalScenicBuildings({THREE,root,bundle:bundle.gltf,mapId});
    regional=bundle.regional;const prepared=new Map(),district=new THREE.Group();let count=0,allInstanceable=true;
    for(const plot of scenery.plots){
      // Keep the same regional architecture in the playable and distant streets.
      const asset=plot.asset==='villa_2'?'villa_3':plot.asset;
      const name=regional?`${mapId}_${asset}`:asset,source=bundle.gltf.scene.getObjectByName(name);if(!source)continue;
      const instanceable=['pixal_native_multiview','authored_blender_reference_rebuild'].includes(source.userData.sourceType);allInstanceable=allInstanceable&&instanceable;
      if(!prepared.has(name))prepared.set(name,instanceable?source:batchGardenBuilding({THREE,source,own}));
      const building=prepared.get(name).clone(true);building.rotation.y=plot.rotation;
      let bounds=new THREE.Box3().setFromObject(building),size=bounds.getSize(new THREE.Vector3());
      building.scale.setScalar(Math.min(plot.width/Math.max(size.x,size.z,.001),plot.height/Math.max(size.y,.001)));
      bounds=new THREE.Box3().setFromObject(building);const center=bounds.getCenter(new THREE.Vector3());building.position.set(plot.x-center.x,plot.y-bounds.min.y,plot.z-center.z);
      district.add(building);count++;
    }
    if(count){const batch=(allInstanceable?instanceGardenBuildings:batchGardenBuilding)({THREE,source:district,own});batch.name='outskirts_regional_neighbourhood';batch.traverse(node=>{if(node.isMesh){node.castShadow=!node.material?.transparent;node.raycast=()=>{};}});root.add(batch);}
    root.userData.buildingCount=count;root.userData.regionalArchitecture=regional;ready=true;requestRender();
  }).catch(error=>{if(!disposed){failed=true;if(typeof window!=='undefined')console.warn(`Scenic district ${mapId} unavailable`,error.message);}}):Promise.resolve();
  function tick(delta,{night=0,reduced=false,paused=false}={}){
    if(disposed||!root.visible||!scenery)return false;
    const darkness=Math.min(1,Math.max(0,Number.isFinite(night)?night:0));
    if(Math.abs(darkness-lastNight)<=.002)return false;
    lastNight=darkness;scenery.warm.emissiveIntensity=.2+darkness*1.6;return true;
  }
  function setVisible(value){if(disposed)return false;const visible=!!value;if(root.visible===visible)return true;root.visible=visible;requestRender();return true;}
  function dispose(){if(disposed)return;disposed=true;root.removeFromParent();owned.forEach(resource=>resource.dispose());owned.clear();}
  tick(0);requestRender();
  return {tick,setVisible,dispose,loading,getState:()=>({ready,failed,regional,buildings:root.userData.buildingCount||0,landscape:root.userData.landscape})};
}
// Kept for callers that explicitly tear down all model assets. A per-map
// controller's dispose() only releases its derived placement geometry.
export const disposeOutskirtsAssets=disposeSharedModelAssets;

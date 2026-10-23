import { GLTFLoader } from './assets/vendor/three/addons/loaders/GLTFLoader.js';

// Board models, scenic copies and destination landmarks borrow one decoded GLB.
// Consumers own only their derived geometry; this cache owns source materials,
// textures, bitmaps and geometry until the page closes.
export function createModelAssetCache({load=url=>new GLTFLoader().loadAsync(url),now=Date.now}={}) {
  const entries=new Map(),sources=new Set(),owned=new WeakSet(),released=new WeakSet(),closedImages=new WeakSet();
  let disposed=false,refreshId=0;
  function resources(gltf){
    const result=new Set();gltf.scene.traverse(node=>{
      if(node.geometry)result.add(node.geometry);
      for(const material of Array.isArray(node.material)?node.material:[node.material])if(material){
        result.add(material);for(const value of Object.values(material))if(value?.isTexture)result.add(value);
      }
    });return result;
  }
  function release(gltf){
    for(const resource of resources(gltf)){
      owned.add(resource);if(released.has(resource))continue;released.add(resource);
      if(resource.isTexture){
        const images=Array.isArray(resource.source?.data)?resource.source.data:[resource.source?.data];
        for(const image of images)if(image&&typeof image.close==='function'&&!closedImages.has(image)){closedImages.add(image);image.close();}
      }
      resource.dispose?.();
    }
  }
  function closedError(){const error=new Error('Model asset cache is disposed');error.name='AbortError';return error;}
  function loadAsset(file,{version='20261023-3',force=false}={}){
    if(disposed)return Promise.reject(closedError());
    const key=`${file}?v=${version}`,previous=entries.get(key);
    if(previous&&(!force||previous.pending))return previous.promise;
    const entry={file,pending:true,value:null,promise:null};entries.set(key,entry);
    const url=`./assets/models/${key}${force?`&refresh=${now()}-${++refreshId}`:''}`;
    entry.promise=Promise.resolve().then(()=>{if(disposed)throw closedError();return load(url);}).then(gltf=>{
      for(const resource of resources(gltf))owned.add(resource);
      if(disposed){release(gltf);throw closedError();}
      const region=/^regions\/([a-z]+)\.glb$/.exec(file)?.[1];
      if(region){
        const pattern=new RegExp(`^${region}_(?:(?:villa|shop|hotel|tower|skyscraper|finance|onsen)_[123]|civic_hall|vault_bank|builders_guild|card_pavilion|chance_wheel|teleport_gate|rush_station|junction_hub)$`);
        let matched=false;gltf.scene.traverse(node=>{if(pattern.test(node.name))matched=true;});
        if(!matched){release(gltf);throw new Error(`No compatible models in ${file}`);}
      }
      // A forced replacement may leave old instances alive until the board's
      // queued refresh and scenic controller dispose. Keep those borrowed source
      // resources valid; all generations are released together at pagehide.
      sources.add(gltf);entry.value=gltf;return gltf;
    }).catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error;}).finally(()=>{entry.pending=false;});
    return entry.promise;
  }
  function forget(file,gltf){for(const [key,entry] of entries)if(entry.file===file&&entry.value===gltf)entries.delete(key);}
  function dispose(){if(disposed)return;disposed=true;entries.clear();sources.forEach(release);sources.clear();}
  return {load:loadAsset,forget,dispose,owns:resource=>owned.has(resource),getState:()=>({entries:entries.size,pending:[...entries.values()].filter(entry=>entry.pending).length,sources:sources.size,disposed})};
}

const cache=createModelAssetCache();
export const loadSharedModelAsset=cache.load;
export const forgetSharedModelAsset=cache.forget;
export const ownsSharedModelResource=cache.owns;
export const disposeSharedModelAssets=cache.dispose;
if(typeof window!=='undefined')window.addEventListener('pagehide',disposeSharedModelAssets,{once:true});

import { GLTFLoader } from './assets/vendor/three/addons/loaders/GLTFLoader.js';

// Board models, scenic copies and destination landmarks borrow one decoded GLB.
// Consumers own only their derived geometry; this cache owns source materials,
// textures, bitmaps and geometry until all borrowers leave their generation.
export function createModelAssetCache({load=url=>new GLTFLoader().loadAsync(url),now=Date.now}={}) {
  const entries=new Map(),sources=new Map(),epochs=new Map(),owned=new WeakSet(),released=new WeakSet(),closedImages=new WeakSet();
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
  function loadAsset(file,{version='20261024-blender-release2',force=false}={}){
    if(disposed)return Promise.reject(closedError());
    const key=`${file}?v=${version}`,previous=entries.get(key);
    if(previous&&(!force||previous.pending))return previous.promise;
    const epoch=epochs.get(file)||0,entry={file,pending:true,value:null,promise:null};entries.set(key,entry);
    const url=`./assets/models/${key}${force?`&refresh=${now()}-${++refreshId}`:''}`;
    entry.promise=Promise.resolve().then(()=>{if(disposed||epoch!==(epochs.get(file)||0))throw closedError();return load(url);}).then(gltf=>{
      for(const resource of resources(gltf))owned.add(resource);
      if(disposed||epoch!==(epochs.get(file)||0)){release(gltf);throw closedError();}
      const region=/^regions(?:-far)?\/([a-z]+)\.glb$/.exec(file)?.[1];
      if(region){
        const pattern=new RegExp(`^${region}_(?:(?:villa|shop|hotel|tower|skyscraper|finance|onsen)_[123]|civic_hall|vault_bank|builders_guild|card_pavilion|chance_wheel|teleport_gate|rush_station|junction_hub)$`);
        let matched=false;gltf.scene.traverse(node=>{if(pattern.test(node.name))matched=true;});
        if(!matched){release(gltf);throw new Error(`No compatible models in ${file}`);}
      }
      // A forced replacement may leave old instances alive until the board's
      // queued refresh and scenic controller dispose. Keep those borrowed source
      // resources valid until the scene confirms every borrower was rebuilt.
      sources.set(gltf,file);entry.value=gltf;return gltf;
    }).catch(error=>{if(entries.get(key)===entry)entries.delete(key);throw error;}).finally(()=>{entry.pending=false;});
    return entry.promise;
  }
  function forget(file,gltf){for(const [key,entry] of entries)if(entry.file===file&&entry.value===gltf)entries.delete(key);}
  // Only the scene that has rebuilt every borrower may retire old generations.
  // A newer in-flight replacement remains owned until it is installed as well.
  function releaseSuperseded(file,retained){
    if(sources.get(retained)!==file)return;
    const current=new Set([retained]);
    for(const entry of entries.values())if(entry.file===file&&entry.value)current.add(entry.value);
    for(const [gltf,sourceFile] of sources)if(sourceFile===file&&!current.has(gltf)){release(gltf);sources.delete(gltf);}
  }
  // The caller must first detach every borrower. Region changes do that before
  // releasing their textures, so five textured cities cannot accumulate in VRAM.
  function releaseFile(file){
    epochs.set(file,(epochs.get(file)||0)+1);
    for(const [key,entry] of entries)if(entry.file===file)entries.delete(key);
    for(const [gltf,sourceFile] of sources)if(sourceFile===file){release(gltf);sources.delete(gltf);}
  }
  function dispose(){if(disposed)return;disposed=true;entries.clear();sources.forEach((file,gltf)=>release(gltf));sources.clear();epochs.clear();}
  return {load:loadAsset,forget,releaseFile,releaseSuperseded,dispose,owns:resource=>owned.has(resource),getState:()=>({entries:entries.size,pending:[...entries.values()].filter(entry=>entry.pending).length,sources:sources.size,disposed})};
}

// The review build uses the same game and loading path with unpublished packs.
// Only these local, known architecture filenames can be redirected by the flag.
export function reviewModelURL(url,preview=false){
  if(!preview)return url;
  const region=/^\.\/assets\/models\/(regions|regions-far)\/(classic|compact|expansion|harbor|alpine)\.glb(\?.*)?$/.exec(url);
  if(region)return `./art/full-ai-city/packed/${region[2]}${region[1]==='regions-far'?'-far':''}.glb${region[3]||''}`;
  const hero=/^\.\/assets\/models\/harbor\/(harbor_lighthouse|alpine_windmill)\.glb(\?.*)?$/.exec(url);
  return hero?`./art/full-ai-city/packed/${hero[1]}.glb${hero[2]||''}`:url;
}
const preview=typeof location!=='undefined'&&new URLSearchParams(location.search).get('artStage')==='candidate';
// Distant architecture always uses the reviewed near-derived far package.
export const regionalSceneryDirectory='regions-far';
const cache=createModelAssetCache({load:url=>new GLTFLoader().loadAsync(reviewModelURL(url,preview))});
export const loadSharedModelAsset=cache.load;
export const forgetSharedModelAsset=cache.forget;
export const releaseSharedModelAsset=cache.releaseFile;
export const releaseSupersededModelAssets=cache.releaseSuperseded;
export const ownsSharedModelResource=cache.owns;
export const disposeSharedModelAssets=cache.dispose;
if(typeof window!=='undefined')window.addEventListener('pagehide',disposeSharedModelAssets,{once:true});

import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {createModelAssetCache} from '../scene-model-cache.js';

// Controlled downloads exercise the real loader without a server or WebGL.
const root = fileURLToPath(new URL('../', import.meta.url));
const THREE = await import(pathToFileURL(root + 'assets/vendor/three/three.module.min.js'));
const source = fs.readFileSync(root + 'scene.js', 'utf8').replace(/^import .*;\r?\n/gm, '');
const names = {
  'city-kit.glb': ['city_hall', 'tree', 'villa_1'],
  'landmarks.glb': ['skyscraper_3', 'onsen_2'],
  'specials.glb': ['chance_wheel', 'builders_guild', 'vault_bank'],
  'life-specials.glb': ['chance_wheel', 'builders_guild'],
  'compact-specials.glb': ['compact_chance_wheel', 'compact_vault_bank'],
  'expansion-specials.glb': ['expansion_chance_wheel', 'expansion_vault_bank'],
};
const mapIds=['classic','compact','expansion','harbor','alpine'];
const commonFiles=['city-kit.glb'];
for(const mapId of mapIds)names[`regions/${mapId}.glb`]=['civic_hall','vault_bank','chance_wheel','villa_1','skyscraper_3'].map(name=>`${mapId}_${name}`);
const filesFor=mapId=>[...commonFiles,`regions/${mapId}.glb`];
const drain = () => new Promise(resolve => setImmediate(resolve));

function fixture(mapId = 'classic') {
  const downloads = [], frames = new Map(), listeners = new Map(), events = [], logs = [];
  const stats = { builds: 0, updates: 0, lots: 0, resizes: 0, inspections: 0, clears: 0 };
  let frameId = 0;
  class FakeLoader {
    loadAsync(url) {
      const file = url.split('/assets/models/')[1].split('?')[0];
      return new Promise((resolve, reject) => downloads.push({ url, file, resolve, reject, done: false }));
    }
  }
  const cache=createModelAssetCache({load:url=>new FakeLoader().loadAsync(url)});
  const context = vm.createContext({
    THREE, GLTFLoader: FakeLoader, stats, performance, console: { info: (...args) => logs.push(args) },
    loadSharedModelAsset:cache.load,forgetSharedModelAsset:cache.forget,releaseSharedModelAsset:cache.releaseFile,releaseSupersededModelAssets:cache.releaseSuperseded,ownsSharedModelResource:cache.owns,disposeSharedModelAssets:cache.dispose,
    document: { body: { classList: { remove() {} } } },
    window: {
      matchMedia: () => ({ matches: false }),
      addEventListener: (name, fn) => listeners.set(name, fn),
      dispatchEvent: event => events.push(event),
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  const run = code => vm.runInContext(code, context);
  run(source);
  run(`
    optimizeModel = object => object.clone(true);
    calculateEnvelope = object => ({ origin: object.userData.origin });
    buildMap = () => { stats.builds++; };
    update = () => { stats.updates++; void loadModelKit(); };
    updateLot = (view, tile, data, initial) => { stats.lots++; if (!initial) throw Error('asset arrival must not play an upgrade'); };
    resize = () => { stats.resizes++; };
    renderInspectionModel = () => { stats.inspections++; };
    closeInspection = () => { inspection = null; };
    resetCameraView = () => { cameraView = { yaw: null, elevation: null, zoom: 1, modified: false, facingYaw: null }; };
    clearMap = () => { stats.clears++; lotViews.clear(); pawnViews.clear(); };
    cameraView = { yaw: .7, elevation: .8, zoom: 1.4, modified: true, facingYaw: .2 };
    pawnViews.set('human', { marker: 'same pawn', active: true });
    lotViews.set(0, {});
    lotViews.set(1, {});
  `);
  const setMap = id => {
    context.nextSnapshot = { sessionId: 'test', mapId: id, board: [{ index: 0 }, { index: 1, isLargeSecondary: true }] };
    run('if(snapshot&&snapshot.mapId!==nextSnapshot.mapId)clearMap(); snapshot = nextSnapshot; retireInactiveModels(snapshot.mapId);');
  };
  setMap(mapId);
  const load = (force = false, retry = false) => run(`loadModelKit(${force}, ${retry})`);
  async function finish(file, { fail = false, empty = false, origin = file } = {}) {
    const request = downloads.find(item => item.file === file && !item.done);
    assert.ok(request, `pending request for ${file}`);
    request.done = true;
    if (fail) request.reject(new Error('simulated fetch failure'));
    else {
      const scene = new THREE.Group();
      if (!empty) names[file].forEach(name => {
        const item = new THREE.Group(); item.name = name; item.userData.origin = origin; scene.add(item);
      });
      request.resolve({ scene });
    }
    await drain();
  }
  async function flushFrames() {
    const ready = [...frames.values()]; frames.clear(); ready.forEach(fn => fn(100)); await drain();
  }
  const model = name => run(`modelLibrary.get(${JSON.stringify(name)})`);
  return { run, load, finish, flushFrames, model, setMap, downloads, frames, listeners, events, logs, stats, cache };
}

// A scenic consumer can start the same decoded region before the board; the
// normal scene loader must join that request and reuse its source resources.
{
 const f=fixture('classic'),scenery=f.cache.load('regions/classic.glb'),board=f.load();await drain();
 assert.equal(f.downloads.filter(item=>item.file==='regions/classic.glb').length,1);
 await f.finish('regions/classic.glb');const gltf=await scenery;assert.equal(await f.cache.load('regions/classic.glb'),gltf);
 assert(f.model('classic_villa_1'));for(const file of commonFiles)await f.finish(file);await board;
 assert.equal(f.downloads.length,2,'one request and parse per source file across consumers');
 f.listeners.get('pagehide')();assert.equal(f.cache.getState().disposed,true);
}
// Shared props arrive progressively, while buildings wait for their real region.
{
 const f=fixture();let complete=false;const batch=f.load().then(()=>complete=true);void f.load();await drain();
 assert.deepEqual(f.downloads.map(x=>x.file).sort(),filesFor('classic').sort());
 assert.equal(f.downloads.find(x=>x.file==='regions/classic.glb').url,'./assets/models/regions/classic.glb?v=20261024-1');
 assert(f.downloads.filter(x=>commonFiles.includes(x.file)).every(x=>x.url.endsWith('?v=20260911-12')));
 await f.finish('city-kit.glb');assert(f.model('tree'));assert(!f.model('city_hall'));assert(!f.model('villa_1'));assert.equal(complete,false);await f.flushFrames();assert.equal(f.stats.builds,1);assert.equal(f.stats.updates,1);
 assert.equal(f.run('resolveAsset({special:{type:"bank"}},{mapId:"classic"}).source'),undefined,'no old architecture substitutes for a pending neural model');
 assert.equal(f.run('pawnViews.get("human").active'),true);assert.equal(f.run('cameraView.zoom'),1.4);assert.equal(f.run('cameraView.yaw'),.7);
 await f.finish('regions/classic.glb');await batch;await f.flushFrames();assert.equal(f.stats.builds,1);assert.equal(f.downloads.length,2);assert.equal(f.stats.lots,1);
 assert.equal(f.run('resolveAsset({special:{type:"bank"}},{mapId:"classic"}).key'),'classic_vault_bank');
 assert.equal(f.run('authoredModels.has("classic_vault_bank")'),true);assert.equal(f.events.filter(e=>e.type==='city:models-ready').length,2);
}

// Only the regional model is requested. A forced refresh replaces that exact
// source once; it cannot resurrect the superseded shared/manual buildings.
{
 const f=fixture('compact'),batch=f.load();await drain();
 await f.finish('regions/compact.glb');const regionalWheel=f.model('compact_chance_wheel');
 await f.finish('city-kit.glb');await batch;assert.equal(f.model('chance_wheel'),undefined);assert.deepEqual(f.downloads.map(x=>x.file).sort(),filesFor('compact').sort());
 await f.flushFrames();const initialSceneryBuilds=f.stats.builds;
 const forced=f.load(true);void f.load(true);await drain();assert.equal(f.downloads.length,4,'forced downloads dedupe');assert(f.downloads.slice(2).every(x=>x.url.includes('&refresh=')));
 await f.finish('city-kit.glb');await f.flushFrames();assert.equal(f.stats.builds,initialSceneryBuilds+1);
 await f.finish('regions/compact.glb',{origin:'new regional'});assert.notEqual(f.model('compact_chance_wheel'),regionalWheel);assert.equal(f.model('compact_chance_wheel').userData.origin,'new regional');
 assert.equal(f.cache.getState().sources,3,'previous regional source remains valid until scenic borrowers rebuild');
 await forced;await f.flushFrames();assert.equal(f.stats.builds,initialSceneryBuilds+2,'late forced regional arrival also replaces scenic borrowers');
 assert.equal(f.cache.getState().sources,2,'completed refresh retains only current props and current region');
}

// Regional failure never substitutes old architecture; only an explicit retry
// restarts missing packages, and successful arrivals refresh an open preview.
{
 const f=fixture('harbor'),batch=f.load();await drain();assert.equal(f.downloads.length,2);
 await f.finish('regions/harbor.glb',{fail:true});await f.finish('city-kit.glb');await batch;await f.flushFrames();await f.load();
 assert.equal(f.downloads.length,2);assert.equal(f.logs.length,1);assert.equal(f.run('failedBundles.size'),1);
 assert.equal(f.run('resolveAsset({special:{type:"bank"}},{mapId:"harbor"}).key'),'harbor_vault_bank');assert.equal(f.run('resolveAsset({special:{type:"bank"}},{mapId:"harbor"}).source'),undefined);
 f.run('inspection={mapId:"harbor"}');const retry=f.load(false,true);await drain();assert.deepEqual(f.downloads.slice(2).map(x=>x.file),['regions/harbor.glb']);
 await f.finish('regions/harbor.glb');await retry;await f.flushFrames();assert.equal(f.run('failedBundles.size'),0);assert.equal(f.stats.inspections,1);assert(f.run('resolveAsset({special:{type:"bank"}},{mapId:"harbor"}).source'));
}

// Five regional bundles are scoped by map. Obsolete regional textures release;
// revisiting downloads only that region and retains the shared prop cache.
{
 const f=fixture('compact'),compact=f.load();await drain();for(const file of commonFiles)await f.finish(file);await f.flushFrames();const updates=f.stats.updates;
 f.setMap('expansion');const expansion=f.load();await drain();assert.deepEqual(f.downloads.slice(2).map(x=>x.file),['regions/expansion.glb']);
 await f.finish('regions/compact.glb');await compact;assert.equal(f.frames.size,0);assert.equal(f.stats.updates,updates);
 await f.finish('regions/expansion.glb');await expansion;await f.flushFrames();assert.equal(f.stats.builds,1);
 for(const mapId of ['harbor','alpine','classic']){f.setMap(mapId);const before=f.downloads.length,loading=f.load();await drain();assert.equal(f.downloads.length,before+1);assert.equal(f.downloads.at(-1).file,`regions/${mapId}.glb`);await f.finish(`regions/${mapId}.glb`);await loading;await f.flushFrames();}
 assert.equal(f.downloads.length,6,'one prop kit and five selected regions, no obsolete buildings');
 for(const mapId of mapIds){
   const changed=f.run('snapshot.mapId')!==mapId,before=f.downloads.length;
   f.setMap(mapId);const loading=f.load();await drain();
   const expected=changed?filesFor(mapId).filter(file=>!commonFiles.includes(file)):[];
   assert.deepEqual(f.downloads.slice(before).map(x=>x.file),expected);
   for(const file of expected)await f.finish(file);await loading;
   assert.equal(f.run(`resolveAsset({special:{type:'bank'}},{mapId:'${mapId}'}).key`),`${mapId}_vault_bank`);
   for(const other of mapIds.filter(id=>id!==mapId))assert.equal(f.model(`${other}_villa_1`),undefined,'inactive regional model references are removed');
   assert(f.cache.getState().sources<=2,'only common props and one selected regional kit remain decoded');
 }
}

// A regional file with no compatible roots is retryable, not a successful
// empty cache entry that would leave the map permanently on old architecture.
{
 const f=fixture('alpine'),batch=f.load();await drain();await f.finish('regions/alpine.glb',{empty:true});assert.equal(f.run('failedBundles.has("regions/alpine.glb")'),true);assert.equal(f.run('loadedBundles.has("regions/alpine.glb")'),false);
 for(const file of commonFiles)await f.finish(file);await batch;const retry=f.load(false,true);await drain();assert.equal(f.downloads.at(-1).file,'regions/alpine.glb');await f.finish('regions/alpine.glb');await retry;assert(f.model('alpine_villa_1'));
}

// Reset cancels queued refresh and releases regional resources. Late arrivals
// cannot recreate an abandoned game; a new game reloads only its region.
{
 const f=fixture(),batch=f.load();await drain();await f.finish('city-kit.glb');assert.equal(f.frames.size,1);f.run('reset()');assert.equal(f.frames.size,0);
 for(const file of filesFor('classic').filter(x=>x!=='city-kit.glb'))await f.finish(file);await batch;await f.flushFrames();assert.equal(f.stats.updates,0);assert.equal(f.stats.builds,0);assert.equal(f.run('snapshot'),null);assert.equal(f.frames.size,0);
 f.setMap('classic');const next=f.load();await drain();assert.equal(f.downloads.length,3);await f.finish('regions/classic.glb');await next;assert(f.model('classic_villa_1'));
}

// Page disposal ignores both shared and regional arrivals completely.
{
 const f=fixture('alpine'),batch=f.load();await drain();f.listeners.get('pagehide')();for(const file of filesFor('alpine'))await f.finish(file);await batch;await f.flushFrames();assert.equal(f.run('modelLibrary.size'),0);assert.equal(f.stats.updates,0);assert.equal(f.run('bundleRequests.size'),0);
}
console.log('PASS: 8 model-loading scenarios covering selected-region architecture, absence of old substitutes, progressive props, retries, scoped memory, reset and disposal.');

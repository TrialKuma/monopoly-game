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
const commonFiles=['city-kit.glb','landmarks.glb','specials.glb','life-specials.glb'];
for(const mapId of mapIds)names[`regions/${mapId}.glb`]=['civic_hall','vault_bank','chance_wheel','villa_1','skyscraper_3'].map(name=>`${mapId}_${name}`);
const filesFor=mapId=>[...commonFiles,...(['compact','expansion'].includes(mapId)?[`${mapId}-specials.glb`]:[]),`regions/${mapId}.glb`];
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
    loadSharedModelAsset:cache.load,forgetSharedModelAsset:cache.forget,ownsSharedModelResource:cache.owns,disposeSharedModelAssets:cache.dispose,
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
    run('snapshot = nextSnapshot');
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
 assert.equal(f.downloads.length,5,'one request and parse per source file across consumers');
 f.listeners.get('pagehide')();assert.equal(f.cache.getState().disposed,true);
}
// Base models display progressively, while the selected region downloads once.
{
 const f=fixture();let complete=false;const batch=f.load().then(()=>complete=true);void f.load();await drain();
 assert.deepEqual(f.downloads.map(x=>x.file).sort(),filesFor('classic').sort());
 assert.equal(f.downloads.find(x=>x.file==='regions/classic.glb').url,'./assets/models/regions/classic.glb?v=20261023-3');
 assert(f.downloads.filter(x=>commonFiles.includes(x.file)).every(x=>x.url.endsWith('?v=20260911-12')));
 await f.finish('city-kit.glb');assert(f.model('city_hall'));assert.equal(complete,false);await f.flushFrames();assert.equal(f.stats.builds,1);assert.equal(f.stats.updates,1);
 await f.finish('specials.glb');await f.finish('life-specials.glb');assert.equal(f.frames.size,1);await f.flushFrames();assert.equal(f.stats.lots,1);
 assert.equal(f.run('pawnViews.get("human").active'),true);assert.equal(f.run('cameraView.zoom'),1.4);assert.equal(f.run('cameraView.yaw'),.7);
 await f.finish('landmarks.glb');assert.equal(complete,false,'regional download does not gate already visible fallback models');
 await f.finish('regions/classic.glb');await batch;await f.flushFrames();assert.equal(f.stats.builds,1);assert.equal(f.downloads.length,5);
 assert.equal(f.run('resolveAsset({special:{type:"bank"}},{mapId:"classic"}).key'),'classic_vault_bank');
 assert.equal(f.run('authoredModels.has("classic_vault_bank")'),true);assert.equal(f.events.filter(e=>e.type==='city:models-ready').length,3);
}

// Regional architecture wins over the older map-specific file even when the
// regional file arrives first; the animated shared replacement keeps priority.
{
 const f=fixture('compact'),batch=f.load();await drain();
 await f.finish('regions/compact.glb');const regionalWheel=f.model('compact_chance_wheel');
 await f.finish('compact-specials.glb');assert.equal(f.model('compact_chance_wheel'),regionalWheel);
 await f.finish('life-specials.glb');const sharedWheel=f.model('chance_wheel');await f.finish('specials.glb');assert.equal(f.model('chance_wheel'),sharedWheel);
 await f.finish('city-kit.glb');await f.finish('landmarks.glb');await batch;
 const forced=f.load(true);void f.load(true);await drain();assert.equal(f.downloads.length,12,'forced downloads dedupe');assert(f.downloads.slice(6).every(x=>x.url.includes('&refresh=')));
 await f.finish('compact-specials.glb',{origin:'new legacy'});assert.equal(f.model('compact_chance_wheel'),regionalWheel);
 await f.finish('specials.glb',{origin:'new static'});assert.equal(f.model('chance_wheel'),sharedWheel);
 await f.finish('regions/compact.glb',{origin:'new regional'});assert.notEqual(f.model('compact_chance_wheel'),regionalWheel);assert.equal(f.model('compact_chance_wheel').userData.origin,'new regional');
 await f.finish('life-specials.glb',{origin:'new animated'});assert.notEqual(f.model('chance_wheel'),sharedWheel);assert.equal(f.model('chance_wheel').userData.origin,'new animated');
 await f.finish('city-kit.glb');await f.finish('landmarks.glb');await forced;
}

// Regional failure leaves shared architecture visible; only an explicit retry
// restarts missing packages, and successful arrivals refresh an open preview.
{
 const f=fixture('harbor'),batch=f.load();await drain();assert.equal(f.downloads.length,5);
 await f.finish('landmarks.glb',{fail:true});await f.finish('regions/harbor.glb',{fail:true});
 for(const file of ['city-kit.glb','specials.glb','life-specials.glb'])await f.finish(file);await batch;await f.flushFrames();await f.load();
 assert.equal(f.downloads.length,5);assert.equal(f.logs.length,2);assert.equal(f.run('failedBundles.size'),2);
 assert.equal(f.run('resolveAsset({special:{type:"bank"}},{mapId:"harbor"}).key'),'vault_bank');
 f.run('inspection={mapId:"harbor"}');const retry=f.load(false,true);await drain();assert.deepEqual(f.downloads.slice(5).map(x=>x.file).sort(),['landmarks.glb','regions/harbor.glb']);
 await f.finish('landmarks.glb');await f.finish('regions/harbor.glb');await retry;await f.flushFrames();assert.equal(f.run('failedBundles.size'),0);assert.equal(f.stats.inspections,1);assert.equal(f.run('resolveAsset({special:{type:"bank"}},{mapId:"harbor"}).key'),'harbor_vault_bank');
}

// Five regional bundles are scoped by map; obsolete results cache silently and
// revisiting a map reuses exactly its prior region rather than downloading all.
{
 const f=fixture('compact'),compact=f.load();await drain();for(const file of commonFiles)await f.finish(file);await f.flushFrames();const updates=f.stats.updates;
 f.setMap('expansion');const expansion=f.load();await drain();assert.deepEqual(f.downloads.slice(6).map(x=>x.file),['expansion-specials.glb','regions/expansion.glb']);
 await f.finish('compact-specials.glb');await f.finish('regions/compact.glb');await compact;assert.equal(f.frames.size,0);assert.equal(f.stats.updates,updates);
 await f.finish('expansion-specials.glb');await f.finish('regions/expansion.glb');await expansion;await f.flushFrames();assert.equal(f.stats.builds,1);
 for(const mapId of ['harbor','alpine','classic']){f.setMap(mapId);const before=f.downloads.length,loading=f.load();await drain();assert.equal(f.downloads.length,before+1);assert.equal(f.downloads.at(-1).file,`regions/${mapId}.glb`);await f.finish(`regions/${mapId}.glb`);await loading;await f.flushFrames();}
 assert.equal(f.downloads.length,11,'four shared, two old map files, five selected regions');
 for(const mapId of mapIds){f.setMap(mapId);await f.load();assert.equal(f.downloads.length,11);assert.equal(f.run(`resolveAsset({special:{type:'bank'}},{mapId:'${mapId}'}).key`),`${mapId}_vault_bank`);assert.equal(f.downloads.filter(x=>x.file===`regions/${mapId}.glb`).length,1);}
}

// A regional file with no compatible roots is retryable, not a successful
// empty cache entry that would leave the map permanently on old architecture.
{
 const f=fixture('alpine'),batch=f.load();await drain();await f.finish('regions/alpine.glb',{empty:true});assert.equal(f.run('failedBundles.has("regions/alpine.glb")'),true);assert.equal(f.run('loadedBundles.has("regions/alpine.glb")'),false);
 for(const file of commonFiles)await f.finish(file);await batch;const retry=f.load(false,true);await drain();assert.equal(f.downloads.at(-1).file,'regions/alpine.glb');await f.finish('regions/alpine.glb');await retry;assert(f.model('alpine_villa_1'));
}

// Reset cancels queued refresh; all late regional results can cache without
// recreating an abandoned game, and the next session reuses the cache.
{
 const f=fixture(),batch=f.load();await drain();await f.finish('city-kit.glb');assert.equal(f.frames.size,1);f.run('reset()');assert.equal(f.frames.size,0);
 for(const file of filesFor('classic').filter(x=>x!=='city-kit.glb'))await f.finish(file);await batch;await f.flushFrames();assert.equal(f.stats.updates,0);assert.equal(f.stats.builds,0);assert.equal(f.run('snapshot'),null);assert.equal(f.frames.size,0);
 f.setMap('classic');await f.load();assert.equal(f.downloads.length,5);assert(f.model('classic_villa_1'));
}

// Page disposal ignores both shared and regional arrivals completely.
{
 const f=fixture('alpine'),batch=f.load();await drain();f.listeners.get('pagehide')();for(const file of filesFor('alpine'))await f.finish(file);await batch;await f.flushFrames();assert.equal(f.run('modelLibrary.size'),0);assert.equal(f.stats.updates,0);assert.equal(f.run('bundleRequests.size'),0);
}
console.log('PASS: 8 model-loading scenarios covering shared scenery/board requests, all 5 regional bundles, progressive arrival, priority, scoped downloads, retry, cache, reset and disposal.');

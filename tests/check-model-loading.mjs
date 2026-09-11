import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
const drain = () => new Promise(resolve => setImmediate(resolve));

function fixture(mapId = 'classic') {
  const downloads = [], frames = new Map(), listeners = new Map(), events = [], logs = [];
  const stats = { builds: 0, updates: 0, lots: 0, resizes: 0, inspections: 0, clears: 0 };
  let frameId = 0;
  class FakeLoader {
    loadAsync(url) {
      const file = url.match(/([^/]+\.glb)\?/)[1];
      return new Promise((resolve, reject) => downloads.push({ url, file, resolve, reject, done: false }));
    }
  }
  const context = vm.createContext({
    THREE, GLTFLoader: FakeLoader, stats, performance, console: { info: (...args) => logs.push(args) },
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
  return { run, load, finish, flushFrames, model, setMap, downloads, frames, listeners, events, logs, stats };
}

// A slow landmark file must never gate the base city, and repeated snapshots dedupe requests.
{
  const f = fixture(); let complete = false;
  const batch = f.load().then(() => { complete = true; });
  void f.load(); await drain();
  assert.equal(f.downloads.length, 4);
  assert.ok(f.downloads.every(item => item.url.endsWith('?v=20260911-12')));
  await f.finish('city-kit.glb');
  assert.ok(f.model('city_hall')); assert.equal(complete, false);
  await f.flushFrames(); assert.equal(f.stats.builds, 1); assert.equal(f.stats.updates, 1);
  await f.finish('specials.glb'); await f.finish('life-specials.glb');
  assert.equal(f.frames.size, 1, 'arrivals in the same frame coalesce');
  await f.flushFrames(); assert.equal(f.stats.builds, 1); assert.equal(f.stats.lots, 1);
  assert.equal(f.run('pawnViews.get("human").active'), true);
  assert.equal(f.run('cameraView.zoom'), 1.4); assert.equal(f.run('cameraView.yaw'), .7);
  assert.equal(complete, false, 'landmarks still pending while other models are visible');
  await f.finish('landmarks.glb'); await batch; await f.flushFrames();
  assert.equal(f.downloads.length, 4); assert.equal(f.stats.builds, 1);
  assert.equal(f.events.filter(event => event.type === 'city:models-ready').length, 3);
}

// A smaller animated replacement arriving first cannot be overwritten by the static package.
{
  const f = fixture(); const batch = f.load(); await drain();
  await f.finish('life-specials.glb'); const wheel = f.model('chance_wheel');
  await f.finish('specials.glb'); assert.equal(f.model('chance_wheel'), wheel);
  assert.equal(f.model('vault_bank').userData.origin, 'specials.glb');
  await f.finish('city-kit.glb'); await f.finish('landmarks.glb'); await batch;
  const forced = f.load(true); void f.load(true); await drain();
  assert.equal(f.downloads.length, 8, 'forced requests also dedupe while in flight');
  assert.ok(f.downloads.slice(4).every(item => item.url.includes('&refresh=')));
  await f.finish('specials.glb', { origin: 'new static' }); assert.equal(f.model('chance_wheel'), wheel);
  await f.finish('life-specials.glb', { origin: 'new animated' });
  assert.notEqual(f.model('chance_wheel').uuid, wheel.uuid);
  assert.equal(f.model('chance_wheel').userData.origin, 'new animated');
  await f.finish('city-kit.glb'); await f.finish('landmarks.glb'); await forced;
}

// Failed downloads remain retryable, but ordinary game renders never create a retry storm.
{
  const f = fixture('compact'); const batch = f.load(); await drain();
  assert.equal(f.downloads.length, 5);
  assert.equal(f.downloads.find(item => item.file === 'compact-specials.glb').url, './assets/models/compact-specials.glb?v=20260912-21');
  await f.finish('landmarks.glb', { fail: true });
  for (const file of ['city-kit.glb', 'specials.glb', 'life-specials.glb', 'compact-specials.glb']) await f.finish(file);
  await batch; await f.flushFrames(); await f.load();
  assert.equal(f.downloads.length, 5); assert.equal(f.logs.length, 1);
  assert.equal(f.run('loadedBundles.has("landmarks.glb")'), false);
  assert.equal(f.run('failedBundles.has("landmarks.glb")'), true);
  f.run('inspection = { mapId: "compact" }');
  const retry = f.load(false, true); await drain();
  assert.equal(f.downloads.length, 6); assert.equal(f.downloads[5].file, 'landmarks.glb');
  await f.finish('landmarks.glb'); await retry; await f.flushFrames();
  assert.ok(f.model('skyscraper_3')); assert.equal(f.run('failedBundles.size'), 0);
  assert.equal(f.stats.inspections, 1);
}

// Switching maps starts only the newly needed theme; obsolete arrivals can cache without rebuilding.
{
  const f = fixture('compact'); const compact = f.load(); await drain();
  for (const file of ['city-kit.glb', 'landmarks.glb', 'specials.glb', 'life-specials.glb']) await f.finish(file);
  await f.flushFrames(); const updates = f.stats.updates;
  f.setMap('expansion'); const expansion = f.load(); await drain();
  assert.equal(f.downloads.length, 6); assert.equal(f.downloads[5].file, 'expansion-specials.glb');
  await f.finish('compact-specials.glb'); await compact;
  assert.equal(f.frames.size, 0); assert.equal(f.stats.updates, updates);
  await f.finish('expansion-specials.glb'); await expansion; await f.flushFrames();
  assert.ok(f.model('expansion_chance_wheel')); assert.equal(f.stats.builds, 1);
  f.setMap('compact'); await f.load(); assert.equal(f.downloads.length, 6, 'returning map uses cached theme');
  f.setMap('classic'); await f.load(); assert.equal(f.downloads.length, 6);
}

// No usable root is a failure, not a permanently completed empty package.
{
  const f = fixture(); const batch = f.load(); await drain();
  await f.finish('landmarks.glb', { empty: true });
  assert.equal(f.run('failedBundles.has("landmarks.glb")'), true);
  assert.equal(f.run('loadedBundles.has("landmarks.glb")'), false);
  for (const file of ['city-kit.glb', 'specials.glb', 'life-specials.glb']) await f.finish(file);
  await batch; const retry = f.load(false, true); await drain();
  await f.finish('landmarks.glb'); await retry; assert.ok(f.model('onsen_2'));
}

// Reset cancels a queued refresh; later arrivals may cache, but cannot recreate an abandoned game.
{
  const f = fixture(); const batch = f.load(); await drain();
  await f.finish('city-kit.glb'); assert.equal(f.frames.size, 1);
  f.run('reset()'); assert.equal(f.frames.size, 0);
  for (const file of ['landmarks.glb', 'specials.glb', 'life-specials.glb']) await f.finish(file);
  await batch; await f.flushFrames(); assert.equal(f.stats.updates, 0); assert.equal(f.stats.builds, 0);
  assert.equal(f.run('snapshot'), null); assert.equal(f.frames.size, 0);
  f.setMap('classic'); await f.load(); assert.equal(f.downloads.length, 4);
}

// A page that has disposed its renderers ignores late results completely.
{
  const f = fixture(); const batch = f.load(); await drain(); f.listeners.get('pagehide')();
  for (const file of ['city-kit.glb', 'landmarks.glb', 'specials.glb', 'life-specials.glb']) await f.finish(file);
  await batch; await f.flushFrames(); assert.equal(f.run('modelLibrary.size'), 0);
  assert.equal(f.stats.updates, 0); assert.equal(f.run('bundleRequests.size'), 0);
}

console.log('PASS: 7 asynchronous model-loading scenarios (progressive arrival, priority, scoped downloads, retry, cache, reset, disposal).');

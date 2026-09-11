import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

// Real Three scene objects and the production Life/Weather/Lighting modules;
// only browser visibility/media events and the WebGL renderer are substituted.
const root = fileURLToPath(new URL('../', import.meta.url));
const THREE = await import(pathToFileURL(root + 'assets/vendor/three/three.module.min.js'));
const { createSceneLife } = await import(pathToFileURL(root + 'scene-life.js'));
const results = [];
function events(extra = {}) {
  const listeners = new Map();
  return { ...extra,
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    emit(name, event = {}) { for (const fn of listeners.get(name) || []) fn(event); },
    count() { return [...listeners.values()].reduce((count, set) => count + set.size, 0); },
  };
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
function fixture(bounds = { w: 11.55, d: 9.9 }, reduced = false) {
  const media = events({ matches: reduced }), doc = events({ hidden: false });
  globalThis.window = { matchMedia: () => media };
  globalThis.document = doc;
  const scene = new THREE.Scene(), world = new THREE.Group(); scene.add(world);
  scene.background = new THREE.Color('#cdddee'); scene.environmentIntensity = .35;
  const light = new THREE.DirectionalLight('#fff0d6', 2.4); light.position.set(-7, 15, 5); light.castShadow = true;
  const hemi = new THREE.HemisphereLight('#fff6e7', '#94aaa0', 1);
  const fill = new THREE.DirectionalLight('#d4eeed', .4); fill.position.set(8, 7, -6);
  scene.add(light, hemi, fill);
  const floorMat = new THREE.MeshStandardMaterial({ color: '#dbe3d7' });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat); floor.rotation.x = -Math.PI / 2; world.add(floor);
  const windowMat = new THREE.MeshStandardMaterial({ color: '#deb984', emissive: '#322113', emissiveIntensity: .1 }); windowMat.name = 'warm lantern glass';
  const leafMat = new THREE.MeshStandardMaterial({ color: '#70947a' }); leafMat.name = 'garden jade';
  const geometry = new THREE.BoxGeometry(.4, .7, .4);
  function building() {
    const group = new THREE.Group(); group.userData.tileIndex = 7;
    const glass = new THREE.Mesh(geometry, windowMat), leaf = new THREE.Mesh(geometry, leafMat), mixed = new THREE.Mesh(geometry, [windowMat, leafMat]);
    const wheel = new THREE.Group(); wheel.name = 'life_compact_wheel_rotor'; wheel.userData.lifePart = 'wheel';
    group.add(glass, leaf, mixed, wheel); return { group, glass, leaf, mixed, wheel };
  }
  const model = building(); world.add(model.group);
  const lotViews = new Map([[7, { building: model.group }]]);
  const snapshot = freeze({ mapId: 'classic', board: Array.from({ length: 22 }, (_, index) => ({ index, owner: null })), players: [{ id: 'human', money: 1600 }, { id: 'ai', money: 2100 }] });
  const original = { background: scene.background, sceneChildren: scene.children.length, worldChildren: world.children.length,
    lightPosition: light.position.toArray(), lightColor: light.color.toArray(), lightIntensity: light.intensity,
    hemiColor: hemi.color.toArray(), hemiGround: hemi.groundColor.toArray(), fillPosition: fill.position.toArray(),
    shadowProjection: light.shadow.camera.projectionMatrix.toArray(), shadowTarget: light.target.position.toArray(),
    windowColor: windowMat.color.toArray(), windowEmission: windowMat.emissive.toArray(), leafColor: leafMat.color.toArray() };
  const renderer = { toneMappingExposure: .96, getPixelRatio: () => 1.5 };
  let renders = 0, time = 0;
  const controller = createSceneLife({ THREE, scene, world, light, renderer, boardBounds: bounds, snapshot, lotViews, requestRender: () => renders++ });
  const step = (count = 1) => { let changed; for (let i = 0; i < count; i++) changed = controller.tick(time += 40, .04); return changed; };
  return { media, doc, scene, world, light, hemi, fill, floor, floorMat, windowMat, leafMat, model, building, lotViews, snapshot, original, renderer, controller, step, renders: () => renders };
}
function disposeAndCheck(f) {
  const { controller, scene, world, model, original } = f;
  controller.dispose(); controller.dispose();
  assert.equal(controller.stats().owned, 0); assert.equal(controller.stats().materialBindings, 0);
  assert.equal(f.media.count(), 0); assert.equal(f.doc.count(), 0);
  assert.equal(scene.children.length, original.sceneChildren); assert.equal(world.children.length, original.worldChildren);
  assert.equal(scene.background, original.background); assert.equal(scene.environmentIntensity, .35); assert.equal(f.renderer.toneMappingExposure, .96);
  assert.deepEqual(f.light.position.toArray(), original.lightPosition); assert.deepEqual(f.light.color.toArray(), original.lightColor);
  assert.equal(f.light.intensity, original.lightIntensity); assert.deepEqual(f.hemi.color.toArray(), original.hemiColor);
  assert.deepEqual(f.hemi.groundColor.toArray(), original.hemiGround); assert.deepEqual(f.fill.position.toArray(), original.fillPosition);
  assert.deepEqual(f.light.shadow.camera.projectionMatrix.toArray(), original.shadowProjection);
  assert.deepEqual(f.light.target.position.toArray(), original.shadowTarget);
  assert.equal(f.floor.material, f.floorMat); assert.equal(model.glass.material, f.windowMat); assert.equal(model.leaf.material, f.leafMat);
  assert.deepEqual(model.mixed.material, [f.windowMat, f.leafMat]);
  assert.equal(model.wheel.rotation.z, 0, 'articulated model transforms restored on teardown');
  assert.deepEqual(f.windowMat.color.toArray(), original.windowColor); assert.deepEqual(f.windowMat.emissive.toArray(), original.windowEmission);
  assert.deepEqual(f.leafMat.color.toArray(), original.leafColor);
  assert.equal(controller.tick(999999, .04), false); assert.equal(controller.setSeason('winter'), false); assert.equal(controller.setTimeMode('night'), false);
}
function test(name, fn) { fn(); results.push(name); }

test('three map sizes restore shared materials, lights, exposure, sky and listeners', () => {
  for (const bounds of [{ w: 11.55, d: 9.9 }, { w: 9.9, d: 8.25 }, { w: 18.15, d: 13.2 }]) {
    const f = fixture(bounds); f.controller.setTimeMode('night'); f.controller.setSeason('winter'); f.controller.setWeather('snow'); f.step(180);
    assert.notEqual(f.model.glass.material, f.windowMat); assert.notEqual(f.model.leaf.material, f.leafMat);
    assert.ok(f.model.glass.material.emissiveIntensity > f.windowMat.emissiveIntensity);
    disposeAndCheck(f);
  }
});

test('late asset replacement restores removed instances and binds replacement once', () => {
  const f = fixture(); f.controller.setTimeMode('night'); f.step(160);
  const removed = f.model; removed.group.removeFromParent(); const next = f.building(); f.world.add(next.group); f.lotViews.get(7).building = next.group;
  f.controller.update(f.snapshot); f.step();
  assert.equal(removed.glass.material, f.windowMat); assert.equal(removed.leaf.material, f.leafMat); assert.deepEqual(removed.mixed.material, [f.windowMat, f.leafMat]);
  assert.notEqual(next.glass.material, f.windowMat); assert.notEqual(next.leaf.material, f.leafMat);
  assert.ok(next.glass.material.emissiveIntensity > f.windowMat.emissiveIntensity);
  const bindings = f.controller.stats().materialBindings; f.controller.update(f.snapshot); f.step();
  assert.equal(f.controller.stats().materialBindings, bindings);
  f.model = next; disposeAndCheck(f);
});

test('hidden tab and interaction pause freeze clocks, resume without elapsed-time jumps', () => {
  const f = fixture(); f.step(20); const before = f.controller.getAtmosphere();
  f.doc.hidden = true; f.doc.emit('visibilitychange'); assert.equal(f.step(200), false);
  assert.deepEqual(f.controller.getAtmosphere(), before);
  const renders = f.renders(); f.doc.hidden = false; f.doc.emit('visibilitychange'); assert.ok(f.renders() > renders); f.step();
  assert.ok(f.controller.getAtmosphere().hour - before.hour < .02);
  f.controller.setInteractionPaused(true); const paused = f.controller.getAtmosphere(); f.step(200); assert.deepEqual(f.controller.getAtmosphere(), paused);
  f.controller.setInteractionPaused(false); f.step(20); assert.ok(f.controller.getAtmosphere().hour > paused.hour);
  disposeAndCheck(f);
});

test('reduced motion applies manual climate and lighting in the same forced frame', () => {
  const f = fixture(undefined, true); f.step(); f.controller.setTimeMode('day'); f.step();
  const sunny = f.light.intensity; f.controller.setSeason('winter'); f.controller.setWeather('rain'); f.step();
  const changed = f.light.intensity; assert.ok(changed < sunny * .7, 'rain immediately softens the key light under reduced motion');
  assert.equal(f.controller.getAtmosphere().weather, 'rain'); assert.equal(f.controller.getAtmosphere().season, 'winter');
  const state = f.controller.getAtmosphere(); assert.equal(f.step(100), false); assert.deepEqual(f.controller.getAtmosphere(), state);
  f.controller.update(f.snapshot); f.step(); assert.ok(Math.abs(f.light.intensity - changed) < 1e-8, 'no second-frame correction of previously stale climate');
  const weatherRoot = f.world.getObjectByName('city_weather');
  for (const name of ['weather_spring_petals', 'weather_autumn_leaves', 'weather_snowflakes', 'weather_rain_streaks', 'weather_rain_ripples', 'weather_summer_butterflies']) assert.equal(weatherRoot.getObjectByName(name).visible, false);
  f.controller.setTimeMode('night'); f.step(); assert.ok(f.controller.getAtmosphere().night > .99);
  disposeAndCheck(f);
});

test('weather owns particle materials; seasonal opacity is not mistaken for window lighting', () => {
  const f = fixture(); const petals = f.world.getObjectByName('weather_spring_petals');
  f.controller.setSeason('summer'); f.step(120);
  assert.ok(petals.material.opacity < .4, 'spring petals fade during the summer transition');
  assert.equal(petals.material.emissiveIntensity, .055, 'petals never receive the window-light shader material');
  disposeAndCheck(f);
});

test('live media preference change freezes particle movement and resumes cleanly', () => {
  const f = fixture(); f.step(10); f.media.matches = true; f.media.emit('change', { matches: true }); f.step();
  const state = f.controller.getAtmosphere(); assert.equal(f.step(80), false); assert.deepEqual(f.controller.getAtmosphere(), state);
  f.media.matches = false; f.media.emit('change', { matches: false }); assert.equal(f.step(), true);
  assert.ok(f.controller.getAtmosphere().hour > state.hour); disposeAndCheck(f);
});

test('continuous cosmetic ticks and events consume no global gameplay randomness', () => {
  const f = fixture(); const originalRandom = Math.random; let calls = 0;
  try {
    Math.random = () => { calls++; return .5; };
    f.controller.setSeason('autumn'); f.controller.setWeather('rain'); f.controller.setTimeMode('dusk');
    f.controller.effect({ tiles: [7], triggerTiles: [7] }); f.step(300);
  } finally { Math.random = originalRandom; }
  assert.equal(calls, 0, 'cosmetic playback must not draw from Math.random');
  assert.ok(f.model.wheel.rotation.z > 0, 'the source landmark animation was exercised');
  disposeAndCheck(f);
});

delete globalThis.window; delete globalThis.document;
console.log(JSON.stringify({ checks: results.length, results, failures: 0 }, null, 2));

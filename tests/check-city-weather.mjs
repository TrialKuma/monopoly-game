import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const THREE = await import(pathToFileURL(root + 'assets/vendor/three/three.module.min.js'));
const { GLTFLoader } = await import(pathToFileURL(root + 'assets/vendor/three/addons/loaders/GLTFLoader.js'));
const { createCityWeather } = await import(pathToFileURL(root + 'scene-weather.js'));
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const bounds = { w: 14.85, d: 11.55 };
const advance = (weather, seconds, options) => { for (let i = 0; i < Math.ceil(seconds * 30); i++) weather.tick(1 / 30, options); };
const world = new THREE.Group();
const originalLeaf = new THREE.MeshStandardMaterial({ color: '#458a66' }); originalLeaf.name = 'Garden jade';
const originalWindow = new THREE.MeshStandardMaterial({ color: '#ffdca0', emissive: '#ffbd61', emissiveIntensity: .45 }); originalWindow.name = 'Warm lit glass';
const originalGrass = new THREE.MeshStandardMaterial({ color: '#acbf9c' });
const originalPath = new THREE.MeshStandardMaterial({ color: '#e2d8c1', roughness: .78 });
const geo = new THREE.BoxGeometry(1, 1, 1);
const leaf = new THREE.Mesh(geo, originalLeaf), secondLeaf = new THREE.Mesh(geo, originalLeaf);
const windowMesh = new THREE.Mesh(geo, originalWindow), grass = new THREE.Mesh(geo, originalGrass), path = new THREE.Mesh(geo, originalPath);
world.add(leaf, secondLeaf, windowMesh, grass, path);
const weather = createCityWeather({ THREE, world, boardBounds: bounds });
const climate = world.getObjectByName('city_weather');
check('seasonal clones are shared locally and keep source materials unchanged', () => {
  assert.notEqual(leaf.material, originalLeaf); assert.equal(leaf.material, secondLeaf.material);
  assert.equal(originalLeaf.color.getHexString(), '458a66'); assert.equal(originalGrass.color.getHexString(), 'acbf9c');
  assert.equal(windowMesh.material, originalWindow); assert.equal(originalWindow.emissiveIntensity, .45);
});
check('invalid manual choices preserve the selected mode', () => {
  assert.equal(weather.setSeason('typhoon'), false); assert.equal(weather.setWeather('hail'), false);
  assert.equal(weather.getState().seasonMode, 'auto'); assert.equal(weather.getState().weatherMode, 'auto');
});
check('season and precipitation transition gradually', () => {
  const initial = leaf.material.color.clone(); weather.setSeason('autumn'); weather.setWeather('rain'); weather.tick(1 / 30);
  assert.ok(weather.getState().rain > 0 && weather.getState().rain < .1);
  const first = leaf.material.color.clone(), change = Math.hypot(first.r - initial.r, first.g - initial.g, first.b - initial.b);
  assert.ok(change > 0 && change < .02);
  advance(weather, 12);
  assert.ok(Math.abs(leaf.material.color.r - initial.r) > .01); assert.ok(weather.getState().rain > .99);
  assert.ok(path.material.roughness < originalPath.roughness);
  assert.equal(originalPath.roughness, .78); assert.equal(originalPath.color.getHexString(), 'e2d8c1');
});
check('rain ends promptly while wet paths dry more slowly', () => {
  weather.setWeather('clear'); advance(weather, 7);
  assert.ok(weather.getState().rain < .01); assert.ok(weather.getState().wetness > .4);
});
check('manual weather remains selected across an automatic season boundary', () => {
  weather.setSeason('auto'); weather.setWeather('snow'); advance(weather, 91);
  assert.equal(weather.getState().season, 'summer'); assert.equal(weather.getState().weather, 'snow');
});
check('tick uses no global random draws', () => {
  const original = Math.random; let calls = 0; Math.random = () => { calls++; return .5; };
  try { advance(weather, 2); } finally { Math.random = original; }
  assert.equal(calls, 0);
});
check('particle transforms remain finite and modest at every season and weather', () => {
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    weather.setSeason(season);
    for (const climateName of ['clear', 'rain', 'snow']) {
      weather.setWeather(climateName); advance(weather, 8);
      climate.traverse(node => {
        if (node.instanceMatrix) {
          assert.ok(node.count <= 144);
          assert.ok(Array.from(node.instanceMatrix.array).every(Number.isFinite));
        }
        if (node.geometry?.attributes.position) assert.ok(Array.from(node.geometry.attributes.position.array).every(Number.isFinite));
        assert.ok(Number.isFinite(node.position.x + node.position.y + node.position.z));
      });
    }
  }
});
check('weather meshes never intercept board raycasts', () => {
  const hits = [], raycaster = new THREE.Raycaster(new THREE.Vector3(0, 6, 0), new THREE.Vector3(0, -1, 0));
  climate.updateMatrixWorld(true); raycaster.intersectObject(climate, true, hits); assert.equal(hits.length, 0);
});
check('refresh restores removed objects and binds new ones without recoloring lamps', () => {
  world.remove(leaf); weather.refresh(); assert.equal(leaf.material, originalLeaf);
  const newLeaf = new THREE.Mesh(geo, originalLeaf); world.add(newLeaf); weather.refresh();
  assert.equal(newLeaf.material, secondLeaf.material); assert.equal(windowMesh.material, originalWindow);
});
check('identical worlds and tick sequences yield identical cosmetic transforms', () => {
  const a = new THREE.Group(), b = new THREE.Group();
  const wa = createCityWeather({ THREE, world: a, boardBounds: bounds }), wb = createCityWeather({ THREE, world: b, boardBounds: bounds });
  wa.setWeather('rain'); wb.setWeather('rain'); advance(wa, 4); advance(wb, 4);
  assert.deepEqual(wa.getState(), wb.getState());
  for (const name of ['weather_spring_petals', 'weather_rain_streaks', 'weather_park_snowbanks']) {
    const na = a.getObjectByName(name), nb = b.getObjectByName(name);
    assert.deepEqual(Array.from(na.instanceMatrix?.array || na.geometry.attributes.position.array), Array.from(nb.instanceMatrix?.array || nb.geometry.attributes.position.array));
  }
  wa.dispose(); wb.dispose();
});

const kits = ['city-kit', 'specials', 'landmarks', 'compact-specials', 'expansion-specials'];
let foliageMeshes = 0, windows = 0;
for (const kit of kits) {
  const bytes = fs.readFileSync(root + `assets/models/${kit}.glb`);
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const kitWorld = new THREE.Group(); kitWorld.add(gltf.scene);
  const originals = new Map(); gltf.scene.traverse(node => { if (node.isMesh) originals.set(node, node.material); });
  const climate = createCityWeather({ THREE, world: kitWorld, boardBounds: bounds }); climate.setSeason('winter'); climate.tick(0, { reduced: true });
  let seasonal = 0;
  for (const [node, material] of originals) {
    if (node.material !== material) { seasonal++; foliageMeshes++; }
    if (/window|glazing|glass|lantern|portal/i.test(material.name)) { windows++; assert.equal(node.material, material, kit + ': preserve ' + material.name); }
  }
  assert.ok(seasonal > 0, kit + ' binds authored foliage'); climate.dispose();
  for (const [node, material] of originals) assert.equal(node.material, material);
  console.log(`PASS ${kit}: ${seasonal} authored foliage meshes tinted; all materials restored`); checks++;
}
weather.dispose();
check('dispose restores live materials, detaches the effect, and is idempotent', () => {
  assert.equal(secondLeaf.material, originalLeaf); assert.equal(windowMesh.material, originalWindow); assert.equal(grass.material, originalGrass); assert.equal(path.material, originalPath);
  assert.equal(climate.parent, null); assert.equal(weather.tick(1), false); assert.equal(weather.setSeason('winter'), false); weather.dispose();
});
geo.dispose(); [originalLeaf, originalWindow, originalGrass, originalPath].forEach(mat => mat.dispose());
console.log(JSON.stringify({ checks, foliageMeshes, windows, failures: 0 }));

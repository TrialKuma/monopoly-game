import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {loadGeometryGLB,regionalAssetURL} from './gltf-geometry-fixture.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const THREE = await import(pathToFileURL(root + 'assets/vendor/three/three.module.min.js'));
const { GLTFLoader } = await import(pathToFileURL(root + 'assets/vendor/three/addons/loaders/GLTFLoader.js'));
const { mergeGeometries } = await import(pathToFileURL(root + 'assets/vendor/three/addons/utils/BufferGeometryUtils.js'));
const { createRoofSnow } = await import(pathToFileURL(root + 'scene-snow.js'));
const { createSceneLife } = await import(pathToFileURL(root + 'scene-life.js'));
const { createOwnershipRoofs } = await import(pathToFileURL(root + 'scene-ownership-roofs.js'));
const context = vm.createContext({ THREE, GLTFLoader, mergeGeometries, console, window: { matchMedia: () => ({ matches: false }), addEventListener() {}, dispatchEvent() {} }, CustomEvent: class {}, performance });
vm.runInContext(fs.readFileSync(root + 'scene.js', 'utf8').replace(/^import .*;\r?\n/gm, ''), context);
const optimize = source => { context.source = source; return vm.runInContext('optimizeModel(source)', context); };
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS ' + name); }
function target(world, model, index = 0) {
  const lot = new THREE.Group(); lot.userData.tileIndex = index; world.add(lot);
  const building = new THREE.Group(); building.userData.snowTarget = true; lot.add(building); building.add(model); return building;
}
function drain(snow, options = { snow: 1, snowfall: true }) {
  let frames = 0, largestBatch = 0;
  while (snow.getState().pending) {
    const before = snow.getState().trianglesProcessed;
    snow.tick(1 / 30, options); frames++;
    largestBatch = Math.max(largestBatch, snow.getState().trianglesProcessed - before);
    assert.ok(frames < 6000, 'bounded work eventually finishes');
  }
  assert.ok(largestBatch <= 4200, 'one tick visits at most 4200 source triangles'); return frames;
}
function advance(snow, seconds, options) { for (let i = 0; i < seconds * 30; i++) snow.tick(1 / 30, options); }
function cap(model) { return model.getObjectByName('roof_snow_cap'); }
const roofMaterial = new THREE.MeshStandardMaterial({ color: '#408e96' }); roofMaterial.name = 'Teal roof';
function block(name = 'fallback_house') {
  const model = new THREE.Group(); model.name = name;
  const house = new THREE.Mesh(new THREE.BoxGeometry(.9, .65, .75), roofMaterial); house.position.y = .38; model.add(house); return model;
}
const world = new THREE.Group(), original = block(), clone = original.clone(true);
clone.rotation.y = Math.PI / 2; clone.position.x = 3;
const building = target(world, original), cloneBuilding = target(world, clone, 1);
let renders = 0; const snow = createRoofSnow({ THREE, world, requestRender: () => renders++ }); snow.refresh();
drain(snow, { snow: 0, snowfall: false });
check('identical building geometry shares one cached cap across rotated instances', () => {
  assert.equal(snow.getState().caps, 2); assert.equal(snow.getState().cached, 1);
  assert.equal(cap(original).geometry, cap(clone).geometry); assert.equal(cap(original).parent.visible, false);
});
check('a shared roof mask added on first purchase also refreshes already-neutral copies', () => {
  const testWorld = new THREE.Group(), neutral = block('shared_mask_building');
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(.45, .15, .45), roofMaterial); ledge.position.set(.9, .55, 0); neutral.add(ledge);
  const purchased = neutral.clone(true); purchased.position.x = 3;
  target(testWorld, neutral); target(testWorld, purchased, 1);
  const effect = createRoofSnow({ THREE, world: testWorld }); effect.refresh(); drain(effect, { snowfall: true, reduced: true });
  const oldCap = cap(neutral).geometry;
  assert.equal(oldCap.userData.roofSnow.usesAuthoredRoofMask, false);
  // Ownership colors derive this attribute lazily on the shared geometry.
  const roof = purchased.children[0].geometry;
  roof.setAttribute('cityRoofMask', new THREE.Uint8BufferAttribute(new Uint8Array(roof.attributes.position.count).fill(1), 1));
  purchased.userData.roofOwner = 'human'; effect.refresh(); drain(effect, { snowfall: true, reduced: true });
  const refreshed = cap(neutral).geometry;
  assert.notEqual(refreshed, oldCap, 'neutral instance cannot retain its old fallback surface after a shared mask appears');
  assert.equal(refreshed.userData.roofSnow.usesAuthoredRoofMask, true);
  assert.equal(refreshed.userData.roofSnow.ownedRoof, false);
  assert.equal(cap(purchased).geometry.userData.roofSnow.ownedRoof, true);
  refreshed.computeBoundingBox(); assert.ok(refreshed.boundingBox.max.x < .5, 'the non-roof side ledge no longer grows a floating snow patch');
  effect.dispose(); neutral.children.forEach(node => node.geometry?.dispose());
});
check('roof geometry is a thin feathered cover without upright slab walls', () => {
  const geometry = cap(original).geometry, data = geometry.userData.roofSnow;
  assert.ok(data.capTriangles > 100); assert.ok(data.borderEdges > 0); assert.ok(data.minSourceNormal >= .48);
  const base = geometry.attributes.position, full = geometry.morphAttributes.position[0];
  for (let i = 0; i < base.count; i++) { assert.ok(full.getY(i) - base.getY(i) >= 0); assert.ok(full.getY(i) - base.getY(i) <= .013); assert.equal(base.getX(i), full.getX(i)); assert.equal(base.getZ(i), full.getZ(i)); }
  assert.equal(geometry.index.count, data.topIndexCount, 'no vertical white slab walls');
  const rgba = geometry.attributes.color;
  assert.equal(rgba.itemSize, 4, 'coverage is interpolated through built-in vertex alpha');
  assert(Array.from({length:rgba.count},(_,i)=>rgba.getW(i)).some(alpha=>alpha>0&&alpha<1),'real feathered edge vertices');
  assert(Array.from({length:rgba.count},(_,i)=>rgba.getW(i)).some(alpha=>alpha===0),'cover fades fully into the roof');
  geometry.computeBoundingBox(); assert.ok(geometry.boundingBox.max.y - geometry.boundingBox.min.y < .06);
});
check('falling snow visibly accumulates over seconds and persists before melting', () => {
  advance(snow, 3, { snow: 1, snowfall: true }); assert.ok(snow.getState().amount > .30 && snow.getState().amount < .50);
  advance(snow, 7, { snow: 1, snowfall: true }); assert.equal(snow.getState().amount, 1);
  assert.ok(Math.abs(cap(original).morphTargetInfluences[0] - 1) < 1e-6); assert.equal(cap(original).material.opacity, 1);
  advance(snow, 8, { snow: 0, snowfall: false, season: 'winter' }); assert.ok(snow.getState().amount > .8);
  advance(snow, 9, { snow: 0, rain: 1, snowfall: false, season: 'summer' }); assert.equal(snow.getState().amount, 0);
});
check('paused snow stays fixed and reduced motion gives a static readable layer', () => {
  advance(snow, 2, { snow: 1, snowfall: true }); const before = snow.getState().amount;
  advance(snow, 4, { snow: 1, snowfall: true, paused: true }); assert.equal(snow.getState().amount, before);
  snow.tick(0, { snow: 1, snowfall: true, reduced: true }); assert.equal(snow.getState().amount, 1);
  snow.tick(0, { snow: 0, snowfall: false, reduced: true }); assert.equal(snow.getState().amount, 0);
});
check('roof meshes cannot intercept player selection and are marked cosmetic', () => {
  const hits = [], effect = cap(original); assert.equal(effect.parent.userData.cosmetic, true);
  effect.raycast(new THREE.Raycaster(), hits); assert.equal(hits.length, 0);
});
check('replacing an upgraded building removes its cap without resetting settled snow', () => {
  snow.tick(0, { snowfall: true, reduced: true }); building.remove(original);
  const next = block('upgraded_house'); next.children[0].scale.y = 1.5; building.add(next); snow.refresh(); drain(snow, { snowfall: true, reduced: true });
  assert.equal(original.getObjectByName('roof_snow_cap'), undefined); assert.equal(snow.getState().caps, 2);
  assert.equal(cap(next).morphTargetInfluences[0], 1);
});
check('glass, panels and moving parts do not grow snow', () => {
  const glass = new THREE.MeshStandardMaterial({ color: '#b8e8ef' }); glass.name = 'Map deep blue glazing';
  const testWorld = new THREE.Group(), model = new THREE.Group(); model.name = 'excluded_surfaces';
  const glassBlock = new THREE.Mesh(new THREE.BoxGeometry(.8, .8, .8), glass); glassBlock.position.y = .5; model.add(glassBlock);
  const moving = new THREE.Group(); moving.name = 'life_wheel_rotor'; moving.position.x = 1.3;
  const movingRoof = new THREE.Mesh(new THREE.BoxGeometry(.8, .5, .8), roofMaterial); movingRoof.position.y = .6; moving.add(movingRoof); model.add(moving);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(.6, .5, .6), roofMaterial); panel.name = 'card_panel'; panel.position.set(-1.3, .6, 0); model.add(panel);
  target(testWorld, model); const effect = createRoofSnow({ THREE, world: testWorld }); effect.refresh(); drain(effect);
  assert.equal(effect.getState().caps, 0); effect.dispose(); glass.dispose();
});
check('Alpine architecture grows snow while complete plant and hot-spring surface names stay excluded', () => {
  const architectural = ['alpine/roof', 'alpine/wall', 'alpine/wood', 'alpine/wood_light', 'Alpine sandstone', 'Spring stone', 'Springfield limestone', 'Pineapple ceramic'];
  const excluded = ['Pine needles', 'Landmark / Jade pine foliage', 'Landmark / New pine tips', 'Park/evergreen_crown', 'Landmark / Milky turquoise hot springs', 'Map_topiary_spring', 'Map_warm_light', 'Light', 'alpine/water', 'alpine/leaf', 'alpine/glass'];
  const testWorld = new THREE.Group();
  const rows = [...architectural, ...excluded].map((name, index) => {
    const model = block('classification_' + index), material = roofMaterial.clone(); material.name = name;
    model.children[0].material = material;
    // A street facade contains the letters "tree", but is not a tree part.
    model.children[0].name = 'street_facade';
    target(testWorld, model, index); return { model, material, eligible: architectural.includes(name) };
  });
  const effect = createRoofSnow({ THREE, world: testWorld }); effect.refresh(); drain(effect, { snowfall: true, reduced: true });
  for (const { model, material, eligible } of rows) assert.equal(Boolean(cap(model)), eligible, material.name + ': snow eligibility follows the surface type');
  assert.equal(effect.getState().caps, architectural.length); effect.dispose();
  for (const { model, material } of rows) { model.children[0].geometry.dispose(); material.dispose(); }
});
check('no global random draws occur in extraction or accumulation', () => {
  const pendingWorld = new THREE.Group(), pendingModel = block('fresh_pending_roof'); target(pendingWorld, pendingModel);
  const pending = createRoofSnow({ THREE, world: pendingWorld }); pending.refresh();
  assert.ok(pending.getState().pending > 0);
  const random = Math.random; let calls = 0; Math.random = () => { calls++; return .5; };
  try { drain(pending); advance(pending, 2, { snowfall: true }); } finally { Math.random = random; }
  assert.equal(pending.getState().caps, 1); pending.dispose();
  assert.equal(calls, 0);
});

check('small curved tile sides stay connected while the owned eave retains color', () => {
  const tiledWorld = new THREE.Group(), model = block('tiled_regression_roof');
  model.userData.roofOwner = 'human';
  const positions = [], indices = [], nx = 80, nz = 40;
  for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
    const px = -.56 + x / nx * 1.12, pz = -.4 + z / nz * .8;
    positions.push(px, 1.1 - .45 * pz + .026 * Math.cos(px / .076 * Math.PI * 2), pz);
  }
  for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const a = z * (nx + 1) + x, b = a + 1, c = a + nx + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const roof = new THREE.BufferGeometry(); roof.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); roof.setIndex(indices);
  roof.setAttribute('cityRoofMask', new THREE.Uint8BufferAttribute(new Uint8Array(positions.length / 3).fill(1), 1));
  model.add(new THREE.Mesh(roof, roofMaterial)); target(tiledWorld, model);
  const effect = createRoofSnow({ THREE, world: tiledWorld }); effect.refresh(); drain(effect, { snow: 1, snowfall: true, reduced: true });
  const mesh = cap(model), data = mesh.geometry.userData.roofSnow;
  assert.ok(data.components <= 2, 'fine supported tile ribs do not split the roof into repeating snow boards');
  assert.ok(data.capTriangles > 1500, 'the cover spans most of the pitched roof, including the joined tile sides');
  assert.ok(data.bridgedSamples > 0, 'fixture exercises the steep curved tile-side gaps');
  assert.equal(data.usesAuthoredRoofMask, true, 'wall and ledge surfaces do not become a second snow facade');
  const alpha = mesh.geometry.attributes.color;
  assert.ok(Array.from({ length: alpha.count }, (_, i) => alpha.getW(i)).some(value => value === 1), 'one roof retains a continuous settled center');
  assert.ok(Array.from({ length: alpha.count }, (_, i) => alpha.getW(i)).some(value => value > 0 && value < 1), 'soft exposed colored eave remains');
  effect.dispose(); roof.dispose(); model.children[0].geometry.dispose();
});

let actualModels = 0, totalCaps = 0, totalTriangles = 0, widestCap = 0, integrationModel = null; const coverage = [];
for (const kit of ['city-kit', 'specials', 'landmarks', 'compact-specials', 'expansion-specials', ...['classic','compact','expansion','harbor','alpine'].map(map=>'regions/'+map)]) {
  const gltf = await loadGeometryGLB(kit.startsWith('regions/') ? regionalAssetURL(kit.slice(8)) : pathToFileURL(root + `assets/models/${kit}.glb`));
  const actualWorld = new THREE.Group(), models = [], owners = createOwnershipRoofs({THREE});
  for (const source of gltf.scene.children) {
    if (/^(?:plot_0|fountain|tree|streetlamp)$/.test(source.name)) continue;
    const model = optimize(source); if(kit.startsWith('regions/'))owners.set(model,'human'); target(actualWorld, model, models.length); models.push(model); actualModels++;
  }
  let requested = 0;
  const effect = createRoofSnow({ THREE, world: actualWorld, requestRender: () => requested++ }); effect.refresh(); const frames = drain(effect, { snow: 1, snowfall: true, reduced: true });
  assert.ok(frames > 1 && requested > 0, 'reduced motion schedules bounded extraction until completion');
  const rows = [];
  for (const model of models) {
    const snowMesh = cap(model); assert.ok(snowMesh, `${kit}/${model.name} has actual roof caps`);
    const geometry = snowMesh.geometry, data = geometry.userData.roofSnow;
    totalCaps++; totalTriangles += data.capTriangles;
    assert.ok(data.minSourceNormal >= .08 - 1e-6, model.name + ' only upward supported surfaces, including joined tile-cap sides');
    assert.equal(data.edgeProfile,'thin_feathered_coverage');
    assert.equal(geometry.index.count,data.topIndexCount,model.name+' no upright white edge walls');
    // Temporarily detach cosmetic geometry for an independent original bound.
    const cosmetic = snowMesh.parent; cosmetic.removeFromParent(); model.updateMatrixWorld(true);
    const originalBounds = new THREE.Box3().setFromObject(model); model.add(cosmetic); geometry.computeBoundingBox();
    const snowBounds = geometry.boundingBox;
    assert.ok(snowBounds.min.x >= originalBounds.min.x - 1e-4 && snowBounds.max.x <= originalBounds.max.x + 1e-4, model.name + ' footprint x');
    assert.ok(snowBounds.min.z >= originalBounds.min.z - 1e-4 && snowBounds.max.z <= originalBounds.max.z + 1e-4, model.name + ' footprint z');
    assert.ok(snowBounds.min.y > originalBounds.min.y + .16, model.name + ' avoids ground plinth');
    assert.ok(snowBounds.max.y <= originalBounds.max.y + .055, model.name + ' does not float');
    const positions = geometry.attributes.position, full = geometry.morphAttributes.position[0];
    for (let i = 0; i < positions.count; i++) assert.ok(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i) + full.getY(i)));
    const normals = geometry.attributes.normal;
    for (let i = 0; i < normals.count; i++) assert.ok(Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) < .001);
    widestCap = Math.max(widestCap, geometry.attributes.position.count);
    rows.push({ name: model.name, triangles: data.capTriangles, minSourceNormal: +data.minSourceNormal.toFixed(3) });
  }
  coverage.push({ kit, frames, models: rows });
  check(`${kit}: all ${models.length} actual optimized buildings have bounded roof caps`, () => assert.equal(effect.getState().caps, models.length));
  effect.dispose(); owners.clear();
  if (kit === 'landmarks') integrationModel = models.find(model => model.name === 'onsen_3');
}
check('actual Life reduced-motion updates finish a pending authored roof and then settle', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) };
  const scene = new THREE.Scene(), world = new THREE.Group(); scene.add(world);
  const light = new THREE.DirectionalLight('#fff1d8', 2); scene.add(light);
  const building = target(world, integrationModel, 7); let requested = 0;
  const life = createSceneLife({ THREE, scene, world, light, boardBounds: { w: 12.6, d: 10.8 }, snapshot: { mapId: 'classic', board: Array(22) },
    lotViews: new Map([[7, { building }]]), requestRender: () => requested++ });
  assert.equal(cap(integrationModel), undefined, 'the large authored roof still has pending batches after construction');
  let calls = 0, frames = 0; const random = Math.random;
  try {
    Math.random = () => { calls++; return .5; };
    life.setSeason('winter'); life.setWeather('snow');
    while (!cap(integrationModel)) { assert.equal(life.tick(++frames * 40, .04), true); assert.ok(frames < 150); }
    assert.ok(frames > 1, 'integration exercised multiple otherwise idle Life frames');
    assert.equal(cap(integrationModel).parent.visible, true); assert.equal(cap(integrationModel).morphTargetInfluences[0], 1);
    assert.equal(life.tick(++frames * 40, .04), false, 'reduced mode stops requesting animation after geometry is ready');
  } finally { Math.random = random; life.dispose(); if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
  assert.equal(calls, 0, 'pending extraction through the entire Life/Weather stack consumes no gameplay randomness');
  assert.ok(requested > 0); assert.equal(cap(integrationModel), undefined);
});
check('dispose releases cap resources exactly once and never shared model geometry', () => {
  let geometryDisposals = 0, materialDisposals = 0, sourceDisposals = 0;
  const current = cap(clone); current.geometry.addEventListener('dispose', () => geometryDisposals++);
  current.material.addEventListener('dispose', () => materialDisposals++);
  clone.children[0].geometry.addEventListener('dispose', () => sourceDisposals++);
  snow.dispose(); snow.dispose(); assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1); assert.equal(sourceDisposals, 0);
  assert.equal(cap(clone), undefined); assert.equal(snow.tick(1), false); assert.equal(snow.getState().pending, 0);
});
console.log(JSON.stringify({ checks, actualModels, totalCaps, totalTriangles, widestCapVertices: widestCap, failures: 0, coverage }, null, 2));

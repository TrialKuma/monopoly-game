import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { createScenicWindowLights } from '../scene-scenic-lighting.js';
import { createCityOutskirts } from '../scene-outskirts.js';
import { createDestinationScene } from '../scene-destinations.js';
import { createHarborProjectVisuals, updateHarborProjectVisuals, tickHarborProjectVisuals } from '../scene-harbor-projects.js';

let checks = 0;
async function test(name, run) { await run(); checks++; console.log(`PASS ${name}`); }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function sourceFixture() {
  const glass = new THREE.MeshStandardMaterial({ emissive: '#553311', emissiveIntensity: .035 });
  glass.name = 'house / warm window glass';
  const solid = new THREE.MeshStandardMaterial({ color: '#e4d6bd' }); solid.name = 'house / solid';
  const geometry = new THREE.BoxGeometry(.8, 1, .7), emission = glass.emissive.clone();
  let released = 0;
  for (const resource of [glass, solid, geometry]) resource.addEventListener('dispose', () => released++);
  function bundle(region) {
    const scene = new THREE.Group();
    for (const key of ['villa_3', 'shop_2', 'hotel_2', 'tower_2', 'junction_hub']) {
      const model = new THREE.Group(); model.name = `${region}_${key}`;
      model.userData.sourceType = 'authored_blender_reference_rebuild';
      model.add(new THREE.Mesh(geometry, glass)); scene.add(model);
    }
    return { scene, animations: [] };
  }
  function assertUnchanged() {
    assert.equal(glass.emissiveIntensity, .035, 'cached source intensity is unchanged');
    assert.deepEqual(glass.emissive, emission, 'cached source tint is unchanged');
    assert.equal(released, 0, 'district teardown never releases cached resources');
  }
  function assertWindows(root, night) {
    let count = 0;
    root.traverse(node => {
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) if (material?.name === glass.name) {
        assert.notEqual(material, glass, 'night lighting uses an owned material copy');
        if (night) assert(material.emissiveIntensity > 1.8, 'windows visibly illuminate at night');
        else { assert.equal(material.emissiveIntensity, .035); assert.deepEqual(material.emissive, emission); }
        count++;
      }
    });
    assert(count > 0, 'the actual instantiated buildings were inspected'); assertUnchanged();
  }
  return { glass, solid, geometry, emission, bundle, assertUnchanged, assertWindows,
    dispose() { geometry.dispose(); glass.dispose(); solid.dispose(); } };
}

await test('mixed-material windows clone once, return to their exact day appearance and restore borrowed bindings', () => {
  const f = sourceFixture(), owned = new Set();
  const controller = createScenicWindowLights({ THREE, own: value => { owned.add(value); return value; } });
  const root = new THREE.Group(), mesh = new THREE.Mesh(f.geometry, [f.glass, f.solid]); root.add(mesh);
  try {
    controller.update(1); controller.bind(root); f.assertWindows(root, true);
    assert.equal(mesh.material[1], f.solid, 'stone never acquires window lighting');
    controller.bind(root); assert.equal(owned.size, 1, 'repeat binding reuses the material copy');
    controller.update(0); f.assertWindows(root, false);
    controller.dispose(); controller.dispose();
    assert.deepEqual(mesh.material, [f.glass, f.solid]);
    owned.forEach(resource => resource.dispose()); f.assertUnchanged();
  } finally { controller.dispose(); f.dispose(); }
});

await test('all three outer districts apply an existing night to asynchronously loaded windows without changing the cache', async () => {
  for (const mapId of ['classic', 'compact', 'expansion']) {
    const f = sourceFixture(), loading = deferred(), world = new THREE.Group();
    const controller = createCityOutskirts({ THREE, world, boardBounds: { w: 14.4, d: 12.6 }, mapId,
      loadSceneryBundle: () => loading.promise });
    try {
      controller.tick(.1, { night: 1, paused: true, reduced: true });
      loading.resolve(f.bundle(mapId)); await controller.loading;
      assert(controller.getState().ready); f.assertWindows(world, true);
      if (mapId !== 'expansion') {
        const pools = world.getObjectByName('scenic_lamp_ground_glows');
        assert(pools.material.opacity > .5); assert.equal(pools.castShadow, false);
      }
      controller.tick(.1, { night: 0, paused: true, reduced: true }); f.assertWindows(world, false);
      controller.dispose(); controller.dispose(); assert.equal(world.children.length, 0); f.assertUnchanged();
    } finally { controller.dispose(); f.dispose(); }
  }
});

await test('destination hero and village both receive current night lighting when their independent loads finish', async () => {
  const f = sourceFixture(), village = deferred(), hero = deferred(), world = new THREE.Group();
  const controller = createDestinationScene({ THREE, world, boardBounds: { w: 18, d: 16 }, mapId: 'alpine',
    loadSceneryBundle: file => file.startsWith('regions') ? village.promise : hero.promise });
  try {
    controller.tick(.1, { night: 1, paused: true, reduced: true });
    village.resolve(f.bundle('alpine')); hero.resolve(f.bundle('alpine')); await controller.loading;
    assert(controller.getState().ready);
    f.assertWindows(world.getObjectByName('destination_alpine_village'), true);
    f.assertWindows(world.getObjectByName('alpine_windmill'), true);
    controller.tick(.1, { night: 0, paused: true, reduced: true }); f.assertWindows(world, false);
    controller.dispose(); controller.dispose(); assert.equal(world.children.length, 0); f.assertUnchanged();
  } finally { controller.dispose(); f.dispose(); }
});

await test('harbor upgrade celebration ends at the night baseline and daytime restores the original lights', () => {
  const root = new THREE.Group(), owned = new Set();
  const entry = createHarborProjectVisuals({ THREE, root, id: 'water', center: new THREE.Vector3(), radius: 2.5,
    own: value => { owned.add(value); return value; } });
  try {
    updateHarborProjectVisuals(root, [{ id: 'water', stage: 1 }]);
    tickHarborProjectVisuals(root, 0, { night: 1, reducedMotion: false });
    assert(entry.glowMaterials.every(material => material.emissiveIntensity > 2.9));
    const pools = entry.stages[1].getObjectByName('scenic_lamp_ground_glows');
    assert.equal(pools.geometry.attributes.position.count, 24, 'four lamps share one six-vertex-per-pool batch');
    assert.equal(pools.material.opacity, .52);
    const nightIntensity = entry.glowMaterials.map(material => material.emissiveIntensity);
    updateHarborProjectVisuals(root, [{ id: 'water', stage: 2 }]);
    tickHarborProjectVisuals(root, 10, { night: 1, reducedMotion: false });
    tickHarborProjectVisuals(root, 560, { night: 1, reducedMotion: false });
    assert(entry.glowMaterials.every((material, index) => material.emissiveIntensity > nightIntensity[index]));
    tickHarborProjectVisuals(root, 1200, { night: 1, reducedMotion: false });
    assert.equal(entry.animation, null);
    assert.deepEqual(entry.glowMaterials.map(material => material.emissiveIntensity), nightIntensity);
    tickHarborProjectVisuals(root, 1300, { night: 0, reducedMotion: false });
    assert(entry.glowMaterials.every(material => material.emissiveIntensity === .55));
    assert.equal(pools.visible, false); assert.deepEqual(entry.group.scale.toArray(), [1, 1, 1]);
  } finally { owned.forEach(resource => resource.dispose()); }
});

console.log(`${checks} scenic night lighting checks passed.`);

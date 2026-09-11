import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { createCityOutskirts } from '../scene-outskirts.js';

let checks = 0;
const test = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };
function fixture(mapId = 'compact', w = 12.6, d = 10.8) {
  const world = new THREE.Group();
  const borrowedGeometry = new THREE.BoxGeometry(1, 1, 1), borrowedMaterial = new THREE.MeshStandardMaterial();
  const borrowed = new THREE.Mesh(borrowedGeometry, borrowedMaterial); world.add(borrowed);
  let requests = 0;
  const api = createCityOutskirts({ THREE, world, boardBounds: { w, d }, mapId, requestRender: () => requests++ });
  return { world, root: world.getObjectByName('city_outskirts'), api, borrowed, requests: () => requests };
}

test('all scenery stays clear of the plinth and remains low, narrow and bounded on all maps', () => {
  for (const [mapId, w, d] of [['classic', 12.6, 10.8], ['compact', 16.2, 12.6], ['expansion', 19.8, 18]]) {
    const f = fixture(mapId, w, d); let count = 0;
    const matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
    f.root.updateMatrixWorld(true);
    f.root.traverse(node => {
      if (!node.isMesh) return;
      count++;
      assert.equal(node.castShadow, false, 'exterior adds no shadow casters');
      const intersections = []; node.raycast({}, intersections); assert.equal(intersections.length, 0, 'decoration cannot intercept tiles');
      const positions = node.geometry.attributes.position;
      for (let instance = 0; instance < (node.isInstancedMesh ? node.count : 1); instance++) {
        if (node.isInstancedMesh) { node.getMatrixAt(instance, matrix); matrix.premultiply(node.matrixWorld); }
        else matrix.copy(node.matrixWorld);
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix);
          assert.ok(Number.isFinite(vertex.x) && Number.isFinite(vertex.y) && Number.isFinite(vertex.z));
          assert.ok(Math.abs(vertex.x) > w / 2 + .64 || Math.abs(vertex.z) > d / 2 + .64, `${mapId}/${node.name} intersects plinth at ${vertex.toArray()}`);
          assert.ok(vertex.y < .12 && vertex.y > -.47, 'low enough to preserve building silhouettes');
          assert.ok(Math.abs(vertex.x) < w / 2 + 1.6 && Math.abs(vertex.z) < d / 2 + 1.6, 'no distant scenery forces camera zoom');
        }
      }
    });
    assert.ok(count <= 20 && count >= 10, `bounded draw count ${count}`);
    f.api.dispose();
  }
});

test('motion and night glow pause, support reduced motion and consume no gameplay RNG', () => {
  const f = fixture();
  const boat = f.root.getObjectByName('outskirts_boat_0');
  const initial = boat.position.clone();
  const random = Math.random; Math.random = () => { throw new Error('outskirts consumed gameplay RNG'); };
  try {
    assert.equal(f.api.tick(.1), true); assert.notDeepEqual(boat.position, initial);
    const moved = boat.position.clone(), rotation = boat.rotation.toArray();
    assert.equal(f.api.tick(.1, { paused: true }), false);
    assert.equal(f.api.tick(.1, { reduced: true }), false);
    assert.deepEqual(boat.position, moved); assert.deepEqual(boat.rotation.toArray(), rotation);
    assert.equal(f.api.tick(.1, { paused: true, night: 1 }), true);
    const lamps = f.root.getObjectByName('outskirts_lamp_globes');
    assert.ok(lamps.material.emissiveIntensity > 1.5);
    assert.equal(f.api.tick(.1, { paused: true, night: 1 }), false);
    assert.equal(f.requests(), 1, 'caller owns the frame loop');
  } finally { Math.random = random; f.api.dispose(); }
});

test('surroundings can be hidden without advancing their motion or disturbing the board', () => {
  const f = fixture(); const boat = f.root.getObjectByName('outskirts_boat_0');
  const position = boat.position.clone();
  assert.equal(f.api.setVisible(false), true); assert.equal(f.root.visible, false);
  assert.equal(f.api.tick(.1, { night: 1 }), false); assert.deepEqual(boat.position, position);
  assert.equal(f.borrowed.visible, true); assert.equal(f.requests(), 2);
  f.api.setVisible(false); assert.equal(f.requests(), 2, 'unchanged visibility skips a render');
  assert.equal(f.api.setVisible(true), true); assert.equal(f.root.visible, true);
  assert.equal(f.api.tick(.1), true); assert.notDeepEqual(boat.position, position);
  f.api.dispose(); assert.equal(f.api.setVisible(true), false);
});

test('disposal releases each owned resource once and preserves borrowed scene content', () => {
  const f = fixture(); const resources = new Set();
  f.root.traverse(node => {
    if (!node.isMesh) return;
    resources.add(node.geometry); resources.add(node.material);
    if (node.isInstancedMesh) resources.add(node);
  });
  let releases = 0, borrowedReleases = 0;
  resources.forEach(resource => resource.addEventListener('dispose', () => releases++));
  f.borrowed.geometry.addEventListener('dispose', () => borrowedReleases++);
  f.borrowed.material.addEventListener('dispose', () => borrowedReleases++);
  f.api.dispose(); f.api.dispose();
  assert.equal(releases, resources.size); assert.equal(borrowedReleases, 0);
  assert.equal(f.world.getObjectByName('city_outskirts'), undefined);
  assert.equal(f.world.children.length, 1); assert.equal(f.world.children[0], f.borrowed);
  assert.equal(f.api.tick(.1), false);
});

console.log(`${checks} city outskirts checks passed.`);

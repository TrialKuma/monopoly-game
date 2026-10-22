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

test('layered scenery stays clear of the plinth, keeps near sightlines low and has a fixed draw budget', () => {
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
          const outward = Math.max(Math.abs(vertex.x) - w / 2, Math.abs(vertex.z) - d / 2);
          assert.ok(vertex.y < 1.3 && vertex.y > -.47, 'bounded miniature silhouette');
          if (outward < 1.55) assert.ok(vertex.y < .12, `${node.name} obscures the near board edge`);
          assert.ok(Math.abs(vertex.x) < w / 2 + 5.3 && Math.abs(vertex.z) < d / 2 + 5.3, 'landscape remains bounded');
        }
      }
    });
    assert.ok(count <= 34 && count >= 24, `bounded draw count ${count}`);
    f.api.dispose();
  }
});

test('all four edges and corners have layered scenery, with distinct map themes', () => {
  const themes = new Set();
  for (const mapId of ['classic', 'compact', 'expansion']) {
    const f = fixture(mapId); themes.add(f.root.userData.theme);
    for (let i = 0; i < 4; i++) {
      assert.ok(f.root.getObjectByName(`outskirts_district_${i}`), `edge ${i} has scenery`);
      assert.ok(f.root.getObjectByName(`outskirts_corner_garden_${i}`), `corner ${i} has scenery`);
    }
    assert.ok(f.root.getObjectByName('outskirts_tree_crowns').count >= 40, 'continuous tree line');
    assert.ok(f.root.getObjectByName('outskirts_neighbourhood_homes').count >= 12, 'distant neighbourhood layer');
    assert.equal(!!f.root.getObjectByName('outskirts_beach_parasols'), mapId === 'compact');
    assert.equal(!!f.root.getObjectByName('outskirts_boardwalk_decks'), mapId === 'compact');
    assert.equal(f.root.getObjectByName('outskirts_neighbourhood_roofs').geometry.type, mapId === 'expansion' ? 'BoxGeometry' : 'CylinderGeometry');
    f.api.tick(0, { night: 1 });
    assert.ok(f.root.getObjectByName('outskirts_neighbourhood_windows').material.emissiveIntensity > .9);
    f.api.dispose();
  }
  assert.equal(themes.size, 3);
});

test('scenery placement is deterministic and independent of global random values', () => {
  const random = Math.random;
  // Three.js calls Math.random when assigning UUIDs; constructing decorative
  // objects is unavoidable, but their geometry and placement must not use it.
  let seed = 0;
  Math.random = () => (++seed % 100) / 100;
  const first = fixture('expansion');
  Math.random = () => 0.73;
  let second;
  try {
    second = fixture('expansion');
    const matrices = root => {
      const result = []; root.traverse(node => { if (node.isInstancedMesh) result.push(Array.from(node.instanceMatrix.array)); }); return result;
    };
    assert.deepEqual(matrices(first.root), matrices(second.root));
  } finally { Math.random = random; first.api.dispose(); second?.api.dispose(); }
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

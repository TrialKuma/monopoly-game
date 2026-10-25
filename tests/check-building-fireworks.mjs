import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { createLevelThreeTracker, buildingRoofAnchor, createBuildingFireworks } from '../scene-fireworks.js';

let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }
check('mutable snapshots celebrate a real level transition once, never initial loading or a new game', () => {
  const tracker = createLevelThreeTracker(), lot = { id: 7, level: 2, owner: 'human' };
  assert.deepEqual(tracker.observe('a', [lot]), []);
  lot.level = 3; assert.deepEqual(tracker.observe('a', [lot]), [lot]);
  assert.deepEqual(tracker.observe('a', [lot]), []);
  assert.deepEqual(tracker.observe('b', [lot]), []);
  tracker.reset(); assert.deepEqual(tracker.observe('b', [lot]), []);
});
check('both owners qualify; previews, unowned stock and newly inserted max-level lots do not', () => {
  const tracker = createLevelThreeTracker(), items = ['human', 'ai', null].map((owner, id) => ({ id, owner, level: 2 }));
  tracker.observe('a', items); items.forEach(item => item.level = 3);
  assert.deepEqual(tracker.observe('a', items).map(item => item.owner), ['human', 'ai']);
  items.forEach(item => item.level = 2); tracker.observe('a', items);
  items.forEach(item => item.level = 3); assert.deepEqual(tracker.observe('a', items, false), []);
  assert.deepEqual(tracker.observe('a', [...items, { id: 9, level: 3, owner: 'human' }]), []);
});
check('town star records are copied so merging celebrates once across repaint/place events', () => {
  const tracker = createLevelThreeTracker(), card = { id: 'harbor_villa', owner: true, level: 2 };
  tracker.observe('town', [card]); card.level = 3; assert.equal(tracker.observe('town', [card]).length, 1);
  assert.equal(tracker.observe('town', [card]).length, 0);
  tracker.reset(); assert.equal(tracker.observe('town', [card]).length, 0);
});
check('roof anchor respects world translation, rotation and full upgrade height without changing the scene', () => {
  const parent = new THREE.Group(), building = new THREE.Group(), model = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1));
  parent.position.set(8, .2, -5); parent.rotation.y = Math.PI / 3; parent.add(building); building.add(model); model.position.y = 2; building.scale.y = .78;
  const anchor = buildingRoofAnchor(THREE, building, 1);
  assert(Math.abs(anchor.y - 4.2) < .000001); assert(Math.abs(anchor.x - 8) < .000001); assert.equal(building.scale.y, .78);
  assert.equal(buildingRoofAnchor(THREE, new THREE.Group()), null); model.geometry.dispose(); model.material.dispose();
});
check('three modest bursts are roof-anchored, deduplicated, bounded and fully disposed when finished', () => {
  const parent = new THREE.Group(), fx = createBuildingFireworks({ THREE, parent });
  assert(fx.launch({ key: 'a', anchor: new THREE.Vector3(2, 4, 5), now: 0 }));
  assert.equal(fx.launch({ key: 'a', anchor: new THREE.Vector3(), now: 1 }), false);
  const root = parent.children[0], geometry = root.children[0].geometry; let geometryDisposes = 0, materialDisposes = 0;
  geometry.addEventListener('dispose', () => geometryDisposes++); root.children.forEach(mesh => mesh.material.addEventListener('dispose', () => materialDisposes++));
  assert.equal(fx.getState().particles, 72); assert.equal(fx.getState().bursts, 3);
  fx.tick(750); const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  for (const mesh of root.children) { assert(mesh.visible); for (let i = 0; i < 24; i++) { mesh.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix); assert(point.y > 4.14); assert(Math.abs(point.x - 2) < 2 && Math.abs(point.z - 5) < 2); } }
  assert(fx.launch({ key: 'b', anchor: new THREE.Vector3(), now: 750 }));
  assert.equal(fx.launch({ key: 'c', anchor: new THREE.Vector3(), now: 750 }), false);
  fx.tick(3000); assert.equal(fx.active, false); assert.equal(root.children.length, 0); assert.equal(geometryDisposes, 1); assert.equal(materialDisposes, 3);
  assert.equal(fx.tick(4000), false, 'no idle animation work'); fx.dispose(); fx.dispose(); assert.equal(parent.children.length, 0);
});
check('reduced motion skips particles and turning it on clears an active show', () => {
  let reduced = true; const parent = new THREE.Group(), fx = createBuildingFireworks({ THREE, parent, reducedMotion: () => reduced });
  assert.equal(fx.launch({ key: 1, anchor: new THREE.Vector3() }), false); assert.equal(parent.children[0].children.length, 0);
  reduced = false; assert(fx.launch({ key: 1, anchor: new THREE.Vector3(), now: 0 })); reduced = true; fx.tick(50); assert.equal(fx.active, false);
  fx.dispose(); assert.equal(parent.children.length, 0);
});
console.log(`PASS ${checks} building celebration groups`);

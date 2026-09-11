import assert from 'node:assert/strict';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { createCityLighting } from '../scene-lighting.js';

function fixture({ rendererless = false, width = 14.85, depth = 11.55 } = {}) {
  const scene = new THREE.Scene(), world = new THREE.Group(); scene.add(world);
  const background = new THREE.Color('#abcded'); scene.background = background; scene.environmentIntensity = .35;
  const hemi = new THREE.HemisphereLight('#fff6e7', '#94aaa0', 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d6', 2.4); sun.position.set(-7, 15, 5); scene.add(sun);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const fill = new THREE.DirectionalLight('#d4eeed', .4); fill.position.set(8, 7, -6); scene.add(fill);
  const material = new THREE.MeshStandardMaterial({ color: '#dbe3d7' });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material); floor.rotation.x = -Math.PI / 2; floor.position.y = -.44; world.add(floor);
  const boardMaterial = new THREE.MeshStandardMaterial({ color: '#eece93' });
  const board = new THREE.Mesh(new THREE.BoxGeometry(width, .1, depth), boardMaterial); world.add(board);
  const renderer = rendererless ? undefined : { toneMappingExposure: .96 };
  let requests = 0;
  const api = createCityLighting({ THREE, scene, world, renderer, light: sun, boardBounds: { w: width, d: depth }, requestRender: () => requests++ });
  return { api, scene, world, sun, hemi, fill, floor, material, board, boardMaterial, renderer, background, requests: () => requests };
}
const settle = (api, mode, climate = {}) => {
  api.setTimeMode(mode);
  for (let i = 0; i < 220; i++) api.tick(1 / 30, climate);
  return api.getState();
};
let checks = 0;
const test = (name, run) => { run(); checks++; console.log(`PASS ${name}`); };

test('actual sun travels east to west and produces long golden-hour shadows', () => {
  const f = fixture();
  const dawn = settle(f.api, 'dawn'), east = f.sun.position.clone();
  const day = settle(f.api, 'day'), noon = f.sun.position.clone();
  const dusk = settle(f.api, 'dusk'), west = f.sun.position.clone();
  assert.ok(east.x < 0 && west.x > 0, 'opposite morning/evening azimuths');
  assert.ok(day.shadowElevation > .85 && dusk.shadowElevation >= .32 && dusk.shadowElevation < .48);
  assert.ok(noon.y > west.y * 1.6 && noon.y > east.y * 1.6);
  assert.ok(dusk.warmth > .9 && dawn.warmth > .9 && day.warmth < .02);
  assert.ok(f.sun.color.r > f.sun.color.b * 1.5, 'golden direct light remains warm');
  assert.ok(f.hemi.color.b > f.hemi.color.r, 'the unlit sides retain cool skylight');
  f.api.dispose();
});

test('night keeps a real elevated moon key and bounded warm shadowless park lights', () => {
  const f = fixture(); const state = settle(f.api, 'night');
  assert.equal(state.shadowSource, 'moon'); assert.equal(state.night, 1);
  assert.ok(f.sun.position.y > 5 && f.sun.intensity >= .55 && f.sun.intensity < 1);
  assert.ok(f.sun.color.b > f.sun.color.r && f.hemi.intensity > .4);
  const pointLights = []; f.scene.traverse(node => { if (node.isPointLight) pointLights.push(node); });
  assert.equal(pointLights.length, 3); assert.ok(pointLights.every(node => !node.castShadow && node.intensity > 0));
  assert.ok(f.scene.environmentIntensity > .1 && f.scene.environmentIntensity < .2);
  f.api.dispose();
});

test('shadow camera contains every board corner through day, dusk, and night', () => {
  let corners = 0;
  for (const [width, depth] of [[11.55, 9.9], [14.85, 11.55], [18.15, 16.5]]) {
    const f = fixture({ width, depth });
    for (const mode of ['dawn', 'day', 'dusk', 'night']) {
      settle(f.api, mode);
      const camera = f.sun.shadow.camera;
      assert.ok(camera.near > 0 && camera.far > camera.near);
      for (const x of [-width / 2 - 1, width / 2 + 1]) for (const z of [-depth / 2 - 1, depth / 2 + 1]) for (const y of [-.5, 4.8]) {
        const projected = new THREE.Vector3(x, y, z).project(camera);
        assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1, `${mode}: clipped ${projected.toArray()}`); corners++;
      }
    }
    f.api.dispose();
  }
  assert.equal(corners, 96);
});

test('rain clouds soften direct light while maintaining readable indirect light', () => {
  const f = fixture(); settle(f.api, 'day');
  const direct = f.sun.intensity, ambient = f.hemi.intensity, radius = f.sun.shadow.radius;
  f.api.tick(.03, { rain: 1, cloud: 1, wetness: 1 });
  assert.ok(f.sun.intensity < direct * .3); assert.ok(f.hemi.intensity >= ambient);
  assert.ok(f.sun.shadow.radius > radius && f.floor.material.roughness < .7);
  assert.equal(f.api.getState().cloud, 1);
  f.api.dispose();
});

test('automatic clock takes 240 seconds per day and pauses without catch-up', () => {
  const f = fixture(); assert.equal(f.api.getState().hour, 10);
  for (let i = 0; i < 600; i++) f.api.tick(.1);
  assert.ok(Math.abs(f.api.getState().hour - 16) < .00001);
  const state = f.api.getState(), position = f.sun.position.clone();
  for (let i = 0; i < 100; i++) assert.equal(f.api.tick(.1, { paused: true, rain: 1 }), false);
  assert.deepEqual(f.api.getState(), state); assert.deepEqual(f.sun.position, position);
  for (let i = 0; i < 1800; i++) f.api.tick(.1);
  assert.ok(Math.abs(f.api.getState().hour - 10) < .00001);
  f.api.dispose();
});

test('explicit changes settle while paused and reduced motion changes instantly', () => {
  const f = fixture();
  settle(f.api, 'night', { paused: true }); assert.equal(f.api.getState().hour, 22);
  f.api.tick(.01, { reduced: true }); f.api.setTimeMode('dawn');
  assert.ok(f.api.getState().hour >= 7 && f.api.getState().hour <= 7.2);
  assert.equal(f.api.setTimeMode('storm'), false);
  f.api.setTimeMode('auto'); f.api.tick(.1, { reduced: true });
  const hour = f.api.getState().hour;
  for (let i = 0; i < 100; i++) f.api.tick(.1, { reduced: true });
  assert.equal(f.api.getState().hour, hour); assert.ok(f.requests() > 0);
  f.api.dispose();
});

test('static state skips renders and runtime never consumes gameplay RNG', () => {
  const f = fixture(); settle(f.api, 'day');
  const random = Math.random;
  Math.random = () => { throw new Error('lighting consumed game RNG'); };
  try {
    assert.equal(f.api.tick(.03), false);
    f.api.setTimeMode('dusk'); f.api.tick(.03); f.api.tick(.03, { cloud: .6, snow: .4 });
  } finally { Math.random = random; f.api.dispose(); }
});

test('rendererless construction restores shared materials, light, sky and shadow settings', () => {
  const f = fixture({ rendererless: true });
  const borrowedMap = new THREE.WebGLRenderTarget(1, 1); f.sun.shadow.map = borrowedMap;
  let originalDisposed = 0, skyDisposed = 0, cloneDisposed = 0;
  borrowedMap.addEventListener('dispose', () => originalDisposed++);
  f.material.addEventListener('dispose', () => originalDisposed++);
  f.scene.background.addEventListener('dispose', () => skyDisposed++);
  f.floor.material.addEventListener('dispose', () => cloneDisposed++);
  assert.notEqual(f.floor.material, f.material); assert.equal(f.board.material, f.boardMaterial);
  settle(f.api, 'night'); f.api.dispose(); f.api.dispose();
  assert.equal(f.scene.background, f.background); assert.equal(f.scene.environmentIntensity, .35);
  assert.equal(f.floor.material, f.material); assert.equal(f.sun.intensity, 2.4);
  assert.deepEqual(f.sun.position.toArray(), [-7, 15, 5]); assert.deepEqual(f.fill.position.toArray(), [8, 7, -6]);
  assert.equal(f.sun.shadow.camera.left, -5); assert.equal(f.sun.shadow.camera.far, 500);
  assert.equal(f.sun.shadow.map, borrowedMap); assert.equal(originalDisposed, 0);
  assert.equal(skyDisposed, 1); assert.equal(cloneDisposed, 1);
  assert.equal(f.scene.getObjectByName('city_lighting'), undefined);
  assert.equal(f.api.tick(.1), false); assert.equal(f.api.setTimeMode('day'), false);
  borrowedMap.dispose();
});

console.log(`${checks} city lighting checks passed.`);

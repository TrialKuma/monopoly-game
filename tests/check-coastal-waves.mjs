import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { createHarborIslands } from '../scene-harbor-islands.js';
import { harborVisualPosition } from '../scene-harbor-paths.js';
import { createCoastalWaves } from '../scene-coastal-waves.js';

const game = fs.readFileSync(new URL('../game.js', import.meta.url), 'utf8');
const boardFunction = game.slice(game.indexOf('function createBoard('), game.indexOf('function prepareOpeningLots('));
const { board, map } = vm.runInNewContext(game.slice(0, game.indexOf('const CARD_POOL')) + boardFunction + ';({board:createBoard(MAP_PRESETS.harbor),map:MAP_PRESETS.harbor})');
const positions = board.map(harborVisualPosition), xs = positions.map(p => p.x), zs = positions.map(p => p.y);
const bounds = { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...zs) + Math.max(...zs)) / 2 };
bounds.w = (Math.max(...xs) - Math.min(...xs) + 1) * 1.8; bounds.d = (Math.max(...zs) - Math.min(...zs) + 1) * 1.8;
const world = new THREE.Group(), resources = new Set();
const island = createHarborIslands({ THREE, world, boardBounds: bounds, data: { board, navigation: map.navigation }, own: r => { resources.add(r); return r; } });
const effect = createCoastalWaves({ THREE, world, boardBounds: bounds });
// Three allocates UUIDs when resources are constructed; animation and wave
// placement use no gameplay randomness once those normal resources exist.
const originalRandom = Math.random;
const foam = world.getObjectByName('harbor_rolling_foam'), state = effect.getState();
assert(state.coastPatches > 20, 'actual three-island coastline receives multiple local foam patches');
assert(state.coastPatches <= 96 && state.draws <= 6, 'bounded mobile rendering budget');
const shores = island.userData.islandFootprints.map(({ points }) => {
  const center = points.reduce((a, p) => [a[0] + p[0] / points.length, a[1] + p[1] / points.length], [0, 0]);
  return points.map(p => [(center[0] + (p[0] - center[0]) * 1.05 - bounds.cx) * 1.8, (center[1] + (p[1] - center[1]) * 1.05 - bounds.cy) * 1.8]);
});
function inside(x, z, points) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}
let sampledVertices = 0;
for (let frame = 0; frame < 90; frame++) {
  try { Math.random = () => { throw new Error('Atmosphere consumed game RNG'); }; effect.tick(.1, {}); }
  finally { Math.random = originalRandom; }
  const p = foam.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    assert(p.getY(i) < -.38 && p.getY(i) > -.415, 'waves stay at sea level, below roads');
    assert(!shores.some(poly => inside(p.getX(i), p.getZ(i), poly)), `foam enters coast at frame ${frame}, vertex ${i}`); sampledVertices++;
  }
}
const before = [...foam.geometry.attributes.position.array], time = effect.getState().elapsed;
effect.tick(.1, { paused: true }); assert.deepEqual([...foam.geometry.attributes.position.array], before); assert.equal(effect.getState().elapsed, time);
effect.tick(.1, { reduced: true, night: 1 }); assert.deepEqual([...foam.geometry.attributes.position.array], before); assert.equal(effect.getState().elapsed, time);
assert(foam.material.uniforms.strength.value < .26, 'night/reduced foam remains subdued');
effect.setVisible(false); assert.equal(effect.tick(.1, {}), false); assert.equal(effect.getState().elapsed, time); assert.equal(world.getObjectByName('regional_coastal_waves').visible, false);
effect.setVisible(true); assert.equal(world.getObjectByName('regional_coastal_waves').visible, true);
let disposedGeometry = 0, disposedMaterial = 0;
foam.geometry.addEventListener('dispose', () => disposedGeometry++); foam.material.addEventListener('dispose', () => disposedMaterial++);
effect.dispose(); effect.dispose();
assert.equal(disposedGeometry, 1); assert.equal(disposedMaterial, 1); assert.equal(world.getObjectByName('regional_coastal_waves'), undefined);
assert.equal(world.getObjectByName('harbor_three_islands'), island, 'shared coast remains untouched'); assert.equal(effect.tick(.1, {}), false);
for (const resource of resources) resource.dispose?.();
console.log(JSON.stringify({ coastPatches: state.coastPatches, draws: state.draws, sampledVertices, pauseAndReduced: 'pass', disposal: 'pass', gameRngUntouched: true }));

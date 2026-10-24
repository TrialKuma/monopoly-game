import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from '../assets/vendor/three/three.module.min.js';
import { createOwnershipRoofs, OWNERSHIP_ROOF_COLORS } from '../scene-ownership-roofs.js';
import { loadGeometryGLB, regionalAssetURL } from './gltf-geometry-fixture.mjs';
import { createCityWeather } from '../scene-weather.js';
import { mergeGeometries } from '../assets/vendor/three/addons/utils/BufferGeometryUtils.js';

const FAMILY = /_(?:villa|shop|hotel|tower|skyscraper|finance|onsen)_[123]$/;
const WALL = { classic: '#eee0c5', compact: '#e8d5ad', expansion: '#ac624a', harbor: '#f2e4c8', alpine: '#ead8b5' };
const hash = attribute => {
  const array = attribute?.data?.array || attribute?.array;
  return createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
};
const compile = material => {
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <aomap_fragment>' };
  material.onBeforeCompile(shader, null); return shader;
};
let tested = 0, masked = 0, wallVertices = 0;
for (const region of Object.keys(WALL)) {
  const gltf = await loadGeometryGLB(regionalAssetURL(region)), roofs = createOwnershipRoofs({ THREE });
  const buildings = gltf.scene.children.filter(root => FAMILY.test(root.name));
  assert.equal(buildings.length, 21);
  const originalDispose = new Map();
  gltf.scene.traverse(node => { if (node.isMesh) { node.material.addEventListener('dispose', () => originalDispose.set(node.material, true)); } });
  for (const source of buildings) {
    const human = source.clone(true), enemy = source.clone(true), neutral = source.clone(true);
    const colorsBefore = new Map(), materialsBefore = new Map(), shapesBefore = new Map();
    source.traverse(node => { if (node.isMesh) { colorsBefore.set(node.geometry, hash(node.geometry.attributes.color)); shapesBefore.set(node.geometry, hash(node.geometry.attributes.position)); materialsBefore.set(node.name, node.material); } });
    assert.equal(roofs.set(neutral, null), null, 'unowned buildings do not allocate roof materials');
    const a = roofs.set(human, 'human'), b = roofs.set(enemy, 'ai');
    assert(a.vertices > 10, `${source.name}: real roof surfaces selected`);
    assert.equal(a.vertices, b.vertices, 'ownership does not alter segmentation');
    masked += a.vertices;
    const selected = [], unchanged = [], humanShaders = [];
    human.traverse(node => {
      if (!node.isMesh) return;
      const original = materialsBefore.get(node.name), enemyNode = enemy.getObjectByName(node.name), neutralNode = neutral.getObjectByName(node.name);
      assert.equal(node.geometry, enemyNode.geometry, 'geometry remains shared across placements');
      assert.equal(node.geometry, neutralNode.geometry, 'unowned copy retains same geometry');
      assert.equal(hash(node.geometry.attributes.color), colorsBefore.get(node.geometry), 'original colors stay byte-identical');
      assert.equal(hash(node.geometry.attributes.position), shapesBefore.get(node.geometry), 'topology positions stay byte-identical');
      assert.equal(neutralNode.material, original, 'unowned material unchanged');
      if (node.material === original) { unchanged.push(node); return; }
      selected.push(node);
      assert.notEqual(node.material, enemyNode.material, 'independent material instance per lot');
      assert.equal(node.material.aoMap, original.aoMap); assert.equal(node.material.roughnessMap, original.roughnessMap); assert.equal(node.material.metalnessMap, original.metalnessMap);
      assert.equal(node.material.vertexColors, true);
      assert(node.material.color.equals(original.color), 'material base color is not whole-building tint');
      const mask = node.geometry.attributes.cityRoofMask, color = node.geometry.attributes.color, wall = new THREE.Color(WALL[region]);
      if (region === 'expansion') {
        const family = source.name.split('_')[1], expectedDecks = family === 'skyscraper' ? 5 : ['finance', 'onsen'].includes(family) ? 2 : 1;
        const info = node.geometry.userData.ownershipRoofMask;
        assert.equal(info.flatDeckSurfaces, expectedDecks, `${source.name}: every authored crown has its inset roof deck painted`);
        assert.equal(info.flatDeckVertices, expectedDecks * 4, `${source.name}: only each broad planar deck face is added, not door/window reveals`);
      }
      let count = 0;
      for (let i = 0; i < mask.count; i++) {
        if (mask.getX(i)) count++;
        if (Math.max(Math.abs(color.getX(i) - wall.r), Math.abs(color.getY(i) - wall.g), Math.abs(color.getZ(i) - wall.b)) < .0021) {
          assert.equal(mask.getX(i), 0, `${source.name}: no wall painting`); wallVertices++;
        }
      }
      assert(count > 10 && count < mask.count * .70, `${source.name}: selective roof mask`);
      const shader = compile(node.material), enemyShader = compile(enemyNode.material); humanShaders.push(shader);
      assert.equal(shader.uniforms.cityOwnerRoofColor.value.getHexString(), OWNERSHIP_ROOF_COLORS.human.slice(1));
      assert.equal(enemyShader.uniforms.cityOwnerRoofColor.value.getHexString(), OWNERSHIP_ROOF_COLORS.ai.slice(1));
      assert.equal(shader.uniforms.cityOwnerRoofActive.value, 1);
      assert.equal(node.material.customProgramCacheKey(), enemyNode.material.customProgramCacheKey(), 'uniform values share one GPU program');
      assert(shader.fragmentShader.indexOf('roofStrength') < shader.fragmentShader.indexOf('aomap_fragment'), 'AO still shades the painted roof');
    });
    assert(selected.length >= 1 && unchanged.length >= 1, 'roof affects solid primitive, not glass/plants');
    roofs.set(human, 'ai');
    humanShaders.forEach(shader => assert.equal(shader.uniforms.cityOwnerRoofColor.value.getHexString(), OWNERSHIP_ROOF_COLORS.ai.slice(1), 'owner transfer updates existing uniforms'));
    roofs.set(human, null); humanShaders.forEach(shader => assert.equal(shader.uniforms.cityOwnerRoofActive.value, 0, 'neutral owner restores exact source colors'));
    roofs.set(human, 'human');
    let disposals = 0; selected.forEach(node => node.material.addEventListener('dispose', () => { disposals++; }));
    roofs.release(human); assert.equal(disposals, selected.length, 'upgrade/disposal frees only private roof materials');
    selected.forEach(node => assert.equal(node.material, materialsBefore.get(node.name)));
    roofs.release(human); assert.equal(disposals, selected.length, 'release is idempotent');
    assert.equal(originalDispose.size, 0, 'shared source materials never disposed by owner change');
    tested++;
  }
  for (const source of gltf.scene.children.filter(root => !FAMILY.test(root.name))) assert.equal(roofs.set(source, 'human'), null, 'public buildings never get private roof colors');
  // Actual winter material rebinding must leave roof uniforms and white snow
  // independent. This covers the real merged Alpine solid/foliage contract.
  if (region === 'alpine') {
    const model = buildings[0].clone(true), world = new THREE.Group(), building = new THREE.Group(); building.userData.snowTarget = true; building.add(model); world.add(building);
    roofs.set(model, 'human'); const roofMaterials = [];
    model.traverse(node => { if (node.isMesh && node.material.userData.ownershipRoof) roofMaterials.push([node, node.material]); });
    const weather = createCityWeather({ THREE, world, boardBounds: { w: 10, d: 10 } });
    weather.setSeason('winter'); weather.setWeather('snow');
    for (let i = 0; i < 300; i++) weather.tick(1 / 30, { reduced: true });
    for (const [node, material] of roofMaterials) assert.equal(node.material, material, 'seasonal system preserves ownership roof binding');
    const snow = model.getObjectByName('roof_snow_cap');
    assert(snow, 'actual winter cap exists'); assert.equal(snow.material.color.getHexString(), 'f2f7fc', 'snow itself remains white');
    const ownedCap = snow.geometry, ownedData = ownedCap.userData.roofSnow;
    assert.equal(ownedData.ownedRoof, true); assert(ownedData.exposedEdgeSamples > 0, 'owned winter roof exposes its painted eaves');
    const roofBefore = roofMaterials[0][1]; roofs.set(model, null); weather.refresh();
    for (let i = 0; i < 150; i++) weather.tick(0, { reduced: true });
    const neutralCap = model.getObjectByName('roof_snow_cap').geometry;
    assert.equal(neutralCap.userData.roofSnow.ownedRoof, false);
    assert(neutralCap.index.count > ownedCap.index.count, 'neutral roof restores full snow without stale owner band');
    assert.equal(roofMaterials[0][0].material, roofBefore, 'snow regeneration does not replace private owner material');
    roofs.set(model, 'ai'); weather.refresh();
    for (let i = 0; i < 150; i++) weather.tick(0, { reduced: true });
    assert.equal(model.getObjectByName('roof_snow_cap').geometry, ownedCap, 'human/enemy share the bounded owned-cap geometry');
    weather.dispose(); roofs.release(model);
  }
  roofs.clear(); assert.equal(originalDispose.size, 0);
  const resources = new Set(); gltf.scene.traverse(node => { if (node.isMesh) { resources.add(node.geometry); resources.add(node.material); for (const value of Object.values(node.material)) if (value?.isTexture) resources.add(value); } }); resources.forEach(resource => resource.dispose());
  console.log(`PASS ${region}: 21 actual roof masks, owner transfer, neutral restoration, shared resource isolation`);
}
assert.equal(tested, 105); assert(wallVertices > 10000);
// Existing shader extensions compose with the roof program rather than vanish.
{
  const source = new THREE.Group(); source.name = 'classic_villa_1';
  const geo = new THREE.BoxGeometry(1, 1, 1), rgb = new THREE.Color('#44556b'); geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: geo.attributes.position.count }, () => rgb.toArray()).flat(), 3));
  const material = new THREE.MeshStandardMaterial({ vertexColors: true }); material.name = 'classic_villa_1 / solid'; material.onBeforeCompile = shader => { shader.uniforms.priorHook = { value: 7 }; }; material.customProgramCacheKey = () => 'prior-hook';
  const mesh = new THREE.Mesh(geo, material); source.add(mesh); const roofs = createOwnershipRoofs({ THREE }); roofs.set(source, 'human');
  assert.equal(compile(mesh.material).uniforms.priorHook.value, 7); assert.equal(mesh.material.customProgramCacheKey(), 'prior-hook|ownership-roof-v1');
  roofs.clear(); geo.dispose(); material.dispose();
}
// Many disconnected dark window caps at one elevation must not masquerade as
// a large roof. The actual deck remains eligible even below those windows.
{
  const pieces = [], paint = geometry => {
    const c = new THREE.Color('#283f3c'); geometry.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: geometry.attributes.position.count }, () => c.toArray()).flat(), 3)); return geometry;
  };
  const deck = paint(new THREE.BoxGeometry(1, .045, 1)); deck.translate(0, .5, 0); pieces.push(deck);
  for (let i = 0; i < 20; i++) { const window = paint(new THREE.BoxGeometry(.3, .6, .04)); window.translate((i - 10) * .4, 5, 0); pieces.push(window); }
  const geometry = mergeGeometries(pieces), material = new THREE.MeshStandardMaterial({ vertexColors: true }); material.name = 'expansion_villa_1 / solid';
  const model = new THREE.Group(); model.name = 'expansion_villa_1'; model.add(new THREE.Mesh(geometry, material));
  const roofs = createOwnershipRoofs({ THREE }); roofs.set(model, 'human');
  assert.equal(geometry.userData.ownershipRoofMask.flatDeckSurfaces, 1, 'disconnected reveal strips are never aggregated into roofs');
  const mask = geometry.attributes.cityRoofMask;
  for (let i = deck.attributes.position.count; i < mask.count; i++) assert.equal(mask.getX(i), 0, 'all high window caps keep original dark paint');
  roofs.clear(); geometry.dispose(); material.dispose(); pieces.forEach(piece => piece.dispose());
}
console.log(`PASS ${tested} residential and large-lot variants; ${masked} masked roof vertices; ${wallVertices} wall vertices preserved; shader/weather/disposal contracts`);

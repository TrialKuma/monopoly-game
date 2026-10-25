import * as THREE from './assets/vendor/three/three.module.min.js';
import { mergeGeometries } from './assets/vendor/three/addons/utils/BufferGeometryUtils.js';
import { makeStudioEnvironment } from './scene-environment.js?v=20261025-facade2';
import { loadSharedModelAsset, retainSharedModelAsset } from './scene-model-cache.js?v=20261025-harbor1';
import './town-plan.js?v=20261025-district1';
import { buildTownSurroundings } from './town-scenery.js?v=20261025-district1';
import { buildTownProjects } from './town-projects.js?v=20261025-district1';
import { createLevelThreeTracker, createBuildingFireworks, buildingRoofAnchor } from './scene-fireworks.js?v=20261025-celebrate1';

// This scene only displays the town ledger. Placement, costs and overlap checks
// are committed by progression.js; a green preview is never an inventory grant.
export function createTownScene(host, { onPick = () => {}, onStatus = () => {}, onExpansion = () => {} } = {}) {
  const CELL = 1.45, BASE_SIZE = 6, OVERVIEW_SIZE = 10, owned = new Set(), sources = new Map(), familyScale = new Map();
  const TownPlan = globalThis.TownPlan;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#afcfd0');
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  const releaseLease = retainSharedModelAsset('regions/harbor.glb');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '我的城镇，点击地块建造，拖动转动视角');
  renderer.domElement.tabIndex = 0; host.appendChild(renderer.domElement);
  const environment = makeStudioEnvironment(renderer); scene.environment = environment.texture; scene.environmentIntensity = .45;
  scene.add(new THREE.HemisphereLight('#ecf7ff', '#7a7762', 2.2));
  const sun = new THREE.DirectionalLight('#ffefce', 3.1); sun.position.set(-9, 16, 9); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .025; scene.add(sun);
  const terrain = new THREE.Group(), buildings = new THREE.Group(), highlights = new THREE.Group(), expansionEffects = new THREE.Group(), publicScenery = new THREE.Group(), districtPreview = new THREE.Group(); scene.add(terrain, buildings, highlights, expansionEffects, publicScenery, districtPreview);
  const raycaster = new THREE.Raycaster(), pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.12), pointer = new THREE.Vector2();
  let state = null, size = 6, yaw = Math.PI / 4, zoom = 1.2, frame = 0, disposed = false, width = 1, height = 1, loading = false;
  let objects = [], terrainLand = null, modelError = false, lastStamp = '', pointerDown = null, distance = 0;
  let land = TownPlan.getLand({size:6,landStage:0}), visualWidth = BASE_SIZE, visualHeight = BASE_SIZE, expansion = null, landforms = [], surroundings = null, coastMorphs = [], grid = null, newCells = [], revealMaterial = null;
  let projects = [], projectStamp = '';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const levelThreeTracker = createLevelThreeTracker(), pendingCelebrations = new Map();
  const buildingFireworks = createBuildingFireworks({ THREE, parent: scene, reducedMotion: () => reduceMotion.matches, requestRender });
  const pointers = new Map(), materialCache = new Map();
  function own(value) { owned.add(value); return value; }
  function clearOwnedGroup(group, disposeMaterials = false) {
    group.traverse(node => {
      if (node.geometry && owned.delete(node.geometry)) node.geometry.dispose();
      if (node.isInstancedMesh && owned.delete(node)) node.dispose();
      if (disposeMaterials) for (const mat of Array.isArray(node.material) ? node.material : [node.material]) if (mat && owned.delete(mat)) mat.dispose();
    });
    group.clear();
  }
  function material(color, extra = {}) { const key = color + JSON.stringify(extra); if (!materialCache.has(key)) materialCache.set(key, own(new THREE.MeshStandardMaterial({ color, roughness: .85, ...extra }))); return materialCache.get(key); }
  function box(parent, w, h, d, color, x = 0, y = 0, z = 0) {
    const item = new THREE.Mesh(own(new THREE.BoxGeometry(w, h, d)), material(color)); item.position.set(x, y, z); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  }
  function ellipsoid(parent, rx, ry, rz, color, x, y, z, detail = 1) {
    const item = new THREE.Mesh(own(new THREE.IcosahedronGeometry(1, detail)), material(color)); item.position.set(x, y, z); item.scale.set(rx, ry, rz); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  }
  function rounded(parent, w, h, d, r, color, x = 0, y = 0, z = 0) {
    const s = new THREE.Shape(), a = -w / 2, b = -d / 2;
    s.moveTo(a + r, b); s.lineTo(a + w - r, b); s.quadraticCurveTo(a + w, b, a + w, b + r); s.lineTo(a + w, b + d - r); s.quadraticCurveTo(a + w, b + d, a + w - r, b + d); s.lineTo(a + r, b + d); s.quadraticCurveTo(a, b + d, a, b + d - r); s.lineTo(a, b + r); s.quadraticCurveTo(a, b, a + r, b);
    const geo = own(new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 5 })); geo.rotateX(-Math.PI / 2);
    const object = new THREE.Mesh(geo, material(color)); object.position.set(x, y, z); object.receiveShadow = true; object.castShadow = true; parent.add(object); return object;
  }
  function tree(parent, x, z, k = 1) {
    box(parent, .11 * k, .46 * k, .11 * k, '#88745b', x, .3 + .23 * k, z);
    ellipsoid(parent, .35 * k, .48 * k, .34 * k, '#508d79', x, .6 + .42 * k, z);
    ellipsoid(parent, .27 * k, .32 * k, .28 * k, '#7aa075', x - .16 * k, .67 + .44 * k, z + .11 * k);
  }
  function batchTerrain(group = terrain) {
    // Land tiles and small quay details share a few materials. Bake their
    // transforms once rather than issuing a draw for every board square.
    group.updateWorldMatrix(true, true); const batches = new Map(), inverse = group.matrixWorld.clone().invert();
    group.traverse(node => {
      if (!node.isMesh || Array.isArray(node.material)) return;
      const key = `${node.material.uuid}:${Number(node.castShadow)}:${Number(node.receiveShadow)}`;
      if (!batches.has(key)) batches.set(key, { material: node.material, castShadow: node.castShadow, receiveShadow: node.receiveShadow, geometries: [] });
      const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(node.matrixWorld)); batches.get(key).geometries.push(geometry);
    });
    clearOwnedGroup(group);
    for (const batch of batches.values()) {
      const merged = mergeGeometries(batch.geometries, false);
      if (merged) { const mesh = new THREE.Mesh(own(merged), batch.material); mesh.castShadow = batch.castShadow; mesh.receiveShadow = batch.receiveShadow; group.add(mesh); batch.geometries.forEach(geometry => geometry.dispose()); }
      else for (const geometry of batch.geometries) { const mesh = new THREE.Mesh(own(geometry), batch.material); mesh.castShadow = batch.castShadow; mesh.receiveShadow = batch.receiveShadow; group.add(mesh); }
    }
  }
  function buildTerrain(fromLand = land) {
    // The existing town and camera stay fixed. New rows extend the shoreline
    // outwards instead of shrinking the whole scene to keep it inside a frame.
    clearOwnedGroup(terrain); clearOwnedGroup(expansionEffects, true);
    landforms = []; coastMorphs = []; newCells = []; revealMaterial = null;
    const nx = land.width * CELL, nz = land.height * CELL;
    for (const [mx, mz, h, r, color, y] of [
      [4.1, 3.3, .44, 1.65, '#8faaa1', -.62], [3.25, 2.55, .31, 1.1, '#d8cba9', -.35],
      [2.7, 2.1, .18, .7, '#a4ba8a', -.08], [.43, .43, .05, .17, '#d6cfbb', .11],
    ]) landforms.push({ mesh: rounded(terrain, nx + mx, h, nz + mz, r, color, 0, y, 0), mx, mz });
    grid = new THREE.Group(); terrain.add(grid);
    for (let y = 0; y < land.height; y++) for (let x = 0; x < land.width; x++) {
      const pos = coordinates(x, y), fresh = x >= fromLand.width || y >= fromLand.height;
      const tile = rounded(fresh ? terrain : grid, CELL - .14, .025, CELL - .14, .08, (x + y) % 2 ? '#b8c895' : '#b2c28e', pos.x, .15, pos.z);
      if (fresh) {
        revealMaterial ||= own(new THREE.MeshBasicMaterial({ color: '#f2ce77', transparent: true, opacity: .5, depthWrite: false }));
        const glow = new THREE.Mesh(own(new THREE.PlaneGeometry(CELL - .17, CELL - .17)), revealMaterial);
        glow.rotation.x = -Math.PI / 2; glow.position.set(pos.x, .19, pos.z); expansionEffects.add(glow);
        newCells.push({ tile, glow, delay: (Math.max(0, x - fromLand.width + 1) + Math.max(0, y - fromLand.height + 1) + Math.min(x, y) * .09) * .075 });
      }
    }
    batchTerrain(grid);
    surroundings = new THREE.Group(); terrain.add(surroundings);
    buildTownSurroundings({ THREE, parent: surroundings, width: land.width, height: land.height, publicProjects: true, CELL, box, rounded, ellipsoid, tree, material, own });
    batchTerrain(surroundings);
    const centerX = (land.width - BASE_SIZE) * CELL / 2, centerZ = (land.height - BASE_SIZE) * CELL / 2;
    for (const mesh of surroundings.children) mesh.geometry.translate(centerX, 0, centerZ);
    if (fromLand.width < land.width || fromLand.height < land.height) {
      // Match the authored coast at both sizes. Each prop translates as a rigid
      // object; no tree, boat or lighthouse is scaled down at the start.
      const previous = new THREE.Group();
      buildTownSurroundings({ THREE, parent: previous, width: fromLand.width, height: fromLand.height, publicProjects: true, CELL, box, rounded, ellipsoid, tree, material, own });
      batchTerrain(previous);
      const oldCenterX = (fromLand.width - BASE_SIZE) * CELL / 2, oldCenterZ = (fromLand.height - BASE_SIZE) * CELL / 2;
      const batchKey = mesh => `${mesh.material.uuid}:${Number(mesh.castShadow)}:${Number(mesh.receiveShadow)}`;
      const oldBatches = new Map(previous.children.map(mesh => [batchKey(mesh), mesh]));
      for (const mesh of surroundings.children) {
        const before = oldBatches.get(batchKey(mesh)); if (!before) continue;
        const from = before.geometry.getAttribute('position').array.slice(), to = mesh.geometry.getAttribute('position').array.slice();
        if (from.length !== to.length) continue;
        for (let i = 0; i < from.length; i += 3) { from[i] += oldCenterX; from[i + 2] += oldCenterZ; }
        coastMorphs.push({ mesh, from, to }); mesh.frustumCulled = false;
      }
      clearOwnedGroup(previous);
    }
    const water = new THREE.Mesh(own(new THREE.PlaneGeometry(180, 180)), material('#7fb9bd', { roughness: .33, metalness: .08 }));
    water.rotation.x = -Math.PI / 2; water.position.y = -.42; water.receiveShadow = true; terrain.add(water);
    terrainLand = land; updateLandform();
  }
  function updateLandform() {
    const nx = visualWidth * CELL, nz = visualHeight * CELL, targetX = land.width * CELL, targetZ = land.height * CELL;
    for (const { mesh, mx, mz } of landforms) { mesh.scale.set((nx + mx) / (targetX + mx), 1, (nz + mz) / (targetZ + mz)); mesh.position.x = (visualWidth - BASE_SIZE) * CELL / 2; mesh.position.z = (visualHeight - BASE_SIZE) * CELL / 2; }
    for (const morph of coastMorphs) {
      const progress = expansion ? ease(expansion.progress / .88) : 1;
      const position = morph.mesh.geometry.getAttribute('position');
      for (let i = 0; i < position.array.length; i++) position.array[i] = morph.from[i] + (morph.to[i] - morph.from[i]) * progress;
      position.needsUpdate = true;
    }
  }
  function renderProjects() {
    const stamp = JSON.stringify(state?.profile.projectLevels || {}); if (stamp === projectStamp && projects.length) return;
    projectStamp = stamp; clearOwnedGroup(publicScenery);
    projects = buildTownProjects({ THREE, parent: publicScenery, levels: state?.profile.projectLevels, box, rounded, ellipsoid, tree, material, own });
    for (const project of projects) {
      batchTerrain(project.group);
      const target = new THREE.Mesh(own(new THREE.PlaneGeometry(2.8, project.id === 'waterfront' ? 3.7 : 2.8)), material('#ffffff', { colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
      target.rotation.x = -Math.PI / 2; target.position.y = .16; project.group.add(target);
    }
  }
  function renderDistrictPreview() {
    clearOwnedGroup(districtPreview, true);
    const next = state?.nextDistrict; if (!next || expansion || next.stage !== land.stage + 1) return;
    const pos = coordinates(next.x, next.y, next.w, next.h);
    const base = new THREE.BoxGeometry(next.w * CELL - .06, .06, next.h * CELL - .06);
    const edge = new THREE.LineSegments(own(new THREE.EdgesGeometry(base)), own(new THREE.LineBasicMaterial({ color: '#f3cc79', transparent: true, opacity: .95, depthTest: false })));
    base.dispose(); edge.position.set(pos.x,.2,pos.z);edge.renderOrder=4;districtPreview.add(edge);
    const surface = new THREE.Mesh(own(new THREE.PlaneGeometry(next.w * CELL - .06, next.h * CELL - .06)),own(new THREE.MeshBasicMaterial({color:'#ead19a',transparent:true,opacity:.19,depthWrite:false,side:THREE.DoubleSide})));
    surface.rotation.x=-Math.PI/2;surface.position.set(pos.x,.19,pos.z);surface.userData.districtId=next.id;districtPreview.add(surface);
  }
  function coordinates(x, y, w = 1, h = 1) { return { x: (x + w / 2 - BASE_SIZE / 2) * CELL, z: (y + h / 2 - BASE_SIZE / 2) * CELL }; }
  function footprint(card, rotation) { return rotation % 2 ? [card.footprint[1], card.footprint[0]] : card.footprint; }
  function sourceClone(card, star, ghost = false) {
    const source = sources.get(`${card.region}_${card.family}_${star}`); if (!source) return null;
    const object = source.clone(true); object.position.set(0, 0, 0);
    const bounds = new THREE.Box3().setFromObject(object), center = bounds.getCenter(new THREE.Vector3());
    const scale = familyScale.get(card.family) || 1.15; object.scale.multiplyScalar(scale);
    object.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    object.traverse(node => { if (!node.isMesh) return; node.castShadow = !ghost; node.receiveShadow = true; if (ghost) { const convert = m => { const mat = own(m.clone()); mat.transparent = true; mat.opacity = .61; mat.depthWrite = false; return mat; }; node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material); } });
    return object;
  }
  function clearBuildings() { clearOwnedGroup(buildings); objects = []; }
  function batchBuildings() {
    // The published GLBs already group each building into a few materials.
    // Repeated houses can share those same GPU surfaces as instances. Logical
    // holders remain separate for exact building selection and saved positions.
    buildings.updateMatrixWorld(true); const batches = new Map();
    for (const holder of objects) holder.traverse(node => {
      if (!node.isMesh) return;
      const ids = (Array.isArray(node.material) ? node.material : [node.material]).map(mat => mat.uuid).join(',');
      const key = `${node.geometry.uuid}:${ids}:${Number(node.castShadow)}:${Number(node.receiveShadow)}`;
      if (!batches.has(key)) batches.set(key, { geometry: node.geometry, material: node.material, castShadow: node.castShadow, receiveShadow: node.receiveShadow, matrices: [] });
      batches.get(key).matrices.push(node.matrixWorld.clone());
    });
    buildings.clear();
    for (const batch of batches.values()) {
      const mesh = own(new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length));
      batch.matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix)); mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = batch.castShadow; mesh.receiveShadow = batch.receiveShadow; mesh.computeBoundingSphere(); buildings.add(mesh);
    }
  }
  function renderBuildings() {
    clearBuildings(); if (!state) return;
    for (const item of state.profile.town.buildings.filter(item => !item.stored)) {
      const card = state.catalog.find(card => card.id === item.cardId); if (!card) continue;
      const star = state.profile.town.cards[item.cardId]?.star || 1, [w, h] = footprint(card, item.rotation), pos = coordinates(item.x, item.y, w, h);
      const holder = new THREE.Group(); holder.position.set(pos.x, .19, pos.z); holder.rotation.y = item.rotation * Math.PI / 2; holder.userData.buildingId = item.id;
      const model = sourceClone(card, star); if (model) holder.add(model);
      // A labelled paving plinth is the loading state, never a fake substitute building.
      else rounded(holder, card.footprint[0] * CELL - .25, .06, card.footprint[1] * CELL - .25, .08, '#e2d4b7', 0, .01, 0);
      buildings.add(holder); objects.push(holder);
    }
    batchBuildings();
    flushBuildingCelebrations();
    renderHighlights(); requestRender();
  }
  function flushBuildingCelebrations() {
    for (const [cardId, pending] of pendingCelebrations) {
      const item = state.profile.town.buildings.find(item => item.cardId === cardId && !item.stored);
      const card = state.catalog.find(card => card.id === cardId), holder = objects.find(object => object.userData.buildingId === item?.id);
      if (!item || !card || state.profile.town.cards[cardId]?.star !== 3 || performance.now() > pending.expires) { pendingCelebrations.delete(cardId); continue; }
      if (!holder || !sources.has(`${card.region}_${card.family}_3`)) continue;
      buildingFireworks.launch({ key: cardId, anchor: buildingRoofAnchor(THREE, holder) }); pendingCelebrations.delete(cardId);
    }
  }
  function renderHighlights() {
    clearOwnedGroup(highlights, true); if (!state) return;
    let item = state.preview || state.profile.town.buildings.find(item => item.id === state.selection && !item.stored); if (!item) return;
    const card = state.catalog.find(card => card.id === item.cardId); if (!card) return;
    const [w, h] = footprint(card, item.rotation), pos = coordinates(item.x, item.y, w, h), color = state.preview?.valid === false ? '#d0745f' : '#e8bc59';
    const base = new THREE.BoxGeometry(w * CELL - .08, .07, h * CELL - .08), edges = own(new THREE.EdgesGeometry(base)); base.dispose();
    const outline = new THREE.LineSegments(edges, own(new THREE.LineBasicMaterial({ color, depthTest: false }))); outline.position.set(pos.x, .24, pos.z); outline.renderOrder = 20; highlights.add(outline);
    if (state.preview) { const ghost = sourceClone(card, state.profile.town.cards[card.id]?.star || 1, true); if (ghost) { const holder = new THREE.Group(); holder.position.set(pos.x, .21, pos.z); holder.rotation.y = item.rotation * Math.PI / 2; holder.add(ghost); highlights.add(holder); } }
  }
  function setCamera() {
    // Reserve space for the full island from the outset. Expansion never
    // changes the lens, target or zoom, including its final frame.
    const aspect = width / height, horizontal = Math.max((OVERVIEW_SIZE * CELL + 4.3) * 1.4, (OVERVIEW_SIZE * CELL + 4.3) * 1.15 * aspect) / zoom;
    camera.left = -horizontal / 2; camera.right = horizontal / 2; camera.top = horizontal / aspect / 2; camera.bottom = -horizontal / aspect / 2;
    const center = (OVERVIEW_SIZE - BASE_SIZE) * CELL / 2;
    camera.position.set(center + Math.sin(yaw) * 20, 20, center + Math.cos(yaw) * 20); camera.lookAt(center, .35, center); camera.updateProjectionMatrix();
  }
  const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  function animateExpansion(time) {
    if (!expansion) return;
    const progress = Math.min(1, Math.max(0, (time - expansion.start) / expansion.duration)); expansion.progress = progress;
    const landProgress = ease(progress / .88);
    visualWidth = expansion.fromWidth + (land.width - expansion.fromWidth) * landProgress;
    visualHeight = expansion.fromHeight + (land.height - expansion.fromHeight) * landProgress;
    updateLandform();
    for (const cell of newCells) {
      const t = ease((progress - .08 - cell.delay) / .48);
      cell.tile.visible = cell.glow.visible = t > 0;
      cell.tile.scale.set(.2 + .8 * t, 1, .2 + .8 * t); cell.tile.position.y = .15 - .65 * (1 - t);
      cell.glow.scale.set(.2 + .8 * t, .2 + .8 * t, 1); cell.glow.position.y = cell.tile.position.y + .04;
    }
    if (revealMaterial) revealMaterial.opacity = .52 * (1 - ease((progress - .65) / .35));
    if (progress >= 1) finishExpansion();
  }
  function finishExpansion() {
    if (!expansion) return;
    const completed = expansion; expansion = null; visualWidth = land.width; visualHeight = land.height;
    for (const { tile } of newCells) { tile.visible = true; tile.position.y = .15; tile.scale.set(1, 1, 1); grid.add(tile); }
    newCells = []; clearOwnedGroup(expansionEffects, true); revealMaterial = null; batchTerrain(grid); updateLandform(); setCamera();
    for (const morph of coastMorphs) { morph.mesh.geometry.computeBoundingSphere(); morph.mesh.frustumCulled = true; }
    coastMorphs = [];
    renderDistrictPreview();
    onExpansion({ ...completed, active: false, progress: 1 });
  }
  function requestRender() {
    if (!frame && !disposed) frame = requestAnimationFrame(time => {
      frame = 0; animateExpansion(time); buildingFireworks.tick(time); renderer.render(scene, camera); if (expansion || buildingFireworks.active) requestRender();
    });
  }
  function resize() { if (disposed) return; const r = host.getBoundingClientRect(); width = Math.max(1, r.width); height = Math.max(1, r.height); renderer.setSize(width, height, false); setCamera(); requestRender(); }
  const observer = new ResizeObserver(resize); observer.observe(host);
  async function loadModels() {
    if (loading || sources.size || disposed) return; loading = true; modelError = false; onStatus('loading');
    try {
      const gltf = await loadSharedModelAsset('regions/harbor.glb', { version: '20261025-facade2' }); if (disposed) return;
      gltf.scene.traverse(node => { if (/^harbor_(villa|shop|hotel|tower|finance|skyscraper|onsen)_[123]$/.test(node.name)) sources.set(node.name, node); });
      for (const card of state?.catalog || []) {
        let maxX = 0, maxZ = 0; for (let star = 1; star <= 3; star++) { const source = sources.get(`harbor_${card.family}_${star}`); if (!source) continue; const bounds = new THREE.Box3().setFromObject(source), dims = bounds.getSize(new THREE.Vector3()); maxX = Math.max(maxX, dims.x); maxZ = Math.max(maxZ, dims.z); }
        familyScale.set(card.family, Math.min((card.footprint[0] * CELL - .3) / Math.max(maxX, .1), (card.footprint[1] * CELL - .3) / Math.max(maxZ, .1)));
      }
      renderBuildings(); onStatus('ready');
    } catch (error) { if (!disposed) { modelError = true; onStatus('error'); } }
    finally { loading = false; }
  }
  function update(next) {
    const reached = levelThreeTracker.observe('town', Object.entries(next.profile.town.cards).map(([id, card]) => ({ id, level: card.star, owner: card.unlocked })));
    for (const card of reached.slice(0, 2)) pendingCelebrations.set(card.id, { expires: performance.now() + 5000 });
    const previousLand = terrainLand, nextLand = TownPlan.getLand(next.profile.town);
    if (terrainLand?.stage !== nextLand.stage) {
      if (expansion) finishExpansion();
      state = next; land = nextLand; size = land.size;
      const animated = previousLand && land.stage > previousLand.stage && !reduceMotion.matches;
      visualWidth = animated ? previousLand.width : land.width; visualHeight = animated ? previousLand.height : land.height;
      buildTerrain(animated ? previousLand : land);
      if (animated) {
        const district = land.districts.find(district => district.stage === land.stage) || previousLand.next;
        expansion = { fromSize: previousLand.size, toSize: size, fromWidth: previousLand.width, fromHeight: previousLand.height, width: land.width, height: land.height,
          district: district?.id, name: district?.name, newCellCount: land.cells.length - previousLand.cells.length, progress: 0, start: performance.now(), duration: 1650 };
        animateExpansion(expansion.start); pointers.clear(); pointerDown = null;
        onExpansion({ ...expansion, active: true });
      }
      resize();
    } else { state = next; land = nextLand; }
    renderProjects(); renderDistrictPreview();
    const stamp = JSON.stringify([land.stage, state.profile.town.buildings, state.profile.town.cards]);
    if (stamp !== lastStamp) { lastStamp = stamp; renderBuildings(); } else renderHighlights();
    if (state.profile.town.buildings.some(item => !item.stored) || state.preview) loadModels();
    requestRender();
  }
  function pick(clientX, clientY) {
    if (expansion) return;
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2); raycaster.setFromCamera(pointer, camera);
    if (!state?.preview) {
      const hit = raycaster.intersectObjects([...publicScenery.children, ...districtPreview.children], true)[0];
      if (hit) { let object = hit.object; while (object && !object.userData.projectId && !object.userData.districtId) object = object.parent;
        if (object?.userData.projectId) { onPick({ projectId: object.userData.projectId }); return; }
        if (object?.userData.districtId) { onPick({ districtId: object.userData.districtId }); return; }
      }
    }
    if (!state?.preview) { const hit = raycaster.intersectObjects(objects, true)[0]; if (hit) { let object = hit.object; while (object && !object.userData.buildingId) object = object.parent; if (object?.userData.buildingId) { onPick({ buildingId: object.userData.buildingId }); return; } } }
    const point = raycaster.ray.intersectPlane(pickPlane, new THREE.Vector3()); if (!point) return;
    const x = Math.floor(point.x / CELL + BASE_SIZE / 2), y = Math.floor(point.z / CELL + BASE_SIZE / 2);
    if (TownPlan.isCellOpen(state.profile.town, x, y)) onPick({ x, y });
  }
  function pointerStart(event) { if (expansion || event.button && event.button !== 0) return; renderer.domElement.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.size === 1) pointerDown = { x: event.clientX, y: event.clientY, travel: 0 }; if (pointers.size === 2) { const values = [...pointers.values()]; distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y); if (pointerDown) pointerDown.travel = 100; } }
  function pointerMove(event) { const previous = pointers.get(event.pointerId); if (!previous) return; const dx = event.clientX - previous.x, dy = event.clientY - previous.y; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointerDown) pointerDown.travel += Math.abs(dx) + Math.abs(dy); if (pointers.size === 2) { const values = [...pointers.values()], next = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y); if (distance) zoom = Math.max(.7, Math.min(2.2, zoom * next / distance)); distance = next; } else if (pointerDown?.travel > 5) yaw -= dx * .008; setCamera(); requestRender(); }
  function pointerEnd(event) { const isTap = pointerDown && pointerDown.travel < 7 && pointers.size === 1; pointers.delete(event.pointerId); if (isTap) pick(event.clientX, event.clientY); if (!pointers.size) pointerDown = null; }
  function pointerCancel(event) { pointers.delete(event.pointerId); pointerDown = null; }
  function wheel(event) { event.preventDefault(); if (expansion) return; zoom = Math.max(.7, Math.min(2.2, zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08))); setCamera(); requestRender(); }
  const canvas = renderer.domElement; canvas.addEventListener('pointerdown', pointerStart); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerEnd); canvas.addEventListener('pointercancel', pointerCancel); canvas.addEventListener('wheel', wheel, { passive: false });
  resize();
  return { update, retry: loadModels, zoomBy(factor) { if (expansion) return; zoom = Math.max(.7, Math.min(2.2, zoom * factor)); setCamera(); requestRender(); }, home() { if (expansion) return; zoom = 1; yaw = Math.PI / 4; setCamera(); requestRender(); }, getState: () => {
      const rect = canvas.getBoundingClientRect(); camera.updateMatrixWorld();
      const lo = -BASE_SIZE * CELL / 2, hiX = lo + visualWidth * CELL, hiZ = lo + visualHeight * CELL;
      const corners = [[lo, lo], [lo, hiZ], [hiX, hiZ], [hiX, lo]].map(([x, z]) => {
        const point = new THREE.Vector3(x, .16, z).project(camera); return { x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
      });
      const left = Math.min(...corners.map(point => point.x)), right = Math.max(...corners.map(point => point.x)), top = Math.min(...corners.map(point => point.y)), bottom = Math.max(...corners.map(point => point.y));
      return { ready: sources.size > 0, modelError, size, visualSize: Math.max(visualWidth, visualHeight), visualWidth, visualHeight,
        land: { stage: land.stage, width: land.width, height: land.height, cellCount: land.cells.length, next: land.next,
          districts: land.districts.map(district => { const pos=coordinates(district.x,district.y,district.w,district.h),point=new THREE.Vector3(pos.x,.2,pos.z).project(camera);return {id:district.id,name:district.name,stage:district.stage,open:district.stage<=land.stage,x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2}; }) },
        projects: projects.map(project => { const point = new THREE.Vector3(project.x,.35,project.z).project(camera); return { id: project.id, level: project.level, worldX: project.x, worldZ: project.z, x: rect.left+(point.x+1)*rect.width/2, y: rect.top+(1-point.y)*rect.height/2 }; }),
        celebration: buildingFireworks.getState(), cameraSpan: camera.right - camera.left, buildingScalePixels: rect.width / (camera.right - camera.left),
        landScreenBounds: { left, right, top, bottom, width: right - left, height: bottom - top },
        expansion: expansion ? { ...expansion, active: true } : { active: false, progress: 1, fromSize: size, toSize: size, newCellCount: 0 },
        buildings: objects.length, renderCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometryCount: renderer.info.memory.geometries, buildingCenters: objects.map(object => {
        const point = object.getWorldPosition(new THREE.Vector3()), worldX = point.x, worldZ = point.z; point.y += .45; point.project(camera);
        return { id: object.userData.buildingId, worldX, worldZ, x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
      }) };
    },
    dispose() { if (disposed) return; disposed = true; observer.disconnect(); if (frame) cancelAnimationFrame(frame); buildingFireworks.dispose(); levelThreeTracker.reset(); pendingCelebrations.clear(); canvas.removeEventListener('pointerdown', pointerStart); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerEnd); canvas.removeEventListener('pointercancel', pointerCancel); canvas.removeEventListener('wheel', wheel); scene.clear(); owned.forEach(resource => resource.dispose?.()); environment.dispose(); sun.shadow.map?.dispose(); renderer.dispose(); canvas.remove(); releaseLease(); }
  };
}

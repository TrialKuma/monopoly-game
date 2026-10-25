import * as THREE from './assets/vendor/three/three.module.min.js';
import { mergeGeometries } from './assets/vendor/three/addons/utils/BufferGeometryUtils.js';
import { makeStudioEnvironment } from './scene-environment.js?v=20261025-facade2';
import { loadSharedModelAsset, retainSharedModelAsset } from './scene-model-cache.js?v=20261025-harbor1';

// This scene only displays the town ledger. Placement, costs and overlap checks
// are committed by progression.js; a green preview is never an inventory grant.
export function createTownScene(host, { onPick = () => {}, onStatus = () => {} } = {}) {
  const CELL = 1.45, owned = new Set(), sources = new Map(), familyScale = new Map();
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#afcfd0');
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, .1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  const releaseLease = retainSharedModelAsset('regions/harbor.glb');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.13;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-label', '我的城镇，点击地块建造，拖动转动视角');
  renderer.domElement.tabIndex = 0; host.appendChild(renderer.domElement);
  const environment = makeStudioEnvironment(renderer); scene.environment = environment.texture; scene.environmentIntensity = .45;
  scene.add(new THREE.HemisphereLight('#ecf7ff', '#7a7762', 2.2));
  const sun = new THREE.DirectionalLight('#ffefce', 3.1); sun.position.set(-9, 16, 9); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .025; scene.add(sun);
  const terrain = new THREE.Group(), buildings = new THREE.Group(), highlights = new THREE.Group(); scene.add(terrain, buildings, highlights);
  const raycaster = new THREE.Raycaster(), pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.12), pointer = new THREE.Vector2();
  let state = null, size = 6, yaw = Math.PI / 4, zoom = 1, frame = 0, disposed = false, width = 1, height = 1, loading = false;
  let objects = [], terrainSize = 0, modelError = false, lastStamp = '', pointerDown = null, distance = 0;
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
  function batchTerrain() {
    // Land tiles and small quay details share a few materials. Bake their
    // transforms once rather than issuing a draw for every board square.
    terrain.updateMatrixWorld(true); const batches = new Map();
    terrain.traverse(node => {
      if (!node.isMesh || Array.isArray(node.material)) return;
      const key = `${node.material.uuid}:${Number(node.castShadow)}:${Number(node.receiveShadow)}`;
      if (!batches.has(key)) batches.set(key, { material: node.material, castShadow: node.castShadow, receiveShadow: node.receiveShadow, geometries: [] });
      const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
      geometry.applyMatrix4(node.matrixWorld); batches.get(key).geometries.push(geometry);
    });
    clearOwnedGroup(terrain);
    for (const batch of batches.values()) {
      const merged = mergeGeometries(batch.geometries, false);
      if (merged) { const mesh = new THREE.Mesh(own(merged), batch.material); mesh.castShadow = batch.castShadow; mesh.receiveShadow = batch.receiveShadow; terrain.add(mesh); batch.geometries.forEach(geometry => geometry.dispose()); }
      else for (const geometry of batch.geometries) { const mesh = new THREE.Mesh(own(geometry), batch.material); mesh.castShadow = batch.castShadow; mesh.receiveShadow = batch.receiveShadow; terrain.add(mesh); }
    }
  }
  function buildTerrain() {
    // The entire legal rectangle stays buildable. Quays, gardens and terrain
    // detail live outside it, so scenery cannot obscure a placement target.
    clearOwnedGroup(terrain); const n = size * CELL, edge = n / 2;
    rounded(terrain, n + 4.1, .44, n + 3.3, 1.65, '#8faaa1', .1, -.62, .2);
    rounded(terrain, n + 3.25, .31, n + 2.55, 1.1, '#d8cba9', 0, -.35, 0);
    rounded(terrain, n + 2.7, .18, n + 2.1, .7, '#a4ba8a', 0, -.08, 0);
    rounded(terrain, n + .43, .05, n + .43, .17, '#d6cfbb', 0, .11, 0);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const pos = coordinates(x, y); rounded(terrain, CELL - .14, .025, CELL - .14, .08, (x + y) % 2 ? '#b8c895' : '#b2c28e', pos.x, .15, pos.z);
    }
    rounded(terrain, n + 2.8, .10, .57, .08, '#e9dcc0', 0, .16, edge + .63);
    // Sea wall with inset stone courses and low lamps.
    box(terrain, n + 2.1, .35, .12, '#a9ada0', 0, -.03, edge + 1.06);
    for (let x = -edge - .7; x <= edge + .7; x += .65) box(terrain, .015, .23, .14, '#7e9a94', x, -.04, edge + 1.07);
    for (let x = -edge; x <= edge; x += 2.9) {
      box(terrain, .055, .48, .055, '#427778', x, .44, edge + .91); box(terrain, .15, .14, .15, '#f6df99', x, .75, edge + .91);
      box(terrain, .55, .08, .21, '#b28b64', x + .45, .33, edge + .65);
    }
    for (let i = 0; i < size + 1; i++) {
      const x = -edge + i * CELL; tree(terrain, x, -edge - .65, .68 + (i % 2) * .14);
      if (i < size) { ellipsoid(terrain, .33, .12, .2, '#7f9f70', x + .6, .24, -edge - .55); for (let j = 0; j < 3; j++) ellipsoid(terrain, .05, .07, .05, '#e9bc83', x + .4 + j * .14, .34, -edge - .57); }
    }
    for (let i = 0; i < 3; i++) { tree(terrain, -edge - .66, -edge + 1 + i * 2.4, .85); ellipsoid(terrain, .48, .17, .31, '#879a8e', edge + .77, .18, -edge + i * 2.8 + .6); }
    // A small arrival dock, layered offshore islets and shallow water shelf.
    box(terrain, 1.24, .12, 2.05, '#b28d67', -edge + .9, .05, edge + 1.68);
    for (let i = 0; i < 12; i++) box(terrain, 1.28, .025, .025, '#dbc098', -edge + .9, .12, edge + .73 + i * .17);
    for (const x of [-edge + .35, -edge + 1.45]) for (const z of [edge + .86, edge + 2.5]) { box(terrain, .1, .65, .1, '#957354', x, -.02, z); box(terrain, .16, .05, .16, '#eedbbb', x, .32, z); }
    const water = new THREE.Mesh(own(new THREE.PlaneGeometry(180, 180)), material('#7fb9bd', { roughness: .33, metalness: .08 })); water.rotation.x = -Math.PI / 2; water.position.y = -.42; water.receiveShadow = true; terrain.add(water);
    for (let i = 0; i < 3; i++) {
      const x = -edge - 3.6 - i * 2.7, z = -edge - 1.4 + i * 3.4;
      ellipsoid(terrain, 1.2, .25, .77, '#aad1c6', x, -.47, z);
      ellipsoid(terrain, .84, .28, .58, '#9ba99a', x, -.32, z);
      ellipsoid(terrain, .66, .2, .43, '#91a67b', x, -.13, z); tree(terrain, x + .1, z, .64);
    }
    for (let i = 0; i < 9; i++) { const wave = new THREE.Mesh(own(new THREE.PlaneGeometry(.8 + (i % 3) * .25, .025)), material('#b8d8d0', { transparent: true, opacity: .7 })); wave.rotation.x = -Math.PI / 2; wave.position.set(edge + 2.5 + (i % 3) * 1.4, -.4, -edge + Math.floor(i / 3) * 3); terrain.add(wave); }
    batchTerrain(); terrainSize = size;
  }
  function coordinates(x, y, w = 1, h = 1) { return { x: (x + w / 2 - size / 2) * CELL, z: (y + h / 2 - size / 2) * CELL }; }
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
    renderHighlights(); requestRender();
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
    const aspect = width / height, horizontal = Math.max((size * CELL + 3.7) * 1.25, (size * CELL + 3.7) * .95 * aspect) / zoom;
    camera.left = -horizontal / 2; camera.right = horizontal / 2; camera.top = horizontal / aspect / 2; camera.bottom = -horizontal / aspect / 2;
    camera.position.set(Math.sin(yaw) * 20, 20, Math.cos(yaw) * 20); camera.lookAt(0, .35, 0); camera.updateProjectionMatrix();
  }
  function requestRender() { if (!frame && !disposed) frame = requestAnimationFrame(() => { frame = 0; renderer.render(scene, camera); }); }
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
    state = next; size = state.profile.town.size;
    if (terrainSize !== size) { buildTerrain(); resize(); }
    const stamp = JSON.stringify([state.profile.town.buildings, state.profile.town.cards]);
    if (stamp !== lastStamp) { lastStamp = stamp; renderBuildings(); } else renderHighlights();
    if (state.profile.town.buildings.some(item => !item.stored) || state.preview) loadModels();
    requestRender();
  }
  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2); raycaster.setFromCamera(pointer, camera);
    if (!state?.preview) { const hit = raycaster.intersectObjects(objects, true)[0]; if (hit) { let object = hit.object; while (object && !object.userData.buildingId) object = object.parent; if (object?.userData.buildingId) { onPick({ buildingId: object.userData.buildingId }); return; } } }
    const point = raycaster.ray.intersectPlane(pickPlane, new THREE.Vector3()); if (!point) return;
    const x = Math.floor(point.x / CELL + size / 2), y = Math.floor(point.z / CELL + size / 2);
    if (x >= 0 && y >= 0 && x < size && y < size) onPick({ x, y });
  }
  function pointerStart(event) { if (event.button && event.button !== 0) return; renderer.domElement.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.size === 1) pointerDown = { x: event.clientX, y: event.clientY, travel: 0 }; if (pointers.size === 2) { const values = [...pointers.values()]; distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y); if (pointerDown) pointerDown.travel = 100; } }
  function pointerMove(event) { const previous = pointers.get(event.pointerId); if (!previous) return; const dx = event.clientX - previous.x, dy = event.clientY - previous.y; pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointerDown) pointerDown.travel += Math.abs(dx) + Math.abs(dy); if (pointers.size === 2) { const values = [...pointers.values()], next = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y); if (distance) zoom = Math.max(.7, Math.min(2.2, zoom * next / distance)); distance = next; } else if (pointerDown?.travel > 5) yaw -= dx * .008; setCamera(); requestRender(); }
  function pointerEnd(event) { const isTap = pointerDown && pointerDown.travel < 7 && pointers.size === 1; pointers.delete(event.pointerId); if (isTap) pick(event.clientX, event.clientY); if (!pointers.size) pointerDown = null; }
  function pointerCancel(event) { pointers.delete(event.pointerId); pointerDown = null; }
  function wheel(event) { event.preventDefault(); zoom = Math.max(.7, Math.min(2.2, zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08))); setCamera(); requestRender(); }
  const canvas = renderer.domElement; canvas.addEventListener('pointerdown', pointerStart); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerEnd); canvas.addEventListener('pointercancel', pointerCancel); canvas.addEventListener('wheel', wheel, { passive: false });
  resize();
  return { update, retry: loadModels, zoomBy(factor) { zoom = Math.max(.7, Math.min(2.2, zoom * factor)); setCamera(); requestRender(); }, home() { zoom = 1; yaw = Math.PI / 4; setCamera(); requestRender(); }, getState: () => {
      const rect = canvas.getBoundingClientRect(); camera.updateMatrixWorld();
      return { ready: sources.size > 0, modelError, size, buildings: objects.length, renderCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometryCount: renderer.info.memory.geometries, buildingCenters: objects.map(object => {
        const point = object.getWorldPosition(new THREE.Vector3()); point.y += .45; point.project(camera);
        return { id: object.userData.buildingId, x: rect.left + (point.x + 1) * rect.width / 2, y: rect.top + (1 - point.y) * rect.height / 2 };
      }) };
    },
    dispose() { if (disposed) return; disposed = true; observer.disconnect(); if (frame) cancelAnimationFrame(frame); canvas.removeEventListener('pointerdown', pointerStart); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerEnd); canvas.removeEventListener('pointercancel', pointerCancel); canvas.removeEventListener('wheel', wheel); scene.clear(); owned.forEach(resource => resource.dispose?.()); environment.dispose(); sun.shadow.map?.dispose(); renderer.dispose(); canvas.remove(); releaseLease(); }
  };
}

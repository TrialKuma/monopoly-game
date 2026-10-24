import * as THREE from '/assets/vendor/three/three.module.min.js';
import { makeStudioEnvironment } from '/scene-environment.js?v=20261024-4';
import { GLTFLoader } from '/assets/vendor/three/addons/loaders/GLTFLoader.js';

const $ = id => document.getElementById(id);
const cameraState = { yaw: 0, elevation: 0, zoom: 1 };
const directions = { front: [0, 0], side: [Math.PI / 2, 0], back: [Math.PI, 0], iso: [.63, .34] };
const sharedBounds = new THREE.Box3();
const loader = new GLTFLoader();
let catalog, current, generation = 0, disposed = false, renderFrame = 0;
const viewers = [];

function disposeModel(gltf) {
  if (!gltf) return;
  const resources = new Set(), bitmaps = new Set();
  gltf.scene.traverse(node => {
    if (node.geometry) resources.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (!material) continue;
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) {
        resources.add(value);
        for (const bitmap of Array.isArray(value.source?.data) ? value.source.data : [value.source?.data]) if (bitmap?.close) bitmaps.add(bitmap);
      }
    }
  });
  resources.forEach(resource => resource.dispose());
  bitmaps.forEach(bitmap => bitmap.close());
}

function makeViewer(key) {
  const stage = $(`${key}-stage`);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const environment = makeStudioEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = .4;
  scene.background = new THREE.Color('#eeeee9');
  scene.add(new THREE.HemisphereLight('#ffffff', '#bbc0b6', .8));
  const sun = new THREE.DirectionalLight('#ffffff', 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 4, bottom: -3, near: .2, far: 20 });
  sun.shadow.bias = -.00003;
  sun.shadow.normalBias = .003;
  sun.position.set(-3, 6, 5); scene.add(sun);
  const fill = new THREE.DirectionalLight('#ffffff', .7);
  fill.position.set(4, 3, -4); scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: .18 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.012; ground.receiveShadow = true;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(20, 1, .01, 80);
  const pivot = new THREE.Group(); scene.add(pivot);
  const viewer = { key, stage, renderer, environment, scene, camera, pivot, ground, sun, bounds: new THREE.Box3(), gltf: null };
  bindGestures(viewer);
  return viewer;
}

function requestRender() {
  if (!renderFrame && !disposed) renderFrame = requestAnimationFrame(render);
}

function render() {
  renderFrame = 0;
  if (disposed) return;
  sharedBounds.makeEmpty();
  for (const viewer of viewers) if (viewer.gltf) sharedBounds.union(viewer.bounds);
  const size = sharedBounds.isEmpty() ? new THREE.Vector3(1, 1, 1) : sharedBounds.getSize(new THREE.Vector3());
  const center = sharedBounds.isEmpty() ? new THREE.Vector3(0, .5, 0) : sharedBounds.getCenter(new THREE.Vector3());
  const minAspect = Math.min(...viewers.map(v => Math.max(1, v.stage.clientWidth) / Math.max(1, v.stage.clientHeight)));
  // Shared cameras preserve width/depth differences after a disclosed uniform
  // height normalization; the AI and Blender files use different world units.
  const projectedWidth = size.x * Math.abs(Math.cos(cameraState.yaw)) + size.z * Math.abs(Math.sin(cameraState.yaw));
  const projectedDepth = size.x * Math.abs(Math.sin(cameraState.yaw)) + size.z * Math.abs(Math.cos(cameraState.yaw));
  const projectedHeight = size.y * Math.cos(cameraState.elevation) + projectedDepth * Math.abs(Math.sin(cameraState.elevation));
  const halfHeight = Math.max(projectedHeight, projectedWidth / minAspect, 1.14) * .64 / cameraState.zoom;
  for (const viewer of viewers) {
    const { stage, renderer, camera } = viewer;
    const width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight), aspect = width / height;
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    const distance = halfHeight / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const horizontal = Math.cos(cameraState.elevation) * distance;
    camera.position.set(center.x + Math.sin(cameraState.yaw) * horizontal, center.y + Math.sin(cameraState.elevation) * distance, center.z + Math.cos(cameraState.yaw) * horizontal);
    camera.lookAt(center); camera.updateProjectionMatrix();
    renderer.render(viewer.scene, camera);
  }
}

function setZoom(value) {
  cameraState.zoom = THREE.MathUtils.clamp(value, .6, 2.8);
  requestRender();
}

function clearDirectionSelection() {
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', 'false'));
}

function setReference(view) {
  if (!current) return;
  const key = view === 'iso' ? 'front' : view, url = current.reference[key] || current.reference.front;
  const label = { front: '正面', side: '右侧', back: '背面' }[key];
  $('reference').src = url;
  $('reference').alt = `${current.title} · ${label}原始设计`;
  $('reference-link').href = url;
  $('reference-label').textContent = `${label}设计`;
}

function setView(name, resetZoom = true) {
  [cameraState.yaw, cameraState.elevation] = directions[name];
  if (resetZoom) cameraState.zoom = 1;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
  setReference(name); requestRender();
}

function bindGestures({ stage }) {
  const pointers = new Map();
  let previous = null;
  const read = () => {
    const points = [...pointers.values()];
    if (points.length > 1) return { mode: 'pinch', distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) };
    return points.length ? { mode: 'orbit', ...points[0] } : null;
  };
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId); previous = read();
  });
  stage.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = read();
    if (previous && next.mode === previous.mode) {
      if (next.mode === 'pinch' && previous.distance > 2) setZoom(cameraState.zoom * next.distance / previous.distance);
      else if (next.mode === 'orbit') {
        cameraState.yaw += (next.x - previous.x) * .009;
        cameraState.elevation = THREE.MathUtils.clamp(cameraState.elevation + (next.y - previous.y) * .006, -.12, 1.15);
        clearDirectionSelection(); requestRender();
      }
    }
    previous = next;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(type, event => { pointers.delete(event.pointerId); previous = read(); });
  stage.addEventListener('wheel', event => { event.preventDefault(); setZoom(cameraState.zoom * Math.exp(-event.deltaY * .001)); }, { passive: false });
  stage.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === '0') return setView('front');
    if (['+', '=', '-'].includes(event.key)) return setZoom(cameraState.zoom * (event.key === '-' ? 1 / 1.18 : 1.18));
    cameraState.yaw += event.key === 'ArrowLeft' ? -.12 : event.key === 'ArrowRight' ? .12 : 0;
    cameraState.elevation = THREE.MathUtils.clamp(cameraState.elevation + (event.key === 'ArrowUp' ? .08 : event.key === 'ArrowDown' ? -.08 : 0), -.12, 1.15);
    clearDirectionSelection(); requestRender();
  });
}

async function loadModel(viewer, model, token) {
  const status = viewer.stage.querySelector('.loading');
  const response = await fetch(model.url, { cache: 'no-store' });
  if (!response.ok) throw new Error('模型暂未就绪，稍后刷新此页。');
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (model.sha256 && hash !== model.sha256) throw new Error('模型版本正在更新，请稍后刷新以核对同一版本。');
  if (token !== generation || disposed) return;
  const gltf = await loader.parseAsync(bytes, new URL('.', new URL(model.url, location.href)).href);
  if (token !== generation || disposed) { disposeModel(gltf); return; }
  const object = gltf.scene;
  object.updateMatrixWorld(true);
  const originalBounds = new THREE.Box3().setFromObject(object);
  const height = originalBounds.max.y - originalBounds.min.y;
  if (!Number.isFinite(height) || height <= 0) { disposeModel(gltf); throw new Error('模型尺寸无效。'); }
  object.scale.multiplyScalar(3 / height); object.updateMatrixWorld(true);
  const normalizedBounds = new THREE.Box3().setFromObject(object), center = normalizedBounds.getCenter(new THREE.Vector3());
  viewer.pivot.position.set(-center.x, -normalizedBounds.min.y, -center.z);
  viewer.pivot.add(object); viewer.pivot.updateMatrixWorld(true);
  viewer.bounds.setFromObject(viewer.pivot); viewer.gltf = gltf;
  let triangles = 0;
  object.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true; node.receiveShadow = true;
    triangles += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3;
  });
  $(`${viewer.key}-info`).textContent = `${Math.round(triangles).toLocaleString()} 面 · ${(bytes.byteLength / 1048576).toFixed(1)} MB`;
  viewer.stage.dataset.model = current.id; viewer.stage.dataset.sha256 = hash;
  status.hidden = true; requestRender();
}

async function selectAsset(id) {
  current = catalog.assets.find(asset => asset.id === id) || catalog.assets[0];
  const token = ++generation;
  $('asset').value = current.id; $('title').textContent = current.title;
  $('changes').textContent = current.changes; $('limits').textContent = current.limits;
  const url = new URL(location.href); url.searchParams.set('asset', current.id); history.replaceState(null, '', url);
  setView('front');
  await Promise.allSettled(viewers.map(async viewer => {
    const model = current[viewer.key], status = viewer.stage.querySelector('.loading');
    viewer.pivot.clear(); disposeModel(viewer.gltf); viewer.gltf = null; viewer.bounds.makeEmpty();
    delete viewer.stage.dataset.sha256; delete viewer.stage.dataset.model;
    status.hidden = false; status.classList.remove('error'); status.textContent = '载入模型…';
    $(`${viewer.key}-info`).textContent = '正在载入'; $(`${viewer.key}-badge`).textContent = model.label;
    $(`${viewer.key}-link`).href = model.url;
    try { await loadModel(viewer, model, token); }
    catch (error) {
      if (token !== generation || disposed) return;
      status.textContent = error.message; status.classList.add('error'); $(`${viewer.key}-info`).textContent = '暂未载入';
      console.error(`${viewer.key} model:`, error);
    }
  }));
  requestRender();
}

const observer = new ResizeObserver(requestRender);
try {
  viewers.push(makeViewer('before'), makeViewer('after'));
  for (const viewer of viewers) observer.observe(viewer.stage);
  const response = await fetch('./comparison.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('对比清单暂时无法载入。');
  catalog = await response.json();
  if (!catalog.assets?.length) throw new Error('暂无可对比的建筑。');
  for (const asset of catalog.assets) $('asset').add(new Option(asset.title, asset.id));
  $('asset').addEventListener('change', () => selectAsset($('asset').value));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  $('zoom-in').addEventListener('click', () => setZoom(cameraState.zoom * 1.18));
  $('zoom-out').addEventListener('click', () => setZoom(cameraState.zoom / 1.18));
  $('reset').addEventListener('click', () => setView('front'));
  await selectAsset(new URLSearchParams(location.search).get('asset') || catalog.defaultAsset);
} catch (error) {
  $('page-error').textContent = error.message; $('page-error').hidden = false;
  console.error(error);
}
window.addEventListener('pagehide', () => {
  disposed = true; generation++; cancelAnimationFrame(renderFrame); observer.disconnect();
  for (const viewer of viewers) {
    disposeModel(viewer.gltf); viewer.ground.geometry.dispose(); viewer.ground.material.dispose();
    viewer.sun.shadow.dispose(); viewer.environment.dispose(); viewer.renderer.dispose();
  }
}, { once: true });

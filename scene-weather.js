// The weather is cosmetic: its own deterministic clock and generator never
// consume dice/card randomness, advance a turn, or schedule another frame.
export function createCityWeather({ THREE, world, boardBounds, renderer, requestRender = () => {} }) {
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const WEATHER = ['clear', 'rain', 'snow'];
  const TAU = Math.PI * 2, SEASON_SECONDS = 100;
  const owned = new Set(), bindings = new Map(), materialCopies = new Map();
  const root = new THREE.Group(); root.name = 'city_weather'; root.userData.cosmetic = true; world.add(root);
  const own = resource => { owned.add(resource); return resource; };
  const w = Math.max(3, boardBounds?.w || 11.55), d = Math.max(3, boardBounds?.d || 9.9);
  const parkW = Math.max(1, w - 4.7), parkD = Math.max(1, d - 4.65);
  let seed = (81317 + Math.round(w * 100) * 31 + Math.round(d * 100) * 17) >>> 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const clamp = value => Math.max(0, Math.min(1, value));
  const wrap = value => ((value % 1) + 1) % 1;
  let seasonMode = 'auto', weatherMode = 'auto', season = 'spring', weather = 'clear';
  let elapsed = 0, motionTime = 0, accumulator = 0, disposed = false, forced = true, motionReduced = false;
  let cloud = .08, rain = 0, snow = 0, wetness = 0, nightValue = 0;
  const weights = { spring: 1, summer: 0, autumn: 0, winter: 0 };
  const dummy = new THREE.Object3D(), color = new THREE.Color(), targetColor = new THREE.Color();
  const seasonalColors = Object.fromEntries(Object.entries({
    leaf: ['#c895a7', '#679561', '#c67e3d', '#839a91'],
    crown: ['#f1bdd0', '#a1c07b', '#edbd65', '#e0e9e0'],
    evergreen: ['#629a76', '#4c8b67', '#718663', '#9ab7ab'],
    grass: ['#b3c99f', '#a3bc88', '#bdaf82', '#d8e0d7'],
  }).map(([key, values]) => [key, values.map(value => new THREE.Color(value))]));

  function standard(tint, extra = {}) {
    return own(new THREE.MeshStandardMaterial({ color: tint, roughness: .72, transparent: true, depthWrite: false, ...extra }));
  }
  function instanced(name, geometry, material, count) {
    const mesh = own(new THREE.InstancedMesh(geometry, material, count));
    mesh.name = name; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.raycast = () => {}; mesh.visible = false;
    mesh.castShadow = false; mesh.receiveShadow = true; root.add(mesh); return mesh;
  }
  function paintInstances(mesh, palette) {
    for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, color.set(palette[i % palette.length]));
    mesh.instanceColor.needsUpdate = true;
  }
  function petalGeometry() {
    const shape = new THREE.Shape();
    shape.moveTo(0, -.58); shape.bezierCurveTo(-.65, -.13, -.66, .43, -.20, .51);
    shape.quadraticCurveTo(-.07, .55, 0, .35); shape.quadraticCurveTo(.16, .60, .36, .42);
    shape.bezierCurveTo(.76, .07, .28, -.35, 0, -.58);
    const geo = own(new THREE.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: false, curveSegments: 4, steps: 1 }));
    geo.translate(0, 0, -.04); return geo;
  }
  function leafGeometry() {
    // A folded maple silhouette, with a raised central vein: it catches the
    // moving sun instead of reading as a screen-space confetti rectangle.
    const outline = [[0,-.72],[-.13,-.32],[-.43,-.4],[-.31,-.15],[-.68,.02],[-.39,.13],[-.51,.43],[-.18,.29],[0,.75],[.18,.29],[.51,.43],[.39,.13],[.68,.02],[.31,-.15],[.43,-.4],[.13,-.32]];
    const positions = [];
    outline.forEach((a, i) => { const b = outline[(i + 1) % outline.length]; positions.push(0, .01, .13, a[0], a[1], 0, b[0], b[1], 0); });
    const geo = own(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.computeVertexNormals(); return geo;
  }
  const petalMat = standard('#ffffff', { side: THREE.DoubleSide, emissive: '#4a2437', emissiveIntensity: .055 });
  const leafMat = standard('#ffffff', { side: THREE.DoubleSide });
  const snowMat = standard('#f5fbff', { roughness: .9, emissive: '#bfd4e8', emissiveIntensity: .09 });
  const petals = instanced('weather_spring_petals', petalGeometry(), petalMat, 62);
  const leaves = instanced('weather_autumn_leaves', leafGeometry(), leafMat, 48);
  const flakes = instanced('weather_snowflakes', own(new THREE.IcosahedronGeometry(1, 0)), snowMat, 132);
  paintInstances(petals, ['#ffd2df', '#ed9fc2', '#ffebef', '#eab6d3']);
  paintInstances(leaves, ['#dc8439', '#f2b65a', '#c76842', '#eac66c']);
  const particles = count => Array.from({ length: count }, () => ({ x: random(), z: random(), y: random(), speed: .7 + random() * .6, phase: random() * TAU, size: .7 + random() * .6 }));
  const petalData = particles(petals.count), leafData = particles(leaves.count), flakeData = particles(flakes.count);

  const rainCount = 144, rainData = particles(rainCount);
  const rainGeo = own(new THREE.BufferGeometry());
  const rainPositions = new Float32Array(rainCount * 6);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const rainMat = own(new THREE.LineBasicMaterial({ color: '#afd2e1', transparent: true, opacity: 0, depthWrite: false }));
  const rainLines = new THREE.LineSegments(rainGeo, rainMat); rainLines.name = 'weather_rain_streaks';
  rainLines.raycast = () => {}; rainLines.frustumCulled = false; rainLines.visible = false; root.add(rainLines);

  // Ripples sit in the fountain and on the park's paths, never over ownership
  // markers, prices, or building fronts. The small puddles have real normals.
  const rippleMat = own(new THREE.MeshBasicMaterial({ color: '#d5edf0', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  const rippleGeo = own(new THREE.RingGeometry(.82, 1, 24)); rippleGeo.rotateX(-Math.PI / 2);
  const ripples = instanced('weather_rain_ripples', rippleGeo, rippleMat, 20);
  const rippleData = Array.from({ length: ripples.count }, (_, i) => {
    if (i < 10) { const angle = random() * TAU, r = .19 + random() * .37; return { x: Math.cos(angle) * r, z: Math.sin(angle) * r, y: .276, phase: random() }; }
    const axis = i % 2; return { x: axis ? (random() > .5 ? 1 : -1) * (.98 + random() * Math.max(.1, parkW * .42 - .98)) : (random() - .5) * .21, z: axis ? (random() - .5) * .21 : (random() > .5 ? 1 : -1) * (.98 + random() * Math.max(.1, parkD * .39 - .98)), y: .163, phase: random() };
  });
  const puddleMat = standard('#799b9f', { roughness: .14, metalness: .20, opacity: 0 });
  const puddleGeo = own(new THREE.CircleGeometry(1, 24)); puddleGeo.rotateX(-Math.PI / 2);
  const puddles = instanced('weather_path_puddles', puddleGeo, puddleMat, 6);
  for (let i = 0; i < puddles.count; i++) {
    const horizontal = i < 4, sign = i % 2 ? 1 : -1;
    const x = horizontal ? sign * (parkW * (.23 + .07 * Math.floor(i / 2))) : 0;
    const z = horizontal ? (i % 2 ? -.036 : .032) : sign * parkD * .29;
    dummy.position.set(x, .159, z); dummy.rotation.set(0, .2 * i, 0); dummy.scale.set(horizontal ? .23 : .105, 1, horizontal ? .095 : .2); dummy.updateMatrix(); puddles.setMatrixAt(i, dummy.matrix);
  }
  puddles.instanceMatrix.needsUpdate = true;

  const driftMat = standard('#e8f0ed', { roughness: .91, opacity: 0 });
  const drifts = instanced('weather_park_snowbanks', own(new THREE.SphereGeometry(1, 10, 5)), driftMat, 28);
  for (let i = 0; i < drifts.count; i++) {
    const side = i % 4, along = -.86 + (Math.floor(i / 4) / 6) * 1.72;
    const x = side < 2 ? (side ? 1 : -1) * parkW * .455 : along * parkW * .455;
    const z = side < 2 ? along * parkD * .455 : (side === 3 ? 1 : -1) * parkD * .455;
    dummy.position.set(x, .126, z); dummy.rotation.set(0, random() * TAU, 0);
    dummy.scale.set(.11 + random() * .14, .023 + random() * .028, .095 + random() * .10); dummy.updateMatrix(); drifts.setMatrixAt(i, dummy.matrix);
  }
  drifts.instanceMatrix.needsUpdate = true;

  // Summer is distinct even under clear skies: little butterflies make slow
  // loops through the central garden, with no extra shadow-casting lights.
  const butterflies = new THREE.Group(); butterflies.name = 'weather_summer_butterflies'; root.add(butterflies); butterflies.visible = false;
  const wingGeo = own(new THREE.SphereGeometry(1, 8, 5));
  const wingMaterials = ['#f5c568', '#d9b4e4', '#d29dca', '#f0c06b'].map(tint => standard(tint, { side: THREE.DoubleSide }));
  const butterfliesData = [];
  for (let i = 0; i < 4; i++) {
    const butterfly = new THREE.Group(); butterflies.add(butterfly);
    const wings = [-1, 1].map(side => {
      const pivot = new THREE.Group(); butterfly.add(pivot);
      const wing = new THREE.Mesh(wingGeo, wingMaterials[i]); wing.scale.set(.046, .008, .064); wing.position.x = side * .038;
      wing.raycast = () => {}; pivot.add(wing); return { pivot, side };
    });
    butterfliesData.push({ butterfly, wings, phase: i * TAU / 4 });
  }

  function inWorld(node) { for (let p = node; p; p = p.parent) if (p === world) return true; return false; }
  function isWeatherNode(node) { for (let p = node; p; p = p.parent) if (p === root) return true; return false; }
  function classify(material) {
    if (!material?.isMeshStandardMaterial || !material.color) return null;
    const name = material.name || '';
    if (/window|glazing|glass|lantern|lamp|portal|lit |light$|warm light/i.test(name)) return null;
    if (material.emissive && material.emissiveIntensity * (material.emissive.r + material.emissive.g + material.emissive.b) > .02) return null;
    if (/pine|evergreen/i.test(name)) return 'evergreen';
    if (/leaf sage|shrub crown|topiary spring|maple tangerine/i.test(name)) return 'crown';
    if (/garden jade|foliage|jade shrub|topiary jade|maple vermilion/i.test(name)) return 'leaf';
    if (name) return null;
    const hex = material.color.getHexString();
    if (hex === '70947a') return 'leaf';
    if (hex === '92ad86') return 'crown';
    if (['acbf9c', 'bbcbaa', '728f67'].includes(hex)) return 'grass';
    if (hex === 'e2d8c1') return 'path';
    return null;
  }
  function copyMaterial(original) {
    const kind = classify(original); if (!kind) return original;
    if (!materialCopies.has(original)) {
      const copy = own(original.clone()); copy.name = original.name;
      materialCopies.set(original, { copy, kind, color: original.color.clone(), roughness: original.roughness });
    }
    return materialCopies.get(original).copy;
  }
  function restoreBinding(node, entry) {
    if (node.material === entry.replacement) node.material = entry.original;
    else if (Array.isArray(node.material) && Array.isArray(entry.replacement)) {
      node.material = node.material.map((mat, i) => mat === entry.replacement[i] ? entry.original[i] : mat);
    }
  }
  function refresh() {
    if (disposed) return;
    if (root.parent !== world) world.add(root);
    for (const [node, entry] of bindings) if (!inWorld(node)) { restoreBinding(node, entry); bindings.delete(node); }
    world.traverse(node => {
      if (!node.isMesh || isWeatherNode(node) || bindings.has(node)) return;
      const original = node.material;
      const replacement = Array.isArray(original) ? original.map(copyMaterial) : copyMaterial(original);
      if (Array.isArray(original) ? replacement.some((m, i) => m !== original[i]) : replacement !== original) {
        bindings.set(node, { original, replacement }); node.material = replacement;
      }
    });
    // Upgrades can replace many objects during one game. Release seasonal
    // clones once no live instance uses them, rather than retaining every era.
    const active = new Set();
    for (const { original } of bindings.values()) for (const mat of Array.isArray(original) ? original : [original]) active.add(mat);
    for (const [original, entry] of materialCopies) if (!active.has(original)) { entry.copy.dispose(); owned.delete(entry.copy); materialCopies.delete(original); }
    forced = true; applyPalette(); requestRender();
  }
  function resolve() {
    season = seasonMode === 'auto' ? SEASONS[Math.floor(elapsed / SEASON_SECONDS) % 4] : seasonMode;
    const phase = elapsed % SEASON_SECONDS;
    const rainWindow = { spring: [28, 54], summer: [56, 74], autumn: [65, 84] }[season];
    const automatic = season === 'winter' ? (phase < 68 ? 'snow' : 'clear') : rainWindow && phase >= rainWindow[0] && phase < rainWindow[1] ? 'rain' : 'clear';
    weather = weatherMode === 'auto' ? automatic : weatherMode;
  }
  function applyPalette() {
    for (const entry of materialCopies.values()) {
      const { copy, kind } = entry;
      if (kind === 'path') {
        copy.color.copy(entry.color).lerp(targetColor.set('#7c9697'), wetness * .21);
        copy.roughness = entry.roughness + (.25 - entry.roughness) * wetness * .74;
        continue;
      }
      targetColor.setRGB(0, 0, 0);
      const palette = seasonalColors[kind];
      SEASONS.forEach((name, i) => { targetColor.r += palette[i].r * weights[name]; targetColor.g += palette[i].g * weights[name]; targetColor.b += palette[i].b * weights[name]; });
      copy.color.copy(entry.color).lerp(targetColor, kind === 'evergreen' ? .48 : kind === 'grass' ? .72 : .86);
      copy.roughness = entry.roughness + (.52 - entry.roughness) * wetness * .25;
    }
    puddleMat.opacity = wetness * .25; puddles.visible = wetness > .025;
    driftMat.opacity = weights.winter * .77; drifts.visible = weights.winter > .025;
  }
  function updateFalling(mesh, data, scale, speed, flutter) {
    for (let i = 0; i < data.length; i++) {
      const p = data[i], life = wrap(p.y + motionTime * speed * p.speed);
      const sway = Math.sin(motionTime * .67 + p.phase) * flutter;
      const x = (wrap(p.x + motionTime * .005 + sway / w) - .5) * w * 1.06;
      const z = (wrap(p.z + Math.cos(motionTime * .45 + p.phase) * flutter / d) - .5) * d * 1.06;
      dummy.position.set(x, .2 + (1 - life) * 4.2, z);
      dummy.rotation.set(p.phase + motionTime * (flutter ? .65 : .19), motionTime * .30 + p.phase, Math.sin(motionTime * 1.7 + p.phase) * (flutter ? .8 : .15));
      const fade = Math.min(1, life * 14, (1 - life) * 14);
      dummy.scale.setScalar(scale * p.size * Math.max(.001, fade)); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  function updateMotion(reduced) {
    petals.visible = !reduced && weights.spring > .025; petalMat.opacity = weights.spring * (1 - rain * .4) * .94;
    leaves.visible = !reduced && weights.autumn > .025; leafMat.opacity = weights.autumn * .94;
    flakes.visible = !reduced && snow > .025; snowMat.opacity = snow * .94;
    rainLines.visible = !reduced && rain > .025; rainMat.opacity = rain * (.44 + nightValue * .16);
    ripples.visible = !reduced && rain > .025; rippleMat.opacity = rain * .36;
    butterflies.visible = !reduced && weights.summer > .025 && rain < .8;
    wingMaterials.forEach(mat => { mat.opacity = weights.summer * (1 - rain); });
    if (reduced) return;
    if (petals.visible) updateFalling(petals, petalData, .079, .058, .40);
    if (leaves.visible) updateFalling(leaves, leafData, .088, .068, .47);
    if (flakes.visible) updateFalling(flakes, flakeData, .027, .055, .19);
    if (rainLines.visible) {
      for (let i = 0; i < rainCount; i++) {
        const p = rainData[i], y = .16 + (1 - wrap(p.y + motionTime * 1.24 * p.speed)) * 4.8;
        const x = (wrap(p.x + motionTime * .033) - .5) * w * 1.05;
        const z = (p.z - .5) * d * 1.05, length = .12 + p.size * .065;
        rainPositions.set([x, y, z, x - length * .15, y + length, z - length * .04], i * 6);
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    if (ripples.visible) {
      for (let i = 0; i < rippleData.length; i++) {
        const p = rippleData[i], phase = wrap(p.phase + motionTime * 1.1);
        const size = (.025 + phase * .13) * Math.sin(phase * Math.PI);
        dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.max(.0001, size)); dummy.updateMatrix(); ripples.setMatrixAt(i, dummy.matrix);
      }
      ripples.instanceMatrix.needsUpdate = true;
    }
    if (butterflies.visible) for (const { butterfly, wings, phase } of butterfliesData) {
      const angle = motionTime * .27 + phase;
      butterfly.position.set(Math.cos(angle) * Math.min(parkW * .31, 2.15), .66 + Math.sin(motionTime * .73 + phase) * .21, Math.sin(angle * 1.23) * Math.min(parkD * .30, 1.12));
      butterfly.rotation.y = -angle;
      wings.forEach(({ pivot, side }) => { pivot.rotation.z = side * (.34 + Math.sin(motionTime * 18 + phase) * .64); });
    }
  }
  function setSeason(value) {
    if (disposed || !['auto', ...SEASONS].includes(value)) return false;
    seasonMode = value; resolve(); forced = true; requestRender(); return true;
  }
  function setWeather(value) {
    if (disposed || !['auto', ...WEATHER].includes(value)) return false;
    weatherMode = value; resolve(); forced = true; requestRender(); return true;
  }
  function tick(delta, { night = 0, paused = false, reduced = false } = {}) {
    if (disposed || (typeof document !== 'undefined' && document.hidden)) return false;
    const accessibilityChanged = motionReduced !== reduced; motionReduced = reduced;
    if (paused && !forced && !accessibilityChanged) return false;
    const dt = Math.min(.1, Math.max(0, Number.isFinite(delta) ? delta : 0));
    accumulator += dt;
    if (accumulator < 1 / 30 && !forced && !reduced && !accessibilityChanged) return false;
    const step = Math.min(.12, accumulator); accumulator = 0;
    if (!paused && !reduced) { elapsed += step; motionTime += step; }
    resolve();
    const blend = reduced || paused ? 1 : 1 - Math.exp(-Math.max(step, 1 / 60) * .72);
    const paletteBlend = reduced || paused ? 1 : 1 - Math.exp(-Math.max(step, 1 / 60) * .32);
    const rainTarget = weather === 'rain' ? 1 : 0, snowTarget = weather === 'snow' ? 1 : 0;
    const cloudTarget = weather === 'clear' ? .08 : weather === 'rain' ? .85 : .64;
    const previous = [cloud, rain, snow, wetness, nightValue, ...Object.values(weights)];
    cloud += (cloudTarget - cloud) * blend; rain += (rainTarget - rain) * blend; snow += (snowTarget - snow) * blend;
    wetness += (rainTarget - wetness) * (reduced || paused ? 1 : 1 - Math.exp(-Math.max(step, 1 / 60) * (rainTarget ? .16 : .055)));
    nightValue = clamp(Number.isFinite(night) ? night : 0);
    SEASONS.forEach(name => { weights[name] += ((name === season ? 1 : 0) - weights[name]) * paletteBlend; });
    applyPalette(); updateMotion(reduced);
    const changed = forced || !reduced || previous.some((value, i) => Math.abs(value - [cloud, rain, snow, wetness, nightValue, ...Object.values(weights)][i]) > .0001);
    forced = false; return changed;
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const [node, entry] of bindings) restoreBinding(node, entry);
    root.removeFromParent(); owned.forEach(resource => resource.dispose?.()); owned.clear(); bindings.clear(); materialCopies.clear();
  }
  function getState() { return { season, weather, cloud, rain, snow, wetness, seasonMode, weatherMode }; }
  refresh(); updateMotion(false);
  return { setSeason, setWeather, tick, getState, refresh, dispose };
}

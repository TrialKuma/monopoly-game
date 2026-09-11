// Cosmetic city life. No game state writes, global RNG, timers, or animation loop.
// Articulated Blender parts are kept by scene.js before its static mesh batching.
import { createCityLighting } from './scene-lighting.js?v=20260912-24';
import { createCityWeather } from './scene-weather.js?v=20260912-24';
import { createCityOutskirts } from './scene-outskirts.js?v=20260912-24';
export function shouldPreserveLifeNode(node) {
  return !!node?.userData?.lifePart || /^life_(wheel_rotor|crane_pendulum)$/.test(node?.name || '');
}

export function createSceneLife({ THREE, scene, world, light, snapshot, lotViews, boardBounds, renderer, requestRender = () => {} }) {
  const TAU = Math.PI * 2;
  const owned = new Set(), materialCopies = new Map(), bindings = new Map();
  const movingParts = [], pedestrians = [], ripples = [], lamps = [];
  const partStates = new WeakMap();
  const root = new THREE.Group(); root.name = 'city_life'; root.userData.cosmetic = true; world.add(root);
  const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reduced = !!media?.matches, hidden = typeof document !== 'undefined' && document.hidden;
  let disposed = false, paused = false, mode = 'auto', elapsed = 0, accumulator = 0, forced = true;
  let night = 0, lastTime = null, currentSnapshot = snapshot;
  let observedBuildings = '';
  const sparkEvents = [], sparkLimit = 20;
  const w = Math.max(1, (boardBounds?.w || 11.55) - 4.7);
  const d = Math.max(1, (boardBounds?.d || 9.9) - 4.65);
  const parkY = .16;
  const lighting = createCityLighting({ THREE, scene, world, renderer, light, boardBounds, requestRender });
  const weather = createCityWeather({ THREE, world, renderer, boardBounds, requestRender });
  const outskirts = createCityOutskirts({ THREE, world, boardBounds, mapId:snapshot?.mapId, requestRender });
  const own = resource => { owned.add(resource); return resource; };
  const standard = (color, extra = {}) => own(new THREE.MeshStandardMaterial({ color, roughness: .65, ...extra }));
  const basic = (color, extra = {}) => own(new THREE.MeshBasicMaterial({ color, ...extra }));
  const palette = {
    path: standard('#e5d8bc'), water: standard('#62d8de', { transparent: true, opacity: .64, roughness: .2, emissive: '#208591', emissiveIntensity: .12, depthWrite: false }),
    iron: standard('#324f51'), brass: standard('#d8a943', { roughness: .38, metalness: .3 }),
    skin: standard('#edba8a'), shoes: standard('#34565a'), hair: standard('#684b3c'), cream: standard('#fff0ca'), basket: standard('#b8824f'),
    lamp: standard('#ffe1a0', { emissive: '#ffd180', emissiveIntensity: .28 }),
  };
  const boxGeo = own(new THREE.BoxGeometry(1, 1, 1));
  const sphereGeo = own(new THREE.SphereGeometry(1, 10, 7));
  const cylinderGeo = own(new THREE.CylinderGeometry(1, 1, 1, 8));
  function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
    const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); item.castShadow = true; item.receiveShadow = true; parent.add(item); return item;
  }
  function box(parent, size, mat, x, y, z) { const m = mesh(boxGeo, mat, parent, x, y, z); m.scale.set(...size); return m; }
  function sphere(parent, size, mat, x, y, z) { const m = mesh(sphereGeo, mat, parent, x, y, z); m.scale.set(...size); return m; }
  function rod(parent, a, b, radius, mat) {
    const p = new THREE.Vector3(...a), q = new THREE.Vector3(...b), axis = q.clone().sub(p);
    const m = mesh(cylinderGeo, mat, parent); m.position.copy(p).add(q).multiplyScalar(.5); m.scale.set(radius, axis.length(), radius);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()); return m;
  }
  // This tiny private generator never consumes the game's Math.random stream.
  let seed = 731 + (snapshot?.board?.length || 22) * 113;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  // A walk around the existing central fountain, joined to the existing paths.
  const walkRadius = Math.min(.99, d * .31);
  const promenade = mesh(own(new THREE.RingGeometry(walkRadius - .11, walkRadius + .11, 56)), palette.path, root, 0, parkY + .003, 0);
  promenade.rotation.x = -Math.PI / 2; promenade.castShadow = false;
  const shirts = ['#db765a', '#428e9a', '#b992d0', '#e8ba54'].map(c => standard(c));
  for (let i = 0; i < 4; i++) {
    const person = new THREE.Group(); person.name = 'life_pedestrian_' + i; root.add(person);
    const torso = mesh(cylinderGeo, shirts[i], person, 0, .128, 0); torso.scale.set(.035, .085, .029);
    sphere(person, [.029, .033, .027], palette.skin, 0, .207, 0);
    sphere(person, [.031, .019, .029], palette.hair, 0, .225, -.003);
    const legs = [-1, 1].map(side => {
      const pivot = new THREE.Group(); pivot.position.set(side * .018, .083, 0); person.add(pivot);
      box(pivot, [.025, .084, .028], palette.shoes, 0, -.041, 0); return pivot;
    });
    for (const side of [-1, 1]) rod(person, [side * .034, .16, 0], [side * .047, .092, .005], .011, shirts[i]);
    if (i % 2 === 0) box(person, [.04, .048, .02], palette.basket, 0, .133, -.036);
    pedestrians.push({ object: person, legs, phase: i * TAU / 4, direction: i % 2 ? -1 : 1, radius: walkRadius + (i % 2 ? -.045 : .045) });
  }

  const fountainArcs = [];
  for (let i = 0; i < 6; i++) {
    const angle = i * TAU / 6;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(angle) * .035, .89, Math.sin(angle) * .035), new THREE.Vector3(Math.cos(angle) * .35, 1.27, Math.sin(angle) * .35), new THREE.Vector3(Math.cos(angle) * .56, .269, Math.sin(angle) * .56));
    const arc = mesh(own(new THREE.TubeGeometry(curve, 16, .008, 4, false)), palette.water, root); arc.castShadow = false; fountainArcs.push(curve);
  }
  for (let i = 0; i < 3; i++) {
    const mat = basic('#baf9ed', { transparent: true, opacity: .30, side: THREE.DoubleSide, depthWrite: false });
    const ring = mesh(own(new THREE.RingGeometry(.92, 1, 40)), mat, root, 0, .27 + i * .001, 0); ring.rotation.x = -Math.PI / 2; ring.castShadow = false; ripples.push(ring);
  }

  // Four modest lanterns; emissive windows and ground glows need no shadow lights.
  const glowPixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4, r = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
    glowPixels[i] = glowPixels[i + 1] = glowPixels[i + 2] = 255;
    glowPixels[i + 3] = Math.round(Math.pow(Math.max(0, 1 - r), 1.6) * 255);
  }
  const glowTexture = own(new THREE.DataTexture(glowPixels, 32, 32));
  glowTexture.needsUpdate = true; glowTexture.magFilter = THREE.LinearFilter;
  const poolMat = basic('#ffc87b', { map: glowTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolGeo = own(new THREE.PlaneGeometry(.95, .95));
  const lampX = Math.min(w * .39, 2.7), lampZ = Math.min(d * .32, 1.3);
  [[-lampX, -.32], [lampX, .32], [-.32, -lampZ], [.32, lampZ]].forEach(([x, z]) => {
    rod(root, [x, parkY, z], [x, .68, z], .018, palette.iron);
    box(root, [.095, .12, .095], palette.lamp, x, .73, z);
    box(root, [.14, .022, .14], palette.brass, x, .802, z);
    for (const side of [-1, 1]) box(root, [.011, .12, .108], palette.iron, x + side * .048, .73, z);
    const pool = mesh(poolGeo, poolMat, root, x, parkY + .005, z); pool.rotation.x = -Math.PI / 2; pool.castShadow = false; lamps.push(pool);
  });

  // One tethered visitor balloon stays well inside the park, above the path.
  const balloon = new THREE.Group(); balloon.name = 'life_balloon'; root.add(balloon);
  const orange = standard('#dd8451'), balloonCream = standard('#ffdf9d');
  const profile = [[.035,-.31],[.12,-.22],[.235,-.07],[.255,.085],[.21,.22],[.12,.32],[.001,.36]].map(([x,y])=>new THREE.Vector2(x,y));
  for (let i = 0; i < 8; i++) mesh(own(new THREE.LatheGeometry(profile, 5, i * TAU / 8, TAU / 8)), i % 2 ? balloonCream : orange, balloon, 0, .40, 0);
  box(balloon, [.15, .105, .12], palette.basket, 0, -.063, 0);
  box(balloon, [.165, .018, .135], palette.cream, 0, -.006, 0);
  for (const x of [-.066,.066]) for (const z of [-.05,.05]) rod(balloon, [x,-.012,z], [x*.60,.125,z*.60], .006, palette.iron);
  const balloonAnchor = new THREE.Vector3(-Math.min(w * .29, 2.6), 1.45, Math.min(d * .20, 1.1));

  function pointCloud(count, color, size) {
    const geometry = own(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const mat = own(new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { tint: { value: new THREE.Color(color) }, opacity: { value: 1 }, pointSize: { value: size * Math.min(renderer?.getPixelRatio?.() || 1, 1.65) } },
      vertexShader: 'uniform float pointSize; void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=pointSize;}',
      fragmentShader: 'uniform vec3 tint; uniform float opacity; void main(){float r=length(gl_PointCoord-vec2(.5));if(r>.5)discard;float a=(1.0-smoothstep(.05,.5,r))*opacity;gl_FragColor=vec4(tint,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
    }));
    const points = new THREE.Points(geometry, mat); points.frustumCulled = false; points.raycast = () => {}; root.add(points); return points;
  }
  const waterDrops = pointCloud(36, '#b9ffff', 3.2);
  const fireflies = pointCloud(16, '#ffe18f', 4.6);
  const sparks = pointCloud(sparkLimit, '#ffd18c', 5); sparks.visible = false;
  const flies = Array.from({ length: 16 }, (_, i) => ({ x: (random() - .5) * w * .76, z: (random() - .5) * d * .70, y: .28 + random() * .42, phase: i * 1.31 }));
  for (const fly of flies) if (Math.hypot(fly.x, fly.z) < 1.15) fly.x += fly.x < 0 ? -1.2 : 1.2;
  const point = new THREE.Vector3();

  function isInWorld(node) { for (let p = node; p; p = p.parent) if (p === world) return true; return false; }
  function copyWindowMaterial(original) {
    if (!original?.isMeshStandardMaterial) return original;
    const name = original.name || '';
    const warm = /warm (lit|light|welcome|amber|lantern glass)|window glass|window recess|enamel window/i.test(name);
    const cool = /turquoise glass|deep sea glass|deep blue glazing|soft teal architectural glass|portal cyan/i.test(name);
    const anonymousLamp = !name && original.emissiveIntensity > .05 && original.emissive?.r > original.emissive?.b * 1.3;
    if (!warm && !cool && !anonymousLamp) return original;
    if (!materialCopies.has(original)) {
      const clone = own(original.clone()); clone.name = original.name;
      materialCopies.set(original, { material: clone, base: original.emissive.clone(), intensity: original.emissiveIntensity || 0, tint: new THREE.Color(cool ? '#26879f' : '#ffbb67'), strength: cool ? .34 : .70 });
    }
    return materialCopies.get(original).material;
  }
  function bindBuildings() {
    // Drop references to upgraded/destroyed building instances during a game.
    for (const [node, material] of bindings) if (!isInWorld(node)) { node.material = material; bindings.delete(node); }
    movingParts.length = 0;
    world.traverse(node => {
      // Each atmosphere module owns its materials. Only bind actual buildings,
      // never another module's translucent particles or emissive decorations.
      if (node.userData.cosmetic) return;
      for (let p = node.parent; p; p = p.parent) if (p.userData.cosmetic) return;
      if (node.isMesh && !bindings.has(node)) {
        const original = node.material;
        const replacement = Array.isArray(original) ? original.map(copyWindowMaterial) : copyWindowMaterial(original);
        if (Array.isArray(original) ? replacement.some((m, i) => m !== original[i]) : replacement !== original) { bindings.set(node, original); node.material = replacement; }
      }
      if (shouldPreserveLifeNode(node)) {
        let tileNode = node; while (tileNode && tileNode.userData.tileIndex === undefined) tileNode = tileNode.parent;
        if (!partStates.has(node)) partStates.set(node, { node, kind: node.userData.lifePart || (node.name.includes('wheel') ? 'wheel' : 'pendulum'), base: node.rotation.clone(), tileIndex: tileNode?.userData.tileIndex, phase: (tileNode?.userData.tileIndex || 1) * .47, spin: 0 });
        movingParts.push(partStates.get(node));
      }
    });
    weather.refresh();
    forced = true;
  }
  function applyLight() {
    palette.lamp.emissiveIntensity = .28 + night * 1.8; poolMat.opacity = night * .38;
    palette.water.emissiveIntensity = .12 + night * .18;
    for (const entry of materialCopies.values()) {
      entry.material.emissive.copy(entry.base).lerp(entry.tint, night * .86);
      entry.material.emissiveIntensity = entry.intensity + night * entry.strength;
    }
    const climate = weather.getState();
    fireflies.visible = night > .10 && climate.season !== 'winter' && climate.rain < .4;
    fireflies.material.uniforms.opacity.value = night * .70;
  }
  function update(next) {
    if (disposed) return;
    currentSnapshot = next || currentSnapshot;
    const signature = [...(lotViews?.values?.() || [])].map(v => (v.building?.children || []).map(c=>c.uuid).join(',') || v.group?.uuid || '').join('|');
    if (signature !== observedBuildings || !observedBuildings) { observedBuildings = signature; bindBuildings(); }
    forced = true; requestRender();
  }
  function setTimeMode(value) {
    if (disposed || !lighting.setTimeMode(value)) return false;
    mode = value; forced = true;
    requestRender(); return true;
  }
  function setSeason(value) {
    if (disposed || !weather.setSeason(value)) return false;
    forced = true; requestRender(); return true;
  }
  function setWeather(value) {
    if (disposed || !weather.setWeather(value)) return false;
    forced = true; requestRender(); return true;
  }
  function emitSparks(position, color) {
    if (reduced || hidden || disposed) return;
    sparks.material.uniforms.tint.value.set(color || '#ffd18c');
    sparkEvents.length = 0;
    for (let i = 0; i < sparkLimit; i++) {
      const angle = random() * TAU, speed = .11 + random() * .18;
      sparkEvents.push({ x: position.x, y: position.y, z: position.z, vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed, vy: .26 + random() * .30, life: .65 + random() * .7, age: 0 });
    }
    sparks.visible = true;
  }
  function effect(event = {}) {
    if (disposed) return;
    // The wheel belongs to the place where a chance event started, even when
    // its effect lands elsewhere. A shared tile must only trigger once.
    const indices = new Set([...(event.tiles || (event.tileIndex != null ? [event.tileIndex] : [])), ...(event.triggerTiles || [])]
      .map(tile => Number(typeof tile === 'object' && tile !== null ? tile.index : tile)).filter(Number.isInteger));
    for (const part of movingParts) if (indices.has(part.tileIndex)) {
      part.spin = part.kind === 'wheel' ? 9 : 1;
      part.node.getWorldPosition(point); world.worldToLocal(point); emitSparks(point, part.kind === 'wheel' ? '#ffe799' : '#ffbd67');
    }
    forced = true; requestRender();
  }
  function tick(time, delta) {
    if (disposed || hidden) { lastTime = time; return false; }
    const dt = Math.min(.08, Math.max(0, Number.isFinite(delta) ? delta : lastTime == null ? 0 : (time - lastTime) / 1000));
    lastTime = time;
    if ((paused || reduced) && !forced && !weather.needsWork?.()) return false;
    accumulator += dt;
    if (accumulator < 1 / 30 && !forced) return false;
    const step = Math.min(.10, accumulator); accumulator = 0;
    const motionStep = paused || reduced ? 0 : step;
    if (!paused && !reduced) elapsed += step;
    weather.tick(step, { night, reduced, paused });
    lighting.tick(step, { ...weather.getState(), reduced, paused });
    night = lighting.getState().night;
    outskirts.tick(step, { night, reduced, paused });
    applyLight();
    for (const p of pedestrians) {
      const angle = p.phase + elapsed * .11 * p.direction;
      p.object.position.set(Math.cos(angle) * p.radius, parkY + .004, Math.sin(angle) * p.radius);
      p.object.rotation.y = -angle + (p.direction > 0 ? 0 : Math.PI);
      p.legs.forEach((leg, i) => { leg.rotation.x = reduced ? 0 : Math.sin(elapsed * 4.3 + i * Math.PI + p.phase) * .22; });
    }
    balloon.position.copy(balloonAnchor); balloon.position.x += Math.sin(elapsed * .17) * .12; balloon.position.y += Math.sin(elapsed * .33) * .08;
    balloon.rotation.z = Math.sin(elapsed * .23) * .024;
    const drops = waterDrops.geometry.attributes.position;
    for (let i = 0; i < drops.count; i++) { fountainArcs[i % 6].getPoint((elapsed * .56 + Math.floor(i / 6) / 6) % 1, point); drops.setXYZ(i, point.x, point.y, point.z); }
    drops.needsUpdate = true;
    ripples.forEach((ring, i) => { const phase = (elapsed * .33 + i / 3) % 1; ring.scale.setScalar(.20 + phase * .47); ring.material.opacity = (.38 + night * .12) * (1 - phase); });
    const positions = fireflies.geometry.attributes.position;
    flies.forEach((fly, i) => positions.setXYZ(i, fly.x + Math.sin(elapsed * .52 + fly.phase) * .12, fly.y + Math.sin(elapsed * .74 + fly.phase) * .08, fly.z + Math.cos(elapsed * .43 + fly.phase) * .12)); positions.needsUpdate = true;
    for (const part of movingParts) {
      if (part.kind === 'wheel') { part.node.rotation.z += motionStep * (.23 + part.spin); part.spin *= Math.exp(-motionStep * 1.35); }
      else { part.node.rotation.z = part.base.z + (reduced ? 0 : Math.sin(elapsed * 1.10 + part.phase) * (.09 + part.spin * .035)); part.spin *= Math.exp(-motionStep * 1.1); }
    }
    let alive = 0;
    const sparkPositions = sparks.geometry.attributes.position;
    for (let i = 0; i < sparkLimit; i++) {
      const spark = sparkEvents[i];
      if (!spark || spark.age >= spark.life || reduced) { sparkPositions.setXYZ(i, 0, -10, 0); continue; }
      spark.age += motionStep; alive++; const t = spark.age;
      sparkPositions.setXYZ(i, spark.x + spark.vx*t, spark.y + spark.vy*t - .38*t*t, spark.z + spark.vz*t);
    }
    sparks.visible = alive > 0; sparkPositions.needsUpdate = true;
    forced = false; return true;
  }
  function motionChanged(event) { reduced = event.matches; forced = true; requestRender(); }
  function visibilityChanged() { hidden = document.hidden; lastTime = null; accumulator = 0; if (!hidden) { forced = true; requestRender(); } }
  media?.addEventListener?.('change', motionChanged);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibilityChanged);
  function dispose() {
    if (disposed) return; disposed = true;
    media?.removeEventListener?.('change', motionChanged);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibilityChanged);
    for (const [node, material] of bindings) node.material = material;
    for (const part of movingParts) part.node.rotation.copy(part.base);
    weather.dispose(); outskirts.dispose(); lighting.dispose();
    root.removeFromParent(); owned.forEach(resource => resource.dispose?.()); owned.clear(); bindings.clear(); materialCopies.clear(); movingParts.length = 0; sparkEvents.length = 0;
  }
  bindBuildings(); tick(0, 0);
  return { update, tick, effect, setTimeMode, setSeason, setWeather, getTimeMode: () => mode, getNightFactor: () => night,
    setOutskirtsVisible: value => { if(disposed)return false;forced=true;return outskirts.setVisible(value); },
    getAtmosphere: () => ({ ...lighting.getState(), ...weather.getState(), timeMode: mode }),
    setInteractionPaused: value => { const next=!!value;if(next===paused)return;paused=next;if(!paused){forced=true;requestRender();} }, dispose,
    // Bounded diagnostic counts support resource/reset checks without exposing rules.
    stats: () => ({ owned: owned.size, materialBindings: bindings.size, movingParts: movingParts.length, pedestrians: pedestrians.length, particles: 36 + 16 + sparkLimit, disposed }) };
}

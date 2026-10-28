// Slow foam crests follow the actual shoal outlines. This layer owns no game
// state, timers, lights, shared materials or animation loop.
export function createCoastalWaves({ THREE, world, boardBounds }) {
  const root = new THREE.Group(); root.name = 'regional_coastal_waves'; root.userData.cosmetic = true;
  const footprints = world.getObjectByName('harbor_three_islands')?.userData.islandFootprints || [];
  const cx = boardBounds?.cx || 0, cz = boardBounds?.cy || 0, STEP = 1.8;
  const outlines = footprints.map(({ points }) => {
    const center = points.reduce((sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length], [0, 0]);
    // The island builder expands its submerged shelf by 1.05. Start outside
    // that shelf, not at an imagined rectangular board boundary.
    return points.map(([x, z]) => [(center[0] + (x - center[0]) * 1.05 - cx) * STEP, (center[1] + (z - center[1]) * 1.05 - cz) * STEP]);
  });
  function inside(point, polygon) {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  }
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  function intersects(a, b, c, d) { return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0; }
  function overlaps(a, b) {
    if (a.some(point => inside(point, b)) || b.some(point => inside(point, a))) return true;
    return a.some((p, i) => b.some((q, j) => intersects(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
  }
  const noise = n => { const v = Math.sin(n * 127.1 + 19.7) * 43758.5453; return v - Math.floor(v); };
  const slots = [];
  for (const [island, outline] of outlines.entries()) for (let edge = 0; edge < outline.length; edge++) {
    const a = outline[edge], b = outline[(edge + 1) % outline.length], distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (distance < .28) continue;
    const tx = (b[0] - a[0]) / distance, tz = (b[1] - a[1]) / distance;
    let nx = -tz, nz = tx;
    const middle = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (inside([middle[0] + nx * .02, middle[1] + nz * .02], outline)) { nx *= -1; nz *= -1; }
    const pieces = Math.max(1, Math.ceil(distance / 1.45));
    for (let i = 0; i < pieces; i++) {
      const seed = island * 997 + edge * 17 + i * 113;
      // Leave breathing room between foam patches, including along long piers.
      if (noise(seed) < .30) continue;
      const along = distance * (i + .5) / pieces;
      const x = a[0] + tx * along, z = a[1] + tz * along;
      const length = Math.min(distance / pieces * .78, .65 + noise(seed + 1) * .75);
      const near = .10, far = .70 + noise(seed + 2) * .22;
      const envelope = [[-length / 2, near - .06], [length / 2, near - .06], [length / 2, far + .16], [-length / 2, far + .16]]
        .map(([t, n]) => [x + tx * t + nx * n, z + tz * t + nz * n]);
      // The entire swept strip must stay over open water, including concave
      // coast corners and the neighboring island across a narrow channel.
      if (outlines.some(polygon => overlaps(envelope, polygon))) continue;
      slots.push({ x, z, tx, tz, nx, nz, length, near, far, phase: noise(seed + 4), rank: noise(seed + 5) });
    }
  }
  slots.sort((a, b) => a.rank - b.rank); slots.length = Math.min(slots.length, 96);
  const samples = 9, across = 3, layers = 3, vertexCount = slots.length * samples * across * layers;
  const positions = new Float32Array(vertexCount * 3), opacity = new Float32Array(vertexCount), indices = [];
  for (let ribbon = 0; ribbon < slots.length * layers; ribbon++) for (let i = 0; i < samples - 1; i++) for (let side = 0; side < across - 1; side++) {
    const p = ribbon * samples * across + i * across + side;
    indices.push(p, p + 1, p + across, p + 1, p + across + 1, p + across);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('foamAlpha', new THREE.BufferAttribute(opacity, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({
    uniforms: { tint: { value: new THREE.Color('#e5f8ec') }, strength: { value: .58 } },
    vertexShader: 'attribute float foamAlpha; varying float vFoam; void main(){vFoam=foamAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform vec3 tint; uniform float strength; varying float vFoam; void main(){gl_FragColor=vec4(tint,strength*vFoam);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
  });
  const foam = new THREE.Mesh(geometry, material); foam.name = 'harbor_rolling_foam'; foam.frustumCulled = false; foam.raycast = () => {};
  root.add(foam); world.add(root); root.visible = slots.length > 0;
  let elapsed = 0, disposed = false, visible = true, lastNight = -1, lastReduced = false;
  function draw() {
    let vertex = 0;
    for (const slot of slots) for (let layer = 0; layer < layers; layer++) {
      const phase = (elapsed * .12 + slot.phase + layer / layers) % 1;
      const distance = slot.far + (slot.near - slot.far) * phase;
      const fade = Math.sin(phase * Math.PI) ** 1.4;
      for (let i = 0; i < samples; i++) {
        const u = i / (samples - 1), taper = Math.sin(u * Math.PI), along = (u - .5) * slot.length;
        const curl = taper * .07, halfWidth = .04 * taper;
        // A broad translucent shoulder fades to zero at both edges. The
        // visible crest reads as foam at phone scale, not a thin white wire.
        for (const side of [-1, 0, 1]) {
          const offset = distance + curl + side * halfWidth;
          positions[vertex * 3] = slot.x + slot.tx * along + slot.nx * offset;
          positions[vertex * 3 + 1] = -.392 + layer * .0005;
          positions[vertex * 3 + 2] = slot.z + slot.tz * along + slot.nz * offset;
          opacity[vertex++] = fade * taper * (1 - Math.abs(side));
        }
      }
    }
    geometry.attributes.position.needsUpdate = true; geometry.attributes.foamAlpha.needsUpdate = true;
  }
  draw();
  function tick(delta, { night = 0, reduced = false, paused = false } = {}) {
    if (disposed || !visible) return false;
    const darkness = Math.max(0, Math.min(1, Number.isFinite(night) ? night : 0));
    const lightingChanged = darkness !== lastNight || reduced !== lastReduced;
    material.uniforms.strength.value = (.58 - darkness * .20) * (reduced ? .65 : 1);
    lastNight = darkness; lastReduced = reduced;
    const dt = Math.min(.1, Math.max(0, Number.isFinite(delta) ? delta : 0));
    if (!paused && !reduced && dt > 0) { elapsed += dt; draw(); return slots.length > 0; }
    return lightingChanged && slots.length > 0;
  }
  function dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometry.dispose(); material.dispose(); }
  function setVisible(value) { if (disposed) return false; const next = !!value, changed = next !== visible; visible = next; root.visible = visible && slots.length > 0; return changed; }
  return { tick, dispose, setVisible, getState: () => ({ coastPatches: slots.length, crests: slots.length * layers, draws: slots.length ? 1 : 0, elapsed, visible, disposed }) };
}

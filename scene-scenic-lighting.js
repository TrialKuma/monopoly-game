// Decorative districts own their lighting copies; cached GLTF materials remain
// unchanged when a district is hidden, replaced, or disposed.
export function createScenicWindowLights({ THREE, own }) {
  const copies = new Map(), bindings = new Map();
  let night = 0, disposed = false;
  function apply(entry) {
    entry.material.emissive.copy(entry.base).lerp(entry.tint, night * .94);
    entry.material.emissiveIntensity = entry.intensity + night * entry.strength;
  }
  function copy(original) {
    if (!original?.isMeshStandardMaterial) return original;
    const name = original.name || '';
    const warm = /warm (lit|light|welcome|amber|lantern glass)|window glass|window recess|enamel window/i.test(name);
    const cool = /turquoise glass|deep sea glass|deep blue glazing|soft teal architectural glass|portal cyan/i.test(name);
    if (!warm && !cool) return original;
    if (!copies.has(original)) {
      const material = own(original.clone());
      const entry = { material, base: original.emissive.clone(), intensity: original.emissiveIntensity || 0,
        tint: new THREE.Color(cool ? '#62d6dd' : '#ffd390'), strength: cool ? 1.25 : 1.9 };
      copies.set(original, entry); apply(entry);
    }
    return copies.get(original).material;
  }
  function bind(root) {
    if (disposed) return;
    root.traverse(node => {
      if (!node.isMesh || bindings.has(node)) return;
      const original = node.material;
      const replacement = Array.isArray(original) ? original.map(copy) : copy(original);
      if (Array.isArray(original) ? replacement.some((m, i) => m !== original[i]) : replacement !== original) {
        bindings.set(node, original); node.material = replacement;
      }
    });
  }
  function update(value) {
    if (disposed) return false;
    const next = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    if (next === night) return false;
    night = next; copies.forEach(apply); return true;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; bindings.forEach((material, node) => { node.material = material; });
    bindings.clear(); copies.clear();
  }
  return { bind, update, dispose };
}

// One small mesh and one shared radial texture illuminate every lamp's footing.
// This is deliberately not a PointLight per lantern.
export function createGroundLightPools({ THREE, parent, own, positions, radius = .58 }) {
  if (!positions.length) return { update: () => false };
  const pixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const offset = (y * 32 + x) * 4, distance = Math.hypot((x - 15.5) / 15.5, (y - 15.5) / 15.5);
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 255;
    pixels[offset + 3] = Math.round(Math.pow(Math.max(0, 1 - distance), 1.8) * 255);
  }
  const texture = own(new THREE.DataTexture(pixels, 32, 32)); texture.needsUpdate = true;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  const vertices = [], uv = [];
  for (const [x, y, z] of positions) for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
    vertices.push(x + (u * 2 - 1) * radius, y, z + (v * 2 - 1) * radius); uv.push(u, v);
  }
  const geometry = own(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const material = own(new THREE.MeshBasicMaterial({ color: '#ffd199', map: texture, transparent: true, opacity: 0,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
  const pools = new THREE.Mesh(geometry, material); pools.name = 'scenic_lamp_ground_glows'; pools.raycast = () => {};
  pools.castShadow = false; pools.receiveShadow = false; parent.add(pools);
  return { update(value) { const opacity = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * .52;
    const changed = opacity !== material.opacity; material.opacity = opacity; pools.visible = opacity > .001; return changed; } };
}

// Procedural lantern glass is already batched by material. Recover only those
// explicit lamp positions, never guess lights from painted building colors.
export function proceduralLampPositions({ THREE, root, material }) {
  const groups = [], point = new THREE.Vector3(); root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert(), transform = new THREE.Matrix4();
  root.traverse(node => {
    if (!node.isMesh || node.material !== material || node.isInstancedMesh) return;
    transform.multiplyMatrices(inverse, node.matrixWorld);
    const position = node.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(transform);
      let group = groups.find(g => Math.abs(point.x - (g.minX + g.maxX) / 2) < .32 && Math.abs(point.z - (g.minZ + g.maxZ) / 2) < .32 && Math.abs(point.y - (g.minY + g.maxY) / 2) < .25);
      if (!group) { group = { minX: point.x, maxX: point.x, minY: point.y, maxY: point.y, minZ: point.z, maxZ: point.z }; groups.push(group); }
      group.minX = Math.min(group.minX, point.x); group.maxX = Math.max(group.maxX, point.x);
      group.minY = Math.min(group.minY, point.y); group.maxY = Math.max(group.maxY, point.y);
      group.minZ = Math.min(group.minZ, point.z); group.maxZ = Math.max(group.maxZ, point.z);
    }
  });
  return groups.map(g => [(g.minX + g.maxX) / 2, g.minY - .43, (g.minZ + g.maxZ) / 2]);
}

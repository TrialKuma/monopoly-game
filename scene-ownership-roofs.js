// Ownership changes the authored roof surfaces, never the whole building.
// Blender keeps its named roof/edge palette in COLOR_0 after material batching.
// These values come from art/blender-city/regions/{western,eastern,metropolitan}.py;
// the tolerance is only the published 8-bit linear-color quantization error.
const ROOF_PALETTES = {
  classic: ['#44556b', '#5a6a7d'], compact: ['#3d4b5b', '#586678'],
  expansion: ['#427d70', '#649589'], harbor: ['#277d91', '#438f9d'],
  alpine: ['#bc5839', '#dc7951'],
};
export const OWNERSHIP_ROOF_COLORS = Object.freeze({ human: '#329f96', ai: '#d26153' });
const BUILDING = /^(classic|compact|expansion|harbor|alpine)_(?:villa|shop|hotel|tower|skyscraper|finance|onsen)_[123]$/;
const TOLERANCE = 1 / 510 + .00003;
const NEIGHBOR_DISTANCE = .046;

export function createOwnershipRoofs({ THREE }) {
  const records = new Map(), masks = new WeakMap();
  const palettes = Object.fromEntries(Object.entries(ROOF_PALETTES).map(([key, colors]) => [key, colors.map(hex => new THREE.Color(hex))]));
  const neutralTrim = new THREE.Color('#f3e4c7');
  const metropolitanDeck = new THREE.Color('#283f3c');
  const colors = Object.fromEntries(Object.entries(OWNERSHIP_ROOF_COLORS).map(([key, hex]) => [key, new THREE.Color(hex)]));
  const matches = (attribute, index, color) => Math.max(Math.abs(attribute.getX(index) - color.r), Math.abs(attribute.getY(index) - color.g), Math.abs(attribute.getZ(index) - color.b)) <= TOLERANCE;
  const cell = value => Math.floor(value / NEIGHBOR_DISTANCE);
  const keyFor = (x, y, z) => `${x},${y},${z}`;

  function markMetropolitanDecks(geometry, values) {
    // metropolitan.py crown(): the inset flat roof is a broad 'recess' slab,
    // while the same paint on door/window reveals is a narrow vertical strip.
    // Find individual connected, horizontal top faces. Area and BOTH spans
    // must describe a roof deck; never combine disconnected window ledges at
    // a common height, and never use a building-height cutoff.
    const position = geometry.attributes.position, color = geometry.attributes.color, index = geometry.index;
    const triangles = [], parents = [], vertices = new Map();
    const find = i => { while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; } return i; };
    const vertexKey = i => [position.getX(i), position.getY(i), position.getZ(i)].map(value => Math.round(value * 100000)).join(',');
    for (let offset = 0, end = index ? index.count : position.count; offset + 2 < end; offset += 3) {
      const ids = [0, 1, 2].map(k => index ? index.getX(offset + k) : offset + k);
      if (!ids.every(i => matches(color, i, metropolitanDeck))) continue;
      const [a, b, c] = ids.map(i => [position.getX(i), position.getY(i), position.getZ(i)]);
      const ab = b.map((value, i) => value - a[i]), ac = c.map((value, i) => value - a[i]);
      const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const length = Math.hypot(...normal);
      if (length < 1e-10 || normal[1] / length < .9999) continue;
      const id = triangles.length; parents.push(id); triangles.push({ ids, area: length * .5 });
      for (const vertex of ids) {
        const key = vertexKey(vertex);
        if (vertices.has(key)) parents[find(id)] = find(vertices.get(key)); else vertices.set(key, id);
      }
    }
    const components = new Map();
    triangles.forEach((triangle, id) => {
      const key = find(id); if (!components.has(key)) components.set(key, { area: 0, vertices: new Set(), minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const part = components.get(key); part.area += triangle.area;
      for (const i of triangle.ids) { part.vertices.add(i); part.minX = Math.min(part.minX, position.getX(i)); part.maxX = Math.max(part.maxX, position.getX(i)); part.minZ = Math.min(part.minZ, position.getZ(i)); part.maxZ = Math.max(part.maxZ, position.getZ(i)); }
    });
    let count = 0, surfaces = 0;
    for (const part of components.values()) {
      if (part.area < .025 || part.maxX - part.minX < .16 || part.maxZ - part.minZ < .16) continue;
      surfaces++;
      for (const i of part.vertices) if (!values[i]) { values[i] = 1; count++; }
    }
    return { vertices: count, surfaces };
  }

  function roofMask(geometry, name, region) {
    if (masks.has(geometry)) return masks.get(geometry);
    const position = geometry.attributes.position, color = geometry.attributes.color;
    if (!position || !color) return null;
    const [roof, edge] = palettes[region], values = new Uint8Array(position.count), grid = new Map();
    let count = 0, edgeCount = 0;
    for (let i = 0; i < position.count; i++) {
      if (!matches(color, i, roof)) continue;
      values[i] = 1; count++;
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const key = keyFor(cell(x), cell(y), cell(z));
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push([x, y, z]);
    }
    // Roof-edge paint is also used on a few coastal shutter straps. Only edge
    // vertices adjacent to real roof tiles participate, keeping those shutters
    // and every wall/window/plant in the region's original palette.
    for (let i = 0; i < position.count; i++) {
      if (values[i] || !matches(color, i, edge)) continue;
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const cx = cell(x), cy = cell(y), cz = cell(z); let nearby = false;
      for (let dx = -1; dx <= 1 && !nearby; dx++) for (let dy = -1; dy <= 1 && !nearby; dy++) for (let dz = -1; dz <= 1 && !nearby; dz++) {
        nearby = (grid.get(keyFor(cx + dx, cy + dy, cz + dz)) || []).some(point => (point[0] - x) ** 2 + (point[1] - y) ** 2 + (point[2] - z) ** 2 <= NEIGHBOR_DISTANCE ** 2);
      }
      if (nearby) { values[i] = 2; count++; edgeCount++; }
    }
    // The first coastal tower has a flat plaster roof and a timber pergola.
    // This is its authored top slab (western.py: top=1.17, slab z=1.25,
    // height=.12, exported scale=.3523131744), not a generic height heuristic.
    // Select only the slab's trim faces; the pergola, parapet and facade stay put.
    if (name === 'harbor_tower_1') {
      for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);
        if (!values[i] && matches(color, i, neutralTrim) && y >= .4295 && y <= .4620) { values[i] = 1; count++; }
      }
    }
    const flatDecks = region === 'expansion' ? markMetropolitanDecks(geometry, values) : { vertices: 0, surfaces: 0 };
    count += flatDecks.vertices;
    const result = { vertices: count, edgeVertices: edgeCount, totalVertices: position.count, flatDeckVertices: flatDecks.vertices, flatDeckSurfaces: flatDecks.surfaces };
    if (count) {
      geometry.setAttribute('cityRoofMask', new THREE.Uint8BufferAttribute(values, 1));
      geometry.userData.ownershipRoofMask = { ...result, model: name, source: 'authored_roof_palette' };
    }
    masks.set(geometry, result); return result;
  }

  function ownedMaterial(original, uniforms) {
    const copy = original.clone(), previous = original.onBeforeCompile;
    const previousKey = original.customProgramCacheKey?.call(original) || '';
    copy.userData.ownershipRoof = true;
    copy.onBeforeCompile = (shader, renderer) => {
      previous?.call(copy, shader, renderer);
      shader.uniforms.cityOwnerRoofColor = uniforms.color;
      shader.uniforms.cityOwnerRoofActive = uniforms.active;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float cityRoofMask;\nvarying float vCityRoofMask;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCityRoofMask = cityRoofMask;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 cityOwnerRoofColor;\nuniform float cityOwnerRoofActive;\nvarying float vCityRoofMask;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float roofStrength = clamp(vCityRoofMask, 0.0, 1.0) * cityOwnerRoofActive;
          float roofEdgeLight = mix(0.92, 1.12, clamp(vCityRoofMask - 1.0, 0.0, 1.0));
          vec3 roofReflectance = diffuseColor.rgb;
          #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
            roofReflectance /= max(vColor.rgb, vec3(0.0001));
          #endif
          diffuseColor.rgb = mix(diffuseColor.rgb, cityOwnerRoofColor * roofEdgeLight * roofReflectance, roofStrength);`);
    };
    copy.customProgramCacheKey = () => `${previousKey}|ownership-roof-v1`;
    return copy;
  }

  function set(model, ownerId) {
    if (!model || !BUILDING.test(model.name)) return null;
    let record = records.get(model);
    if (!record && !colors[ownerId]) return null;
    if (!record) {
      const region = BUILDING.exec(model.name)[1];
      record = { bindings: [], materials: new Set(), uniforms: { color: { value: colors.human.clone() }, active: { value: 0 } }, vertices: 0 };
      const copies = new Map();
      model.traverse(node => {
        if (!node.isMesh || !node.geometry || Array.isArray(node.material)) return;
        const original = node.material;
        // The separate glass and plant primitives cannot acquire a roof mask.
        if (!original?.vertexColors || !/ \/ (solid|roof ceramic)$/.test(original.name)) return;
        const mask = roofMask(node.geometry, model.name, region);
        if (!mask?.vertices) return;
        record.vertices += mask.vertices;
        if (!copies.has(original)) { const material = ownedMaterial(original, record.uniforms); copies.set(original, material); record.materials.add(material); }
        node.material = copies.get(original); record.bindings.push({ node, original, copy: node.material });
      });
      records.set(model, record);
    }
    record.uniforms.active.value = colors[ownerId] ? 1 : 0;
    if (colors[ownerId]) record.uniforms.color.value.copy(colors[ownerId]);
    model.userData.roofOwner = colors[ownerId] ? ownerId : null;
    model.userData.ownershipRoofVertices = record.vertices;
    return { owner: model.userData.roofOwner, vertices: record.vertices };
  }

  function release(model) {
    const record = records.get(model); if (!record) return;
    for (const { node, original, copy } of record.bindings) if (node.material === copy) node.material = original;
    record.materials.forEach(material => material.dispose()); records.delete(model);
    delete model.userData.roofOwner; delete model.userData.ownershipRoofVertices;
  }
  function clear() { for (const model of records.keys()) release(model); }
  return { set, release, clear, dispose: clear };
}

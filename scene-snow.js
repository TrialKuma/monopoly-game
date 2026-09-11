// A thin, separate snow surface follows the exposed roofs of each building.
// Roofs are sampled once in small work batches; no model is raycast per frame
// and neither the shared model geometry nor its materials are changed.
export function createRoofSnow({ THREE, world, requestRender = () => {} }) {
  const records = new Map(), cache = new Map(), queue = [];
  const material = new THREE.MeshStandardMaterial({ color: '#f2f7fc', roughness: .96,
    metalness: 0, emissive: '#bacfe4', emissiveIntensity: .035, transparent: true,
    opacity: 0, depthWrite: true });
  material.name = 'Cosmetic roof snow';
  let amount = 0, disposed = false, stamp = 0, trianglesProcessed = 0;
  const clamp = value => Math.max(0, Math.min(1, value));
  const excludedMaterial = /window|glazing|glass|lantern|lamp|light|portal|water|pool|spring[s ]|foam|foliage|leaf|shrub|topiary|pine|maple|soil|earth|card heart|cherry card|fortune amethyst/i;
  const excludedPart = /(?:^life_|card(?:_| )?(?:panel|face|heart|suit)|window|glaz|lamp|lantern|foliage|tree|shrub|water|pool)/i;
  function belongs(node) { for (let p = node; p; p = p.parent) if (p === world) return true; return false; }
  function cosmetic(node) { for (let p = node; p; p = p.parent) if (p.userData.cosmetic) return true; return false; }
  function partsFor(model) {
    const parts = [], bounds = new THREE.Box3(), identity = new THREE.Matrix4();
    function visit(node, matrix, blocked = false) {
      if (node.userData.cosmetic || node.userData.lifePart || node.name?.startsWith('life_')) return;
      node.updateMatrix();
      const local = node === model ? matrix : matrix.clone().multiply(node.matrix);
      const forbidden = blocked || excludedPart.test(node.name || '');
      if (node.isMesh && node.geometry?.attributes.position && !node.isInstancedMesh) {
        const geometry = node.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        bounds.union(geometry.boundingBox.clone().applyMatrix4(local));
        parts.push({ geometry, matrix: local, materials: Array.isArray(node.material) ? node.material : [node.material], forbidden });
      }
      for (const child of node.children) visit(child, local, forbidden);
    }
    visit(model, identity);
    // Model roots only rotate around the vertical axis. The caps inherit all
    // instance transforms, including the short building-upgrade animation.
    const unit = Math.max(.1, Math.abs(model.scale.x)), heightUnit = Math.max(.1, Math.abs(model.scale.y));
    const key = `${model.name}|${unit.toFixed(5)}|${heightUnit.toFixed(5)}|` + parts.map(part =>
      `${part.geometry.uuid}:${part.forbidden ? 1 : 0}:${part.materials.map(mat => mat?.name || mat?.color?.getHexString() || '').join(',')}:${part.matrix.elements.map(v => v.toFixed(5)).join(',')}`).join(';');
    return { parts, bounds, unit, heightUnit, key };
  }
  function eligible(material, forbidden) {
    if (!material || forbidden || material.visible === false || material.opacity < .85) return false;
    if (excludedMaterial.test(material.name || '')) return false;
    if (material.emissive && material.emissiveIntensity * (material.emissive.r + material.emissive.g + material.emissive.b) > .04) return false;
    return true;
  }
  function* build(entry) {
    const { parts, bounds, unit, heightUnit } = entry;
    if (bounds.isEmpty()) return null;
    // About 35–50 samples across an ordinary building; bounded for wide estates.
    const step = Math.max(.029 / unit, (bounds.max.x - bounds.min.x) / 105, (bounds.max.z - bounds.min.z) / 105);
    const nx = Math.ceil((bounds.max.x - bounds.min.x) / step) + 1;
    const nz = Math.ceil((bounds.max.z - bounds.min.z) / step) + 1;
    const count = nx * nz, heights = new Float32Array(count); heights.fill(-Infinity);
    const suitable = new Uint8Array(count), sourceNormals = new Float32Array(count);
    const minHeight = bounds.min.y + .175 / heightUnit;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
    let work = 0;
    for (const part of parts) {
      const { geometry, matrix } = part, positions = geometry.attributes.position, indices = geometry.index;
      const end = indices ? indices.count : positions.count;
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: end, materialIndex: 0 }];
      for (const group of groups) {
        const canHold = eligible(part.materials[part.materials.length === 1 ? 0 : group.materialIndex || 0], part.forbidden);
        for (let i = group.start; i + 2 < Math.min(end, group.start + group.count); i += 3) {
          if (++work >= 1400) { trianglesProcessed += work; work = 0; yield; }
          a.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(matrix);
          b.fromBufferAttribute(positions, indices ? indices.getX(i + 1) : i + 1).applyMatrix4(matrix);
          c.fromBufferAttribute(positions, indices ? indices.getX(i + 2) : i + 2).applyMatrix4(matrix);
          normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
          if (normal.y < .08 || Math.max(a.y, b.y, c.y) < minHeight) continue;
          const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
          if (Math.abs(denominator) < 1e-10) continue;
          const ix0 = Math.max(0, Math.ceil((Math.min(a.x, b.x, c.x) - bounds.min.x) / step - 1e-6));
          const ix1 = Math.min(nx - 1, Math.floor((Math.max(a.x, b.x, c.x) - bounds.min.x) / step + 1e-6));
          const iz0 = Math.max(0, Math.ceil((Math.min(a.z, b.z, c.z) - bounds.min.z) / step - 1e-6));
          const iz1 = Math.min(nz - 1, Math.floor((Math.max(a.z, b.z, c.z) - bounds.min.z) / step + 1e-6));
          for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
            const x = bounds.min.x + ix * step, z = bounds.min.z + iz * step;
            const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
            const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
            if (u < -1e-5 || v < -1e-5 || u + v > 1.00001) continue;
            const y = u * a.y + v * b.y + (1 - u - v) * c.y, index = iz * nx + ix;
            // Ineligible surfaces still occlude roofs below (skylights, trees,
            // water and decorative panels must not receive a floating cap).
            if (y > heights[index] + 1e-6) {
              heights[index] = y;
              suitable[index] = canHold && normal.y >= .48 && y >= minHeight ? 1 : 0;
              sourceNormals[index] = normal.y;
            }
          }
        }
      }
    }
    trianglesProcessed += work;
    yield;
    const topTriangles = [], maxRise = step * 1.72 + .009 / heightUnit;
    const addTop = (x, y, z) => {
      if (!suitable[x] || !suitable[y] || !suitable[z]) return;
      if (Math.max(heights[x], heights[y], heights[z]) - Math.min(heights[x], heights[y], heights[z]) > maxRise) return;
      topTriangles.push([x, y, z]);
    };
    for (let iz = 0; iz < nz - 1; iz++) for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix, b = a + 1, c = a + nx, d = c + 1;
      addTop(a, c, b); addTop(b, c, d);
    }
    // Discard tiny isolated trim flecks; this also keeps rails and window
    // ledges from reading as a second white facade.
    const adjacency = new Map();
    topTriangles.forEach((triangle, index) => triangle.forEach(vertex => {
      if (!adjacency.has(vertex)) adjacency.set(vertex, []); adjacency.get(vertex).push(index);
    }));
    const visited = new Uint8Array(topTriangles.length), retained = [];
    const minTriangles = Math.max(4, Math.ceil(.0025 / (step * step * unit * unit * .5)));
    topTriangles.forEach((_, start) => {
      if (visited[start]) return;
      const component = [], pending = [start]; visited[start] = 1;
      while (pending.length) {
        const index = pending.pop(); component.push(index);
        for (const vertex of topTriangles[index]) for (const neighbor of adjacency.get(vertex)) if (!visited[neighbor]) { visited[neighbor] = 1; pending.push(neighbor); }
      }
      if (component.length >= minTriangles) retained.push(...component.map(index => topTriangles[index]));
    });
    if (!retained.length) return null;
    yield;
    const base = [], full = [], indices = [], vertexMap = new Map(), edges = new Map();
    const thicknessAt = index => {
      const x = (index % nx) * step * unit, z = Math.floor(index / nx) * step * unit;
      return (.036 + Math.sin(x * 14.1 + z * 7.3) * .004 + Math.cos(z * 19.3 - x * 6.7) * .003) / heightUnit;
    };
    const vertex = (index, low = false) => {
      const x = bounds.min.x + (index % nx) * step, z = bounds.min.z + Math.floor(index / nx) * step;
      const y = heights[index] + (low ? .002 : .007) / heightUnit;
      const result = base.length / 3; base.push(x, y, z); full.push(x, low ? y : y + thicknessAt(index), z); return result;
    };
    for (const triangle of retained) {
      for (const index of triangle) { if (!vertexMap.has(index)) vertexMap.set(index, vertex(index)); indices.push(vertexMap.get(index)); }
      for (let i = 0; i < 3; i++) {
        const a = triangle[i], b = triangle[(i + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (edges.has(key)) edges.delete(key); else edges.set(key, [a, b]);
      }
    }
    const topIndexCount = indices.length;
    for (const [a, b] of edges.values()) {
      const at = vertex(a), bt = vertex(b), ab = vertex(a, true), bb = vertex(b, true);
      indices.push(at, ab, bt, bt, ab, bb);
    }
    const geometry = entry.geometry;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(base, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(full, 3)];
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometry.userData.roofSnow = { topIndexCount, capTriangles: retained.length, borderEdges: edges.size,
      minSourceNormal: Math.min(...Array.from(vertexMap.keys(), index => sourceNormals[index])),
      stepWorld: step * unit, maxDepthWorld: .048, model: entry.name };
    return geometry;
  }
  function install(record) {
    if (!record.entry.done || !record.entry.geometry || !belongs(record.model) || record.root?.parent === record.model) return;
    record.mesh.updateMorphTargets(); record.mesh.morphTargetInfluences[0] = amount;
    record.root.visible = amount > .003; record.model.add(record.root); record.installed = true;
  }
  function release(record) {
    record.root?.removeFromParent(); record.entry.refs--; record.entry.used = ++stamp;
  }
  function prune() {
    for (const [key, entry] of cache) if (!entry.refs && !entry.done) { entry.geometry?.dispose(); cache.delete(key); }
    const unused = Array.from(cache.values()).filter(entry => !entry.refs).sort((a, b) => a.used - b.used);
    while (cache.size > 48 && unused.length) { const entry = unused.shift(); entry.geometry?.dispose(); cache.delete(entry.key); }
  }
  function refresh() {
    if (disposed) return;
    for (const [model, record] of records) if (!belongs(model)) { release(record); records.delete(model); }
    const targets = [];
    world.traverse(node => {
      if (!node.userData.snowTarget || cosmetic(node)) return;
      for (const child of node.children) if (!child.userData.cosmetic && !records.has(child)) targets.push(child);
    });
    for (const model of targets) {
      const data = partsFor(model); if (!data.parts.length) continue;
      let entry = cache.get(data.key);
      if (!entry) {
        // Three.js object constructors make UUIDs using Math.random. Allocate
        // them during the existing scene refresh, never inside a weather tick.
        entry = { ...data, name: model.name, refs: 0, geometry: new THREE.BufferGeometry(), done: false, used: ++stamp };
        entry.iterator = build(entry); cache.set(entry.key, entry); queue.push(entry);
      }
      entry.refs++; entry.used = ++stamp;
      const record = { model, entry, root: null, mesh: null, installed: false };
      if (entry.geometry) {
        record.root = new THREE.Group(); record.root.name = 'building_roof_snow'; record.root.userData.cosmetic = true;
        record.mesh = new THREE.Mesh(entry.geometry, material); record.mesh.name = 'roof_snow_cap';
        record.mesh.raycast = () => {}; record.mesh.castShadow = false; record.mesh.receiveShadow = true; record.root.add(record.mesh);
      }
      records.set(model, record); install(record);
    }
    prune();
  }
  function work() {
    let changed = false;
    // Each step visits at most a few thousand source triangles. Work is spread
    // over existing scene frames, including clear weather before snow arrives.
    for (let batch = 0; batch < 3 && queue.length; batch++) {
      const entry = queue[0];
      if (cache.get(entry.key) !== entry || !entry.refs) { queue.shift(); continue; }
      const result = entry.iterator.next();
      if (!result.done) continue;
      if (!result.value) { entry.geometry.dispose(); entry.geometry = null; }
      entry.done = true; entry.iterator = null; entry.parts = null; queue.shift();
      for (const record of records.values()) if (record.entry === entry) install(record);
      changed = true;
    }
    return changed;
  }
  function tick(delta, { snow = 0, rain = 0, snowfall = snow > .1, season = 'winter', reduced = false, paused = false } = {}) {
    if (disposed) return false;
    const previous = amount;
    const dt = Math.min(.12, Math.max(0, Number.isFinite(delta) ? delta : 0));
    if (reduced) amount = snowfall ? 1 : 0;
    else if (!paused) {
      if (snowfall) amount += dt * (.07 + clamp(snow) * .055);
      else amount -= dt * (clamp(rain) * .10 + (season === 'winter' ? .019 : .039));
      amount = clamp(amount);
    }
    const built = work();
    if (built || Math.abs(previous - amount) > 1e-7) {
      material.opacity = Math.min(1, amount * 6);
      for (const record of records.values()) if (record.installed) { record.root.visible = amount > .003; record.mesh.morphTargetInfluences[0] = amount; }
    }
    // Reduced-motion mode does not keep the scene awake for flakes, but its
    // queued roof extraction still finishes in bounded batches.
    if (queue.length && (reduced || paused)) requestRender();
    return built || Math.abs(previous - amount) > 1e-7 || queue.length > 0;
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const record of records.values()) record.root?.removeFromParent();
    for (const entry of cache.values()) entry.geometry?.dispose();
    material.dispose(); records.clear(); cache.clear(); queue.length = 0;
  }
  function getState() { return { amount, buildings: records.size, caps: Array.from(records.values()).filter(record => record.installed).length,
    pending: queue.length, cached: cache.size, trianglesProcessed }; }
  return { refresh, tick, getState, dispose };
}

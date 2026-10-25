// Cosmetic celebrations shared by the board and the player's town. Neither
// the transition tracker nor the renderer changes inventory or game rules.
export function createLevelThreeTracker() {
  let scope = null, previous = new Map();
  return {
    observe(nextScope, entries, enabled = true) {
      const current = new Map(entries.map(entry => [entry.id, { level: Number(entry.level) || 0, owner: entry.owner }]));
      const reached = [];
      if (scope === nextScope && enabled) for (const entry of entries) {
        const before = previous.get(entry.id);
        if (before && before.level > 0 && before.level < 3 && Number(entry.level) === 3 && entry.owner) reached.push(entry);
      }
      // Copy primitives: game snapshots deliberately reuse mutable lot objects.
      scope = nextScope; previous = current; return reached;
    },
    reset() { scope = null; previous.clear(); }
  };
}

export function buildingRoofAnchor(THREE, object, fullScaleY = null) {
  const scaleY = object.scale.y;
  if (fullScaleY !== null) object.scale.y = fullScaleY;
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(object), anchor = bounds.getCenter(new THREE.Vector3());
  anchor.y = bounds.max.y;
  object.scale.y = scaleY; object.updateWorldMatrix(true, true);
  return bounds.isEmpty() || !Number.isFinite(anchor.y) ? null : anchor;
}

export function createBuildingFireworks({ THREE, parent, reducedMotion = () => false, requestRender = () => {} }) {
  const root = new THREE.Group(); root.name = 'building_level_three_fireworks'; parent.add(root);
  const shows = new Map(), dummy = new THREE.Object3D(), gold = new THREE.Color('#ffd06a');
  let geometry = null, disposed = false, launches = 0;
  const duration = 1880, sparks = 24, cap = 2;
  function remove(key) {
    const show = shows.get(key); if (!show) return;
    for (const burst of show.bursts) { root.remove(burst.mesh); burst.mesh.material.dispose(); burst.mesh.dispose(); }
    shows.delete(key);
    if (!shows.size && geometry) { geometry.dispose(); geometry = null; }
  }
  function launch({ key, anchor, color = '#62d2b4', now = performance.now() }) {
    if (disposed || reducedMotion() || shows.has(key) || shows.size >= cap || !anchor) return false;
    geometry ||= new THREE.OctahedronGeometry(1, 0);
    const owner = new THREE.Color(color), origin = anchor.clone(); origin.y += .14;
    const bursts = [0, 1, 2].map(index => {
      const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const mesh = new THREE.InstancedMesh(geometry, material, sparks + 1); mesh.frustumCulled = false;
      mesh.name = `roof_firework_${index}`; mesh.visible = false; mesh.renderOrder = 8;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let n = 0; n <= sparks; n++) mesh.setColorAt(n, n % 3 ? gold : owner);
      root.add(mesh);
      return { mesh, delay: index * .23, x: [-.38, .39, 0][index], z: [.12, -.13, .16][index], height: [.7, 1.05, .9][index] };
    });
    shows.set(key, { origin, started: now, bursts }); launches++; requestRender(); return true;
  }
  function tick(time) {
    if (!shows.size) return false;
    if (reducedMotion()) { clear(); return true; }
    for (const [key, show] of shows) {
      if (time - show.started >= duration) { remove(key); continue; }
      const age = Math.max(0, (time - show.started) / 1000);
      for (const burst of show.bursts) {
        const elapsed = age - burst.delay, mesh = burst.mesh; mesh.visible = elapsed >= 0 && elapsed < 1.39;
        if (!mesh.visible) continue;
        const flying = elapsed < .19, expand = Math.max(0, elapsed - .19), fade = Math.max(0, 1 - expand / 1.2);
        mesh.material.opacity = flying ? .9 : fade * fade;
        for (let n = 0; n <= sparks; n++) {
          dummy.position.copy(show.origin); dummy.rotation.set(0, 0, 0);
          if (flying) {
            const t = elapsed / .19;
            dummy.position.x += burst.x * t; dummy.position.z += burst.z * t; dummy.position.y += burst.height * t;
            dummy.scale.set(n === sparks ? .045 : 0, n === sparks ? .12 : 0, n === sparks ? .045 : 0);
          } else if (n === sparks) dummy.scale.setScalar(0);
          else {
            const angle = n * Math.PI * 2 / sparks + burst.delay * 2, elevation = .15 + (n % 4) * .24, speed = .8 + (n % 3) * .15;
            const radius = expand * speed * (1 - expand * .22);
            dummy.position.x += burst.x + Math.cos(angle) * radius;
            dummy.position.z += burst.z + Math.sin(angle) * radius;
            dummy.position.y += burst.height + elevation * expand - .42 * expand * expand;
            const scale = (.047 + (n % 3) * .012) * (.45 + fade * .55);
            dummy.scale.set(scale, scale * (1.25 + fade), scale); dummy.rotation.set(angle, angle * .7, angle + expand * 2);
          }
          dummy.updateMatrix(); mesh.setMatrixAt(n, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    return true;
  }
  function clear() { for (const key of [...shows.keys()]) remove(key); }
  return { launch, tick, clear,
    get active() { return shows.size > 0; },
    getState: () => ({ active: shows.size, launches, bursts: shows.size * 3, particles: shows.size * sparks * 3, anchors: [...shows.values()].map(show => ({ x: show.origin.x, y: show.origin.y, z: show.origin.z })) }),
    dispose() { if (disposed) return; disposed = true; clear(); root.removeFromParent(); }
  };
}

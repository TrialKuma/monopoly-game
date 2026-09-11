// Small pieces of shoreline give the board a setting without inventing another
// route. Everything remains outside the board plinth and below the tile tops.
// This module owns its resources, but no clock, RNG stream, hit targets or lights.
export function createCityOutskirts({ THREE, world, boardBounds, mapId = 'classic', requestRender = () => {} }) {
  const owned = new Set(), root = new THREE.Group();
  root.name = 'city_outskirts'; root.userData.cosmetic = true; world.add(root);
  const own = item => { owned.add(item); return item; };
  const material = (name, color, extra = {}) => {
    const item = own(new THREE.MeshStandardMaterial({ color, roughness: .8, ...extra }));
    item.name = `outskirts_${name}`; return item;
  };
  const theme = {
    classic: { water: '#74b9c6', sand: '#d1cba9', stone: '#b8c1ab', shrubs: ['#84a878', '#a0b68c', '#71976b'], flowers: '#edbc8b' },
    compact: { water: '#55bbc4', sand: '#dccca7', stone: '#c7beaa', shrubs: ['#689e80', '#7fb096', '#97bea0'], flowers: '#de9cbd' },
    expansion: { water: '#6fa6bf', sand: '#b5c5b5', stone: '#b0b8b6', shrubs: ['#7b9b84', '#91ad90', '#6c927d'], flowers: '#e2bc77' },
  }[mapId] || { water: '#74b9c6', sand: '#d1cba9', stone: '#b8c1ab', shrubs: ['#84a878', '#a0b68c', '#71976b'], flowers: '#edbc8b' };
  const waterMat = material('water', theme.water, { roughness: .3, metalness: .05, emissive: '#1d4c59', emissiveIntensity: .045 });
  const sandMat = material('shore', theme.sand), rockMat = material('stone', theme.stone);
  const shrubMat = material('foliage', '#ffffff'), flowerMat = material('blossoms', theme.flowers);
  const ironMat = material('bollard', '#65716b'), lampMat = material('lamp', '#ffdda2', { emissive: '#ffcf7c', emissiveIntensity: .08 });
  const foamMat = material('ripple', '#d9eeee', { transparent: true, opacity: .48, depthWrite: false, roughness: .45 });
  const sphere = own(new THREE.IcosahedronGeometry(1, 1));
  const cube = own(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 8));
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const w = Math.max(3, Number(boardBounds?.w) || 11.55), d = Math.max(3, Number(boardBounds?.d) || 9.9);
  const stoneData = [], shrubData = [], flowerData = [], postData = [], glowData = [], waveData = [], boats = [];
  let disposed = false, elapsed = 0, lastNight = -1;

  function mesh(name, geometry, mat, parent = root) {
    const item = new THREE.Mesh(geometry, mat); item.name = `outskirts_${name}`;
    item.raycast = () => {}; item.castShadow = false; item.receiveShadow = true;
    item.userData.cosmetic = true; parent.add(item); return item;
  }
  function shapeSlab(name, points, depth, mat, group, y, bevel = 0) {
    const shape = new THREE.Shape(); shape.moveTo(points[0][0], -points[0][1]);
    for (const [x, z] of points.slice(1)) shape.lineTo(x, -z);
    shape.closePath();
    const geo = own(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSegments: 1, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 1 }));
    geo.rotateX(-Math.PI / 2);
    const item = mesh(name, geo, mat, group); item.position.y = y; return item;
  }
  function place(group, x, y, z, sx, sy, sz, rotation = 0) {
    const point = new THREE.Vector3(x, y, z).applyMatrix4(group.matrix);
    return { x: point.x, y: point.y, z: point.z, sx, sy, sz, rotation: rotation + group.rotation.y };
  }
  function instances(name, geometry, mat, data, palette) {
    const item = own(new THREE.InstancedMesh(geometry, mat, data.length));
    item.name = `outskirts_${name}`; item.raycast = () => {}; item.castShadow = false; item.receiveShadow = true;
    item.userData.cosmetic = true; root.add(item);
    data.forEach((entry, i) => {
      setInstance(item, i, entry);
      if (palette) item.setColorAt(i, color.set(palette[i % palette.length]));
    });
    item.instanceMatrix.needsUpdate = true;
    if (item.instanceColor) item.instanceColor.needsUpdate = true;
    item.computeBoundingSphere(); return item;
  }
  function setInstance(item, i, entry, waveOffset = 0) {
    dummy.position.set(entry.x, entry.y + waveOffset, entry.z); dummy.rotation.set(0, entry.rotation || 0, 0);
    dummy.scale.set(entry.sx, entry.sy, entry.sz); dummy.updateMatrix(); item.setMatrixAt(i, dummy.matrix);
  }
  function boat(group, x, z, angle, index) {
    const hull = new THREE.Group(); hull.name = `outskirts_boat_${index}`; group.add(hull);
    hull.position.set(x, -.292, z); hull.rotation.y = angle;
    const length = .53, beam = .19;
    const outline = [[-length / 2, -.06], [-length * .37, -beam / 2], [length * .31, -beam / 2], [length / 2, 0], [length * .31, beam / 2], [-length * .37, beam / 2], [-length / 2, .06]];
    shapeSlab('boat_hull', outline, .065, material(`boat_paint_${index}`, index % 2 ? '#efc976' : '#e8c9a5'), hull, 0, .012);
    const inset = outline.map(([px, pz]) => [px * .74, pz * .63]);
    shapeSlab('boat_seat', inset, .012, ironMat, hull, .068);
    const cabin = mesh('boat_cabin', cube, sandMat, hull); cabin.position.set(-.03, .105, 0); cabin.scale.set(.17, .08, .11);
    boats.push({ item: hull, y: hull.position.y, angle, phase: index * 2.3 });
  }

  // Two short, unequal sections leave the corners open. The inner shoreline is
  // 6 cm beyond the existing w/d + 1.28 plinth; no scenery changes camera bounds.
  const sections = [
    { x: -w * .14, z: d / 2 + .70, rotation: 0, length: w * .57 },
    { x: w / 2 + .70, z: -d * .16, rotation: Math.PI / 2, length: d * .49 },
  ];
  sections.forEach((section, s) => {
    const group = new THREE.Group(); group.name = `outskirts_shore_${s}`;
    group.position.set(section.x, 0, section.z); group.rotation.y = section.rotation; group.updateMatrix(); root.add(group);
    const l = section.length, h = l / 2;
    const points = [[-h, .10], [-h + .19, 0], [h - .16, 0], [h, .12], [h - .22, .54], [l * .24, .75], [0, .67], [-l * .27, .82], [-h + .16, .56]];
    shapeSlab('shore_base', points, .055, sandMat, group, -.42, .026);
    shapeSlab('water', points.map(([x, z]) => [x * .98, z * .94 + .012]), .027, waterMat, group, -.354, .012);
    // Flattened stones read as a bank, never as a chain of numbered game cells.
    for (let i = 0; i < 15; i++) {
      const x = -h + .25 + (l - .5) * i / 14;
      stoneData.push(place(group, x, -.275, .19 + Math.sin(i * 2.1) * .025, .13 + i % 3 * .018, .052, .08, i * .31));
    }
    for (let i = 0; i < 8; i++) {
      const x = -h + .43 + (l - .9) * i / 7;
      const z = .18 + (i % 2) * .035, size = .08 + (i % 3) * .022;
      shrubData.push(place(group, x, -.15, z, size * 1.2, size, size));
      if (i % 2) flowerData.push(place(group, x + .014, -.067, z + .012, .025, .024, .025));
    }
    for (const x of [-h + .56, h - .56]) {
      postData.push(place(group, x, -.113, .07, .025, .25, .025));
      glowData.push(place(group, x, .025, .07, .044, .045, .044));
    }
    for (let i = 0; i < 7; i++) {
      waveData.push(place(group, -h + .45 + (l - .9) * i / 6, -.308, .39 + (i % 2) * .10, .17 + (i % 3) * .04, .006, .012, Math.sin(i) * .09));
    }
    if (mapId === 'compact' || (mapId === 'expansion' && s === 0)) boat(group, s ? l * .14 : -l * .08, .47, s ? -.13 : .18, s);
  });
  instances('bank_stones', sphere, rockMat, stoneData);
  instances('shrubs', sphere, shrubMat, shrubData, theme.shrubs);
  instances('flowers', sphere, flowerMat, flowerData);
  instances('lamp_posts', cylinder, ironMat, postData);
  instances('lamp_globes', sphere, lampMat, glowData);
  const waves = instances('water_ripples', cube, foamMat, waveData);
  waves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.updateMatrixWorld(true);

  function tick(delta, { night = 0, reduced = false, paused = false } = {}) {
    if (disposed || !root.visible) return false;
    const dt = Math.min(.1, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const darkness = Math.min(1, Math.max(0, Number.isFinite(night) ? night : 0));
    let changed = false;
    if (Math.abs(darkness - lastNight) > .002) {
      lastNight = darkness; lampMat.emissiveIntensity = .08 + darkness * 1.6;
      waterMat.emissiveIntensity = .045 + darkness * .035;
      foamMat.opacity = .48 - darkness * .16; changed = true;
    }
    if (!reduced && !paused && dt > 0) {
      elapsed += dt;
      boats.forEach(entry => {
        entry.item.position.y = entry.y + Math.sin(elapsed * .8 + entry.phase) * .008;
        entry.item.rotation.x = Math.sin(elapsed * .65 + entry.phase) * .018;
      });
      waveData.forEach((entry, i) => setInstance(waves, i, entry, Math.sin(elapsed * .9 + i * .7) * .002));
      waves.instanceMatrix.needsUpdate = true; changed = true;
    }
    return changed;
  }
  function setVisible(value) {
    if (disposed) return false;
    const visible = !!value;
    if (root.visible === visible) return true;
    root.visible = visible; requestRender(); return true;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; root.removeFromParent(); owned.forEach(item => item.dispose()); owned.clear();
  }
  tick(0); requestRender();
  return { tick, setVisible, dispose };
}

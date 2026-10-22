// A layered miniature landscape beyond the playable board. Near scenery stays
// low; the distant tree line and neighbourhoods give the local camera a horizon.
// This module owns its resources, but no clock, gameplay RNG, hit targets or lights.
export function createCityOutskirts({ THREE, world, boardBounds, mapId = 'classic', requestRender = () => {} }) {
  const owned = new Set(), root = new THREE.Group();
  root.name = 'city_outskirts'; root.userData.cosmetic = true; world.add(root);
  const own = item => { owned.add(item); return item; };
  const material = (name, color, extra = {}) => {
    const item = own(new THREE.MeshStandardMaterial({ color, roughness: .8, ...extra }));
    item.name = `outskirts_${name}`; return item;
  };
  const themes = {
    classic: { name: 'garden_town', water: '#79b9bb', sand: '#d5ccad', lawn: '#b0c397', stone: '#bdc1a9', path: '#dfd3b9', roofs: '#a77a69', shrubs: ['#81a376', '#9bb184', '#708f67'], homes: ['#e4cfb0', '#d1c8ac', '#d7b7a2'], flowers: '#e4b58c' },
    compact: { name: 'seaside', water: '#64bec5', sand: '#e1d1a9', lawn: '#abc8aa', stone: '#c7c3b1', path: '#d7bea0', roofs: '#759f9e', shrubs: ['#6b9c83', '#88b29a', '#a2bea0'], homes: ['#edccac', '#c4d9d2', '#e3bdd0'], flowers: '#de9cbd' },
    expansion: { name: 'canal_city', water: '#76a9ba', sand: '#b8c8bc', lawn: '#9eb8a0', stone: '#b6c0bb', path: '#d2d3c4', roofs: '#799294', shrubs: ['#7e9c89', '#94ad96', '#6c8e7e'], homes: ['#c5cecb', '#cdbeb0', '#a9c0bc'], flowers: '#d9ba79' },
  };
  const theme = themes[mapId] || themes.classic;
  const seaside = theme === themes.compact, urban = theme === themes.expansion;
  root.userData.theme = theme.name;
  const waterMat = material('water', theme.water, { roughness: .3, metalness: .05, emissive: '#1d4c59', emissiveIntensity: .045 });
  const sandMat = material('shore', theme.sand), rockMat = material('stone', theme.stone);
  const lawnMat = material('lawn', theme.lawn), pathMat = material('promenade', theme.path);
  const shrubMat = material('foliage', '#ffffff'), flowerMat = material('blossoms', theme.flowers);
  const woodMat = material('timber', '#9b8870'), homeMat = material('neighbourhood', '#ffffff'), roofMat = material('roof', theme.roofs);
  const ironMat = material('bollard', '#65716b'), lampMat = material('lamp', '#ffdda2', { emissive: '#ffcf7c', emissiveIntensity: .08 });
  const windowMat = material('windows', '#d6c9a1', { emissive: '#ffcf7c', emissiveIntensity: .025 });
  const foamMat = material('ripple', '#d9eeee', { transparent: true, opacity: .48, depthWrite: false, roughness: .45 });
  const sphere = own(new THREE.IcosahedronGeometry(1, 1));
  const cube = own(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 8));
  const roof = own(new THREE.CylinderGeometry(0, 1, 1, 4));
  const canopy = own(new THREE.ConeGeometry(1, 1, 8));
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  const w = Math.max(3, Number(boardBounds?.w) || 11.55), d = Math.max(3, Number(boardBounds?.d) || 9.9);
  const data = Object.fromEntries(['stones', 'shrubs', 'flowers', 'posts', 'glow', 'waves', 'paths', 'trunks', 'crowns', 'homes', 'roofs', 'windows', 'benches', 'mounds', 'parasols', 'decks'].map(key => [key, []]));
  const boats = [];
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
  function add(key, group, x, y, z, sx, sy, sz, rotation = 0) {
    data[key].push(place(group, x, y, z, sx, sy, sz, rotation));
  }
  function instances(name, geometry, mat, entries, palette) {
    if (!entries.length) return null;
    const item = own(new THREE.InstancedMesh(geometry, mat, entries.length));
    item.name = `outskirts_${name}`; item.raycast = () => {}; item.castShadow = false; item.receiveShadow = true;
    item.userData.cosmetic = true; root.add(item);
    entries.forEach((entry, i) => {
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
    const length = .66, beam = .23;
    const outline = [[-length / 2, -.07], [-length * .37, -beam / 2], [length * .31, -beam / 2], [length / 2, 0], [length * .31, beam / 2], [-length * .37, beam / 2], [-length / 2, .07]];
    shapeSlab('boat_hull', outline, .065, material(`boat_paint_${index}`, index % 2 ? '#efc976' : '#e8c9a5'), hull, 0, .012);
    shapeSlab('boat_seat', outline.map(([px, pz]) => [px * .74, pz * .63]), .012, ironMat, hull, .068);
    const cabin = mesh('boat_cabin', cube, sandMat, hull); cabin.position.set(-.03, .105, 0); cabin.scale.set(.21, .08, .13);
    boats.push({ item: hull, y: hull.position.y, phase: index * 2.3 });
  }
  function tree(group, x, z, size, index) {
    const tall = urban ? 1.12 : 1;
    add('trunks', group, x, -.12, z, .035, .48 * size, .035);
    add('crowns', group, x, .24 * size, z, .30 * size, .36 * size * tall, .29 * size, index * .4);
    if (!urban) add('crowns', group, x + .16 * size, .16 * size, z + .08, .22 * size, .25 * size, .22 * size, index);
  }
  function home(group, x, z, index) {
    const width = .68 + index % 3 * .12, height = urban ? .65 + index % 4 * .18 : .43 + index % 3 * .10;
    const depth = .52 + index % 2 * .16, y = -.32 + height / 2;
    add('homes', group, x, y, z, width, height, depth);
    add('roofs', group, x, -.32 + height + (urban ? .035 : .10), z, urban ? width + .06 : width * .8, urban ? .07 : .24, urban ? depth + .06 : depth * .8, urban ? 0 : Math.PI / 4);
    // Warm inset windows face the board. No doors, markers or purchasable lots.
    for (const offset of [-.22, .22]) {
      add('windows', group, x + width * offset, y + .04, z - depth / 2 - .006, .10, urban ? .16 : .105, .014);
      if (urban && height > .85) add('windows', group, x + width * offset, y + .30, z - depth / 2 - .006, .10, .12, .014);
    }
    if (urban) add('homes', group, x - width * .15, -.32 + height + .13, z + .10, width * .48, .18, depth * .5);
  }

  // Four irregular terraces replace the two isolated narrow shore fragments.
  // All local z values are outward; the first 1.5 units contain only low objects.
  const sections = [
    { x: 0, z: d / 2 + .74, rotation: 0, length: w },
    { x: w / 2 + .74, z: 0, rotation: Math.PI / 2, length: d },
    { x: 0, z: -d / 2 - .74, rotation: Math.PI, length: w },
    { x: -w / 2 - .74, z: 0, rotation: -Math.PI / 2, length: d },
  ];
  sections.forEach((section, s) => {
    const group = new THREE.Group(); group.name = `outskirts_district_${s}`;
    group.position.set(section.x, 0, section.z); group.rotation.y = section.rotation; group.updateMatrix(); root.add(group);
    const l = section.length, h = l / 2, waterside = s < 2;
    const outline = [[-h + .08, .10], [-h + .25, .01], [h - .25, .01], [h - .08, .16], [h - .15, 3.7], [h - .58, 4.34], [l * .17, 4.48], [-l * .24, 4.35], [-h + .22, 4.0]];
    shapeSlab('landscape_terrace', outline, .07, waterside && seaside ? sandMat : lawnMat, group, -.425, .025);
    add('paths', group, 0, -.327, .29, l - .42, .035, .30);
    add('paths', group, 0, -.325, waterside ? 3.12 : 1.50, l - .75, .03, waterside ? .29 : .24);
    if (waterside) {
      const shore = [[-h + .30, .65], [-h + .60, .52], [h - .52, .59], [h - .22, .88], [h - .36, 2.73], [l * .20, 2.92], [-l * .19, 2.72], [-h + .28, 2.45]];
      shapeSlab('water', shore, .025, waterMat, group, -.354, .018);
      const count = Math.max(8, Math.floor(l / .44));
      for (let i = 0; i < count; i++) {
        const x = -h + .55 + (l - 1.1) * i / (count - 1);
        add('stones', group, x, -.279, .61 + Math.sin(i * 2.1) * .035, .16 + i % 3 * .02, .052, .10, i * .31);
      }
      for (let i = 0; i < 12; i++) add('waves', group, -h + .8 + (l - 1.6) * i / 11, -.307, 1.02 + i % 3 * .52, .25 + i % 3 * .07, .006, .018, Math.sin(i) * .12);
      if (seaside || urban) boat(group, s ? l * .19 : -l * .15, s ? 1.85 : 1.65, s ? -.13 : .18, s);
      if (seaside) {
        add('decks', group, l * .27, -.28, 1.0, .31, .045, .98);
        add('decks', group, l * .27 - .26, -.28, 1.48, .81, .045, .25);
      }
    }
    const count = Math.max(3, Math.floor(l / 1.35));
    for (let i = 0; i < count; i++) {
      const x = -h + .8 + (l - 1.6) * i / (count - 1), variation = (i + s * 2) % 4;
      // The inner planting frames the cream plinth without covering the route.
      add('shrubs', group, x, -.19, .10, .15, .13, .085, i * .3);
      if (i % 2) add('flowers', group, x + .04, -.062, .10, .035, .022, .035);
      if (i % 3 === 0) {
        add('posts', group, x + .28, -.12, .12, .025, .25, .025);
        add('glow', group, x + .28, .025, .12, .044, .045, .044);
        add('benches', group, x + .19, -.22, .45, .35, .065, .12);
      }
      const treeZ = waterside ? 3.24 + variation * .08 : 2.04 + variation * .12;
      tree(group, x, treeZ, .85 + variation * .10, i + s);
      if (!waterside) {
        add('mounds', group, x, -.28, 2.78, .61, .14, .51, i);
        add('shrubs', group, x + .24, -.20, .93, .24, .14, .19, i);
        if (!urban) add('flowers', group, x + .24, -.063, .91, .12, .028, .08);
      }
      if (i % 2 === 0) home(group, x + .20, 3.85 + (i % 3) * .06, i + s);
      if (seaside && waterside && i % 2) {
        add('trunks', group, x - .18, -.10, 3.72, .018, .46, .018);
        add('parasols', group, x - .18, .16, 3.72, .28, .14, .28, i * .3);
        add('benches', group, x - .18, -.25, 3.48, .15, .055, .35);
      }
    }
  });
  // Corner pocket gardens soften the square platform without creating a second
  // ring of game-like paving. Their silhouettes sit beyond both plinth edges.
  for (const [index, [x, z]] of [[-1, -1], [1, -1], [1, 1], [-1, 1]].entries()) {
    const group = new THREE.Group(); group.name = `outskirts_corner_garden_${index}`;
    group.position.set(x * (w / 2 + 2.10), 0, z * (d / 2 + 2.10)); group.updateMatrix(); root.add(group);
    const points = Array.from({ length: 10 }, (_, i) => { const angle = i * Math.PI / 5, r = 1.31 + (i % 2) * .10; return [Math.cos(angle) * r, Math.sin(angle) * r]; });
    shapeSlab('pocket_garden', points, .07, lawnMat, group, -.425, .025);
    add('mounds', group, -.2, -.24, .15, .8, .18, .64, index);
    tree(group, -.35, .1, 1.15, index);
    tree(group, .38, -.20, .87, index + 2);
    add('shrubs', group, .38, -.18, .56, .33, .18, .26);
    add('flowers', group, .38, -.012, .56, .22, .025, .16);
  }
  instances('bank_stones', sphere, rockMat, data.stones);
  instances('shrubs', sphere, shrubMat, data.shrubs, theme.shrubs);
  instances('flowers', sphere, flowerMat, data.flowers);
  instances('lamp_posts', cylinder, ironMat, data.posts);
  instances('lamp_globes', sphere, lampMat, data.glow);
  instances('promenades', cube, pathMat, data.paths);
  instances('tree_trunks', cylinder, woodMat, data.trunks);
  instances('tree_crowns', sphere, shrubMat, data.crowns, theme.shrubs);
  instances('neighbourhood_homes', cube, homeMat, data.homes, theme.homes);
  instances('neighbourhood_roofs', urban ? cube : roof, roofMat, data.roofs);
  instances('neighbourhood_windows', cube, windowMat, data.windows);
  instances('benches', cube, woodMat, data.benches);
  instances('garden_mounds', sphere, lawnMat, data.mounds);
  instances('beach_parasols', canopy, flowerMat, data.parasols);
  instances('boardwalk_decks', cube, woodMat, data.decks);
  const waves = instances('water_ripples', cube, foamMat, data.waves);
  waves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.updateMatrixWorld(true);

  function tick(delta, { night = 0, reduced = false, paused = false } = {}) {
    if (disposed || !root.visible) return false;
    const dt = Math.min(.1, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const darkness = Math.min(1, Math.max(0, Number.isFinite(night) ? night : 0));
    let changed = false;
    if (Math.abs(darkness - lastNight) > .002) {
      lastNight = darkness; lampMat.emissiveIntensity = .08 + darkness * 1.6;
      windowMat.emissiveIntensity = .025 + darkness * .95;
      waterMat.emissiveIntensity = .045 + darkness * .035;
      foamMat.opacity = .48 - darkness * .16; changed = true;
    }
    if (!reduced && !paused && dt > 0) {
      elapsed += dt;
      boats.forEach(entry => {
        entry.item.position.y = entry.y + Math.sin(elapsed * .8 + entry.phase) * .008;
        entry.item.rotation.x = Math.sin(elapsed * .65 + entry.phase) * .018;
      });
      data.waves.forEach((entry, i) => setInstance(waves, i, entry, Math.sin(elapsed * .9 + i * .7) * .002));
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

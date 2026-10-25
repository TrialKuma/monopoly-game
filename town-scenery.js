// A compact, authored coastal frame for the player's buildable island. All
// scenery is static and uses shared materials so the town can batch it once.
export function buildTownSurroundings({ THREE, parent, size, width = size, height = size, publicProjects = false, CELL, box, rounded, ellipsoid, tree, material, own }) {
  const edgeX = width * CELL / 2, edgeZ = height * CELL / 2;
  const palette = {
    shallow: '#9dcac1', shoal: '#b3d4c5', foam: '#d6e4d3', sand: '#dfd0aa',
    warmSand: '#cfbe97', rock: '#91a79d', paleRock: '#b8b9a3', grass: '#9eb38a',
    grassLight: '#b0bf92', shrubs: '#729a7e', wood: '#b28d67', cream: '#e9dcc0',
    teal: '#427778', darkTeal: '#365f64', amber: '#efc472', white: '#f1ead5',
  };
  const group = new THREE.Group(); group.name = 'town-coastal-surroundings'; parent.add(group);
  group.userData.buildableEdge = { x: edgeX, z: edgeZ };
  const place = (name, x, z, yaw = 0) => {
    const object = new THREE.Group(); object.name = name; object.position.set(x, 0, z); object.rotation.y = yaw; group.add(object); return object;
  };
  function polygon(parentGroup, points, bottom, height, color) {
    const shape = new THREE.Shape(); shape.moveTo(points[0][0], -points[0][1]);
    for (const point of points.slice(1)) shape.lineTo(point[0], -point[1]);
    shape.closePath();
    const geometry = own(new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 })); geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material(color)); mesh.position.y = bottom; mesh.receiveShadow = true; mesh.castShadow = height > .08; parentGroup.add(mesh); return mesh;
  }
  function cylinder(parentGroup, top, bottom, height, color, x, y, z, sides = 12) {
    const mesh = new THREE.Mesh(own(new THREE.CylinderGeometry(top, bottom, height, sides)), material(color));
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parentGroup.add(mesh); return mesh;
  }
  function bar(parentGroup, a, b, width, height, color, y) {
    const mesh = box(parentGroup, Math.hypot(b[0] - a[0], b[1] - a[1]), height, width, color, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    mesh.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]); return mesh;
  }
  function ripple(parentGroup, x, z, w = .6, yaw = 0) {
    const mesh = rounded(parentGroup, w, .008, .035, .016, palette.foam, x, -.397, z); mesh.rotation.y = yaw; mesh.castShadow = false;
  }
  function rockCluster(parentGroup, x, z, k = 1) {
    const a = ellipsoid(parentGroup, .32 * k, .22 * k, .27 * k, palette.rock, x, -.02, z, 0); a.rotation.y = .35;
    const b = ellipsoid(parentGroup, .25 * k, .16 * k, .22 * k, palette.paleRock, x + .25 * k, -.045, z + .11 * k, 0); b.rotation.y = -.3;
    ellipsoid(parentGroup, .13 * k, .10 * k, .15 * k, palette.rock, x - .24 * k, -.075, z + .17 * k, 0);
  }
  function grasses(parentGroup, x, z, k = 1, flower = false) {
    ellipsoid(parentGroup, .24 * k, .075 * k, .17 * k, palette.shrubs, x, .14, z);
    ellipsoid(parentGroup, .18 * k, .09 * k, .15 * k, palette.grassLight, x + .16 * k, .16, z + .04 * k);
    if (flower) for (const [dx, dz] of [[-.12, -.025], [.02, .05], [.16, -.02]]) ellipsoid(parentGroup, .035, .043, .035, palette.amber, x + dx * k, .25, z + dz * k, 0);
  }
  function coastTree(parentGroup, x, z, k = 1) {
    // The shared tree helper starts at y=.3; this island's meadow is y=.1.
    const grove = new THREE.Group(); grove.position.y = -.2; parentGroup.add(grove); tree(grove, x, z, k);
  }
  function boat(parentGroup, x, z, yaw, k = 1, sail = false) {
    const hull = new THREE.Group(); hull.position.set(x, -.29, z); hull.rotation.y = yaw; hull.scale.setScalar(k); parentGroup.add(hull);
    polygon(hull, [[-.25, -.58], [.25, -.58], [.31, .24], [0, .68], [-.31, .24]], 0, .12, palette.cream);
    polygon(hull, [[-.18, -.48], [.18, -.48], [.23, .2], [0, .52], [-.23, .2]], .12, .045, palette.wood);
    box(hull, .34, .045, .12, palette.white, 0, .19, -.3);
    box(hull, .34, .045, .12, palette.white, 0, .19, .08);
    if (sail) {
      box(hull, .035, .94, .035, palette.wood, 0, .63, .02);
      const geometry = own(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([.025, .28, .04, .025, 1.08, .04, .025, .30, -.48, .025, .30, -.48, .025, 1.08, .04, .025, .28, .04], 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0], 2)); geometry.computeVertexNormals();
      const sailMesh = new THREE.Mesh(geometry, material(palette.white)); sailMesh.castShadow = true; hull.add(sailMesh);
    } else {
      box(hull, .32, .19, .33, palette.teal, 0, .28, -.08);
      box(hull, .39, .035, .4, palette.white, 0, .39, -.08);
      box(hull, .24, .085, .015, palette.cream, 0, .29, .095);
    }
    return hull;
  }

  // The near shore has a continuous turquoise shelf; smaller sand fingers and
  // rock steps make it read as a coastline rather than a floating rectangle.
  const shelf = [
    [-edgeX - 2.2, -edgeZ - .6], [-edgeX - 1.4, -edgeZ - 2.0], [-edgeX + 1.0, -edgeZ - 1.9],
    [edgeX - .6, -edgeZ - 1.7], [edgeX + 1.8, -edgeZ - 1.1], [edgeX + 2.4, -edgeZ + 1.8],
    [edgeX + 2.2, edgeZ - .3], [edgeX + 1.55, edgeZ + 2.0], [edgeX - .9, edgeZ + 2.25],
    [-edgeX + 1.1, edgeZ + 2.0], [-edgeX - 1.8, edgeZ + 1.35], [-edgeX - 2.45, edgeZ - 1.4],
  ];
  polygon(group, shelf, -.413, .013, palette.shallow).castShadow = false;
  const west = place('tidal-cove', -edgeX - 1.12, -.4);
  polygon(west, [[-.18, -2.9], [-.73, -2.65], [-1.1, -1.65], [-.95, -.55], [-1.4, .5], [-1.1, 1.5], [-.25, 2.6], [.12, 2.5], [.12, -2.9]], -.38, .14, palette.warmSand);
  polygon(west, [[-.12, -2.8], [-.55, -2.5], [-.78, -1.65], [-.61, -.45], [-.97, .55], [-.76, 1.35], [-.13, 2.3], [.12, 2.3], [.12, -2.8]], -.23, .15, palette.sand);
  polygon(west, [[.12, -2.6], [-.23, -2.25], [-.35, -1.55], [-.19, -.6], [-.35, .1], [.12, .9]], -.07, .17, palette.grass);
  rockCluster(west, -.4, -2.4, .85); rockCluster(west, -.61, 1.43, .8);
  grasses(west, -.05, -1.2, .85, true); grasses(west, -.13, -.45, .7);
  // Three little tide pools give the beach its own readable detail at phone size.
  for (const [x, z, r] of [[-.54, -.95, .19], [-.69, .18, .16], [-.63, .62, .22]]) {
    ellipsoid(west, r + .055, .035, r * .6 + .04, palette.paleRock, x, -.04, z);
    ellipsoid(west, r, .012, r * .6, palette.teal, x, -.007, z);
  }
  ripple(west, -1.04, -1.25, .55, 1.2); ripple(west, -1.4, .2, .72, 1.1); ripple(west, -.95, 2.05, .5, .6);

  // Quiet rear garden: low meadow terraces, a paved lookout and small, spaced
  // groves. The gaps keep the silhouette open instead of forming a tree wall.
  if (!publicProjects) {
  const garden = place('coastal-lookout-garden', -edgeX + 1.25, -edgeZ - 1.2);
  polygon(garden, [[-1.6, .12], [-1.8, -.4], [-1.3, -1], [-.55, -1.2], [.35, -.88], [.95, -.4], [1.15, .12]], -.36, .28, palette.warmSand);
  polygon(garden, [[-1.5, .13], [-1.56, -.33], [-1.1, -.77], [-.5, -.95], [.25, -.65], [.85, -.28], [.95, .13]], -.07, .17, palette.grassLight);
  rounded(garden, 1.0, .055, .48, .16, palette.cream, -.48, .115, -.4);
  box(garden, .6, .075, .2, palette.wood, -.48, .24, -.56);
  box(garden, .6, .17, .04, palette.teal, -.48, .36, -.64);
  box(garden, .05, .15, .15, palette.teal, -.7, .15, -.56); box(garden, .05, .15, .15, palette.teal, -.25, .15, -.56);
  grasses(garden, -1.15, -.2, .75, true); grasses(garden, .27, -.32, .8, true);
  coastTree(garden, -1.14, -.55, .55);
  }
  for (const [x, z, k] of [[-edgeX + 2.5, -edgeZ - .65, .72], [edgeX - 2.1, -edgeZ - .65, .8], [edgeX - .9, -edgeZ - .7, .58], [-edgeX - .7, -edgeZ + 1.0, .68], [-edgeX - .7, edgeZ - 1.3, .65]]) {
    rounded(group, .75, .025, .57, .18, palette.grass, x, .11, z);
    coastTree(group, x, z, k); grasses(group, x + .25, z + .12, .6, true);
  }

  // A walkable-looking seaside promenade joins both docks. All its lamps and
  // furniture sit outside the legal grid and remain lower than a small house.
  const promenade = place('seaside-promenade', 0, edgeZ + .64);
  rounded(promenade, edgeX * 2 + 2.25, .09, .55, .12, palette.cream, 0, .12, 0);
  box(promenade, edgeX * 2 + 2.0, .26, .13, palette.rock, 0, -.005, .4);
  rounded(promenade, edgeX * 2 + 2.05, .055, .2, .05, palette.paleRock, 0, .125, .4);
  for (const x of [-edgeX + 1.8, 0, edgeX - 1.7]) {
    cylinder(promenade, .04, .06, .43, palette.teal, x, .425, .27, 8);
    box(promenade, .14, .13, .14, palette.amber, x, .705, .27);
    box(promenade, .17, .035, .17, palette.teal, x, .79, .27);
    box(promenade, .52, .07, .19, palette.wood, x + .56, .29, .03);
    for (const dx of [.36, .76]) box(promenade, .045, .13, .17, palette.teal, x + dx, .195, .03);
    box(promenade, .52, .13, .035, palette.teal, x + .56, .385, .1);
  }
  const arrival = place('arrival-jetty', -edgeX + .8, edgeZ + 1.05);
  box(arrival, .9, .12, 1.62, palette.wood, 0, -.005, .75);
  for (let i = 0; i < 10; i++) box(arrival, .93, .018, .025, palette.cream, 0, .063, .04 + i * .16);
  for (const x of [-.39, .39]) for (const z of [.1, 1.45]) {
    cylinder(arrival, .05, .065, .53, palette.wood, x, -.1, z, 8);
    cylinder(arrival, .075, .075, .045, palette.cream, x, .19, z, 8);
  }
  boat(arrival, -.9, .72, -.06, .65);
  ripple(arrival, -.86, 1.55, .65, -.1);

  // A low, angular breakwater wraps a real marina. Its open mouth, moored
  // boats, posts and cross-pier form a small destination beside the town.
  if (!publicProjects) {
  const marina = place('town-marina', edgeX - .9, edgeZ + 1.03);
  polygon(marina, [[-.9, .2], [.7, .2], [1.6, .65], [1.65, 1.7], [1.12, 2.13], [-.95, 1.92], [-1.2, .95]], -.408, .015, palette.shoal).castShadow = false;
  const wall = [[.72, .1], [1.38, .55], [1.45, 1.45], [.92, 1.91], [-.2, 1.86]];
  for (let i = 1; i < wall.length; i++) {
    bar(marina, wall[i - 1], wall[i], .24, .35, palette.rock, -.18);
    bar(marina, wall[i - 1], wall[i], .28, .07, palette.cream, .025);
  }
  for (const [x, z] of [[1.55, .48], [1.6, 1.18], [1.22, 1.98], [.37, 2.02]]) rockCluster(marina, x, z, .48);
  box(marina, .38, .12, 1.4, palette.wood, -.46, -.015, .72);
  box(marina, 1.35, .12, .32, palette.wood, -.32, -.015, 1.32);
  for (let i = 0; i < 9; i++) box(marina, .40, .018, .025, palette.cream, -.46, .054, .08 + i * .15);
  for (const [x, z] of [[-.62, .2], [-.29, .2], [-.93, 1.34], [.32, 1.34]]) {
    cylinder(marina, .047, .057, .5, palette.wood, x, -.12, z, 8);
    cylinder(marina, .065, .065, .045, palette.cream, x, .15, z, 8);
  }
  boat(marina, .25, .64, .09, .7); boat(marina, -1.0, .64, -.15, .62, true);
  ripple(marina, .38, 1.62, .52); ripple(marina, -.7, 2.1, .64, -.2);

  // One landmark on an offshore rock, kept below most two-star buildings and
  // behind the plots. Broad cream/teal bands survive the small mobile view.
  const beacon = place('lighthouse-islet', edgeX + 3.0, -edgeZ + .55, -.1);
  ellipsoid(beacon, 1.03, .04, .86, palette.shoal, 0, -.4, 0);
  polygon(beacon, [[-.68, -.4], [-.25, -.72], [.41, -.55], [.7, -.02], [.42, .51], [-.27, .62], [-.69, .2]], -.38, .24, palette.rock);
  polygon(beacon, [[-.52, -.32], [-.2, -.54], [.31, -.41], [.53, -.01], [.3, .36], [-.23, .43], [-.53, .16]], -.13, .18, palette.paleRock);
  cylinder(beacon, .32, .39, .1, palette.cream, 0, .1, 0, 10);
  cylinder(beacon, .19, .27, .8, palette.white, 0, .55, 0, 10);
  cylinder(beacon, .224, .242, .18, palette.teal, 0, .5, 0, 10);
  cylinder(beacon, .29, .29, .06, palette.cream, 0, .98, 0, 10);
  cylinder(beacon, .18, .18, .27, palette.amber, 0, 1.14, 0, 8);
  for (const [x, z] of [[-.15, -.15], [.15, -.15], [.15, .15], [-.15, .15]]) box(beacon, .035, .28, .035, palette.darkTeal, x, 1.14, z);
  cylinder(beacon, .02, .32, .21, palette.teal, 0, 1.38, 0, 10);
  cylinder(beacon, .035, .035, .12, palette.cream, 0, 1.53, 0, 8);
  box(beacon, .13, .26, .025, palette.teal, 0, .22, .263);
  rockCluster(beacon, -.5, .39, .5); grasses(beacon, .39, -.12, .45);
  ripple(beacon, -.95, .12, .48, 1.2); ripple(beacon, .45, .84, .58, -.2);
  }

  // Small east-side coves connect the landmark and marina without planting a
  // wall of trees. The closest elements stay low enough to see every plot.
  const east = place('rock-pool-shore', edgeX + 1.08, .25);
  polygon(east, [[-.02, -1.9], [.65, -1.65], [.92, -.9], [.69, -.4], [.96, .3], [.66, 1.45], [-.02, 1.65]], -.33, .23, palette.warmSand);
  polygon(east, [[-.03, -1.8], [.4, -1.55], [.58, -.85], [.37, -.42], [.63, .3], [.4, 1.2], [-.03, 1.4]], -.09, .15, palette.grass);
  rockCluster(east, .4, -1.34, .65); rockCluster(east, .55, .88, .6);
  grasses(east, .16, -.55, .65); grasses(east, .16, .25, .6, true);
  ripple(east, 1.0, -.55, .58, 1.25); ripple(east, .94, .7, .7, 1.4);

  // Midground landforms frame the skyline above the town. A real strip of sea
  // separates them from the buildable island, so they read as a little coastal
  // archipelago rather than more objects placed along the same straight rim.
  const headland = place('offshore-lookout-headland', -edgeX - 1.0, -edgeZ - 3.3, -.16);
  const headOutline = [[-1.72, -.13], [-1.4, -.85], [-.45, -1.15], [.5, -.97], [1.47, -.45], [1.62, .18], [1.1, .84], [.28, 1.06], [-.65, .86], [-1.42, .45]];
  polygon(headland, headOutline.map(([x, z]) => [x * 1.29, z * 1.30]), -.412, .016, palette.shallow).castShadow = false;
  polygon(headland, headOutline, -.36, .22, palette.warmSand);
  polygon(headland, [[-1.5, -.12], [-1.22, -.65], [-.4, -.92], [.43, -.76], [1.15, -.31], [1.24, .22], [.85, .64], [.23, .84], [-.6, .65], [-1.26, .33]], -.14, .31, palette.rock);
  polygon(headland, [[-1.27, -.13], [-1.04, -.49], [-.36, -.72], [.35, -.59], [.91, -.22], [1.03, .23], [.7, .5], [.21, .65], [-.51, .48], [-1.07, .27]], .17, .18, palette.grass);
  polygon(headland, [[-1.12, -.16], [-.92, -.47], [-.47, -.6], [-.12, -.37], [-.13, .08], [-.65, .3], [-1.06, .12]], .35, .23, palette.paleRock);
  polygon(headland, [[-1.04, -.14], [-.86, -.36], [-.48, -.48], [-.25, -.3], [-.26, .025], [-.66, .18], [-.96, .06]], .58, .055, palette.grassLight);
  const highGrove = new THREE.Group(); highGrove.position.y = .535; headland.add(highGrove);
  coastTree(highGrove, -.73, -.2, .62); coastTree(highGrove, -.38, -.29, .45);
  const lowerMeadow = new THREE.Group(); lowerMeadow.position.y = .25; headland.add(lowerMeadow);
  grasses(lowerMeadow, -.75, .39, .8, true); grasses(lowerMeadow, .26, -.39, .85); grasses(lowerMeadow, .77, .14, .65, true);
  bar(headland, [-.75, .47], [-.08, .32], .14, .025, palette.sand, .37);
  bar(headland, [-.08, .32], [.3, .07], .14, .025, palette.sand, .37);
  bar(headland, [.3, .07], [.73, .28], .14, .025, palette.sand, .37);
  rounded(headland, .53, .05, .34, .09, palette.cream, .72, .365, .32);
  box(headland, .42, .05, .15, palette.wood, .73, .49, .34);
  box(headland, .42, .12, .035, palette.teal, .73, .58, .4);
  for (const dx of [.57, .89]) box(headland, .035, .11, .13, palette.teal, dx, .42, .34);
  rockCluster(headland, 1.21, -.18, .65); rockCluster(headland, -.38, .93, .5);
  ripple(headland, .5, 1.35, .85, -.14); ripple(headland, -1.88, .08, .65, 1.25); ripple(headland, 1.75, -.2, .55, 1.0);

  // The smaller left skerry is deliberately mostly sand and exposed rock,
  // balancing the raised green headland with a different coastal silhouette.
  const skerry = place('offshore-sandbar', -edgeX - 3.15, -edgeZ + .15, .32);
  const skerryOutline = [[-1.05, -.15], [-.67, -.62], [.19, -.75], [.88, -.32], [1.03, .16], [.54, .6], [-.25, .71], [-.95, .36]];
  polygon(skerry, skerryOutline.map(([x, z]) => [x * 1.3, z * 1.3]), -.411, .014, palette.shoal).castShadow = false;
  polygon(skerry, skerryOutline, -.35, .23, palette.sand);
  polygon(skerry, [[-.62, -.12], [-.34, -.42], [.16, -.45], [.6, -.15], [.64, .17], [.26, .42], [-.34, .4], [-.67, .18]], -.12, .18, palette.paleRock);
  polygon(skerry, [[-.42, -.11], [-.2, -.29], [.14, -.29], [.4, -.08], [.4, .17], [.12, .26], [-.28, .23]], .06, .055, palette.grassLight);
  rockCluster(skerry, -.35, -.1, .9); rockCluster(skerry, .55, .2, .5);
  grasses(skerry, .16, -.04, .65, true);
  ripple(skerry, -.62, .9, .68, -.2); ripple(skerry, .88, -.67, .57, .45);

  // A few deliberate wakes and tiny skerries continue the coast into the sea,
  // with generous negative space retained around the building grid.
  for (const [x, z, w, angle] of [
    [-edgeX - 2.25, edgeZ + .1, .8, .5], [-edgeX + 2.1, edgeZ + 2.0, .65, 0],
    [edgeX + 2.45, edgeZ - 1.7, .85, 1.1], [edgeX - 1.3, -edgeZ - 2.1, .75, -.1],
    [-edgeX - 1.65, -edgeZ - 1.3, .55, -.3], [edgeX + .55, -edgeZ - 1.5, .7, .1],
  ]) ripple(group, x, z, w, angle);
  rockCluster(group, -edgeX - 1.75, edgeZ + .8, .72);
  ellipsoid(group, .68, .025, .5, palette.shoal, -edgeX - 1.7, -.4, edgeZ + .85);
  return group;
}

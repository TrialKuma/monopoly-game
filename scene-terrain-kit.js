// Continuous, low-detail landforms for authored parks. The garden kit owns and
// batches these meshes, so a planted contour costs no additional material.
export function createTerrainLayerKit({ THREE, own, garden, root }) {
  const { colors, noise, add } = garden;

  function surface(positions, indices, uv, material, parent, name) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (material.vertexColors) {
      // Optional foliage materials already encode their palette elsewhere. A
      // neutral attribute also keeps these surfaces compatible with batching.
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(1), 3));
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = add(own(geometry), material, [0, 0, 0], [1, 1, 1], 0, parent);
    mesh.name = name;
    mesh.userData.terrainSurface = true;
    mesh.userData.terrainLayer = true;
    return mesh;
  }

  function landform({ x, z, rx, rz, y, height, seed, parent, material, flat }) {
    const segments = flat ? 14 : 18;
    const rings = flat ? [[1, 0], [.48, .72]] : [[1, 0], [.77, .25], [.49, .67], [.23, .92]];
    const positions = [], indices = [], uv = [];
    const angleOffset = noise(seed + 17) * Math.PI * 2;
    const offsetX = (noise(seed + 9) - .5) * .19;
    const offsetZ = (noise(seed + 15) - .5) * .19;
    const edge = Array.from({ length: segments }, (_, i) => {
      const angle = i / segments * Math.PI * 2;
      // Broad lobes, rather than noisy individual vertices, create a readable
      // silhouette at the game's local-camera distance.
      return .91 + Math.sin(angle * 3 + angleOffset) * .045 + Math.sin(angle * 5 - angleOffset) * .025;
    });
    rings.forEach(([radius, elevation], ring) => {
      for (let i = 0; i < segments; i++) {
        const angle = i / segments * Math.PI * 2;
        const xx = Math.cos(angle) * radius * edge[i] + offsetX * (1 - radius);
        const zz = Math.sin(angle) * radius * edge[i] + offsetZ * (1 - radius);
        const fold = ring ? .95 + Math.sin(angle * 2 + angleOffset + radius) * .05 : 1;
        positions.push(x + xx * rx, y + height * elevation * fold, z + zz * rz);
        uv.push(xx * .5 + .5, zz * .5 + .5);
        if (ring < rings.length - 1) {
          const a = ring * segments + i, b = ring * segments + (i + 1) % segments;
          indices.push(a, a + segments, b, b, a + segments, b + segments);
        }
      }
    });
    const center = positions.length / 3;
    positions.push(x + offsetX * rx, y + height, z + offsetZ * rz);
    uv.push(offsetX * .5 + .5, offsetZ * .5 + .5);
    const last = (rings.length - 1) * segments;
    for (let i = 0; i < segments; i++) indices.push(last + i, center, last + (i + 1) % segments);
    return surface(positions, indices, uv, material, parent, flat ? 'terrain_planting_contour' : 'terrain_continuous_mound');
  }

  function mound({ x, z, rx, rz, y = 0, height = .3, seed = 0, parent = root, material = colors.grass }) {
    return landform({ x, z, rx, rz, y, height, seed, parent, material, flat: false });
  }

  function patch({ x, z, rx, rz, y = .01, height = .018, seed = 0, parent = root, material = colors.grass }) {
    const mesh = landform({ x, z, rx, rz, y, height, seed, parent, material, flat: true });
    mesh.castShadow = false;
    return mesh;
  }

  function watercourse({ points, width, bankWidth = .15, seed = 0, parent = root,
    waterMaterial = colors.water, bankMaterial = colors.soil, segments = 32 }) {
    const route = garden.curve(points), positions = [], indices = [], uv = [];
    const sampleWidth = t => (typeof width === 'function' ? width(t) : width) *
      (1 + Math.sin(t * Math.PI * 4 + seed) * .065);
    const banks = [];
    for (const side of [-1, 1]) {
      const first = positions.length / 3;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments, p = route.getPoint(t), tangent = route.getTangent(t);
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
        const half = sampleWidth(t) / 2;
        for (let j = 0; j < 3; j++) {
          const u = j / 2;
          const q = p.clone().addScaledVector(normal, side * (half + u * bankWidth));
          const bankHeight = j === 0 ? -.008 : j === 1 ? .055 : .018;
          positions.push(q.x, q.y + bankHeight, q.z);
          uv.push(t, u);
          if (i < segments && j < 2) {
            const a = first + i * 3 + j;
            const triangles = [a, a + 1, a + 3, a + 1, a + 4, a + 3];
            if (side === -1) {
              for (let k = 0; k < triangles.length; k += 3) indices.push(triangles[k + 2], triangles[k + 1], triangles[k]);
            } else indices.push(...triangles);
          }
        }
      }
    }
    banks.push(surface(positions, indices, uv, bankMaterial, parent, 'terrain_stream_banks'));
    banks[0].castShadow = false;
    const firstWaterChild = parent.children.length;
    garden.ribbon(points, sampleWidth, waterMaterial, parent, segments);
    for (const mesh of parent.children.slice(firstWaterChild)) {
      mesh.name = 'terrain_stream_water';
      mesh.userData.terrainLayer = true;
      mesh.userData.terrainSurface = true;
    }
    return { route, banks, widthAt: sampleWidth };
  }

  return { mound, patch, watercourse };
}

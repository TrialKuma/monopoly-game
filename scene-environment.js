import * as THREE from './assets/vendor/three/three.module.min.js';

// Share the in-game reflection environment with every model review surface.
// Direct lights alone leave metallic roof texels dark even with a bright sky.
export function makeStudioEnvironment(renderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color('#b8c6c0');
  const panels = [];
  [[-4, 5, 3, 4.2, 5.2], [5, 3, -2, 3, 4], [0, 7, -5, 5, 3]].forEach(([x, y, z, width, height], index) => {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(index === 0 ? 1.8 : 1.2, index === 0 ? 1.55 : 1.35, index === 0 ? 1.12 : 1.45),
      side: THREE.DoubleSide,
    });
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(x, y, z);
    panel.lookAt(0, 1, 0);
    room.add(panel);
    panels.push(panel);
  });
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(room, .04, .1, 40);
  generator.dispose();
  panels.forEach(panel => { panel.geometry.dispose(); panel.material.dispose(); });
  return target;
}

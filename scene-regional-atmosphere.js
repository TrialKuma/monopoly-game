import { createCoastalWaves } from './scene-coastal-waves.js?v=20261028-map-atmosphere1';

// Regional accents share the scene's clock. Their geometry never enters the
// playable board or takes input; mist is confined to the scenic perimeter.
export function createRegionalAtmosphere({ THREE, world, boardBounds, mapId }) {
  const root = new THREE.Group(); root.name = `regional_atmosphere_${mapId}`;
  root.userData.cosmetic = true; world.add(root);
  const owned = new Set(), own = value => { owned.add(value); return value; };
  const waves = mapId === 'harbor' ? createCoastalWaves({ THREE, world, boardBounds }) : null;
  const w = Math.max(3, boardBounds?.w || 11.55), d = Math.max(3, boardBounds?.d || 9.9);
  const dummy = new THREE.Object3D(), anchors = [];
  let time = 0, disposed = false, visible = true, lastSignature = '';
  const isMountain = mapId === 'alpine', isCity = mapId === 'expansion';
  const mistColor = new THREE.Color(isMountain ? '#dbe9eb' : '#c7d8df');
  const nightColor = new THREE.Color('#688caa');
  if (isMountain || isCity) {
    for (const side of [-1, 1]) for (const along of [-.34, 0, .34]) {
      anchors.push({ x: side * (w / 2 + (isMountain ? 2.3 : 3.5)), y: isMountain ? .72 : .38,
        z: d * along, width: isMountain ? 3.25 : 2.65, height: isMountain ? .92 : .58 });
    }
    for (const along of [-.32, 0, .32]) anchors.push({ x: w * along, y: isMountain ? 1.1 : .43,
      z: -d / 2 - (isMountain ? 3.2 : 3.5), width: 3.8, height: isMountain ? 1.3 : .64 });
  }
  const billboardVertex = `
    varying vec2 vUv;
    void main(){
      vUv=uv;
      vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
      vec2 size=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
      center.xy+=position.xy*size;
      gl_Position=projectionMatrix*center;
    }`;
  const mistMaterial = anchors.length ? own(new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, opacity: { value: 0 }, tint: { value: mistColor.clone() } },
    vertexShader: billboardVertex,
    fragmentShader: `
      varying vec2 vUv; uniform float time; uniform float opacity; uniform vec3 tint;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){
        vec2 q=(vUv-.5)*2.;
        float envelope=pow(max(0.,1.-dot(q,q)),2.);
        float cloud=.48+.36*noise(vUv*vec2(5.,3.)+vec2(time*.025,0.))+.16*noise(vUv*11.-vec2(time*.018,0.));
        float alpha=envelope*cloud*opacity;
        if(alpha<.002)discard;
        gl_FragColor=vec4(tint,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: true,
  })) : null;
  const mist = anchors.length ? own(new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1)), mistMaterial, anchors.length)) : null;
  if (mist) {
    mist.name = 'regional_perimeter_mist'; mist.frustumCulled = false; mist.raycast = () => {};
    mist.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(mist);
  }
  // Warm pollen belongs to the French garden; Kyoto uses the weather module's
  // actual petal silhouettes, while coast and mountains have no flower shower.
  const pollenData = mapId === 'classic' ? Array.from({ length: 24 }, (_, i) => ({
    x: Math.sin(i * 2.399) * Math.max(.6, w - 5) * .40,
    z: Math.cos(i * 1.618) * Math.max(.6, d - 5) * .40,
    y: .3 + (i % 7) * .14, phase: i * 1.713, size: .022 + (i % 3) * .005,
  })) : [];
  const pollenMaterial = pollenData.length ? own(new THREE.ShaderMaterial({
    uniforms: { opacity: { value: .45 }, tint: { value: new THREE.Color('#ffe7aa') } },
    vertexShader: billboardVertex,
    fragmentShader: `varying vec2 vUv; uniform float opacity; uniform vec3 tint;
      void main(){float a=pow(max(0.,1.-length((vUv-.5)*2.)),1.5)*opacity;if(a<.006)discard;gl_FragColor=vec4(tint,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`, transparent: true, depthWrite: false,
  })) : null;
  const pollen = pollenData.length ? own(new THREE.InstancedMesh(own(new THREE.PlaneGeometry(1, 1)), pollenMaterial, pollenData.length)) : null;
  if (pollen) { pollen.name = 'regional_garden_pollen'; pollen.raycast = () => {}; pollen.frustumCulled = false; pollen.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(pollen); }
  function tick(delta, { night = 0, rain = 0, cloud = 0, season = 'spring', reduced = false, paused = false } = {}) {
    if (disposed) return false;
    const step = Math.min(.1, Math.max(0, Number.isFinite(delta) ? delta : 0));
    if (visible && !paused && !reduced) time += step;
    const signature = [night, rain, cloud, season, reduced, visible].join(':');
    const changed = lastSignature !== signature; lastSignature = signature;
    const waveChanged = waves?.tick(step, { night, reduced, paused }) || false;
    if (mist) {
      mistMaterial.uniforms.time.value = time;
      mistMaterial.uniforms.tint.value.copy(mistColor).lerp(nightColor, Math.max(0, Math.min(1, night)) * .72);
      mistMaterial.uniforms.opacity.value = (isMountain ? .40 : .19 + Math.max(0, Math.min(1, rain)) * .15) * (1 - night * .2);
      anchors.forEach((p, i) => {
        dummy.position.set(p.x + Math.sin(time * .09 + i * 1.7) * .12, p.y + Math.sin(time * .07 + i) * .04, p.z);
        dummy.scale.set(p.width * (1 + Math.sin(time * .08 + i) * .045), p.height, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); mist.setMatrixAt(i, dummy.matrix);
      });
      mist.instanceMatrix.needsUpdate = true;
    }
    if (pollen) {
      pollen.visible = !reduced && (season === 'spring' || season === 'summer');
      pollenMaterial.uniforms.opacity.value = .62 * (1 - rain * .85) * (1 - night * .7);
      pollenData.forEach((p, i) => { dummy.position.set(p.x + Math.sin(time * .26 + p.phase) * .16, p.y + Math.sin(time * .34 + p.phase) * .12, p.z + Math.cos(time * .22 + p.phase) * .12); dummy.scale.setScalar(p.size); dummy.updateMatrix(); pollen.setMatrixAt(i, dummy.matrix); });
      pollen.instanceMatrix.needsUpdate = true;
    }
    return changed || waveChanged || (visible && !paused && !reduced && (anchors.length > 0 || pollenData.length > 0));
  }
  function dispose() { if (disposed) return; disposed = true; waves?.dispose(); root.removeFromParent(); owned.forEach(value => value.dispose?.()); owned.clear(); }
  function setVisible(value) { visible = !!value; root.visible = visible; waves?.setVisible(value); }
  tick(0, { reduced: true });
  return { tick, dispose, setVisible, getState: () => ({ mapId, mistPatches: anchors.length, pollen: pollenData.length, coast: waves?.getState(), time, disposed }) };
}

// Pool-local, cosmetic vapor. Anchors come from the authored bath surfaces,
// already fitted to the exported model. No game RNG, timers or rule changes.
export function createThermalSteam({ THREE, model, own = value => value }) {
  const pools = model?.userData?.thermalPools;
  if (!Array.isArray(pools) || !pools.length) return null;
  const valid = pools.filter(pool => Array.isArray(pool) && pool.length === 5 && pool.every(Number.isFinite) && pool[3] > 0 && pool[4] > 0);
  if (!valid.length) return null;
  const positions = [], phases = [], sizes = [];
  for (const [x, y, z, w, d] of valid.slice(0, 4)) {
    const rise = Math.min(.24, Math.max(.10, Math.min(w, d) * .7));
    for (let i = 0; i < 12; i++) {
      // Keep the entire plume within the water rectangle, away from the route.
      positions.push(x + ((i % 3) - 1) * w * .22, y + .012, z + ((Math.floor(i / 3) % 2) - .5) * d * .38);
      phases.push((i * .61803398875) % 1);
      sizes.push(rise, Math.min(w, d) * .12);
    }
  }
  const geometry = own(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  geometry.setAttribute('plume', new THREE.Float32BufferAttribute(sizes, 2));
  const material = own(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, pixelHeight: { value: 844 }, tint: { value: new THREE.Color('#edf9f4') } },
    vertexShader: `attribute float phase; attribute vec2 plume;
      uniform float time; uniform float pixelHeight; varying float fade;
      void main(){
        float age=fract(phase+time*.19);
        vec3 p=position;
        p.y+=age*plume.x;
        p.x+=sin(age*5.4+phase*6.28)*plume.y*.24;
        vec4 eye=modelViewMatrix*vec4(p,1.0);
        gl_Position=projectionMatrix*eye;
        float diameter=plume.y*(1.7+age*2.1);
        float screenSize=diameter*pixelHeight*projectionMatrix[1][1]/max(.01,2.0*gl_Position.w);
        gl_PointSize=clamp(screenSize,1.0,28.0);
        fade=sin(age*3.14159265)*.19;
      }`,
    fragmentShader: `uniform vec3 tint; varying float fade;
      void main(){float r=length(gl_PointCoord-vec2(.5));
        if(r>.5)discard;
        gl_FragColor=vec4(tint,(1.0-smoothstep(.05,.5,r))*fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const points = new THREE.Points(geometry, material);
  points.name = 'thermal_pool_steam'; points.userData.cosmetic = true; points.userData.thermalSteam = true;
  points.frustumCulled = false; points.raycast = () => {};
  points.onBeforeRender = renderer => { material.uniforms.pixelHeight.value = renderer.domElement?.height || 844; };
  return points;
}

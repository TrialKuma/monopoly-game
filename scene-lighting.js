// A bounded, cosmetic lighting rig. The caller owns its clock and render loop.
// Sun, moon and weather never consume the game's random stream or change rules.
const TAU = Math.PI * 2;
const TIME_HOURS = Object.freeze({ dawn: 7.1, day: 12.5, dusk: 17, night: 22 });
const clamp = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };
const wrapHour = hour => ((hour % 24) + 24) % 24;

export function createCityLighting({ THREE, scene, world, renderer, light, boardBounds, requestRender = () => {} }) {
  const owned = new Set(), lights = [], groundCopies = [];
  const original = {
    background: scene.background, backgroundIntensity: scene.backgroundIntensity,
    environmentIntensity: scene.environmentIntensity, exposure: renderer?.toneMappingExposure,
  };
  scene.traverse(node => {
    if (!node.isLight) return;
    lights.push({ node, intensity: node.intensity, color: node.color.clone(), ground: node.groundColor?.clone(), position: node.position.clone() });
  });
  const shadow = light?.shadow;
  const shadowOriginal = shadow ? {
    camera: shadow.camera.clone(), bias: shadow.bias, normalBias: shadow.normalBias,
    radius: shadow.radius, autoUpdate: shadow.autoUpdate, needsUpdate: shadow.needsUpdate,
    targetPosition: light.target.position.clone(), castShadow: light.castShadow,
  } : null;
  const root = new THREE.Group(); root.name = 'city_lighting'; root.userData.cosmetic = true; scene.add(root);
  const own = resource => { owned.add(resource); return resource; };
  const color = value => new THREE.Color(value);
  const colors = {
    sun: color('#fff2d8'), dawn: color('#c2e3ff'), amber: color('#ffce78'), moon: color('#b4d4ff'), cloud: color('#d6e1ec'),
    skyDay: color('#b7d7ee'), skyDawn: color('#a1cbea'), skyDusk: color('#abb6c5'), skyNight: color('#08172e'),
    horizonDay: color('#edf1de'), horizonDawn: color('#dfedf6'), horizonDusk: color('#ffe1a0'), horizonNight: color('#29465f'),
    groundDay: color('#dbe4d7'), groundDawn: color('#ccdfe8'), groundDusk: color('#e9d5aa'), groundNight: color('#9fb3bc'),
    hemiDay: color('#c9e6ff'), hemiDawn: color('#b0d8ff'), hemiDusk: color('#ced9e4'), hemiNight: color('#709ccc'),
    bounceDay: color('#dcc8a0'), bounceDawn: color('#bed5e3'), bounceDusk: color('#e7c898'), bounceNight: color('#645947'),
    fillDay: color('#c5e9f5'), fillDawn: color('#c6e5ff'), fillDusk: color('#f8dfb6'), fillNight: color('#8fbbe8'),
    snow: color('#edf3f5'), wet: color('#92aabb'),
  };
  const scratchColor = color('#ffffff'), skyColor = color('#ffffff'), horizonColor = color('#ffffff');
  const sunDirection = new THREE.Vector3(), moonDirection = new THREE.Vector3(), keyDirection = new THREE.Vector3();
  const point = new THREE.Vector3(), target = new THREE.Vector3(0, 1, 0);
  const boardWidth = Math.max(3, Number(boardBounds?.w) || 11.55);
  const boardDepth = Math.max(3, Number(boardBounds?.d) || 9.9);
  const boardRadius = Math.hypot(boardWidth, boardDepth) * .5;
  const lightDistance = Math.max(boardWidth, boardDepth) * 1.65 + 12;
  const shadowCorners = [];
  for (const x of [-boardWidth / 2 - 1, boardWidth / 2 + 1]) {
    for (const z of [-boardDepth / 2 - 1, boardDepth / 2 + 1]) {
      for (const y of [-.5, 4.8]) shadowCorners.push(new THREE.Vector3(x, y, z));
    }
  }

  // A small screen-space sky needs no canvas, remote image, cubemap or PMREM pass.
  const skyPixels = new Uint8Array(2 * 96 * 4);
  const skyTexture = own(new THREE.DataTexture(skyPixels, 2, 96, THREE.RGBAFormat));
  skyTexture.name = 'city_atmosphere_gradient'; skyTexture.colorSpace = THREE.SRGBColorSpace;
  skyTexture.minFilter = skyTexture.magFilter = THREE.LinearFilter; skyTexture.generateMipmaps = false;
  scene.background = skyTexture; scene.backgroundIntensity = .95;

  // Only the large presentation floor is modified. Board and building materials
  // retain their real surface colours. Its edge fades into the atmospheric sky.
  world?.traverse(node => {
    const parameters = node.geometry?.parameters;
    if (!node.isMesh || node.geometry?.type !== 'PlaneGeometry' || parameters?.width < 100 || parameters?.height < 100 || !node.material?.isMeshStandardMaterial) return;
    const previous = node.material, material = own(previous.clone());
    const previousCompile = material.onBeforeCompile;
    material.transparent = true; material.depthWrite = false; material.roughness = .96;
    material.onBeforeCompile = shader => {
      previousCompile.call(material, shader);
      shader.uniforms.cityFloorRadius = { value: boardRadius };
      shader.vertexShader = 'varying vec3 vCityFloorPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCityFloorPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = 'varying vec3 vCityFloorPosition;\nuniform float cityFloorRadius;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat cityDistance = length(vCityFloorPosition.xz) / cityFloorRadius;\ndiffuseColor.a *= 1.0 - smoothstep(1.02, 1.60, cityDistance);');
    };
    material.customProgramCacheKey = () => 'city-atmosphere-floor-v2';
    node.material = material; groundCopies.push({ node, previous, material });
  });

  // Small warm pools actually illuminate nearby facades and paths. These never
  // cast shadows, so the whole city still uses a single shadow map.
  const parkX = Math.max(.8, Math.min(2.6, (boardWidth - 4.7) * .35));
  const parkZ = Math.max(.5, Math.min(1.2, (boardDepth - 4.65) * .3));
  const parkLights = [[-parkX, -.32], [parkX, .32], [.32, parkZ]].map(([x, z], index) => {
    const lamp = new THREE.PointLight('#ffc477', 0, 4.8, 2); lamp.name = `city_park_light_${index}`;
    lamp.position.set(x, .82, z); lamp.castShadow = false; root.add(lamp); return lamp;
  });

  let disposed = false, mode = 'auto', hour = 10, autoHour = 10, targetHour = 10;
  let manualTransition = false, forced = true, reduced = false, lastSignature = '', lastSkySignature = '';
  let cloud = 0, rain = 0, snow = 0, wetness = 0;
  let state = { mode, hour, night: 0, warmth: 0, daylight: 1, cloud: 0, shadowSource: 'sun' };

  function fitShadow() {
    if (!shadow) return;
    // Project all board corners at floor and tallest-building heights into the
    // actual light view. Dawn shadows cannot be clipped by a fixed square box.
    const camera = shadow.camera;
    light.updateMatrixWorld(true); light.target.updateMatrixWorld(true);
    camera.position.copy(light.position); camera.lookAt(light.target.position); camera.updateMatrixWorld(true);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minDepth = Infinity, maxDepth = -Infinity;
    for (const corner of shadowCorners) {
      point.copy(corner).applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
      minDepth = Math.min(minDepth, -point.z); maxDepth = Math.max(maxDepth, -point.z);
    }
    const spanX = maxX - minX + 1.4, spanY = maxY - minY + 1.4;
    const texelX = spanX / Math.max(1, shadow.mapSize.x), texelY = spanY / Math.max(1, shadow.mapSize.y);
    const centerX = Math.round((minX + maxX) / 2 / texelX) * texelX;
    const centerY = Math.round((minY + maxY) / 2 / texelY) * texelY;
    camera.left = centerX - spanX / 2; camera.right = centerX + spanX / 2;
    camera.bottom = centerY - spanY / 2; camera.top = centerY + spanY / 2;
    camera.near = Math.max(.1, minDepth - 4); camera.far = maxDepth + 4; camera.updateProjectionMatrix();
    shadow.normalBias = .012; shadow.bias = -.000035; shadow.radius = mix(2.3, 4.5, cloud);
    shadow.needsUpdate = true;
  }

  function updateSky(daylight, dawn, dusk, night) {
    const signature = [daylight, dawn, dusk, night, cloud, snow].map(value => Math.round(value * 110)).join(':');
    if (signature === lastSkySignature) return;
    lastSkySignature = signature;
    skyColor.copy(colors.skyDay).lerp(colors.skyDawn, dawn * .90).lerp(colors.skyDusk, dusk * .84).lerp(colors.skyNight, night);
    horizonColor.copy(colors.horizonDay).lerp(colors.horizonDawn, dawn).lerp(colors.horizonDusk, dusk).lerp(colors.horizonNight, night * .90);
    skyColor.lerp(colors.cloud, cloud * daylight * .38);
    horizonColor.lerp(colors.cloud, cloud * .48 * daylight).lerp(colors.snow, snow * daylight * .10);
    for (let y = 0; y < 96; y++) {
      // Texture row 0 is screen bottom. A luminous horizon grounds the model.
      const height = y / 95;
      scratchColor.copy(horizonColor).lerp(skyColor, smooth(.02, 1, height)).convertLinearToSRGB();
      for (let x = 0; x < 2; x++) {
        const offset = (y * 2 + x) * 4;
        skyPixels[offset] = Math.round(clamp(scratchColor.r) * 255);
        skyPixels[offset + 1] = Math.round(clamp(scratchColor.g) * 255);
        skyPixels[offset + 2] = Math.round(clamp(scratchColor.b) * 255); skyPixels[offset + 3] = 255;
      }
    }
    skyTexture.needsUpdate = true;
  }

  function apply() {
    const phase = (hour - 6) / 24 * TAU, altitude = Math.sin(phase);
    const daylight = smooth(-.15, .42, altitude), night = 1 - daylight;
    const warmth = Math.exp(-Math.pow((altitude - .28) / .30, 2)) * (1 - cloud * .57);
    // Low sun is not always amber. A pale-blue morning and a honey-coloured
    // evening each tint the complete rig, with an invisible handover at noon.
    // `warmth` remains the existing low-sun indicator used by the clock label.
    const evening = smooth(11, 13, hour), dawn = warmth * (1 - evening), dusk = warmth * evening;
    const sunPower = (.3 + 2.5 * Math.pow(Math.max(0, altitude), .38)) * daylight * (1 - cloud * .76);
    const moonPower = .64 * night * (1 - cloud * .55);
    const moonMix = moonPower / Math.max(.001, sunPower + moonPower);
    sunDirection.set(-Math.cos(phase), Math.max(.40, altitude), .36 + Math.sin(phase * .8) * .18).normalize();
    moonDirection.set(-Math.cos(phase + Math.PI), .68 + Math.max(0, -altitude) * .25, -.28).normalize();
    // The key light changes hands through blue hour, never pointing upward from
    // below the board. This avoids upside-down shadows and dusk blackout.
    keyDirection.copy(sunDirection).lerp(moonDirection, smooth(.12, .96, moonMix)).normalize();
    if (light) {
      light.position.copy(keyDirection).multiplyScalar(lightDistance).add(target);
      light.target.position.copy(target); light.castShadow = true;
      light.color.copy(colors.sun).lerp(colors.dawn, dawn).lerp(colors.amber, dusk * .96).lerp(colors.moon, moonMix);
      light.intensity = sunPower + moonPower; fitShadow();
    }
    for (const base of lights) {
      const node = base.node;
      if (node === light) continue;
      if (node.isHemisphereLight) {
        node.color.copy(colors.hemiDay).lerp(colors.hemiDawn, dawn * .85).lerp(colors.hemiDusk, dusk * .74).lerp(colors.hemiNight, night);
        node.color.lerp(colors.cloud, cloud * .27);
        node.groundColor.copy(colors.bounceDay).lerp(colors.bounceDawn, dawn * .86).lerp(colors.bounceDusk, dusk * .76).lerp(colors.bounceNight, night).lerp(colors.snow, snow * daylight * .42);
        node.intensity = mix(.77, .46, night) + cloud * .16 * daylight + snow * .09;
      } else if (node.isDirectionalLight) {
        node.position.set(-keyDirection.x * lightDistance * .65, lightDistance * .45, -keyDirection.z * lightDistance * .6);
        node.color.copy(colors.fillDay).lerp(colors.fillDawn, dawn).lerp(colors.fillDusk, dusk * .72).lerp(colors.fillNight, night);
        node.intensity = mix(.30, .24, night) + cloud * .06;
      }
    }
    scene.environmentIntensity = mix(.31, .115, night) + cloud * daylight * .035;
    if (renderer && Number.isFinite(original.exposure)) renderer.toneMappingExposure = mix(.96, .98, night) - warmth * .025;
    for (const lamp of parkLights) lamp.intensity = (1.7 + wetness * .5) * smooth(.12, .9, night);
    for (const { material } of groundCopies) {
      material.color.copy(colors.groundDay).lerp(colors.groundDawn, dawn * .85).lerp(colors.groundDusk, dusk * .72).lerp(colors.groundNight, night * .55);
      material.color.lerp(colors.wet, wetness * .14).lerp(colors.snow, snow * .27);
      material.roughness = mix(.96, .60, wetness); material.emissive.copy(colors.skyNight); material.emissiveIntensity = night * .25;
    }
    updateSky(daylight, dawn, dusk, night);
    state = { mode, hour, night, warmth, dawn, dusk, daylight, cloud, shadowSource: moonMix > .5 ? 'moon' : 'sun', sunAltitude: altitude, shadowElevation: keyDirection.y };
  }

  function setTimeMode(value) {
    if (disposed || (value !== 'auto' && !Object.hasOwn(TIME_HOURS, value))) return false;
    if (mode === value && !manualTransition) return true;
    mode = value;
    if (value === 'auto') { autoHour = hour; targetHour = hour; manualTransition = false; }
    else { targetHour = TIME_HOURS[value]; manualTransition = true; }
    forced = true;
    if (reduced) { if (value !== 'auto') hour = targetHour; manualTransition = false; apply(); }
    requestRender(); return true;
  }

  function tick(delta, climate = {}) {
    if (disposed) return false;
    reduced = !!climate.reduced;
    const dt = Math.min(.1, Math.max(0, Number.isFinite(delta) ? delta : 0));
    const frozen = !!climate.paused || reduced;
    if (mode === 'auto' && !frozen) { autoHour = wrapHour(autoHour + dt / 240 * 24); hour = autoHour; }
    else if (manualTransition) {
      let difference = ((targetHour - hour + 36) % 24) - 12;
      if (reduced || Math.abs(difference) < .005) { hour = targetHour; manualTransition = false; }
      else hour = wrapHour(hour + difference * (1 - Math.exp(-Math.max(dt, 1 / 60) * 2.5)));
    }
    // An explicitly selected time may complete while paused. Weather and the
    // automatic clock otherwise stay exactly still while a UI panel is open.
    if (!climate.paused || forced) {
      cloud = clamp(climate.cloud); rain = clamp(climate.rain); snow = clamp(climate.snow); wetness = clamp(climate.wetness);
      cloud = Math.max(cloud, rain * .83);
    }
    const signature = [hour, cloud, rain, snow, wetness, Number(reduced)].map(value => value.toFixed(5)).join(':') + mode;
    if (!forced && signature === lastSignature) return false;
    lastSignature = signature; forced = false; apply(); return true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const base of lights) {
      base.node.intensity = base.intensity; base.node.color.copy(base.color); base.node.position.copy(base.position);
      if (base.ground) base.node.groundColor.copy(base.ground);
    }
    if (shadowOriginal) {
      shadow.camera.copy(shadowOriginal.camera); shadow.bias = shadowOriginal.bias; shadow.normalBias = shadowOriginal.normalBias;
      shadow.radius = shadowOriginal.radius; shadow.autoUpdate = shadowOriginal.autoUpdate; shadow.needsUpdate = shadowOriginal.needsUpdate;
      light.target.position.copy(shadowOriginal.targetPosition); light.castShadow = shadowOriginal.castShadow;
    }
    for (const { node, previous, material } of groundCopies) if (node.material === material) node.material = previous;
    scene.background = original.background; scene.backgroundIntensity = original.backgroundIntensity; scene.environmentIntensity = original.environmentIntensity;
    if (renderer && original.exposure !== undefined) renderer.toneMappingExposure = original.exposure;
    root.removeFromParent(); owned.forEach(resource => resource.dispose()); owned.clear();
  }

  tick(0);
  return { setTimeMode, tick, getState: () => ({ ...state }), dispose };
}

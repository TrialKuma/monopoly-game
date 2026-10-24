import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {loadGeometryGLB,regionalAssetURL} from './gltf-geometry-fixture.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const THREE = await import(pathToFileURL(root + 'assets/vendor/three/three.module.min.js'));
const { createCityWeather } = await import(pathToFileURL(root + 'scene-weather.js'));
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };
const bounds = { w: 14.85, d: 11.55 };
const advance = (weather, seconds, options) => { for (let i = 0; i < Math.ceil(seconds * 30); i++) weather.tick(1 / 30, options); };
const world = new THREE.Group();
const originalLeaf = new THREE.MeshStandardMaterial({ color: '#458a66' }); originalLeaf.name = 'Garden jade';
const originalWindow = new THREE.MeshStandardMaterial({ color: '#ffdca0', emissive: '#ffbd61', emissiveIntensity: .45 }); originalWindow.name = 'Warm lit glass';
const originalGrass = new THREE.MeshStandardMaterial({ color: '#acbf9c' });
const originalPath = new THREE.MeshStandardMaterial({ color: '#e2d8c1', roughness: .78 });
const geo = new THREE.BoxGeometry(1, 1, 1);
const leaf = new THREE.Mesh(geo, originalLeaf), secondLeaf = new THREE.Mesh(geo, originalLeaf);
const windowMesh = new THREE.Mesh(geo, originalWindow), grass = new THREE.Mesh(geo, originalGrass), path = new THREE.Mesh(geo, originalPath);
world.add(leaf, secondLeaf, windowMesh, grass, path);
const weather = createCityWeather({ THREE, world, boardBounds: bounds });
const climate = world.getObjectByName('city_weather');
check('seasonal clones are shared locally and keep source materials unchanged', () => {
  assert.notEqual(leaf.material, originalLeaf); assert.equal(leaf.material, secondLeaf.material);
  assert.equal(originalLeaf.color.getHexString(), '458a66'); assert.equal(originalGrass.color.getHexString(), 'acbf9c');
  assert.equal(windowMesh.material, originalWindow); assert.equal(originalWindow.emissiveIntensity, .45);
});
check('invalid manual choices preserve the selected mode', () => {
  assert.equal(weather.setSeason('typhoon'), false); assert.equal(weather.setWeather('hail'), false);
  assert.equal(weather.getState().seasonMode, 'auto'); assert.equal(weather.getState().weatherMode, 'auto');
});
check('season and precipitation transition gradually', () => {
  const initial = leaf.material.color.clone(); weather.setSeason('autumn'); weather.setWeather('rain'); weather.tick(1 / 30);
  assert.ok(weather.getState().rain > 0 && weather.getState().rain < .1);
  const first = leaf.material.color.clone(), change = Math.hypot(first.r - initial.r, first.g - initial.g, first.b - initial.b);
  assert.ok(change > 0 && change < .02);
  advance(weather, 12);
  assert.ok(Math.abs(leaf.material.color.r - initial.r) > .01); assert.ok(weather.getState().rain > .99);
  assert.ok(path.material.roughness < originalPath.roughness);
  assert.equal(originalPath.roughness, .78); assert.equal(originalPath.color.getHexString(), 'e2d8c1');
});
check('rain ends promptly while wet paths dry more slowly', () => {
  weather.setWeather('clear'); advance(weather, 7);
  assert.ok(weather.getState().rain < .01); assert.ok(weather.getState().wetness > .4);
});
check('manual weather remains selected across an automatic season boundary', () => {
  weather.setSeason('auto'); weather.setWeather('snow'); advance(weather, 91);
  assert.equal(weather.getState().season, 'summer'); assert.equal(weather.getState().weather, 'snow');
});
check('tick uses no global random draws', () => {
  const original = Math.random; let calls = 0; Math.random = () => { calls++; return .5; };
  try { advance(weather, 2); } finally { Math.random = original; }
  assert.equal(calls, 0);
});
check('particle transforms remain finite and modest at every season and weather', () => {
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    weather.setSeason(season);
    for (const climateName of ['clear', 'rain', 'snow']) {
      weather.setWeather(climateName); advance(weather, 8);
      climate.traverse(node => {
        if (node.instanceMatrix) {
          assert.ok(node.count <= 144);
          assert.ok(Array.from(node.instanceMatrix.array).every(Number.isFinite));
        }
        if (node.geometry?.attributes.position) assert.ok(Array.from(node.geometry.attributes.position.array).every(Number.isFinite));
        assert.ok(Number.isFinite(node.position.x + node.position.y + node.position.z));
      });
    }
  }
});
check('weather meshes never intercept board raycasts', () => {
  const hits = [], raycaster = new THREE.Raycaster(new THREE.Vector3(0, 6, 0), new THREE.Vector3(0, -1, 0));
  climate.updateMatrixWorld(true); raycaster.intersectObject(climate, true, hits); assert.equal(hits.length, 0);
});
check('refresh restores removed objects and binds new ones without recoloring lamps', () => {
  world.remove(leaf); weather.refresh(); assert.equal(leaf.material, originalLeaf);
  const newLeaf = new THREE.Mesh(geo, originalLeaf); world.add(newLeaf); weather.refresh();
  assert.equal(newLeaf.material, secondLeaf.material); assert.equal(windowMesh.material, originalWindow);
});
check('identical worlds and tick sequences yield identical cosmetic transforms', () => {
  const a = new THREE.Group(), b = new THREE.Group();
  const wa = createCityWeather({ THREE, world: a, boardBounds: bounds }), wb = createCityWeather({ THREE, world: b, boardBounds: bounds });
  wa.setWeather('rain'); wb.setWeather('rain'); advance(wa, 4); advance(wb, 4);
  assert.deepEqual(wa.getState(), wb.getState());
  for (const name of ['weather_spring_petals', 'weather_rain_streaks', 'weather_park_snowbanks']) {
    const na = a.getObjectByName(name), nb = b.getObjectByName(name);
    assert.deepEqual(Array.from(na.instanceMatrix?.array || na.geometry.attributes.position.array), Array.from(nb.instanceMatrix?.array || nb.geometry.attributes.position.array));
  }
  wa.dispose(); wb.dispose();
});
check('plant names match whole words across exported separators, not Alpine or pineapple', () => {
  const testWorld = new THREE.Group();
  const plants = ['Pine needles', 'Landmark / Jade pine foliage', 'Landmark / New pine tips', 'Park/evergreen_crown', 'Map_topiary_spring', 'alpine/leaf'];
  const architecture = ['alpine/roof', 'alpine/wall', 'alpine/wood', 'alpine/wood_light', 'Alpine sandstone', 'Pineapple ceramic', 'Springfield brick'];
  const rows = [...plants, ...architecture].map(name => {
    const material = new THREE.MeshStandardMaterial({ color: '#cb6144' }); material.name = name;
    const mesh = new THREE.Mesh(geo, material); testWorld.add(mesh); return { mesh, material, plant: plants.includes(name) };
  });
  const effect = createCityWeather({ THREE, world: testWorld, boardBounds: bounds });
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    effect.setSeason(season); effect.tick(0, { reduced: true });
    for (const { mesh, material, plant } of rows) {
      assert.equal(mesh.material !== material, plant, material.name + ': only plants get seasonal copies');
      assert.equal(mesh.material.color.equals(material.color), !plant, material.name + ': only plants change color');
      assert.equal(material.color.getHexString(), 'cb6144', material.name + ': preserve source');
    }
  }
  effect.dispose(); rows.forEach(({ mesh, material }) => { assert.equal(mesh.material, material); material.dispose(); });
});

// Use the actual exported material semantics. Blender's baked color surfaces
// have solid/glass/foliage roles; legacy assets retain their stricter old-name
// requirements, including the /pine/ regression in the alpine region prefix.
{
  const gltf = await loadGeometryGLB(regionalAssetURL('alpine'));
  const sourceTypes=new Set(gltf.scene.children.map(node=>node.userData.sourceType));
  const authored=sourceTypes.has('authored_blender_reference_rebuild');
  if(authored)assert.deepEqual([...sourceTypes],['authored_blender_reference_rebuild'],'the Blender material contract cannot hide mixed legacy roots');
  const testWorld = new THREE.Group(), outside = gltf.scene.clone(true); outside.userData.cosmetic = true;
  testWorld.add(gltf.scene, outside);
  const originals = new Map(), sourceColors = new Map(), outsideMaterials = new Map(),vertexColors=new Map();
  const colorHash=attribute=>{const array=attribute?.data?.array||attribute?.array;assert(array,'authored vertex colors exist');return createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');};
  gltf.scene.traverse(node => {
    if (!node.isMesh) return;
    originals.set(node, node.material);
    if(authored)vertexColors.set(node,{attribute:node.geometry.attributes.color,hash:colorHash(node.geometry.attributes.color)});
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) sourceColors.set(material, {
      color:material.color.clone(),roughness:material.roughness,metalness:material.metalness,emissive:material.emissive.clone(),emissiveIntensity:material.emissiveIntensity,
      map:material.map,roughnessMap:material.roughnessMap,metalnessMap:material.metalnessMap,vertexColors:material.vertexColors,
    });
  });
  outside.traverse(node => { if (node.isMesh) outsideMaterials.set(node, node.material); });
  const effect = createCityWeather({ THREE, world: testWorld, boardBounds: bounds });
  check(`actual Alpine ${authored?'Blender solid/glass surfaces':'legacy roofs, walls and timber'} retain their authored color in all seasons and weather`, () => {
    const names = new Set([...sourceColors.keys()].map(material => material.name));
    if(authored){
      const expected=gltf.scene.children.flatMap(node=>[
        `${node.name} / solid`,`${node.name} / warm window glass`,
        ...(node.name==='alpine_teleport_gate'?[]:[`${node.name} / water foliage`]),
      ]);
      assert.deepEqual([...names].sort(),expected.sort(),'the real Blender package has the complete reviewed solid/glass/foliage material set');
      for(const material of sourceColors.keys()){
        assert.equal(material.vertexColors,true,'Blender authored vertex colors are enabled: '+material.name);
        assert(material.roughnessMap?.isTexture&&material.metalnessMap?.isTexture,'Blender authored surface maps remain bound: '+material.name);
      }
    }else{
      for (const name of ['alpine/roof', 'alpine/roof_edge', 'alpine/wall', 'alpine/wood', 'alpine/wood_light', 'alpine/leaf']) assert(names.has(name), name + ' exists in actual asset');
    }
    for (const season of ['spring', 'summer', 'autumn', 'winter']) for (const weather of ['clear', 'rain', 'snow']) {
      effect.setSeason(season); effect.setWeather(weather); effect.tick(0, { reduced: true });
      for (const [node, original] of originals) {
        const before = Array.isArray(original) ? original : [original], after = Array.isArray(node.material) ? node.material : [node.material];
        before.forEach((material, index) => {
          const plant = authored?material.name.endsWith(' / water foliage'):material.name === 'alpine/leaf', source = sourceColors.get(material);
          assert.equal(after[index] !== material, plant, `${season}/${weather}: ${material.name} only foliage is rebound`);
          if (plant) assert.equal(after[index].color.equals(source.color), false, material.name + ' changes with season');
          else {
            assert(after[index].color.equals(source.color), material.name + ' retains color');
            assert(after[index].emissive.equals(source.emissive),material.name+' retains emission');
            for(const key of ['roughness','metalness','emissiveIntensity','map','roughnessMap','metalnessMap','vertexColors'])assert.equal(after[index][key],source[key],material.name+' retains '+key);
            if(authored){
              const vertices=vertexColors.get(node);assert.equal(node.geometry.attributes.color,vertices.attribute,material.name+' retains authored color attribute');
              assert.equal(colorHash(node.geometry.attributes.color),vertices.hash,material.name+' retains exact authored vertex colors');
            }
          }
          assert(material.color.equals(source.color), material.name + ' shared source is unchanged');
        });
      }
      for (const [node, material] of outsideMaterials) assert.equal(node.material, material, 'cosmetic outskirts preserve original materials');
    }
  });
  effect.dispose();
  for (const [node, material] of originals) assert.equal(node.material, material);
  const resources = new Set(sourceColors.keys()); gltf.scene.traverse(node => { if (node.geometry) resources.add(node.geometry); }); resources.forEach(resource => resource.dispose());
}

const kits = ['city-kit', 'specials', 'landmarks', 'compact-specials', 'expansion-specials'];
{
  const {buildDestinationGarden}=await import(pathToFileURL(root+'scene-garden-kit.js'));
  check('seasonal copies preserve the actual meadow shader and its program key through season changes',()=>{
    const testWorld=new THREE.Group(),garden=new THREE.Group(),perimeter=new THREE.Group(),resources=new Set();
    // Destination scenery is cosmetic but its marked plant surfaces opt in to
    // the seasonal palette. Exercise the real batched grass, not a fake hook.
    garden.userData.cosmetic=true;garden.userData.seasonalScenery=true;garden.add(perimeter);testWorld.add(garden);
    const w=9,d=14.4;
    buildDestinationGarden({THREE,own:r=>{resources.add(r);return r;},root:garden,perimeter,mapId:'harbor',w,d,innerW:w-4.7,innerD:d-4.65,waves:[],boats:[],steam:[]});
    const meadow=[];garden.traverse(node=>{if(node.isMesh&&node.material?.userData.seasonalKind==='grass')meadow.push({node,original:node.material,color:node.material.color.clone()});});
    assert(meadow.length>0,'destination garden has actual meadow surfaces');
    const compile=material=>{
      const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
      material.onBeforeCompile(shader);return shader;
    };
    const before=compile(meadow[0].original),programKey=meadow[0].original.customProgramCacheKey();
    assert(before.vertexShader.includes('vMeadowPoint')&&before.fragmentShader.includes('meadowPatch'),'the authored meadow shader is installed');
    const effect=createCityWeather({THREE,world:testWorld,boardBounds:{w,d}});
    try{
      let spring;
      for(const season of ['spring','winter']){
        effect.setSeason(season);effect.tick(0,{reduced:true});
        for(const {node,original,color} of meadow){
          assert.notEqual(node.material,original,'weather uses a local seasonal material');
          const compiled=compile(node.material);
          assert.equal(compiled.vertexShader,before.vertexShader,season+': meadow world coordinates survive cloning');
          assert.equal(compiled.fragmentShader,before.fragmentShader,season+': meadow colour variation survives cloning');
          assert.equal(node.material.customProgramCacheKey(),programKey,season+': authored shader keeps its cache identity');
          assert(original.color.equals(color),'shared source colour is untouched');
        }
        if(season==='spring')spring=meadow[0].node.material.color.clone();
        else assert(!meadow[0].node.material.color.equals(spring),'season changes still affect the shader-bearing grass');
      }
    }finally{effect.dispose();}
    for(const {node,original} of meadow)assert.equal(node.material,original,'teardown restores the original shader-bearing material');
    resources.forEach(resource=>resource.dispose());
  });
}
{
  const {createRegionalPark}=await import(pathToFileURL(root+'scene-regional-parks.js'));
  check('actual regional garden plants change seasons while masonry and cafe canopies retain their colors',()=>{
    for(const mapId of ['classic','compact','expansion']){
      const parkWorld=new THREE.Group(),resources=new Set();
      createRegionalPark({THREE,world:parkWorld,boardBounds:bounds,mapId,own:r=>{resources.add(r);return r;}});
      const originals=new Map();parkWorld.traverse(n=>{if(n.isMesh)originals.set(n,n.material);});
      const effect=createCityWeather({THREE,world:parkWorld,boardBounds:bounds});
      effect.setSeason('spring');effect.tick(0,{reduced:true});
      const spring=new Map([...originals].map(([n])=>[n,n.material.color.clone()]));
      effect.setSeason('winter');effect.tick(0,{reduced:true});
      let plantCount=0,structureCount=0;const plantKinds=new Set();
      for(const [node,material] of originals){
        if(material.userData.seasonalKind){plantCount++;plantKinds.add(material.userData.seasonalKind);assert.notEqual(node.material,material,mapId+' plant gets local material');assert(!node.material.color.equals(spring.get(node)),mapId+' plant changes season');}
        else{structureCount++;assert.equal(node.material,material,mapId+' structure unchanged');}
      }
      // Static batching may merge many trees into one crown draw. Validate the
      // real botanical roles instead of requiring an arbitrary number of draws.
      const requiredKinds={classic:['grass','leaf','crown'],compact:['grass','blossom','crown','leaf','evergreen'],expansion:['grass','crown']};
      assert.deepEqual([...plantKinds].sort(),requiredKinds[mapId].sort(),mapId+' exercises all authored seasonal plant roles');
      assert(structureCount>=5,`${mapId}: ${plantCount} plant batches and ${structureCount} structural batches tested`);
      effect.dispose();for(const [node,material] of originals)assert.equal(node.material,material);
      resources.forEach(r=>r.dispose());
    }
  });
}
let foliageMeshes = 0, windows = 0;
for (const kit of kits) {
  const gltf = await loadGeometryGLB(pathToFileURL(root + `assets/models/${kit}.glb`));
  const kitWorld = new THREE.Group(); kitWorld.add(gltf.scene);
  const originals = new Map(); gltf.scene.traverse(node => { if (node.isMesh) originals.set(node, node.material); });
  const climate = createCityWeather({ THREE, world: kitWorld, boardBounds: bounds }); climate.setSeason('winter'); climate.tick(0, { reduced: true });
  let seasonal = 0;
  for (const [node, material] of originals) {
    if (node.material !== material) { seasonal++; foliageMeshes++; }
    if (['Landmark / Jade pine foliage', 'Landmark / New pine tips'].includes(material.name)) assert.notEqual(node.material, material, 'legacy pine material still changes with season');
    if (/window|glazing|glass|lantern|portal/i.test(material.name)) { windows++; assert.equal(node.material, material, kit + ': preserve ' + material.name); }
  }
  assert.ok(seasonal > 0, kit + ' binds authored foliage'); climate.dispose();
  for (const [node, material] of originals) assert.equal(node.material, material);
  const resources = new Set(); gltf.scene.traverse(node => { if (node.geometry) resources.add(node.geometry); if (node.material) for (const material of Array.isArray(node.material) ? node.material : [node.material]) resources.add(material); }); resources.forEach(resource => resource.dispose());
  console.log(`PASS ${kit}: ${seasonal} authored foliage meshes tinted; all materials restored`); checks++;
}
weather.dispose();
check('dispose restores live materials, detaches the effect, and is idempotent', () => {
  assert.equal(secondLeaf.material, originalLeaf); assert.equal(windowMesh.material, originalWindow); assert.equal(grass.material, originalGrass); assert.equal(path.material, originalPath);
  assert.equal(climate.parent, null); assert.equal(weather.tick(1), false); assert.equal(weather.setSeason('winter'), false); weather.dispose();
});
geo.dispose(); [originalLeaf, originalWindow, originalGrass, originalPath].forEach(mat => mat.dispose());
console.log(JSON.stringify({ checks, foliageMeshes, windows, failures: 0 }));

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {GLTFLoader} from '../assets/vendor/three/addons/loaders/GLTFLoader.js';

// CPU geometry tests do not have a browser image decoder. The actual GLTFLoader
// still parses all geometry, UVs, PBR materials and texture bindings. Only bitmap
// pixel decoding is substituted with dimensions read from the embedded image.
// This deliberately makes no claim about pixel colors, filtering or rendering.
function imageDimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'PNG must begin with IHDR');
    return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'png'};
  }
  if (bytes.length >= 4 && bytes.readUInt16BE(0) === 0xffd8) {
    const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    let offset = 2;
    while (offset < bytes.length) {
      assert.equal(bytes[offset++], 0xff, 'JPEG marker must begin with FF');
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      assert(offset + 2 <= bytes.length, 'JPEG segment has a length');
      const length = bytes.readUInt16BE(offset);
      assert(length >= 2 && offset + length <= bytes.length, 'JPEG segment stays inside its payload');
      if (sof.has(marker)) {
        assert(length >= 8, 'JPEG frame contains dimensions');
        return {width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3), format: 'jpeg'};
      }
      offset += length;
    }
  }
  throw new Error('Geometry-only image adapter supports embedded PNG/JPEG headers; use browser QA for pixel decoding.');
}

export function regionalAssetURL(mapId,{far=false}={}) {
  const flag=far?'--far-file=':'--region-file=';
  const override = process.argv.find(arg => arg.startsWith(flag))?.slice(flag.length);
  const selected = process.argv.find(arg => arg.startsWith('--map='))?.slice(6);
  if (override) assert(selected, `${flag} requires --map=<region> so another region cannot accidentally use this candidate`);
  if(override&&selected===mapId)return pathToFileURL(resolve(override));
  return process.argv.includes('--candidate')
    ?new URL(`../art/full-ai-city/packed/${mapId}${far?'-far':''}.glb`,import.meta.url)
    :new URL(`../assets/models/${far?'regions-far':'regions'}/${mapId}.glb`,import.meta.url);
}

let parsing = false;
export async function loadGeometryGLB(assetURL) {
  assert(!parsing, 'Load CPU GLB fixtures sequentially to bound memory and temporary image-decoder globals');
  parsing = true;
  const descriptors = new Map(['self', 'createImageBitmap'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const imageHeaders = [], imageErrors = [];
  try {
    globalThis.self = globalThis;
    globalThis.createImageBitmap = async blob => {
      try {
        const bytes = Buffer.from(await blob.arrayBuffer()), dimensions = imageDimensions(bytes);
        assert(dimensions.width > 0 && dimensions.height > 0, 'image dimensions are nonzero');
        const record = {...dimensions, bytes: bytes.length, mimeType: blob.type}; imageHeaders.push(record);
        return {width: dimensions.width, height: dimensions.height, geometryOnlyImageStub: true, close() {}};
      } catch (error) { imageErrors.push(error); throw error; }
    };
    const bytes = fs.readFileSync(assetURL);
    const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    // GLTFLoader can swallow a failed texture load and return null. Geometry
    // fixtures must surface that loss instead of silently dropping map bindings.
    const textures = await gltf.parser.getDependencies('texture');
    assert.equal(imageErrors.length, 0, imageErrors[0]?.message);
    for (const texture of textures) assert(texture?.isTexture && texture.image?.geometryOnlyImageStub, 'all declared textures retain their image binding');
    gltf.geometryTest = {imageDecoding: 'header-only; pixels not decoded or rendered', imageHeaders, textureCount: textures.length};
    if (imageHeaders.length) console.log(`INFO ${fileURLToPath(assetURL)}: ${textures.length} texture bindings; ${imageHeaders.map(image => `${image.width}x${image.height} ${image.format}`).join(', ')}; pixel rendering not tested`);
    return gltf;
  } finally {
    for (const [name, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
    parsing = false;
  }
}

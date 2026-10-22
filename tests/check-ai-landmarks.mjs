import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const assets = [
  { name: 'harbor_lighthouse', reference: 'lighthouse-stylized.png', report: 'lighthouse/lighthouse-v01-pixal-1024-9247.json' },
  { name: 'alpine_windmill', reference: 'alpine-windmill-stylized.png', report: 'alpine/alpine-windmill-v01-pixal-1024-9247.json' },
];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = path => fs.readFileSync(new URL(path, root));
// A single selected-map hero may retain source detail when stronger reduction
// visibly damages its silhouette. The budget is explicit, not a quality proxy.
const maximumTriangles = 200000;
const maximumBytes = 8 * 1024 * 1024;
let checks = 0;
for (const asset of assets) {
  const bytes = read(`assets/models/harbor/${asset.name}.glb`);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.ok(bytes.length < maximumBytes, `${asset.name}: mobile download budget`);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binStart = 20 + jsonLength + 8;
  assert.equal(bytes.readUInt32LE(binStart - 4), 0x004e4942);
  assert.ok(doc.buffers.every(buffer => !buffer.uri), 'mesh buffers must be embedded');
  assert.ok(doc.images.length && doc.images.every(image => image.bufferView !== undefined && !image.uri), 'textures must be embedded');
  const rootNode = doc.nodes.find(node => node.name === asset.name);
  assert.ok(rootNode, `${asset.name}: named root node`);
  let triangles = 0;
  let uvArea = 0;
  const scalarAt = (accessorIndex, item, component = 0) => {
    const accessor = doc.accessors[accessorIndex], view = doc.bufferViews[accessor.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
    const length = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
    assert.ok(length && width, 'supported UV and index accessor layout');
    const offset = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0)
      + item * (view.byteStride || width * length) + component * length;
    const value = accessor.componentType === 5126 ? bytes.readFloatLE(offset)
      : bytes.readUIntLE(offset, length);
    return accessor.normalized ? value / (2 ** (length * 8) - 1) : value;
  };
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
    assert.equal(primitive.mode ?? 4, 4);
    const position = doc.accessors[primitive.attributes.POSITION];
    assert.ok(position.count > 0 && position.min.every(Number.isFinite) && position.max.every(Number.isFinite));
    assert.equal(doc.accessors[primitive.attributes.NORMAL].count, position.count, 'complete vertex normals');
    assert.equal(doc.accessors[primitive.attributes.TEXCOORD_0].count, position.count, 'generated UVs retained');
    const indexCount = primitive.indices === undefined ? position.count : doc.accessors[primitive.indices].count;
    triangles += indexCount / 3;
    const uv = primitive.attributes.TEXCOORD_0;
    for (let face = 0; face < indexCount; face += 3) {
      const points = [0, 1, 2].map(corner => {
        const index = primitive.indices === undefined ? face + corner : scalarAt(primitive.indices, face + corner);
        return [scalarAt(uv, index, 0), scalarAt(uv, index, 1)];
      });
      const [a, b, c] = points;
      uvArea += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    }
  }
  assert.ok(triangles >= 15000 && triangles <= maximumTriangles, `${asset.name}: source-detail triangle budget (${triangles})`);
  assert.ok(Number.isFinite(uvArea) && uvArea >= .1, `${asset.name}: UV atlas retains useful texture coverage (${uvArea.toFixed(4)})`);
  const movingNodes = new Set();
  assert.ok(doc.animations?.length, `${asset.name}: actual exported component animation`);
  for (const clip of doc.animations) {
    assert.ok(clip.channels.length > 0);
    for (const channel of clip.channels) {
      movingNodes.add(channel.target.node);
      const name = doc.nodes[channel.target.node].name;
      assert.notEqual(name, asset.name, 'the whole building must remain still');
      assert.ok(!/structure|body$/i.test(name), 'structural body is not animated');
      const sampler = clip.samplers[channel.sampler], input = doc.accessors[sampler.input], output = doc.accessors[sampler.output];
      assert.ok(input.count >= 3 && input.max[0] > input.min[0], 'animation has real duration');
      assert.equal(output.componentType, 5126, 'animation stores float values');
      const view = doc.bufferViews[output.bufferView], arity = { SCALAR: 1, VEC3: 3, VEC4: 4 }[output.type];
      assert.ok(arity);
      const offset = binStart + (view.byteOffset || 0) + (output.byteOffset || 0), stride = view.byteStride || arity * 4;
      const first = Array.from({ length: arity }, (_, i) => bytes.readFloatLE(offset + i * 4));
      let changes = false;
      for (let sample = 0; sample < output.count; sample++) for (let axis = 0; axis < arity; axis++) {
        const value = bytes.readFloatLE(offset + sample * stride + axis * 4);
        assert.ok(Number.isFinite(value));
        if (Math.abs(value - first[axis]) > .001) changes = true;
      }
      assert.ok(changes, `${name}: exported component really moves`);
    }
  }
  assert.ok(movingNodes.size < doc.nodes.length, 'static building structure remains');
  const report = JSON.parse(read(`art/harbor/reports/${asset.report}`));
  assert.equal(report.status, 'generated_unrigged_part_candidate');
  assert.equal(report.generation_started, true);
  assert.equal(report.local_inference_only, true);
  assert.equal(report.input_unchanged, true);
  assert.equal(hash(read(`art/harbor/references/${asset.reference}`)), report.input_sha256, 'reference matches actual inference');
  const processing = JSON.parse(read(`art/harbor/reports/${asset.name}-processing.json`));
  assert.equal(processing.status, 'ready_for_runtime', 'finished asset has passed visual review');
  assert.equal(processing.visual_review?.status, 'passed', 'actual rendered mesh has been reviewed');
  assert.equal(processing.output.sha256, hash(bytes), 'report identifies exact final animated GLB');
  assert.equal(processing.output.bytes, bytes.length, 'report file size matches final asset');
  assert.equal(processing.source.sha256, report.output_sha256, 'postprocess starts from verified actual neural output');
  assert.equal(processing.raw_source_unchanged, true, 'original neural output remains intact');
  checks++;
  console.log(`PASS ${asset.name}: ${triangles} triangles, ${(bytes.length / 1024 / 1024).toFixed(2)} MiB, ${movingNodes.size} moving component(s), verified Pixal source`);
}
console.log(`${checks} AI landmark asset contracts passed.`);

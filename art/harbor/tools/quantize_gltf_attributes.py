"""Pack mobile GLB normals/UVs without changing positions, faces or textures.

KHR_mesh_quantization is supported by the game's vendored GLTFLoader. Normals
use normalized signed bytes; UVs use normalized unsigned shorts only if inside
[0, 1]. No decoder, Draco dependency, vertex welding, or texture baking is used.
The returned audit measures angular and UV error and hashes both files.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def quantize_mobile_attributes(source_path, output_path=None):
    source_path = Path(source_path)
    output_path = Path(output_path) if output_path else source_path
    original = source_path.read_bytes()
    magic, version, total = struct.unpack_from('<4sII', original)
    if (magic, version, total) != (b'glTF', 2, len(original)):
        raise ValueError('Expected a complete GLB 2 file')
    json_size, json_type = struct.unpack_from('<II', original, 12)
    if json_type != 0x4e4f534a:
        raise ValueError('Expected JSON first chunk')
    document = json.loads(original[20:20 + json_size])
    binary_size, binary_type = struct.unpack_from('<II', original, 20 + json_size)
    binary = original[28 + json_size:28 + json_size + binary_size]
    if binary_type != 0x004e4942 or len(binary) != binary_size:
        raise ValueError('Expected embedded binary second chunk')
    if len(document['buffers']) != 1 or document['buffers'][0].get('uri'):
        raise ValueError('Only self-contained single-buffer GLB is supported')
    accessors, views = document['accessors'], document['bufferViews']
    targets = {}
    for mesh in document.get('meshes', []):
        for primitive in mesh['primitives']:
            for semantic in ('NORMAL', 'TEXCOORD_0'):
                index = primitive.get('attributes', {}).get(semantic)
                if index is not None:
                    if index in targets and targets[index] != semantic:
                        raise ValueError('Accessor has incompatible semantic uses')
                    targets[index] = semantic
    replacements, audits = {}, []
    for index, semantic in sorted(targets.items()):
        accessor = accessors[index]
        expected_type, width = ('VEC3', 3) if semantic == 'NORMAL' else ('VEC2', 2)
        if accessor['componentType'] != 5126:
            continue
        if accessor['type'] != expected_type or accessor.get('sparse'):
            raise ValueError(f'Unsupported {semantic} accessor {index}')
        view_index = accessor['bufferView']
        if sum(a.get('bufferView') == view_index for a in accessors) != 1:
            raise ValueError('Shared/interleaved buffer views require separate extraction')
        view = views[view_index]
        if view.get('buffer', 0) != 0:
            raise ValueError('Unexpected second buffer')
        start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        stride = view.get('byteStride', width * 4)
        count = accessor['count']
        if start + max(0, count - 1) * stride + width * 4 > len(binary):
            raise ValueError('Attribute exceeds embedded buffer')
        values = [struct.unpack_from('<' + 'f' * width, binary, start + i * stride)
                  for i in range(count)]
        if not all(math.isfinite(v) for value in values for v in value):
            raise ValueError('Non-finite attribute data')
        packed = bytearray()
        max_error = 0.0
        if semantic == 'NORMAL':
            for value in values:
                quantized = [round(max(-1.0, min(1.0, v)) * 127) for v in value]
                packed.extend(struct.pack('<bbbx', *quantized))
                length = math.sqrt(sum(v * v for v in value))
                qlength = math.sqrt(sum(v * v for v in quantized))
                if length and qlength:
                    cosine = sum(a * b for a, b in zip(value, quantized)) / (length * qlength)
                    max_error = max(max_error, math.degrees(math.acos(max(-1.0, min(1.0, cosine)))))
            accessor['componentType'] = 5120
            audits.append({'accessor': index, 'semantic': semantic, 'count': count,
                           'maximumAngularErrorDegrees': max_error})
        else:
            if any(v < -1e-6 or v > 1.000001 for value in values for v in value):
                audits.append({'accessor': index, 'semantic': semantic,
                               'skipped': 'UVs outside normalized range retained as floats'})
                continue
            for value in values:
                quantized = [round(max(0.0, min(1.0, v)) * 65535) for v in value]
                packed.extend(struct.pack('<HH', *quantized))
                max_error = max(max_error, *(abs(v - q / 65535) for v, q in zip(value, quantized)))
            accessor['componentType'] = 5123
            audits.append({'accessor': index, 'semantic': semantic, 'count': count,
                           'maximumUVError': max_error, 'maximumTexelErrorAt1024': max_error * 1024})
        accessor['normalized'] = True
        accessor.pop('min', None)
        accessor.pop('max', None)
        accessor.pop('byteOffset', None)
        replacements[view_index] = bytes(packed)
    rebuilt = bytearray()
    for index, view in enumerate(views):
        old_start = view.get('byteOffset', 0)
        block = replacements.get(index, binary[old_start:old_start + view['byteLength']])
        rebuilt.extend(b'\0' * (-len(rebuilt) % 4))
        view['byteOffset'] = len(rebuilt)
        view['byteLength'] = len(block)
        if index in replacements:
            view['byteStride'] = 4
        rebuilt.extend(block)
    if any(a['semantic'] == 'NORMAL' and not a.get('skipped') for a in audits):
        for field in ('extensionsUsed', 'extensionsRequired'):
            document.setdefault(field, [])
            if 'KHR_mesh_quantization' not in document[field]:
                document[field].append('KHR_mesh_quantization')
    document['buffers'][0]['byteLength'] = len(rebuilt)
    encoded = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    rebuilt.extend(b'\0' * (-len(rebuilt) % 4))
    result = (struct.pack('<4sII', b'glTF', 2, 28 + len(encoded) + len(rebuilt))
              + struct.pack('<II', len(encoded), 0x4e4f534a) + encoded
              + struct.pack('<II', len(rebuilt), 0x004e4942) + rebuilt)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix('.quantized.tmp.glb')
    temporary.write_bytes(result)
    temporary.replace(output_path)
    return {'source': str(source_path), 'output': str(output_path),
            'sourceBytes': len(original), 'outputBytes': len(result),
            'sourceSha256': sha256(original), 'outputSha256': sha256(result),
            'positionFaceAndTextureBytesUnchanged': True, 'attributes': audits}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source')
    parser.add_argument('output', nargs='?')
    parser.add_argument('--report')
    args = parser.parse_args()
    report = quantize_mobile_attributes(args.source, args.output)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.report:
        Path(args.report).write_text(text + '\n', encoding='utf-8')
    print(text)

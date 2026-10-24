"""Bake original neural colors onto native UV charts, preserving the exact LOD.

CPU Blender only. This adapter transfers returned chart UVs back to the existing
low mesh's loops, so neither triangle order nor normals need reconstruction.
The GPU unwrap receipt must prove unchanged oriented triangle positions.
"""
from pathlib import Path
from types import SimpleNamespace
from collections import defaultdict, deque
import argparse, json, sys, shutil
import numpy as np
import bpy

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import process_lod as lod
from bake_nearest_surface import bake
from neural_component import GLB


def resolve(path):
    path = Path(path)
    return path if path.is_absolute() else lod.ROOT / path


def verified(row):
    path = resolve(row['path'])
    assert lod.p.sha256(path) == row['sha256'], 'Changed evidence: ' + str(path)
    return path


def canonical_triangle(corners):
    first = int(np.lexsort((corners[:, 2], corners[:, 1], corners[:, 0]))[0])
    order = (np.arange(3) + first) % 3
    key = np.ascontiguousarray(corners[order], dtype=np.float32).tobytes()
    return key, first, order


def uv_for_original_loops(vertices, faces, native):
    nv, nf, nu = native['vertices'], native['faces'], native['uvs']
    assert nv.dtype == np.float32 and nf.dtype == np.int32
    assert len(nf) == len(faces) and nu.shape == (len(nv), 2)
    assert np.isfinite(nu).all() and nu.min() >= -1e-6 and nu.max() <= 1 + 1e-6
    # A queue also preserves multiplicity if a source has duplicate triangles.
    table = defaultdict(deque)
    for face in nf:
        key, _, order = canonical_triangle(nv[face])
        table[key].append(nu[face][order])
    result = np.empty((len(faces), 3, 2), dtype=np.float32)
    for i, face in enumerate(faces):
        key, first, _ = canonical_triangle(vertices[face])
        assert table[key], 'Native unwrap changed a triangle or its winding'
        result[i] = np.roll(table[key].popleft(), first, axis=0)
    assert not any(table.values()), 'Native unwrap added triangles'
    return result


def mesh_arrays(mesh):
    vertices = np.empty((len(mesh.vertices), 3), np.float32)
    mesh.vertices.foreach_get('co', vertices.ravel())
    faces = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get('vertex_index', faces)
    normals = np.empty((len(mesh.corner_normals), 3), np.float32)
    mesh.corner_normals.foreach_get('vector', normals.ravel())
    return vertices, faces.reshape(-1, 3), normals


def face_positions(path):
    glb = GLB(path)
    primitive = glb.doc['meshes'][0]['primitives'][0]
    return glb.array(primitive['attributes']['POSITION'])[glb.array(primitive['indices']).reshape(-1, 3)]


def snapshot(path):
    target = lod.ART / 'reports/tool-snapshots' / (lod.p.sha256(path) + '-' + path.name)
    if not target.exists():
        shutil.copyfile(path, target)
    return lod.p.file_evidence(target)


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('--report', type=Path, required=True)
    cli.add_argument('--blend', type=Path, required=True)
    cli.add_argument('--sha256', required=True)
    cli.add_argument('--uv-receipt', type=Path, required=True)
    cli.add_argument('--output-root', type=Path, required=True)
    cli.add_argument('--texture-size', type=int, choices=(512, 1024), default=1024)
    options = cli.parse_args(sys.argv[sys.argv.index('--') + 1:])
    report = json.loads(options.report.read_text('utf8'))
    prior = verified(report['processedCandidate'])
    assert lod.p.sha256(prior) == options.sha256
    verified(report['source']['rawGLB'])
    receipt = json.loads(options.uv_receipt.read_text('utf8'))
    assert receipt['status'] == 'uv_ready_for_original_texture_transfer'
    assert receipt['sameTriangleCornerPositionMultiset'] and receipt['windingPreserved']
    assert receipt['maximumPositionChange'] == 0 and not receipt['additionalRemeshOrSimplification']
    assert receipt['candidate']['sha256'] == options.sha256
    proof = json.loads(verified(receipt['inputProof']).read_text('utf8'))
    assert verified(proof['sourceBlend']).resolve() == options.blend.resolve()
    native = np.load(verified(receipt['output']))
    native_input = np.load(verified(receipt['input']))
    region, asset = report['region'], report['asset']
    name = region + '__' + asset
    dest = options.output_root.resolve()
    out = dest / region / (asset + '.glb')
    if out.resolve() == prior.resolve() or out.exists():
        raise RuntimeError('Use a fresh isolated output; never replace a candidate')
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(options.blend.resolve()))
    source = bpy.data.objects[name + '__raw_source']
    low = bpy.data.objects[name + '__neural_lod']
    root = low.parent
    vertices, faces, normals = mesh_arrays(low.data)
    assert np.array_equal(vertices, native_input['vertices'])
    assert np.array_equal(faces, native_input['faces'])
    expected_source = report['derivation'].get('repairedSourceTriangles', report['derivation']['rawTriangles']) - report.get('sourceArtifactCleanup', {}).get('deletedTriangles', 0)
    assert lod.p.triangles(source) == expected_source
    loop_uv = uv_for_original_loops(vertices, faces, native)
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    uv_layer = low.data.uv_layers.new(name='NativeNeuralUV')
    uv_layer.data.foreach_set('uv', loop_uv.ravel())
    low.data.uv_layers.active_index = 0
    uv_layer.active_render = True
    after_vertices, after_faces, after_normals = mesh_arrays(low.data)
    assert np.array_equal(vertices, after_vertices) and np.array_equal(faces, after_faces)
    assert np.array_equal(normals, after_normals)
    coverage = lod.uv_area(low)
    print('NATIVE_UV_GEOMETRY_NORMALS_UNCHANGED', len(faces), 'COVERAGE', coverage, flush=True)
    if coverage < .30:
        raise RuntimeError('Native atlas below existing .30 coverage guard: ' + str(coverage))
    args = SimpleNamespace(region=region, asset=asset, name=name, lod='near', height=1., footprint=1., texture_size=options.texture_size, render_directory=dest / 'renders' / region / asset)
    report['bake'], _ = bake(source, low, args)
    report['bake']['sourceNote'] = 'Native CuMesh UV charts applied to the exact existing low mesh loops. Original source textures transferred by closest original surface with float64 barycentric UV; no new geometry or painted colors.'
    report['derivation']['atlasArea'] = coverage
    report['derivation']['uvUnwrap'] = {'method': 'native CuMesh UV-only', 'parameters': receipt['parameters'], 'receipt': lod.p.file_evidence(options.uv_receipt)}
    report['textureOnlyReprocessing'] = {
        'sourceCandidate': lod.p.file_evidence(prior), 'sourceProcessingReport': lod.p.file_evidence(options.report),
        'sourceBlend': lod.p.file_evidence(options.blend), 'nativeUVReceipt': lod.p.file_evidence(options.uv_receipt),
        'sourceTriangleCountVerified': expected_source, 'positionsUnchanged': True, 'faceIndicesUnchanged': True,
        'cornerNormalsUnchanged': True, 'additionalRemeshOrSimplification': False,
        'uvAssignment': 'Native cyclic triangle position matches transfer UVs to original loops; original triangle order and winding retained.',
    }
    report['processingTool'] = snapshot(Path(__file__))
    report['textureTransferTool'] = snapshot(HERE / 'bake_nearest_surface.py')
    lod.p.select_only([root, low])
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB', use_selection=True, export_yup=True, export_animations=False, export_image_format='JPEG', export_jpeg_quality=92, export_extras=True)
    report['quantization'] = lod.quantize_mobile_attributes(out)
    assert np.array_equal(face_positions(prior), face_positions(out))
    report['textureOnlyReprocessing']['exportedTriangleCornerPositionsExactlyUnchanged'] = True
    report['processedCandidate'] = lod.p.file_evidence(out)
    report['glbValidation'] = lod.p.inspect_glb(out)
    report['triangles'] = report['glbValidation']['triangles']
    report['status'] = 'exported_pending_visual_review'
    report['processingComplete'] = False
    out.with_suffix('.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    report['renderedCandidate'] = lod.render(out, args, ('front', 'right', 'back', 'left', 'iso'))
    report['textureSizes'] = report['renderedCandidate']['textureSizes']
    report['processingComplete'] = True
    report['completedAt'] = lod.now()
    out.with_suffix('.json').write_text(json.dumps(report, indent=2), encoding='utf8')
    print('NATIVE_UV_CANDIDATE', json.dumps(report['processedCandidate']), flush=True)


if __name__ == '__main__':
    main()

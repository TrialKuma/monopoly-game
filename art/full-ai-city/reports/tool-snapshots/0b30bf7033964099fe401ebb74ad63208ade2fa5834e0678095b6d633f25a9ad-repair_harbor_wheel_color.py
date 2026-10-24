"""Bounded original-texture resampling of the repaired harbor wheel's paint.

Run in Blender. No inference, changed UVs, mesh re-export, new geometry, painted
palette or animation edits. The existing wheel atlas is retained, and only UV
pixels belonging to its front painted plate receive samples from the actual
normalized neural source's front plate. Unrelated atlas pixels are copied.
"""
from pathlib import Path
from types import SimpleNamespace
import argparse, copy, hashlib, json, shutil, sys
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import process_lod as lod
import render_component
from neural_component import GLB
from pack_runtime import matrix
from bake_nearest_surface import array, sample, source_image


def ev(path):
    return lod.p.file_evidence(Path(path))


def decoded(g, index):
    values = g.array(index).astype(np.float64)
    accessor = g.doc['accessors'][index]
    if accessor.get('normalized'):
        values /= {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}[accessor['componentType']]
    return values


def view_bytes(g, index):
    row = g.doc['bufferViews'][index]
    return bytes(g.blob[row.get('byteOffset', 0):row.get('byteOffset', 0) + row['byteLength']])


def raster(vertices, faces, uv, selected, size):
    locations = np.zeros((size, size, 3), np.float64)
    valid = np.zeros((size, size), bool)
    conflicts = np.zeros_like(valid)
    face_ids = np.full((size, size), -1, np.int32)
    for fi in np.flatnonzero(selected):
        face = faces[fi]
        q = uv[face] * size - .5
        lo = np.maximum(0, np.ceil(q.min(0)).astype(int))
        hi = np.minimum(size - 1, np.floor(q.max(0)).astype(int))
        if np.any(hi < lo):
            continue
        x, y = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
        p = np.stack([x, y], -1)
        a, b, c = q
        v0, v1, v2 = b - a, c - a, p - a
        den = v0[0] * v1[1] - v0[1] * v1[0]
        if abs(den) < 1e-12:
            continue
        u = (v2[:, :, 0] * v1[1] - v2[:, :, 1] * v1[0]) / den
        v = (v0[0] * v2[:, :, 1] - v0[1] * v2[:, :, 0]) / den
        inside = (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6)
        xx, yy = x[inside], y[inside]
        a, b, c = vertices[face]
        points = a + (b - a) * u[inside, None] + (c - a) * v[inside, None]
        conflict = valid[yy, xx] & (np.linalg.norm(locations[yy, xx] - points, axis=1) > .005)
        conflicts[yy[conflict], xx[conflict]] = True
        locations[yy, xx] = points
        valid[yy, xx] = True
        face_ids[yy, xx] = fi
    return locations, valid, conflicts, face_ids


def replace_base(g, source, output, image_path, image_index):
    image_view = g.doc['images'][image_index]['bufferView']
    old = GLB(source)
    blob = bytearray()
    for i, row in enumerate(g.doc['bufferViews']):
        payload = image_path.read_bytes() if i == image_view else view_bytes(old, i)
        while len(blob) % 4:
            blob.append(0)
        row['byteOffset'], row['byteLength'] = len(blob), len(payload)
        blob.extend(payload)
    g.blob = blob
    g.doc['images'][image_index]['mimeType'] = 'image/png'
    g.save(output)
    new = GLB(output)
    for key in ['accessors', 'nodes', 'meshes', 'scenes', 'animations', 'materials', 'textures', 'samplers']:
        assert old.doc.get(key) == new.doc.get(key), key
    kept = []
    for i in range(len(old.doc['bufferViews'])):
        if i == image_view:
            continue
        before = view_bytes(old, i)
        assert before == view_bytes(new, i), 'Changed non-color payload'
        kept.append({'bufferView': i, 'sha256': hashlib.sha256(before).hexdigest()})
    return {'positionsIndicesNormalsUVHierarchyAnimationUnchanged': True,
            'materialsTextureReferencesAndSamplerUnchanged': True,
            'onlyReplacedImageIndex': image_index, 'preservedBufferViews': kept}


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('--report', type=Path, required=True)
    cli.add_argument('--output', type=Path, required=True)
    args = cli.parse_args(sys.argv[sys.argv.index('--') + 1:])
    original = json.loads(args.report.read_text('utf8'))
    source = Path(original['processedCandidate']['path'])
    assert lod.p.sha256(source) == original['processedCandidate']['sha256']
    raw = Path(original['source']['rawGLB']['path'])
    assert lod.p.sha256(raw) == original['source']['rawGLB']['sha256']
    out = args.output.resolve()
    if out.exists():
        raise FileExistsError(out)
    out.mkdir(parents=True)
    g = GLB(source)
    node_index, node = next((i, n) for i, n in enumerate(g.doc['nodes']) if n.get('extras', {}).get('lifePart') == 'wheel')
    part = g.doc['meshes'][node['mesh']]['primitives'][0]
    vertices = decoded(g, part['attributes']['POSITION'])
    faces = g.array(part['indices']).reshape(-1, 3)
    uv = decoded(g, part['attributes']['TEXCOORD_0'])
    uv[:, 1] = 1 - uv[:, 1]
    mat = g.doc['materials'][part['material']]
    assert 'normalTexture' not in mat, 'Use the isolated shading-only candidate'
    image_index = g.doc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
    image = g.doc['images'][image_index]
    original_image = out / ('original-base.png' if image['mimeType'] == 'image/png' else 'original-base.jpg')
    original_image.write_bytes(view_bytes(g, image['bufferView']))
    lod.clear_scene()
    current = bpy.data.images.load(str(original_image))
    size, height = current.size
    assert size == height
    pixels = np.empty(size * size * 4, np.float32)
    current.pixels.foreach_get(pixels)
    pixels = pixels.reshape(size, size, 4)
    original_pixels = pixels.copy()
    triangles = vertices[faces]
    normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    normals /= np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-15)
    centers = triangles.mean(1)
    radii = np.linalg.norm(centers[:, :2], axis=1)
    selected = (radii > .025) & (radii < .148) & (centers[:, 2] > -.015) & (centers[:, 2] < .015) & (normals[:, 2] > .5)
    locations, valid, conflicts, face_ids = raster(vertices, faces, uv, selected, size)
    # Leave the metal hub and wooden rim outside the bounded painted annulus.
    point_radius = np.linalg.norm(locations[:, :, :2], axis=2)
    valid &= (point_radius > .029) & (point_radius < .147)
    valid &= ~conflicts
    settings = SimpleNamespace(region='harbor', asset='chance_wheel', lod='near', height=1., footprint=1.,
                               pitch=0, roll=0, yaw=180, no_auto_upright=False, max_upright=18,
                               render_directory=out / 'renders')
    high, _ = lod.p.import_body(raw)
    normalization = lod.p.upright(high, settings)
    hv = array(high.data.vertices, 'co', 3).astype(np.float64)
    hf = array(high.data.loops, 'vertex_index', 1, np.int32).reshape(-1, 3)
    hu = array(high.data.uv_layers.active.data, 'uv', 2).reshape(-1, 3, 2)
    # Transform the normalized real neural source into the unchanged wheel frame.
    world = np.array(matrix(node)).reshape((4, 4), order='F')
    gltf_hv = hv[:, [0, 2, 1]].copy()
    gltf_hv[:, 2] *= -1
    local_hv = (np.column_stack([gltf_hv, np.ones(len(hv))]) @ np.linalg.inv(world).T)[:, :3]
    ht = local_hv[hf]
    hn = np.cross(ht[:, 1] - ht[:, 0], ht[:, 2] - ht[:, 0])
    hn /= np.maximum(np.linalg.norm(hn, axis=1)[:, None], 1e-15)
    hc = ht.mean(1)
    hr = np.linalg.norm(hc[:, :2], axis=1)
    source_faces = np.flatnonzero((hr > .022) & (hr < .153) & (hc[:, 2] > -.02) & (hc[:, 2] < .009) & (hn[:, 2] > .5))
    if len(source_faces) < 100:
        raise ValueError('Insufficient actual source painted-plate surface')
    tree = BVHTree.FromPolygons(local_hv.tolist(), hf[source_faces].tolist(), all_triangles=True)
    points = locations[valid]
    hits, hit_faces, distances = [], [], []
    for point in points:
        hit, normal, face, distance = tree.find_nearest(point)
        if hit is None:
            raise RuntimeError('Original wheel surface sample missing')
        hits.append(hit); hit_faces.append(source_faces[face]); distances.append(distance)
    hits = np.asarray(hits, np.float64)
    hit_faces = np.asarray(hit_faces, np.int32)
    distances = np.asarray(distances)
    tri = local_hv[hf[hit_faces]]
    a, b, c = tri[:, 0], tri[:, 1], tri[:, 2]
    v0, v1, v2 = b - a, c - a, hits - a
    d00, d01, d11 = (v0 * v0).sum(1), (v0 * v1).sum(1), (v1 * v1).sum(1)
    d20, d21 = (v2 * v0).sum(1), (v2 * v1).sum(1)
    den = d00 * d11 - d01 * d01
    if np.any(abs(den) < 1e-28):
        raise ValueError('Degenerate original plate triangle')
    u, v = (d11 * d20 - d01 * d21) / den, (d00 * d21 - d01 * d20) / den
    weights = np.clip(np.stack([1 - u - v, u, v], 1), 0, 1)
    weights /= weights.sum(1)[:, None]
    sampled_uv = (hu[hit_faces] * weights[:, :, None]).sum(1)
    bsdf = next(n for n in high.data.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    color_image = source_image(bsdf.inputs['Base Color'])
    sampled = sample(color_image, sampled_uv)
    safe = distances < .023
    y, x = np.where(valid)
    pixels[y[safe], x[safe], :3] = sampled[safe, :3]
    changed = np.any(abs(pixels - original_pixels) > 1e-7, axis=2)
    assert not np.any(changed & ~valid)
    current.pixels.foreach_set(pixels.ravel()); current.update()
    texture_path = out / 'repaired-base.png'
    current.filepath_raw = str(texture_path); current.file_format = 'PNG'; current.save()
    output = out / 'chance_wheel.glb'
    preservation = replace_base(g, source, output, texture_path, image_index)
    proof = {'method': 'Bounded actual-original-neural-texture nearest plate sampling into unchanged existing wheel UV pixels. No flat palette or reference painting.',
             'sourceCandidate': ev(source), 'sourceRaw': ev(raw), 'sourceNormalization': normalization,
             'wheelNode': node_index, 'selectedFrontPlateFaces': int(selected.sum()), 'sourcePlateTriangles': len(source_faces),
             'paintRadius': [.029, .147], 'sourceLocalDepth': [-.02, .009], 'targetLocalDepth': [-.015, .015],
             'atlasSize': size, 'changedPixels': int(changed.sum()), 'untouchedPixels': int((~changed).sum()),
             'allPixelsOutsideSelectedWheelUVUnchangedBeforeEncoding': True,
             'overlappingPaintUVPixelsSkipped': int(conflicts.sum()), 'sourceDistanceQuantiles': np.quantile(distances, [.5, .95, .99, 1]).tolist(),
             'distanceRejectedPixels': int((~safe).sum()), 'preservation': preservation}
    lod.write(out / 'texture-repair-proof.json', proof)
    report = copy.deepcopy(original)
    report['priorShadingOnlyRefinement'] = report.pop('shadingOnlyRefinement')
    report['localWheelTextureRepair'] = proof
    report['processingComplete'] = False
    report['processedCandidate'] = ev(output)
    snapshot = lod.ART / 'reports/tool-snapshots' / (lod.p.sha256(Path(__file__)) + '-repair_harbor_wheel_color.py')
    if not snapshot.exists():
        shutil.copy2(__file__, snapshot)
    report['processingTool'] = ev(snapshot)
    report['status'] = 'exported_pending_visual_review'
    report['bake'] = {'method': proof['method'], 'priorBake': original['bake']}
    report['renderedCandidate'] = lod.render(output, settings, ('front', 'right', 'back', 'left', 'iso'))
    sys.argv = ['render_component', '--', '--source', str(output), '--region', 'harbor', '--asset', 'chance_wheel', '--output-directory', str(out / 'motion')]
    render_component.main()
    motion_path = out / 'motion/review.json'
    motion = json.loads(motion_path.read_text('utf8'))
    report['animation']['poseReview'] = ev(motion_path)
    report['animation']['frames'] = [p for pose in motion['poses'] for p in pose['views']]
    report['processingComplete'] = True
    report['completedAt'] = lod.now()
    lod.write(output.with_suffix('.json'), report)
    print('WHEEL_TEXTURE_REPAIR_READY', output, flush=True)


if __name__ == '__main__':
    main()

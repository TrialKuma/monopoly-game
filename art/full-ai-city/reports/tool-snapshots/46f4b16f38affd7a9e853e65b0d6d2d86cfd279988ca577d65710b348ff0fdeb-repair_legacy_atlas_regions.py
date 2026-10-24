"""Three inspected local repairs; CPU only, never new model inference.

shop_1: give two diagnosed narrow wall triangles an adequate isolated source bake.
hotel_2: repair reversed corner normals only on the inspected rear corner strip.
shop_3: close the recorded gap below the existing dormer roof with a small roof
fascia sampled from that same generated roof; retain all existing architecture.
"""
from pathlib import Path
from types import SimpleNamespace
import argparse, copy, json, math, shutil, sys
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).parent))
import process_lod as lod
from bake_nearest_surface import bake as source_bake
from fix_customnormals_helper import repair_reversed_corner_normals


EXPECTED = {
    'shop_1': '461fdd57640e600770973b92e12575b2ce818c19383965dca19bff5526e52f3a',
    'shop_3': '2aade155b930a131907b829e92a794e8393229c72e6ca95548fbe818fbbf25fc',
    'hotel_2': '508884ebc9debad2e21848be45d0dad57d2f26992a1f1f2cce82d14688b6f4c9',
}


def temporary_mesh(name, coordinates, faces):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(coordinates, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def triangle_cells(mesh):
    """No overlapping/narrow islands: one triangle in each padded atlas cell."""
    uv = mesh.uv_layers.new(name='InspectedLocalSourceUV').data
    count = len(mesh.polygons)
    columns = math.ceil(math.sqrt(count))
    for index, face in enumerate(mesh.polygons):
        assert len(face.vertices) == 3
        x, y = index % columns, index // columns
        for loop, point in zip(face.loop_indices, ((.08, .08), (.92, .08), (.08, .92))):
            uv[loop].uv = ((x + point[0]) / columns, (y + point[1]) / columns)


def normal_region(mesh, asset):
    if asset == 'hotel_2':
        ids = [v.index for v in mesh.vertices if -.405 < v.co.x < -.31 and .17 < v.co.y < .255 and .36 < v.co.z < .65]
    else:
        ids = [v.index for v in mesh.vertices if -.23 < v.co.x < -.075 and .16 < v.co.y < .28 and .82 < v.co.z < .89]
    return repair_reversed_corner_normals(mesh, vertex_indices=ids)


def repair_wall_atlas(body, source):
    mesh = body.data
    target = [mesh.polygons[index] for index in (16921, 5254)]
    expected_centers = ([.45031447, -.02444376, .42366553], [.44950365, -.01531219, .20172799])
    for face, center in zip(target, expected_centers):
        assert np.linalg.norm(np.array(face.center) - center) < .001 and face.normal.x > .98
    coordinates = [mesh.vertices[i].co[:] for face in target for i in face.vertices]
    patch = temporary_mesh('Inspected shop wall atlas sampling surface', coordinates, [(0, 1, 2), (3, 4, 5)])
    triangle_cells(patch.data)
    receipt, _ = source_bake(source, patch, SimpleNamespace(texture_size=512, name='classic_shop1_wall_local'))
    assert receipt['atlasOverlapPixelsWithDifferentSurface'] == 0
    material_index = len(mesh.materials)
    mesh.materials.append(patch.data.materials[0])
    for face, patch_face in zip(target, patch.data.polygons):
        face.material_index = material_index
        for dst, src in zip(face.loop_indices, patch_face.loop_indices):
            mesh.uv_layers.active.data[dst].uv = patch.data.uv_layers.active.data[src].uv
    bpy.data.objects.remove(patch, do_unlink=True)
    return {'method': 'Two measured narrow wall triangles receive isolated padded UV triangles and exact nearest original-source color/ORM; no painted colors or geometry changes', 'changedOriginalFaces': [face.index for face in target], 'originalFaceCentersBlender': [list(face.center) for face in target], 'sourceTransfer': receipt, 'newMaterials': 1, 'trianglesAdded': 0}


def close_dormer_gap(source):
    """Bridge only the missing fascia below the existing dormer cap edge."""
    tree = BVHTree.FromObject(source, bpy.context.evaluated_depsgraph_get())
    xs = [-.214, -.197, -.180, -.163, -.150, -.133, -.116, -.099, -.089]
    actual = []
    donors = []
    samples = []
    for x in xs:
        point, normal, index, distance = tree.ray_cast(Vector((x, .247, 2)), Vector((0, 0, -1)))
        assert point is not None and .845 < point.z < .885, 'Roof cap endpoint no longer matches the inspected source'
        height = float(point.z)
        samples.append({'x': x, 'roofHeight': height, 'sourceFace': index})
        actual.extend([(x, .258, height + .0003), (x, .258, height - .022)])
        # The lip did not exist in the raw source. Its material samples come
        # explicitly from two adjacent strips on the same existing roof cap.
        for donor_y in (.225, .247):
            q, _, _, _ = tree.ray_cast(Vector((x, donor_y, 2)), Vector((0, 0, -1)))
            assert q is not None and .84 < q.z < .89
            donors.append(tuple(q))
    faces = []
    for index in range(len(xs) - 1):
        a, b = 2 * index, 2 * (index + 1)
        faces.extend([(a, b, b + 1), (a, b + 1, a + 1)])
    patch = temporary_mesh('Bounded source roof fascia gap repair', donors, faces)
    triangle_cells(patch.data)
    receipt, _ = source_bake(source, patch, SimpleNamespace(texture_size=512, name='classic_shop3_original_roof_fascia'))
    assert receipt['atlasOverlapPixelsWithDifferentSurface'] == 0
    for vertex, position in zip(patch.data.vertices, actual):
        vertex.co = position
    patch.data.update()
    return patch, {'method': 'Close the inspected open fascia below the existing rear-right dormer roof; cap profile is sampled from the unchanged source roof. Only a 0.022-high local strip is added behind the existing front molding', 'boundsBlender': {'min': np.array(actual).min(0).tolist(), 'max': np.array(actual).max(0).tolist()}, 'sourceProfileSamples': samples, 'trianglesAdded': len(faces), 'originalTrianglesRemoved': 0, 'sourceTransfer': receipt, 'materialDonor': 'Original generated roof cap at y=.225/.247; explicit same-roof UV transfer for the missing surface, no new neural image or hand-painted fill', 'newMaterials': 1}


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('--input', type=Path, required=True)
    cli.add_argument('--out', type=Path, required=True)
    args = cli.parse_args(sys.argv[sys.argv.index('--') + 1:])
    report = json.loads(args.input.read_text('utf8'))
    asset = report['asset']
    assert report['region'] == 'classic' and asset in EXPECTED
    prior = Path(report['processedCandidate']['path'])
    assert lod.p.sha256(prior) == EXPECTED[asset] == report['processedCandidate']['sha256']
    args.out = args.out.resolve()
    args.out.mkdir(parents=True, exist_ok=True)
    output = args.out / (asset + '.glb')
    assert not output.exists(), 'Keep earlier candidates immutable'
    lod.clear_scene()
    raw = Path(report['source']['rawGLB']['path'])
    assert lod.p.sha256(raw) == report['source']['rawGLB']['sha256']
    source, _ = lod.p.import_body(raw)
    lod.p.upright(source, SimpleNamespace(height=1., footprint=1., pitch=0., roll=0., yaw=180., no_auto_upright=False, max_upright=18.))
    bpy.ops.import_scene.gltf(filepath=str(prior))
    bodies = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj != source]
    assert len(bodies) == 1
    body = bodies[0]
    mesh = body.data
    before_positions = np.array([v.co[:] for v in mesh.vertices])
    before_loops = np.array([loop.vertex_index for loop in mesh.loops])
    before_uv = np.array([loop.uv[:] for loop in mesh.uv_layers.active.data])
    repairs = {}
    patches = []
    if asset == 'shop_1':
        repairs['localAtlas'] = repair_wall_atlas(body, source)
    elif asset == 'hotel_2':
        repairs['normalRepair'] = normal_region(mesh, asset)
    else:
        repairs['normalRepair'] = normal_region(mesh, asset)
        patch, repairs['roofGapClosure'] = close_dormer_gap(source)
        patches.append(patch)
    assert np.array_equal(before_positions, np.array([v.co[:] for v in mesh.vertices]))
    assert np.array_equal(before_loops, np.array([loop.vertex_index for loop in mesh.loops]))
    after_uv = np.array([loop.uv[:] for loop in mesh.uv_layers.active.data])
    changed_loops = np.flatnonzero(np.any(before_uv != after_uv, axis=1)).tolist()
    if asset == 'shop_1':
        assert len(changed_loops) == 6
    else:
        assert len(changed_loops) == 0
    source.hide_render = True
    source.hide_set(True)
    lod.p.select_only([body] + patches)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True, export_yup=True, export_animations=False, export_image_format='AUTO', export_extras=True)
    report['priorLocalizedRepair'] = lod.p.file_evidence(args.input.resolve())
    report['localSurfaceRepair'] = {'sourceCandidate': lod.p.file_evidence(prior), 'repairs': repairs, 'originalVertexPositionsAndTopologyUnchanged': True, 'originalUVLoopsChanged': changed_loops, 'newInferenceCalls': 0, 'rawSourceUnchanged': lod.p.sha256(raw) == report['source']['rawGLB']['sha256']}
    report['quantization'] = lod.quantize_mobile_attributes(output)
    report['processedCandidate'] = lod.p.file_evidence(output)
    report['glbValidation'] = lod.p.inspect_glb(output)
    report['triangles'] = report['glbValidation']['triangles']
    report['processingComplete'] = False
    report['status'] = 'exported_pending_visual_review'
    report.pop('reviewSheet', None)
    settings = SimpleNamespace(region='classic', asset=asset, lod='near', height=1., footprint=1., render_directory=args.out / 'renders')
    report['renderedCandidate'] = lod.render(output, settings, ('front', 'right', 'back', 'left', 'iso'))
    report['textureSizes'] = report['renderedCandidate']['textureSizes']
    report['processingComplete'] = True
    report['completedAt'] = lod.now()
    report['geometryOrigin'] += ' Existing body geometry retained exactly during localized repair; any roof fascia addition and source material donor are explicitly recorded in localSurfaceRepair.'
    snapshots = {}
    for tool in (Path(__file__), Path(__file__).with_name('fix_customnormals_helper.py'), Path(__file__).with_name('bake_nearest_surface.py')):
        snapshot = lod.ART / 'reports/tool-snapshots' / (lod.p.sha256(tool) + '-' + tool.name)
        if not snapshot.exists():
            shutil.copyfile(tool, snapshot)
        snapshots[tool.name] = lod.p.file_evidence(snapshot)
    report['localSurfaceRepairTools'] = snapshots
    output.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf8')
    print('LOCAL_REPAIR ' + json.dumps(report['localSurfaceRepair']), flush=True)


if __name__ == '__main__':
    main()

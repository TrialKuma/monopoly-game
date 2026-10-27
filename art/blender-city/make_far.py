"""Make the 25 distant derivatives from the exact authored near GLBs.

Run explicitly on CPU; this never rewrites a near asset:
blender -b -t 3 --python art/blender-city/make_far.py -- --map all
--assets villa_3,shop_2 is available for a bounded repair.
"""
import argparse, hashlib, json, math, sys, time
from pathlib import Path
import bpy
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MAPS = ('classic', 'compact', 'expansion', 'harbor', 'alpine')
ASSETS = ('villa_3', 'shop_2', 'hotel_2', 'tower_2', 'junction_hub')
SOURCE = 'authored_blender_reference_rebuild'

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def relative(path):
    return Path(path).resolve().relative_to(ROOT).as_posix()

def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8', newline='\n')

def meshes(root):
    return [obj for obj in [root, *root.children_recursive] if obj.type == 'MESH']

def triangles(root):
    return sum(sum(len(face.vertices)-2 for face in obj.data.polygons) for obj in meshes(root))

def bounds(root):
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in meshes(root) for corner in obj.bound_box]
    return (Vector(tuple(min(point[i] for point in points) for i in range(3))),
            Vector(tuple(max(point[i] for point in points) for i in range(3))))

def build(region, asset, target):
    started = time.monotonic()
    source_folder = HERE/'models'/region/asset
    source = source_folder/'model.glb'
    near = json.loads((source_folder/'model.json').read_text('utf-8'))
    source_sha = digest(source)
    if near['sha256'] != source_sha or near['sourceType'] != SOURCE:
        raise ValueError(f'{region}/{asset}: stale or wrong near source')
    if not near.get('surface', {}).get('textureSize'):
        raise ValueError('Far derivatives require the final atlas-equipped near asset, not a draft')
    folder = HERE/'far'/region/asset
    folder.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    root = bpy.data.objects.get(f'{region}_{asset}')
    if root is None or root.parent:
        raise ValueError('Expected the near architectural root')
    if any(obj.animation_data for obj in [root, *root.children_recursive]):
        raise ValueError('This far set contains static architecture only')
    before_triangles = triangles(root)
    before_lo, before_hi = bounds(root)
    passes = []
    # Collapse only when needed. Blender retains UV/color layers and distinct
    # material slots; no style replacement, recoloring or texture generation.
    while triangles(root) > target:
        previous = triangles(root)
        ratio = min(.97, target / previous * .96)
        for obj in meshes(root):
            if len(obj.data.polygons) < 24:
                continue
            bpy.context.view_layer.objects.active = obj
            modifier = obj.modifiers.new('Controlled distant simplification', 'DECIMATE')
            modifier.decimate_type = 'COLLAPSE'
            modifier.ratio = ratio
            modifier.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        current = triangles(root)
        passes.append({'before': previous, 'after': current, 'ratio': ratio})
        if current >= previous or len(passes) >= 4:
            break
    if triangles(root) > 20000:
        raise ValueError(f'{region}/{asset}: far still exceeds 20k triangles')
    # Collapse can extrapolate UVs slightly outside their original scalar range.
    # Ceramic AO uses a one-row ramp, so keep only that layer in its texel-center
    # bounds. Facade atlases and geometric positions must stay untouched.
    roof_ao_clamp = {'corners': 0, 'maximumDelta': 0}
    for obj in meshes(root):
        if not obj.data.uv_layers:
            continue
        uv = obj.data.uv_layers[0].data
        for face in obj.data.polygons:
            if not obj.data.materials[face.material_index].name.endswith(' / roof ceramic'):
                continue
            for index in face.loop_indices:
                before = uv[index].uv.copy()
                after = (max(.5/256, min(255.5/256, before.x)), .5)
                delta = max(abs(before.x-after[0]), abs(before.y-after[1]))
                if delta > 1e-8:
                    roof_ao_clamp['corners'] += 1
                    roof_ao_clamp['maximumDelta'] = max(roof_ao_clamp['maximumDelta'], delta)
                uv[index].uv = after
    lo, hi = bounds(root)
    old_size, new_size = before_hi-before_lo, hi-lo
    if any(abs(new_size[i]-old_size[i]) > max(.012, old_size[i]*.025) for i in range(3)):
        raise ValueError(f'{region}/{asset}: simplification changed silhouette bounds by more than 2.5%; inspect and use a higher target')
    # Ground and center the derivative itself. Never rescale the near source.
    offset = Vector((-(lo.x+hi.x)/2, -(lo.y+hi.y)/2, -lo.z))
    for obj in root.children:
        obj.location += offset
    textures = []
    for image in list(bpy.data.images):
        if image.name in ('Render Result', 'Viewer Node'):
            continue
        # Imported packed GLB images are lazily decoded. has_data may still be
        # false although the ORM is valid, so access pixels before resizing.
        if len(image.pixels) == 0:
            raise ValueError(f'{region}/{asset}: cannot decode embedded image {image.name}')
        old = list(image.size)
        if max(old) > 512:
            factor = 512/max(old)
            image.scale(max(1, round(old[0]*factor)), max(1, round(old[1]*factor)))
        image.filepath_raw = str(folder/f'surface-{len(textures)}.png')
        image.file_format = 'PNG'
        image.save()
        # Imported images already have packed bytes. A parameterless pack()
        # retains that original 1K payload even after resize/save; replace it.
        resized_bytes = Path(image.filepath_raw).read_bytes()
        image.pack(data=resized_bytes, data_len=len(resized_bytes))
        textures.append({'size': list(image.size), 'before': old})
    root['nearSourceSha256'] = source_sha
    root['detailLevel'] = 'far'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in [root, *root.children_recursive]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    output = folder/'model.glb'
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
                             export_yup=True, export_animations=False, export_cameras=False,
                             export_lights=False, export_extras=True, export_vertex_color='ACTIVE',
                             export_all_vertex_colors=False)
    lo, hi = bounds(root)
    size = hi-lo
    surface = {**near['surface'], 'textureSize': max((max(item['size']) for item in textures), default=0)}
    record = {**near, 'sourceType': SOURCE, 'detailLevel': 'far',
              'nearSource': relative(source), 'nearSourceSha256': source_sha,
              'farBuilder': relative(__file__), 'farBuilderSha256': digest(__file__),
              'triangles': triangles(root), 'sourceTriangles': before_triangles,
              'size': [size.x, size.z, size.y],
              'bounds': {'min': [lo.x, lo.z, -hi.y], 'max': [hi.x, hi.z, -lo.y]},
              'surface': surface, 'simplification': {'method': 'Blender collapse with existing UV and vertex color layers',
              'target': target, 'passes': passes, 'rescaling': False,
              'centeringOffsetBlender': list(offset), 'textures': textures,
              'roofAmbientClamp': roof_ao_clamp},
              'sha256': digest(output), 'bytes': output.stat().st_size,
              'status': 'built_pending_scene_review', 'seconds': round(time.monotonic()-started, 2)}
    # This export is a new simplified mesh, not the compressed near payload.
    # Preserve the source evidence without pretending its output hash is ours.
    if 'storageCompression' in record:
        record['nearStorageCompression'] = record.pop('storageCompression')
    save_json(folder/'model.json', record)
    print('AUTHORED_FAR_READY '+json.dumps({'region': region, 'asset': asset, 'triangles': record['triangles'], 'bytes': record['bytes']}), flush=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--map', required=True, choices=(*MAPS, 'all'))
    parser.add_argument('--assets')
    parser.add_argument('--target', type=int)
    parser.add_argument('--skip-existing', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    if args.target is not None and not 1000 <= args.target <= 20000:
        parser.error('target must be between 1000 and 20000')
    selected = args.assets.split(',') if args.assets else ASSETS
    if not set(selected).issubset(ASSETS):
        parser.error('only the five known distant architectures can be processed')
    for region in MAPS if args.map == 'all' else (args.map,):
        for asset in selected:
            # This taller chalet loses its window lattice at 14k; the sparse
            # alpine perimeter permits a targeted detail allowance below 20k.
            target = args.target if args.target is not None else (18000 if (region, asset) == ('alpine', 'villa_3') else 14000)
            record_path = HERE/'far'/region/asset/'model.json'
            if args.skip_existing and record_path.exists():
                old = json.loads(record_path.read_text('utf-8'))
                near = HERE/'models'/region/asset/'model.glb'
                output = record_path.with_name('model.glb')
                if (old.get('nearSourceSha256') == digest(near) and output.exists()
                        and old.get('sha256') == digest(output)
                        and old.get('farBuilderSha256') == digest(__file__)
                        and old.get('simplification', {}).get('target') == target
                        and 0 < old.get('surface', {}).get('textureSize', 0) <= 512):
                    continue
            build(region, asset, target)

if __name__ == '__main__':
    main()

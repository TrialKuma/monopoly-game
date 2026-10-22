"""Prepare a REAL Pixal3D mesh for the harbor board; never synthesize a building.

Run with Blender 5.2, only after the inference owner confirms RAM headroom:
  blender --background --factory-startup --threads 4 --python this_file.py -- \
    --source art/harbor/source/<raw>.glb --name harbor-observatory --height 2.4

The source is read-only. Exported game meshes retain generated topology, UVs,
and materials. All preview images render a fresh import of the final GLB.
For animation, inspect the previews first, then pass an explicit region JSON;
only selected faces from the real generated model can become animated parts.
"""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bpy
import bmesh
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[3]


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--reference')
    parser.add_argument('--inference-report')
    parser.add_argument('--name', required=True)
    parser.add_argument('--height', type=float, default=3.0)
    parser.add_argument('--footprint', type=float, default=3.0)
    parser.add_argument('--triangles', type=int, default=24000)
    parser.add_argument('--texture-size', type=int, default=1024)
    parser.add_argument('--weld-distance', type=float, default=.000001)
    parser.add_argument('--remesh-bake', action='store_true')
    parser.add_argument('--voxel-size', type=float, default=.012)
    parser.add_argument('--quantize', action='store_true')
    parser.add_argument('--yaw', type=float, default=0)
    parser.add_argument('--pitch', type=float, default=0)
    parser.add_argument('--roll', type=float, default=0)
    parser.add_argument('--no-auto-upright', action='store_true')
    parser.add_argument('--max-upright', type=float, default=18)
    parser.add_argument('--animation-config')
    parser.add_argument('--render-size', type=int, default=768)
    parser.add_argument('--samples', type=int, default=24)
    parser.add_argument('--image-format', choices=['AUTO', 'JPEG'], default='AUTO')
    parser.add_argument('--skip-render', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not args.name.replace('-', '').replace('_', '').isalnum():
        parser.error('--name must contain only letters, numbers, underscores or hyphens')
    if not 15000 <= args.triangles <= 200000:
        parser.error('--triangles must be between 15000 and 200000')
    if args.height <= 0 or args.footprint <= 0 or args.texture_size <= 0:
        parser.error('height, footprint and texture-size must be positive')
    return args


def resolve(path):
    path = Path(path)
    return path.resolve() if path.is_absolute() else (ROOT / path).resolve()


def sha256(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def file_evidence(path):
    return {'path': str(path), 'sha256': sha256(path), 'bytes': path.stat().st_size}


def validate_generation(source, args, source_evidence):
    """A finished local inference report must identify this exact raw mesh."""
    path = resolve(args.inference_report) if args.inference_report else (
        ROOT / 'art/harbor/reports' / (source.stem + '.json'))
    report = json.loads(path.read_text('utf-8'))
    required = {'status': 'generated_unrigged_part_candidate',
                'generation_started': True, 'local_inference_only': True}
    for field, expected in required.items():
        if report.get(field) != expected:
            raise RuntimeError(f'Unverified raw model: inference report {field} must be {expected!r}')
    if report.get('output_sha256') != source_evidence['sha256']:
        raise RuntimeError('Raw GLB hash does not match the completed Pixal3D inference report')
    if resolve(report['output']) != source:
        raise RuntimeError('Inference report identifies a different raw GLB path')
    reference = resolve(args.reference) if args.reference else resolve(report['input'])
    if sha256(reference) != report.get('input_sha256'):
        raise RuntimeError('Reference image hash does not match the completed inference report')
    return path, reference


def triangles(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def bounds(objects, world=False):
    objects = [objects] if hasattr(objects, 'data') else objects
    coords = [o.matrix_world @ v.co if world else v.co
              for o in objects if o.type == 'MESH' for v in o.data.vertices]
    if not coords:
        raise RuntimeError('The model contains no mesh vertices')
    return (Vector(tuple(min(v[i] for v in coords) for i in range(3))),
            Vector(tuple(max(v[i] for v in coords) for i in range(3))))


def select_only(objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for data in list(collection):
            if data.users == 0:
                collection.remove(data)


def import_body(source):
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not objects:
        raise RuntimeError('Source GLB has no meshes')
    source_stats = [{'name': o.name, 'triangles': triangles(o),
                     'uv_layers': len(o.data.uv_layers),
                     'materials': [m.name for m in o.data.materials if m]} for o in objects]
    for obj in objects:
        transform = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.transform(transform)
    select_only(objects)
    if len(objects) > 1:
        bpy.ops.object.join()
    body = bpy.context.object
    if not body.data.uv_layers:
        raise RuntimeError('Generated source has no UV layer; refusing an untextured replacement')
    return body, source_stats


def upright(body, args):
    body.data.update()
    lo, hi = bounds(body)
    floor = Vector((0, 0, 0))
    area = 0
    for polygon in body.data.polygons:
        if polygon.center.z < lo.z + (hi.z - lo.z) * .15 and polygon.normal.z < -.65:
            floor += polygon.normal * polygon.area
            area += polygon.area
    report = {'enabled': not args.no_auto_upright, 'candidate_degrees': 0,
              'applied_degrees': 0, 'underside_area': area, 'normal_agreement': 0}
    if floor.length and area:
        rotation = (-floor.normalized()).rotation_difference(Vector((0, 0, 1)))
        angle = math.degrees(rotation.angle)
        report.update(candidate_degrees=angle, normal_agreement=floor.length / area)
        if not args.no_auto_upright and angle <= args.max_upright and floor.length / area >= .8:
            for vertex in body.data.vertices:
                vertex.co = rotation @ vertex.co
            report['applied_degrees'] = angle
        elif not args.no_auto_upright:
            report['review_note'] = 'Automatic correction skipped: inspect floor before manual correction'
    manual = (Matrix.Rotation(math.radians(args.yaw), 3, 'Z') @
              Matrix.Rotation(math.radians(args.pitch), 3, 'X') @
              Matrix.Rotation(math.radians(args.roll), 3, 'Y'))
    for vertex in body.data.vertices:
        vertex.co = manual @ vertex.co
    lo, hi = bounds(body)
    origin = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    dimensions = hi - lo
    scale = min(args.height / dimensions.z, args.footprint / dimensions.x,
                args.footprint / dimensions.y)
    for vertex in body.data.vertices:
        vertex.co = (vertex.co - origin) * scale
    body.data.update()
    report.update(yaw_degrees=args.yaw, pitch_degrees=args.pitch,
                  roll_degrees=args.roll, uniform_scale=scale)
    return report


def component_inventory(body):
    """Report disconnected real geometry as evidence for optional animation."""
    parents = list(range(len(body.data.vertices)))

    def find(n):
        while parents[n] != n:
            parents[n] = parents[parents[n]]
            n = parents[n]
        return n

    for edge in body.data.edges:
        left, right = (find(i) for i in edge.vertices)
        parents[right] = left
    groups = {}
    for polygon in body.data.polygons:
        group = groups.setdefault(find(polygon.vertices[0]), {'triangles': 0, 'vertices': set()})
        group['triangles'] += len(polygon.vertices) - 2
        group['vertices'].update(polygon.vertices)
    result = []
    for group in sorted(groups.values(), key=lambda g: g['triangles'], reverse=True):
        if group['triangles'] < 8:
            continue
        vertices = [body.data.vertices[i].co for i in group.pop('vertices')]
        group['bounds_min'] = [min(v[i] for v in vertices) for i in range(3)]
        group['bounds_max'] = [max(v[i] for v in vertices) for i in range(3)]
        result.append(group)
    return result[:30]


def remesh_and_bake(source, args):
    """Derive a clean surface and bake the real source; no replacement geometry."""
    source.name = args.name + '-raw-bake-source'
    low = source.copy()
    low.data = source.data.copy()
    bpy.context.collection.objects.link(low)
    low.name = args.name + '-source-derived-mobile-surface'
    select_only([low])
    # The source has UV/normal attribute splits. Close those coincident seams
    # on the DERIVATIVE before asking the volume remesher to infer a solid shell.
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.000003)
    bm = bmesh.from_edit_mesh(low.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.update_edit_mesh(low.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    low.data.validate(clean_customdata=False)
    remesh = low.modifiers.new('Source-derived surface cleanup', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = args.voxel_size
    remesh.use_smooth_shade = True
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    remesh_triangles = triangles(low)
    modifier = low.modifiers.new('Manifold mobile simplification', 'DECIMATE')
    modifier.ratio = min(1, args.triangles / remesh_triangles)
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    low.data.validate(clean_customdata=False)
    low.data.update()
    print('SOURCE_DERIVED_REMESH', remesh_triangles, triangles(low), flush=True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(42))
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    low.data.uv_layers.new(name='SourceAppearanceBake')
    low.data.uv_layers.active_index = 0
    low.data.uv_layers[0].active_render = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(75), island_margin=.00002)
    bpy.ops.object.mode_set(mode='OBJECT')
    uv = low.data.uv_layers.active.data
    uv_area = 0
    for face in low.data.polygons:
        a, b, c = [uv[i].uv for i in face.loop_indices]
        uv_area += abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)) * .5
    print('MOBILE_ATLAS_COVERAGE', uv_area, flush=True)
    if uv_area < .25:
        raise RuntimeError(f'Mobile UV atlas has insufficient coverage: {uv_area:.4f}')
    material = bpy.data.materials.new(args.name + '-baked-generated-material')
    material.use_nodes = True
    low.data.materials.clear()
    low.data.materials.append(material)
    destination = material.node_tree
    originals = list(source.data.materials)
    images = {}
    for mode in ('base_color', 'metallic_roughness'):
        image = bpy.data.images.new(args.name + '-' + mode,
                                   width=args.texture_size, height=args.texture_size, alpha=False)
        image.colorspace_settings.name = 'sRGB' if mode == 'base_color' else 'Non-Color'
        texture = destination.nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.name = 'Baked_' + mode
        for node in destination.nodes:
            node.select = False
        texture.select = True
        destination.nodes.active = texture
        for index, original in enumerate(originals):
            copied = original.copy()
            source.data.materials[index] = copied
            nodes = copied.node_tree.nodes
            links = copied.node_tree.links
            bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
            output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
            emission = nodes.new('ShaderNodeEmission')
            if mode == 'base_color':
                socket = bsdf.inputs['Base Color']
                if socket.is_linked:
                    links.new(socket.links[0].from_socket, emission.inputs['Color'])
                else:
                    emission.inputs['Color'].default_value = socket.default_value
            else:
                combine = nodes.new('ShaderNodeCombineColor')
                combine.mode = 'RGB'
                combine.inputs[0].default_value = 1
                for destination_index, socket_name in [(1, 'Roughness'), (2, 'Metallic')]:
                    socket = bsdf.inputs[socket_name]
                    if socket.is_linked:
                        links.new(socket.links[0].from_socket, combine.inputs[destination_index])
                    else:
                        combine.inputs[destination_index].default_value = socket.default_value
                links.new(combine.outputs[0], emission.inputs['Color'])
            links.new(emission.outputs[0], output.inputs['Surface'])
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 1
        scene.render.threads_mode = 'FIXED'
        scene.render.threads = 4
        scene.render.bake.use_selected_to_active = True
        scene.render.bake.use_cage = True
        scene.render.bake.cage_extrusion = .06
        scene.render.bake.max_ray_distance = .15
        scene.render.bake.margin = 2
        select_only([low, source])
        bpy.context.view_layer.objects.active = low
        bpy.ops.object.bake(type='EMIT')
        image.pack()
        images[mode] = image
        print('BAKED_GENERATED_SOURCE', mode, flush=True)
    bsdf = next(n for n in destination.nodes if n.type == 'BSDF_PRINCIPLED')
    destination.links.new(destination.nodes['Baked_base_color'].outputs['Color'], bsdf.inputs['Base Color'])
    separate = destination.nodes.new('ShaderNodeSeparateColor')
    destination.links.new(destination.nodes['Baked_metallic_roughness'].outputs['Color'], separate.inputs[0])
    destination.links.new(separate.outputs['Green'], bsdf.inputs['Roughness'])
    destination.links.new(separate.outputs['Blue'], bsdf.inputs['Metallic'])
    bpy.data.objects.remove(source, do_unlink=True)
    # Drop only zero-user raw data so export and preview contain the derived mesh.
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(collection):
            if item.users == 0:
                collection.remove(item)
    select_only([low])
    lo, hi = bounds(low)
    offset = Vector((0, 0, lo.z))
    for vertex in low.data.vertices:
        vertex.co -= offset
    low.data.update()
    return low, {'method': 'Voxel cleanup of actual generated source followed by source-to-target appearance bake',
        'voxel_size': args.voxel_size, 'remesh_triangles': remesh_triangles,
        'final_triangles': triangles(low), 'textures': list(images),
        'uv_atlas_coverage': uv_area, 'bake_margin_pixels': 2,
        'source_uv_and_materials': 'Original raw GLB remains unchanged; mobile UV atlas is derived for baking',
        'authorization': 'Parent requested conservative source-derived remesh/reunwrap/bake after raw and 150k/50k diagnostics'}


def animate_real_component(body, root, config):
    """Cut explicitly inspected faces, never generate or replace geometry."""
    region = config['bounds_blender']
    if len(region) != 2 or any(len(v) != 3 for v in region):
        raise RuntimeError('bounds_blender must contain [minimum_xyz, maximum_xyz]')
    before = {o for o in bpy.context.scene.objects if o.type == 'MESH'}
    select_only([body])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bm = bmesh.from_edit_mesh(body.data)
    for face in bm.faces:
        face.select = all(all(region[0][i] <= vertex.co[i] <= region[1][i] for i in range(3))
                          for vertex in face.verts)
    selected = sum(len(face.verts) - 2 for face in bm.faces if face.select)
    minimum = config.get('min_triangles', 20)
    maximum = config.get('max_triangles', 3000)
    if not minimum <= selected <= maximum:
        bpy.ops.object.mode_set(mode='OBJECT')
        raise RuntimeError(f'Inspected component has {selected} triangles; expected {minimum}–{maximum}')
    bmesh.update_edit_mesh(body.data)
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    parts = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in before]
    if len(parts) != 1:
        raise RuntimeError(f'Expected one generated component; got {len(parts)}')
    part = parts[0]
    part.name = config['component_name']
    part.parent = root
    pivot = Vector(config['pivot_blender'])
    for vertex in part.data.vertices:
        vertex.co -= pivot
    part.location = pivot
    part.rotation_mode = 'XYZ'
    axis = {'x': 0, 'y': 1, 'z': 2}[config.get('axis', 'y')]
    amplitude = math.radians(config.get('amplitude_degrees', 3))
    frames = round(config.get('seconds', 5) * 24)
    mode = config.get('mode', 'swing')
    if mode == 'spin':
        # Key every exported frame to retain a steady full revolution despite
        # Euler-to-quaternion conversion and endpoint equivalence at 360°.
        for frame in range(frames + 1):
            part.rotation_euler[axis] = math.tau * frame / frames * config.get('direction', 1)
            part.keyframe_insert(data_path='rotation_euler', frame=1 + frame)
    elif mode == 'swing':
        for fraction, displacement in [(0, 0), (.25, 1), (.5, 0), (.75, -1), (1, 0)]:
            part.rotation_euler[axis] = amplitude * displacement
            part.keyframe_insert(data_path='rotation_euler', frame=1 + round(frames * fraction))
    else:
        raise RuntimeError(f'Unknown real component animation mode: {mode}')
    action = part.animation_data.action
    action.name = config.get('clip_name', 'harbor_idle')
    slot = part.animation_data.action_slot
    track = part.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, 1, action)
    strip.action_slot = slot
    part.animation_data.action = None
    part.rotation_euler = (0, 0, 0)
    bpy.context.scene.frame_end = 1 + frames
    return {'component': part.name, 'triangles': selected, 'clip': action.name,
            'seconds': frames / 24, 'pivot_blender': list(pivot),
            'axis': config.get('axis', 'y'), 'mode': mode,
            'amplitude_degrees': 360 if mode == 'spin' else math.degrees(amplitude),
            'source': 'Faces separated directly from the inspected Pixal3D mesh',
            'inspection_evidence': config.get('inspection_evidence', '')}


def inspect_glb(path):
    data = path.read_bytes()
    magic, version, total = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or total != len(data):
        raise RuntimeError('Invalid GLB header')
    length, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4e4f534a:
        raise RuntimeError('GLB JSON chunk missing')
    doc = json.loads(data[20:20 + length])
    count = 0
    all_uv = True
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            if primitive.get('mode', 4) != 4:
                raise RuntimeError('Game model must use triangle primitives')
            accessor = primitive.get('indices', primitive['attributes']['POSITION'])
            count += doc['accessors'][accessor]['count'] // 3
            all_uv &= 'TEXCOORD_0' in primitive['attributes']
    channels = []
    for animation in doc.get('animations', []):
        channels.append({'name': animation.get('name', ''), 'targets': [
            {'node': doc['nodes'][c['target']['node']].get('name', ''), 'path': c['target']['path']}
            for c in animation.get('channels', [])]})
    report = {'version': version, 'triangles': count, 'meshes': len(doc.get('meshes', [])),
              'materials': len(doc.get('materials', [])), 'images': len(doc.get('images', [])),
              'all_primitives_have_uv': all_uv, 'animations': channels,
              'all_images_embedded': all('bufferView' in image for image in doc.get('images', [])),
              'external_buffers': [b.get('uri') for b in doc.get('buffers', []) if b.get('uri')]}
    if not count or not all_uv or not report['images'] or not report['all_images_embedded']:
        raise RuntimeError(f'GLB validation failed: {report}')
    return report


def render_exported(path, args, expected_height, source_preview=False):
    clear_scene()
    if source_preview:
        body, _ = import_body(path)
        upright(body, args)
        source_lo, source_hi = bounds(body)
        expected_height = source_hi.z - source_lo.z
    else:
        bpy.ops.import_scene.gltf(filepath=str(path))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = args.samples
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.render.resolution_x = args.render_size
    scene.render.resolution_y = args.render_size
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.frame_set(1)
    meshes = [o for o in scene.objects if o.type == 'MESH']
    lo, hi = bounds(meshes, world=True)
    reimport = {'triangles': sum(triangles(o) for o in meshes), 'bounds_min': list(lo),
                'bounds_max': list(hi), 'dimensions_xyz_blender': list(hi - lo),
                'texture_sizes': [{'name': i.name, 'size': list(i.size)}
                                  for i in bpy.data.images if i.type == 'IMAGE' and i.size[0]],
                'renderer': 'Cycles CPU', 'threads': 4, 'samples': args.samples, 'images': []}
    if abs(lo.z) > .001 or abs(hi.z - expected_height) > .002:
        raise RuntimeError(f'Reimported GLB ground/height mismatch: {list(lo)} / {list(hi)}')
    if max((hi - lo).x, (hi - lo).y) > args.footprint + .002:
        raise RuntimeError('Reimported GLB exceeds footprint budget')
    if not source_preview and any(max(i['size']) > args.texture_size for i in reimport['texture_sizes']):
        raise RuntimeError('Reimported GLB exceeds texture budget')
    if args.skip_render:
        return reimport
    world = bpy.data.worlds.new('Harbor neutral studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.64, .72, .82, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .55
    scene.world = world
    height = expected_height
    target = Vector((0, 0, height * .48))
    for position, energy, size in [((2, -3, 4), 450, 3), ((-3, -1, 2), 230, 3), ((1, 3, 3), 350, 2.5)]:
        bpy.ops.object.light_add(type='AREA', location=Vector(position) * height)
        light = bpy.context.object
        light.data.energy = energy * (height / 1.8) ** 2
        light.data.shape = 'DISK'
        light.data.size = size * height / 1.8
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = max(height * 1.48, (hi - lo).x * 1.58, (hi - lo).y * 1.58)
    scene.camera = camera
    for label, angle in [('front', 0), ('right', 90), ('back', 180), ('left', 270)]:
        radians = math.radians(angle + 28)
        camera.location = Vector((math.sin(radians) * 3.2, -math.cos(radians) * 3.2, 1.75)) * height
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        preview = ROOT / 'art/harbor/renders' / f'{args.name}-{label}.png'
        scene.render.filepath = str(preview)
        bpy.ops.render.render(write_still=True)
        reimport['images'].append(str(preview))
    if args.animation_config:
        config = json.loads(resolve(args.animation_config).read_text('utf-8'))
        frames = round(config.get('seconds', 5) * 24)
        radians = math.radians(28)
        camera.location = Vector((math.sin(radians) * 3.2, -math.cos(radians) * 3.2, 1.75)) * height
        camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
        for label, fraction in [('quarter', .25), ('half', .5)]:
            scene.frame_set(1 + round(frames * fraction))
            preview = ROOT / 'art/harbor/renders' / f'{args.name}-animation-{label}.png'
            scene.render.filepath = str(preview)
            bpy.ops.render.render(write_still=True)
            reimport['images'].append(str(preview))
    return reimport


def main():
    args = arguments()
    source = resolve(args.source)
    output = ROOT / 'assets/models/harbor' / f'{args.name}.glb'
    blend = ROOT / 'art/harbor/blender' / f'{args.name}.blend'
    report_path = ROOT / 'art/harbor/reports' / f'{args.name}-processing.json'
    if source == output.resolve():
        raise RuntimeError('Refusing to overwrite the raw source')
    for directory in (output.parent, blend.parent, report_path.parent, ROOT / 'art/harbor/renders'):
        directory.mkdir(parents=True, exist_ok=True)
    source_evidence = file_evidence(source)
    inference_report, reference = validate_generation(source, args, source_evidence)
    clear_scene()
    scene = bpy.context.scene
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 4
    scene.frame_start = 1
    scene.frame_end = 121
    scene.render.fps = 24
    body, source_objects = import_body(source)
    source_triangles = triangles(body)
    source_vertices = len(body.data.vertices)
    bake_report = None
    if args.remesh_bake:
        orientation = upright(body, args)
        body, bake_report = remesh_and_bake(body, args)
        # Conservative voxelization may expand the bounding surface by half a
        # voxel; refit uniformly and ground it, without changing orientation.
        normalized_opts = argparse.Namespace(**vars(args))
        normalized_opts.no_auto_upright = True
        normalized_opts.yaw = normalized_opts.pitch = normalized_opts.roll = 0
        refit = upright(body, normalized_opts)
        orientation['post_remesh_refit_scale'] = refit['uniform_scale']
    else:
        orientation = None
    # Pixal exports duplicated vertices at attribute seams. Decimating those
    # disconnected triangles independently creates cracks. Weld coincident
    # positions only; Blender keeps UVs on face corners and material assignments.
    if not args.remesh_bake:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=args.weld_distance, use_unselected=False)
        bpy.ops.object.mode_set(mode='OBJECT')
    welded_vertices = len(body.data.vertices)
    source_validation_changed = body.data.validate(clean_customdata=False)
    body.data.update()
    print('SOURCE_CLEANUP', source_vertices, welded_vertices, triangles(body),
          source_validation_changed, flush=True)
    decimation_passes = []
    for pass_index in range(3):
        before = triangles(body)
        if before <= args.triangles * 1.01:
            break
        modifier = body.modifiers.new('Mobile triangle budget', 'DECIMATE')
        modifier.ratio = min(1, args.triangles / before)
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        validation_changed = body.data.validate(clean_customdata=False)
        body.data.update()
        after = triangles(body)
        decimation_passes.append({'pass': pass_index + 1, 'before': before, 'after': after,
                                  'validation_changed': validation_changed})
        print('DECIMATION_PASS', decimation_passes[-1], flush=True)
    # Decimation can retain unreferenced vertices, which glTF correctly omits.
    # Remove only vertices/edges that belong to no face before measuring bounds.
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    if orientation is None:
        orientation = upright(body, args)
    normalized_min, normalized_max = bounds(body)
    normalized_height = (normalized_max - normalized_min).z
    select_only([body])
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(42))
    textures = []
    for image in bpy.data.images:
        if image.type != 'IMAGE' or not image.size[0]:
            continue
        original = list(image.size)
        ratio = min(1, args.texture_size / max(original))
        if ratio < 1:
            image.scale(max(1, round(original[0] * ratio)), max(1, round(original[1] * ratio)))
        image.pack()
        textures.append({'name': image.name, 'original_size': original, 'size': list(image.size)})
    root = bpy.data.objects.new(args.name, None)
    bpy.context.collection.objects.link(root)
    root['provenance'] = 'New AI reference → actual local TencentARC/Pixal3D → Blender mesh simplification'
    root['source_sha256'] = source_evidence['sha256']
    root['front'] = 'Blender -Y / glTF +Z; yaw requires visual review'
    body.name = args.name + '-generated-structure'
    body.parent = root
    for obj in list(scene.objects):
        if obj.type == 'EMPTY' and obj != root:
            bpy.data.objects.remove(obj, do_unlink=True)
    components = component_inventory(body)
    animation = None
    config = None
    if args.animation_config:
        config = resolve(args.animation_config)
        animation = animate_real_component(body, root, json.loads(config.read_text('utf-8')))
    scene.frame_set(1)
    select_only([root, *root.children_recursive])
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
        export_yup=True, export_animations=bool(animation), export_animation_mode='NLA_TRACKS',
        export_merge_animation='NLA_TRACK', export_force_sampling=True,
        export_image_format=args.image_format, export_jpeg_quality=88, export_extras=True)
    quantization = None
    if args.quantize:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from quantize_gltf_attributes import quantize_mobile_attributes
        quantization = quantize_mobile_attributes(output)
    glb = inspect_glb(output)
    if glb['triangles'] > args.triangles * 1.05:
        raise RuntimeError('GLB exceeds triangle budget')
    report = {'status': 'exported_and_structurally_validated_pending_visual_review',
        'created_at_utc': datetime.now(timezone.utc).isoformat(),
        'source': source_evidence, 'source_objects': source_objects,
        'source_triangles': source_triangles,
        'coincident_vertex_weld': {'distance': args.weld_distance,
                                   'source_vertices': source_vertices,
                                   'welded_vertices': welded_vertices,
                                   'source_validation_changed': source_validation_changed},
        'decimation_passes': decimation_passes,
        'source_appearance_bake': bake_report,
        'quantization': quantization,
        'output': file_evidence(output),
        'blend': str(blend), 'tool': file_evidence(Path(__file__).resolve()),
        'reference': file_evidence(reference),
        'inference_report': file_evidence(inference_report),
        'geometry_origin': 'Source mesh only; no generated substitute or added decorative geometry',
        'preservation': ('Original generated appearance and PBR maps baked from untouched raw source onto a mobile UV atlas'
                         if bake_report else 'Original UVs, generated material assignments and image textures retained'),
        'orientation': orientation, 'height': normalized_height,
        'max_height_budget': args.height, 'max_footprint_budget': args.footprint,
        'bounds_blender': {'min': list(normalized_min), 'max': list(normalized_max)},
        'bounds_gltf': {'min': [normalized_min.x, normalized_min.z, -normalized_max.y],
                        'max': [normalized_max.x, normalized_max.z, -normalized_min.y]},
        'textures': textures,
        'generated_connected_components': components, 'animation': animation,
        'animation_config': file_evidence(config) if config else None,
        'glb_validation': glb, 'visual_review': 'Pending inspection of the four exported GLB preview images'}
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    report['export_reimport_validation'] = render_exported(output, args, normalized_height)
    report['raw_source_unchanged'] = sha256(source) == source_evidence['sha256']
    if not report['raw_source_unchanged']:
        raise RuntimeError('Raw source hash changed during processing')
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('HARBOR_PROCESSING_REPORT', json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()

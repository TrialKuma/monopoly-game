"""Read-only raw-mesh diagnostics; outputs never enter the runtime asset path."""
import argparse
import json
import math
from pathlib import Path
import sys
from types import SimpleNamespace

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import process_generated_model as pipeline

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True)
parser.add_argument('--name', required=True)
parser.add_argument('--triangles', type=int, required=True)
parser.add_argument('--weld', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
source = pipeline.resolve(args.source)
pipeline.clear_scene()
body, _ = pipeline.import_body(source)
before = pipeline.triangles(body)
if args.weld:
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.000001)
    bpy.ops.object.mode_set(mode='OBJECT')
    body.data.validate(clean_customdata=False)
modifier = body.modifiers.new('Single diagnostic collapse', 'DECIMATE')
modifier.ratio = args.triangles / pipeline.triangles(body)
modifier.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier=modifier.name)
body.data.validate(clean_customdata=False)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.delete_loose(use_verts=True, use_edges=True, use_faces=False)
bpy.ops.object.mode_set(mode='OBJECT')
opts = SimpleNamespace(samples=12, render_size=768, texture_size=1024, footprint=3,
    height=3, name=args.name, skip_render=False, animation_config=None, yaw=180,
    pitch=0, roll=0, no_auto_upright=False, max_upright=18)
pipeline.upright(body, opts)
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(42))
for image in bpy.data.images:
    if image.type == 'IMAGE' and image.size[0]:
        ratio = min(1, 1024 / max(image.size))
        image.scale(round(image.size[0] * ratio), round(image.size[1] * ratio))
        image.pack()
pipeline.select_only([body])
path = pipeline.ROOT / 'art/harbor/blender' / (args.name + '.glb')
bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
    export_yup=True, export_animations=False, export_image_format='JPEG', export_jpeg_quality=88)
_, hi = pipeline.bounds(body)
report = {'source': pipeline.file_evidence(source), 'output': pipeline.file_evidence(path),
    'source_triangles': before, 'triangles': pipeline.triangles(body), 'welded': args.weld}
report['render'] = pipeline.render_exported(path, opts, hi.z)
(pipeline.ROOT / 'art/harbor/reports' / (args.name + '.json')).write_text(
    json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('DIAGNOSTIC_DONE', report['triangles'], flush=True)

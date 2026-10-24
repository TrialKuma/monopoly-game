"""Inspect an experiment's exact raw GLB without asserting its inference type.

Normalization affects the temporary Blender scene only. No mesh is exported,
and this receipt cannot approve or promote anything into the game.
"""
from pathlib import Path
from types import SimpleNamespace
import argparse, json, shutil, sys, time

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import process_lod as lod


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--source', type=Path, required=True)
    cli.add_argument('--sha256', required=True)
    cli.add_argument('--out', type=Path, required=True)
    cli.add_argument('--yaw', type=float, default=180.)
    args = cli.parse_args(sys.argv[sys.argv.index('--') + 1:])
    source, out = args.source.resolve(), args.out.resolve()
    experiment_root = (lod.ART / 'experiments').resolve()
    if not out.is_relative_to(experiment_root):
        raise ValueError('Experiment evidence must stay outside game candidate directories')
    if lod.p.sha256(source) != args.sha256:
        raise ValueError('Raw model changed before inspection')
    if out.exists() and any(out.iterdir()):
        raise FileExistsError('Preserve existing render evidence')
    out.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    settings = SimpleNamespace(region='experiment', asset='raw', lod='near',
        height=1., footprint=1., render_directory=out, render_prefix='raw-',
        yaw=args.yaw, pitch=0., roll=0., no_auto_upright=False, max_upright=18.)
    rendered = lod.render(source, settings, ['front', 'right', 'back', 'left', 'iso'], raw=True)
    scene = bpy.context.scene
    target = Vector((0, 0, sum(rendered['boundsBlender'][key][2]
        for key in ('min', 'max')) * .5))
    positions = {'front': (0, -4, .9), 'right': (4, 0, .9), 'back': (0, 4, .9),
        'left': (-4, 0, .9), 'front-iso': (2.8, -4, 2.6), 'back-iso': (-2.8, 4, 2.6)}
    extra = []

    def frame(view, resolution, material):
        scene.camera.location = Vector(positions[view])
        scene.camera.rotation_euler = (target - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.resolution_x = scene.render.resolution_y = resolution
        path = out / f'{material}-{resolution}-{view}.png'
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        extra.append({'view': view, 'resolution': resolution, 'material': material,
            **lod.p.file_evidence(path)})

    for view in ('front', 'right', 'back', 'left'):
        frame(view, 256, 'color')
    for view in ('front-iso', 'back-iso'):
        frame(view, 1024, 'color')
    neutral = bpy.data.materials.new('Experiment diagnostic override')
    neutral.use_nodes = True
    shader = neutral.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (.52, .52, .52, 1)
    shader.inputs['Roughness'].default_value = .8
    scene.view_layers[0].material_override = neutral
    for view in ('front-iso', 'back-iso'):
        frame(view, 1024, 'gray')
    if lod.p.sha256(source) != args.sha256:
        raise ValueError('Source bytes changed during inspection')
    tool = Path(__file__)
    snapshot = lod.ART / 'reports/tool-snapshots' / (lod.p.sha256(tool) + '-' + tool.name)
    if not snapshot.exists():
        shutil.copyfile(tool, snapshot)
    report = {'status': 'rendered_pending_visual_review', 'experimentOnly': True,
        'source': lod.p.file_evidence(source), 'sourceBytesUnchanged': True,
        'modelExported': False, 'sourceTypeNotInferred': True,
        'normalization': {'yawDegrees': args.yaw, 'autoUprightMaximumDegrees': 18,
            'maximumEdge': 1., 'scope': 'Temporary render scene only; no source file write'},
        'views': rendered, 'viewEvidence': [lod.p.file_evidence(Path(p)) for p in rendered['views']],
        'additionalViews': extra, 'tool': lod.p.file_evidence(snapshot),
        'renderWallSeconds': round(time.monotonic() - started, 3), 'createdAt': lod.now()}
    target = out / 'inspection.json'
    target.write_text(json.dumps(report, indent=2) + '\n', encoding='utf8')
    print(json.dumps(lod.p.file_evidence(target)), flush=True)


if __name__ == '__main__':
    main()

"""Fit the reviewed alpine windmill within 4 MiB without geometric changes."""
from pathlib import Path
from types import SimpleNamespace
import argparse, copy, hashlib, io, json, shutil, sys
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from neural_component import GLB


def evidence(path):
    path = Path(path).resolve()
    return {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'bytes': path.stat().st_size}


def view_bytes(g, index):
    view = g.doc['bufferViews'][index]
    start = view.get('byteOffset', 0)
    return bytes(g.blob[start:start + view['byteLength']])


def compress(report_path, out):
    from PIL import Image
    original = json.loads(report_path.read_text('utf8'))
    assert (original['region'], original['asset']) == ('alpine', 'windmill')
    source = Path(original['processedCandidate']['path'])
    assert evidence(source)['sha256'] == original['processedCandidate']['sha256'] == 'b2b9d1a39c9223d387bee050ad580582157cbf04d4286b5a120e180ede973fd3'
    assert not out.exists(), 'Use a fresh isolated directory'
    out.mkdir(parents=True)
    before = GLB(source)
    g = GLB(source)
    assert len(g.doc['materials']) == 1 and len(g.doc['images']) == 3 and len(g.doc['textures']) == 3
    material = g.doc['materials'][0]
    pbr = material['pbrMetallicRoughness']
    assert 'normalTexture' not in material and pbr['baseColorTexture']['index'] == 1 and pbr['metallicRoughnessTexture']['index'] == 2
    assert g.doc['textures'][0]['source'] == 0
    image_views = [image['bufferView'] for image in g.doc['images']]
    assert not any(a.get('bufferView') == image_views[0] for a in g.doc['accessors'])
    images = [Image.open(io.BytesIO(view_bytes(g, index))).convert('RGB') for index in image_views]
    assert images[1].size == (2048, 2048) and images[2].size == (1024, 1024)
    base = io.BytesIO()
    images[1].save(base, format='JPEG', quality=92, subsampling=0, optimize=True)
    orm_original = np.asarray(images[2], dtype=np.float32)
    orm_values = orm_original.copy()
    # Six-bit scalar values keep roughness/metallic error <= 2 / 255. Retain
    # the R channel exactly; true-color PNG avoids palette outlier errors.
    orm_values[:, :, 1:] = np.round(np.round(orm_values[:, :, 1:] / 255 * 63) / 63 * 255)
    orm = io.BytesIO()
    Image.fromarray(orm_values.astype(np.uint8)).save(orm, format='PNG', optimize=True, compress_level=9)
    payloads = {image_views[1]: base.getvalue(), image_views[2]: orm.getvalue()}
    removed_view = image_views[0]
    blob = bytearray()
    mapping = {}
    views = []
    for index, view in enumerate(g.doc['bufferViews']):
        if index == removed_view:
            continue
        row = copy.deepcopy(view)
        while len(blob) % 4:
            blob.append(0)
        data = payloads.get(index, view_bytes(before, index))
        row.update(byteOffset=len(blob), byteLength=len(data))
        mapping[index] = len(views)
        views.append(row)
        blob.extend(data)
    g.doc['bufferViews'] = views
    g.blob = blob
    for accessor in g.doc['accessors']:
        accessor['bufferView'] = mapping[accessor['bufferView']]
    g.doc['images'] = g.doc['images'][1:]
    for image in g.doc['images']:
        image['bufferView'] = mapping[image['bufferView']]
    g.doc['textures'] = g.doc['textures'][1:]
    for texture in g.doc['textures']:
        texture['source'] -= 1
    pbr['baseColorTexture']['index'] = 0
    pbr['metallicRoughnessTexture']['index'] = 1
    output = out / 'windmill.glb'
    g.save(output)
    assert output.stat().st_size < 4 * 1024 * 1024 - 8192, 'Insufficient room for runtime pack metadata'
    after = GLB(output)
    preserved = []
    for index, accessor in enumerate(before.doc['accessors']):
        expected = copy.deepcopy(accessor)
        expected['bufferView'] = mapping[expected['bufferView']]
        assert after.doc['accessors'][index] == expected
        assert np.array_equal(before.array(index), after.array(index))
        old_view = accessor['bufferView']
        assert view_bytes(before, old_view) == view_bytes(after, mapping[old_view])
        preserved.append({'accessor': index, 'bufferBytesUnchanged': True})
    for key in ('nodes', 'scenes', 'scene', 'meshes', 'animations', 'samplers'):
        assert before.doc.get(key) == after.doc.get(key), key
    old_base = np.asarray(images[1], dtype=np.float32)
    new_base = np.asarray(Image.open(io.BytesIO(base.getvalue())).convert('RGB'), dtype=np.float32)
    diff = new_base - old_base
    orm_error = np.abs(orm_values - orm_original)
    receipt = {
        'sourceCandidate': evidence(source), 'sourceProcessingReport': evidence(report_path),
        'originalBytes': source.stat().st_size, 'outputBytes': output.stat().st_size,
        'hardBudgetBytes': 4 * 1024 * 1024, 'runtimeMetadataReserveBytes': 8192,
        'baseColor': {'size': [2048, 2048], 'encoding': 'JPEG quality 92, 4:4:4 chroma, optimized entropy', 'beforeBytes': len(view_bytes(before, image_views[1])), 'afterBytes': len(base.getvalue()), 'pixelPSNRdB': float(10 * np.log10(255 ** 2 / np.mean(diff ** 2))), 'meanAbsolute8BitError': float(np.abs(diff).mean())},
        'orm': {'size': [1024, 1024], 'encoding': 'Lossless true-color PNG after bounded six-bit roughness/metallic quantization; R unchanged', 'beforeBytes': len(view_bytes(before, image_views[2])), 'afterBytes': len(orm.getvalue()), 'maximum8BitChannelError': orm_error.max((0, 1)).tolist(), 'meanAbsolute8BitChannelError': orm_error.mean((0, 1)).tolist()},
        'removedUnreferencedLegacyNormalImageBytes': len(view_bytes(before, image_views[0])),
        'geometryUVNormalsAndAnimationAccessorBytesUnchanged': True, 'nodesMeshesSceneAndAnimationJSONUnchanged': True,
        'preservedAccessors': preserved, 'newInferenceCalls': 0,
    }
    (out / 'compression-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2), 'utf8')
    report = copy.deepcopy(original)
    for key in ('reviewSheet', 'promotedFrom', 'quantization', 'componentVisualReview'):
        report.pop(key, None)
    report.update(status='exported_pending_visual_review', processingComplete=False, processedCandidate=evidence(output))
    report['textureCompression'] = receipt
    snapshot_dir = out / 'tools'
    snapshot_dir.mkdir()
    snapshot = snapshot_dir / (evidence(__file__)['sha256'] + '-' + Path(__file__).name)
    shutil.copyfile(__file__, snapshot)
    report['textureCompressionTool'] = evidence(snapshot)
    report['priorCompressionReport'] = evidence(report_path)
    output.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf8')
    print('WINDMILL_COMPRESSED ' + json.dumps(receipt), flush=True)


def render(out):
    import process_lod as lod
    import render_component
    output = out / 'windmill.glb'
    report_path = output.with_suffix('.json')
    report = json.loads(report_path.read_text('utf8'))
    assert evidence(output)['sha256'] == report['processedCandidate']['sha256']
    settings = SimpleNamespace(region='alpine', asset='windmill', lod='near', height=1., footprint=1., render_directory=out / 'renders')
    report['glbValidation'] = lod.p.inspect_glb(output)
    report['renderedCandidate'] = lod.render(output, settings, ('front', 'right', 'back', 'left', 'iso'))
    report['textureSizes'] = report['renderedCandidate']['textureSizes']
    previous = sys.argv[:]
    try:
        sys.argv = ['render_component', '--', '--source', str(output), '--region', 'alpine', '--asset', 'windmill', '--output-directory', str(out / 'motion')]
        render_component.main()
    finally:
        sys.argv = previous
    motion_path = out / 'motion/review.json'
    motion = json.loads(motion_path.read_text('utf8'))
    report['animation']['poseReview'] = evidence(motion_path)
    report['animation']['frames'] = [path for pose in motion['poses'] for path in pose['views']]
    report.update(processingComplete=True, status='exported_pending_visual_review', completedAt=lod.now())
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf8')
    print('WINDMILL_COMPRESSED_REVIEW_READY ' + json.dumps({'candidate': evidence(output), 'report': evidence(report_path)}), flush=True)


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('--report', type=Path)
    cli.add_argument('--out', type=Path, required=True)
    cli.add_argument('--render', action='store_true')
    args = cli.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    if args.render:
        render(args.out.resolve())
    else:
        compress(args.report.resolve(), args.out.resolve())


if __name__ == '__main__':
    main()

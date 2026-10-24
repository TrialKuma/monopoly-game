"""Pack reviewed Pixal MV assets without re-exporting their mesh or texture bytes.

This is a packaging step, not a building generator. It refuses missing, unreviewed,
non-neural, or stale sources. Candidate GLBs use Y up and +Z front. A uniform
placement transform fits each candidate to its playable parcel; all internal
geometry, UVs, materials and embedded images are copied byte-for-byte.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import itertools
import json
import math
import shutil
import struct
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / 'art/full-ai-city'
MAPS = ('classic', 'compact', 'expansion', 'harbor', 'alpine')
FAMILIES = ('villa', 'shop', 'hotel', 'tower', 'skyscraper', 'finance', 'onsen')
PUBLIC = ('civic_hall', 'vault_bank', 'builders_guild', 'card_pavilion',
          'chance_wheel', 'teleport_gate', 'rush_station', 'junction_hub')
HEROES = {'harbor': 'lighthouse', 'alpine': 'windmill'}
SCENIC_ASSETS = ('villa_3', 'shop_2', 'hotel_2', 'tower_2', 'junction_hub')
ASSETS = tuple(f'{family}_{level}' for family in FAMILIES for level in (1, 2, 3)) + PUBLIC
TABLES = ('bufferViews', 'accessors', 'samplers', 'images', 'textures', 'materials', 'meshes', 'nodes', 'animations')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def local(value):
    # Native reports retain their original absolute paths. Resolve the project
    # suffix when the checked-out game has moved to another drive/computer.
    normal = str(value).replace('\\', '/')
    marker = '/monopoly/'
    if marker in normal:
        normal = normal.split(marker, 1)[1]
    path = (ROOT / normal).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError(f'Project-local path required: {value}')
    return path


def relative(path):
    return Path(path).resolve().relative_to(ROOT).as_posix()


def read_glb(path):
    data = Path(path).read_bytes()
    if struct.unpack_from('<4sII', data) != (b'glTF', 2, len(data)):
        raise ValueError(f'Invalid GLB header: {path}')
    position, document, binary = 12, None, None
    while position < len(data):
        length, kind = struct.unpack_from('<II', data, position)
        chunk = data[position + 8:position + 8 + length]
        if len(chunk) != length:
            raise ValueError('Truncated GLB chunk')
        if kind == 0x4E4F534A:
            document = json.loads(chunk)
        elif kind == 0x004E4942:
            binary = chunk
        position += 8 + length
    if document is None or binary is None or len(document.get('buffers', [])) != 1:
        raise ValueError('One embedded binary buffer is required')
    if document.get('skins') or document.get('cameras'):
        raise ValueError('Architectural source must contain no skins or cameras')
    allowed = {'KHR_mesh_quantization', 'KHR_materials_unlit', 'KHR_texture_transform',
               'KHR_materials_ior', 'KHR_materials_specular'}
    unsupported = set(document.get('extensionsRequired', [])) - allowed
    if unsupported:
        raise ValueError(f'Unreviewed GLB extension: {unsupported}')
    for image in document.get('images', []):
        if 'bufferView' not in image or 'uri' in image:
            raise ValueError('Textures must be embedded')
    for view in document.get('bufferViews', []):
        if view.get('extensions'):
            raise ValueError('Compressed buffer views need an explicit remapping implementation')
    return document, binary


def matrix(node):
    if 'matrix' in node:
        return node['matrix']
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    sx, sy, sz = node.get('scale', [1, 1, 1])
    tx, ty, tz = node.get('translation', [0, 0, 0])
    return [(1-2*y*y-2*z*z)*sx, (2*x*y+2*z*w)*sx, (2*x*z-2*y*w)*sx, 0,
            (2*x*y-2*z*w)*sy, (1-2*x*x-2*z*z)*sy, (2*y*z+2*x*w)*sy, 0,
            (2*x*z+2*y*w)*sz, (2*y*z-2*x*w)*sz, (1-2*x*x-2*y*y)*sz, 0,
            tx, ty, tz, 1]


IDENTITY = matrix({})


def multiply(a, b):
    return [sum(a[k*4+row]*b[col*4+k] for k in range(4)) for col in range(4) for row in range(4)]


def measure(document):
    low, high, triangles = [math.inf]*3, [-math.inf]*3, 0
    def visit(index, parent):
        nonlocal triangles
        node = document['nodes'][index]
        world = multiply(parent, matrix(node))
        if 'mesh' in node:
            for primitive in document['meshes'][node['mesh']]['primitives']:
                if primitive.get('mode', 4) != 4:
                    raise ValueError('Only triangle meshes can become runtime buildings')
                accessor = document['accessors'][primitive['attributes']['POSITION']]
                lo, hi = accessor['min'], accessor['max']
                # KHR_mesh_quantization normalized positions are uncommon here,
                # but their accessor bounds are integer storage coordinates.
                if accessor.get('normalized'):
                    bits = {5120:127, 5121:255, 5122:32767, 5123:65535}.get(accessor['componentType'])
                    if not bits:
                        raise ValueError('Unsupported normalized position component')
                    lo = [max(-1, v/bits) for v in lo]
                    hi = [max(-1, v/bits) for v in hi]
                for point in itertools.product(*zip(lo, hi)):
                    p = [sum(world[k*4+row]*point[k] for k in range(3))+world[12+row] for row in range(3)]
                    low[:] = [min(a, b) for a, b in zip(low, p)]
                    high[:] = [max(a, b) for a, b in zip(high, p)]
                count = document['accessors'][primitive['indices']]['count'] if 'indices' in primitive else accessor['count']
                triangles += count // 3
        for child in node.get('children', []):
            visit(child, world)
    for index in document['scenes'][document.get('scene', 0)]['nodes']:
        visit(index, IDENTITY)
    if not all(math.isfinite(v) for v in low+high):
        raise ValueError('Non-finite or empty model bounds')
    return low, high, triangles


def dimensions(asset):
    if asset in HEROES.values():
        return asset, 0, (2.8, 3.7, 2.8)
    family = asset.rsplit('_', 1)[0] if asset not in PUBLIC else asset
    level = int(asset[-1]) if asset not in PUBLIC else 0
    if family in ('skyscraper', 'finance', 'onsen'):
        return family, level, (2.50, [1.10, 1.65, 2.25][level-1], 1.02)
    if level:
        return family, level, (.99, [.78, 1.16, 1.60][level-1], .99)
    return family, 0, (1.04, 1.40, 1.04)


def uniform_placement_plan(sizes):
    """Fit intact sources, then leave visible height growth within complete families.

    Deep upper-level sources can reach the parcel depth limit before its height
    limit. In that case only lower levels shrink, uniformly; no source is
    stretched and no parcel is expanded. The resulting family still needs a
    shared-camera visual review, particularly when the reduction is substantial.
    """
    plan = {}
    for asset, size in sizes.items():
        if len(size) != 3 or not all(math.isfinite(v) and v > 0 for v in size):
            raise ValueError(f'{asset}: invalid measured dimensions')
        envelope = dimensions(asset)[2]
        independent = min(limit/actual for limit, actual in zip(envelope, size))
        plan[asset] = {'independentParcelScale': independent, 'scale': independent,
                       'reason': 'independent_uniform_parcel_fit'}
    for family in FAMILIES:
        names = [f'{family}_{level}' for level in (1, 2, 3)]
        if not all(name in plan for name in names):
            continue
        for lower, upper in zip(reversed(names[:-1]), reversed(names[1:])):
            upper_height = sizes[upper][1]*plan[upper]['scale']
            height_cap = upper_height*.86
            previous = plan[lower]['scale']
            plan[lower]['scale'] = min(previous, height_cap/sizes[lower][1])
            if plan[lower]['scale'] < previous:
                plan[lower].update(reason='uniform_fit_below_next_upgrade',
                                   nextLevel=upper, nextLevelHeight=upper_height,
                                   maximumHeight=height_cap, heightRatio=.86)
    for asset, row in plan.items():
        row['relativeToIndependentFit'] = row['scale']/row['independentParcelScale']
        row['sharedCameraReviewRequired'] = True
    return plan


def verified_entry(registry, region, asset):
    key = f'{region}/{asset}'
    entry = registry['assets'].get(key)
    if not entry or entry.get('status') != 'approved':
        raise ValueError(f'{key}: not visually approved; no procedural fallback is permitted')
    if entry.get('sourceType') != 'pixal_native_multiview':
        raise ValueError(f'{key}: source is not actual native Pixal multiview')
    for field in ('candidate', 'inferenceReport', 'processingReport', 'reference'):
        receipt = entry[field]
        path = local(receipt['path'])
        if digest(path) != receipt['sha256']:
            raise ValueError(f'{key}: stale {field} approval')
    inference = json.loads(local(entry['inferenceReport']['path']).read_text('utf-8'))
    if not (inference.get('generation_started') and inference.get('view_count') == 3
            and inference.get('pipeline_config') == 'pipeline_mv.json'
            and inference.get('output_sha256')):
        raise ValueError(f'{key}: missing three-view native inference receipt')
    inputs = inference.get('input_views', [])
    if len(inputs) != 3 or len({v['sha256'] for v in inputs}) != 3:
        raise ValueError(f'{key}: three distinct input images are required')
    for view in inputs:
        if digest(local(view['path'])) != view['sha256']:
            raise ValueError(f'{key}: source reference pixels changed after generation')
    processing = json.loads(local(entry['processingReport']['path']).read_text('utf-8'))
    if (processing['source']['rawGLB']['sha256'] != inference['output_sha256']
            or processing['processedCandidate']['sha256'] != entry['candidate']['sha256']
            or processing.get('rawSourceUnchanged') is not True):
        raise ValueError(f'{key}: processed model does not match its reviewed native inference')
    # Original million-face exports and decoded fields remain local archives;
    # a clone can repack the frozen reviewed mobile bytes without those files.
    # When present, the original archive must still match its inference receipt.
    raw_archive = local(inference['output'])
    if raw_archive.exists() and digest(raw_archive) != inference['output_sha256']:
        raise ValueError(f'{key}: raw neural source changed after inference')
    if len(entry.get('reviewViews', [])) < 5:
        raise ValueError(f'{key}: front, right, back, left and isometric review required')
    images = entry.get('reviewImages', [])
    if [row['path'] for row in images] != entry['reviewViews']:
        raise ValueError(f'{key}: exact reviewed image receipts are required')
    for row in [*images, *entry.get('sourceComparisonImages', [])]:
        if digest(local(row['path'])) != row['sha256']:
            raise ValueError(f'{key}: approved render pixels changed')
    if asset in ('chance_wheel', 'builders_guild', *HEROES.values()):
        motion = entry.get('motionReview', {})
        if not motion.get('report') or len(motion.get('frames', [])) < 3:
            raise ValueError(f'{key}: actual moving-part review is required')
        for row in [motion['report'], *motion['frames']]:
            if digest(local(row['path'])) != row['sha256']:
                raise ValueError(f'{key}: reviewed motion pixels changed')
    return entry


def verified_map_style(registry, region, far_registry=None):
    review_file = ART/'regional-review.json'
    if not review_file.exists():
        raise ValueError('Publication requires actual five-map group and in-game visual review')
    review = json.loads(review_file.read_text('utf-8')).get('maps', {}).get(region, {})
    if review.get('status') != 'approved' or len(review.get('note', '')) < 30:
        raise ValueError(f'{region}: regional style and mobile scene have not passed visual review')
    expected = (*ASSETS, *([HEROES[region]] if region in HEROES else []))
    for asset in expected:
        if review.get('approvedAssets', {}).get(asset) != registry['assets'][f'{region}/{asset}']['candidate']['sha256']:
            raise ValueError(f'{region}/{asset}: region review refers to an older model revision')
    if far_registry:
        for asset in SCENIC_ASSETS:
            if review.get('approvedFarAssets', {}).get(asset) != far_registry['assets'][f'{region}/{asset}']['candidate']['sha256']:
                raise ValueError(f'{region}/{asset}: region review refers to an older scenic revision')
    for kind in ('groupView', 'portraitGameView'):
        row = review.get(kind)
        if not row or digest(local(row['path'])) != row['sha256']:
            raise ValueError(f'{region}: missing actual {kind} visual evidence')
    filenames = [f'{region}.glb']
    if far_registry:
        filenames.append(f'{region}-far.glb')
    if region in HEROES:
        filenames.append(f'{region}_{HEROES[region]}.glb')
    bundles = review.get('packedBundles', {})
    for filename in filenames:
        row = bundles.get(filename)
        package = ART/'packed'/filename
        if not row or local(row['path']) != package or digest(package) != row['sha256']:
            raise ValueError(f'{region}: visual review is not bound to the current packed placement: {filename}')


def pack(region, registry, target, assets=None, near_height_guides=None):
    doc = {'asset': {'version': '2.0', 'generator': 'Monopoly verified Pixal MV packer'},
           'scene': 0, 'scenes': [{'name': f'{region}_full_ai_city', 'nodes': []}],
           **{key: [] for key in TABLES}}
    binary, rows, raw_hashes = bytearray(), [], set()
    names = tuple(ASSETS if assets is None else assets)
    sources, sizes = {}, {}
    for asset in names:
        entry = verified_entry(registry, region, asset)
        source, blob = read_glb(local(entry['candidate']['path']))
        lo, hi, triangles = measure(source)
        sizes[asset] = [b-a for a, b in zip(lo, hi)]
        sources[asset] = (entry, source, blob, lo, hi, triangles)
    placement_plan = uniform_placement_plan(sizes)
    for asset in names:
        entry, source, blob, lo, hi, triangles = sources[asset]
        if asset in HEROES.values() and not source.get('animations'):
            raise ValueError(f'{region}/{asset}: scenic centerpiece must preserve its component animation')
        family, level, envelope = dimensions(asset)
        size = sizes[asset]
        placement = placement_plan[asset]
        if near_height_guides is not None:
            guide = near_height_guides[asset]
            if entry.get('nearSourceSha256') != guide['sourceSha256']:
                raise ValueError(f'{region}/{asset}: placement guide is not the approved near source')
            placement.update(reason='uniform_far_fit_to_reviewed_near_height', nearHeightGuide=guide)
            placement['scale'] = min(placement['scale'], guide['height']/size[1])
            placement['relativeToIndependentFit'] = placement['scale']/placement['independentParcelScale']
        scale = placement['scale']
        translation = [-(lo[0]+hi[0])*.5*scale, -lo[1]*scale, -(lo[2]+hi[2])*.5*scale]
        inference = json.loads(local(entry['inferenceReport']['path']).read_text('utf-8'))
        if inference['output_sha256'] in raw_hashes:
            raise ValueError('Different buildings must not be scaled aliases of one neural generation')
        raw_hashes.add(inference['output_sha256'])
        offsets = {key: len(doc[key]) for key in TABLES}
        buffer_offset = len(binary)
        binary.extend(blob)
        binary.extend(b'\0' * (-len(binary) % 4))
        part = copy.deepcopy(source)
        for view in part.get('bufferViews', []):
            view['buffer'] = 0
            view['byteOffset'] = view.get('byteOffset', 0) + buffer_offset
        for accessor in part.get('accessors', []):
            if 'bufferView' in accessor:
                accessor['bufferView'] += offsets['bufferViews']
            if 'sparse' in accessor:
                for key in ('indices', 'values'):
                    accessor['sparse'][key]['bufferView'] += offsets['bufferViews']
        for image in part.get('images', []):
            image['bufferView'] += offsets['bufferViews']
        for texture in part.get('textures', []):
            if 'source' in texture:
                texture['source'] += offsets['images']
            if 'sampler' in texture:
                texture['sampler'] += offsets['samplers']
        def material_indices(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key.endswith('Texture') and isinstance(item, dict) and 'index' in item:
                        item['index'] += offsets['textures']
                    else:
                        material_indices(item)
            elif isinstance(value, list):
                for item in value:
                    material_indices(item)
        for material in part.get('materials', []):
            material_indices(material)
        for mesh in part.get('meshes', []):
            for primitive in mesh['primitives']:
                primitive['attributes'] = {key: value+offsets['accessors'] for key, value in primitive['attributes'].items()}
                for attribute in ('indices',):
                    if attribute in primitive:
                        primitive[attribute] += offsets['accessors']
                if 'material' in primitive:
                    primitive['material'] += offsets['materials']
                for morph in primitive.get('targets', []):
                    for key in morph:
                        morph[key] += offsets['accessors']
        for node in part.get('nodes', []):
            if 'mesh' in node:
                node['mesh'] += offsets['meshes']
            if 'children' in node:
                node['children'] = [child+offsets['nodes'] for child in node['children']]
        for animation in part.get('animations', []):
            for sampler in animation['samplers']:
                sampler['input'] += offsets['accessors']
                sampler['output'] += offsets['accessors']
            for channel in animation['channels']:
                channel['target']['node'] += offsets['nodes']
        for key in TABLES:
            doc[key].extend(part.get(key, []))
        for key in ('extensionsUsed', 'extensionsRequired'):
            doc[key] = sorted(set(doc.get(key, [])) | set(part.get(key, [])))
        placement_index = len(doc['nodes'])
        doc['nodes'].append({'name': f'{region}_{asset}_placement',
                             'scale': [scale]*3, 'translation': translation,
                             'children': [i+offsets['nodes'] for i in source['scenes'][source.get('scene', 0)]['nodes']]})
        root = len(doc['nodes'])
        provenance = {'sourceType': 'pixal_native_multiview', 'family': family, 'level': level,
                      'sourceFile': entry['candidate']['path'], 'sourceSha256': entry['candidate']['sha256'],
                      'inferenceReport': entry['inferenceReport']['path'],
                      'reference': entry['reference']['path'], 'rawSourceSha256': inference['output_sha256'],
                      'referenceViews': [{'view': view, 'path': relative(local(item['path'])), 'sha256': item['sha256']}
                                         for view, item in zip(('front', 'right', 'back'), inference['input_views'])],
                      'normalisationScale': scale, 'placementReview': placement,
                      'reviewStatus': 'approved'}
        if entry.get('triangleBudget'):
            provenance['triangleBudget'] = entry['triangleBudget']
        if entry.get('budgetReason'):
            provenance['budgetReason'] = entry['budgetReason']
        if entry.get('nearSourceSha256'):
            provenance['nearSourceSha256'] = entry['nearSourceSha256']
        doc['nodes'].append({'name': f'{region}_{asset}', 'children': [placement_index], 'extras': provenance})
        doc['scenes'][0]['nodes'].append(root)
        rows.append({'name': f'{region}_{asset}', 'size': [v*scale for v in size],
                     'bounds': {'min': [lo[i]*scale+translation[i] for i in range(3)],
                                'max': [hi[i]*scale+translation[i] for i in range(3)]},
                     'triangles': triangles, 'source': provenance})
    doc['buffers'] = [{'byteLength': len(binary)}]
    for key in list(doc):
        if doc[key] == []:
            del doc[key]
    encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    result = struct.pack('<4sII', b'glTF', 2, 28+len(encoded)+len(binary))
    result += struct.pack('<II', len(encoded), 0x4E4F534A) + encoded
    result += struct.pack('<II', len(binary), 0x004E4942) + binary
    if len(result) >= 99_000_000:
        raise ValueError('Regional package exceeds 99 MB; optimize assets or use per-building loading')
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.pending.glb')
    temporary.write_bytes(result)
    read_glb(temporary)
    temporary.replace(target)
    manifest = {'schemaVersion': 2, 'region': region, 'coordinateSystem': 'glTF Y-up; +Z front',
                'sourceType': 'pixal_native_multiview', 'assets': rows,
                'packedAtUtc': datetime.now(timezone.utc).isoformat(),
                'sha256': digest(target), 'bytes': len(result)}
    target.with_name(target.stem+'-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', 'utf-8')
    return {'map': region, 'assets': len(rows), 'path': relative(target), 'bytes': len(result), 'sha256': digest(target)}


def pack_previews(region, registry, destination=None):
    """Copy actual approved iso renders, retaining their exact image bytes."""
    destination = destination or ART/'packed/previews'/region
    rows = []
    sources = []
    for asset in ASSETS:
        entry = verified_entry(registry, region, asset)
        view = entry['reviewImages'][-1]
        source = local(view['path'])
        if 'iso' not in source.stem or source.read_bytes()[:8] != b'\x89PNG\r\n\x1a\n':
            raise ValueError(f'{region}/{asset}: approved actual iso PNG required')
        sources.append((asset, entry, source))
    destination.mkdir(parents=True, exist_ok=True)
    for asset, entry, source in sources:
        target = destination/f'{asset}.png'
        temporary = target.with_suffix('.pending.png')
        shutil.copyfile(source, temporary)
        temporary.replace(target)
        rows.append({'asset': asset, 'view': 'iso', 'modelSha256': entry['candidate']['sha256'],
                     'sourceRender': relative(source), 'sourceRenderSha256': digest(source),
                     'path': relative(target), 'sha256': digest(target), 'bytes': target.stat().st_size})
    manifest = {'region': region, 'method': 'Exact approved model render bytes; no redrawing or image generation.', 'assets': rows}
    target = destination/'manifest.json'
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', 'utf-8')
    return {'map': region, 'path': relative(target), 'sha256': digest(target), 'assets': len(rows)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--map', choices=(*MAPS, 'all'), required=True)
    parser.add_argument('--registry', default='art/full-ai-city/approved-assets.json')
    parser.add_argument('--include-scenic', action='store_true', help='Also build the selected regions\' approved animated centerpiece packs')
    parser.add_argument('--include-far', action='store_true', help='Also build the reviewed neural derivatives used by the surrounding streets')
    parser.add_argument('--publish', action='store_true', help='Replace formal runtime packages only after full visual approval')
    args = parser.parse_args()
    if args.publish and args.map != 'all':
        parser.error('Publish the complete five-map replacement together; use a candidate pack for single-map review')
    registry = json.loads(local(args.registry).read_text('utf-8'))
    selected = MAPS if args.map == 'all' else (args.map,)
    include_scenic = args.include_scenic or args.publish
    include_far = args.include_far or args.publish
    far_registry = json.loads((ART/'approved-far-assets.json').read_text('utf-8')) if include_far else None
    # Validate the complete selection before any output is replaced.
    unique_native_sources = set()
    for region in selected:
        for asset in (*ASSETS, *([HEROES[region]] if include_scenic and region in HEROES else [])):
            entry = verified_entry(registry, region, asset)
            inference = json.loads(local(entry['inferenceReport']['path']).read_text('utf-8'))
            raw_hash = inference['output_sha256']
            if raw_hash in unique_native_sources:
                raise ValueError(f'{region}/{asset}: another region or building already uses this native source')
            unique_native_sources.add(raw_hash)
        if args.publish:
            verified_map_style(registry, region, far_registry)
        if include_far:
            for asset in SCENIC_ASSETS:
                far_entry = verified_entry(far_registry, region, asset)
                if far_entry.get('nearSourceSha256') != registry['assets'][f'{region}/{asset}']['candidate']['sha256']:
                    raise ValueError(f'{region}/{asset}: far model no longer matches the reviewed playable model')
    results = []
    preview_results = []
    for region in selected:
        target = ART/'packed'/f'{region}.glb'
        results.append(pack(region, registry, target))
        preview_results.append(pack_previews(region, registry))
    if include_scenic:
        for region, asset in HEROES.items():
            if region not in selected:
                continue
            results.append(pack(region, registry, ART/'packed'/f'{region}_{asset}.glb', (asset,)))
    if include_far:
        for region in selected:
            near_manifest = json.loads((ART/'packed'/f'{region}-manifest.json').read_text('utf-8'))
            guides = {row['name'].removeprefix(region+'_'): {'height': row['size'][1],
                      'sourceSha256': row['source']['sourceSha256']} for row in near_manifest['assets']}
            results.append(pack(region, far_registry, ART/'packed'/f'{region}-far.glb', SCENIC_ASSETS, guides))
    if args.publish:
        # Recheck after rebuilding: unchanged individual model hashes do not
        # prove that the reviewed scale/placement still matches this package.
        for region in selected:
            verified_map_style(registry, region, far_registry)
        # UI previews use the same reviewed building as the 3D scene.
        published_previews = [pack_previews(region, registry, ROOT/'assets/buildings/regions'/region)
                              for region in selected]
        # All five have been built and verified before replacing any live file.
        for region in selected:
            for filename in (f'{region}.glb', f'{region}-manifest.json'):
                target = ROOT/'assets/models/regions'/filename
                temporary = target.with_name(target.name+'.pending')
                shutil.copyfile(ART/'packed'/filename, temporary)
                temporary.replace(target)
        for region, asset in HEROES.items():
            for suffix in ('.glb', '-manifest.json'):
                filename = f'{region}_{asset}{suffix}'
                target = ROOT/'assets/models/harbor'/filename
                temporary = target.with_name(target.name+'.pending')
                shutil.copyfile(ART/'packed'/filename, temporary)
                temporary.replace(target)
        for region in selected:
            for suffix in ('.glb', '-manifest.json'):
                source = ART/'packed'/f'{region}-far{suffix}'
                target = ROOT/'assets/models/regions-far'/f'{region}{suffix}'
                target.parent.mkdir(parents=True, exist_ok=True)
                temporary = target.with_name(target.name+'.pending')
                shutil.copyfile(source, temporary)
                temporary.replace(target)
        release_files = [(region, 'playable', ROOT/'assets/models/regions'/f'{region}.glb') for region in MAPS]
        release_files += [(region, 'centerpiece', ROOT/'assets/models/harbor'/f'{region}_{asset}.glb') for region, asset in HEROES.items()]
        release_files += [(region, 'far_derivative', ROOT/'assets/models/regions-far'/f'{region}.glb') for region in MAPS]
        packages = []
        for region, role, path in release_files:
            manifest_path = path.with_name(path.stem+'-manifest.json')
            manifest = json.loads(manifest_path.read_text('utf-8'))
            packages.append({'map': region, 'role': role, 'path': relative(path),
                             'sha256': digest(path), 'bytes': path.stat().st_size,
                             'assets': len(manifest['assets']),
                             'triangles': sum(row['triangles'] for row in manifest['assets']),
                             'manifestPath': relative(manifest_path), 'manifestSha256': digest(manifest_path)})
        receipts = {}
        for name, path in [('builder', Path(__file__)), ('approvedAssets', local(args.registry)),
                           ('approvedFarAssets', ART/'approved-far-assets.json'),
                           ('regionalReview', ART/'regional-review.json')]:
            receipts[name] = {'path': relative(path), 'sha256': digest(path)}
        release = {'schemaVersion': 2, 'status': 'published_after_full_visual_review',
                   'publishedAtUtc': datetime.now(timezone.utc).isoformat(),
                   'playableAssets': 145, 'centerpieceAssets': 2,
                   'nativeMultiviewBuildings': 147, 'authoredSubstituteBuildings': 0,
                   'farDerivatives': 25,
                   'farCountNote': 'Derived from the corresponding approved near models; not additional native generations.',
                   'originConvention': 'Ground-centred identity roots; glTF Y up and +Z front.',
                   'receipts': receipts, 'packages': packages, 'buildingPreviews': published_previews}
        release_path = ROOT/'art/regions/runtime-release.json'
        temporary = release_path.with_suffix('.pending.json')
        temporary.write_text(json.dumps(release, ensure_ascii=False, indent=2)+'\n', 'utf-8')
        temporary.replace(release_path)
    print(json.dumps({'status': 'packed_verified_neural_models', 'results': results, 'previews': preview_results}, ensure_ascii=False))


if __name__ == '__main__':
    main()

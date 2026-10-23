"""Read-only evidence and actual-GLB validation for one native MV house."""
from pathlib import Path
import argparse, hashlib, json, math, struct

ROOT = Path(__file__).resolve().parents[3]

def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def check_evidence(row):
    path = Path(row['path'])
    assert path.is_file(), f'Missing evidence: {path}'
    assert digest(path) == row['sha256'], f'Hash mismatch: {path}'
    if 'bytes' in row:
        assert path.stat().st_size == row['bytes'], f'Size mismatch: {path}'
    return path

def verify(name):
    report_path = ROOT / 'art/themed-city-kit/reports' / f'{name}-processing.json'
    report = json.loads(report_path.read_text('utf-8'))
    assert report['status'] == 'ready_for_runtime'
    assert report['visual_review']['status'] == 'passed'
    assert report['raw_source_unchanged'] is True
    assert report['assumed_cameras'] is True
    assert report['animation'] is None
    output = check_evidence(report['output'])
    source = check_evidence(report['source'])
    check_evidence(report['tool'])
    check_evidence(report['shared_processing_tool'])
    if report.get('local_topology_repair'):
        repair = report['local_topology_repair']
        check_evidence(repair['tool'])
        assert repair['raw_source_unchanged'] is True
        assert 0 < sum(p['added_triangles'] for p in repair['patches']) < 5000
    inference_path = check_evidence(report['inference_report'])
    inference = json.loads(inference_path.read_text('utf-8'))
    assert inference['status'] == 'generated_unrigged_part_candidate'
    assert inference['generation_started'] is True and inference['local_inference_only'] is True
    assert inference['pipeline_config'] == 'pipeline_mv.json'
    assert 'run_mv' in inference['native_entrypoint']
    assert inference['view_count'] == 3 and inference['input_unchanged'] is True
    assert inference['output_sha256'] == digest(source)
    assert Path(inference['output']).resolve() == source.resolve()
    assert inference['input_sha256'] == digest(inference['input'])
    views = inference['input_views']
    assert len(views) == 3 and len({v['sha256'] for v in views}) == 3
    for view in views:
        assert digest(view['path']) == view['sha256']
        assert len(view['camera_to_world']) == 4
    assert sum('_mv.safetensors' in w['checkpoint'] for w in inference['weights']['models']) == 4
    assert inference['assumed_cameras'] is True
    assert inference['camera_calibration'] == 'assumed_standard_orbit_not_measured'
    runner_snapshot = Path(inference.get('runner_source_snapshot', inference_path.parent / 'runner-source.py'))
    assert digest(runner_snapshot) == inference['runner_sha256']
    blob = output.read_bytes()
    magic, version, total = struct.unpack_from('<4sII', blob)
    assert magic == b'glTF' and version == 2 and total == len(blob)
    count, kind = struct.unpack_from('<II', blob, 12)
    assert kind == 0x4E4F534A
    document = json.loads(blob[20:20 + count])
    assert any(node.get('name') == name for node in document['nodes'])
    assert not document.get('animations')
    assert all('uri' not in b for b in document['buffers'])
    assert all('bufferView' in image for image in document['images'])
    triangles = 0
    for mesh in document['meshes']:
        for primitive in mesh['primitives']:
            assert primitive.get('mode', 4) == 4
            assert {'POSITION', 'NORMAL', 'TEXCOORD_0'} <= primitive['attributes'].keys()
            index = document['accessors'][primitive['indices']]
            assert index['count'] % 3 == 0
            triangles += index['count'] // 3
            position = document['accessors'][primitive['attributes']['POSITION']]
            assert all(math.isfinite(v) for v in position['min'] + position['max'])
            assert abs(position['min'][1]) < 0.002
            assert position['max'][1] - position['min'][1] <= 3.002
            assert all(position['max'][i] - position['min'][i] <= 3.002 for i in (0, 2))
    assert 50000 <= triangles <= 252000, triangles
    assert triangles == report['glb_validation']['triangles']
    assert len(blob) <= 12 * 1024**2
    views = report['visual_review']['views']
    assert len(views) == 4 and all(Path(p).is_file() for p in views)
    return {'asset': name, 'status': 'passed', 'triangles': triangles,
            'bytes': len(blob), 'sha256': digest(output), 'native_views': 3,
            'assumed_cameras': True, 'report': str(report_path)}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('name')
    print(json.dumps(verify(parser.parse_args().name), ensure_ascii=False, indent=2))

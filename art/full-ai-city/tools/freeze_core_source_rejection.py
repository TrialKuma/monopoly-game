"""Freeze a manually inspected native-export rejection before final processing."""
from pathlib import Path
import argparse, hashlib, json, shutil

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / 'art/full-ai-city'

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def record(p):
    return {'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p), 'bytes': p.stat().st_size}

def main():
    parser = argparse.ArgumentParser()
    for key in ['map', 'asset', 'source-sha256', 'finding']:
        parser.add_argument('--' + key, required=True)
    parser.add_argument('--decision', default='One independent same-reference seed. If the second attempt repeats a major defect, revise the reference geometry consistency before further inference.')
    args = parser.parse_args()
    assert len(args.finding) >= 40
    state = json.loads((ART/'queue'/args.map/(args.asset+'.json')).read_text('utf8'))
    revision = next(r for r in [state, *state.get('revisions', [])] if r.get('rawGLB', {}).get('sha256') == args.source_sha256)
    source = Path(revision['rawGLB']['path'])
    assert sha(source) == args.source_sha256
    diag = ART/'work/core-review'/args.map/args.asset/('front-diagnostic-'+args.source_sha256[:16])/'diagnostic.json'
    diagnostic = json.loads(diag.read_text('utf8'))
    assert diagnostic['source']['sha256'] == args.source_sha256
    dest = ART/'reports/source-rejections'/args.map/args.asset/args.source_sha256[:16]
    dest.mkdir(parents=True, exist_ok=True)
    def copy(path, name=None):
        path = Path(path)
        target = dest/(name or path.name)
        if target.exists():
            assert sha(target) == sha(path)
        else:
            shutil.copyfile(path, target)
        return record(target)
    report = {
        'status': 'rejected_native_export_source', 'region': args.map, 'asset': args.asset,
        'reviewer': 'progression_design', 'source': record(source),
        'sourceLevel': 'Native 1M export; no untouched decoder attribution is made.',
        'inferenceReport': copy(revision['inferenceReport']['path']),
        'inputReference': copy(revision['reference']['path'], 'input-reference.json'),
        'diagnostic': copy(diag),
        'evidence': [copy(diag.parent/n) for n in ['raw-front.png', 'raw-iso.png', 'raw-grey-front-iso.png']],
        'finding': args.finding,
        'decision': args.decision,
        'sourceUnchanged': True,
        'notFinalCandidateReview': True,
    }
    target = dest/'rejection.json'
    data = (json.dumps(report, ensure_ascii=False, indent=2)+'\n').encode('utf8')
    if target.exists():
        assert target.read_bytes() == data
    else:
        target.write_bytes(data)
    print(json.dumps(record(target), ensure_ascii=False))

if __name__ == '__main__':
    main()

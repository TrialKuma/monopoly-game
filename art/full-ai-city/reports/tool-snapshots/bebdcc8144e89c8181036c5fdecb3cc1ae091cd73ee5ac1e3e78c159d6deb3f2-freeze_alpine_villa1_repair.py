"""Freeze an independently reviewed bounded chalet repair without approving a runtime model."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / 'art/full-ai-city'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def evidence(path):
    return {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha(path), 'bytes': path.stat().st_size}


def snapshot(path):
    path = Path(path)
    target = ART / 'reports/tool-snapshots' / (sha(path) + '-' + path.name)
    if target.exists():
        assert sha(target) == sha(path)
    else:
        shutil.copyfile(path, target)
    return evidence(target)


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('--work', required=True, type=Path)
    cli.add_argument('--sha256', required=True)
    cli.add_argument('--reviewer', required=True)
    cli.add_argument('--note', required=True)
    args = cli.parse_args()
    if len(args.note) < 80:
        raise ValueError('An actual view-specific source review is required')
    report = json.loads((args.work / 'repair.json').read_text('utf8'))
    output = Path(report['nativeOutput']['path'])
    assert report['nativeOutput']['sha256'] == args.sha256 == sha(output)
    assert report['source']['sha256'] == 'ecebc4fc5592305f6457e331b916139ccc822e31bf59b0de87229046da29d95d'
    assert sha(Path(report['source']['path'])) == report['source']['sha256']
    assert report['originalTrianglesDeleted'] == 0 and report['originalVerticesMoved'] == 0
    destination = ART / 'reports/local-repairs/alpine/villa_1' / args.sha256[:16]
    destination.mkdir(parents=True, exist_ok=False)

    def preserve(path, name):
        path = Path(path)
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        assert sha(target) == sha(path)
        return evidence(target)

    report['originalRepairReport'] = preserve(args.work / 'repair.json', 'source-repair-report.json')
    for key, folder in [('reviewImages', 'views'), ('neutralReviewImages', 'gray')]:
        rows = []
        for row in report[key]:
            assert sha(Path(row['path'])) == row['sha256']
            rows.append(preserve(row['path'], folder + '/' + Path(row['path']).name))
        report[key] = rows
    report['renders']['views'] = [str(ROOT / row['path']) for row in report['reviewImages']]
    report['diagnosticImages'] = report['neutralReviewImages']
    original = ART / 'work/core-review/alpine/villa_1'
    baselines = [original / 'front-diagnostic-ecebc4fc5592305f' / name
                 for name in ('raw-front.png', 'raw-iso.png', 'raw-grey-front-iso.png')]
    baselines += [original / 'raw-ecebc4fc5592305f' / name
                  for name in ('raw-right.png', 'raw-back.png', 'raw-left.png', 'raw-grey-back-iso.png')]
    report['sourceComparisonImages'] = [preserve(p, 'raw-comparison/' + p.name) for p in baselines]
    proof = json.loads((args.work / 'preservation.json').read_text('utf8'))
    assert proof['source']['sha256'] == report['source']['sha256']
    assert proof['repaired']['sha256'] == args.sha256
    assert proof['originalTrianglesCompared'] == 932424
    assert proof['addedTriangles'] == report['newTriangles']
    assert proof['maxAbsoluteError'] == {'POSITION': 0.0, 'TEXCOORD_0': 0.0}
    assert proof['embeddedImageHashesUnchanged'] is True
    proof['originalMeasurement'] = preserve(args.work / 'preservation.json', 'preservation-original.json')
    proof['tool'] = snapshot(proof['tool']['path'])
    proof_path = destination / 'preservation.json'
    proof_path.write_text(json.dumps(proof, ensure_ascii=False, indent=2) + '\n', 'utf8')
    report['sourcePreservation'] = evidence(proof_path)
    report['status'] = 'source_repair_visually_reviewed_pending_near_lod'
    report['visualReview'] = {
        'status': 'source_repair_ready_for_derivation',
        'reviewer': args.reviewer,
        'recordedAtUtc': datetime.now(timezone.utc).isoformat(),
        'views': ['front', 'right', 'back', 'left', 'iso', 'neutral-front-iso', 'neutral-back-iso'],
        'notes': args.note,
    }
    report['runtimeApproved'] = False
    report['freezeTool'] = snapshot(Path(__file__))
    target = destination / 'repair.json'
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', 'utf8')
    print(json.dumps(evidence(target), ensure_ascii=False))


if __name__ == '__main__':
    main()

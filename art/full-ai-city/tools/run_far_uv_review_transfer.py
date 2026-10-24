"""CPU-only transfer/render of one isolated far native-UV result; never approve."""
import argparse
import json
from pathlib import Path
import subprocess
import sys

from prepare_triptych import ART, ROOT, sha
from cpu_blender_lease import cpu_blender_lease
from run_hybrid_queue import BLENDER


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('identity')
    cli.add_argument('region')
    cli.add_argument('asset')
    args = cli.parse_args()
    work = ART / 'work' / args.identity
    request = json.loads((ART / 'queue/native-export-replays' / (args.identity + '.json')).read_text('utf-8'))
    assert request['operation'] == 'native_uv_only'
    assert request['status'] == 'completed_pending_texture_transfer'
    uv = Path(request['receipt']['path'])
    assert sha(uv) == request['receipt']['sha256']
    report = work / 'candidates' / args.region / (args.asset + '.json')
    row = json.loads(report.read_text('utf-8'))
    assert row['lod'] == 'far' and row['processingComplete']
    blend = work / 'candidates/blender' / args.region / (args.asset + '.blend')
    destination = work / 'final'
    if destination.exists():
        raise FileExistsError('Preserve previous outputs; use a new isolated identity')
    destination.mkdir()
    command = [str(BLENDER), '--background', '--threads', '4', '--python-exit-code', '1', '--python',
               str(ART / 'tools/bake_native_uv_candidate.py'), '--', '--report', str(report),
               '--blend', str(blend), '--sha256', row['processedCandidate']['sha256'],
               '--uv-receipt', str(uv), '--output-root', str(destination), '--texture-size', '512']
    with cpu_blender_lease(ART, 4.5):
        with (work / 'native-transfer.log').open('w', encoding='utf-8') as log:
            subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
    final = destination / args.region / (args.asset + '.json')
    subprocess.run([sys.executable, str(ART / 'tools/make_review_sheet.py'), str(final)], cwd=ROOT, check=True)
    done = json.loads(final.read_text('utf-8'))
    assert done['processingComplete'] and done['triangles'] == row['triangles']
    assert done['derivedFromNear'] == row['derivedFromNear']
    print(json.dumps({'status': 'pending_actual_visual_review', 'report': str(final),
                      'candidate': done['processedCandidate'], 'triangles': done['triangles']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()

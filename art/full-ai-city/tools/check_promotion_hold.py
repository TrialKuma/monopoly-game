"""Exercise late source-review holds without touching production candidates."""
from pathlib import Path
from unittest.mock import patch
import json,tempfile
import promote_processed_candidate as promote
from prepare_triptych import atomic_json,evidence

def main():
    with tempfile.TemporaryDirectory(prefix='candidate-promotion-hold-') as directory:
        art=Path(directory);source=art/'isolated.glb';source.write_bytes(b'isolated candidate bytes')
        target=art/'candidates/alpine/tower_3.glb';target.parent.mkdir(parents=True);target.write_bytes(b'prior candidate bytes')
        prior=target.read_bytes();raw='exact-original-raw-sha';report=art/'isolated.json'
        row={'region':'alpine','asset':'tower_3','processingComplete':True,'source':{'rawGLB':{'sha256':raw}},'processedCandidate':evidence(source)}
        atomic_json(report,row)
        atomic_json(art/'approved-assets.json',{'assets':{}})
        atomic_json(art/'queue/alpine/tower_3.json',{'rawGLB':{'sha256':raw}})
        atomic_json(art/'hybrid-queue/holds.json',{'alpine/tower_3':{'rawSha256':raw,'reason':'actual reviewer source defect'}})
        with patch.object(promote,'ART',art),patch.object(promote,'ROOT',art),patch.object(promote.sys,'argv',['promote',str(report)]),patch.object(promote.subprocess,'run') as run:
            try:promote.main()
            except RuntimeError as exc:assert 'Source review hold' in str(exc)
            else:raise AssertionError('Late hold should reject before writes')
            assert target.read_bytes()==prior and not target.with_suffix('.json').exists()
            assert not (art/'candidate-history').exists() and run.call_count==0
            # Repair receipt authenticity remains the responsibility of the
            # separate strict lineage validator. This checks only routing.
            row['localSurfaceRepair']={'source':{'sha256':'explicit-repaired-input'},'receipt':{'sha256':'explicit-repair-receipt'}}
            atomic_json(report,row);promote.main()
            assert target.read_bytes()==source.read_bytes() and run.call_count==1
        print('PASS late source hold preserves candidate/history; explicit recorded repair takes distinct promotion path')

if __name__=='__main__':main()

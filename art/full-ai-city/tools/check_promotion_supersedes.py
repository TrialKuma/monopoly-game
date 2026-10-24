"""Check explicit replacement staging without touching approved/runtime bytes."""
from pathlib import Path
from unittest.mock import patch
import json,tempfile
import promote_processed_candidate as promote
from prepare_triptych import atomic_json,evidence,sha


def check(lod):
    with tempfile.TemporaryDirectory(prefix='candidate-supersedes-') as directory:
        art=Path(directory);far=lod=='far';key='compact/villa_2'
        source=art/'isolated.glb';source.write_bytes(b'new isolated candidate')
        frozen=art/'approved.glb';frozen.write_bytes(b'immutable approved model')
        frozen_report=art/'approved-report.json';atomic_json(frozen_report,{'review':'old exact review'})
        runtime=art/'runtime.glb';runtime.write_bytes(b'formal published package')
        target=art/('candidates-far' if far else 'candidates')/'compact/villa_2.glb'
        target.parent.mkdir(parents=True);target.write_bytes(b'prior candidate')
        atomic_json(target.with_suffix('.json'),{'review':'prior candidate report'})
        prior_bytes=target.read_bytes();prior_report=target.with_suffix('.json').read_bytes()
        prior_sha=sha(target)
        entry={'candidate':evidence(frozen),'processingReport':evidence(frozen_report),'reviewedAtUtc':'previous-review'}
        registry=art/('approved-far-assets.json' if far else 'approved-assets.json')
        atomic_json(registry,{'assets':{key:entry}})
        raw='same-original-raw'
        row={'region':'compact','asset':'villa_2','lod':lod,'processingComplete':True,
             'source':{'rawGLB':{'sha256':raw}},'processedCandidate':evidence(source)}
        if far:
            atomic_json(art/'approved-assets.json',{'assets':{key:{'candidate':{'sha256':'near-source'}}}})
            row['derivedFromNear']={'sha256':'near-source'}
        report=art/'isolated.json';atomic_json(report,row)
        atomic_json(art/'queue/compact/villa_2.json',{'rawGLB':{'sha256':raw}})
        protected={path:path.read_bytes() for path in (registry,frozen,frozen_report,runtime,report)}
        history=art/('candidate-history-far' if far else 'candidate-history')
        with patch.object(promote,'ART',art),patch.object(promote,'ROOT',art),patch.object(promote.subprocess,'run') as run:
            for arguments,message in (([],'immutable'),(['--supersedes','0'*64],'does not match')):
                with patch.object(promote.sys,'argv',['promote',str(report),*arguments]):
                    try:promote.main()
                    except RuntimeError as exc:assert message in str(exc)
                    else:raise AssertionError('Invalid supersession must fail before staging')
                assert target.read_bytes()==prior_bytes and target.with_suffix('.json').read_bytes()==prior_report
                assert not history.exists() and run.call_count==0
                assert all(path.read_bytes()==before for path,before in protected.items())
            with patch.object(promote.sys,'argv',['promote',str(report),'--supersedes',entry['candidate']['sha256']]):
                promote.main()
            staged=json.loads(target.with_suffix('.json').read_text('utf8'))
            assert target.read_bytes()==source.read_bytes() and run.call_count==1
            assert staged['status']=='exported_pending_visual_review'
            assert staged['supersedesApproval']['candidate']==entry['candidate']
            assert staged['supersedesApproval']['processingReport']==entry['processingReport']
            assert all(path.read_bytes()==before for path,before in protected.items())
            archive=history/'compact/villa_2'/prior_sha
            assert (archive/'villa_2.glb').read_bytes()==prior_bytes
            assert (archive/'villa_2.json').read_bytes()==prior_report


def main():
    for lod in ('near','far'):check(lod)
    try:promote.superseded_approval({},'compact/villa_2','0'*64)
    except RuntimeError as exc:assert 'No current approval' in str(exc)
    else:raise AssertionError('A supersession must name an existing approval')
    print('PASS near/far default and wrong-SHA rejection; exact-SHA staging preserves approval, runtime, isolated input and candidate history')


if __name__=='__main__':main()

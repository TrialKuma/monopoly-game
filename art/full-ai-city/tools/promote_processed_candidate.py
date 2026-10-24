"""Move a reviewed isolated derivative into the candidate inbox, never approve it."""
from pathlib import Path
import argparse,json,shutil,subprocess,sys
from prepare_triptych import ART,ROOT,atomic_json,evidence,sha

def main():
    parser=argparse.ArgumentParser();parser.add_argument('report',type=Path);args=parser.parse_args()
    report=json.loads(args.report.read_text('utf-8'));key=report['region']+'/'+report['asset']
    far=report.get('lod')=='far'
    approved=json.loads((ART/('approved-far-assets.json' if far else 'approved-assets.json')).read_text('utf-8')).get('assets',{})
    if key in approved:raise RuntimeError('Approved derivatives are immutable')
    source=Path(report['processedCandidate']['path'])
    if not report.get('processingComplete') or sha(source)!=report['processedCandidate']['sha256']:raise RuntimeError('Incomplete or changed derivative')
    state=json.loads((ART/'queue'/report['region']/(report['asset']+'.json')).read_text('utf-8'))
    if state['rawGLB']['sha256']!=report['source']['rawGLB']['sha256']:raise RuntimeError('Candidate uses a superseded source')
    holds_path=ART/'hybrid-queue/holds.json'
    holds=json.loads(holds_path.read_text('utf8')) if holds_path.exists() else {}
    # A reviewer can reject a raw source while its CPU job waits for admission.
    # Recheck immediately before any canonical writes, rather than trusting the
    # controller's earlier decision. Explicit recorded repairs remain distinct.
    if not far and not report.get('localSurfaceRepair') and holds.get(key,{}).get('rawSha256')==report['source']['rawGLB']['sha256']:
        raise RuntimeError('Source review hold prevents unpatched candidate promotion: '+holds[key]['reason'])
    if far:
        near=json.loads((ART/'approved-assets.json').read_text('utf8')).get('assets',{}).get(key)
        if not near or report.get('derivedFromNear',{}).get('sha256')!=near['candidate']['sha256']:raise RuntimeError('Far derivative must retain the exact currently approved near source')
    target=ART/('candidates-far' if far else 'candidates')/report['region']/(report['asset']+'.glb');target.parent.mkdir(parents=True,exist_ok=True)
    if source.resolve()==target.resolve():raise RuntimeError('Expected an isolated source candidate')
    if target.exists():
        history=ART/('candidate-history-far' if far else 'candidate-history')/report['region']/report['asset']/sha(target);history.mkdir(parents=True,exist_ok=True)
        for old in (target,target.with_suffix('.json')):
            if old.exists() and not (history/old.name).exists():shutil.copy2(old,history/old.name)
    report['promotedFrom']=evidence(args.report)
    report['processedCandidate']={**report['processedCandidate'],'path':str(target.resolve())}
    report['processingRevision']=state.get('processingRevision',0)
    report['status']='exported_pending_visual_review'
    # An isolated texture-only report may inherit a sheet from an older mesh.
    # Its actual five rendered views are authoritative; recompose their sheet.
    report.pop('reviewSheet',None)
    temporary=target.with_suffix('.glb.tmp');shutil.copy2(source,temporary);temporary.replace(target)
    atomic_json(target.with_suffix('.json'),report)
    subprocess.run([sys.executable,'-B',str(ART/'tools/make_review_sheet.py'),str(target.with_suffix('.json'))],cwd=str(ROOT),check=True)
    print(json.dumps({'candidate':report['processedCandidate'],'report':evidence(target.with_suffix('.json'))}))

if __name__=='__main__':main()

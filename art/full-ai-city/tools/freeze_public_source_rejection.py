"""Freeze an explicit public-building source diagnosis; never classify automatically."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, hashlib, json, shutil

ROOT=Path(__file__).resolve().parents[3]
ART=ROOT/'art/full-ai-city'

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def evidence(p):return {'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size}

def main():
    cli=argparse.ArgumentParser()
    for key in ['map','asset','source-sha256','finding']:cli.add_argument('--'+key,required=True)
    cli.add_argument('--reviewer',default='/root/outskirts')
    cli.add_argument('--rendered-source-view',action='append',choices=['raw-front.png','raw-iso.png','raw-right.png','raw-back.png','raw-left.png'],
                     help='Freeze only these actually inspected existing renderedSource views; no extra diagnostic render is implied')
    cli.add_argument('--decision',default='One independent same-reference seed. If repeated major defects remain, review three-view consistency before further inference; no automatic approval.')
    args=cli.parse_args()
    assert len(args.finding)>=100
    state=json.loads((ART/'queue'/args.map/(args.asset+'.json')).read_text('utf8'))
    revision=next(r for r in [state,*state.get('revisions',[])] if r.get('rawGLB',{}).get('sha256')==args.source_sha256)
    source=Path(revision['rawGLB']['path']);assert sha(source)==args.source_sha256
    directory=ART/'work/core-review'/args.map/args.asset/('raw-'+args.source_sha256[:16])
    candidate_path=ART/'candidates'/args.map/(args.asset+'.json')
    candidate=json.loads(candidate_path.read_text('utf8'))
    assert candidate['source']['rawGLB']['sha256']==args.source_sha256
    diagnostic=None
    if args.rendered_source_view:
        available={Path(p).name:Path(p) for p in candidate['renderedSource']['views']}
        images=[available[name] for name in dict.fromkeys(args.rendered_source_view)]
        assert images and all(p.is_file() for p in images)
    else:
        diagnostic=json.loads((directory/'source-inspection.json').read_text('utf8'))
        assert diagnostic['source']['sha256']==args.source_sha256
        images=[ART/'renders'/args.map/args.asset/name for name in ['raw-front.png','raw-iso.png']]
        images += [directory/name for name in ['raw-right.png','raw-back.png','raw-left.png','raw-close-back-iso.png','raw-grey-back-iso.png']]
    destination=ART/'reports/source-rejections'/args.map/args.asset/args.source_sha256[:16]
    destination.mkdir(parents=True,exist_ok=False)
    def preserve(path,name=None):
        path=Path(path);target=destination/(name or path.name)
        shutil.copyfile(path,target);assert sha(path)==sha(target)
        return evidence(target)
    report={
        'status':'rejected_native_export_source','region':args.map,'asset':args.asset,
        'reviewer':args.reviewer,'recordedAtUtc':datetime.now(timezone.utc).isoformat(),
        'source':evidence(source),'sourceLevel':'Native 1M export; no untouched decoder attribution is made.',
        'inferenceReport':preserve(revision['inferenceReport']['path']),
        'inputReference':preserve(revision['reference']['path'],'input-reference.json'),
        'diagnostic':preserve(directory/'source-inspection.json') if diagnostic else None,
        'diagnosticTool':diagnostic['tool'] if diagnostic else None,
        'sourceComparisonReport':preserve(candidate_path,'source-comparison-processing.json'),
        'sourceViewEvidenceMode':'Explicitly selected existing renderedSource views; no additional or neutral render implied' if args.rendered_source_view else 'Existing full source diagnostic and comparison views',
        'evidence':[preserve(p) for p in images],
        'finding':args.finding,
        'decision':args.decision,
        'sourceUnchanged':True,'notFinalCandidateReview':True,
    }
    tool=Path(__file__);snapshot=ART/'reports/tool-snapshots'/(sha(tool)+'-'+tool.name)
    if not snapshot.exists():shutil.copyfile(tool,snapshot)
    report['freezeTool']=evidence(snapshot)
    target=destination/'rejection.json';target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps(evidence(target),ensure_ascii=False))

if __name__=='__main__':main()

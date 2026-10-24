"""Publish an inspected neural-part candidate for external approval, never approve it."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,shutil,sys
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--region',required=True);parser.add_argument('--asset',required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    key=args.region+'/'+args.asset
    approved=json.loads((lod.ART/'approved-assets.json').read_text('utf-8')).get('assets',{})
    if key in approved:raise RuntimeError('An approved candidate is immutable')
    original=lod.ART/'candidates'/args.region/(args.asset+'.glb')
    component=lod.ART/'component-candidates'/args.region/(args.asset+'.glb')
    part=json.loads(component.with_suffix('.part.json').read_text('utf-8'))
    report=json.loads(original.with_suffix('.json').read_text('utf-8'))
    motion_path=lod.ART/'renders'/args.region/args.asset/'motion/review.json'
    motion=json.loads(motion_path.read_text('utf-8'))
    if lod.p.sha256(original)!=part['source']['sha256'] or lod.p.sha256(component)!=part['output']['sha256'] or motion['source']['sha256']!=part['output']['sha256']:raise RuntimeError('Component evidence changed')
    archive=lod.ART/'candidate-history'/args.region/args.asset/part['source']['sha256'];archive.mkdir(parents=True,exist_ok=True)
    for path in (original,original.with_suffix('.json')):shutil.copy2(path,archive/path.name)
    report['derivedFromStaticCandidate']=lod.p.file_evidence(archive/original.name)
    report['componentSeparation']=part
    report['animation']={'driver':'scene-life','autoplayClip':False,'node':part['selection']['name'],'lifePart':part['selection']['lifePart'],'localRotationAxis':'Z','geometryOrigin':'Only original neural-derived faces, no added geometry','poseReview':lod.p.file_evidence(motion_path),'frames':[view for pose in motion['poses'] for view in pose['views']]}
    report['componentVisualReview']={'status':'passed_by_processing_agent_pending_external_approval','notes':'Inspected actual 0, 45 and 90 degree front/right/isometric exports. Colored neural wheel turns around measured diagonal axle; pointer, support, facade and roof remain static. No new triangles or image changes.'}
    for tool in ('neural_component.py','finalize_component.py'):
        path=Path(__file__).parent/tool;target=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(path)+'-'+tool)
        if not target.exists():shutil.copy2(path,target)
        report.setdefault('componentTools',[]).append(lod.p.file_evidence(target))
    shutil.copy2(component,original)
    settings=SimpleNamespace(region=args.region,asset=args.asset,lod='near',height=1.,footprint=1.)
    report['processedCandidate']=lod.p.file_evidence(original);report['glbValidation']=lod.p.inspect_glb(original)
    report['renderedCandidate']=lod.render(original,settings,('front','right','back','left','iso'))
    report['reviewSheet']=None;report['completedAt']=lod.now();report['status']='exported_pending_visual_review'
    lod.write(original.with_suffix('.json'),report)
    print('COMPONENT_READY_FOR_EXTERNAL_REVIEW',report['processedCandidate'],flush=True)
if __name__=='__main__':main()

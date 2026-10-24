"""Remove the faulty legacy tangent normal bake on two locally repaired wheels.

Every image, geometry, UV and animation byte is retained, including the existing
mechanical repair. This intentionally does not claim a new color/UV transfer.
"""
from pathlib import Path
from types import SimpleNamespace
import sys,json,argparse,copy,shutil
sys.path.insert(0,str(Path(__file__).parent))
from neural_component import GLB
import process_lod as lod
import render_component

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--map',choices=['alpine','harbor'],required=True);cli.add_argument('--out',type=Path,required=True)
    args=cli.parse_args(sys.argv[sys.argv.index('--')+1:]);args.out=args.out.resolve()
    if args.out.exists():raise FileExistsError(args.out)
    key=args.map+'/chance_wheel';entry=json.loads((lod.ART/'approved-assets.json').read_text('utf8'))['assets'][key]
    source=lod.ROOT/entry['candidate']['path'];original_report=lod.ROOT/entry['processingReport']['path'];report=json.loads(original_report.read_text('utf8'))
    assert lod.p.sha256(source)==entry['candidate']['sha256'] and lod.p.sha256(original_report)==entry['processingReport']['sha256']
    g=GLB(source);before=copy.deepcopy(g.doc);blob=bytes(g.blob);changed=[]
    for i,mat in enumerate(g.doc['materials']):
        if mat.pop('normalTexture',None):changed.append(i)
    if not changed:raise ValueError('No legacy normalTexture to remove')
    args.out.mkdir(parents=True);out=args.out/'chance_wheel.glb';g.save(out);after=GLB(out)
    expected=copy.deepcopy(before)
    for mat in expected['materials']:mat.pop('normalTexture',None)
    assert after.doc==expected and bytes(after.blob)==blob
    report.pop('reviewSheet',None);report.pop('promotedFrom',None);report.pop('quantization',None)
    report['processingComplete']=False;report['status']='exported_pending_visual_review';report['processedCandidate']=lod.p.file_evidence(out)
    report['geometryAndMotionInheritedFrom']=entry['processingReport']
    report['shadingOnlyRefinement']={'sourceCandidate':entry['candidate'],'sourceProcessingReport':entry['processingReport'],'removedNormalTextureMaterials':changed,'allBinaryPayloadBytesUnchanged':True,'geometryUVImagesHierarchyAnimationUnchanged':True,'reason':'Preserve the inspected mechanical repair and original atlas; remove only the diagnosed noisy tangent-space normal bake. No new color sampling, image/model generation or extra reduction.'}
    report['bake']={'method':'Original reviewed base color and ORM bytes preserved; legacy rebaked normalTexture detached. Real geometry normals provide shading.','priorBake':report['bake']}
    tool=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(Path(__file__))+'-refresh_repaired_shading.py');shutil.copyfile(__file__,tool);report['processingTool']=lod.p.file_evidence(tool)
    source_dir=args.out/'source-review';source_dir.mkdir();report['renderedSource']['views']=[]
    for row in entry['sourceComparisonImages']:
        path=lod.ROOT/row['path'];assert lod.p.sha256(path)==row['sha256'];dest=source_dir/path.name;shutil.copy2(path,dest);report['renderedSource']['views'].append(str(dest))
    settings=SimpleNamespace(region=args.map,asset='chance_wheel',lod='near',height=1.,footprint=1.,render_directory=args.out/'renders')
    report['renderedCandidate']=lod.render(out,settings,('front','right','back','left','iso'))
    report['textureSizes']=report['renderedCandidate']['textureSizes']
    sys.argv=['render_component','--','--source',str(out),'--region',args.map,'--asset','chance_wheel','--output-directory',str(args.out/'motion')];render_component.main()
    motion_path=args.out/'motion/review.json';motion=json.loads(motion_path.read_text('utf8'))
    report['animation']['poseReview']=lod.p.file_evidence(motion_path);report['animation']['frames']=[path for pose in motion['poses'] for path in pose['views']]
    report['processingComplete']=True;report['completedAt']=lod.now();out.with_suffix('.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
    print('SHADING_REFINEMENT_READY',out,flush=True)
if __name__=='__main__':main()

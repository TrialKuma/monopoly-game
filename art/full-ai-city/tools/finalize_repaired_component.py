"""Stage a frozen, pose-reviewed mechanical repair for final candidate rendering."""
from pathlib import Path
import argparse,json,shutil,subprocess,sys
from prepare_triptych import ART,ROOT,evidence,sha,atomic_json
from cpu_blender_lease import cpu_blender_lease
from neural_component import GLB
from run_hybrid_queue import BLENDER

def main():
    cli=argparse.ArgumentParser();cli.add_argument('region');cli.add_argument('asset');cli.add_argument('--receipt',type=Path,required=True);args=cli.parse_args()
    key=args.region+'/'+args.asset
    if key in json.loads((ART/'approved-assets.json').read_text('utf8'))['assets']:raise ValueError('Approved model is immutable')
    r=json.loads(args.receipt.read_text('utf8'));model=Path(r['output']['path'])
    assert sha(model)==r['output']['sha256']
    assert sha(ART/'candidates'/args.region/(args.asset+'.glb'))==r['source']['sha256']
    node=next(n for n in GLB(model).doc['nodes'] if n.get('extras',{}).get('lifePart'))
    target=ART/'component-candidates'/args.region/(args.asset+'.glb');target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists() and sha(target)!=r['output']['sha256']:
        old=ART/'candidate-history'/args.region/args.asset/sha(target);old.mkdir(parents=True,exist_ok=True);shutil.copy2(target,old/'component.glb')
        if target.with_suffix('.part.json').exists():shutil.copy2(target.with_suffix('.part.json'),old/'component.part.json')
    shutil.copy2(model,target)
    part={'source':r['source'],'output':evidence(target),'staticTriangles':r['staticTriangles'],'movingTriangles':r['movingOriginalOrRetriangulatedTriangles']+r['addedCapTriangles'],'originalTriangles':r['sourceTriangles'],'finalTriangles':r['staticTriangles']+r['movingOriginalOrRetriangulatedTriangles']+r['addedCapTriangles'],'newFacesAdded':r['addedCapTriangles'],'splitSourceTriangles':r['splitSourceTriangles'],'originalVerticesMoved':r['originalVerticesMoved'],'embeddedImageHashesUnchanged':r['embeddedImageHashesUnchanged'],'originalMaterialUnchanged':r['originalMaterialUnchanged'],'selection':{'name':node['name'],'lifePart':'wheel','shape':'measured_inner_disk_precise_clipping_and_boundary_closure','center':r['center'],'axis':r['axis'],'radius':r['radius'],'depth':r['depth'],'reviewNotes':r['visualReview'].get('notes',r['visualReview'].get('note'))},'driver':'scene-life; local Z rotation; no autoplay GLTF clip','localRepair':evidence(args.receipt),'verification':r['verification'],'tool':r['tool'],'status':'geometry_verified_and_actual_poses_reviewed_pending_external_final_approval'}
    atomic_json(target.with_suffix('.part.json'),part)
    pose_link=r.get('motionReview',r.get('poseReview'));pose_path=Path(pose_link['path']);assert sha(pose_path)==pose_link['sha256']
    motion=json.loads(pose_path.read_text('utf8'));assert motion['source']['sha256']==r['output']['sha256']
    dest=ART/'renders'/args.region/args.asset/'motion';dest.mkdir(parents=True,exist_ok=True)
    for pose in motion['poses']:
        views=[]
        for name in pose['views']:
            source=Path(name);out=dest/source.name;shutil.copy2(source,out);assert sha(source)==sha(out);views.append(str(out))
        pose['views']=views
    motion['source']=evidence(target);motion['frozenOriginalPoseReview']=evidence(pose_path);atomic_json(dest/'review.json',motion)
    with cpu_blender_lease(ART,4.5),(ART/'logs'/('finalize-'+args.region+'--'+args.asset+'-'+r['output']['sha256'][:12]+'.log')).open('w',encoding='utf8') as log:
        subprocess.run([str(BLENDER),'--background','--threads','4','--python-exit-code','1','--python',str(ART/'tools/finalize_component.py'),'--','--region',args.region,'--asset',args.asset],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
    final=ART/'candidates'/args.region/(args.asset+'.json')
    subprocess.run([sys.executable,'-B',str(ART/'tools/make_review_sheet.py'),str(final)],cwd=ROOT,check=True)
    print(json.dumps({'status':'pending_external_visual_review','candidate':evidence(final.with_suffix('.glb')),'report':evidence(final)}),flush=True)

if __name__=='__main__':main()

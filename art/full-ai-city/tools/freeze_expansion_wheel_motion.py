"""Freeze actual reviewed neural rotor, original static input and nine poses."""
from pathlib import Path
import json,hashlib,shutil,subprocess,sys
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
WORK=ART/'work/expansion-wheel-separation/exact-v01'
DEST=ART/'reports/mechanical-repairs/expansion/chance_wheel/63b83a39c30792e8'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def record(p):return {'path':str(p.resolve()),'sha256':sha(p),'bytes':p.stat().st_size}
def preserve(path,name):
    path=Path(path);out=DEST/name;out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists():assert sha(out)==sha(path)
    else:shutil.copyfile(path,out)
    return record(out)
def tool(path):
    path=Path(path);out=ART/'reports/tool-snapshots'/(sha(path)+'-'+path.name)
    if not out.exists():shutil.copyfile(path,out)
    return record(out)
def write(path,data):
    assert not path.exists(),'Refuse to alter immutable evidence'
    path.write_text(json.dumps(data,indent=2)+'\n','utf8');return record(path)
def main():
    r=json.loads((WORK/'repair-v01.json').read_text('utf8'))
    assert r['source']['sha256']=='d8eabe9e2c5f4ad306eb7b9845983935fa4b1e98f53c5efdc909e22d131877d7'
    assert r['output']['sha256']=='63b83a39c30792e8817d8a68d8bd8555b8d3d752f466d993d1a12396e72c067b'
    assert sha(r['source']['path'])==r['source']['sha256'] and sha(r['output']['path'])==r['output']['sha256']
    r['initialReceipt']=preserve(WORK/'repair-v01.json','original-cut-report.json')
    r['source']=preserve(r['source']['path'],'source-static-d8eabe9e.glb')
    r['sourceProcessingReport']=preserve(ART/'candidates/expansion/chance_wheel.json','source-processing.json')
    r['output']=preserve(r['output']['path'],'repaired-wheel.glb')
    r['tool']=tool(ART/'tools/repair_expansion_wheel_boundary.py')
    r['measurement']=preserve(WORK.parent/'measurement.json','measurement.json')
    r['axisFit']=preserve(WORK.parent/'axis-fit.json','axis-fit.json')
    r['measurementView']=preserve(WORK.parent/'measurement-front.png','measurement-front.png')
    r['measurementTool']=tool(ART/'tools/measure_expansion_wheel.py')
    r['measurementPlotTool']=tool(WORK.parent/'plot_measurement.py')
    r['pointerExclusion']={'localMin':[-.040,.102,.002],'localMax':[.040,.205,.09],'scope':'Keep the actual original pointed marker above the disc stationary; retain original colored plate below it.'}
    r['status']='mechanical_boundary_review_passed_pending_final_static_views'
    r['visualReview']={'status':'passed_by_repair_agent_pending_final_static_views','notes':'Individually inspected all nine actual0/45/90-degree front/right/isometric frames. Original painted inner disc and original hub rotate completely; bronze outer case, pointer, pedestal and whole building remain stationary. No fragments, moving wall, stretched support or opened rotor gap is visible. Original source material/texture pixels remain unchanged;408 new internal boundary/back closure faces are explicitly a local mechanical repair, not an authored replacement disc. The prior left lintel/copper-edge source repair is unchanged and its small inherited seams remain disclosed in the static source review. Formal final5-view and SHA-bound source comparison review is still required.'}
    motion=json.loads((WORK/'motion/review.json').read_text('utf8'))
    motion['originalReceipt']=preserve(WORK/'motion/review.json','motion/original-review.json');motion['source']=r['output']
    for pose in motion['poses']:pose['views']=[preserve(p,'motion/'+Path(p).name)['path'] for p in pose['views']]
    motion['tool']=tool(ART/'tools/render_component.py')
    r['motionReview']=write(DEST/'motion/review.json',motion)
    before=write(DEST/'repair-before-verification.json',r)
    check=DEST/'verification-original.json'
    subprocess.run([sys.executable,str(ART/'tools/verify_wheel_boundary.py'),'--repair',before['path'],'--output',str(check)],check=True,stdout=subprocess.DEVNULL,cwd=ROOT)
    verification=json.loads(check.read_text('utf8'));verification['originalVerification']=record(check);verification['tool']=tool(ART/'tools/verify_wheel_boundary.py')
    r['verification']=write(DEST/'verification-frozen.json',verification)
    r['freezeTool']=tool(Path(__file__))
    print(json.dumps(write(DEST/'repair-report-final.json',r),ensure_ascii=False))
if __name__=='__main__':main()

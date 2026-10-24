"""Freeze reviewed source repair proof; final low-poly asset remains unapproved."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
WORK=ART/'work/repair-teleport-v5';DEST=ART/'reports/local-repairs/classic/teleport_gate/359f583f3bdd889e'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def record(p):return {'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size}
def copy(path,name):
    path=Path(path);out=DEST/name;out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists():assert sha(out)==sha(path)
    else:shutil.copyfile(path,out)
    return record(out)
def tool(path):
    path=Path(path);out=ART/'reports/tool-snapshots'/(sha(path)+'-'+path.name)
    if not out.exists():shutil.copyfile(path,out)
    return record(out)
def main():
    r=json.loads((WORK/'repair.json').read_text('utf8'))
    assert r['nativeOutput']['sha256']=='359f583f3bdd889e4ec96f9d475727f5f398b865c204b2b00ff805f5c5107908'
    assert sha(Path(r['nativeOutput']['path']))==r['nativeOutput']['sha256']
    assert r['originalTrianglesDeleted']==0 and r['originalVerticesMoved']==0 and r['newTriangles']==16796
    r['originalRepairReport']=copy(WORK/'repair.json','source-repair-report.json')
    r['reviewImages']=[copy(i['path'],'views/'+Path(i['path']).name) for i in r['reviewImages']]
    r['renders']['views']=[str(ROOT/i['path']) for i in r['reviewImages']]
    r['diagnosticImages']=[copy(WORK/'gray'/('gray-'+view+'.png'),'gray/gray-'+view+'.png') for view in ['front','back']]
    r['diagnosticTool']=tool(ART/'tools/render_repair_gray.py')
    r['diagnosticReceipt']=copy(WORK/'gray/inspection.json','gray/inspection.json')
    r['pixelRayDiagnostics']=[copy(ART/'work/public-diagnostic'/name,'measurements/'+name) for name in ['teleport-v4-vs-bc6f-rays.json','teleport-v5-vs-v4fine-rays.json']]
    r['pixelRayDiagnosticTools']=[tool(ART/'work/public-diagnostic'/name) for name in ['probe_teleport_v4.py','probe_teleport_v5.py']]
    verification=json.loads((WORK/'preservation.json').read_text('utf8'))
    assert verification['originalTrianglesCompared']==997896 and verification['addedTriangles']==16796
    assert verification['maxAbsoluteError']=={'POSITION':0.0,'TEXCOORD_0':0.0}
    verification['originalMeasurement']=copy(WORK/'preservation.json','preservation-original.json')
    verification['tool']=tool(ART/'tools/verify_local_repair_preservation.py')
    proof=DEST/'preservation.json';assert not proof.exists()
    proof.write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n','utf8')
    r['sourcePreservation']=record(proof)
    r['status']='source_repair_visually_reviewed_pending_near_lod'
    r['visualReview']={'status':'source_repair_ready_for_derivation','reviewer':'/root/outskirts','recordedAtUtc':datetime.now(timezone.utc).isoformat(),'views':['front','right','back','left','iso','neutral-front','neutral-back'],'notes':'Individually inspected all five source color views and 1024px neutral front/back. Compared with v4, the measured omitted inner arch-shoulder openings are closed; pixel rays now hit the intended front or back side instead of traversing to the opposite surface. This changes only the inner extent of four existing bounded arch patches to +/-0.135; the four side-roof and two rear molding/plinth patches remain the same. Short stair-like thin dark seams at arch ends and a small original rear window-top nick remain visible in neutral views and are disclosed. At512px color scale the frame is continuous and readable. Proceed to0.0015voxel/30k derivation; enlarged seams or lost window panes must be rejected in its separate final review. No runtime approval is granted by this source receipt.'}
    r['runtimeApproved']=False;r['freezeTool']=tool(Path(__file__))
    target=DEST/'repair.json';assert not target.exists()
    target.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n','utf8');print(json.dumps(record(target),ensure_ascii=False))
if __name__=='__main__':main()

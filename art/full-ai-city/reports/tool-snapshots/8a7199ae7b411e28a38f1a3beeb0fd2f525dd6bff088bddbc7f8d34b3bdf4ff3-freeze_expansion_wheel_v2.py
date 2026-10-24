"""Freeze reviewed local source repair evidence, without approving runtime."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
WORK=ART/'work/repair-expansion-wheel-v2'
DEST=ART/'reports/local-repairs/expansion/chance_wheel/5b62a9340c33b44a'
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
    assert r['nativeOutput']['sha256']=='5b62a9340c33b44a9c0fde68827bb5af831830e8cc651578bdfbc597705212b9'
    assert sha(Path(r['nativeOutput']['path']))==r['nativeOutput']['sha256']
    assert r['originalTrianglesDeleted']==2777 and r['newTriangles']==3700
    r['originalRepairReport']=copy(WORK/'repair.json','source-repair-report.json')
    r['reviewImages']=[copy(i['path'],'views/'+Path(i['path']).name) for i in r['reviewImages']]
    r['renders']['views']=[str(ROOT/i['path']) for i in r['reviewImages']]
    r['diagnosticImages']=[copy(WORK/'gray/gray-left.png','gray/gray-left.png')]
    r['diagnosticTool']=tool(ART/'tools/render_repair_gray.py')
    r['diagnosticReceipt']=copy(WORK/'gray/inspection.json','gray/inspection.json')
    r['pixelRayDiagnostic']=copy(ART/'work/public-diagnostic/expansion-wheel-remaining-rays.json','before/remaining-rays.json')
    r['pixelRayDiagnosticTool']=tool(ART/'work/public-diagnostic/probe_expansion_remaining.py')
    r['sourceBeforeRepairGray']=copy(ART/'work/expansion-wheel-final-gray/repaired-source-grey-left.png','before/source-grey-left.png')
    verification=json.loads((WORK/'preservation.json').read_text('utf8'))
    assert verification['originalTrianglesDeleted']==2777 and verification['survivingTrianglesExact']==952909
    assert verification['removedRegionCounts']=={'extraneousDiscBacking':2527,'foldedLintel':250}
    verification['originalMeasurement']=copy(WORK/'preservation.json','preservation-original.json')
    verification['tool']=tool(ART/'tools/verify_expansion_wheel_v2_preservation.py')
    proof=DEST/'preservation.json';assert not proof.exists()
    proof.write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n','utf8')
    r['sourcePreservation']=record(proof)
    r['status']='source_repair_visually_reviewed_pending_near_lod_and_motion'
    r['visualReview']={'status':'source_repair_ready_for_derivation','reviewer':'/root/outskirts','recordedAtUtc':datetime.now(timezone.utc).isoformat(),'views':['front','right','back','left','iso','neutral-left'],'notes':'Individually inspected all five source color views and 1024px neutral left. The upper copper crack is filled and the left window-top infill now follows the outer brick depth, eliminating the earlier recessed patch. Narrow pre-existing and patch-boundary seams remain around the window head; no claim of a flawless manufactured wall. The original colored wheel and pedestal remain unchanged. Proceed to near derivation and actual wheel-only motion review; reopening or enlarging a source seam in the derivative is not acceptable and must be rechecked.'}
    r['runtimeApproved']=False;r['freezeTool']=tool(Path(__file__))
    target=DEST/'repair.json';assert not target.exists()
    target.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps(record(target),ensure_ascii=False))
if __name__=='__main__':main()

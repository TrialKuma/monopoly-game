"""Freeze independently reviewed roof repair evidence, without approving runtime."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
WORK=ART/'work/alpine-workshop-roof-v2/repair'
DEST=ART/'reports/local-repairs/alpine/builders_guild/edeb9fecf18db92dc'
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
    assert r['nativeOutput']['sha256']=='edeb9fecf18db92dcd5e2be77f6e707d786ac9180bf6af656fe7bc4dfaef9d07'
    assert sha(Path(r['nativeOutput']['path']))==r['nativeOutput']['sha256']
    assert r['originalTrianglesDeleted']==800 and r['newTriangles']==6336
    original=copy(WORK/'repair.json','source-repair-report.json')
    r['reviewImages']=[copy(i['path'],'views/'+Path(i['path']).name) for i in r['reviewImages']]
    r['renders']['views']=[str(ROOT/i['path']) for i in r['reviewImages']]
    r['diagnosticImages']=[copy(WORK/'gray'/n,'gray/'+n) for n in ['gray-right.png','gray-iso.png']]
    r['diagnosticTool']=tool(ART/'tools/render_alpine_workshop_roof_v2_gray.py')
    r['diagnosticReceipt']=copy(WORK/'gray/inspection.json','gray/inspection.json')
    before=ART/'work/alpine-workshop-roof-v2'
    r['sourceBeforeRepairGray']=copy(before/'source-grey-right.png','before/source-grey-right.png')
    r['pixelRayDiagnostic']=copy(before/'diagnostic.json','before/diagnostic.json')
    r['pixelRayDiagnosticTool']=tool(ART/'tools/diagnose_alpine_workshop_roof_v2.py')
    verification=json.loads((WORK/'preservation.json').read_text('utf8'))
    assert verification['originalTrianglesDeleted']==800 and verification['survivingTrianglesExact']==979616
    original_verification=copy(WORK/'preservation.json','preservation-original.json')
    verification['tool']=tool(ART/'tools/verify_workshop_roof_v2_preservation.py')
    verification['originalMeasurement']=original_verification
    proof=DEST/'preservation.json';proof.write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n','utf8')
    r['sourcePreservation']=record(proof)
    r['originalRepairReport']=original
    r['visualReview']={'status':'source_repair_ready_for_derivation','reviewer':'/root/outskirts','recordedAtUtc':datetime.now(timezone.utc).isoformat(),'notes':'Independently inspected all five source color views and neutral right/iso. Upper-center and lower-eave openings are restored. A small top-patch lower crease remains as a short thin seam and irregular tile in the 512px color view. Do not enlarge the repair now. Proceed to low-poly derivation, whose actual final images still require separate approval; a reopened or enlarged crack in the 30k derivative must be rejected.'}
    r['runtimeApproved']=False
    r['freezeTool']=tool(Path(__file__))
    target=DEST/'repair.json';assert not target.exists(),'Do not rewrite an immutable repair receipt'
    target.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n','utf8')
    print(json.dumps(record(target),ensure_ascii=False))
if __name__=='__main__':main()

"""Copy reviewed local-repair evidence byte for byte without changing old receipts."""
from pathlib import Path
import argparse,hashlib,json,shutil
from datetime import datetime,timezone

ROOT=Path(__file__).resolve().parents[3]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def record(p):return {'path':p.resolve().relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size}
def main():
    p=argparse.ArgumentParser();p.add_argument('--receipt',type=Path,required=True);p.add_argument('--diagnostic',action='append',default=[]);p.add_argument('--measurement',action='append',default=[]);a=p.parse_args()
    receipt=a.receipt.resolve();r=json.loads(receipt.read_text('utf-8'));directory=receipt.parent/'preserved-evidence';directory.mkdir(parents=True,exist_ok=True)
    copied=[]
    def preserve(source,kind,expected=None):
        source=Path(source).resolve();before=record(source)
        if expected and before['sha256']!=expected:raise ValueError('Evidence changed since actual review: '+str(source))
        target=directory/kind/(before['sha256'][:16]+'-'+source.name);target.parent.mkdir(parents=True,exist_ok=True)
        if target.exists():
            if sha(target)!=before['sha256']:raise ValueError('Refuse to replace immutable evidence')
        else:shutil.copyfile(source,target)
        after=record(target)
        if before['sha256']!=after['sha256']:raise ValueError('Evidence bytes changed while preserving')
        copied.append({'kind':kind,'original':before,'preserved':after})
    for item in r['reviewImages']:preserve(item['path'],'review-images',item['sha256'])
    for path in a.diagnostic:preserve(path,'diagnostics')
    for path in a.measurement:preserve(path,'measurements')
    preserve(r['processingTool']['path'],'tools',r['processingTool']['sha256']);preserve(__file__,'tools')
    report={'schemaVersion':1,'status':'review_evidence_preserved_byte_identically','createdAtUtc':datetime.now(timezone.utc).isoformat(),'repairReceipt':record(receipt),'nativeOutput':r['nativeOutput'],'originalReceiptUnmodified':True,'imagePixelsAndBytesUnchanged':True,'preserved':copied,'scope':'Preserves already inspected repair evidence. This is not approval of the subsequent reduced/runtime candidate.'}
    data=(json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode();target=receipt.parent/('evidence-preservation-'+hashlib.sha256(data).hexdigest()[:16]+'.json');target.write_bytes(data);print(json.dumps(record(target),ensure_ascii=False))
if __name__=='__main__':main()

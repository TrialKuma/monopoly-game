"""Freeze reviewed harbor UV-transfer evidence without changing model pixels."""
from pathlib import Path
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
WORK=ART/'work/harbor-villa2-nativeuv1024'
DEST=ART/'reports/texture-transfers/harbor/villa_2/9edbb3489ce0c5aed'
DEST.mkdir(parents=True,exist_ok=True)

def local(path):
 path=Path(path);return path if path.is_absolute() else ROOT/path
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def evidence(path):return {'path':path.resolve().relative_to(ROOT).as_posix(),'sha256':sha(path),'bytes':path.stat().st_size}
def checked(row):
 path=local(row['path']);assert sha(path)==row['sha256'];return path
def save(path,data):
 if path.exists():assert path.read_bytes()==data,'Frozen evidence would change: '+str(path)
 else:path.write_bytes(data)
def freeze_file(path,target):
 save(target,path.read_bytes());return evidence(target)
def snapshot(path):
 return freeze_file(path,ART/'reports/tool-snapshots'/(sha(path)+'-'+path.name))

source=WORK/'harbor/villa_2.json';report=json.loads(source.read_text('utf8'))
model=checked(report['processedCandidate'])
assert sha(model)=='9edbb3489ce0c5aed37e0d27901191e860f3cc88dc5553848abc599e42d351b7'
uv_receipt_path=checked(report['textureOnlyReprocessing']['nativeUVReceipt'])
uv_receipt=json.loads(uv_receipt_path.read_text('utf8'))
frozen_prior=checked(uv_receipt['sourceProcessingReport'])
assert sha(frozen_prior)==report['textureOnlyReprocessing']['sourceProcessingReport']['sha256']
report['textureOnlyReprocessing']['sourceProcessingReport']=evidence(frozen_prior)
for key in ('processingTool','textureTransferTool'):
 checked(report[key])

audit_path=WORK/'quality-audit.json';audit=json.loads(audit_path.read_text('utf8'))
prior=checked(audit['priorSourceColorDiagnostic'])
audit['priorSourceColorDiagnostic']=freeze_file(prior,DEST/'source-roof-diagnostic.json')
for row in audit['actualPhoneFrames']['views']:
 original=checked(row);row.update(freeze_file(original,DEST/original.name))
original=checked(audit['actualCloseFrame']);audit['actualCloseFrame']=freeze_file(original,DEST/original.name)
audit['processingTool']=snapshot(WORK/'audit_native_uv.py')
audit['visualDecision']={'status':'accepted_with_disclosed_native_limits','reviewer':'progression_design','rootIndependentFiveViewReview':'confirmed in parent agent message after actual five views','reviewedCandidateSha256':sha(model),'actualViewsInspected':['front','right','back','left','iso','phone-front','phone-back','phone-iso','close-iso'],'finding':'Roof cream flecks and large wall smears are gone. Cream walls, blue roof, shutters, balcony and two stories remain readable at actual 256-pixel render size. Original small doorknocker/lower-window gaps and original two-chimney variation remain visible in close view and are disclosed; no new geometry was authored.'}
audit_data=(json.dumps(audit,ensure_ascii=False,indent=2)+'\n').encode('utf8')
audit_target=DEST/(hashlib.sha256(audit_data).hexdigest()+'-quality-audit.json');save(audit_target,audit_data)
report['textureOnlyReprocessing']['qualityAudit']=evidence(audit_target)
report['evidenceFinalization']={'tool':snapshot(Path(__file__)),'sourceReportSha256':sha(source),'candidateBytesChanged':False,'texturePixelsChanged':False,'note':'Source-processing link uses the byte-identical GPU replay frozen report. CPU transfer tool retains the actual executed snapshot. Only evidence paths and QA receipts change in this new report.'}
data=(json.dumps(report,ensure_ascii=False,indent=2)+'\n').encode('utf8')
target=DEST/(hashlib.sha256(data).hexdigest()+'-villa_2.json');save(target,data)
assert sha(model)==report['processedCandidate']['sha256']
index={'candidate':evidence(model),'processingReport':evidence(target),'qualityAudit':evidence(audit_target),'nativeUVReceipt':evidence(uv_receipt_path),'modelAndImageBytesUnchanged':True}
save(DEST/'handoff-v2.json',(json.dumps(index,ensure_ascii=False,indent=2)+'\n').encode('utf8'))
print(json.dumps(index,ensure_ascii=False,indent=2))

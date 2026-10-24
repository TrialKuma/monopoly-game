"""Explicitly register a completed repaired low surface, never infer repairs."""
from pathlib import Path
import argparse,json
from prepare_triptych import ART,ROOT,atomic_json,evidence,sha
from run_hybrid_queue import now

def read(path):return json.loads(Path(path).read_text('utf-8'))
def local(path):
    path=Path(path);return path if path.is_absolute() else ROOT/path

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('report',type=Path)
    cli.add_argument('--existing-request',type=Path)
    args=cli.parse_args()
    report=read(args.report);key=report['region']+'/'+report['asset']
    if key in read(ART/'approved-assets.json').get('assets',{}):raise ValueError('Approved candidate is immutable')
    repair=report.get('localSurfaceRepair')
    if not repair or not report.get('processingComplete'):raise ValueError('Completed explicit repaired low surface required')
    for row in (report['processedCandidate'],repair['source'],repair['receipt']):
        if sha(local(row['path']))!=row['sha256']:raise ValueError('Repair or candidate identity changed')
    state_path=ART/'queue'/report['region']/(report['asset']+'.json');state=read(state_path)
    raw_sha=state['rawGLB']['sha256']
    if raw_sha!=report['source']['rawGLB']['sha256']:raise ValueError('Original inference source was superseded')
    receipt=read(local(repair['receipt']['path']))
    if receipt['source']['sha256']!=raw_sha or receipt['nativeOutput']['sha256']!=repair['source']['sha256']:raise ValueError('Explicit repair does not link original to actual input')
    capture=read(local(state['inferenceReport']['path']))['native_mobile_export_receipt']
    if sha(local(capture['path']))!=capture['sha256'] or read(local(capture['path']))['rawGLB']['sha256']!=raw_sha:raise ValueError('Same-inference field required')
    # The same reviewed repair can yield controlled voxel/triangle experiments.
    # Every distinct low surface needs its own immutable field replay identity.
    identity=report['region']+'--'+report['asset']+'-'+raw_sha[:12]+'-repair-'+repair['source']['sha256'][:12]+'-low-'+report['processedCandidate']['sha256'][:10]+'-field-v1'
    work=ART/'work/hybrid-batch'/identity
    path=ART/'hybrid-queue/jobs'/(identity+'.json')
    if path.exists():raise FileExistsError('Repair job already registered')
    surface=work/'surface.npz';request_path=ART/'queue/native-export-replays'/(identity+'.json');status='ready_to_prepare'
    if args.existing_request:
        request_path=args.existing_request.resolve();request=read(request_path)
        if request['status'] not in ('requested','running','completed_pending_visual_review'):raise ValueError('Existing replay is not usable')
        if local(request['sourceReceipt']).resolve()!=local(capture['path']).resolve():raise ValueError('Existing request uses another field')
        surface=local(request['surfaceNPZ']);proof=read(surface.with_suffix('.json'))
        if proof['candidate']['sha256']!=report['processedCandidate']['sha256'] or proof['localSurfaceRepair']['source']['sha256']!=repair['source']['sha256']:raise ValueError('Existing replay is not the same repaired low surface')
        status='waiting_native_export'
    job={'status':status,'identity':identity,'key':key,'createdAt':now(),'statePath':str(state_path),
         'candidateReportPath':str(args.report.resolve()),'originalCandidateSha256':report['processedCandidate']['sha256'],
         'rawSha256':raw_sha,'fieldReceiptPath':str(local(capture['path'])),'surfacePath':str(surface),
         'outputRoot':str(work/'candidates'),'requestPath':str(request_path),'requestedTriangles':report['requestedTriangles'],
         'recordedRepair':repair,'explicitRepairRegistration':evidence(args.report)}
    atomic_json(path,job);print(identity,status)

if __name__=='__main__':main()

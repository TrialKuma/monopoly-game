"""Reviewed older neural repairs: CPU low -> native UV-only -> original PBR.

No original field exists for these early jobs. This route never claims one and
never starts a new neural inference. GPU UV requests share the existing lock.
"""
from pathlib import Path
import argparse,json,subprocess,sys,time,msvcrt
import psutil
from prepare_triptych import ART,ROOT,atomic_json,evidence,sha
from cpu_blender_lease import cpu_blender_lease
from run_hybrid_queue import BLENDER,now

FOLDER=ART/'legacy-repair-queue'
def read(path):return json.loads(Path(path).read_text('utf8'))
def local(path):
    path=Path(path);return path if path.is_absolute() else ROOT/path
def blender(script,*args):return [str(BLENDER),'--background','--threads','4','--python-exit-code','1','--python',str(ART/'tools'/script),'--',*map(str,args)]
def child(job,path,stage,command,min_ram):
    log=ART/'logs'/('legacy-'+path.stem+'-'+stage+'.log');job.update(status='running',runningStage=stage,log=str(log),command=command)
    with cpu_blender_lease(ART,min_ram),log.open('w',encoding='utf8') as handle:
        proc=subprocess.Popen(command,cwd=ROOT,stdout=handle,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));job['pid']=proc.pid;atomic_json(path,job);code=proc.wait()
    job.pop('pid',None);job['exitCode']=code
    if code:raise RuntimeError(stage+' failed; inspect '+str(log))

def advance(path,job):
    if job['status'] not in ('requested','waiting_native_uv'):return False
    key=job['region']+'/'+job['asset']
    if key in read(ART/'approved-assets.json').get('assets',{}):job.update(status='skipped_already_approved');atomic_json(path,job);return True
    state_path=ART/'queue'/job['region']/(job['asset']+'.json');state=read(state_path);receipt_path=local(job['repairReceipt']['path']);source=local(job['repairedSource']['path'])
    if sha(source)!=job['repairedSource']['sha256'] or sha(receipt_path)!=job['repairReceipt']['sha256']:raise ValueError('Repair input identity changed')
    repair=read(receipt_path)
    if repair['source']['sha256']!=state['rawGLB']['sha256'] or repair['nativeOutput']['sha256']!=job['repairedSource']['sha256']:raise ValueError('Repair and original inference differ')
    if read(local(state['inferenceReport']['path'])).get('native_mobile_export_receipt'):raise ValueError('Use field route for a captured field; this controller is explicitly for older fieldless sources')
    work=ART/'work'/('legacy-repair-'+path.stem);work.mkdir(parents=True,exist_ok=True);out=work/'low';report=out/job['region']/(job['asset']+'.json');uv_input=work/'native-uv-input.npz';request_path=ART/'queue/native-export-replays'/('legacy-'+path.stem+'.json')
    if job['status']=='requested':
        if report.exists():raise FileExistsError('Preserve existing low trial and inspect before retrying')
        child(job,path,'low',blender('process_lod.py','--state',state_path,'--triangles',job.get('triangles',30000),'--voxel-size',job.get('voxelSize',.003),'--texture-size',1024,'--lod','near','--repaired-source',source,'--repair-report',receipt_path,'--nearest-texture','--uv-angle',66,'--output-root',out),9)
        row=read(report)
        if not row.get('processingComplete'):raise ValueError('Incomplete actual low export')
        supplements=[]
        for extra in receipt_path.parent.glob('evidence-preservation-*.json'):supplements.append(evidence(extra))
        row['localSurfaceRepairEvidencePreservation']=supplements;row['legacyOriginalTextureRoute']={'capturedNeuralFieldAvailable':False,'newNeuralInference':False,'method':'Source-derived low geometry, native UV-only charts, then original repaired-source PBR transfer. Original field was not captured for this earlier inference.'};atomic_json(report,row)
        blend=out/'blender'/job['region']/(job['asset']+'.blend')
        child(job,path,'uv-input',blender('export_neural_uv_input.py','--report',report,'--blend',blend,'--sha256',row['processedCandidate']['sha256'],'--output',uv_input),4.5)
        if request_path.exists():raise FileExistsError('Preserve existing GPU UV request')
        atomic_json(request_path,{'status':'requested','operation':'native_uv_only','surfaceNPZ':str(uv_input),'purpose':'Older actual native-MV source with recorded bounded local repair. Native UV charts only; original repaired-source image transfer follows on CPU. No captured field or new neural inference.'})
        job.update(status='waiting_native_uv',lowReport=evidence(report),requestPath=str(request_path),sourceRawSha256=state['rawGLB']['sha256']);atomic_json(path,job);print('LEGACY_UV_REQUESTED',key,flush=True);return True
    request=read(request_path)
    if request['status']!='completed_pending_texture_transfer':return False
    if sha(local(request['receipt']['path']))!=request['receipt']['sha256']:raise ValueError('Native UV receipt changed')
    row=read(report);blend=out/'blender'/job['region']/(job['asset']+'.blend');final_root=work/'final'
    child(job,path,'original-texture',blender('bake_native_uv_candidate.py','--report',report,'--blend',blend,'--sha256',row['processedCandidate']['sha256'],'--uv-receipt',local(request['receipt']['path']),'--output-root',final_root,'--texture-size',1024),8)
    final_report=final_root/job['region']/(job['asset']+'.json');result=read(final_report)
    if not result.get('processingComplete') or sha(local(result['processedCandidate']['path']))!=result['processedCandidate']['sha256']:raise ValueError('Final output incomplete')
    subprocess.run([sys.executable,'-B',str(ART/'tools/promote_processed_candidate.py'),str(final_report)],cwd=ROOT,check=True)
    job.update(status='pending_visual_review',finalCandidate=result['processedCandidate'],finalReport=evidence(final_report),completedAt=now());atomic_json(path,job);print('LEGACY_REPAIR_REVIEW_READY',key,result['processedCandidate']['sha256'],flush=True);return True

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--watch',action='store_true');args=cli.parse_args();(FOLDER/'jobs').mkdir(parents=True,exist_ok=True)
    handle=(FOLDER/'controller.lock').open('a+b');handle.seek(0);handle.write(b'0');handle.flush();handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
    while not (FOLDER/'stop-after-current').exists():
        paths=list((FOLDER/'jobs').glob('*.json'));paths.sort(key=lambda p:(read(p)['status']!='waiting_native_uv',p.name));counts={};progressed=False
        for path in paths:
            job=read(path)
            if job['status']=='running' and not psutil.pid_exists(job.get('pid',-1)):job.update(status='interrupted_needs_review');atomic_json(path,job)
            counts[job['status']]=counts.get(job['status'],0)+1
            try:
                if not progressed and advance(path,job):progressed=True
            except Exception as exc:job.update(status='failed_needs_review',error=repr(exc));atomic_json(path,job);print('LEGACY_REPAIR_FAILURE',path.stem,repr(exc),flush=True)
        atomic_json(FOLDER/'summary.json',{'updatedAt':now(),'counts':counts,'automaticApproval':False})
        if not args.watch and not progressed:break
        if not progressed:time.sleep(10)
    msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1);handle.close()

if __name__=='__main__':main()

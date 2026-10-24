"""Exact approved-near far surfaces -> native UV charts -> near PBR transfer."""
from pathlib import Path
import argparse,json,subprocess,sys,time,shutil,msvcrt,psutil
from prepare_triptych import ART,ROOT,atomic_json,evidence,sha
from cpu_blender_lease import cpu_blender_lease
from run_hybrid_queue import BLENDER,now

FOLDER=ART/'far-uv-queue'
def read(path):return json.loads(Path(path).read_text('utf8'))
def local(path):
    path=Path(path);return path if path.is_absolute() else ROOT/path
def blender(script,*args):return [str(BLENDER),'--background','--threads','4','--python-exit-code','1','--python',str(ART/'tools'/script),'--',*map(str,args)]

def child(path,job,phase,command):
    log=ART/'logs'/('far-uv-'+path.stem+'-'+phase+'.log')
    job.update(status='running',phase=phase,command=command,log=str(log))
    with cpu_blender_lease(ART,4.5),log.open('w',encoding='utf8') as out:
        proc=subprocess.Popen(command,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        job['pid']=proc.pid;atomic_json(path,job);code=proc.wait()
    job.pop('pid',None);job['exitCode']=code
    if code:raise RuntimeError(phase+' failed; inspect '+str(log))

def scan():
    approved=read(ART/'approved-assets.json')['assets'];far=read(ART/'approved-far-assets.json')['assets']
    for report_path in sorted((ART/'candidates-far').glob('*/*.json')):
        report=read(report_path);key=report['region']+'/'+report['asset']
        if key in far or key not in approved:continue
        if not report.get('processingComplete') or report.get('textureOnlyReprocessing',{}).get('nativeUVReceipt'):continue
        near=approved[key]
        if report.get('derivedFromNear',{}).get('sha256')!=near['candidate']['sha256']:continue
        model=local(report['processedCandidate']['path'])
        if sha(model)!=report['processedCandidate']['sha256']:raise ValueError('Far candidate changed')
        identity=report['region']+'--'+report['asset']+'-'+report['processedCandidate']['sha256'][:16]
        path=FOLDER/'jobs'/(identity+'.json')
        if path.exists():continue
        work=ART/'work/far-native-uv'/identity;work.mkdir(parents=True,exist_ok=True)
        original=work/'source-far.glb';shutil.copy2(model,original)
        report['processedCandidate']=evidence(original);report.pop('reviewSheet',None)
        frozen=work/'source-far.json';atomic_json(frozen,report)
        blend=ART/'blender-far'/report['region']/(report['asset']+'.blend')
        if not blend.exists():raise FileNotFoundError(blend)
        atomic_json(path,{'status':'requested','key':key,'region':report['region'],'asset':report['asset'],'sourceFar':evidence(original),'sourceReport':evidence(frozen),'blend':str(blend),'nearSha256':near['candidate']['sha256'],'outputRoot':str(work/'final'),'uvInput':str(work/'native-uv-input.npz'),'requestPath':str(ART/'queue/native-export-replays'/('far-nativeUV-'+identity+'.json')),'createdAt':now()})

def advance(path,job):
    if job['status'] not in ('requested','waiting_native_uv'):return False
    if job['key'] in read(ART/'approved-far-assets.json')['assets']:
        job['status']='skipped_already_approved';atomic_json(path,job);return True
    near=read(ART/'approved-assets.json')['assets'].get(job['key'])
    if not near or near['candidate']['sha256']!=job['nearSha256']:raise ValueError('Approved near identity changed')
    report=local(job['sourceReport']['path']);request_path=Path(job['requestPath'])
    if sha(report)!=job['sourceReport']['sha256']:raise ValueError('Frozen far source report changed')
    if job['status']=='requested':
        child(path,job,'uv-input',blender('export_neural_uv_input.py','--report',report,'--blend',job['blend'],'--sha256',job['sourceFar']['sha256'],'--output',job['uvInput']))
        if request_path.exists():raise FileExistsError('Preserve previous GPU UV request')
        atomic_json(request_path,{'status':'requested','operation':'native_uv_only','surfaceNPZ':job['uvInput'],'purpose':'Exact approved-near-derived far surface, native charts only. No geometry changes. CPU sampling retains approved near textures at512/256, no new inference. External far visual approval remains required.'})
        job.update(status='waiting_native_uv');atomic_json(path,job);print('FAR_UV_REQUESTED',job['key'],flush=True);return True
    request=read(request_path)
    if request.get('status')!='completed_pending_texture_transfer':return False
    if sha(local(request['receipt']['path']))!=request['receipt']['sha256']:raise ValueError('Native UV receipt changed')
    child(path,job,'near-texture',blender('bake_native_uv_candidate.py','--report',report,'--blend',job['blend'],'--sha256',job['sourceFar']['sha256'],'--uv-receipt',local(request['receipt']['path']),'--output-root',job['outputRoot'],'--texture-size',512))
    final=Path(job['outputRoot'])/job['region']/(job['asset']+'.json');result=read(final)
    if not result.get('processingComplete') or result.get('lod')!='far':raise ValueError('Incomplete actual far processing')
    subprocess.run([sys.executable,'-B',str(ART/'tools/promote_processed_candidate.py'),str(final)],cwd=ROOT,check=True)
    job.update(status='pending_visual_review',candidate=result['processedCandidate'],report=evidence(final),finishedAt=now());atomic_json(path,job);print('FAR_UV_REVIEW_READY',job['key'],result['processedCandidate']['sha256'],flush=True);return True

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--watch',action='store_true');args=cli.parse_args()
    (FOLDER/'jobs').mkdir(parents=True,exist_ok=True)
    handle=(FOLDER/'controller.lock').open('a+b');handle.seek(0);handle.write(b'0');handle.flush();handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
    while not (FOLDER/'stop-after-current').exists():
        scan();paths=sorted((FOLDER/'jobs').glob('*.json'),key=lambda p:(read(p)['status']!='waiting_native_uv',read(p)['region']!='classic',p.name));counts={};progressed=False
        for path in paths:
            job=read(path)
            if job['status']=='running' and not psutil.pid_exists(job.get('pid',-1)):
                job['status']='interrupted_needs_review';atomic_json(path,job)
            counts[job['status']]=counts.get(job['status'],0)+1
            try:
                if not progressed and advance(path,job):progressed=True
            except Exception as exc:
                job.update(status='failed_needs_review',error=repr(exc));atomic_json(path,job);print('FAR_UV_FAILED',job['key'],repr(exc),flush=True)
        atomic_json(FOLDER/'summary.json',{'updatedAt':now(),'counts':counts,'automaticApproval':False})
        if not args.watch and not progressed:break
        if not progressed:time.sleep(12)
    msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1);handle.close()

if __name__=='__main__':main()

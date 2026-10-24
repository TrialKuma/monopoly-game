"""Serial CPU low surfaces for explicitly registered bounded source repairs."""
from pathlib import Path
import json,subprocess,sys,time,argparse
import psutil
from prepare_triptych import ART,ROOT,atomic_json,sha,evidence
from run_hybrid_queue import now,BLENDER
from cpu_blender_lease import cpu_blender_lease

FOLDER=ART/'repair-low-queue'
def read(path):return json.loads(Path(path).read_text('utf-8'))
def local(path):
    path=Path(path);return path if path.is_absolute() else ROOT/path
def other_blender():
    for proc in psutil.process_iter(['name']):
        try:
            if (proc.info['name'] or '').lower()=='blender.exe':return True
        except (psutil.NoSuchProcess,psutil.AccessDenied):pass
    return False

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--watch',action='store_true');args=cli.parse_args()
    FOLDER.mkdir(parents=True,exist_ok=True);(FOLDER/'jobs').mkdir(exist_ok=True)
    import msvcrt
    lock=(FOLDER/'controller.lock').open('a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0);msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
    while not (FOLDER/'stop-after-current').exists():
        ready=[];counts={}
        for path in sorted((FOLDER/'jobs').glob('*.json')):
            job=read(path);status=job['status']
            if status=='running' and not psutil.pid_exists(job.get('pid',-1)):
                job.update(status='interrupted_needs_review');atomic_json(path,job);status=job['status']
            counts[status]=counts.get(status,0)+1
            if status=='requested':ready.append((path,job))
        atomic_json(FOLDER/'summary.json',{'updatedAt':now(),'counts':counts,'automaticApproval':False})
        if not ready:
            if args.watch:time.sleep(10);continue
            break
        # Join the shared lease wait instead of repeatedly losing every idle gap
        # to continuously active near/hybrid controllers. The lease itself checks
        # both existing Blender processes and the9GiB launch guard.
        path,job=ready[0];key=job['region']+'/'+job['asset']
        state_path=ART/'queue'/job['region']/(job['asset']+'.json');state=read(state_path)
        try:
            if key in read(ART/'approved-assets.json').get('assets',{}):
                job.update(status='skipped_already_approved');atomic_json(path,job);continue
            repair_path=local(job['repairReceipt']['path']);source=local(job['repairedSource']['path']);repair=read(repair_path)
            if sha(repair_path)!=job['repairReceipt']['sha256'] or sha(source)!=job['repairedSource']['sha256']:raise ValueError('Recorded repair identity changed')
            if repair['source']['sha256']!=state['rawGLB']['sha256'] or repair['nativeOutput']['sha256']!=job['repairedSource']['sha256']:raise ValueError('Original inference or actual repair input changed')
            out=local(job['outputRoot']);report=out/job['region']/(job['asset']+'.json')
            if report.exists():raise FileExistsError('Preserve existing trial; inspect before retrying')
            command=[str(BLENDER),'--background','--threads','4','--python-exit-code','1','--python',str(ART/'tools/process_lod.py'),'--','--state',str(state_path),'--triangles',str(job['triangles']),'--voxel-size',str(job.get('voxelSize',.003)),'--texture-size','1024','--lod','near','--repaired-source',str(source),'--repair-report',str(repair_path),'--output-root',str(out),'--nearest-texture','--uv-angle','66']
            log=ART/'logs'/('repair-low-'+path.stem+'.log');job.update(status='running',command=command,startedAt=now(),log=str(log))
            with cpu_blender_lease(ART,9), log.open('w',encoding='utf-8') as handle:
                child=subprocess.Popen(command,cwd=str(ROOT),stdout=handle,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));job['pid']=child.pid;atomic_json(path,job);code=child.wait()
            job.pop('pid',None);job['exitCode']=code
            if code:raise RuntimeError('CPU repair derivative failed; inspect log')
            result=read(report)
            if not result.get('processingComplete') or sha(local(result['processedCandidate']['path']))!=result['processedCandidate']['sha256']:raise ValueError('Incomplete low surface')
            enqueue=subprocess.run([sys.executable,'-B',str(ART/'tools/enqueue_repaired_hybrid.py'),str(report)],cwd=str(ROOT),capture_output=True,text=True)
            if enqueue.returncode:raise RuntimeError(enqueue.stderr[-3000:])
            job.update(status='hybrid_registered_pending_review',lowCandidate=evidence(local(result['processedCandidate']['path'])),lowReport=evidence(report),enqueueOutput=enqueue.stdout.strip(),completedAt=now())
            print('REPAIR_LOW_READY',key,flush=True)
        except Exception as exc:job.update(status='failed_needs_review',error=repr(exc))
        atomic_json(path,job)
    msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1);lock.close()

if __name__=='__main__':main()

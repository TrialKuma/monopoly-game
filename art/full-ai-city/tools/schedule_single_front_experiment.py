"""At one natural raw boundary run the isolated comparison, then resume MV."""
from pathlib import Path
from datetime import datetime,timezone
import json,subprocess,sys,time,psutil
from prepare_triptych import ART,ROOT,atomic_json,evidence
from run_raw_queue import retryable_preflight

def now():return datetime.now(timezone.utc).isoformat()
def main():
    experiment=ART/'experiments/alpine-tower1-a003-single-front-23421'
    manifest=experiment/'manifest.json';assert manifest.is_file()
    marker=ART/'queue/stop-after-current'
    if marker.exists():raise RuntimeError('Existing controller handoff preserved')
    target=str(ART/'tools/run_raw_queue.py').replace('\\','/').lower();found=[]
    for p in psutil.process_iter(['pid','cmdline']):
        try:
            if any(str(a).replace('\\','/').lower()==target for a in p.info['cmdline'] or []):found.append(p)
        except (psutil.NoSuchProcess,psutil.AccessDenied):pass
    if not found:raise RuntimeError('Expected live raw controller; no independent takeover')
    identity='single-front-comparison-'+str(__import__('os').getpid())
    marker.write_text(identity,encoding='utf8')
    status=experiment/'schedule.json';row={'status':'waiting_current_raw_natural_completion','startedAt':now(),'previousRawPids':[p.pid for p in found],'manifest':evidence(manifest),'noProcessesTerminated':True}
    atomic_json(status,row);print(json.dumps(row),flush=True)
    try:
        while any(p.is_running() for p in found):time.sleep(3)
        probe=ART/'reports/throughput/blender-memory-reservation-probe.json'
        while not probe.exists():
            row.update(status='waiting_embedded_python_guard_probe');atomic_json(status,row);time.sleep(3)
        if json.loads(probe.read_text())['status']!='passed':raise RuntimeError('Embedded guard probe did not pass')
        row['embeddedGuardProbe']=evidence(probe)
        for attempt in range(1,100):
            if (experiment/('attempt-'+str(attempt).zfill(3))).exists():continue
            while psutil.virtual_memory().available<11.5*2**30:
                row.update(status='resource_wait_before_single',availableGiB=psutil.virtual_memory().available/2**30);atomic_json(status,row);time.sleep(5)
            row.update(status='running_isolated_single',attempt=attempt);atomic_json(status,row)
            log=experiment/('attempt-'+str(attempt).zfill(3)+'.log')
            with log.open('w',encoding='utf8') as output:
                result=subprocess.run([sys.executable,'-B','-u',str(ART/'tools/run_single_front_experiment.py'),'--run','--attempt',str(attempt)],cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            result_path=experiment/('attempt-'+str(attempt).zfill(3))/'result.json'
            if not result_path.exists():raise RuntimeError('Single experiment failed before receipt; inspect '+str(log))
            final=json.loads(result_path.read_text());report=json.loads(Path(final['inferenceReport']['path']).read_text())
            row['result']=evidence(result_path);row['log']=evidence(log)
            if retryable_preflight(report):
                row.update(status='resource_wait_single_retry',retryableResourceWait=True);atomic_json(status,row);time.sleep(10);continue
            row.update(status='single_generated_pending_independent_review' if result.returncode==0 else 'single_failed_preserved_for_review');break
    finally:
        # Restore production even when the isolated experiment itself fails.
        while any(p.is_running() for p in found):time.sleep(3)
        if marker.exists() and marker.read_text('utf8')==identity:marker.unlink()
        if marker.exists():raise RuntimeError('A different stop request appeared; do not override it')
        with (ART/'logs/raw-controller-after-single-comparison.log').open('a',encoding='utf8') as output:
            child=subprocess.Popen([sys.executable,'-B','-u',str(ART/'tools/run_raw_queue.py'),'--watch'],cwd=ROOT,stdout=output,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        row.update(rawQueueResumedPid=child.pid,resumedAt=now());atomic_json(status,row)
        print('SINGLE_COMPARISON_BOUNDARY_DONE '+json.dumps(row),flush=True)

if __name__=='__main__':main()

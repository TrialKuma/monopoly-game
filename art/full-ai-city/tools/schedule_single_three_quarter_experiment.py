"""One authorized isolated trial at a natural raw boundary, then resume raw."""
from pathlib import Path
import json, os, subprocess, sys, time
import psutil
from prepare_triptych import ART, ROOT, atomic_json, evidence
from run_raw_queue import retryable_preflight, now
from native_memory_reservation import LocalGpuLock, LocalGpuBusyError, assert_native_admission

EXPERIMENT=ART/'experiments/alpine-tower1-single-three-quarter-23421'

def read(path):return json.loads(path.read_text('utf8'))

def controllers():
    target=str(ART/'tools/run_raw_queue.py').replace('\\','/').lower()
    rows=[]
    for proc in psutil.process_iter(['cmdline']):
        try:
            if any(str(arg).replace('\\','/').lower()==target for arg in proc.info['cmdline'] or []):rows.append(proc)
        except (psutil.NoSuchProcess,psutil.AccessDenied):pass
    return rows

def main():
    manifest=EXPERIMENT/'manifest.json';configuration=read(manifest)
    assert configuration['experimentOnly'] and configuration['formal147MultiviewRequirementUnchanged']
    status=EXPERIMENT/'schedule.json'
    if status.exists():raise FileExistsError('Preserve prior one-shot scheduling evidence')
    marker=ART/'queue/stop-after-current';pause=ART/'PAUSED.json'
    if pause.exists() or marker.exists():raise RuntimeError('Existing pause or handoff preserved')
    found=controllers()
    if not found:raise RuntimeError('Expected live raw controller, no independent takeover')
    identity='single-three-quarter-'+str(os.getpid())
    with marker.open('x',encoding='utf8') as file:file.write(identity)
    row={'status':'waiting_current_raw_natural_completion','startedAt':now(),'previousRawPids':[p.pid for p in found],
         'manifest':evidence(manifest),'noProcessesTerminated':True,'maximumNeuralInferences':1,'formalCandidate':False}
    def save(stage,**extra):
        if row.get('status')!=stage or extra:
            row.update(status=stage,**extra);atomic_json(status,row);print(stage,flush=True)
    atomic_json(status,row)
    def cancelled():return pause.exists() or not marker.exists() or marker.read_text('utf8')!=identity
    try:
        while any(p.is_running() for p in found):
            if cancelled():save('cancelled_by_new_pause_or_handoff');return
            time.sleep(15)
        for attempt in range(1,4):
            while True:
                if cancelled():save('cancelled_by_new_pause_or_handoff');return
                if psutil.virtual_memory().available<11.5*2**30:
                    save('waiting_existing_ram_guard');time.sleep(15);continue
                try:
                    with LocalGpuLock(identity+'-admission-probe'):assert_native_admission()
                except LocalGpuBusyError:
                    save('waiting_shared_gpu_reservation');time.sleep(15);continue
                break
            command=list(configuration['command']);command[0]=sys.executable;command[-1]=str(attempt)
            log=EXPERIMENT/('attempt-'+str(attempt).zfill(3)+'.log')
            save('running_isolated_single',attempt=attempt,command=command)
            with log.open('x',encoding='utf8') as out:
                result=subprocess.run(command,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            result_path=EXPERIMENT/('attempt-'+str(attempt).zfill(3))/'result.json'
            if not result_path.exists():raise RuntimeError('No completed result receipt; inspect '+str(log))
            final=read(result_path);report=read(Path(final['inferenceReport']['path']))
            row.update(result=evidence(result_path),log=evidence(log))
            if retryable_preflight(report):
                save('resource_wait_before_any_inference');time.sleep(15);continue
            success=result.returncode==0 and report.get('status')=='generated_unrigged_part_candidate'
            save('single_generated_pending_independent_review' if success else 'single_failed_preserved_for_review',finishedAt=now())
            break
        else:save('preflight_refused_preserved_for_review')
    except Exception as exc:
        save('scheduler_failed_preserved_for_review',error=repr(exc))
        raise
    finally:
        if not cancelled():
            marker.unlink()
            if not controllers():
                with (ART/'logs/raw-controller-after-single-three-quarter.log').open('a',encoding='utf8') as out:
                    child=subprocess.Popen([sys.executable,'-B','-u',str(ART/'tools/run_raw_queue.py'),'--watch'],cwd=ROOT,stdout=out,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                row.update(rawQueueResumedPid=child.pid,resumedAt=now());atomic_json(status,row)

if __name__=='__main__':main()

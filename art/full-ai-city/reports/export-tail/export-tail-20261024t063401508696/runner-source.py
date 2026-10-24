"""Serve late native UV/field requests after the last neural job, no new inference."""
from pathlib import Path
from datetime import datetime,timezone
from types import SimpleNamespace
import json,sys,time,shutil,hashlib
import native_mv_runner as runner
from prepare_triptych import atomic_json,evidence

def pending(art):
    return [p for p in (Path(art)/'queue/native-export-replays').glob('*.json')
            if json.loads(p.read_text('utf8')).get('status')=='requested']

def main():
    art=runner.ART
    if not pending(art):print('EXPORT_TAIL_IDLE',flush=True);return
    identity='export-tail-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f').lower()
    folder=art/'reports/export-tail'/identity;folder.mkdir(parents=True,exist_ok=False)
    snapshot=folder/'runner-source.py';shutil.copy2(__file__,snapshot)
    report={'status':'waiting_gpu_lock','id':identity,'newNeuralInference':False,'neuralWeightsLoaded':False,'tool':evidence(snapshot),'startedAt':datetime.now(timezone.utc).isoformat(),'exports':[]}
    report_path=folder/'report.json';atomic_json(report_path,report)
    runner.base.CACHE=art/'cache';runner.base.protect_shared_files()
    sys.path.insert(0,str(runner.base.SHARED/'tools'))
    from local_gpu_lock import LocalGpuLock
    guard=SimpleNamespace(min_free_ram_gib=11.,min_free_vram_gib=12.)
    started=time.monotonic()
    try:
        with LocalGpuLock('monopoly-'+identity) as lock:
            report['gpuLock']=dict(lock.owner_info)
            runner.base.assert_memory(runner.base.resource_snapshot(),guard)
            torch,natten,inference=runner.bootstrap_multiview()
            runner.base.assert_memory(runner.base.resource_snapshot(),guard)
            from replay_native_mobile import serve_one
            report.update(status='serving_existing_source_exports',torch=torch.__version__)
            atomic_json(report_path,report)
            for _ in range(3):
                if report['exports'] and time.monotonic()-started>=90:break
                result=serve_one(inference,torch,art,identity)
                if not result:break
                report['exports'].append(result);atomic_json(report_path,report)
            report['status']='completed_export_batch'
    except Exception as exc:
        report.update(status='retryable_resource_wait' if type(exc).__name__=='LocalGpuBusyError' or 'startup guard' in str(exc) else 'failed_needs_review',error=repr(exc))
        if report['status']=='failed_needs_review':raise
    finally:
        report.update(finishedAt=datetime.now(timezone.utc).isoformat(),seconds=round(time.monotonic()-started,3))
        if report.get('gpuLock'):report['gpuLock']['status']='released'
        atomic_json(report_path,report)
        print('EXPORT_TAIL_RESULT',report['status'],len(report['exports']),str(report_path),flush=True)

if __name__=='__main__':main()

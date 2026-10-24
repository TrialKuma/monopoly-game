"""Isolated real Windows-lock tests; never load models or launch Blender."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,subprocess,sys,tempfile,time
from native_memory_reservation import (LocalGpuLock,LocalGpuBusyError,
    fine_voxel_arguments,assert_native_admission,fine_cpu_reservation)
from run_raw_queue import retryable_preflight

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--worker',type=Path);a=parser.parse_args()
    if a.worker:
        with fine_cpu_reservation(a.worker,['--voxel-size','.0015'],a.worker/'test.lock',.05):
            (a.worker/'fine-entered').write_text('yes')
            while not (a.worker/'release-fine').exists():time.sleep(.05)
        return
    assert fine_voxel_arguments(['--voxel-size','0.0015'])
    assert fine_voxel_arguments(['--voxel-size=0.001'])
    for args in ([],['--voxel-size','.002'],['--voxel-size','.003'],['--voxel-size','.0015','--lod','far'],['--voxel-size','.0015','--surface','actual.npz']):
        assert not fine_voxel_arguments(args),args
    fake=SimpleNamespace(info={'pid':12345,'name':'blender.exe','cmdline':['blender.exe','--python','H:/x/process_lod.py','--','--voxel-size','.0015']})
    try:assert_native_admission(processes=[fake])
    except LocalGpuBusyError as exc:
        report={'status':'gpu_busy','generation_started':False,'error':repr(exc)}
        assert retryable_preflight(report)
        assert not retryable_preflight({**report,'generation_started':True})
    else:raise AssertionError('Existing fine worker was not blocked before loading')
    fake.info['cmdline'][2]='H:/x/render_review.py'
    assert assert_native_admission(processes=[fake])['fineVoxelWorkers']==[]
    with tempfile.TemporaryDirectory(prefix='native-memory-reservation-') as name:
        folder=Path(name);lock_path=folder/'test.lock';child=None
        try:
            with LocalGpuLock('test-native-no-models',lock_path):
                with fine_cpu_reservation(folder,['--voxel-size','.003'],lock_path) as ordinary:
                    assert ordinary is None # Ordinary CPU remains eligible.
                child=subprocess.Popen([sys.executable,'-B',__file__,'--worker',str(folder)],stdout=subprocess.DEVNULL)
                deadline=time.time()+10
                while not list((folder/'resource-locks').glob('fine-memory-*.json')):
                    assert time.time()<deadline;time.sleep(.05)
                time.sleep(.2);assert not (folder/'fine-entered').exists()
            deadline=time.time()+10
            while not (folder/'fine-entered').exists():
                assert time.time()<deadline;time.sleep(.05)
            try:
                with LocalGpuLock('test-next-native-no-models',lock_path):raise AssertionError('Overlap allowed')
            except LocalGpuBusyError:pass
            (folder/'release-fine').write_text('yes');assert child.wait(timeout=10)==0
            with LocalGpuLock('test-after-fine',lock_path):pass
            assert all(json.loads(p.read_text())['status']=='released' for p in (folder/'resource-locks').glob('*.json'))
        finally:
            (folder/'release-fine').write_text('yes')
            if child is not None:child.wait(timeout=10)
    print('PASS: real OS mutual exclusion in both directions; normal CPU bypass; legacy fine-worker transition scan; before-inference resource wait classification; cleanup. No Blender/model/GPU work.')

if __name__=='__main__':main()

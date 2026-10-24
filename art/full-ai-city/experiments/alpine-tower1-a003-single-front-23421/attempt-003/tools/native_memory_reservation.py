"""Serialize exceptional fine-voxel CPU work with native GPU model residency.

The shared OS byte lock is authoritative. No user processes are stopped and
ordinary CPU processing never requests this reservation. The process scan is
only a transition guard for fine jobs started before this helper was installed.
"""
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import json, os, sys, time

SHARED_TOOLS = Path('C:/Users/A/.codex/worktrees/0b69/厂长/grande-art-lab/tools')
sys.path.insert(0, str(SHARED_TOOLS))
from local_gpu_lock import LocalGpuLock, LocalGpuBusyError, DEFAULT_LOCK_PATH

def fine_voxel_arguments(arguments):
    """Only actual near reconstruction at <=.0015; no surface/far work."""
    args = list(map(str, arguments))
    def value(flag, default=None):
        for index, item in enumerate(args):
            if item.startswith(flag + '='): return item.split('=', 1)[1]
            if item == flag and index + 1 < len(args): return args[index + 1]
        return default
    if value('--lod', 'near') == 'far' or value('--surface') is not None: return False
    try: return 0 < float(value('--voxel-size', '.003')) <= .0015
    except (TypeError, ValueError): return False

def active_fine_workers(processes=None):
    # psutil is needed only in the native Python runtime, not Blender Python.
    import psutil
    rows = []
    for process in processes if processes is not None else psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            info = process.info
            args = info.get('cmdline') or []
            if (info.get('name') or '').lower() != 'blender.exe': continue
            scripts = [args[i + 1] for i, v in enumerate(args[:-1]) if v == '--python']
            if not any(Path(s).name == 'process_lod.py' for s in scripts): continue
            if not fine_voxel_arguments(args): continue
            rows.append({'pid': info['pid'], 'script': scripts[0], 'reason': 'fine_voxel_cpu_residency'})
        except (psutil.NoSuchProcess, psutil.AccessDenied): continue
    return rows

def assert_native_admission(lock_path=DEFAULT_LOCK_PATH, processes=None):
    """Call while holding the shared lock and before importing/loading models."""
    rows = active_fine_workers(processes)
    if rows:
        raise LocalGpuBusyError(lock_path, {'status': 'resource_wait', 'reason': 'fine_voxel_cpu_residency',
            'workers': rows, 'generation_started': False})
    return {'fineVoxelWorkers': [], 'checkedAt': datetime.now(timezone.utc).isoformat(),
            'transitionScanOnly': True, 'mutualExclusion': 'shared operating-system GPU byte lock'}

@contextmanager
def fine_cpu_reservation(art, arguments, lock_path=DEFAULT_LOCK_PATH, poll_seconds=3):
    if not fine_voxel_arguments(arguments):
        yield None
        return
    started = time.monotonic()
    folder = Path(art) / 'resource-locks'; folder.mkdir(parents=True, exist_ok=True)
    evidence = folder / ('fine-memory-' + str(os.getpid()) + '.json')
    lock = LocalGpuLock('monopoly-fine-cpu-' + str(os.getpid()), lock_path)
    row = {'pid': os.getpid(), 'status': 'resource_wait', 'reason': 'native_or_other_fine_residency',
           'voxelThreshold': .0015, 'noGpuCompute': True, 'startedAt': datetime.now(timezone.utc).isoformat()}
    def save():
        # Advisory evidence failure must not undermine the real reservation.
        try: evidence.write_text(json.dumps(row, indent=2), encoding='utf8')
        except OSError: pass
    save()
    while True:
        try:
            lock.__enter__()
            break
        except LocalGpuBusyError as exc:
            row.update(waitSeconds=round(time.monotonic() - started, 3), owner=exc.owner)
            save()
            print('FINE_CPU_RESOURCE_WAIT ' + json.dumps(row), flush=True)
            time.sleep(poll_seconds)
    row.update(status='reserved', waitSeconds=round(time.monotonic()-started, 3),
               reservation=dict(lock.owner_info), acquiredAt=datetime.now(timezone.utc).isoformat())
    save()
    try:
        yield dict(row)
    finally:
        lock.__exit__(None, None, None)
        row.update(status='released', releasedAt=datetime.now(timezone.utc).isoformat()); save()

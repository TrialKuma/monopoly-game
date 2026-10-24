"""Blender embedded-Python probe: temporary lock only, no model or mesh load."""
from pathlib import Path
import hashlib,json,sys,tempfile
sys.path.insert(0,str(Path(__file__).parent))
from native_memory_reservation import LocalGpuLock,LocalGpuBusyError,fine_cpu_reservation
root=Path(__file__).resolve().parents[3];art=root/'art/full-ai-city'
with tempfile.TemporaryDirectory(prefix='blender-memory-guard-') as directory:
    folder=Path(directory);lock_path=folder/'test.lock'
    with fine_cpu_reservation(folder,['--voxel-size','.0015'],lock_path,.01) as reservation:
        assert reservation['status']=='reserved'
        try:
            with LocalGpuLock('probe-must-be-blocked',lock_path):raise AssertionError('Lock overlap')
        except LocalGpuBusyError:pass
    with LocalGpuLock('probe-released',lock_path):pass
    with fine_cpu_reservation(folder,['--voxel-size','.003'],lock_path) as normal:assert normal is None
report={'status':'passed','python':sys.version,'executable':sys.executable,'blenderBundledPython':True,
        'actualBlenderEmbeddedProcess':Path(sys.executable).name.lower()=='blender.exe',
        'checks':['shared helper import','temporary actual Windows byte lock','fine blocks native lock','release','ordinary bypass'],
        'sourceMeshLoaded':False,'neuralModelLoaded':False,'productionGpuLockUsed':False,
        'probeSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'guardSha256':hashlib.sha256(Path(__file__).with_name('native_memory_reservation.py').read_bytes()).hexdigest()}
output=art/'reports/throughput/blender-memory-reservation-probe.json'
if output.exists():output=output.with_name('blender-embedded-memory-reservation-probe.json')
if output.exists():raise FileExistsError('Preserve prior probe receipt')
output.write_text(json.dumps(report,indent=2),encoding='utf8')
print('BLENDER_MEMORY_PROBE_PASS '+json.dumps(report),flush=True)

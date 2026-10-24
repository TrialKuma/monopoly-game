"""Actual Windows sharing conflicts and lock-release tests, no real workloads."""
import ctypes,json,msvcrt,os,tempfile,threading,time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import cpu_blender_lease as lease

k=ctypes.WinDLL('kernel32',use_last_error=True)
k.CreateFileW.argtypes=[ctypes.c_wchar_p,ctypes.c_uint32,ctypes.c_uint32,ctypes.c_void_p,ctypes.c_uint32,ctypes.c_uint32,ctypes.c_void_p]
k.CreateFileW.restype=ctypes.c_void_p
k.CloseHandle.argtypes=[ctypes.c_void_p];k.CloseHandle.restype=ctypes.c_int
def deny_delete_briefly(path):
    handle=k.CreateFileW(str(path),0x80000000,1,None,3,0x80,None)
    assert handle not in (None,ctypes.c_void_p(-1).value),ctypes.get_last_error()
    def release():time.sleep(.12);assert k.CloseHandle(handle)
    thread=threading.Thread(target=release);thread.start();return thread

with tempfile.TemporaryDirectory(prefix='cpu-lease-win-sharing-') as temporary:
    base=Path(temporary);row={'pid':os.getpid(),'queuedAtEpoch':12345.678,'status':'waiting'}
    path=base/'wait.json';path.write_text('{}');thread=deny_delete_briefly(path)
    original=os.replace;attempts=[]
    def replace(source,target):attempts.append((source,target));return original(source,target)
    with patch.object(lease.os,'replace',replace):lease._record(path,row)
    thread.join();assert json.loads(path.read_text())==row
    assert len(attempts)>1 and len(set(attempts))==1
    assert not list(base.glob('*.tmp-*'))
    thread=deny_delete_briefly(path);lease._unlink_waiting(path);thread.join();assert not path.exists()
    calls=[]
    def denied():calls.append(1);raise PermissionError('synthetic permanent denial')
    try:
        with patch.object(lease.time,'sleep',lambda delay:None):lease._retry_permission(denied)
        raise AssertionError('Permanent failure must not be silently ignored')
    except PermissionError:pass
    assert len(calls)==10
    case=base/'cleanup';case.mkdir()
    with patch.object(lease.psutil,'virtual_memory',lambda:SimpleNamespace(available=12*2**30)),patch.object(lease,'_other_blender',lambda:False),patch.object(lease,'_unlink_waiting',side_effect=PermissionError('persistent cleanup denial')):
        try:
            with lease.cpu_blender_lease(case,9):raise AssertionError('Must fail before workload on permanent unlink denial')
        except PermissionError:pass
    # Even a cleanup exception after acquisition cannot strand the OS lock.
    lock=(case/'resource-locks/cpu-blender.lock').open('r+b');lock.seek(0)
    msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1);msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1);lock.close()
    print('PASS actual Windows replace/unlink sharing retries, unchanged FIFO timestamp, bounded permanent failure and guaranteed OS unlock.')

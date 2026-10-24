"""One owned CPU Blender worker at a time; never stop other applications."""
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime,timezone
import json,os,time,msvcrt,psutil

def _other_blender():
    for proc in psutil.process_iter(['name']):
        try:
            if (proc.info['name'] or '').lower()=='blender.exe':return True
        except (psutil.NoSuchProcess,psutil.AccessDenied):pass
    return False

def _record(path,row):
    temporary=path.with_suffix('.tmp-'+str(os.getpid()))
    temporary.write_text(json.dumps(row,indent=2),encoding='utf8');os.replace(temporary,path)

def _older_eligible_waiter(folder,queued_at,available,pid):
    """FIFO only among live waiters whose own RAM admission is satisfied."""
    for path in folder.glob('cpu-wait-*.json'):
        try:
            row=json.loads(path.read_text('utf8'));other=int(row['pid'])
            if other==pid or not psutil.pid_exists(other):continue
            updated=datetime.fromisoformat(row['updatedAt']).timestamp()
            if time.time()-updated>60:continue
            start=row.get('queuedAtEpoch',updated-row.get('elapsedSeconds',0))
            if (start,other)<(queued_at,pid) and row['minFreeGiB']<=available:return other
        except (OSError,ValueError,KeyError,TypeError):continue
    return None

@contextmanager
def cpu_blender_lease(art,min_free_gib=9):
    folder=Path(art)/'resource-locks';folder.mkdir(parents=True,exist_ok=True)
    handle=(folder/'cpu-blender.lock').open('a+b');handle.seek(0);handle.write(b'0');handle.flush();handle.seek(0)
    acquired=False;started=time.monotonic();queued_at=time.time();last_record=0
    waiting=folder/('cpu-wait-'+str(os.getpid())+'.json');owner=folder/'cpu-owner.json'
    try:
        _record(waiting,{'pid':os.getpid(),'status':'waiting_without_holding_cpu_lease','reason':'queued','minFreeGiB':min_free_gib,'queuedAtEpoch':queued_at,'elapsedSeconds':0,'updatedAt':datetime.now(timezone.utc).isoformat()})
        while not acquired:
            available=psutil.virtual_memory().available/2**30;other=_other_blender()
            older=_older_eligible_waiter(folder,queued_at,available,os.getpid())
            reason='insufficient_memory' if available<min_free_gib else 'existing_blender' if other else 'older_eligible_waiter' if older else 'lease_busy'
            if available>=min_free_gib and not other and not older:
                try:
                    msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1);acquired=True
                except OSError:pass
                if acquired:
                    # Admission was only a hint: recheck while holding the lease.
                    # Never hold the shared CPU lease while waiting for RAM.
                    available=psutil.virtual_memory().available/2**30
                    if available<min_free_gib or _other_blender() or _older_eligible_waiter(folder,queued_at,available,os.getpid()):
                        msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1);acquired=False
                        reason='admission_recheck_failed'
            if acquired:break
            if time.monotonic()-last_record>=15:
                _record(waiting,{'pid':os.getpid(),'status':'waiting_without_holding_cpu_lease','reason':reason,'minFreeGiB':min_free_gib,'availableGiB':available,'queuedAtEpoch':queued_at,'olderEligiblePid':older,'elapsedSeconds':round(time.monotonic()-started,2),'updatedAt':datetime.now(timezone.utc).isoformat()});last_record=time.monotonic()
            time.sleep(3)
        _record(owner,{'pid':os.getpid(),'status':'leased','minFreeGiB':min_free_gib,'availableGiBAtAdmission':available,'waitSeconds':round(time.monotonic()-started,2),'acquiredAt':datetime.now(timezone.utc).isoformat()})
        if waiting.exists():waiting.unlink()
        yield
    finally:
        if waiting.exists():waiting.unlink()
        if acquired and owner.exists():
            try:
                row=json.loads(owner.read_text('utf8'))
                if row.get('pid')==os.getpid():
                    row.update(status='released',releasedAt=datetime.now(timezone.utc).isoformat());_record(owner,row)
            except (OSError,ValueError):pass
        if acquired:msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1)
        handle.close()

"""Real OS-lock test with isolated synthetic RAM; never launches Blender."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,msvcrt,subprocess,sys,tempfile,time
import cpu_blender_lease as lease

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--worker',type=Path);parser.add_argument('--name');parser.add_argument('--minimum',type=float);a=parser.parse_args()
    if a.worker:
        lease.psutil.virtual_memory=lambda:SimpleNamespace(available=float((a.worker/'ram.txt').read_text())*2**30)
        lease._other_blender=lambda:False
        with lease.cpu_blender_lease(a.worker,a.minimum):
            (a.worker/(a.name+'.json')).write_text(json.dumps({'entered':time.time()}));time.sleep(.2)
        return
    with tempfile.TemporaryDirectory(prefix='cpu-lease-fairness-') as temp:
        base=Path(temp)
        for mode in ('eligible_fifo','skip_memory_ineligible'):
            case=base/mode;folder=case/'resource-locks';folder.mkdir(parents=True);(case/'ram.txt').write_text('12' if mode=='eligible_fifo' else '5')
            handle=(folder/'cpu-blender.lock').open('w+b');handle.write(b'0');handle.flush();handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
            children=[]
            for name,minimum in [('older',9),('younger',4.5)]:
                child=subprocess.Popen([sys.executable,'-B',__file__,'--worker',str(case),'--name',name,'--minimum',str(minimum)]);children.append(child)
                deadline=time.time()+15
                while len(list(folder.glob('cpu-wait-*.json')))<len(children):
                    if time.time()>deadline:raise RuntimeError('Worker did not queue')
                    time.sleep(.05)
            msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1);handle.close()
            expected='older' if mode=='eligible_fifo' else 'younger';deadline=time.time()+15
            while not (case/(expected+'.json')).exists():
                if time.time()>deadline:raise RuntimeError('Eligible waiter starved')
                time.sleep(.05)
            if mode=='skip_memory_ineligible':
                assert not (case/'older.json').exists();(case/'ram.txt').write_text('12')
            for child in children:assert child.wait(timeout=15)==0
            times={name:json.loads((case/(name+'.json')).read_text())['entered'] for name in ('older','younger')}
            assert min(times,key=times.get)==expected
            assert not list(folder.glob('cpu-wait-*.json'))
            print('PASS',mode,times,flush=True)
    print('PASS real two-process lease fairness, RAM-ineligible bypass and cleanup; synthetic memory only, no Blender/GPU/user processes',flush=True)

if __name__=='__main__':main()

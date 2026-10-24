"""Regression: a late export after the final raw source must still be served."""
from pathlib import Path
from types import SimpleNamespace
import tempfile,json,sys
import psutil
import run_raw_queue as q

def main():
    with tempfile.TemporaryDirectory(prefix='ai-export-tail-check-') as folder:
        q.ART=Path(folder);(q.ART/'logs').mkdir();(q.ART/'queue/native-export-replays').mkdir(parents=True)
        job={'region':'classic','asset':'shop_1','class':'core'}
        q.jobs=lambda:[job]
        q.sync=lambda _:dict(job,status='raw_ready')
        psutil.virtual_memory=lambda:SimpleNamespace(available=20*1024**3)
        counts={'sleeps':0,'tailCalls':0}
        request=q.ART/'queue/native-export-replays/late.json'
        def sleep(_):
            counts['sleeps']+=1
            if counts['sleeps']==1:request.write_text(json.dumps({'status':'requested'}))
            elif counts['sleeps']==2:(q.ART/'queue/stop-after-current').write_text('test complete')
            else:raise AssertionError('Unexpected idle loop')
        def run(command,**kwargs):
            assert command[-1].endswith('run_export_tail.py')
            assert json.loads(request.read_text())['status']=='requested'
            counts['tailCalls']+=1;request.write_text(json.dumps({'status':'completed_pending_visual_review'}))
            return SimpleNamespace(returncode=0)
        q.time.sleep=sleep;q.subprocess.run=run
        q.run=lambda *args:(_ for _ in ()).throw(AssertionError('Must not start another neural inference'))
        sys.argv=['run_raw_queue.py','--watch'];q.main()
        assert counts=={'sleeps':2,'tailCalls':1},counts
        assert json.loads(request.read_text())['status']=='completed_pending_visual_review'
        print('PASS final raw does not exit watch; late request drained exactly once; no extra inference; graceful stop honored')

if __name__=='__main__':main()

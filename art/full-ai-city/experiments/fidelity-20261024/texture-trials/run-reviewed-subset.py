"""One explicitly scoped CPU-only session; never approve or publish results."""
from pathlib import Path
from datetime import datetime,timezone
import gc,hashlib,json,sys,time,traceback

ROOT=Path(__file__).resolve().parents[5]
TOOLS=ROOT/'art/full-ai-city/tools'
sys.path.insert(0,str(TOOLS))
import refresh_baked_textures as refresh
import process_lod as lod

def now():return datetime.now(timezone.utc).isoformat()
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def write(path,row):
    pending=path.with_suffix('.pending.json');pending.write_text(json.dumps(row,ensure_ascii=False,indent=2)+'\n','utf8');pending.replace(path)

scope_path=ROOT/'work/fidelity-repair-20261024/scope.json'
scope=json.loads(scope_path.read_text('utf8'))
statics=scope['extendedStaticBatchAfterPrototypePass']
assert len(statics)==10 and len(set(statics))==10 and 'alpine/villa_2' in statics
animated=['classic/chance_wheel','classic/builders_guild','compact/builders_guild','alpine/windmill']
assert set(animated).issubset(scope['animatedSeparateBatchAfterPrototypePass'])
keys=[key for key in statics if key!='alpine/villa_2']+animated
assert len(keys)==13 and 'compact/villa_2' not in keys
registry=json.loads((ROOT/'art/full-ai-city/approved-assets.json').read_text('utf8'))['assets']
directory=Path(__file__).resolve().parent
progress=directory/'subset-progress.json'
state={'status':'running','startedAt':now(),'scope':{'path':str(scope_path),'sha256':sha(scope_path)},
    'runner':{'path':str(Path(__file__).resolve()),'sha256':sha(__file__)},'inferenceCalls':0,'cpuThreads':4,'concurrentProcesses':1,
    'alreadyCompletedSeparately':'alpine/villa_2','jobs':[{'key':key,'status':'pending'} for key in keys]}
write(progress,state)
for job in state['jobs']:
    key=job['key'];entry=registry[key];output=directory/key.replace('/','-')
    started=time.monotonic();job.update(status='running',startedAt=now(),output=str(output),originalCandidate=entry['candidate']);write(progress,state)
    print('SUBSET_JOB_BEGIN',key,flush=True)
    try:
        current=json.loads((ROOT/'art/full-ai-city/approved-assets.json').read_text('utf8'))['assets'][key]
        assert current['candidate']['sha256']==entry['candidate']['sha256'],'Approval changed since subset began'
        sys.argv=['refresh_baked_textures','--','--report',str(ROOT/entry['processingReport']['path']),'--output-root',str(output)]
        refresh.main()
        report_path=output/(key.split('/')[1]+'.json');report=json.loads(report_path.read_text('utf8'))
        assert report['processingComplete'] and report['status']=='exported_pending_visual_review'
        job.update(status='exported_pending_visual_review',candidate=report['processedCandidate'],report={'path':str(report_path),'sha256':sha(report_path)},
            overlapWrites=report['bake']['atlasOverlapPixelsWithDifferentSurface'],coveredAtlasPixels=report['bake']['coveredAtlasPixels'])
    except Exception as exc:
        job.update(status='failed_original_unchanged',error=repr(exc));traceback.print_exc()
    finally:
        job.update(completedAt=now(),seconds=round(time.monotonic()-started,3));write(progress,state)
        lod.clear_scene();gc.collect()
        print('SUBSET_JOB_END',key,job['status'],job['seconds'],flush=True)
state.update(status='completed_pending_visual_review',completedAt=now(),completed=sum(j['status']=='exported_pending_visual_review' for j in state['jobs']),failed=sum(j['status']=='failed_original_unchanged' for j in state['jobs']))
write(progress,state);print('SUBSET_COMPLETE',state['completed'],state['failed'],flush=True)

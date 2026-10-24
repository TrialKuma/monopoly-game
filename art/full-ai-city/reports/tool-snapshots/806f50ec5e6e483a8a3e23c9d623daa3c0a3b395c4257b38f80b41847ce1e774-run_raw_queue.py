"""Resumable sequential native-MV queue; output presence is never approval."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,os,subprocess,sys,time
from prepare_triptych import ART,ROOT,prepare,atomic_json,evidence,sha
REGIONS=('classic','compact','expansion','harbor','alpine')
CORE=tuple(f'{family}_{level}' for family in ('villa','shop','hotel','tower') for level in (1,2,3))
LARGE=tuple(f'{family}_{level}' for family in ('skyscraper','finance','onsen') for level in (1,2,3))
PUBLIC=('civic_hall','vault_bank','builders_guild','card_pavilion','chance_wheel','teleport_gate','rush_station','junction_hub')
def now():return datetime.now(timezone.utc).isoformat()
def jobs():
    result=[{'region':region,'asset':asset,'class':'core' if asset in CORE else 'large' if asset in LARGE else 'public'}
            for region in REGIONS for asset in CORE+PUBLIC+LARGE]
    result.extend([{'region':'harbor','asset':'lighthouse','class':'hero'},{'region':'alpine','asset':'windmill','class':'hero'}])
    return result
def state_path(job):return ART/'queue'/job['region']/(job['asset']+'.json')
def load_state(job):
    path=state_path(job)
    return json.loads(path.read_text('utf-8')) if path.exists() else {**job,'status':'waiting_reference','attempts':[]}
def save(job,state):state['updatedAt']=now();atomic_json(state_path(job),state)
def verified_raw(report_path):
    if not report_path.is_file():return None
    report=json.loads(report_path.read_text('utf-8'))
    if report.get('status')!='generated_unrigged_part_candidate' or not report.get('input_unchanged'):return None
    path=Path(report['output'])
    if not path.is_file() or sha(path)!=report['output_sha256']:return None
    if report['pipeline_config']!='pipeline_mv.json' or report['view_count']!=3:raise RuntimeError('Non-native source rejected')
    return {'rawGLB':evidence(path),'inferenceReport':evidence(report_path)}
def adopt_existing_house(job,state):
    if job['asset']!='villa_2' or state.get('rawGLB') or state.get('sourceRevisionRequested'):return False
    if (ART/'references'/job['region']/(job['asset']+'.png')).exists() or state.get('referenceRevisionRequested') or state.get('attempts'):
        return False
    old=ROOT/'art/themed-city-kit/reports'/f"{job['region']}_house-processing.json"
    if not old.exists():return False
    report=json.loads(old.read_text('utf-8'));native=Path(report['inference_report']['path'])
    raw=verified_raw(native)
    if not raw:raise RuntimeError('Existing MV house has invalid source evidence')
    state.update(raw);state.update(status='raw_ready',reference=evidence(Path(report['reference']['path'])),
        reuse='Only original completed three-view neural raw source reused. All mobile geometry/textures will be reprocessed with the common full-city LOD pipeline.',
        inputSourceHash=report['reference']['sha256'])
    save(job,state);return True
def sync(job):
    state=load_state(job)
    if adopt_existing_house(job,state):return state
    if state['status']=='running':
        last=state['attempts'][-1];raw=verified_raw(Path(last['report']))
        if raw:state.update(raw);state['status']='raw_ready';save(job,state)
        else:
            import psutil
            if not psutil.pid_exists(last.get('pid',-1)):
                state['status']='retry_pending';last['interruptedAt']=now();save(job,state)
    if state.get('reuse') and not state.get('sourceRevisionRequested'):return state
    canonical_exists=(ART/'references'/job['region']/(job['asset']+'.png')).exists()
    independent=not canonical_exists and state.get('independentInputs',True)
    if canonical_exists and state.get('independentInputs'):
        state['independentInputs']=False
        state.pop('sourceRevisionRequested',None)
        state.pop('reuse',None)
    if state.get('sourceRevisionRequested') and independent and state.get('viewsDir') and state['status'] in ('ready','retry_pending','raw_ready'):return state
    if state['status']=='running':return state
    ref=ART/'references'/job['region']/(job['asset']+'.png')
    if not ref.exists():return state
    current=sha(ref)
    if state.get('sourceReviewHold',{}).get('inputSourceHash')==current:
        state['status']='source_revision_needed';save(job,state);return state
    elif state.get('sourceReviewHold'):
        state.pop('sourceReviewHold')
    for attempt in state.get('attempts',[]):attempt.setdefault('inputSourceHash',state.get('inputSourceHash'))
    metadata=ref.with_suffix('.generation.json')
    try:
        generation=json.loads(metadata.read_text('utf-8'))
        recorded=generation.get('archivedSha256') or generation.get('sha256')
        ready=generation.get('status') in ('reference_ready_for_native_multiview','reference_reviewed_ready_for_panel_preprocess')
        if not ready or recorded!=current:
            state['referenceReadiness']={'ready':ready,'matchingHash':recorded==current,'checkedAt':now()}
            state['status']='waiting_reference_metadata'
            save(job,state);return state
    except (OSError,ValueError):
        state['status']='waiting_reference_metadata';save(job,state);return state
    if state.get('inputSourceHash')!=current and state.get('inputSourceHash'):
        previous={key:state[key] for key in ('inputSourceHash','rawGLB','inferenceReport','reference','viewsDir','status') if key in state}
        previous['supersededAt']=now();state.setdefault('revisions',[]).append(previous)
        for key in ('rawGLB','inferenceReport','reference','viewsDir','error'):state.pop(key,None)
        state['status']='waiting_reference'
        state['referenceRevisionRequested']={'previousInputSourceHash':previous['inputSourceHash'],'currentInputSourceHash':current,'reason':'Reviewed canonical reference changed; regenerate before ordinary first-attempt work'}
    if state.get('rawGLB'):
        state['status']='raw_ready';save(job,state);return state
    prep_hash=sha(Path(__file__).with_name('prepare_triptych.py'))
    if state.get('inputSourceHash')!=current or state['status'] in ('waiting_reference','waiting_reference_metadata') or (state['status']=='reference_rejected' and state.get('preprocessToolHash')!=prep_hash):
        try:
            prepared=prepare(ref)
            state.update(prepared);state.update(status='ready',inputSourceHash=current,reference=evidence(Path(prepared['reference'])),generationMetadata=evidence(metadata))
            state.pop('error',None)
        except Exception as exc:state.update(status='reference_rejected',inputSourceHash=current,error=str(exc))
        state['preprocessToolHash']=prep_hash;save(job,state)
    return state
def run(job,state,max_attempts):
    revision_attempts=[a for a in state['attempts'] if a.get('inputSourceHash',state['inputSourceHash'])==state['inputSourceHash'] and a.get('seed',9247)==state.get('seed',9247) and not a.get('retryableResourceWait')]
    if len(revision_attempts)>=max_attempts:state['status']='failed_needs_review';save(job,state);return
    number=len(state['attempts'])+1
    seed=state.get('seed',9247)
    identity=f"{job['region']}--{job['asset']}-a{number:03d}"
    folder=ART/'reports'/identity;report=folder/(identity+'-pixal-mv-1024-'+str(seed)+'.json')
    while report.exists():
        number+=1;identity=f"{job['region']}--{job['asset']}-a{number:03d}"
        folder=ART/'reports'/identity;report=folder/(identity+'-pixal-mv-1024-'+str(seed)+'.json')
    log=ART/'logs'/(identity+'.log');log.parent.mkdir(parents=True,exist_ok=True)
    command=[sys.executable,'-B','-u',str(ART/'tools/run_raw_job.py'),'--job-id',identity,'--views-dir',state['viewsDir'],'--seed',str(seed)]
    attempt={'id':identity,'startedAt':now(),'report':str(report),'log':str(log),'command':command,'inputSourceHash':state['inputSourceHash'],'seed':seed}
    state['attempts'].append(attempt);state['status']='running';save(job,state)
    summary_path=ART/'queue/summary.json'
    if summary_path.exists():
        summary=json.loads(summary_path.read_text('utf-8'));summary['activeJob']={'region':job['region'],'asset':job['asset'],'attempt':identity,'seed':seed};summary['updatedAt']=now();atomic_json(summary_path,summary)
    print('RAW_JOB_START',job['region'],job['asset'],identity,flush=True)
    with log.open('w',encoding='utf-8') as handle:
        child=subprocess.Popen(command,cwd=str(ROOT),stdout=handle,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        attempt['pid']=child.pid;save(job,state)
        code=child.wait()
    attempt.update(exitCode=code,finishedAt=now())
    raw=verified_raw(report)
    if code==0 and raw:state.update(raw);state['status']='raw_ready'
    else:
        failed=json.loads(report.read_text('utf-8')) if report.exists() else {}
        if failed.get('status')=='gpu_busy' or ('startup guard' in failed.get('error','') and not failed.get('generation_started')):
            attempt['retryableResourceWait']=True;state['nextEligibleTime']=time.time()+30
        state['status']='retry_pending' if len(revision_attempts)+1<max_attempts else 'failed_needs_review'
        if attempt.get('retryableResourceWait'):state['status']='retry_pending'
        state['error']='Native worker exited without completed verified raw report; inspect attempt log'
    save(job,state);print('RAW_JOB_END',job['region'],job['asset'],state['status'],flush=True)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--watch',action='store_true');parser.add_argument('--once',action='store_true')
    parser.add_argument('--max-attempts',type=int,default=2);args=parser.parse_args()
    ART.joinpath('queue').mkdir(parents=True,exist_ok=True)
    lock=(ART/'queue/controller.lock').open('a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
    import msvcrt
    msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
    registry=jobs();atomic_json(ART/'registry.json',{'assetCount':len(registry),'mainGameplayAssets':145,'additionalHeroes':2,'jobs':registry})
    previous=None
    while True:
        if (ART/'queue/stop-after-current').exists():print('QUEUE_STOP_REQUESTED',flush=True);break
        states=[sync(job) for job in registry];counts={}
        for state in states:counts[state['status']]=counts.get(state['status'],0)+1
        summary={'updatedAt':now(),'total':len(registry),'counts':counts,'next':None}
        ready=[(job,state) for job,state in zip(registry,states) if state['status'] in ('ready','retry_pending') and state.get('nextEligibleTime',0)<=time.time()]
        # References are consumed as they arrive; small core assets lead LOD validation.
        def priority(pair):
            job,state=pair
            rank=-3 if state.get('sourceRevisionRequested') or state.get('referenceRevisionRequested') else -2 if (job['region'],job['asset']) in (('classic','chance_wheel'),('classic','skyscraper_1')) else -1 if job['asset'] in ('builders_guild','chance_wheel','lighthouse','windmill') else {'core':0,'public':1,'large':2,'hero':3}[job['class']]
            return rank if rank < 0 else (0 if job['region']=='classic' else rank+1),job['region'],job['asset']
        ready.sort(key=priority)
        if ready:summary['next']=ready[0][0]
        atomic_json(ART/'queue/summary.json',summary)
        marker=json.dumps(counts,sort_keys=True)
        if marker!=previous:print('QUEUE_STATUS',marker,flush=True);previous=marker
        if counts.get('raw_ready')==len(registry) and not args.watch:
            print('RAW_STAGE_COMPLETE',len(registry),flush=True);break
        if args.watch and not ready and not counts.get('running'):
            # CPU derivatives of the final neural job may enqueue GPU exports
            # only after all raw sources exist. Stay alive to drain those exports
            # and to recognize later explicitly reviewed source revisions. This
            # also drains pending exports while a rejected reference is revised.
            pending=[p for p in (ART/'queue/native-export-replays').glob('*.json') if json.loads(p.read_text('utf8')).get('status')=='requested']
            import psutil
            if pending and psutil.virtual_memory().available>=11.5*1024**3:
                with (ART/'logs/export-tail-controller.log').open('a',encoding='utf8') as log:
                    result=subprocess.run([sys.executable,'-B','-u',str(ART/'tools/run_export_tail.py')],cwd=str(ROOT),stdout=log,stderr=subprocess.STDOUT)
                if result.returncode:print('EXPORT_TAIL_FAILURE_REQUIRES_REVIEW',result.returncode,flush=True)
            time.sleep(10);continue
        if counts.get('running'):
            time.sleep(10)
        elif ready:
            import psutil
            if psutil.virtual_memory().available<11.5*1024**3:time.sleep(10);continue
            run(*ready[0],args.max_attempts)
            if args.once:break
        elif not args.watch:break
        else:time.sleep(10)
    msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1);lock.close()
if __name__=='__main__':main()

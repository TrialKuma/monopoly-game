"""Queue an explicitly requested neural retry while preserving all previous evidence."""
from pathlib import Path
import argparse,json
from prepare_triptych import ART,atomic_json,evidence,sha
from datetime import datetime,timezone
def main():
    parser=argparse.ArgumentParser();parser.add_argument('region');parser.add_argument('asset');parser.add_argument('--seed',type=int,required=True);parser.add_argument('--reason',required=True);args=parser.parse_args()
    path=ART/'queue'/args.region/(args.asset+'.json');state=json.loads(path.read_text('utf-8'))
    if state['status']=='running':raise RuntimeError('Wait for the current native worker; never overwrite an active attempt')
    inference=json.loads(Path(state['inferenceReport']['path']).read_text('utf-8'))
    previous={k:state[k] for k in ('rawGLB','inferenceReport','reference','reuse','inputSourceHash','viewsDir') if k in state}
    previous['reason']=args.reason;previous['supersededAt']=datetime.now(timezone.utc).isoformat();state.setdefault('revisions',[]).append(previous)
    views=Path(inference['input']).parent
    state['viewsDir']=str(views)
    canonical=ART/'references'/args.region/(args.asset+'.png');state['independentInputs']=not canonical.exists()
    state['reference']=evidence(views/'reference.json' if (views/'reference.json').exists() else views/'transforms.json')
    if state['independentInputs']:state['inputSourceHash']=sha(views/'transforms.json')
    state['seed']=args.seed;state['sourceRevisionRequested']={'reason':args.reason,'requestedSeed':args.seed,'previousRawSha256':state['rawGLB']['sha256']}
    for key in ('rawGLB','inferenceReport','reuse'):state.pop(key,None)
    state['status']='ready';state.pop('nextEligibleTime',None);atomic_json(path,state)
    candidate=ART/'candidates'/args.region/(args.asset+'.json')
    if candidate.exists():
        report=json.loads(candidate.read_text('utf-8'));report['status']='source_revision_needed';report['visualReview']={'status':'rejected','reviewer':'/root','notes':args.reason};atomic_json(candidate,report)
    print(args.region,args.asset,'queued with seed',args.seed)
if __name__=='__main__':main()

"""Register one explicitly reviewed same-reference retry, preserving all evidence."""
from pathlib import Path
import argparse,json
from prepare_triptych import ART,atomic_json,evidence,sha
from run_raw_queue import now

def register(config_path):
    cfg=json.loads(config_path.read_text('utf8'));key=cfg['region']+'/'+cfg['asset']
    path=ART/'queue'/cfg['region']/(cfg['asset']+'.json');state=json.loads(path.read_text('utf8'))
    if state['status']!='raw_ready' or state['rawGLB']['sha256']!=cfg['rawSha256']:raise ValueError('Current completed source identity changed')
    if sha(state['rawGLB']['path'])!=cfg['rawSha256']:raise ValueError('Raw bytes changed')
    if key in json.loads((ART/'approved-assets.json').read_text('utf8'))['assets']:raise ValueError('Never retry an approved source automatically')
    completed=[]
    for attempt in state.get('attempts',[]):
        if attempt.get('inputSourceHash')!=state['inputSourceHash']:continue
        report=Path(attempt['report'])
        if not report.exists():continue
        row=json.loads(report.read_text('utf8'))
        if row.get('status')=='generated_unrigged_part_candidate':completed.append(row)
    if len(completed)!=1:raise ValueError('This helper only permits the first independently reviewed retry for this reference')
    if int(cfg['seed'])==int(completed[0]['seed']):raise ValueError('Retry must use a distinct seed')
    proofs=[]
    for wanted in cfg['reviewEvidence']:
        proof=evidence(ART/wanted['path'])
        if proof['sha256']!=wanted['sha256']:raise ValueError('Review evidence changed')
        proofs.append(proof)
    if not proofs:raise ValueError('Actual reviewed evidence required')
    old={k:state[k] for k in ('rawGLB','inferenceReport','reference','inputSourceHash','viewsDir')}
    old.update(reason=cfg['reason'],supersededAt=now(),sourceReviewEvidence=proofs,reviewer=cfg['reviewer'],retryRequest=evidence(config_path))
    state.setdefault('revisions',[]).append(old)
    hpath=ART/'hybrid-queue/holds.json';holds=json.loads(hpath.read_text('utf8'))
    holds[key]={'rawSha256':cfg['rawSha256'],'reason':cfg['reason'],'sourceReviewEvidence':proofs,'heldAt':now()};atomic_json(hpath,holds)
    for name in ('rawGLB','inferenceReport','error','nextEligibleTime','sourceReviewHold'):state.pop(name,None)
    state.update(status='ready',seed=cfg['seed'],independentInputs=False,sourceRevisionRequested={'reason':cfg['reason'],'requestedSeed':cfg['seed'],'previousRawSha256':cfg['rawSha256'],'reviewer':cfg['reviewer'],'sourceReviewEvidence':proofs,'request':evidence(config_path)},updatedAt=now())
    atomic_json(path,state);print(json.dumps({'status':'same_reference_retry_registered','key':key,'seed':cfg['seed'],'oldSourcePreserved':cfg['rawSha256']}),flush=True)

if __name__=='__main__':
    cli=argparse.ArgumentParser();cli.add_argument('request',type=Path);register(cli.parse_args().request.resolve())

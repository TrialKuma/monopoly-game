"""Resume exact-source CPU-surface/native-field derivatives, without approving them.

Native export requests are consumed under the existing GPU lock between neural
jobs. This controller only runs CPU Blender preparation and final inspection.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,subprocess,sys,time
from prepare_triptych import ART,ROOT,atomic_json,evidence,sha
from cpu_blender_lease import cpu_blender_lease
from run_lod_queue import geometry_only_root, geometry_ready

BLENDER=Path('C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
FOLDER=ART/'hybrid-queue'
POLICY='surface-field-v1'

def now():return datetime.now(timezone.utc).isoformat()
def read(path):return json.loads(Path(path).read_text('utf-8'))
def approved():return read(ART/'approved-assets.json').get('assets',{})

def eligible():
    decisions=approved();rows=[]
    holds=read(FOLDER/'holds.json') if (FOLDER/'holds.json').exists() else {}
    for state_path in sorted((ART/'queue').glob('*/*.json')):
        state=read(state_path)
        if state.get('status')!='raw_ready' or 'region' not in state:continue
        key=state['region']+'/'+state['asset']
        if key in decisions:continue
        if holds.get(key,{}).get('rawSha256')==state['rawGLB']['sha256']:continue
        candidate_path=ART/'candidates'/state['region']/(state['asset']+'.json')
        geometry_only=state.get('processingOverrides',{}).get('geometryOnly') is True
        if geometry_only:candidate_path=geometry_only_root(state)/state['region']/(state['asset']+'.json')
        if not candidate_path.exists():continue
        candidate=read(candidate_path)
        if candidate.get('processingRevision',0)!=state.get('processingRevision',0):continue
        if not (geometry_ready(candidate) if geometry_only else candidate.get('processingComplete')) or candidate.get('nativeSurfaceExport') or candidate.get('animation') or candidate.get('localSurfaceRepair') or candidate.get('componentLocalRepair'):continue
        if candidate.get('source',{}).get('rawGLB',{}).get('sha256')!=state['rawGLB']['sha256']:continue
        if not candidate.get('rawSourceUnchanged') or (not geometry_only and not candidate.get('renderedSource')):continue
        inference=read(state['inferenceReport']['path']);capture=inference.get('native_mobile_export_receipt')
        if not capture or not Path(capture['path']).exists():continue
        field=read(capture['path'])
        if field.get('status') not in ('frozen_field_ready_for_optional_export','exported_pending_visual_review'):continue
        if field['rawGLB']['sha256']!=state['rawGLB']['sha256']:continue
        if geometry_only and candidate.get('geometryOnlyFieldReceipt',{}).get('sha256')!=capture['sha256']:continue
        identity=state['region']+'--'+state['asset']+'-'+state['rawGLB']['sha256'][:12]+'-'+POLICY
        if geometry_only:identity+='-geometry-only'
        if state.get('processingRevision',0):identity+='-p'+str(state['processingRevision'])
        rows.append((identity,state_path,candidate_path,capture,state))
    return rows

def command(script,*args):return [str(BLENDER),'--background','--threads','4','--python-exit-code','1','--python',str(ART/'tools'/script),'--',*map(str,args)]

def run_child(job,path,phase,cmd):
    log=ART/'logs'/('hybrid-'+job['identity']+'-'+phase+'.log')
    job.update(status='running_'+phase,phase=phase,command=cmd,log=str(log),updatedAt=now())
    print('HYBRID_START',job['key'],phase,flush=True)
    with cpu_blender_lease(ART,8 if phase=='prepare' else 4.5), log.open('w',encoding='utf-8') as handle:
        child=subprocess.Popen(cmd,cwd=str(ROOT),stdout=handle,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        job['pid']=child.pid;atomic_json(path,job);code=child.wait()
    job.update(exitCode=code,updatedAt=now());job.pop('pid',None)
    if code:job.update(status='failed_needs_review');atomic_json(path,job);return False
    return True

def advance(job,path):
    import psutil
    if job['status'] not in ('ready_to_prepare','waiting_native_export') and not job['status'].startswith('running_'):return False
    state=read(job['statePath']);key=job['key']
    holds=read(FOLDER/'holds.json') if (FOLDER/'holds.json').exists() else {}
    recorded_repair=job.get('recordedRepair')
    if not recorded_repair and job.get('processingRevision',0)!=state.get('processingRevision',0):
        request_path=Path(job['requestPath'])
        if request_path.exists():
            request=read(request_path)
            if request.get('status')=='running':return False
            if request.get('status')=='requested':
                request.update(status='cancelled_processing_revision_superseded',reason='A reviewed same-source geometry cleanup requested a new low surface revision');atomic_json(request_path,request)
        job.update(status='superseded_processing_revision_preserved');atomic_json(path,job);return True
    if recorded_repair:
        original=read(job['candidateReportPath'])
        repair=original.get('localSurfaceRepair')
        if not repair or repair['source']['sha256']!=recorded_repair['source']['sha256'] or repair['receipt']['sha256']!=recorded_repair['receipt']['sha256']:
            job.update(status='failed_needs_review',error='Explicit repair identity changed');atomic_json(path,job);return True
    if not recorded_repair and holds.get(key,{}).get('rawSha256')==job['rawSha256']:
        request_path=Path(job['requestPath'])
        if request_path.exists():
            request=read(request_path)
            if request.get('status')=='running':return False
            if request.get('status')=='requested':
                request.update(status='cancelled_source_repair_needed',reason=holds[key]['reason']);atomic_json(request_path,request)
        job.update(status='held_source_repair_needed',reason=holds[key]['reason']);atomic_json(path,job);return True
    if key in approved():job.update(status='skipped_already_approved');atomic_json(path,job);return True
    if state.get('rawGLB',{}).get('sha256')!=job['rawSha256']:
        job.update(status='superseded_source_preserved');atomic_json(path,job);return True
    status=job['status']
    if status.startswith('running_'):
        if not psutil.pid_exists(job.get('pid',-1)):
            job.update(status='interrupted_needs_review');atomic_json(path,job)
        return False
    if status=='waiting_native_export':
        request=read(job['requestPath'])
        if request.get('status')=='failed':job.update(status='failed_needs_review',error=request.get('error'));atomic_json(path,job);return True
        if request.get('status')!='completed_pending_visual_review':return False
        if psutil.virtual_memory().available<4.5*2**30:return False
        # The frozen geometry-stage report carries identical raw review pixels.
        surface=read(Path(job['surfacePath']).with_suffix('.json'))
        cmd=command('process_native_mobile.py','--state',job['statePath'],'--receipt',request['receipt']['path'],'--output-root',job['outputRoot'])
        if not surface.get('geometryOnly'):cmd.extend(['--reuse-source-review',surface['candidateReport']['path']])
        if not run_child(job,path,'finalize',cmd):return True
        final=Path(job['outputRoot'])/state['region']/(state['asset']+'.json')
        checker="import fs from 'node:fs'; import {verifyNativeSurfaceExport} from './tests/ai-city-fixture.mjs'; const p=JSON.parse(fs.readFileSync(process.argv[1])); verifyNativeSurfaceExport(p); console.log('exact native surface provenance and field distances passed');"
        audit=subprocess.run(['node','--input-type=module','-e',checker,str(final)],cwd=str(ROOT),capture_output=True,text=True)
        job['sourceVerification']={'exitCode':audit.returncode,'output':audit.stdout[-1000:]}
        if audit.returncode:
            job.update(status='failed_needs_review',error=audit.stderr[-4000:]);atomic_json(path,job);return True
        for cmd in ([sys.executable,'-B',str(ART/'tools/make_review_sheet.py'),str(final)],
                    [sys.executable,'-B',str(ART/'tools/promote_processed_candidate.py'),str(final)]):
            result=subprocess.run(cmd,cwd=str(ROOT),capture_output=True,text=True)
            if result.returncode:
                job.update(status='failed_needs_review',error=result.stderr[-4000:]);atomic_json(path,job);return True
        job.update(status='pending_visual_review',candidate=evidence(ART/'candidates'/state['region']/(state['asset']+'.glb')),report=evidence(ART/'candidates'/state['region']/(state['asset']+'.json')),finishedAt=now())
        atomic_json(path,job);print('HYBRID_REVIEW_READY',key,job['candidate']['sha256'],flush=True);return True
    if status=='ready_to_prepare':
        if psutil.virtual_memory().available<8*2**30:return False
        original=read(job['candidateReportPath'])
        if original['processedCandidate']['sha256']!=job['originalCandidateSha256']:
            job.update(status='candidate_changed_needs_review');atomic_json(path,job);return True
        cmd=command('prepare_native_surface.py','--candidate-report',job['candidateReportPath'],'--field-receipt',job['fieldReceiptPath'],'--output',job['surfacePath'])
        if recorded_repair:cmd.append('--allow-recorded-local-repair')
        if not run_child(job,path,'prepare',cmd):return True
        request={'status':'requested','sourceReceipt':job['fieldReceiptPath'],'triangles':job['requestedTriangles'],'textureSize':1024,'surfaceNPZ':job['surfacePath'],'purpose':'Exact same-source complete CPU low surface plus native UV/original neural field material. Requires independent rendered approval.'}
        if recorded_repair:request['purpose']='Explicitly recorded bounded repair applied before source-derived low surface; original inference/field remain distinct and unchanged. Native UV/material replay adds no geometry. Requires independent review.'
        atomic_json(Path(job['requestPath']),request);job.update(status='waiting_native_export');atomic_json(path,job);return True
    return False

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--watch',action='store_true');parser.add_argument('--once',action='store_true');parser.add_argument('--scan',action='store_true');args=parser.parse_args()
    if args.scan:
        print(json.dumps([{'key':r[4]['region']+'/'+r[4]['asset'],'raw':r[4]['rawGLB']['sha256'],'field':r[3]} for r in eligible()],ensure_ascii=False,indent=2));return
    FOLDER.mkdir(parents=True,exist_ok=True);(FOLDER/'jobs').mkdir(exist_ok=True)
    import msvcrt
    handle=(FOLDER/'controller.lock').open('a+b');handle.seek(0);handle.write(b'0');handle.flush();handle.seek(0);msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
    while not (FOLDER/'stop-after-current').exists():
        for identity,state_path,candidate_path,capture,state in eligible():
            path=FOLDER/'jobs'/(identity+'.json')
            if path.exists():continue
            # A manually scheduled validation already owns this source surface.
            duplicate=False
            for existing in (ART/'queue/native-export-replays').glob('*.json'):
                row=read(existing)
                if row.get('sourceReceipt')==capture['path'] and row.get('surfaceNPZ') and row.get('status') in ('requested','running','completed_pending_visual_review'):
                    surface_proof=Path(row['surfaceNPZ']).with_suffix('.json')
                    if surface_proof.exists() and read(surface_proof).get('candidate',{}).get('sha256')==read(candidate_path)['processedCandidate']['sha256']:
                        duplicate=True;break
            if duplicate:continue
            work=ART/'work/hybrid-batch'/identity
            job={'status':'ready_to_prepare','identity':identity,'key':state['region']+'/'+state['asset'],'createdAt':now(),'statePath':str(state_path),'candidateReportPath':str(candidate_path),'originalCandidateSha256':read(candidate_path)['processedCandidate']['sha256'],'rawSha256':state['rawGLB']['sha256'],'fieldReceiptPath':capture['path'],'surfacePath':str(work/'surface.npz'),'outputRoot':str(work/'candidates'),'requestPath':str(ART/'queue/native-export-replays'/(identity+'.json')),'requestedTriangles':read(candidate_path)['requestedTriangles']}
            job['processingRevision']=state.get('processingRevision',0)
            atomic_json(path,job)
        paths=list((FOLDER/'jobs').glob('*.json'));counts={}
        for path in paths:
            status=read(path)['status'];counts[status]=counts.get(status,0)+1
        atomic_json(FOLDER/'summary.json',{'updatedAt':now(),'counts':counts,'automaticApproval':False})
        paths.sort(key=lambda p: (read(p)['status']!='waiting_native_export',read(p)['key'].split('/')[0]!='classic',p.name))
        progressed=False
        for path in paths:
            if advance(read(path),path):progressed=True;break
        if args.once or (not args.watch and not progressed):break
        if not progressed:time.sleep(10)
    msvcrt.locking(handle.fileno(),msvcrt.LK_UNLCK,1);handle.close()

if __name__=='__main__':main()

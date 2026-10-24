"""Serial CPU-only candidate processing; visual approval is deliberately external."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,json,subprocess,sys,time
from prepare_triptych import ART,ROOT,atomic_json,sha,evidence
from cpu_blender_lease import cpu_blender_lease
BLENDER=Path('C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
def now():return datetime.now(timezone.utc).isoformat()
def geometry_only_root(state):
    return ART/'work/geometry-only-low'/(state['region']+'--'+state['asset']+'-'+state['rawGLB']['sha256'][:16]+'-r'+str(state.get('processingRevision',0)))

def geometry_ready(report):
    requested=report.get('requestedTriangles',0)
    ceiling=32000 if 0 < requested <= 32000 else 46000 if 32000 < requested <= 46000 else 65000 if 46000 < requested <= 65000 else 0
    return report.get('geometryOnly') is True and report.get('geometryReady') is True and report.get('status')=='geometry_ready_for_native_field' and report.get('processingComplete') is False and report.get('geometryExportPreservation',{}).get('allOrientedTrianglesExactlyPreserved') is True and 0 < report.get('triangles',0) <= ceiling

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--watch',action='store_true');parser.add_argument('--once',action='store_true');parser.add_argument('--far-when-idle',action='store_true');args=parser.parse_args()
    folder=ART/'lod-queue';folder.mkdir(parents=True,exist_ok=True)
    lock=(folder/'controller.lock').open('a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
    import msvcrt,psutil
    msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
    while not (folder/'stop-after-current').exists():
        states=[(path,json.loads(path.read_text('utf-8'))) for path in sorted((ART/'queue').glob('*/*.json'))]
        available=[(path,state) for path,state in states if state.get('status')=='raw_ready']
        registry_path=ART/'approved-assets.json';approved=json.loads(registry_path.read_text('utf-8')).get('assets',{}) if registry_path.exists() else {}
        far_registry=ART/'approved-far-assets.json';approved_far=json.loads(far_registry.read_text('utf-8')).get('assets',{}) if far_registry.exists() else {}
        eligible_far=('villa_3','shop_2','hotel_2','tower_2','junction_hub')
        variants=[(path,state,'near') for path,state in available]
        if args.far_when_idle:variants += [(path,state,'far') for path,state in available if state['asset'] in eligible_far and state['region']+'/'+state['asset'] in approved]
        ready=[];counts={'rawAvailable':len(available),'pendingVisual':0,'approved':0,'needsReview':0,'farCandidates':0,'geometryReady':0}
        for path,state,lod in variants:
            if lod=='near' and state['region']+'/'+state['asset'] in approved:
                counts['approved']+=1;continue
            if lod=='far' and state['region']+'/'+state['asset'] in approved_far:
                counts['farCandidates']+=1;continue
            target=ART/('candidates-far' if lod=='far' else 'candidates')/state['region']/(state['asset']+'.json')
            geometry_only=lod=='near' and state.get('processingOverrides',{}).get('geometryOnly') is True
            if geometry_only:target=geometry_only_root(state)/state['region']/(state['asset']+'.json')
            raw_sha=state['rawGLB']['sha256'];receipt=folder/state['region']/(state['asset']+'-'+lod+'-'+raw_sha[:16]+'-r'+str(state.get('processingRevision',0))+'.json')
            if geometry_only:receipt=receipt.with_name(receipt.stem+'-geometry-only.json')
            if target.exists():
                report=json.loads(target.read_text('utf-8'))
                if geometry_only and geometry_ready(report) and report.get('source',{}).get('rawGLB',{}).get('sha256')==raw_sha and report.get('processingRevision',0)==state.get('processingRevision',0) and report.get('rawSourceUnchanged'):
                    output=report.get('processedCandidate',{})
                    if output.get('path') and Path(output['path']).is_file() and sha(output['path'])==output['sha256']:
                        counts['geometryReady']+=1;continue
                near_match=lod!='far' or (report.get('derivedFromNear',{}).get('sha256')==approved.get(state['region']+'/'+state['asset'],{}).get('candidate',{}).get('sha256') and report.get('farSimplification',{}).get('settings',{}).get('preservetopology') and report.get('farSimplification',{}).get('settings',{}).get('targetfacenum')==state.get('farProcessingOverrides',{}).get('triangles',12000) and report.get('farShading',{}).get('normals')=='actual_geometry_only')
                if near_match and report.get('source',{}).get('rawGLB',{}).get('sha256')==raw_sha and report.get('rawSourceUnchanged') and report.get('renderedSource') and (lod=='far' or report.get('processingRevision',0)==state.get('processingRevision',0)):
                    output=report.get('processedCandidate',{})
                    if output.get('path') and Path(output['path']).exists() and sha(output['path'])==output['sha256']:
                        recorded=approved.get(state['region']+'/'+state['asset'],{}).get('candidate',{}).get('sha256')
                        key='farCandidates' if lod=='far' else 'approved' if recorded==output['sha256'] else 'pendingVisual' if report['status']=='exported_pending_visual_review' else 'needsReview'
                        counts[key]+=1;continue
            if receipt.exists():
                previous=json.loads(receipt.read_text('utf-8'))
                if previous.get('status')=='running' and psutil.pid_exists(previous.get('pid',-1)):continue
                if previous.get('status') in ('failed_needs_review','interrupted_needs_review'):counts['needsReview']+=1;continue
                if previous.get('status')=='running':
                    previous['status']='interrupted_needs_review';atomic_json(receipt,previous);counts['needsReview']+=1;continue
            ready.append((path,state,target,receipt,lod))
        # Complete the first whole reviewed region before expanding CPU backlog.
        # Its approved far derivatives are short and needed for whole-map review.
        ready.sort(key=lambda item:(0 if item[1]['region']=='classic' and item[4]=='near' else 1 if item[1]['region']=='classic' else 2 if item[4]=='near' else 3,item[1]['region'],item[1]['asset']))
        counts['ready']=len(ready);atomic_json(folder/'summary.json',{'updatedAt':now(),**counts})
        if not ready:
            if args.watch:time.sleep(12);continue
            break
        if psutil.virtual_memory().available<4.5*1024**3:time.sleep(15);continue
        path,state,target,receipt,lod=ready[0]
        key=state['region']+'/'+state['asset'];tris=state.get('farProcessingOverrides',{}).get('triangles',12000) if lod=='far' else 45000 if state['class'] in ('large','hero') else 30000
        overrides=state.get('processingOverrides',{}) if lod=='near' else {}
        geometry_only=lod=='near' and overrides.get('geometryOnly') is True
        tris=overrides.get('triangles',tris)
        log=ART/'logs'/('lod-'+lod+'-'+state['region']+'--'+state['asset']+'-'+state['rawGLB']['sha256'][:12]+'.log')
        command=[str(BLENDER),'--background','--threads','4','--python-exit-code','1','--python',str(ART/'tools/process_lod.py'),'--','--state',str(path),'--triangles',str(tris),'--voxel-size','0.006' if lod=='far' else '0.003','--texture-size','512' if lod=='far' else '1024','--lod',lod]
        if geometry_only:command.extend(['--geometry-only','--output-root',str(geometry_only_root(state))])
        if lod=='far':
            near=Path(approved[key]['candidate']['path']);near=near if near.is_absolute() else ROOT/near
            surface=ART/'work/far-preserved'/state['region']/(state['asset']+'.npz')
            result=subprocess.run([sys.executable,'-B',str(ART/'tools/simplify_far_surface.py'),str(near),str(surface),'--triangles',str(tris)],cwd=str(ROOT),capture_output=True,text=True)
            if result.returncode:raise RuntimeError('Far preservation failed: '+result.stderr)
            command.extend(['--surface',str(surface)])
        if overrides.get('removeDarkGround'):command.append('--remove-dark-ground')
        if overrides.get('repairedSource'):
            command.extend(['--repaired-source',overrides['repairedSource'],'--repair-report',overrides['repairReport']])
        job={'status':'running','key':key,'lod':lod,'startedAt':now(),'sourceRawSha256':state['rawGLB']['sha256'],'command':command,'log':str(log)}
        print('LOD_JOB_START',key,flush=True)
        with cpu_blender_lease(ART,4.5 if lod=='far' else 9), log.open('w',encoding='utf-8') as handle:
            child=subprocess.Popen(command,cwd=str(ROOT),stdout=handle,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            job['pid']=child.pid;atomic_json(receipt,job);exitcode=child.wait()
        job.update(exitCode=exitcode,finishedAt=now())
        report=json.loads(target.read_text('utf-8')) if target.exists() else {}
        success=exitcode==0 and (geometry_ready(report) if geometry_only else report.get('processingComplete')) and report.get('source',{}).get('rawGLB',{}).get('sha256')==state['rawGLB']['sha256'] and report.get('rawSourceUnchanged')
        if success:
            if geometry_only:job.update(status='geometry_ready_for_native_field',report=evidence(target),geometryOnly=True)
            else:
                result=subprocess.run([sys.executable,'-B',str(ART/'tools/make_review_sheet.py'),str(target)],cwd=str(ROOT),capture_output=True,text=True)
                job['reviewSheetExitCode']=result.returncode;job['status']='pending_visual_review' if result.returncode==0 else 'failed_needs_review';job['report']=evidence(target)
        else:job['status']='failed_needs_review'
        atomic_json(receipt,job);print('LOD_JOB_END',key,job['status'],flush=True)
        if args.once:break
    msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1);lock.close()
if __name__=='__main__':main()

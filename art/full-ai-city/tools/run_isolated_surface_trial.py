"""An explicitly requested same-source LOD comparison; no auto promotion."""
from pathlib import Path
import argparse,json,sys,subprocess,time
from prepare_triptych import ART,ROOT,atomic_json,evidence,sha
from cpu_blender_lease import cpu_blender_lease
from run_hybrid_queue import BLENDER,now
def read(p):return json.loads(Path(p).read_text('utf8'))
def main():
    cli=argparse.ArgumentParser();cli.add_argument('config',type=Path);options=cli.parse_args();config=read(options.config)
    region,asset=config['region'],config['asset'];work=ART/'work'/config['workName'];work.mkdir(parents=True,exist_ok=True)
    state_path=ART/'queue'/region/(asset+'.json');state=read(state_path)
    assert state['rawGLB']['sha256']==config['rawSha256'] and sha(state['rawGLB']['path'])==config['rawSha256']
    canonical=ART/'candidates'/region/(asset+'.json');old=read(canonical);assert old['processedCandidate']['sha256']==config['canonicalSha256']
    capture=read(state['inferenceReport']['path'])['native_mobile_export_receipt'];assert sha(capture['path'])==capture['sha256']
    assert read(capture['path'])['rawGLB']['sha256']==config['rawSha256']
    receipt=work/'trial.json';atomic_json(receipt,{'status':'queued','createdAt':now(),'configuration':evidence(options.config),'source':state['rawGLB'],
        'originalCandidate':old['processedCandidate'],'fieldReceipt':capture,'purpose':config['purpose'],'voxelSize':config['voxelSize'],'requestedTriangles':config['triangles']})
    def run(script,args,guard,phase):
        command=[str(BLENDER),'--background','--threads','4','--python-exit-code','1','--python',str(ART/'tools'/script),'--',*map(str,args)]
        row=read(receipt);row.update(status='waiting_'+phase,command=command);atomic_json(receipt,row)
        with cpu_blender_lease(ART,guard),(work/(phase+'.log')).open('w',encoding='utf8') as log:
            row.update(status='running_'+phase);atomic_json(receipt,row)
            result=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
        if result.returncode==75:
            row.update(status='held_before_source_import');atomic_json(receipt,row);raise SystemExit(0)
        if result.returncode:
            row.update(status='failed_'+phase,exitCode=result.returncode,log=str(work/(phase+'.log')))
            atomic_json(receipt,row)
        result.check_returncode()
    low=work/'low'/region/(asset+'.json')
    if not low.exists():run('process_lod.py',['--state',state_path,'--triangles',config['triangles'],'--voxel-size',config['voxelSize'],'--texture-size',1024,'--lod','near','--nearest-texture','--uv-angle',config.get('uvAngle',66),'--output-root',work/'low',*(['--geometry-only'] if config.get('geometryOnly') else [])],9,'low')
    if config.get('geometryOnly'):
        assert read(low).get('geometryReady') and read(low).get('status')=='geometry_ready_for_native_field' and not read(low).get('processingComplete')
    else:assert read(low).get('processingComplete')
    surface=work/'surface.npz'
    if not surface.with_suffix('.json').exists():run('prepare_native_surface.py',['--candidate-report',low,'--field-receipt',capture['path'],'--output',surface],8,'prepare')
    identity=config['workName']+'-low-'+read(low)['processedCandidate']['sha256'][:12]
    request=ART/'queue/native-export-replays'/(identity+'.json')
    if not request.exists():atomic_json(request,{'status':'requested','sourceReceipt':capture['path'],'triangles':config['triangles'],'textureSize':1024,'surfaceNPZ':str(surface),'purpose':config['purpose']})
    row=read(receipt);row.update(status='waiting_native_export',lowReport=evidence(low),requestPath=str(request));atomic_json(receipt,row)
    while read(request)['status'] in ('requested','running'):time.sleep(15)
    q=read(request);assert q['status']=='completed_pending_visual_review',q
    final=work/'final'/region/(asset+'.json')
    if not final.exists():run('process_native_mobile.py',['--state',state_path,'--receipt',q['receipt']['path'],'--output-root',work/'final',*([] if config.get('geometryOnly') else ['--reuse-source-review',read(surface.with_suffix('.json'))['candidateReport']['path']])],4.5,'final')
    assert read(final).get('processingComplete')
    checker="import fs from 'node:fs';import {verifyNativeSurfaceExport} from './tests/ai-city-fixture.mjs';verifyNativeSurfaceExport(JSON.parse(fs.readFileSync(process.argv[1])));console.log('same-source native field proof passed');"
    subprocess.run(['node','--input-type=module','-e',checker,str(final)],cwd=ROOT,check=True)
    subprocess.run([sys.executable,'-B',str(ART/'tools/make_review_sheet.py'),str(final)],cwd=ROOT,check=True)
    assert sha(old['processedCandidate']['path'])==old['processedCandidate']['sha256'],'Canonical changed; inspect separately'
    row=read(receipt);row.update(status='pending_independent_visual_review',finalReport=evidence(final),finalCandidate=read(final)['processedCandidate'],completedAt=now(),canonicalUnchanged=True);atomic_json(receipt,row)
    print(json.dumps(row,ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':main()

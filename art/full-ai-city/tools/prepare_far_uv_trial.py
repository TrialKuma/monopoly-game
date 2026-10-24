"""Explicit far-budget trial from an approved near, queued for native UV only."""
from pathlib import Path
import argparse,json,subprocess,sys
from prepare_triptych import ART,ROOT,atomic_json,sha
from cpu_blender_lease import cpu_blender_lease
from run_hybrid_queue import BLENDER

def main():
    cli=argparse.ArgumentParser();cli.add_argument('region');cli.add_argument('asset');cli.add_argument('--triangles',type=int,required=True);cli.add_argument('--identity',required=True);cli.add_argument('--reason',required=True);args=cli.parse_args()
    if not 12000<=args.triangles<=20000:raise ValueError('Explicit approved experiment range only')
    key=args.region+'/'+args.asset;entry=json.loads((ART/'approved-assets.json').read_text('utf8'))['assets'][key]
    near=Path(entry['candidate']['path']);near=near if near.is_absolute() else ROOT/near
    if sha(near)!=entry['candidate']['sha256']:raise ValueError('Approved source changed')
    work=ART/'work'/args.identity;work.mkdir(parents=True,exist_ok=False)
    surface=work/'far-surface.npz';out=work/'candidates';report=out/args.region/(args.asset+'.json');uv_input=work/'native-uv-input.npz'
    def run(command,label):
        with (work/(label+'.log')).open('w',encoding='utf8') as handle:subprocess.run(command,cwd=str(ROOT),stdout=handle,stderr=subprocess.STDOUT,check=True)
    with cpu_blender_lease(ART,4.5):
        run([sys.executable,'-B',str(ART/'tools/simplify_far_surface.py'),str(near),str(surface),'--triangles',str(args.triangles)],'simplify')
        prefix=[str(BLENDER),'--background','--threads','4','--python-exit-code','1','--python']
        run(prefix+[str(ART/'tools/process_lod.py'),'--','--state',str(ART/'queue'/args.region/(args.asset+'.json')),'--triangles',str(args.triangles),'--lod','far','--texture-size','512','--surface',str(surface),'--nearest-texture','--uv-angle','66','--output-root',str(out)],'low-surface')
        row=json.loads(report.read_text('utf8'))
        if not row.get('processingComplete'):raise ValueError('Incomplete surface')
        row['geometryOrigin']='Exact approved neural-derived near geometry, including its disclosed bounded local repairs where present, simplified with topology and boundary preservation for far use. No substitute building; original inference remains separate and unchanged.'
        row['farBudgetTrial']={'requestedTriangles':args.triangles,'automaticApproval':False,'reason':args.reason}
        atomic_json(report,row)
        blend=out/'blender'/args.region/(args.asset+'.blend')
        run(prefix+[str(ART/'tools/export_neural_uv_input.py'),'--','--report',str(report),'--blend',str(blend),'--sha256',row['processedCandidate']['sha256'],'--output',str(uv_input)],'uv-input')
    request=ART/'queue/native-export-replays'/(args.identity+'.json')
    if request.exists():raise FileExistsError('Preserve previous native request')
    atomic_json(request,{'status':'requested','operation':'native_uv_only','surfaceNPZ':str(uv_input),'purpose':'Explicit source-derived far budget trial from current approved near, native UV charts only. Same facade texture source, no new inference or authored geometry.'})
    print(str(request),flush=True)

if __name__=='__main__':main()

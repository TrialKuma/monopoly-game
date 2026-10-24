"""Render exact repaired-source and final low neutral surfaces at identical views."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys
import bpy
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--candidate',type=Path,required=True);cli.add_argument('--repaired-source',type=Path,required=True);cli.add_argument('--output-directory',type=Path,required=True);cli.add_argument('--views',nargs='+',default=['left']);args=cli.parse_args(sys.argv[sys.argv.index('--')+1:])
    report=json.loads(args.candidate.with_suffix('.json').read_text('utf8'))
    if lod.p.sha256(args.candidate)!=report['processedCandidate']['sha256']:raise ValueError('Candidate changed')
    repair=report['localSurfaceRepair']
    if lod.p.sha256(args.repaired_source)!=repair['source']['sha256']:raise ValueError('Repaired source differs from actual low input')
    args.output_directory.mkdir(parents=True,exist_ok=True)
    settings=SimpleNamespace(region=report['region'],asset=report['asset'],lod='near',height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18,render_directory=args.output_directory)
    outputs=[]
    for label,source,normalize in [('repaired-source-grey',args.repaired_source,True),('final-low-grey',args.candidate,False)]:
        lod.clear_scene();obj,_=lod.p.import_body(source)
        if normalize:lod.p.upright(obj,settings)
        material=bpy.data.materials.new('Neutral diagnostic material');material.use_nodes=True;material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.5,.5,.5,1)
        obj.data.materials.clear();obj.data.materials.append(material);lod.p.select_only([obj])
        gray=args.output_directory/(label+'.glb');bpy.ops.export_scene.gltf(filepath=str(gray),export_format='GLB',use_selection=True)
        settings.render_prefix=label+'-';outputs.append({'variant':label,'source':lod.p.file_evidence(source),**lod.render(gray,settings,args.views)})
    (args.output_directory/'diagnostic.json').write_text(json.dumps({'status':'rendered_pending_visual_interpretation','sourceRaw':report['source']['rawGLB'],'recordedRepair':repair,'candidate':lod.p.file_evidence(args.candidate),'views':outputs,'sourceModelBytesChanged':False},indent=2),'utf8')
    print('REPAIRED_COMPARISON_READY',args.output_directory,flush=True)

if __name__=='__main__':main()

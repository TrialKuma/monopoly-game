"""Separate geometry, normal-map and base-material artifacts using actual GLBs."""
from pathlib import Path
from types import SimpleNamespace
import sys,argparse,json
import bpy
sys.path.insert(0,str(Path(__file__).parent))
from neural_component import GLB
import process_lod as lod

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--region',required=True);parser.add_argument('--asset',required=True);parser.add_argument('--views',nargs='+',default=['front','back','iso']);parser.add_argument('--variants',nargs='+',choices=['near-no-normal','near-grey','raw-grey'],default=['near-no-normal','near-grey','raw-grey']);parser.add_argument('--candidate',type=Path);parser.add_argument('--output-directory',type=Path);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    candidate=(args.candidate or lod.ART/'candidates'/args.region/(args.asset+'.glb')).resolve();report=json.loads(candidate.with_suffix('.json').read_text('utf-8'))
    directory=(args.output_directory or lod.ART/'work/shading-diagnostic'/args.region/args.asset).resolve();directory.mkdir(parents=True,exist_ok=True)
    settings=SimpleNamespace(region=args.region,asset=args.asset,lod='near',height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18,render_directory=directory)
    outputs=[]
    for variant in args.variants:
        path=directory/(variant+'.glb')
        if variant=='near-no-normal':
            g=GLB(candidate)
            for material in g.doc['materials']:material.pop('normalTexture',None)
            g.save(path)
        else:
            lod.clear_scene();source=Path(report['source']['rawGLB']['path']) if variant=='raw-grey' else candidate
            body,_=lod.p.import_body(source)
            if variant=='raw-grey':lod.p.upright(body,settings)
            material=bpy.data.materials.new('Neutral geometry inspection');material.diffuse_color=(.45,.45,.45,1);material.use_nodes=True
            material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.45,.45,.45,1)
            body.data.materials.clear();body.data.materials.append(material)
            lod.p.select_only([body]);bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True)
        settings.render_prefix=variant+'-';outputs.append({'variant':variant,**lod.render(path,settings,args.views)})
    (directory/'diagnostic.json').write_text(json.dumps({'candidate':lod.p.file_evidence(candidate),'raw':report['source']['rawGLB'],'renders':outputs},indent=2),'utf-8')
    print('SHADING_DIAGNOSTIC_READY',directory,flush=True)
if __name__=='__main__':main()

"""Read-only neutral-material views of an exact small candidate; no raw import."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys,shutil
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import process_lod as lod
EXECUTED=Path(__file__).read_bytes()

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument('--report',type=Path,required=True)
    cli.add_argument('--sha256',required=True)
    cli.add_argument('--out',type=Path,required=True)
    cli.add_argument('--views',nargs='+',choices=['front','right','back','left','iso'],required=True)
    args=cli.parse_args(sys.argv[sys.argv.index('--')+1:])
    report=json.loads(args.report.read_text('utf8'))
    source=Path(report['processedCandidate']['path'])
    assert lod.p.sha256(source)==report['processedCandidate']['sha256']==args.sha256
    out=args.out.resolve()
    assert out.is_relative_to((lod.ART/'work').resolve())
    if out.exists() and any(out.iterdir()):raise FileExistsError('Preserve earlier diagnostic evidence')
    out.mkdir(parents=True,exist_ok=True)
    settings=SimpleNamespace(region=report['region'],asset=report['asset'],lod='near',height=1.,footprint=1.,render_directory=out,render_prefix='color-')
    rendered=lod.render(source,settings,args.views)
    scene=bpy.context.scene
    neutral=bpy.data.materials.new('Diagnostic neutral override')
    neutral.use_nodes=True
    shader=neutral.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(.52,.52,.52,1)
    shader.inputs['Roughness'].default_value=.8
    scene.view_layers[0].material_override=neutral
    lo,hi=lod.p.bounds([o for o in scene.objects if o.type=='MESH'],world=True)
    target=Vector((0,0,(lo.z+hi.z)/2))
    positions={'front':(0,-4,.9),'right':(4,0,.9),'back':(0,4,.9),'left':(-4,0,.9),'iso':(2.8,-4,2.6)}
    frames=[]
    for view in args.views:
        scene.camera.location=Vector(positions[view])
        scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.resolution_x=scene.render.resolution_y=512
        frame=out/('gray-'+view+'.png');scene.render.filepath=str(frame)
        bpy.ops.render.render(write_still=True);frames.append(lod.p.file_evidence(frame))
    assert lod.p.sha256(source)==args.sha256
    import hashlib
    snapshot=lod.ART/'reports/tool-snapshots'/(hashlib.sha256(EXECUTED).hexdigest()+'-'+Path(__file__).name)
    if not snapshot.exists():snapshot.write_bytes(EXECUTED)
    result={'status':'rendered_pending_visual_diagnosis','candidate':lod.p.file_evidence(source),'processingReport':lod.p.file_evidence(args.report),'sourceUnchanged':True,'rawMeshImported':False,'modelExported':False,'color':rendered,'neutralViews':frames,'tool':lod.p.file_evidence(snapshot),'scope':'View-layer material override only. No source geometry, UV, image, or material bytes edited.','createdAt':lod.now()}
    path=out/'inspection.json';path.write_text(json.dumps(result,indent=2)+'\n','utf8')
    print(json.dumps(lod.p.file_evidence(path)),flush=True)

if __name__=='__main__':main()

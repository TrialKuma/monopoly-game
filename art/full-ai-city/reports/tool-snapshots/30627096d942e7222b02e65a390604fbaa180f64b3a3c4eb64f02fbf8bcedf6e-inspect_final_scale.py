"""Read-only phone-size color and neutral geometry views of one exact final GLB."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys,shutil
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

p=argparse.ArgumentParser()
p.add_argument('--candidate',type=Path,required=True);p.add_argument('--sha256',required=True)
p.add_argument('--out',type=Path,required=True);p.add_argument('--region',required=True);p.add_argument('--asset',required=True)
p.add_argument('--gray',nargs='+',default=['front','back','left'])
p.add_argument('--small',nargs='+',default=['front','back','left','iso'])
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.candidate=a.candidate.resolve();a.out=a.out.resolve()
assert lod.p.sha256(a.candidate)==a.sha256
assert not (a.out/'inspection.json').exists(), 'Do not replace an existing inspection'
a.out.mkdir(parents=True,exist_ok=True)
settings=SimpleNamespace(region=a.region,asset=a.asset,lod='near',height=1.,footprint=1.,render_directory=a.out,render_prefix='material-')
render=lod.render(a.candidate,settings,['front'])
scene=bpy.context.scene
target=Vector((0,0,(render['boundsBlender']['min'][2]+render['boundsBlender']['max'][2])*.5))
positions={'front':(0,-4,.9),'right':(4,0,.9),'back':(0,4,.9),'left':(-4,0,.9),'iso':(2.8,-4,2.6)}
images=[]
def frame(name,resolution,prefix):
    scene.camera.location=Vector(positions[name]);scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.resolution_x=scene.render.resolution_y=resolution
    path=a.out/(prefix+'-'+name+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
    images.append({'view':name,'resolution':resolution,'material':prefix,**lod.p.file_evidence(path)})
for name in a.small:frame(name,256,'small')
neutral=bpy.data.materials.new('Neutral inspection only');neutral.use_nodes=True
neutral.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.52,.52,.52,1)
neutral.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.8
scene.view_layers[0].material_override=neutral
for name in a.gray:frame(name,1024,'gray')
tool=Path(__file__);snap=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
if not snap.exists():shutil.copyfile(tool,snap)
proof={'candidate':lod.p.file_evidence(a.candidate),'renders':render,'images':images,'geometryOrTextureEdits':False,'tool':lod.p.file_evidence(snap)}
(a.out/'inspection.json').write_text(json.dumps(proof,indent=2)+'\n','utf-8')

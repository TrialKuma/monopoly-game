"""Read-only neutral-material inspection of an exact normalized repaired source."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys,shutil
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

p=argparse.ArgumentParser()
p.add_argument('--receipt',type=Path,required=True)
p.add_argument('--region',required=True);p.add_argument('--asset',required=True)
p.add_argument('--views',nargs='+',choices=['front','right','back','left','iso'],default=['front','back','iso'])
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.receipt=a.receipt.resolve()
r=json.loads(a.receipt.read_text('utf-8'));source=Path(r['normalizedOutput']['path'])
assert lod.p.sha256(source)==r['normalizedOutput']['sha256']
out=a.receipt.parent/'gray';out.mkdir(parents=True,exist_ok=True)
settings=SimpleNamespace(region=a.region,asset=a.asset,lod='near',height=1.,footprint=1.,render_directory=out,render_prefix='material-')
render=lod.render(source,settings,['front'])
scene=bpy.context.scene
material=bpy.data.materials.new('Neutral surface QA');material.use_nodes=True
shader=material.node_tree.nodes['Principled BSDF']
shader.inputs['Base Color'].default_value=(.52,.52,.52,1);shader.inputs['Roughness'].default_value=.8
scene.view_layers[0].material_override=material
scene.render.resolution_x=scene.render.resolution_y=1024
target=Vector((0,0,(render['boundsBlender']['min'][2]+render['boundsBlender']['max'][2])/2))
views=[]
positions={'front':(0,-4,.9),'right':(4,0,.9),'back':(0,4,.9),'left':(-4,0,.9),'iso':(2.8,-4,2.6)}
for name in a.views:
    position=positions[name]
    scene.camera.location=Vector(position)
    scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    frame=out/('gray-'+name+'.png');scene.render.filepath=str(frame)
    bpy.ops.render.render(write_still=True);views.append(lod.p.file_evidence(frame))
tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
if not snapshot.exists():shutil.copyfile(tool,snapshot)
proof={'source':lod.p.file_evidence(source),'repairReceiptAtInspection':lod.p.file_evidence(a.receipt),
       'scope':'Read-only neutral material override; geometry and original textures are not edited.',
       'views':views,'tool':lod.p.file_evidence(snapshot)}
(out/'inspection.json').write_text(json.dumps(proof,indent=2)+'\n','utf-8')

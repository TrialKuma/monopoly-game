from pathlib import Path
from types import SimpleNamespace
import json, sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

out=lod.ART/'work/alpine-workshop-roof-v2/repair/gray';out.mkdir(parents=True,exist_ok=True)
source=out.parent/'repaired-normalized.glb'
args=SimpleNamespace(region='alpine',asset='builders_guild',lod='near',height=1.,footprint=1.,render_directory=out,render_prefix='material-')
report=lod.render(source,args,['right'])
scene=bpy.context.scene
material=bpy.data.materials.new('Neutral roof geometry QA');material.use_nodes=True
shader=material.node_tree.nodes['Principled BSDF'];shader.inputs['Base Color'].default_value=(.52,.52,.52,1);shader.inputs['Roughness'].default_value=.8
scene.view_layers[0].material_override=material
scene.render.resolution_x=scene.render.resolution_y=1024
target=Vector((0,0,(report['boundsBlender']['min'][2]+report['boundsBlender']['max'][2])/2))
views=[]
for name,position in [('right',(4,0,.9)),('iso',(2.8,-4,2.6))]:
    scene.camera.location=Vector(position);scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    frame=out/('gray-'+name+'.png');scene.render.filepath=str(frame);bpy.ops.render.render(write_still=True);views.append(lod.p.file_evidence(frame))
receipt={'source':lod.p.file_evidence(source),'scope':'Read-only neutral material override. No geometry changes/export.','views':views,'tool':lod.p.file_evidence(Path(__file__))}
(out/'inspection.json').write_text(json.dumps(receipt,indent=2)+'\n','utf8')

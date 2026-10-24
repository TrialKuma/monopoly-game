"""Read-only exact-source back and derivative neutral/small-frame comparison."""
from pathlib import Path
from types import SimpleNamespace
import json,sys,shutil
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import process_lod as lod

raw=lod.ART/'source/alpine--tower_2-a001-pixal-mv-1024-9247.glb'
candidate=lod.ART/'candidates/alpine/tower_2.glb'
assert lod.p.sha256(raw)=='9df477b0c7d751c5b43ebfef83a5d729633ce44b71d297b3c1ed678fc79da1ef'
assert lod.p.sha256(candidate)=='666ecfc0a0b71c2ad0314dcf8338a3a2c995f5817cee37eaef8ab4de77d0b4d1'
out=lod.ART/'work/root-alpine-tower2-a001-diagnostic';out.mkdir(parents=True,exist_ok=True)
assert not (out/'inspection.json').exists()
args=SimpleNamespace(region='alpine',asset='tower_2',name='alpine__tower_2',lod='near',height=1.,footprint=1.,render_directory=out,yaw=180.,pitch=0.,roll=0.,no_auto_upright=False,max_upright=18.)
evidence=[]
def gray():
    mat=bpy.data.materials.new('Neutral diagnostic only');mat.use_nodes=True
    bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.52,.52,.52,1);bsdf.inputs['Roughness'].default_value=.8
    bpy.context.scene.view_layers[0].material_override=mat
def frame(name,res):
    scene=bpy.context.scene;scene.render.resolution_x=scene.render.resolution_y=res
    image=out/(name+'.png');scene.render.filepath=str(image);bpy.ops.render.render(write_still=True);evidence.append(lod.p.file_evidence(image))
source=lod.render(raw,args,['back'],raw=True);gray();frame('raw-gray-back',1024)
args.render_prefix='lod-';final=lod.render(candidate,args,['front','back','iso'])
scene=bpy.context.scene;target=Vector((0,0,(final['boundsBlender']['min'][2]+final['boundsBlender']['max'][2])*.5))
for name,pos in [('front',(0,-4,.9)),('back',(0,4,.9)),('iso',(2.8,-4,2.6))]:
    scene.camera.location=Vector(pos);scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler();frame('small-'+name,256)
gray()
for name,pos in [('front',(0,-4,.9)),('back',(0,4,.9))]:
    scene.camera.location=Vector(pos);scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler();frame('lod-gray-'+name,1024)
tool=Path(__file__);snap=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
if not snap.exists():shutil.copyfile(tool,snap)
report={'status':'rendered_pending_actual_visual_review','raw':lod.p.file_evidence(raw),'candidate':lod.p.file_evidence(candidate),'rawRender':source,'finalRender':final,'extraImages':evidence,'tool':lod.p.file_evidence(snap),'geometryOrTextureEdits':False}
(out/'inspection.json').write_text(json.dumps(report,indent=2)+'\n','utf-8')

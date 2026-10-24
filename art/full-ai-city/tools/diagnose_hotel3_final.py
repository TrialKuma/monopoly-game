"""Read-only neutral and pixel-ray checks for one rejected hotel derivative."""
from pathlib import Path
from types import SimpleNamespace
import sys,json,shutil
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import process_lod as lod

candidate=lod.ART/'candidates/alpine/hotel_3.glb'
assert lod.p.sha256(candidate)=='2b3469087a3fdbcea23dee4eeee8540b648687509171ffa30ad468cb5744f08b'
out=lod.ART/'work/root-hotel3-final-2b346-diagnostic';out.mkdir(parents=True,exist_ok=True)
assert not (out/'inspection.json').exists()
args=SimpleNamespace(region='alpine',asset='hotel_3',name='alpine__hotel_3',lod='near',height=1.,footprint=1.,render_directory=out,yaw=180.,pitch=0.,roll=0.,no_auto_upright=False,max_upright=18.,render_prefix='color-')
render=lod.render(candidate,args,['front','back','right','iso'])
scene=bpy.context.scene;target=Vector((0,0,(render['boundsBlender']['min'][2]+render['boundsBlender']['max'][2])*.5));images=[];rays=[]
for name,pos in [('front',(0,-4,.9)),('back',(0,4,.9)),('iso',(2.8,-4,2.6))]:
 scene.camera.location=Vector(pos);scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler()
 scene.render.resolution_x=scene.render.resolution_y=256;file=out/('small-'+name+'.png');scene.render.filepath=str(file);bpy.ops.render.render(write_still=True);images.append(lod.p.file_evidence(file))
mat=bpy.data.materials.new('Neutral diagnostic only');mat.use_nodes=True;bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.52,.52,.52,1);bsdf.inputs['Roughness'].default_value=.8;scene.view_layers[0].material_override=mat
for name,pos,pixels in [('back',(0,4,.9),[(141,310),(141,315),(211,246),(120,291),(390,319)]),('right',(4,0,.9),[(201,275),(285,119)])]:
 camera=scene.camera;camera.location=Vector(pos);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
 scene.render.resolution_x=scene.render.resolution_y=1024;file=out/('gray-'+name+'.png');scene.render.filepath=str(file);bpy.ops.render.render(write_still=True);images.append(lod.p.file_evidence(file))
 frame=camera.data.view_frame(scene=scene);xs=[p.x for p in frame];ys=[p.y for p in frame];matrix=camera.matrix_world
 for px,py in pixels:
  x=min(xs)+(px+.5)/512*(max(xs)-min(xs));y=max(ys)-(py+.5)/512*(max(ys)-min(ys));origin=matrix@Vector((x,y,0));direction=matrix.to_quaternion()@Vector((0,0,-1));hit,location,normal,idx,obj,_=scene.ray_cast(bpy.context.evaluated_depsgraph_get(),origin,direction)
  rays.append({'view':name,'pixel512':[px,py],'hit':hit,'location':list(location) if hit else None,'normal':list(normal) if hit else None,'face':idx,'object':obj.name if hit else None})
tool=Path(__file__);snap=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
if not snap.exists():shutil.copyfile(tool,snap)
(out/'inspection.json').write_text(json.dumps({'candidate':lod.p.file_evidence(candidate),'renders':render,'images':images,'pixelRays':rays,'geometryOrTextureEdits':False,'tool':lod.p.file_evidence(snap)},indent=2)+'\n','utf-8')

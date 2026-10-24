from pathlib import Path
from types import SimpleNamespace
import json,sys,numpy as np,bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city';sys.path.insert(0,str(ART/'tools'));import process_lod as lod
state=json.loads((ART/'queue/alpine/onsen_1.json').read_text('utf8'));source=Path(state['rawGLB']['path']);assert lod.p.sha256(source)=='db62742a4d41cf3d3e25cc733132aaa3adf10aa4969a472a5ca2337bc8abcba8'
out=ART/'work/onsen1-local-patch-assessment';out.mkdir(parents=True,exist_ok=True);assert not (out/'measurement.json').exists()
args=SimpleNamespace(region='alpine',asset='onsen_1',lod='near',height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18,render_directory=out)
r=lod.render(source,args,(),raw=True);scene=bpy.context.scene;camera=scene.camera;target=Vector((0,0,(r['boundsBlender']['min'][2]+r['boundsBlender']['max'][2])/2));camera.location=Vector((0,-4,.9));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
obj=next(o for o in scene.objects if o.type=='MESH');tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get());inverse=obj.matrix_world.inverted();direction=(inverse.to_3x3()@(camera.matrix_world.to_quaternion()@Vector((0,0,-1)))).normalized()
xs=np.arange(140,316);ys=np.arange(192,266);points=np.full((len(ys),len(xs),3),np.nan,np.float32);normals=points.copy()
for yi,py in enumerate(ys):
 for xi,px in enumerate(xs):
  screen=Vector(((float(px)+.5)/512*1.4-.7,.7-(float(py)+.5)/512*1.4,0));origin=camera.matrix_world@screen;hit,normal,idx,dist=tree.ray_cast(inverse@origin,direction)
  if hit is not None:points[yi,xi]=obj.matrix_world@hit;normals[yi,xi]=(obj.matrix_world.to_3x3()@normal).normalized()
np.savez_compressed(out/'front-camera-rays.npz',xs=xs,ys=ys,points=points,normals=normals)
report={'source':lod.p.file_evidence(source),'existingFrontImage':lod.p.file_evidence(ART/'work/hybrid-batch/alpine--onsen_1-db62742a4d41-surface-field-v1/candidates/renders/alpine/onsen_1/raw-front.png'),'bounds':r['boundsBlender'],'cameraPosition':list(camera.location),'cameraTarget':list(target),'cameraOrthoScale':1.4,'pixelRange':{'x':[140,315],'y':[192,265]},'rayData':lod.p.file_evidence(out/'front-camera-rays.npz'),'tool':lod.p.file_evidence(Path(__file__)),'scope':'Read-only camera rays matching the already viewed original front. No source pixels, vertices, faces or textures changed. No extra render performed.','createdAt':lod.now()}
(out/'measurement.json').write_text(json.dumps(report,indent=2),'utf8');print(json.dumps(report),flush=True)

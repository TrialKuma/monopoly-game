"""Read-only visible roof correspondence and actual small-frame QA renders."""
from pathlib import Path
from types import SimpleNamespace
import sys,json,hashlib
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[3]
sys.path.insert(0,str(ROOT/'art/full-ai-city/tools'))
import process_lod as lod
from neural_component import GLB
from bake_nearest_surface import sample

def evidence(path):
 return {'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}

prior=ROOT/'art/full-ai-city/work/harbor-villa2-diagnostic/roof-visible-nearest.json'
old=json.loads(prior.read_text('utf8'))
candidate=OUT/'harbor/villa_2.glb'
g=GLB(candidate);primitive=g.doc['meshes'][0]['primitives'][0]
ci=g.array(primitive['indices']).reshape(-1,3);cv=g.array(primitive['attributes']['POSITION'])
corners=cv[ci][:,:,[0,2,1]].copy();corners[:,:,1]*=-1
inp=np.load(ROOT/'art/full-ai-city/work/harbor-native-uv/input.npz');lv,lf=inp['vertices'],inp['faces']
assert np.array_equal(corners,lv[lf])
tri=corners.astype(np.float64);centers=tri.mean(1);normals=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-30)
selected=np.flatnonzero((centers[:,2]>.61)&(centers[:,2]<.81)&(centers[:,0]<.12)&(normals[:,2]>.3))
tree=BVHTree.FromPolygons(lv.tolist(),lf.tolist(),all_triangles=True)
visible=[]
for face in selected:
 p=centers[face];hit,_,_,_=tree.ray_cast((float(p[0]),float(p[1]),2.),(0,0,-1))
 if hit is not None and abs(hit.z-p[2])<.0002:visible.append(face)
selected=np.asarray(visible,dtype=np.int32)
assert len(selected)==old['sampledLowFaces']==3596 and old['creamSamples']==0
cu=g.array(primitive['attributes']['TEXCOORD_0']).astype(np.float64)
accessor=g.doc['accessors'][primitive['attributes']['TEXCOORD_0']]
if accessor.get('normalized'):cu/=65535 if accessor['componentType']==5123 else 32767
cu[:,1]=1-cu[:,1]
material=g.doc['materials'][primitive['material']];ti=material['pbrMetallicRoughness']['baseColorTexture']['index'];ii=g.doc['textures'][ti]['source'];im=g.doc['images'][ii];view=g.doc['bufferViews'][im['bufferView']];start=view.get('byteOffset',0)
extracted=OUT/'native-base-original.jpg';extracted.write_bytes(bytes(g.blob[start:start+view['byteLength']]))
image=bpy.data.images.load(str(extracted));image.colorspace_settings.name='sRGB'
colors=sample(image,cu[ci[selected]].mean(1))[:,:3]
cream=(colors[:,0]>.25)&(colors[:,0]>colors[:,2]*1.2)
old_ids=np.asarray([x['lowFace'] for x in old['exportedAtlasComparison']['examples']],np.int32)
old_colors=sample(image,cu[ci[old_ids]].mean(1))[:,:3]
report={'status':'diagnostic_complete_pending_independent_visual_review','candidate':evidence(candidate),'priorSourceColorDiagnostic':evidence(prior),'geometryAndTexturesChanged':False,'sameVisibleRoofSelection':True,'sampledVisibleRoofFaceCentroids':len(selected),'originalSourceCreamSamplesFromPriorDiagnostic':0,'newAtlasCreamSamples':int(cream.sum()),'oldAtlasCreamSamples':old['exportedAtlasComparison']['creamAtSameVisibleFaceCentroids'],'oldCreamPointsNowBlue':int((old_colors[:,2]>old_colors[:,0]*1.2).sum()),'formerCreamPoints': [{'lowFace':int(face),'newRGB':rgb.tolist()} for face,rgb in zip(old_ids,old_colors)],'limitations':['This point diagnostic is a targeted roof check, not proof of every pixel or a substitute for actual five-view review.','Small original window/door gaps and two original chimneys remain, as in the native source.']}

# Render a new actual 256-pixel frame, not a resized approval image.
lod.clear_scene();bpy.ops.import_scene.gltf(filepath=str(candidate))
scene=lod.set_cpu();scene.cycles.samples=16;scene.render.resolution_x=256;scene.render.resolution_y=256;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
meshes=[o for o in scene.objects if o.type=='MESH'];lo,hi=lod.p.bounds(meshes,world=True);target=Vector((0,0,(hi.z+lo.z)/2))
world=bpy.data.worlds.new('Neutral phone-scale QA');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.64,.72,.82,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
for loc,energy,size in (((2,-3,4),220,2),((-3,-1,2),120,2),((1,3,3),180,2)):
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=energy;light.data.size=size;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=1.4;scene.camera=camera
views=[]
for label,position in [('front',(0,-4,.9)),('back',(0,4,.9)),('iso',(2.8,-4,2.6))]:
 camera.location=Vector(position);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();path=OUT/('phone-'+label+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);views.append(evidence(path))
scene.render.resolution_x=1024;scene.render.resolution_y=1024;path=OUT/'close-iso.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
report['actualPhoneFrames']={'resolution':[256,256],'views':views,'note':'Actual neutral studio renders at 256 pixels; no upscaling or retouching. Runtime family comparison remains a separate review.'};report['actualCloseFrame']=evidence(path)
(OUT/'quality-audit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({key:report[key] for key in ['candidate','sampledVisibleRoofFaceCentroids','newAtlasCreamSamples','oldAtlasCreamSamples','oldCreamPointsNowBlue']},indent=2),flush=True)

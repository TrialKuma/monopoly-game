"""Restore only the missing short connector between two observed AI lamp parts.

The original neural building and lantern are untouched. A small closed brass arm
joins the existing wall mounting and lantern's top attachment. Its appearance is
sampled from the original mounting, and all added geometry is explicitly reported.
Run in Blender CPU under the shared external worker lease.
"""
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime, timezone
import sys,json,shutil
import numpy as np
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod


def main():
 report_path=lod.ART/'candidates/harbor/lighthouse.json'
 source=json.loads(report_path.read_text('utf-8'))['source']['rawGLB']
 raw=Path(source['path'])
 if lod.p.sha256(raw)!=source['sha256']:raise ValueError('Immutable source changed')
 directory=lod.ART/'work/repair-lighthouse-bracket';directory.mkdir(parents=True,exist_ok=True)
 lod.clear_scene();body,_=lod.p.import_body(raw)
 original=np.empty(len(body.data.vertices)*3,dtype=np.float32);body.data.vertices.foreach_get('co',original);original=original.reshape(-1,3)
 settings=SimpleNamespace(height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18)
 orientation=lod.p.upright(body,settings)
 positions=np.empty(original.size,dtype=np.float32);body.data.vertices.foreach_get('co',positions);positions=positions.reshape(-1,3)
 fit_ids=np.linspace(0,len(positions)-1,1000,dtype=np.int64)
 affine=np.linalg.lstsq(np.column_stack((positions[fit_ids],np.ones(len(fit_ids)))),original[fit_ids],rcond=None)[0]
 error=float(np.max(np.abs(np.column_stack((positions[fit_ids],np.ones(len(fit_ids))))@affine-original[fit_ids])))
 if error>1e-6:raise ValueError('Cannot recover native similarity transform')
 indices=np.empty(len(body.data.loops),dtype=np.int32);body.data.loops.foreach_get('vertex_index',indices);indices=indices.reshape(-1,3)
 centers=positions[indices].mean(axis=1)
 uvdata=body.data.uv_layers.active.data;uv_name=body.data.uv_layers.active.name
 material=body.data.materials[0];bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 image=bsdf.inputs['Base Color'].links[0].from_node.image;iw,ih=image.size
 pixels=np.empty(iw*ih*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(ih,iw,4)
 # The mounting is visible on the original tower; this excludes the detached
 # lamp, white facade, dome trim and entrance arch by bounded position and color.
 mount_mask=(centers[:,0]>-.12)&(centers[:,0]<-.04)&(centers[:,1]>-.225)&(centers[:,1]<-.13)&(centers[:,2]>.26)&(centers[:,2]<.315)
 donor=[]
 for i in np.flatnonzero(mount_mask):
  face=body.data.polygons[int(i)];uv=np.mean([uvdata[j].uv[:] for j in face.loop_indices],axis=0)
  rgb=pixels[min(ih-1,max(0,int(uv[1]*ih))),min(iw-1,max(0,int(uv[0]*iw))),:3]
  if rgb[0]>rgb[1]*1.1 and rgb[1]>rgb[2]*1.25 and rgb[0]>.08:donor.append(int(i))
 if len(donor)<10:raise ValueError('Existing brass mounting was not identified')
 target=np.array([-.067,-.19,.289]);donor_id=min(donor,key=lambda i:float(np.linalg.norm(centers[i]-target)))
 mounting=centers[donor_id].copy()
 lamp_ids=np.flatnonzero((positions[:,0]>-.115)&(positions[:,0]<-.045)&(positions[:,1]<-.26)&(positions[:,1]>-.33)&(positions[:,2]>.19)&(positions[:,2]<.31))
 if len(lamp_ids)<100:raise ValueError('Existing lantern was not identified')
 tip_ids=lamp_ids[positions[lamp_ids,2]>positions[lamp_ids,2].max()-.002]
 tip=positions[tip_ids].mean(axis=0)
 if not .06<np.linalg.norm(tip-mounting)<.16:raise ValueError('Measured missing connector distance is unexpected')
 # Rounded short arm, proportioned to the original cap. Start/end overlap only
 # the existing mounting and top attachment; the lantern body can swing alone.
 start=mounting+np.array([0,.003,0]);end=tip+np.array([0,0,-.003])
 upper=max(float(start[2]),float(tip[2]))+.022
 controls=[start,np.array([start[0],start[1]-.008,upper]),np.array([tip[0],tip[1],upper]),end]
 path=[]
 for t in np.linspace(0,1,17):
  path.append((1-t)**3*controls[0]+3*(1-t)**2*t*controls[1]+3*(1-t)*t*t*controls[2]+t**3*controls[3])
 path=np.asarray(path);radius=.0055;sides=8;vertices=[];faces=[]
 for i,p in enumerate(path):
  tangent=path[min(i+1,len(path)-1)]-path[max(i-1,0)];tangent/=np.linalg.norm(tangent)
  u=np.cross(tangent,[1.,0,0]);u/=np.linalg.norm(u);v=np.cross(tangent,u)
  for angle in np.arange(sides)*2*np.pi/sides:vertices.append(p+radius*(np.cos(angle)*u+np.sin(angle)*v))
 for i in range(len(path)-1):
  for k in range(sides):
   a=i*sides+k;b=i*sides+(k+1)%sides;c=(i+1)*sides+k;d=(i+1)*sides+(k+1)%sides
   faces.extend(((a,b,c),(b,d,c)))
 for i,reverse in ((0,True),(len(path)-1,False)):
  center=len(vertices);vertices.append(path[i]);ring=i*sides
  for k in range(sides):
   face=(center,ring+k,ring+(k+1)%sides);faces.append(tuple(reversed(face)) if reverse else face)
 source_triangles=lod.p.triangles(body)
 mesh=bpy.data.meshes.new('Documented short original-lamp connection');mesh.from_pydata(vertices,[],faces);mesh.update()
 layer=mesh.uv_layers.new(name=uv_name);original_uv=[uvdata[k].uv[:] for k in body.data.polygons[donor_id].loop_indices]
 for face in mesh.polygons:
  for j,loop in enumerate(face.loop_indices):layer.data[loop].uv=original_uv[j]
 for m in body.data.materials:mesh.materials.append(m)
 arm=bpy.data.objects.new('Locally repaired brass lamp connector',mesh);bpy.context.collection.objects.link(arm)
 lod.p.select_only([body,arm]);bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
 body.name='harbor_lighthouse_neural_with_documented_short_connector'
 normalized=directory/'repaired-normalized.glb';bpy.ops.export_scene.gltf(filepath=str(normalized),export_format='GLB',use_selection=True)
 coords=np.empty(len(body.data.vertices)*3,dtype=np.float32);body.data.vertices.foreach_get('co',coords)
 restored=np.column_stack((coords.reshape(-1,3),np.ones(len(body.data.vertices))))@affine;restored[:len(original)]=original
 body.data.vertices.foreach_set('co',restored.astype(np.float32).ravel());body.data.update()
 native=directory/'repaired-native.glb';bpy.ops.export_scene.gltf(filepath=str(native),export_format='GLB',use_selection=True)
 settings.region='harbor';settings.asset='lighthouse';settings.lod='near';settings.render_directory=directory;settings.render_prefix='repaired-'
 renders=lod.render(normalized,settings,('front','right','back','left','iso'))
 tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 report={'status':'local_repair_candidate_pending_visual_review','source':lod.p.file_evidence(raw),'orientation':orientation,
  'method':'The original AI lamp and existing wall mounting had a measured spatial gap. Restore only a small closed curved brass connector between their measured endpoints, using unchanged original mounting texture UV. This is explicitly added local mechanical repair geometry, not a native-generated connector or a replacement building. Original neural building and lantern vertices, faces and image pixels remain unchanged.',
  'originalTriangles':source_triangles,'originalVerticesMoved':0,'originalTrianglesDeleted':0,'newTriangles':len(faces),'newVertices':len(vertices),'inverseSimilarityError':error,
  'repairs':[{'name':'Missing short connector between original mounting and lantern','mountingPointBlender':mounting.tolist(),'lanternTipBlender':tip.tolist(),'distance':float(np.linalg.norm(tip-mounting)),'radius':radius,'newTriangles':len(faces),'donorOriginalFace':donor_id,'donorOriginalUV':original_uv,'lampPivotGLTF':[float(tip[0]),float(tip[2]),float(-tip[1])]}],
  'normalizedOutput':lod.p.file_evidence(normalized),'nativeOutput':lod.p.file_evidence(native),'renders':renders,'reviewImages':[lod.p.file_evidence(Path(p)) for p in renders['views']],'processingTool':lod.p.file_evidence(snapshot),'completedAt':datetime.now(timezone.utc).isoformat()}
 (directory/'repair.json').write_text(json.dumps(report,indent=2),'utf-8');print(json.dumps(report['nativeOutput']),flush=True)

if __name__=='__main__':main()

"""Restricted source-boundary repairs for the inspected French neural spa pavilion.

Keeps the immutable native inference source, original vertex positions, materials and
architectural frame and signage unchanged. New local patch triangles use measured neighboring positions
and original UV samples. This is not a replacement building generator.
"""
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime, timezone
import sys,json,argparse,shutil
import numpy as np
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

SPECS=[{'name': 'left side dormer neighboring roof opening 1', 'u': [0, -1, 0], 'v': [0, 0, 1], 'n': [-1, 0, 0], 'roi': [-0.085, -0.036, 0.62, 0.72], 'defectDepth': 0.35, 'donorDepth': 0.425, 'donorMaxDepth': 0.471, 'donorNormal': 0.55, 'color': 'roof'}, {'name': 'left side dormer neighboring roof opening 2', 'u': [0, -1, 0], 'v': [0, 0, 1], 'n': [-1, 0, 0], 'roi': [0.036, 0.087, 0.62, 0.72], 'defectDepth': 0.35, 'donorDepth': 0.425, 'donorMaxDepth': 0.471, 'donorNormal': 0.55, 'color': 'roof'}, {'name': 'right side dormer neighboring roof opening 1', 'u': [0, 1, 0], 'v': [0, 0, 1], 'n': [1, 0, 0], 'roi': [-0.045, -0.010, 0.62, 0.735], 'defectDepth': 0.35, 'donorDepth': 0.425, 'donorMaxDepth': 0.471, 'donorNormal': 0.55, 'color': 'roof'}, {'name': 'right side dormer neighboring roof opening 2', 'u': [0, 1, 0], 'v': [0, 0, 1], 'n': [1, 0, 0], 'roi': [0.070, 0.094, 0.62, 0.715], 'defectDepth': 0.35, 'donorDepth': 0.425, 'donorMaxDepth': 0.471, 'donorNormal': 0.55, 'color': 'roof'}, {'name': 'front arch shoulder backing opening 1', 'u': [1, 0, 0], 'v': [0, 0, 1], 'n': [0, -1, 0], 'roi': [-0.228, -0.174, 0.535, 0.572], 'defectDepth': 0.03, 'donorDepth': 0.055, 'donorMaxDepth': 0.121, 'donorNormal': 0.55, 'color': 'stone'}, {'name': 'front arch shoulder backing opening 2', 'u': [1, 0, 0], 'v': [0, 0, 1], 'n': [0, -1, 0], 'roi': [0.163, 0.222, 0.535, 0.572], 'defectDepth': 0.03, 'donorDepth': 0.055, 'donorMaxDepth': 0.121, 'donorNormal': 0.55, 'color': 'stone'}, {'name': 'back arch shoulder backing opening 1', 'u': [-1, 0, 0], 'v': [0, 0, 1], 'n': [0, 1, 0], 'roi': [-0.228, -0.174, 0.535, 0.572], 'defectDepth': 0.03, 'donorDepth': 0.055, 'donorMaxDepth': 0.121, 'donorNormal': 0.55, 'color': 'stone'}, {'name': 'back arch shoulder backing opening 2', 'u': [-1, 0, 0], 'v': [0, 0, 1], 'n': [0, 1, 0], 'roi': [0.163, 0.222, 0.535, 0.572], 'defectDepth': 0.03, 'donorDepth': 0.055, 'donorMaxDepth': 0.121, 'donorNormal': 0.55, 'color': 'stone'}]


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--inspect-only',action='store_true')
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
 state=json.loads((lod.ART/'queue/classic/teleport_gate.json').read_text('utf-8'))
 raw=Path(state['rawGLB']['path'])
 if lod.p.sha256(raw)!='612800f4cbf0312ba1df8983b8f39b0e7d1f8f66e900b6775a80d336b6f9cefa':
  raise ValueError('Repair restricted to the inspected native source')
 directory=lod.ART/'work/repair-teleport-v2';directory.mkdir(parents=True,exist_ok=True)
 lod.clear_scene();obj,_=lod.p.import_body(raw)
 original=np.empty(len(obj.data.vertices)*3,dtype=np.float32);obj.data.vertices.foreach_get('co',original);original=original.reshape(-1,3)
 settings=SimpleNamespace(height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18)
 orientation=lod.p.upright(obj,settings)
 normalized=np.empty(len(obj.data.vertices)*3,dtype=np.float32);obj.data.vertices.foreach_get('co',normalized);normalized=normalized.reshape(-1,3)
 ids=np.linspace(0,len(normalized)-1,1000,dtype=np.int64)
 affine=np.linalg.lstsq(np.column_stack((normalized[ids],np.ones(len(ids)))),original[ids],rcond=None)[0]
 error=float(np.max(np.abs(np.column_stack((normalized[ids],np.ones(len(ids))))@affine-original[ids])))
 if error>1e-6:raise ValueError('Native similarity transform is not recoverable')
 tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
 material=obj.data.materials[0];bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 image=bsdf.inputs['Base Color'].links[0].from_node.image;iw,ih=image.size
 pixels=np.empty(iw*ih*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(ih,iw,4)
 uvdata=obj.data.uv_layers.active.data;uv_name=obj.data.uv_layers.active.name
 cleanup_mask=np.zeros(len(obj.data.polygons),dtype=bool)
 cleanup_report={'method':'No original faces deleted. Only measured missing roof sectors beside the four side dormer edges and short arch shoulder backing gaps receive boundary-derived closed patches. Existing windows and arch passage remain open as designed.','deletedTriangles':0}
 vertices=[];faces=[];uvs=[];repairs=[]
 for spec in SPECS:
  u,v,n=[Vector(spec[key]).normalized() for key in ('u','v','n')]
  if u.cross(v).dot(n)<.999:raise ValueError('Patch frame must face outward')
  lo_u,hi_u,lo_v,hi_v=spec['roi'];step=.002;margin=.022
  us=np.arange(lo_u-margin,hi_u+margin+step/2,step);vs=np.arange(lo_v-margin,hi_v+margin+step/2,step)
  depth=np.full((len(vs),len(us)),-2,dtype=np.float32);normal_dot=np.zeros(depth.shape)
  uvgrid=np.zeros((*depth.shape,2),dtype=np.float32);hit_mask=np.zeros(depth.shape,dtype=bool)
  for vi,b in enumerate(vs):
   for ui,a in enumerate(us):
    point,normal,index,_=tree.ray_cast(u*float(a)+v*float(b)+n*2,-n)
    if point is None:continue
    depth[vi,ui]=point.dot(n);normal_dot[vi,ui]=normal.dot(n);hit_mask[vi,ui]=True
    face=obj.data.polygons[index]
    uvgrid[vi,ui]=barycentric_transform(point,*[obj.data.vertices[k].co for k in face.vertices],*[Vector((*uvdata[k].uv,0)) for k in face.loop_indices])[:2]
  region=(us[None,:]>=lo_u)&(us[None,:]<=hi_u)&(vs[:,None]>=lo_v)&(vs[:,None]<=hi_v)
  bad=region & (depth<spec['defectDepth'])
  if spec.get('forceRoi'):
   a,b,c,d=spec['forceRoi'];bad|=(us[None,:]>=a)&(us[None,:]<=b)&(vs[:,None]>=c)&(vs[:,None]<=d)
  # These bounded, visually inspected regions lie inside the existing wall or
  # tile envelope. Include both inward folds and truly open through-holes; the
  # latter have no ray hit at all and would otherwise remain unrepaired.
  coords=np.argwhere(bad)
  if not len(coords):
   repairs.append({'name':spec['name'],'specification':spec,'missingSamples':0});continue
  valid=(depth>spec['donorDepth'])&(depth<spec['donorMaxDepth'])&(normal_dot>spec.get('donorNormal',.7))&hit_mask
  donor=[]
  for vi,ui in np.argwhere(valid):
   tu,tv=uvgrid[vi,ui];rgb=pixels[min(ih-1,max(0,int(tv*ih))),min(iw-1,max(0,int(tu*iw))),:3]
   ok=bool(rgb.max()<.40 and rgb.min()>.015 and rgb[2]>rgb[0]*.85) if spec['color']=='roof' else bool(rgb.min()>.16 and rgb.max()/rgb.min()<1.9)
   if ok:donor.append((int(vi),int(ui)))
  observation={'name':spec['name'],'specification':spec,'missingSamples':len(coords),'boundarySamples':len(donor),
   'sampledDepthRange':[float(depth[region].min()),float(depth[region].max())]}
  print('PATCH_INSPECT',json.dumps(observation),flush=True)
  if args.inspect_only:repairs.append(observation);continue
  if len(donor)<12:raise ValueError('Not enough real neighboring surface samples: '+spec['name'])
  kd=KDTree(len(donor))
  for i,(vi,ui) in enumerate(donor):kd.insert((float(us[ui]),float(vs[vi]),0),i)
  kd.balance();cells=set()
  for vi,ui in coords:
   for dv in (-1,0):
    for du in (-1,0):cells.add((int(vi+dv),int(ui+du)))
  corners={p for vi,ui in cells for p in ((vi,ui),(vi+1,ui),(vi,ui+1),(vi+1,ui+1))};mapping={}
  first_v=len(vertices);first_f=len(faces)
  for vi,ui in sorted(corners):
   hits=kd.find_n((float(us[ui]),float(vs[vi]),0),4)
   weights=np.asarray([1/max(h[2],.0002)**2 for h in hits]);weights/=weights.sum()
   neighbors=[donor[h[1]] for h in hits]
   d=float(sum(w*depth[j,k] for w,(j,k) in zip(weights,neighbors)))
   if depth[vi,ui]>spec['donorDepth']:d=float(depth[vi,ui])
   mapping[vi,ui]=len(vertices);vertices.append(u*float(us[ui])+v*float(vs[vi])+n*(d+.0002))
   uvs.append(tuple(uvgrid[neighbors[0]]))
  for vi,ui in sorted(cells):
   a,b,c,d=[mapping[p] for p in ((vi,ui),(vi,ui+1),(vi+1,ui),(vi+1,ui+1))]
   faces.extend(((a,b,c),(b,d,c)))
  front_faces=faces[first_f:].copy();front_end=len(vertices);back_map={}
  for k in range(first_v,front_end):back_map[k]=len(vertices);vertices.append(vertices[k]-n*.006);uvs.append(uvs[k])
  edge_count={}
  for face in front_faces:
   faces.append(tuple(back_map[k] for k in reversed(face)))
   for a,b in zip(face,face[1:]+face[:1]):edge_count.setdefault(tuple(sorted((a,b))),[]).append((a,b))
  for edges in edge_count.values():
   if len(edges)==1:
    a,b=edges[0];faces.extend(((a,back_map[a],b),(b,back_map[a],back_map[b])))
  observation['inwardClosureThickness']=.006;observation['outerSurfaceUnchanged']=True
  observation.update(newVertices=len(vertices)-first_v,newTriangles=len(faces)-first_f)
  repairs.append(observation)
 if args.inspect_only:
  (directory/'inspection.json').write_text(json.dumps({'source':state['rawGLB'],'repairs':repairs},indent=2),'utf-8');return
 if len(faces)>16000:raise ValueError('Eight bounded repairs exceed 1.6 percent of the inspected native triangles')
 source_triangles=lod.p.triangles(obj)
 bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[int(i)] for i in np.flatnonzero(cleanup_mask)],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()
 after=np.empty(len(obj.data.vertices)*3,dtype=np.float32);obj.data.vertices.foreach_get('co',after)
 if len(after)!=normalized.size or not np.array_equal(after.reshape(-1,3),normalized):raise RuntimeError('Face cleanup changed original vertex ordering or coordinates')
 mesh=bpy.data.meshes.new('Local original gate roof and arch boundary repair');mesh.from_pydata(vertices,[],faces);mesh.update()
 layer=mesh.uv_layers.new(name=uv_name)
 for loop in mesh.loops:layer.data[loop.index].uv=uvs[loop.vertex_index]
 for m in obj.data.materials:mesh.materials.append(m)
 patch=bpy.data.objects.new('Documented local neural repairs',mesh);bpy.context.collection.objects.link(patch)
 lod.p.select_only([obj,patch]);bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
 obj.name='classic_teleport_neural_source_with_local_boundary_repair'
 norm=directory/'repaired-normalized.glb';bpy.ops.export_scene.gltf(filepath=str(norm),export_format='GLB',use_selection=True)
 coordinates=np.empty(len(obj.data.vertices)*3,dtype=np.float32);obj.data.vertices.foreach_get('co',coordinates)
 restored=np.column_stack((coordinates.reshape(-1,3),np.ones(len(obj.data.vertices))))@affine
 restored[:len(original)]=original;obj.data.vertices.foreach_set('co',restored.astype(np.float32).ravel());obj.data.update()
 native=directory/'repaired-native.glb';bpy.ops.export_scene.gltf(filepath=str(native),export_format='GLB',use_selection=True)
 report={'status':'local_repair_candidate_pending_visual_review','source':lod.p.file_evidence(raw),'orientation':orientation,
  'method':'Only measured missing side-roof sectors and short arch-shoulder backing gaps are closed from intact neighboring original surface depth and UV samples. Original neural vertices, faces and image pixels are untouched. The central passage, original windows and architectural volumes remain unchanged. Roof patches use original neighboring slate roof UV and stone patches use original stone. Patches close 0.006 inward for derivative stability, with no replacement building or newly painted texture.',
  'repairs':repairs,'originalTriangles':source_triangles,'originalVerticesMoved':0,'originalTrianglesDeleted':int(cleanup_mask.sum()),'artifactCleanup':cleanup_report,
  'newTriangles':len(faces),'newVertices':len(vertices),'inverseSimilarityError':error,
  'normalizedOutput':lod.p.file_evidence(norm),'nativeOutput':lod.p.file_evidence(native)}
 settings.region='classic';settings.asset='teleport_gate';settings.lod='near';settings.render_directory=directory;settings.render_prefix='repaired-'
 report['renders']=lod.render(norm,settings,('front','right','back','left','iso'))
 report['reviewImages']=[lod.p.file_evidence(Path(p)) for p in report['renders']['views']]
 tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 report['processingTool']=lod.p.file_evidence(snapshot);report['completedAt']=datetime.now(timezone.utc).isoformat()
 (directory/'repair.json').write_text(json.dumps(report,indent=2),'utf-8')
 print('LOCAL_REPAIR_CANDIDATE',json.dumps(report['nativeOutput']),flush=True)

if __name__=='__main__':main()

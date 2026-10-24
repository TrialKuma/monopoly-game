"""Closed source-boundary repairs for the inspected Alpine neural workshop.

Keeps the immutable native inference source, existing geometry, materials and
cargo unchanged. New local patch triangles use measured neighboring positions
and original UV samples. This is not a replacement building generator.
"""
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime, timezone
import sys,json,argparse,shutil
import numpy as np
import bpy,bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

SPECS=[
 {'name':'Front plaster under beam','u':[1,0,0],'v':[0,0,1],'n':[0,-1,0],
  'roi':[.105,.25,.315,.365],'defectDepth':.22,'donorDepth':.23,'color':'plaster'},
 {'name':'Right roof upper measured inward fold','u':[0,1,0],'v':[0,0,1],'n':[1,0,0],
  'roi':[-.172,-.132,.680,.712],'defectDepth':.02,'donorDepth':.025,'donorNormal':.25,'color':'tile','planeRepair':True},
 {'name':'Right roof eave measured inward fold','u':[0,1,0],'v':[0,0,1],'n':[1,0,0],
  'roi':[.148,.179,.482,.505],'defectDepth':.30,'donorDepth':.30,'donorNormal':.25,'color':'tile','planeRepair':True},
]


def main():
 parser=argparse.ArgumentParser();parser.add_argument('--inspect-only',action='store_true')
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
 state=json.loads((lod.ART/'queue/alpine/builders_guild.json').read_text('utf-8'))
 raw=Path(state['rawGLB']['path'])
 if lod.p.sha256(raw)!='d3aefa70e16ee1ca3700be2a52b83f426ddb66d9a38fbe54cc588aa8baa2f93f':
  raise ValueError('Repair restricted to the inspected native source')
 directory=lod.ART/'work/alpine-workshop-roof-v2/repair';directory.mkdir(parents=True,exist_ok=True)
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
 vertices=[];faces=[];uvs=[];repairs=[]
 cleanup_mask=np.zeros(len(obj.data.polygons),dtype=bool)
 centers=np.asarray([p.center[:] for p in obj.data.polygons],dtype=np.float64)
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
  # These bounded, visually inspected regions lie inside the existing wall or
  # tile envelope. Include both inward folds and truly open through-holes; the
  # latter have no ray hit at all and would otherwise remain unrepaired.
  plane=None
  if spec.get('planeRepair'):
   # Fit the actual adjacent roof envelope, excluding the bounded defect.
   # The old absolute depth threshold missed folded faces that still had a hit.
   ring=hit_mask & ~region & (normal_dot>.25) & (depth>spec['donorDepth'])
   iy,ix=np.where(ring)
   fit=np.column_stack((us[ix],vs[iy],np.ones(len(ix))))
   if len(ix)<30:raise ValueError('Too few measured roof neighbors')
   plane=np.linalg.lstsq(fit,depth[iy,ix],rcond=None)[0]
   for _ in range(3):
    residual=depth[iy,ix]-fit@plane
    retain=np.abs(residual)<.012
    if retain.sum()<20:raise ValueError('Neighbor roof fit is unstable')
    plane=np.linalg.lstsq(fit[retain],depth[iy[retain],ix[retain]],rcond=None)[0]
   expected=plane[0]*us[None,:]+plane[1]*vs[:,None]+plane[2]
   bad=region & ((depth<expected-.007)|~hit_mask)
   pc=centers@np.asarray(u);qc=centers@np.asarray(v);dc=centers@np.asarray(n)
   ec=plane[0]*pc+plane[1]*qc+plane[2]
   remove=(pc>=lo_u)&(pc<=hi_u)&(qc>=lo_v)&(qc<=hi_v)&(dc<ec-.007)&(dc>ec-.065)
   cleanup_mask|=remove
  coords=np.argwhere(bad)
  if not len(coords):
   repairs.append({'name':spec['name'],'specification':spec,'missingSamples':0});continue
  valid=(depth>spec['donorDepth'])&(normal_dot>spec.get('donorNormal',.7))&hit_mask
  if plane is not None:valid &= (depth>=expected-.006)&~bad
  donor=[]
  for vi,ui in np.argwhere(valid):
   tu,tv=uvgrid[vi,ui];rgb=pixels[min(ih-1,max(0,int(tv*ih))),min(iw-1,max(0,int(tu*iw))),:3]
   ok=(float(rgb.min())>.35 and float(rgb.max()-rgb.min())<.3) if spec['color']=='plaster' else (rgb[0]>.25 and rgb[0]>rgb[1]*1.05 and rgb[1]>rgb[2]*.85)
   if ok:donor.append((int(vi),int(ui)))
  observation={'name':spec['name'],'specification':spec,'missingSamples':len(coords),'boundarySamples':len(donor),
   'sampledDepthRange':[float(depth[region].min()),float(depth[region].max())]}
  if plane is not None:observation.update(measuredRoofPlane=plane.tolist(),depthDeficitThreshold=.007,localFoldFacesToDelete=int(remove.sum()),planeFitResidualMax=float(np.abs(residual[retain]).max()))
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
   if plane is None:
    if depth[vi,ui]>spec['donorDepth']:d=float(depth[vi,ui])
   elif not bad[vi,ui] and depth[vi,ui]>=expected[vi,ui]-.006:d=float(depth[vi,ui])
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
  observation['inwardClosureThickness']=.006;observation['frontPatchTriangles']=len(front_faces)
  observation.update(newVertices=len(vertices)-first_v,newTriangles=len(faces)-first_f)
  repairs.append(observation)
 if args.inspect_only:
  (directory/'inspection.json').write_text(json.dumps({'source':state['rawGLB'],'repairs':repairs},indent=2),'utf-8');return
 if len(faces)>12000:raise ValueError('Local repair is too broad')
 source_triangles=lod.p.triangles(obj)
 if cleanup_mask.sum()>5000:raise ValueError('Limited roof cleanup exceeds local budget')
 bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[int(i)] for i in np.flatnonzero(cleanup_mask)],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()
 after=np.empty(len(obj.data.vertices)*3,dtype=np.float32);obj.data.vertices.foreach_get('co',after)
 if not np.array_equal(after.reshape(-1,3),normalized):raise ValueError('Roof cleanup changed existing vertex coordinates or ordering')
 mesh=bpy.data.meshes.new('Local boundary-derived workshop repairs');mesh.from_pydata(vertices,[],faces);mesh.update()
 layer=mesh.uv_layers.new(name=uv_name)
 for loop in mesh.loops:layer.data[loop.index].uv=uvs[loop.vertex_index]
 for m in obj.data.materials:mesh.materials.append(m)
 patch=bpy.data.objects.new('Documented local neural repairs',mesh);bpy.context.collection.objects.link(patch)
 lod.p.select_only([obj,patch]);bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
 obj.name='alpine_workshop_neural_source_with_local_repairs'
 norm=directory/'repaired-normalized.glb';bpy.ops.export_scene.gltf(filepath=str(norm),export_format='GLB',use_selection=True)
 coordinates=np.empty(len(obj.data.vertices)*3,dtype=np.float32);obj.data.vertices.foreach_get('co',coordinates)
 restored=np.column_stack((coordinates.reshape(-1,3),np.ones(len(obj.data.vertices))))@affine
 restored[:len(original)]=original;obj.data.vertices.foreach_set('co',restored.astype(np.float32).ravel());obj.data.update()
 native=directory/'repaired-native.glb';bpy.ops.export_scene.gltf(filepath=str(native),export_format='GLB',use_selection=True)
 report={'status':'local_repair_candidate_pending_visual_review','source':lod.p.file_evidence(raw),'orientation':orientation,
  'method':'Original successful front-wall boundary patch is recomputed with unchanged parameters. Two measured small right-roof gaps use a plane fitted only from adjacent real roof surfaces, original neighboring UV samples and 0.006 inward closure. Only inward-folded faces within the two exact roof ROIs and within 0.065 depth of that roof envelope are removed. Existing neural vertices and original image pixels are preserved. No replacement roof, building or manufactured cargo.',
  'repairs':repairs,'originalTriangles':source_triangles,'originalVerticesMoved':0,'originalTrianglesDeleted':int(cleanup_mask.sum()),
  'newTriangles':len(faces),'newVertices':len(vertices),'inverseSimilarityError':error,
  'normalizedOutput':lod.p.file_evidence(norm),'nativeOutput':lod.p.file_evidence(native)}
 settings.region='alpine';settings.asset='builders_guild';settings.lod='near';settings.render_directory=directory;settings.render_prefix='repaired-'
 report['renders']=lod.render(norm,settings,('front','right','back','left','iso'))
 report['reviewImages']=[lod.p.file_evidence(Path(p)) for p in report['renders']['views']]
 tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 report['processingTool']=lod.p.file_evidence(snapshot);report['completedAt']=datetime.now(timezone.utc).isoformat()
 (directory/'repair.json').write_text(json.dumps(report,indent=2),'utf-8')
 print('LOCAL_REPAIR_CANDIDATE',json.dumps(report['nativeOutput']),flush=True)

if __name__=='__main__':main()

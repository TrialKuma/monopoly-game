"""Configuration-bound local surface repairs for an explicitly inspected neural building.

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




def main():
 parser=argparse.ArgumentParser();parser.add_argument('--inspect-only',action='store_true');parser.add_argument('--config',type=Path,required=True)
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
 config=json.loads(args.config.read_text('utf8'));region_name=config['region'];asset=config['asset'];SPECS=config['specifications']
 if not SPECS or len(SPECS)>6:raise ValueError('Require one to six explicitly bounded repairs')
 for proof in config['reviewEvidence']:
  if lod.p.sha256(lod.ART/proof['path'])!=proof['sha256']:raise ValueError('Prior actual review evidence changed')
 if not config['reviewEvidence']:raise ValueError('Actual source review evidence required')
 state=json.loads((lod.ART/'queue'/region_name/(asset+'.json')).read_text('utf-8'))
 raw=Path(state['rawGLB']['path'])
 if lod.p.sha256(raw)!=config['sourceSha256']:
  raise ValueError('Repair restricted to the inspected native source')
 directory=lod.ART/config['outputDirectory'];directory.mkdir(parents=True,exist_ok=True)
 if not directory.resolve().is_relative_to((lod.ART/'work').resolve()):raise ValueError('Repair output must stay in the project work directory')
 if (directory/'repair.json').exists():raise FileExistsError('Preserve completed repair receipt')
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
 cleanup_report={'method':'No original faces deleted. Only the explicitly reviewed bounded source-surface regions in the configuration may receive additional triangles.','deletedTriangles':0}
 vertices=[];faces=[];uvs=[];repairs=[];flat_uv_faces=set()
 for spec in SPECS:
  u,v,n=[Vector(spec[key]).normalized() for key in ('u','v','n')]
  if u.cross(v).dot(n)<.999:raise ValueError('Patch frame must face outward')
  lo_u,hi_u,lo_v,hi_v=spec['roi']
  step=float(spec.get('gridStep',.003));margin=float(spec.get('donorMargin',.024))
  if not .003<=step<=.012 or not .024<=margin<=.15:raise ValueError('Local sample spacing or donor search exceeds the supported bounds')
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
  if spec.get('polygon'):
   polygon=np.asarray(spec['polygon'],dtype=float)
   if polygon.ndim!=2 or polygon.shape[1]!=2 or len(polygon)<3 or not np.isfinite(polygon).all():raise ValueError('Require a finite local surface polygon')
   if not ((polygon[:,0]>=lo_u)&(polygon[:,0]<=hi_u)&(polygon[:,1]>=lo_v)&(polygon[:,1]<=hi_v)).all():raise ValueError('Surface polygon must stay within its reviewed rectangle')
   inside=np.zeros(depth.shape,dtype=bool)
   for (a,b),(c,d) in zip(polygon,np.roll(polygon,-1,axis=0)):
    if abs(d-b)<1e-12:continue
    inside^=((b>vs[:,None])!=(d>vs[:,None]))&(us[None,:]<(c-a)*(vs[:,None]-b)/(d-b)+a)
   region&=inside
  bad=region & (depth<spec['defectDepth'])
  if spec.get('forceRoi'):
   a,b,c,d=spec['forceRoi'];bad|=region&(us[None,:]>=a)&(us[None,:]<=b)&(vs[:,None]>=c)&(vs[:,None]<=d)
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
   default_min,default_ratio=(.10,2.0) if spec['color']=='stone' else (.22,1.8)
   ok=bool(rgb.min()>spec.get('donorMinRGB',default_min) and rgb.max()/max(rgb.min(),.00001)<spec.get('donorMaxColorRatio',default_ratio))
   if spec['color']=='brick':ok=ok and bool(rgb[0]>rgb[1]*1.2 and rgb[0]>rgb[2]*1.4)
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
   if spec['donorDepth']<depth[vi,ui]<spec['donorMaxDepth']:d=float(depth[vi,ui])
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
  if spec.get('flatPatchUV'):flat_uv_faces.update(range(first_f,len(faces)))
  observation.update(newVertices=len(vertices)-first_v,newTriangles=len(faces)-first_f)
  repairs.append(observation)
 if args.inspect_only:
  settings.region=region_name;settings.asset=asset;settings.lod='near';settings.render_directory=directory
  original_views=lod.render(raw,settings,('left','right'),raw=True)
  (directory/'inspection.json').write_text(json.dumps({'source':state['rawGLB'],'repairs':repairs,'originalSideViews':original_views},indent=2),'utf-8');return
 if len(faces)>10000:raise ValueError(f'Local repair is too broad: {len(faces)} new triangles exceeds10000')
 source_triangles=lod.p.triangles(obj)
 bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[int(i)] for i in np.flatnonzero(cleanup_mask)],context='FACES_ONLY');bm.to_mesh(obj.data);bm.free();obj.data.update()
 after=np.empty(len(obj.data.vertices)*3,dtype=np.float32);obj.data.vertices.foreach_get('co',after)
 if len(after)!=normalized.size or not np.array_equal(after.reshape(-1,3),normalized):raise RuntimeError('Face cleanup changed original vertex ordering or coordinates')
 mesh=bpy.data.meshes.new('Local original hotel facade boundary repair');mesh.from_pydata(vertices,[],faces);mesh.update()
 layer=mesh.uv_layers.new(name=uv_name)
 for face in mesh.polygons:
  # A plain-plaster patch may use samples from disconnected source UV islands.
  # Interpolating between those islands crosses unrelated texture pixels.
  # Assign one actual donor sample per triangle when explicitly requested.
  face_uv=uvs[face.vertices[0]] if face.index in flat_uv_faces else None
  for index in face.loop_indices:
   loop=mesh.loops[index];layer.data[index].uv=face_uv if face_uv is not None else uvs[loop.vertex_index]
 for m in obj.data.materials:mesh.materials.append(m)
 patch=bpy.data.objects.new('Documented local neural repairs',mesh);bpy.context.collection.objects.link(patch)
 lod.p.select_only([obj,patch]);bpy.context.view_layer.objects.active=obj;bpy.ops.object.join()
 obj.name=region_name+'_'+asset+'_neural_source_with_local_surface_repair'
 norm=directory/'repaired-normalized.glb';bpy.ops.export_scene.gltf(filepath=str(norm),export_format='GLB',use_selection=True)
 coordinates=np.empty(len(obj.data.vertices)*3,dtype=np.float32);obj.data.vertices.foreach_get('co',coordinates)
 restored=np.column_stack((coordinates.reshape(-1,3),np.ones(len(obj.data.vertices))))@affine
 restored[:len(original)]=original;obj.data.vertices.foreach_set('co',restored.astype(np.float32).ravel());obj.data.update()
 native=directory/'repaired-native.glb';bpy.ops.export_scene.gltf(filepath=str(native),export_format='GLB',use_selection=True)
 report={'status':'local_repair_candidate_pending_visual_review','source':lod.p.file_evidence(raw),'orientation':orientation,
  'configuration':lod.p.file_evidence(args.config),'reviewEvidence':config['reviewEvidence'],'measurement':lod.p.file_evidence(lod.ART/config['measurement']),
  'method':'Only explicitly measured and visually reviewed local gaps are closed from adjoining original surface and UV samples with0.006 inward closure. Original vertices, faces and image pixels are preserved. No replacement building or generated texture. See configuration and frozen prior review evidence for exact allowed regions.',
  'repairs':repairs,'originalTriangles':source_triangles,'originalVerticesMoved':0,'originalTrianglesDeleted':int(cleanup_mask.sum()),'artifactCleanup':cleanup_report,
  'newTriangles':len(faces),'newVertices':len(vertices),'inverseSimilarityError':error,
  'normalizedOutput':lod.p.file_evidence(norm),'nativeOutput':lod.p.file_evidence(native)}
 settings.region=region_name;settings.asset=asset;settings.lod='near';settings.render_directory=directory;settings.render_prefix='repaired-'
 report['renders']=lod.render(norm,settings,('front','right','back','left','iso'))
 report['reviewImages']=[lod.p.file_evidence(Path(p)) for p in report['renders']['views']]
 tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 report['processingTool']=lod.p.file_evidence(snapshot);report['completedAt']=datetime.now(timezone.utc).isoformat()
 (directory/'repair.json').write_text(json.dumps(report,indent=2),'utf-8')
 print('LOCAL_REPAIR_CANDIDATE',json.dumps(report['nativeOutput']),flush=True)

if __name__=='__main__':main()

"""Local rigid extraction/cut-boundary repair of the existing neural wheel only."""
from pathlib import Path
import sys,json,copy,math,argparse,io
from PIL import Image
import numpy as np
import mapbox_earcut
from scipy.spatial import Delaunay
ROOT=Path.cwd()
parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--output-directory',type=Path,required=True);arguments=parser.parse_args();OUT=arguments.output_directory.resolve();OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'art/full-ai-city/tools'))
from neural_component import GLB,digest,frame
SOURCE=arguments.source.resolve()
EXPECTED='3751c7dc4d397e9b74775fc5ff03f73aff4869f2d73a9b08095abca255f07715'
assert digest(SOURCE)==EXPECTED
g=GLB(SOURCE);before_images=g.image_hashes();doc=g.doc
node_index,node=next((i,n) for i,n in enumerate(doc['nodes']) if 'mesh' in n)
original=copy.deepcopy(doc['meshes'][node['mesh']]['primitives'][0]);attrs={k:g.array(a) for k,a in original['attributes'].items()};v=attrs['POSITION'].astype(float);f=g.array(original['indices']).reshape(-1,3)
center=np.array([.3355,.2745,.176]);axis=np.array([.01787,.0234,.999566]);rotation,quaternion=frame(axis)
local=(v-center)@rotation
# Measured blue face planes lie about +/- .015. The slab leaves their original
# small relief intact but excludes the projecting stationary wooden support.
lower,upper=-.001,.055;radius=.150
planes=[(np.array([0,0,1.]),upper),(np.array([0,0,-1.]),-lower)]
for angle in np.linspace(0,2*math.pi,64,endpoint=False):planes.append((np.array([math.cos(angle),math.sin(angle),0.]),radius))
data={k:list(a) for k,a in attrs.items()};static=[];moving=[];cut_source=[];vertex_cache={}
def vertex(index,weight):
 if np.max(weight)>.999999999:return int(index[np.argmax(weight)])
 key=(tuple(index),tuple(np.round(weight,10)))
 if key in vertex_cache:return vertex_cache[key]
 output=len(data['POSITION'])
 for semantic,a in attrs.items():
  x=weight@a[index].astype(float)
  if semantic in ('NORMAL','TANGENT'):
   factor=127 if a.dtype==np.int8 else 32767 if a.dtype==np.int16 else 1
   x[:3]=x[:3]/max(np.linalg.norm(x[:3]),1e-12)*factor
  if np.issubdtype(a.dtype,np.integer):x=np.rint(x)
  data[semantic].append(x.astype(a.dtype))
 vertex_cache[key]=output;return output
def split_polygon(poly,positions,normal,limit):
 inside=[];outside=[]
 for i,a in enumerate(poly):
  b=poly[(i+1)%len(poly)];da=np.dot(a@positions,normal)-limit;db=np.dot(b@positions,normal)-limit
  ina=da<=1e-10;inb=db<=1e-10
  (inside if ina else outside).append(a)
  if ina!=inb:
   t=da/(da-db);w=a+(b-a)*t;inside.append(w);outside.append(w)
 return inside,outside
def triangles(poly,index):
 if len(poly)<3:return []
 ids=[vertex(index,w) for w in poly];return [[ids[0],ids[j],ids[j+1]] for j in range(1,len(ids)-1)]
split_faces=0;area_errors=[];partitioned_faces=[]
for fi,index in enumerate(f):
 first_static=len(static);first_moving=len(moving);p=local[index]
 if any(np.all(p@normal>limit+1e-10) for normal,limit in planes):static.append(index.tolist());area_errors.append(0.);continue
 poly=list(np.eye(3));outside=[]
 for normal,limit in planes:
  poly,out=split_polygon(poly,p,normal,limit);outside.extend(triangles(out,index))
  if len(poly)<3:break
 # Subtract only the measured stationary pointer box with exact cuts.
 remain=poly;pointer_out=[]
 for ax,lo,hi in [(0,.305,.375),(1,.392,.49),(2,.19,.25)]:
  unit=np.eye(3)[ax]
  for nn,ll in [(unit,hi),(-unit,-lo)]:
   remain,rest=split_polygon(remain,v[index],nn,ll);pointer_out.extend(triangles(rest,index))
   if len(remain)<3:break
  if len(remain)<3:break
 ins=pointer_out
 pointer_static=triangles(remain,index)
 if ins:
  moving.extend(ins);cut_source.append(fi);static.extend(outside);static.extend(pointer_static)
  if outside:split_faces+=1
 else:static.append(index.tolist())
 pieces=static[first_static:]+moving[first_moving:]
 original_area=np.linalg.norm(np.cross(v[index[1]]-v[index[0]],v[index[2]]-v[index[0]]))/2
 partition_area=0.
 for face in pieces:
  pp=np.asarray([data['POSITION'][j] for j in face],dtype=float);partition_area+=np.linalg.norm(np.cross(pp[1]-pp[0],pp[2]-pp[0]))/2
 area_errors.append(float(abs(partition_area-original_area)))
 if len(pieces)!=1:partitioned_faces.append({'sourceTriangle':fi,'outputTriangles':len(pieces),'originalArea':float(original_area),'partitionArea':float(partition_area)})
arrays={k:np.asarray(a,dtype=attrs[k].dtype) for k,a in data.items()};positions=arrays['POSITION'].astype(float)

# Keep the connected original painted plate and hub; detached rear case/pointer
# slivers belong to the fixed support, not to this inner rotor.
_,weld=np.unique(np.round(positions,6),axis=0,return_inverse=True);parents={}
def find_component(a):
 a=int(a);parents.setdefault(a,a)
 while parents[a]!=a:parents[a]=parents[parents[a]];a=parents[a]
 return a
for face in moving:
 a=find_component(weld[face[0]])
 for b in face[1:]:parents[find_component(weld[b])]=a
labels=np.array([find_component(weld[f[0]]) for f in moving]);groups=np.unique(labels)
areas=[]
for group in groups:
 pp=positions[np.asarray(moving)[labels==group]];areas.append(np.linalg.norm(np.cross(pp[:,1]-pp[:,0],pp[:,2]-pp[:,0]),axis=1).sum()/2)
keep=groups[np.argmax(areas)];returned=np.asarray(moving)[labels!=keep];static.extend(returned.tolist());moving=np.asarray(moving)[labels==keep].tolist()

# Boundary detection welds positions only for graph adjacency. Existing UV seams
# remain distinct in the exported primitive.
key_to_gid={};gid_vertex=[];gid=[]
for i,p in enumerate(positions):
 key=tuple(np.round(p,6))
 if key not in key_to_gid:key_to_gid[key]=len(gid_vertex);gid_vertex.append(i)
 gid.append(key_to_gid[key])
gid=np.array(gid);edge_rows={}
for tri in moving:
 for a,b in zip(tri,tri[1:]+tri[:1]):
  ga,gb=int(gid[a]),int(gid[b]);key=tuple(sorted((ga,gb)))
  if ga!=gb:edge_rows.setdefault(key,[]).append((ga,gb,a,b))
boundary=[rows[0] for rows in edge_rows.values() if len(rows)==1]
outgoing={}
for ga,gb,a,b in boundary:outgoing.setdefault(ga,[]).append((gb,a,b))
used=set();loops=[]
for start,nxt,a,b in boundary:
 if (start,nxt) in used:continue
 loop=[a];cur=start;dest=nxt
 for _ in range(5000):
  used.add((cur,dest));cur=dest
  if cur==start:break
  choices=[q for q in outgoing.get(cur,[]) if (cur,q[0]) not in used]
  if not choices:break
  dest,aa,bb=choices[0];loop.append(aa)
 if cur==start and len(loop)>=3:loops.append(loop)
 else:raise RuntimeError('Open or nonmanifold cut boundary; needs inspection')


# Close only extraction boundaries. The largest existing rim boundary receives
# a thin internal back shell; small cut openings use local neighboring UVs.
mutable={k:list(a) for k,a in arrays.items()};added=[];patches=[]
source_tri=v[f];source_cent=source_tri.mean(1);source_local=(source_cent-center)@rotation
source_norm=np.cross(source_tri[:,1]-source_tri[:,0],source_tri[:,2]-source_tri[:,0]);source_norm/=np.maximum(np.linalg.norm(source_norm,axis=1)[:,None],1e-15)
uv_id=original['attributes']['TEXCOORD_0'];uv=attrs['TEXCOORD_0'].astype(float);uv_accessor=doc['accessors'][uv_id]
if uv_accessor.get('normalized'):uv/=65535 if uv_accessor['componentType']==5123 else 255
mat=doc['materials'][original['material']];texture=doc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']];im=doc['images'][texture['source']];view=doc['bufferViews'][im['bufferView']]
pixels=np.asarray(Image.open(io.BytesIO(g.blob[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']])).convert('RGB'));ih,iw,_=pixels.shape;sample_uv=uv[f].mean(1)
colors=pixels[np.clip((sample_uv[:,1]*ih).astype(int),0,ih-1),np.clip((sample_uv[:,0]*iw).astype(int),0,iw-1)].astype(float)
wood=(np.linalg.norm(source_local[:,:2],axis=1)>.14)&(np.linalg.norm(source_local[:,:2],axis=1)<.18)&(source_local[:,2]>-.035)&(source_local[:,2]<.03)&(colors[:,0]>colors[:,2]*1.3)&(colors[:,0]>50)&(colors[:,0]<170)&(colors[:,1]>25)
paint=(np.linalg.norm(source_local[:,:2],axis=1)<.145)&(source_local[:,2]>.005)&(source_local[:,2]<.014)&(source_norm@axis>.8)

def add_face(points,label,prefer_wood=False):
 points=np.asarray(points,dtype=float);normal=np.cross(points[1]-points[0],points[2]-points[0]);norm=np.linalg.norm(normal)
 if norm<1e-12:return
 normal/=norm;mid=points.mean(0);score=np.linalg.norm(source_cent-mid,axis=1)
 allow=wood if prefer_wood else paint
 score[~allow]=np.inf;si=int(np.argmin(score));sv=source_tri[si];basis=np.c_[sv[1]-sv[0],sv[2]-sv[0]];indices=[];samples=[]
 for point in points:
  coef=np.linalg.lstsq(basis,point-sv[0],rcond=None)[0];weight=np.r_[1-coef.sum(),coef];weight=np.maximum(weight,0);weight/=weight.sum();idx=len(mutable['POSITION']);indices.append(idx)
  for semantic,arr in attrs.items():
   value=weight@arr[f[si]].astype(float)
   if semantic=='POSITION':value=point
   elif semantic in ('NORMAL','TANGENT'):
    factor=127 if arr.dtype==np.int8 else 32767 if arr.dtype==np.int16 else 1;value[:3]=normal*factor
   if np.issubdtype(arr.dtype,np.integer):value=np.rint(value)
   mutable[semantic].append(value.astype(arr.dtype))
  samples.append(weight.tolist())
 added.append(indices);patches.append({'kind':label,'donorOriginalTriangle':si,'barycentricUvWeights':samples,'area':norm/2})

def cap(points,label,wood=False):
 pts=np.asarray(points);mean=pts.mean(0);_,_,vh=np.linalg.svd(pts-mean);xy=(pts-mean)@vh[:2].T
 ids=mapbox_earcut.triangulate_float64(np.asarray(xy,dtype=np.float64),np.array([len(xy)],dtype=np.uint32)).reshape(-1,3)
 if len(ids)!=len(points)-2:raise RuntimeError('Non-simple boundary requires inspection')
 cross2=lambda a,b:a[0]*b[1]-a[1]*b[0]
 signed=sum(cross2(xy[i],xy[(i+1)%len(xy)]) for i in range(len(xy)))
 for tri in ids:
  if cross2(xy[tri[1]]-xy[tri[0]],xy[tri[2]]-xy[tri[0]])*signed<0:tri=tri[::-1]
  add_face(pts[tri],label,wood)

loop_stats=[]
for loop in loops:
 points=positions[loop];local_points=(points-center)@rotation;span=np.ptp(local_points,axis=0)
 loop_stats.append({'vertices':len(loop),'minLocal':local_points.min(0).tolist(),'maxLocal':local_points.max(0).tolist()})
 if min(span[0],span[1])>.25:
  # Backs are inset from the retained real front, within the original wheel case.
  back_local=local_points.copy();back_local[:,2]=-.007;back=back_local@rotation.T+center
  for i in range(len(points)):
   j=(i+1)%len(points);add_face([points[j],points[i],back[i]],'cut-rim-inner-side',True);add_face([points[j],back[i],back[j]],'cut-rim-inner-side',True)
  cap(back[::-1],'internal-back-closure',True)
 else:cap(points[::-1],'small-cut-boundary',np.median(local_points[:,2])<.004)
if len(added)>650:raise RuntimeError('Boundary closure budget exceeded')
arrays={k:np.asarray(a,dtype=attrs[k].dtype) for k,a in mutable.items()};native_moving_count=len(moving);moving.extend(added);meshes=[]
for is_moving,chosen in [(False,np.asarray(static)),(True,np.asarray(moving))]:
 ids,inverse=np.unique(chosen.reshape(-1),return_inverse=True);newattrs={}
 for semantic,arr in arrays.items():
  output=arr[ids].copy();template=doc['accessors'][original['attributes'][semantic]]
  if is_moving and semantic=='POSITION':output=((output-center)@rotation).astype(np.float32)
  elif is_moving and semantic in ('NORMAL','TANGENT'):
   factor=127 if template['componentType']==5120 else 32767 if template['componentType']==5122 else 1;q=output[:,:3].astype(float)/factor@rotation;output[:,:3]=np.rint(q*factor).astype(output.dtype) if factor!=1 else q
  newattrs[semantic]=g.add(output,template,34962)
 part=copy.deepcopy(original);part['attributes']=newattrs;part['indices']=g.add(inverse.astype(np.uint32).reshape(-1,1),{'componentType':5125,'type':'SCALAR'},34963)
 meshes.append({'name':'compact__chance_wheel__neural_wheel' if is_moving else 'compact__chance_wheel__static','primitives':[part]})
doc['meshes']=meshes;node['mesh']=0;parent=next(n for n in doc['nodes'] if node_index in n.get('children',[]));parent['children'].append(len(doc['nodes']))
doc['nodes'].append({'name':'compact__chance_wheel__neural_wheel','mesh':1,'translation':center.tolist(),'rotation':quaternion.tolist(),'extras':{'lifePart':'wheel','geometryOrigin':'Existing neural painted plate and hub with measured extraction-boundary closure; original outer case, pointer and support remain fixed','repairReport':'repair-v04.json'}})
g.compact();target=OUT/'wheel-v04.glb';g.save(target);assert before_images==GLB(target).image_hashes();assert digest(SOURCE)==EXPECTED
assert len(area_errors)==len(f) and max(area_errors)<1e-8
report={'tool':{'path':str(Path(__file__).resolve()),'sha256':digest(__file__)},'sourceFacePartitionProof':{'comparedTriangles':len(f),'maxAbsolutePerFaceAreaError':max(area_errors),'sumAbsolutePerFaceAreaError':sum(area_errors),'partitionedFaces':partitioned_faces,'allOriginalVerticesUnmoved':True},'status':'mechanical_boundary_repair_pending_actual_pose_review','source':{'path':str(SOURCE),'sha256':EXPECTED},'output':{'path':str(target),'sha256':digest(target),'bytes':target.stat().st_size},'method':'Exact clipping of original painted inner-disc surfaces and hub, retaining the largest area connected source component. Disconnected original case/support fragments return to the static body. Measured existing rim boundary receives only an inset internal back and side closure; small cut boundaries interpolate UV from original nearby painted/wooden source faces. This is original neural front geometry with local mechanical cut repairs, not a replacement disc or image repaint.','center':center.tolist(),'axis':axis.tolist(),'radius':radius,'depth':[lower,upper],'sourceTriangles':len(f),'staticTriangles':len(static),'movingOriginalOrRetriangulatedTriangles':native_moving_count,'addedCapTriangles':len(added),'splitSourceTriangles':split_faces,'returnedStaticTriangles':len(returned),'originalVerticesMoved':0,'embeddedImageHashesUnchanged':True,'originalMaterialUnchanged':True,'loops':loop_stats,'patches':patches,'limitations':['Original outer wooden rim and rear case stay fixed while the painted inner face and original hub rotate.','New internal closure is a documented mechanical repair, not unseen native-generated rear geometry.','Requires actual asymmetric pose review before approval.']}
(OUT/'repair-v04.json').write_text(json.dumps(report,indent=2),'utf-8');print(json.dumps({k:v for k,v in report.items() if k not in ['patches','loops']},indent=2))

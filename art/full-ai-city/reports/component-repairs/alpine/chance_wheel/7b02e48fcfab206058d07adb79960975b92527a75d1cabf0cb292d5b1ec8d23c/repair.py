"""Local rigid extraction/cut-boundary repair of the existing neural wheel only."""
from pathlib import Path
import sys,json,copy,math
import numpy as np
import mapbox_earcut
from scipy.spatial import Delaunay
ROOT=Path(__file__).resolve().parents[4];OUT=Path(__file__).parent
sys.path.insert(0,str(ROOT/'art/full-ai-city/tools'))
from neural_component import GLB,digest,frame
SOURCE=OUT/'source-near.glb'
if not SOURCE.exists():SOURCE=ROOT/'art/full-ai-city/candidates/alpine/chance_wheel.glb'
EXPECTED='31068718b92b5fbb791d2daf5ca0aab26157f7f8cd454ddace310e3948ce75b6'
assert digest(SOURCE)==EXPECTED
g=GLB(SOURCE);before_images=g.image_hashes();doc=g.doc
node_index,node=next((i,n) for i,n in enumerate(doc['nodes']) if 'mesh' in n)
original=copy.deepcopy(doc['meshes'][node['mesh']]['primitives'][0]);attrs={k:g.array(a) for k,a in original['attributes'].items()};v=attrs['POSITION'].astype(float);f=g.array(original['indices']).reshape(-1,3)
center=np.array([.339,.275,.2255]);axis=np.array([.096,-.002,.99538]);rotation,quaternion=frame(axis)
local=(v-center)@rotation
# Measured blue face planes lie about +/- .015. The slab leaves their original
# small relief intact but excludes the projecting stationary wooden support.
lower,upper=-.025,.0185;radius=.132
planes=[(np.array([0,0,1.]),upper),(np.array([0,0,-1.]),-lower)]
for angle in np.linspace(0,2*math.pi,32,endpoint=False):planes.append((np.array([math.cos(angle),math.sin(angle),0.]),radius))
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
split_faces=0
for fi,index in enumerate(f):
 p=local[index]
 if any(np.all(p@normal>limit+1e-10) for normal,limit in planes):static.append(index.tolist());continue
 poly=list(np.eye(3));outside=[]
 for normal,limit in planes:
  poly,out=split_polygon(poly,p,normal,limit);outside.extend(triangles(out,index))
  if len(poly)<3:break
 ins=triangles(poly,index)
 if ins:
  moving.extend(ins);cut_source.append(fi);static.extend(outside)
  if outside:split_faces+=1
 else:static.append(index.tolist())
arrays={k:np.asarray(a,dtype=attrs[k].dtype) for k,a in data.items()};positions=arrays['POSITION'].astype(float)
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
def cross2(a,b):return a[0]*b[1]-a[1]*b[0]
def triangulate(points,xy=None):
 if xy is None:
  mean=points.mean(0);_,_,vh=np.linalg.svd(points-mean);xy=(points-mean)@vh[:2].T
 result=mapbox_earcut.triangulate_float64(np.asarray(xy,dtype=np.float64),np.array([len(xy)],dtype=np.uint32)).reshape(-1,3).tolist()
 if len(result)!=len(xy)-2:raise RuntimeError('Boundary needs non-simple polygon inspection')
 signed=sum(cross2(xy[j],xy[(j+1)%len(xy)]) for j in range(len(xy)))
 for tri in result:
  if cross2(xy[tri[1]]-xy[tri[0]],xy[tri[2]]-xy[tri[0]])*signed<0:tri.reverse()
 return result
 area=sum(cross2(xy[j],xy[(j+1)%len(xy)]) for j in range(len(xy)))
 order=list(range(len(xy)));sign=1 if area>0 else -1;result=[]
 for _ in range(len(xy)*len(xy)):
  if len(order)==3:result.append(order);break
  found=False
  for k,b in enumerate(order):
   a=order[k-1];c=order[(k+1)%len(order)]
   if cross2(xy[b]-xy[a],xy[c]-xy[b])*sign<1e-11:continue
   def inside(p):return min(cross2(xy[b]-xy[a],p-xy[a])*sign,cross2(xy[c]-xy[b],p-xy[b])*sign,cross2(xy[a]-xy[c],p-xy[c])*sign)>=-1e-10
   if any(inside(xy[p]) for p in order if p not in (a,b,c)):continue
   result.append([a,b,c]);order.pop(k);found=True;break
  if not found:
   # Remove collinear cut-edge subdivisions before retrying.
   scores=[abs(cross2(xy[order[k]]-xy[order[k-1]],xy[order[(k+1)%len(order)]]-xy[order[k]])) for k in range(len(order))]
   k=int(np.argmin(scores))
   if scores[k]>1e-7:raise RuntimeError('Non-simple boundary cannot be locally capped')
   order.pop(k)
 return result
source_faces=np.array(cut_source);source_triangles=v[f[source_faces]];source_centroids=source_triangles.mean(1)
source_normals=np.cross(source_triangles[:,1]-source_triangles[:,0],source_triangles[:,2]-source_triangles[:,0]);source_normals/=np.maximum(np.linalg.norm(source_normals,axis=1)[:,None],1e-12)
source_local=(source_centroids-center)@rotation
palette=(np.abs(source_normals@axis)>.86)&(np.linalg.norm(source_local[:,:2],axis=1)<.141)&(np.abs(source_local[:,0])>.032)&(np.abs(source_local[:,2])>.007)&(np.abs(source_local[:,2])<.023)
source_colors=np.load(OUT/'diagnostics.npz')['colors'][source_faces].astype(float)
red,green,blue=source_colors.T
painted=((blue>red*1.08)&(green>red*1.08))|((red>green*1.6)&(red>blue*1.6))|((red>140)&(green>110)&(blue<red*.75))
palette=(np.abs(source_normals@axis)>.98)&(np.linalg.norm(source_local[:,:2],axis=1)<.141)&(np.abs(source_local[:,0])>.026)&(np.abs(source_local[:,2])>.012)&(np.abs(source_local[:,2])<.0185)
color_fields={}
for side in ('front','back'):
 chosen=np.flatnonzero(palette&(source_local[:,2]>0 if side=='front' else source_local[:,2]<0));color_fields[side]=(Delaunay(source_local[chosen,:2]),chosen)
np.savez(OUT/'boundary-debug.npz',positions=positions,boundary=np.asarray(boundary),loops=np.asarray(loops,dtype=object),center=center,rotation=rotation)
print('BOUNDARIES',[(len(loop),positions[loop].min(0).tolist(),positions[loop].max(0).tolist()) for loop in loops],flush=True)
patches=[];added=[];mutable={k:list(a) for k,a in arrays.items()};colors=[np.ones(4,dtype=np.float32) for _ in arrays['POSITION']]
def add_patch(points,tris,label):
 patch_area=0;patch_faces=[]
 queue=[(points[corners],0) for corners in tris]
 while queue:
  pp,depth=queue.pop();normal=np.cross(pp[1]-pp[0],pp[2]-pp[0]);area=np.linalg.norm(normal)/2
  if area<1e-10:continue
  if label.endswith('occluded-strip') and depth<3 and area>.00017:
   a,b,c=pp;mid=pp.mean(0)
   queue.extend((np.array(t),depth+1) for t in ((a,b,mid),(b,c,mid),(c,a,mid)));continue
  normal/=2*area;patch_area+=area;mid=pp.mean(0)
  score=np.linalg.norm(source_centroids-mid,axis=1)+(.025*(1-np.abs(source_normals@normal)))
  if label.endswith('occluded-strip'):
   same_side=source_local[:,2]>0 if label.startswith('front') else source_local[:,2]<0
   allowed=palette&same_side
   if allowed.any():score[~allowed]=np.inf
  nearest=int(np.argmin(score));si=int(source_faces[nearest]);sv=v[f[si]]
  # Each patch triangle uses one neighboring native triangle's attribute field.
  # Clamped barycentric interpolation stays inside that original UV island.
  basis=np.c_[sv[1]-sv[0],sv[2]-sv[0]];indexes=[];color_samples=[]
  for point in pp:
   coeff=np.linalg.lstsq(basis,point-sv[0],rcond=None)[0];weights=np.array([1-coeff.sum(),coeff[0],coeff[1]]);weights=np.maximum(weights,0);weights/=weights.sum()
   if label.endswith('occluded-strip'):weights=.35*weights+.65/3
   ni=len(mutable['POSITION']);indexes.append(ni)
   for semantic,a in attrs.items():
    value=weights@a[f[si]].astype(float)
    if semantic=='POSITION':value=point
    elif semantic in ('NORMAL','TANGENT'):
     factor=127 if a.dtype==np.int8 else 32767 if a.dtype==np.int16 else 1;value[:3]=normal*factor
    if np.issubdtype(a.dtype,np.integer):value=np.rint(value)
    mutable[semantic].append(value.astype(a.dtype))
   if label.endswith('occluded-strip'):
    field,ids=color_fields['front' if label.startswith('front') else 'back'];xy=((point-center)@rotation)[:2];simplex=int(field.find_simplex(xy))
    if simplex>=0:
     transform=field.transform[simplex];w=transform[:2]@(xy-transform[2]);mix=np.r_[w,1-w.sum()];selected=ids[field.simplices[simplex]]
    else:
     distance=np.linalg.norm(source_local[ids,:2]-xy,axis=1);nearests=np.argsort(distance)[:3];selected=ids[nearests];mix=1/np.maximum(distance[nearests],.002)**4;mix/=mix.sum()
    rgb=(mix@source_colors[selected])/255
   else:rgb=source_colors[nearest]/255;selected=np.array([nearest]);mix=np.array([1.])
   color_samples.append({'sourceTriangles':source_faces[selected].tolist(),'weights':mix.tolist(),'sampleRgbSrgb255':source_colors[selected].tolist(),'sourceSamples':'Original base-color texture evaluated at each native source triangle UV centroid; no source pixels changed'})
   rgb=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4)
   colors.append(np.r_[rgb,1].astype(np.float32))
  added.append(indexes);patch_faces.append({'sourceNeighborTriangle':si,'newVertexIndices':indexes,'colorSamplesPerVertex':color_samples})
 patches.append({'kind':label,'boundaryVertices':len(points),'triangles':len(patch_faces),'surfaceArea':patch_area,'bounds':{'min':points.min(0).tolist(),'max':points.max(0).tolist()},'faces':patch_faces})
# The native stand occludes a narrow vertical strip through BOTH disk faces.
# Closing each disconnected half in 3D would preserve that gap. Instead, join
# the two inspected coplanar cut-edge chains, interpolating across only the
# hidden strip. The joining top/bottom chords use existing boundary endpoints.
for plane_id in (0,1):
 normal,limit=planes[plane_id]
 selected=[row for row in boundary if max(abs(((positions[row[2]]-center)@rotation)@normal-limit),abs(((positions[row[3]]-center)@rotation)@normal-limit))<2e-6]
 outgoing_plane={row[0]:row for row in selected};incoming={row[1] for row in selected};seen=set();chains=[];closed=[]
 starts=[row for row in selected if row[0] not in incoming]+selected
 for row in starts:
  start=int(row[0])
  if start in seen:continue
  chain=[int(row[2])];cur=start
  while cur in outgoing_plane and cur not in seen:
   seen.add(cur);edge=outgoing_plane[cur];chain.append(int(edge[3]));cur=int(edge[1])
  if cur==start:closed.append(chain[:-1])
  else:chains.append(chain)
 short=[q for q in chains if np.ptp(((positions[q]-center)@rotation)[:,1])<.1]
 closed.extend(short);chains=[q for q in chains if q not in short]
 print('PLANE_CHAINS',plane_id,[(len(q),((positions[q[0]]-center)@rotation).tolist(),((positions[q[-1]]-center)@rotation).tolist()) for q in chains],flush=True)
 assert 1<=len(chains)<=2, ('Unexpected stand boundary',plane_id,[len(q) for q in chains])
 # Existing face boundary orientation is reversed for the new surface.
 strip=sum(chains,[])[::-1];points=positions[strip]
 add_patch(points,triangulate(points,((points-center)@rotation)[:,:2]),'front-occluded-strip' if plane_id==0 else 'back-occluded-strip')
 for hole in closed:
  points=positions[hole[::-1]]
  print('SMALL',plane_id,len(hole),((points-center)@rotation).round(6).tolist(),flush=True)
  add_patch(points,triangulate(points,((points-center)@rotation)[:,:2]),'small-slab-cut')
# Re-evaluate remaining geometric boundaries after face strips are joined.
# They are the short outer-rim cut sections, not a newly authored full disk.
pos_now=np.asarray(mutable['POSITION']).astype(float);gid_lookup={};gid_new=[]
for p in pos_now:
 key=tuple(np.round(p,6));gid_lookup.setdefault(key,len(gid_lookup));gid_new.append(gid_lookup[key])
rows={}
for tri in moving+added:
 for a,b in zip(tri,tri[1:]+tri[:1]):
  ga,gb=gid_new[a],gid_new[b]
  if ga!=gb:rows.setdefault(tuple(sorted((ga,gb))),[]).append((ga,gb,a,b))
rim_boundary=[q[0] for q in rows.values() if len(q)==1];rim_out={q[0]:q for q in rim_boundary};seen=set();rim_loops=[]
for row in rim_boundary:
 start=row[0]
 if start in seen:continue
 loop=[];cur=start
 while cur not in seen and cur in rim_out:
  seen.add(cur);q=rim_out[cur];loop.append(q[2]);cur=q[1]
 if cur!=start:raise RuntimeError('Remaining rim has an open chain')
 rim_loops.append(loop)
print('RIM_LOOPS',[(len(q),pos_now[q].min(0).tolist(),pos_now[q].max(0).tolist()) for q in rim_loops],flush=True)
if len(rim_loops)==2 and abs(np.mean(((pos_now[rim_loops[0]]-center)@rotation)[:,2])-np.mean(((pos_now[rim_loops[1]]-center)@rotation)[:,2]))>.02:
 # With the native outer ring kept static, the two loops are the front/back
 # circumference of the original inner rotor. Bridge them; never fill either
 # circle with a replacement face.
 ordered=[]
 for loop in rim_loops:
  pp=pos_now[loop];qq=(pp-center)@rotation;angle=np.unwrap(np.arctan2(qq[:,1],qq[:,0]))
  if angle[-1]<angle[0]:pp=pp[::-1];qq=qq[::-1]
  wrapped=np.mod(np.arctan2(qq[:,1],qq[:,0]),2*np.pi);start=int(np.argmin(wrapped));pp=np.roll(pp,-start,axis=0);qq=np.roll(qq,-start,axis=0)
  angle=np.unwrap(np.arctan2(qq[:,1],qq[:,0]));angle-=2*np.pi*math.floor(angle[0]/(2*np.pi));ordered.append((pp,angle))
 ordered.sort(key=lambda pair:np.mean(((pair[0]-center)@rotation)[:,2]),reverse=True)
 (pa,aa),(pb,ab)=ordered;points=np.r_[pa,pb];na,nb=len(pa),len(pb);ia=ib=0;tris=[]
 while ia<na or ib<nb:
  nexta=aa[(ia+1)%na]+(2*np.pi if ia+1>=na else 0) if ia<na else np.inf
  nextb=ab[(ib+1)%nb]+(2*np.pi if ib+1>=nb else 0) if ib<nb else np.inf
  if nexta<=nextb:tri=[ia%na,na+ib%nb,(ia+1)%na];ia+=1
  else:tri=[ia%na,na+ib%nb,na+(ib+1)%nb];ib+=1
  tris.append(tri)
 add_patch(points,tris,'inner-rotor-edge-bridge')
 rim_loops=[]
for loop in rim_loops:
 points=pos_now[loop[::-1]]
 # The boundary can wrap half of the thin rim. A single planar projection
 # incorrectly fills across the wheel face. A minimum-area 3D triangulation
 # chooses the nearby front/back pairs and retains the actual cut vertices.
 count=len(points);cost=np.full((count,count),np.inf);choice=np.full((count,count),-1,dtype=int)
 for j in range(count-1):cost[j,j+1]=0
 for gap in range(2,count):
  for a in range(count-gap):
   b=a+gap;ks=np.arange(a+1,b)
   areas=np.linalg.norm(np.cross(points[ks]-points[a],points[b]-points[a]),axis=1)/2
   scores=cost[a,ks]+cost[ks,b]+areas
   take=int(np.argmin(scores));cost[a,b]=scores[take];choice[a,b]=ks[take]
 tris=[];pending=[(0,count-1)]
 while pending:
  a,b=pending.pop()
  if b-a<2:continue
  k=int(choice[a,b]);tris.append([a,k,b]);pending.extend(((a,k),(k,b)))
 add_patch(points,tris,'native-outer-rim-cut')
arrays={k:np.asarray(a,dtype=attrs[k].dtype) for k,a in mutable.items()};arrays['COLOR_0']=np.asarray(colors,dtype=np.float32)
print('CAP_AREAS',[(p['kind'],p['triangles'],p['surfaceArea']) for p in patches],flush=True)
if len(added)>800 or sum(p['surfaceArea'] for p in patches)>.065:raise RuntimeError('Repair exceeds local-boundary scope')
native_moving_count=len(moving)
patch_material={'name':'alpine__chance_wheel__local_occlusion_repair','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1],'metallicFactor':0,'roughnessFactor':.9}}
doc['materials'].append(patch_material);patch_material_index=len(doc['materials'])-1
moving.extend(added);meshes=[]
for is_moving,chosen in [(False,np.asarray(static)),(True,np.asarray(moving))]:
 ids,inverse=np.unique(chosen.reshape(-1),return_inverse=True);newattrs={}
 for semantic,arr in arrays.items():
  output=arr[ids].copy();template={'componentType':5126,'type':'VEC4'} if semantic=='COLOR_0' else doc['accessors'][original['attributes'][semantic]]
  if is_moving and semantic=='POSITION':output=((output-center)@rotation).astype(np.float32)
  elif is_moving and semantic in ('NORMAL','TANGENT'):
   factor=127 if template['componentType']==5120 else 32767 if template['componentType']==5122 else 1
   q=output[:,:3].astype(float)/factor@rotation;output[:,:3]=np.rint(q*factor).astype(output.dtype) if factor!=1 else q
  newattrs[semantic]=g.add(output,template,34962)
 part=copy.deepcopy(original);part['attributes']=newattrs
 if is_moving:
  part['indices']=g.add(inverse[:native_moving_count*3].astype(np.uint32).reshape(-1,1),{'componentType':5125,'type':'SCALAR'},34963)
  patch_part=copy.deepcopy(part);patch_part['material']=patch_material_index;patch_part['indices']=g.add(inverse[native_moving_count*3:].astype(np.uint32).reshape(-1,1),{'componentType':5125,'type':'SCALAR'},34963)
  parts=[part,patch_part]
 else:
  part['indices']=g.add(inverse.astype(np.uint32).reshape(-1,1),{'componentType':5125,'type':'SCALAR'},34963);parts=[part]
 meshes.append({'name':'alpine__chance_wheel__neural_wheel' if is_moving else 'alpine__chance_wheel__static','primitives':parts})
doc['meshes']=meshes;node['mesh']=0
parent=next(n for n in doc['nodes'] if node_index in n.get('children',[]));parent['children'].append(len(doc['nodes']))
doc['nodes'].append({'name':'alpine__chance_wheel__neural_wheel','mesh':1,'translation':center.tolist(),'rotation':quaternion.tolist(),'extras':{'lifePart':'wheel','geometryOrigin':'Existing native wheel with local cut-boundary caps only; no replacement disc','repairReport':'repair-report.json'}})
g.compact();target=OUT/'repaired-wheel.glb';g.save(target)
assert before_images==GLB(target).image_hashes();assert digest(SOURCE)==EXPECTED
report={'status':'local_repair_pending_actual_pose_review','source':{'path':str(SOURCE),'sha256':EXPECTED},'output':{'path':str(target),'sha256':digest(target)},'method':'Exact clipping of original native inner-disk surfaces. The real outer rim, stands, hub caps and top pointer remain static. The front/back occluded strips are joined only along the measured native cut boundaries; the two inner circumferences are bridged without filling/replacing either disk face. Original geometry vertices remain unmoved. New cap UVs retain neighboring-face interpolation for provenance. Only added cap primitives use color propagated from actual same-side native painted-surface base-color samples through a Delaunay barycentric field; original 3 images and original material are byte/JSON identical. No authored full disk, no image repainting.','colorRepairReason':'Original neural geometry has no visible painted surface behind the fused support; directly sampling its occluded UVs produces stationary-wood shadows on the rotor. Per-vertex source triangles, sample RGB and exact interpolation weights are recorded for every added face. The local cap material has no normal map to avoid borrowing unrelated atlas tangent orientation.','center':center.tolist(),'axis':(axis/np.linalg.norm(axis)).tolist(),'slab':[lower,upper],'radius':radius,'sourceTriangles':len(f),'staticTriangles':len(static),'movingOriginalOrRetriangulatedTriangles':len(moving)-len(added),'addedCapTriangles':len(added),'splitSourceTriangles':split_faces,'newCutVertices':len(arrays['POSITION'])-len(v)-len(added)*3,'originalVerticesMoved':0,'embeddedImageHashesUnchanged':True,'originalMaterialUnchanged':True,'newCapSurfaceArea':sum(p['surfaceArea'] for p in patches),'limitations':['The formerly occluded strip contains an interpolated color field, not unseen original neural paint; a softer color band remains visible in extreme close-up.','Geometry repair and motion inspection do not constitute final registry approval.'],'patches':patches}
(OUT/'repair-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='patches'},ensure_ascii=False,indent=2))

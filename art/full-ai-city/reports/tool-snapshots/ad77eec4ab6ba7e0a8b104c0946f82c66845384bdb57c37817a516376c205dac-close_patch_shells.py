"""Give only the previously documented local wall patches inward thickness.

Original neural face positions and UVs are verified exactly before changing any
derived data. The existing visible patch faces stay unchanged. New back/edge
faces follow those same irregular patches, never whole-wall rectangles.
"""
from pathlib import Path
from collections import Counter
import sys,json,copy,hashlib
from datetime import datetime,timezone
import numpy as np
OUT=Path(__file__).parent;ROOT=OUT.parents[3];sys.path.insert(0,str(ROOT/'art/full-ai-city/tools'))
from neural_component import GLB,digest
ART=ROOT/'art/full-ai-city';DEST=OUT/'closed-patches';DEST.mkdir(exist_ok=True)
RAW=ART/'source/classic--villa_3-a003-pixal-mv-1024-18342.glb'
NATIVE=ART/'work/repair-villa3/repaired-native.glb';NORMALIZED=ART/'work/repair-villa3/repaired-normalized.glb'
RECEIPT=ART/'reports/local-repairs/classic/villa_3/24c796a005b3fa41/repair.json'
def evidence(path):return {'path':str(path),'sha256':digest(path),'bytes':path.stat().st_size}
def arrays(g):
 p=g.doc['meshes'][0]['primitives'][0]
 return p,{k:g.array(v) for k,v in p['attributes'].items()},g.array(p['indices']).reshape(-1,3)
assert digest(NATIVE)=='24c796a005b3fa413dff1b88a9db245c4e129c97ef434638bea2d0f8607276fe'
raw,native,norm=GLB(RAW),GLB(NATIVE),GLB(NORMALIZED)
rp,ra,rt=arrays(raw);p,a,t=arrays(native);np_,na,nt=arrays(norm)
receipt=json.loads(RECEIPT.read_text('utf8'));n0=receipt['originalTriangles']
assert n0==len(rt)==972614 and len(t)==n0+receipt['newTriangles']
prefix_evidence={}
for semantic in ('POSITION','TEXCOORD_0'):
 err=float(np.max(np.abs(ra[semantic][rt]-a[semantic][t[:n0]])))
 assert err==0,(semantic,err)
 prefix_evidence[semantic]=err
# Recover native-to-normalized mapping using identical triangle corners, not
# vertex index assumptions (export splits three extra seam vertices).
sample=np.linspace(0,len(t)-1,4096,dtype=np.int64)
norm_points=na['POSITION'][nt[sample]].reshape(-1,3).astype(np.float64)
native_points=a['POSITION'][t[sample]].reshape(-1,3).astype(np.float64)
affine=np.linalg.lstsq(np.c_[norm_points,np.ones(len(norm_points))],native_points,rcond=None)[0]
mapping_error=float(np.max(np.abs(np.c_[norm_points,np.ones(len(norm_points))]@affine-native_points)))
assert mapping_error<1e-6
images_before=native.image_hashes();materials_before=copy.deepcopy(native.doc['materials'])
extra={key:[] for key in a};new_indices=[];records=[];face_start=n0;extra_count=0
def append_triangle(ref_indices,coordinates):
 global extra_count
 coords=np.asarray(coordinates,dtype=np.float64)
 normal=np.cross(coords[1]-coords[0],coords[2]-coords[0]);length=np.linalg.norm(normal)
 if length<1e-14:raise RuntimeError('Degenerate local closing face')
 normal/=length
 for key,values in a.items():
  values=values[np.asarray(ref_indices)].copy()
  if key=='POSITION':values=coords.astype(values.dtype)
  elif key=='NORMAL':values[:,:3]=normal
  extra[key].append(values)
 new_indices.append(np.arange(3,dtype=np.uint32)+len(a['POSITION'])+extra_count);extra_count+=3
for number,region in enumerate(receipt['repairs']):
 count=region['newTriangles'];native_faces=t[face_start:face_start+count];normalized_faces=nt[face_start:face_start+count]
 native_coords=a['POSITION'][native_faces];norm_coords=na['POSITION'][normalized_faces]
 # Actual patch corners lie on the documented 2 mm grid. Its irregular edge
 # is recovered from exact positions; normal/UV seam duplicates are welded for
 # topology inspection only, never moved in the real source.
 unique,inverse=np.unique(np.round(norm_coords.reshape(-1,3),8),axis=0,return_inverse=True)
 faces=inverse.reshape(-1,3)
 counts=Counter(tuple(sorted((int(x),int(y)))) for f in faces for x,y in zip(f,np.roll(f,-1)))
 assert max(counts.values())<=2
 boundary=[(int(x),int(y),int(native_faces[fi,j]),int(native_faces[fi,(j+1)%3])) for fi,f in enumerate(faces) for j,(x,y) in enumerate(zip(f,np.roll(f,-1))) if counts[tuple(sorted((int(x),int(y))))]==1]
 # GLTF normalized Z points out of the front, opposite Blender wall Y.
 inward_z=.006 if region['side']=='rear' else -.006
 native_delta=np.array([0.,0.,inward_z])@affine[:3,:]
 begin=len(new_indices)
 for ids,coords in zip(native_faces,native_coords):append_triangle(ids[::-1],(coords+native_delta)[::-1])
 for x,y,ia,ib in boundary:
  pa,pb=a['POSITION'][[ia,ib]].astype(np.float64);qa,qb=pa+native_delta,pb+native_delta
  append_triangle([ia,ia,ib],[pa,qa,pb]);append_triangle([ib,ia,ib],[pb,qa,qb])
 cap_back=faces[:,::-1]+len(unique)
 sides=np.asarray([(x,x+len(unique),y) for x,y,_,_ in boundary]+[(y,x+len(unique),y+len(unique)) for x,y,_,_ in boundary],dtype=np.int64)
 shell=np.vstack((faces,cap_back,sides));edge=Counter(tuple(sorted((int(x),int(y)))) for f in shell for x,y in zip(f,np.roll(f,-1)))
 if any(v!=2 for v in edge.values()):raise RuntimeError('Shell has open/nonmanifold edge')
 records.append({'regionIndex':number,'side':region['side'],'originalRepair':region,'firstExistingFace':face_start,'existingVisibleFaces':count,'visibleFacePositionsAndUVUnchanged':True,'inwardThicknessNormalized':abs(inward_z),'newBackFaces':count,'newEdgeFaces':2*len(boundary),'addedFaces':len(new_indices)-begin,'boundaryEdgesBefore':len(boundary),'boundaryEdgesAfter':0,'normalizedBounds':{'min':norm_coords.min((0,1)).tolist(),'max':norm_coords.max((0,1)).tolist()},'sourceUV':'Copied from the exact existing repaired patch vertex at the same boundary/cap corner; original same-wall UV interpolation receipt retained.'})
 face_start+=count
assert face_start==len(t)
for key,accessor in list(p['attributes'].items()):
 combined=np.concatenate([a[key],*extra[key]])
 assert np.array_equal(combined[:len(a[key])],a[key])
 p['attributes'][key]=native.add(combined,native.doc['accessors'][accessor],34962)
p['indices']=native.add(np.vstack((t,np.asarray(new_indices))).astype(np.uint32).reshape(-1,1),{'componentType':5125,'type':'SCALAR'},34963)
native.doc['nodes'][0]['name']='classic_villa3_neural_local_patches_closed_inward'
native.compact();output=DEST/'repaired-native.glb';native.save(output)
check=GLB(output);assert check.image_hashes()==images_before and check.doc['materials']==materials_before
report=copy.deepcopy(receipt)
report.update({'status':'closed_local_patch_candidate_pending_visual_review','createdAt':datetime.now(timezone.utc).isoformat(),'method':'Previous source-derived irregular local patch outer surfaces remain exactly unchanged; give only those 11 patches 0.006 normalized inward thickness using reversed back faces and boundary bridge triangles. Original neural folds remain unchanged for this isolated voxel-robustness test. No whole wall or replacement building is constructed.','parentRepair':evidence(RECEIPT),'parentRepairedSource':evidence(NATIVE),'source':evidence(RAW),'nativeOutput':evidence(output),'newTriangles':receipt['newTriangles']+len(new_indices),'newVertices':receipt['newVertices']+extra_count,'originalVerticesMoved':0,'originalTrianglesDeleted':0,'repairs':records,'closingFacesAdded':len(new_indices),'closingVerticesAdded':extra_count,'originalPrefixVerifiedByExactTriangleCorner':prefix_evidence,'nativeMappingMaxError':mapping_error,'originalEmbeddedImagesByteIdentical':True,'originalMaterialDefinitionsUnchanged':True,'processingTool':evidence(Path(__file__))})
report.pop('normalizedOutput',None);report.pop('renders',None);report.pop('reviewImages',None)
(DEST/'repair.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'output':evidence(output),'closedPatches':len(records),'newClosingTriangles':len(new_indices),'sourceUnchanged':evidence(NATIVE),'totalTriangles':len(t)+len(new_indices)},indent=2))

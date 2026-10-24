"""Check a recorded exact source partition and local rotor closure independently."""
from pathlib import Path
import argparse,json,sys
import numpy as np
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation
from neural_component import GLB,digest
p=argparse.ArgumentParser();p.add_argument('--repair',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
r=json.loads(a.repair.read_text('utf8'));source=Path(r['source']['path']);result=Path(r['output']['path'])
assert digest(source)==r['source']['sha256'] and digest(result)==r['output']['sha256']
s=GLB(source);g=GLB(result)
assert s.image_hashes()==g.image_hashes() and s.doc['materials']==g.doc['materials']
def arrays(glb,mesh):
    part=glb.doc['meshes'][mesh]['primitives'][0]
    return glb.array(part['attributes']['POSITION']).astype(float),glb.array(part['indices']).reshape(-1,3)
sv,sf=arrays(s,0);positions=[];surface_area=0.;moving_geometry=None
for node in g.doc['nodes']:
    if 'mesh' not in node:continue
    v,f=arrays(g,node['mesh']);moving=node.get('extras',{}).get('lifePart')=='wheel'
    assert 'matrix' not in node and 'scale' not in node
    rotation=Rotation.from_quat(node.get('rotation',[0,0,0,1])).as_matrix()
    world=v@rotation.T+np.array(node.get('translation',[0,0,0]));positions.append(world[np.unique(f)])
    native_faces=f[:r['movingOriginalOrRetriangulatedTriangles']] if moving else f
    tri=world[native_faces];surface_area+=float(np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1).sum()/2)
    if moving:moving_geometry=(v,f)
    else:assert len(f)==r['staticTriangles']
assert moving_geometry is not None
max_original_vertex_error=float(cKDTree(np.concatenate(positions)).query(sv[np.unique(sf)])[0].max())
assert max_original_vertex_error<2e-7,('Original source vertex missing or moved',max_original_vertex_error)
stri=sv[sf];original_area=float(np.linalg.norm(np.cross(stri[:,1]-stri[:,0],stri[:,2]-stri[:,0]),axis=1).sum()/2)
area_error=abs(surface_area-original_area);assert area_error<1e-6
v,f=moving_geometry;assert len(f)==r['movingOriginalOrRetriangulatedTriangles']+r['addedCapTriangles']
_,ids=np.unique(np.round(v,6),axis=0,return_inverse=True);ff=ids[f]
edges=np.concatenate([ff[:,[0,1]],ff[:,[1,2]],ff[:,[2,0]]]);keys=np.sort(edges,axis=1)
_,counts=np.unique(keys,axis=0,return_counts=True)
areas=np.linalg.norm(np.cross(v[f[:,1]]-v[f[:,0]],v[f[:,2]]-v[f[:,0]]),axis=1)/2
assert not np.any(counts!=2),('Open or nonmanifold rotor edge',np.unique(counts,return_counts=True))
assert not np.any(areas<1e-12)
proof={'status':'source_vertex_positions_surface_area_images_materials_preserved_and_rotor_closed','repairReceipt':{'path':str(a.repair.resolve()),'sha256':digest(a.repair)},'source':r['source'],'output':r['output'],'tool':{'path':str(Path(__file__).resolve()),'sha256':digest(__file__)},'originalImagesEqual':True,'originalMaterialsEqual':True,'originalReferencedVertices':len(np.unique(sf)),'maxOriginalVertexErrorAtZeroPose':max_original_vertex_error,'actualOriginalSurfaceArea':original_area,'actualOutputSourceSurfaceArea':surface_area,'actualTotalAreaError':area_error,'recordedPerSourceFacePartition':r['sourceFacePartitionProof'],'movingTriangles':len(f),'addedLocalClosureTriangles':r['addedCapTriangles'],'weldTolerance':1e-6,'openEdges':int((counts==1).sum()),'nonManifoldEdges':int((counts>2).sum()),'degenerateFaces':int((areas<1e-12).sum()),'scope':'Independently checks actual zero-pose original vertex retention, total source-surface area, image/material identity and closed rotor edge adjacency. Per-original-face partition detail comes from the recorded clipping operation. This is not visual or motion approval.'}
a.output.write_text(json.dumps(proof,indent=2)+'\n','utf8');print(json.dumps({k:v for k,v in proof.items() if k!='recordedPerSourceFacePartition'},indent=2))

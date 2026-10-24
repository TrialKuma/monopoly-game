"""Read-only numerical measurement of the actual colored neural wheel surface."""
from pathlib import Path
import sys,json,io
import numpy as np
from PIL import Image
ROOT=Path.cwd();ART=ROOT/'art/full-ai-city';sys.path.insert(0,str(ART/'tools'))
from neural_component import GLB,digest,frame
source=ART/'candidates/expansion/chance_wheel.glb'
assert digest(source)=='d8eabe9e2c5f4ad306eb7b9845983935fa4b1e98f53c5efdc909e22d131877d7'
g=GLB(source);doc=g.doc;p=doc['meshes'][0]['primitives'][0]
v=g.array(p['attributes']['POSITION']).astype(float);f=g.array(p['indices']).reshape(-1,3);uv=g.array(p['attributes']['TEXCOORD_0']).astype(float)
a=doc['accessors'][p['attributes']['TEXCOORD_0']]
if a.get('normalized'):uv/=65535 if a['componentType']==5123 else 255
mat=doc['materials'][p['material']];texture=doc['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']];im=doc['images'][texture['source']];bv=doc['bufferViews'][im['bufferView']]
pixels=np.asarray(Image.open(io.BytesIO(g.blob[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])).convert('RGB'));h,w,_=pixels.shape
tri=v[f];c=tri.mean(1);tuv=uv[f].mean(1);colors=pixels[np.clip((tuv[:,1]*h).astype(int),0,h-1),np.clip((tuv[:,0]*w).astype(int),0,w-1)].astype(float)
n=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);area=np.linalg.norm(n,axis=1)/2;n/=np.maximum(np.linalg.norm(n,axis=1)[:,None],1e-15)
roi=(c[:,0]>.14)&(c[:,0]<.5)&(c[:,1]>.12)&(c[:,1]<.48)&(c[:,2]>.05)
colored=((colors[:,1]>colors[:,0]*1.18)&(colors[:,1]>colors[:,2]*1.12))|((colors[:,2]>colors[:,0]*1.15)&(colors[:,2]>colors[:,1]*1.1))
sel=roi&colored&(n[:,2]>.65)
weights=area[sel];points=c[sel];mean=np.average(points,axis=0,weights=weights)
_,_,vh=np.linalg.svd((points-mean)*np.sqrt(weights[:,None]));axis=vh[-1];axis*=1 if axis[2]>0 else -1
rotation,_=frame(axis);local=(points-mean)@rotation
out=ART/'work/expansion-wheel-separation';out.mkdir(parents=True,exist_ok=True)
np.savez(out/'measured-source-points.npz',vertices=v,triangles=f,centers=c,colors=colors,normals=n,selected=sel,areas=area)
report={'source':{'path':str(source),'sha256':digest(source)},'bounds':[v.min(0).tolist(),v.max(0).tolist()],'selectedFaces':int(sel.sum()),'planeMean':mean.tolist(),'axis':axis.tolist(),'localQuantiles':np.quantile(local,[0,.05,.5,.95,1],axis=0).tolist(),'selectedWorldBounds':[points.min(0).tolist(),points.max(0).tolist()],'planeDepthQuantiles':np.quantile((c[roi]-mean)@axis,[0,.05,.25,.5,.75,.95,1]).tolist(),'method':'Area-weighted PCA of actual green/blue colored front-facing triangles in the inspected existing wheel ROI. This only measures source geometry and does not select or approve a rotor.'}
(out/'measurement.json').write_text(json.dumps(report,indent=2)+'\n','utf8');print(json.dumps(report,indent=2))

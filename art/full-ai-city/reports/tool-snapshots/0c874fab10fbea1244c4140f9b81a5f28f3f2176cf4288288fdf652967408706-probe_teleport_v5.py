from pathlib import Path
import sys,json
import numpy as np
ROOT=Path.cwd();ART=ROOT/'art/full-ai-city'
sys.path.insert(0,str(ART/'tools'))
from neural_component import GLB,digest
samples={'front':[(180,228),(177,236),(190,225),(200,220),(211,220),(310,221),(325,228),(333,236),(372,353)],'back':[(195,225),(311,225),(378,256)]}
result={}
for rel in ['work/repair-teleport-v5/repaired-normalized.glb','work/recorded-repair-teleport_gate-748e3c3c5721-fine0015/candidates/classic/teleport_gate.glb']:
 g=GLB(ART/rel);p=g.doc['meshes'][0]['primitives'][0];v=g.array(p['attributes']['POSITION']).astype(float);v=v[:,[0,2,1]];v[:,1]*=-1
 f=g.array(p['indices']).reshape(-1,3);target=np.array([0,0,(v[:,2].min()+v[:,2].max())/2]);rows={}
 for label,points in samples.items():
  eye=np.array([0,-4 if label=='front' else 4,.9]);direction=target-eye;direction/=np.linalg.norm(direction);right=np.cross(direction,[0,0,1]);right/=np.linalg.norm(right);up=np.cross(right,direction)
  projected=np.c_[(v-target)@right,(v-target)@up,(v-eye)@direction];tri=projected[f];lo=tri[:,:,:2].min(1);hi=tri[:,:,:2].max(1)
  output=[]
  for px,py in points:
   q=np.array([(px/512-.5)*1.4,(.5-py/512)*1.4]);indices=np.flatnonzero(np.all(lo<=q,1)&np.all(hi>=q,1));t=tri[indices];a=t[:,0,:2];b=t[:,1,:2]-a;c=t[:,2,:2]-a;d=q-a;cross=lambda x,y:x[:,0]*y[:,1]-x[:,1]*y[:,0]
   den=cross(b,c);good=np.abs(den)>1e-15;indices=indices[good];t=t[good];b=b[good];c=c[good];d=d[good];den=den[good];beta=cross(d,c)/den;gamma=cross(b,d)/den;w=np.c_[1-beta-gamma,beta,gamma];inside=np.all(w>=-1e-8,1)&np.all(w<=1+1e-8,1)
   w=w[inside];t=t[inside];indices=indices[inside]
   if len(indices):
    depth=np.sum(w*t[:,:,2],1);i=int(np.argmin(depth));face=int(indices[i]);hit=w[i]@v[f[face]];native=v[f[face]];normal=np.cross(native[1]-native[0],native[2]-native[0]);normal/=max(np.linalg.norm(normal),1e-20)
    output.append({'pixel':[px,py],'hitBlender':hit.tolist(),'face':face,'normalBlender':normal.tolist()})
   else:output.append({'pixel':[px,py],'noHit':True})
  rows[label]=output
 result[rel]={'sha256':digest(ART/rel),'rays':rows}
(ART/'work/public-diagnostic/teleport-v5-vs-v4fine-rays.json').write_text(json.dumps(result,indent=2),'utf-8')
print(json.dumps(result,indent=2))

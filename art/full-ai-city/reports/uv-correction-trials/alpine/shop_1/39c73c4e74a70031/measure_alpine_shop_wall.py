from pathlib import Path
import sys, json, io, hashlib
import numpy as np
from PIL import Image, ImageDraw
ART=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ART/'tools'))
from neural_component import GLB, digest
src=ART/'candidates/alpine/shop_1.glb'
expected='00684765be64e20afa1e53d0747f1acb7e01a8cb6c7f42f88dee7c8a367208f0'
assert digest(src)==expected
g=GLB(src); p=g.doc['meshes'][0]['primitives'][0]
v=g.array(p['attributes']['POSITION']).astype(np.float64); f=g.array(p['indices']).reshape(-1,3)
t=v[f]; c=t.mean(1); cr=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]); area=np.linalg.norm(cr,axis=1)*.5; n=cr/np.maximum(area[:,None]*2,1e-15)
ua=g.doc['accessors'][p['attributes']['TEXCOORD_0']]; uv=g.array(p['attributes']['TEXCOORD_0']).astype(np.float64)/(65535 if ua.get('normalized') and ua['componentType']==5123 else 1)
material=g.doc['materials'][p['material']]; tex=material['pbrMetallicRoughness']['baseColorTexture']['index']; im=g.doc['images'][g.doc['textures'][tex]['source']]; bv=g.doc['bufferViews'][im['bufferView']]; start=bv.get('byteOffset',0); pixels=np.asarray(Image.open(io.BytesIO(bytes(g.blob[start:start+bv['byteLength']]))).convert('RGB'))/255.
def colors(u):
 h,w=pixels.shape[:2]; u=np.clip(u,0,1); return pixels[np.minimum(h-1,(u[...,1]*h).astype(int)),np.minimum(w-1,(u[...,0]*w).astype(int))]
col=colors(uv[f].mean(1))
back=(abs(n[:,2])>.4)&(c[:,2]<-.06)
out=ART/'work/alpine-shop1-wall-uv-measure';out.mkdir(exist_ok=True)
rows=[]
for y0,y1 in [(0,.15),(.15,.25),(.25,.30),(.30,.35),(.35,.40),(.40,.45),(.45,.50),(.50,.56)]:
 m=back&(c[:,1]>=y0)&(c[:,1]<y1)&(abs(c[:,0])<.42)
 ids=np.flatnonzero(m)
 rows.append({'height':[y0,y1],'count':len(ids),'area':float(area[m].sum()),'zQ':np.quantile(c[m,2],[0,.25,.5,.75,1]).tolist() if len(ids) else []})
canvas=Image.new('RGB',(1000,760),'#17202b'); draw=ImageDraw.Draw(canvas)
for k in sorted(np.flatnonzero(back),key=lambda i:c[i,2],reverse=True):
 pts=[(int(500-x*850),int(700-y*850)) for x,y,z in t[k]]
 draw.polygon(pts,fill=tuple(np.rint(col[k]*255).astype(int)),outline='#606060')
for y in np.arange(0,.71,.05):
 yy=int(700-y*850);draw.line((55,yy,945,yy),fill='#44ddee',width=1);draw.text((2,yy-5),f'{y:.2f}',fill='white')
for x in np.arange(-.5,.51,.1):
 xx=int(500-x*850);draw.line((xx,55,xx,705),fill='#44ddee',width=1);draw.text((xx,715),f'{x:.2f}',fill='white')
canvas.save(out/'back-face-coordinates.png')
bary=np.array([[1/3,1/3,1/3],[.75,.125,.125],[.125,.75,.125],[.125,.125,.75]])
samples=colors(np.einsum('sc,fcd->fsd',bary,uv[f]))
red=(samples[...,0]>samples[...,1]*1.12)&(samples[...,0]>samples[...,2]*1.12)&(samples[...,0]>.48)
roi=(c[:,0]>-.30)&(c[:,0]<.30)&(c[:,1]>.275)&(c[:,1]<.405)&(c[:,2]<-.12)&(c[:,2]>-.30)&(abs(n[:,2])>.4)
pastel=(samples[...,1]>.44)&(samples[...,2]>.37)&(samples[...,0]/np.maximum(samples[...,2],.01)<1.8)
selections=[]
for name,m in [('all_roi',roi),('red_any',roi&red.any(1)),('red_majority',roi&(red.sum(1)>=2)),('pastel_red_any',roi&(red&pastel).any(1))]:
 ids=np.flatnonzero(m)
 selections.append({'name':name,'faces':len(ids),'triangleFraction':len(ids)/len(f),'area':float(area[m].sum()),'surfaceAreaFraction':float(area[m].sum()/area.sum()),'bounds':{'min':t[m].reshape(-1,3).min(0).tolist(),'max':t[m].reshape(-1,3).max(0).tolist()},'indices':ids.tolist()})
selected=set(selections[1]['indices']); highlight=Image.new('RGB',(1000,760),'#17202b'); hd=ImageDraw.Draw(highlight)
for k in sorted(np.flatnonzero(back),key=lambda i:c[i,2],reverse=True):
 pts=[(int(500-x*850),int(700-y*850)) for x,y,z in t[k]]
 hd.polygon(pts,fill='#ee00ee' if k in selected else tuple(np.rint(col[k]*255).astype(int)),outline='#606060')
highlight.save(out/'selection-initial.png')
proof={'candidate':{'path':str(src),'sha256':expected},'coordinateSystem':'glTF Y-up +Z front, rear normal -Z; x is reversed in back projection','triangles':len(f),'totalSurfaceArea':float(area.sum()),'rows':rows,'selections':selections,'sourceBytesUnchanged':digest(src)==expected}
upper=(abs(c[:,0])<.16)&(c[:,1]>.42)&(c[:,1]<.49)&(c[:,2]<-.09)&(c[:,2]>-.22)&(abs(n[:,2])>.4)
proof['upperDonorProbe']=[{'id':int(i),'center':c[i].tolist(),'color':col[i].tolist(),'samples':samples[i].tolist()} for i in np.flatnonzero(upper)]
(out/'measurement-initial.json').write_text(json.dumps(proof,indent=2)+'\n','utf8')
print(json.dumps(proof['upperDonorProbe'],indent=2))

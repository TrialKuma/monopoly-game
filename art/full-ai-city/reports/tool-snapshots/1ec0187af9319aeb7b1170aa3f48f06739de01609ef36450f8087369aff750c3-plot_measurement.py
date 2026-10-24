from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PolyCollection
work=Path(__file__).parent;data=np.load(work/'measured-source-points.npz');v=data['vertices'];f=data['triangles'];c=data['centers'];colors=data['colors'];n=data['normals']
mask=(c[:,0]>.12)&(c[:,0]<.51)&(c[:,1]>.10)&(c[:,1]<.55)&(c[:,2]>.05)
ids=np.flatnonzero(mask);ids=ids[np.argsort(c[ids,2])];polys=v[f[ids]][:,:,:2]
fig,axes=plt.subplots(1,3,figsize=(15,6),constrained_layout=True)
for ax in axes:ax.set_aspect('equal');ax.set_xlim(.12,.51);ax.set_ylim(.10,.55);ax.grid();ax.set_xlabel('actual GLTF X');ax.set_ylabel('actual GLTF Y')
axes[0].add_collection(PolyCollection(polys,facecolors=colors[ids]/255,edgecolors='none'));axes[0].set_title('Original surface color samples')
for ax,values,title in [(axes[1],c[ids,2],'Front depth Z'),(axes[2],n[ids,2],'Face normal Z')]:
 p=PolyCollection(polys,array=values,cmap='viridis',edgecolors='none');ax.add_collection(p);fig.colorbar(p,ax=ax);ax.set_title(title)
fig.savefig(work/'measurement-front.png',dpi=130);plt.close(fig)

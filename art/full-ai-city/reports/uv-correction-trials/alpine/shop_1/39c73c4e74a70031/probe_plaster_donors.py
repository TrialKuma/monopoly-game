import runpy,numpy as np,json
from pathlib import Path
scope=runpy.run_path(str(Path(__file__).with_name('measure_alpine_shop_wall.py')))
c,n,samples=scope['c'],scope['n'],scope['samples']; col=samples.mean(1)
spread=samples.max(1)-samples.min(1)
same_plaster=(abs(n[:,0])>.5)&(abs(c[:,0])>.3)&(abs(c[:,0])<.42)&(c[:,1]>.14)&(c[:,1]<.32)&(abs(c[:,2])<.20)&(col[:,1]>.56)&(col[:,2]>.48)&(col[:,0]/col[:,1]<1.25)
donors=sorted(np.flatnonzero(same_plaster),key=lambda i:spread[i].max())[:20]
data=[{'id':int(i),'center':c[i].tolist(),'normal':n[i].tolist(),'color':col[i].tolist(),'spread':spread[i].tolist(),'corners':scope['t'][i].tolist()} for i in donors]
(scope['out']/'uniform-donors.json').write_text(json.dumps(data,indent=2)+'\n','utf8')
print('UNIFORM_DONORS',json.dumps(data))

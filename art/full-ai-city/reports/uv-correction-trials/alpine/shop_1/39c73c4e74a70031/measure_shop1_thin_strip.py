import runpy,numpy as np,json
from pathlib import Path
s=runpy.run_path(str(Path(__file__).with_name('measure_alpine_shop_wall.py')))
c,n,samples=s['c'],s['n'],s['samples']; colors=samples.mean(1)
old=set(s['selections'][1]['indices'])
band=(abs(c[:,0])<.31)&(c[:,1]>.293)&(c[:,1]<.335)&(c[:,2]<-.22)&(c[:,2]>-.30)
red=(samples[...,0]>.50)&(samples[...,1]>.28)&(samples[...,2]>.25)&(samples[...,0]/np.maximum(samples[...,1],.01)>1.25)&(samples[...,0]/np.maximum(samples[...,2],.01)<2.1)
extra=np.flatnonzero(band&red.any(1));combined=sorted(old.union(extra.tolist()))
assert len(combined)<=299
data=s['proof'];data['selections']=[];m=np.array(combined)
data['selections'].append({'name':'red_any','faces':len(m),'triangleFraction':len(m)/len(s['f']),'area':float(s['area'][m].sum()),'surfaceAreaFraction':float(s['area'][m].sum()/s['area'].sum()),'bounds':{'min':s['t'][m].reshape(-1,3).min(0).tolist(),'max':s['t'][m].reshape(-1,3).max(0).tolist()},'indices':combined})
data['thinStripExtraFaces']=sorted(set(extra.tolist())-old)
path=s['out']/'measurement-v2.json';path.write_text(json.dumps(data,indent=2)+'\n','utf8');print('MEASURE_V2',json.dumps({**data['selections'][0],'indices':None,'extra':data['thinStripExtraFaces']}))

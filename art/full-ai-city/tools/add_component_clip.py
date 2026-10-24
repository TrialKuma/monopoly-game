"""Attach a real GLTF rotation clip to one inspected neural hero component."""
from pathlib import Path
import argparse,json,math
import numpy as np
from neural_component import GLB,digest

def multiply(a,b):
    av,aw=np.asarray(a[:3]),a[3];bv,bw=np.asarray(b[:3]),b[3]
    return np.r_[aw*bv+bw*av+np.cross(av,bv),aw*bw-np.dot(av,bv)]

def main():
    p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);p.add_argument('--node',required=True);p.add_argument('--name',required=True);p.add_argument('--duration',type=float,default=18);p.add_argument('--swing-degrees',type=float);a=p.parse_args()
    if a.source.resolve()==a.output.resolve():raise ValueError('Clip candidate must be a new reviewed derivative')
    g=GLB(a.source);before_images=g.image_hashes();node_index=next(i for i,n in enumerate(g.doc['nodes']) if n.get('name')==a.node);node=g.doc['nodes'][node_index]
    if 'mesh' not in node or node.get('extras',{}).get('geometryOrigin') is None:raise ValueError('Requires an inspected separate neural mesh node')
    times=np.linspace(0,a.duration,9,dtype=np.float32)
    angles=np.linspace(0,2*math.pi,9) if a.swing_degrees is None else np.sin(np.linspace(0,2*math.pi,9))*math.radians(a.swing_degrees)
    base=node.get('rotation',[0,0,0,1]);rotations=np.array([multiply(base,[0,0,math.sin(x/2),math.cos(x/2)]) for x in angles],np.float32)
    input_index=g.add(times.reshape(-1,1),{'componentType':5126,'type':'SCALAR','min':[0.0],'max':[a.duration]},None)
    output_index=g.add(rotations,{'componentType':5126,'type':'VEC4'},None)
    g.doc['animations']=[{'name':a.name,'samplers':[{'input':input_index,'output':output_index,'interpolation':'LINEAR'}],'channels':[{'sampler':0,'target':{'node':node_index,'path':'rotation'}}]}]
    node.setdefault('extras',{})['animationDriver']='gltf';g.compact();a.output.parent.mkdir(parents=True,exist_ok=True);g.save(a.output)
    if before_images!=GLB(a.output).image_hashes():raise RuntimeError('Images changed')
    receipt={'source':{'path':str(a.source.resolve()),'sha256':digest(a.source)},'output':{'path':str(a.output.resolve()),'sha256':digest(a.output),'bytes':a.output.stat().st_size},'clip':a.name,'driver':'gltf','node':a.node,'durationSeconds':a.duration,'localRotationAxis':'Z','keyTimes':times.tolist(),'localAnglesDegrees':np.degrees(angles).tolist(),'staticGeometryAndImagesUnchanged':True,'geometryOrigin':'Existing inspected neural component; animation data only, no geometry or texture changes'}
    a.output.with_suffix('.clip.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(receipt,indent=2))
if __name__=='__main__':main()

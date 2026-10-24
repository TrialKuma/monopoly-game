"""Read geometry/UV/color samples to measure the already generated wheel plane."""
from pathlib import Path
import argparse,json,io
import numpy as np
from PIL import Image
from neural_component import GLB
def main():
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);args=parser.parse_args();g=GLB(args.source);p=g.doc['meshes'][0]['primitives'][0]
    pos=g.array(p['attributes']['POSITION']);uv=g.array(p['attributes']['TEXCOORD_0']).astype(float)
    if g.doc['accessors'][p['attributes']['TEXCOORD_0']].get('normalized'):uv/=65535
    material=g.doc['materials'][p['material']];texture=g.doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']];image=g.doc['images'][texture['source']];v=g.doc['bufferViews'][image['bufferView']]
    im=Image.open(io.BytesIO(g.blob[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB');pixels=np.asarray(im)
    xy=np.minimum((uv*np.array(im.size)).astype(int),np.array(im.size)-1);rgb=pixels[xy[:,1],xy[:,0]].astype(float)
    cyan=(rgb[:,1]>rgb[:,0]*1.3)&(rgb[:,2]>rgb[:,0]*1.2)&(rgb[:,1]>75)
    samples=pos[cyan&(pos[:,0]>.20)&(pos[:,1]>.10)&(pos[:,1]<.48)&(pos[:,2]>.05)]
    center=samples.mean(axis=0);u,s,vt=np.linalg.svd(samples-center,full_matrices=False);axis=vt[-1]
    if axis[2]<0:axis=-axis
    print(json.dumps({'count':len(samples),'mean':center.tolist(),'axisPCA':axis.tolist(),'singularValues':s.tolist(),'bounds':{'min':samples.min(axis=0).tolist(),'max':samples.max(axis=0).tolist()}},indent=2))
if __name__=='__main__':main()

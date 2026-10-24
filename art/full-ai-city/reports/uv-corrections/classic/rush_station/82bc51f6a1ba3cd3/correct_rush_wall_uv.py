"""Correct one measured dark neural stone recess using this asset's original stone UV.

Run after native field replay, on a source-linked derivative. No image pixels,
positions, triangles, normals, materials or other architectural surfaces change.
Only triangle-corner UVs in the inspected left-wall recess are reassigned to
neighboring intact original stone samples. New seam vertices preserve positions.
"""
from pathlib import Path
import argparse,copy,hashlib,io,json
import numpy as np
from PIL import Image
from neural_component import GLB,digest

def run(source,output):
    g=GLB(source);before_images=g.image_hashes();doc=g.doc
    primitives=[p for m in doc['meshes'] for p in m['primitives']]
    if len(primitives)!=1:raise ValueError('Expected one final stationary workshop-free station body')
    p=primitives[0];attrs={k:g.array(v) for k,v in p['attributes'].items()}
    xyz=attrs['POSITION'];tri=g.array(p['indices']).reshape(-1,3);centers=xyz[tri].mean(axis=1)
    uv_accessor=doc['accessors'][p['attributes']['TEXCOORD_0']]
    factor=65535 if uv_accessor.get('normalized') and uv_accessor['componentType']==5123 else 1
    uv=attrs['TEXCOORD_0'].astype(np.float64)/factor
    material=doc['materials'][p['material']];tex=material['pbrMetallicRoughness']['baseColorTexture']['index'];image=doc['images'][doc['textures'][tex]['source']]
    view=doc['bufferViews'][image['bufferView']];start=view.get('byteOffset',0)
    pixels=np.asarray(Image.open(io.BytesIO(bytes(g.blob[start:start+view['byteLength']]))).convert('RGB'))/255.
    h,w=pixels.shape[:2]
    def colors(coords):
        coords=np.clip(coords,0,1);return pixels[np.minimum(h-1,(coords[...,1]*h).astype(int)),np.minimum(w-1,(coords[...,0]*w).astype(int))]
    color=colors(uv[tri].mean(axis=1))
    cross=np.cross(xyz[tri[:,1]]-xyz[tri[:,0]],xyz[tri[:,2]]-xyz[tri[:,0]])
    normals=cross/np.maximum(np.linalg.norm(cross,axis=1)[:,None],1e-12)
    roi=(centers[:,0]>-.332)&(centers[:,0]<-.287)&(centers[:,1]>.012)&(centers[:,1]<.325)&(centers[:,2]>-.295)&(centers[:,2]<-.185)&(normals[:,0]<-.55)
    mask=roi&(color.mean(axis=1)<.40)
    donor=(centers[:,0]>-.403)&(centers[:,0]<-.355)&(centers[:,1]>.014)&(centers[:,1]<.340)&(centers[:,2]>-.178)&(centers[:,2]<-.020)&(normals[:,0]<-.85)&(color.min(axis=1)>.40)&(color.max(axis=1)/np.maximum(color.min(axis=1),1e-6)<1.55)
    chosen=np.flatnonzero(mask);donors=np.flatnonzero(donor)
    if not 15<=len(chosen)<=1500 or len(donors)<15:raise ValueError(f'Inspected region selection invalid: target={len(chosen)} donor={len(donors)}')
    addition={key:[] for key in attrs};new_tri=tri.copy();new_colors=[];mapping=[];next_vertex=len(xyz)
    for face in chosen:
        target=centers[face].copy();target[0]=-.38;target[2]=-.10
        # Prioritize matching height so wall masonry color remains vertically coherent.
        distances=((centers[donors]-target)*np.array([1.,3.,.8]))**2
        source_face=int(donors[np.argmin(distances.sum(axis=1))]);new_uv=uv[tri[source_face]]
        for key,values in attrs.items():
            if key=='TEXCOORD_0':values=np.rint(new_uv*factor).astype(values.dtype) if factor!=1 else new_uv.astype(values.dtype)
            else:values=values[tri[face]].copy()
            addition[key].extend(values)
        new_tri[face]=np.arange(next_vertex,next_vertex+3);next_vertex+=3
        new_colors.append(colors(new_uv).mean(axis=0));mapping.append({'targetTriangle':int(face),'donorTriangle':source_face})
    for key,values in attrs.items():
        combined=np.concatenate((values,np.asarray(addition[key],dtype=values.dtype)))
        p['attributes'][key]=g.add(combined,doc['accessors'][p['attributes'][key]],34962)
    p['indices']=g.add(new_tri.reshape(-1,1).astype(np.uint32),{'componentType':5125,'type':'SCALAR'},34963)
    after_xyz=g.array(p['attributes']['POSITION'])
    if not np.array_equal(xyz[tri],after_xyz[new_tri]):raise RuntimeError('Geometry changed')
    g.compact();g.save(output);check=GLB(output)
    if check.image_hashes()!=before_images:raise RuntimeError('Image bytes changed')
    return {'source':{'path':str(source),'sha256':digest(source),'bytes':source.stat().st_size},'output':{'path':str(output),'sha256':digest(output),'bytes':output.stat().st_size},
      'method':'Only measured original dark left stone-recess UV loops remapped to nearest-height intact original stone triangle UVs from the same final neural texture. Applied after field replay. No painted texture or authored building geometry.',
      'targetBoundsGLTF':{'min':[-.332,.012,-.295],'max':[-.287,.325,-.185]},'changedTriangles':len(chosen),'originalUVLoopsChanged':len(chosen)*3,'seamVerticesAdded':len(chosen)*3,
      'triangles':len(tri),'perTrianglePositionsExactlyPreserved':True,'originalNormalsPreserved':True,'embeddedImageBytesUnchanged':True,
      'beforeMeanSRGB':color[chosen].mean(axis=0).tolist(),'afterMeanSRGB':np.asarray(new_colors).mean(axis=0).tolist(),'donorTriangleMapping':mapping,
      'status':'candidate_pending_five_view_review'}

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--sha256',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    if a.source.resolve()==a.output.resolve() or digest(a.source)!=a.sha256:raise ValueError('Source identity or isolation invalid')
    a.output.parent.mkdir(parents=True,exist_ok=True);r=run(a.source,a.output);a.output.with_suffix('.uv-correction.json').write_text(json.dumps(r,indent=2)+'\n','utf-8');print(json.dumps({k:v for k,v in r.items() if k!='donorTriangleMapping'},indent=2))
if __name__=='__main__':main()

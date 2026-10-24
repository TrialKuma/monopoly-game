"""Measured same-building plaster UV correction; no geometry or image edits.

The reviewed rear plaster band contains a native awning-color ghost.
Map only its measured loops to verified intact plaster from the same atlas.
Keep the canonical input untouched and verify all original triangle corners.
"""
from pathlib import Path
import argparse, io, json
import numpy as np
from PIL import Image
from neural_component import GLB, digest

def run(source, output, measurement, donor_triangle=None):
    evidence=json.loads(measurement.read_text('utf8'))
    assert digest(source)==evidence['candidate']['sha256']
    chosen=np.array(next(row['indices'] for row in evidence['selections'] if row['name']=='red_any'),dtype=int)
    g=GLB(source); image_hashes=g.image_hashes(); doc=g.doc
    primitives=[p for m in doc['meshes'] for p in m['primitives']]
    assert len(primitives)==1
    p=primitives[0]; attrs={k:g.array(v) for k,v in p['attributes'].items()}
    xyz=attrs['POSITION']; tri=g.array(p['indices']).reshape(-1,3); centers=xyz[tri].mean(1)
    assert len(tri)==29991 and 250<=len(chosen)<=299 and len(chosen)/len(tri)<=.01
    uva=doc['accessors'][p['attributes']['TEXCOORD_0']]
    factor=65535 if uva.get('normalized') and uva['componentType']==5123 else 1
    uv=attrs['TEXCOORD_0'].astype(np.float64)/factor
    mat=doc['materials'][p['material']]; tex=mat['pbrMetallicRoughness']['baseColorTexture']['index']; im=doc['images'][doc['textures'][tex]['source']]; view=doc['bufferViews'][im['bufferView']]; start=view.get('byteOffset',0)
    pixels=np.asarray(Image.open(io.BytesIO(bytes(g.blob[start:start+view['byteLength']]))).convert('RGB'))/255
    h,w=pixels.shape[:2]
    def colors(coords):
        coords=np.clip(coords,0,1);return pixels[np.minimum(h-1,(coords[...,1]*h).astype(int)),np.minimum(w-1,(coords[...,0]*w).astype(int))]
    bary=np.array([[1/3,1/3,1/3],[.75,.125,.125],[.125,.75,.125],[.125,.125,.75]])
    samples=colors(np.einsum('sc,fcd->fsd',bary,uv[tri]))
    cross=np.cross(xyz[tri[:,1]]-xyz[tri[:,0]],xyz[tri[:,2]]-xyz[tri[:,0]])
    normals=cross/np.maximum(np.linalg.norm(cross,axis=1)[:,None],1e-12)
    clean=(samples[...,1]>.54)&(samples[...,2]>.45)&(samples[...,0]/np.maximum(samples[...,1],.01)<1.21)
    donor=(abs(centers[:,0])<.16)&(centers[:,1]>.42)&(centers[:,1]<.49)&(centers[:,2]<-.09)&(centers[:,2]>-.22)&(abs(normals[:,2])>.4)&clean.all(1)
    donors=np.flatnonzero(donor)
    if donor_triangle is not None:
        assert donor_triangle==1790, 'Only the explicitly inspected side plaster donor is allowed'
        cc=centers[donor_triangle];assert .37<cc[0]<.40 and .17<cc[1]<.23 and .08<cc[2]<.13
        assert np.max(samples[donor_triangle].max(0)-samples[donor_triangle].min(0))<.04
        donors=np.array([donor_triangle])
    elif len(donors)<3:raise ValueError(f'Only {len(donors)} clean upper-wall donor faces')
    add={k:[] for k in attrs}; next_vertex=len(xyz); new_tri=tri.copy(); mapping=[]
    for face in chosen:
        target=centers[face].copy();target[1]=.445;target[2]=-.16
        dist=np.sum(((centers[donors]-target)*np.array([1.,2.,1.]))**2,axis=1)
        source_face=int(donors[np.argmin(dist)])
        for key,values in attrs.items():
            add[key].extend(values[tri[source_face if key=='TEXCOORD_0' else face]].copy())
        new_tri[face]=np.arange(next_vertex,next_vertex+3);next_vertex+=3
        mapping.append({'targetTriangle':int(face),'donorTriangle':source_face})
    for key,values in attrs.items():
        p['attributes'][key]=g.add(np.concatenate((values,np.asarray(add[key],dtype=values.dtype))),doc['accessors'][p['attributes'][key]],34962)
    p['indices']=g.add(new_tri.reshape(-1,1).astype(np.uint32),{'componentType':5125,'type':'SCALAR'},34963)
    g.compact();g.save(output); result=GLB(output); q=result.doc['meshes'][0]['primitives'][0]; it=result.array(q['indices']).reshape(-1,3)
    for key,values in attrs.items():
        if key!='TEXCOORD_0':assert np.array_equal(values[tri],result.array(q['attributes'][key])[it]),key
    assert result.image_hashes()==image_hashes and result.doc['materials']==doc['materials']
    final_uv=result.array(q['attributes']['TEXCOORD_0'])[it];original_uv=attrs['TEXCOORD_0'][tri]
    actual=np.flatnonzero(np.any(final_uv!=original_uv,axis=(1,2)))
    assert np.array_equal(actual,np.sort(chosen))
    for row in mapping:assert np.array_equal(final_uv[row['targetTriangle']],original_uv[row['donorTriangle']])
    record=lambda path:{'path':str(path),'sha256':digest(path),'bytes':path.stat().st_size}
    return {'status':'isolated_derivative_pending_visual_review','source':record(source),'output':record(output),'measurement':record(measurement),'tool':record(Path(__file__)),
      'method':'Only the reviewed rear plaster awning-color ghost band reuses intact plaster triangle UV coordinates from this same native building and same embedded atlas. No painted pixels or authored geometry.',
      'triangles':len(tri),'changedTriangles':len(chosen),'originalUVLoopsChanged':int(np.count_nonzero(np.any(final_uv!=original_uv,axis=2))),'changedTriangleFraction':len(chosen)/len(tri),'donorCount':len(donors),'donorCandidates':donors.tolist(),'donorTriangleMapping':mapping,
      'targetMeasurement':{k:v for k,v in next(row for row in evidence['selections'] if row['name']=='red_any').items() if k!='indices'},
      'perTrianglePositionsExactlyPreserved':True,'perTriangleNormalsExactlyPreserved':True,'allOtherAttributesExactlyPreserved':True,'embeddedImageBytesUnchanged':True,'materialsExactlyPreserved':True,
      'seamVerticesAdded':len(chosen)*3,'newTriangles':0,'canonicalSourceUnchanged':digest(source)==evidence['candidate']['sha256']}

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--measurement',type=Path,required=True);p.add_argument('--donor-triangle',type=int);a=p.parse_args()
    assert a.source.resolve()!=a.output.resolve() and not a.output.exists()
    a.output.parent.mkdir(parents=True,exist_ok=True);r=run(a.source,a.output,a.measurement,a.donor_triangle)
    a.output.with_suffix('.uv-correction.json').write_text(json.dumps(r,indent=2)+'\n','utf8')
    print(json.dumps({k:v for k,v in r.items() if k not in ('donorTriangleMapping','donorCandidates')},indent=2))
if __name__=='__main__':main()

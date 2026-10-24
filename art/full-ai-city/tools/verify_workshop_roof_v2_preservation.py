"""Independently compare surviving native triangles, UVs and embedded images."""
from pathlib import Path
import json, sys
import numpy as np
from neural_component import GLB,digest
from verify_local_repair_preservation import primitive

ART=Path(__file__).resolve().parents[1]
OUT=ART/'work/alpine-workshop-roof-v2/repair'

def faces(glb):
    p=primitive(glb);ids=glb.array(p['indices']).reshape(-1,3)
    return glb.array(p['attributes']['POSITION'])[ids],glb.array(p['attributes']['TEXCOORD_0'])[ids]

def keys(pos,uv):
    data=np.concatenate([pos,uv],axis=2).astype('<f4');data[data==0]=0
    first=np.lexsort(tuple(data[:,:,i] for i in reversed(range(5))),axis=1)[:,0]
    ordered=np.take_along_axis(data,((first[:,None]+np.arange(3))%3)[:,:,None],axis=1)
    return np.ascontiguousarray(ordered).reshape(len(data),15).view('V60').ravel()

def evidence(p):return {'path':str(p.resolve()),'sha256':digest(p),'bytes':p.stat().st_size}

def main():
    source=ART/'source/alpine--builders_guild-a001-pixal-mv-1024-9247.glb'
    repaired=OUT/'repaired-native.glb';normalized=OUT/'repaired-normalized.glb'
    assert digest(source)=='d3aefa70e16ee1ca3700be2a52b83f426ddb66d9a38fbe54cc588aa8baa2f93f'
    assert digest(repaired)=='edeb9fecf18db92dcd5e2be77f6e707d786ac9180bf6af656fe7bc4dfaef9d07'
    a,b,n=GLB(source),GLB(repaired),GLB(normalized)
    pa,ua=faces(a);pb,ub=faces(b);pn,un=faces(n)
    ka,kb=keys(pa,ua),keys(pb,ub)
    sa,ca=np.unique(ka,return_counts=True);sb,cb=np.unique(kb,return_counts=True)
    _,ia,ib=np.intersect1d(sa,sb,assume_unique=True,return_indices=True)
    assert np.array_equal(ca[ia],cb[ib]),'Shared triangle multiplicities changed'
    removed=~np.isin(ka,sb);added=~np.isin(kb,sa)
    assert removed.sum()==800 and added.sum()==6336,(int(removed.sum()),int(added.sum()))
    assert a.image_hashes()==b.image_hashes(),'Original embedded image bytes changed'
    assert pb.shape==pn.shape and np.array_equal(ub,un),'Native/normalized corner correspondence differs'
    samples=np.linspace(0,pb.size//3-1,2000,dtype=int)
    native=pb.reshape(-1,3).astype(np.float64);normal=pn.reshape(-1,3).astype(np.float64)
    affine=np.linalg.lstsq(np.column_stack([native[samples],np.ones(len(samples))]),normal[samples],rcond=None)[0]
    fit_error=float(np.abs(np.column_stack([native[samples],np.ones(len(samples))])@affine-normal[samples]).max())
    assert fit_error<1e-6
    centers=pa[removed].astype(np.float64).mean(axis=1)
    mapped=np.column_stack([centers,np.ones(len(centers))])@affine
    blender=mapped[:,[0,2,1]];blender[:,1]*=-1
    top=(blender[:,1]>=-.172-1e-6)&(blender[:,1]<=-.132+1e-6)&(blender[:,2]>=.680-1e-6)&(blender[:,2]<=.712+1e-6)
    lower=(blender[:,1]>=.148-1e-6)&(blender[:,1]<=.179+1e-6)&(blender[:,2]>=.482-1e-6)&(blender[:,2]<=.505+1e-6)
    assert np.all(top|lower) and top.sum()==427 and lower.sum()==373
    report={'status':'surviving_source_positions_uv_and_image_bytes_exactly_preserved','source':evidence(source),'repaired':evidence(repaired),'normalized':evidence(normalized),'tool':evidence(Path(__file__)),'originalTriangles':len(pa),'survivingTrianglesExact':int((~removed).sum()),'originalTrianglesDeleted':int(removed.sum()),'addedTriangles':int(added.sum()),'removedSourceTriangleIds':np.flatnonzero(removed).tolist(),'removedFaceCentroidsBlender':blender.tolist(),'removedRegionCounts':{'upperRoof':int(top.sum()),'eaveRoof':int(lower.sum())},'nativeToNormalizedGLTF':affine.tolist(),'affineMaxError':fit_error,'originalImagesExact':True,'scope':'Exact POSITION/UV triangle multiset, with cyclic corner rotation preserving winding. Only the two explicitly bounded roof regions contain removed faces. Does not approve the patch or final reduced mesh visually.'}
    target=OUT/'preservation.json';target.write_text(json.dumps(report,indent=2)+'\n','utf8');print(json.dumps({k:v for k,v in report.items() if k not in ['removedSourceTriangleIds','removedFaceCentroidsBlender','nativeToNormalizedGLTF']},ensure_ascii=False))

if __name__=='__main__':main()

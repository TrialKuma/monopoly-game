"""Independently compare surviving native triangles, UVs and embedded images."""
from pathlib import Path
import json, sys, argparse
import numpy as np
from neural_component import GLB,digest
from verify_local_repair_preservation import primitive

ART=Path(__file__).resolve().parents[1]
OUT=ART/'work/repair-expansion-wheel-v2'

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
    parser=argparse.ArgumentParser();parser.add_argument('--expected-sha',required=True);args=parser.parse_args()
    source=ART/'source/expansion--chance_wheel-a001-pixal-mv-1024-9247.glb'
    repaired=OUT/'repaired-native.glb';normalized=OUT/'repaired-normalized.glb'
    assert digest(source)=='f05d41993222025adb14f0e8fe59abe48fa2bf8eeaedcf8d409a054e47e1b0c0'
    assert digest(repaired)==args.expected_sha
    declared=json.loads((OUT/'repair.json').read_text('utf-8'))
    a,b,n=GLB(source),GLB(repaired),GLB(normalized)
    pa,ua=faces(a);pb,ub=faces(b);pn,un=faces(n)
    ka,kb=keys(pa,ua),keys(pb,ub)
    sa,ca=np.unique(ka,return_counts=True);sb,cb=np.unique(kb,return_counts=True)
    _,ia,ib=np.intersect1d(sa,sb,assume_unique=True,return_indices=True)
    assert np.array_equal(ca[ia],cb[ib]),'Shared triangle multiplicities changed'
    removed=~np.isin(ka,sb);added=~np.isin(kb,sa)
    assert removed.sum()==2777 and added.sum()==declared['newTriangles'],(int(removed.sum()),int(added.sum()))
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
    xx,yy,zz=blender.T
    radius=np.sqrt((xx-.265)**2+(zz-.298)**2)
    top=(xx>.28-1e-6)&(xx<.51+1e-6)&(yy>-.174-1e-6)&(yy<-.10+1e-6)&(zz>.155-1e-6)&(zz<.45+1e-6)&(radius>.164-1e-6)
    lower=(xx>-.45-1e-6)&(xx<-.34+1e-6)&(yy>.177-1e-6)&(yy<.204+1e-6)&(zz>.466-1e-6)&(zz<.509+1e-6)
    assert np.all(top|lower) and top.sum()==2527 and lower.sum()==250
    report={'status':'surviving_source_positions_uv_and_image_bytes_exactly_preserved','source':evidence(source),'repaired':evidence(repaired),'normalized':evidence(normalized),'tool':evidence(Path(__file__)),'originalTriangles':len(pa),'survivingTrianglesExact':int((~removed).sum()),'originalTrianglesDeleted':int(removed.sum()),'addedTriangles':int(added.sum()),'removedSourceTriangleIds':np.flatnonzero(removed).tolist(),'removedFaceCentroidsBlender':blender.tolist(),'removedRegionCounts':{'extraneousDiscBacking':int(top.sum()),'foldedLintel':int(lower.sum())},'nativeToNormalizedGLTF':affine.tolist(),'affineMaxError':fit_error,'originalImagesExact':True,'scope':'Exact POSITION/UV triangle multiset, with cyclic corner rotation preserving winding. Only the explicitly bounded extraneous disc backing and folded lintel regions contain removed faces. No original disc, axle or pedestal faces are removed. Does not approve the patch or final reduced mesh visually.'}
    target=OUT/'preservation.json';target.write_text(json.dumps(report,indent=2)+'\n','utf8');print(json.dumps({k:v for k,v in report.items() if k not in ['removedSourceTriangleIds','removedFaceCentroidsBlender','nativeToNormalizedGLTF']},ensure_ascii=False))

if __name__=='__main__':main()

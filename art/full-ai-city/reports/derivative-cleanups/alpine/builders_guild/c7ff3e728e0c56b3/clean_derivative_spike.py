"""Remove only measured single-face collapse spikes; original neural source stays intact."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys,shutil
import numpy as np
import bpy,bmesh
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod
from neural_component import GLB

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--report',type=Path,required=True);cli.add_argument('--blend',type=Path,required=True);cli.add_argument('--output-root',type=Path,required=True);a=cli.parse_args(sys.argv[sys.argv.index('--')+1:])
    r=json.loads(a.report.read_text('utf8'));original=Path(r['processedCandidate']['path']);assert lod.p.sha256(original)==r['processedCandidate']['sha256'];g=GLB(original)
    bpy.ops.wm.open_mainfile(filepath=str(a.blend));name=r['region']+'__'+r['asset'];source=bpy.data.objects[name+'__raw_source'];low=bpy.data.objects[name+'__neural_lod']
    sv=np.empty((len(source.data.vertices),3),np.float32);source.data.vertices.foreach_get('co',sv.ravel());sv=sv[:,[0,2,1]].copy();sv[:,2]*=-1
    lo,hi=sv.min(0),sv.max(0);extent=float((hi-lo).max());margin=extent*.05
    primitive=g.doc['meshes'][0]['primitives'][0];v=g.array(primitive['attributes']['POSITION']);f=g.array(primitive['indices']).reshape(-1,3);corners=v[f]
    outside=np.any((v<lo-margin)|(v>hi+margin),axis=1);bad=np.flatnonzero(outside[f].any(1));assert 0<len(bad)<=3,'Only measured isolated collapse spikes are eligible'
    proof=[]
    for fi in bad:
        points=corners[fi];longest=float(np.max(np.linalg.norm(points-np.roll(points,1,axis=0),axis=1)));area=float(np.linalg.norm(np.cross(points[1]-points[0],points[2]-points[0]))/2)
        assert longest>extent and area/longest**2<.001,'Not a demonstrated long thin outlier'
        for vi in f[fi][outside[f[fi]]]:assert np.count_nonzero(f==vi)==1,'Outlying vertex must belong only to the deleted face'
        proof.append({'sourceTriangle':int(fi),'cornersGLTF':points.tolist(),'longestEdge':longest,'area':area,'outsideVertexIndices':f[fi][outside[f[fi]]].tolist()})
    keep=np.ones(len(f),bool);keep[bad]=False;remaining=f[keep];ids,inverse=np.unique(remaining.ravel(),return_inverse=True)
    # The GLB change copies all retained attribute values and embedded images.
    images=g.image_hashes();newattrs={}
    for semantic,index in primitive['attributes'].items():newattrs[semantic]=g.add(g.array(index)[ids],g.doc['accessors'][index],34962)
    primitive['attributes']=newattrs;primitive['indices']=g.add(inverse.astype(np.uint32).reshape(-1,1),{'componentType':5125,'type':'SCALAR'},34963);g.compact()
    dest=a.output_root.resolve();out=dest/r['region']/(r['asset']+'.glb');assert not out.exists();out.parent.mkdir(parents=True,exist_ok=True);g.save(out)
    # Keep the saved Blender low in precisely the same per-corner order.
    mesh=low.data;bv=np.empty((len(mesh.vertices),3),np.float32);mesh.vertices.foreach_get('co',bv.ravel());bf=np.empty(len(mesh.loops),np.int32);mesh.loops.foreach_get('vertex_index',bf);bf=bf.reshape(-1,3)
    bc=bv[bf][:,:,[0,2,1]].copy();bc[:,:,2]*=-1;assert np.array_equal(bc,corners)
    normals=np.empty((len(mesh.corner_normals),3),np.float32);mesh.corner_normals.foreach_get('vector',normals.ravel());normals=normals.reshape(-1,3,3)[keep].reshape(-1,3)
    bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[int(i)] for i in bad],context='FACES_ONLY');bmesh.ops.delete(bm,geom=[x for x in bm.verts if not x.link_faces],context='VERTS');bm.to_mesh(mesh);bm.free();mesh.update();mesh.normals_split_custom_set(normals.tolist())
    after=GLB(out);pr=after.doc['meshes'][0]['primitives'][0];av=after.array(pr['attributes']['POSITION']);af=after.array(pr['indices']).reshape(-1,3);assert np.array_equal(av[af],corners[keep]);assert after.image_hashes()==images
    for semantic,index in pr['attributes'].items():assert np.array_equal(after.array(index)[af],GLB(original).array(GLB(original).doc['meshes'][0]['primitives'][0]['attributes'][semantic])[remaining]),semantic
    frozen=lod.ART/'reports/derivative-cleanups'/r['region']/r['asset']/lod.p.sha256(out)[:16];frozen.mkdir(parents=True,exist_ok=True)
    old_report=frozen/'original-processing.json';shutil.copy2(a.report,old_report);tool=frozen/Path(__file__).name;shutil.copy2(__file__,tool)
    cleanup={'status':'exact_isolated_collapse_spike_removed_pending_visual_review','sourceCandidate':lod.p.file_evidence(original),'sourceProcessingReport':lod.p.file_evidence(old_report),'output':lod.p.file_evidence(out),'tool':lod.p.file_evidence(tool),'originalRaw':r['source']['rawGLB'],'normalizedSourceBoundsGLTF':{'min':lo.tolist(),'max':hi.tolist()},'sourceMaxEdge':extent,'outlierMargin':margin,'deletedTriangles':len(bad),'removedFaces':proof,'remainingTriangleCornersExactlyEqual':True,'remainingUVAndNormalsExactlyEqual':True,'embeddedImagesExactlyEqual':True,'newTriangles':0,'originalRawUnchanged':True}
    lod.write(frozen/'cleanup.json',cleanup);r['derivativeArtifactCleanup']=lod.p.file_evidence(frozen/'cleanup.json');r['processedCandidate']=lod.p.file_evidence(out);r['triangles']=len(remaining);r['derivation']['finalTriangles']=len(remaining);r['glbValidation']=lod.p.inspect_glb(out);r.pop('reviewSheet',None)
    blend=dest/'blender'/r['region']/(r['asset']+'.blend');blend.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    settings=SimpleNamespace(region=r['region'],asset=r['asset'],lod='near',height=1.,footprint=1.,render_directory=dest/'renders'/r['region']/r['asset'])
    r['renderedCandidate']=lod.render(out,settings,('front','right','back','left','iso'));bounds=r['renderedCandidate']['boundsBlender'];lowb,highb=bounds['min'],bounds['max'];r['bounds']={'min':[lowb[0],lowb[2],-highb[1]],'max':[highb[0],highb[2],-lowb[1]],'coordinateSystem':'GLTF Y-up; +Z front'}
    r['completedAt']=lod.now();lod.write(out.with_suffix('.json'),r);print('EXACT_SPIKE_CLEANUP',cleanup['deletedTriangles'],r['processedCandidate'],flush=True)

if __name__=='__main__':main()

"""Compare untouched decoded triangles with the native 1M export, CPU and ROI only."""
from pathlib import Path
import argparse,json,sys,hashlib,subprocess,shutil
import numpy as np
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
from prepare_triptych import ART,ROOT,atomic_json,evidence,sha
from cpu_blender_lease import cpu_blender_lease
from neural_component import GLB

def select_roi(vertices,faces,matrix,boxes,output,label):
    # These are whole existing triangles intersecting a diagnostic box, not clipped,
    # filled, simplified, or repaired surfaces. Their deliberate crop edge is disclosed.
    transformed=vertices.astype(np.float64)@matrix[:3,:3].T+matrix[:3,3]
    selected=[]
    for start in range(0,len(faces),100000):
        tri=transformed[faces[start:start+100000]];lo=tri.min(axis=1);hi=tri.max(axis=1)
        mask=np.zeros(len(tri),dtype=bool)
        for box in boxes:mask|=np.all(hi>=box['min'],axis=1)&np.all(lo<=box['max'],axis=1)
        selected.append(np.flatnonzero(mask)+start)
    ids=np.concatenate(selected)
    if len(ids)>4500000:raise RuntimeError('ROI too large for the bounded CPU diagnostic: '+str(len(ids)))
    chosen=faces[ids];used,inv=np.unique(chosen,return_inverse=True)
    path=output/(label+'.npz');np.savez(path,vertices=transformed[used].astype(np.float32),faces=inv.reshape(-1,3).astype(np.int32),sourceFaceIds=ids,sourceVertexIds=used)
    return {'sourceTriangles':len(faces),'retainedOriginalTriangles':len(ids),'retainedOriginalVertices':len(used),'triangleIdsPreserved':True,'vertexPositionChangeBeyondCoordinateTransform':0,'newTriangles':0,'intentionalCropBoundary':True,'output':evidence(path)}

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--field-receipt',required=True,type=Path);cli.add_argument('--normalization-proof',required=True,type=Path);cli.add_argument('--output',required=True,type=Path);args=cli.parse_args()
    import torch
    field=json.loads(args.field_receipt.read_text('utf8'));proof=json.loads(args.normalization_proof.read_text('utf8'));raw=Path(proof['sourceRaw']['path']);archive=Path(field['tensorArchive']['path'])
    if sha(raw)!=field['rawGLB']['sha256'] or field['rawGLB']['sha256']!=proof['sourceRaw']['sha256']:raise ValueError('Original source mismatch')
    if sha(archive)!=field['tensorArchive']['sha256']:raise ValueError('Frozen decoder archive mismatch')
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    if (out/'extraction.json').exists():raise FileExistsError('Frozen diagnostic exists')
    matrix=np.asarray(proof['rawBlenderToNormalizedBlender'],dtype=np.float64)
    # Native -> raw GLTF diag(-1,1,-1); GLTF -> Blender (X,-Z,Y).
    native_to_blender=np.array([[-1,0,0],[0,0,1],[0,1,0]],dtype=np.float64)
    gltf_to_blender=np.array([[1,0,0],[0,0,-1],[0,1,0]],dtype=np.float64)
    native_matrix=matrix.copy();native_matrix[:3,:3]=matrix[:3,:3]@native_to_blender
    raw_matrix=matrix.copy();raw_matrix[:3,:3]=matrix[:3,:3]@gltf_to_blender
    boxes=[{'min':[-.38,-.08,.70],'max':[.38,.31,.98]},{'min':[-.42,.10,.73],'max':[-.24,.30,.99]}]
    with cpu_blender_lease(ART,7):
        decoded=torch.load(archive,map_location='cpu',mmap=True,weights_only=True)
        decoder=select_roi(decoded['vertices'].numpy(),decoded['faces'].numpy(),native_matrix,boxes,out,'decoder-original-roof')
        del decoded
        glb=GLB(raw)
        if any(any(k in n for k in ('matrix','translation','rotation','scale')) for n in glb.doc['nodes']):raise ValueError('Unaccounted source node transform')
        primitive=glb.doc['meshes'][0]['primitives'][0]
        native_export=select_roi(glb.array(primitive['attributes']['POSITION']),glb.array(primitive['indices']).reshape(-1,3),raw_matrix,boxes,out,'native-1m-roof')
        del glb
        snapshot=ART/'reports/tool-snapshots'/(sha(Path(__file__))+'-'+Path(__file__).name);shutil.copyfile(__file__,snapshot) if not snapshot.exists() else None
        report={'status':'diagnostic_geometry_extracted','fieldReceipt':evidence(args.field_receipt),'archive':field['tensorArchive'],'sourceRaw':evidence(raw),'normalizationProof':evidence(args.normalization_proof),'normalizationReconstructionError':proof['sampledNormalizationReconstructionMaxError'],'nativeToNormalizedBlender':native_matrix.tolist(),'rawGLTFToNormalizedBlender':raw_matrix.tolist(),'roiBoxesNormalizedBlender':boxes,'selectionRule':'Whole original triangles whose bounding box intersects at least one ROI. The same ROI applies to both stages. Crop boundaries are intentional and must not be called source holes.','geometryAltered':False,'decoder':decoder,'nativeExport':native_export,'tool':evidence(snapshot)}
        atomic_json(out/'extraction.json',report)
        command=['C:/Program Files/Blender Foundation/Blender 5.2/blender.exe','--background','--threads','4','--python-exit-code','1','--python',str(HERE/'render_decoder_roi.py'),'--','--report',str(out/'extraction.json')]
        with (out/'render.log').open('w',encoding='utf8') as log:subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
    print(json.dumps({'report':str(out/'extraction.json'),'decoderTriangles':decoder['retainedOriginalTriangles'],'rawTriangles':native_export['retainedOriginalTriangles']},ensure_ascii=False),flush=True)

if __name__=='__main__':main()

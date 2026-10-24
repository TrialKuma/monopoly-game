"""GPU-lock caller service: native CuMesh UV charts only, never geometry creation."""
from pathlib import Path
import json,time,shutil,gc,hashlib
import numpy as np
from native_mobile_export import evidence,sha

def triangle_signature(vertices,faces):
    corners=vertices[faces]
    # Canonical cyclic order preserves winding as well as all exact positions.
    first=np.lexsort((corners[:,:,2],corners[:,:,1],corners[:,:,0]),axis=1)[:,0]
    corners=np.take_along_axis(corners,((np.arange(3)[None,:]+first[:,None])%3)[:,:,None],axis=1)
    rows=np.ascontiguousarray(corners.reshape(-1,9),dtype=np.float32)
    order=np.lexsort(tuple(rows[:,i] for i in range(8,-1,-1)))
    return hashlib.sha256(rows[order].tobytes()).hexdigest()

def serve_request(inference,torch,art,lock_job_id,request_path,request):
    art=Path(art).resolve();started=time.monotonic();output_dir=art/'native-mobile/uv-replays'/request_path.stem
    request.update(status='running',gpuLockJobId=lock_job_id)
    request_path.write_text(json.dumps(request,ensure_ascii=False,indent=2),encoding='utf-8')
    output_dir.mkdir(parents=True,exist_ok=False)
    report={'status':'preparing_native_uv','operation':'native_uv_only','newNeuralInference':False,'gpuLockJobId':lock_job_id,'request':request,
            'geometryOperations':[],'sourceTexturePixelsChanged':False,'note':'This service generates UV coordinates only. Original-image texture transfer and visual review happen separately.'}
    mesh=vertices=faces=out_vertices=out_faces=out_uvs=out_vmaps=None
    try:
        source=Path(request['surfaceNPZ']).resolve();proof_path=source.with_suffix('.json')
        if not source.is_relative_to(art):raise ValueError('Project-local surface required')
        proof=json.loads(proof_path.read_text('utf-8'))
        if 'tool' not in proof and proof.get('processingTool'):proof['tool']=proof['processingTool']
        if sha(source)!=proof['output']['sha256']:raise ValueError('Input surface changed')
        for key in ('candidate','candidateReport','sourceRaw','tool'):
            row=proof[key];path=Path(row['path']);path=path if path.is_absolute() else art.parents[1]/path
            if not path.resolve().is_relative_to(art) or sha(path)!=row['sha256']:raise ValueError('Changed input evidence: '+key)
        frozen_proof=output_dir/'input-source-original.json';shutil.copy2(proof_path,frozen_proof)
        for key,filename in (('candidate','input-candidate.glb'),('candidateReport','input-processing.json'),('tool','input-preparation.py')):
            origin=Path(proof[key]['path']);origin=origin if origin.is_absolute() else art.parents[1]/origin
            dest=output_dir/filename;shutil.copy2(origin,dest);proof[key]=evidence(dest)
        frozen_npz=output_dir/'input-surface.npz';shutil.copy2(source,frozen_npz);proof['output']=evidence(frozen_npz)
        linked=output_dir/'input-proof.json';linked.write_text(json.dumps(proof,ensure_ascii=False,indent=2),encoding='utf-8')
        adapter=output_dir/'native-uv-source.py';shutil.copy2(__file__,adapter)
        reference=output_dir/'reference-native-exporter.py';shutil.copy2(inference.o_voxel.postprocess.__file__,reference)
        data=np.load(frozen_npz);v=np.asarray(data['vertices'],dtype=np.float32);f=np.asarray(data['faces'],dtype=np.int32);data.close()
        if v.ndim!=2 or v.shape[1]!=3 or f.ndim!=2 or f.shape[1]!=3 or not np.isfinite(v).all():raise ValueError('Invalid triangular surface')
        try:import cumesh_vb as cumesh
        except ImportError:import cumesh
        vertices=torch.as_tensor(v,device='cuda',dtype=torch.float32);faces=torch.as_tensor(f,device='cuda',dtype=torch.int32)
        mesh=cumesh.CuMesh();mesh.init(vertices,faces)
        parameters={'threshold_cone_half_angle_rad':float(np.radians(90)),'refine_iterations':0,'global_iterations':1,'smooth_strength':1}
        out_vertices,out_faces,out_uvs,out_vmaps=mesh.uv_unwrap(compute_charts_kwargs=parameters,return_vmaps=True,verbose=True)
        ov=out_vertices.cpu().numpy().astype(np.float32);of=out_faces.cpu().numpy().astype(np.int32);uv=out_uvs.cpu().numpy().astype(np.float32);vm=out_vmaps.cpu().numpy().astype(np.int32)
        before=triangle_signature(v,f);after=triangle_signature(ov,of)
        if len(f)!=len(of) or before!=after:raise ValueError('Native UV unwrap changed the exact geometric surface or winding')
        output=output_dir/'native-uv.npz';np.savez(output,vertices=ov,faces=of,uvs=uv,vmaps=vm)
        report.update(status='uv_ready_for_original_texture_transfer',inputProof=evidence(linked),input=proof['output'],candidate=proof['candidate'],sourceRaw=proof['sourceRaw'],
                      sourceProcessingReport=proof['candidateReport'],adapter=evidence(adapter),nativeExporterReference=evidence(reference),
                      parameters=parameters,coordinateSystem=proof.get('coordinateSystem','input coordinates unchanged'),output=evidence(output),
                      triangles=len(f),inputVertices=len(v),outputVertices=len(ov),sameTriangleCornerPositionMultiset=True,windingPreserved=True,
                      inputTriangleSignature=before,outputTriangleSignature=after,maximumPositionChange=0,additionalRemeshOrSimplification=False)
        request['status']='completed_pending_texture_transfer'
    except Exception as exc:
        report.update(status='uv_failed_sources_preserved',error=repr(exc));request.update(status='failed',error=repr(exc))
    finally:
        report['seconds']=round(time.monotonic()-started,2)
        path=output_dir/'receipt.json';path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        request['receipt']=evidence(path);request_path.write_text(json.dumps(request,ensure_ascii=False,indent=2),encoding='utf-8')
        del mesh,vertices,faces,out_vertices,out_faces,out_uvs,out_vmaps;gc.collect();torch.cuda.empty_cache()
    return evidence(path)

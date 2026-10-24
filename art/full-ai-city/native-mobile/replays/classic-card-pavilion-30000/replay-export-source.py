"""Replay only the native exporter from a frozen neural field, under caller lock."""
from pathlib import Path
import json,time,shutil,gc
from native_mobile_export import evidence,serial,sha

def decode(value):
    if isinstance(value,dict) and set(value)=={'slice'}:return slice(*value['slice'])
    if isinstance(value,dict):return {key:decode(item) for key,item in value.items()}
    if isinstance(value,list):return [decode(item) for item in value]
    return value

def serve_one(inference,torch,art,lock_job_id):
    directory=Path(art)/'queue/native-export-replays'
    if not directory.exists():return None
    for request_path in sorted(directory.glob('*.json')):
        request=json.loads(request_path.read_text('utf-8'))
        if request.get('status')!='requested':continue
        request.update(status='running',gpuLockJobId=lock_job_id)
        request_path.write_text(json.dumps(request,ensure_ascii=False,indent=2),encoding='utf-8')
        output_dir=Path(art)/'native-mobile/replays'/request_path.stem
        output_dir.mkdir(parents=True,exist_ok=False)
        receipt_path=output_dir/'receipt.json';start=time.monotonic()
        tool=output_dir/'replay-export-source.py';shutil.copy2(__file__,tool)
        exporter=output_dir/'native-exporter-source.py';shutil.copy2(inference.o_voxel.postprocess.__file__,exporter)
        receipt={'status':'loading_frozen_neural_field','newNeuralInference':False,'sameNativeRun':True,
                 'separateExportInvocation':True,'gpuLockJobId':lock_job_id,'adapter':evidence(tool),
                 'nativeExporterSnapshot':evidence(exporter),'request':request}
        tensors=mesh=None
        try:
            source_receipt=Path(request['sourceReceipt']).resolve()
            if not source_receipt.is_relative_to(Path(art).resolve()):raise ValueError('Project-local receipt required')
            source=json.loads(source_receipt.read_text('utf-8'))
            for proof in (source['tensorArchive'],source['rawGLB']):
                path=Path(proof['path']).resolve()
                if not path.is_relative_to(Path(art).resolve()) or sha(path)!=proof['sha256']:raise ValueError('Frozen source changed')
            receipt.update(jobId=source['jobId'],sourceExportReceipt=evidence(source_receipt),rawGLB=source['rawGLB'],tensorArchive=source['tensorArchive'],originalParameters=source['originalParameters'])
            tensors=torch.load(source['tensorArchive']['path'],map_location='cpu',weights_only=True)
            parameters=decode(source['originalParameters'])
            target=int(request.get('triangles',30000));size=int(request.get('textureSize',1024))
            if not 12000<=target<=65000 or size not in (1024,2048):raise ValueError('Unreviewed export budget')
            parameters.update(decimation_target=target,texture_size=size)
            receipt.update(status='exporting_frozen_field',mobileParameters=serial(parameters))
            receipt_path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
            gc.collect();torch.cuda.empty_cache()
            mesh=inference.o_voxel.postprocess.to_glb(**tensors,**parameters)
            import numpy as np
            rotation=np.array([[-1,0,0,0],[0,0,-1,0],[0,-1,0,0],[0,0,0,1]],dtype=np.float64)
            mesh.apply_transform(rotation)
            output=output_dir/f'mobile-{target}-{size}.glb';mesh.export(str(output),extension_webp=True)
            receipt.update(status='exported_pending_visual_review',output=evidence(output),actualTriangles=len(mesh.faces),actualVertices=len(mesh.vertices),
                           officialOutputRotation=rotation.tolist(),rawUnchanged=sha(source['rawGLB']['path'])==source['rawGLB']['sha256'],
                           textureOrigin='Frozen original neural attribute field sampled by unchanged native exporter; no new inference or raw-UV bake',
                           geometryOrigin='Frozen original run_mv geometry passed to unchanged native CuMesh cleanup/remesh/simplification')
            request['status']='completed_pending_visual_review'
        except Exception as exc:
            receipt.update(status='replay_failed_original_sources_preserved',error=repr(exc));request.update(status='failed',error=repr(exc))
        finally:
            receipt['seconds']=round(time.monotonic()-start,2)
            receipt_path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
            request['receipt']=evidence(receipt_path);request_path.write_text(json.dumps(request,ensure_ascii=False,indent=2),encoding='utf-8')
            del tensors,mesh;gc.collect();torch.cuda.empty_cache()
        return evidence(receipt_path)
    return None

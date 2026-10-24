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
            export_function=inference.o_voxel.postprocess.to_glb
            variant=None
            if 'surfaceNPZ' in request:
                if 'finalHolePerimeter' in request:raise ValueError('Separate surface and hole-limit diagnostics')
                import importlib.util,ast
                surface=Path(request['surfaceNPZ']).resolve();surface_proof_path=surface.with_suffix('.json')
                surface_proof=json.loads(surface_proof_path.read_text('utf-8'))
                if not surface.is_relative_to(Path(art).resolve()) or sha(surface)!=surface_proof['output']['sha256'] or surface_proof['sourceRaw']['sha256']!=source['rawGLB']['sha256']:raise ValueError('Recorded geometry source mismatch')
                original_proof=output_dir/'geometry-source-original-receipt.json';shutil.copy2(surface_proof_path,original_proof)
                surface_proof['originalReceipt']=evidence(original_proof)
                for key,filename in (('candidate','geometry-candidate.glb'),('candidateReport','geometry-candidate-processing.json')):
                    proof=surface_proof[key];path=Path(proof['path'])
                    if sha(path)!=proof['sha256']:raise ValueError('Geometry candidate evidence changed')
                    frozen=output_dir/filename;shutil.copy2(path,frozen);surface_proof[key]=evidence(frozen)
                tool_proof=surface_proof.get('toolSnapshot',surface_proof['tool']);tool_path=Path(tool_proof['path'])
                if sha(tool_path)!=tool_proof['sha256']:raise ValueError('Actual geometry preparation tool changed')
                frozen_tool=output_dir/'geometry-preparation-source.py';shutil.copy2(tool_path,frozen_tool)
                surface_proof['tool']=surface_proof['toolSnapshot']=evidence(frozen_tool)
                frozen_surface=output_dir/'geometry-surface.npz';shutil.copy2(surface,frozen_surface);surface=frozen_surface
                surface_proof['output']=evidence(surface)
                surface_proof_path=output_dir/'geometry-source-proof.json'
                surface_proof_path.write_text(json.dumps(surface_proof,ensure_ascii=False,indent=2),encoding='utf-8')
                original_snapshot=output_dir/'original-native-exporter-source.py';shutil.copy2(exporter,original_snapshot)
                source_text=exporter.read_text('utf-8');start_marker='    target_faces = int(decimation_target) if decimation_target else 0';end_marker='    out_vertices, out_faces, out_uvs, out_vmaps = mesh.uv_unwrap('
                start_at=source_text.index(start_marker);end_at=source_text.index(end_marker)
                replacement=(f'    _surface = np.load({str(surface)!r})\n'
                             "    mesh.init(torch.as_tensor(_surface['vertices'],dtype=torch.float32,device=device),torch.as_tensor(_surface['faces'],dtype=torch.int32,device=device))\n"
                             "    globals()['_SURFACE_AUDIT'] = {'facesBeforeUnwrap': int(mesh.num_faces)}\n"
                             '    _surface.close()\n\n')
                modified=source_text[:start_at]+replacement+source_text[end_at:]
                lookup='    _, face_id, uvw = bvh.unsigned_distance(valid_pos, return_uvw=True)'
                audit=("    _distance, face_id, uvw = bvh.unsigned_distance(valid_pos, return_uvw=True)\n"
                       "    globals()['_FIELD_LOOKUP_AUDIT'] = {'quantiles50_95_99_100': torch.quantile(_distance.float(),torch.tensor([.5,.95,.99,1.],device=device)).cpu().tolist(), 'fractionOverTwoPercent': float((_distance>.02).float().mean().item()), 'sampleCount': int(_distance.numel()), 'meaning':'Distance to original neural BVH before direct field sampling, not ray hit coverage'}")
                if modified.count(lookup)!=1:raise ValueError('Unexpected native lookup implementation')
                modified=modified.replace(lookup,audit)
                ast.parse(modified);exporter.write_text(modified,encoding='utf-8')
                spec=importlib.util.spec_from_file_location('local_native_field_surface_trial',exporter);variant=importlib.util.module_from_spec(spec);spec.loader.exec_module(variant);export_function=variant.to_glb
                parameters.update(remesh=False,decimation_target=0)
                receipt['nativeExporterSnapshot']=evidence(exporter)
                receipt['geometrySurfaceInput']={'receipt':evidence(surface_proof_path),**surface_proof}
                receipt['nativePostprocessOverride']={'original':evidence(original_snapshot),'scope':'Keep original neural geometry BVH for PBR lookup. Replace only the intermediate surface with this recorded existing source-derived low mesh; bypass further remeshing/simplification/cleanup, then use native unwrap/normals/field sampling.','sharedCodeModified':False,'noNewGeometryAuthored':True,'noNewGeometryAuthoredAppliesTo':'native_uv_material_replay_only'}
            if 'finalHolePerimeter' in request:
                import importlib.util,ast
                perimeter=float(request['finalHolePerimeter'])
                if not .03<perimeter<=.3:raise ValueError('Diagnostic final-hole limit outside explicit range')
                source_text=exporter.read_text('utf-8')
                marker='    mesh.fill_holes(max_hole_perimeter=3e-2)'
                position=source_text.rfind(marker)
                if position<0 or source_text.count('mesh.fill_holes(max_hole_perimeter=3e-2)')!=3:raise ValueError('Unexpected native cleanup implementation')
                original_snapshot=output_dir/'original-native-exporter-source.py';shutil.copy2(exporter,original_snapshot)
                replacement=("    globals()['_LOCAL_HOLE_AUDIT'] = {'facesBefore': int(mesh.num_faces)}\n"
                             f'    mesh.fill_holes(max_hole_perimeter={perimeter!r})\n'
                             "    globals()['_LOCAL_HOLE_AUDIT']['facesAfter'] = int(mesh.num_faces)")
                modified=source_text[:position]+replacement+source_text[position+len(marker):]
                ast.parse(modified);exporter.write_text(modified,encoding='utf-8')
                spec=importlib.util.spec_from_file_location('local_native_mobile_cleanup_trial',exporter)
                variant=importlib.util.module_from_spec(spec);spec.loader.exec_module(variant);export_function=variant.to_glb
                receipt['nativeExporterSnapshot']=evidence(exporter)
                receipt['nativePostprocessOverride']={'original':evidence(original_snapshot),'scope':'Only the final post-simplification hole-filling call before native unwrap/material sampling','originalMaxHolePerimeter':.03,'trialMaxHolePerimeter':perimeter,'sharedCodeModified':False,'visualReviewMustCheckIntentionalOpenings':True}
            receipt.update(status='exporting_frozen_field',mobileParameters=serial(parameters))
            receipt_path.write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
            gc.collect();torch.cuda.empty_cache()
            mesh=export_function(**tensors,**parameters)
            if variant is not None:
                receipt['nativePostprocessOverride']['counts']=getattr(variant,'_LOCAL_HOLE_AUDIT',getattr(variant,'_SURFACE_AUDIT',{}))
                if hasattr(variant,'_FIELD_LOOKUP_AUDIT'):receipt['nativeFieldLookup']=variant._FIELD_LOOKUP_AUDIT
            import numpy as np
            rotation=np.array([[-1,0,0,0],[0,0,-1,0],[0,-1,0,0],[0,0,0,1]],dtype=np.float64)
            mesh.apply_transform(rotation)
            output=output_dir/f'mobile-{target}-{size}.glb';mesh.export(str(output),extension_webp=True)
            receipt.update(status='exported_pending_visual_review',output=evidence(output),actualTriangles=len(mesh.faces),actualVertices=len(mesh.vertices),
                           officialOutputRotation=rotation.tolist(),rawUnchanged=sha(source['rawGLB']['path'])==source['rawGLB']['sha256'],
                           textureOrigin='Frozen original neural attribute field sampled by unchanged native exporter; no new inference or raw-UV bake',
                           geometryOrigin='Frozen original run_mv geometry passed to unchanged native CuMesh cleanup/remesh/simplification')
            if 'surfaceNPZ' in request:
                receipt['geometryOrigin']='Recorded low surface derived from the identical native raw, restored to original field coordinates, with native UV/material generation using the original neural high-surface BVH and attribute field. No authored replacement geometry.'
                receipt['textureOrigin']='Original neural attribute field sampled by the native UV/material operations with the recorded surface-stage override; no new neural inference or raw-UV rebake.'
                if surface_proof.get('localSurfaceRepair'):
                    receipt['geometryOrigin']='Actual neural building with the explicitly recorded bounded local surface repair, followed by source-derived CPU mobile geometry and native UV/material sampling. The original inference, repair and low-surface sources are distinct; the UV/material replay adds no geometry.'
            elif variant is not None:receipt['geometryOrigin']='Frozen original run_mv geometry passed through native CuMesh with the explicitly recorded final post-simplification hole perimeter override before native UV/material generation. No authored replacement geometry.'
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

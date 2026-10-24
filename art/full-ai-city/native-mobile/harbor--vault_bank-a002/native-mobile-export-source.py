"""Optional second native export from the very same neural run, never raw replacement.

The shared Pixal files stay read-only. This local hook captures tensor inputs to
the actual native exporter, lets the unmodified 1M/4096 export finish first, then
performs an explicitly requested independent mobile export under the same lock.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, shutil, time


def sha(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def evidence(path):
    return {'path': str(Path(path).resolve()), 'sha256': sha(path), 'bytes': Path(path).stat().st_size}


def serial(value):
    if isinstance(value, slice): return {'slice': [value.start, value.stop, value.step]}
    if isinstance(value, dict): return {key: serial(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)): return [serial(item) for item in value]
    if hasattr(value, 'tolist'): return value.tolist()
    return value


def install(inference, torch, art, job_id, raw_path, request):
    """Return a finalizer called only after run_inference exported immutable raw."""
    import inspect
    module = inference.o_voxel.postprocess
    original = module.to_glb
    native_wrapper = Path(inspect.getsourcefile(inspect.unwrap(original)))
    native_source = Path(module.__file__)
    folder = Path(art) / 'native-mobile' / job_id
    folder.mkdir(parents=True, exist_ok=False)
    snapshot = folder / 'neural-export-inputs.pt'
    receipt_path = folder / 'receipt.json'
    tool_snapshot = folder / 'native-mobile-export-source.py'
    shutil.copy2(__file__, tool_snapshot)
    exporter_snapshot = folder / 'native-exporter-source.py'
    shutil.copy2(native_source, exporter_snapshot)
    capture = {}
    receipt = {'status': 'capture_pending', 'jobId': job_id, 'request': request,
               'sameNativeRun': True, 'newNeuralInference': False,
               'rawSourceReplaced': False, 'nativeExporter': evidence(native_source),
               'nativeExporterSnapshot': evidence(exporter_snapshot), 'nativeEntrypointWrapper': evidence(native_wrapper),
               'adapter': evidence(tool_snapshot)}

    def save(): receipt_path.write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding='utf-8')

    def wrapped(*args, **kwargs):
        if args: raise ValueError('This adapter expects the verified keyword-only native call')
        if capture: raise RuntimeError('Unexpected second native raw export in one inference run')
        try:
            free=shutil.disk_usage(folder).free
            minimum=int(float(request.get('minDiskGiB',12))*2**30)
            estimated=sum(kwargs[key].numel()*kwargs[key].element_size() for key in ('vertices','faces','attr_volume','coords'))
            receipt.update(diskFreeBytesBeforeCapture=free,estimatedTensorBytes=estimated,minimumDiskReserveBytes=minimum)
            if free < minimum+estimated:raise RuntimeError('Insufficient disk reserve for optional neural field archive')
            tensors = {key: kwargs[key].detach().cpu().clone() for key in ('vertices', 'faces', 'attr_volume', 'coords')}
            parameters = {key: kwargs[key] for key in kwargs if key not in tensors}
            torch.save(tensors, snapshot)
            capture.update(tensors=tensors, parameters=parameters)
            receipt.update(status='captured_before_original_export', tensorArchive=evidence(snapshot),
                           tensorShapes={key: {'shape': list(value.shape), 'dtype': str(value.dtype)} for key, value in tensors.items()},
                           originalParameters=serial(parameters))
        except Exception as exc:
            receipt.update(status='optional_field_capture_failed',captureError=repr(exc))
        save()
        return original(**kwargs)

    module.to_glb = wrapped
    save()

    def finish():
        module.to_glb = original
        if not capture:
            receipt.setdefault('captureError','Native exporter did not provide tensors'); save(); return evidence(receipt_path)
        if not Path(raw_path).is_file():
            receipt.update(status='raw_export_failed_mobile_not_attempted'); save(); return evidence(receipt_path)
        receipt['rawGLB'] = evidence(raw_path)
        if request.get('captureOnly'):
            receipt.update(status='frozen_field_ready_for_optional_export',rawUnchanged=True,
                           completedAt=datetime.now(timezone.utc).isoformat(),diskFreeBytesAfterCapture=shutil.disk_usage(folder).free)
            save();capture.clear();return evidence(receipt_path)
        start = time.monotonic()
        try:
            import gc, numpy as np
            gc.collect(); torch.cuda.empty_cache()
            target = int(request.get('triangles', 45000)); size = int(request.get('textureSize', 1024))
            if not 12000 <= target <= 65000 or size not in (1024, 2048): raise ValueError('Unreviewed mobile export budget')
            parameters = dict(capture['parameters'])
            parameters.update(decimation_target=target, texture_size=size)
            receipt.update(status='exporting_independent_mobile', mobileParameters=serial(parameters)); save()
            # Native CuMesh cleanup, simplification, unwrap and direct neural
            # attribute sampling; no Blender voxel stage and no raw-UV rebake.
            mesh = original(**capture['tensors'], **parameters)
            rotation = np.array([[-1,0,0,0],[0,0,-1,0],[0,-1,0,0],[0,0,0,1]], dtype=np.float64)
            mesh.apply_transform(rotation)
            output = folder / f'mobile-{target}-{size}.glb'
            mesh.export(str(output), extension_webp=True)
            receipt.update(status='exported_pending_visual_review', output=evidence(output),
                           actualTriangles=len(mesh.faces), actualVertices=len(mesh.vertices),
                           officialOutputRotation=rotation.tolist(),
                           textureOrigin='Original neural attribute field sampled by the unchanged native to_glb exporter',
                           geometryOrigin='Same run_mv neural geometry passed to unchanged native CuMesh cleanup/remesh/simplification',
                           rawUnchanged=sha(raw_path)==receipt['rawGLB']['sha256'])
        except Exception as exc:
            # Optional derivative failure must not discard a completed raw run.
            receipt.update(status='mobile_export_failed_raw_preserved', error=repr(exc))
        finally:
            receipt.update(seconds=round(time.monotonic()-start,2), completedAt=datetime.now(timezone.utc).isoformat())
            save(); capture.clear(); torch.cuda.empty_cache()
        return evidence(receipt_path)

    return finish

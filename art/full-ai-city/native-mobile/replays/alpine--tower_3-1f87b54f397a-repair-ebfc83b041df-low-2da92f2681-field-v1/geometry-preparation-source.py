"""Restore an existing neural-derived candidate surface to native field coordinates."""
from pathlib import Path
import argparse,json,sys,shutil
from types import SimpleNamespace
import numpy as np
import bpy
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

def points(body):
    result=np.empty(len(body.data.vertices)*3,dtype=np.float64)
    body.data.vertices.foreach_get('co',result);return result.reshape(-1,3)

def import_geometry_only(path):
    # Keep the ordinary textured-source import guard unchanged.
    from mathutils import Matrix
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects=[obj for obj in bpy.context.scene.objects if obj.type=='MESH']
    if len(objects)!=1:raise ValueError('Geometry-only intermediate must contain one mesh')
    body=objects[0];transform=body.matrix_world.copy();body.parent=None
    body.matrix_world=Matrix.Identity(4);body.data.transform(transform)
    lod.p.select_only([body])
    if body.data.uv_layers or body.data.materials:raise ValueError('Unexpected textured geometry-only intermediate')
    return body

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--candidate-report',required=True,type=Path);parser.add_argument('--field-receipt',required=True,type=Path);parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--allow-recorded-local-repair',action='store_true',help='Explicitly include a separately source-linked bounded repair; never hides it as original neural faces')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    report=json.loads(args.candidate_report.read_text('utf-8'));field=json.loads(args.field_receipt.read_text('utf-8'))
    geometry_only=report.get('geometryOnly',False)
    if geometry_only:
        if report.get('status')!='geometry_ready_for_native_field' or not report.get('geometryReady') or report.get('processingComplete'):raise ValueError('Explicit non-visual geometry-ready receipt required')
        if not report.get('geometryExportPreservation',{}).get('allOrientedTrianglesExactlyPreserved'):raise ValueError('Geometry-only export preservation proof required')
        if report.get('geometryOnlyFieldReceipt',{}).get('sha256')!=lod.p.sha256(args.field_receipt):raise ValueError('Geometry-only intermediate names another field capture')
    candidate=Path(report['processedCandidate']['path']);raw=Path(report['source']['rawGLB']['path'])
    if lod.p.sha256(candidate)!=report['processedCandidate']['sha256'] or lod.p.sha256(raw)!=field['rawGLB']['sha256'] or report['source']['rawGLB']['sha256']!=field['rawGLB']['sha256']:raise ValueError('Geometry and field must derive from identical original raw')
    if report.get('animation') or report.get('componentLocalRepair'):raise ValueError('Animated component derivatives require their independent material/animation proof')
    repair=report.get('localSurfaceRepair');normalization_input=raw
    if repair:
        if not args.allow_recorded_local_repair:raise ValueError('Explicit local-repair option required')
        def local(value):
            path=Path(value);return path if path.is_absolute() else lod.ROOT/path
        normalization_input=local(repair['source']['path']);receipt_path=local(repair['receipt']['path'])
        if lod.p.sha256(normalization_input)!=repair['source']['sha256'] or lod.p.sha256(receipt_path)!=repair['receipt']['sha256']:raise ValueError('Recorded local repair changed')
        repair_receipt=json.loads(receipt_path.read_text('utf-8'))
        if repair_receipt['source']['sha256']!=report['source']['rawGLB']['sha256']:raise ValueError('Local repair is not linked to this original inference')
        if repair_receipt['nativeOutput']['sha256']!=repair['source']['sha256']:raise ValueError('Repair output is not the actual normalization input')
        repair_tool=repair_receipt.get('processingTool',repair_receipt.get('tool'))
        if not repair_tool or lod.p.sha256(local(repair_tool['path']))!=repair_tool['sha256']:raise ValueError('Actual repair tool snapshot required')
    settings=SimpleNamespace(height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18)
    lod.clear_scene();body,_=lod.p.import_body(normalization_input);original=points(body);normalization=lod.p.upright(body,settings);normalized=points(body)
    sample=np.unique(np.linspace(0,len(original)-1,min(4096,len(original)),dtype=np.int64))
    before=np.column_stack([original[sample],np.ones(len(sample))]);after=normalized[sample]
    coefficient=np.linalg.lstsq(before,after,rcond=None)[0]
    transform=np.eye(4);transform[:3,:]=coefficient.T
    error=float(np.linalg.norm(before@coefficient-after,axis=1).max())
    if error>2e-6:raise ValueError('Unable to invert actual normalization reliably')
    inverse=np.linalg.inv(transform)
    lod.clear_scene()
    if geometry_only:low=import_geometry_only(candidate)
    else:low,_=lod.p.import_body(candidate)
    vertices=points(low)
    if any(len(face.vertices)!=3 for face in low.data.polygons):raise ValueError('Candidate must already be triangular')
    faces=np.empty(len(low.data.loops),dtype=np.int32);low.data.loops.foreach_get('vertex_index',faces);faces=faces.reshape(-1,3)
    original_blender=(np.column_stack([vertices,np.ones(len(vertices))])@inverse.T)[:,:3]
    # Blender import converts source GLTF (x,y,z) to (x,-z,y).
    source_gltf=original_blender[:,[0,2,1]].copy();source_gltf[:,2]*=-1
    # Official to_glb axis conversion plus inference_mv output rotation equals
    # diag(-1,1,-1) relative to the decoded native neural mesh coordinates.
    native=source_gltf.copy();native[:,[0,2]]*=-1
    output=args.output.resolve()
    if not output.is_relative_to(lod.ART):raise ValueError('Project-local derivative required')
    output.parent.mkdir(parents=True,exist_ok=True)
    if output.exists():raise FileExistsError('Frozen derivative already exists')
    native_float=native.astype(np.float32)
    unique,inverse_index=np.unique(native_float,axis=0,return_inverse=True)
    welded_faces=inverse_index[faces].astype(np.int32)
    if np.any((welded_faces[:,0]==welded_faces[:,1])|(welded_faces[:,1]==welded_faces[:,2])|(welded_faces[:,2]==welded_faces[:,0])):raise ValueError('Exact position welding found a degenerate triangle; diagnose before native unwrap')
    np.savez(output,vertices=unique,faces=welded_faces)
    frozen_candidate=output.with_suffix('.candidate.glb');frozen_report=output.with_suffix('.candidate.json')
    shutil.copy2(candidate,frozen_candidate);shutil.copy2(args.candidate_report,frozen_report)
    tool_snapshot=output.with_suffix('.prepare-source.py');shutil.copy2(__file__,tool_snapshot)
    proof={'method':'Only coordinate inversion of an existing source-derived low mesh; all candidate vertex/triangle identities preserved. No remeshing, replacement or newly authored geometry.',
           'sourceRaw':report['source']['rawGLB'],'candidate':lod.p.file_evidence(frozen_candidate),'candidateReport':lod.p.file_evidence(frozen_report),'originalCandidate':lod.p.file_evidence(candidate),'fieldReceipt':lod.p.file_evidence(args.field_receipt),
           'output':lod.p.file_evidence(output),'triangles':len(faces),'vertices':len(unique),'originalSplitVertices':len(vertices),'exactCoincidentVerticesMerged':len(vertices)-len(unique),'maximumPositionChangeFromWelding':0,'normalization':normalization,'rawBlenderToNormalizedBlender':transform.tolist(),'inverse':inverse.tolist(),
           'sampledNormalizationReconstructionMaxError':error,'nativeBounds':{'min':native.min(axis=0).tolist(),'max':native.max(axis=0).tolist()},'tool':lod.p.file_evidence(tool_snapshot),'toolSnapshot':lod.p.file_evidence(tool_snapshot)}
    proof['normalizationInput']=lod.p.file_evidence(normalization_input)
    if geometry_only:
        proof['geometryOnly']=True
        proof['geometryStageStatus']=report['status']
        proof['geometryPreExport']=report['geometryPreExport']
        proof['geometryExportPreservation']=report['geometryExportPreservation']
    if repair:
        proof['localSurfaceRepair']=repair
        proof['localRepairTool']=repair_tool
        proof['repairAppliedBeforeReduction']=True
        proof['method']='Coordinate inversion of the recorded neural-derived low surface including explicitly bounded local source repairs. This preparation only welds exact positions and changes coordinates; it adds no faces. Original raw inference and repair input remain distinct.'
    lod.write(output.with_suffix('.json'),proof);print(json.dumps(proof,ensure_ascii=False),flush=True)

if __name__=='__main__':main()

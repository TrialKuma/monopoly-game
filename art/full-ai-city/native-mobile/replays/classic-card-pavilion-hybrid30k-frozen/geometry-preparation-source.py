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

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--candidate-report',required=True,type=Path);parser.add_argument('--field-receipt',required=True,type=Path);parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    report=json.loads(args.candidate_report.read_text('utf-8'));field=json.loads(args.field_receipt.read_text('utf-8'))
    candidate=Path(report['processedCandidate']['path']);raw=Path(report['source']['rawGLB']['path'])
    if lod.p.sha256(candidate)!=report['processedCandidate']['sha256'] or lod.p.sha256(raw)!=field['rawGLB']['sha256'] or report['source']['rawGLB']['sha256']!=field['rawGLB']['sha256']:raise ValueError('Geometry and field must derive from identical original raw')
    if report.get('localSurfaceRepair') or report.get('componentLocalRepair'):raise ValueError('First combined trial excludes locally repaired or animated geometry')
    settings=SimpleNamespace(height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18)
    lod.clear_scene();body,_=lod.p.import_body(raw);original=points(body);normalization=lod.p.upright(body,settings);normalized=points(body)
    sample=np.unique(np.linspace(0,len(original)-1,min(4096,len(original)),dtype=np.int64))
    before=np.column_stack([original[sample],np.ones(len(sample))]);after=normalized[sample]
    coefficient=np.linalg.lstsq(before,after,rcond=None)[0]
    transform=np.eye(4);transform[:3,:]=coefficient.T
    error=float(np.linalg.norm(before@coefficient-after,axis=1).max())
    if error>2e-6:raise ValueError('Unable to invert actual normalization reliably')
    inverse=np.linalg.inv(transform)
    lod.clear_scene();low,_=lod.p.import_body(candidate);vertices=points(low)
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
    proof={'method':'Only coordinate inversion of an existing source-derived low mesh; all candidate vertex/triangle identities preserved. No remeshing, replacement or newly authored geometry.',
           'sourceRaw':report['source']['rawGLB'],'candidate':lod.p.file_evidence(frozen_candidate),'candidateReport':lod.p.file_evidence(frozen_report),'originalCandidate':lod.p.file_evidence(candidate),'fieldReceipt':lod.p.file_evidence(args.field_receipt),
           'output':lod.p.file_evidence(output),'triangles':len(faces),'vertices':len(unique),'originalSplitVertices':len(vertices),'exactCoincidentVerticesMerged':len(vertices)-len(unique),'maximumPositionChangeFromWelding':0,'normalization':normalization,'rawBlenderToNormalizedBlender':transform.tolist(),'inverse':inverse.tolist(),
           'sampledNormalizationReconstructionMaxError':error,'nativeBounds':{'min':native.min(axis=0).tolist(),'max':native.max(axis=0).tolist()},'tool':lod.p.file_evidence(Path(__file__))}
    lod.write(output.with_suffix('.json'),proof);print(json.dumps(proof,ensure_ascii=False),flush=True)

if __name__=='__main__':main()

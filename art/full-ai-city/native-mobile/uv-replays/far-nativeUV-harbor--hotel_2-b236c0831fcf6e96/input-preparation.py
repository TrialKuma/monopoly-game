"""Export exact saved neural LOD geometry for a UV-only external unwrap."""
from pathlib import Path
import argparse,sys,json,hashlib,shutil
import numpy as np
import bpy
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import process_lod as lod
from neural_component import GLB
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--report',required=True,type=Path);parser.add_argument('--blend',required=True,type=Path);parser.add_argument('--sha256',required=True);parser.add_argument('--output',required=True,type=Path);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
 report=json.loads(args.report.read_text('utf8'));candidate=Path(report['processedCandidate']['path']);candidate=candidate if candidate.is_absolute() else lod.ROOT/candidate;raw=Path(report['source']['rawGLB']['path']);raw=raw if raw.is_absolute() else lod.ROOT/raw
 assert lod.p.sha256(candidate)==report['processedCandidate']['sha256']==args.sha256
 assert lod.p.sha256(raw)==report['source']['rawGLB']['sha256']
 if args.output.exists():raise RuntimeError('Use a fresh UV input output')
 # Append only the existing low object. Loading the whole .blend would also
 # bring the million-face source and 4K images into RAM for no reason here.
 low_name=report['region']+'__'+report['asset']+'__neural_lod';bpy.ops.wm.read_factory_settings(use_empty=True)
 with bpy.data.libraries.load(str(args.blend.resolve()),link=False) as (available,wanted):
  assert low_name in available.objects;wanted.objects=[low_name]
 low=wanted.objects[0];bpy.context.collection.objects.link(low);mesh=low.data
 v=np.empty((len(mesh.vertices),3),np.float32);mesh.vertices.foreach_get('co',v.ravel());f=np.empty(len(mesh.loops),np.int32);mesh.loops.foreach_get('vertex_index',f);f=f.reshape(-1,3)
 normals=np.empty((len(mesh.corner_normals),3),np.float32);mesh.corner_normals.foreach_get('vector',normals.ravel())
 assert len(f)==report['triangles'] and len(normals)==len(f)*3
 g=GLB(candidate);p=g.doc['meshes'][0]['primitives'][0];gv=g.array(p['attributes']['POSITION']);gi=g.array(p['indices']).reshape(-1,3);gc=gv[gi][:,:,[0,2,1]].copy();gc[:,:,1]*=-1
 assert np.array_equal(gc,v[f])
 args.output.parent.mkdir(parents=True,exist_ok=True);np.savez_compressed(args.output,vertices=v,faces=f,corner_normals=normals.reshape(-1,3,3))
 tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 receipt={'status':'exact_source_derived_low_mesh_for_uv_only','region':report['region'],'asset':report['asset'],'candidate':lod.p.file_evidence(candidate),'candidateReport':lod.p.file_evidence(args.report),'sourceRaw':lod.p.file_evidence(raw),'sourceBlend':lod.p.file_evidence(args.blend),'output':lod.p.file_evidence(args.output),'processingTool':lod.p.file_evidence(snapshot),'coordinateSystem':'Exact saved Blender mesh local coordinates: Z-up, front -Y; no normalization/rotation/simplification in this step. Blender (X,Y,Z) to GLTF (X,Z,-Y); the validation inverse converts GLTF (X,Y,Z) to Blender (X,-Z,Y).','arrays':{'vertices':{'shape':list(v.shape),'dtype':str(v.dtype)},'faces':{'shape':list(f.shape),'dtype':str(f.dtype)},'corner_normals':{'shape':[len(f),3,3],'dtype':str(normals.dtype),'purpose':'Preserve original low-mesh shading when native UV returns vertex splitting; ignore for unwrap.'}},'candidateTriangleCornerPositionsExactlyEqual':True,'geometryChanged':False,'texturesChanged':False}
 args.output.with_suffix('.json').write_text(json.dumps(receipt,indent=2),encoding='utf8');print(json.dumps({'output':receipt['output'],'receipt':lod.p.file_evidence(args.output.with_suffix('.json')),'vertices':len(v),'triangles':len(f)},indent=2),flush=True)
if __name__=='__main__':main()

"""Reproject UVs on one existing neural LOD, without changing its geometry.

Run in CPU Blender. Requires a hash-bound prior candidate/report and its saved
source/LOD blend. The exported triangle corner positions must be exactly equal
to the input. New output goes to a separate diagnostic directory only.
"""
from pathlib import Path
from types import SimpleNamespace
import json,sys,math,argparse,shutil
import numpy as np
import bpy
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import process_lod as lod
from bake_nearest_surface import bake
from neural_component import GLB

def main():
 cli=argparse.ArgumentParser();cli.add_argument('--report',type=Path,required=True);cli.add_argument('--blend',type=Path,required=True);cli.add_argument('--sha256',required=True);cli.add_argument('--output-root',type=Path,required=True);cli.add_argument('--angle',type=float,default=66);cli.add_argument('--margin',type=float,default=.00002);cli.add_argument('--method',choices=('SCALED','FRACTION','ADD'),default='SCALED');options=cli.parse_args(sys.argv[sys.argv.index('--')+1:])
 report=json.loads(options.report.read_text('utf8'));prior=Path(report['processedCandidate']['path']);prior=prior if prior.is_absolute() else lod.ROOT/prior
 assert lod.p.sha256(prior)==report['processedCandidate']['sha256']==options.sha256
 raw=Path(report['source']['rawGLB']['path']);raw=raw if raw.is_absolute() else lod.ROOT/raw
 assert lod.p.sha256(raw)==report['source']['rawGLB']['sha256']
 region,asset=report['region'],report['asset'];name=region+'__'+asset;dest=options.output_root.resolve();out=dest/region/(asset+'.glb')
 if out.resolve()==prior.resolve() or out.exists():raise RuntimeError('Use a fresh isolated output, never replace a candidate')
 out.parent.mkdir(parents=True,exist_ok=True)
 bpy.ops.wm.open_mainfile(filepath=str(options.blend.resolve()))
 source=bpy.data.objects[name+'__raw_source'];low=bpy.data.objects[name+'__neural_lod'];root=low.parent
 def mesh_arrays(mesh):
  v=np.empty((len(mesh.vertices),3),np.float32);mesh.vertices.foreach_get('co',v.ravel());f=np.empty(len(mesh.loops),np.int32);mesh.loops.foreach_get('vertex_index',f);return v,f
 vertices,faces=mesh_arrays(low.data);assert len(faces)//3==report['triangles']
 expected_source=report['derivation'].get('repairedSourceTriangles',report['derivation']['rawTriangles'])-report.get('sourceArtifactCleanup',{}).get('deletedTriangles',0)
 assert lod.p.triangles(source)==expected_source
 args=SimpleNamespace(region=region,asset=asset,name=name,lod='near',height=1.,footprint=1.,texture_size=1024,uv_angle=options.angle,uv_margin=options.margin,uv_margin_method=options.method,render_directory=dest/'renders'/region/asset)
 while low.data.uv_layers:low.data.uv_layers.remove(low.data.uv_layers[0])
 low.data.uv_layers.new(name='MobileBakedUV');low.data.uv_layers.active_index=0;low.data.uv_layers[0].active_render=True
 lod.p.select_only([low]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=math.radians(args.uv_angle),island_margin=args.uv_margin,margin_method=args.uv_margin_method);bpy.ops.object.mode_set(mode='OBJECT')
 coverage=lod.uv_area(low);after_v,after_f=mesh_arrays(low.data);assert np.array_equal(vertices,after_v) and np.array_equal(faces,after_f)
 print('REUV_GEOMETRY_UNCHANGED',len(faces)//3,'COVERAGE',coverage,flush=True)
 if coverage<.30:
  (dest/'coverage-rejected.json').write_text(json.dumps({'status':'rejected_before_bake','angle':args.uv_angle,'margin':args.uv_margin,'marginMethod':args.uv_margin_method,'coverage':coverage,'geometryUnchanged':True,'reason':'Atlas coverage is below existing 0.30 guard.'},indent=2),encoding='utf8');raise RuntimeError('Atlas coverage too low: '+str(coverage))
 report['bake'],images=bake(source,low,args)
 report['bake']['sourceNote']='Only the UV layout changed on the existing low surface. Texture samples use the same original native source or explicitly documented repaired source stored in the hash-bound source blend.'
 report['derivation']['atlasArea']=coverage;report['derivation']['uvUnwrap']={'angleDegrees':args.uv_angle,'islandMargin':args.uv_margin,'marginMethod':args.uv_margin_method,'nominalMarginPixels':args.uv_margin*1024 if args.uv_margin_method=='FRACTION' else None}
 report['textureOnlyReprocessing']={'sourceCandidate':lod.p.file_evidence(prior),'sourceProcessingReport':lod.p.file_evidence(options.report),'sourceBlend':lod.p.file_evidence(options.blend),'sourceTriangleCountVerified':expected_source,'positionsUnchanged':True,'faceIndicesUnchanged':True,'additionalRemeshOrSimplification':False}
 tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 report['processingTool']=lod.p.file_evidence(snapshot)
 helper=HERE/'bake_nearest_surface.py';helper_snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(helper)+'-'+helper.name)
 if not helper_snapshot.exists():shutil.copyfile(helper,helper_snapshot)
 report['textureTransferTool']=lod.p.file_evidence(helper_snapshot)
 lod.p.select_only([root,low]);bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='JPEG',export_jpeg_quality=92,export_extras=True)
 report['quantization']=lod.quantize_mobile_attributes(out)
 def face_positions(path):
  g=GLB(path);p=g.doc['meshes'][0]['primitives'][0];return g.array(p['attributes']['POSITION'])[g.array(p['indices']).reshape(-1,3)]
 assert np.array_equal(face_positions(prior),face_positions(out))
 report['textureOnlyReprocessing']['exportedTriangleCornerPositionsExactlyUnchanged']=True
 report['processedCandidate']=lod.p.file_evidence(out);report['glbValidation']=lod.p.inspect_glb(out);report['triangles']=report['glbValidation']['triangles'];report['status']='exported_pending_visual_review';report['processingComplete']=False
 out.with_suffix('.json').write_text(json.dumps(report,indent=2),encoding='utf8')
 report['renderedCandidate']=lod.render(out,args,('front','right','back','left','iso'));report['textureSizes']=report['renderedCandidate']['textureSizes'];report['processingComplete']=True;report['completedAt']=lod.now()
 out.with_suffix('.json').write_text(json.dumps(report,indent=2),encoding='utf8');print('REUV_CANDIDATE',json.dumps(report['processedCandidate']),flush=True)

if __name__=='__main__':main()

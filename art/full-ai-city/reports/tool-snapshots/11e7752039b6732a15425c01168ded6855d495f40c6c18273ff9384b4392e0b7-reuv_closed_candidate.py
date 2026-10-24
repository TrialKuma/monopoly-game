"""Isolate UV padding from geometry: re-unwrap the exact saved 44,970-face mesh."""
from pathlib import Path
from types import SimpleNamespace
import json,sys,math,copy,hashlib,shutil,argparse
import numpy as np
import bpy
OUT=Path(__file__).parent;ROOT=OUT.parents[3];sys.path.insert(0,str(ROOT/'art/full-ai-city/tools'))
import process_lod as lod
from bake_nearest_surface import bake
from neural_component import GLB
cli=argparse.ArgumentParser();cli.add_argument('--angle',type=float,default=89);cli.add_argument('--margin',type=float,default=.001);cli.add_argument('--method',default='FRACTION');cli.add_argument('--output-name',default='wide-uv-candidates');options=cli.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ORIGIN=OUT/'closed-patches';DEST=ORIGIN/options.output_name;DEST.mkdir(exist_ok=True)
prior=ORIGIN/'candidates/classic/villa_3.glb';proof=prior.with_suffix('.json');report=json.loads(proof.read_text('utf8'))
blend=ORIGIN/'candidates/blender/classic/villa_3.blend'
assert lod.p.sha256(prior)==report['processedCandidate']['sha256']
bpy.ops.wm.open_mainfile(filepath=str(blend))
source=bpy.data.objects['classic__villa_3__raw_source'];low=bpy.data.objects['classic__villa_3__neural_lod'];root=low.parent
def mesh_arrays(mesh):
 v=np.empty((len(mesh.vertices),3),np.float32);mesh.vertices.foreach_get('co',v.ravel());f=np.empty(len(mesh.loops),np.int32);mesh.loops.foreach_get('vertex_index',f);return v,f
vertices,faces=mesh_arrays(low.data)
args=SimpleNamespace(region='classic',asset='villa_3',name='classic__villa_3',lod='near',height=1.,footprint=1.,texture_size=1024,uv_angle=options.angle,uv_margin=options.margin,uv_margin_method=options.method,render_directory=DEST/'renders/classic/villa_3')
while low.data.uv_layers:low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name='MobileBakedUV');low.data.uv_layers.active_index=0;low.data.uv_layers[0].active_render=True
lod.p.select_only([low]);bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(args.uv_angle),island_margin=args.uv_margin,margin_method=args.uv_margin_method)
bpy.ops.object.mode_set(mode='OBJECT');coverage=lod.uv_area(low)
after_v,after_f=mesh_arrays(low.data);assert np.array_equal(vertices,after_v) and np.array_equal(faces,after_f)
print('REUV_GEOMETRY_UNCHANGED',len(faces)//3,'COVERAGE',coverage,flush=True)
if coverage<.30:
 (DEST/'coverage-rejected.json').write_text(json.dumps({'status':'rejected_before_bake','angle':args.uv_angle,'margin':args.uv_margin,'marginMethod':args.uv_margin_method,'coverage':coverage,'geometryUnchanged':True,'reason':'Atlas coverage is below existing 0.30 guard.'},indent=2),encoding='utf8')
 raise RuntimeError('Atlas coverage too low: '+str(coverage))
report['bake'],images=bake(source,low,args)
report['bake']['repairSourceNote']='Exact inward-closed local-patch source preserved. Only UV layout and source-derived texture transfer changed in this pass.'
report['derivation']['atlasArea']=coverage
report['derivation']['uvUnwrap']={'angleDegrees':args.uv_angle,'islandMargin':args.uv_margin,'marginMethod':args.uv_margin_method,'nominalMarginPixels':args.uv_margin*1024 if args.uv_margin_method=='FRACTION' else None}
report['textureOnlyReprocessing']={'sourceCandidate':lod.p.file_evidence(prior),'sourceProcessingReport':lod.p.file_evidence(proof),'sourceBlend':lod.p.file_evidence(blend),'positionsUnchanged':True,'faceIndicesUnchanged':True,'additionalRemeshOrSimplification':False}
snapshot=DEST/(lod.p.sha256(Path(__file__))+'-reuv_closed_candidate.py');shutil.copyfile(__file__,snapshot);report['processingTool']=lod.p.file_evidence(snapshot)
helper=ROOT/'art/full-ai-city/tools/bake_nearest_surface.py';helper_snapshot=DEST/(lod.p.sha256(helper)+'-bake_nearest_surface.py');shutil.copyfile(helper,helper_snapshot);report['textureTransferTool']=lod.p.file_evidence(helper_snapshot)
out=DEST/'classic/villa_3.glb';out.parent.mkdir(exist_ok=True)
lod.p.select_only([root,low]);bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='JPEG',export_jpeg_quality=92,export_extras=True)
report['quantization']=lod.quantize_mobile_attributes(out)
def face_positions(path):
 g=GLB(path);p=g.doc['meshes'][0]['primitives'][0];return g.array(p['attributes']['POSITION'])[g.array(p['indices']).reshape(-1,3)]
assert np.array_equal(face_positions(prior),face_positions(out))
report['textureOnlyReprocessing']['exportedTriangleCornerPositionsExactlyUnchanged']=True
report['processedCandidate']=lod.p.file_evidence(out);report['glbValidation']=lod.p.inspect_glb(out);report['triangles']=report['glbValidation']['triangles'];report['status']='exported_pending_visual_review';report['processingComplete']=False
out.with_suffix('.json').write_text(json.dumps(report,indent=2),encoding='utf8')
report['renderedCandidate']=lod.render(out,args,('front','right','back','left','iso'))
report['textureSizes']=report['renderedCandidate']['textureSizes'];report['processingComplete']=True;report['completedAt']=lod.now()
out.with_suffix('.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print('REUV_CANDIDATE',json.dumps(report['processedCandidate']),flush=True)

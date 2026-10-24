"""Normalize and inspect a second native neural-field export without rebaking it."""
from pathlib import Path
from types import SimpleNamespace
import argparse, json, sys, shutil
import bpy
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--state',required=True,type=Path)
    parser.add_argument('--receipt',required=True,type=Path)
    parser.add_argument('--output-root',required=True,type=Path)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    state=json.loads(args.state.read_text('utf-8'));receipt=json.loads(args.receipt.read_text('utf-8'))
    if receipt['status']!='exported_pending_visual_review' or not receipt['sameNativeRun'] or not receipt['rawUnchanged']:raise ValueError('Completed same-run mobile receipt required')
    raw=Path(state['rawGLB']['path']);mobile=Path(receipt['output']['path'])
    for proof in (state['rawGLB'],state['reference'],state['inferenceReport'],receipt['output'],receipt['tensorArchive']):
        if lod.p.sha256(Path(proof['path']))!=proof['sha256']:raise ValueError('Source proof hash mismatch: '+proof['path'])
    if receipt['rawGLB']['sha256']!=state['rawGLB']['sha256']:raise ValueError('Same-inference raw mismatch')
    infer=json.loads(Path(state['inferenceReport']['path']).read_text('utf-8'))
    if infer['status']!='generated_unrigged_part_candidate' or infer['view_count']!=3 or infer['pipeline_config']!='pipeline_mv.json':raise ValueError('Native MV completion required')
    name=state['region']+'__'+state['asset'];rootdir=args.output_root.resolve()
    output=rootdir/state['region']/(state['asset']+'.glb');output.parent.mkdir(parents=True,exist_ok=True)
    settings=SimpleNamespace(region=state['region'],asset=state['asset'],lod='near',height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18,render_directory=rootdir/'renders'/state['region']/state['asset'])
    lod.clear_scene();body,_=lod.p.import_body(mobile);body.name=name+'__native_mobile'
    normalization=lod.p.upright(body,settings)
    before=lod.p.triangles(body)
    root=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(root);body.parent=root
    root['nativeMV']=True;root['sourceSha256']=state['rawGLB']['sha256'];root['geometryOrigin']=receipt['geometryOrigin'];root['asset']=state['asset'];root['region']=state['region']
    lod.p.select_only([root,body])
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_image_format='JPEG',export_jpeg_quality=95,export_extras=True)
    quantization=lod.quantize_mobile_attributes(output)
    validation=lod.p.inspect_glb(output)
    if validation['triangles']!=before:raise ValueError('Normalization unexpectedly changed triangle count')
    snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(Path(__file__))+'-process_native_mobile.py')
    snapshot.parent.mkdir(parents=True,exist_ok=True)
    if not snapshot.exists():shutil.copy2(__file__,snapshot)
    report={'status':'exported_pending_visual_review','createdAt':lod.now(),'region':state['region'],'asset':state['asset'],'lod':'near',
        'source':{'rawGLB':state['rawGLB']},'inferenceReport':state['inferenceReport'],'reference':state['reference'],
        'processingTool':lod.p.file_evidence(snapshot),'nativeSurfaceExport':{'receipt':lod.p.file_evidence(args.receipt),'source':receipt['output'],'tensorArchive':receipt['tensorArchive']},
        'nativePipeline':'Pixal3DMVImageTo3DPipeline.run_mv','nativeResolution':1024,'seed':infer['seed'],'assumedCameras':True,'cameraCalibration':'assumed_standard_orbit_not_measured',
        'geometryOrigin':receipt['geometryOrigin'],'textureOrigin':receipt['textureOrigin'],'normalization':normalization,
        'orientation':{'up':'Y','front':'+Z','groundY':0,'maxEdge':1},'requestedTriangles':receipt['mobileParameters']['decimation_target'],
        'triangles':validation['triangles'],'glbValidation':validation,'quantization':quantization,'processedCandidate':lod.p.file_evidence(output),
        'derivation':{'method':'Unchanged native neural-field mobile exporter; only rigid/uniform normalization, JPEG encoding and attribute quantization afterward','voxelizedAgain':False,'rebakedFromRawUV':False,'facadeUVPreserved':True,'normalizedTrianglesPreserved':True},
        'bake':{'method':'Direct original neural attribute field sampling inside native to_glb; no Blender bake or nearest raw-image transfer','notRayCoverage':True},
        'animation':None,'processingComplete':False,'limitations':['Same assumed three-view cameras as original native raw','Diagnostic pending external visual approval; not a formal asset replacement']}
    lod.write(output.with_suffix('.json'),report)
    report['renderedCandidate']=lod.render(output,settings,('front','right','back','left','iso'))
    report['renderedSource']=lod.render(raw,settings,('front','iso'),raw=True)
    lo,hi=report['renderedCandidate']['boundsBlender']['min'],report['renderedCandidate']['boundsBlender']['max']
    report['bounds']={'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]],'coordinateSystem':'GLTF Y-up; +Z front'}
    report['textureSizes']=report['renderedCandidate']['textureSizes'];report['processingComplete']=True;report['completedAt']=lod.now();report['rawSourceUnchanged']=lod.p.sha256(raw)==state['rawGLB']['sha256']
    lod.write(output.with_suffix('.json'),report)
    print('NATIVE_MOBILE_CANDIDATE',json.dumps(report['processedCandidate']),flush=True)

if __name__=='__main__':main()

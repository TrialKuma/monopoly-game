"""Conservative single-pass, original-UV export of a verified native MV house."""
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime,timezone
import sys,argparse,json,math
import bpy
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'art/harbor/tools'))
import process_generated_model as p
from quantize_gltf_attributes import quantize_mobile_attributes

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',required=True);parser.add_argument('--inference-report',required=True)
    parser.add_argument('--name',required=True);parser.add_argument('--triangles',type=int,default=90000)
    parser.add_argument('--texture-size',type=int,choices=(1024,2048,4096),default=2048)
    parser.add_argument('--yaw',type=float,default=180)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    if not args.name.replace('_','').isalnum():raise ValueError('Invalid asset name')
    if not 50000<=args.triangles<=240000:raise ValueError('Use the agreed conservative 50k to 240k range')
    source=p.resolve(args.source);inference_path=p.resolve(args.inference_report)
    inference=json.loads(inference_path.read_text('utf-8'))
    if inference.get('view_count')!=3 or not inference.get('assumed_cameras'):raise ValueError('Requires verified 3-view assumed-camera source')
    if inference.get('pipeline_config')!='pipeline_mv.json':raise ValueError('Requires the actual native MV pipeline')
    opts=SimpleNamespace(**vars(args),reference=inference['input'],height=3.0,footprint=3.0,
        pitch=0,roll=0,no_auto_upright=False,max_upright=18,
        render_size=768,samples=24,skip_render=False,animation_config=None,
        render_directory='art/themed-city-kit/renders')
    source_evidence=p.file_evidence(source)
    p.validate_generation(source,opts,source_evidence)
    p.clear_scene();body,source_objects=p.import_body(source);source_triangles=p.triangles(body)
    source_vertices=len(body.data.vertices)
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=.000001,use_unselected=False)
    bpy.ops.object.mode_set(mode='OBJECT');welded_vertices=len(body.data.vertices)
    body.data.validate(clean_customdata=False);body.data.update()
    before=p.triangles(body);decimation=[]
    if before>args.triangles:
        modifier=body.modifiers.new('Single conservative mobile reduction','DECIMATE')
        modifier.ratio=args.triangles/before;modifier.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        changed=body.data.validate(clean_customdata=False);body.data.update()
        decimation.append({'pass':1,'before':before,'after':p.triangles(body),'validation_changed':changed})
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.delete_loose(use_verts=True,use_edges=True,use_faces=False);bpy.ops.object.mode_set(mode='OBJECT')
    orientation=p.upright(body,opts);lo,hi=p.bounds(body);height=(hi-lo).z
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(42))
    textures=[]
    for image in bpy.data.images:
        if image.type!='IMAGE' or not image.size[0]:continue
        old=list(image.size);ratio=min(1,args.texture_size/max(old))
        if ratio<1:image.scale(max(1,round(old[0]*ratio)),max(1,round(old[1]*ratio)))
        image.pack();textures.append({'name':image.name,'original_size':old,'size':list(image.size)})
    root=bpy.data.objects.new(args.name,None);bpy.context.collection.objects.link(root)
    root['provenance']='Three independent AI reference images -> actual native local Pixal3D MV -> original-UV mobile export'
    root['camera_calibration']='Assumed 0/90/180 degree orbit, 20 degree FOV; not measured cameras'
    root['source_sha256']=source_evidence['sha256'];body.name=args.name+'_ai_structure';body.parent=root
    for obj in list(bpy.context.scene.objects):
        if obj.type=='EMPTY' and obj!=root:bpy.data.objects.remove(obj,do_unlink=True)
    art=ROOT/'art/themed-city-kit';out=ROOT/'assets/models/regions-ai'/f'{args.name}.glb'
    blend=art/'blender'/f'{args.name}.blend';report_path=art/'reports'/f'{args.name}-processing.json'
    for path in [out.parent,blend.parent,report_path.parent]:path.mkdir(parents=True,exist_ok=True)
    p.select_only([root,*root.children_recursive]);bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,
        export_animations=False,export_image_format='JPEG',export_jpeg_quality=88,export_extras=True)
    quantization=quantize_mobile_attributes(out);glb=p.inspect_glb(out)
    if glb['triangles']>args.triangles*1.05:raise RuntimeError('Actual export exceeds requested budget by over 5%; review source instead of repeated collapse')
    report={'status':'exported_pending_visual_review','created_at_utc':datetime.now(timezone.utc).isoformat(),
        'source':source_evidence,'source_objects':source_objects,'source_triangles':source_triangles,
        'source_vertices':source_vertices,'welded_vertices':welded_vertices,'decimation_passes':decimation,
        'requested_triangles':args.triangles,
        'source_appearance_bake':None,'animation':None,'output':p.file_evidence(out),'blend':str(blend),
        'tool':p.file_evidence(Path(__file__)),'shared_processing_tool':p.file_evidence(Path(p.__file__)),
        'reference':p.file_evidence(Path(inference['input'])),'inference_report':p.file_evidence(inference_path),
        'input_views':inference['input_views'],'source_board':inference.get('source_board'),
        'assumed_cameras':True,'camera_calibration':inference['camera_calibration'],
        'geometry_origin':'Actual native Pixal3D multiview source only. No substitute building or manually added geometry.',
        'preservation':'Original generated UVs, material assignments and textures retained; one conservative collapse from raw source.',
        'orientation':orientation,'height':height,'bounds_blender':{'min':list(lo),'max':list(hi)},
        'bounds_gltf':{'min':[lo.x,lo.z,-hi.y],'max':[hi.x,hi.z,-lo.y]},
        'textures':textures,'quantization':quantization,'glb_validation':glb}
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    report['export_reimport_validation']=p.render_exported(out,opts,height)
    report['raw_source_unchanged']=p.sha256(source)==source_evidence['sha256']
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('MULTIVIEW_HOUSE_CANDIDATE',json.dumps({'name':args.name,'bytes':out.stat().st_size,'triangles':glb['triangles'],'report':str(report_path)}),flush=True)
if __name__=='__main__':main()

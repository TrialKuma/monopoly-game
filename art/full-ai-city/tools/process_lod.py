"""Source-derived UV-free reduction and original-source PBR bake, CPU only.

No replacement or manually modeled building geometry is introduced. Removing UV
attributes from only the derivative lets collapse operate on welded geometry;
a fresh atlas is then baked from the untouched neural high-resolution surface.
"""
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime,timezone
import argparse,json,sys,math,hashlib,shutil
EXECUTED_TOOL_SOURCE=Path(__file__).read_bytes()
import bpy,bmesh
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
sys.path.insert(0,str(ROOT/'art/harbor/tools'))
import process_generated_model as p
from quantize_gltf_attributes import quantize_mobile_attributes
def now():return datetime.now(timezone.utc).isoformat()
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
def geometry_triangle_ceiling(requested):
    # Match the existing near approval ceilings; the opt-in cannot buy a larger budget.
    if not 0 < requested <= 65000:raise ValueError('Unsupported geometry-only triangle budget')
    return 32000 if requested <= 32000 else 46000 if requested <= 46000 else 65000
def clear_scene():
    for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
    for group in (bpy.data.meshes,bpy.data.materials,bpy.data.images):
        for data in list(group):
            if data.users==0:group.remove(data)

def export_geometry_only(args, state, report, out, low, source_triangles, welded, before_reduction):
    """Freeze an untextured intermediate, never a promotable visual candidate."""
    import numpy as np
    from neural_component import GLB
    if any(len(face.vertices)!=3 for face in low.data.polygons):raise ValueError('Geometry-only input must already be triangular')
    vertices=np.empty(len(low.data.vertices)*3,dtype=np.float32);low.data.vertices.foreach_get('co',vertices)
    vertices=vertices.reshape(-1,3)[:,[0,2,1]].copy();vertices[:,2]*=-1
    faces=np.empty(len(low.data.loops),dtype=np.int32);low.data.loops.foreach_get('vertex_index',faces);faces=faces.reshape(-1,3)
    before=out.with_suffix('.geometry-before-export.npz');np.savez(before,vertices=vertices,faces=faces)
    p.select_only([low])
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_extras=True)
    glb=GLB(out);nodes=[node for node in glb.doc['nodes'] if 'mesh' in node]
    if len(nodes)!=1 or any(any(k in node for k in ('matrix','translation','rotation','scale')) for node in glb.doc['nodes']):raise ValueError('Geometry-only export must have one baked mesh')
    parts=glb.doc['meshes'][nodes[0]['mesh']]['primitives']
    if len(parts)!=1 or parts[0].get('mode',4)!=4:raise ValueError('Geometry-only export must be one triangle primitive')
    part=parts[0];actual_vertices=glb.array(part['attributes']['POSITION']);actual_faces=glb.array(part['indices']).reshape(-1,3)
    if 'TEXCOORD_0' in part['attributes'] or glb.doc.get('images') or glb.doc.get('materials'):raise ValueError('Geometry-only export unexpectedly contains materials or UVs')
    # Exact position identities allow harmless vertex splitting and face order,
    # while preserving every oriented triangle, including multiplicity.
    _,mapping=np.unique(np.concatenate([vertices,actual_vertices]),axis=0,return_inverse=True)
    def oriented(rows):
        rows=rows.copy();start=np.argmin(rows,axis=1)
        rows=np.take_along_axis(rows,(np.arange(3)[None,:]+start[:,None])%3,axis=1)
        return np.unique(rows,axis=0,return_counts=True)
    a,ac=oriented(mapping[:len(vertices)][faces]);b,bc=oriented(mapping[len(vertices):][actual_faces])
    if not np.array_equal(a,b) or not np.array_equal(ac,bc):raise ValueError('Geometry-only export changed triangle coordinates or winding')
    proof={'preExport':p.file_evidence(before),'allOrientedTrianglesExactlyPreserved':True,'trianglesCompared':len(faces),'maximumPositionChange':0,'vertexSplitsOrFaceOrderPermitted':True,'method':'Exact per-corner float32 positions and cyclic oriented triangle multiset, including multiplicity; no nearest-point tolerance'}
    report.update(status='geometry_ready_for_native_field',geometryOnly=True,geometryReady=True,processingComplete=False,
        geometryOrigin='Actual native three-view source normalized and reduced with the recorded geometry settings; no intermediate UV, material transfer or renders. Requires native field finalization and independent visual approval.',
        processedCandidate=p.file_evidence(out),triangles=len(actual_faces),geometryPreExport=p.file_evidence(before),geometryExportPreservation=proof,
        geometryValidation={'version':2,'triangles':len(actual_faces),'meshes':1,'materials':0,'images':0,'hasUV':False,'bakedNodeTransforms':True},
        derivation={'rawTriangles':source_triangles,'weldedTriangles':welded,'remeshedTriangles':before_reduction,'voxelSize':args.voxel_size,'finalTriangles':len(faces),'singleReductionPass':True,'inheritedUVRemovedBeforeReduction':True,'sourceMaterialsUntouched':True,'temporaryUVBakeAndRenderSkipped':True},
        bounds={'min':vertices.min(axis=0).tolist(),'max':vertices.max(axis=0).tolist(),'coordinateSystem':'GLTF Y-up; +Z front'},
        rawSourceUnchanged=p.sha256(Path(state['rawGLB']['path']))==state['rawGLB']['sha256'],completedAt=now())
    ceiling=geometry_triangle_ceiling(args.triangles)
    report['geometryTriangleBudget']={'requested':args.triangles,'existingApprovalCeiling':ceiling,'actual':len(faces),'withinCeiling':len(faces)<=ceiling}
    if len(faces)>ceiling:
        report.update(status='geometry_over_budget_needs_review',geometryReady=False)
        write(out.with_suffix('.json'),report)
        raise ValueError(f'Actual geometry-only reduction has {len(faces)} triangles, above existing {ceiling} ceiling; preserve it for review, do not sample the field')
    write(out.with_suffix('.json'),report)
    print('LOD_GEOMETRY_READY',json.dumps({'path':str(out),'triangles':len(faces),'report':str(out.with_suffix('.json'))}),flush=True)
def set_cpu():
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU'
    scene.cycles.samples=1;scene.render.threads_mode='FIXED';scene.render.threads=4
    return scene
def uv_area(obj):
    uv=obj.data.uv_layers.active.data;total=0
    for face in obj.data.polygons:
        points=[uv[i].uv for i in face.loop_indices]
        for i in range(1,len(points)-1):
            a,b,c=points[0],points[i],points[i+1]
            total+=abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*.5
    return total
def remove_dark_ground(source):
    """Delete only inferred dark ground faces below the architectural plinth."""
    import numpy as np
    mesh=source.data
    if any(len(face.vertices)!=3 for face in mesh.polygons):raise ValueError('Ground cleanup expects raw triangles')
    coordinates=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',coordinates);coordinates=coordinates.reshape(-1,3)
    indices=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',indices);indices=indices.reshape(-1,3)
    face_z=coordinates[indices,2].max(axis=1)
    uv=np.empty(len(mesh.loops)*2,dtype=np.float32);mesh.uv_layers.active.data.foreach_get('uv',uv);centers=uv.reshape(-1,3,2).mean(axis=1)
    material=mesh.materials[0];bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    image=bsdf.inputs['Base Color'].links[0].from_node.image;width,height=image.size
    pixels=np.empty(width*height*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(height,width,4)
    xy=(centers*np.array([width,height])).astype(np.int32);xy[:,0]=np.clip(xy[:,0],0,width-1);xy[:,1]=np.clip(xy[:,1],0,height-1)
    brightness=pixels[xy[:,1],xy[:,0],:3].mean(axis=1)
    from mathutils.kdtree import KDTree
    base_points=coordinates[(coordinates[:,2]>=.014)&(coordinates[:,2]<.04)]
    tree=KDTree(len(base_points))
    for index,point in enumerate(base_points):tree.insert((float(point[0]),float(point[1]),0),index)
    tree.balance();outside=np.zeros(len(face_z),dtype=bool);face_centers=coordinates[indices].mean(axis=1)
    for index in np.flatnonzero(face_z<.014):
        point=face_centers[index];outside[index]=tree.find((float(point[0]),float(point[1]),0))[2]>.012
    remove=np.flatnonzero((face_z<.014)&((brightness<.18)|outside))
    bm=bmesh.new();bm.from_mesh(mesh);bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm,geom=[bm.faces[int(i)] for i in remove],context='FACES')
    bm.to_mesh(mesh);bm.free();mesh.update()
    result={'method':'Delete source-derived triangles entirely below z=0.014 when original UV-centroid mean RGB is below 0.18 or their XY centroid is more than 0.012 from the actual foundation vertices at z=0.014..0.04. This removes detached colored floor remnants as well as the dark sheet; no new faces added','deletedTriangles':len(remove),'originalTriangles':len(face_z),'foundationSampleVertices':len(base_points)}
    print('SOURCE_GROUND_CLEANUP',json.dumps(result),flush=True);return result
def emission_material(original,mode):
    copied=original.copy();nodes=copied.node_tree.nodes;links=copied.node_tree.links
    bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
    emit=nodes.new('ShaderNodeEmission')
    if mode=='hit':emit.inputs['Color'].default_value=(1,1,1,1)
    elif mode=='base':
        socket=bsdf.inputs['Base Color']
        if socket.is_linked:links.new(socket.links[0].from_socket,emit.inputs['Color'])
        else:emit.inputs['Color'].default_value=socket.default_value
    elif mode=='orm':
        combine=nodes.new('ShaderNodeCombineColor');combine.mode='RGB';combine.inputs[0].default_value=1
        for index,name in ((1,'Roughness'),(2,'Metallic')):
            socket=bsdf.inputs[name]
            if socket.is_linked:links.new(socket.links[0].from_socket,combine.inputs[index])
            else:combine.inputs[index].default_value=socket.default_value
        links.new(combine.outputs[0],emit.inputs['Color'])
    links.new(emit.outputs[0],out.inputs['Surface']);return copied
def sample_hit_coverage(mesh,image):
    uv=mesh.uv_layers.active.data;pixels=list(image.pixels);w,h=image.size;hit=area=0
    for face in mesh.polygons:
        points=[uv[i].uv for i in face.loop_indices]
        if len(points)!=3:continue
        a,b,c=points;size=abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*.5
        center=(a+b+c)/3;x=max(0,min(w-1,int(center.x*w)));y=max(0,min(h-1,int(center.y*h)))
        area+=size;hit+=size*(pixels[(y*w+x)*4]>.1)
    return hit/max(area,1e-9)
def bake(source,low,args):
    material=bpy.data.materials.new(args.name+'__pbr');material.use_nodes=True
    low.data.materials.clear();low.data.materials.append(material)
    nodes=material.node_tree.nodes;links=material.node_tree.links
    originals=list(source.data.materials);images={};coverage=None
    for mode in (('hit','base','orm') if args.lod=='far' else ('hit','base','orm','normal')):
        size=max(128,args.texture_size//2) if mode=='orm' else args.texture_size
        image=bpy.data.images.new(args.name+'__'+mode,width=size,height=size,alpha=False)
        image.colorspace_settings.name='sRGB' if mode=='base' else 'Non-Color'
        image.generated_color=(0,0,0,1)
        texture=nodes.new('ShaderNodeTexImage');texture.image=image;texture.name='Baked_'+mode
        for node in nodes:node.select=False
        texture.select=True;nodes.active=texture
        temporary=[]
        if mode!='normal':
            for index,original in enumerate(originals):
                copied=emission_material(original,mode);source.data.materials[index]=copied;temporary.append(copied)
        scene=set_cpu();scene.render.bake.use_selected_to_active=True
        scene.render.bake.use_cage=True;scene.render.bake.cage_extrusion=args.cage
        scene.render.bake.max_ray_distance=args.ray_distance;scene.render.bake.margin=2
        scene.render.bake.use_clear=True;scene.render.bake.normal_space='TANGENT'
        p.select_only([source,low]);bpy.context.view_layer.objects.active=low
        print('BAKE_START',mode,flush=True)
        bpy.ops.object.bake(type='NORMAL' if mode=='normal' else 'EMIT')
        for index,original in enumerate(originals):source.data.materials[index]=original
        for copied in temporary:bpy.data.materials.remove(copied)
        if mode=='hit':
            coverage=sample_hit_coverage(low.data,image);print('BAKE_HIT_COVERAGE',coverage,flush=True)
            nodes.remove(texture);bpy.data.images.remove(image)
            if coverage<.96:raise RuntimeError(f'Baking misses too much source surface: {coverage:.4f}')
        else:image.pack();images[mode]=image
    bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    links.new(nodes['Baked_base'].outputs['Color'],bsdf.inputs['Base Color'])
    separate=nodes.new('ShaderNodeSeparateColor');links.new(nodes['Baked_orm'].outputs['Color'],separate.inputs[0])
    links.new(separate.outputs['Green'],bsdf.inputs['Roughness']);links.new(separate.outputs['Blue'],bsdf.inputs['Metallic'])
    if 'normal' in images:
        normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=1
        links.new(nodes['Baked_normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bsdf.inputs['Normal'])
    return {'hitCoverageAreaWeighted':coverage,'cageExtrusion':args.cage,'maxRayDistance':args.ray_distance,
        'maps':[{'role':key,'size':list(image.size)} for key,image in images.items()],
        'method':'Selected-to-active CPU bake from original neural source onto a source-derived voxel surface reduced without inherited UV constraints; no authored substitute building'},images
def render(path,args,labels,raw=False):
    clear_scene()
    if raw:
        source,_=p.import_body(path);p.upright(source,args)
    else:bpy.ops.import_scene.gltf(filepath=str(path))
    scene=set_cpu();scene.frame_set(round(getattr(args,'animation_time_seconds',0)*scene.render.fps));scene.cycles.samples=16;scene.render.resolution_x=512;scene.render.resolution_y=512
    scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG'
    scene.view_settings.view_transform='AgX'
    meshes=[o for o in scene.objects if o.type=='MESH'];lo,hi=p.bounds(meshes,world=True)
    target=Vector((0,0,(hi.z+lo.z)/2));extent=max(args.height,args.footprint)
    world=bpy.data.worlds.new('Neutral QA studio');world.use_nodes=True
    world.node_tree.nodes['Background'].inputs[0].default_value=(.64,.72,.82,1)
    world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
    for loc,energy,size in (((2,-3,4),220,2),((-3,-1,2),120,2),((1,3,3),180,2)):
        bpy.ops.object.light_add(type='AREA',location=Vector(loc)*extent);light=bpy.context.object
        light.data.energy=energy*extent**2;light.data.size=size*extent
        light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=extent*1.4;scene.camera=camera
    directory=getattr(args,'render_directory',ART/('renders-far' if args.lod=='far' else 'renders')/args.region/args.asset);directory.mkdir(parents=True,exist_ok=True)
    positions={'front':(0,-4,.9),'right':(4,0,.9),'back':(0,4,.9),'left':(-4,0,.9),'iso':(2.8,-4,2.6)};views=[]
    for label in labels:
        camera.location=Vector(positions[label])*extent
        camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
        output=directory/(getattr(args,'render_prefix','raw-' if raw else 'lod-')+label+'.png');scene.render.filepath=str(output)
        bpy.ops.render.render(write_still=True);views.append(str(output))
    return {'views':views,'boundsBlender':{'min':list(lo),'max':list(hi)},'triangles':sum(p.triangles(o) for o in meshes),
        'textureSizes':[{'name':i.name,'size':list(i.size)} for i in bpy.data.images if i.type=='IMAGE' and i.size[0]],'renderer':'Cycles CPU','threads':4,'samples':16}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--state',required=True,type=Path)
    parser.add_argument('--triangles',type=int,default=20000);parser.add_argument('--texture-size',type=int,default=1024)
    parser.add_argument('--cage',type=float,default=.02);parser.add_argument('--ray-distance',type=float,default=.06)
    parser.add_argument('--voxel-size',type=float,default=.003)
    parser.add_argument('--lod',choices=('near','far'),default='near')
    parser.add_argument('--remove-dark-ground',action='store_true')
    parser.add_argument('--surface',type=Path,help='Hash-verified source-derived far simplification, never authored geometry')
    parser.add_argument('--repaired-source',type=Path,help='Explicit locally repaired neural source; original raw remains immutable')
    parser.add_argument('--repair-report',type=Path,help='Source-linked repair receipt identifying changed or added local surfaces')
    parser.add_argument('--output-root',type=Path,help='Isolated diagnostic candidate directory; never overwrites the ordinary queue')
    parser.add_argument('--nearest-texture',action='store_true',help='Transfer the original PBR from the nearest source triangle, retaining geometry normals')
    parser.add_argument('--geometry-only',action='store_true',help='Explicit isolated near intermediate for a captured native field; no temporary UV, bake, renders or visual promotion')
    parser.add_argument('--uv-margin',type=float,default=.00002)
    parser.add_argument('--uv-margin-method',choices=('SCALED','ADD','FRACTION'),default='SCALED')
    parser.add_argument('--uv-angle',type=float,default=89)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);state=json.loads(args.state.read_text('utf-8'))
    if args.output_root and not args.repaired_source:
        hold_path=args.output_root/'processing-hold.json'
        if hold_path.exists():
            hold=json.loads(hold_path.read_text('utf8'))
            if hold.get('status')=='awaiting_recorded_source_repair' and hold.get('sourceSha256')==state['rawGLB']['sha256']:
                hold.update(admission='held_before_source_import',checkedAt=now())
                write(hold_path,hold);print('DERIVATIVE_SOURCE_HOLD '+json.dumps(hold),flush=True)
                raise SystemExit(75)
    sys.path.insert(0,str(Path(__file__).parent))
    from native_memory_reservation import fine_cpu_reservation
    global FINE_MEMORY_RESERVATION
    with fine_cpu_reservation(ART,sys.argv) as FINE_MEMORY_RESERVATION:process(args,state)

def process(args,state):
    args.region=state['region'];args.asset=state['asset'];args.name=args.region+'__'+args.asset
    args.height=args.footprint=1.0;args.pitch=args.roll=0;args.yaw=180;args.no_auto_upright=False;args.max_upright=18
    raw=Path(state['rawGLB']['path']);inference=Path(state['inferenceReport']['path']);reference=Path(state['reference']['path'])
    if p.sha256(raw)!=state['rawGLB']['sha256']:raise RuntimeError('Raw hash changed')
    for evidence in (state['inferenceReport'],state['reference']):
        if p.sha256(Path(evidence['path']))!=evidence['sha256']:raise RuntimeError('Source provenance hash changed: '+evidence['path'])
    completed=json.loads(inference.read_text('utf-8'))
    if completed['status']!='generated_unrigged_part_candidate' or completed['view_count']!=3 or completed['pipeline_config']!='pipeline_mv.json':raise ValueError('Requires actual completed native three-view source')
    if args.geometry_only:
        if args.lod!='near' or not args.output_root or args.repaired_source or args.surface or state['asset'] in ('builders_guild','chance_wheel','lighthouse','windmill'):raise ValueError('Geometry-only currently requires an isolated ordinary near source, without component, source-repair or preserved-surface processing')
        capture=completed.get('native_mobile_export_receipt')
        if not capture or p.sha256(Path(capture['path']))!=capture['sha256']:raise ValueError('Geometry-only requires the exact captured native field receipt')
        field=json.loads(Path(capture['path']).read_text('utf8'))
        if field.get('status') not in ('frozen_field_ready_for_optional_export','exported_pending_visual_review') or field['rawGLB']['sha256']!=state['rawGLB']['sha256']:raise ValueError('Geometry-only requires a usable field from this same raw')
    repair=None
    if args.repaired_source or args.repair_report:
        if args.lod!='near' or not args.repaired_source or not args.repair_report:raise ValueError('Explicit repaired source and receipt must be supplied together for near processing')
        repair=json.loads(args.repair_report.read_text('utf-8'))
        if repair['source']['sha256']!=state['rawGLB']['sha256'] or repair['nativeOutput']['sha256']!=p.sha256(args.repaired_source):raise RuntimeError('Repair receipt/source hash mismatch')
    output_root=args.output_root.resolve() if args.output_root else ART/('candidates-far' if args.lod=='far' else 'candidates')
    out=output_root/args.region/(args.asset+'.glb');out.parent.mkdir(parents=True,exist_ok=True)
    if args.output_root:args.render_directory=output_root/'renders'/args.region/args.asset
    if out.exists() and out.with_suffix('.json').exists():
        archive=ART/'candidate-history'/args.region/args.asset/p.sha256(out);archive.mkdir(parents=True,exist_ok=True)
        shutil.copy2(out,archive/out.name);shutil.copy2(out.with_suffix('.json'),archive/(args.asset+'.json'))
    snapshot=ART/'reports/tool-snapshots'/(hashlib.sha256(EXECUTED_TOOL_SOURCE).hexdigest()+'-process_lod.py');snapshot.parent.mkdir(parents=True,exist_ok=True)
    if not snapshot.exists():snapshot.write_bytes(EXECUTED_TOOL_SOURCE)
    report_path=out.with_suffix('.json');report={'status':'processing','createdAt':now(),'region':args.region,'asset':args.asset,
        'source':{'rawGLB':p.file_evidence(raw)},'inferenceReport':p.file_evidence(inference),'reference':p.file_evidence(reference),
        'processingTool':p.file_evidence(snapshot),'assumedCameras':True,'cameraCalibration':'assumed_standard_orbit_not_measured',
        'nativePipeline':'Pixal3DMVImageTo3DPipeline.run_mv','nativeResolution':1024,'seed':completed['seed'],
        'geometryOrigin':'Only the actual neural source reduced and rebaked; no authored substitute geometry or manually constructed surfaces',
        'orientation':{'up':'Y','front':'+Z','groundY':0,'maxEdge':1},'requestedTriangles':args.triangles,
        'limitations':['Assumed camera reference reconstruction, not exact measured architecture','Final candidate requires actual rendered visual approval'],
        'animation':None,'processingComplete':False,'lod':args.lod,'processingRevision':state.get('processingRevision',0)}
    if args.geometry_only:report['geometryOnlyFieldReceipt']=capture
    if globals().get('FINE_MEMORY_RESERVATION'):
        guard=Path(__file__).with_name('native_memory_reservation.py')
        guard_snapshot=ART/'reports/tool-snapshots'/(p.sha256(guard)+'-'+guard.name)
        if not guard_snapshot.exists():shutil.copy2(guard,guard_snapshot)
        report['memoryReservation']={**FINE_MEMORY_RESERVATION,'tool':p.file_evidence(guard_snapshot)}
    write(report_path,report)
    if repair:
        report['localSurfaceRepair']={'source':p.file_evidence(args.repaired_source),'receipt':p.file_evidence(args.repair_report),'method':repair['method'],'newTriangles':repair['newTriangles'],'newVertices':repair['newVertices'],'originalVerticesMoved':repair['originalVerticesMoved'],'originalTrianglesDeleted':repair['originalTrianglesDeleted'],'regions':repair['repairs']}
        report['geometryOrigin']='Actual native three-view neural building with explicitly recorded bounded local repairs; localSurfaceRepair.method and face counts disclose whether these include boundary patches or a small mechanical connector. Followed by source-derived remeshing and texture transfer. No replacement building.'
    clear_scene()
    if args.lod=='far':
        approved=json.loads((ART/'approved-assets.json').read_text('utf-8'))['assets'][args.region+'/'+args.asset]
        near=Path(approved['candidate']['path']);near=near if near.is_absolute() else ROOT/near
        near_report=Path(approved['processingReport']['path']);near_report=near_report if near_report.is_absolute() else ROOT/near_report
        near_proof=json.loads(near_report.read_text('utf-8'))
        if p.sha256(near)!=approved['candidate']['sha256'] or near_proof['source']['rawGLB']['sha256']!=state['rawGLB']['sha256']:raise RuntimeError('Far source must be the exact approved near derivative of the same native source')
        # Frozen approval evidence can normalize paths without changing an
        # inference. Far derivatives inherit that exact reviewed receipt.
        report['inferenceReport']=near_proof['inferenceReport']
        report['reference']=near_proof['reference']
        source,_=p.import_body(near)
        # Its Y-up orientation was already verified; never rotate/normalize twice.
        report['derivedFromNear']=p.file_evidence(near)
        report['derivedFromNearReport']=p.file_evidence(near_report)
        args.voxel_size=0
    else:
        source,_=p.import_body(args.repaired_source if repair else raw);p.upright(source,args)
    source.name=args.name+'__raw_source'
    original_source_triangles=p.triangles(source)
    if args.remove_dark_ground:report['sourceArtifactCleanup']=remove_dark_ground(source)
    low=source.copy();low.data=source.data.copy();bpy.context.collection.objects.link(low);low.name=args.name+'__neural_lod'
    preserved_surface=None
    if args.surface:
        import numpy as np
        preserved_surface=json.loads(args.surface.with_suffix('.json').read_text('utf-8'))
        if args.lod=='far':
            if preserved_surface['source']['sha256']!=report['derivedFromNear']['sha256']:raise RuntimeError('Far surface does not match the approved near source')
        else:
            normalized_path=Path(preserved_surface['source']['path'])
            origin=json.loads(normalized_path.with_suffix('.source.json').read_text('utf-8'))
            if origin['sourceRaw']['sha256']!=state['rawGLB']['sha256'] or origin['input']['sha256']!=p.sha256(args.repaired_source if repair else raw):raise RuntimeError('Preserved near surface native/repair source mismatch')
            if origin['normalizedGeometry']['sha256']!=preserved_surface['source']['sha256'] or p.sha256(normalized_path)!=preserved_surface['source']['sha256']:raise RuntimeError('Normalized source bytes changed')
            report['preservedSurfaceOrigin']={**origin,'receipt':p.file_evidence(normalized_path.with_suffix('.source.json'))}
            args.voxel_size=0
        if preserved_surface.get('outputSha256') and p.sha256(args.surface)!=preserved_surface['outputSha256']:raise RuntimeError('Far surface bytes changed')
        arrays=np.load(args.surface);coordinates=arrays['vertices'][:,[0,2,1]].copy();coordinates[:,1]*=-1
        mesh=bpy.data.meshes.new(args.name+'__preserved_far_surface');mesh.from_pydata(coordinates.tolist(),[],arrays['faces'].tolist());mesh.update();low.data=mesh
        report['farSimplification' if args.lod=='far' else 'nearSimplification']=preserved_surface
    while low.data.uv_layers:low.data.uv_layers.remove(low.data.uv_layers[0])
    low.data.materials.clear();p.select_only([low]);source.select_set(False)
    bm=bmesh.new();bm.from_mesh(low.data);before=len(bm.verts)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000002)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(low.data);bm.free();low.data.validate(clean_customdata=False)
    welded=p.triangles(low)
    if args.voxel_size:
        low.data.remesh_voxel_size=args.voxel_size;low.data.remesh_voxel_adaptivity=0
        bpy.ops.object.voxel_remesh()
    source_triangles=original_source_triangles;before_reduction=p.triangles(low)
    if not preserved_surface:
        modifier=low.modifiers.new('Source geometry reduction without inherited UV constraints','DECIMATE')
        modifier.ratio=min(1,args.triangles/before_reduction);modifier.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    low.data.validate(clean_customdata=False);low.data.update()
    p.select_only([low]);bpy.ops.object.shade_smooth_by_angle(angle=math.radians(55))
    if args.geometry_only:
        export_geometry_only(args,state,report,out,low,source_triangles,welded,before_reduction)
        return
    low.data.uv_layers.new(name='MobileBakedUV');low.data.uv_layers.active_index=0;low.data.uv_layers[0].active_render=True
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(args.uv_angle),island_margin=args.uv_margin,margin_method=args.uv_margin_method)
    bpy.ops.object.mode_set(mode='OBJECT');coverage=uv_area(low)
    print('LOD_GEOMETRY',json.dumps({'source':source_triangles,'reduced':p.triangles(low),'uvCoverage':coverage}),flush=True)
    if coverage<.30:raise RuntimeError('Atlas coverage too low: '+str(coverage))
    report['derivation']={'rawTriangles':source_triangles,'weldedTriangles':welded,'remeshedTriangles':before_reduction,'voxelSize':args.voxel_size,'finalTriangles':p.triangles(low),'atlasArea':coverage,
        'singleReductionPass':True,'inheritedUVRemovedBeforeReduction':True,'sourceMaterialsUntouched':True}
    report['derivation']['uvUnwrap']={'angleDegrees':args.uv_angle,'islandMargin':args.uv_margin,'marginMethod':args.uv_margin_method,'nominalMarginPixels':args.uv_margin*args.texture_size if args.uv_margin_method=='FRACTION' else None}
    if repair:
        report['derivation']['repairedSourceTriangles']=source_triangles
        report['derivation']['rawTriangles']=source_triangles-repair['newTriangles']+repair['originalTrianglesDeleted']
    if args.nearest_texture:
        sys.path.insert(0,str(Path(__file__).parent));from bake_nearest_surface import bake as nearest_bake
        report['bake'],images=nearest_bake(source,low,args)
        helper=Path(__file__).parent/'bake_nearest_surface.py';helper_snapshot=ART/'reports/tool-snapshots'/(p.sha256(helper)+'-'+helper.name)
        if not helper_snapshot.exists():shutil.copy2(helper,helper_snapshot)
        report['textureTransferTool']=p.file_evidence(helper_snapshot)
    else:report['bake'],images=bake(source,low,args)
    if repair:report['bake']['repairSourceNote']='Texture transfer uses the explicitly repaired neural source, retaining original PBR and locally interpolated same-wall UV. Repair receipt and unchanged original inference source are preserved separately.'
    if args.lod=='far':
        report['farShading']={'normals':'actual_geometry_only','baseColorSize':args.texture_size,'ormSize':max(128,args.texture_size//2),'reason':'Actual diagnostic isolated second-generation tangent-space normal rebake as the cause of black dormers/chimneys. Keep the verified geometric normals and original-near-derived color/ORM, omit normalTexture.'}
        report['derivation']['nearTriangles']=original_source_triangles
        original_raw_count=near_proof.get('derivation',{}).get('rawTriangles')
        if original_raw_count is None:
            # A native-field near receipt records its geometry surface separately;
            # do not mistake its low replay face count for the original raw count.
            original_raw_count=p.inspect_glb(raw)['triangles']
            report['derivation']['rawTriangleCountEvidence']='Actual unchanged original raw GLB index count; native-field near report does not repeat a rawTriangles field.'
        report['derivation']['rawTriangles']=original_raw_count
        report['geometryOrigin']='Exact approved neural-derived near geometry, including any explicitly disclosed bounded local repairs, simplified for far use. No substitute building or newly authored geometry in this far stage.'
        report['nearSourceGeometryOrigin']=near_proof.get('geometryOrigin')
        report['bake']['method']=('CPU closest-original-surface float64 PBR transfer' if args.nearest_texture else 'CPU selected-to-active PBR bake')+' from the exact approved near mesh/materials onto its source-derived far surface. No further voxelization or authored geometry.'
    root=bpy.data.objects.new(args.name,None);bpy.context.collection.objects.link(root);low.parent=root
    root['sourceSha256']=state['rawGLB']['sha256'];root['nativeMV']=True;root['geometryOrigin']=report['geometryOrigin'];root['asset']=args.asset;root['region']=args.region
    blend=(output_root/'blender' if args.output_root else ART/('blender-far' if args.lod=='far' else 'blender'))/args.region/(args.asset+'.blend');blend.parent.mkdir(parents=True,exist_ok=True)
    source.hide_render=True;source.hide_set(True);p.select_only([root,low]);bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,
        export_animations=False,export_image_format='JPEG',export_jpeg_quality=92,export_extras=True)
    report['quantization']=quantize_mobile_attributes(out);report['processedCandidate']=p.file_evidence(out)
    report['glbValidation']=p.inspect_glb(out);report['triangles']=report['glbValidation']['triangles']
    report['status']='exported_pending_visual_review';write(report_path,report)
    report['renderedCandidate']=render(out,args,('front','right','back','left','iso'))
    # Keep front/iso first for the stable seven-image comparison sheet, while
    # reusing this same raw import to expose hidden-side source defects early.
    report['renderedSource']=render(raw,args,('front','iso','right','back','left'),raw=True)
    if repair:
        args.render_prefix='repaired-source-'
        report['renderedRepairedSource']=render(args.repaired_source,args,('front','back','iso'),raw=True)
        del args.render_prefix
    bb=report['renderedCandidate']['boundsBlender'];lo,hi=bb['min'],bb['max']
    report['bounds']={'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]],'coordinateSystem':'GLTF Y-up; +Z front'}
    report['textureSizes']=report['renderedCandidate']['textureSizes']
    report['rawSourceUnchanged']=p.sha256(raw)==state['rawGLB']['sha256'];report['processingComplete']=True;report['completedAt']=now();write(report_path,report)
    print('LOD_CANDIDATE',json.dumps({'path':str(out),'triangles':report['triangles'],'bytes':out.stat().st_size,'report':str(report_path)}),flush=True)
if __name__=='__main__':main()

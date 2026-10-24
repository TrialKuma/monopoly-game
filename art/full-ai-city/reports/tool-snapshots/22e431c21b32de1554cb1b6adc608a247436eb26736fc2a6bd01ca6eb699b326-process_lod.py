"""Source-derived UV-free reduction and original-source PBR bake, CPU only.

No replacement or manually modeled building geometry is introduced. Removing UV
attributes from only the derivative lets collapse operate on welded geometry;
a fresh atlas is then baked from the untouched neural high-resolution surface.
"""
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime,timezone
import argparse,json,sys,math,hashlib,shutil
import bpy,bmesh
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
sys.path.insert(0,str(ROOT/'art/harbor/tools'))
import process_generated_model as p
from quantize_gltf_attributes import quantize_mobile_attributes
def now():return datetime.now(timezone.utc).isoformat()
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
def clear_scene():
    for obj in list(bpy.data.objects):bpy.data.objects.remove(obj,do_unlink=True)
    for group in (bpy.data.meshes,bpy.data.materials,bpy.data.images):
        for data in list(group):
            if data.users==0:group.remove(data)
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
    for mode in ('hit','base','orm','normal'):
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
    scene=set_cpu();scene.cycles.samples=16;scene.render.resolution_x=512;scene.render.resolution_y=512
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
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);state=json.loads(args.state.read_text('utf-8'))
    args.region=state['region'];args.asset=state['asset'];args.name=args.region+'__'+args.asset
    args.height=args.footprint=1.0;args.pitch=args.roll=0;args.yaw=180;args.no_auto_upright=False;args.max_upright=18
    raw=Path(state['rawGLB']['path']);inference=Path(state['inferenceReport']['path']);reference=Path(state['reference']['path'])
    if p.sha256(raw)!=state['rawGLB']['sha256']:raise RuntimeError('Raw hash changed')
    for evidence in (state['inferenceReport'],state['reference']):
        if p.sha256(Path(evidence['path']))!=evidence['sha256']:raise RuntimeError('Source provenance hash changed: '+evidence['path'])
    completed=json.loads(inference.read_text('utf-8'))
    if completed['status']!='generated_unrigged_part_candidate' or completed['view_count']!=3 or completed['pipeline_config']!='pipeline_mv.json':raise ValueError('Requires actual completed native three-view source')
    out=ART/('candidates-far' if args.lod=='far' else 'candidates')/args.region/(args.asset+'.glb');out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists() and out.with_suffix('.json').exists():
        archive=ART/'candidate-history'/args.region/args.asset/p.sha256(out);archive.mkdir(parents=True,exist_ok=True)
        shutil.copy2(out,archive/out.name);shutil.copy2(out.with_suffix('.json'),archive/(args.asset+'.json'))
    snapshot=ART/'reports/tool-snapshots'/(p.sha256(Path(__file__))+'-process_lod.py');snapshot.parent.mkdir(parents=True,exist_ok=True)
    if not snapshot.exists():shutil.copyfile(__file__,snapshot)
    report_path=out.with_suffix('.json');report={'status':'processing','createdAt':now(),'region':args.region,'asset':args.asset,
        'source':{'rawGLB':p.file_evidence(raw)},'inferenceReport':p.file_evidence(inference),'reference':p.file_evidence(reference),
        'processingTool':p.file_evidence(snapshot),'assumedCameras':True,'cameraCalibration':'assumed_standard_orbit_not_measured',
        'nativePipeline':'Pixal3DMVImageTo3DPipeline.run_mv','nativeResolution':1024,'seed':completed['seed'],
        'geometryOrigin':'Only the actual neural source reduced and rebaked; no authored substitute geometry or manually constructed surfaces',
        'orientation':{'up':'Y','front':'+Z','groundY':0,'maxEdge':1},'requestedTriangles':args.triangles,
        'limitations':['Assumed camera reference reconstruction, not exact measured architecture','Final candidate requires actual rendered visual approval'],
        'animation':None,'processingComplete':False,'lod':args.lod,'processingRevision':state.get('processingRevision',0)}
    write(report_path,report)
    clear_scene();source,_=p.import_body(raw);p.upright(source,args);source.name=args.name+'__raw_source'
    original_source_triangles=p.triangles(source)
    if args.remove_dark_ground:report['sourceArtifactCleanup']=remove_dark_ground(source)
    low=source.copy();low.data=source.data.copy();bpy.context.collection.objects.link(low);low.name=args.name+'__neural_lod'
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
    modifier=low.modifiers.new('Source geometry reduction without inherited UV constraints','DECIMATE')
    modifier.ratio=min(1,args.triangles/before_reduction);modifier.use_collapse_triangulate=True
    bpy.ops.object.modifier_apply(modifier=modifier.name);low.data.validate(clean_customdata=False);low.data.update()
    p.select_only([low]);bpy.ops.object.shade_smooth_by_angle(angle=math.radians(55))
    low.data.uv_layers.new(name='MobileBakedUV');low.data.uv_layers.active_index=0;low.data.uv_layers[0].active_render=True
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(89),island_margin=.00002)
    bpy.ops.object.mode_set(mode='OBJECT');coverage=uv_area(low)
    print('LOD_GEOMETRY',json.dumps({'source':source_triangles,'reduced':p.triangles(low),'uvCoverage':coverage}),flush=True)
    if coverage<.30:raise RuntimeError('Atlas coverage too low: '+str(coverage))
    report['derivation']={'rawTriangles':source_triangles,'weldedTriangles':welded,'remeshedTriangles':before_reduction,'voxelSize':args.voxel_size,'finalTriangles':p.triangles(low),'atlasArea':coverage,
        'singleReductionPass':True,'inheritedUVRemovedBeforeReduction':True,'sourceMaterialsUntouched':True}
    report['bake'],images=bake(source,low,args)
    root=bpy.data.objects.new(args.name,None);bpy.context.collection.objects.link(root);low.parent=root
    root['sourceSha256']=state['rawGLB']['sha256'];root['nativeMV']=True;root['geometryOrigin']=report['geometryOrigin'];root['asset']=args.asset;root['region']=args.region
    blend=ART/('blender-far' if args.lod=='far' else 'blender')/args.region/(args.asset+'.blend');blend.parent.mkdir(parents=True,exist_ok=True)
    source.hide_render=True;source.hide_set(True);p.select_only([root,low]);bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_yup=True,
        export_animations=False,export_image_format='JPEG',export_jpeg_quality=92,export_extras=True)
    report['quantization']=quantize_mobile_attributes(out);report['processedCandidate']=p.file_evidence(out)
    report['glbValidation']=p.inspect_glb(out);report['triangles']=report['glbValidation']['triangles']
    report['status']='exported_pending_visual_review';write(report_path,report)
    report['renderedCandidate']=render(out,args,('front','right','back','left','iso'))
    report['renderedSource']=render(raw,args,('front','iso'),raw=True)
    bb=report['renderedCandidate']['boundsBlender'];lo,hi=bb['min'],bb['max']
    report['bounds']={'min':[lo[0],lo[2],-hi[1]],'max':[hi[0],hi[2],-lo[1]],'coordinateSystem':'GLTF Y-up; +Z front'}
    report['textureSizes']=report['renderedCandidate']['textureSizes']
    report['rawSourceUnchanged']=p.sha256(raw)==state['rawGLB']['sha256'];report['processingComplete']=True;report['completedAt']=now();write(report_path,report)
    print('LOD_CANDIDATE',json.dumps({'path':str(out),'triangles':report['triangles'],'bytes':out.stat().st_size,'report':str(report_path)}),flush=True)
if __name__=='__main__':main()

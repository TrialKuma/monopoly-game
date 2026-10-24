"""Author the regional city from existing design sheets. CPU only; no AI calls.

blender -b -t 3 --python art/blender-city/build.py -- --region expansion
Use --assets villa_1,villa_2 for a bounded rebuild; --draft omits the AO bake.
"""
import argparse, hashlib, importlib.util, json, math, sys, time
from pathlib import Path
import bpy
from mathutils import Vector, Matrix

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
CAT=json.loads((HERE/'reference-catalog.json').read_text(encoding='utf-8'))
SOURCE='authored_blender_reference_rebuild'
PUBLIC=('civic_hall','vault_bank','builders_guild','card_pavilion','chance_wheel','teleport_gate','rush_station','junction_hub')
FAR=('villa_3','shop_2','hotel_2','tower_2','junction_hub')

def load_module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

def digest(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def save_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
def reset():bpy.ops.wm.read_factory_settings(use_empty=True)
def descendants(root):return [root,*root.children_recursive]
def meshes(root):return [o for o in descendants(root) if o.type=='MESH']
def bounds(root):
    bpy.context.view_layer.update();points=[o.matrix_world@Vector(c) for o in meshes(root) for c in o.bound_box]
    lo=Vector(tuple(min(p[k] for p in points) for k in range(3)));hi=Vector(tuple(max(p[k] for p in points) for k in range(3)));return lo,hi
def triangles(root):return sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes(root))
def mat_category(mat):
    name=mat.name.lower().split('/')[-1].strip()
    if any(k in name for k in ('glass','glazing','warm light','lantern glass','window pane')):return 'warm window glass'
    if any(k in name for k in ('water','leaf','leaves','foliage','flower','soil','pool')):return 'water foliage'
    return 'solid'

def atlas(root,folder,size=1024,draft=False):
    """Exact face colours plus a local occlusion/roughness atlas, 2-3 materials.

    Colour is stored in COLOR_0, so narrow window bars never depend on the atlas
    resolution. No directional lighting or generated texture is baked into it.
    """
    objs=meshes(root);mats=sorted({m for o in objs for m in o.data.materials if m},key=lambda m:m.name)
    # Make separate instances per asset so later operations cannot change neighbours.
    copies={m:m.copy() for m in mats}
    for o in objs:
        for i,m in enumerate(o.data.materials):o.data.materials[i]=copies[m]
    mats=list(copies.values());cats={m:mat_category(m) for m in mats}
    for o in objs:
        if not o.data.color_attributes.get('Color'):
            color=o.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
        else:color=o.data.color_attributes['Color']
        o.data.color_attributes.active_color=color
        o.data.color_attributes.render_color_index=o.data.color_attributes.find('Color')
        for p in o.data.polygons:
            m=o.data.materials[p.material_index];bsdf=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
            rgba=tuple(bsdf.inputs['Base Color'].default_value) if bsdf else tuple(m.diffuse_color)
            for loop in p.loop_indices:color.data[loop].color=(*rgba[:3],1)
    image=None
    if not draft:
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:o.select_set(True)
        bpy.context.view_layer.objects.active=objs[0]
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.003,area_weight=.5,correct_aspect=True,scale_to_bounds=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        image=bpy.data.images.new(root.name+' ORM',width=size,height=size,alpha=False)
        image.colorspace_settings.name='Non-Color';image.generated_color=(1,.65,0,1)
        lo,hi=bounds(root);distance=(hi-lo).z*.055
        for m in mats:
            nodes=m.node_tree.nodes;links=m.node_tree.links;bsdf=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
            rough=float(bsdf.inputs['Roughness'].default_value) if bsdf else .65
            metallic=float(bsdf.inputs['Metallic'].default_value) if bsdf else 0
            out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
            ao=nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=distance;ao.samples=32;ao.only_local=False
            rgb=nodes.new('ShaderNodeCombineColor');rgb.mode='RGB';links.new(ao.outputs['AO'],rgb.inputs['Red']);rgb.inputs['Green'].default_value=rough;rgb.inputs['Blue'].default_value=metallic
            emit=nodes.new('ShaderNodeEmission');links.new(rgb.outputs[0],emit.inputs['Color']);links.new(emit.outputs[0],out.inputs['Surface'])
            tex=nodes.new('ShaderNodeTexImage');tex.image=image;nodes.active=tex
        scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
        scene.render.threads_mode='FIXED';scene.render.threads=3
        scene.render.bake.use_clear=True
        bpy.ops.object.bake(type='EMIT',use_clear=True,margin=4)
        image.filepath_raw=str(folder/'surface-orm.png');image.file_format='PNG';image.save();image.pack()
    shared={}
    for category in sorted(set(cats.values())):
        m=bpy.data.materials.new(root.name+' / '+category);m.use_nodes=True;m.diffuse_color=(1,1,1,1)
        nodes=m.node_tree.nodes;links=m.node_tree.links;p=nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(1,1,1,1);p.inputs['Roughness'].default_value=.65
        # Explicit vertex colour node supports both .blend review and glTF COLOR_0.
        v=nodes.new('ShaderNodeVertexColor');v.layer_name='Color';links.new(v.outputs['Color'],p.inputs['Base Color'])
        if category=='warm window glass':
            p.inputs['Emission Color'].default_value=(1,.55,.18,1);p.inputs['Emission Strength'].default_value=.035
        if image:
            tex=nodes.new('ShaderNodeTexImage');tex.image=image
            sep=nodes.new('ShaderNodeSeparateColor');sep.mode='RGB';links.new(tex.outputs['Color'],sep.inputs[0]);links.new(sep.outputs['Green'],p.inputs['Roughness']);links.new(sep.outputs['Blue'],p.inputs['Metallic'])
            group=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree');group.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat').default_value=1
            settings=nodes.new('ShaderNodeGroup');settings.node_tree=group;links.new(sep.outputs['Red'],settings.inputs['Occlusion'])
        shared[category]=m
    for o in objs:
        categories=[cats[o.data.materials[p.material_index]] for p in o.data.polygons]
        slots=list(shared);o.data.materials.clear()
        for key in slots:o.data.materials.append(shared[key])
        for p,category in zip(o.data.polygons,categories):p.material_index=slots.index(category)
    return {'materials':len(shared),'textureSize':0 if draft else size,'vertexColours':True,'aoSamples':32,'directionalLightingBaked':False}

def fit(root,asset):
    lo,hi=bounds(root);size=hi-lo
    if asset in ('harbor_lighthouse','alpine_windmill'):envelope=(2.8,2.8,3.7)
    elif asset in PUBLIC:envelope=(1.04,1.04,1.40)
    else:
        family,level=asset.rsplit('_',1);level=int(level)
        envelope=(2.50,1.02,[1.10,1.65,2.25][level-1]) if family in ('skyscraper','finance','onsen') else (.99,.99,[.78,1.16,1.60][level-1])
    factor=min(a/b for a,b in zip(envelope,size))
    correction_file=HERE/'placement-corrections.json'
    if correction_file.exists():
        correction=json.loads(correction_file.read_text('utf-8')).get('regions',{}).get(root.get('region'),{}).get(asset)
        if correction:
            factor*=float(correction['uniformScale'])
            root['placementReview']=correction
    center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))
    transform=Matrix.Diagonal((factor,factor,factor,1))@Matrix.Translation(-center)
    # Preserve identity roots and meaningful movable origins, including keyframes.
    for o in root.children:
        o.matrix_basis=transform@o.matrix_basis
    bpy.context.view_layer.update()
    for o in meshes(root):
        if o.parent==root:
            o.data.transform(o.matrix_basis);o.matrix_basis=Matrix.Identity(4)
    return factor

def export_glb(root,path,animations=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in descendants(root):o.select_set(True)
    bpy.context.view_layer.objects.active=root
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_animations=animations,export_cameras=False,export_lights=False,export_extras=True,export_vertex_color='ACTIVE',export_all_vertex_colors=False)

def render_model(path,output,resolution=384):
    reset();bpy.ops.import_scene.gltf(filepath=str(path));scene=bpy.context.scene
    root=bpy.data.objects.new('ReviewAsset',None);scene.collection.objects.link(root)
    for o in list(scene.objects):
        if o!=root and o.parent is None:o.parent=root
    lo,hi=bounds(root);size=hi-lo;center=(lo+hi)/2
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED';scene.render.threads=3
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
    scene.render.resolution_x=resolution;scene.render.resolution_y=resolution;scene.render.resolution_percentage=100;scene.render.film_transparent=True
    world=bpy.data.worlds.new('Neutral daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.79,.85,1);world.node_tree.nodes['Background'].inputs[1].default_value=.65;scene.world=world
    scale=max(size)
    for name,point,power,radius in [('Key',(-3,-4,7),500,4),('Fill',(4,-1,5),220,4),('Rim',(-2,4,6),380,3)]:
        light=bpy.data.lights.new(name,'AREA');light.energy=power*scale*scale/9;light.shape='DISK';light.size=radius*scale/3
        obj=bpy.data.objects.new(name,light);scene.collection.objects.link(obj);obj.location=center+Vector(point)*scale/3;obj.rotation_euler=(center-obj.location).to_track_quat('-Z','Y').to_euler()
    data=bpy.data.cameras.new('Exported model camera');cam=bpy.data.objects.new('Exported model camera',data);scene.collection.objects.link(cam);scene.camera=cam
    data.type='ORTHO';data.ortho_scale=max(size.z*1.30,math.hypot(size.x,size.y)*1.18)
    cam.location=center+Vector((6,-8,5.3))*scale;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    output.parent.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(output);bpy.ops.render.render(write_still=True)
    save_json(output.with_suffix('.json'),{'sourceModelSha256':digest(path),'pngSha256':digest(output),'view':'iso','sourceType':SOURCE})

def main():
    p=argparse.ArgumentParser();p.add_argument('--region',required=True);p.add_argument('--assets');p.add_argument('--draft',action='store_true');p.add_argument('--render-only',action='store_true');p.add_argument('--skip-existing',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:])
    region=args.region;module_name='western' if region in ('classic','harbor') else 'eastern' if region in ('compact','alpine') else 'metropolitan'
    path=HERE/'regions'/f'{module_name}.py';builder_sha=digest(path);pipeline_sha=digest(__file__);module=load_module('authored_'+module_name,path)
    names=args.assets.split(',') if args.assets else list(CAT['regions'][region])+(['harbor_lighthouse'] if region=='harbor' else ['alpine_windmill'] if region=='alpine' else [])
    for asset in names:
        started=time.monotonic();folder=HERE/('drafts' if args.draft else 'models')/region/asset;folder.mkdir(parents=True,exist_ok=True)
        glb=folder/'model.glb';preview=HERE/('draft-renders' if args.draft else 'renders')/region/f'{asset}.png'
        if args.render_only:render_model(glb,preview);continue
        if args.skip_existing and glb.exists() and (folder/'model.json').exists():
            old=json.loads((folder/'model.json').read_text('utf-8'))
            if old.get('sha256')==digest(glb):
                receipt=preview.with_suffix('.json')
                binding=json.loads(receipt.read_text('utf-8')) if receipt.exists() else {}
                if not preview.exists() or binding.get('sourceModelSha256')!=digest(glb) or binding.get('pngSha256')!=digest(preview):render_model(glb,preview)
                continue
        reset();root=module.build(region,asset);root.name=asset if asset.startswith(region+'_') else f'{region}_{asset}'
        reference=CAT['regions'][region].get(asset,{})
        if asset in CAT.get('heroes',{}):
            previous=CAT['heroes'][asset]['previousManifest']
            reference=previous.get('assets',[{}])[0].get('source',previous.get('source',{}))
        root['sourceType']=SOURCE;root['region']=region;root['asset']=asset;root['family']=reference.get('family',asset);root['level']=reference.get('level',0)
        root['referenceViews']=reference.get('referenceViews',[]);root['authoredArchitecture']=True
        details=atlas(root,folder,2048 if asset=='villa_2' and region=='compact' else 1024,args.draft)
        scale=fit(root,asset)
        bpy.ops.wm.save_as_mainfile(filepath=str(folder/'source.blend'))
        export_glb(root,glb,asset in ('harbor_lighthouse','alpine_windmill'))
        lo,hi=bounds(root);dimensions=hi-lo
        record={'region':region,'asset':asset,'name':root.name,'sourceType':SOURCE,'family':root.get('family'),'level':root.get('level'),'referenceViews':reference.get('referenceViews',[]),'triangles':triangles(root),'size':[dimensions.x,dimensions.z,dimensions.y],'bounds':{'min':[lo.x,lo.z,-hi.y],'max':[hi.x,hi.z,-lo.y]},'scale':scale,'bytes':glb.stat().st_size,'sha256':digest(glb),'builder':str(path.relative_to(ROOT)).replace('\\','/'),'builderSha256':builder_sha,'pipelineSha256':pipeline_sha,'surface':details,'status':'built_pending_scene_review','seconds':round(time.monotonic()-started,2)}
        save_json(folder/'model.json',record)
        print('AUTHORED_ASSET_READY '+json.dumps({'region':region,'asset':asset,'triangles':record['triangles'],'bytes':record['bytes']}),flush=True)
        render_model(glb,preview)

if __name__=='__main__':main()

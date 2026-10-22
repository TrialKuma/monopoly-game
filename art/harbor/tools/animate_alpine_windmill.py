"""Preserve the complete AI lodge and add an independent eave lantern animation."""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
import process_generated_model as pipeline
from quantize_gltf_attributes import quantize_mobile_attributes

def add_lantern(building, config):
    materials = {}
    for name, color, metallic in [('aged_brass',(.30,.18,.065,1),.6),('warm_glass',(.75,.38,.055,1),0),('dark_mount',(.13,.075,.045,1),0)]:
        mat=bpy.data.materials.new('lantern_'+name);mat.use_nodes=True
        bsdf=mat.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value=color
        bsdf.inputs['Metallic'].default_value=metallic
        bsdf.inputs['Roughness'].default_value=.48
        if name=='warm_glass':
            bsdf.inputs['Emission Color'].default_value=(1,.38,.055,1)
            bsdf.inputs['Emission Strength'].default_value=.45
        materials[name]=mat
    pivot=Vector(config['pivot_blender'])
    lantern=bpy.data.objects.new(config['component_name'],None)
    bpy.context.collection.objects.link(lantern);lantern.parent=building;lantern.location=pivot
    def box(name,position,dimensions,material,parent=lantern,bevel=.008):
        bpy.ops.mesh.primitive_cube_add(size=1,location=position)
        obj=bpy.context.object;obj.name=name;obj.dimensions=dimensions
        bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        obj.parent=parent;obj.data.materials.append(materials[material])
        modifier=obj.modifiers.new('Soft brass edges','BEVEL');modifier.width=bevel;modifier.segments=2
    box('lantern_fixed_bracket',pivot+Vector((0,.13,.025)),(.045,.30,.055),'dark_mount',building)
    box('lantern_hanger',(0,0,-.055),(.022,.022,.11),'aged_brass')
    box('lantern_amber_glass',(0,0,-.18),(.105,.105,.14),'warm_glass')
    for x in (-.06,.06):
        for y in (-.06,.06):box('lantern_corner_frame',(x,y,-.18),(.018,.018,.17),'aged_brass',bevel=.004)
    box('lantern_lower_cap',(0,0,-.272),(.15,.15,.035),'aged_brass')
    box('lantern_upper_cap',(0,0,-.09),(.16,.16,.04),'aged_brass')
    lantern.rotation_mode='XYZ';frames=round(config['seconds']*24)
    for fraction,sway in [(0,0),(.25,1),(.5,0),(.75,-1),(1,0)]:
        lantern.rotation_euler.x=math.radians(config['amplitude_degrees'])*sway
        lantern.keyframe_insert(data_path='rotation_euler',frame=1+round(frames*fraction))
    action=lantern.animation_data.action;action.name=config['clip_name'];slot=lantern.animation_data.action_slot
    track=lantern.animation_data.nla_tracks.new();track.name=action.name
    strip=track.strips.new(action.name,1,action);strip.action_slot=slot
    lantern.animation_data.action=None;lantern.rotation_euler=(0,0,0)
    bpy.context.scene.frame_end=1+frames
    return {'component':lantern.name,'clip':action.name,'seconds':config['seconds'],'mode':'gentle_swing',
            'amplitude_degrees':config['amplitude_degrees'],'pivot_blender':list(pivot),
            'source':'New separately modeled eave lantern; complete AI lodge and original windmill stay static'}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=pipeline.ROOT
    config_path=pipeline.resolve(args.config);config=json.loads(config_path.read_text('utf-8'))
    report_path=root/'art/harbor/reports/alpine_windmill-processing.json'
    report=json.loads((root/'art/harbor/reports/alpine_windmill-static-processing.json').read_text('utf-8'))
    output=root/'assets/models/harbor/alpine_windmill.glb'
    bpy.ops.wm.open_mainfile(filepath=str(root/'art/harbor/blender/alpine_windmill-static.blend'))
    building=bpy.data.objects['alpine_windmill'];report['animation']=add_lantern(building,config)
    bpy.context.scene.frame_set(1);pipeline.select_only([building,*building.children_recursive])
    bpy.ops.wm.save_as_mainfile(filepath=str(root/'art/harbor/blender/alpine_windmill.blend'))
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_yup=True,
        export_animations=True,export_animation_mode='NLA_TRACKS',export_merge_animation='NLA_TRACK',
        export_force_sampling=True,export_image_format='JPEG',export_jpeg_quality=82,export_extras=True)
    report['quantization']=quantize_mobile_attributes(output)
    report['output']=pipeline.file_evidence(output);report['glb_validation']=pipeline.inspect_glb(output)
    report['animation_config']=pipeline.file_evidence(config_path);report['animation_tool']=pipeline.file_evidence(Path(__file__))
    report['animation_finished_utc']=datetime.now(timezone.utc).isoformat()
    report['status']='exported_and_structurally_validated_pending_visual_review';report['visual_review']={'status':'pending'}
    report['preservation']='Complete accepted static AI lodge, original windmill blades, UVs and textures retained; only a new independent eave lantern is animated'
    report['architectural_body_geometry_unchanged']=True;report['original_neural_windmill_static']=True
    render_args=argparse.Namespace(name='alpine_windmill',samples=24,render_size=768,footprint=3,texture_size=1024,
        skip_render=False,animation_config=str(config_path))
    report['export_reimport_validation']=pipeline.render_exported(output,render_args,report['height'])
    bpy.context.scene.frame_set(1+round(config['seconds']*24*.75))
    opposite=root/'art/harbor/renders/alpine_windmill-animation-opposite.png'
    bpy.context.scene.render.filepath=str(opposite);bpy.ops.render.render(write_still=True)
    report['export_reimport_validation']['images'].append(str(opposite))
    report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('ALPINE_ANIMATION_REPORT',json.dumps({'output':report['output'],'animation':report['animation']}),flush=True)
if __name__=='__main__':main()

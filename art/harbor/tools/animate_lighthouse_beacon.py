"""Keep the complete real AI lighthouse intact; add a rotating signal ring.

The original waterwheel, fixed axle, walls and all original UVs are untouched.
Only the newly authored copper/amber beacon mechanism has animation channels.
"""
from pathlib import Path
from types import SimpleNamespace
import sys,math,json,hashlib
import bpy
from mathutils import Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
import process_generated_model as p
from quantize_gltf_attributes import quantize_mobile_attributes

name='harbor_lighthouse'
static=p.ROOT/'art/harbor/blender'/f'{name}-static.blend'
blend=p.ROOT/'art/harbor/blender'/f'{name}.blend'
output=p.ROOT/'assets/models/harbor'/f'{name}.glb'
report_path=p.ROOT/'art/harbor/reports'/f'{name}-processing.json'
bpy.ops.wm.open_mainfile(filepath=str(static))
body=next(o for o in bpy.context.scene.objects if o.type=='MESH')
root=bpy.data.objects[name]
def geometry_digest(mesh):
    import struct
    data=b''.join(struct.pack('<3f',*v.co) for v in mesh.vertices)
    data+=b''.join(struct.pack('<'+('I'*len(f.vertices)),*f.vertices) for f in mesh.polygons)
    data+=b''.join(struct.pack('<2f',*loop.uv) for loop in mesh.uv_layers.active.data)
    return hashlib.sha256(data).hexdigest()
body_digest=geometry_digest(body.data)
body.name='harbor_lighthouse_ai_building'
def material(label,color,metallic=0,emission=0):
    mat=bpy.data.materials.new(label);mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Roughness'].default_value=.32
    shader.inputs['Metallic'].default_value=metallic
    if emission:
        shader.inputs['Emission Color'].default_value=(*color,1)
        shader.inputs['Emission Strength'].default_value=emission
    return mat
copper=material('Signal mechanism - brushed copper',(.47,.29,.095),.65)
amber=material('Signal mechanism - warm amber lens',(1,.47,.095),.1,1.2)
parts=[]
def addmat(obj,mat):obj.data.materials.append(mat);parts.append(obj)
bpy.ops.mesh.primitive_torus_add(major_segments=48,minor_segments=8,major_radius=.295,minor_radius=.012)
addmat(bpy.context.object,copper)
for x in [-.295,.295]:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=(x,0,.018))
    obj=bpy.context.object;obj.scale=(.035,.045,.046)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);addmat(obj,amber)
    bpy.ops.mesh.primitive_torus_add(major_segments=16,minor_segments=6,major_radius=.040,minor_radius=.007,location=(x,0,.018))
    obj=bpy.context.object;obj.rotation_euler.x=math.pi/2;addmat(obj,copper)
# One small copper index vane makes the moving mechanism readable and asymmetric.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,.295,.015))
obj=bpy.context.object;obj.scale=(.075,.024,.055)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
bevel=obj.modifiers.new('Rounded signal vane','BEVEL');bevel.width=.006;bevel.segments=2
bpy.ops.object.modifier_apply(modifier=bevel.name);addmat(obj,copper)
p.select_only(parts);bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join()
signal=bpy.context.object;signal.name='harbor_lighthouse_beacon_signal'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
signal.parent=root;signal.location=(.273,.053,2.425);signal.rotation_mode='QUATERNION'
seconds=12;frames=24*seconds
for frame in range(frames+1):
    signal.rotation_quaternion=Quaternion(Vector((0,0,1)),math.tau*frame/frames)
    signal.keyframe_insert(data_path='rotation_quaternion',frame=frame+1)
action=signal.animation_data.action;action.name='harbor_beacon_signal_idle'
slot=signal.animation_data.action_slot;track=signal.animation_data.nla_tracks.new();track.name=action.name
strip=track.strips.new(action.name,1,action);strip.action_slot=slot
signal.animation_data.action=None;signal.rotation_quaternion=(1,0,0,0)
scene=bpy.context.scene;scene.frame_start=1;scene.frame_end=frames+1;scene.render.fps=24;scene.frame_set(1)
if geometry_digest(body.data)!=body_digest:raise RuntimeError('AI body changed while adding mechanism')
p.select_only([root,*root.children_recursive]);bpy.ops.wm.save_as_mainfile(filepath=str(blend))
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,
    export_yup=True,export_animations=True,export_animation_mode='NLA_TRACKS',
    export_merge_animation='NLA_TRACK',export_force_sampling=True,
    export_image_format='JPEG',export_jpeg_quality=78,export_extras=True)
quantization=quantize_mobile_attributes(output);glb=p.inspect_glb(output)
targets={target['node'] for clip in glb['animations'] for target in clip['targets']}
if targets!={signal.name}:raise RuntimeError(f'Unexpected animated nodes {targets}')
if output.stat().st_size>=8*1024*1024:raise RuntimeError('GLB exceeds 8 MiB allowance')
config_path=p.ROOT/'art/harbor/reports/lighthouse-beacon-animation.json'
config={'component_name':signal.name,'clip_name':action.name,'seconds':seconds,'mode':'spin',
    'axis_blender':[0,0,1],'pivot_blender':list(signal.location),
    'manual_mechanical_triangles':p.triangles(signal),'retained_ai_building_triangles':p.triangles(body),
    'ai_body_geometry_and_uv_sha256':body_digest,'ai_body_geometry_and_uv_unchanged':True,
    'source':'Complete real local Pixal3D lighthouse body, original waterwheel and original UVs preserved. Added manually authored copper/amber beacon signal ring is the only moving component.',
    'provenance_label':'AI building body + added animated beacon signal mechanism',
    'original_waterwheel':'Static, intact and unchanged; no original mesh separation or deletion.'}
config_path.write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
report=json.loads(report_path.read_text('utf-8'))
report.update(status='animation_exported_pending_visual_review',output=p.file_evidence(output),
    animation=config,animation_config=p.file_evidence(config_path),quantization=quantization,
    glb_validation=glb,animation_tool=p.file_evidence(Path(__file__).resolve()))
args=SimpleNamespace(samples=24,render_size=768,texture_size=1024,footprint=3,name=name,skip_render=False,animation_config=str(config_path))
report['export_reimport_validation']=p.render_exported(output,args,report['height'])
report['raw_source_unchanged']=p.sha256(Path(report['source']['path']))==report['source']['sha256']
report_path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print('AI_LIGHTHOUSE_AND_ADDED_SIGNAL_EXPORTED',output.stat().st_size,flush=True)

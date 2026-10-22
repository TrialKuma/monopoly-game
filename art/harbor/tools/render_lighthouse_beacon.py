"""CPU inspection of the actual exported beacon mechanism at three times."""
from pathlib import Path
import sys
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import process_generated_model as p
p.clear_scene();bpy.ops.import_scene.gltf(filepath=str(p.ROOT/'assets/models/harbor/harbor_lighthouse.glb'))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.fps=24
scene.render.resolution_x=768;scene.render.resolution_y=768;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
world=bpy.data.worlds.new('Beacon QA studio');world.use_nodes=True;scene.world=world
world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.72,.82,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.6
pivot=Vector((.273,.053,2.425))
for loc,energy in [((3,-4,5),650),((-4,-3,4),500)]:
    bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=energy;o.data.size=4
    o.rotation_euler=(pivot-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=pivot+Vector((2,-5,1.3)));camera=bpy.context.object
camera.rotation_euler=(pivot-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.0;scene.camera=camera
for frame,label in [(1,'start'),(73,'quarter'),(145,'half')]:
    scene.frame_set(frame);scene.render.filepath=str(p.ROOT/'art/harbor/renders'/f'harbor_lighthouse-beacon-{label}.png');bpy.ops.render.render(write_still=True)

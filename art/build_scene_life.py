"""Export articulated copies of the existing Blender special buildings.

Run Blender --background --factory-startup --python art/build_scene_life.py.
Original specials.glb/.blend remain untouched. Only the existing wheel and
crane payload are separated around physical pivots; all architecture is reused.
"""
from pathlib import Path
import os

script = Path(__file__).with_name('build_specials.py').read_text(encoding='utf8')
# Reuse the original modelling definitions, stopping before its export/render.
exec(compile(script.split('FACTORIES=')[0], str(Path(__file__).with_name('build_specials.py')), 'exec'))

wheel_code = script[script.index('def chance_wheel():'):script.index('\ndef teleport_gate():')]
wheel_code = wheel_code.replace('    center=(0,-.005,.69)', "    static=b; rotor=Builder('life_wheel_rotor'); b=rotor\n    center=(0,-.005,.69)")
wheel_code = wheel_code.replace("    b.xz_shape([(-.058,0)", "    b=static\n    b.xz_shape([(-.058,0)")
wheel_code = wheel_code.replace('    return b', '    return b,rotor')
exec(compile(wheel_code, 'articulated_chance_wheel', 'exec'))

crane_code = script[script.index('def builders_guild():'):script.index('\ndef card_symbol(')]
crane_code = crane_code.replace("    b.rod((.32,cy,1.33),(.32,cy,1.05),.006,'dark',6)", "    pendulum=Builder('life_crane_pendulum')\n    pendulum.rod((.32,cy,1.33),(.32,cy,1.06),.006,'dark',8)")
crane_code = crane_code.replace("    b.box((.32,cy,1.02),(.089,.079,.102),'concrete')", "    pendulum.sphere((.32,cy,1.02),(.053,.053,.057),'steel',18,10)\n    pendulum.torus((.32,cy,1.02),.053,.005,'gold',axis='Z',n=24,m=6)")
crane_code = crane_code.replace('    return b', '    return b,pendulum')
exec(compile(crane_code, 'articulated_builders_guild', 'exec'))

roots=[]
for factory,pivot,kind in [(chance_wheel,(0,-.005,.69),'wheel'),(builders_guild,(.32,.17,1.33),'pendulum')]:
    body,part=factory(); root=body.finalize()
    part.v=[tuple(Vector(v)-Vector(pivot)) for v in part.v]
    moving=part.finalize(); moving.parent=root; moving.location=pivot
    moving['lifePart']=kind; moving['lifeAxis']='Z' if kind=='wheel' else 'Z'
    root['version']='cartoon-life-v1'; roots.append(root)

bpy.ops.object.select_all(action='DESELECT')
for root in roots:
    root.select_set(True)
    for ob in root.children_recursive:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'life-specials.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False,export_extras=True)
manifest={'assets':['chance_wheel','builders_guild'],'parts':{'life_wheel_rotor':{'parent':'chance_wheel','pivot_gltf':[0,.69,.005],'axis':'Z'},'life_crane_pendulum':{'parent':'builders_guild','pivot_gltf':[.32,1.33,-.17],'axis':'Z','swing_radians':.13}},'source':'art/build_scene_life.py','bytes':(OUT/'life-specials.glb').stat().st_size}
(OUT/'life-specials-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')

scene=bpy.context.scene
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.65,.72,.8,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
mat=material('Life preview cream backdrop','E4DECF',.8)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01));bpy.context.object.data.materials.append(mat)
for name,pos,energy,size in [('Key',(-3,-4,6),420,4),('Fill',(4,-1,5),230,3),('Rim',(0,4,5),300,3)]:
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.shape='DISK';d.size=size
    ob=bpy.data.objects.new(name,d);scene.collection.objects.link(ob);ob.location=pos;ob.rotation_euler=(Vector((0,0,.6))-ob.location).to_track_quat('-Z','Y').to_euler()
for i,root in enumerate(roots):root.location.x=(i-.5)*1.45
data=bpy.data.cameras.new('Articulation preview camera');cam=bpy.data.objects.new('Articulation preview camera',data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO';data.ortho_scale=3.25
cam.location=(2.4,-5,3.4);cam.rotation_euler=(Vector((0,0,.7))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.render.resolution_x=1000;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=-.15
preview=Path(os.environ.get('CITY_LIFE_PREVIEW_DIR',str(PREVIEW)))
preview.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(preview/'life-specials-preview.png')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'life-specials.blend'))
bpy.ops.render.render(write_still=True)
print('LIFE_SPECIALS_COMPLETE',json.dumps(manifest),flush=True)

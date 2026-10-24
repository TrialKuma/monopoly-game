"""Identical neutral CPU renders of unchanged, cropped decoder and exporter meshes."""
from pathlib import Path
import argparse,json,sys,shutil
import numpy as np
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import process_lod as lod

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--report',required=True,type=Path);args=cli.parse_args(sys.argv[sys.argv.index('--')+1:]);proof=json.loads(args.report.read_text('utf8'));out=args.report.parent;renders=[]
    for kind,key in [('decoder','decoder'),('native-1m','nativeExport')]:
        lod.clear_scene();archive=Path(proof[key]['output']['path']);assert lod.p.sha256(archive)==proof[key]['output']['sha256'];data=np.load(archive);vertices=data['vertices'];faces=data['faces']
        mesh=bpy.data.meshes.new(kind);mesh.vertices.add(len(vertices));mesh.vertices.foreach_set('co',vertices.reshape(-1));mesh.loops.add(faces.size);mesh.loops.foreach_set('vertex_index',faces.reshape(-1));mesh.polygons.add(len(faces));mesh.polygons.foreach_set('loop_start',np.arange(len(faces),dtype=np.int32)*3);mesh.polygons.foreach_set('loop_total',np.full(len(faces),3,dtype=np.int32));mesh.update();obj=bpy.data.objects.new(kind,mesh);bpy.context.collection.objects.link(obj)
        material=bpy.data.materials.new('Same neutral geometry diagnostic');material.use_nodes=True;shader=material.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.52,.52,.52,1);shader.inputs['Roughness'].default_value=.8;mesh.materials.append(material)
        scene=lod.set_cpu();scene.cycles.samples=16;scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
        target=Vector((0,0,.5));world=bpy.data.worlds.new('Same neutral QA studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.64,.72,.82,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
        for loc,energy,size in (((2,-3,4),220,2),((-3,-1,2),120,2),((1,3,3),180,2)):
            bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=energy;light.data.size=size;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
        bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';scene.camera=camera
        cameras=proof.get('diagnosticCameras') or [('back-iso',(-2.8,4,2.6),(0,0,.5),1.4),('roof-close',(-2.8,4.12,2.92),(0,.12,.82),.92),('roof-back',(0,4,.94),(0,.1,.82),.94)]
        for label,position,look,scale in cameras:
            camera.location=Vector(position);camera.rotation_euler=(Vector(look)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale;path=out/(kind+'-'+label+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);renders.append({'stage':kind,'label':label,'camera':{'position':position,'lookAt':look,'orthoScale':scale},'image':lod.p.file_evidence(path)})
        del vertices,faces,data
    snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(Path(__file__))+'-'+Path(__file__).name)
    if not snapshot.exists():shutil.copyfile(__file__,snapshot)
    lod.write(out/'render-report.json',{'status':'actual_neutral_roi_comparison_pending_visual_review','extraction':lod.p.file_evidence(args.report),'views':renders,'tool':lod.p.file_evidence(snapshot),'geometryModification':'None; original source face subsets, cropped outside documented bounding boxes only','renderer':'Cycles CPU','threads':4,'samples':16})

if __name__=='__main__':main()

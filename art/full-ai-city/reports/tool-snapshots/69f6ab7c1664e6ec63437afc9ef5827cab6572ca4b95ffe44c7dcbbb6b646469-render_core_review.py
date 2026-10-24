"""Render immutable small-frame and close views for one hash-bound core asset.

This records evidence only. It never approves a candidate or edits geometry.
"""
from pathlib import Path
import argparse,json,sys,hashlib,shutil
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import process_lod as lod

def local(path):
 path=Path(path);return path if path.is_absolute() else lod.ROOT/path
def evidence(path):return lod.p.file_evidence(path)

def main():
 cli=argparse.ArgumentParser();cli.add_argument('--map',required=True);cli.add_argument('--asset',required=True);cli.add_argument('--sha256',required=True);args=cli.parse_args(sys.argv[sys.argv.index('--')+1:])
 assert args.asset.rsplit('_',1)[0] in ('villa','shop','hotel','tower') and args.asset[-1] in '123'
 path=lod.ART/'candidates'/args.map/(args.asset+'.glb');report_path=path.with_suffix('.json');report=json.loads(report_path.read_text('utf8'))
 assert report['processingComplete'] and report['processedCandidate']['sha256']==args.sha256==lod.p.sha256(path)
 assert report['lod']=='near' and len(report['renderedCandidate']['views'])>=5
 out=lod.ART/'work/core-review'/args.map/args.asset/args.sha256[:16]
 if (out/'inspection.json').exists():raise RuntimeError('Review render evidence already exists; inspect the frozen frames')
 out.mkdir(parents=True,exist_ok=True)
 lod.clear_scene();bpy.ops.import_scene.gltf(filepath=str(path))
 scene=lod.set_cpu();scene.cycles.samples=16;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
 meshes=[o for o in scene.objects if o.type=='MESH'];lo,hi=lod.p.bounds(meshes,world=True);target=Vector((0,0,(hi.z+lo.z)/2))
 world=bpy.data.worlds.new('Neutral core visual review');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.64,.72,.82,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55;scene.world=world
 for loc,energy,size in (((2,-3,4),220,2),((-3,-1,2),120,2),((1,3,3),180,2)):
  bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=energy;light.data.size=size;light.rotation_euler=(target-light.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=1.4;scene.camera=camera
 views=[]
 for prefix,resolution,positions in [('small',256,[('front',(0,-4,.9)),('back',(0,4,.9)),('iso',(2.8,-4,2.6))]),('close',1024,[('front-iso',(2.8,-4,2.6)),('back-iso',(-2.8,4,2.6))])]:
  scene.render.resolution_x=resolution;scene.render.resolution_y=resolution
  for label,position in positions:
   camera.location=Vector(position);camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();frame=out/(prefix+'-'+label+'.png');scene.render.filepath=str(frame);bpy.ops.render.render(write_still=True);views.append({'role':prefix,'resolution':[resolution,resolution],**evidence(frame)})
 assert lod.p.sha256(path)==args.sha256,'Candidate changed during review render'
 tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 result={'status':'rendered_pending_human_visual_review','candidate':evidence(path),'processingReport':evidence(report_path),'tool':evidence(snapshot),'renderer':'Cycles CPU','threads':4,'samples':16,'views':views,'geometryOrMaterialChanges':False,'scope':'Actual 256px studio frame readability and 1024px close views; family-scale gameplay review is separate.','createdAt':lod.now()}
 (out/'inspection.json').write_text(json.dumps(result,indent=2),encoding='utf8');print(json.dumps({'inspection':evidence(out/'inspection.json'),'candidate':result['candidate']}),flush=True)

if __name__=='__main__':main()

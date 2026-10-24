"""Read-only source/final neutral material comparison for specific core concerns."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys,shutil
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import process_lod as lod

def gray():
 m=bpy.data.materials.new('Neutral surface diagnostic only');m.use_nodes=True
 b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(.52,.52,.52,1);b.inputs['Roughness'].default_value=.8
 bpy.context.scene.view_layers[0].material_override=m

def main():
 p=argparse.ArgumentParser()
 for key in ('map','asset','sha256'):p.add_argument('--'+key,required=True)
 a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
 rp=lod.ART/'candidates'/a.map/(a.asset+'.json');r=json.loads(rp.read_text('utf8'))
 candidate=Path(r['processedCandidate']['path']);raw=Path(r['source']['rawGLB']['path'])
 assert lod.p.sha256(candidate)==r['processedCandidate']['sha256']==a.sha256
 assert lod.p.sha256(raw)==r['source']['rawGLB']['sha256']
 out=lod.ART/'work/core-review'/a.map/a.asset/(a.sha256[:16]+'-geometry-diagnostic');out.mkdir(parents=True,exist_ok=True)
 assert not(out/'diagnostic.json').exists()
 settings=SimpleNamespace(region=a.map,asset=a.asset,lod='near',name=a.map+'__'+a.asset,height=1.,footprint=1.,pitch=0.,roll=0.,yaw=180.,no_auto_upright=False,max_upright=18.,render_directory=out,render_prefix='final-color-')
 lod.render(candidate,settings,['back'])
 scene=bpy.context.scene;gray();frames=[]
 meshes=[o for o in scene.objects if o.type=='MESH'];lo,hi=lod.p.bounds(meshes,world=True);target=Vector((0,0,(hi.z+lo.z)/2))
 for size in (512,256):
  scene.render.resolution_x=scene.render.resolution_y=size
  for label,pos in [('front',(0,-4,.9)),('back',(0,4,.9))]:
   scene.camera.location=Vector(pos);scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler()
   path=out/('final-gray-'+label+'-'+str(size)+'.png');scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);frames.append(lod.p.file_evidence(path))
 scene.view_layers[0].material_override=None
 settings.render_prefix='source-color-';source_frames=lod.render(raw,settings,['back'],raw=True)
 scene=bpy.context.scene;gray();scene.render.resolution_x=scene.render.resolution_y=512
 path=out/'source-gray-back-512.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);frames.append(lod.p.file_evidence(path))
 assert lod.p.sha256(candidate)==a.sha256 and lod.p.sha256(raw)==r['source']['rawGLB']['sha256']
 tool=Path(__file__);snap=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snap.exists():shutil.copyfile(tool,snap)
 result={'status':'actual_images_pending_visual_diagnosis','candidate':lod.p.file_evidence(candidate),'processingReport':lod.p.file_evidence(rp),'source':lod.p.file_evidence(raw),'tool':lod.p.file_evidence(snap),'sourceViews':source_frames,'neutralViews':frames,'scope':'Neutral material view-layer override only; source receives the standard upright/yaw before render. No geometry, materials, UV or original image bytes edited or exported.'}
 (out/'diagnostic.json').write_text(json.dumps(result,indent=2)+'\n','utf8')
 print(json.dumps(lod.p.file_evidence(out/'diagnostic.json')),flush=True)
if __name__=='__main__':main()

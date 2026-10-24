"""Actual hash-bound five-face and small/close views of an isolated derivative."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys,shutil
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import process_lod as lod
def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--sha256',required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
 assert lod.p.sha256(a.source)==a.sha256 and not (a.output/'render-report.json').exists()
 a.output.mkdir(parents=True,exist_ok=True)
 args=SimpleNamespace(height=1,footprint=1,lod='near',region='alpine',asset='shop_1',render_directory=a.output,render_prefix='lod-')
 final=lod.render(a.source,args,['front','right','back','left','iso']);scene=bpy.context.scene;cam=scene.camera
 target=Vector((0,0,sum(final['boundsBlender'][axis][2] for axis in ('min','max'))/2));extra=[]
 for prefix,res,positions in [('small',256,[('front',(0,-4,.9)),('back',(0,4,.9)),('iso',(2.8,-4,2.6))]),('close',1024,[('front-iso',(2.8,-4,2.6)),('back-iso',(-2.8,4,2.6))])]:
  scene.render.resolution_x=scene.render.resolution_y=res
  for label,pos in positions:
   cam.location=Vector(pos);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();frame=a.output/(prefix+'-'+label+'.png');scene.render.filepath=str(frame);bpy.ops.render.render(write_still=True);extra.append({'role':prefix,'resolution':[res,res],**lod.p.file_evidence(frame)})
 assert lod.p.sha256(a.source)==a.sha256
 tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 report={**final,'candidate':lod.p.file_evidence(a.source),'reviewImages':[lod.p.file_evidence(Path(v)) for v in final['views']],'extraViews':extra,'tool':lod.p.file_evidence(snapshot),'geometryOrMaterialChanges':False,'status':'actual_derivative_frames_pending_visual_review'}
 target=a.output/'render-report.json';target.write_text(json.dumps(report,indent=2)+'\n','utf8');print(json.dumps(lod.p.file_evidence(target)),flush=True)
if __name__=='__main__':main()

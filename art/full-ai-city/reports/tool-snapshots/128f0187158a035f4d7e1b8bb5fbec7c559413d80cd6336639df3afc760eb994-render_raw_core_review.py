"""Read-only source side/back and neutral geometry evidence for core review."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys,shutil
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import process_lod as lod

def main():
 cli=argparse.ArgumentParser();cli.add_argument('--map',required=True);cli.add_argument('--asset',required=True);cli.add_argument('--sha256',required=True);cli.add_argument('--source-report',type=Path,help='Inspect an immutable earlier native attempt instead of current queue state');options=cli.parse_args(sys.argv[sys.argv.index('--')+1:])
 if options.source_report:
  state=json.loads(options.source_report.read_text('utf8'));raw=Path(state['output']);assert state['generation_started'] and state['pipeline_config']=='pipeline_mv.json';assert lod.p.sha256(raw)==state['output_sha256']==options.sha256
 else:
  queue=lod.ART/'queue'/options.map/(options.asset+'.json');current=json.loads(queue.read_text('utf8'))
  state=next(r for r in [current,*current.get('revisions',[])] if r.get('rawGLB',{}).get('sha256')==options.sha256)
  raw=Path(state['rawGLB']['path']);assert lod.p.sha256(raw)==state['rawGLB']['sha256']==options.sha256
 out=lod.ART/'work/core-review'/options.map/options.asset/('raw-'+options.sha256[:16]);out.mkdir(parents=True,exist_ok=True)
 if (out/'source-inspection.json').exists():raise RuntimeError('Source review already rendered')
 args=SimpleNamespace(region=options.map,asset=options.asset,name=options.map+'__'+options.asset,lod='near',height=1.,footprint=1.,render_directory=out,yaw=180.,pitch=0.,roll=0.,no_auto_upright=False,max_upright=18.)
 result=lod.render(raw,args,('right','back','left'),raw=True)
 scene=bpy.context.scene;meshes=[o for o in scene.objects if o.type=='MESH'];lo,hi=lod.p.bounds(meshes,world=True);target=Vector((0,0,(hi.z+lo.z)/2));scene.camera.location=Vector((-2.8,4,2.6));scene.camera.rotation_euler=(target-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.render.resolution_x=1024;scene.render.resolution_y=1024
 close=out/'raw-close-back-iso.png';scene.render.filepath=str(close);bpy.ops.render.render(write_still=True)
 # View-layer override changes only this diagnostic render, never source data.
 grey=bpy.data.materials.new('Neutral diagnostic override');grey.use_nodes=True;shader=grey.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.52,.52,.52,1);shader.inputs['Roughness'].default_value=.8;scene.view_layers[0].material_override=grey
 grey_path=out/'raw-grey-back-iso.png';scene.render.filepath=str(grey_path);bpy.ops.render.render(write_still=True)
 tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 assert lod.p.sha256(raw)==options.sha256
 report={'status':'source_evidence_rendered_pending_visual_review','region':options.map,'asset':options.asset,'source':lod.p.file_evidence(raw),'tool':lod.p.file_evidence(snapshot),'sourceBytesChanged':False,'actualSideViews':result,'additionalViews':[lod.p.file_evidence(close),lod.p.file_evidence(grey_path)],'neutralOverrideScope':'Diagnostic view layer only, no geometry or source material edits/export','createdAt':lod.now()}
 if options.source_report:report['inferenceReport']=lod.p.file_evidence(options.source_report)
 (out/'source-inspection.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps({'report':lod.p.file_evidence(out/'source-inspection.json')}),flush=True)

if __name__=='__main__':main()

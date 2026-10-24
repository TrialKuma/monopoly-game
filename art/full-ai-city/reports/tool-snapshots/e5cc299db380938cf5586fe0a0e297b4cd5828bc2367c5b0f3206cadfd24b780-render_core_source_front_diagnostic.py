"""Read-only original-export front geometry check; no decoder attribution."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys,shutil
import bpy
sys.path.insert(0,str(Path(__file__).resolve().parent))
import process_lod as lod
def main():
 p=argparse.ArgumentParser();p.add_argument('--map',required=True);p.add_argument('--asset',required=True);p.add_argument('--sha256',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
 state=json.loads((lod.ART/'queue'/a.map/(a.asset+'.json')).read_text('utf8'));src=Path(state['rawGLB']['path']);assert lod.p.sha256(src)==state['rawGLB']['sha256']==a.sha256
 out=lod.ART/'work/core-review'/a.map/a.asset/('front-diagnostic-'+a.sha256[:16]);out.mkdir(parents=True,exist_ok=True);assert not(out/'diagnostic.json').exists()
 args=SimpleNamespace(region=a.map,asset=a.asset,name=a.map+'__'+a.asset,lod='near',height=1.,footprint=1.,render_directory=out,yaw=180.,pitch=0.,roll=0.,no_auto_upright=False,max_upright=18.)
 frames=lod.render(src,args,['front','iso'],raw=True);scene=bpy.context.scene;scene.render.resolution_x=scene.render.resolution_y=1024
 grey=bpy.data.materials.new('Neutral geometry diagnostic');grey.use_nodes=True;shader=grey.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(.52,.52,.52,1);shader.inputs['Roughness'].default_value=.8;scene.view_layers[0].material_override=grey
 image=out/'raw-grey-front-iso.png';scene.render.filepath=str(image);bpy.ops.render.render(write_still=True)
 tool=Path(__file__);snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 assert lod.p.sha256(src)==a.sha256
 report={'status':'rendered_pending_actual_visual_diagnosis','source':lod.p.file_evidence(src),'sourceLevel':'Native 1M export, not untouched decoder','renderedSource':frames,'greyView':lod.p.file_evidence(image),'tool':lod.p.file_evidence(snapshot),'sourceUnchanged':True,'scope':'Neutral view-layer material only. No geometry edits or export.'}
 path=out/'diagnostic.json';path.write_text(json.dumps(report,indent=2)+'\n','utf8');print(json.dumps(lod.p.file_evidence(path)),flush=True)
if __name__=='__main__':main()

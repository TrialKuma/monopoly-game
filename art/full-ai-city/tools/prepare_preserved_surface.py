"""Export only the normalized native-derived geometry for topology-preserving LOD."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys
import bpy
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--state',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--repaired-source',type=Path);parser.add_argument('--repair-report',type=Path);parser.add_argument('--remove-dark-ground',action='store_true');parser.add_argument('--render-source-left',action='store_true')
    a=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);a.output=a.output.resolve();state=json.loads(a.state.read_text('utf-8'));raw=Path(state['rawGLB']['path']);source=a.repaired_source or raw
    if lod.p.sha256(raw)!=state['rawGLB']['sha256']:raise RuntimeError('Raw changed')
    receipt={'sourceRaw':lod.p.file_evidence(raw),'input':lod.p.file_evidence(source),'method':'Original source geometry normalized identically to near processing; optional documented local repair and inferred ground removal. Materials are excluded only from the geometry-transfer file, not the final bake.'}
    if a.repaired_source:
        repair=json.loads(a.repair_report.read_text('utf-8'))
        if repair['source']['sha256']!=state['rawGLB']['sha256'] or repair['nativeOutput']['sha256']!=lod.p.sha256(source):raise RuntimeError('Repair/source mismatch')
        receipt['repairReport']=lod.p.file_evidence(a.repair_report)
    settings=SimpleNamespace(region=state['region'],asset=state['asset'],height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18,lod='near')
    lod.clear_scene();body,_=lod.p.import_body(source);receipt['orientation']=lod.p.upright(body,settings)
    if a.remove_dark_ground:receipt['groundCleanup']=lod.remove_dark_ground(body)
    lod.p.select_only([body]);a.output.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(a.output),export_format='GLB',use_selection=True,export_materials='NONE',export_animations=False)
    receipt['normalizedGeometry']=lod.p.file_evidence(a.output);lod.write(a.output.with_suffix('.source.json'),receipt)
    if a.render_source_left:
        settings.render_directory=a.output.parent;settings.render_prefix='original-material-'
        lod.render(raw,settings,('left',),raw=True)
    print('NORMALIZED_NEURAL_SURFACE_READY',a.output,flush=True)
if __name__=='__main__':main()

"""CPU actual GLB component-pose verification, keeping all buildings static."""
from pathlib import Path
from types import SimpleNamespace
import argparse,sys,math,json
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
from neural_component import GLB
import process_lod as lod
def multiply(a,b):
    av,aw=np.array(a[:3]),a[3];bv,bw=np.array(b[:3]),b[3]
    return np.r_[aw*bv+bw*av+np.cross(av,bv),aw*bw-np.dot(av,bv)].tolist()
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,required=True);parser.add_argument('--region',required=True);parser.add_argument('--asset',required=True);parser.add_argument('--output-directory',type=Path);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    directory=args.output_directory or lod.ART/'renders'/args.region/args.asset/'motion';directory.mkdir(parents=True,exist_ok=True)
    results=[]
    inspection=GLB(args.source);part=next(n for n in inspection.doc['nodes'] if n.get('extras',{}).get('lifePart'))
    clips=inspection.doc.get('animations',[])
    duration=float(inspection.array(clips[0]['samplers'][0]['input']).max()) if clips else None
    pendulum=part['extras']['lifePart']=='pendulum'
    angles=(0,7,-7) if clips and pendulum else ((0,-7,7) if pendulum else (0,45,90))
    # A swing clip reaches its extrema at one-quarter and three-quarter time.
    # Mapping signed degrees onto spin time would sample near zero or before start.
    clip_times=(0.,duration*.25,duration*.75) if clips and pendulum else None
    for pose_index,angle in enumerate(angles):
        g=GLB(args.source);node=next(n for n in g.doc['nodes'] if n.get('extras',{}).get('lifePart'))
        if not clips:
            a=math.radians(angle)/2;node['rotation']=multiply(node.get('rotation',[0,0,0,1]),[0,0,math.sin(a),math.cos(a)])
        path=directory/('pose-'+str(angle)+'.glb');g.save(path)
        settings=SimpleNamespace(region=args.region,asset=args.asset,lod='near',height=1.,footprint=1.,render_directory=directory,render_prefix='pose-'+str(angle)+'-')
        if clips:settings.animation_time_seconds=clip_times[pose_index] if clip_times else duration*angle/360
        results.append({'angleDegrees':angle,'clipTimeSeconds':getattr(settings,'animation_time_seconds',None),**lod.render(path,settings,('front','right','iso'))})
    report={'source':lod.p.file_evidence(args.source),'motion':'The actual GLTF clip is evaluated at recorded timestamps; only the neural component rotates and building root remains fixed.' if clips else 'Only the neural component node receives rotation about its measured local Z axle. Building root remains fixed. No autoplay clip.','clip':clips[0].get('name') if clips else None,'poses':results}
    (directory/'review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print('COMPONENT_POSES_READY',directory,flush=True)
if __name__=='__main__':main()

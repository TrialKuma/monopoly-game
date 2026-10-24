"""Measure surface-ray gaps for an explicitly selected neural building; no edits."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

args_parser=argparse.ArgumentParser()
args_parser.add_argument('--region',required=True);args_parser.add_argument('--asset',required=True)
args_parser.add_argument('--sha256',required=True);args_parser.add_argument('--zmax',type=float,required=True)
args_parser.add_argument('--sides',nargs='+',choices=['front','back','right','left'],default=['front','back'])
args_parser.add_argument('--out',type=Path)
args=args_parser.parse_args(sys.argv[sys.argv.index('--')+1:])
state=json.loads((lod.ART/'queue'/args.region/(args.asset+'.json')).read_text('utf-8'))
raw=Path(state['rawGLB']['path'])
if lod.p.sha256(raw)!=args.sha256:raise ValueError('Inspected raw revision changed')
lod.clear_scene();obj,_=lod.p.import_body(raw)
orientation=lod.p.upright(obj,SimpleNamespace(height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18))
tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
xs=np.arange(-.49,.491,.002);zs=np.arange(.02,args.zmax+.001,.002)
directory=args.out or lod.ART/'work/facade-gaps'/args.region/args.asset;directory.mkdir(parents=True,exist_ok=True)
if (directory/'inspection.json').exists():raise FileExistsError('Preserve completed source measurement')
report={'source':state['rawGLB'],'normalization':orientation,'gridSpacing':.002,'sides':{}}
for side in args.sides:
    direction=-1 if side in ('front','left') else 1
    horizontal=side in ('right','left')
    depth=np.full((len(zs),len(xs)),-2,dtype=np.float32)
    for zi,z in enumerate(zs):
        for xi,x in enumerate(xs):
            origin=(direction*2,float(x),float(z)) if horizontal else (float(x),direction*2,float(z))
            ray=(-direction,0,0) if horizontal else (0,-direction,0)
            point,normal,index,_=tree.ray_cast(Vector(origin),Vector(ray))
            if point is not None:depth[zi,xi]=(point.x if horizontal else point.y)*direction
    pending=set(map(tuple,np.argwhere(depth<.02)));components=[]
    while pending:
        first=pending.pop();stack=[first];cells=[first]
        while stack:
            zi,xi=stack.pop()
            for neighbor in [(zi-1,xi),(zi+1,xi),(zi,xi-1),(zi,xi+1)]:
                if neighbor in pending:pending.remove(neighbor);stack.append(neighbor);cells.append(neighbor)
        if len(cells)<3:continue
        points=np.asarray(cells);low=points.min(axis=0);high=points.max(axis=0)
        boundary=bool(low[0]==0 or low[1]==0 or high[0]==len(zs)-1 or high[1]==len(xs)-1)
        components.append({'pixels':len(cells),'x':[float(xs[low[1]]),float(xs[high[1]])],'z':[float(zs[low[0]]),float(zs[high[0]])],'touchesGridBoundary':boundary})
    components.sort(key=lambda item:item['pixels'],reverse=True)
    np.savez_compressed(directory/(side+'.npz'),xs=xs,zs=zs,depth=depth)
    report['sides'][side]=components
report['sampleCoordinateAxes']={side:('worldY' if side in ('right','left') else 'worldX') for side in args.sides}
(directory/'inspection.json').write_text(json.dumps(report,indent=2),'utf-8')
print(json.dumps(report),flush=True)

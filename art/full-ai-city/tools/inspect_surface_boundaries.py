"""Measure existing raw-neural boundary loops without changing source geometry."""
from pathlib import Path
from types import SimpleNamespace
import sys,json,argparse
import bmesh
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

parser=argparse.ArgumentParser();parser.add_argument('--region',required=True);parser.add_argument('--asset',required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
state=json.loads((lod.ART/'queue'/args.region/(args.asset+'.json')).read_text('utf-8'))
lod.clear_scene();obj,_=lod.p.import_body(Path(state['rawGLB']['path']));settings=SimpleNamespace(height=1.,footprint=1.,pitch=0,roll=0,yaw=180,no_auto_upright=False,max_upright=18);lod.p.upright(obj,settings)
bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.000002);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table()
edges={e for e in bm.edges if e.is_boundary};groups=[]
while edges:
    first=edges.pop();component={first};stack=[first]
    while stack:
        edge=stack.pop()
        for vertex in edge.verts:
            for linked in vertex.link_edges:
                if linked in edges:edges.remove(linked);component.add(linked);stack.append(linked)
    vertices={v for e in component for v in e.verts};coordinates=[list(v.co) for v in vertices];lo=[min(p[i] for p in coordinates) for i in range(3)];hi=[max(p[i] for p in coordinates) for i in range(3)];perimeter=sum(e.calc_length() for e in component)
    groups.append({'edges':len(component),'vertices':len(vertices),'boundsMin':lo,'boundsMax':hi,'center':[(a+b)/2 for a,b in zip(lo,hi)],'extent':[b-a for a,b in zip(lo,hi)],'perimeter':perimeter,'simpleLoop':all(sum(e in component for e in v.link_edges)==2 for v in vertices)})
groups.sort(key=lambda r:r['perimeter'],reverse=True)
directory=lod.ART/'work/shading-diagnostic'/args.region/args.asset;directory.mkdir(parents=True,exist_ok=True);(directory/'raw-boundaries.json').write_text(json.dumps({'source':state['rawGLB'],'coordinateSystem':'Blender Z-up +front=-Y','boundaryComponents':groups},indent=2),'utf-8')
print(json.dumps({'components':len(groups),'largest':groups[:25]},indent=2),flush=True);bm.free()

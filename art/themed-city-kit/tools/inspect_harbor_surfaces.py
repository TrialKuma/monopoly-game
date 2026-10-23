"""Read-only mesh depth samples for inspected harbor facade cavities."""
from pathlib import Path
import bpy,bmesh,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
obj=bpy.data.objects['harbor_house_ai_structure']
bm=bmesh.new();bm.from_mesh(obj.data);bm.normal_update();tree=BVHTree.FromBMesh(bm)
samples=[]
for label,origin_y,direction in [('front',-3,1),('back',3,-1)]:
    for zi in range(20,-1,-1):
        z=.05*zi;row=''
        for xi in range(49):
            x=-1.2+.05*xi
            hit,normal,face,distance=tree.ray_cast(Vector((x,origin_y,z)),Vector((0,direction,0)),6)
            depth=hit.y*-direction if hit is not None else None
            row+=('X' if hit is None else '.' if depth<.4 else '+' if depth<.6 else 'o' if depth<.8 else '#')
            samples.append({'view':label,'x':x,'z':z,'hit':list(hit) if hit else None})
        print(label,z,row,flush=True)
out=Path(__file__).resolve().parents[3]/'art/themed-city-kit/reports/harbor-depth-diagnostic.json'
out.write_text(json.dumps(samples,indent=2),encoding='utf-8');bm.free()

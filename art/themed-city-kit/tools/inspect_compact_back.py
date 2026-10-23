"""Read-only mesh-space depth diagnostics of the inspected rear corner."""
from pathlib import Path
import bpy,bmesh,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
obj=bpy.data.objects['compact_house_ai_structure']
bm=bmesh.new();bm.from_mesh(obj.data);bm.normal_update()
tree=BVHTree.FromBMesh(bm)
samples=[]
for zindex in range(52,-1,-1):
    z=.025*zindex;row=''
    for xindex in range(101):
        x=-1.25+.025*xindex
        hit,normal,face,distance=tree.ray_cast(Vector((x,3,z)),Vector((0,-1,0)),6)
        row+=('X' if hit is None else '.' if hit.y<0 else '+' if hit.y<.4 else 'o' if hit.y<.6 else '#')
        if x<-.5:samples.append({'x':x,'z':z,'hit':list(hit) if hit else None})
    print('BACK_DEPTH',round(z,3),row,flush=True)
out=Path(__file__).resolve().parents[3]/'art/themed-city-kit/reports/compact-back-depth-diagnostic.json'
out.write_text(json.dumps(samples,indent=2),encoding='utf-8')
bm.free()

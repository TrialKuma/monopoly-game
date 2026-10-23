"""Read-only connected boundary diagnostics on the generated classic house."""
from pathlib import Path
import bpy,bmesh,json
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[3]
obj=bpy.data.objects['classic_house_ai_structure']
bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table()
edges=[edge for edge in bm.edges if edge.is_boundary]
adj={}
for edge in edges:
    for vertex in edge.verts:adj.setdefault(vertex.index,[]).append(edge)
seen=set();components=[]
for edge in edges:
    if edge.index in seen:continue
    queue=[edge];current=[];vertices={}
    while queue:
        item=queue.pop()
        if item.index in seen:continue
        seen.add(item.index);current.append(item.index)
        for vertex in item.verts:
            vertices[vertex.index]=list(vertex.co)
            queue.extend(adj.get(vertex.index,[]))
    lo=[min(c[i] for c in vertices.values()) for i in range(3)]
    hi=[max(c[i] for c in vertices.values()) for i in range(3)]
    components.append({'edges':current,'count':len(current),'vertices':len(vertices),
        'min':lo,'max':hi,'center':[(a+b)/2 for a,b in zip(lo,hi)],
        'closed_simple':all(len(adj[v])==2 for v in vertices)})
components.sort(key=lambda item:item['count'],reverse=True)
report={'blend':bpy.data.filepath,'boundary_edges':len(edges),'components':components}
out=ROOT/'art/themed-city-kit/reports/classic-boundary-diagnostic.json'
out.write_text(json.dumps(report,indent=2),encoding='utf-8')
front=[{k:v for k,v in row.items() if k!='edges'}|{'component':i}
    for i,row in enumerate(components) if row['min'][1]<-.45 and row['min'][2]<.75]
print('FRONT_LOW_BOUNDARIES',json.dumps(front[:60]),flush=True)
tree=BVHTree.FromBMesh(bm)
for zindex in range(30,-1,-1):
    z=.025*zindex
    row=''
    for xindex in range(46):
        x=.025*xindex
        hit,normal,face,distance=tree.ray_cast(Vector((x,-3,z)),Vector((0,1,0)),6)
        row+=('X' if hit is None else '.' if hit.y>-.3 else '+' if hit.y>-.45 else '#')
    print('DEPTH',round(z,3),row,flush=True)
bm.free()

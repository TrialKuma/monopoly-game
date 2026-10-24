"""Measure the generated facade at a rejected black patch without editing it."""
from pathlib import Path
import json,sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod
directory=lod.ART/'work/shading-diagnostic/classic/villa_3'
lod.clear_scene();obj,_=lod.p.import_body(directory/'raw-grey.glb')
tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
rows=[]
for z in (.48,.50,.52,.54,.56,.58,.60,.62):
    samples=[]
    for x in (-.30,-.28,-.26,-.24,-.22,-.20,-.18):
        point,normal,index,distance=tree.ray_cast(Vector((x,2,z)),Vector((0,-1,0)))
        samples.append({'x':x,'hitY':round(point.y,5) if point else None,'normal':list(normal) if normal else None})
    rows.append({'z':z,'samples':samples})
(directory/'back-fold-rays.json').write_text(json.dumps(rows,indent=2),'utf-8')
for row in rows:print(row['z'],[s['hitY'] for s in row['samples']],flush=True)

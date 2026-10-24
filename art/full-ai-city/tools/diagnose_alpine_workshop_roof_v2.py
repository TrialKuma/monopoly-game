"""Read-only camera rays for the two inspected workshop roof gaps."""
from pathlib import Path
from types import SimpleNamespace
import json, sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).parent))
import process_lod as lod

def main():
    out=lod.ART/'work/alpine-workshop-roof-v2';out.mkdir(parents=True,exist_ok=True)
    source=lod.ART/'work/repair-builders-closed/repaired-normalized.glb'
    args=SimpleNamespace(region='alpine',asset='builders_guild',lod='near',height=1.,footprint=1.,render_directory=out,render_prefix='source-')
    frames=lod.render(source,args,['right'])
    scene=bpy.context.scene;bpy.context.view_layer.update()
    obj=next(o for o in scene.objects if o.type=='MESH')
    tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get())
    inverse=obj.matrix_world.inverted();cam=scene.camera;rotation=cam.matrix_world.to_quaternion()
    direction=rotation@Vector((0,0,-1));local_direction=(inverse.to_3x3()@direction).normalized()
    rows=[]
    for label,cx,cy in [('upper',200,147),('lower',315,232)]:
        for dx in [-8,-4,0,4,8]:
            for dy in [-8,-4,0,4,8]:
                px,py=cx+dx,cy+dy
                screen=Vector(((px+.5)/512*1.4-.7,.7-(py+.5)/512*1.4,0))
                origin=cam.matrix_world@screen
                hit,normal,index,distance=tree.ray_cast(inverse@origin,local_direction)
                world=(obj.matrix_world@hit) if hit is not None else None
                rows.append({'region':label,'pixel':[px,py],'hitBlender':list(world) if world is not None else None,'normalBlender':list((obj.matrix_world.to_3x3()@normal).normalized()) if normal is not None else None,'face':index})
    grey=bpy.data.materials.new('Roof diagnostic only');grey.use_nodes=True
    shader=grey.node_tree.nodes['Principled BSDF'];shader.inputs['Base Color'].default_value=(.52,.52,.52,1);shader.inputs['Roughness'].default_value=.8
    scene.view_layers[0].material_override=grey;frame=out/'source-grey-right.png';scene.render.filepath=str(frame);bpy.ops.render.render(write_still=True)
    report={'source':lod.p.file_evidence(source),'scope':'Read-only normalized repaired native source. No geometry or material export.','renders':frames,'grey':lod.p.file_evidence(frame),'rays':rows,'tool':lod.p.file_evidence(Path(__file__))}
    target=out/'diagnostic.json';target.write_text(json.dumps(report,indent=2)+'\n','utf8');print(json.dumps(lod.p.file_evidence(target)),flush=True)

if __name__=='__main__':main()

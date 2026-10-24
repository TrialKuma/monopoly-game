"""Read-only source surface measurements at reviewed studio-frame pixel ROIs."""
from pathlib import Path
from types import SimpleNamespace
import argparse,json,sys,shutil
import numpy as np
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform
sys.path.insert(0,str(Path(__file__).parent))
import process_lod as lod

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--spec',required=True,type=Path);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
 spec=json.loads(args.spec.read_text('utf8'));raw=lod.ROOT/spec['source']['path'];assert lod.p.sha256(raw)==spec['source']['sha256']
 out=lod.ROOT/spec['outputDirectory'];out.mkdir(parents=True,exist_ok=True)
 lod.clear_scene();obj,_=lod.p.import_body(raw)
 orientation=lod.p.upright(obj,SimpleNamespace(height=1.,footprint=1.,pitch=0.,roll=0.,yaw=180.,no_auto_upright=False,max_upright=18.))
 lo,hi=lod.p.bounds([obj],world=True);target=Vector((0,0,(hi.z+lo.z)/2))
 tree=BVHTree.FromObject(obj,bpy.context.evaluated_depsgraph_get());uv=obj.data.uv_layers.active.data
 material=obj.data.materials[0];bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED');image=bsdf.inputs['Base Color'].links[0].from_node.image
 iw,ih=image.size;pixels=np.empty(iw*ih*4,dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(ih,iw,4)
 positions={'front':(0,-4,.9),'right':(4,0,.9),'back':(0,4,.9),'left':(-4,0,.9),'iso':(2.8,-4,2.6)}
 results=[]
 for region in spec['regions']:
  location=Vector(positions[region['view']]);rotation=(target-location).to_track_quat('-Z','Y');direction=rotation@Vector((0,0,-1))
  resolution=region.get('resolution',512);cx,cy=region['pixel'];radius=region.get('radius',12);step=region.get('step',3);rows=[]
  for dy in range(-radius,radius+1,step):
   for dx in range(-radius,radius+1,step):
    x,y=cx+dx,cy+dy;origin=location+rotation@Vector((((x+.5)/resolution-.5)*1.4,(.5-(y+.5)/resolution)*1.4,0))
    point,normal,index,distance=tree.ray_cast(origin,direction)
    row={'pixel':[x,y],'position':None}
    if point is not None:
     face=obj.data.polygons[index];tex=barycentric_transform(point,*[obj.data.vertices[k].co for k in face.vertices],*[Vector((*uv[k].uv,0)) for k in face.loop_indices])[:2]
     rgb=pixels[min(ih-1,max(0,int(tex[1]*ih))),min(iw-1,max(0,int(tex[0]*iw))),:3]
     row.update(position=list(point),normal=list(normal),faceIndex=index,uv=list(tex),rgb=list(map(float,rgb)))
    rows.append(row)
  results.append({'region':region,'samples':rows})
 snapshot=lod.ART/'reports/tool-snapshots'/(lod.p.sha256(Path(__file__))+'-'+Path(__file__).name)
 if not snapshot.exists():shutil.copyfile(__file__,snapshot)
 report={'status':'read_only_measurement','source':lod.p.file_evidence(raw),'specification':spec,'orientation':orientation,'bounds':{'min':list(lo),'max':list(hi)},'regions':results,'tool':lod.p.file_evidence(snapshot),'sourceUnchanged':lod.p.sha256(raw)==spec['source']['sha256'],'scope':'Camera/pixel rays match process_lod studio 512px orthographic views. Positions are normalized Blender coordinates; no mesh edits or exports.'}
 dest=out/'surface-measurements.json';assert not dest.exists();dest.write_text(json.dumps(report,indent=2)+'\n','utf8');print(json.dumps(lod.p.file_evidence(dest)),flush=True)
if __name__=='__main__':main()

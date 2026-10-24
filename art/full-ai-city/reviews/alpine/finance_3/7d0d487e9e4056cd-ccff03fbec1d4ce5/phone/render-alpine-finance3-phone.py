from pathlib import Path
from types import SimpleNamespace
from mathutils import Vector
import sys,json,bpy
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city';sys.path.insert(0,str(ART/'tools'));import process_lod as lod
source=ART/'candidates/alpine/finance_3.glb';expected='7d0d487e9e4056cd0745430425967fe74661406c4b13144934e5bf73b8f2e65d';assert lod.p.sha256(source)==expected
out=ART/'work/public-phone-review/alpine-finance3-7d0d487e';out.mkdir(parents=True,exist_ok=True);assert not (out/'inspection.json').exists()
args=SimpleNamespace(region='alpine',asset='finance_3',lod='near',height=1.,footprint=1.,render_directory=out)
r=lod.render(source,args,());scene=bpy.context.scene;scene.render.resolution_x=scene.render.resolution_y=256;cam=scene.camera;target=Vector((0,0,(r['boundsBlender']['min'][2]+r['boundsBlender']['max'][2])/2))
for label,pos in [('front',(0,-4,.9)),('iso',(2.8,-4,2.6))]:
 cam.location=Vector(pos);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();p=out/('phone-'+label+'.png');scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);r['views'].append(lod.p.file_evidence(p))
assert lod.p.sha256(source)==expected
r.update(candidate=lod.p.file_evidence(source),resolution=[256,256],sourceBytesChanged=False,tool=lod.p.file_evidence(Path(__file__)),purpose='Phone-visible front-clock-facade and silhouette acceptance, not water-tightness',createdAt=lod.now());(out/'inspection.json').write_text(json.dumps(r,indent=2),encoding='utf8')

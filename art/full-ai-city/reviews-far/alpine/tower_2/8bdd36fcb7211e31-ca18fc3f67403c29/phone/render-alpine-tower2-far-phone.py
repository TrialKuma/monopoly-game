from pathlib import Path
from types import SimpleNamespace
from mathutils import Vector
import sys,json,bpy
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city';sys.path.insert(0,str(ART/'tools'));import process_lod as lod
source=ART/'candidates-far/alpine/tower_2.glb';expected='8bdd36fcb7211e31d23f3eb351b8540fa6bbe685be8488523e23478e154deefa';assert lod.p.sha256(source)==expected
out=ART/'work/public-phone-review/alpine-tower2-far-8bdd36fc';out.mkdir(parents=True,exist_ok=True);assert not (out/'inspection.json').exists()
args=SimpleNamespace(region='alpine',asset='tower_2',lod='far',height=1.,footprint=1.,render_directory=out)
r=lod.render(source,args,());scene=bpy.context.scene;scene.render.resolution_x=scene.render.resolution_y=128;cam=scene.camera;target=Vector((0,0,(r['boundsBlender']['min'][2]+r['boundsBlender']['max'][2])/2))
for label,pos in [('front',(0,-4,.9)),('back',(0,4,.9)),('left',(-4,0,.9)),('iso',(2.8,-4,2.6))]:
 cam.location=Vector(pos);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();p=out/('phone-'+label+'.png');scene.render.filepath=str(p);bpy.ops.render.render(write_still=True);r['views'].append(lod.p.file_evidence(p))
assert lod.p.sha256(source)==expected
r.update(candidate=lod.p.file_evidence(source),resolution=[128,128],sourceBytesChanged=False,tool=lod.p.file_evidence(Path(__file__)),purpose='128px scenic silhouette and window readability, not near-detail parity',createdAt=lod.now());(out/'inspection.json').write_text(json.dumps(r,indent=2),encoding='utf8')

from pathlib import Path
from types import SimpleNamespace
import sys,json,bpy
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city';sys.path.insert(0,str(ART/'tools'));import process_lod as lod
source=ART/'candidates/alpine/vault_bank.glb';expected='db74706e3925ba19144092a1eb056d6ef04f8c8a5589f17967ac5064d712e540';assert lod.p.sha256(source)==expected
out=ART/'work/public-phone-review/alpine-vault-bank-db74706e';out.mkdir(parents=True,exist_ok=True);assert not (out/'inspection.json').exists()
def phone_resolution(scene):scene.render.resolution_x=scene.render.resolution_y=256
bpy.app.handlers.render_pre.append(phone_resolution)
args=SimpleNamespace(region='alpine',asset='vault_bank',lod='near',height=1.,footprint=1.,render_directory=out,render_prefix='phone-')
r=lod.render(source,args,('front','back','iso'))
bpy.app.handlers.render_pre.remove(phone_resolution)
assert lod.p.sha256(source)==expected
r.update(candidate=lod.p.file_evidence(source),resolution=[256,256],sourceBytesChanged=False,tool=lod.p.file_evidence(Path(__file__)),purpose='Phone-frame color acceptance; no water-tightness claim and no geometry edits',createdAt=lod.now())
(out/'inspection.json').write_text(json.dumps(r,indent=2),encoding='utf8');print('PHONE_REVIEW_READY',flush=True)

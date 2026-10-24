"""Freeze the small dependency graph of the reviewed villa3 processing report.

No image or model is changed. Old experiment reports remain byte-identical.
Only a new report graph gets portable, content-addressed small dependencies.
"""
from pathlib import Path
import json,hashlib,copy,re
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
SOURCE=ART/'work/villa3-fine-nearest-45k/closed-patches/angle66-candidates/classic/villa_3.json'
DEST=ART/'reports/local-repairs/classic/villa_3/9cd6e3f4d9c66ae80-provenance';DEST.mkdir(parents=True,exist_ok=True)
TOOLS=ART/'reports/tool-snapshots';TOOLS.mkdir(parents=True,exist_ok=True)
memo={};copied=[];verified=[];large_before={};active=set()
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def local(value):
 p=Path(value);return p if p.is_absolute() else ROOT/p
def relative(path):return path.resolve().relative_to(ROOT).as_posix()
def receipt(path):return {'path':relative(path),'sha256':digest(path),'bytes':path.stat().st_size}
def is_work(path):return 'work' in path.relative_to(ROOT).parts
def save_exact(path,data):
 if path.exists() and path.read_bytes()!=data:raise RuntimeError('Would overwrite frozen evidence: '+str(path))
 if not path.exists():path.write_bytes(data)
def freeze(path):
 path=path.resolve();key=str(path)
 if key in memo:return memo[key]
 if key in active:raise RuntimeError('Circular small-report dependency')
 active.add(key)
 if path.suffix.lower()=='.json':
  original=json.loads(path.read_text('utf8'));rewritten=walk(copy.deepcopy(original));changed=rewritten!=original
  if changed or is_work(path):
   data=(json.dumps(rewritten,indent=2,ensure_ascii=False)+'\n').encode('utf8');sha=hashlib.sha256(data).hexdigest();name=re.sub(r'^[0-9a-f]{16,64}-','',path.name)
   target=DEST/(sha+'-'+name);save_exact(target,data);copied.append({'original':receipt(path),'frozen':receipt(target),'rewrittenReferences':changed})
  else:target=path
 elif path.suffix.lower() in ('.py','.js','.mjs') and is_work(path):
  name=re.sub(r'^[0-9a-f]{16,64}-','',path.name);target=TOOLS/(digest(path)+'-'+name);save_exact(target,path.read_bytes());copied.append({'original':receipt(path),'frozen':receipt(target),'rewrittenReferences':False})
 else:
  target=path
  if path.suffix.lower() in ('.glb','.blend','.png','.jpg','.jpeg','.webp'):large_before[key]=digest(path)
 memo[key]=target;active.remove(key);return target
def walk(value):
 if isinstance(value,list):return [walk(item) for item in value]
 if isinstance(value,dict):
  if isinstance(value.get('path'),str) and isinstance(value.get('sha256'),str):
   p=local(value['path']).resolve()
   if not p.is_file():raise RuntimeError('Missing dependency: '+str(p))
   if digest(p)!=value['sha256']:raise RuntimeError('Stale dependency: '+str(p))
   target=freeze(p);result={key:walk(item) for key,item in value.items() if key not in ('path','sha256','bytes')}
   result.update(path=relative(target),sha256=digest(target))
   if 'bytes' in value:result['bytes']=target.stat().st_size
   verified.append({'input':relative(p),'output':relative(target),'sha256':digest(target)})
   return result
  return {key:walk(item) for key,item in value.items()}
 if isinstance(value,str):
  try:p=local(value).resolve()
  except (ValueError,OSError):return value
  try:
   if p.suffix.lower() in ('.json','.py','.js','.mjs') and p.is_file() and is_work(p):return relative(freeze(p))
  except (ValueError,OSError):pass
 return value
source_sha=digest(SOURCE);frozen=freeze(SOURCE)
assert digest(SOURCE)==source_sha
for name,sha in large_before.items():assert digest(Path(name))==sha
index={'status':'small_provenance_dependencies_frozen','reviewedCandidateSha256':'9cd6e3f4d9c66ae805161dbfc7831cf71f06b81cbadb5ea8cdc2c10592aa694e','inputReport':receipt(SOURCE),'frozenProcessingReport':receipt(frozen),'copiedSmallFiles':copied,'verifiedReferences':verified,'modelsAndPixelsUnchanged':True,'verifiedUnchangedLargeOrImageFiles':len(large_before),'note':'Only small report/tool paths and matching hashes changed in new copies. Existing work reports, all GLB/Blend, and all image bytes remain unchanged. Frozen dependencies live outside ignored work directories.'}
save_exact(DEST/'freeze-index.json',(json.dumps(index,indent=2,ensure_ascii=False)+'\n').encode('utf8'))
print(json.dumps({'report':receipt(frozen),'index':receipt(DEST/'freeze-index.json'),'copiedFiles':len(copied),'verifiedReferences':len(verified),'preservedLargeOrImages':len(large_before)},ensure_ascii=False,indent=2))

"""Freeze reviewed neutral/source comparison next to an explicit rejected model."""
from pathlib import Path
import argparse,json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 c=argparse.ArgumentParser()
 for key in ('map','asset','sha256','finding'):c.add_argument('--'+key,required=True)
 a=c.parse_args();source=ART/'work/core-review'/a.map/a.asset/(a.sha256[:16]+'-geometry-diagnostic');data=json.loads((source/'diagnostic.json').read_text('utf8'))
 assert data['candidate']['sha256']==a.sha256 and len(a.finding)>30
 dest=ART/'reviews-rejected'/a.map/a.asset/a.sha256[:16]/'geometry-diagnostic';assert(dest.parent/'rejection.json').exists();dest.mkdir(parents=True,exist_ok=True)
 def evidence(p):return {'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size}
 def copy(p):
  target=dest/p.name
  if target.exists():assert sha(target)==sha(p)
  else:shutil.copyfile(p,target)
  return evidence(target)
 images={p.name:copy(p) for p in source.glob('*.png')}
 for row in data['neutralViews']:
  item=images[Path(row['path']).name];assert item['sha256']==row['sha256'];row.update(item)
 data['sourceViews']['views']=[images[Path(p).name] for p in data['sourceViews']['views']]
 data.update(status='actually_reviewed_comparison_for_rejected_candidate',reviewer='progression_design',finding=a.finding,originalDiagnosticReceipt=copy(source/'diagnostic.json'),allEvidenceImages=list(images.values()))
 target=dest/'inspection.json';assert not target.exists();target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8');print(json.dumps(evidence(target)))
if __name__=='__main__':main()

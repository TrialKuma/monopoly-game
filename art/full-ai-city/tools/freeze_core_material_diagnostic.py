"""Freeze inspected source/final neutral evidence for an exact approved core."""
from pathlib import Path
import argparse,json,shutil
import pack_runtime as p

def main():
 c=argparse.ArgumentParser()
 for key in ('map','asset','sha256'):c.add_argument('--'+key,required=True)
 a=c.parse_args();reg=json.loads((p.ART/'approved-assets.json').read_text('utf8'));entry=p.verified_entry(reg,a.map,a.asset)
 assert entry['candidate']['sha256']==a.sha256
 folder=p.ART/'work/core-review'/a.map/a.asset/(a.sha256[:16]+'-geometry-diagnostic')
 original=folder/'diagnostic.json';data=json.loads(original.read_text('utf8'))
 assert data['candidate']['sha256']==a.sha256 and data['processingReport']['sha256']==entry['processingReport']['sha256']
 out=p.local(entry['reviewImages'][0]['path']).parent/'extra'/'geometry-diagnostic';out.mkdir(parents=True,exist_ok=True)
 def evidence(path):return {'path':p.relative(path),'sha256':p.digest(path),'bytes':path.stat().st_size}
 def copy(path):
  path=p.local(path);target=out/path.name
  if target.exists():assert p.digest(target)==p.digest(path)
  else:shutil.copyfile(path,target)
  return evidence(target)
 images={f.name:copy(f) for f in folder.glob('*.png')}
 for row in data['neutralViews']:
  assert images[Path(row['path']).name]['sha256']==row['sha256'];row.update(images[Path(row['path']).name])
 data['sourceViews']['views']=[images[Path(x).name] for x in data['sourceViews']['views']]
 data['allActualImages']=list(images.values());data['sourceDiagnosticReceipt']=copy(original)
 data['candidate']=entry['candidate'];data['processingReport']=entry['processingReport'];data['reviewNote']=entry['reviewNote']
 data['status']='actually_inspected_with_exact_candidate_approval';data['reviewedAtUtc']=entry['reviewedAtUtc']
 target=out/'inspection.json';assert not target.exists();target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n','utf8');print(json.dumps(evidence(target)))
if __name__=='__main__':main()

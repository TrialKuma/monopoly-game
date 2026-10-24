"""Archive extra visual inspection frames after an explicit exact-hash approval."""
from pathlib import Path
import argparse,json,shutil
import pack_runtime as p

def main():
 cli=argparse.ArgumentParser();cli.add_argument('--map',required=True);cli.add_argument('--asset',required=True);cli.add_argument('--sha256',required=True);args=cli.parse_args()
 registry=json.loads((p.ART/'approved-assets.json').read_text('utf8'));entry=p.verified_entry(registry,args.map,args.asset)
 assert entry['candidate']['sha256']==args.sha256
 source=p.ART/'work/core-review'/args.map/args.asset/args.sha256[:16]/'inspection.json'
 data=json.loads(source.read_text('utf8'))
 assert data['candidate']['sha256']==args.sha256 and data['processingReport']['sha256']==entry['processingReport']['sha256']
 dest=p.local(entry['reviewImages'][0]['path']).parent/'extra';dest.mkdir(parents=True,exist_ok=True)
 def evidence(path):return {'path':p.relative(path),'sha256':p.digest(path),'bytes':path.stat().st_size}
 for row in data['views']:
  src=p.local(row['path']);assert p.digest(src)==row['sha256'];target=dest/src.name
  if target.exists():assert p.digest(target)==row['sha256']
  else:shutil.copyfile(src,target)
  row.update(evidence(target))
 data['candidate']=entry['candidate'];data['processingReport']=entry['processingReport'];data['status']='reviewed_with_exact_candidate_approval';data['reviewNote']=entry['reviewNote'];data['reviewedAtUtc']=entry['reviewedAtUtc']
 target=dest/'inspection.json';payload=(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode('utf8')
 if target.exists():assert target.read_bytes()==payload
 else:target.write_bytes(payload)
 print(json.dumps(evidence(target),ensure_ascii=False))

if __name__=='__main__':main()

"""Freeze later close/phone frames without rewriting an existing rejection."""
from pathlib import Path
import argparse,json,shutil
import pack_runtime as p

def main():
 cli=argparse.ArgumentParser()
 for key in ('map','asset','sha256','finding'):cli.add_argument('--'+key,required=True)
 args=cli.parse_args()
 directory=p.ART/'reviews-rejected'/args.map/args.asset/args.sha256[:16]
 rejection=directory/'rejection.json'
 assert rejection.exists(),'An explicit rejection must already exist'
 source=p.ART/'work/core-review'/args.map/args.asset/args.sha256[:16]/'inspection.json'
 data=json.loads(source.read_text('utf8'))
 assert data['candidate']['sha256']==args.sha256
 dest=directory/'phone-close';dest.mkdir(parents=True,exist_ok=True)
 def evidence(path):return {'path':p.relative(path),'sha256':p.digest(path),'bytes':path.stat().st_size}
 frozen=[]
 for row in data['views']:
  original=p.local(row['path']);assert p.digest(original)==row['sha256']
  target=dest/original.name
  if target.exists():assert p.digest(target)==row['sha256']
  else:shutil.copyfile(original,target)
  frozen.append({**row,**evidence(target)})
 tool=Path(__file__);snapshot=p.ART/'reports/tool-snapshots'/(p.digest(tool)+'-'+tool.name)
 if not snapshot.exists():shutil.copyfile(tool,snapshot)
 result={**data,'status':'actually_viewed_rejection_scale_supplement','views':frozen,'finding':args.finding,'originalRejection':evidence(rejection),'freezeTool':evidence(snapshot)}
 payload=(json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode('utf8')
 target=dest/'inspection.json'
 if target.exists():assert target.read_bytes()==payload
 else:target.write_bytes(payload)
 print(json.dumps(evidence(target),ensure_ascii=False))

if __name__=='__main__':main()

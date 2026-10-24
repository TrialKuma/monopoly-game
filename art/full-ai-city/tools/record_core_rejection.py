"""Freeze an explicit visual rejection; never classify or alter a model."""
from pathlib import Path
import argparse,json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
def local(path):
 path=Path(path);return path if path.is_absolute() else ROOT/path
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def evidence(path):return {'path':path.resolve().relative_to(ROOT).as_posix(),'sha256':sha(path),'bytes':path.stat().st_size}
def copy_exact(path,target):
 if target.exists():assert sha(target)==sha(path)
 else:shutil.copyfile(path,target)
 return evidence(target)

def main():
 cli=argparse.ArgumentParser();cli.add_argument('--map',required=True);cli.add_argument('--asset',required=True);cli.add_argument('--sha256',required=True);cli.add_argument('--reason',required=True);cli.add_argument('--reviewer',default='progression_design');cli.add_argument('--report',type=Path);args=cli.parse_args()
 report_path=args.report or ART/'candidates'/args.map/(args.asset+'.json');report=json.loads(report_path.read_text('utf8'));candidate=local(report['processedCandidate']['path']);assert sha(candidate)==report['processedCandidate']['sha256']==args.sha256
 assert report['region']==args.map and report['asset']==args.asset
 assert len(args.reason)>30
 dest=ART/'reviews-rejected'/args.map/args.asset/args.sha256[:16];dest.mkdir(parents=True,exist_ok=True)
 result={'status':'visually_rejected','candidate':copy_exact(candidate,dest/'candidate.glb'),'processingReport':copy_exact(report_path,dest/'processing.json'),'reason':args.reason,'sourceAttribution':'Pending source/export/decoder diagnosis; this rejection does not assert where the defect originated.','reviewer':args.reviewer,'actualFiveViews':[],'extraViews':[]}
 for view in report['renderedCandidate']['views']:
  path=local(view);result['actualFiveViews'].append(copy_exact(path,dest/path.name))
 extra=ART/'work/core-review'/args.map/args.asset/args.sha256[:16]
 for path in sorted(extra.glob('*.png')):result['extraViews'].append(copy_exact(path,dest/path.name))
 target=dest/'rejection.json';payload=(json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode('utf8')
 if target.exists():assert target.read_bytes()==payload
 else:target.write_bytes(payload)
 print(json.dumps(evidence(target),ensure_ascii=False))

if __name__=='__main__':main()

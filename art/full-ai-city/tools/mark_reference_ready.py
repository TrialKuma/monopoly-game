"""Record an explicit visual review; never infer approval from file existence."""
from pathlib import Path
import argparse,json,hashlib
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[3]
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--reviewer',required=True);parser.add_argument('--note',required=True);parser.add_argument('assets',nargs='+');args=parser.parse_args()
    for identity in args.assets:
        parts=identity.split('/')
        if len(parts)!=2 or any(not p.replace('_','').isalnum() for p in parts):raise ValueError(identity)
        path=ROOT/'art/full-ai-city/references'/parts[0]/(parts[1]+'.generation.json')
        data=json.loads(path.read_text('utf-8'));image=path.with_suffix('').with_suffix('.png')
        actual=hashlib.sha256(image.read_bytes()).hexdigest()
        if (data.get('sha256') or data.get('archivedSha256'))!=actual:raise ValueError('Mismatched reference hash: '+identity)
        data['status']='reference_ready_for_native_multiview'
        data['visualReview']={'reviewer':args.reviewer,'status':'passed_reference_semantics','notes':args.note,'recordedAt':datetime.now(timezone.utc).isoformat(),'sourceSha256':actual,'inputPreprocessStillRequired':True}
        temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8');temporary.replace(path)
        print(identity,actual)
if __name__=='__main__':main()

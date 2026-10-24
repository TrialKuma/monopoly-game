"""Project-local wrapper around the exact verified native MV single-job runner."""
from pathlib import Path
import argparse,hashlib,importlib.util,json,sys,shutil
ROOT=Path(__file__).resolve().parents[3];ART=ROOT/'art/full-ai-city'
LEGACY=ROOT/'art/full-ai-city/tools/native_mv_runner.py'
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--job-id',required=True);parser.add_argument('--views-dir',required=True)
    parser.add_argument('--seed',type=int,default=9247)
    args=parser.parse_args()
    folder=ART/'reports'/args.job_id;folder.mkdir(parents=True,exist_ok=True)
    wrapper_snapshot=folder/'batch-wrapper-source.py';shutil.copy2(__file__,wrapper_snapshot)
    spec=importlib.util.spec_from_file_location('verified_native_mv_runner',LEGACY)
    legacy=importlib.util.module_from_spec(spec);sys.modules[spec.name]=legacy;spec.loader.exec_module(legacy)
    legacy.ART=ART;legacy.base.CACHE=ART/'cache'
    sys.argv=[str(LEGACY),'--asset-id',args.job_id,'--views-dir',args.views_dir,'--seed',str(args.seed),'--run']
    try:legacy.main()
    finally:
        report=ART/'reports'/args.job_id/(args.job_id+'-pixal-mv-1024-'+str(args.seed)+'.json')
        if report.exists():
            data=json.loads(report.read_text('utf-8'))
            data['batch_wrapper']={'path':str(wrapper_snapshot),'sha256':hashlib.sha256(wrapper_snapshot.read_bytes()).hexdigest()}
            data['pipeline_boundary']='Original native 1024_cascade; no unsupported 512 branch, no persistent model lifetime changes'
            report.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':main()

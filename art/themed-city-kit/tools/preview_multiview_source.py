"""CPU studio diagnostic of the unchanged native multiview source mesh."""
from pathlib import Path
from types import SimpleNamespace
import sys, argparse, json
ROOT=Path(__file__).resolve().parents[3]
sys.path.insert(0,str(ROOT/'art/harbor/tools'))
import process_generated_model as p

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source',required=True)
parser.add_argument('--name',required=True)
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
source=p.resolve(args.source)
evidence=p.file_evidence(source)
options=SimpleNamespace(name=args.name,height=3.0,footprint=3.0,pitch=0,roll=0,
    yaw=180,no_auto_upright=False,max_upright=18,texture_size=4096,
    render_size=768,samples=24,skip_render=False,animation_config=None,
    render_directory='art/themed-city-kit/renders')
result=p.render_exported(source,options,3.0,source_preview=True)
result['source']=evidence
result['source_unchanged']=p.sha256(source)==evidence['sha256']
output=ROOT/'art/themed-city-kit/reports'/f'{args.name}.json'
output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print('RAW_SOURCE_PREVIEW',str(output),flush=True)

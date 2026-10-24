"""Archive unmodified ImageGen output and validate transparent view gutters."""
import argparse, hashlib, json, shutil
from datetime import datetime, timezone
from pathlib import Path
from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--map', required=True)
parser.add_argument('--asset', required=True)
parser.add_argument('--source', required=True)
parser.add_argument('--correction', action='append', default=[])
args = parser.parse_args()
dest = ROOT / 'art/full-ai-city/references' / args.map / (args.asset + '.png')
dest.parent.mkdir(parents=True, exist_ok=True)
source = Path(args.source)
if dest.exists():
    raise RuntimeError('Do not overwrite an existing final reference')
im = Image.open(source)
w, h = im.size
if im.mode != 'RGBA' or abs(w / h - 3) > .08:
    raise RuntimeError(f'Expected approximately 3:1 RGBA triptych, received {im.mode} {im.size}')
alpha = im.getchannel('A')
counts = (np.asarray(alpha) > 32).sum(axis=0)
boundaries = [0]
for ideal in (round(w/3), round(w*2/3)):
    start, end = ideal-int(h*.35), ideal+int(h*.35)
    gaps, run = [], None
    for x in range(start,end):
        if counts[x] <= 2:
            if run is None: run = x
        elif run is not None:
            if x-run >= 8: gaps.append((run,x))
            run=None
    if run is not None and end-run >= 8:gaps.append((run,end))
    if not gaps:raise RuntimeError('The views are not separated by a usable transparent gutter')
    gap=min(gaps,key=lambda g:abs((g[0]+g[1])/2-ideal))
    boundaries.append(round((gap[0]+gap[1])/2))
boundaries.append(w)
panels = []
for i in range(3):
    left,right=boundaries[i:i+2]
    a = alpha.crop((left, 0, right, h))
    solid = a.point(lambda value: 255 if value > 32 else 0)
    bbox = solid.getbbox()
    if not bbox or bbox[0] < 4 or bbox[2] > right-left-4 or bbox[1] < 4 or bbox[3] > h-4:
        raise RuntimeError(f'Panel {i} has clipped content or insufficient gutter: {bbox}')
    panels.append({'view': ['front', 'right', 'back'][i], 'cropBox': [left, 0, right, h], 'alphaContentBoundsInPanel': list(bbox)})
if alpha.getextrema()[0] != 0:
    raise RuntimeError('Missing real transparent pixels')
shutil.copyfile(source, dest)
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
prompt = dest.with_suffix('.prompt.txt')
metadata = {'status': 'reference_ready_for_native_multiview', 'asset': f'{args.map}_{args.asset}', 'map': args.map,
            'generator': 'built_in_imagegen', 'sourceGeneratedFile': str(source), 'archivedFile': str(dest.relative_to(ROOT)).replace('\\','/'),
            'sourceSha256': sha(source), 'archivedSha256': sha(dest), 'copiedByteIdentically': True,
            'width': w, 'height': h, 'mode': im.mode, 'transparentBackground': True, 'panels': panels,
            'layoutAnalysis': 'Transparent-gutter crops only; no image manipulation, stretching or resampling. GPU preprocessing may square-pad.',
            'promptFile': str(prompt.relative_to(ROOT)).replace('\\','/'), 'promptSha256': sha(prompt),
            'correctionPrompts': args.correction, 'visualReview': 'assistant_checked_generated_result',
            'cameraContract': 'Assumed orthographic front/right/back design views; not calibrated photographs.',
            'registeredAtUtc': datetime.now(timezone.utc).isoformat()}
dest.with_suffix('.generation.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf8')
plan_path = ROOT / 'art/full-ai-city/core-reference-plan.json'
if plan_path.exists():
    plan = json.loads(plan_path.read_text(encoding='utf8'))
    for item_path in (ROOT / 'art/full-ai-city/references').glob('*/*.generation.json'):
        item = json.loads(item_path.read_text(encoding='utf8'))
        key = item_path.parent.name + '/' + item_path.name.removesuffix('.generation.json')
        if key in plan:
            plan[key]['status'] = item['status']
            plan[key]['archivedFile'] = item['archivedFile']
    plan_path.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({'path': str(dest), 'width': w, 'height': h, 'sha256': sha(dest)}, ensure_ascii=False))

"""Validate the current 60 core native-MV input records without modifying images."""
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
REFS = ROOT / 'art/full-ai-city/references'
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
records = []
plan = {}
for region in ['classic', 'compact', 'expansion', 'harbor', 'alpine']:
    review = json.loads((REFS / region / 'core-reference-review.json').read_text(encoding='utf8'))
    assert review['status'] == 'reference_set_checked'
    for family in ['villa', 'shop', 'hotel', 'tower']:
        for level in [1, 2, 3]:
            asset = f'{family}_{level}'
            stem = REFS / region / asset
            meta_path = stem.with_suffix('.generation.json')
            if meta_path.exists():
                meta = json.loads(meta_path.read_text(encoding='utf8'))
                assert meta['status'] == 'reference_ready_for_native_multiview'
                png = stem.with_suffix('.png')
                actual = sha(png)
                prompt = stem.with_suffix('.prompt.txt')
                if meta.get('generator') == 'built_in_imagegen':
                    assert actual == meta['archivedSha256'] == meta['sourceSha256'], (region, asset, 'image hash')
                    assert actual == sha(meta['sourceGeneratedFile']), (region, asset, 'source byte copy')
                    assert sha(prompt) == meta['promptSha256'], (region, asset, 'prompt hash')
                    dimensions = [meta['width'], meta['height']]
                    panel_bounds = meta['panels']
                else:
                    # Root's revised reference schema records source identity and
                    # semantic review; adaptive panel crops are audited separately.
                    assert meta['mode'] == 'built-in image_gen edit'
                    assert meta['visualReview']['status'] == 'passed_reference_semantics'
                    assert actual == meta['sha256'] == meta['visualReview']['sourceSha256']
                    assert actual == sha(meta['generatedOutput']), (region, asset, 'edited source byte copy')
                    assert meta['panels'] == ['front', 'right', 'back']
                    assert prompt.is_file() and prompt.stat().st_size > 30
                    dimensions = meta['dimensions']
                    panel_bounds = []
                for correction in meta.get('correctionPrompts', []):
                    assert (stem.parent / correction).is_file(), correction
                with Image.open(png) as im:
                    assert im.mode == 'RGBA' and list(im.size) == dimensions
                    assert im.getchannel('A').getextrema()[0] == 0
                    assert len(meta['panels']) == 3
                    for panel in panel_bounds:
                        box = panel['cropBox']
                        bounds = panel['alphaContentBoundsInPanel']
                        assert bounds[0] >= 4 and bounds[1] >= 4
                        assert bounds[2] <= box[2] - box[0] - 4 and bounds[3] <= im.height - 4
                record = {'map': region, 'asset': asset, 'kind': 'new_imagegen_triptych', 'reference': str(png.relative_to(ROOT)).replace('\\', '/'), 'sha256': actual, 'dimensions': dimensions}
                if meta.get('revision'):
                    record['revision'] = meta['revision']
                    record['previousCanonical'] = meta.get('previousCanonical')
                plan[f'{region}/{asset}'] = {'map': region, 'asset': asset, 'prompt': prompt.read_text(encoding='utf8').strip(), 'status': meta['status'], 'archivedFile': record['reference']}
            else:
                reuse_path = stem.with_suffix('.reuse.json')
                meta = json.loads(reuse_path.read_text(encoding='utf8'))
                assert meta['status'] == 'reference_inputs_reused'
                assert asset == 'villa_2' and region != 'harbor'
                for item in meta['originalInputs']:
                    assert sha(ROOT / item['path']) == item['sha256']
                record = {'map': region, 'asset': asset, 'kind': 'reused_independent_imagegen_inputs', 'reference': str(reuse_path.relative_to(ROOT)).replace('\\', '/'), 'inputs': meta['originalInputs']}
            records.append(record)
assert len(records) == 60
assert sum(r['kind'] == 'new_imagegen_triptych' for r in records) == 56
assert sum(r['kind'] == 'reused_independent_imagegen_inputs' for r in records) == 4
summary = {'status': 'all_core_reference_inputs_ready', 'checkedAtUtc': datetime.now(timezone.utc).isoformat(), 'totalCoreAssets': 60, 'newTriptychs': 56, 'reusedIndependentSets': 4, 'modelApprovalBoundary': 'Only references are complete. Native inference, optimization, source review and runtime visual approval remain independent and mandatory.', 'records': records}
(ROOT / 'art/full-ai-city/core-reference-completion.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf8')
(ROOT / 'art/full-ai-city/core-reference-plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps({k:v for k,v in summary.items() if k != 'records'}, ensure_ascii=False))

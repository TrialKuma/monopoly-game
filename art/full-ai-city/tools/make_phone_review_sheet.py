"""Downsample existing final renders for scale review; no new render or asset edit."""
from pathlib import Path
import argparse, json, shutil
from PIL import Image, ImageDraw
from prepare_triptych import ART, evidence, atomic_json, sha


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument('candidate_report', type=Path)
    cli.add_argument('--out', type=Path, required=True)
    cli.add_argument('--cell-size', type=int, choices=(128, 256), default=256, help='Existing-render preview size;128 for scenic/far and256 for near')
    args = cli.parse_args()
    cell = args.cell_size
    report = json.loads(args.candidate_report.read_text('utf8'))
    candidate = report['processedCandidate']
    if sha(candidate['path']) != candidate['sha256']:
        raise ValueError('Candidate bytes changed')
    receipt = args.out / 'phone-review-sheet.json'
    if receipt.exists():
        raise FileExistsError('Preserve prior scale review evidence')
    views = [Path(p) for p in report['renderedCandidate']['views']]
    if len(views) != 5:
        raise ValueError('Requires all five completed final material views')
    args.out.mkdir(parents=True, exist_ok=True)
    sheet = Image.new('RGB', (5 * cell, cell + 40), '#e2e5ea')
    draw = ImageDraw.Draw(sheet)
    sources = []
    for i, path in enumerate(views):
        with Image.open(path) as original:
            if min(original.size) < cell:
                raise ValueError('Do not upscale source renders')
            source_size = original.size
            resized = original.convert('RGBA')
            resized.thumbnail((cell, cell), Image.Resampling.LANCZOS)
            background = Image.new('RGBA', resized.size, '#e2e5ea')
            background.alpha_composite(resized)
            sheet.paste(background.convert('RGB'), (i * cell, 0))
        draw.text((i * cell + 8, cell + 8), path.stem, fill='#18202b')
        sources.append({**evidence(path), 'sourceSize': list(source_size)})
    image = args.out / 'phone-review-sheet.png'
    sheet.save(image)
    tool = Path(__file__)
    snapshot = ART / 'reports/tool-snapshots' / (sha(tool) + '-' + tool.name)
    if not snapshot.exists():
        shutil.copyfile(tool, snapshot)
    proof = {
        'status': 'scale_preview_pending_actual_visual_review',
        'method': f'Existing final material renders downsampled with Lanczos to a{cell}px cell; transparency composited on neutral background. This is not a new renderer, camera view, device screenshot, or geometry inspection.',
        'candidate': candidate,
        'candidateReport': evidence(args.candidate_report),
        'sources': sources,
        'image': evidence(image),
        'tool': evidence(snapshot),
        'assetGeometryOrTextureModified': False,
        'runtimeApproved': False,
    }
    atomic_json(receipt, proof)
    print(json.dumps({'image': evidence(image), 'receipt': evidence(receipt)}, ensure_ascii=False))


if __name__ == '__main__':
    main()

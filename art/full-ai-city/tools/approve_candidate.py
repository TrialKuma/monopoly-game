"""Record an explicit visual decision for one exact candidate revision.

This command does not decide whether a model looks good. The caller must inspect
the reference, source comparison and all rendered sides before providing the
candidate SHA and a concrete review note. Approved bytes are copied out of the
worker's scratch directory so later attempts cannot silently replace them.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from contextlib import contextmanager
from datetime import datetime, timezone

import pack_runtime as p


@contextmanager
def registry_lock(path):
    # Separate reviewers own disjoint assets but merge into one decision ledger.
    # An OS lock prevents simultaneous reviews from dropping each other's entry.
    with path.with_suffix('.approval.lock').open('a+b') as handle:
        handle.seek(0, 2)
        if handle.tell() == 0:
            handle.write(b'0')
            handle.flush()
        handle.seek(0)
        if __import__('os').name == 'nt':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            handle.seek(0)
            if __import__('os').name == 'nt':
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle, fcntl.LOCK_UN)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--map', choices=p.MAPS, required=True)
    parser.add_argument('--asset', required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--note', required=True)
    parser.add_argument('--lod', choices=('near', 'far'), default='near')
    parser.add_argument('--budget-reason', help='Visual reason for an unusually complex ordinary building')
    parser.add_argument('--triangle-budget', type=int, choices=(20000, 45000, 65000),
                        help='Explicit 20k far or 45k/65k ordinary-near exception; never a new default')
    args = parser.parse_args()
    if args.asset not in p.ASSETS and (args.map, args.asset) not in (('harbor', 'lighthouse'), ('alpine', 'windmill')):
        parser.error('Asset is outside the reviewed 147-building scope')
    if len(args.note.strip()) < 30:
        parser.error('Describe the actual visual inspection')
    far = args.lod == 'far'
    if far and args.asset not in p.SCENIC_ASSETS:
        parser.error('Far LOD is restricted to architecture used by the actual scenic placements')
    base = p.ART/('candidates-far' if far else 'candidates')/args.map/args.asset
    candidate = base.with_suffix('.glb')
    report_path = base.with_suffix('.json')
    report_bytes = report_path.read_bytes()
    report = json.loads(report_bytes)
    report_revision = hashlib.sha256(report_bytes).hexdigest()[:16]
    large = args.asset.rsplit('_', 1)[0] in ('skyscraper', 'finance', 'onsen')
    hero = args.asset in p.HEROES.values()
    if args.triangle_budget and ((far and args.triangle_budget != 20000)
                                or (not far and (large or hero or args.triangle_budget == 20000))):
        parser.error('Use only 20k for far, or 45k/65k for ordinary near buildings')
    if args.triangle_budget and len(args.budget_reason or '') < 30:
        parser.error('An explicit budget exception needs a concrete visual reason')
    if not far and not large and not hero and report['triangles'] > 32000 and len(args.budget_reason or '') < 30:
        parser.error('A higher ordinary-building budget needs a concrete visual reason')
    triangle_limit = (20000 if args.triangle_budget == 20000 else 13000) if far else 46000 if large or hero else (
        65000 if args.triangle_budget == 65000 else 46000 if args.budget_reason else 32000)
    if report['triangles'] > triangle_limit:
        parser.error(f'Actual {report["triangles"]} triangles exceed the reviewed ceiling {triangle_limit}')
    if p.digest(candidate) != args.sha256 or report['processedCandidate']['sha256'] != args.sha256:
        raise ValueError('Candidate bytes changed after inspection')
    views = report['renderedCandidate']['views']
    if len(views) < 5 or not all(p.local(view).is_file() for view in views):
        raise ValueError('All four sides and an isometric review image are required')
    # Keep each approved revision immutable. Failed later checks and subsequent
    # approvals must never overwrite files referenced by an earlier decision.
    revision = args.sha256[:16]
    destination = p.ROOT/'assets/models/regions-ai'/('far' if far else 'full')/args.map/args.asset/(revision+'.glb')
    saved_report = p.ART/('processed-far' if far else 'processed')/args.map/args.asset/(revision+'-'+report_revision+'.json')
    destination.parent.mkdir(parents=True, exist_ok=True)
    saved_report.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(candidate, destination)
    saved_report.write_bytes(report_bytes)
    if p.digest(destination) != args.sha256:
        raise ValueError('Candidate changed while freezing the approved revision')
    def receipt(path):
        return {'path': p.relative(path), 'sha256': p.digest(path)}
    # Freeze the actual inspected pixels alongside the approved revision. A
    # worker may later render another seed into the same scratch filenames.
    review_dir = p.ART/('reviews-far' if far else 'reviews')/args.map/args.asset/(revision+'-'+report_revision)
    review_dir.mkdir(parents=True, exist_ok=True)
    def save_view(view):
        original = p.local(view)
        target = review_dir/original.name
        shutil.copyfile(original, target)
        return receipt(target)
    approved_views = [save_view(view) for view in views]
    source_views = [save_view(view) for view in report['renderedSource']['views']]
    sheet = report.get('reviewSheet')
    if sheet and p.digest(p.local(sheet['path'])) != sheet['sha256']:
        raise ValueError('Review sheet changed since the rendered candidate report')
    if sheet and 'candidateSha256' in sheet:
        if sheet['candidateSha256'] != args.sha256:
            raise ValueError('Review sheet belongs to another candidate version')
        sheet_sources = sheet.get('sourceImages', [])
        expected_sources = [*report['renderedSource']['views'][:2], *views]
        if [p.local(row['path']) for row in sheet_sources] != [p.local(view) for view in expected_sources]:
            raise ValueError('Review sheet does not use the inspected source and candidate views')
        for row in sheet_sources:
            if p.digest(p.local(row['path'])) != row['sha256']:
                raise ValueError('Review sheet input pixels changed after composition')
    entry = {
        'status': 'approved', 'sourceType': 'pixal_native_multiview',
        'candidate': receipt(destination),
        'processingReport': receipt(saved_report),
        'inferenceReport': receipt(p.local(report['inferenceReport']['path'])),
        'reference': receipt(p.local(report['reference']['path'])),
        'reviewViews': [view['path'] for view in approved_views],
        'sourceComparisonViews': [view['path'] for view in source_views],
        'reviewImages': approved_views,
        'sourceComparisonImages': source_views,
        'reviewSheet': save_view(sheet['path']) if sheet else None,
        'reviewNote': args.note,
        'triangleBudget': args.triangle_budget or report['requestedTriangles'],
        'budgetReason': args.budget_reason,
        'reviewedAtUtc': datetime.now(timezone.utc).isoformat(),
    }
    if not far and (args.asset in ('chance_wheel', 'builders_guild') or hero):
        motion = report.get('animation') or {}
        pose = motion.get('poseReview')
        if not pose or len(motion.get('frames', [])) < 3:
            raise ValueError('Moving buildings need actually rendered pose evidence before approval')
        if p.digest(p.local(pose['path'])) != pose['sha256']:
            raise ValueError('Motion review changed after component processing')
        entry['motionReview'] = {
            'report': save_view(pose['path']),
            'frames': [save_view(view) for view in motion['frames']],
            'driver': motion.get('driver'),
        }
    if far:
        near = json.loads((p.ART/'approved-assets.json').read_text('utf-8'))
        near_entry = p.verified_entry(near, args.map, args.asset)
        if near_entry['inferenceReport']['sha256'] != entry['inferenceReport']['sha256']:
            raise ValueError('Far LOD must use the same reviewed neural inference as the playable building')
        entry['nearSourceSha256'] = near_entry['candidate']['sha256']
    registry_file = p.ART/('approved-far-assets.json' if far else 'approved-assets.json')
    key = f'{args.map}/{args.asset}'
    with registry_lock(registry_file):
        registry = json.loads(registry_file.read_text('utf-8')) if registry_file.exists() else {
            'schemaVersion': 1, 'scope': '25 source-derived scenic LODs' if far else '145 gameplay buildings and 2 scenic centerpieces', 'assets': {}}
        previous = registry['assets'].get(key)
        if previous and previous['candidate']['sha256'] != args.sha256:
            entry['previousDecisions'] = previous.get('previousDecisions', []) + [previous]
        registry['assets'][key] = entry
        p.verified_entry(registry, args.map, args.asset)
        temporary = registry_file.with_suffix('.pending.json')
        temporary.write_text(json.dumps(registry, ensure_ascii=False, indent=2)+'\n', 'utf-8')
        temporary.replace(registry_file)
    print(json.dumps({'approved': key, 'sha256': args.sha256, 'totalApproved': len(registry['assets'])}))


if __name__ == '__main__':
    main()

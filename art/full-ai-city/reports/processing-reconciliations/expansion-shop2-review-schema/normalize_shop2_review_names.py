"""Copy a report graph to attach a previously frozen source visual review.

No model, image, original receipt, inference or rendering is changed. This asset-bound copy normalizes an existing five-view evidence list to view names,
using the exact separately frozen actual review from before LOD. It does not change
any reviewed image, judgment, geometry, original receipt or production tool.
"""
from pathlib import Path
import argparse, copy, json, sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'tools'))
from prepare_triptych import ART, ROOT, atomic_json, evidence, sha


def local(value):
    p = Path(value)
    return p if p.is_absolute() else ROOT / p


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('report', type=Path)
    parser.add_argument('--review', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    review = json.loads(args.review.read_text('utf8'))
    assert review['status'] == 'repaired_source_accepted_for_single_mobile_derivation_only'
    assert len(review['finding']) >= 30 and len(review['actualFiveViews']) == 5
    for row in review['actualFiveViews']:
        assert sha(local(row['path'])) == row['sha256']
    old_repair = local(review['repair']['path']).resolve()
    assert sha(old_repair) == review['repair']['sha256']
    original = json.loads(args.report.read_text('utf8'))
    assert original['localSurfaceRepair']['receipt']['sha256'] == review['repair']['sha256']
    assert original['completedAt'] > review['createdAt'], 'review must predate this final'
    args.out.mkdir(parents=True, exist_ok=False)
    memo, active, copies = {}, set(), []

    def rewrite(value):
        if isinstance(value, list):
            return [rewrite(item) for item in value]
        if not isinstance(value, dict):
            return value
        result = {key: rewrite(item) for key, item in value.items()}
        if isinstance(value.get('path'), str) and value.get('sha256'):
            source = local(value['path']).resolve()
            if source.suffix.lower() == '.json':
                assert sha(source) == value['sha256'], str(source)
                target = freeze(source)
                result.update(evidence(target))
        return result

    def freeze(source):
        source = source.resolve()
        if source in memo:
            return memo[source]
        assert source not in active, 'circular JSON graph'
        active.add(source)
        before = sha(source)
        document = json.loads(source.read_text('utf8'))
        # Only the concrete repair/surface/final chain needs a new link. Historical
        # review/configuration/inference records can mention unrelated assets.
        if source != old_repair and not any(key in document for key in
                ('localSurfaceRepair', 'geometrySurfaceInput', 'nativeSurfaceExport')):
            active.remove(source)
            memo[source] = source
            return source
        updated = copy.deepcopy(document) if source == old_repair else rewrite(copy.deepcopy(document))
        if source == old_repair:
            assert document['nativeOutput']['sha256'] == '81fc194f7005a1e1f76ee459e725fc25063c6d89b3cb17e9329f776a2f400c77'
            assert document['sourceVisualReview']['status'] == 'reviewed_for_derivative_processing'
            assert document['sourceVisualReview']['views'] == review['actualFiveViews']
            assert document['sourceVisualReview']['note'] == review['finding']
            assert not document.get('visualReview')
            updated['sourceVisualReview'] = {
                'status': 'reviewed_for_derivative_processing',
                'note': review['finding'], 'views': ['front', 'right', 'back', 'left', 'iso'],
                'reviewedAt': review['createdAt'], 'existingFrozenReview': evidence(args.review),
                'originalMalformedViewListReceipt': evidence(source),
                'reviewViewNameNormalizationOnly': True,
            }
        if updated != document:
            target = args.out / (before[:16] + '-' + source.name)
            atomic_json(target, updated)
            copies.append({'original': evidence(source), 'linkedCopy': evidence(target)})
        else:
            target = source
        assert sha(source) == before, 'original receipt changed'
        active.remove(source)
        memo[source] = target
        return target

    final = freeze(args.report)
    assert final != args.report.resolve()
    atomic_json(args.out / 'link-correction.json', {
        'status': 'previously_frozen_actual_review_view_names_normalized_in_new_report_graph',
        'inputReport': evidence(args.report), 'outputReport': evidence(final),
        'existingReview': evidence(args.review), 'copies': copies,
        'modelsImagesAndOriginalReceiptsUnmodified': True,
        'newInference': False, 'newRendering': False, 'visualApproval': False,
        'tool': evidence(Path(__file__)),
    })
    print(json.dumps({'report': evidence(final), 'copiedSmallReports': len(copies)}))


if __name__ == '__main__':
    main()

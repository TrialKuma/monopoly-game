"""Add explicit legacy-contract aliases to measured proof without rewriting it."""
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'reports/mechanical-repairs/expansion/chance_wheel/63b83a39c30792e8'

def receipt(path):
    data = path.read_bytes()
    return {'path': str(path.resolve()), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}

def create(path, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if path.exists():
        assert path.read_bytes() == data, 'Never overwrite a frozen receipt'
    else:
        path.write_bytes(data)
    return receipt(path)

original = DEST / 'verification-frozen.json'
assert receipt(original)['sha256'] == '0e9cb91f0b03d863a9430fc4ee858002bf722f3f3ee4d2f9be53559b8d7c74cc'
measured = json.loads(original.read_text(encoding='utf-8'))
for name in ('source', 'output'):
    assert receipt(Path(measured[name]['path'])) == measured[name]
assert measured['weldTolerance'] == 1e-6
mapping = {
    'sourceSha256': ('source', 'sha256'),
    'outputSha256': ('output', 'sha256'),
    'boundaryEdgesAtWeld1e6': ('openEdges',),
    'nonManifoldEdgesAtWeld1e6': ('nonManifoldEdges',),
    'originalMaterialsExactlyEqual': ('originalMaterialsEqual',),
    'embeddedImageHashesExactlyEqual': ('originalImagesEqual',),
}
proof = copy.deepcopy(measured)
for target, keys in mapping.items():
    value = measured
    for key in keys:
        value = value[key]
    proof[target] = value
proof['contractCompatibility'] = {
    'method': 'Field aliases only, copied from the immutable independent measurement receipt; no new geometry measurement or relaxed threshold.',
    'measuredReceipt': receipt(original),
    'fieldMapping': {key: '.'.join(value) for key, value in mapping.items()},
    'tool': receipt(Path(__file__)),
}
verification = create(DEST / 'verification-contract.json', proof)
previous = DEST / 'repair-report-final.json'
assert receipt(previous)['sha256'] == 'c3aa2331673dbed45ab24190ed82c2fab89859d7abbf751d1a7c74c9dbb246e0'
report = json.loads(previous.read_text(encoding='utf-8'))
report['priorFrozenReceipt'] = receipt(previous)
report['verification'] = verification
report['status'] = 'static_five_views_and_nine_motion_poses_reviewed_pending_formal_approval'
report['visualReview'] = {
    'status': 'passed_by_repair_agent_pending_formal_approval',
    'notes': 'Individually reviewed final front, right, back, left and isometric images plus the candidate-SHA-bound raw comparison sheet, after separately reviewing all nine actual 0/45/90-degree front/right/isometric motion frames. The colored original inner disc and hub rotate fully; bronze rim, pointer, pedestal and building stay fixed. The removed erroneous backing and locally repaired left lintel/copper edge remain correct. Small inherited roof-edge notches and short repair seams remain, especially on the right roof profile; accepted at mobile scale, not represented as flawless source reproduction. The 408 internal closure faces are documented mechanical repairs. No GLB, texture or existing evidence bytes were changed by this receipt update.',
}
result = create(DEST / 'repair-report-contract.json', report)
print(json.dumps({'verification': verification, 'repairReceipt': result}, ensure_ascii=False, indent=2))

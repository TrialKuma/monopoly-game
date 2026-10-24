"""Verify the unchanged original triangle prefix of a bounded neural-source repair.

Read-only GLB comparison. New faces may follow the original face prefix; this
does not approve their visual quality or assert that an entire mesh is manifold.
"""
from pathlib import Path
import argparse
import json
import numpy as np
from neural_component import GLB, digest


def primitive(glb):
    mesh_nodes = [node for node in glb.doc['nodes'] if 'mesh' in node]
    if len(mesh_nodes) != 1:
        raise ValueError('Expected one baked source mesh')
    node = mesh_nodes[0]
    if any(key in node for key in ('matrix', 'translation', 'rotation', 'scale')):
        raise ValueError('Node transform must be baked before this comparison')
    parts = glb.doc['meshes'][node['mesh']]['primitives']
    if len(parts) != 1:
        raise ValueError('Expected one source material primitive')
    return parts[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--repaired', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    source, repaired = GLB(args.source), GLB(args.repaired)
    original, final = primitive(source), primitive(repaired)
    original_ids = source.array(original['indices']).reshape(-1, 3)
    final_ids = repaired.array(final['indices']).reshape(-1, 3)
    if len(final_ids) < len(original_ids):
        raise ValueError('Repair removed original triangles')
    errors = {}
    for semantic in ('POSITION', 'TEXCOORD_0'):
        before = source.array(original['attributes'][semantic])[original_ids]
        after = repaired.array(final['attributes'][semantic])[final_ids[:len(original_ids)]]
        errors[semantic] = float(np.max(np.abs(before.astype(np.float64) - after.astype(np.float64))))
        if errors[semantic] != 0:
            raise ValueError(f'Original {semantic} changed: {errors[semantic]}')
    if source.image_hashes() != repaired.image_hashes():
        raise ValueError('Embedded original image bytes changed')
    report = {
        'status': 'original_triangle_positions_uv_and_image_bytes_exactly_preserved',
        'source': {'path': str(args.source.resolve()), 'sha256': digest(args.source)},
        'repaired': {'path': str(args.repaired.resolve()), 'sha256': digest(args.repaired)},
        'tool': {'path': str(Path(__file__).resolve()), 'sha256': digest(__file__)},
        'originalTrianglesCompared': len(original_ids),
        'addedTriangles': len(final_ids) - len(original_ids),
        'maxAbsoluteError': errors,
        'embeddedImageHashesUnchanged': True,
        'scope': 'Checks original per-corner POSITION and TEXCOORD_0 and image bytes only. Does not approve new faces, normals, shading, animation or final reduced mesh.',
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()

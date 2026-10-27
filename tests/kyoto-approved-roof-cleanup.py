"""Blender-only check of the accepted villa's in-memory overlay cleanup.

Run with Blender -b --factory-startup --python this-file.py. No exports,
renders, saved .blend files, or production assets are generated.
"""
from collections import Counter
import hashlib
import importlib.util
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art/blender-city/regions/eastern.py'
ARCHIVE = ROOT / 'art/blender-quality-study/kyoto-villa2/kyoto-villa2.blend'
before_hash = hashlib.sha256(ARCHIVE.read_bytes()).hexdigest()
spec = importlib.util.spec_from_file_location('kyoto_cleanup_check', SOURCE)
eastern = importlib.util.module_from_spec(spec)
spec.loader.exec_module(eastern)
with bpy.data.libraries.load(str(ARCHIVE), link=False) as (source, destination):
    destination.objects = [name for name in source.objects if name.startswith('Kyoto_Machiya_Villa_2')]
for obj in destination.objects:
    if obj:
        bpy.context.collection.objects.link(obj)
root = next(obj for obj in destination.objects if obj and obj.parent is None)
objects = [obj for obj in root.children_recursive if obj.type == 'MESH']


def face_key(mesh, polygon):
    return polygon.material_index, tuple(tuple(round(v, 7) for v in mesh.vertices[index].co) for index in polygon.vertices)


snapshots = []
for obj in objects:
    mesh = obj.data
    removable = eastern._kyoto_micro_overlay_faces(mesh)
    assert removable
    keep = [p for p in mesh.polygons if p.index not in removable]
    snapshots.append({
        'object': obj,
        'bounds': tuple(tuple(corner) for corner in obj.bound_box),
        'retainedFaces': Counter(face_key(mesh, p) for p in keep),
        'normals': {face_key(mesh, p): [tuple(mesh.corner_normals[index].vector) for index in p.loop_indices] for p in keep},
        'removed': len(removable),
        'nonEdgeMaterials': Counter(p.material_index for p in mesh.polygons if mesh.materials[p.material_index].name.split('/')[-1].strip() != 'edge'),
    })

removed = eastern._clean_accepted_roof_overlays(root)
assert removed == sum(snapshot['removed'] for snapshot in snapshots)
max_error = 0
for snapshot in snapshots:
    obj = snapshot['object']
    mesh = obj.data
    assert not eastern._kyoto_micro_overlay_faces(mesh), 'Cleanup must be idempotent'
    assert Counter(face_key(mesh, p) for p in mesh.polygons) == snapshot['retainedFaces']
    assert tuple(tuple(corner) for corner in obj.bound_box) == snapshot['bounds'], 'Accepted exterior bounds changed'
    assert Counter(p.material_index for p in mesh.polygons if mesh.materials[p.material_index].name.split('/')[-1].strip() != 'edge') == snapshot['nonEdgeMaterials']
    assert mesh.has_custom_normals
    for polygon in mesh.polygons:
        expected = snapshot['normals'][face_key(mesh, polygon)]
        for index, original in zip(polygon.loop_indices, expected):
            actual = mesh.corner_normals[index].vector
            max_error = max(max_error, max(abs(a - b) for a, b in zip(actual, original)))
assert max_error < .0000001, max_error
assert hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() == before_hash
print(f'Accepted Kyoto villa cleanup passed: {removed} micro-overlay faces removed; all retained faces/materials/bounds preserved; max corner-normal error {max_error:.8f}; archive unchanged.')

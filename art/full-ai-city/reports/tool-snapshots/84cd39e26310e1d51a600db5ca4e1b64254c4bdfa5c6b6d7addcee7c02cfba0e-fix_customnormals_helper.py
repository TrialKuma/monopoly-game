"""Correct reversed shading normals without changing geometry or UVs.

Imported glTF corner normals can become invalid after bounded mesh edits. This
helper retains every forward-facing corner normal and only replaces normals
that point through their own face. Replacement uses an angle-weighted local
geometric fan inside the existing crease angle, including coincident UV splits.
"""
import math
import numpy as np


def repair_reversed_corner_normals(mesh, minimum_dot=-0.01, crease_degrees=55.0, vertex_indices=None):
    mesh.update()
    positions = np.array([v.co[:] for v in mesh.vertices], dtype=np.float64)
    loop_vertices = np.array([loop.vertex_index for loop in mesh.loops], dtype=np.int32)
    uv_before = [np.array([loop.uv[:] for loop in layer.data]) for layer in mesh.uv_layers]
    face_normals = np.array([face.normal[:] for face in mesh.polygons], dtype=np.float64)
    corner_normals = np.array([normal.vector[:] for normal in mesh.corner_normals], dtype=np.float64)
    loop_faces = np.repeat(np.arange(len(mesh.polygons)), [len(face.loop_indices) for face in mesh.polygons])
    original_dots = np.einsum('ij,ij->i', corner_normals, face_normals[loop_faces])
    eligible = np.ones(len(loop_vertices), dtype=bool) if vertex_indices is None else np.isin(loop_vertices, list(vertex_indices))
    bad = np.flatnonzero(eligible & ((original_dots < minimum_dot) | ~np.isfinite(original_dots)))
    if not len(bad):
        return {'method': 'Only reversed corner normals corrected using crease-limited geometric fans', 'correctedCorners': 0, 'minimumDotBefore': float(original_dots.min()), 'geometryAndUVUnchanged': True}

    # glTF duplicates vertices at UV/normal seams; matching exact positions lets
    # the geometric fan cross UV seams while keeping sharp geometry boundaries.
    keys = [tuple(co) for co in positions]
    fans = {}
    for face in mesh.polygons:
        ids = list(face.vertices)
        for i, vertex in enumerate(ids):
            a = positions[ids[i - 1]] - positions[vertex]
            b = positions[ids[(i + 1) % len(ids)]] - positions[vertex]
            lengths = np.linalg.norm(a) * np.linalg.norm(b)
            angle = math.acos(float(np.clip(np.dot(a, b) / lengths, -1, 1))) if lengths > 1e-20 else 0.0
            fans.setdefault(keys[vertex], []).append((face.index, angle))

    cutoff = math.cos(math.radians(crease_degrees))
    fixed = corner_normals.copy()
    for loop_index in bad:
        face_index = loop_faces[loop_index]
        face_normal = face_normals[face_index]
        vector = np.zeros(3)
        for other_index, weight in fans[keys[loop_vertices[loop_index]]]:
            other = face_normals[other_index]
            if np.dot(face_normal, other) >= cutoff:
                vector += other * weight
        length = np.linalg.norm(vector)
        fixed[loop_index] = vector / length if length > 1e-12 else face_normal
    mesh.normals_split_custom_set(fixed.tolist())
    mesh.update()
    actual = np.array([normal.vector[:] for normal in mesh.corner_normals], dtype=np.float64)
    actual_dots = np.einsum('ij,ij->i', actual, face_normals[loop_faces])
    assert not np.any(actual_dots[bad] < -0.001), 'Reversed corner normal remains after correction'
    assert np.array_equal(positions, np.array([v.co[:] for v in mesh.vertices]))
    assert np.array_equal(loop_vertices, np.array([loop.vertex_index for loop in mesh.loops]))
    assert all(np.array_equal(before, np.array([loop.uv[:] for loop in layer.data])) for before, layer in zip(uv_before, mesh.uv_layers))
    delta = np.degrees(np.arccos(np.clip(np.einsum('ij,ij->i', actual[bad], corner_normals[bad]), -1, 1)))
    retained = np.ones(len(corner_normals), dtype=bool)
    retained[bad] = False
    retained_delta = np.linalg.norm(actual[retained] - corner_normals[retained], axis=1)
    return {
        'method': 'Only reversed corner normals corrected using angle-weighted coincident-position geometric fans within the existing crease angle; all positions, topology, UVs and positive-hemisphere corner normals retained',
        'creaseDegrees': crease_degrees,
        'minimumDotThreshold': minimum_dot,
        'totalCorners': len(corner_normals),
        'correctedCorners': len(bad),
        'scope': 'All reversed corners' if vertex_indices is None else 'Only explicitly selected edited vertices',
        'eligibleCorners': int(eligible.sum()),
        'minimumDotBefore': float(original_dots.min()),
        'minimumDotAfter': float(actual_dots.min()),
        'maximumCorrectionDegrees': float(delta.max()),
        'maximumRetainedCornerVectorChange': float(retained_delta.max()) if len(retained_delta) else 0.0,
        'retainedCornerNote': 'Untargeted values supplied unchanged; Blender may re-encode custom corner normals at internal precision',
        'geometryAndUVUnchanged': True,
    }

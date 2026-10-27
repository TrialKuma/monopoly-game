"""Geometry regression checks without Blender, rendering, or asset rebuilding.

Runs the actual source functions with a vertex-recording mesh and checks beam
sections against the ceramic deck. Python standard library only.
"""
import ast
from contextlib import contextmanager
import math
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / 'art/blender-city/regions/eastern.py'


class Vector(tuple):
    def __new__(cls, values):
        return super().__new__(cls, values)

    def __add__(self, other):
        return Vector(a + b for a, b in zip(self, other))

    def __sub__(self, other):
        return Vector(a - b for a, b in zip(self, other))

    def __mul__(self, scalar):
        return Vector(a * scalar for a in self)

    __rmul__ = __mul__

    @property
    def z(self):
        return self[2]

    def normalized(self):
        length = math.sqrt(sum(a * a for a in self))
        return self * (1 / length)

    def cross(self, other):
        a, b, c = self
        x, y, z = other
        return Vector((b * z - c * y, c * x - a * z, a * y - b * x))


class RecordedMesh:
    def __init__(self):
        self.angle = 0
        self.parts = []

    @contextmanager
    def facing(self, angle):
        old = self.angle
        self.angle += angle
        try:
            yield self
        finally:
            self.angle = old

    def poly(self, vertices, faces, material, smooth=False, bevel=False):
        co, si = math.cos(self.angle), math.sin(self.angle)
        rotated = [(x * co - y * si, x * si + y * co, z) for x, y, z in vertices]
        self.parts.append((rotated, faces, material, smooth))

    def xz_shape(self, *args, **kwargs):
        pass

    def box(self, *args, **kwargs):
        pass

    def rod(self, *args, **kwargs):
        pass


tree = ast.parse(SOURCE.read_text(encoding='utf-8'))
names = {'beam', 'gable_infill', 'tiles', 'roof'}
namespace = {'math': math, 'Vector': Vector}
exec(compile(ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names], type_ignores=[]), str(SOURCE), 'exec'), namespace)


def framing(w, d, rise, front, region):
    mesh = RecordedMesh()
    namespace['gable_infill'](mesh, w, d, 0, rise, front, region=region)
    return [vertex for vertices, _, material, _ in mesh.parts if material == 'wood' for vertex in vertices]


kyoto_cases = [
    ('tower_3 top pavilion', 2.03, 1.49, .46, True, .30, .30, .015),
    ('finance_3 exchange hall', 2.69, 1.73, .50, False, .30, .30, .015),
    ('villa/shop core', 2.32, 1.65, .56, False, .36, .40, .015),
    ('broad financial hall', 6.85, 2.25, .52, False, .34, .40, .02),
    ('small front gable', .67, .54, .35, True, .22, .20, 0),
    ('finance cross gable', 1.05, .74, .65, True, .22, .20, 0),
    ('thermal gallery', .56, .93, .33, False, .30, .30, .015),
]
alpine_cases = [
    ('chalet core', 2.38, 1.82, .71, True, .36, .40, .015),
    ('hotel core', 2.62, 1.94, .71, True, .36, .40, .015),
    ('summit wing', 1.40, 1.91, .64, True, .30, .30, .015),
    ('summit finance hall', 3.13, 2.04, .64, True, .30, .30, .015),
    ('windmill chalet', 2.03, 1.93, .66, True, .39, .35, .020),
]
minimum_clearance = math.inf
for name, w, d, rise, front, extra_w, extra_d, lift in kyoto_cases + alpine_cases:
    corrected = framing(w, d, rise, front, 'compact')
    assert corrected == framing(w, d, rise, front, 'alpine')
    previous_frame = framing(w, d, rise, front, None)
    gable_span = w if front else d
    recess = .020 + .045 * math.sqrt(1 + (2 * rise / gable_span) ** 2)
    assert len(corrected) == len(previous_frame) > 0
    for current, previous in zip(corrected, previous_frame):
        assert math.isclose(current[0], previous[0], abs_tol=1e-10)
        assert math.isclose(current[1], previous[1], abs_tol=1e-10)
        assert math.isclose(current[2], previous[2] - recess, abs_tol=1e-10)
        transverse = current[0] if front else current[1]
        span = w + extra_w if front else d + extra_d
        deck_top = lift + rise * (1 - abs(transverse) / (span / 2)) - .015
        clearance = deck_top - current[2]
        minimum_clearance = min(minimum_clearance, clearance)
        assert clearance >= .0049, (name, current, clearance)

# Neither region nor the alpine landmark can silently use protruding framing.
for function in [node for node in tree.body if isinstance(node, ast.FunctionDef)]:
    for call in ast.walk(function):
        if isinstance(call, ast.Call) and isinstance(call.func, ast.Name) and call.func.id == 'gable_infill':
            assert any(keyword.arg == 'region' for keyword in call.keywords), (function.name, call.lineno)

# The whole pan and curved cap surfaces survive; only the optional hairline
# cuff surfaces disappear on both regions' roofs.
meshes = {}
for region in ('compact', 'alpine'):
    mesh = RecordedMesh()
    namespace['roof'](mesh, region, 2.4, 1.8, 2, .5, cols=10, rows=3)
    meshes[region] = mesh
    cuffs = [part for part in mesh.parts if part[2] == 'edge' and part[3]]
    assert not cuffs
roof_faces = lambda mesh: sum(len(part[1]) for part in mesh.parts if part[2] == 'roof')
assert roof_faces(meshes['compact']) == roof_faces(meshes['alpine'])
print(f'Kyoto/Alpine roof clearance passed: {len(kyoto_cases)} Kyoto and {len(alpine_cases)} Alpine structures, minimum deck clearance {minimum_clearance:.6f}; ceramic faces retained; all callers include region.')

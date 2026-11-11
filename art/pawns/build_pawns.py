"""Build the two board pawns, export them as one GLB and keep an editable .blend.

Run from the repository root:
    blender -b --python art/pawns/build_pawns.py            (model + export)
    blender -b --python art/pawns/build_pawns.py -- --render (also render the preview sheets)

Units match the board scene (one tile is 1.45). Each pawn stands on z = 0 and faces -Y,
which becomes +Z in glTF, the direction scene.js treats as "forward".
Colours live in a vertex colour layer, like the buildings: one painted material and one brass
material per pawn, so a pawn costs two draw calls.
"""
import sys
from math import cos, pi, radians, sin, sqrt
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
OUTPUT = HERE.parent.parent / "assets/models/pawns"
RENDER = "--render" in sys.argv

UP = Vector((0, 0, 1))


def linear(code):
    """sRGB hex -> linear RGBA, the space vertex colours are stored in."""
    def channel(value):
        value /= 255
        return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
    return (*(channel(int(code[i:i + 2], 16)) for i in (1, 3, 5)), 1)


def at(x=0, y=0, z=0, scale=(1, 1, 1), rot=(0, 0, 0)):
    """Placement matrix: scale, then rotate (XYZ degrees), then move."""
    matrix = Matrix.Translation((x, y, z))
    for axis, angle in zip("ZYX", (rot[2], rot[1], rot[0])):
        matrix = matrix @ Matrix.Rotation(radians(angle), 4, axis)
    return matrix @ Matrix.Diagonal((*scale, 1))


class Pawn:
    """Collects every part of one pawn into a single mesh."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.colors = self.bm.loops.layers.float_color.new("Color")
        self.placed = self.bm.faces.layers.int.new("placed")
        self.parent = None  # extra transform for the parts being added, e.g. the tilted head

    def _finish(self, color, brass, matrix):
        if self.parent is not None:
            matrix = self.parent if matrix is None else self.parent @ matrix
        # New faces are the ones not yet marked. Bevels delete and recreate faces, so positions in
        # the face list cannot be trusted, and bmesh operators reset the built-in tag flag.
        faces = [face for face in self.bm.faces if not face[self.placed]]
        rgba = linear(color)
        verts = set()
        for face in faces:
            face[self.placed] = 1
            face.smooth = True
            face.material_index = 1 if brass else 0
            for loop in face.loops:
                loop[self.colors] = rgba
                verts.add(loop.vert)
        if matrix is not None:
            for vert in verts:
                vert.co = matrix @ vert.co

    def lathe(self, profile, color, segs=32, closed=False, matrix=None, brass=False):
        """Spin an (r, z) outline around Z. Walk the outline counter-clockwise (outside on the right).
        Points with r = 0 become poles; closed=True joins the last point back to the first (ring sections)."""
        rings = []
        for r, z in profile:
            if r < 1e-6:
                rings.append([self.bm.verts.new((0, 0, z))])
            else:
                rings.append([self.bm.verts.new((r * cos(2 * pi * i / segs), r * sin(2 * pi * i / segs), z)) for i in range(segs)])
        pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
        for low, high in pairs:
            if len(low) == 1 and len(high) == 1:
                continue
            for i in range(segs):
                j = (i + 1) % segs
                if len(low) == 1:
                    self.bm.faces.new((low[0], high[j], high[i]))
                elif len(high) == 1:
                    self.bm.faces.new((low[i], low[j], high[0]))
                else:
                    self.bm.faces.new((low[i], low[j], high[j], high[i]))
        self._finish(color, brass, matrix)

    def ball(self, radius, color, matrix, segs=28, rings=14, brass=False):
        profile = [(radius * sin(pi * i / rings), -radius * cos(pi * i / rings)) for i in range(rings + 1)]
        self.lathe(profile, color, segs, matrix=matrix, brass=brass)

    def capsule(self, a, b, radius, color, segs=16, brass=False, end_radius=None):
        """Rounded limb from a to b; end_radius tapers it."""
        a, b = Vector(a), Vector(b)
        length = (b - a).length
        end = radius if end_radius is None else end_radius
        steps = 5
        profile = [(radius * sin(pi / 2 * i / steps), -radius * cos(pi / 2 * i / steps)) for i in range(steps + 1)]
        profile += [(end * cos(pi / 2 * i / steps), length + end * sin(pi / 2 * i / steps)) for i in range(steps + 1)]
        matrix = Matrix.Translation(a) @ UP.rotation_difference(b - a).to_matrix().to_4x4()
        self.lathe(profile, color, segs, matrix=matrix, brass=brass)

    def ring(self, major, minor, color, matrix, segs=28, sides=10, brass=False, squash=1):
        profile = [(major + minor * cos(2 * pi * i / sides), minor * squash * sin(2 * pi * i / sides)) for i in range(sides)]
        self.lathe(profile, color, segs, closed=True, matrix=matrix, brass=brass)

    def box(self, size, color, matrix, brass=False, bevel=0):
        made = bmesh.ops.create_cube(self.bm, size=1, matrix=Matrix.Diagonal((*size, 1)))
        if bevel:
            edges = {edge for vert in made["verts"] for edge in vert.link_edges}
            bmesh.ops.bevel(self.bm, geom=list(edges), offset=bevel, segments=2, affect="EDGES")
        self._finish(color, brass, matrix)

    def to_object(self, paint, brass):
        # Creases sharper than 48 degrees stay crisp; everything else shades smooth.
        for edge in self.bm.edges:
            if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > radians(48):
                edge.smooth = False
        self.bm.faces.layers.int.remove(self.placed)
        mesh = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        mesh.materials.append(paint)
        mesh.materials.append(brass)
        mesh.color_attributes.active_color = mesh.color_attributes["Color"]
        mesh.color_attributes.render_color_index = 0
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.collection.objects.link(obj)
        return obj


# Shared palette. Player and rival colours match the HUD (teal for you, brick for the rival).
STONE, BRASS, SKIN, INK, LINEN, BLUSH = "#efe5cc", "#e0aa45", "#f6d7b0", "#2b2a2e", "#fbf6e8", "#eb9c8c"


def base(p):
    """Turned stone plinth with a brass band: the part both pawns share."""
    p.lathe([(0, 0), (.178, 0), (.192, .012), (.192, .040), (.182, .054), (.158, .060), (0, .060)], STONE, 36)
    p.ring(.160, .010, BRASS, at(z=.062), 36, 8, brass=True)


HEAD = .420  # height of the head centre
# Heads lean back a little so the face still reads from the game's raised camera.
HEAD_TILT = Matrix.Translation((0, 0, .31)) @ Matrix.Rotation(radians(-9), 4, "X") @ Matrix.Translation((0, 0, -.31))


def dome(radius, height, z, steps=10, power=.55):
    """Outline of a hat crown standing on height z: flat underside, near-straight wall, round top."""
    wall = [(radius * cos(pi / 2 * i / steps) ** power, z + height * sin(pi / 2 * i / steps)) for i in range(steps)]
    return [(0, z)] + wall + [(0, z + height)]


def skin(x, z, wide=1, lift=0):
    """Y of the face surface at (x, z) on the shared head shape, raised by lift."""
    return -.97 * sqrt(max(0, .128 ** 2 - (x / wide) ** 2 - ((z - HEAD) / .95) ** 2)) - lift


def head(p, hair, wide=1, brow=None, smile=None):
    """Head, hair and face. Call with p.parent set to HEAD_TILT."""
    shape = Matrix.Translation((0, 0, HEAD)) @ Matrix.Diagonal((wide, .97, .95, 1))
    p.ball(.128, SKIN, shape)
    # Hair is a cap over the back and top of the skull, so the hairline is one clean circle.
    span, steps = radians(100), 12
    cap = [(.131 * sin(span * (1 - i / steps)), .131 * cos(span * (1 - i / steps))) for i in range(steps)]
    p.lathe([(0, .131 * cos(span))] + cap + [(0, .131)], hair, 32, matrix=shape @ Matrix.Rotation(radians(-58), 4, "X"))
    if smile:
        curve = [(-.027, HEAD - .039), (-.012, HEAD - .048), (.012, HEAD - .048), (.027, HEAD - .039)]
        for (x0, z0), (x1, z1) in zip(curve, curve[1:]):
            p.capsule((x0, skin(x0, z0, wide, -.002), z0), (x1, skin(x1, z1, wide, -.002), z1), .0048, smile, 8)
    for side in (-1, 1):
        p.ball(.5, INK, at(side * .046, -.113, HEAD + .008, (.036, .020, .050)), 12, 8)
        p.ball(.5, "#ffffff", at(side * .046 - .006, -.123, HEAD + .020, (.012, .008, .014)), 8, 6)
        p.ball(.5, BLUSH, at(side * .082, -.094, HEAD - .030, (.040, .012, .026), (0, 0, side * 38)), 12, 6)
        if brow:
            # Inner ends low, outer ends high: a scheming look.
            inner, outer = (side * .020, HEAD + .037), (side * .070, HEAD + .053)
            p.capsule((inner[0], skin(*inner, wide, .003), inner[1]), (outer[0], skin(*outer, wide, .003), outer[1]), .0065, brow, 8)


def human():
    """You: a small landlord in a bowler hat, holding up the key to the next house."""
    p = Pawn("pawn_human")
    coat, deep, hair = "#2f8f89", "#1d5f5c", "#4b3427"
    base(p)
    # Bell-shaped coat with a darker hem.
    p.lathe([(0, .058), (.138, .058), (.146, .084), (.141, .135), (.124, .200), (.104, .252), (.088, .288), (.070, .303), (0, .308)], coat, 36)
    p.ring(.1455, .0075, deep, at(z=.082), 36, 8)
    p.lathe([(0, .292), (.079, .292), (.086, .306), (.072, .322), (0, .322)], LINEN, 28)
    for z, y in ((.222, -.118), (.165, -.136)):
        p.ball(.011, BRASS, at(0, y, z), 10, 6, brass=True)
    # Bow tie.
    for side in (-1, 1):
        p.ball(.5, BRASS, at(side * .027, -.090, .300, (.046, .020, .032), (0, 0, side * 12)), 12, 8, brass=True)
    p.ball(.011, BRASS, at(0, -.097, .300), 10, 6, brass=True)
    p.parent = HEAD_TILT
    head(p, hair, smile="#8a4638")
    # Bowler: curled brim, round crown, brass band.
    p.lathe([(0, .490), (.140, .490), (.158, .494), (.169, .501), (.174, .509), (.172, .514), (.165, .516), (.150, .512), (.114, .507), (0, .507)], deep, 36)
    p.lathe(dome(.112, .106, .506), deep, 36)
    p.lathe([(.1105, .509), (.119, .509), (.119, .530), (.1105, .530)], BRASS, 36, closed=True, brass=True)
    p.parent = None
    # Left arm carries a briefcase, turned so its face shows from the front.
    p.capsule((.112, 0, .268), (.172, -.024, .184), .031, coat, 14, end_radius=.027)
    p.ball(.033, SKIN, at(.177, -.030, .160), 14, 8)
    p.box((.090, .032, .066), "#8a5630", at(.188, -.040, .101, rot=(0, 0, 28)), bevel=.007)
    p.ring(.018, .0045, "#5d3a20", at(.188, -.040, .137, rot=(90, 0, 28)), 12, 6)
    p.box((.018, .037, .015), BRASS, at(.188, -.040, .120, rot=(0, 0, 28)), brass=True)
    # Right arm raised with the key.
    p.capsule((-.112, 0, .268), (-.178, -.036, .262), .031, coat, 14, end_radius=.028)
    p.capsule((-.178, -.036, .262), (-.200, -.062, .318), .028, coat, 14, end_radius=.026)
    p.ball(.033, SKIN, at(-.203, -.066, .338), 14, 8)
    p.ring(.030, .0095, BRASS, at(-.206, -.070, .452, rot=(90, 0, 0)), 20, 8, brass=True)
    p.capsule((-.206, -.070, .424), (-.206, -.070, .322), .0095, BRASS, 10, brass=True)
    for z, length in ((.348, .034), (.372, .026)):
        p.box((length, .016, .013), BRASS, at(-.206 - length / 2, -.070, z), brass=True)
    return p


def rival():
    """The rival: a stout developer in a flat cap, fist on hip, blueprints under his arm."""
    p = Pawn("pawn_ai")
    coat, cap, hair, scarf, paper = "#d4744f", "#8c4332", "#a9582a", "#f4e2b4", "#78aad2"
    base(p)
    p.lathe([(0, .058), (.148, .058), (.157, .088), (.153, .145), (.134, .205), (.110, .255), (.091, .288), (.072, .302), (0, .307)], coat, 36)
    p.ring(.1565, .0075, cap, at(z=.086), 36, 8)
    for z, y in ((.215, -.128), (.160, -.147)):
        p.ball(.011, BRASS, at(0, y, z), 10, 6, brass=True)
    # Scarf: a soft ring and a tail lying down the chest.
    p.ring(.074, .024, scarf, at(z=.306), 28, 10, squash=.8)
    p.ball(.5, scarf, at(.044, -.108, .262, (.058, .026, .104), (-28, 0, -8)), 14, 10)
    p.parent = HEAD_TILT
    head(p, hair, wide=1.03, brow="#6b3418")
    for side in (-1, 1):
        p.ball(.5, "#6b3418", at(side * .027, -.115, HEAD - .042, (.058, .022, .024), (0, 0, side * 10)), 12, 8)
    # Flat cap: wide soft crown pulled forward, short peak, button on top.
    p.ball(.5, cap, at(0, -.010, .524, (.310, .326, .118), (-8, 0, 0)), 36, 18)
    p.ball(.5, cap, at(0, -.140, .492, (.190, .110, .022), (-10, 0, 0)), 24, 10)
    p.ball(.013, cap, at(0, -.004, .584), 10, 6)
    p.parent = None
    # Right arm: fist on hip.
    p.capsule((-.118, 0, .264), (-.196, .014, .214), .031, coat, 14)
    p.capsule((-.196, .014, .214), (-.158, -.030, .168), .029, coat, 14, end_radius=.027)
    p.ball(.033, SKIN, at(-.150, -.040, .158), 14, 8)
    # Left arm clamps a roll of blueprints.
    p.capsule((.118, 0, .264), (.176, -.020, .196), .031, coat, 14, end_radius=.028)
    p.ball(.033, SKIN, at(.176, -.046, .182), 14, 8)
    roll_a, roll_b = Vector((.190, -.128, .112)), Vector((.150, .060, .268))
    p.capsule(roll_a, roll_b, .027, paper, 16)
    for end in (roll_a.lerp(roll_b, .04), roll_a.lerp(roll_b, .96)):
        p.ring(.0275, .004, LINEN, Matrix.Translation(end) @ UP.rotation_difference(roll_b - roll_a).to_matrix().to_4x4(), 16, 6)
    return p


def material(name, roughness, metallic):
    """Both materials take their colour from the vertex layer; they differ only in surface."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.use_backface_culling = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    attribute = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Color"
    mat.node_tree.links.new(attribute.outputs["Color"], shader.inputs["Base Color"])
    return mat


def render(pawns):
    """Front and back sheets under soft studio light, for judging the shapes."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1000, 720
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (.82, .86, .84, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = .4
    scene.world = world
    floor = bpy.data.meshes.new("Floor")
    floor.from_pydata([(-4, -4, 0), (4, -4, 0), (4, 4, 0), (-4, 4, 0)], [], [(0, 1, 2, 3)])
    floor_mat = bpy.data.materials.new("Floor")
    floor_mat.use_nodes = True
    floor_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.62, .72, .62, 1)
    floor.materials.append(floor_mat)
    extras = [bpy.data.objects.new("Floor", floor)]
    for name, location, energy, size in (("Key", (-1.6, -2.2, 2.6), 80, 2.2), ("Fill", (2.4, -1.2, 1.2), 22, 2.5), ("Rim", (.8, 2.4, 2.0), 45, 1.5)):
        light = bpy.data.lights.new(name, "AREA")
        light.energy, light.size = energy, size
        lamp = bpy.data.objects.new(name, light)
        lamp.location = location
        lamp.rotation_euler = (Vector((0, 0, .3)) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
        extras.append(lamp)
    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.data.type = "ORTHO"
    extras.append(camera)
    for item in extras:
        scene.collection.objects.link(item)
    scene.camera = camera
    for name, eye, scale in (("front", (0, -3, 1.05), 1.15), ("game", (1.9, -1.9, 2.45), 1.15), ("back", (.9, 3, 1.3), 1.15)):
        camera.location = eye
        camera.rotation_euler = (Vector((0, 0, .31)) - Vector(eye)).to_track_quat("-Z", "Y").to_euler()
        camera.data.ortho_scale = scale
        scene.render.filepath = str(HERE / f"preview-{name}.png")
        bpy.ops.render.render(write_still=True)
    for item in extras:
        bpy.data.objects.remove(item)


bpy.ops.wm.read_factory_settings(use_empty=True)
paint, brass = material("Pawn paint", .58, 0), material("Pawn brass", .34, 1)
pawns = [build().to_object(paint, brass) for build in (human, rival)]
OUTPUT.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT / "pawns.glb"), export_format="GLB", export_apply=True)
for pawn in pawns:
    print("PAWN", pawn.name, "triangles", sum(len(poly.vertices) - 2 for poly in pawn.data.polygons),
          "height", round(max(v.co.z for v in pawn.data.vertices), 3), "width", round(max(v.co.x for v in pawn.data.vertices) - min(v.co.x for v in pawn.data.vertices), 3))
# In the source file the two stand side by side; the GLB keeps both at the origin.
pawns[0].location.x, pawns[1].location.x = -.27, .27
if RENDER:
    render(pawns)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / "pawns.blend"), compress=True)

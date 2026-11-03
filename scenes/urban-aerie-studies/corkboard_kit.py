"""Detective-wall corkboard kit for the Projects section.

Run it from this folder with background Blender on an empty file:
    blender --factory-startup -b --python corkboard_kit.py -- [--preview]

The script builds the kit in a new scene, Corkboard_Kit, and writes one Draco GLB,
src/assets/models/corkboard_kit.glb, plus corkboard_kit_report.json beside this script.
It saves no .blend and never touches aerie.glb or aerie_lod1.glb. --preview also builds
Corkboard_Kit_Preview: linked copies laid out on the board, red strings, a camera and two lights.

The detail level follows the round 21 telescope: round parts have 10 to 14 segments, the frame
has a moulded profile, and brass corner plates carry domed screws.

Every object sits at the origin with an identity transform, in its own local frame. The frames
below use glTF axes: +X right, +Y up, +Z out of the face toward the viewer. The script authors
points in that frame and gl() turns them into Blender axes, so the export gives back the same frame.
- Board: a 1.6 x 1.0 m frame. The cork face is the plane z = 0, centre at the origin, 1.48 x 0.88 m.
  The frame crown stands 22 mm proud of the cork, the brass plates 24 mm, the back 40 mm behind it.
- Ledge: a pencil ledge along the bottom rail, in the Board frame. Give it the Board transform.
- Pin_Push, Pin_Map: the base sits on z = 0. The head rises along +Z and the needle points into -Z.
  Pin_Map has a bare steel shaft from z 0 to 8 mm, so a string can loop around it.
- Tape, Note, Photo, Card: the sheet centre sits at the origin and the face looks along +Z.
- Spool, Pencil: the contact point with the ledge top sits at the origin, +Y up.
The code sets the colour of Pin_Push, Pin_Map (material kit_pin), Note (kit_note) and the Spool
string (kit_string) through the material colour, so those parts carry white or no vertex colour.
Card, Note and the Photo window carry UVs from 0 to 1 for a canvas atlas or a picture. The Board
cork carries UVs from 0 to 1 too.
"""
from pathlib import Path
import sys, json, math
import bpy
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent.parent
OUT = SITE / 'src' / 'assets' / 'models' / 'corkboard_kit.glb'
REPORT = ROOT / 'corkboard_kit_report.json'
SCENE = 'Corkboard_Kit'
PREVIEW = 'Corkboard_Kit_Preview'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
KIT = ('Board', 'Ledge', 'Pin_Push', 'Pin_Map', 'Tape', 'Note', 'Photo', 'Card', 'Spool', 'Pencil')
BUDGET = 5000

BOARD_W, BOARD_H = 1.6, 1.0
FRAME = 0.06
CORK_W, CORK_H = BOARD_W - 2 * FRAME, BOARD_H - 2 * FRAME
CORK_GRID = (16, 10)
# Segments along each rail, so the grain colour can change along its length.
RAIL_SEGMENTS = {0: 12, 1: 8, 2: 12, 3: 8}  # bottom, right, top, left
# The frame moulding, from the outer back edge to the cork edge: (inset from the outer edge, z).
# The flag says whether the band that starts at the point is smooth.
PROFILE = [(0.000, -0.040, False), (0.000, 0.004, True), (0.002, 0.012, True), (0.007, 0.018, True),
           (0.014, 0.021, True), (0.030, 0.022, True), (0.042, 0.020, False), (0.046, 0.016, True),
           (0.049, 0.013, True), (0.052, 0.010, False), (0.056, 0.006, False), (0.060, 0.000, False)]
# Bands of the profile and their wood tone: back and outer side, rounded edge and crown, bead.
BAND_TONE = [0, 1, 1, 2, 2, 2, 1, 2, 2, 1, 1, 1]
LEDGE_TOP = -0.452

WHITE = (1.0, 1.0, 1.0)
# Colours are sRGB. The vertex colours change slowly over a surface, never per face, so the
# toon shading shows coherent facets and no checkerboard.
CORK = (0.74, 0.53, 0.33)
WOOD = [(0.34, 0.21, 0.12), (0.47, 0.30, 0.18), (0.57, 0.38, 0.23)]  # back, side, front
TAPE = (0.93, 0.88, 0.72)
PAPER = (0.96, 0.95, 0.91)
SPOOL_WOOD = (0.80, 0.64, 0.42)
PENCIL = {'paint': (0.86, 0.62, 0.20), 'wood': (0.88, 0.72, 0.50), 'lead': (0.20, 0.20, 0.22),
          'ferrule': (0.80, 0.66, 0.36), 'eraser': (0.88, 0.52, 0.52)}
MATERIALS = {  # name: (base colour, uses vertex colour, alpha)
    'kit_cork': (WHITE, True, 1.0),
    'kit_wood': (WHITE, True, 1.0),
    'kit_brass': ((0.80, 0.62, 0.30), False, 1.0),
    'kit_pin': ((0.78, 0.27, 0.23), False, 1.0),
    'kit_steel': ((0.62, 0.63, 0.66), False, 1.0),
    'kit_tape': (WHITE, True, 0.8),
    'kit_note': ((0.98, 0.86, 0.42), False, 1.0),
    'kit_paper': (WHITE, True, 1.0),
    'kit_photo_window': ((0.22, 0.24, 0.28), False, 1.0),
    'kit_card': ((0.96, 0.93, 0.84), False, 1.0),
    'kit_string': ((0.72, 0.12, 0.12), False, 1.0),
    'kit_pencil': (WHITE, True, 1.0),
}
METALS = ('kit_brass', 'kit_steel')


def gl(x, y, z):
    """Turns a glTF-frame point into Blender axes. glTF +Z out of the face is Blender -Y."""
    return Vector((x, -z, y))


def srgb_to_linear(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def shade(c, f):
    return tuple(min(1.0, v * f) for v in c)


def steps(a, b, n):
    return [a + (b - a) * i / n for i in range(n + 1)]


def material(name):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    base, vertex, alpha = MATERIALS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(base), 1)
    bsdf.inputs['Roughness'].default_value = 0.4 if name in METALS else 0.85
    bsdf.inputs['Metallic'].default_value = 0.8 if name in METALS else 0.0
    if vertex:
        attr = nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


class Part:
    """Collects glTF-frame vertices, faces and per-face flags for one mesh.

    Every builder takes points in metres. A ring runs counter-clockwise about its axis, so
    bridge() from a lower ring to a higher ring gives outward faces."""

    def __init__(self):
        self.verts, self.colours, self.faces, self.mats, self.smooth, self.uvs = [], [], [], [], [], {}

    def vert(self, p, colour=WHITE):
        self.verts.append(tuple(p))
        self.colours.append(colour)
        return len(self.verts) - 1

    def face(self, idx, mat=0, smooth=False, uv=None):
        if uv:
            self.uvs[len(self.faces)] = uv
        self.faces.append(tuple(idx))
        self.mats.append(mat)
        self.smooth.append(smooth)

    def ring(self, centre, axis, r, n, colour=WHITE, turn=0.0):
        axis = Vector(axis).normalized()
        helper = Vector((0, 1, 0)) if abs(axis.y) < 0.9 else Vector((1, 0, 0))
        u = helper.cross(axis).normalized()
        v = axis.cross(u)
        c = Vector(centre)
        return [self.vert(c + r * (math.cos(turn + i * math.tau / n) * u + math.sin(turn + i * math.tau / n) * v), colour)
                for i in range(n)]

    def bridge(self, a, b, mat=0, smooth=True):
        n = len(a)
        for i in range(n):
            self.face((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]), mat, smooth)

    def lathe(self, base, axis, profile, n, mat=0, colour=WHITE, turn=0.0, smooth=True, top=True, bottom=False):
        """Rings along axis from base. profile holds (radius, height) pairs from bottom to top.
        Each call makes its own rings, so two calls meet at a crease."""
        axis, base = Vector(axis).normalized(), Vector(base)
        rings = [self.ring(base + axis * h, axis, r, n, colour, turn) for r, h in profile]
        for a, b in zip(rings, rings[1:]):
            self.bridge(a, b, mat, smooth)
        if top:
            self.face(rings[-1], mat)
        if bottom:
            self.face(rings[0][::-1], mat)
        return rings

    def cone(self, base, axis, r, length, n, mat=0, colour=WHITE, turn=0.0, smooth=False):
        axis = Vector(axis).normalized()
        ring = self.ring(base, axis, r, n, colour, turn)
        tip = self.vert(Vector(base) + axis * length, colour)
        for i in range(n):
            self.face((ring[i], ring[(i + 1) % n], tip), mat, smooth)
        return ring

    def prism(self, outline, z0, z1, mat=0, colour=WHITE, flip=False):
        """Extrudes a counter-clockwise outline of (x, y) points from z0 to z1. flip turns the
        winding round for an outline that a mirror made clockwise."""
        lo = [self.vert((x, y, z0), colour) for x, y in outline]
        hi = [self.vert((x, y, z1), colour) for x, y in outline]
        order = (lambda f: f[::-1]) if flip else (lambda f: f)
        n = len(outline)
        for i in range(n):
            self.face(order((lo[i], lo[(i + 1) % n], hi[(i + 1) % n], hi[i])), mat)
        return lo, hi

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)


def build_mesh(scene, name, part, mats, vertex_colours=True):
    """Makes one mesh object at the origin from a Part."""
    if name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[name])
    me = bpy.data.meshes.new(name)
    me.from_pydata([gl(*v) for v in part.verts], [], part.faces)
    for m in mats:
        me.materials.append(bpy.data.materials[m])
    for p, mat, smooth in zip(me.polygons, part.mats, part.smooth):
        p.material_index = mat
        p.use_smooth = smooth
    if vertex_colours:
        attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
        for i, c in enumerate(part.colours):
            attr.data[i].color_srgb = (*c, 1)
        me.color_attributes.active_color = attr
    if part.uvs:
        layer = me.uv_layers.new(name='UVMap')
        for fi, corners in part.uvs.items():
            for li, uv in zip(me.polygons[fi].loop_indices, corners):
                layer.data[li].uv = uv
    faces = len(me.polygons)
    me.validate()
    assert len(me.polygons) == faces, f'{name}: validate removed faces'
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def ring_corners(hw, hh):
    """Four corners counter-clockwise seen from +Z, from the lower left."""
    return [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]


def sheet(part, xs, ys, z_of, mat=0, colour_of=None, smooth=True, move=None):
    """A grid of quads facing +Z with UVs from 0 to 1. move can shift a vertex after the UVs
    are set, so a cut corner does not stretch the picture."""
    nx = len(xs)
    first = len(part.verts)
    for y in ys:
        for x in xs:
            p = (x, y, z_of(x, y))
            if move:
                p = move(x, y, p)
            part.vert(p, colour_of(x, y) if colour_of else WHITE)
    uv = lambda i, j: ((xs[i] - xs[0]) / (xs[-1] - xs[0]), (ys[j] - ys[0]) / (ys[-1] - ys[0]))
    for j in range(len(ys) - 1):
        for i in range(nx - 1):
            a = first + j * nx + i
            part.face((a, a + 1, a + nx + 1, a + nx), mat, smooth,
                      [uv(i, j), uv(i + 1, j), uv(i + 1, j + 1), uv(i, j + 1)])


# ---- board and ledge ------------------------------------------------------------------------

def frame_rails(part):
    """Four moulded rails that meet at mitred corners. A profile point at inset w runs from the
    inset corner of one rail end to the next, so the mitre falls out of the corner geometry.
    Each rail has its own vertices and a small tone shift, so the joints read as cut wood."""
    hw, hh = BOARD_W / 2, BOARD_H / 2
    rail_shift = [1.0, 0.95, 1.03, 0.97]
    for k in range(4):
        segs = RAIL_SEGMENTS[k]
        rows = []
        for j, (w, z, _) in enumerate(PROFILE):
            a = Vector(ring_corners(hw - w, hh - w)[k])
            b = Vector(ring_corners(hw - w, hh - w)[(k + 1) % 4])
            row = []
            for t in steps(0.0, 1.0, segs):
                p = a.lerp(b, t)
                # Grain runs along the rail: slow along its length, faster across its width.
                grain = 1 + 0.07 * noise.noise(Vector((t * 3.0 + k * 5.1, w * 70.0, 2.3)))
                row.append(part.vert((p.x, p.y, z), shade(WOOD[BAND_TONE[j]], rail_shift[k] * grain)))
            rows.append(row)
        for j in range(len(PROFILE) - 1):
            for i in range(segs):
                part.face((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]), 1, PROFILE[j][2])
    back = [part.vert((x, y, -0.040), WOOD[0]) for x, y in ring_corners(hw, hh)]
    part.face(back[::-1], 1)


def corner_plates(part):
    """An L-shaped brass plate on the crown at each corner, with three domed screws. The plate
    stays on the flat crown, between insets 15 and 37 mm, so it does not float over the round edge."""
    hw, hh = BOARD_W / 2, BOARD_H / 2
    e, arm, width, z0, z1 = 0.015, 0.075, 0.022, 0.0205, 0.0235
    outline = [(e, e), (arm, e), (arm, e + width), (e + width, e + width), (e + width, arm), (e, arm)]
    screws = [(e + width / 2, e + width / 2), (arm - 0.009, e + width / 2), (e + width / 2, arm - 0.009)]
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        to_board = lambda a, b: (sx * (hw - a), sy * (hh - b))
        flip = sx * sy < 0
        pts = [to_board(a, b) for a, b in outline]
        lo, hi = part.prism(pts, z0, z1, 2, flip=flip)
        tops = [(hi[0], hi[1], hi[2], hi[3]), (hi[0], hi[3], hi[4], hi[5])]
        for f in tops:
            part.face(f[::-1] if flip else f, 2)
        for a, b in screws:
            x, y = to_board(a, b)
            part.lathe((x, y, z1), (0, 0, 1), [(0.0030, 0.0), (0.0028, 0.0006), (0.0018, 0.0012)], 6, mat=2)


def board(scene):
    part = Part()
    cw, ch = CORK_W / 2, CORK_H / 2

    def cork_colour(x, y):
        n = noise.noise(Vector((x * 2.3, y * 2.3, 7.7)))
        edge = min(cw - abs(x), ch - abs(y))
        # The cork darkens a little toward the frame, like a soft contact shadow.
        rim = 0.86 + 0.14 * min(1.0, edge / 0.10)
        return shade(CORK, (1 + 0.07 * n) * rim)

    sheet(part, steps(-cw, cw, CORK_GRID[0]), steps(-ch, ch, CORK_GRID[1]), lambda x, y: 0.0, 0, cork_colour, smooth=False)
    frame_rails(part)
    corner_plates(part)
    return build_mesh(scene, 'Board', part, ['kit_cork', 'kit_wood', 'kit_brass'])


def ledge(scene):
    """A pencil ledge on the bottom rail, with a front lip and two shaped brackets. Its top is
    the plane y = LEDGE_TOP in the Board frame, from z 0.020 to 0.056."""
    part = Part()
    # Cross-section in (z, y), counter-clockwise seen from +X: top, lip, front and underside.
    section = [(0.020, LEDGE_TOP), (0.056, LEDGE_TOP), (0.056, -0.443), (0.062, -0.443), (0.062, -0.466), (0.020, -0.478)]
    xs = steps(-0.70, 0.70, 8)
    rows = []
    for x in xs:
        grain = 1 + 0.06 * noise.noise(Vector((x * 3.0, 4.4, 1.9)))
        rows.append([part.vert((x, y, z), shade(WOOD[2] if i < 4 else WOOD[1], grain)) for i, (z, y) in enumerate(section)])
    n = len(section)
    for a, b in zip(rows, rows[1:]):
        for i in range(n):
            part.face((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]), 0)
    part.face(rows[0][::-1], 0)
    part.face(rows[-1], 0)
    for x in (-0.48, 0.48):
        # Each bracket is a wedge under the ledge, 16 mm wide, back on the rail front. It stops
        # above the bottom edge of the frame.
        tri = [(-0.478, 0.020), (-0.467, 0.058), (-0.495, 0.020)]  # (y, z)
        lo = [part.vert((x - 0.008, y, z), WOOD[1]) for y, z in tri]
        hi = [part.vert((x + 0.008, y, z), WOOD[1]) for y, z in tri]
        part.face(lo[::-1], 0)
        part.face(hi, 0)
        for i in range(3):
            part.face((lo[i], lo[(i + 1) % 3], hi[(i + 1) % 3], hi[i]), 0)
    return build_mesh(scene, 'Ledge', part, ['kit_wood'])


# ---- pins -----------------------------------------------------------------------------------

def pin_push(scene):
    """A push pin: a flange, a waisted grip that flares to a domed cap, and a steel needle.
    Three lathe sections meet at creases, so the toon outline catches the flange and the cap."""
    part = Part()
    up, n = (0, 0, 1), 10
    part.lathe((0, 0, 0), up, [(0.0092, 0.0), (0.0094, 0.0016), (0.0060, 0.0031), (0.0036, 0.0044)], n, top=False)
    part.lathe((0, 0, 0), up, [(0.0036, 0.0044), (0.0033, 0.0076), (0.0052, 0.0118), (0.0058, 0.0138)], n, top=False)
    part.lathe((0, 0, 0), up, [(0.0058, 0.0138), (0.0066, 0.0150), (0.0058, 0.0164), (0.0030, 0.0172)], n)
    part.cone((0, 0, 0.0005), (0, 0, -1), 0.0006, 0.0115, 6, mat=1)
    return build_mesh(scene, 'Pin_Push', part, ['kit_pin', 'kit_steel'], vertex_colours=False)


def pin_map(scene):
    """A map pin: a round head on a bare steel shaft. The shaft shows 8 mm above the surface,
    so a string can loop around it."""
    part = Part()
    r, c, n = 0.0042, 0.0124, 10
    lat = [math.radians(a) for a in (30, 60, 90, 120, 150)]
    rings = part.lathe((0, 0, 0), (0, 0, 1), [(r * math.sin(a), c - r * math.cos(a)) for a in lat], n, top=False)
    bottom = part.vert((0, 0, c - r))
    top = part.vert((0, 0, c + r))
    for i in range(n):
        j = (i + 1) % n
        part.face((rings[0][j], rings[0][i], bottom), 0, True)
        part.face((rings[-1][i], rings[-1][j], top), 0, True)
    part.lathe((0, 0, 0), (0, 0, 1), [(0.00065, 0.0), (0.00065, c - r + 0.001)], 6, mat=1, top=False)
    part.cone((0, 0, 0.0), (0, 0, -1), 0.00065, 0.010, 6, mat=1)
    return build_mesh(scene, 'Pin_Map', part, ['kit_pin', 'kit_steel'], vertex_colours=False)


# ---- paper ----------------------------------------------------------------------------------

def tape(scene):
    """A 100 x 26 mm strip of masking tape. It bows 2 mm off the face with a faint crinkle, and
    both ends have a torn, uneven edge."""
    part = Part()
    L, W = 0.10, 0.026
    xs = steps(-L / 2, L / 2, 12)
    ys = steps(-W / 2, W / 2, 3)
    # Each torn end moves its vertices along x by these amounts, bottom row to top row.
    torn = {0: (0.0, 0.0022, -0.0008, 0.0016), len(xs) - 1: (-0.0012, 0.0018, -0.0020, 0.0006)}

    def tear(x, y, p):
        i, j = xs.index(x), ys.index(y)
        return (p[0] + torn[i][j], p[1], p[2]) if i in torn else p

    def colour(x, y):
        edge = 0.95 + 0.05 * (1 - abs(2 * y / W))
        return shade(TAPE, edge * (1 + 0.03 * noise.noise(Vector((x * 60, y * 60, 1.3)))))

    lift = lambda x, y: 0.0018 * (1 - (2 * x / L) ** 2) + 0.00025 * math.sin(x * 190 + y * 40)
    sheet(part, xs, ys, lift, 0, colour, move=tear)
    part.uvs.clear()
    return build_mesh(scene, 'Tape', part, ['kit_tape'])


def note(scene):
    """A 76 mm square sticky note. The glue strip along the top holds it flat. The lower right
    corner rolls round a 15 mm cylinder, so it lifts off the board like a real curl."""
    part = Part()
    S = 0.076
    h = S / 2
    axis = Vector((1, -1)).normalized()
    start, radius = 0.030, 0.015

    def roll(x, y, p):
        sag = 0.0015 * ((h - y) / S) ** 2
        s = Vector((x, y)).dot(axis)
        if s <= start:
            return (x, y, sag)
        angle = (s - start) / radius
        flat = Vector((x, y)) - axis * (s - start) + axis * radius * math.sin(angle)
        return (flat.x, flat.y, sag + radius * (1 - math.cos(angle)))

    sheet(part, steps(-h, h, 10), steps(-h, h, 10), lambda x, y: 0.0, move=roll)
    return build_mesh(scene, 'Note', part, ['kit_note'], vertex_colours=False)


def photo(scene):
    """A polaroid print, 88 x 107 mm and 1.2 mm thick, with 2 mm round corners. The window is
    79 mm square, set 0.3 mm into the border, with a narrow top border and a wide bottom border.
    The window has its own material and UVs, so the code sets the picture."""
    part = Part()
    T, R, recess = 0.0012, 0.002, 0.0003
    hw, hh = 0.044, 0.0535
    wx0, wx1 = -0.0395, 0.0395
    wy1 = hh - 0.0045
    wy0 = wy1 - 0.079
    bow = lambda x, y: 0.0010 * ((hh - y) / (2 * hh)) ** 2
    colour = lambda y: shade(PAPER, 0.97 + 0.03 * (y + hh) / (2 * hh))

    def p(x, y, z):
        return (x, y, z + bow(x, y))

    # Corner arcs counter-clockwise from the lower left, four points each.
    centres = [(-hw + R, -hh + R, 180), (hw - R, -hh + R, 270), (hw - R, hh - R, 0), (-hw + R, hh - R, 90)]
    outline = [(cx + R * math.cos(math.radians(a0 + 30 * i)), cy + R * math.sin(math.radians(a0 + 30 * i)))
               for cx, cy, a0 in centres for i in range(4)]
    front = [part.vert(p(x, y, T), colour(y)) for x, y in outline]
    back = [part.vert(p(x, y, 0.0), colour(y)) for x, y in outline]
    window = [(wx0, wy0), (wx1, wy0), (wx1, wy1), (wx0, wy1)]
    rim = [part.vert(p(x, y, T), colour(y)) for x, y in window]
    for k in range(4):
        arc = front[4 * k:4 * k + 4]
        for j in range(3):
            part.face((rim[k], arc[j], arc[j + 1]), 0)
        nxt = front[4 * ((k + 1) % 4)]
        part.face((arc[3], nxt, rim[(k + 1) % 4], rim[k]), 0)
    n = len(outline)
    for i in range(n):
        part.face((back[i], back[(i + 1) % n], front[(i + 1) % n], front[i]), 0)
    part.face(back[::-1], 0)
    floor = [part.vert(p(x, y, T - recess), colour(y)) for x, y in window]
    for k in range(4):
        part.face((rim[k], rim[(k + 1) % 4], floor[(k + 1) % 4], floor[k]), 0)
    part.face(floor, 1, uv=[(0, 0), (1, 0), (1, 1), (0, 1)])
    return build_mesh(scene, 'Photo', part, ['kit_paper', 'kit_photo_window'])


def card(scene):
    """A 5 x 3 inch index card with cut corners. The pin holds the middle flat and both short
    ends lift 3 mm, with a small extra lift at the lower right corner."""
    part = Part()
    W, H, cut = 0.127, 0.076, 0.0025
    bend = lambda x, y: 0.003 * (2 * x / W) ** 2 + 0.0015 * max(0.0, (x / W - y / H)) ** 2

    def trim(x, y, p):
        if abs(abs(x) - W / 2) < 1e-6 and abs(abs(y) - H / 2) < 1e-6:
            return (p[0] - math.copysign(cut, x), p[1] - math.copysign(cut, y), p[2])
        return p

    sheet(part, steps(-W / 2, W / 2, 12), steps(-H / 2, H / 2, 6), bend, move=trim)
    return build_mesh(scene, 'Card', part, ['kit_card'], vertex_colours=False)


# ---- ledge props ----------------------------------------------------------------------------

def spool(scene):
    """A wooden spool of red string that stands on the ledge. The wound string bulges a little
    between the two flanges."""
    part = Part()
    up, n, wood = (0, 1, 0), 12, SPOOL_WOOD
    part.lathe((0, 0, 0), up, [(0.0130, 0.0), (0.0134, 0.0012), (0.0128, 0.0030), (0.0070, 0.0034)], n,
               colour=shade(wood, 0.92), top=False, bottom=True)
    part.lathe((0, 0, 0), up, [(0.0098, 0.0034), (0.0108, 0.0080), (0.0111, 0.0150), (0.0108, 0.0220), (0.0098, 0.0266)],
               n, mat=1, top=False)
    part.lathe((0, 0, 0), up, [(0.0070, 0.0266), (0.0128, 0.0270), (0.0134, 0.0288), (0.0130, 0.0300)], n,
               colour=wood, top=False)
    hub = part.lathe((0, 0, 0), up, [(0.0130, 0.0300), (0.0030, 0.0300), (0.0030, 0.0285)], n, colour=shade(wood, 0.8), smooth=False)
    return build_mesh(scene, 'Spool', part, ['kit_wood', 'kit_string'])


def pencil(scene):
    """A hexagonal pencil that lies on the ledge with one flat side down. It has a sharpened
    wood cone, a graphite tip, a brass ferrule with two ridges and a pink eraser."""
    part = Part()
    ax, n, r = (1, 0, 0), 6, 0.0036
    # With no turn the ring puts two vertices at -60 and -120 degrees, so a flat side faces down.
    lift = r * math.cos(math.pi / 6)
    turn = 0.0
    c = lambda x: (x, lift, 0.0)
    part.lathe(c(-0.070), ax, [(r, 0.0), (r, 0.120)], n, colour=PENCIL['paint'], turn=turn, smooth=False, top=False)
    part.lathe(c(0.050), ax, [(r, 0.0), (0.0013, 0.017)], n, colour=PENCIL['wood'], turn=turn, smooth=False, top=False)
    part.cone(c(0.067), ax, 0.0013, 0.006, n, colour=PENCIL['lead'], turn=turn)
    part.lathe(c(-0.070), (-1, 0, 0), [(0.0037, 0.0), (0.0039, 0.002), (0.0037, 0.003), (0.0039, 0.005), (0.0037, 0.008)],
               10, colour=PENCIL['ferrule'])
    part.lathe(c(-0.078), (-1, 0, 0), [(0.0034, 0.0), (0.0034, 0.006), (0.0026, 0.0085)], 10, colour=PENCIL['eraser'])
    return build_mesh(scene, 'Pencil', part, ['kit_pencil'])


# ---- scene, export, report ------------------------------------------------------------------

def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def build():
    # A re-run removes the last build first, so no mesh comes back as Board.001.
    for name in (SCENE, PREVIEW):
        if name in bpy.data.scenes:
            old = bpy.data.scenes[name]
            for ob in list(old.objects):
                bpy.data.objects.remove(ob)
            bpy.data.scenes.remove(old)
    for name in KIT:
        if name in bpy.data.meshes:
            bpy.data.meshes.remove(bpy.data.meshes[name])
    scene = bpy.data.scenes.new(SCENE)
    scene.unit_settings.system = 'METRIC'
    for name in MATERIALS:
        material(name)
    makers = (board, ledge, pin_push, pin_map, tape, note, photo, card, spool, pencil)
    objs = [make(scene) for make in makers]
    total = sum(tris(o) for o in objs)
    assert total <= BUDGET, f'{total} triangles, over the {BUDGET} budget'
    return scene, objs


def export(scene):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(
            filepath=str(OUT), export_format='GLB', use_active_scene=True, use_selection=False,
            use_visible=False, use_renderable=False, export_cameras=False, export_lights=False,
            export_extras=False, export_yup=True, export_apply=True, export_texcoords=True,
            export_normals=True, export_tangents=False, export_materials='EXPORT',
            export_vertex_color='ACTIVE', export_all_vertex_colors=False,
            export_active_vertex_color_when_no_material=False, export_animations=False,
            export_image_format='NONE', export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=10, export_draco_position_quantization=14,
            export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
            export_draco_color_quantization=8)
    return OUT.stat().st_size


def report(objs, size):
    rows = {}
    for ob in objs:
        lo = [min((ob.matrix_world @ Vector(c))[i] for c in ob.bound_box) for i in range(3)]
        hi = [max((ob.matrix_world @ Vector(c))[i] for c in ob.bound_box) for i in range(3)]
        # Blender box to glTF box: x stays, glTF y is Blender z, glTF z is minus Blender y.
        rows[ob.name] = {'tris': tris(ob), 'materials': [m.name for m in ob.data.materials],
                         'gltf_box_min': [round(lo[0], 4), round(lo[2], 4), round(-hi[1], 4)],
                         'gltf_box_max': [round(hi[0], 4), round(hi[2], 4), round(-lo[1], 4)]}
    data = {'glb': str(OUT.relative_to(SITE)).replace('\\', '/'), 'bytes': size,
            'tris': sum(r['tris'] for r in rows.values()), 'budget': BUDGET, 'objects': rows,
            'board': {'outer_m': [BOARD_W, BOARD_H], 'cork_m': [round(CORK_W, 3), round(CORK_H, 3)],
                      'cork_plane': 'z = 0, centre at origin, faces +Z glTF',
                      'frame_crown_z': 0.022, 'back_z': -0.04, 'ledge_top_y': LEDGE_TOP}}
    REPORT.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    return data


def preview(objs):
    """Linked copies on the board, red strings between the map pins, a camera and two lights.
    The paper pieces show at 1.7 times real size, close to what a wall layout uses."""
    scene = bpy.data.scenes.new(PREVIEW)
    by = {o.name: o for o in objs}
    put = lambda name, x, y, z=0.0, rz=0.0, s=1.0: _place(scene, by[name], x, y, z, rz, s)
    put('Board', 0, 0)
    put('Ledge', 0, 0)
    put('Spool', 0.42, LEDGE_TOP, 0.036)
    put('Pencil', -0.25, LEDGE_TOP, 0.036, 0, 1.0)
    big = 1.7
    layout = [('Card', -0.45, 0.2, -4, 'Pin_Push'), ('Photo', 0.02, 0.22, 3, 'Pin_Map'), ('Card', 0.5, 0.25, 5, 'Pin_Push'),
              ('Photo', -0.2, -0.15, -6, 'Pin_Map'), ('Note', 0.35, -0.18, 8, 'Pin_Push'), ('Note', -0.56, -0.2, -3, 'Pin_Map'),
              ('Card', 0.18, -0.02, -2, 'Pin_Map')]
    heads = []
    for name, x, y, rz, pin in layout:
        put(name, x, y, 0.001, rz, big)
        top = {'Card': 0.028, 'Photo': 0.042, 'Note': 0.028}[name] * big
        put(pin, x, y + top, 0.003)
        if pin == 'Pin_Map':
            heads.append((x, y + top))
    put('Tape', -0.2, -0.15 + 0.047 * big, 0.0035, -18, big)
    put('Tape', 0.5, 0.25 + 0.03 * big, 0.0035, 25, big)
    red = bpy.data.materials['kit_string']
    for a, b in zip(heads, heads[1:] + heads[:1]):
        _string(scene, a, b, red)
    cam = bpy.data.objects.new('Preview_Cam', bpy.data.cameras.new('Preview_Cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, energy, loc in (('Preview_Key', 4.0, (1.2, -2.0, 2.0)), ('Preview_Fill', 1.5, (-1.5, -1.5, -0.5))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
        light.data.energy = energy
        light.rotation_euler = (-Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(light)
    scene.world = bpy.data.worlds.new('Preview_World')
    scene.world.color = (0.05, 0.05, 0.07)
    return scene


def _place(scene, src, x, y, z, rz, s):
    ob = bpy.data.objects.new(src.name + '_pv', src.data)
    ob.location = gl(x, y, z)
    ob.rotation_euler = (0, math.radians(rz), 0)
    ob.scale = (s, s, s)
    scene.collection.objects.link(ob)
    return ob


def _string(scene, a, b, mat):
    """A taut red string between two map pin shafts, 5 mm off the board, for the preview only."""
    curve = bpy.data.curves.new('Preview_String', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = 0.0009
    curve.bevel_resolution = 1
    spline = curve.splines.new('POLY')
    spline.points.add(1)
    for point, (x, y) in zip(spline.points, (a, b)):
        point.co = (*gl(x, y, 0.005), 1)
    curve.materials.append(mat)
    ob = bpy.data.objects.new('Preview_String', curve)
    scene.collection.objects.link(ob)


def main():
    scene, objs = build()
    size = export(scene)
    data = report(objs, size)
    if '--preview' in ARGS:
        preview(objs)
    print(json.dumps({'bytes': data['bytes'], 'tris': data['tris']}))
    return data


if __name__ == '__main__':
    main()

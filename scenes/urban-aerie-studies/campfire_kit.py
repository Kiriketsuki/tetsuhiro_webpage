"""Campfire kit for the last stop of the home walk: a fire pit and the seats around it.

Run it from this folder with background Blender on an empty file:
    blender --factory-startup -b --python campfire_kit.py -- [--preview]

The script builds the kit in a new scene, Campfire_Kit, and writes one Draco GLB,
src/assets/models/campfire_kit.glb, plus campfire_kit_report.json beside this script. It never
touches aerie.glb or aerie_lod1.glb, and it only reads aerie.glb, to fit the kit to the
lawn and to bake the ambient occlusion against it.

--preview also imports aerie.glb into Campfire_Preview, renders the old hearth and the new kit
from the desktop and the phone campfire shot (stops.js), and saves campfire_kit_rN.blend with the
next free N, so no earlier .blend is overwritten. Renders go to renders/campfire-kit/, which git
ignores with the other renders.

The kit frame is the fire centre: the origin sits on the lawn at Anchor_Campfire, +Z up, +Y north
toward the rim and the city. scene-manager.js puts the kit root on the anchor. The heights come from
the island lawn, so the kit fits that spot only.

Objects, one material each, so the site swaps one material per mesh:
- Fire_Stones (kit_stone): eleven ring stones of mixed size, sooty on the side that faces the fire.
- Fire_Ash (kit_ash): a shallow ash bed inside the ring, charcoal at the centre, grey toward the stones.
- Fire_Wood (kit_bark): five logs in a star, two split logs leaning over the centre, a half-log
  bench on two rounds to the west, two stumps to the east and a small woodpile to the north-west.
- Fire_Fabric (kit_fabric): a red blanket folded over the bench and a mustard cushion on one stump.
- Fire_Coals (kit_ember): coals on the ash and the burning ends of the logs. The site draws them
  unlit and pulses them, so their vertex colour is the glow colour.

Colours are sRGB vertex colours that change slowly over a surface, never per face, so the toon
shading shows coherent facets and no checkerboard. Every lit mesh carries _AO, a ray-cast ambient
occlusion per vertex against the kit and the island, which the toon shader reads as aoBake.
"""
from pathlib import Path
import sys, json, math, random
import bpy, bmesh
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent.parent
ISLAND = SITE / 'src' / 'assets' / 'models' / 'aerie.glb'
OUT = SITE / 'src' / 'assets' / 'models' / 'campfire_kit.glb'
REPORT = ROOT / 'campfire_kit_report.json'
RENDERS = ROOT / 'renders' / 'campfire-kit'
SCENE = 'Campfire_Kit'
PREVIEW = 'Campfire_Preview'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
BUDGET = 6000
SEED = 20261103

# Anchor_Campfire in Blender axes. The glTF node sits at (1.75, 0.365, -8.5).
ANCHOR = Vector((1.75, 8.5, 0.365))
# The lawn meshes of aerie.glb. Tree crowns and flowers stand above the lawn, so the drop
# rays skip them.
GROUND = ('Island', 'Turf', 'Paths', 'Rock', 'Pad')

WHITE = (1.0, 1.0, 1.0)
STONE_WARM = (0.45, 0.41, 0.37)
STONE_COOL = (0.37, 0.38, 0.40)
SOOT = (0.11, 0.10, 0.095)
CHAR = (0.075, 0.065, 0.06)
ASH = (0.40, 0.38, 0.355)
SOIL = (0.27, 0.20, 0.15)
BARK = (0.33, 0.215, 0.135)
BARK_DARK = (0.22, 0.15, 0.10)
MOSS = (0.32, 0.34, 0.17)
CUT = (0.70, 0.54, 0.34)
CUT_RIM = (0.50, 0.36, 0.22)
BLANKET = (0.62, 0.17, 0.12)
BLANKET_BAND = (0.88, 0.80, 0.63)
# A deep teal cushion, the one cool note against the warm wood and the red blanket.
CUSHION = (0.16, 0.40, 0.43)
EMBER_DEEP = (0.62, 0.07, 0.02)
EMBER_HOT = (1.0, 0.42, 0.08)

MATERIALS = {  # name: (base colour, uses vertex colour, emission strength)
    'kit_stone': (WHITE, True, 0.0),
    'kit_ash': (WHITE, True, 0.0),
    'kit_bark': (WHITE, True, 0.0),
    'kit_fabric': (WHITE, True, 0.0),
    'kit_ember': (WHITE, True, 4.0),
}
KIT = {'Fire_Stones': 'kit_stone', 'Fire_Ash': 'kit_ash', 'Fire_Wood': 'kit_bark',
       'Fire_Fabric': 'kit_fabric', 'Fire_Coals': 'kit_ember'}

AO_SAMPLES = 32
AO_DISTANCE = 0.6
AO_BIAS = 4e-3

# The two campfire shots of stops.js in Blender axes: position, target, vertical fov, shift.
# A glTF point (x, y, z) is the Blender point (x, -z, y).
SHOTS = {
    'desktop': dict(pos=(3.6, 1.6, 6.2), target=(4.5, 18.0, 0.0), fov=46, size=(1440, 900), shift=0.1),
    'phone': dict(pos=(3.2, 3.0, 3.6), target=(2.0, 17.0, 0.6), fov=50, size=(824, 1830), shift=0.36),
    # A close review shot from the south-east, not a site shot.
    'close': dict(pos=(4.3, 5.6, 2.3), target=(1.5, 8.7, 0.45), fov=38, size=(1400, 900), shift=0.0),
}


def srgb_to_linear(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def scale(c, f):
    return tuple(min(1.0, v * f) for v in c)


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def field(p, freq, seed=0.0):
    """A smooth noise field in -1..1. Neighbouring vertices get close values, so colour fields
    never jump from face to face."""
    return noise.noise(Vector(p) * freq + Vector((seed, seed * 1.7, seed * 0.3)))


class Part:
    """Collects vertices, colours and faces of one kit mesh in the fire frame (Blender axes)."""

    def __init__(self):
        self.verts, self.colours, self.faces, self.smooth = [], [], [], []

    def vert(self, p, colour=WHITE):
        self.verts.append(tuple(p))
        self.colours.append(colour)
        return len(self.verts) - 1

    def face(self, idx, smooth=False):
        self.faces.append(tuple(idx))
        self.smooth.append(smooth)

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)


class Ground:
    """Drops rays on the island lawn. Heights come back in the fire frame."""

    def __init__(self, objects):
        verts, polys = [], []
        for ob in objects:
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bm.transform(ob.matrix_world)
            base = len(verts)
            verts.extend(v.co.copy() for v in bm.verts)
            polys.extend([base + v.index for v in f.verts] for f in bm.faces)
            bm.free()
        self.tree = BVHTree.FromPolygons(verts, polys)

    def height(self, x, y):
        hit = self.tree.ray_cast(ANCHOR + Vector((x, y, 30.0)), Vector((0, 0, -1)))
        assert hit[0] is not None, f'no lawn under ({x:.2f}, {y:.2f})'
        return hit[0].z - ANCHOR.z

    def plane(self, x, y, r):
        """The lawn height and its slope (dz/dx, dz/dy) at a spot, from five drops."""
        h = self.height(x, y)
        gx = (self.height(x + r, y) - self.height(x - r, y)) / (2 * r)
        gy = (self.height(x, y + r) - self.height(x, y - r)) / (2 * r)
        return h, gx, gy


def rock(part, centre, radii, turn, seed, colour_of, base=-0.4, detail=2):
    """A faceted rock from an icosphere with `detail` splits. The noise moves each vertex along its own
    direction, so the shape stays one closed lump. The bottom is cut flat at `base`."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=1.0)
    rot = Matrix.Rotation(turn, 3, 'Z')
    index = {}
    for v in bm.verts:
        d = v.co.normalized()
        r = 1.0 + 0.22 * field(d, 1.3, seed)
        local = Vector((d.x * r * radii[0], d.y * r * radii[1], max(d.z * r, base) * radii[2]))
        p = Vector(centre) + rot @ local
        index[v.index] = part.vert(p, colour_of(p, d))
    for f in bm.faces:
        part.face([index[v.index] for v in f.verts])
    bm.free()


def stones(ground):
    """Eleven ring stones of mixed size round a 0.5 m ring. Each stone has its own warm or cool
    grey, lighter on top, and soot on the face toward the fire."""
    part = Part()
    rng = random.Random(SEED)
    count = 11
    for i in range(count):
        angle = i / count * math.tau + rng.uniform(-0.12, 0.12)
        ring = 0.5 + rng.uniform(-0.03, 0.04)
        size = rng.uniform(0.11, 0.17) * (1.15 if i % 3 == 0 else 1.0)
        x, y = math.cos(angle) * ring, math.sin(angle) * ring
        z = ground.height(x, y) + size * 0.22
        tone = mix(STONE_WARM, STONE_COOL, 0.5 + 0.5 * field((x, y, 0), 2.1, 3.0))
        inward = Vector((-x, -y, 0)).normalized()

        def colour_of(p, d, tone=tone, inward=inward):
            top = smooth(-0.2, 0.9, d.z)
            c = scale(tone, 0.82 + 0.3 * top + 0.08 * field(p, 9.0, 5.0))
            soot = smooth(-0.1, 0.8, d.dot(inward)) * (0.55 + 0.45 * smooth(0.3, -0.5, d.z))
            return mix(c, SOOT, 0.82 * soot)

        radii = (size * rng.uniform(1.05, 1.35), size * rng.uniform(0.85, 1.0), size * rng.uniform(0.7, 0.95))
        rock(part, (x, y, z), radii, angle + rng.uniform(-0.4, 0.4), i * 3.7, colour_of)
    return part


def ash(ground):
    """A shallow ash bed: rings of 16 vertices out to 0.56 m, under the stones. It follows the
    lawn and domes 3 cm at the centre."""
    part = Part()
    radii = (0.0, 0.1, 0.2, 0.31, 0.42, 0.56)
    n = 16
    rings = []
    for k, r in enumerate(radii):
        ring = []
        for i in range(1 if r == 0 else n):
            a = i / n * math.tau + k * 0.2
            x, y = math.cos(a) * r, math.sin(a) * r
            wobble = 1 + 0.08 * field((x, y, 0), 4.0, 11.0) if r > 0 else 1
            x, y = x * wobble, y * wobble
            z = ground.height(x, y) + 0.012 + 0.03 * (1 - r / radii[-1]) ** 2
            t = r / radii[-1]
            c = mix(CHAR, ASH, smooth(0.15, 0.55, t + 0.12 * field((x, y, 0), 5.0, 13.0)))
            c = mix(c, SOIL, smooth(0.78, 1.0, t))
            ring.append(part.vert((x, y, z), c))
        rings.append(ring)
    for i in range(n):
        part.face((rings[0][0], rings[1][i], rings[1][(i + 1) % n]))
    for a, b in zip(rings[1:], rings[2:]):
        for i in range(n):
            part.face((a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]))
    return part


def log(part, p0, p1, radius, sides, sections, colour_at, seed, caps=(True, True), cap_colour=None, ember=None):
    """A low-poly log from p0 to p1 with a slight bend and an uneven radius. colour_at(t, d)
    gives the side colour at t along the log (0 at p0) and the outward direction d. cap_colour
    colours the p0 end cap. ember, a Part, takes a glowing cap at p1."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = (p1 - p0).normalized()
    helper = Vector((0, 0, 1)) if abs(axis.z) < 0.9 else Vector((1, 0, 0))
    u = helper.cross(axis).normalized()
    v = axis.cross(u)
    bend = u * field(p0, 3.0, seed) * radius * 0.6
    rings = []
    for s in range(sections + 1):
        t = s / sections
        centre = p0.lerp(p1, t) + bend * math.sin(t * math.pi)
        ring = []
        for i in range(sides):
            a = i / sides * math.tau + seed
            d = math.cos(a) * u + math.sin(a) * v
            r = radius * (1 + 0.12 * field(centre + d * 0.1, 6.0, seed))
            ring.append(part.vert(centre + d * r, colour_at(t, d)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            part.face((a[i], a[(i + 1) % sides], b[(i + 1) % sides], b[i]))
    if caps[0]:
        # A fan from the centre, so the cut face shades from a light core to a darker rim.
        c = part.vert(p0 + bend * 0.0, cap_colour or CUT)
        ring = rings[0]
        for i in range(sides):
            part.face((c, ring[(i + 1) % sides], ring[i]))
    if caps[1]:
        part.face(rings[-1])
    if ember is not None:
        end = p1 + bend * math.sin(math.pi)
        glow = [ember.vert(end - axis * 0.01 + (math.cos(i / sides * math.tau + seed) * u + math.sin(i / sides * math.tau + seed) * v) * radius * 1.06, EMBER_DEEP)
                for i in range(sides)]
        tip = ember.vert(end + axis * radius * 0.35, EMBER_HOT)
        for i in range(sides):
            ember.face((glow[i], glow[(i + 1) % sides], tip))
    return rings


def bark_colour(seed, char_from=None):
    """Bark with a slow mottle and a dark underside. char_from: the t past which the bark chars
    to black, for the logs in the fire."""
    def colour_at(t, d):
        c = mix(BARK, BARK_DARK, 0.5 + 0.5 * field((t * 2, d.x, d.y), 2.0, seed))
        c = mix(c, BARK_DARK, smooth(0.2, -0.8, d.z) * 0.6)
        if char_from is not None:
            c = mix(c, CHAR, smooth(char_from, char_from + 0.35, t))
        return c
    return colour_at


def fire_logs(ground, wood, coals):
    """Five logs in a star with their inner ends in the fire, and two split logs leaning over
    the centre. The inner ends char to black and carry an ember cap."""
    rng = random.Random(SEED + 1)
    for i, angle in enumerate((0.35, 1.6, 2.85, 4.1, 5.3)):
        outer_r, inner_r = 0.6, 0.08
        ox, oy = math.cos(angle) * outer_r, math.sin(angle) * outer_r
        ix, iy = math.cos(angle) * inner_r, math.sin(angle) * inner_r
        radius = rng.uniform(0.062, 0.08)
        p0 = (ox, oy, ground.height(ox, oy) + radius * 0.9)
        p1 = (ix, iy, ground.height(ix, iy) + 0.04 + radius + 0.03 * (i % 2))
        log(wood, p0, p1, radius, 7, 4, bark_colour(i * 2.0, char_from=0.45), i * 1.3, caps=(True, False), ember=coals)
    for i, angle in enumerate((1.1, 4.2)):
        foot = 0.2
        fx, fy = math.cos(angle) * foot, math.sin(angle) * foot
        p0 = (fx, fy, ground.height(fx, fy) + 0.03)
        p1 = (-fx * 0.15, -fy * 0.15, 0.3)
        log(wood, p0, p1, 0.04, 5, 3, bark_colour(9.0 + i, char_from=0.1), 7.0 + i, caps=(True, False), ember=coals)


def coal_bed(ground, coals):
    """Coals on the ash round the log ends. Smooth patches of the noise field choose between a
    deep red and a hot orange, so a coal reads as glowing cracks under a dark crust."""
    rng = random.Random(SEED + 2)
    for i in range(16):
        a = rng.uniform(0, math.tau)
        r = rng.uniform(0.04, 0.27)
        x, y = math.cos(a) * r, math.sin(a) * r
        size = rng.uniform(0.04, 0.07)
        z = ground.height(x, y) + 0.03 + 0.03 * (1 - r / 0.27)

        def colour_of(p, d, i=i):
            heat = 0.5 + 0.5 * field(p, 22.0, i)
            c = mix(EMBER_DEEP, EMBER_HOT, smooth(0.35, 0.8, heat))
            return mix(c, CHAR, smooth(0.55, 0.95, d.z) * 0.6)

        rock(coals, (x, y, z), (size * 1.3, size, size * 0.7), a, 40 + i, colour_of, base=-0.5, detail=1)


def cylinder(part, base, height, radii, sides, colour_at, top_colours, seed, tilt=Matrix.Identity(3)):
    """An upright round from a list of (height fraction, radius factor) rings. The top cap is a
    two-ring fan: centre, inner ring and rim, so the cut face shades like growth rings."""
    base = Vector(base)
    rings = []
    for hf, rf in radii:
        ring = []
        for i in range(sides):
            a = i / sides * math.tau + seed
            d = Vector((math.cos(a), math.sin(a), 0))
            r = rf * (1 + 0.08 * field(d * 2 + Vector((0, 0, hf)), 3.0, seed))
            ring.append(part.vert(base + tilt @ Vector((d.x * r, d.y * r, hf * height)), colour_at(hf, d)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            part.face((a[i], a[(i + 1) % sides], b[(i + 1) % sides], b[i]))
    top = rings[-1]
    r_top = radii[-1][1]
    inner = []
    for i in range(sides):
        a = i / sides * math.tau + seed
        inner.append(part.vert(base + tilt @ Vector((math.cos(a) * r_top * 0.55, math.sin(a) * r_top * 0.55, height + 0.004)), top_colours[1]))
    centre = part.vert(base + tilt @ Vector((0, 0, height + 0.006)), top_colours[0])
    for i in range(sides):
        part.face((top[i], top[(i + 1) % sides], inner[(i + 1) % sides], inner[i]))
        part.face((inner[i], inner[(i + 1) % sides], centre))
    return rings


def tilt_of(gx, gy, amount=1.0):
    """The rotation that lays +Z along the lawn normal, by `amount` of the full slope."""
    n = Vector((-gx * amount, -gy * amount, 1)).normalized()
    return Vector((0, 0, 1)).rotation_difference(n).to_matrix()


def stump(ground, wood, x, y, radius, height, seed):
    """A cut stump with a root flare, bark sides with a little moss low on the north side, and a
    light cut top with a darker rim."""
    h, gx, gy = ground.plane(x, y, radius)
    tilt = tilt_of(gx, gy, 0.5)

    def colour_at(hf, d):
        c = mix(BARK, BARK_DARK, 0.5 + 0.5 * field(d * 1.5 + Vector((0, 0, hf * 3)), 1.0, seed))
        c = mix(c, MOSS, smooth(0.35, 0.0, hf) * smooth(0.0, 0.9, d.y) * 0.7)
        return mix(c, CUT_RIM, smooth(0.9, 1.0, hf) * 0.5)

    rings = [(0.0, radius * 1.32), (0.12, radius * 1.1), (0.5, radius), (1.0, radius * 0.97)]
    cylinder(wood, (x, y, h - 0.03), height + 0.03, [(f, r) for f, r in rings], 9, colour_at, (CUT, scale(CUT, 0.88)), seed, tilt)
    return h, tilt


def bench(ground, wood, x, y, turn, length=1.5, radius=0.17, seat=0.44):
    """A half-log bench on two log rounds. The flat face of the half log is the seat. turn
    turns the bench about Z from a north-south run. The seat stays level at the mean lawn
    height of its two ends, and each round reaches down to the lawn under it."""
    rot = Matrix.Rotation(turn, 3, 'Z')
    along = rot @ Vector((0, 1, 0))
    across = rot @ Vector((1, 0, 0))
    ends = [Vector((x, y, 0)) + along * (s * length / 2) for s in (-1, 1)]
    level = sum(ground.height(p.x, p.y) for p in ends) / 2 + seat
    p0 = ends[0] + Vector((0, 0, level))
    p1 = ends[1] + Vector((0, 0, level))
    # The half-log profile: a flat top from one edge to the other, then the round underside.
    # Each point is (across, down) in metres and a flag for the cut face.
    sides = 9
    profile = [(math.cos(math.pi + i / (sides - 1) * math.pi) * radius, math.sin(math.pi + i / (sides - 1) * math.pi) * radius * 0.9)
               for i in range(sides)]
    sections = 6
    rings = []
    for s in range(sections + 1):
        t = s / sections
        centre = p0.lerp(p1, t)
        ring = []
        for j, (a, d) in enumerate(profile):
            wob = 1 + 0.05 * field(centre + Vector((a, 0, d)) * 4, 2.0, 21.0)
            p = centre + across * a * wob + Vector((0, 0, d * wob))
            under = -d / radius
            c = mix(BARK, BARK_DARK, 0.4 + 0.4 * field(p, 2.5, 22.0) + 0.3 * under)
            ring.append(wood.vert(p, c))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for j in range(sides - 1):
            wood.face((a[j], b[j], b[j + 1], a[j + 1]))
    # The seat face: a strip of its own over the top edge vertices, in cut wood colour. A
    # crease at the edge keeps the bark colour off the seat.
    top = []
    for s in range(sections + 1):
        t = s / sections
        centre = p0.lerp(p1, t)
        row = []
        for k in range(3):
            a = (-1 + k) * radius * 0.98
            p = centre + across * a + Vector((0, 0, 0.003))
            c = mix(CUT, CUT_RIM, abs(k - 1) * 0.6 + 0.25 * (0.5 + 0.5 * field(p, 3.0, 23.0)))
            row.append(wood.vert(p, c))
        top.append(row)
    for a, b in zip(top, top[1:]):
        for k in range(2):
            wood.face((a[k], a[k + 1], b[k + 1], b[k]))
    for ring, flip in ((rings[0], False), (rings[-1], True)):
        centre = wood.vert(sum((Vector(wood.verts[i]) for i in ring), Vector()) / len(ring), CUT)
        for j in range(sides - 1):
            f = (centre, ring[j], ring[j + 1])
            wood.face(f[::-1] if flip else f)
    # Two log rounds under the half log, a quarter of the length in from each end.
    for s in (0.22, 0.78):
        c = p0.lerp(p1, s)
        h = ground.height(c.x, c.y)
        top_z = c.z - radius * 0.86
        cylinder(wood, (c.x, c.y, h - 0.03), top_z - h + 0.03, [(0, 0.21), (0.2, 0.175), (1, 0.16)], 9,
                 lambda hf, d: mix(BARK_DARK, BARK, hf), (CUT, CUT_RIM), 31.0 + s)
    return p0, p1, across


def blanket(fabric, p0, p1, across, radius=0.17, start=0.62, width=0.5):
    """A blanket folded over the bench: across the seat, a short hang on the fire side and a
    longer hang on the far side. A cream band runs across it near one end."""
    along = (p1 - p0).normalized()
    origin = p0.lerp(p1, start)
    # The cross section: (across offset, height offset) from the seat line, from the fire-side
    # hem over the seat to the far-side hem.
    path = [(radius + 0.02, -0.16), (radius + 0.03, -0.05), (radius - 0.01, 0.022), (radius * 0.4, 0.03), (-radius * 0.4, 0.03),
            (-(radius - 0.01), 0.022), (-(radius + 0.035), -0.06), (-(radius + 0.05), -0.22), (-(radius + 0.06), -0.33)]
    rows = [0.0, 0.05, 0.075, 0.09, 0.13, 0.145, 0.25, 0.37, width]
    grid = []
    for v in rows:
        row = []
        for k, (a, h) in enumerate(path):
            hang = max(0.0, -h - 0.04)
            fold = 0.025 * math.sin(v / width * math.tau * 2 + k) * smooth(0.0, 0.2, hang)
            p = origin + along * (v - width / 2 + fold) + across * a + Vector((0, 0, h))
            band = 1.0 if 0.075 <= v <= 0.13 else 0.0
            c = mix(BLANKET, BLANKET_BAND, band * 0.92)
            c = scale(c, 0.9 + 0.1 * field(p, 4.0, 41.0))
            row.append(fabric.vert(p, c))
        grid.append(row)
    for a, b in zip(grid, grid[1:]):
        for k in range(len(path) - 1):
            fabric.face((a[k], a[k + 1], b[k + 1], b[k]), smooth=True)


def cushion(fabric, centre, size=0.34, thick=0.15, tilt=Matrix.Identity(3), turn=0.3):
    """A plump square cushion: a UV sphere pushed out to a rounded square, with a darker seam."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.0)
    rot = tilt @ Matrix.Rotation(turn, 3, 'Z')
    index = {}
    for v in bm.verts:
        d = v.co.normalized()
        rxy = math.hypot(d.x, d.y)
        if rxy > 1e-6:
            sq = (abs(d.x) ** 4 + abs(d.y) ** 4) ** 0.25
            k = rxy / max(sq, 1e-6) ** 1.0
            k = 1 + (k - 1) * 0.85
        else:
            k = 1
        local = Vector((d.x * k * size / 2, d.y * k * size / 2, d.z * thick / 2 * (0.75 + 0.25 * (1 - rxy))))
        p = Vector(centre) + rot @ local
        c = scale(CUSHION, 0.78 + 0.22 * smooth(0.0, 0.35, abs(d.z)))
        index[v.index] = fabric.vert(p, c)
    for f in bm.faces:
        fabric.face([index[v.index] for v in f.verts], smooth=True)
    bm.free()


def woodpile(ground, wood, x, y, turn):
    """Split logs stacked three, two, one, with their cut ends to the south."""
    rot = Matrix.Rotation(turn, 3, 'Z')
    along = rot @ Vector((0, 1, 0))
    across = rot @ Vector((1, 0, 0))
    h = ground.height(x, y)
    r = 0.06
    for level, count in enumerate((3, 2, 1)):
        for k in range(count):
            off = (k - (count - 1) / 2) * r * 2.05
            c = Vector((x, y, h + r + level * r * 1.75)) + across * off
            p0 = c - along * 0.26
            p1 = c + along * 0.26
            log(wood, p0, p1, r * (0.9 + 0.1 * ((level + k) % 2)), 6, 2, bark_colour(50 + level * 3 + k), 60 + level * 3 + k,
                caps=(True, True))


def material(name):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    base, vertex, emit = MATERIALS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(base), 1)
    bsdf.inputs['Roughness'].default_value = 0.9
    if vertex:
        attr = nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
        if emit:
            links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
    if emit:
        bsdf.inputs['Emission Strength'].default_value = emit
    return m


def build_mesh(collection, name, part):
    me = bpy.data.meshes.new(name)
    me.from_pydata([Vector(v) for v in part.verts], [], part.faces)
    me.materials.append(bpy.data.materials[KIT[name]])
    for p, s in zip(me.polygons, part.smooth):
        p.use_smooth = s
    attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    for i, c in enumerate(part.colours):
        attr.data[i].color_srgb = (*c, 1)
    me.color_attributes.active_color = attr
    faces = len(me.polygons)
    me.validate()
    assert len(me.polygons) == faces, f'{name}: validate removed faces'
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob


def import_island():
    """Imports aerie.glb into the active scene and returns the new objects."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ISLAND))
    return [o for o in bpy.data.objects if o not in before]


def bake_ao(objects, occluders):
    """Casts AO_SAMPLES cosine-weighted rays from every vertex of the lit kit meshes against the
    kit and the island, and writes 1 minus the hit share to the point attribute _AO."""
    verts, polys = [], []
    for ob in occluders:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.transform(ob.matrix_world)
        base = len(verts)
        verts.extend(v.co.copy() for v in bm.verts)
        polys.extend([base + v.index for v in f.verts] for f in bm.faces)
        bm.free()
    tree = BVHTree.FromPolygons(verts, polys)
    rng = random.Random(SEED + 7)
    shift = ANCHOR
    stats = {}
    for ob in objects:
        me = ob.data
        me.calc_loop_triangles()
        normals = [Vector() for _ in me.vertices]
        for p in me.polygons:
            for vi in p.vertices:
                normals[vi] += p.normal * p.area
        values = []
        for v, n in zip(me.vertices, normals):
            n = n.normalized() if n.length > 0 else Vector((0, 0, 1))
            t = n.orthogonal().normalized()
            b = n.cross(t)
            o = v.co + shift + n * AO_BIAS
            hits = 0
            for k in range(AO_SAMPLES):
                u = (k + rng.random()) / AO_SAMPLES
                phi = math.tau * (k * 0.618034 + rng.random())
                r = math.sqrt(u)
                d = t * (r * math.cos(phi)) + b * (r * math.sin(phi)) + n * math.sqrt(1 - u)
                if tree.ray_cast(o, d, AO_DISTANCE)[0] is not None:
                    hits += 1
            values.append(1 - hits / AO_SAMPLES)
        attr = me.attributes.new('_AO', 'FLOAT', 'POINT')
        attr.data.foreach_set('value', values)
        stats[ob.name] = round(sum(values) / len(values), 3)
    return stats


def build(island):
    for name in (SCENE, PREVIEW):
        if name in bpy.data.scenes:
            bpy.data.scenes.remove(bpy.data.scenes[name])
    for name in MATERIALS:
        material(name)
    ground = Ground([o for o in island if o.type == 'MESH' and o.name in GROUND])
    parts = {name: Part() for name in KIT}
    parts['Fire_Stones'] = stones(ground)
    parts['Fire_Ash'] = ash(ground)
    wood, coals, fabric = parts['Fire_Wood'], parts['Fire_Coals'], parts['Fire_Fabric']
    fire_logs(ground, wood, coals)
    coal_bed(ground, coals)
    # The bench sits west of the fire, a little to the south, turned to face the fire and the
    # city beyond it. The stumps sit east and south-east. The north stays open toward the city.
    p0, p1, across = bench(ground, wood, -1.5, 0.15, math.radians(-12))
    blanket(fabric, p0, p1, across)
    h, tilt = stump(ground, wood, 1.42, 0.42, 0.2, 0.42, 3.0)
    cushion(fabric, (1.42, 0.42, h + 0.42 + 0.07), tilt=tilt)
    stump(ground, wood, 1.22, -0.68, 0.17, 0.34, 5.0)
    woodpile(ground, wood, -1.05, 1.2, math.radians(15))
    collection = bpy.data.collections.new(SCENE)
    objs = [build_mesh(collection, name, parts[name]) for name in KIT]
    total = sum(p.tris() for p in parts.values())
    assert total <= BUDGET, f'{total} triangles, over the {BUDGET} budget'
    scene = bpy.data.scenes.new(SCENE)
    scene.unit_settings.system = 'METRIC'
    scene.collection.children.link(collection)
    return scene, collection, objs, parts


def export(scene):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(
            filepath=str(OUT), export_format='GLB', use_active_scene=True, use_selection=False,
            use_visible=False, use_renderable=False, export_cameras=False, export_lights=False,
            export_extras=False, export_yup=True, export_apply=True, export_texcoords=False,
            export_normals=True, export_tangents=False, export_materials='EXPORT',
            export_vertex_color='ACTIVE', export_all_vertex_colors=False,
            export_active_vertex_color_when_no_material=False, export_attributes=True,
            export_animations=False, export_image_format='NONE',
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10,
            export_draco_position_quantization=14, export_draco_normal_quantization=10,
            export_draco_color_quantization=8, export_draco_generic_quantization=10)
    return OUT.stat().st_size


def old_hearth(collection):
    """The hearth that campfire.js built before this kit: seven dodecahedron stones and two
    crossed logs in flat unlit colours. Only the before render uses it."""
    def flat(name, hexcolour):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nodes = m.node_tree.nodes
        nodes.clear()
        out = nodes.new('ShaderNodeOutputMaterial')
        em = nodes.new('ShaderNodeEmission')
        rgb = tuple(int(hexcolour[i:i + 2], 16) / 255 for i in (0, 2, 4))
        em.inputs['Color'].default_value = (*srgb_to_linear(rgb), 1)
        m.node_tree.links.new(em.outputs[0], out.inputs[0])
        return m
    stone, wood = flat('old_stone', '4a443f'), flat('old_wood', '3a2418')
    for i in range(7):
        a = i / 7 * math.tau
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.16)
        ob = bpy.context.active_object
        bpy.ops.object.shade_flat()
        # three.js places the stone at (cos a, 0.06, sin a) * 0.45 in a y-up frame.
        ob.location = (math.cos(a) * 0.45, -math.sin(a) * 0.45, 0.06)
        ob.rotation_euler = (i * 1.3, i * 2.1, i * 0.7)
        ob.scale = (1, 1, 0.7)
        ob.data.materials.append(stone)
        _move(ob, collection)
    for turn in (0.5, -0.6):
        bpy.ops.mesh.primitive_cylinder_add(vertices=5, radius=0.065, depth=0.8)
        ob = bpy.context.active_object
        ob.location = (0, 0, 0.08)
        ob.rotation_euler = (0, math.pi / 2, turn)
        ob.data.materials.append(wood)
        _move(ob, collection)


def _move(ob, collection):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    collection.objects.link(ob)


def flame(collection):
    """A stand-in for the shader flame of campfire.js, the same in both renders: an inner
    yellow teardrop inside an orange one."""
    for name, r, h, colour, strength in (('Flame_Outer', 0.2, 0.85, (1.0, 0.36, 0.06), 9.0), ('Flame_Inner', 0.11, 0.55, (1.0, 0.78, 0.35), 14.0)):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nodes = m.node_tree.nodes
        nodes.clear()
        out = nodes.new('ShaderNodeOutputMaterial')
        em = nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (*colour, 1)
        em.inputs['Strength'].default_value = strength
        m.node_tree.links.new(em.outputs[0], out.inputs[0])
        part = Part()
        n = 10
        rings = []
        for k in range(7):
            t = k / 6
            rr = r * math.sin(min(1.0, t * 1.4) * math.pi * 0.62) * (1 - t) ** 0.6 + 1e-3
            rings.append([part.vert((math.cos(i / n * math.tau) * rr, math.sin(i / n * math.tau) * rr, 0.06 + t * h)) for i in range(n)])
        for a, b in zip(rings, rings[1:]):
            for i in range(n):
                part.face((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]), smooth=True)
        me = bpy.data.meshes.new(name)
        me.from_pydata(part.verts, [], part.faces)
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        # The fire light sits inside the flame, so the flame must not block it.
        ob.visible_shadow = False
        collection.objects.link(ob)


def prepare_island_materials(island):
    """glTF materials ignore COLOR_0, so each lit island material multiplies its base colour by
    the imported colour attribute. The island bakes its colour into that attribute."""
    for ob in island:
        if ob.type != 'MESH':
            continue
        for m in ob.data.materials:
            if not m or m.get('vc_done'):
                continue
            m['vc_done'] = True
            nodes, links = m.node_tree.nodes, m.node_tree.links
            bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not bsdf:
                continue
            attr = nodes.new('ShaderNodeVertexColor')
            attr.layer_name = ob.data.color_attributes[0].name if ob.data.color_attributes else 'Color'
            base = bsdf.inputs['Base Color']
            if base.is_linked:
                mul = nodes.new('ShaderNodeMix')
                mul.data_type = 'RGBA'
                mul.blend_type = 'MULTIPLY'
                mul.inputs['Factor'].default_value = 1
                links.new(base.links[0].from_socket, mul.inputs[6])
                links.new(attr.outputs['Color'], mul.inputs[7])
                links.new(mul.outputs[2], base)
            else:
                links.new(attr.outputs['Color'], base)


def preview(kit_collection, island):
    """Renders the old hearth and the new kit from both campfire shots and saves a new .blend."""
    scene = bpy.data.scenes.new(PREVIEW)
    for ob in island:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
    island_col = bpy.data.collections.new('Island_B')
    scene.collection.children.link(island_col)
    for ob in island:
        island_col.objects.link(ob)
    prepare_island_materials(island)
    old = bpy.data.collections.new('Old_Hearth')
    old_hearth(old)
    fire = bpy.data.collections.new('Flame_Standin')
    flame(fire)
    rigs = {}
    for name, col in (('Kit', kit_collection), ('Old', old), ('Flame', fire)):
        empty = bpy.data.objects.new(f'{name}_At_Anchor', None)
        empty.instance_type = 'COLLECTION'
        empty.instance_collection = col
        empty.location = ANCHOR
        scene.collection.objects.link(empty)
        rigs[name] = empty
    # The night: a dark blue world, a pale moon from Anchor_Moon and the fire light.
    world = bpy.data.worlds.new('Night')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.09, 0.09, 0.16, 1)
    bg.inputs['Strength'].default_value = 1.0
    scene.world = world
    moon = bpy.data.objects.new('Moon', bpy.data.lights.new('Moon', 'SUN'))
    moon.data.energy = 1.6
    moon.data.color = (0.75, 0.8, 1.0)
    moon_dir = Vector((-28.4, -23.65, 70.96)).normalized()
    moon.rotation_euler = moon_dir.to_track_quat('Z', 'Y').to_euler()
    scene.collection.objects.link(moon)
    glow = bpy.data.objects.new('Fire_Light', bpy.data.lights.new('Fire_Light', 'POINT'))
    glow.data.energy = 140
    glow.data.color = (1.0, 0.55, 0.22)
    glow.data.shadow_soft_size = 0.15
    glow.location = ANCHOR + Vector((0, 0, 0.45))
    scene.collection.objects.link(glow)
    cam = bpy.data.objects.new('Campfire_Cam', bpy.data.cameras.new('Campfire_Cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 48
    scene.view_settings.view_transform = 'AgX'
    # Blender 4 names the look 'AgX - Punchy'. Later versions drop the prefix.
    for look in ('AgX - Punchy', 'Punchy'):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            continue
    RENDERS.mkdir(parents=True, exist_ok=True)
    out = []
    for shot_name, shot in SHOTS.items():
        pos, target = Vector(shot['pos']), Vector(shot['target'])
        cam.location = pos
        cam.rotation_euler = (target - pos).to_track_quat('-Z', 'Y').to_euler()
        cam.data.sensor_fit = 'VERTICAL'
        cam.data.angle_y = math.radians(shot['fov'])
        w, h = shot['size']
        # camera-rig.js moves the view window down by shift times the frame height, so the
        # picture moves up. Blender measures the shift in the larger frame side.
        cam.data.shift_y = -shot['shift'] * h / max(w, h)
        scene.render.resolution_x, scene.render.resolution_y = w, h
        scene.render.resolution_percentage = 100
        for state in ('before', 'after'):
            rigs['Kit'].hide_render = state == 'before'
            rigs['Old'].hide_render = state == 'after'
            path = RENDERS / f'{state}-{shot_name}.png'
            scene.render.filepath = str(path)
            with bpy.context.temp_override(scene=scene):
                bpy.ops.render.render(write_still=True, scene=scene.name)
            out.append(str(path.relative_to(SITE)).replace('\\', '/'))
    n = 1
    while (ROOT / f'campfire_kit_r{n}.blend').exists():
        n += 1
    blend = ROOT / f'campfire_kit_r{n}.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), copy=True)
    return out, blend.name


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    island = import_island()
    scene, collection, objs, parts = build(island)
    lit = [o for o in objs if o.name != 'Fire_Coals']
    island_meshes = [o for o in island if o.type == 'MESH']
    # The AO rays run in island space, so the kit meshes take the anchor offset for the bake.
    for ob in objs:
        ob.location = ANCHOR
    bpy.context.view_layer.update()
    ao = bake_ao(lit, island_meshes + objs)
    for ob in objs:
        ob.location = (0, 0, 0)
    size = export(scene)
    data = {'glb': str(OUT.relative_to(SITE)).replace('\\', '/'), 'bytes': size, 'budget_tris': BUDGET,
            'anchor_blender': list(ANCHOR), 'tris': {n: p.tris() for n, p in parts.items()},
            'total_tris': sum(p.tris() for p in parts.values()), 'mean_ao': ao}
    if '--preview' in ARGS:
        data['renders'], data['blend'] = preview(collection, island)
    REPORT.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    print('CAMPFIRE_KIT', json.dumps(data))


main()

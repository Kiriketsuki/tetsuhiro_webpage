"""Round 21 pass: a finer brass refractor on the telescope terrace.

Run it from this folder with background Blender on the round 20 revision:
    blender --factory-startup -b island_b_route_r34.blend --python round21_telescope.py -- [--dry]

--dry builds the telescope in memory and prints the report, but saves no .blend and no report.
The script saves a new revision, island_b_route_r35.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why: the site flies the camera to the eyepiece and looks through it at the
skill sky. The round 7 telescope had a star diagonal whose eyepiece pointed straight up, and the
back of its tube stopped 17 cm short of the house wall, so no camera could line up with it. The
user asked for a finer telescope under 5,000 triangles, aligned so the view looks through it.
- SS_TL_Telescope gets a new mesh: a brass refractor with a dew shield, an objective lens, four
  bevel bands, two cradle rings, a finder scope, a rack focuser and a straight-through eyepiece
  with a rubber eyecup, on a brass fork mount and a wooden tripod with a spreader tray.
- The tube points north along the terrace and 30 degrees up, over the north railing into open
  sky. Its eyepiece faces south, toward the telescope stop camera, over the observing stool.
  So the camera can end on the optical axis, behind the eye lens.
- The report gives the eye lens centre and the optical axis in the glTF frame, for stops.js.
Nothing else moves.
"""
from pathlib import Path
import sys, json, math
import bpy, bmesh
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'island_b_route_r34.blend'
OUTPUT = ROOT / 'island_b_route_r35.blend'
REPORT = ROOT / 'island_b_route_r35_report.json'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

OBJECT = 'SS_TL_Telescope'
BUDGET = 5000
# Material slots. The site paints every bright metal in one brass, and paints the dark metal
# inside the tube box as a light brass bevel (island-look.js), so the bands read as lit rings.
# A_screen is a faint warm emitter on the site, so the lenses read as lit glass.
MATERIALS = ['LP_SS_A_metal', 'SS_TL_Brushed_Steel', 'SS_TL_Aged_Brass', 'LP_SS_A_wood_light', 'SS_TL_Charcoal', 'PT_LP_SS_A_screen']
BAND, STEEL, BRASS, WOOD, RUBBER, GLASS = range(6)

# The tripod stands on the terrace deck (z 7.45) between the west railing and the house wall.
FOOT = Vector((-7.66, 4.55, 7.45))
# The tripod head sits 1.10 m above the deck and the altitude axle 1.38 m, so the eyepiece meets
# the eye of an observer on the stool. The tube points north, a little west, 30 degrees up.
HEAD_Z = 1.10
AXLE = FOOT + Vector((0, 0, HEAD_Z + 0.28))
AXIS = Vector((-0.10, 0.86, 0.50)).normalized()
SIDE = AXIS.cross(Vector((0, 0, 1))).normalized()
UP = SIDE.cross(AXIS).normalized()
TUBE_R = 0.085


class Mesh:
    """A bmesh with small solid builders. Every builder takes world points in metres."""

    def __init__(self):
        self.bm = bmesh.new()

    def frame(self, axis):
        axis = axis.normalized()
        u = axis.cross(Vector((0, 0, 1)))
        if u.length < 1e-3:
            u = axis.cross(Vector((0, 1, 0)))
        u.normalize()
        return axis, u, axis.cross(u).normalized()

    def ring(self, centre, radius, u, v, n, turn=0.0):
        return [self.bm.verts.new(centre + radius * (math.cos(turn + i * math.tau / n) * u + math.sin(turn + i * math.tau / n) * v)) for i in range(n)]

    def face(self, verts, mat):
        self.bm.faces.new(verts).material_index = mat

    def bridge(self, a, b, mat):
        n = len(a)
        for i in range(n):
            self.face([a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]], mat)

    def tube(self, a, b, r1, r2=None, n=24, mat=BRASS, caps=(True, True), turn=0.0):
        """A cylinder or a cone from a to b. Each cap is a single n-gon."""
        a, b = Vector(a), Vector(b)
        _, u, v = self.frame(b - a)
        ra = self.ring(a, r1, u, v, n, turn)
        rb = self.ring(b, r1 if r2 is None else r2, u, v, n, turn)
        self.bridge(ra, rb, mat)
        if caps[0]:
            self.face(list(reversed(ra)), mat)
        if caps[1]:
            self.face(rb, mat)
        return ra, rb

    def shell(self, a, b, r_out, r_in, n=24, mat=BRASS, lips=(True, True), inner=True):
        """An open sleeve with flat annular lips. A sleeve that hugs a tube needs no inner wall."""
        a, b = Vector(a), Vector(b)
        _, u, v = self.frame(b - a)
        oa, ob = self.ring(a, r_out, u, v, n), self.ring(b, r_out, u, v, n)
        ia, ib = self.ring(a, r_in, u, v, n), self.ring(b, r_in, u, v, n)
        self.bridge(oa, ob, mat)
        if inner:
            self.bridge(ib, ia, mat)
        if lips[0]:
            self.bridge(ia, oa, mat)
        if lips[1]:
            self.bridge(ob, ib, mat)

    def box(self, centre, size, basis, mat):
        """A box. basis holds the three unit axes of its sides."""
        x, y, z = (axis * (s / 2) for axis, s in zip(basis, size))
        c = Vector(centre)
        corners = [c + sx * x + sy * y + sz * z for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)]
        vs = [self.bm.verts.new(p) for p in corners]
        for f in ((0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)):
            self.face([vs[i] for i in f], mat)

    def knob(self, a, b, r, mat=STEEL, n=12):
        """A knurled knob: a cylinder with a slightly larger grip ring."""
        a, b = Vector(a), Vector(b)
        mid = a.lerp(b, 0.35)
        self.tube(a, mid, r * 0.55, n=8, mat=mat, caps=(False, False))
        self.tube(mid, b, r, n=n, mat=mat)

    def triangles(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)


def along(t, side=0.0, up=0.0):
    """A point on the optical axis, t metres from the axle, with a side and an up offset."""
    return AXLE + AXIS * t + SIDE * side + UP * up


def optical_tube(m):
    # The main tube, open at the front, closed by the rear cell at the back.
    m.tube(along(-0.60), along(0.62), TUBE_R, n=24, caps=(False, False))
    # The dew shield: a wider sleeve with an inner wall, and the objective lens set back in it.
    m.shell(along(0.58), along(0.92), TUBE_R + 0.013, TUBE_R + 0.006, n=24)
    m.shell(along(0.90), along(0.925), TUBE_R + 0.017, TUBE_R + 0.013, n=24, mat=BAND, inner=False)
    m.shell(along(0.64), along(0.665), TUBE_R + 0.006, TUBE_R - 0.012, n=24, mat=BAND)
    m.tube(along(0.655), along(0.66), TUBE_R - 0.011, n=24, mat=GLASS)
    # Bevel bands along the tube.
    for t in (-0.52, -0.30, 0.30, 0.50):
        m.shell(along(t - 0.012), along(t + 0.012), TUBE_R + 0.006, TUBE_R, n=24, mat=BAND, inner=False)
    # The rear cell narrows to the focuser.
    m.tube(along(-0.60), along(-0.64), TUBE_R + 0.004, 0.052, n=24, mat=BAND, caps=(False, False))
    m.tube(along(-0.64), along(-0.66), 0.052, n=24, mat=BRASS, caps=(False, True))


def focuser(m):
    """A rack focuser with two knobs and a straight-through eyepiece. Returns the eye lens."""
    m.tube(along(-0.66), along(-0.78), 0.034, n=20, mat=STEEL, caps=(False, False))
    m.shell(along(-0.78), along(-0.79), 0.037, 0.019, n=20, mat=BAND, inner=False)
    # The rack housing under the draw tube, and the pinion knobs on both sides.
    m.box(along(-0.70, up=-0.040), (0.10, 0.05, 0.032), (AXIS, SIDE, UP), BRASS)
    for s in (1, -1):
        m.knob(along(-0.70, side=0.025 * s, up=-0.042), along(-0.70, side=0.072 * s, up=-0.042), 0.022)
    # The eyepiece: a barrel, a wider body with a grip ring, a rubber eyecup and the eye lens.
    m.tube(along(-0.79), along(-0.84), 0.019, n=20, mat=STEEL, caps=(False, False))
    m.tube(along(-0.84), along(-0.90), 0.026, n=20, mat=BRASS, caps=(True, False))
    m.shell(along(-0.865), along(-0.875), 0.028, 0.026, n=20, mat=BAND, inner=False)
    m.shell(along(-0.90), along(-0.925), 0.031, 0.022, n=20, mat=RUBBER)
    lens = along(-0.912)
    m.tube(along(-0.90), lens, 0.022, n=20, mat=GLASS, caps=(False, True))
    return lens


def finder(m):
    # A small finder scope above and to the left of the tube, on two ring brackets.
    side, up = 0.055, TUBE_R + 0.062
    for t in (-0.12, 0.10):
        m.tube(along(t, side * 0.55, TUBE_R - 0.004), along(t, side, up - 0.024), 0.008, n=6, mat=STEEL, caps=(False, True))
        m.shell(along(t - 0.012, side, up), along(t + 0.012, side, up), 0.027, 0.020, n=14, mat=BAND, inner=False)
    m.tube(along(-0.24, side, up), along(0.22, side, up), 0.020, n=14, mat=BRASS, caps=(True, False))
    m.shell(along(0.22, side, up), along(0.29, side, up), 0.026, 0.021, n=14, mat=BRASS)
    m.tube(along(0.24, side, up), along(0.245, side, up), 0.021, n=14, mat=GLASS, caps=(False, True))
    m.tube(along(-0.24, side, up), along(-0.29, side, up), 0.011, n=10, mat=STEEL)


def cradle(m):
    # Two cradle rings clamp the tube at the axle, each with a clamp screw on top.
    for t in (-0.14, 0.14):
        m.shell(along(t - 0.02), along(t + 0.02), TUBE_R + 0.016, TUBE_R, n=24, mat=STEEL, inner=False)
        m.knob(along(t, up=TUBE_R + 0.016), along(t, up=TUBE_R + 0.05), 0.012)
    # A dovetail bar under the rings, and the trunnion bosses that ride in the fork.
    m.box(along(0, up=-(TUBE_R + 0.026)), (0.38, 0.045, 0.02), (AXIS, SIDE, UP), STEEL)
    for s in (1, -1):
        m.tube(along(0, side=s * (TUBE_R + 0.010)), along(0, side=s * 0.128), 0.030, n=16, mat=BRASS)


def mount(m):
    # The fork: a turntable on the tripod head and two arms up to the altitude axle.
    head = FOOT + Vector((0, 0, HEAD_Z + 0.02))
    m.tube(head, head + Vector((0, 0, 0.05)), 0.085, n=24, mat=BRASS)
    m.shell(head + Vector((0, 0, 0.05)), head + Vector((0, 0, 0.058)), 0.088, 0.060, n=24, mat=BAND, inner=False)
    base = head + Vector((0, 0, 0.058))
    m.box(base + Vector((0, 0, 0.012)), (0.29, 0.07, 0.024), (SIDE, Vector((0, 0, 1)).cross(SIDE), Vector((0, 0, 1))), STEEL)
    for s in (1, -1):
        foot = base + SIDE * s * 0.135
        top = AXLE + SIDE * s * 0.135
        m.box(foot.lerp(top, 0.5), (0.022, 0.06, (top - foot).length + 0.06), (SIDE, Vector((0, 0, 1)).cross(SIDE), Vector((0, 0, 1))), STEEL)
        # The altitude bearing and its clamp knob outside each arm.
        m.tube(AXLE + SIDE * s * 0.146, AXLE + SIDE * s * 0.165, 0.036, n=20, mat=BAND)
        m.knob(AXLE + SIDE * s * 0.165, AXLE + SIDE * s * 0.205, 0.022)
    # The azimuth lock knob on the turntable.
    m.knob(head + Vector((0, 0, 0.025)) - SIDE.cross(Vector((0, 0, 1))) * 0.085, head + Vector((0, 0, 0.025)) - SIDE.cross(Vector((0, 0, 1))) * 0.125, 0.016)
    # A slow-motion rod from the right arm to the rear band, with a knob for the hand.
    m.tube(AXLE + SIDE * 0.135 + Vector((0, 0, -0.10)), along(-0.52, side=TUBE_R + 0.006, up=-0.02), 0.006, n=6, mat=STEEL, caps=(False, False))
    m.knob(AXLE + SIDE * 0.135 + Vector((0, 0, -0.10)), AXLE + SIDE * 0.135 + Vector((0, 0, -0.10)) - AXIS * 0.06, 0.014)


def tripod(m):
    head = FOOT + Vector((0, 0, HEAD_Z))
    m.tube(head, head + Vector((0, 0, 0.022)), 0.095, n=24, mat=BRASS)
    tray_height = 0.42
    knees = []
    # One leg points south under the eyepiece, so the observer sits between the other two.
    for i in range(3):
        angle = math.radians(-90 + 120 * i)
        out = Vector((math.cos(angle), math.sin(angle), 0))
        hinge = head + out * 0.075
        foot = FOOT + out * 0.42
        side = out.cross(Vector((0, 0, 1)))
        # The hinge: two brass cheeks on the head.
        for s in (1, -1):
            m.box(hinge + side * s * 0.022 + Vector((0, 0, 0.004)), (0.04, 0.008, 0.05), (out, side, Vector((0, 0, 1))), BRASS)
        m.tube(hinge + side * 0.03, hinge - side * 0.03, 0.008, n=8, mat=STEEL)
        # Each leg is an upper wooden stile and a slimmer lower stile, joined by a brass clamp.
        knee = hinge.lerp(foot, 0.55)
        m.tube(hinge, knee, 0.024, 0.021, n=6, mat=WOOD, turn=math.pi / 6)
        m.tube(hinge.lerp(foot, 0.48), foot + Vector((0, 0, 0.03)), 0.016, 0.014, n=6, mat=WOOD, turn=math.pi / 6)
        m.shell(hinge.lerp(foot, 0.53), hinge.lerp(foot, 0.58), 0.028, 0.021, n=8, mat=BRASS, inner=False)
        m.knob(hinge.lerp(foot, 0.555) + out * 0.022, hinge.lerp(foot, 0.555) + out * 0.05, 0.010)
        m.tube(foot + Vector((0, 0, 0.03)), foot + Vector((0, 0, 0.008)), 0.017, 0.019, n=8, mat=BRASS, caps=(False, False))
        m.tube(foot + Vector((0, 0, 0.008)), foot, 0.019, n=8, mat=RUBBER, caps=(False, True))
        knees.append(head.lerp(foot, (HEAD_Z - tray_height) / HEAD_Z))
    # The spreader tray between the legs, with three eyepiece holes.
    centre = FOOT + Vector((0, 0, tray_height))
    corners = [centre + (k - centre) * 0.78 for k in knees]
    top = [m.bm.verts.new(p + Vector((0, 0, 0.012))) for p in corners]
    bottom = [m.bm.verts.new(p) for p in corners]
    m.face(top, WOOD)
    m.face(list(reversed(bottom)), WOOD)
    m.bridge(top, bottom, WOOD)
    for k, c in zip(knees, corners):
        m.box(k.lerp(c, 0.5) + Vector((0, 0, 0.006)), ((k - c).length + 0.02, 0.016, 0.012), ((k - c).normalized(), (k - c).normalized().cross(Vector((0, 0, 1))), Vector((0, 0, 1))), BRASS)
        hole = centre.lerp(c, 0.55) + Vector((0, 0, 0.0125))
        m.tube(hole, hole + Vector((0, 0, 0.002)), 0.016, n=10, mat=RUBBER, caps=(False, True))


def build():
    m = Mesh()
    optical_tube(m)
    lens = focuser(m)
    finder(m)
    cradle(m)
    mount(m)
    tripod(m)
    return m, lens


def apply(ob, m):
    me = ob.data
    # The slots go first. Clearing them after to_mesh resets every face to slot 0.
    me.materials.clear()
    for name in MATERIALS:
        me.materials.append(bpy.data.materials[name])
    m.bm.to_mesh(me)
    m.bm.free()
    for p in me.polygons:
        p.use_smooth = False
    me.update()


def to_gltf(p):
    """Blender Z up to glTF Y up."""
    return [round(p.x, 4), round(p.z, 4), round(-p.y, 4)]


def main():
    dry = '--dry' in ARGS
    assert Path(bpy.data.filepath).resolve() == SOURCE.resolve(), bpy.data.filepath
    if not dry:
        assert not OUTPUT.exists(), f'{OUTPUT.name} exists'
        bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), check_existing=False)
    ob = bpy.data.objects[OBJECT]
    before = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    m, lens = build()
    tris = m.triangles()
    assert tris <= BUDGET, f'{tris} triangles, over the {BUDGET} budget'
    apply(ob, m)
    report = {
        'object': OBJECT, 'triangles_before': before, 'triangles': tris, 'budget': BUDGET,
        'eye_lens_gltf': to_gltf(lens), 'optical_axis_gltf': to_gltf(AXIS),
        'axle_gltf': to_gltf(AXLE), 'foot_gltf': to_gltf(FOOT),
    }
    print('ROUND21', json.dumps(report))
    if not dry:
        bpy.ops.wm.save_mainfile()
        REPORT.write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    main()

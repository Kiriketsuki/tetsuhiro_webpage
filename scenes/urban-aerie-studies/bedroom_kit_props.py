"""The room and its things for the aerie bedroom kit (aerie_bedroom_kit.py).

Blender world metres, Z up, in the island frame. The room box and its openings come from a ray
scan of the House mesh in island_b.glb (3 November 2026):
- inner walls x -6.93 (west) to -3.5 (east), y 1.62 (front, the balcony) to 5.23 (back),
  floor z 7.41, ceiling z 10.36
- front window x -6.33 to -5.33, z 8.41 to 9.61. Glass door x -4.63 to -4.03, z 7.51 to 9.71
- back window, over the city, x -6.13 to -4.73, z 8.31 to 9.71
- east window y 3.02 to 4.22, z 8.51 to 9.51. The west wall has no opening

Layout, clockwise from the door: the desk and the PC under the east window, the gym corner in
the back right, the window seat under the back window, the keepsake shelf in the back left, the
bed on the west wall with the photo wall above it, the nightstand with the camera, and the
graduation photo by the front window.
"""
import math
import random
from mathutils import Vector

from bedroom_kit_mesh import (I3, Part, box, cyl, field, hexc, keycap, mix, panel_with_holes, puff,
                              rot_x, rot_y, rot_z, shade, sheet, sphere, tinted, tube)

L, R, F, B, Z, C = -6.93, -3.5, 1.62, 5.23, 7.41, 10.36
INSET = 0.012
RAIL = 0.86
FRONT_WINDOW = (-6.33, -5.33, 8.41, 9.61)
DOOR = (-4.63, -4.03, 7.51, 9.71)
BACK_WINDOW = (-6.13, -4.73, 8.31, 9.71)
EAST_WINDOW = (3.02, 4.22, 8.51, 9.51)

# The palette, sRGB. Warm wood and cream, with indigo, teal and mustard as the cool and bright notes.
OAK = hexc('9c6b43')
OAK_LIGHT = hexc('b9875a')
WALNUT = hexc('5e3b26')
PLASTER = hexc('e3d6bf')
CREAM = hexc('efe5d0')
INDIGO = hexc('3c4a72')
INDIGO_LIGHT = hexc('5a6a96')
TEAL = hexc('2f6f73')
SAGE = hexc('8fa58a')
MUSTARD = hexc('d09a3a')
RUST = hexc('a5563a')
PLUM = hexc('6d4561')
INK = hexc('17181c')
CHARCOAL = hexc('2c2e33')
STEEL = hexc('a9adb3')
BRASS = hexc('c9a24a')
WHITE_CASE = hexc('ecebe7')
LEAF = hexc('4f7a46')
CLAY = hexc('b8714d')
SCREEN = hexc('2a3550')
WARM_GLOW = hexc('ffd9a0')

MATERIALS = ('kit_wood', 'kit_fabric', 'kit_metal', 'kit_plain', 'kit_plaster', 'kit_paper', 'kit_screen', 'kit_glow', 'kit_glass')


def new_parts():
    return {name: Part(uv=name in ('kit_paper', 'kit_screen')) for name in MATERIALS}


# ---------------------------------------------------------------- the shell


def floor(P):
    rng = random.Random(7)
    width = 0.143
    n = math.ceil((R - L) / width)
    for i in range(n):
        x0 = L + i * width
        x1 = min(R, x0 + width)
        joint = F + 0.6 + rng.random() * 2.2
        for y0, y1 in ((F, joint), (joint, B)):
            tone = 0.94 + 0.1 * rng.random()
            box(P['kit_wood'], ((x0 + x1) / 2, (y0 + y1) / 2, Z + 0.006), (x1 - x0 - 0.003, y1 - y0 - 0.003, 0.012),
                shade(OAK, tone), bevel=0.002, var=0.07, freq=1.2)


def wall_panels(P):
    """The walls, floor to ceiling, in the plaster family. The site paints the owner's pick on
    upright plaster faces in toon-material.js: asanoha paper above a honey wood wainscot 0.86 m
    tall, measured from the floor at 7.41. The vertex colours here only stand in for that in the
    review renders: honey below the rail, ochre cream above it."""
    upper_colour = lambda p: mix(hexc('e6d3ae'), hexc('dcc59c'), 0.5 + 0.5 * field(p, 0.7, 3.0))
    lower_colour = tinted(hexc('b9854f'), 0.05, 1.5)
    up = C - Z - RAIL
    walls = (
        # origin, u axis, width, window holes (u0, u1, z0, z1), door holes
        (Vector((R, F + INSET, Z)), Vector((-1, 0, 0)), R - L,
         [(R - FRONT_WINDOW[1], R - FRONT_WINDOW[0], *FRONT_WINDOW[2:])], [(R - DOOR[1], R - DOOR[0], *DOOR[2:])]),
        (Vector((L, B - INSET, Z)), Vector((1, 0, 0)), R - L, [(BACK_WINDOW[0] - L, BACK_WINDOW[1] - L, *BACK_WINDOW[2:])], []),
        (Vector((L + INSET, F, Z)), Vector((0, 1, 0)), B - F, [], []),
        (Vector((R - INSET, B, Z)), Vector((0, -1, 0)), B - F, [(B - EAST_WINDOW[1], B - EAST_WINDOW[0], *EAST_WINDOW[2:])], []),
    )
    vz = Vector((0, 0, 1))
    for origin, ua, width, windows, doors in walls:
        rel = lambda z0, z1, base: (max(0.0, z0 - base), z1 - base)
        upper = [(u0, u1, *rel(z0, z1, Z + RAIL)) for u0, u1, z0, z1 in windows + doors]
        lower = [(u0, u1, 0.0, RAIL + 0.01) for u0, u1, z0, z1 in doors]
        panel_with_holes(P['kit_plaster'], origin + vz * RAIL, ua, vz, (width, up), upper, upper_colour, 0.3)
        panel_with_holes(P['kit_plaster'], origin, ua, vz, (width, RAIL), lower, lower_colour, 0.3)
        normal = ua.cross(vz)
        along = lambda length, depth, height: (abs(length * ua.x) + abs(depth * normal.x), abs(length * ua.y) + abs(depth * normal.y), height)
        # The chair rail, the skirting and the cornice, broken at the door. The cornice is plain,
        # so the wall pattern stays on the walls.
        spans = [(0.0, width)]
        for u0, u1, *_ in doors:
            spans = [(a, u0) for a, b in spans if a < u0] + [(u1, b) for a, b in spans if b > u1]
        for a, b in spans:
            mid = origin + ua * ((a + b) / 2)
            box(P['kit_wood'], mid + vz * RAIL + normal * 0.012, along(b - a, 0.024, 0.03), WALNUT, bevel=0.006)
            box(P['kit_wood'], mid + vz * 0.05 + normal * 0.01, along(b - a, 0.022, 0.1), WALNUT, bevel=0.004)
            box(P['kit_plain'], mid + vz * (C - Z - 0.04) + normal * 0.02, along(b - a, 0.05, 0.07), shade(PLASTER, 1.02), bevel=0.012, segments=2)


def window_trim(P, u0, u1, z0, z1, origin, ua, sill=True, door=False):
    """Casing round an opening on a wall. u is along ua from origin."""
    normal = ua.cross(Vector((0, 0, 1)))
    w = 0.06
    pos = lambda u, z, out=0.012: origin + ua * u + Vector((0, 0, z)) + normal * out
    length = u1 - u0 + 2 * w
    size_u = lambda s, t, h: (abs(s * ua.x) + abs(t * normal.x), abs(s * ua.y) + abs(t * normal.y), h)
    box(P['kit_wood'], pos((u0 + u1) / 2, z1 + w / 2), size_u(length, 0.025, w), OAK_LIGHT, bevel=0.006)
    for u in (u0 - w / 2, u1 + w / 2):
        bottom = Z if door else z0 - (0.03 if sill else 0)
        box(P['kit_wood'], pos(u, (bottom + z1) / 2), size_u(w, 0.025, z1 - bottom), OAK_LIGHT, bevel=0.006)
    if sill:
        box(P['kit_wood'], pos((u0 + u1) / 2, z0 - 0.015, 0.05), size_u(length + 0.06, 0.1, 0.03), OAK_LIGHT, bevel=0.008)


def trims(P):
    window_trim(P, R - FRONT_WINDOW[1], R - FRONT_WINDOW[0], *FRONT_WINDOW[2:], Vector((R, F, 0)), Vector((-1, 0, 0)))
    window_trim(P, R - DOOR[1], R - DOOR[0], *DOOR[2:], Vector((R, F, 0)), Vector((-1, 0, 0)), sill=False, door=True)
    window_trim(P, BACK_WINDOW[0] - L, BACK_WINDOW[1] - L, *BACK_WINDOW[2:], Vector((L, B, 0)), Vector((1, 0, 0)))
    window_trim(P, B - EAST_WINDOW[1], B - EAST_WINDOW[0], *EAST_WINDOW[2:], Vector((R, B, 0)), Vector((0, -1, 0)))


def ceiling(P):
    plaster = tinted(shade(PLASTER, 1.03), 0.04, 0.8)
    panel_with_holes(P['kit_plaster'], Vector((L, B, C - INSET)), Vector((1, 0, 0)), Vector((0, -1, 0)), (R - L, B - F), [], plaster, 0.4)
    for y in (2.42, 3.42, 4.42):
        box(P['kit_wood'], ((L + R) / 2, y, C - 0.08), (R - L - 0.02, 0.1, 0.14), WALNUT, bevel=0.008, var=0.06, freq=0.8)


def lantern(P):
    x, y, top = -5.65, 3.05, C - 0.15
    cyl(P['kit_metal'], (x, y, top), (x, y, 9.86), 0.004, INK, sides=6)
    cyl(P['kit_metal'], (x, y, 9.86), (x, y, 9.83), 0.03, BRASS, sides=10)
    sphere(P['kit_glow'], (x, y, 9.62), (0.2, 0.2, 0.22), WARM_GLOW, segs=16, rings=10, var=0.02)
    for z in (9.48, 9.56, 9.66, 9.75):
        r = 0.2 * math.sqrt(max(0.0, 1 - ((z - 9.62) / 0.22) ** 2)) + 0.004
        cyl(P['kit_metal'], (x, y, z - 0.003), (x, y, z + 0.003), r, hexc('e8d6b4'), sides=16, caps=False)


def rug(P):
    cx, cy = -5.15, 3.35
    box(P['kit_fabric'], (cx, cy, Z + 0.014), (1.7, 2.1, 0.012), CREAM, bevel=0.005)
    box(P['kit_fabric'], (cx, cy, Z + 0.016), (1.55, 1.95, 0.012), RUST, bevel=0.004, var=0.06, freq=1.5)
    box(P['kit_fabric'], (cx, cy, Z + 0.018), (1.25, 1.65, 0.012), shade(RUST, 0.82), bevel=0.004, var=0.06, freq=1.5)


# ---------------------------------------------------------------- the bed and the photo wall


def drape(x0, x1, y0, y1, top, hang_side, hang_foot, wrinkle=0.012, corner=0.05):
    """A cover over a box top: flat on top, rounded at the edges, hanging down the two long
    sides and the foot (x1 end). Returns fn(u, v) for sheet(): u across y, v along x."""
    def profile(width, hang):
        # Arc length to (offset along the width, drop) for one side down, the top, the other side down.
        total = 2 * hang + width
        def at(s):
            if s < hang:
                d = hang - s
                return -width / 2 - min(corner, d) * 0.6, d
            if s > hang + width:
                d = s - hang - width
                return width / 2 + min(corner, d) * 0.6, d
            t = s - hang
            edge = min(t, width - t)
            drop = corner * (1 - min(1.0, edge / corner)) ** 2
            return -width / 2 + t, drop
        return total, at
    wy, wx = y1 - y0, x1 - x0
    ty, across = profile(wy, hang_side)
    tx = wx + hang_foot
    def fn(u, v):
        oy, dy = across(u * ty)
        s = v * tx
        if s <= wx:
            ox, dx = s, corner * (1 - min(1.0, (wx - s) / corner)) ** 2 if wx - s < corner else 0.0
        else:
            ox, dx = wx + min(corner, s - wx) * 0.6, s - wx
        p = Vector((x0 + ox, (y0 + y1) / 2 + oy, top - dy - dx))
        p.z += wrinkle * field(p, 6.0, 1.3) + wrinkle * 0.5 * field(p, 13.0, 4.1)
        return p
    return fn


def bed(P):
    yc, w, x1 = 3.3, 1.5, L + 2.08
    y0, y1 = yc - w / 2, yc + w / 2
    for x in (L + 0.1, x1 - 0.05):
        for y in (y0 + 0.04, y1 - 0.04):
            cyl(P['kit_wood'], (x, y, Z), (x, y, Z + 0.2), 0.03, WALNUT, sides=8, r2=0.025)
    for y in (y0 + 0.02, y1 - 0.02):
        box(P['kit_wood'], ((L + x1) / 2 + 0.02, y, Z + 0.25), (x1 - L - 0.06, 0.04, 0.14), WALNUT, bevel=0.01)
    box(P['kit_wood'], (x1 - 0.02, yc, Z + 0.3), (0.04, w, 0.26), WALNUT, bevel=0.01)
    # The headboard: a walnut frame round an indigo upholstered panel with three channels.
    box(P['kit_wood'], (L + 0.04, yc, Z + 0.58), (0.06, w + 0.08, 1.16), WALNUT, bevel=0.015, segments=2)
    for k in range(3):
        y = y0 + 0.06 + (w - 0.12) * (k + 0.5) / 3
        puff(P['kit_fabric'], (L + 0.09, y, Z + 0.86), (0.06, (w - 0.12) / 3 - 0.01, 0.5), INDIGO, roundness=0.4, cuts=3)
    # The mattress, the sheet and the duvet.
    box(P['kit_fabric'], ((L + x1) / 2 + 0.03, yc, Z + 0.45), (x1 - L - 0.14, w - 0.06, 0.2), CREAM, bevel=0.05, segments=3, smooth=True)
    duvet = drape(L + 0.7, x1 - 0.03, y0 + 0.02, y1 - 0.02, Z + 0.6, 0.24, 0.24)
    sheet(P['kit_fabric'], duvet, 26, 30, tinted(INDIGO_LIGHT, 0.07, 2.0), thickness=0.03, flip=True)
    # The duvet folds back at its head and shows its cream lining.
    puff(P['kit_fabric'], (L + 0.74, yc, Z + 0.6), (0.16, w + 0.02, 0.07), CREAM, roundness=0.6, cuts=4)
    throw = drape(x1 - 0.48, x1 - 0.06, y0 - 0.0, y1 + 0.0, Z + 0.64, 0.26, 0.06, wrinkle=0.008)
    sheet(P['kit_fabric'], throw, 24, 10, tinted(MUSTARD, 0.06, 3.0), thickness=0.015, flip=True)
    for s, colour in ((-1, CREAM), (1, CREAM)):
        puff(P['kit_fabric'], (L + 0.32, yc + s * 0.36, Z + 0.7), (0.16, 0.6, 0.38), colour, rot=rot_y(-62), roundness=0.6, cuts=4, sag=0.02)
    puff(P['kit_fabric'], (L + 0.5, yc + 0.05, Z + 0.68), (0.12, 0.36, 0.3), SAGE, rot=rot_y(-55) @ rot_z(8), roundness=0.6, cuts=3)


def nightstand(P):
    x, y = L + 0.24, 2.15
    box(P['kit_wood'], (x, y, Z + 0.3), (0.42, 0.42, 0.46), OAK, bevel=0.012, segments=2)
    for k, z in enumerate((Z + 0.2, Z + 0.4)):
        box(P['kit_wood'], (x + 0.212, y, z), (0.012, 0.36, 0.16), OAK_LIGHT, bevel=0.004)
        sphere(P['kit_metal'], (x + 0.226, y, z), (0.012, 0.012, 0.012), BRASS, segs=8, rings=5)
    for dy in (-0.17, 0.17):
        for dx in (-0.17, 0.17):
            cyl(P['kit_wood'], (x + dx, y + dy, Z), (x + dx, y + dy, Z + 0.07), 0.018, WALNUT, sides=6)
    top = Z + 0.53
    # The bedside lamp: a ceramic base and a linen shade that glows.
    lx, ly = x - 0.07, y + 0.1
    cyl(P['kit_plain'], (lx, ly, top), (lx, ly, top + 0.04), 0.07, CLAY, sides=14, r2=0.075, bevel=0.006)
    sphere(P['kit_plain'], (lx, ly, top + 0.12), (0.075, 0.075, 0.09), CLAY, segs=14, rings=8)
    cyl(P['kit_metal'], (lx, ly, top + 0.2), (lx, ly, top + 0.27), 0.008, BRASS, sides=6)
    cyl(P['kit_glow'], (lx, ly, top + 0.24), (lx, ly, top + 0.4), 0.15, WARM_GLOW, sides=18, r2=0.11)
    camera(P, Vector((x + 0.06, y - 0.1, top)), 28)
    for k, colour in enumerate((TEAL, PLUM)):
        box(P['kit_paper'], (x - 0.04, y - 0.12, top + 0.012 + k * 0.024), (0.16, 0.22, 0.022), colour, rot=rot_z(6 - k * 9), bevel=0.003)


def camera(P, base, turn):
    """A mirrorless camera with a zoom lens and a strap, set down with its lens toward the room.
    base is the point under the body centre. turn is degrees about Z from +X."""
    rz = rot_z(turn)
    at = lambda dx, dy, dz: base + rz @ Vector((dx, dy, dz))
    body = INK
    leather = hexc('26272b')
    box(P['kit_plain'], at(0, 0, 0.045), (0.05, 0.13, 0.082), body, rot=rz, bevel=0.009, segments=2)
    box(P['kit_plain'], at(0.002, 0, 0.042), (0.052, 0.125, 0.05), leather, rot=rz, bevel=0.006)
    # The grip on the right hand side, the viewfinder hump and the top plate.
    puff(P['kit_plain'], at(0.02, -0.052, 0.042), (0.04, 0.034, 0.08), leather, rot=rz, roundness=0.5, cuts=3)
    box(P['kit_plain'], at(-0.004, 0.0, 0.094), (0.04, 0.05, 0.026), body, rot=rz, bevel=0.007)
    box(P['kit_metal'], at(-0.004, 0.0, 0.106), (0.022, 0.03, 0.006), STEEL, rot=rz, bevel=0.002)
    for dy, r in ((-0.04, 0.012), (0.038, 0.011)):
        cyl(P['kit_metal'], at(0, dy, 0.086), at(0, dy, 0.097), r, STEEL, sides=14, bevel=0.0015)
    cyl(P['kit_metal'], at(0.012, -0.052, 0.086), at(0.012, -0.052, 0.092), 0.006, STEEL, sides=10)
    # The lens: mount, zoom ring, focus ring and the front glass.
    lens = [(0.025, 0.031, STEEL, 0.004), (0.029, 0.03, INK, 0.02), (0.049, 0.032, CHARCOAL, 0.024), (0.073, 0.031, INK, 0.012), (0.085, 0.033, INK, 0.012)]
    x = 0.025
    for x_end, r, colour, _ in lens:
        cyl(P['kit_plain' if colour != STEEL else 'kit_metal'], at(x, 0, 0.045), at(x_end, 0, 0.045), r, colour, sides=20, bevel=0.001)
        x = x_end
    for k in range(14):
        a = k / 14 * math.tau
        p = at(0.06, math.cos(a) * 0.0325, 0.045 + math.sin(a) * 0.0325)
        box(P['kit_plain'], p, (0.018, 0.004, 0.004), INK, rot=rz @ rot_x(math.degrees(a)))
    cyl(P['kit_glass'], at(0.0855, 0, 0.045), at(0.086, 0, 0.045), 0.026, hexc('22324a'), sides=20)
    # Strap lugs and a strap that loops onto the table.
    for dy in (-0.066, 0.066):
        cyl(P['kit_metal'], at(-0.01, dy, 0.08), at(-0.01, dy * 1.07, 0.08), 0.004, STEEL, sides=6)
    pts = [at(-0.01, 0.07, 0.08), at(-0.03, 0.11, 0.03), at(-0.06, 0.12, 0.004), at(-0.1, 0.05, 0.004), at(-0.09, -0.07, 0.004), at(-0.04, -0.11, 0.02), at(-0.01, -0.07, 0.08)]
    for a, b in zip(pts, pts[1:]):
        box(P['kit_fabric'], (a + b) / 2, ((a - b).length + 0.006, 0.02, 0.003), RUST,
            rot=Vector((1, 0, 0)).rotation_difference((b - a).normalized()).to_matrix(), var=0.03)


def frame(P, centre, w, h, normal, colour, mat=0.03, painter=None):
    """A picture frame on a wall, facing along normal (+X or -X, +Y or -Y)."""
    n = Vector(normal)
    side = Vector((0, 0, 1)).cross(n)
    size = lambda a, b, c: (abs(a * side.x) + abs(c * n.x), abs(a * side.y) + abs(c * n.y), b)
    c = Vector(centre) + n * 0.012
    t = 0.022
    for dz in (-1, 1):
        box(P['kit_wood'], c + Vector((0, 0, dz * (h / 2 - t / 2))), size(w, t, 0.022), colour, bevel=0.004)
    for ds in (-1, 1):
        box(P['kit_wood'], c + side * ds * (w / 2 - t / 2), size(t, h - 2 * t, 0.022), colour, bevel=0.004)
    box(P['kit_paper'], c - n * 0.004, size(w - 2 * t + 0.002, h - 2 * t + 0.002, 0.004), CREAM, var=0.0)
    iw, ih = w - 2 * t - 2 * mat, h - 2 * t - 2 * mat
    origin = c + n * 0.0005 - side * (iw / 2) - Vector((0, 0, ih / 2))
    paint = painter or (lambda u, v: SCREEN)
    def colour_at(p):
        u = (p - origin).dot(side) / iw
        v = (p.z - origin.z) / ih
        return paint(max(0.0, min(1.0, u)), max(0.0, min(1.0, v)))
    def uv_at(p):
        return ((p - origin).dot(side) / iw, (p.z - origin.z) / ih)
    from bedroom_kit_mesh import panel_with_holes as panel
    part = P['kit_paper']
    start = len(part.faces)
    panel(part, origin, side, Vector((0, 0, 1)), (iw, ih), [], colour_at, step=min(iw, ih) / 14)
    for k in range(start, len(part.faces)):
        part.uvs[k] = tuple(uv_at(Vector(part.verts[i])) for i in part.faces[k])


# Prints painted as smooth colour fields for the review renders. The site maps the owner's own
# photos onto the UVs of these prints.
def aurora(u, v):
    sky = mix(hexc('0d1530'), hexc('1d2a52'), v)
    band = math.exp(-((v - 0.62 - 0.12 * math.sin(u * 7.0)) / 0.12) ** 2)
    ground = 1.0 if v < 0.18 else 0.0
    c = mix(sky, hexc('5fd38a'), band * 0.85)
    return mix(c, hexc('121418'), ground)


def alps(u, v):
    sky = mix(hexc('7fb2e3'), hexc('2c63b8'), v)
    ridge = 0.35 + 0.35 * max(0.0, 1 - abs(u - 0.62) * 2.4) + 0.05 * math.sin(u * 17)
    return mix(sky, mix(hexc('6d6f78'), hexc('f4f6f8'), v / max(ridge, 0.01)), 1.0 if v < ridge else 0.0)


def street(u, v):
    sky = hexc('c8ccd2')
    walls = mix(hexc('3b4a5a'), hexc('6a7480'), abs(u - 0.5) * 2)
    road = hexc('4a4d55')
    if v < 0.25:
        return road
    return walls if abs(u - 0.5) > 0.12 + v * 0.1 else sky


def tree_lights(u, v):
    base = hexc('0c0f1a')
    inside = abs(u - 0.5) < 0.42 * (1 - v)
    return mix(base, hexc('d8a23c'), 0.9 if inside and v < 0.95 else 0.0)


def eiffel(u, v):
    sky = mix(hexc('d7dde5'), hexc('8e9eb3'), v)
    tower = abs(u - 0.5) < 0.04 + 0.32 * (1 - v) ** 3
    return mix(sky, hexc('5b4a3a'), 1.0 if tower else 0.0)


def graduation(u, v):
    return mix(hexc('6b7f99'), hexc('2b2e3a'), 1.0 if 0.25 < u < 0.75 and v < 0.7 else 0.0)


def photo_wall(P):
    x = L + INSET
    frames = [
        ((x, 3.3, 9.3), 0.62, 0.46, aurora),
        ((x, 2.78, 9.3), 0.3, 0.4, alps),
        ((x, 3.82, 9.3), 0.3, 0.4, street),
        ((x, 3.0, 8.84), 0.24, 0.3, tree_lights),
        ((x, 3.6, 8.84), 0.24, 0.3, eiffel),
    ]
    for centre, w, h, painter in frames:
        frame(P, centre, w, h, (1, 0, 0), INK, painter=painter)
    frame(P, (x, 2.1, 8.92), 0.4, 0.48, (1, 0, 0), WALNUT, mat=0.05, painter=graduation)

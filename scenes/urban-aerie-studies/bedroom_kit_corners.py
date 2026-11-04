"""The desk, the gym corner, the keepsake shelf and the window seat of the aerie bedroom kit.

Same frame and palette as bedroom_kit_props.py. The desk faces east, so a person at the desk
looks along +X: their right hand is -Y and the far edge of the desk is at larger X.
"""
import math
import random
from mathutils import Vector

from bedroom_kit_mesh import I3, box, cyl, field, hexc, keycap, mix, puff, rot_x, rot_y, rot_z, shade, sheet, sphere, tinted, tube
from bedroom_kit_props import (B, BACK_WINDOW, BRASS, CHARCOAL, CLAY, CREAM, F, INDIGO, INK, L, LEAF, MUSTARD, OAK, OAK_LIGHT,
                               PLUM, R, RUST, SAGE, SCREEN, STEEL, TEAL, WALNUT, WARM_GLOW, WHITE_CASE, Z, frame)

DESK_TOP = Z + 0.74
DESK = (-4.22, -3.52, 2.85, 4.35)


def screen_uv(origin, u_axis, v_axis, w, h):
    o, ua, va = Vector(origin), Vector(u_axis), Vector(v_axis)
    return lambda p: ((Vector(p) - o).dot(ua) / w, (Vector(p) - o).dot(va) / h)


def desk(P):
    x0, x1, y0, y1 = DESK
    xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
    box(P['kit_wood'], (xc, yc, DESK_TOP - 0.018), (x1 - x0, y1 - y0, 0.036), WALNUT, bevel=0.008, segments=2, var=0.05, freq=1.5)
    for y in (y0 + 0.06, y1 - 0.06):
        box(P['kit_metal'], (xc, y, Z + 0.015), (x1 - x0 - 0.06, 0.05, 0.03), INK, bevel=0.006)
        box(P['kit_metal'], (xc, y, DESK_TOP - 0.05), (x1 - x0 - 0.1, 0.04, 0.03), INK, bevel=0.006)
        box(P['kit_metal'], (xc, y, (Z + DESK_TOP) / 2), (0.05, 0.05, DESK_TOP - Z - 0.06), INK, bevel=0.006)
    box(P['kit_metal'], (x1 - 0.08, yc, DESK_TOP - 0.12), (0.03, y1 - y0 - 0.16, 0.05), INK, bevel=0.006)
    box(P['kit_fabric'], (-3.92, 3.6, DESK_TOP + 0.002), (0.34, 1.0, 0.004), CHARCOAL, bevel=0.0015, var=0.04)


def keyboard(P):
    """A tenkeyless board in an aluminium case, cream caps with indigo modifiers and a rust Esc."""
    u = 0.0191
    near_x, left_y = -4.005, 3.73
    box(P['kit_metal'], (-3.955, left_y - 9.3 * u, DESK_TOP + 0.016), (0.135, 18.5 * u, 0.026), STEEL, rot=rot_y(-3), bevel=0.005, segments=2)
    rows = [
        [('esc', 1), (None, 1)] + [('f', 1)] * 4 + [(None, 0.5)] + [('f', 1)] * 4 + [(None, 0.5)] + [('f', 1)] * 4,
        [('k', 1)] * 13 + [('mod', 2)],
        [('mod', 1.5)] + [('k', 1)] * 12 + [('mod', 1.5)],
        [('mod', 1.75)] + [('k', 1)] * 11 + [('enter', 2.25)],
        [('mod', 2.25)] + [('k', 1)] * 10 + [('mod', 2.75)],
        [('mod', 1.25)] * 3 + [('space', 6.25)] + [('mod', 1.25)] * 4,
    ]
    nav = {1: [0, 1, 2], 2: [0, 1, 2], 4: [1], 5: [0, 1, 2]}
    colours = {'esc': RUST, 'f': INDIGO, 'k': CREAM, 'mod': INDIGO, 'enter': RUST, 'space': CREAM}
    for r, row in enumerate(rows):
        x = near_x + (5.5 - r - (0.25 if r == 0 else 0)) * u
        y = left_y
        for kind, width in row:
            if kind:
                keycap(P['kit_plain'], (x, y - width * u / 2, DESK_TOP + 0.028 + (5 - r) * 0.0012), u * 0.9, width * u - u * 0.1, 0.009,
                       colours[kind], rot=rot_z(90))
            y -= width * u
        for col in nav.get(r, []):
            keycap(P['kit_plain'], (x, left_y - (15.25 + col + 0.5) * u, DESK_TOP + 0.028), u * 0.9, u * 0.9, 0.009, INDIGO, rot=rot_z(90))
    # The numpad, a separate small board, and the mouse.
    box(P['kit_metal'], (-3.955, 3.25, DESK_TOP + 0.014), (0.115, 0.085, 0.022), STEEL, bevel=0.005)
    for r in range(5):
        for c in range(4):
            keycap(P['kit_plain'], (near_x + (1 + r) * u + 0.004, 3.282 - c * u, DESK_TOP + 0.026), u * 0.9, u * 0.9, 0.009,
                   INDIGO if c == 3 or r == 0 else CREAM, rot=rot_z(90))
    puff(P['kit_plain'], (-3.96, 3.11, DESK_TOP + 0.018), (0.12, 0.065, 0.04), CHARCOAL, roundness=0.7, cuts=3)


def monitors(P):
    # The main monitor: a curved 27 inch panel on a stand, its screen toward the user at -X.
    cx, cy, bottom, width, height, radius = -3.66, 3.6, DESK_TOP + 0.17, 0.62, 0.36, 1.5
    half = width / 2 / radius
    centre = Vector((cx - radius, cy, 0))

    def panel(offset):
        def fn(u, v):
            a = -half + 2 * half * u
            return Vector((centre.x + (radius + offset) * math.cos(a), cy - (radius + offset) * math.sin(a), bottom + v * height))
        return fn
    sheet(P['kit_plain'], panel(0.0), 16, 2, tinted(INK, 0.02), thickness=0.02, smooth=False)
    screen = panel(-0.003)
    sheet_screen = P['kit_screen']
    start = len(sheet_screen.faces)

    def inner(u, v):
        return screen(0.02 + 0.96 * u, 0.04 + 0.92 * v)
    sheet(sheet_screen, inner, 16, 2, lambda p: SCREEN, smooth=False)
    for k in range(start, len(sheet_screen.faces)):
        sheet_screen.uvs[k] = tuple((0.5 - math.atan2(sheet_screen.verts[i][1] - cy, sheet_screen.verts[i][0] - centre.x) / (2 * half),
                                     (sheet_screen.verts[i][2] - bottom - 0.04 * height) / (0.92 * height)) for i in sheet_screen.faces[k])
    cyl(P['kit_metal'], (cx + 0.06, cy, DESK_TOP), (cx + 0.06, cy, bottom + 0.12), 0.022, CHARCOAL, sides=10)
    box(P['kit_metal'], (cx + 0.02, cy, DESK_TOP + 0.006), (0.2, 0.28, 0.012), CHARCOAL, bevel=0.004)
    # The second monitor turned upright, angled toward the chair.
    turn = rot_z(-24)
    mc = Vector((-3.7, 2.99, DESK_TOP + 0.43))
    box(P['kit_plain'], mc, (0.02, 0.36, 0.6), INK, rot=turn, bevel=0.006)
    sx = turn @ Vector((0, -1, 0))
    origin = mc + turn @ Vector((-0.011, 0.165, -0.285))
    s = P['kit_screen']
    start = len(s.faces)
    from bedroom_kit_mesh import panel_with_holes
    panel_with_holes(s, origin, sx, Vector((0, 0, 1)), (0.33, 0.57), [], lambda p: shade(SCREEN, 1.1), 0.11)
    uv = screen_uv(origin, sx, Vector((0, 0, 1)), 0.33, 0.57)
    for k in range(start, len(s.faces)):
        s.uvs[k] = tuple(uv(s.verts[i]) for i in s.faces[k])
    cyl(P['kit_metal'], (-3.66, 3.0, DESK_TOP), (-3.66, 3.0, mc.z - 0.2), 0.018, CHARCOAL, sides=8)
    box(P['kit_metal'], (-3.68, 3.0, DESK_TOP + 0.006), (0.16, 0.2, 0.012), CHARCOAL, rot=turn, bevel=0.004)


def fan(P, centre, axis_rot, radius, colour):
    """A case fan: frame, hub and seven blades, axis along local +X."""
    c = Vector(centre)
    ax = axis_rot @ Vector((1, 0, 0))
    box(P['kit_plain'], c, (0.012, radius * 2.2, radius * 2.2), colour, rot=axis_rot, bevel=0.004)
    cyl(P['kit_plain'], c - ax * 0.0065, c + ax * 0.0065, radius * 0.98, shade(colour, 0.6), sides=20)
    cyl(P['kit_plain'], c - ax * 0.008, c + ax * 0.008, radius * 0.32, colour, sides=14)
    for k in range(7):
        a = k / 7 * 360
        p = c + axis_rot @ (rot_x(a) @ Vector((0.0, 0, radius * 0.62)))
        box(P['kit_plain'], p + ax * 0.0075, (0.004, radius * 0.3, radius * 0.6), colour, rot=axis_rot @ rot_x(a) @ rot_z(18))


def pc(P):
    """The white build in a glass case on the left end of the desk. Its glass side faces -Y."""
    x0, x1, y0, y1 = -3.97, -3.55, 4.1, 4.33
    h = 0.45
    xc, yc, zc = (x0 + x1) / 2, (y0 + y1) / 2, DESK_TOP + h / 2 + 0.012
    for dx in (-0.17, 0.17):
        for dy in (-0.08, 0.08):
            cyl(P['kit_plain'], (xc + dx, yc + dy, DESK_TOP), (xc + dx, yc + dy, DESK_TOP + 0.014), 0.012, CHARCOAL, sides=8)
    # The shell: top, bottom, the solid back side, the front with its mesh and the rear.
    shell = WHITE_CASE
    box(P['kit_plain'], (xc, yc, zc + h / 2 - 0.008), (x1 - x0, y1 - y0, 0.016), shell, bevel=0.005)
    box(P['kit_plain'], (xc, yc, zc - h / 2 + 0.008), (x1 - x0, y1 - y0, 0.016), shell, bevel=0.005)
    box(P['kit_plain'], (xc, y1 - 0.007, zc), (x1 - x0, 0.014, h), shell, bevel=0.005)
    box(P['kit_plain'], (x0 + 0.01, yc, zc), (0.02, y1 - y0, h), shell, bevel=0.005)
    box(P['kit_plain'], (x1 - 0.008, yc, zc), (0.016, y1 - y0, h), shell, bevel=0.005)
    # The front: a dark mesh panel in a white border.
    box(P['kit_plain'], (x0 - 0.001, yc, zc), (0.004, y1 - y0 - 0.05, h - 0.06), CHARCOAL, bevel=0.0015)
    box(P['kit_glass'], (xc, y0 + 0.004, zc), (x1 - x0 - 0.02, 0.006, h - 0.02), hexc('3a4656'), var=0.0)
    # Inside: the board on the back wall, the power supply shroud, the cooler, the memory and
    # the graphics card, all in the white theme.
    box(P['kit_plain'], (xc + 0.02, y1 - 0.02, zc + 0.04), (0.3, 0.008, 0.3), hexc('d6d7d6'))
    box(P['kit_plain'], (xc, yc, zc - h / 2 + 0.055), (x1 - x0 - 0.04, y1 - y0 - 0.03, 0.08), shell, bevel=0.006)
    box(P['kit_metal'], (xc + 0.04, y1 - 0.08, zc + 0.11), (0.06, 0.12, 0.13), hexc('e3e3e0'), bevel=0.004)
    fan(P, (xc + 0.0, y1 - 0.08, zc + 0.11), rot_z(0), 0.055, WHITE_CASE)
    for k in range(4):
        box(P['kit_plain'], (xc + 0.12 + k * 0.012, y1 - 0.06, zc + 0.12), (0.006, 0.07, 0.11), shade(shell, 0.95))
        box(P['kit_glow'], (xc + 0.12 + k * 0.012, y1 - 0.06, zc + 0.178), (0.006, 0.07, 0.008), WARM_GLOW)
    gpu = Vector((xc + 0.02, yc + 0.0, zc - 0.04))
    box(P['kit_plain'], gpu, (0.3, 0.17, 0.05), shell, bevel=0.008)
    for dx in (-0.075, 0.075):
        fan(P, gpu + Vector((dx, 0, -0.027)), rot_y(90), 0.042, shade(shell, 0.92))
    box(P['kit_glow'], (xc, yc, zc + h / 2 - 0.018), (x1 - x0 - 0.05, 0.01, 0.004), WARM_GLOW)


def desk_things(P):
    # The DAC and amplifier stack, with the headphones on top.
    for k in range(2):
        z = DESK_TOP + 0.002 + k * 0.034
        box(P['kit_metal'], (-3.71, 3.98, z + 0.016), (0.13, 0.11, 0.032), STEEL, bevel=0.003)
        cyl(P['kit_metal'], (-3.777, 3.995, z + 0.016), (-3.79, 3.995, z + 0.016), 0.01, INK, sides=12)
        sphere(P['kit_glow'], (-3.776, 3.95, z + 0.02), (0.002, 0.002, 0.002), WARM_GLOW, segs=6, rings=4)
    top = DESK_TOP + 0.07
    for dy in (-0.075, 0.075):
        cyl(P['kit_plain'], (-3.72, 3.98 + dy, top), (-3.72, 3.98 + dy * 1.35, top + 0.01), 0.045, INK, sides=14, bevel=0.006)
        puff(P['kit_fabric'], (-3.72, 3.98 + dy * 1.0, top + 0.02), (0.08, 0.025, 0.08), CHARCOAL, rot=rot_x(90), roundness=0.7, cuts=2)
    band = [Vector((-3.72, 3.98 + 0.1 * math.cos(a), top + 0.03 + 0.085 * math.sin(a))) for a in [math.pi * k / 8 for k in range(9)]]
    tube(P['kit_metal'], band, 0.008, STEEL, sides=6)
    # The teaching notebook: hard cover, page block, an elastic band and a pen.
    nb = rot_z(14)
    n0 = Vector((-3.98, 2.98, DESK_TOP))
    box(P['kit_paper'], n0 + Vector((0, 0, 0.004)), (0.15, 0.21, 0.008), TEAL, rot=nb, bevel=0.003)
    box(P['kit_paper'], n0 + Vector((0, 0, 0.011)), (0.145, 0.205, 0.008), CREAM, rot=nb, bevel=0.002)
    box(P['kit_paper'], n0 + Vector((0, 0, 0.018)), (0.15, 0.21, 0.006), TEAL, rot=nb, bevel=0.003)
    box(P['kit_fabric'], n0 + nb @ Vector((0.05, 0, 0.012)), (0.006, 0.212, 0.018), RUST, rot=nb)
    cyl(P['kit_metal'], n0 + nb @ Vector((-0.1, -0.09, 0.006)), n0 + nb @ Vector((-0.1, 0.06, 0.006)), 0.005, BRASS, sides=8)
    # The coffee mug.
    cyl(P['kit_plain'], (-4.08, 4.02, DESK_TOP), (-4.08, 4.02, DESK_TOP + 0.095), 0.04, MUSTARD, sides=16, bevel=0.004)
    cyl(P['kit_plain'], (-4.08, 4.02, DESK_TOP + 0.08), (-4.08, 4.02, DESK_TOP + 0.082), 0.035, hexc('3a2618'), sides=16)
    tube(P['kit_plain'], [Vector((-4.08, 4.062, DESK_TOP + 0.075)), Vector((-4.08, 4.085, DESK_TOP + 0.06)), Vector((-4.08, 4.085, DESK_TOP + 0.035)),
                          Vector((-4.08, 4.062, DESK_TOP + 0.022))], 0.007, MUSTARD, sides=6)


def chair(P):
    cx, cy = -4.58, 3.52
    for k in range(5):
        a = k / 5 * math.tau + 0.3
        tip = Vector((cx + 0.3 * math.cos(a), cy + 0.3 * math.sin(a), Z + 0.07))
        box(P['kit_metal'], (Vector((cx, cy, Z + 0.09)) + tip) / 2, (0.3, 0.04, 0.03), CHARCOAL, rot=rot_z(math.degrees(a)), bevel=0.006)
        sphere(P['kit_plain'], tip - Vector((0, 0, 0.035)), (0.03, 0.03, 0.03), INK, segs=10, rings=6)
    cyl(P['kit_metal'], (cx, cy, Z + 0.09), (cx, cy, Z + 0.42), 0.025, STEEL, sides=10)
    puff(P['kit_fabric'], (cx, cy, Z + 0.47), (0.48, 0.48, 0.08), CHARCOAL, roundness=0.4, cuts=4)
    puff(P['kit_fabric'], (cx - 0.25, cy, Z + 0.85), (0.07, 0.44, 0.58), CHARCOAL, rot=rot_y(-10), roundness=0.45, cuts=4)
    box(P['kit_metal'], (cx - 0.24, cy, Z + 0.55), (0.04, 0.06, 0.2), INK, rot=rot_y(-10), bevel=0.008)
    for s in (-1, 1):
        box(P['kit_metal'], (cx - 0.02, cy + s * 0.25, Z + 0.6), (0.03, 0.03, 0.16), INK, bevel=0.006)
        box(P['kit_plain'], (cx + 0.02, cy + s * 0.25, Z + 0.69), (0.25, 0.06, 0.03), INK, bevel=0.01)


def gym(P):
    """The gym corner in the back right: a two-tier dumbbell rack, a rolled mat, the gym bag,
    a shaker, and a towel and a jump rope on hooks."""
    rx0, rx1, ry = -4.5, -3.72, B - 0.17
    for x in (rx0, rx1):
        for dy in (-0.11, 0.11):
            box(P['kit_metal'], (x, ry + dy, Z + 0.35), (0.035, 0.035, 0.7), STEEL, rot=rot_x(math.copysign(8, dy)), bevel=0.005)
        box(P['kit_metal'], (x, ry, Z + 0.02), (0.06, 0.34, 0.04), STEEL, bevel=0.006)
    for z, dy in ((Z + 0.36, -0.05), (Z + 0.62, 0.04)):
        box(P['kit_metal'], ((rx0 + rx1) / 2, ry + dy, z), (rx1 - rx0, 0.16, 0.025), CHARCOAL, rot=rot_x(-12), bevel=0.005)
    sets = [(Z + 0.42, -0.05, 0.075, 3), (Z + 0.68, 0.04, 0.06, 3)]
    for z, dy, r, n in sets:
        for k in range(n):
            x = rx0 + 0.13 + k * (rx1 - rx0 - 0.26) / (n - 1)
            for side in (-1, 1):
                y = ry + dy + side * 0.0
                xa = x - 0.1 + (0.2 if side > 0 else 0)
                cyl(P['kit_plain'], (xa - 0.022, y, z + r * 0.85), (xa + 0.022, y, z + r * 0.85), r, INK, sides=6, bevel=0.004, spin=math.pi / 6)
            cyl(P['kit_metal'], (x - 0.08, ry + dy, z + r * 0.85), (x + 0.08, ry + dy, z + r * 0.85), 0.014, STEEL, sides=10)
    cyl(P['kit_plain'], (rx1 - 0.1, ry + 0.04, Z + 0.80), (rx1 - 0.1, ry + 0.04, Z + 0.98), 0.04, hexc('dfe3e6'), sides=14, bevel=0.004)
    cyl(P['kit_plain'], (rx1 - 0.1, ry + 0.04, Z + 0.98), (rx1 - 0.1, ry + 0.04, Z + 1.02), 0.042, INK, sides=14, bevel=0.004)
    # The rolled mat standing in the corner.
    cyl(P['kit_fabric'], (-3.62, B - 0.1, Z), (-3.62, B - 0.1, Z + 0.62), 0.065, TEAL, sides=16, bevel=0.01)
    cyl(P['kit_fabric'], (-3.62, B - 0.1, Z + 0.621), (-3.62, B - 0.1, Z + 0.622), 0.05, shade(TEAL, 0.7), sides=16)
    # The gym bag on the floor, with a strap over it.
    bag = Vector((-4.3, 4.55, Z + 0.14))
    puff(P['kit_fabric'], bag, (0.55, 0.28, 0.28), INK, rot=rot_z(20), roundness=0.75, cuts=4)
    for dx in (-0.12, 0.12):
        p = bag + rot_z(20) @ Vector((dx, 0, 0))
        tube(P['kit_fabric'], [p + Vector((0, -0.08, 0.1)), p + Vector((0, -0.03, 0.2)), p + Vector((0, 0.03, 0.2)), p + Vector((0, 0.08, 0.1))], 0.012, RUST, sides=6)
    puff(P['kit_plain'], bag + rot_z(20) @ Vector((0.28, 0, 0)), (0.02, 0.2, 0.2), RUST, rot=rot_z(20), roundness=0.6, cuts=2)
    # The towel and the rope on hooks above the rack, and the poster above them.
    for x in (-4.35, -3.9):
        cyl(P['kit_metal'], (x, B - 0.01, Z + 1.32), (x, B - 0.06, Z + 1.34), 0.008, BRASS, sides=6)

    def towel(u, v):
        x = -4.47 + 0.24 * u
        return Vector((x, B - 0.03 - 0.015 * math.sin(u * math.pi * 3) - 0.02 * (1 - v), Z + 1.33 - 0.55 * v))
    sheet(P['kit_fabric'], towel, 10, 8, tinted(CREAM, 0.05, 4.0), thickness=0.008, flip=True)
    rope = [Vector((-3.9 + 0.09 * math.sin(a), B - 0.05, Z + 1.3 - 0.25 * (1 - math.cos(a)) / 2)) for a in [math.tau * k / 16 for k in range(17)]]
    tube(P['kit_fabric'], rope, 0.005, MUSTARD, sides=5)
    frame(P, (-4.1, B - 0.012, 9.25), 0.5, 0.7, (0, -1, 0), INK, painter=golden_tree)


def golden_tree(u, v):
    sky = mix(hexc('1b1d2a'), hexc('3a3350'), v)
    trunk = abs(u - 0.5) < 0.03 and v < 0.55
    crown = (u - 0.5) ** 2 / 0.12 + (v - 0.68) ** 2 / 0.06 < 1
    if crown:
        return mix(hexc('e8b44a'), hexc('f6d77c'), 0.5 + 0.5 * math.sin(u * 20 + v * 13))
    return hexc('6b4a2a') if trunk else sky


def pixel_art(u, v):
    cell = (int(u * 8) + int(v * 11)) % 3
    floor = v < 0.3
    base = hexc('2a3550') if not floor else hexc('5e3b26')
    return mix(base, hexc('d09a3a') if cell == 0 else hexc('2f6f73'), 0.7 if 0.35 < v < 0.75 and 0.15 < u < 0.85 else 0.0)


def books(P, x0, y, z, depth, count, rng, colours, max_h=0.24, along=Vector((1, 0, 0)), lean_last=False):
    """A row of book spines from x0 along `along`. Returns the end point."""
    p = Vector((x0, y, z))
    for k in range(count):
        t = 0.018 + rng.random() * 0.014
        h = max_h * (0.78 + rng.random() * 0.22)
        colour = colours[k % len(colours)]
        c = p + along * (t / 2)
        box(P['kit_paper'], c + Vector((0, 0, h / 2)), (abs(t * along.x) + abs(depth * along.y), abs(t * along.y) + abs(depth * along.x), h),
            shade(colour, 0.9 + 0.2 * rng.random()), bevel=0.0025)
        p = p + along * (t + 0.001)
    return p


def shelf(P):
    """The keepsake shelf in the back left: one shelf a theme, each piece a plain object, never a logo."""
    x0, x1, y0, y1 = L + 0.02, -6.19, B - 0.33, B - 0.01
    xc, yc = (x0 + x1) / 2, (y0 + y1) / 2
    levels = [0.06, 0.42, 0.78, 1.12, 1.46, 1.84]
    for x in (x0 + 0.012, x1 - 0.012):
        box(P['kit_wood'], (x, yc, Z + 1.0), (0.024, y1 - y0, 2.0), OAK, bevel=0.004)
    for zl in levels + [1.99]:
        box(P['kit_wood'], (xc, yc, Z + zl), (x1 - x0, y1 - y0, 0.024), OAK, bevel=0.004)
    box(P['kit_wood'], (xc, y1 - 0.006, Z + 1.0), (x1 - x0 - 0.02, 0.012, 2.0), OAK_LIGHT)
    # A warm LED strip under the front of each board lights the keepsakes below it.
    for zl in levels[1:] + [1.99]:
        box(P['kit_glow'], (xc, y0 + 0.03, Z + zl - 0.014), (x1 - x0 - 0.06, 0.012, 0.004), WARM_GLOW)
    s = [Z + zl + 0.012 for zl in levels]
    rng = random.Random(11)
    y = yc - 0.02
    # Bottom: the manhwa volumes and a box of more.
    end = books(P, x0 + 0.03, y, s[0], 0.17, 16, rng, [INDIGO, RUST, TEAL, MUSTARD, PLUM, CREAM], 0.24)
    box(P['kit_paper'], ((end.x + x1) / 2, y, s[0] + 0.1), (x1 - end.x - 0.04, 0.24, 0.2), hexc('b79a6a'), bevel=0.004)
    # Second: the handhelds. A Steam Deck on its dock and a Switch in its dock.
    dock = Vector((x0 + 0.17, y, s[1]))
    box(P['kit_plain'], dock + Vector((0, 0, 0.02)), (0.12, 0.09, 0.04), INK, rot=rot_z(-8), bevel=0.01)
    deck = dock + Vector((0, 0.01, 0.1))
    box(P['kit_plain'], deck, (0.3, 0.025, 0.12), hexc('2a2b2f'), rot=rot_z(-8) @ rot_x(-16), bevel=0.012, segments=2)
    origin = deck + rot_z(-8) @ rot_x(-16) @ Vector((-0.08, -0.0135, -0.045))
    box(P['kit_screen'], deck + rot_z(-8) @ rot_x(-16) @ Vector((0, -0.0133, 0.0)), (0.17, 0.001, 0.1), SCREEN)
    for dx in (-0.115, 0.115):
        cyl(P['kit_plain'], deck + rot_z(-8) @ rot_x(-16) @ Vector((dx, -0.013, 0.02)), deck + rot_z(-8) @ rot_x(-16) @ Vector((dx, -0.024, 0.02)),
            0.012, INK, sides=10)
    sw = Vector((x1 - 0.17, y, s[1]))
    box(P['kit_plain'], sw + Vector((0, 0, 0.06)), (0.17, 0.05, 0.12), INK, bevel=0.008)
    box(P['kit_plain'], sw + Vector((0, -0.03, 0.115)), (0.18, 0.014, 0.08), INK, bevel=0.004)
    for dx, colour in ((-0.1, hexc('2f8fd0')), (0.1, hexc('e04b3a'))):
        box(P['kit_plain'], sw + Vector((dx, -0.03, 0.115)), (0.03, 0.016, 0.085), colour, bevel=0.006)
    # Third: a golden tree on a stand and a small figure from Akihabara in a hood with ears.
    gx = x0 + 0.17
    cyl(P['kit_wood'], (gx, y, s[2]), (gx, y, s[2] + 0.02), 0.07, WALNUT, sides=10, bevel=0.004)
    cyl(P['kit_metal'], (gx, y, s[2] + 0.02), (gx, y, s[2] + 0.14), 0.012, BRASS, sides=8)
    for k, (z, r) in enumerate(((0.13, 0.11), (0.19, 0.095), (0.24, 0.07))):
        puff(P['kit_metal'], (gx + 0.01 * k, y, s[2] + z), (r * 2, r * 1.6, 0.07), BRASS, roundness=0.7, cuts=2)
    fx = x1 - 0.16
    puff(P['kit_plain'], (fx, y, s[2] + 0.05), (0.08, 0.07, 0.09), hexc('f1b24a'), roundness=0.7, cuts=3)
    sphere(P['kit_plain'], (fx, y, s[2] + 0.14), (0.055, 0.05, 0.05), hexc('f1b24a'), segs=12, rings=8)
    sphere(P['kit_plain'], (fx, y - 0.036, s[2] + 0.13), (0.04, 0.02, 0.032), hexc('f6dcc2'), segs=10, rings=6)
    for dx in (-0.03, 0.03):
        sphere(P['kit_plain'], (fx + dx, y, s[2] + 0.19), (0.016, 0.012, 0.02), hexc('f1b24a'), segs=8, rings=5)
    # Fourth: travel keepsakes. A small Eiffel Tower, a Swiss cowbell on its strap and a snow globe.
    ex = x0 + 0.1
    for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        cyl(P['kit_metal'], (ex + dx * 0.035, y + dy * 0.035, s[3]), (ex + dx * 0.006, y + dy * 0.006, s[3] + 0.2), 0.004, hexc('7a6450'), sides=4)
    for z, w in ((0.06, 0.05), (0.12, 0.028)):
        box(P['kit_metal'], (ex, y, s[3] + z), (w, w, 0.006), hexc('7a6450'))
    cyl(P['kit_metal'], (ex, y, s[3] + 0.2), (ex, y, s[3] + 0.24), 0.003, hexc('7a6450'), sides=4)
    bx = xc + 0.02
    cyl(P['kit_metal'], (bx, y, s[3] + 0.01), (bx, y, s[3] + 0.09), 0.045, BRASS, sides=12, r2=0.03, bevel=0.003)
    tube(P['kit_fabric'], [Vector((bx - 0.035, y, s[3] + 0.08)), Vector((bx - 0.03, y, s[3] + 0.15)), Vector((bx + 0.03, y, s[3] + 0.15)),
                           Vector((bx + 0.035, y, s[3] + 0.08))], 0.008, RUST, sides=6)
    gl = x1 - 0.1
    cyl(P['kit_wood'], (gl, y, s[3]), (gl, y, s[3] + 0.03), 0.045, WALNUT, sides=12, bevel=0.003)
    sphere(P['kit_glass'], (gl, y, s[3] + 0.075), (0.05, 0.05, 0.05), hexc('cfe0ee'), segs=14, rings=8)
    cyl(P['kit_plain'], (gl, y, s[3] + 0.03), (gl, y, s[3] + 0.09), 0.012, LEAF, sides=6, r2=0.0)
    # Fifth: the first camera, a compact, and a red daruma.
    box(P['kit_plain'], (x0 + 0.12, y, s[4] + 0.035), (0.11, 0.035, 0.065), STEEL, rot=rot_z(-10), bevel=0.006)
    cyl(P['kit_plain'], (x0 + 0.12, y - 0.015, s[4] + 0.035), (x0 + 0.13, y - 0.04, s[4] + 0.035), 0.02, INK, sides=12)
    sphere(P['kit_plain'], (x1 - 0.14, y, s[4] + 0.07), (0.06, 0.055, 0.07), hexc('c8352b'), segs=12, rings=8)
    sphere(P['kit_plain'], (x1 - 0.14, y - 0.042, s[4] + 0.08), (0.032, 0.02, 0.03), CREAM, segs=10, rings=6)
    # Top: a stack of thick convention catalogues and a trailing plant.
    for k in range(3):
        box(P['kit_paper'], (x0 + 0.16, y, s[5] + 0.025 + k * 0.05), (0.2, 0.25, 0.048), [MUSTARD, CREAM, TEAL][k], rot=rot_z(k * 7 - 7), bevel=0.004)
    plant(P, Vector((x1 - 0.12, y, s[5])), 0.06, 0.1, trailing=True)


def plant(P, base, r, h, trailing=False, tall=False, seed=3):
    rng = random.Random(seed)
    cyl(P['kit_plain'], base, base + Vector((0, 0, h)), r, CLAY, sides=12, r2=r * 1.15, bevel=0.004)
    cyl(P['kit_plain'], base + Vector((0, 0, h - 0.01)), base + Vector((0, 0, h - 0.008)), r * 1.05, hexc('3a2a1e'), sides=12)
    top = base + Vector((0, 0, h))
    leaves = 9 if not tall else 16
    for k in range(leaves):
        a = k / leaves * math.tau + rng.random()
        reach = (0.08 if not tall else 0.25) * (0.7 + 0.5 * rng.random())
        lift = (0.05 if not tall else 0.25 + 0.6 * rng.random())
        if trailing:
            tip = top + Vector((math.cos(a) * 0.08, math.sin(a) * 0.05, -0.05 - 0.15 * rng.random()))
        else:
            tip = top + Vector((math.cos(a) * reach, math.sin(a) * reach, lift))
        cyl(P['kit_plain'], top, tip, 0.004, shade(LEAF, 0.8), sides=4)
        size = 0.05 if not tall else 0.13
        sphere(P['kit_plain'], tip, (size, size * 0.6, 0.012), shade(LEAF, 0.85 + 0.3 * rng.random()), segs=8, rings=4,
               rot=rot_z(math.degrees(a)) @ rot_y(-25 if not trailing else 40))


def window_seat(P):
    x0, x1 = BACK_WINDOW[0] - 0.03, BACK_WINDOW[1] + 0.03
    xc, w = (x0 + x1) / 2, x1 - x0
    y0, y1 = B - 0.46, B - 0.01
    yc = (y0 + y1) / 2
    box(P['kit_wood'], (xc, yc, Z + 0.21), (w, y1 - y0, 0.42), OAK, bevel=0.01, segments=2)
    for k in range(3):
        cx = x0 + w * (k + 0.5) / 3
        box(P['kit_wood'], (cx, y0 - 0.004, Z + 0.22), (w / 3 - 0.04, 0.012, 0.3), OAK_LIGHT, bevel=0.004)
        sphere(P['kit_metal'], (cx, y0 - 0.014, Z + 0.3), (0.012, 0.012, 0.012), BRASS, segs=8, rings=5)
    puff(P['kit_fabric'], (xc, yc, Z + 0.47), (w - 0.04, y1 - y0 - 0.02, 0.1), SAGE, roundness=0.35, cuts=5, sag=0.01)
    for dx, colour, turn in ((-0.42, TEAL, 10), (-0.05, MUSTARD, -4), (0.4, PLUM, -12)):
        puff(P['kit_fabric'], (xc + dx, B - 0.09, Z + 0.68), (0.36, 0.12, 0.32), colour, rot=rot_z(turn) @ rot_x(-14), roundness=0.6, cuts=4, sag=0.01)
    # A throw over one end, the reading tablet, a stack of volumes and a mug on the sill.

    def throw(u, v):
        x = x1 - 0.35 + 0.3 * u
        y = y0 - 0.02 + (y1 - y0 - 0.02) * v
        drop = max(0.0, (y0 + 0.06 - y)) * 6
        return Vector((x, y - 0.03 * min(drop, 1), Z + 0.53 - 0.3 * min(drop, 1) + 0.01 * field((x, y, 0), 9, 2)))
    sheet(P['kit_fabric'], throw, 8, 10, tinted(INDIGO, 0.06, 3.0), thickness=0.012, flip=False)
    tab = Vector((xc + 0.12, yc - 0.06, Z + 0.53))
    box(P['kit_plain'], tab, (0.17, 0.25, 0.008), INK, rot=rot_z(-18), bevel=0.004)
    box(P['kit_screen'], tab + Vector((0, 0, 0.0045)), (0.15, 0.22, 0.001), shade(SCREEN, 1.3), rot=rot_z(-18))
    rng = random.Random(5)
    for k in range(4):
        box(P['kit_paper'], (xc - 0.2, yc - 0.06, Z + 0.535 + k * 0.022), (0.13, 0.19, 0.02), [RUST, INDIGO, TEAL, CREAM][k],
            rot=rot_z(rng.uniform(-8, 8)), bevel=0.002)
    cyl(P['kit_plain'], (x0 + 0.18, B - 0.06, BACK_WINDOW[2] + 0.0), (x0 + 0.18, B - 0.06, BACK_WINDOW[2] + 0.085), 0.035, CREAM, sides=14, bevel=0.003)
    plant(P, Vector((x1 - 0.12, B - 0.06, BACK_WINDOW[2])), 0.045, 0.08, seed=8)


def curtains(P):
    """Linen curtains tied back at both sides of the back window, on a brass rod."""
    x0, x1, z0, z1 = BACK_WINDOW
    # The shelf stands 6 cm from the left edge of the window, so the left curtain and the rod
    # stop at that edge.
    rod_z = z1 + 0.12
    cyl(P['kit_metal'], (x0 - 0.04, B - 0.07, rod_z), (x1 + 0.3, B - 0.07, rod_z), 0.012, BRASS, sides=8)
    for x in (x0 - 0.06, x1 + 0.32):
        sphere(P['kit_metal'], (x, B - 0.07, rod_z), (0.022, 0.022, 0.022), BRASS, segs=8, rings=6)
    for side in (-1, 1):
        edge = x0 if side < 0 else x1

        def fn(u, v, edge=edge, side=side):
            top_w, tie_w = 0.42, 0.16
            tie = 0.55
            width = top_w + (tie_w - top_w) * min(1.0, v / tie) if v < tie else tie_w + (0.3 - tie_w) * (v - tie) / (1 - tie)
            x = edge + side * 0.03 - side * width * u
            folds = 0.025 * math.sin(u * math.pi * 7) * (0.6 + 0.4 * v)
            return Vector((x, B - 0.08 - folds, rod_z - 0.02 - v * (rod_z - 0.02 - Z - 0.5)))
        sheet(P['kit_fabric'], fn, 20, 14, tinted(hexc('e9dcc2'), 0.05, 3.0), thickness=0.006, flip=side < 0)


def fairy_lights(P):
    """Warm bulbs on a wire along the head and the sides of the back window."""
    x0, x1, z0, z1 = BACK_WINDOW
    y = B - 0.05
    pts = []
    for k in range(13):
        t = k / 12
        pts.append(Vector((x0 - 0.04, y, z0 + 0.3 + (z1 - z0 - 0.3) * t)))
    for k in range(1, 25):
        t = k / 24
        x = x0 - 0.04 + (x1 - x0 + 0.08) * t
        pts.append(Vector((x, y, z1 + 0.05 - 0.07 * abs(math.sin(t * math.pi * 4)))))
    for k in range(1, 13):
        t = k / 12
        pts.append(Vector((x1 + 0.04, y, z1 - (z1 - z0 - 0.3) * t)))
    tube(P['kit_metal'], pts, 0.0015, INK, sides=4)
    for k, p in enumerate(pts[::2]):
        sphere(P['kit_glow'], p - Vector((0, 0, 0.012)), (0.008, 0.008, 0.011), WARM_GLOW, segs=6, rings=4)


def front_corner(P):
    """By the door on the east wall: a tall plant and a pixel art print."""
    plant(P, Vector((-3.74, 2.05, Z)), 0.13, 0.32, tall=True, seed=21)
    frame(P, (R - 0.012, 2.25, 8.95), 0.4, 0.55, (-1, 0, 0), INK, painter=pixel_art)


def build_corners(P):
    desk(P)
    keyboard(P)
    monitors(P)
    pc(P)
    desk_things(P)
    chair(P)
    gym(P)
    shelf(P)
    window_seat(P)
    curtains(P)
    fairy_lights(P)
    front_corner(P)

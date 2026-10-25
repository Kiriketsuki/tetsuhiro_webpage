"""Torii, stone lanterns, railings, stairs, shrines and lamp bridges."""
import random
from math import pi, cos, sin, atan2, sqrt
import bpy
import bmesh
from mathutils import Vector, Matrix
from . import util
from .terrain import outline, island


def _place(o, loc, rot):
    o.location = loc
    o.rotation_euler = (0, 0, rot)
    return o


def point_light(name, collection, loc, power, colour=(1.0, 0.6, 0.3), radius=0.15, shadow=False):
    lt = bpy.data.lights.new(name, 'POINT')
    lt.energy = power
    lt.color = colour
    lt.shadow_soft_size = radius
    lt.use_shadow = shadow
    o = bpy.data.objects.new(name, lt)
    o.location = loc
    collection.objects.link(o)
    return o


# ---------------------------------------------------------------- torii

def torii(name, collection, loc, rot, height=5.0, span=4.2, lanterns=False):
    """Two pillars, a black kasagi with upturned ends, a shimaki, a nuki tie beam and a centre strut."""
    bm = bmesh.new()
    h, w = height, span
    for sx in (-1, 1):
        util.cylinder(bm, (sx * w / 2, 0, 0.0), 0.24, h * 0.9, segments=32, mi=0, radius_top=0.2)
        util.cylinder(bm, (sx * w / 2, 0, 0.0), 0.3, 0.45, segments=32, mi=1)
    util.box(bm, (0, 0, h * 0.66), (w + 1.1, 0.2, 0.32), mi=0)
    util.box(bm, (0, 0, h * 0.72), (0.26, 0.2, h * 0.16), mi=0)
    util.box(bm, (0, 0, h * 0.88), (w + 1.4, 0.34, 0.34), mi=0)
    _kasagi(bm, w + 2.4, h * 0.88 + 0.34, 0.42, 0.55)
    o = util.obj_from_bm(name, bm, collection, ['Torii_Red', 'Torii_Black'])
    util.bevel(o, 0.02, 2)
    _place(o, loc, rot)
    if lanterns:
        for sx in (-1, 1):
            pl = bmesh.new()
            util.cylinder(pl, (0, 0, 0), 0.3, 0.75, segments=24, mi=0, radius_top=0.3)
            util.cylinder(pl, (0, 0, -0.08), 0.22, 0.08, segments=24, mi=1)
            util.cylinder(pl, (0, 0, 0.75), 0.22, 0.08, segments=24, mi=1)
            lo = util.obj_from_bm(f'{name}_Paper_Lantern.{sx + 1}', pl, collection, ['Lantern_Paper', 'Torii_Black'],
                                  smooth=True)
            lo.parent = o
            lo.location = (sx * (w / 2 - 0.55), 0.0, h * 0.5)
            point_light(f'{name}_Paper_Lantern_Light.{sx + 1}', collection,
                        Matrix.Translation(loc) @ Matrix.Rotation(rot, 4, 'Z') @ Vector((sx * (w / 2 - 0.55), -0.4, h * 0.5 + 0.4)),
                        25.0, (1.0, 0.5, 0.25), 0.2)
    return o


def _kasagi(bm, length, z, thick, depth, n=40):
    """Top beam whose ends rise in a curve, as on a myojin torii."""
    rows = []
    for k in range(n + 1):
        x = -length / 2 + length * k / n
        lift = 0.5 * (abs(x) / (length / 2)) ** 3
        taper = 1.0 - 0.15 * (abs(x) / (length / 2)) ** 2
        zz = z + lift
        rows.append([bm.verts.new((x, sy * depth / 2 * taper, zz + sz * thick * taper))
                     for sy, sz in ((-1, 0), (1, 0), (1, 1), (-1, 1))])
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(4):
            f = bm.faces.new((r0[i], r1[i], r1[(i + 1) % 4], r0[(i + 1) % 4]))
            f.material_index = 1
    for cap in (rows[0][::-1], rows[-1]):
        bm.faces.new(cap).material_index = 1


# ---------------------------------------------------------------- stone lantern

def stone_lantern(name, collection, loc, rot=0.0, scale=1.0, light=60.0, shadow=False):
    """Base, post, platform, glowing firebox, flared roof and finial."""
    bm = bmesh.new()
    s = scale
    util.cylinder(bm, (0, 0, 0), 0.48 * s, 0.22 * s, segments=6, mi=0)
    util.cylinder(bm, (0, 0, 0.22 * s), 0.36 * s, 0.14 * s, segments=6, mi=0, radius_top=0.3 * s)
    util.cylinder(bm, (0, 0, 0.36 * s), 0.13 * s, 0.75 * s, segments=24, mi=0, radius_top=0.11 * s)
    util.cylinder(bm, (0, 0, 1.11 * s), 0.36 * s, 0.14 * s, segments=6, mi=0)
    zb = 1.25 * s
    for cx, cy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        util.box(bm, (cx * 0.2 * s, cy * 0.2 * s, zb), (0.08 * s, 0.08 * s, 0.42 * s), mi=0)
    util.box(bm, (0, 0, zb + 0.06 * s), (0.34 * s, 0.34 * s, 0.32 * s), mi=1)
    util.cylinder(bm, (0, 0, zb + 0.42 * s), 0.62 * s, 0.1 * s, segments=6, mi=0, radius_top=0.55 * s)
    util.cylinder(bm, (0, 0, zb + 0.52 * s), 0.52 * s, 0.32 * s, segments=6, mi=0, radius_top=0.08 * s)
    util.sphere(bm, (0, 0, zb + 0.9 * s), 0.09 * s, mi=0)
    o = util.obj_from_bm(name, bm, collection, ['Lantern_Stone', 'Lantern_Fire'])
    util.bevel(o, 0.012 * s, 2)
    _place(o, loc, rot)
    if light:
        point_light(f'{name}_Light', collection, Vector(loc) + Vector((0, 0, zb + 0.22 * s)), light, radius=0.12,
                    shadow=shadow)
    return o


# ---------------------------------------------------------------- railing, stairs, floor

def railing(name, collection, points, post_gap=1.6, height=1.1):
    """Wooden posts with caps, a top rail, a mid rail and a stone curb."""
    bm = bmesh.new()
    for a, b in zip(points, points[1:]):
        a, b = Vector(a), Vector(b)
        seg = b - a
        count = max(1, int(seg.length / post_gap))
        for k in range(count + 1):
            p = a + seg * (k / count)
            util.box(bm, (p.x, p.y, p.z), (0.14, 0.14, height), mi=0)
            util.box(bm, (p.x, p.y, p.z + height), (0.2, 0.2, 0.06), mi=0)
        for z, th in ((height - 0.06, 0.12), (height * 0.55, 0.08)):
            util.box_between(bm, a + Vector((0, 0, z)), b + Vector((0, 0, z)), th, mi=0)
        util.box_between(bm, a + Vector((0, 0, 0.1)), b + Vector((0, 0, 0.1)), 0.28, mi=1)
    o = util.obj_from_bm(name, bm, collection, ['Wood_Dark', 'Stone'])
    util.bevel(o, 0.01, 1)
    return o


def stairs(name, collection, start, direction, steps, rise=0.16, run=0.34, width=3.0):
    """Individual treads with side walls. direction is a unit vector on the ground plane."""
    bm = bmesh.new()
    d = Vector(direction).normalized()
    side = d.cross(Vector((0, 0, 1)))
    rot = atan2(d.y, d.x) - pi / 2
    for k in range(steps):
        c = Vector(start) + d * (run * (k + 0.5))
        util.box(bm, (c.x, c.y, start[2] + rise * k), (width, run + 0.04, rise + 0.02), mi=0, rot=rot)
        util.box(bm, (c.x, c.y, start[2] + rise * k + rise - 0.02), (width + 0.06, run + 0.08, 0.04), mi=0, rot=rot)
    for sgn in (-1, 1):
        a = Vector(start) + side * sgn * (width / 2 + 0.2)
        b = a + d * run * steps + Vector((0, 0, rise * steps))
        util.box_between(bm, a + Vector((0, 0, 0.3)), b + Vector((0, 0, 0.3)), 0.4, mi=1)
    o = util.obj_from_bm(name, bm, collection, ['Terrace_Stone', 'Stone'])
    util.bevel(o, 0.015, 2)
    return o


def floor_slab(name, collection, outline_pts, z, thickness=0.7):
    bm = bmesh.new()
    top = [bm.verts.new((p[0], p[1], z)) for p in outline_pts]
    bot = [bm.verts.new((p[0], p[1], z - thickness)) for p in outline_pts]
    bm.faces.new(top)
    bm.faces.new(bot[::-1])
    n = len(top)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=6, use_grid_fill=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return util.obj_from_bm(name, bm, collection, ['Terrace_Stone'])


# ---------------------------------------------------------------- shrine

def _curved_roof(bm, x_half, y_half, z0, rise, nx=28, ny=18, mi=0):
    """A gabled roof along x whose eaves and corners sweep upward."""
    grid = []
    for i in range(nx + 1):
        row = []
        for j in range(ny + 1):
            x = -x_half + 2 * x_half * i / nx
            y = -y_half + 2 * y_half * j / ny
            fy, fx = abs(y) / y_half, abs(x) / x_half
            z = z0 + rise * (1 - fy) ** 1.25 + 0.45 * fy ** 6 + 0.55 * fx ** 8 * fy ** 1.5
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(nx):
        for j in range(ny):
            f = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
            f.material_index = mi
            f.smooth = True


def shrine(name, collection, loc, rot, width=8.0, depth=6.0, wall_h=3.0):
    bm = bmesh.new()
    util.box(bm, (0, 0, 0), (width + 1.2, depth + 1.2, 0.8), mi=3)
    util.box(bm, (0, 0, 0.8), (width + 0.6, depth + 0.6, 0.18), mi=2)
    z = 0.98
    bays = 4
    for i in range(bays + 1):
        for sy in (-1, 1):
            x = -width / 2 + width * i / bays
            util.cylinder(bm, (x, sy * depth / 2, z), 0.16, wall_h, segments=16, mi=2)
    for sx in (-1, 1):
        util.cylinder(bm, (sx * width / 2, 0, z), 0.16, wall_h, segments=16, mi=2)
    # Shoji: glowing paper panels behind a wooden lattice.
    for sy in (-1, 1):
        util.box(bm, (0, sy * (depth / 2 - 0.05), z + 0.1), (width - 0.2, 0.04, wall_h - 0.5), mi=4)
        for k in range(1, 16):
            x = -width / 2 + width * k / 16
            util.box(bm, (x, sy * (depth / 2 + 0.01), z + 0.1), (0.04, 0.05, wall_h - 0.5), mi=2)
        for k in range(1, 6):
            util.box(bm, (0, sy * (depth / 2 + 0.01), z + 0.1 + (wall_h - 0.5) * k / 6), (width - 0.2, 0.05, 0.04), mi=2)
    for sx in (-1, 1):
        util.box(bm, (sx * (width / 2 - 0.05), 0, z + 0.1), (0.04, depth - 0.2, wall_h - 0.5), mi=4)
    util.box(bm, (0, 0, z + wall_h - 0.3), (width + 0.4, depth + 0.4, 0.3), mi=2)
    _curved_roof(bm, width / 2 + 1.6, depth / 2 + 1.8, z + wall_h, 2.4, mi=1)
    util.box(bm, (0, 0, z + wall_h + 2.35), (width + 3.4, 0.5, 0.4), mi=1)
    o = util.obj_from_bm(name, bm, collection, ['Plaster', 'Roof_Tile', 'Wood_Dark', 'Stone', 'Shoji_Glow'])
    util.add_mod(o, 'SOLIDIFY', 'Roof_Thickness', thickness=0.18, offset=-1.0)
    util.bevel(o, 0.015, 1)
    _place(o, loc, rot)
    point_light(f'{name}_Glow', collection, Vector(loc) + Vector((0, 0, 2.2)), 400.0, (1.0, 0.62, 0.32), 1.5)
    return o


# ---------------------------------------------------------------- bridges

def bridge(name, collection, a, b, width=3.0, rise=3.0, piers=2, pier_len=18.0, lamp_gap=7.0,
           lamp_power=180.0, lamp_lights=True, torii_mid=False, segments=48):
    """An arched deck with railings, piers, arch ribs and lamp posts."""
    a, b = Vector(a), Vector(b)
    mid = (a + b) / 2 + Vector((0, 0, rise))
    pts = [a * (1 - t) ** 2 + mid * 2 * (1 - t) * t + b * t * t for t in (k / segments for k in range(segments + 1))]
    span = (b - a)
    side = span.cross(Vector((0, 0, 1))).normalized() * (width / 2)
    bm = bmesh.new()
    th = 0.7
    rows = [[bm.verts.new(p + side), bm.verts.new(p - side), bm.verts.new(p - side - Vector((0, 0, th))),
             bm.verts.new(p + side - Vector((0, 0, th)))] for p in pts]
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(4):
            bm.faces.new((r0[i], r1[i], r1[(i + 1) % 4], r0[(i + 1) % 4]))
    bm.faces.new(rows[0][::-1])
    bm.faces.new(rows[-1])
    # Railings: posts and a top rail on each side.
    for sgn in (1, -1):
        off = side.normalized() * sgn * (width / 2 - 0.1)
        for k in range(0, segments + 1, 2):
            p = pts[k] + off
            util.box(bm, (p.x, p.y, p.z), (0.1, 0.1, 1.05), mi=1)
        for k in range(segments):
            util.box_between(bm, pts[k] + off + Vector((0, 0, 1.0)), pts[k + 1] + off + Vector((0, 0, 1.0)), 0.08, mi=1)
    # Piers drop to taper points and arch ribs span between them under the deck.
    ts = [(k + 1) / (piers + 1) for k in range(piers)]
    anchors = [0.0] + ts + [1.0]
    for t in ts:
        i = int(t * segments)
        top = pts[i] - Vector((0, 0, th))
        util.cylinder(bm, top - Vector((0, 0, pier_len)), 0.45 * width / 3, pier_len, segments=16, mi=0,
                      radius_top=0.7 * width / 3)
    for t0, t1 in zip(anchors, anchors[1:]):
        i0, i1 = int(t0 * segments), int(t1 * segments)
        depth = min(pier_len * 0.6, (pts[i1] - pts[i0]).length * 0.35)
        prev = None
        for k in range(13):
            s = k / 12
            i = int(i0 + (i1 - i0) * s)
            p = pts[i] - Vector((0, 0, th + depth * (1 - (2 * s - 1) ** 2) ** 0.5 * 0.0))
            arc = pts[i] - Vector((0, 0, th)) - Vector((0, 0, depth * (1 - (1 - (2 * s - 1) ** 2) ** 0.5)))
            if prev is not None:
                for sgn in (1, -1):
                    util.box_between(bm, prev + side * sgn * 0.9, arc + side * sgn * 0.9, 0.35, mi=0)
            prev = arc
    o = util.obj_from_bm(name, bm, collection, ['Bridge_Stone', 'Bridge_Iron', 'Lamp_Glow'])
    util.bevel(o, 0.02, 1)
    # Lamp posts along the deck, alternating sides.
    length = sum((q - p).length for p, q in zip(pts, pts[1:]))
    count = max(2, int(length / lamp_gap))
    lamps = bmesh.new()
    lights = util.coll(f'{name}_Lights', collection)
    for k in range(count):
        i = int((k + 0.5) / count * segments)
        sgn = 1 if k % 2 == 0 else -1
        p = pts[i] + side.normalized() * sgn * (width / 2 - 0.1)
        util.cylinder(lamps, (p.x, p.y, p.z), 0.06, 2.6, segments=10, mi=0)
        util.box(lamps, (p.x, p.y, p.z + 2.6), (0.3, 0.3, 0.06), mi=0)
        util.box(lamps, (p.x, p.y, p.z + 2.66), (0.22, 0.22, 0.36), mi=1)
        util.cylinder(lamps, (p.x, p.y, p.z + 3.02), 0.26, 0.18, segments=4, mi=0, radius_top=0.02)
        if lamp_lights:
            point_light(f'{name}_Lamp.{k:02d}', lights, p + Vector((0, 0, 2.85)), lamp_power, radius=0.1)
    util.obj_from_bm(f'{name}_Lamp_Posts', lamps, collection, ['Bridge_Iron', 'Lamp_Glow'])
    if torii_mid:
        m = pts[segments // 2]
        torii(f'{name}_Torii', collection, m, atan2(span.y, span.x), height=4.2, span=width + 0.8)
    return o


# ---------------------------------------------------------------- scenes

def terrace():
    c = util.coll('Terrace')
    t = util.REG['terrace']
    z, zu, T, fwd, left, rot = t['z'], t['upper_z'], t['T'], t['fwd'], t['left'], t['rot']
    zf = z + 0.45
    # The railing runs along the right edge of the walkway, as in the reference.
    rail = [util.ground_point(u, v, zf) for u, v in ((-0.04, 0.9), (0.07, 0.76), (0.15, 0.69), (0.23, 0.635),
                                                   (0.3, 0.598), (0.35, 0.575))]
    edge = [p - left * 0.4 for p in rail]
    far_left = [p + left * 24.0 for p in rail]
    # Past the railing's end the paving runs on to the foot of the upper rock.
    edge.append(edge[-1] + fwd * 16.0)
    far_left.append(far_left[-1] + fwd * 16.0)
    floor_slab('Terrace_Walkway', c, [(p.x, p.y) for p in edge + far_left[::-1]], zf)
    railing('Terrace_Railing', c, rail)
    torii('Terrace_Torii', c, Vector((T.x, T.y, zf)), rot, height=5.4, span=4.4, lanterns=True)
    sdir = (fwd * 0.92 + left * 0.38).normalized()
    start = util.frame_point(T, fwd, left, 2.2, 0.6, zf)
    stairs('Terrace_Stairs', c, start, sdir, steps=int((zu - z) / 0.16) + 1, width=3.2)
    for k in range(4):
        f = 0.15 + 0.22 * k
        i = int(f * (len(rail) - 1))
        p = rail[i].lerp(rail[i + 1], f * (len(rail) - 1) - i) + left * 1.1
        stone_lantern(f'Terrace_Lantern.{k}', c, p, rot, 1.0, light=320.0, shadow=k < 2)
    for k, side in enumerate((-2.8, 3.4)):
        stone_lantern(f'Terrace_Stair_Lantern.{k}', c, util.frame_point(T, fwd, left, 1.0, side, zf), rot, 0.9,
                      light=70.0)
    shrine('Terrace_Shrine', c, util.frame_point(T, fwd, left, 16.5, 3.8, zu), rot + 0.15, width=8.5, depth=6.5)


def central():
    rnd = random.Random(util.CFG['SEED'] + 31)
    c = util.coll('Central_Island')
    info = util.REG['Central_Island']
    target = {info['obj']}
    lx, ly, lr, _ = info['lake']
    centre = info['centre']

    def shore(th, extra):
        p = Vector((lx * info['rx'] + cos(th) * lr * info['rx'] * extra, ly * info['ry'] + sin(th) * lr * info['ry'] * extra, 0))
        w = centre + p
        hit = util.drop(w.x, w.y, centre.z + 80, target)
        return hit[0] if hit else None

    spots = [(2.2, 1.2), (2.7, 1.18), (1.4, 1.22), (0.6, 1.2)]
    for k, (th, ex) in enumerate(spots[:3]):
        p = shore(th, ex)
        if p is not None:
            shrine(f'Central_Shrine.{k}', c, p, th + pi / 2, width=rnd.uniform(5, 7), depth=rnd.uniform(4, 5),
                   wall_h=2.6)
    for k, th in enumerate((2.0, 1.0)):
        p = shore(th, 1.1)
        if p is not None:
            torii(f'Central_Torii.{k}', c, p, th, height=5.0, span=4.0)
    for k in range(10):
        th = 0.4 + k * 0.32
        p = shore(th, 1.06)
        if p is not None:
            stone_lantern(f'Central_Lantern.{k}', c, p, th, 1.1, light=520.0)


def bridges():
    rnd = random.Random(util.CFG['SEED'] + 41)
    c = util.coll('Bridges')
    # The lamp bridge in the lower right, between two rock islets.
    a = util.cam_point(0.705, 0.86, util.S(118))
    b = util.cam_point(0.955, 0.845, util.S(150))
    island('Bridge_Islet_West', c, a - Vector((util.S(3), 0, 0.6)), util.S(7), util.S(6), util.S(22),
           util.CFG['SEED'] + 51, segments=96, spikes=2, levels=3)
    island('Bridge_Islet_East', c, b + Vector((util.S(3), 0, -0.6)), util.S(8), util.S(7), util.S(26),
           util.CFG['SEED'] + 52, segments=96, spikes=2, levels=3)
    bridge('Lamp_Bridge_Lower_Right', c, a, b, width=3.2, rise=util.S(2.5), piers=3, pier_len=util.S(9),
           lamp_gap=util.S(6.0), lamp_power=1100.0)
    torii('Bridge_Islet_Torii', c, b + Vector((util.S(4), util.S(1), 0)), pi / 2, height=4.6, span=3.6)
    # From the central island's right lip to the right cliff.
    ci, rc = util.REG['Central_Island'], util.REG['Right_Cliff']
    pa = ci['centre'] + Vector((ci['rx'] * 0.98, util.S(4), -0.2))
    pb = rc['centre'] + Vector((-rc['rx'] * 0.95, util.S(-6), -util.S(6)))
    bridge('Arched_Bridge_Central_Right', c, pa, pb, width=3.6, rise=util.S(5), piers=3, pier_len=util.S(22),
           lamp_gap=util.S(9), lamp_power=900.0)
    hit = util.drop(rc['centre'].x - rc['rx'] * 0.55, rc['centre'].y - rc['ry'] * 0.3, rc['centre'].z + 80, {rc['obj']})
    if hit:
        torii('Right_Cliff_Torii', c, hit[0], pi / 2 + 0.6, height=5.2, span=4.2)
    # The mid right bridge with a torii on its deck.
    pm = util.cam_point(0.83, 0.62, util.S(190))
    island('Torii_Islet', c, pm, util.S(9), util.S(8), util.S(30), util.CFG['SEED'] + 53, segments=96, spikes=3, levels=2)
    bridge('Torii_Bridge', c, pm + Vector((util.S(7), 0, 0)), rc['centre'] + Vector((-rc['rx'] * 0.6, -rc['ry'] * 0.5, -util.S(28))),
           width=3.0, rise=util.S(3), piers=2, pier_len=util.S(14), lamp_gap=util.S(8), lamp_power=700.0, torii_mid=True)
    # A long bridge from the left distant cluster to the central island.
    pl = util.cam_point(0.25, 0.375, util.S(430))
    pc = ci['centre'] + Vector((-ci['rx'] * 0.97, util.S(10), -0.2))
    bridge('Arched_Bridge_Left', c, pl, pc, width=5.0, rise=util.S(10), piers=4, pier_len=util.S(30),
           lamp_gap=util.S(14), lamp_power=2500.0)
    # Bridges between neighbouring distant islands.
    dist = util.REG['distant']
    made = 0
    for i, d in enumerate(dist):
        for e in dist[i + 1:]:
            if made >= 7:
                break
            gap = (d['centre'] - e['centre']).length
            if gap < (d['r'] + e['r']) * 3.2 and abs(d['centre'].z - e['centre'].z) < d['r']:
                da = (e['centre'] - d['centre']).normalized()
                bridge(f'Distant_Bridge.{made:02d}', c, d['centre'] + da * d['r'] * 0.9, e['centre'] - da * e['r'] * 0.9,
                       width=max(3.0, d['r'] * 0.12), rise=gap * 0.06, piers=2, pier_len=d['r'],
                       lamp_gap=max(8.0, gap / 6), lamp_lights=False, segments=32)
                made += 1
    return made

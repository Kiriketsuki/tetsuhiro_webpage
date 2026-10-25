"""The central lake, the waterfalls and the mist at their feet."""
import random
from math import pi, cos, sin, atan2, sqrt
import bpy
import bmesh
from mathutils import Vector
from . import util
from .terrain import outline


def _lake(info, collection):
    rx, ry = info['rx'], info['ry']
    lx, ly, lr, _ = info['lake']
    lc = Vector((lx * rx, ly * ry, 0))
    bm = bmesh.new()
    ring = []
    for i in range(160):
        th = 2 * pi * i / 160
        p = lc + Vector((cos(th) * lr * rx * 1.04, sin(th) * lr * ry * 1.04, 0))
        a = atan2(p.y, p.x)
        limit = outline(a, rx, ry, info['ph']) * 0.965
        if p.length > limit:
            p = p.normalized() * limit
        ring.append(bm.verts.new((p.x, p.y, -0.35)))
    bm.faces.new(ring)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return util.obj_from_bm('Central_Lake', bm, collection, ['Water_Lake'], loc=info['centre'])


def ribbon(bm, uv, path, widths, out_dirs):
    """Adds one strand: a ribbon along path with a width per point, facing out_dirs."""
    rows = []
    n = len(path)
    for k, (p, w, o) in enumerate(zip(path, widths, out_dirs)):
        side = o.cross(Vector((0, 0, 1))).normalized() * (w / 2)
        rows.append((bm.verts.new(p - side), bm.verts.new(p), bm.verts.new(p + side), k / (n - 1)))
    for (a0, m0, b0, v0), (a1, m1, b1, v1) in zip(rows, rows[1:]):
        for (q0, q1, r0, r1, u0, u1) in ((a0, a1, m0, m1, 0.0, 0.5), (m0, m1, b0, b1, 0.5, 1.0)):
            f = bm.faces.new((q0, r0, r1, q1))
            for loop, (u, v) in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
                loop[uv].uv = (u, v)


def strand_path(start, lip, out, height, segments=48, spread=6.0):
    """Lake edge to lip, then an outward parabola down a fall of the given height."""
    path = [start, (start + lip) / 2 + Vector((0, 0, -0.1)), lip]
    for k in range(1, segments):
        t = k / (segments - 1)
        path.append(lip + out * (spread * t ** 0.5 + 0.6 * t) - Vector((0, 0, height * t)))
    return path


def falls_from_rim(name, info, collection, angle, count, width, height, rnd, start_inset=0.965, lake_z=-0.35):
    rx, ry = info['rx'], info['ry']
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    spots = []
    for k in range(count):
        a = angle + (k - (count - 1) / 2) * (width / max(count - 1, 1)) / max(rx, ry) + rnd.uniform(-0.01, 0.01)
        r = outline(a, rx, ry, info['ph'])
        out = Vector((cos(a), sin(a), 0))
        start = Vector((cos(a) * r * start_inset, sin(a) * r * start_inset, lake_z))
        lip = Vector((cos(a) * r * 1.03, sin(a) * r * 1.03, lake_z - 0.6))
        h = height * rnd.uniform(0.8, 1.1)
        path = strand_path(start, lip, out, h, spread=rnd.uniform(3.0, 7.0))
        w0 = rnd.uniform(0.6, 1.0) * width / count * 0.7
        widths = [w0 * (0.9 if i < 3 else 1.0 + 1.3 * (i - 3) / (len(path) - 3)) for i in range(len(path))]
        ribbon(bm, uv, path, widths, [out] * len(path))
        spots.append(info['centre'] + path[-1] * 0.4 + path[len(path) // 2] * 0.6)
    util.obj_from_bm(name, bm, collection, ['Waterfall'], loc=info['centre'])
    return spots


def mist(name, collection, p, radius, flat=0.6):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    o = util.obj_from_bm(name, bm, collection, ['Mist'], loc=p)
    o.scale = (radius, radius, radius * flat)
    o.visible_shadow = False
    return o


def build():
    rnd = random.Random(util.CFG['SEED'] + 21)
    central = util.REG['Central_Island']
    cc = util.coll('Central_Island')
    _lake(central, cc)
    notch_a = central['notch'][0]
    falls_from_rim('Central_Waterfall', central, cc, notch_a, 6, util.S(30), util.S(95), rnd)
    base = central['centre'] + Vector((cos(notch_a), sin(notch_a), 0)) * central['ry'] * 1.15
    for k in range(4):
        mist(f'Central_Falls_Mist.{k}', cc, base + Vector((rnd.uniform(-12, 12), rnd.uniform(-6, 6),
                                                           -util.S(70) - k * util.S(18))), util.S(22 + 6 * k))

    right = util.REG['Right_Cliff']
    rc = util.coll('Right_Cliff')
    # The right cliff spills toward the camera and the central island.
    falls_from_rim('Right_Cliff_Waterfall', right, rc, pi + 0.9, 2, util.S(8), util.S(70), rnd,
                   start_inset=0.9, lake_z=0.2)
    a = pi + 0.9
    rp = right['centre'] + Vector((cos(a), sin(a), 0)) * right['rx'] * 1.1
    mist('Right_Cliff_Mist', rc, rp + Vector((0, 0, -util.S(55))), util.S(18))

    dc = util.coll('Distant_Islands')
    for k, d in enumerate(util.REG['distant']):
        if rnd.random() > util.CFG['DISTANT_FALLS_SHARE'] and k >= 6:
            continue
        info = util.REG[d['name']]
        to_cam = bpy.data.objects[util.CFG['CAMERA_NAME']].location - info['centre']
        a = atan2(to_cam.y, to_cam.x) + rnd.uniform(-0.6, 0.6)
        falls_from_rim(f'Distant_Waterfall.{k:02d}', info, dc, a, rnd.randint(1, 3), info['rx'] * 0.35,
                       info['depth'] * rnd.uniform(1.4, 2.2), rnd, start_inset=0.92, lake_z=0.3)
        mp = info['centre'] + Vector((cos(a), sin(a), 0)) * info['rx'] * 1.2 - Vector((0, 0, info['depth'] * 1.5))
        mist(f'Distant_Mist.{k:02d}', dc, mp, info['rx'] * 0.8)

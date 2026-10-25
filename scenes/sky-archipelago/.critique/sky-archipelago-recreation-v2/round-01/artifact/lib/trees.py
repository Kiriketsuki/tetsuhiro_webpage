"""Procedural trees with branching trunks and leaf clumps, placed as linked duplicates."""
import random
from math import pi, cos, sin, radians
import bpy
import bmesh
from mathutils import Vector, Matrix, Quaternion
from . import util

SPECIES = {
    # trunk height, trunk radius, branch depth, children, spread (deg), leaf material, clump radius,
    # leaves per clump, leaf size, clump squash
    'broadleaf': dict(h=3.4, r=0.22, depth=3, kids=3, spread=38, mat='Leaf', clump=1.05, leaves=90, size=0.26, squash=0.8),
    'sakura': dict(h=2.6, r=0.2, depth=3, kids=3, spread=58, mat='Sakura', clump=0.95, leaves=150, size=0.13, squash=0.7),
    'pine': dict(h=4.2, r=0.24, depth=2, kids=4, spread=72, mat='Leaf_Pine', clump=1.5, leaves=160, size=0.3, squash=0.32),
    'cypress': dict(h=7.5, r=0.2, depth=1, kids=9, spread=24, mat='Leaf_Pine', clump=0.9, leaves=110, size=0.22, squash=1.2),
    'shrub': dict(h=0.5, r=0.08, depth=2, kids=4, spread=55, mat='Leaf', clump=0.7, leaves=70, size=0.2, squash=0.7),
}


def _perp(d):
    a = Vector((1, 0, 0)) if abs(d.x) < 0.9 else Vector((0, 1, 0))
    return d.cross(a).normalized()


def _leaf(bm, centre, normal, size, rnd, mi):
    """A diamond leaf card. Long, thin cards stand in for pine needles."""
    u = _perp(normal)
    v = normal.cross(u).normalized()
    rot = rnd.uniform(0, 2 * pi)
    u, v = u * cos(rot) + v * sin(rot), v * cos(rot) - u * sin(rot)
    w = size * 0.42
    pts = [centre + u * size, centre + v * w, centre - u * size * 0.6, centre - v * w]
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    f.material_index = mi
    f.smooth = True


def _clump(bm, tip, sp, rnd):
    r = sp['clump'] * rnd.uniform(0.75, 1.2)
    for _ in range(int(sp['leaves'] * rnd.uniform(0.8, 1.2))):
        # Points concentrate toward the shell of the clump, which leaves gaps inside and between clumps.
        d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
        p = tip + Vector((d.x * r, d.y * r, d.z * r * sp['squash'])) * rnd.uniform(0.55, 1.0)
        n = (d + Vector((0, 0, 0.8))).normalized()
        _leaf(bm, p, n, sp['size'] * rnd.uniform(0.7, 1.3), rnd, 1)


def _branch(bm, start, direction, length, radius, depth, sp, rnd, kind):
    pts = [start]
    d = direction.normalized()
    segs = 4
    bend = 0.35 if kind == 'pine' else 0.15
    for k in range(segs):
        d = (d + Vector((rnd.uniform(-bend, bend), rnd.uniform(-bend, bend), rnd.uniform(-0.05, 0.1)))).normalized()
        pts.append(pts[-1] + d * (length / segs))
    for k, (a, b) in enumerate(zip(pts, pts[1:])):
        r0 = radius * (1 - 0.6 * k / segs)
        r1 = radius * (1 - 0.6 * (k + 1) / segs)
        util.cylinder_between(bm, a, b, r0, segments=12, mi=0, radius_b=r1)
        util.sphere(bm, b, r1 * 1.02, mi=0, subdiv=1)
    if depth == 0:
        _clump(bm, pts[-1], sp, rnd)
        if kind in ('broadleaf', 'sakura'):
            _clump(bm, pts[-2], sp, rnd)
        return
    kids = sp['kids'] if depth == sp['depth'] else max(2, sp['kids'] - 1)
    for i in range(kids):
        t = rnd.uniform(0.45, 1.0) if kind != 'cypress' else (i + 1) / (kids + 1)
        base = pts[int(t * segs)]
        axis = (pts[-1] - pts[0]).normalized()
        ang = radians(sp['spread'] * rnd.uniform(0.7, 1.2))
        q_tilt = Quaternion(_perp(axis), ang)
        q_spin = Quaternion(axis, 2 * pi * i / kids + rnd.uniform(-0.4, 0.4))
        nd = q_spin @ (q_tilt @ axis)
        if kind == 'pine':
            nd = Vector((nd.x, nd.y, nd.z * 0.25)).normalized()
        ln = length * (0.62 if kind != 'cypress' else 0.28 * (1.2 - t))
        _branch(bm, base, nd, ln, radius * 0.55, depth - 1, sp, rnd, kind)


def make_tree(kind, seed, collection):
    sp = SPECIES[kind]
    rnd = random.Random(seed)
    bm = bmesh.new()
    if kind == 'shrub':
        for i in range(3):
            _branch(bm, Vector((rnd.uniform(-.3, .3), rnd.uniform(-.3, .3), 0)), Vector((rnd.uniform(-.4, .4), rnd.uniform(-.4, .4), 1)),
                    sp['h'], sp['r'], sp['depth'] - 1, sp, rnd, kind)
    else:
        _branch(bm, Vector((0, 0, -0.4)), Vector((0, 0, 1)), sp['h'], sp['r'], sp['depth'], sp, rnd, kind)
    o = util.obj_from_bm(f'Tree_{kind.title()}_Source.{seed % 1000:03d}', bm, collection, ['Bark', sp['mat']])
    return o


def library():
    lib = util.coll('Tree_Library')
    lib.hide_render = True
    lib.hide_viewport = True
    out = {}
    for kind, n in (('broadleaf', 4), ('sakura', 3), ('pine', 4), ('cypress', 2), ('shrub', 3)):
        out[kind] = [make_tree(kind, util.CFG['SEED'] + 500 + 17 * i + len(kind), lib) for i in range(n)]
    return out


def plant(lib, kind, name, collection, loc, rnd, scale=1.0):
    src = rnd.choice(lib[kind])
    o = bpy.data.objects.new(name, src.data)
    o.location = loc
    o.rotation_euler = (rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), rnd.uniform(0, 2 * pi))
    s = scale * rnd.uniform(0.8, 1.25)
    o.scale = (s, s, s)
    collection.objects.link(o)
    return o


def _pick(rnd, mix):
    r = rnd.random()
    acc = 0.0
    for kind, share in mix:
        acc += share
        if r <= acc:
            return kind
    return mix[-1][0]


def scatter(lib, info_name, collection, count, mix, rnd, ring=(0.55, 0.97), scale=1.0, avoid=()):
    info = util.REG[info_name]
    centre = info['centre']
    placed = 0
    for _ in range(count * 6):
        if placed >= count:
            break
        a = rnd.uniform(0, 2 * pi)
        f = rnd.uniform(*ring)
        x = centre.x + cos(a) * info['rx'] * f
        y = centre.y + sin(a) * info['ry'] * f
        if any((Vector((x, y, 0)) - Vector((ax, ay, 0))).length < ar for ax, ay, ar in avoid):
            continue
        hit = util.drop(x, y, centre.z + 200, {info['obj']})
        # Skip steep ground, and ground under the lake surface.
        if hit is None or hit[1].z < 0.75 or (info.get('lake') and hit[0].z < centre.z - 0.2):
            continue
        kind = _pick(rnd, mix)
        plant(lib, kind, f'Tree_{info_name}.{placed:03d}', collection, hit[0], rnd, scale)
        placed += 1
    return placed


def build():
    rnd = random.Random(util.CFG['SEED'] + 61)
    lib = library()
    # Terrace: sakura near the torii and the lower left, pines on the upper rock.
    tc = util.coll('Terrace_Trees', util.coll('Terrace'))
    t = util.REG['terrace']
    z = t['z']
    for k, (kind, along, side, s) in enumerate([('sakura', -9.0, 5.2, 0.9), ('shrub', -12.0, 3.4, 1.2),
                                                ('sakura', 3.0, 3.4, 1.2), ('pine', 12.0, 8.0, 1.3),
                                                ('broadleaf', 22.0, -3.0, 1.4), ('pine', 8.0, 6.5, 1.1),
                                                ('shrub', -6.0, -3.6, 1.4), ('shrub', -1.0, -4.2, 1.3),
                                                ('cypress', 40.0, 7.0, 1.2)][:util.CFG['TERRACE_TREE_COUNT']]):
        p = util.frame_point(t['T'], t['fwd'], t['left'], along, side)
        hit = util.drop(p.x, p.y, z + 60.0)
        loc = hit[0] if hit else Vector((p.x, p.y, z))
        plant(lib, kind, f'Tree_Terrace.{k:02d}', tc, loc, rnd, s)
    cc = util.coll('Central_Trees', util.coll('Central_Island'))
    mix = (('pine', 0.34), ('broadleaf', 0.34), ('sakura', 0.17), ('cypress', 0.08), ('shrub', 0.07))
    avoid = [(o.location.x, o.location.y, 6.0) for o in bpy.data.objects
             if o.name.startswith(('Central_Shrine', 'Central_Torii'))]
    scatter(lib, 'Central_Island', cc, util.CFG['CENTRAL_TREE_COUNT'], mix, rnd, (0.5, 0.97), util.S(1.6), avoid)
    rc = util.coll('Right_Cliff_Trees', util.coll('Right_Cliff'))
    scatter(lib, 'Right_Cliff', rc, util.CFG['RIGHT_CLIFF_TREE_COUNT'], mix, rnd, (0.2, 0.95), util.S(1.5))
    dc = util.coll('Distant_Trees', util.coll('Distant_Islands'))
    for d in util.REG['distant']:
        far = d['depth'] / util.S(600)
        scatter(lib, d['name'], dc, rnd.randint(4, 9), mix, rnd, (0.55, 0.95), util.S(1.6) * max(1.0, far))

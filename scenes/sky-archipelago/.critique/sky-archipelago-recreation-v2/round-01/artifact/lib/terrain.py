"""Floating islands and cliffs. One generator builds every island at the detail its distance needs."""
import random
from math import pi, cos, sin, sqrt, exp, atan2
import bpy
import bmesh
from mathutils import Vector, noise
from . import util

TOP_RINGS = [1.0, 0.99, 0.965, 0.92, 0.85, 0.76, 0.65, 0.53, 0.41, 0.29, 0.18, 0.08]
WALL = [0.0, 0.006, 0.025, 0.06, 0.1, 0.15, 0.2, 0.26, 0.32, 0.38, 0.45, 0.52, 0.59, 0.66, 0.73,
        0.8, 0.86, 0.91, 0.95]


def _texture_space():
    o = bpy.data.objects.get('Cliff_Texture_Space')
    if o is None:
        o = util.empty('Cliff_Texture_Space', util.coll('Helpers'))
        # The displacement reads world space through this empty. A tall z scale stretches
        # the Voronoi cells into vertical columns.
        o.scale = (1.0, 1.0, 11.0)
        util.coll('Helpers').hide_render = True
    return o


def _textures():
    cols = bpy.data.textures.get('Cliff_Columns') or bpy.data.textures.new('Cliff_Columns', 'VORONOI')
    cols.noise_scale = 3.2
    cols.distance_metric = 'DISTANCE'
    # F2 minus F1 gives sharp ridges at cell borders: the cracks between columns.
    cols.weight_1, cols.weight_2, cols.weight_3, cols.weight_4 = -1.0, 1.0, 0.0, 0.0
    cols.noise_intensity = 1.6
    shape = bpy.data.textures.get('Cliff_Shape') or bpy.data.textures.new('Cliff_Shape', 'CLOUDS')
    shape.noise_scale = 14.0
    shape.noise_depth = 3
    grit = bpy.data.textures.get('Cliff_Grit') or bpy.data.textures.new('Cliff_Grit', 'CLOUDS')
    grit.noise_scale = 1.1
    grit.noise_depth = 2
    return cols, shape, grit


def outline(a, rx, ry, ph):
    base = rx * ry / sqrt((ry * cos(a)) ** 2 + (rx * sin(a)) ** 2)
    p = Vector((cos(a), sin(a), 0.0))
    k = 1 + 0.12 * noise.noise(p * 1.3 + ph) + 0.05 * noise.noise(p * 3.7 + ph) + 0.02 * noise.noise(p * 9.0 + ph)
    return base * k


def _gauss_angle(a, a0, w):
    d = (a - a0 + pi) % (2 * pi) - pi
    return exp(-(d / w) ** 2)


def island(name, collection, centre, rx, ry, depth, seed, segments=96, lake=None, notch=None,
           ledges=3, spikes=4, mound=1.0, levels=2, roots=0, top_mat='Grass'):
    """Builds one floating island. centre is the middle of the top rim.

    lake = (offset_x, offset_y, radius_fraction, basin_depth), fractions of the radii.
    notch = (angle, width, drop): lowers the lip where water spills."""
    rnd = random.Random(seed)
    ph = Vector((rnd.uniform(0, 100), rnd.uniform(0, 100), rnd.uniform(0, 100)))
    bm = bmesh.new()
    dl = bm.verts.layers.deform.verify()
    n = segments
    angles = [2 * pi * i / n for i in range(n)]
    radius = [outline(a, rx, ry, ph) for a in angles]

    def notch_drop(a):
        return notch[2] * _gauss_angle(a, notch[0], notch[1]) if notch else 0.0

    def top_z(f, a, x, y):
        z = mound * (1 - f * f) * (0.7 + 0.6 * noise.noise(Vector((x, y, 0)) * 0.05 + ph))
        z += 0.25 * noise.noise(Vector((x, y, 0)) * 0.3 + ph)
        if f > 0.9:
            z -= notch_drop(a) * (f - 0.9) / 0.1
        if lake:
            lx, ly, lr, ld = lake
            dx, dy = x / rx - lx, y / ry - ly
            dd = sqrt(dx * dx + dy * dy) / lr
            if dd < 1.15:
                basin = ld * max(0.0, min(1.0, (1.15 - dd) / 0.3))
                z = min(z, 0.15 - basin) if dd < 1.0 else z - basin * 0.5
        return z

    rings = []
    for f in TOP_RINGS:
        ring = []
        for a, r in zip(angles, radius):
            x, y = cos(a) * r * f, sin(a) * r * f
            v = bm.verts.new((x, y, top_z(f, a, x, y)))
            v[dl][0] = 0.0
            ring.append(v)
        rings.append(ring)
    centre_v = bm.verts.new((0, 0, top_z(0.0, 0.0, 0.0, 0.0)))
    centre_v[dl][0] = 0.0

    ledge_ts = sorted(rnd.uniform(0.07, 0.3) for _ in range(ledges))
    wall_ts = sorted(set(WALL[1:] + ledge_ts + [t + 0.008 for t in ledge_ts]))
    walls = []
    for t in wall_ts:
        ring = []
        step = sum(0.045 for lt in ledge_ts if t >= lt + 0.008)
        for a, r in zip(angles, radius):
            if t <= 0.35:
                s = 1.0 - 0.06 * t / 0.35 - step
            else:
                s = (0.94 - step) * (1 - (t - 0.35) / 0.65) ** 1.2
            p = Vector((cos(a), sin(a), t * 2.0))
            s *= 1 + (0.03 + 0.14 * t) * noise.noise(p * 2.0 + ph)
            z = -depth * t - (notch_drop(a) if t < 0.01 else 0.0)
            v = bm.verts.new((cos(a) * r * s, sin(a) * r * s, z))
            v[dl][0] = 0.25 if t < 0.01 else 1.0
            ring.append(v)
        walls.append(ring)
    tip = bm.verts.new((rnd.uniform(-.15, .15) * rx, rnd.uniform(-.15, .15) * ry, -depth))
    tip[dl][0] = 1.0

    # Faces: the top from the centre out, then the wall rings down to the tip.
    for i in range(n):
        bm.faces.new((centre_v, rings[-1][i], rings[-1][(i + 1) % n]))
    prev = rings[-1]
    for ring in rings[::-1][1:]:
        for i in range(n):
            j = (i + 1) % n
            f = bm.faces.new((prev[i], ring[i], ring[j], prev[j]))
            f.material_index = 1
        prev = ring
    for ring in walls:
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((prev[i], ring[i], ring[j], prev[j]))
        prev = ring
    for i in range(n):
        bm.faces.new((prev[i], tip, prev[(i + 1) % n]))
    for f in bm.faces:
        if centre_v in f.verts:
            f.material_index = 1

    for _ in range(spikes):
        a = rnd.uniform(0, 2 * pi)
        d = rnd.uniform(0.25, 0.7)
        rr = rnd.uniform(0.08, 0.2) * min(rx, ry)
        h = depth * rnd.uniform(0.35, 0.9)
        base = Vector((cos(a) * rx * d * 0.8, sin(a) * ry * d * 0.8, -depth * rnd.uniform(0.35, 0.55)))
        vs = util.cylinder(bm, base - Vector((0, 0, h)), 0.0, h, segments=14, radius_top=rr)
        for v in vs:
            v[dl][0] = 1.0

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = util.obj_from_bm(name, bm, collection, ['Rock', top_mat], smooth=True, loc=centre)
    o.vertex_groups.new(name='cliff')
    _modifiers(o, min(rx, ry), levels)
    if roots:
        _roots(name, collection, o, rx, ry, depth, ph, roots, rnd, angles, radius)
    util.REG[name] = dict(centre=Vector(centre), rx=rx, ry=ry, depth=depth, obj=o.name,
                          lake=lake, notch=notch, ph=ph)
    return o


def _modifiers(o, r, levels):
    cols, shape, grit = _textures()
    space = _texture_space()
    util.add_mod(o, 'SUBSURF', 'Subdivision', levels=min(levels, 2), render_levels=levels)
    util.add_mod(o, 'DISPLACE', 'Cliff_Shape', texture=shape, texture_coords='GLOBAL',
                 strength=r * 0.07, vertex_group='cliff')
    util.add_mod(o, 'DISPLACE', 'Cliff_Columns', texture=cols, texture_coords='OBJECT',
                 texture_coords_object=space, strength=min(3.0, 0.6 + r * 0.03), vertex_group='cliff')
    util.add_mod(o, 'DISPLACE', 'Cliff_Grit', texture=grit, texture_coords='GLOBAL',
                 strength=0.35, vertex_group='cliff')


def _roots(name, collection, o, rx, ry, depth, ph, count, rnd, angles, radius):
    cu = bpy.data.curves.new(f'{name}_Roots', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.09
    cu.bevel_resolution = 3
    cu.resolution_u = 8
    cu.use_fill_caps = True
    for _ in range(count):
        i = rnd.randrange(len(angles))
        a, r = angles[i], radius[i]
        start = Vector((cos(a) * r * 1.01, sin(a) * r * 1.01, -0.4))
        length = rnd.uniform(4, 18) * (1 + rx / 80)
        sp = cu.splines.new('POLY')
        pts = 8
        sp.points.add(pts - 1)
        for k in range(pts):
            t = k / (pts - 1)
            sway = Vector((noise.noise(Vector((t * 3, a, 0)) + ph), noise.noise(Vector((a, t * 3, 1)) + ph), 0)) * 0.8
            out = Vector((cos(a), sin(a), 0)) * (0.3 + 1.2 * t)
            p = start + out + sway - Vector((0, 0, length * t))
            sp.points[k].co = (p.x, p.y, p.z, 1.0)
            sp.points[k].radius = 1.4 * (1 - t) + 0.2
    cu.materials.append(util.mat('Bark'))
    ro = bpy.data.objects.new(f'{name}_Roots', cu)
    ro.location = o.location
    collection.objects.link(ro)


# ---------------------------------------------------------------- the landmarks

def terrace_cliff():
    """Foreground cliff on the left. Its top carries the walkway, the torii and the home tower."""
    c = util.coll('Terrace')
    # The torii base anchors the terrace. Everything else sits in a ground frame around it:
    # fwd points away from the camera and left points to the viewer's left.
    T = util.cam_point(0.10, 0.575, util.CFG['TORII_DEPTH'])
    z_walk = T.z
    fwd = Vector((T.x, T.y, 0)).normalized()
    left = Vector((-fwd.y, fwd.x, 0))
    rot = atan2(fwd.y, fwd.x) - pi / 2
    o = island('Terrace_Cliff', c, util.frame_point(T, fwd, left, 4.0, 23.0, z_walk), 28.0, 40.0, 150.0,
               util.CFG['SEED'] + 1, segments=180, ledges=4, spikes=0, mound=0.0, levels=3, roots=16)
    o.rotation_euler.z = rot
    upper = island('Terrace_Upper_Rock', c, util.frame_point(T, fwd, left, 23.0, 6.0, z_walk + 3.0), 13.0, 18.0,
                   9.0, util.CFG['SEED'] + 2, segments=120, ledges=1, spikes=0, mound=0.2, levels=3)
    upper.rotation_euler.z = rot
    util.REG['terrace'] = dict(z=z_walk, upper_z=z_walk + 3.0, T=T, fwd=fwd, left=left, rot=rot)
    return o, upper


def central_island():
    c = util.coll('Central_Island')
    lake_centre = util.cam_point(0.645, 0.462, util.S(290))
    rx, ry = util.S(70), util.S(54)
    centre = lake_centre + Vector((0.0, util.S(6.0), 0.4))
    # The notch faces the camera, slightly right, where the falls spill.
    o = island('Central_Island', c, centre, rx, ry, util.S(82), util.CFG['SEED'] + 3, segments=200,
               lake=(0.02, -0.22, 0.72, util.S(4.0)), notch=(-pi / 2 + 0.08, 0.32, util.S(1.2)),
               ledges=4, spikes=7, mound=util.S(2.5), levels=3, roots=26)
    util.REG['lake_z'] = centre.z - 0.35
    return o


def right_cliff():
    c = util.coll('Right_Cliff')
    p = util.cam_point(1.02, 0.395, util.S(150))
    o = island('Right_Cliff', c, p, util.S(30), util.S(26), util.S(52), util.CFG['SEED'] + 4, segments=160,
               ledges=3, spikes=4, mound=util.S(1.2), levels=3, roots=14)
    return o


def hero_island():
    c = util.coll('Hero_Towers')
    p = util.cam_point(0.63, 0.47, util.S(560))
    o = island('Hero_Tower_Island', c, p, util.S(120), util.S(85), util.S(150), util.CFG['SEED'] + 5,
               segments=160, ledges=3, spikes=6, mound=util.S(1.0), levels=2)
    return o


def distant_islands():
    """At least 24 islands beyond the central island, some clustered upper left of centre."""
    c = util.coll('Distant_Islands')
    rnd = random.Random(util.CFG['SEED'] + 6)
    placed = []
    count = util.CFG['DISTANT_ISLAND_COUNT']
    # A fixed cluster in the upper left fills the reference's waterfall islands.
    fixed = [(0.22, 0.27, 620), (0.29, 0.22, 900), (0.36, 0.28, 760), (0.42, 0.21, 1150), (0.25, 0.33, 480),
             (0.33, 0.35, 560), (0.12, 0.2, 700), (0.06, 0.3, 520), (0.78, 0.33, 640), (0.47, 0.31, 950),
             (0.18, 0.11, 1300), (0.04, 0.12, 900)]
    spots = list(fixed)
    tries = 0
    while len(spots) < count and tries < 3000:
        tries += 1
        u, v, d = rnd.uniform(0.0, 1.0), rnd.uniform(0.08, 0.42), rnd.uniform(700, 2400)
        if 0.52 < u < 0.75 and v < 0.45:
            continue
        if u > 0.78 and v < 0.32:
            continue
        if any(abs(u - a) < 0.06 and abs(v - b) < 0.05 for a, b, _ in spots):
            continue
        spots.append((u, v, d))
    # Small islets low in the frame, at the edges of the cloud gap.
    spots += [(0.33, 0.86, 230), (0.2, 0.62, 330), (0.6, 0.86, 260)]
    for k, (u, v, d) in enumerate(spots):
        d = util.S(d)
        p = util.cam_point(u, v, d)
        r = d * rnd.uniform(0.025, 0.045)
        seg = 96 if d < util.S(900) else 64
        o = island(f'Distant_Island.{k:02d}', c, p, r * rnd.uniform(0.9, 1.3), r, r * rnd.uniform(1.6, 2.6),
                   util.CFG['SEED'] + 100 + k, segments=seg, ledges=2, spikes=rnd.randint(2, 5),
                   mound=r * 0.03, levels=2 if d < util.S(1200) else 1)
        placed.append(dict(name=o.name, u=u, v=v, depth=d, r=r, centre=p))
    util.REG['distant'] = placed
    # The upper right island: larger and nearer than its neighbours, carrying a small tower cluster.
    d = util.S(420)
    p = util.cam_point(0.91, 0.2, d)
    o = island('Upper_Right_Island', c, p, util.S(48), util.S(40), util.S(95), util.CFG['SEED'] + 99,
               segments=128, ledges=3, spikes=5, mound=util.S(1.0), levels=2)
    placed.append(dict(name=o.name, u=0.91, v=0.2, depth=d, r=util.S(44), centre=p, towers=7))

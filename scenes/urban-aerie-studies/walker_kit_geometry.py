"""Mesh helpers and the body-and-tail mesh for the walker concept.

walker_concepts.py imports this module. Every function here builds bmesh data only.
Nothing here touches the scene.

Model space: +X is forward, +Z is up, +Y is the walker's left.
"""
import math

import bmesh
from mathutils import Matrix, Vector


def cut(bm, co, no, geom=None):
    """Splits faces on a plane, so a colour boundary follows a straight line.

    geom limits the cut to part of the mesh. By default the cut runs through all of it.
    """
    if geom is None:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=Vector(no).normalized())


def side_of(c, co, no):
    return (c - Vector(co)).dot(Vector(no).normalized())


def paint(bm, rule, faces=None):
    """Sets each face material from a rule on its centre. The rule returns a slot."""
    for f in (bm.faces if faces is None else faces):
        f.material_index = rule(f.calc_center_median())


def ellipsoid(bm, r, segs, rings, at=(0, 0, 0)):
    """Adds a faceted ellipsoid to bm and returns its new verts."""
    res = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    verts = res['verts']
    bmesh.ops.scale(bm, vec=r, verts=verts)
    bmesh.ops.translate(bm, vec=at, verts=verts)
    return verts


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def tube(bm, rings, sides, band_slot=None, band_region=None):
    """Adds a closed tube through rings of (centre, u, v, radius).

    A ring point is centre + (u cos a + v sin a) * radius, so u and v of unequal
    length give an oval ring. The first and last ring close on a pole. band_slot maps
    a band index (between ring i and i + 1) to a material slot. band_region maps a
    band index to an int that the face keeps in the 'region' layer.
    """
    region = None
    if band_region is not None:
        region = bm.faces.layers.int.get('region') or bm.faces.layers.int.new('region')

    def tag(f, i):
        if band_slot is not None:
            f.material_index = band_slot(i)
        if region is not None:
            f[region] = band_region(i)

    loops = []
    for centre, u, v, r in rings:
        loops.append([bm.verts.new(centre + (u * math.cos(a) + v * math.sin(a)) * r)
                      for a in (2 * math.pi * k / sides for k in range(sides))])
    for i, (a, b) in enumerate(zip(loops, loops[1:])):
        for k in range(sides):
            tag(bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k])), i)
    for loop, ring, i in ((loops[0], rings[0], 0), (loops[-1], rings[-1], len(rings) - 2)):
        pole = bm.verts.new(ring[0])
        for k in range(sides):
            tag(bm.faces.new((loop[k], loop[(k + 1) % sides], pole)), i)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)


def capsule_rings(length, r_top, r_bot, mid=3, dome=2):
    """Rings for a post that hangs down -Z from the origin, with domed ends.

    The top dome rises above the origin, so it sits inside the parent part.
    """
    x, y = Vector((1, 0, 0)), Vector((0, 1, 0))
    rings = []
    for k in range(dome):
        phi = math.radians(25 + 65 * k / dome)
        rings.append((Vector((0, 0, r_top * math.cos(phi) * 0.8)), x, y, r_top * math.sin(phi)))
    for k in range(mid + 1):
        t = k / mid
        rings.append((Vector((0, 0, -length * t)), x, y, r_top + (r_bot - r_top) * t))
    for k in range(1, dome + 1):
        phi = math.radians(90 - 65 * k / dome)
        rings.append((Vector((0, 0, -length - r_bot * math.cos(phi) * 0.8)), x, y,
                      r_bot * math.sin(phi)))
    return rings


def place_on(tree, origin, direction):
    """Casts a ray at a surface and returns (location, normal), or None on a miss."""
    hit = tree.ray_cast(Vector(origin), Vector(direction).normalized())
    return (hit[0], hit[1]) if hit[0] is not None else None


def facing(normal, roll=0.0):
    """Euler angles that turn local +X onto a surface normal."""
    q = Vector((1, 0, 0)).rotation_difference(normal)
    return (q @ Matrix.Rotation(roll, 4, 'X').to_quaternion()).to_euler()


# Body and tail -----------------------------------------------------------------------

BODY_STATIONS = (0.97, 0.88, 0.72, 0.5, 0.25, 0.0, -0.25, -0.5, -0.68, -0.82, -0.92, -1.0)


def tail_radius(t, root, peak):
    """Brush profile along the tail, 0 at the root and 1 at the tip."""
    if t < 0.62:
        return root + (peak - root) * math.sin(t / 0.62 * math.pi / 2)
    return peak * math.sqrt(max(0.0, 1 - ((t - 0.62) / 0.38) ** 2))


def body_ring(cfg, u):
    """Returns (centre, half width, half height) of the body section at u.

    u runs from 1 at the chest to -1 at the rump. Toward the rump the section narrows
    to the tail root and rises to the top of the back, so the rump runs into the tail.
    """
    blen, bw, bh = cfg['body']
    half_w, half_h, root = bw / 2, bh / 2, cfg['tail_root']
    f = math.sqrt(max(0.0, 1 - u * u))
    zc = 0.10 * bh * u
    if u > 0:
        w, h = half_w * f ** 0.85, half_h * f ** 0.85
    else:
        k = f ** 0.8
        w = root + (half_w - root) * k
        h = root + (half_h - root) * k
        zc += (half_h - root) * 0.95 * (1 - k)
    return Vector((u * blen / 2, 0, zc)), w, h


def tail_spine(cfg, joints, start, steps=360):
    """Samples the tail centre line as (s, position, rotation) from the rump end.

    Each joint spreads its bend over a short length of tail, so the tail curves and
    never kinks. joints holds one (pitch, yaw) pair in degrees per tail joint.
    """
    length, blend = cfg['tail_length'], 0.08

    def bend(s):
        pitch = yaw = 0.0
        for s_j, (p, y) in zip(cfg['tail_joints'], joints):
            w = smoothstep((s - s_j) / blend + 0.3)
            pitch += math.radians(p) * w
            yaw += math.radians(y) * w
        return pitch, yaw

    ds = length / steps
    pos, rot, prev = start.copy(), Matrix.Identity(3), bend(0.0)
    samples = []
    for k in range(steps + 1):
        cur = bend(k * ds)
        rot = rot @ Matrix.Rotation(cur[1] - prev[1], 3, 'Z') @ Matrix.Rotation(
            cur[0] - prev[0], 3, 'Y')
        prev = cur
        samples.append((k * ds, pos.copy(), rot.copy()))
        pos = pos + rot @ Vector((-ds, 0, 0))
    return samples


def body_tail_mesh(cfg, joints, sides=12):
    """Returns the body and tail as one closed tube, and the body face set.

    The body sections and the tail rings share one loop at the rump end, so the
    surface is continuous from chest to tail tip. Only the tail part bends. Faces keep
    a 'region' layer: 0 for the body and 1 for the tail.
    """
    length, root, peak = cfg['tail_length'], cfg['tail_root'], cfg['tail_peak']
    band0, band1 = (f * length for f in cfg['tail_band'])
    y_axis, z_axis = Vector((0, 1, 0)), Vector((0, 0, 1))
    rings = []
    for u in BODY_STATIONS:
        centre, w, h = body_ring(cfg, u)
        rings.append((centre, y_axis * w, z_axis * h, 1.0))
    n_body = len(rings)
    start = rings[-1][0]
    samples = tail_spine(cfg, joints, start)
    steps = len(samples) - 1
    stations = sorted({round(length * 0.985 * k / 14, 5) for k in range(1, 15)}
                      | {band0, band1})
    for s in stations:
        _, p, r = samples[min(steps, int(round(s / length * steps)))]
        rad = max(tail_radius(s / length, root, peak), 0.003)
        rings.append((p, r @ y_axis, r @ z_axis, rad))
    rings.append((samples[-1][1], rings[-1][1], rings[-1][2], 0.0005))
    tail_s = [0.0] + stations + [length]

    def region(i):
        return 0 if i < n_body - 1 else 1

    def slot(i):
        if i < n_body - 1:
            return 0
        j = i - (n_body - 1)
        s = (tail_s[min(j, len(tail_s) - 1)] + tail_s[min(j + 1, len(tail_s) - 1)]) / 2
        return 0 if s < band0 else (2 if s < band1 else 1)

    bm = bmesh.new()
    tube(bm, rings, sides, band_slot=slot, band_region=region)
    layer = bm.faces.layers.int['region']
    body_faces = [f for f in bm.faces if f[layer] == 0]
    shape_body(cfg, bm, body_faces, start.x)
    return bm, layer


def shape_body(cfg, bm, body_faces, rump_x):
    """Adds the waist, the shoulder and haunch masses, and the colour fields.

    The rump end loop stays where it is, because the tail shares it.
    """
    blen, bw, bh = cfg['body']
    verts = {v for f in body_faces for v in f.verts if v.co.x > rump_x + 1e-4}
    for v in verts:
        t = v.co.x / (blen / 2)
        waist = 1 - 0.10 * math.exp(-((t + 0.2) / 0.4) ** 2)
        v.co.y *= waist
        if v.co.z < 0:
            v.co.z *= waist
    # Shoulder and haunch masses: the legs grow out of these, not out of a smooth egg.
    for sx, sz, amt, rr in ((blen * 0.28, -bh * 0.02, 0.010, 0.07),
                            (-blen * 0.28, bh * 0.02, 0.020, 0.08)):
        for v in verts:
            if abs(v.co.y) < 1e-6:
                continue
            centre = Vector((sx, math.copysign(bw * 0.30, v.co.y), sz))
            g = math.exp(-((v.co - centre).length / rr) ** 2)
            v.co.y += math.copysign(amt * g, v.co.y)
            v.co.z -= amt * 0.6 * g
    chest = ((blen * 0.18, 0, -bh * 0.05), (-0.55, 0, 1))
    saddle_top = ((0, 0, bh * 0.20), (0, 0, 1))
    saddle_front = ((blen * 0.06, 0, 0), (1, 0, -0.35))
    saddle_back = ((-blen * 0.30, 0, 0), (-1, 0, -0.25))
    layer = bm.faces.layers.int['region']
    for plane in (chest, saddle_top, saddle_front, saddle_back):
        faces = [f for f in bm.faces if f[layer] == 0]
        geom = faces + list({e for f in faces for e in f.edges}) + list(
            {v for f in faces for v in f.verts})
        cut(bm, *plane, geom=geom)

    def rule(c):
        if side_of(c, *chest) < 0:
            return 1
        if (side_of(c, *saddle_top) > 0 and side_of(c, *saddle_front) < 0
                and side_of(c, *saddle_back) < 0):
            return 2
        return 0
    paint(bm, rule, faces=[f for f in bm.faces if f[layer] == 0])


# Ears --------------------------------------------------------------------------------

def ear_mesh(eh, er, sides=8):
    """Returns a large fox ear whose base swells into a mound inside the skull.

    The mound meets the head at a shallow angle, so the ear grows out of the head.
    Slot 1 marks the tip field.
    """
    stations = (-0.026, -0.014, -0.004, 0.008, 0.022, eh * 0.35, eh * 0.62, eh * 0.82)
    rings = []
    for z in stations:
        zz = max(z, 0.0)
        wy = er * (1 - zz / eh) ** 0.85 * (1 + 0.10 * math.sin(math.pi * zz / eh))
        tx = 0.42 * wy
        f = smoothstep((0.022 - z) / 0.048)
        wy += (er * 1.15 - wy) * f
        tx += (er * 0.75 - tx) * f
        rings.append((Vector((0, 0, z)), Vector((0, wy, 0)), Vector((tx, 0, 0)), 1.0))
    rings.append((Vector((0, 0, eh)), Vector((0, 1, 0)), Vector((1, 0, 0)), 0.0005))
    bm = bmesh.new()
    tube(bm, rings, sides,
         band_slot=lambda i: 1 if (rings[i][0].z + rings[i + 1][0].z) / 2 > eh * 0.62 else 0)
    return bm

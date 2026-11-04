"""Mesh helpers for the aerie bedroom kit (aerie_bedroom_kit.py).

Every primitive builds in its own small bmesh, takes its bevels there, and then joins one Part
per kit material. A primitive gets one base colour. Its vertices take that colour times a smooth
noise field, so neighbouring faces get close values and the toon shading shows coherent facets,
never a per-face checkerboard.

All points are Blender world metres (Z up) in the aerie frame, so the kit needs no transform.
"""
import math
import bmesh
from mathutils import Vector, Matrix, noise

WHITE = (1.0, 1.0, 1.0)


def srgb_to_linear(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def shade(c, f):
    return tuple(max(0.0, min(1.0, v * f)) for v in c)


def hexc(h):
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def rot_x(deg):
    return Matrix.Rotation(math.radians(deg), 3, 'X')


def rot_y(deg):
    return Matrix.Rotation(math.radians(deg), 3, 'Y')


def rot_z(deg):
    return Matrix.Rotation(math.radians(deg), 3, 'Z')


I3 = Matrix.Identity(3)


def field(p, freq, seed=0.0):
    """Smooth noise in -1..1."""
    return noise.noise(Vector(p) * freq + Vector((seed, seed * 1.7, seed * 0.3)))


class Part:
    """Vertices, colours, UVs and faces of one kit mesh."""

    def __init__(self, uv=False):
        self.verts, self.colours, self.faces, self.smooth, self.uvs = [], [], [], [], []
        self.uv = uv

    def tris(self):
        return sum(len(f) - 2 for f in self.faces)

    def add_bmesh(self, bm, colour_at, smooth=False, uv_at=None):
        bm.verts.index_update()
        base = len(self.verts)
        for v in bm.verts:
            self.verts.append(tuple(v.co))
            self.colours.append(colour_at(v.co))
        for f in bm.faces:
            self.faces.append(tuple(base + v.index for v in f.verts))
            self.smooth.append(smooth)
            if self.uv:
                self.uvs.append(tuple(uv_at(v.co) if uv_at else (0.0, 0.0) for v in f.verts))
        bm.free()


def tinted(colour, var=0.06, freq=2.5, seed=0.0):
    """A colour function: the base colour times a gentle smooth field."""
    return lambda p: shade(colour, 1.0 + var * field(p, freq, seed))


def _place(bm, centre, rot):
    m = Matrix.Translation(Vector(centre)) @ rot.to_4x4()
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)


def _bevel(bm, amount, segments=1):
    if amount <= 0:
        return
    bmesh.ops.bevel(bm, geom=list(bm.edges) + list(bm.verts), offset=amount, segments=segments,
                    affect='EDGES', profile=0.5, clamp_overlap=True)


def box(part, centre, size, colour, rot=I3, bevel=0.0, segments=1, smooth=False, var=0.05, freq=2.5,
        cuts=0, uv_at=None, colour_at=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if cuts:
        bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts, use_grid_fill=True)
    _bevel(bm, min(bevel, min(size) * 0.45), segments)
    _place(bm, centre, rot)
    part.add_bmesh(bm, colour_at or tinted(colour, var, freq), smooth, uv_at)


def cyl(part, p0, p1, radius, colour, sides=12, r2=None, bevel=0.0, smooth=False, caps=True, spin=0.0,
        var=0.04, colour_at=None):
    """A cylinder or frustum from p0 to p1."""
    p0, p1 = Vector(p0), Vector(p1)
    axis = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=sides, radius1=radius,
                          radius2=radius if r2 is None else r2, depth=axis.length)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot_z(math.degrees(spin)))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, axis.length / 2))
    if bevel:
        rims = [e for e in bm.edges if all(abs(abs(v.co.z - axis.length / 2) - axis.length / 2) < 1e-6 for v in e.verts)
                and abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6]
        bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=1, affect='EDGES', clamp_overlap=True)
    q = Vector((0, 0, 1)).rotation_difference(axis.normalized()) if axis.length > 0 else None
    m = Matrix.Translation(p0) @ (q.to_matrix().to_4x4() if q else Matrix.Identity(4))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)
    part.add_bmesh(bm, colour_at or tinted(colour, var), smooth)


def tube(part, points, radius, colour, sides=8, smooth=True):
    """A bent rod through a list of points, one cylinder per segment plus round joints."""
    for a, b in zip(points, points[1:]):
        cyl(part, a, b, radius, colour, sides=sides, smooth=smooth, caps=False)
    for p in points:
        sphere(part, p, (radius, radius, radius), colour, segs=sides, rings=max(3, sides // 2))


def sphere(part, centre, radii, colour, segs=12, rings=8, rot=I3, smooth=True, var=0.04, colour_at=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
    _place(bm, centre, rot)
    part.add_bmesh(bm, colour_at or tinted(colour, var), smooth)


def puff(part, centre, size, colour, rot=I3, roundness=0.55, cuts=4, sag=0.0, var=0.05, colour_at=None):
    """A soft cushion: a subdivided box pulled toward its ellipsoid. sag dips the top centre."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts, use_grid_fill=True)
    h = Vector(size) / 2
    for v in bm.verts:
        c = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        n = Vector((c.x / h.x, c.y / h.y, c.z / h.z))
        e = n.normalized() if n.length > 0 else n
        target = Vector((e.x * h.x, e.y * h.y, e.z * h.z))
        p = c.lerp(target, roundness)
        # A cushion stays full at its middle: the flat faces bulge out a little.
        p.z *= 1.0 + 0.12 * (1 - abs(n.x)) * (1 - abs(n.y))
        if sag:
            p.z -= sag * (1 - n.x * n.x) * (1 - n.y * n.y) * (1 if p.z > 0 else 0)
        v.co = p
    _place(bm, centre, rot)
    part.add_bmesh(bm, colour_at or tinted(colour, var, 3.0), True)


def sheet(part, fn, nu, nv, colour_at, thickness=0.0, smooth=True, flip=False):
    """A grid surface: fn(u, v) returns a point for u, v in 0..1. The face normal is du x dv,
    or the reverse with flip. thickness solidifies it."""
    bm = bmesh.new()
    grid = [[bm.verts.new(fn(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            quad = (grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1])
            bm.faces.new(quad[::-1] if flip else quad)
    bm.normal_update()
    if thickness:
        bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=thickness)
    part.add_bmesh(bm, colour_at, smooth)


def panel_with_holes(part, origin, u_axis, v_axis, size, holes, colour_at, step=0.25):
    """A flat wall panel on a grid, with rectangular holes. origin is the lower left corner,
    u_axis and v_axis are unit vectors, size is (width, height), holes are (u0, u1, v0, v1).
    Grid lines run through every hole edge, so the holes cut clean."""
    us = {0.0, size[0]}
    vs = {0.0, size[1]}
    for u0, u1, v0, v1 in holes:
        us |= {u0, u1}
        vs |= {v0, v1}
    def fill(values, end):
        out = sorted(values)
        dense = []
        for a, b in zip(out, out[1:]):
            n = max(1, math.ceil((b - a) / step))
            dense += [a + (b - a) * k / n for k in range(n)]
        return dense + [end]
    U, V = fill(us, size[0]), fill(vs, size[1])
    o, ua, va = Vector(origin), Vector(u_axis), Vector(v_axis)
    bm = bmesh.new()
    grid = [[bm.verts.new(o + ua * u + va * v) for v in V] for u in U]
    for i in range(len(U) - 1):
        for j in range(len(V) - 1):
            cu, cv = (U[i] + U[i + 1]) / 2, (V[j] + V[j + 1]) / 2
            if any(u0 < cu < u1 and v0 < cv < v1 for u0, u1, v0, v1 in holes):
                continue
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    part.add_bmesh(bm, colour_at, False)


def keycap(part, centre, w, d, h, colour, rot=I3):
    """A sculpted keycap: a square frustum with a dished top."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4, radius1=0.7071, radius2=0.56, depth=1.0)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot_z(45))
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2))
    _place(bm, centre, rot)
    part.add_bmesh(bm, tinted(colour, 0.03), False)

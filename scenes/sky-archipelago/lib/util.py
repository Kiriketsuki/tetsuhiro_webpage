"""Shared helpers: collections, objects, bmesh primitives and camera-space placement."""
import bpy
import bmesh
from math import cos, sin, pi, atan2, sqrt
from mathutils import Vector, Matrix

# Set by build.py before any module runs.
CFG = {}
# Shared facts between build steps, for example island centres and lake levels.
REG = {}


def S(value):
    """Scales a world-space length by the build's world scale."""
    return value * CFG.get('WORLD_SCALE', 1.0)


# ---------------------------------------------------------------- collections

def coll(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def link(obj, collection):
    collection.objects.link(obj)
    return obj


def mat(name):
    """Returns the shared material for a role. materials.py fills in the node tree."""
    return bpy.data.materials.get(name) or bpy.data.materials.new(name)


def obj_from_bm(name, bm, collection, mats, smooth=False, loc=(0, 0, 0)):
    if smooth:
        for f in bm.faces:
            f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(mat(m) if isinstance(m, str) else m)
    o = bpy.data.objects.new(name, me)
    o.location = loc
    collection.objects.link(o)
    return o


def empty(name, collection, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, None)
    o.location = loc
    collection.objects.link(o)
    return o


def add_mod(o, kind, name=None, **props):
    m = o.modifiers.new(name or kind.title(), kind)
    for k, v in props.items():
        setattr(m, k, v)
    return m


def bevel(o, width, segments=2, angle=0.6):
    return add_mod(o, 'BEVEL', 'Bevel', width=width, segments=segments, limit_method='ANGLE',
                   angle_limit=angle, harden_normals=False)


# ---------------------------------------------------------------- bmesh primitives

def _tag(geom_verts, mi):
    for f in {f for v in geom_verts for f in v.link_faces}:
        f.material_index = mi


def box(bm, center, size, mi=0, rot=0.0):
    """Adds a box. center is the bottom centre, size is (x, y, z)."""
    vs = bmesh.ops.create_cube(bm, size=1.0)['verts']
    c, s = cos(rot), sin(rot)
    for v in vs:
        x, y, z = v.co.x * size[0], v.co.y * size[1], (v.co.z + 0.5) * size[2]
        v.co = Vector((center[0] + x * c - y * s, center[1] + x * s + y * c, center[2] + z))
    _tag(vs, mi)
    return vs


def box_between(bm, a, b, thickness, mi=0, up=Vector((0, 0, 1))):
    """Adds a beam of square section from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    length = d.length
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    m = Matrix.Translation(a) @ q.to_matrix().to_4x4() @ Matrix.Translation((0, 0, length / 2))
    m = m @ Matrix.Diagonal((thickness, thickness, length, 1))
    vs = bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']
    _tag(vs, mi)
    return vs


def cylinder(bm, center, radius, height, segments=24, mi=0, radius_top=None):
    rt = radius if radius_top is None else radius_top
    m = Matrix.Translation((center[0], center[1], center[2] + height / 2))
    vs = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=rt,
                               depth=height, matrix=m)['verts']
    _tag(vs, mi)
    return vs


def cylinder_between(bm, a, b, radius, segments=10, mi=0, radius_b=None):
    a, b = Vector(a), Vector(b)
    d = b - a
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    m = Matrix.Translation(a) @ q.to_matrix().to_4x4() @ Matrix.Translation((0, 0, d.length / 2))
    vs = bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius,
                               radius2=radius if radius_b is None else radius_b, depth=d.length, matrix=m)['verts']
    _tag(vs, mi)
    return vs


def sphere(bm, center, radius, mi=0, subdiv=2, scale=(1, 1, 1)):
    m = Matrix.Translation(center) @ Matrix.Diagonal((radius * scale[0], radius * scale[1], radius * scale[2], 1))
    vs = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0, matrix=m)['verts']
    _tag(vs, mi)
    return vs


def merge_bm(dst, src_bm, matrix=None):
    """Appends src_bm into dst. Frees src_bm."""
    me = bpy.data.meshes.new('_tmp')
    if matrix is not None:
        src_bm.transform(matrix)
    src_bm.to_mesh(me)
    src_bm.free()
    dst.from_mesh(me)
    bpy.data.meshes.remove(me)


# ---------------------------------------------------------------- camera space

def cam_point(u, v, depth, cam=None):
    """World point that projects to screen (u, v) at a distance depth along the view axis.

    u runs left to right and v runs top to bottom, both from 0 to 1, as in the rubric."""
    cam = cam or bpy.data.objects[CFG['CAMERA_NAME']]
    data = cam.data
    tan_h = (data.sensor_width / 2) / data.lens
    rx, ry = CFG['RES']
    tan_v = tan_h * ry / rx
    local = Vector(((2 * u - 1) * tan_h * depth, (1 - 2 * v) * tan_v * depth, -depth))
    return cam.matrix_world @ local


def ground_point(u, v, z, cam=None):
    """World point where the view ray through screen (u, v) crosses the height z."""
    cam = cam or bpy.data.objects[CFG['CAMERA_NAME']]
    o = cam.matrix_world.translation
    d = cam_point(u, v, 1.0, cam) - o
    return o + d * ((z - o.z) / d.z)


def frame_point(origin, fwd, left, along, side, z=None):
    """A point in a local ground frame: along the forward axis, then to the left."""
    p = origin + fwd * along + left * side
    if z is not None:
        p = Vector((p.x, p.y, z))
    return p


def project(point, cam=None):
    """Screen (u, v, depth) of a world point, v from the top."""
    from bpy_extras.object_utils import world_to_camera_view
    cam = cam or bpy.data.objects[CFG['CAMERA_NAME']]
    co = world_to_camera_view(bpy.context.scene, cam, Vector(point))
    return co.x, 1 - co.y, co.z


def drop(x, y, z_from=5000.0, targets=None):
    """Casts a ray straight down onto the evaluated scene. Returns (point, normal, object) or None.

    targets limits hits to a set of object names, so props land on the right island."""
    dg = bpy.context.evaluated_depsgraph_get()
    origin = Vector((x, y, z_from))
    for _ in range(8):
        hit, loc, nor, _i, obj, _m = bpy.context.scene.ray_cast(dg, origin, Vector((0, 0, -1)))
        if not hit:
            return None
        if targets is None or obj.name in targets:
            return loc, nor, obj
        origin = loc - Vector((0, 0, 0.05))
    return None


def ground_xy(p):
    return Vector((p.x, p.y, 0))


def polar(cx, cy, r, a, z=0.0):
    return Vector((cx + cos(a) * r, cy + sin(a) * r, z))

"""Sky: the world shader with stars and the Milky Way, volumetric clouds, rain and flying craft."""
import random
from math import radians, pi, cos, sin, exp
import bpy
import bmesh
from mathutils import Vector, Matrix
from . import util
from .materials import Tree

GAP = (0.42, 0.74, 0.15, 0.2)   # Centre u, centre v and radii of the cloud gap over the ground city.


def depth_for_z(u, v, z):
    """Depth along the view axis at which screen point (u, v) reaches height z."""
    cam = bpy.data.objects[util.CFG['CAMERA_NAME']]
    p1 = util.cam_point(u, v, 1.0)
    dz = p1.z - cam.location.z
    if abs(dz) < 1e-6:
        return None
    d = (z - cam.location.z) / dz
    return d if d > 0 else None


def world():
    """A soft wash: deep blue-violet overhead, lighter and warmer toward the clouds. No stars."""
    w = bpy.data.worlds.new('Night_Sky')
    bpy.context.scene.world = w
    w.use_nodes = True
    t = Tree(w, w.node_tree)
    tc = t.n('ShaderNodeTexCoord')
    dirn = t.n('ShaderNodeVectorMath', _operation='NORMALIZE')
    t.l(tc.outputs['Generated'], dirn.inputs[0])
    d = dirn.outputs['Vector']
    sep = t.n('ShaderNodeSeparateXYZ')
    t.l(d, sep.inputs[0])
    grad = t.n('ShaderNodeValToRGB')
    cr = grad.color_ramp
    for pos, col in ((0.38, (0.12, 0.08, 0.11)), (0.5, (0.075, 0.06, 0.12)), (0.64, (0.03, 0.028, 0.08)),
                     (0.85, (0.01, 0.01, 0.035))):
        e = cr.elements.new(pos)
        e.color = (*col, 1)
    cr.elements.remove(cr.elements[0])
    cr.elements.remove(cr.elements[-1])
    t.l(t.math('ADD', t.math('MULTIPLY', sep.outputs['Z'], 0.5), 0.5), grad.inputs[0])
    # Gentle hue drift across the wash, like pigment settling unevenly.
    drift = t.n('ShaderNodeTexNoise', Scale=2.2, Detail=3.0, Roughness=0.5)
    t.l(d, drift.inputs['Vector'])
    col = t.mix(t.range(drift.outputs['Fac'], 0.35, 0.65, 0.0, 0.35), grad.outputs['Color'], (0.1, 0.08, 0.2))
    bg = t.n('ShaderNodeBackground', Strength=1.0)
    t.l(col, bg.inputs['Color'])
    out = t.n('ShaderNodeOutputWorld')
    t.l(bg.outputs[0], out.inputs['Surface'])


def _blob(name, mat_name, centre, radii, collection):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    o = util.obj_from_bm(name, bm, collection, [mat_name], loc=centre)
    o.scale = radii
    return o


def clouds():
    rnd = random.Random(util.CFG['SEED'] + 7)
    c = util.coll('Sky_Clouds')
    count = util.CFG['CLOUD_BLOB_COUNT']
    made = 0
    tries = 0
    # The cloud sea below the islands, with a gap over the ground city.
    while made < count * 0.65 and tries < 4000:
        tries += 1
        u, v = rnd.uniform(-0.15, 1.15), rnd.uniform(0.5, 1.15)
        gu, gv, ru, rv = GAP
        if ((u - gu) / ru) ** 2 + ((v - gv) / rv) ** 2 < 1.0:
            continue
        zc = util.S(rnd.uniform(-330, -210))
        d = depth_for_z(u, v, zc)
        if d is None or not (util.S(90) < d < util.S(3500)):
            continue
        p = util.cam_point(u, v, d)
        r = max(util.S(40), d * rnd.uniform(0.1, 0.17))
        _blob(f'Cloud_Sea.{made:03d}', 'Cloud', p, (r, r * rnd.uniform(0.8, 1.4), r * rnd.uniform(0.3, 0.5)), c)
        made += 1
    # Banks between the far islands, and dark clouds in the top corners.
    for k in range(int(count * 0.2)):
        u, v = rnd.uniform(-0.1, 1.1), rnd.uniform(0.3, 0.46)
        d = util.S(rnd.uniform(1200, 3200))
        p = util.cam_point(u, v, d)
        r = d * rnd.uniform(0.06, 0.1)
        _blob(f'Cloud_Bank.{k:03d}', 'Cloud', p, (r * 1.6, r, r * 0.35), c)
    for k in range(int(count * 0.15)):
        u = rnd.choice((rnd.uniform(-0.15, 0.25), rnd.uniform(0.78, 1.15)))
        v = rnd.uniform(-0.1, 0.2)
        d = util.S(rnd.uniform(900, 2200))
        p = util.cam_point(u, v, d)
        r = d * rnd.uniform(0.1, 0.16)
        _blob(f'Cloud_High.{k:03d}', 'Cloud_Dark', p, (r * 1.5, r, r * 0.45), c)


def _craft(bm, centre, heading, size):
    rot = Matrix.Rotation(heading, 4, 'Z')
    loc = Matrix.Translation(centre)

    def part(kind, offset, dims, mi):
        m = loc @ rot @ Matrix.Translation(offset) @ Matrix.Diagonal((*dims, 1))
        if kind == 'sphere':
            vs = bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0, matrix=m)['verts']
        else:
            vs = bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']
        for f in {f for v in vs for f in v.link_faces}:
            f.material_index = mi
            f.smooth = kind == 'sphere'
    s = size
    part('sphere', (0, 0, 0), (s * 0.5, s * 0.12, s * 0.1), 0)
    part('cube', (s * -0.05, 0, 0), (s * 0.18, s * 0.9, s * 0.02), 0)
    part('cube', (s * -0.42, 0, s * 0.06), (s * 0.12, s * 0.02, s * 0.12), 0)
    part('sphere', (s * 0.02, s * 0.45, 0), (s * 0.03, s * 0.03, s * 0.03), 1)
    part('sphere', (s * 0.02, -s * 0.45, 0), (s * 0.03, s * 0.03, s * 0.03), 2)
    part('sphere', (s * -0.5, 0, s * 0.02), (s * 0.04, s * 0.04, s * 0.03), 3)


def flying_craft():
    c = util.coll('Flying_Craft')
    spots = [(0.17, 0.135, 260), (0.40, 0.19, 520), (0.33, 0.465, 200), (0.885, 0.285, 330),
             (0.45, 0.075, 760), (0.80, 0.11, 420)]
    lights = util.coll('Craft_Lights', c)
    for k, (u, v, d) in enumerate(spots[:util.CFG['FLYING_CRAFT_COUNT']]):
        p = util.cam_point(u, v, util.S(d))
        bm = bmesh.new()
        size = util.S(14.0)
        _craft(bm, (0, 0, 0), radians(10 + 37 * k), size)
        o = util.obj_from_bm(f'Flying_Craft.{k:02d}', bm, c,
                             ['Craft_Body', 'Craft_Light_Red', 'Craft_Light_White', 'Craft_Light_Red'], loc=p)
        lamp = bpy.data.lights.new(f'Craft_Lamp.{k:02d}', 'POINT')
        lamp.energy = 2.0e5 * util.S(1) ** 2
        lamp.color = (1.0, 0.25, 0.2)
        lamp.shadow_soft_size = 1.0
        lo = bpy.data.objects.new(f'Craft_Lamp.{k:02d}', lamp)
        lo.location = p
        lights.objects.link(lo)

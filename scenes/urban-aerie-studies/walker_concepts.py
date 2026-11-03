"""Walker concept for the explore mode cat-fox: the oat kit with rust patches.

The shape leans fox: large ears, a short fox snout and a brush tail. The face is soft
and simple, after the mood of mofusand: small wide-set bead eyes, a tiny nose, a small
mouth, chubby cheeks and a blush. It copies no character.

Run inside Blender, from the text editor or with:
    bpy.utils.execfile(r"<repo>/scenes/urban-aerie-studies/walker_concepts.py")
The script imports walker_kit_geometry.py from its own folder.

The script builds a new scene, WalkerConcepts, and leaves every other scene alone. It
does not save. Save the result as a new file, never over an existing .blend.

Parts: body, neck, head (muzzle, nose, mouth, eyes, blush, ears), four legs of three
parts each (upper, lower, paw). The body and the tail are one mesh. The legs, neck and
head are rigid parts.
Each rigid part has rounded ends that sit inside its neighbour, so a bent joint shows
no gap and no hard step.

The tail part of the body mesh bends smoothly over each of its three joints. The site can
do the same in the vertex shader: each tail vertex stores its distance along the tail,
and the shader bends it by the joint angles. That is not a skinned mesh.

Colour comes from plane cuts and ring bands, so each colour is one coherent field: the
cream chest and jaw, the rust saddle, the rust eye patch, the socks, the ear tips and
the tail band. No face takes a colour of its own.

Model space: +X is forward, +Z is up, +Y is the walker's left. The origin is on the
ground under the body. A positive Y rotation swings a leg back, lifts the tail and
pitches the head down. A positive Z rotation turns the head left and the tail right.
"""
import importlib
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import walker_kit_geometry as geo  # noqa: E402

importlib.reload(geo)
from walker_kit_geometry import (  # noqa: E402
    capsule_rings, cut, ellipsoid, facing, paint, place_on, side_of, tube)

SCENE_NAME = 'WalkerConcepts'


def srgb(hex_value):
    """Returns a linear RGBA tuple for an sRGB hex colour."""
    rgb = [((hex_value >> s) & 0xFF) / 255 for s in (16, 8, 0)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return (*lin, 1.0)


# Aerie colours, read from src/scene/aerie/autumn.js and the r34 blend materials.
LAWN = 0x947C34
NIGHT = 0x2C3A50
INK = 0x161B25
LAMP = 0xFFBF75
MOON = 0xB9C8E0

KIT = {
    'colours': {
        'oat': 0xD9C59C,      # the main coat
        'cream': 0xF1E8D4,    # chest, belly, jaw, muzzle, tail tip
        'rust': 0xA8461C,     # points and patches, the crown base colour family
        'umber': 0x5A2C1A,    # the tip of the rust ear, used once
        'rose': 0xC07A66,     # nose and inner ears
        'blush': 0xE59C8A,
        'pupil': 0x17151B,    # eyes and mouth
        'glint': 0xFFF6E6,
    },
    'body': (0.40, 0.17, 0.17), 'body_z': 0.22,
    'neck': (0.08, 48),
    'head': (0.18, 0.18, 0.15),
    'muzzle': (0.068, 0.062, 0.046),
    'ear': (0.15, 0.058), 'ear_spread': 0.05, 'ear_tilt': 15,
    'leg_r': 0.024,
    'tail_length': 0.43, 'tail_peak': 0.064, 'tail_root': 0.03,
    'tail_joints': (0.03, 0.14, 0.28),
    'tail_band': (0.50, 0.84),
}

# Rest angles in degrees, (x, y, z). Poses add to these. The tail keys are joint
# angles for the tail tube, not objects.
REST = {
    'leg_BL_u': (0, -22, 0), 'leg_BR_u': (0, -22, 0),
    'leg_BL_l': (0, 42, 0), 'leg_BR_l': (0, 42, 0),
    'tail_1': (0, 50, 0), 'tail_2': (0, 15, 0), 'tail_3': (0, -35, 0),
    'ear_L': (-16, -6, 0), 'ear_R': (16, -6, 0),
}

POSES = {
    'stand': {},
    'walk': {
        'leg_FL_u': (0, -26, 0), 'leg_FL_l': (0, 6, 0),
        'leg_FR_u': (0, 18, 0), 'leg_FR_l': (0, 48, 0),
        'leg_BL_u': (0, 22, 0), 'leg_BL_l': (0, -8, 0),
        'leg_BR_u': (0, -18, 0), 'leg_BR_l': (0, 24, 0),
        'neck': (0, 6, 0), 'head': (0, -4, 0),
        'tail_1': (0, -15, 0), 'tail_3': (0, 10, 0),
    },
    'run': {
        '_air': 0.06,
        'body': (0, 4, 0),
        'leg_FL_u': (0, -70, 0), 'leg_FL_l': (0, -10, 0),
        'leg_FR_u': (0, -55, 0), 'leg_FR_l': (0, 5, 0),
        'leg_BL_u': (0, 75, 0), 'leg_BL_l': (0, 30, 0),
        'leg_BR_u': (0, 60, 0), 'leg_BR_l': (0, 25, 0),
        'neck': (0, 30, 0), 'head': (0, -20, 0),
        'ear_L': (0, -40, 0), 'ear_R': (0, -40, 0),
        'tail_1': (0, -50, 0), 'tail_2': (0, -10, 0), 'tail_3': (0, 30, 0),
    },
    'sit': {
        'body': (0, -40, 0),
        'leg_FL_u': (0, 40, 0), 'leg_FR_u': (0, 40, 0),
        'leg_BL_u': (0, -20, 0), 'leg_BR_u': (0, -20, 0),
        'leg_BL_l': (0, 130, 0), 'leg_BR_l': (0, 130, 0),
        'neck': (0, 20, 0), 'head': (0, 22, 0),
        'tail_1': (0, -12, 50), 'tail_2': (0, -15, 60), 'tail_3': (0, 35, 55),
    },
    'sleep': {
        '_eyes_closed': True,
        'body': (0, 4, 0),
        'leg_FL_u': (0, -70, 0), 'leg_FL_l': (0, 120, 0),
        'leg_FR_u': (0, -70, 0), 'leg_FR_l': (0, 120, 0),
        'leg_BL_u': (0, -55, 0), 'leg_BL_l': (0, 115, 0),
        'leg_BR_u': (0, -55, 0), 'leg_BR_l': (0, 115, 0),
        'neck': (0, 45, -110), 'head': (0, 20, -30),
        'ear_L': (0, -20, 0), 'ear_R': (0, -20, 0),
        'tail_1': (0, -70, 50), 'tail_2': (0, 15, 80), 'tail_3': (0, 20, 80),
    },
}

GROUND_PARTS = ('body', 'paw_FL', 'paw_FR', 'paw_BL', 'paw_BR',
                'leg_FL_l', 'leg_FR_l', 'leg_BL_l', 'leg_BR_l')


# Materials ---------------------------------------------------------------------------

def toon_material(name, hex_value):
    """Two-band toon shade with a moon rim, close to the site toon material."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    diff = nt.nodes.new('ShaderNodeBsdfDiffuse')
    to_rgb = nt.nodes.new('ShaderNodeShaderToRGB')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.50, 0.50, 0.58, 1)
    ramp.color_ramp.elements[1].position = 0.18
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    base = nt.nodes.new('ShaderNodeRGB')
    base.outputs[0].default_value = srgb(hex_value)
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    fres = nt.nodes.new('ShaderNodeLayerWeight')
    fres.inputs['Blend'].default_value = 0.35
    rim_ramp = nt.nodes.new('ShaderNodeValToRGB')
    rim_ramp.color_ramp.interpolation = 'CONSTANT'
    rim_ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
    rim_ramp.color_ramp.elements[1].position = 0.62
    rim_ramp.color_ramp.elements[1].color = (*srgb(MOON)[:3], 1)
    add = nt.nodes.new('ShaderNodeMix')
    add.data_type = 'RGBA'
    add.blend_type = 'ADD'
    add.inputs['Factor'].default_value = 0.22
    emit = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(diff.outputs[0], to_rgb.inputs[0])
    nt.links.new(to_rgb.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], mul.inputs['A'])
    nt.links.new(base.outputs[0], mul.inputs['B'])
    nt.links.new(mul.outputs['Result'], add.inputs['A'])
    nt.links.new(fres.outputs['Facing'], rim_ramp.inputs['Fac'])
    nt.links.new(rim_ramp.outputs['Color'], add.inputs['B'])
    nt.links.new(add.outputs['Result'], emit.inputs['Color'])
    nt.links.new(emit.outputs[0], out.inputs['Surface'])
    mat.diffuse_color = srgb(hex_value)
    return mat


def flat_material(name, hex_value, cull=False):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emit = nt.nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = srgb(hex_value)
    nt.links.new(emit.outputs[0], out.inputs['Surface'])
    mat.use_backface_culling = cull
    mat.diffuse_color = srgb(hex_value)
    return mat


def ink_material(name):
    """Ink for an outward shell: back faces draw ink, front faces draw nothing.

    The shell sits just outside the walker, so only its far side shows, and only past
    the silhouette.
    """
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    emit = nt.nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = srgb(INK)
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(geo.outputs['Backfacing'], mix.inputs['Fac'])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(emit.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
    mat.surface_render_method = 'DITHERED'
    mat.use_backface_culling = False
    mat.diffuse_color = srgb(INK)
    return mat


def kit_materials(cfg):
    flat = ('pupil', 'glint', 'blush')
    mats = {k: toon_material(f'WC_Kit_{k}', v) for k, v in cfg['colours'].items()
            if k not in flat}
    for k in flat:
        mats[k] = flat_material(f'WC_Kit_{k}', cfg['colours'][k])
    mats['ink'] = ink_material('WC_Ink_Shell')
    return mats


class Builder:
    """Creates part objects for one walker instance under one root empty."""

    def __init__(self, tag, coll, mats):
        self.tag = tag
        self.coll = coll
        self.mats = mats
        self.parts = {}
        self.inked = []
        self.root =bpy.data.objects.new(f'Kit_{tag}', None)
        self.root.empty_display_size = 0.1
        coll.objects.link(self.root)

    def part(self, key, bm, slots, parent, location, ink=True):
        me = bpy.data.meshes.new(f'Kit_{self.tag}_{key}')
        bm.to_mesh(me)
        bm.free()
        for s in slots:
            me.materials.append(self.mats[s])
        ob = bpy.data.objects.new(me.name, me)
        self.coll.objects.link(ob)
        ob.parent = parent if parent is not None else self.root
        ob.location = location
        if ink:
            self.inked.append(ob)
        self.parts[key] = ob
        return ob

    def build_ink(self):
        """Draws one outline round the whole posed walker.

        An outline per part draws a dark ring wherever one part enters another. One
        shell, remeshed from the union of the posed parts, outlines only the silhouette,
        so the joints read as one body.
        """
        old = self.parts.pop('_ink', None)
        if old is not None:
            bpy.data.objects.remove(old, do_unlink=True)
        bpy.context.view_layer.update()
        bm = bmesh.new()
        for ob in self.inked:
            part = bmesh.new()
            part.from_mesh(ob.data)
            part.transform(ob.matrix_world)
            me = bpy.data.meshes.new('tmp')
            part.to_mesh(me)
            part.free()
            bm.from_mesh(me)
            bpy.data.meshes.remove(me)
        me = bpy.data.meshes.new(f'Kit_{self.tag}_ink')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(self.mats['ink'])
        ob = bpy.data.objects.new(me.name, me)
        self.coll.objects.link(ob)
        remesh = ob.modifiers.new('Union', 'REMESH')
        remesh.mode = 'VOXEL'
        remesh.voxel_size = 0.003
        grow = ob.modifiers.new('Grow', 'DISPLACE')
        grow.direction = 'NORMAL'
        grow.mid_level = 0.0
        grow.strength = 0.0045
        self.parts['_ink'] = ob
        return ob


# The kit -----------------------------------------------------------------------------

def build_body(b, cfg, joints=None):
    """The body and tail are one mesh, so the rump runs into the tail with no seam."""
    if joints is None:
        joints = [REST[f'tail_{i}'][1:] for i in (1, 2, 3)]
    bm, _ = geo.body_tail_mesh(cfg, joints)
    return b.part('body', bm, ('oat', 'cream', 'rust'), None, (0, 0, cfg['body_z']))


def build_neck(b, cfg, body):
    blen, bw, bh = cfg['body']
    nl, tilt = cfg['neck']
    hy = cfg['head'][1]
    bm = bmesh.new()
    # The neck is wide at the chest and as wide as the jaw at the top, with long domes,
    # so it fills the gap between body and head at any pitch.
    tube(bm, capsule_rings(nl, bw * 0.46, hy * 0.42, mid=2, dome=2), 10)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                     matrix=Matrix.Rotation(math.radians(tilt + 180), 3, 'Y'))
    paint(bm, lambda c: 1 if c.x > 0.010 and c.z < nl * 0.5 else 0)
    neck = b.part('neck', bm, ('oat', 'cream'), body, (blen * 0.34, 0, bh * 0.12))
    end = (nl * math.sin(math.radians(tilt)), 0, nl * math.cos(math.radians(tilt)))
    return neck, end


def head_shape(cfg, hc):
    """Returns the head bmesh: a round skull, chubby low cheeks and a soft wedge."""
    hx, hy, hz = cfg['head']
    bm = bmesh.new()
    ellipsoid(bm, (hx / 2, hy / 2, hz / 2), 12, 9, at=hc)
    for v in bm.verts:
        local = v.co - hc
        t = local.x / (hx / 2)
        if t > 0:
            v.co.y = hc.y + local.y * (1 - 0.14 * t)
        if local.z > hz * 0.30:
            v.co.z = hc.z + hz * 0.30 + (local.z - hz * 0.30) * 0.6
        low = max(0.0, -local.z / (hz / 2))
        side = max(0.0, 1 - abs(local.x / (hx / 2)))
        v.co.y = hc.y + (v.co.y - hc.y) * (1 + 0.16 * low * side)
        if local.x < -hx * 0.05 and local.z < 0 and abs(local.y) > hy * 0.30:
            v.co.y *= 1.08
            v.co.x -= 0.010
    jaw = (hc + Vector((hx * 0.05, 0, -hz * 0.06)), (-0.8, 0, 1))
    patch_side = (hc + Vector((0, hy * 0.08, 0)), (0, 1, 0.25))
    patch_low = (hc + Vector((0, 0, hz * 0.02)), (0.25, 0, 1))
    patch_back = (hc + Vector((-hx * 0.18, 0, 0)), (1, 0, 0))
    for plane in (jaw, patch_side, patch_low, patch_back):
        cut(bm, *plane)

    def rule(c):
        if side_of(c, *jaw) < 0:
            return 1
        if (side_of(c, *patch_side) > 0 and side_of(c, *patch_low) > 0
                and side_of(c, *patch_back) > 0):
            return 2
        return 0
    paint(bm, rule)
    return bm


def build_face(b, cfg, head, tree, hc):
    """Muzzle, nose, mouth, eyes and blush, each set on the head surface by ray casts."""
    hx, hy, hz = cfg['head']
    far = hx * 2

    # Muzzle: a short soft wedge, oat on the bridge and cream below.
    mx, my, mz = cfg['muzzle']
    bm = bmesh.new()
    ellipsoid(bm, (mx / 2, my / 2, mz / 2), 8, 6)
    for v in bm.verts:
        t = max(0.0, v.co.x / (mx / 2))
        v.co.y *= 1 - 0.30 * t
        v.co.z *= 1 - 0.15 * t
    cut(bm, (0, 0, mz * 0.12), (0, 0, 1))
    paint(bm, lambda c: 0 if c.z > mz * 0.12 else 1)
    hit = place_on(tree, hc + Vector((far, 0, -hz * 0.16)), (-1, 0, 0))
    m_at = hit[0] + Vector((mx * 0.18, 0, 0))
    b.part('muzzle', bm, ('oat', 'cream'), head, m_at)
    tip = m_at + Vector((mx * 0.47, 0, mz * 0.16))

    bm = bmesh.new()
    ellipsoid(bm, (0.007, 0.011, 0.0075), 6, 4)
    for v in bm.verts:
        if v.co.z < 0:
            v.co.y *= 0.55
    b.part('nose', bm, ('rose',), head, tip, ink=False)

    # Mouth: a small three-arc line under the nose, drawn as a thin tube.
    bm = bmesh.new()
    pts = [(0.0, 0.013, 0.000), (0.0, 0.0085, -0.0055), (0.0, 0.003, -0.004),
           (0.0, 0.0, -0.001), (0.0, -0.003, -0.004), (0.0, -0.0085, -0.0055),
           (0.0, -0.013, 0.000)]
    pts = [Vector(p) for p in pts]
    for a, c in zip(pts, pts[1:]):
        d = (c - a).normalized()
        u = Vector((1, 0, 0))
        v = d.cross(u).normalized()
        tube(bm, [(a, u, v, 0.0013), (c, u, v, 0.0013)], 3)
    b.part('mouth', bm, ('pupil',), head, tip + Vector((-0.002, 0, -0.012)), ink=False)

    # Eyes: small bead eyes, wide-set and a little low, each with one glint.
    for side, name in ((1, 'L'), (-1, 'R')):
        hit = place_on(tree, hc + Vector((far, side * hy * 0.26, hz * 0.02)), (-1, 0, 0))
        bm = bmesh.new()
        ellipsoid(bm, (0.006, 0.0115, 0.0135), 6, 5)
        eye = b.part(f'eye_{name}', bm, ('pupil',), head, hit[0] - hit[1] * 0.001, ink=False)
        eye.rotation_euler = facing(hit[1])
        bm = bmesh.new()
        ellipsoid(bm, (0.002, 0.0034, 0.0034), 4, 3)
        b.part(f'glint_{name}', bm, ('glint',), eye, (0.0055, side * 0.0035, 0.0055),
               ink=False)
        # Blush: a thin oval set on the cheek under and outside the eye.
        hit = place_on(tree, hc + Vector((far, side * hy * 0.34, -hz * 0.13)), (-1, 0, 0))
        bm = bmesh.new()
        ellipsoid(bm, (0.0015, 0.015, 0.009), 6, 3)
        blush = b.part(f'blush_{name}', bm, ('blush',), head, hit[0], ink=False)
        blush.rotation_euler = facing(hit[1])


def build_ears(b, cfg, head, tree, hc):
    """Large fox ears with a rose inner face.

    The left ear sits in the eye patch, so it is rust with an umber tip. The right
    ear is oat with a rust tip.
    """
    hx, hy, hz = cfg['head']
    eh, er = cfg['ear']
    for side, name in ((1, 'L'), (-1, 'R')):
        # The ear root sits on the skull surface, found by a ray cast from above.
        top = hc + Vector((-hx * 0.04, side * cfg['ear_spread'], hz))
        hit = place_on(tree, top, (0, 0, -1))
        root = hit[0] - hit[1] * 0.010 if hit else top - Vector((0, 0, hz * 0.7))
        slots = ('rust', 'umber') if side > 0 else ('oat', 'rust')
        ear = b.part(f'ear_{name}', geo.ear_mesh(eh, er), slots, head, root)
        bm = bmesh.new()
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=5, radius1=er * 0.62,
                                    radius2=0.0, depth=eh * 0.74)
        bmesh.ops.translate(bm, vec=(0, 0, eh * 0.37), verts=res['verts'])
        bmesh.ops.scale(bm, vec=(0.16, 1.0, 1.0), verts=bm.verts)
        b.part(f'inner_{name}', bm, ('rose',), ear, (er * 0.34, 0, eh * 0.06), ink=False)


def build_head(b, cfg, neck, neck_end):
    hx, hy, hz = cfg['head']
    hc = Vector((hx * 0.12, 0, hz * 0.12))
    bm = head_shape(cfg, hc)
    tree = BVHTree.FromBMesh(bm)
    head = b.part('head', bm, ('oat', 'cream', 'rust'), neck, neck_end)
    build_face(b, cfg, head, tree, hc)
    build_ears(b, cfg, head, tree, hc)
    return head


def build_legs(b, cfg, body):
    blen, bw, bh = cfg['body']
    lr = cfg['leg_r']
    bz = cfg['body_z']
    ph = lr * 0.75
    a1, a2 = math.radians(22), math.radians(20)
    for end, fx, fz, sy, sock in (('F', blen * 0.28, -bh * 0.12, bw * 0.26, 0.40),
                                   ('B', -blen * 0.28, -bh * 0.08, bw * 0.28, 0.70)):
        height = bz + fz - ph
        u = height * 0.5
        lo = height - u if end == 'F' else (height - u * math.cos(a1)) / math.cos(a2)
        # A wide thigh top sits inside the shoulder or haunch mass of the body.
        thigh = 1.7 if end == 'F' else 2.3
        for side, name in ((1, 'L'), (-1, 'R')):
            key = f'{end}{name}'
            bm = bmesh.new()
            tube(bm, capsule_rings(u, lr * thigh, lr * 1.0, mid=2, dome=1), 8)
            upper = b.part(f'leg_{key}_u', bm, ('oat',), body, (fx, side * sy, fz))
            sock_z = -lo * (1 - sock)
            rings = capsule_rings(lo, lr * 1.0, lr * 0.82, mid=2, dome=1)
            rings.append((Vector((0, 0, sock_z)), Vector((1, 0, 0)), Vector((0, 1, 0)),
                          lr * (1.0 + (0.82 - 1.0) * (1 - sock))))
            rings.sort(key=lambda r: -r[0].z)
            bm = bmesh.new()
            tube(bm, rings, 8, band_slot=lambda i, rs=rings, s=sock_z:
                 1 if (rs[i][0].z + rs[i + 1][0].z) / 2 < s else 0)
            lower = b.part(f'leg_{key}_l', bm, ('oat', 'rust'), upper, (0, 0, -u))
            bm = bmesh.new()
            ellipsoid(bm, (lr * 1.30, lr * 1.05, ph), 8, 4, at=(lr * 0.35, 0, -ph * 0.4))
            for v in bm.verts:
                if v.co.z < -ph * 0.4:
                    v.co.z = -ph * 0.4 + (v.co.z + ph * 0.4) * 0.6
            b.part(f'paw_{key}', bm, ('rust',), lower, (0, 0, -lo))


def build_kit(tag, coll, mats, cfg=KIT):
    b = Builder(tag, coll, mats)
    body = build_body(b, cfg)
    neck, neck_end = build_neck(b, cfg, body)
    build_head(b, cfg, neck, neck_end)
    build_legs(b, cfg, body)
    b.cfg = cfg
    return b


# Poses -------------------------------------------------------------------------------

def apply_pose(b, pose_name):
    pose = POSES[pose_name]
    for key, ob in b.parts.items():
        rest = REST.get(key, (0, 0, 0))
        delta = pose.get(key, (0, 0, 0))
        ob.rotation_euler = [math.radians(r + d) for r, d in zip(rest, delta)] \
            if key in REST or key in pose else ob.rotation_euler
    # The tail bends with the body mesh, from the summed tail joint angles.
    joints = []
    for i in (1, 2, 3):
        rest = REST[f'tail_{i}']
        delta = pose.get(f'tail_{i}', (0, 0, 0))
        joints.append((rest[1] + delta[1], rest[2] + delta[2]))
    body = b.parts['body']
    bm, _ = geo.body_tail_mesh(b.cfg, joints)
    bm.to_mesh(body.data)
    bm.free()
    # Each paw stays flat on the ground: it cancels the pitch of its leg chain.
    body_pitch = b.parts['body'].rotation_euler.y
    for leg in ('FL', 'FR', 'BL', 'BR'):
        chain = (body_pitch + b.parts[f'leg_{leg}_u'].rotation_euler.y
                 + b.parts[f'leg_{leg}_l'].rotation_euler.y)
        b.parts[f'paw_{leg}'].rotation_euler.y = -chain
    if pose.get('_eyes_closed'):
        for name in ('L', 'R'):
            b.parts[f'eye_{name}'].scale = (1, 1.15, 0.14)
            b.parts[f'glint_{name}'].hide_render = True
    bpy.context.view_layer.update()
    low = min((ob.matrix_world @ ob.data.vertices[i].co).z
              for key in GROUND_PARTS for ob in [b.parts[key]] for i in ground_verts(ob))
    b.root.location.z -= low - pose.get('_air', 0.0)
    b.build_ink()


def ground_verts(ob):
    """Vertex indices that may touch the ground. The tail lies on it, so it is left out."""
    region = ob.data.attributes.get('region')
    if region is None:
        return range(len(ob.data.vertices))
    return {i for p in ob.data.polygons if region.data[p.index].value == 0
            for i in p.vertices}


def triangle_count(b):
    """Counts the walker triangles. The render-only ink shell is not part of the model."""
    return sum(len(p.vertices) - 2 for key, ob in b.parts.items() if key != '_ink'
               for p in ob.data.polygons)


# Scene -------------------------------------------------------------------------------

def make_scene():
    old = bpy.data.scenes.get(SCENE_NAME)
    if old is not None:
        for ob in list(old.collection.all_objects):
            bpy.data.objects.remove(ob, do_unlink=True)
        for coll in list(old.collection.children_recursive):
            bpy.data.collections.remove(coll)
        bpy.data.scenes.remove(old)
    scn = bpy.data.scenes.new(SCENE_NAME)
    bpy.context.window.scene = scn
    for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scn.render.engine = engine
            break
        except TypeError:
            continue
    scn.view_settings.view_transform = 'Standard'
    scn.view_settings.look = 'None'
    world = bpy.data.worlds.get('WalkerNight') or bpy.data.worlds.new('WalkerNight')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = srgb(NIGHT)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    scn.world = world
    return scn


def add_light(scn, name, hex_value, energy, rotation):
    data = bpy.data.lights.new(name, 'SUN')
    data.color = srgb(hex_value)[:3]
    data.energy = energy
    ob = bpy.data.objects.new(name, data)
    scn.collection.objects.link(ob)
    ob.rotation_euler = [math.radians(a) for a in rotation]
    return ob


def add_label(coll, text, location, size, hex_value):
    curve = bpy.data.curves.new(f'Label_{text[:10]}', 'FONT')
    curve.body = text
    curve.size = size
    curve.align_x = 'CENTER'
    ob = bpy.data.objects.new(curve.name, curve)
    ob.data.materials.append(flat_material('WC_Label', hex_value))
    coll.objects.link(ob)
    ob.location = location
    ob.rotation_euler = (math.radians(90), 0, 0)
    return ob


def add_ground(coll, scale, location):
    me = bpy.data.meshes.new('WC_Ground')
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=(*scale, 1), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(flat_material('WC_Lawn_Flat', LAWN))
    ob = bpy.data.objects.new('WC_Ground', me)
    coll.objects.link(ob)
    ob.location = location
    return ob


SHEETS = (
    ('turnaround', 'Oat kit: front three-quarter, side, back three-quarter, front',
     [('stand', -45), ('stand', 0), ('stand', 135), ('stand', -90)]),
    ('poses', 'Oat kit: walk, run, sit, sleep',
     [('walk', -30), ('run', -20), ('sit', -40), ('sleep', 20)]),
)


def build():
    scn = make_scene()
    mats = kit_materials(KIT)
    report = {}
    for row, (sheet, label, items) in enumerate(SHEETS):
        coll = bpy.data.collections.new(f'Sheet_{sheet}')
        scn.collection.children.link(coll)
        y = row * 3.0
        for i, (pose, yaw) in enumerate(items):
            b = build_kit(f'{sheet}_{i}_{pose}', coll, mats)
            b.root.location = (i * 1.0, y, 0)
            b.root.rotation_euler = (0, 0, math.radians(yaw))
            apply_pose(b, pose)
            report.setdefault('triangles', triangle_count(b))
        add_ground(coll, (4.6, 1.4), (1.5, y + 0.25, 0))
        add_label(coll, label, (1.5, y - 0.9, -0.22), 0.07, 0xE8DDC6)
    add_light(scn, 'WC_Moon', MOON, 1.6, (55, 0, 160))
    add_light(scn, 'WC_Lamp', LAMP, 2.4, (50, 0, -35))
    return report


result = build()

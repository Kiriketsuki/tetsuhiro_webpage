"""Renders the fireside gate: the campfire corner of the aerie at night, with Kinako.

The gate (index.html, #gate-art) is a stack of 2D layers that reads as 3D. This script makes
every layer from the real aerie (src/assets/models/aerie.glb), the campfire kit
(campfire_kit.glb) and the Kinako kit (scenes/urban-aerie-studies/walker_concepts.py, at the
HIGH resolution of export_walker.py). One toon pass lights them all. It follows
src/scene/aerie/toon-material.js: a half-lambert wrap from the moon, a hemisphere fill, the
warm campfire spill and a cool rim on the shade side. The pack step grades each layer as
src/scene/aerie/grade-pass.js does.

Two steps, from the repository root:

    blender.exe --factory-startup -b --python scripts/gate-fireside.py -- render
    python scripts/gate-fireside.py pack

render opens no .blend and saves none. It writes linear RGBA frames (.npy) and a layout report
to the work folder (the system temp folder, gate-fireside). pack grades, crops and encodes them
to public/gate/fireside/*.webp, and writes the generated CSS block between the fireside markers
in index.html: the layer boxes, the lap ellipse, the dawn keyframes and the first paint images.
Run both again whenever walker.glb, the kit or the aerie changes. Pack needs numpy and Pillow.

The master frame is square, so one picture covers a desktop and a phone: a desktop shows a band
across it, and a phone shows a column round the fire.
"""
import json
import math
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(tempfile.gettempdir()) / 'gate-fireside'
OUT = ROOT / 'public' / 'gate' / 'fireside'

# The camera: its heading round the fire in degrees, its pitch, its distance to the fire in
# metres, the lens in millimetres on a 36 mm sensor, and the lens shift that sets the fire low
# in the square, with the night above it for the title.
CAMERA = {'yaw': 280.0, 'pitch': 22.0, 'dist': 5.6, 'lens': 36.0, 'shift_y': 0.07}
# The master frame, in pixels. Every layer renders at this size and pack scales it down, so the
# edges come out smooth.
MASTER = int(os.environ.get('GATE_MASTER', 3200))
# The encoded sizes: desktop and phone.
SIZES = {'d': 1600, 'p': 960}
# Kinako's lap: a circle of this radius round the fire, in metres.
LAP_R = 1.05
# Where Kinako naps on the lap, and where it sits, in degrees on the screen ellipse: 0 is the
# right end, 90 the near end, 180 the left end.
NAP_AT = 132.0
SIT_AT = 90.0
# The warm spill reach of the fire, in metres (campfire.js BOUNCE_RADIUS 2.4, a little wider,
# because the fire is the only warm light in the gate).
FIRE_RADIUS = 3.0
# The warmth of the fire in the base picture (embers) and in the glow layer (full blaze).
WARM = {'embers': 0.3, 'blaze': 1.0}
# The fire stages: the flame scale of each. Stage 0 is the embers.
STAGES = (0.32, 0.55, 0.8, 1.0)
FLICKER = 4
# The run cycle frames and the Kinako crop box, in metres at Kinako's depth: width and height,
# and the paw point inside it as shares of the box.
RUN_FRAMES = 8
K_BOX = (1.1, 0.8)
K_FEET = (0.5, 0.86)


# Shared --------------------------------------------------------------------------------

def linear(hex_value, scale=1.0):
    """An sRGB hex colour in linear light, as THREE.Color(hex) gives it, times scale."""
    out = []
    for shift in (16, 8, 0):
        c = ((hex_value >> shift) & 255) / 255
        c = c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
        out.append(c * scale)
    return out


# The night rig of toon-material.js (NIGHT and createToonUniforms).
RIG = {
    'moon': linear(0xE8E4E4, 0.33),
    'sky': linear(0xA3ACC4, 0.29),
    'ground': linear(0x7A7774, 0.31),
    'warm': linear(0xFFC088, 1.5),
    'rim': linear(0x9FB4DC, 0.08),
}
# The autumn.js family tones: the olive-gold lawn and an amber crown. The planting takes the
# lawn tone, so the tufts read as soft relief in the lawn and do not clutter the ground.
TONES = {'web_grass': 0x947C34, 'web_crown': 0xD97E1E, 'web_plants': 0x947C34}
# The albedo factor of the lawn family (toon-material.js, toonAlbedo *= 0.56, a little lower
# here, because the leaf carpet of the site darkens the lawn between the leaves).
LAWN_GAIN = 0.34
LAWN = ('web_grass', 'web_plants', 'web_soil')
# The leaf carpet tones of toon-material.js (CARPET_TONES), gold to rust.
CARPET = (0xF0B020, 0xE8860E, 0xD6540C, 0xB02C0A)


# Render (inside Blender) -----------------------------------------------------------------

def render_main():
    import bmesh
    import bpy
    import numpy as np
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils import Vector

    sys.path.insert(0, str(ROOT / 'scenes' / 'urban-aerie-studies'))
    import walker_concepts as wc

    # The finer walker resolution of export_walker.py (HIGH). That module runs its export on
    # import, so the values are copied here.
    high = {
        'body_sides': 20, 'body_split': 2, 'tail_rings': 24,
        'neck': (16, 4, 3), 'head': (20, 14), 'muzzle': (14, 9),
        'ear_sides': 12, 'ear_split': 2, 'leg_sides': 14, 'leg_mid': 4, 'leg_dome': 2, 'paw': (14, 7),
    }
    poses = gate_poses()
    wc.POSES.update(poses)

    class Nodes:
        """A small builder for shader node chains."""

        def __init__(self, nt):
            self.nt = nt

        def node(self, kind, **props):
            n = self.nt.nodes.new(kind)
            for k, v in props.items():
                setattr(n, k, v)
            return n

        def put(self, socket, value):
            if isinstance(value, (int, float)):
                socket.default_value = value
            elif isinstance(value, (tuple, list, Vector)):
                socket.default_value = tuple(value) if len(socket.default_value) == len(value) else (*value, 1)
            else:
                self.nt.links.new(value, socket)

        def math(self, op, a, b=None, c=None):
            n = self.node('ShaderNodeMath', operation=op)
            for i, v in enumerate((a, b, c)):
                if v is not None:
                    self.put(n.inputs[i], v)
            return n.outputs[0]

        def vec(self, op, a, b=None, scale=None):
            n = self.node('ShaderNodeVectorMath', operation=op)
            for i, v in enumerate((a, b)):
                if v is not None:
                    self.put(n.inputs[i], v)
            if scale is not None:
                self.put(n.inputs['Scale'], scale)
            return n.outputs['Value' if op in ('DOT_PRODUCT', 'LENGTH', 'DISTANCE') else 'Vector']

        def rgb(self, colour):
            n = self.node('ShaderNodeRGB')
            n.outputs[0].default_value = (*colour, 1)
            return n.outputs[0]

        def mix(self, fac, a, b):
            n = self.node('ShaderNodeMix', data_type='RGBA')
            self.put(n.inputs[0], fac)
            self.put(n.inputs[6], a)
            self.put(n.inputs[7], b)
            return n.outputs[2]

        def smooth(self, value, lo, hi):
            n = self.node('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP')
            n.inputs['From Min'].default_value = lo
            n.inputs['From Max'].default_value = hi
            self.put(n.inputs['Value'], value)
            return n.outputs['Result']

    def toon(name, albedo, gain, moon, fire, mottle=False):
        """One toon pass. albedo is an RGB tuple, ('attr',) for the baked colour, or
        ('tone', rgb, mean) for an autumn.js family tone that keeps the baked brightness."""
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        n = Nodes(nt)
        geo = n.node('ShaderNodeNewGeometry')
        N, P, V = geo.outputs['Normal'], geo.outputs['Position'], geo.outputs['Incoming']
        if albedo[0] == 'attr':
            base = n.node('ShaderNodeVertexColor', layer_name='Color').outputs['Color']
        elif albedo[0] == 'tone':
            baked = n.node('ShaderNodeVertexColor', layer_name='Color').outputs['Color']
            luma = n.vec('DOT_PRODUCT', baked, (0.2126, 0.7152, 0.0722))
            ratio = n.math('MINIMUM', n.math('MAXIMUM', n.math('DIVIDE', luma, albedo[2]), 0.85), 1.15)
            base = n.vec('SCALE', n.rgb(albedo[1]), scale=ratio)
        else:
            base = n.rgb(albedo)
        base = n.vec('SCALE', base, scale=gain)
        if mottle:
            # A broad painted mottle about a metre across, as the site detail texture gives the
            # lawn: one smooth field, never a change per face.
            noise = n.node('ShaderNodeTexNoise')
            noise.inputs['Scale'].default_value = 0.9
            noise.inputs['Detail'].default_value = 2.0
            n.put(noise.inputs['Vector'], P)
            m = n.math('MULTIPLY_ADD', noise.outputs['Fac'], 0.36, 0.82)
            base = n.vec('SCALE', base, scale=m)
        wrap = n.math('MULTIPLY_ADD', n.vec('DOT_PRODUCT', N, moon), 0.5, 0.5)
        diffuse = n.math('MULTIPLY', wrap, wrap)
        sep = n.node('ShaderNodeSeparateXYZ')
        n.put(sep.inputs[0], N)
        hemi = n.mix(n.math('MULTIPLY_ADD', sep.outputs[2], 0.5, 0.5), RIG['ground'], RIG['sky'])
        light = n.vec('ADD', hemi, n.vec('SCALE', n.rgb(RIG['moon']), scale=diffuse))
        # The warm spill, with the campfire floor term (toon-material.js, the bounce loop).
        to_fire = n.vec('SUBTRACT', tuple(fire), P)
        d = n.vec('LENGTH', to_fire)
        x = n.math('MINIMUM', n.math('DIVIDE', d, FIRE_RADIUS), 1.0)
        ease = n.math('MULTIPLY', n.math('MULTIPLY', x, x), n.math('SUBTRACT', 3.0, n.math('MULTIPLY', x, 2.0)))
        r2 = FIRE_RADIUS * FIRE_RADIUS
        near = n.math('DIVIDE', r2, n.math('ADD', n.math('MULTIPLY', d, d), r2))
        reach = n.math('MULTIPLY', n.math('SUBTRACT', 1.0, ease), near)
        face = n.math('MAXIMUM', n.math('MULTIPLY_ADD', n.vec('DOT_PRODUCT', N, n.vec('NORMALIZE', to_fire)), 0.75, 0.25), 0.0)
        floors = n.math('MULTIPLY_ADD', n.math('SUBTRACT', 1.0, n.math('ABSOLUTE', sep.outputs[2])), 0.15, 0.85)
        # The fire strength comes from the scene property gate_warm, so one material serves the
        # embers picture and the blaze picture.
        strength = n.node('ShaderNodeAttribute', attribute_type='VIEW_LAYER', attribute_name='gate_warm').outputs['Fac']
        warm = n.math('MULTIPLY', n.math('MULTIPLY', reach, n.math('MULTIPLY', floors, face)), strength)
        warm = n.math('DIVIDE', n.math('MULTIPLY', warm, 1.25), n.math('ADD', warm, 1.0))
        light = n.vec('ADD', light, n.vec('SCALE', n.rgb(RIG['warm']), scale=warm))
        # Contact shade from the ambient occlusion, so the props sit on the lawn.
        ao = n.node('ShaderNodeAmbientOcclusion', samples=16)
        ao.inputs['Distance'].default_value = 0.6
        light = n.vec('SCALE', light, scale=n.math('MULTIPLY_ADD', ao.outputs['AO'], 0.45, 0.55))
        colour = n.vec('MULTIPLY', base, light)
        facing = n.math('MAXIMUM', n.vec('DOT_PRODUCT', N, V), 0.0)
        rim = n.math('MULTIPLY', n.math('POWER', n.math('SUBTRACT', 1.0, facing), 3.0), n.smooth(n.math('SUBTRACT', 1.0, wrap), 0.5, 0.7))
        tint = n.vec('ADD', (0.4, 0.4, 0.4), n.vec('SCALE', base, scale=0.6))
        colour = n.vec('ADD', colour, n.vec('SCALE', n.vec('MULTIPLY', n.rgb(RIG['rim']), tint), scale=rim))
        emit = n.node('ShaderNodeEmission')
        n.put(emit.inputs['Color'], colour)
        out = n.node('ShaderNodeOutputMaterial')
        nt.links.new(emit.outputs[0], out.inputs['Surface'])
        return mat

    def emission(name, colour, strength):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        nt = mat.node_tree
        nt.nodes.clear()
        emit = nt.nodes.new('ShaderNodeEmission')
        emit.inputs['Color'].default_value = (*colour, 1)
        emit.inputs['Strength'].default_value = strength
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(emit.outputs[0], out.inputs['Surface'])
        return mat

    # The scene -----------------------------------------------------------------------

    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    scn = bpy.context.scene
    for engine in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            scn.render.engine = engine
            break
        except TypeError:
            continue
    scn.render.film_transparent = True
    scn.render.resolution_x = scn.render.resolution_y = MASTER
    scn.render.resolution_percentage = 100
    scn.render.filter_size = 1.2
    scn.render.image_settings.file_format = 'OPEN_EXR'
    scn.render.image_settings.color_depth = '16'
    scn.render.image_settings.color_mode = 'RGBA'
    scn.view_settings.view_transform = 'Standard'
    scn.eevee.taa_render_samples = 48
    scn.render.line_thickness_mode = 'ABSOLUTE'
    scn.render.line_thickness = 2.6
    lineset = scn.view_layers[0].freestyle_settings.linesets[0]
    lineset.select_by_visibility = True
    for flag in ('select_crease', 'select_border', 'select_contour', 'select_external_contour'):
        setattr(lineset, flag, False)
    lineset.select_silhouette = True
    lineset.linestyle.color = (0.035, 0.022, 0.03)
    lineset.linestyle.alpha = 0.7
    world = bpy.data.worlds.new('GateNight')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    scn.world = world

    def load(name):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=str(ROOT / 'src' / 'assets' / 'models' / name))
        return [o for o in bpy.data.objects if o not in before]

    aerie = load('aerie.glb')
    kit = load('campfire_kit.glb')
    anchors = {o.name: o.matrix_world.translation.copy() for o in aerie if o.type == 'EMPTY'}
    fire = anchors['Anchor_Campfire']
    moon = tuple(anchors['Anchor_Moon'].normalized())
    # campfire.js puts the kit group at the anchor with no turn.
    for o in kit:
        if o.parent is None:
            o.location += fire
    bpy.context.view_layer.update()

    def mean_luma(objects, material):
        total, count = 0.0, 0
        for ob in objects:
            if ob.type != 'MESH' or 'Color' not in ob.data.color_attributes:
                continue
            slots = {i for i, s in enumerate(ob.material_slots) if s.material and s.material.name == material}
            colours = ob.data.color_attributes['Color']
            corner = colours.domain == 'CORNER'
            for poly in ob.data.polygons:
                if poly.material_index in slots:
                    for li in poly.loop_indices:
                        c = colours.data[li if corner else ob.data.loops[li].vertex_index].color
                        total += 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
                        count += 1
        return total / count if count else 0.5

    # Smooth normals, as the site blends each facet toward a creased smooth normal
    # (soft-normals.js, uToonSoftness 0.9). Edges sharper than 55 degrees stay hard, so the
    # facets still read at the silhouette.
    meshes = [ob for ob in aerie + kit if ob.type == 'MESH']
    for ob in meshes:
        if ob.data.has_custom_normals:
            with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
                bpy.ops.mesh.customdata_custom_splitnormals_clear()
    with bpy.context.temp_override(active_object=meshes[0], selected_objects=meshes, selected_editable_objects=meshes):
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(55))

    cache = {}
    for ob in aerie + kit:
        if ob.type != 'MESH':
            continue
        if ob.name in ('Glass', 'Water'):
            ob.hide_render = True
            continue
        for slot in ob.material_slots:
            src = slot.material.name if slot.material else 'none'
            if src not in cache:
                if src == 'kit_ember':
                    cache[src] = emission('gate_ember', linear(0xFF6A1A), 3.0)
                else:
                    albedo = ('tone', linear(TONES[src]), mean_luma(aerie, src)) if src in TONES else ('attr',)
                    cache[src] = toon(f'gate_{src}', albedo, LAWN_GAIN if src in LAWN else 1.0, moon, fire, mottle=src in LAWN)
            slot.material = cache[src]

    # The fire pit: the faces of the kit within PIT_R of the fire. It renders as its own layer,
    # which lies over Kinako on the far side of the lap.
    pit_r = 0.85
    pit = []
    for ob in kit:
        if ob.type != 'MESH':
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        mw = ob.matrix_world
        near = [f for f in bm.faces if ((mw @ f.calc_center_median()) - fire).xy.length < pit_r]
        if not near:
            bm.free()
            continue
        keep = bm.copy()
        far_faces = [f for f in keep.faces if ((mw @ f.calc_center_median()) - fire).xy.length >= pit_r]
        bmesh.ops.delete(keep, geom=far_faces, context='FACES')
        me = ob.data.copy()
        keep.to_mesh(me)
        keep.free()
        bmesh.ops.delete(bm, geom=near, context='FACES')
        bm.to_mesh(ob.data)
        bm.free()
        part = bpy.data.objects.new(f'Pit_{ob.name}', me)
        scn.collection.objects.link(part)
        part.matrix_world = mw
        pit.append(part)

    # The camera ---------------------------------------------------------------------
    target = fire + Vector((0, 0, 0.3))
    yaw, pitch = math.radians(CAMERA['yaw']), math.radians(CAMERA['pitch'])
    toward = Vector((math.cos(yaw), math.sin(yaw), 0))
    offset = Vector((math.cos(pitch) * toward.x, math.cos(pitch) * toward.y, math.sin(pitch))) * CAMERA['dist']
    cam_data = bpy.data.cameras.new('GateCam')
    cam_data.lens = CAMERA['lens']
    cam_data.sensor_fit = 'HORIZONTAL'
    cam_data.sensor_width = 36
    cam_data.shift_y = CAMERA['shift_y']
    cam_data.clip_start = 0.05
    cam_data.clip_end = 400
    cam = bpy.data.objects.new('GateCam', cam_data)
    scn.collection.objects.link(cam)
    cam.location = target + offset
    cam.rotation_euler = (-offset).to_track_quat('-Z', 'Y').to_euler()
    scn.camera = cam
    bpy.context.view_layer.update()
    # The screen right of the camera, flat on the lawn.
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    right = Vector((right.x, right.y, 0)).normalized()

    def screen(p):
        """A world point on the master frame, as shares of its width and height from top left."""
        v = world_to_camera_view(scn, cam, p)
        return (v.x, 1 - v.y)

    depsgraph = bpy.context.evaluated_depsgraph_get()

    def ground(x, y):
        hit, loc, *_ = scn.ray_cast(depsgraph, Vector((x, y, fire.z + 1.5)), Vector((0, 0, -1)))
        return loc.z if hit else fire.z

    def lap_point(deg):
        """The world point of the lap at a screen angle: 0 right, 90 near, 180 left."""
        a = math.radians(deg)
        p = fire + right * (LAP_R * math.cos(a)) + toward * (LAP_R * math.sin(a))
        p.z = ground(p.x, p.y)
        return p

    # The screen ellipse of the lap and Kinako's scale round it.
    pts = {deg: screen(lap_point(deg)) for deg in range(0, 360, 5)}
    xs = [p[0] for p in pts.values()]
    ys = [p[1] for p in pts.values()]
    ellipse = {'cx': (max(xs) + min(xs)) / 2, 'cy': (max(ys) + min(ys)) / 2, 'rx': (max(xs) - min(xs)) / 2, 'ry': (max(ys) - min(ys)) / 2}

    def size_at(p):
        """The screen height of a 1 m upright stick at a point, as a share of the frame."""
        return screen(p)[1] - screen(p + Vector((0, 0, 1)))[1]

    near_size = size_at(lap_point(90))
    depth = [round(size_at(lap_point(deg)) / near_size, 4) for deg in range(0, 360, 30)]

    # Leaf litter ---------------------------------------------------------------------
    import random
    rng = random.Random(3)
    # A light litter: the owner found a full carpet too busy, twice, so the leaves stay few,
    # near the fire, and a little dimmer than the site carpet.
    leaf_mats = [toon(f'gate_leaf_{i}', linear(c), 0.48, moon, fire) for i, c in enumerate(CARPET)]
    shapes = []
    for i in range(3):
        bm = bmesh.new()
        w = (0.3, 0.36, 0.26)[i]
        outline = [(0.5, 0.0), (0.32, w * 0.62), (0.08, w * 0.95), (-0.18, w * 0.88), (-0.4, w * 0.45), (-0.5, 0.0),
                   (-0.4, -w * 0.45), (-0.18, -w * 0.88), (0.08, -w * 0.95), (0.32, -w * 0.62)]
        # A slight fold along the midrib, so each leaf catches the light on two sides.
        verts = [bm.verts.new((x, y, abs(y) * 0.25)) for x, y in outline]
        mid = [bm.verts.new((0.5, 0, 0)), bm.verts.new((-0.5, 0, 0))]
        bm.verts.ensure_lookup_table()
        half = len(outline) // 2
        bm.faces.new([mid[0], *verts[1:half], mid[1]])
        bm.faces.new([mid[1], *verts[half + 1:], mid[0]])
        me = bpy.data.meshes.new(f'Leaf_{i}')
        bm.to_mesh(me)
        bm.free()
        shapes.append(me)
    clear = [(fire, 0.8)]
    for _ in range(360):
        r = 0.8 + 2.2 * math.sqrt(rng.random())
        a = rng.random() * math.tau
        x, y = fire.x + math.cos(a) * r, fire.y + math.sin(a) * r
        if any((Vector((x, y)) - c.xy).length < rad for c, rad in clear):
            continue
        hit, loc, normal, _, ob, _ = scn.ray_cast(depsgraph, Vector((x, y, fire.z + 1.5)), Vector((0, 0, -1)))
        if not hit or not ob.name.startswith(('Island', 'Turf')) or normal.z < 0.8:
            continue
        me = shapes[rng.randrange(3)].copy()
        # The tone follows a slow field over the lawn, so neighbouring leaves share a tone and
        # the carpet shows patches, never noise from leaf to leaf.
        field = 0.5 + 0.25 * math.sin(x * 1.7 + math.cos(y * 1.3) * 1.8) + 0.25 * math.sin(y * 2.1 - x * 0.6)
        me.materials.append(leaf_mats[min(3, max(0, int(field * 4 + rng.uniform(-0.4, 0.4))))])
        leaf = bpy.data.objects.new('Leaf', me)
        scn.collection.objects.link(leaf)
        s = rng.uniform(0.11, 0.17)
        leaf.scale = (s, s, s)
        leaf.location = loc + Vector((0, 0, 0.006))
        leaf.rotation_euler = (rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), rng.random() * math.tau)

    # The flames: flat painted tongues that face the camera, outer orange at the back, amber in
    # the middle and pale gold in front. Each flicker frame leans and stretches them a little.
    face_yaw = math.atan2(toward.y, toward.x)

    def flames(stage, frame):
        obs = []
        layers = ((0xF0601A, 0.30, 0.95, 1.1, 0.00, 0.00), (0xF0601A, 0.17, 0.70, 1.1, 0.02, -0.20),
                  (0xF0601A, 0.15, 0.62, 1.1, 0.02, 0.21), (0xFFA040, 0.20, 0.70, 1.5, 0.06, 0.02),
                  (0xFFD27A, 0.11, 0.42, 2.2, 0.10, -0.01))
        for i, (hex_value, half, height, strength, ahead, shift) in enumerate(layers):
            phase = frame / FLICKER * math.tau + i * 1.7
            h = height * stage * (1 + 0.07 * math.sin(phase))
            lean = 0.07 * stage * math.sin(phase + 0.8)
            bm = bmesh.new()
            rows = 18
            ring = []
            for k in range(rows + 1):
                t = k / rows
                w = half * stage * math.sin(math.pi * (0.18 + 0.82 * t)) ** 0.9 * (1 - t) ** 0.25 / 0.95
                sway = lean * t * t + 0.05 * stage * math.sin(t * math.pi * 1.4 + phase) * (1 if i % 2 else -1)
                ring.append((bm.verts.new((sway - w, 0, t * h)), bm.verts.new((sway + w, 0, t * h))))
            for k in range(rows):
                bm.faces.new((ring[k][0], ring[k][1], ring[k + 1][1], ring[k + 1][0]))
            me = bpy.data.meshes.new(f'Flame_{i}')
            bm.to_mesh(me)
            bm.free()
            me.materials.append(emission(f'gate_flame_{i}', linear(hex_value), strength))
            ob = bpy.data.objects.new(me.name, me)
            scn.collection.objects.link(ob)
            ob.location = fire + Vector((0, 0, 0.08)) + toward * ahead + right * shift
            ob.rotation_euler = (0, 0, face_yaw - math.pi / 2)
            obs.append(ob)
        return obs

    # Kinako ------------------------------------------------------------------------
    mats = wc.kit_materials(wc.KIT)
    for key, mat in list(mats.items()):
        if mat.name.startswith('WC_Kit_') and key not in ('pupil', 'glint', 'blush'):
            c = mat.diffuse_color
            mats[key] = toon(f'gate_kinako_{key}', (c[0], c[1], c[2]), 1.0, moon, fire)

    def kinako(pose, at_deg, heading):
        coll = bpy.data.collections.new(f'Kinako_{pose}')
        scn.collection.children.link(coll)
        b = wc.build_kit(pose, coll, mats, cfg={**wc.KIT, 'res': high})
        wc.apply_pose(b, pose)
        for key, ob in b.parts.items():
            if key != '_ink' and ob.type == 'MESH':
                for poly in ob.data.polygons:
                    poly.use_smooth = True
        p = lap_point(at_deg)
        b.root.location.x, b.root.location.y = p.x, p.y
        b.root.location.z += p.z
        b.root.rotation_euler = (0, 0, heading)
        return coll, p

    # Headings: the run goes along the lap from right to left on the near side, and the nap and
    # the sit face the camera, a little turned.
    tangent = math.atan2(-right.y, -right.x)

    # Rendering ------------------------------------------------------------------------
    WORK.mkdir(parents=True, exist_ok=True)
    every = [o for o in scn.objects if o.type == 'MESH']

    def show(objects, holdout=()):
        keep = set(objects) | set(holdout)
        for o in scn.objects:
            if o.type in ('MESH', 'CURVE'):
                o.hide_render = o not in keep or o.name in ('Glass', 'Water')
                o.is_holdout = o in holdout

    def border(box):
        """Limits the render to a box of shares (x0, y0, x1, y1) from the top left."""
        if box is None:
            scn.render.use_border = False
            return
        scn.render.use_border = True
        scn.render.use_crop_to_border = False
        scn.render.border_min_x, scn.render.border_max_x = box[0], box[2]
        scn.render.border_min_y, scn.render.border_max_y = 1 - box[3], 1 - box[1]

    def shot(name, box=None, lines=True, warm=WARM['embers']):
        scn['gate_warm'] = warm
        scn.view_layers[0]['gate_warm'] = warm
        scn.render.use_freestyle = lines
        border(box)
        path = WORK / f'{name}.exr'
        scn.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(str(path))
        w, h = image.size
        px = np.empty(w * h * 4, dtype=np.float32)
        image.pixels.foreach_get(px)
        px = px.reshape(h, w, 4)[::-1]
        if box is not None:
            x0, y0, x1, y1 = (int(round(v * MASTER)) for v in box)
            px = px[y0:y1, x0:x1]
        np.save(str(WORK / f'{name}.npy'), px)
        bpy.data.images.remove(image)
        path.unlink(missing_ok=True)

    only = os.environ.get('GATE_ONLY', '')
    world_objs = [o for o in every if not o.name.startswith('Pit_')] + pit
    if not only or 'scene' in only:
        show(world_objs)
        shot('scene')
        shot('glow', warm=WARM['blaze'])
    if not only or 'pit' in only:
        show(pit)
        shot('pit')

    def box_round(centre, half_w, half_h):
        return (max(0, centre[0] - half_w), max(0, centre[1] - half_h), min(1, centre[0] + half_w), min(1, centre[1] + half_h))

    fire_screen = screen(fire)
    fire_box = box_round((fire_screen[0], fire_screen[1] - near_size * 0.45), near_size * 0.55, near_size * 0.62)
    if not only or 'fire' in only:
        for s, stage in enumerate(STAGES):
            for f in range(FLICKER):
                obs = flames(stage, f)
                show(obs, holdout=pit)
                shot(f'fire-{s}-{f}', fire_box, lines=False)
                for o in obs:
                    bpy.data.objects.remove(o, do_unlink=True)

    # Kinako frames: each crop box is K_BOX metres round the paw point, at that point's depth.
    def k_box(p):
        sx, sy = screen(p)
        size = size_at(p)
        w, h = K_BOX[0] * size, K_BOX[1] * size
        return (sx - w * K_FEET[0], sy - h * K_FEET[1], sx + w * (1 - K_FEET[0]), sy + h * (1 - K_FEET[1]))

    face_cam = math.atan2(toward.y, toward.x)
    frames = {
        'nap': [('nap', NAP_AT, face_cam + math.radians(25))],
        'wake': [('nap', NAP_AT, face_cam + math.radians(25)), ('nap_up', NAP_AT, face_cam + math.radians(25)),
                 ('bow', NAP_AT, face_cam + math.radians(60)), ('stand', NAP_AT, tangent)],
        'run': [(f'run{k}', SIT_AT, tangent) for k in range(RUN_FRAMES)],
        'sit': [('sit', SIT_AT, face_cam + math.radians(18)), ('sit_blink', SIT_AT, face_cam + math.radians(18)),
                ('sit_tail', SIT_AT, face_cam + math.radians(18))],
    }
    boxes = {}
    for sheet, items in frames.items():
        if only and sheet not in only:
            continue
        for k, (pose, at_deg, heading) in enumerate(items):
            coll, p = kinako(pose, at_deg, heading)
            box = k_box(p)
            boxes[sheet] = box
            show(list(coll.all_objects))
            shot(f'k-{sheet}-{k}', box, lines=False, warm=0.75)
            for o in list(coll.all_objects):
                bpy.data.objects.remove(o, do_unlink=True)
            bpy.data.collections.remove(coll)

    layout = {
        'master': MASTER,
        'fire': fire_screen,
        'fire_box': fire_box,
        'horizon': screen(fire + toward * -40 + Vector((0, 0, 0)))[1],
        'ellipse': ellipse,
        'depth': depth,
        'nap_at': NAP_AT,
        'sit_at': SIT_AT,
        'boxes': boxes or {s: k_box(lap_point(NAP_AT if s in ('nap', 'wake') else SIT_AT)) for s in frames},
        'k_feet': K_FEET,
    }
    report = WORK / 'layout.json'
    if report.exists() and only:
        old = json.loads(report.read_text())
        old.update({k: v for k, v in layout.items() if k != 'boxes'})
        old.setdefault('boxes', {}).update(boxes)
        layout = old
    report.write_text(json.dumps(layout, indent=1))
    print('FIRESIDE', json.dumps({k: layout[k] for k in ('fire', 'ellipse', 'depth', 'horizon')}))


def gate_poses():
    """The gate poses on top of walker_concepts.POSES. Angles in degrees, as there."""
    poses = {
        # A loaf nap: the forelegs fold forward, the chin rests low and faces the camera, the
        # ears stand and the tail wraps round the side. The tight curl of the sleep pose hid
        # the face at gate size, and the owner could not make out a sleeping fox.
        'nap': {
            '_eyes_closed': True,
            'body': (0, 2, 0),
            'leg_FL_u': (0, -40, 0), 'leg_FL_l': (0, -50, 0),
            'leg_FR_u': (0, -40, 0), 'leg_FR_l': (0, -50, 0),
            'leg_BL_u': (0, -55, 0), 'leg_BL_l': (0, 115, 0),
            'leg_BR_u': (0, -55, 0), 'leg_BR_l': (0, 115, 0),
            'neck': (0, 6, 0), 'head': (0, -12, 0),
            'ear_L': (0, -6, 0), 'ear_R': (0, -6, 0),
            'tail_1': (0, -70, 50), 'tail_2': (0, 15, 70), 'tail_3': (0, 20, 70),
        },
        'stand': {'tail_1': (0, -20, 0), 'tail_3': (0, 10, 0)},
        # The stretch on waking: forelegs out in front, chest low, rump up.
        'bow': {
            'body': (0, 14, 0),
            'leg_FL_u': (0, -75, 0), 'leg_FL_l': (0, -10, 0),
            'leg_FR_u': (0, -70, 0), 'leg_FR_l': (0, -12, 0),
            'leg_BL_u': (0, -10, 0), 'leg_BR_u': (0, -10, 0),
            'neck': (0, -20, 0), 'head': (0, -10, 0),
            'tail_1': (0, -55, 0), 'tail_3': (0, 20, 0),
        },
        'sit': {
            'body': (0, -40, 0),
            'leg_FL_u': (0, 40, 0), 'leg_FR_u': (0, 40, 0),
            'leg_BL_u': (0, -20, 0), 'leg_BR_u': (0, -20, 0),
            'leg_BL_l': (0, 130, 0), 'leg_BR_l': (0, 130, 0),
            'neck': (0, 20, 0), 'head': (0, 22, 0),
            'tail_1': (0, -12, 50), 'tail_2': (0, -15, 60), 'tail_3': (0, 35, 55),
        },
    }
    poses['nap_up'] = {**poses['nap'], '_eyes_closed': False, 'neck': (0, -18, 0), 'head': (0, -8, 0), 'ear_L': (0, -14, 0), 'ear_R': (0, -14, 0)}
    poses['sit_blink'] = {**poses['sit'], '_eyes_closed': True}
    poses['sit_tail'] = {**poses['sit'], 'tail_2': (0, -20, 35), 'tail_3': (0, 30, 20)}
    # A trot cycle: the diagonal pairs swing together, each leg lifts its lower joint while it
    # swings forward, and the body bobs twice a cycle.
    for k in range(RUN_FRAMES):
        a = k / RUN_FRAMES * math.tau
        pose = {'_air': 0.012 * (1 + math.cos(2 * a)), 'neck': (0, 10, 0), 'head': (0, -8, 0),
                'ear_L': (0, -18, 0), 'ear_R': (0, -18, 0),
                'tail_1': (0, -30 + 6 * math.sin(2 * a), 0), 'tail_2': (0, -5, 0), 'tail_3': (0, 15 + 8 * math.sin(2 * a + 1), 0)}
        for leg, phase, front in (('FL', 0.0, True), ('BR', 0.0, False), ('FR', math.pi, True), ('BL', math.pi, False)):
            s = math.sin(a + phase)
            lift = max(0.0, -math.cos(a + phase))
            if front:
                pose[f'leg_{leg}_u'] = (0, 34 * s, 0)
                pose[f'leg_{leg}_l'] = (0, 55 * lift, 0)
            else:
                pose[f'leg_{leg}_u'] = (0, 30 * s, 0)
                pose[f'leg_{leg}_l'] = (0, -30 * lift, 0)
        poses[f'run{k}'] = pose
    return poses


if __name__ == '__main__':
    try:
        import bpy  # noqa: F401
        IN_BLENDER = True
    except ImportError:
        IN_BLENDER = False
    if IN_BLENDER:
        render_main()
    else:
        import importlib.util
        spec = importlib.util.spec_from_file_location('gate_fireside_pack', Path(__file__).with_name('gate-fireside-pack.py'))
        pack = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(pack)
        pack.main(WORK, OUT, ROOT)

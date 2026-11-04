"""Exports Kinako, the walker of explore on foot, to src/assets/models/walker.glb.

Run it in background Blender from the repository root:
    blender.exe --factory-startup -b --python scenes/urban-aerie-studies/export_walker.py
Pass -- --count to build and count the meshes with no export.

The script builds the approved kit from walker_concepts.py and walker_kit_geometry.py at a finer
resolution (HIGH) and bakes two meshes. Kinako is built for a close camera (1.5 m), so each mesh
is one continuous skin:
- The posed body, neck, head, muzzle, ears, legs and paws join in one exact boolean union. No
  part pokes out through another, and each face keeps its concept colour, so the plane cuts of
  the colour fields stay straight.
- A band along each joint seam is smoothed, so a joint blends and never shows a crease.
- The face details (eyes, glints, nose, mouth, blush, inner ears) stay small parts on top.

Kinako_Walk is the stand pose with a straight tail. Each vertex keeps its part index in _part,
its blend toward that part in _blend (the rest of the weight goes to the parent part), and, on
the tail, its distance along the tail in _tail. The site bends the tail over its three joints
and blends the two part matrices of each vertex in the vertex shader
(src/scene/explore/walker-material.js). The node extras carry the rig as JSON: the part names,
parents and pivots, the tail joints and the paw drops.

Kinako_Sleep is the sleep pose as one plain skin.

Site model space: +Z is forward, +Y is up and +X is the walker's left. The origin is on the
ground under the body. A concept point (x, y, z) is the site point (y, z, x). So a concept Y
rotation (a leg swings back, the head pitches down, the tail lifts) is a site X rotation, and
a concept Z rotation (the head turns left) is a site Y rotation, with the same sign.

The script saves no .blend. It writes the GLB through gltf-transform (Draco with quantised
attributes) and a report, walker_report.json, next to this file.
"""
import importlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, str(HERE))
import walker_concepts as wc  # noqa: E402
import walker_kit_geometry as geo  # noqa: E402

importlib.reload(geo)
importlib.reload(wc)

SITE = HERE.parent.parent
OUT = SITE / 'src/assets/models/walker.glb'
REPORT = HERE / 'walker_report.json'
GLTF_TRANSFORM = '@gltf-transform/cli@4.5.1'
# The budgets of the spec (Walker design): the walk mesh triangles and the file size in bytes.
TRI_CAP = 8000
BYTE_CAP = 80 * 1024

# The finer resolution for the site walker (walker_kit_geometry.RES holds the concept values).
HIGH = {
    'body_sides': 20, 'body_split': 2, 'tail_rings': 24,
    'neck': (16, 4, 3), 'head': (20, 14), 'muzzle': (14, 9),
    'ear_sides': 12, 'ear_split': 2, 'leg_sides': 14, 'leg_mid': 4, 'leg_dome': 2, 'paw': (14, 7),
}
# The seam fillet: the rings of vertices round each joint seam that soften, the smooth factor
# and its repeats.
FILLET = {'rings': 1, 'factor': 0.5, 'repeat': 3}
# Neck and upper-leg faces this close to the body surface, in metres, take the body colour there.
# The wide thigh tops and the neck root come out through the body, and their own colours
# drew oat slivers over the cream belly and the rust saddle.
BODY_COLOUR = {'reach': 0.012, 'parts': ('neck', 'leg_u_FL', 'leg_u_FR', 'leg_u_BL', 'leg_u_BR')}
# A vertex this far past its part pivot, in metres along the part, follows the part fully. As
# far before the pivot, it follows the parent part. Between, it blends.
BLEND = 0.025

# The rigid parts in uniform order. The site keeps one matrix per part.
PARTS = ('body', 'neck', 'head', 'ear_L', 'ear_R', 'eye_L', 'eye_R',
         *(f'{k}_{leg}' for leg in ('FL', 'FR', 'BL', 'BR') for k in ('leg_u', 'leg_l', 'paw')))
# The concept names of the leg parts are leg_FL_u, leg_FL_l and paw_FL.
CONCEPT = {f'{k}_{leg}': (f'leg_{leg}_{k[-1]}' if k.startswith('leg') else f'paw_{leg}')
           for leg in ('FL', 'FR', 'BL', 'BR') for k in ('leg_u', 'leg_l', 'paw')}
# Objects that join the skin with the part that carries them.
SKIN_OWNER = {'muzzle': 'head'}
# Detail objects stay apart from the skin and move with the part that carries them.
DETAIL_OWNER = {'nose': 'head', 'mouth': 'head', 'blush_L': 'head', 'blush_R': 'head',
                'inner_L': 'ear_L', 'inner_R': 'ear_R', 'glint_L': 'eye_L', 'glint_R': 'eye_R',
                'eye_L': 'eye_L', 'eye_R': 'eye_R'}
PARENT = {'body': None, 'neck': 'body', 'head': 'neck', 'ear_L': 'head', 'ear_R': 'head',
          'eye_L': 'head', 'eye_R': 'head'}
for _leg in ('FL', 'FR', 'BL', 'BR'):
    PARENT.update({f'leg_u_{_leg}': 'body', f'leg_l_{_leg}': f'leg_u_{_leg}',
                   f'paw_{_leg}': f'leg_l_{_leg}'})

# Concept space to the space the glTF exporter turns into site space: a quarter turn about Z.
TO_EXPORT = Matrix.Rotation(math.radians(-90), 4, 'Z')


def site(v):
    """A concept point in site model space, rounded to 0.1 mm."""
    return [round(v.y, 4), round(v.z, 4), round(v.x, 4)]


def concept_key(part):
    return CONCEPT.get(part, part)


def skin_part(key):
    """The rig part of a concept object that joins the skin, or None."""
    if key in SKIN_OWNER:
        return SKIN_OWNER[key]
    for part in PARTS:
        if concept_key(part) == key and part not in ('eye_L', 'eye_R'):
            return part
    return None


def depth(part):
    """How many parents a part has. A seam vertex goes to the shallower part."""
    n = 0
    while PARENT[part]:
        part = PARENT[part]
        n += 1
    return n


def slot_colour(material):
    """The sRGB hex colour of a concept material slot, from its name WC_Kit_<colour>."""
    return wc.KIT['colours'][material.name.removeprefix('WC_Kit_')]


def build_kit(tag, coll, mats, pose):
    """Builds one kit at the HIGH resolution in the pose. The ink shell is skipped."""
    cfg = {**wc.KIT, 'res': HIGH}
    b = wc.build_kit(tag, coll, mats, cfg=cfg)
    b.build_ink = lambda: None
    paint_neck(b)
    wc.apply_pose(b, pose)
    return b


def paint_neck(b):
    """Paints the neck with the chest plane of the body, cut straight, at rest.

    The concept paints the front lower quarter of the neck cream by its own rule, and the body
    paints its chest cream below a tilted plane. In one skin the two fields met as odd patches
    where the neck leaves the chest. One plane for both makes one cream bib.
    """
    blen, _, bh = b.cfg['body']
    neck = b.parts['neck']
    # The neck turns only in a pose, so at rest its frame is the body frame moved to its root.
    co = Vector((blen * 0.18, 0, -bh * 0.05)) - neck.location
    no = Vector((-0.55, 0, 1)).normalized()
    bm = bmesh.new()
    bm.from_mesh(neck.data)
    geo.cut(bm, co, no)
    geo.paint(bm, lambda c: 1 if geo.side_of(c, co, no) < 0 else 0)
    bm.to_mesh(neck.data)
    bm.free()


def straighten_tail(b):
    """Rebuilds the body mesh with a straight tail. Returns the rump loop centre.

    The tail then runs straight back along -X from the rump loop, so the distance along the
    tail is the drop in X from that loop.
    """
    body = b.parts['body']
    bm, _ = geo.body_tail_mesh(b.cfg, [(0.0, 0.0)] * 3)
    bm.to_mesh(body.data)
    bm.free()
    bpy.context.view_layer.update()
    return geo.body_ring(b.cfg, geo.BODY_STATIONS[-1])[0]


def tagged_copy(ob, part, palette, coll):
    """A world-space copy of a part object whose slots name the part and the colour."""
    me = ob.data.copy()
    me.transform(ob.matrix_world)
    # materials.clear() sets every face slot to 0, so the slots go back on after the new names.
    slots = [p.material_index for p in me.polygons]
    me.materials.clear()
    for m in ob.data.materials:
        hex_value = slot_colour(m)
        if hex_value not in palette:
            palette.append(hex_value)
        name = f'K|{part}|{palette.index(hex_value)}'
        me.materials.append(bpy.data.materials.get(name) or bpy.data.materials.new(name))
    me.polygons.foreach_set('material_index', slots)
    copy = bpy.data.objects.new(f'{ob.name}_skin', me)
    coll.objects.link(copy)
    return copy


def union_skin(b, coll, palette):
    """Joins the skin parts in one exact boolean union. Returns a bmesh in concept space.

    Each face keeps a material named K|<part>|<colour>, so its part and colour survive the union.
    """
    pieces = [tagged_copy(ob, skin_part(key), palette, coll)
              for key, ob in b.parts.items() if key != '_ink' and skin_part(key)]
    base = next(p for p in pieces if p.name.endswith('_body_skin'))
    surface = bmesh.new()
    surface.from_mesh(base.data)
    surface.faces.ensure_lookup_table()
    surface_colours = [int(base.data.materials[f.material_index].name.split('|')[2]) for f in surface.faces]
    surface_tree = BVHTree.FromBMesh(surface)
    others = bpy.data.collections.new(f'{b.tag}_operands')
    coll.children.link(others)
    for p in pieces:
        if p is not base:
            coll.objects.unlink(p)
            others.objects.link(p)
    mod = base.modifiers.new('Union', 'BOOLEAN')
    mod.operation = 'UNION'
    mod.operand_type = 'COLLECTION'
    mod.collection = others
    mod.solver = 'EXACT'
    mod.use_self = True
    mod.use_hole_tolerant = True
    mod.material_mode = 'TRANSFER'
    bpy.context.view_layer.update()
    evaluated = base.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = bpy.data.meshes.new_from_object(evaluated)
    bm = bmesh.new()
    bm.from_mesh(me)
    tags = [m.name.split('|') for m in me.materials]
    layer_part = bm.faces.layers.int.new('part')
    layer_colour = bm.faces.layers.int.new('colour')
    for f in bm.faces:
        _, part, colour = tags[f.material_index]
        f[layer_part] = PARTS.index(part)
        f[layer_colour] = int(colour)
        if part in BODY_COLOUR['parts']:
            hit = surface_tree.find_nearest(f.calc_center_median())
            if hit[0] is not None and hit[3] < BODY_COLOUR['reach']:
                f[layer_colour] = surface_colours[hit[2]]
    surface.free()
    bpy.data.meshes.remove(me)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    return bm


def fillet(bm):
    """Smooths a band round each seam where two parts meet, so the joint blends."""
    layer = bm.faces.layers.int['part']
    seam = {v for v in bm.verts if len({f[layer] for f in v.link_faces}) > 1}
    band = set(seam)
    for _ in range(FILLET['rings']):
        band |= {n for v in band for e in v.link_edges for n in e.verts}
    verts = list(band)
    for _ in range(FILLET['repeat']):
        bmesh.ops.smooth_vert(bm, verts=verts, factor=FILLET['factor'],
                              use_axis_x=True, use_axis_y=True, use_axis_z=True)
    return len(seam)


def vertex_parts(bm):
    """The part of each skin vertex: the shallowest part among its faces."""
    layer = bm.faces.layers.int['part']
    out = {}
    for v in bm.verts:
        parts = {PARTS[f[layer]] for f in v.link_faces}
        out[v] = min(parts, key=depth) if parts else 'body'
    return out


def blend_weights(bm, owner, pivots):
    """The blend of each vertex toward its part, 1 past the pivot and 0 before it.

    A part runs from its pivot toward the middle of its own vertices. Body vertices follow the
    body alone.
    """
    middles = {}
    for v, part in owner.items():
        middles.setdefault(part, []).append(v.co)
    axes = {}
    for part, cos in middles.items():
        middle = sum(cos, Vector()) / len(cos)
        d = middle - pivots[part]
        axes[part] = d.normalized() if d.length > 1e-6 else Vector((0, 0, -1))
    weights = {}
    for v, part in owner.items():
        if PARENT[part] is None:
            weights[v] = 1.0
            continue
        along = (v.co - pivots[part]).dot(axes[part])
        weights[v] = geo.smoothstep((along + BLEND) / (2 * BLEND))
    return weights


def add_details(bm, b, palette, rig):
    """Appends the face details to the skin as their own small parts."""
    layer_part = bm.faces.layers.int['part']
    layer_colour = bm.faces.layers.int['colour']
    owner = {}
    for key, ob in b.parts.items():
        if key not in DETAIL_OWNER or ob.hide_render:
            continue
        me = ob.data.copy()
        me.transform(ob.matrix_world)
        slots = []
        for m in ob.data.materials:
            hex_value = slot_colour(m)
            if hex_value not in palette:
                palette.append(hex_value)
            slots.append(palette.index(hex_value))
        n_verts, n_faces = len(bm.verts), len(bm.faces)
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        part = DETAIL_OWNER[key]
        for f in bm.faces[n_faces:]:
            f[layer_part] = PARTS.index(part)
            f[layer_colour] = slots[f.material_index]
        for v in bm.verts[n_verts:]:
            owner[v] = part
    if rig is not None:
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    return owner


def to_mesh(bm, name, palette, attributes=None):
    """Writes the skin bmesh to a mesh in export space with face-corner colours.

    attributes: per-vertex float values by name, keyed by vertex index, or None.
    """
    bm.transform(TO_EXPORT)
    for f in bm.faces:
        f.smooth = True
        f.material_index = 0
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    face_colour = me.attributes['colour'].data
    for poly in me.polygons:
        hex_value = palette[face_colour[poly.index].value]
        rgb = [((hex_value >> s) & 0xFF) / 255 for s in (16, 8, 0)]
        for li in poly.loop_indices:
            attr.data[li].color_srgb = (*rgb, 1.0)
    for drop in ('colour', 'part'):
        me.attributes.remove(me.attributes[drop])
    me.color_attributes.active_color = attr
    for key, values in (attributes or {}).items():
        a = me.attributes.new(key, 'FLOAT', 'POINT')
        a.data.foreach_set('value', values)
    return me


def bake(b, name, coll, rig=None, start=None):
    """Bakes one kit into a skin mesh. rig and start: the rig and the rump loop of the walk."""
    bpy.context.view_layer.update()
    palette = []
    bm = union_skin(b, coll, palette)
    seams = fillet(bm)
    skin = vertex_parts(bm)
    details = add_details(bm, b, palette, rig)
    bm.verts.index_update()
    attributes = None
    if rig is not None:
        pivots = {p: b.parts[concept_key(p)].matrix_world.translation.copy() for p in PARTS}
        # Skin vertices blend toward the parent part near each joint. Details move with their
        # part alone.
        weights = blend_weights(bm, skin, pivots)
        weights.update({v: 1.0 for v in details})
        owner = {**skin, **details}
        rump = (b.parts['body'].matrix_world @ Vector((start.x, 0, 0))).x
        verts = sorted(owner, key=lambda v: v.index)
        attributes = {
            '_part': [float(PARTS.index(owner[v])) for v in verts],
            '_blend': [weights[v] for v in verts],
            '_tail': [max(0.0, rump - v.co.x) if v in skin and owner[v] == 'body' else 0.0 for v in verts],
        }
    me = to_mesh(bm, name, palette, attributes)
    bm.free()
    return me, seams


def rig_data(b, start):
    """The pivots and joints of the walk mesh, in site model space."""
    world = {key: ob.matrix_world for key, ob in b.parts.items()}
    pivots = [site(world[concept_key(p)].translation) for p in PARTS]
    body = b.parts['body'].matrix_world
    joints = []
    for s, name in zip(b.cfg['tail_joints'], ('tail_1', 'tail_2', 'tail_3')):
        rest = wc.REST[name]
        joints.append({'s': s, 'pivot': site(body @ Vector((start.x - s, 0.0, start.z))),
                       'rest': [rest[1], rest[2]]})
    drops = {}
    for leg in ('FL', 'FR', 'BL', 'BR'):
        ob = b.parts[f'paw_{leg}']
        low = min((ob.matrix_world @ v.co).z for v in ob.data.vertices)
        drops[leg] = round(ob.matrix_world.translation.z - low, 4)
    return {
        'parts': list(PARTS),
        'parents': [PARTS.index(PARENT[p]) if PARENT[p] else -1 for p in PARTS],
        'pivots': pivots,
        'tail': {'joints': joints, 'blend': 0.08, 'length': b.cfg['tail_length']},
        'pawDrop': drops,
    }


def triangles(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def export(scene, path):
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_active_scene=True,
                                  use_selection=False, use_visible=False, use_renderable=False,
                                  export_cameras=False, export_lights=False, export_extras=True,
                                  export_yup=True, export_apply=False, export_texcoords=False,
                                  export_normals=True, export_tangents=False, export_materials='NONE',
                                  export_vertex_color='ACTIVE',
                                  export_active_vertex_color_when_no_material=True,
                                  export_attributes=True, export_animations=False,
                                  export_draco_mesh_compression_enable=False)
    return path.stat().st_size


def compress(raw, out):
    """Runs gltf-transform: prune (keeping the rig attributes), then Draco with quantisation."""
    npx = shutil.which('npx.cmd') or shutil.which('npx')
    if not npx:
        return {'error': 'npx not found. Run gltf-transform draco by hand.'}
    tmp = Path(tempfile.mkdtemp(prefix='walker_'))
    pruned = tmp / 'prune.glb'
    steps = [['prune', str(raw), str(pruned), '--keep-attributes', 'true'],
             ['draco', str(pruned), str(out), '--method', 'edgebreaker', '--quantize-position', '14',
              '--quantize-normal', '10', '--quantize-color', '8', '--quantize-generic', '12']]
    for step in steps:
        r = subprocess.run([npx, '--yes', GLTF_TRANSFORM, *step], capture_output=True, text=True)
        if r.returncode:
            return {'error': f'{step[0]} failed', 'stderr': r.stderr[-2000:]}
    shutil.rmtree(tmp, ignore_errors=True)
    return {'bytes': out.stat().st_size}


def main():
    work = bpy.data.scenes.new('WalkerBuild')
    coll = bpy.data.collections.new('WalkerBuild')
    work.collection.children.link(coll)
    mats = wc.kit_materials(wc.KIT)
    with bpy.context.temp_override(scene=work, view_layer=work.view_layers[0]):
        stand = build_kit('stand', coll, mats, 'stand')
        start = straighten_tail(stand)
        rig = rig_data(stand, start)
        walk, walk_seams = bake(stand, 'Kinako_Walk', coll, rig=rig, start=start)
        sleep, _ = bake(build_kit('sleep', coll, mats, 'sleep'), 'Kinako_Sleep', coll)
    report = {'walk_triangles': triangles(walk), 'walk_vertices': len(walk.vertices),
              'walk_seam_vertices': walk_seams,
              'sleep_triangles': triangles(sleep), 'sleep_vertices': len(sleep.vertices)}
    print('WALKER', json.dumps(report))
    if report['walk_triangles'] > TRI_CAP:
        raise RuntimeError(f'Kinako_Walk has {report["walk_triangles"]} triangles, over {TRI_CAP}.')
    scene = bpy.data.scenes.new('WalkerExport')
    for me in (walk, sleep):
        ob = bpy.data.objects.new(me.name, me)
        scene.collection.objects.link(ob)
    scene.objects['Kinako_Walk']['kinako'] = json.dumps(rig)
    if '--count' not in sys.argv:
        raw = Path(tempfile.mkdtemp(prefix='walker_raw_')) / 'walker_raw.glb'
        report['raw_bytes'] = export(scene, raw)
        report['compress'] = compress(raw, OUT)
        if report['compress'].get('bytes', 0) > BYTE_CAP:
            report['over_budget'] = True
    report['rig'] = rig
    REPORT.write_text(json.dumps(report, indent=2) + '\n', newline='\n')
    print('WALKER', json.dumps({k: v for k, v in report.items() if k != 'rig'}))


main()

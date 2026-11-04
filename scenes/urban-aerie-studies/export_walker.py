"""Exports Kinako, the walker of explore on foot, to src/assets/models/walker.glb.

Run it in background Blender from the repository root:
    blender.exe --factory-startup -b --python scenes/urban-aerie-studies/export_walker.py

The script builds the approved kit from walker_concepts.py and walker_kit_geometry.py in a
new scene and bakes two meshes:
- Kinako_Walk: the stand pose as one mesh, with a straight tail. Each vertex keeps its part
  index in _part. Each tail vertex keeps its distance along the tail in _tail. The site turns
  each part about its pivot and bends the tail over its three joints in the vertex shader
  (src/scene/explore/walker-material.js). The tail is straight in the file, so the shader
  bends it from straight with the rest angles plus the pose.
- Kinako_Sleep: the sleep pose as a plain mesh.

Colours are face-corner colours from the concept material slots, so each colour stays one
coherent field. The normals are smooth inside each part. The node extras of Kinako_Walk
carry the rig as JSON: the part names, parents and pivots, the tail joints and the paw drops.

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
# The budgets from the E4 brief: the walk mesh triangles and the file size in bytes.
TRI_CAP = 3000
BYTE_CAP = 80 * 1024

# The rigid parts in uniform order. The site keeps one matrix per part.
PARTS = ('body', 'neck', 'head', 'ear_L', 'ear_R', 'eye_L', 'eye_R',
         *(f'{k}_{leg}' for leg in ('FL', 'FR', 'BL', 'BR') for k in ('leg_u', 'leg_l', 'paw')))
# The concept names of the leg parts are leg_FL_u, leg_FL_l and paw_FL.
CONCEPT = {f'{k}_{leg}': (f'leg_{leg}_{k[-1]}' if k.startswith('leg') else f'paw_{leg}')
           for leg in ('FL', 'FR', 'BL', 'BR') for k in ('leg_u', 'leg_l', 'paw')}
# Detail objects move with the part that carries them.
OWNER = {'muzzle': 'head', 'nose': 'head', 'mouth': 'head', 'blush_L': 'head', 'blush_R': 'head',
         'inner_L': 'ear_L', 'inner_R': 'ear_R', 'glint_L': 'eye_L', 'glint_R': 'eye_R'}
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


def part_of(key):
    """The rig part of a concept object key, or None for an object outside the rig."""
    if key in OWNER:
        return OWNER[key]
    for part in PARTS:
        if concept_key(part) == key:
            return part
    return None


def slot_colour(material):
    """The sRGB hex colour of a concept material slot, from its name WC_Kit_<colour>."""
    return wc.KIT['colours'][material.name.removeprefix('WC_Kit_')]


def build_kit(tag, coll, mats, pose):
    """Builds one kit in the pose. The render-only ink shell is skipped."""
    b = wc.build_kit(tag, coll, mats)
    b.build_ink = lambda: None
    wc.apply_pose(b, pose)
    return b


def straighten_tail(b):
    """Rebuilds the body mesh with a straight tail and returns the tail distance per vertex.

    The tail runs straight back along -X from the rump loop, so the distance along the tail
    is the drop in X from that loop. Body vertices keep 0.
    """
    body = b.parts['body']
    bm, region = geo.body_tail_mesh(b.cfg, [(0.0, 0.0)] * 3)
    start = geo.body_ring(b.cfg, geo.BODY_STATIONS[-1])[0]
    tail = [0.0] * len(bm.verts)
    bm.verts.index_update()
    for f in bm.faces:
        if f[region] != 1:
            continue
        for v in f.verts:
            tail[v.index] = max(0.0, start.x - v.co.x)
    bm.to_mesh(body.data)
    bm.free()
    bpy.context.view_layer.update()
    return tail, start


def bake(b, name, rig=None):
    """Joins the posed parts into one mesh in export space.

    rig: the per-vertex tail distance of the body, for the walk mesh. Without it, the mesh
    keeps no rig attributes.
    """
    bpy.context.view_layer.update()
    palette = []
    out = bmesh.new()
    colour = out.faces.layers.int.new('colour')
    part_layer = out.verts.layers.float.new('_part') if rig is not None else None
    tail_layer = out.verts.layers.float.new('_tail') if rig is not None else None
    for key, ob in b.parts.items():
        if key == '_ink' or ob.hide_render:
            continue
        part = part_of(key)
        if rig is not None and part is None:
            raise RuntimeError(f'{key} belongs to no rig part.')
        slots = []
        for m in ob.data.materials:
            hex_value = slot_colour(m)
            if hex_value not in palette:
                palette.append(hex_value)
            slots.append(palette.index(hex_value))
        me = ob.data.copy()
        me.transform(TO_EXPORT @ ob.matrix_world)
        n_verts, n_faces = len(out.verts), len(out.faces)
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
        out.verts.ensure_lookup_table()
        out.faces.ensure_lookup_table()
        for f in out.faces[n_faces:]:
            f[colour] = slots[f.material_index]
            f.material_index = 0
            f.smooth = True
        if rig is not None:
            index = PARTS.index(part)
            for i, v in enumerate(out.verts[n_verts:]):
                v[part_layer] = float(index)
                v[tail_layer] = rig[i] if key == 'body' else 0.0
    me = bpy.data.meshes.new(name)
    out.to_mesh(me)
    out.free()
    attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    face_colour = me.attributes['colour'].data
    for poly in me.polygons:
        hex_value = palette[face_colour[poly.index].value]
        rgb = [((hex_value >> s) & 0xFF) / 255 for s in (16, 8, 0)]
        for li in poly.loop_indices:
            attr.data[li].color_srgb = (*rgb, 1.0)
    me.attributes.remove(me.attributes['colour'])
    me.color_attributes.active_color = attr
    return me


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
        tail, start = straighten_tail(stand)
        walk = bake(stand, 'Kinako_Walk', rig=tail)
        rig = rig_data(stand, start)
        sleep = bake(build_kit('sleep', coll, mats, 'sleep'), 'Kinako_Sleep')
    report = {'walk_triangles': triangles(walk), 'walk_vertices': len(walk.vertices),
              'sleep_triangles': triangles(sleep), 'sleep_vertices': len(sleep.vertices)}
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

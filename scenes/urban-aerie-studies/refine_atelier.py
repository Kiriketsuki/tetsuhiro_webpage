"""Chosen atelier: glazed workshop, sheltered upper rooms, and integrated landscape.

Clones the chosen scene and geometry before editing. Original comparisons survive.
"""
from pathlib import Path
import json
import math
import runpy
import bpy
import bmesh
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parent
API = runpy.run_path(str(ROOT / 'build_aeries.py'))
Batch, mesh_object = API['Batch'], API['mesh_object']


def clone_collection(source, parent, mapping):
    c = bpy.data.collections.new('SH_' + source.name)
    parent.children.link(c)
    for old in source.objects:
        ob = old.copy(); ob.name = 'SH_' + old.name
        if old.data:
            ob.data = old.data.copy()
        c.objects.link(ob); mapping[old.name] = ob
    for child in source.children:
        clone_collection(child, c, mapping)
    return c


def remove_parts(ob, predicate):
    """Remove whole disconnected box components from a privately copied batch."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    unseen = set(bm.verts); removed = 0
    while unseen:
        group = {unseen.pop()}; stack = list(group)
        while stack:
            v = stack.pop()
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other in unseen:
                    unseen.remove(other); group.add(other); stack.append(other)
        center = sum((v.co for v in group), Vector()) / len(group)
        if predicate(center):
            bmesh.ops.delete(bm, geom=list(group), context='VERTS'); removed += 1
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return removed


def envelope(root, mapping, mats):
    upper = [(-3.8, 4.1, 4.15, 4.5, 4.3), (-3.15, 4.35, 7.3, 3.7, 3.9)]
    def upper_glass(q):
        return q.z > 4.25
    def old_wall(q):
        for cx, cy, z, w, d in upper:
            if z < q.z < z + 3.15:
                if abs(q.y - (cy - d / 2)) < .02 or abs(q.x - (cx + w / 2)) < .02:
                    return True
        return False
    def old_mullion(q):
        for cx, cy, z, w, d in upper:
            if z + .05 < q.z < z + 3.0:
                yf, x0, x1 = cy - d / 2, cx - w / 2, cx + w / 2
                if abs(q.y - (yf - .07)) < .025 and min(abs(q.x - x0), abs(q.x - x1)) > .03:
                    return True
                if abs(q.y - (yf - .08)) < .02 and abs(q.z - (z + .75)) < .02:
                    return True
                if abs(q.x - (x1 + .04)) < .02 and abs(q.y - cy) < .02:
                    return True
        return False
    counts = {
        'upper_glass_panels_removed': remove_parts(mapping['SS_UA_B_Atelier_Glazing'], upper_glass),
        'upper_wall_strips_replaced': remove_parts(mapping['SS_UA_B_Atelier_Walls'], old_wall),
        'old_mullions_removed': remove_parts(mapping['SS_UA_B_Atelier_Timber'], old_mullion),
    }
    c = API['collection']('Sheltered_Upper_Envelope', root)
    wall = Batch('SH_Solid_Upper_Walls', c, [mats['plaster'], mats['wood_light']])
    frame = Batch('SH_Recessed_Frames_and_Shutters', c, [mats['wood'], mats['wood_light'], mats['metal']])
    glass = Batch('SH_Recessed_Upper_Glazing', c, [mats['glass']])

    def facade(axis, plane, lo, hi, z0, z1, openings, material):
        xs = sorted(set([lo, hi] + [v for hole in openings for v in hole[:2]]))
        zs = sorted(set([z0, z1] + [v for hole in openings for v in hole[2:]]))
        for a, b in zip(xs, xs[1:]):
            for bot, top in zip(zs, zs[1:]):
                u, z = (a + b) / 2, (bot + top) / 2
                if any(left < u < right and low < z < high for left, right, low, high in openings):
                    continue
                if axis == 'front':
                    wall.box((u, plane + .06, z), (b - a, .32, top - bot), material)
                else:
                    wall.box((plane - .04, u, z), (.32, b - a, top - bot), material)
        for left, right, low, high in openings:
            u, z, width, height = (left + right) / 2, (low + high) / 2, right - left, high - low
            if axis == 'front':
                glass.box((u, plane + .12, z), (width - .10, .015, height - .10))
                for x in (left + .035, right - .035):
                    frame.box((x, plane + .04, z), (.07, .24, height), 0)
                for h in (low + .035, high - .035):
                    frame.box((u, plane + .04, h), (width, .24, .07), 0)
                frame.box((u, plane - .12, low - .025), (width + .20, .46, .10), 1)
                frame.box((u, plane + .11, z), (.045, .06, height - .08), 0)
            else:
                glass.box((plane - .13, u, z), (.015, width - .10, height - .10))
                for y in (left + .035, right - .035):
                    frame.box((plane - .04, y, z), (.24, .07, height), 0)
                for h in (low + .035, high - .035):
                    frame.box((plane - .04, u, h), (.24, width, .07), 0)
                frame.box((plane + .1, u, low - .025), (.46, width + .20, .10), 1)
                frame.box((plane - .10, u, z), (.06, .045, height - .08), 0)

    def shutters(plane, left, right, low, high):
        for side, x in ((-1, left - .06), (1, right + .06)):
            angle = -side * math.radians(38)
            rotation = Matrix.Rotation(angle, 4, 'Z')
            direction = Vector((side * math.cos(angle), side * math.sin(angle), 0))
            center = Vector((x, plane - .15, (low + high) / 2)) + direction * .20
            height = high - low
            for sign in (-1, 1):
                q = center + direction * sign * .18
                frame.box(q, (.045, .075, height + .10), 1, rotation)
            for j in range(12):
                q = center.copy(); q.z = low + j / 11 * height
                frame.box(q, (.38, .065, .085), 1, rotation)
            frame.box((x, plane - .15, low + .20), (.035, .12, .05), 2)
            frame.box((x, plane - .15, high - .20), (.035, .12, .05), 2)

    for index, (cx, cy, z, w, d) in enumerate(upper):
        yf, x0, x1 = cy - d / 2, cx - w / 2, cx + w / 2
        if index == 0:
            openings = [(cx - 1.50, cx - .60, z + .08, z + 2.62),
                        (cx - .10, cx + 1.40, z + .85, z + 2.52)]
            side = [(cy - 1.25, cy + .45, z + .95, z + 2.42),
                    (cy + 1.35, cy + 2.10, z + .08, z + 2.50)]
        else:
            openings = [(cx - 1.28, cx - .10, z + 1.00, z + 2.40),
                        (cx + .37, cx + 1.27, z + .08, z + 2.55)]
            side = [(cy - .50, cy + .95, z + 1.05, z + 2.36)]
        facade('front', yf, x0, x1, z, z + 3.15, openings, index)
        facade('side', x1, cy - d / 2, cy + d / 2, z, z + 3.15, side, 0)
        shutters(yf, *openings[1 if index == 0 else 0])
    for batch in (wall, frame, glass):
        ob = batch.finish(); API['LP']['grain_uv'](ob)
    # Warm light stays inside the window reveals, with the workshop most open below.
    for cx, cy, z, w, d in upper:
        API['BASE']['light']('SH_Window_Bounce', c, 'AREA', (cx, cy, z + 2.7), (1, .67, .40), 28, 1.8,
                             target=(cx, cy - d / 2, z + 1.0))
    return counts


def build():
    if bpy.data.scenes.get('UA_B_Atelier_Sheltered'):
        raise RuntimeError('Sheltered atelier already exists; edit it in place.')
    source = bpy.data.scenes['UA_B_Atelier']
    scene = source.copy(); scene.name = 'UA_B_Atelier_Sheltered'
    scene.compositing_node_group = source.compositing_node_group.copy()
    for node in scene.compositing_node_group.nodes:
        if node.type == 'R_LAYERS':
            node.scene = scene
    mapping = {}
    for name in ('UA_B_Atelier', 'UA_Shared_Corrected_Island'):
        old = bpy.data.collections[name]
        scene.collection.children.unlink(old)
        clone_collection(old, scene.collection, mapping)
    house = bpy.data.collections['SH_UA_B_Atelier_House']
    common = bpy.data.collections['SH_UA_Shared_Corrected_Island']
    mats = {key: bpy.data.materials['LP_SS_A_' + key] for key in
            ('wood', 'wood_light', 'metal', 'stone', 'rock', 'rock_light', 'rock_dark', 'grass', 'moss',
             'plaster', 'roof', 'roof_edge', 'glass', 'paper', 'screen', 'leaf', 'leaf_light', 'leaf_dark', 'warm')}
    report = {'envelope': envelope(house, mapping, mats)}
    landscape = runpy.run_path(str(ROOT / 'refine_landscape.py'))
    report['landscape'] = landscape['refine'](scene, common, mapping, mats)
    camera_collection = API['collection']('Sheltered_Cameras', scene.collection)
    garden = API['BASE']['camera']('SH_Garden', camera_collection, (19, -25, 13), (1, -2.5, 1.0), 52)
    garden.data.clip_end = 6500
    flow = runpy.run_path(str(ROOT / 'finish_flow.py'))
    report['flow_review'] = flow['finish'](scene, common, mapping)
    scene.camera = bpy.data.objects['SS_UA_House']
    scene.render.resolution_x = scene.render.resolution_y = 1500
    scene['Design'] = 'Chosen stacked atelier. Glazed workshop, sheltered upper rooms; connected faceted natural terrain, grounded approaches and flower beds.'
    if bpy.context.window:
        bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    path = ROOT / 'atelier_sheltered.blend'
    if path.exists():
        raise FileExistsError(path)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), check_existing=False)
    report['blend'], report['scene'] = str(path), scene.name
    (ROOT / 'sheltered_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    result = build()

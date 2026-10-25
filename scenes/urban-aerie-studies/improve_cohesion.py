"""Exact shoreline joins and a scene-wide grounding pass, with contact evidence."""
from pathlib import Path
import math
import json
import random
import runpy
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
API = runpy.run_path(str(ROOT / 'build_aeries.py'))
PATINA = runpy.run_path(str(ROOT / 'refine_pond_patina.py'))
GEO = runpy.run_path(str(ROOT / 'cohesion_geometry.py'))
FIELD = runpy.run_path(str(ROOT / 'refine_landscape.py'))


def clone_tree(source, parent, mapping):
    c = bpy.data.collections.new('CO_' + source.name); parent.children.link(c)
    for old in source.objects:
        ob = old.copy(); ob.name = 'CO_' + old.name
        if old.data: ob.data = old.data.copy()
        c.objects.link(ob); mapping[old.name] = ob
    for child in source.children: clone_tree(child, c, mapping)
    return c


def find(mapping, ending):
    matches = [o for name, o in mapping.items() if name.endswith(ending)]
    if len(matches) != 1:
        raise RuntimeError('Expected one ' + ending + ', got ' + str([o.name for o in matches]))
    return matches[0]


def ground_parts(ob, tree, sink, water_polygon=None, paths=None, shore_lines=None):
    bm, groups = PATINA['components'](ob.data); shifted = removed = 0
    for group in groups:
        center = sum((v.co for v in group), Vector()) / len(group)
        if water_polygon is not None and (GEO['inside'](Vector(center[:2]), water_polygon) or
                (shore_lines and GEO['nearest'](Vector(center[:2]), shore_lines, water_polygon)[0] < .20)):
            bmesh.ops.delete(bm, geom=list(group), context='VERTS'); removed += 1; continue
        if paths and any(GEO['sample'](p, center.x, center.y) is not None for p in paths):
            bmesh.ops.delete(bm, geom=list(group), context='VERTS'); removed += 1; continue
        bottom = min(v.co.z for v in group); top = max(v.co.z for v in group)
        foot = [v for v in group if v.co.z < bottom + (top - bottom) * .35 + .0001]
        offsets = [GEO['sample'](tree, v.co.x, v.co.y) - v.co.z for v in foot if GEO['sample'](tree, v.co.x, v.co.y) is not None]
        if offsets:
            dz = max(offsets) - sink
            for v in group: v.co.z += dz
            shifted += 1
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return {'grounded_parts': shifted, 'cleared_from_water_or_paths': removed}


def extend_feet(ob, tree, posts_only=False):
    bm, groups = PATINA['components'](ob.data); count = 0
    for group in groups:
        lo = Vector(tuple(min(v.co[i] for v in group) for i in range(3)))
        hi = Vector(tuple(max(v.co[i] for v in group) for i in range(3)))
        size = hi - lo
        if posts_only and not (size.x < .2 and size.y < .2 and lo.z < .35 and hi.z < .8):
            continue
        for v in group:
            if v.co.z < lo.z + .0001:
                h = GEO['sample'](tree, v.co.x, v.co.y)
                if h is not None: v.co.z = min(v.co.z, h - .10)
        count += 1
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return count


def reed_beds(common, mapping, terrain, lines, water_polygon):
    for name, ob in mapping.items():
        if 'Pond_Reed_Stems' in name or 'Reed_Blades' in name:
            ob.hide_render = True; ob.hide_viewport = True
    rock = find(mapping, 'Pond_Shore_Stones'); bm, groups = PATINA['components'](rock.data)
    obstacles = []
    for group in groups:
        center = sum((v.co for v in group), Vector()) / len(group)
        radius = max((Vector(v.co[:2]) - Vector(center[:2])).length for v in group)
        obstacles.append((Vector(center[:2]), radius))
    bm.free()
    polygon = [Vector(p[:2]) for p in lines[0][:23]] + [Vector(p[:2]) for p in reversed(lines[1][:23])][:-1]
    chosen = []
    for desired in [4, 10, 17, 30, 39]:
        candidates = []
        for offset in (.35, .55, .75):
            for j in range(max(1, desired - 4), min(len(polygon) - 1, desired + 5)):
                q = polygon[j]; normal = (q - Vector((4, 4))).normalized(); q = q + normal * offset
                if GEO['inside'](q, water_polygon) or any((q - c).length < r + .22 for c, r in obstacles): continue
                if any((q - p).length < .60 for p in chosen): continue
                if GEO['sample'](terrain, q.x, q.y) is None: continue
                candidates.append((abs(j - desired) + offset, q))
        if candidates: chosen.append(min(candidates, key=lambda p: p[0])[1])
    c = API['collection']('Cohesive_Reed_Beds', common)
    material = bpy.data.materials['SS_PT_Reed_Leaf']; seed = bpy.data.materials['SS_PT_Reed_Seed']
    batch = API['Batch']('CO_Grounded_Reeds', c, [material, seed])
    vertices, faces = [], []; rng = random.Random(2401)
    for q in chosen:
        for j in range(8):
            x, y = q.x + rng.uniform(-.11, .11), q.y + rng.uniform(-.10, .10)
            z = GEO['sample'](terrain, x, y); h = rng.uniform(.38, .70)
            batch.beam((x, y, z - .04), (x + .035, y, z + h), .017)
            if j % 3 == 0: batch.part('ico', (x + .035, y, z + h - .04), (.028, .028, .095), 1, 1)
            for side in (-1, 1):
                b = len(vertices); bend = side * rng.uniform(.14, .22)
                vertices.extend([(x - .022, y, z - .025), (x + .022, y, z - .025),
                                 (x + bend * .5, y + .04, z + h * .48), (x + bend, y + .05, z + h * .80)])
                faces.extend([(b, b + 1, b + 2), (b + 1, b + 3, b + 2)])
    batch.finish(); API['mesh_object']('CO_Rooted_Reed_Blades', vertices, faces, c, [material])
    return len(chosen)


def contact_pass(common, house, mapping, old_tree, tree, lines):
    water_polygon = [Vector(p[:2]) for p in lines[0]] + [Vector(p[:2]) for p in reversed(lines[1])][:-1]
    report = {}; path_objects = [find(mapping, 'Connected_Path_' + str(i)) for i in range(2)]
    # Closed path ribbons meet the terrain along their length while keeping step joins.
    for ob in path_objects:
        for v in ob.data.vertices:
            h = GEO['sample'](tree, v.co.x, v.co.y)
            if h is not None: v.co.z = h + .055 if v.co.z > .43 else h - .075
        ob.data.update()
    path_trees = [GEO['bvh'](ob) for ob in path_objects]
    for name, ob in mapping.items():
        if ob.type != 'MESH' or ob.hide_render: continue
        if any(k in name for k in ('Angular_Meadow', 'Ground_Planting', 'Grass_Accents')):
            report[name] = ground_parts(ob, tree, .03 if 'Planting' not in name else .07, water_polygon, path_trees, lines)
        elif any(k in name for k in ('Grounded_Stream_Banks', 'Pond_Shore_Stones')):
            report[name] = ground_parts(ob, tree, .07)
        elif any(k in name for k in ('Bridge_Abutments', 'Grounded_Foundation', 'Lookout_Access_Step')):
            report[name] = {'supported_footings': extend_feet(ob, tree)}
        elif name.endswith('City_Lookout'):
            report[name] = {'deck_posts_anchored': extend_feet(ob, tree, True)}
        elif 'Flower_' in name or name.endswith('Faceted_Flower_Petals'):
            for v in ob.data.vertices:
                h = GEO['sample'](tree, v.co.x, v.co.y)
                if h is not None: v.co.z += h - FIELD['height'](v.co.x, v.co.y) - .025
            ob.data.update()
    # Whole lantern assemblies use the foundation foot, not independent component centres.
    anchors = [(-3.7, -1.4), (-.6, -3.6), (1.8, -6.05), (6.9, -4.4), (10.9, -6.75)]
    lantern = find(mapping, 'Path_Lanterns')
    shifts = {}
    for x, y in anchors:
        matching = [v.co.z for v in lantern.data.vertices if abs(v.co.x - x) < .20 and abs(v.co.y - y) < .20]
        shifts[(x, y)] = GEO['sample'](tree, x, y) - .025 - min(matching)
    for v in lantern.data.vertices:
        anchor = min(anchors, key=lambda p: (v.co.x - p[0]) ** 2 + (v.co.y - p[1]) ** 2)
        v.co.z += shifts[anchor]
    lantern.data.update()
    for ob in common.all_objects:
        if ob.type == 'LIGHT':
            anchor = min(anchors, key=lambda p: (ob.location.x - p[0]) ** 2 + (ob.location.y - p[1]) ** 2)
            ob.location.z += shifts[anchor]
    # Balcony planters overlap their decking rather than hovering a centimetre above it.
    props = find(mapping, 'B_Atelier_Room_Life')
    bm, groups = PATINA['components'](props.data)
    for group in groups:
        center = sum((v.co for v in group), Vector()) / len(group)
        if (center.y < 1.7 and 4.30 < center.z < 5.05) or (center.y < 2.0 and 7.44 < center.z < 8.17):
            for v in group: v.co.z -= .025
    bm.to_mesh(props.data); bm.free(); props.data.update()
    report['reed_beds_relocated_clear_of_rocks'] = reed_beds(common, mapping, tree, lines, water_polygon)
    # Reattach surface wear marks after draping the paths.
    bridge = find(mapping, 'Garden_Footbridge'); bridge_tree = GEO['bvh'](bridge)
    marks = find(mapping, 'Fine_Handmade_Wear')
    for v in marks.data.vertices:
        if v.co.z < .8:
            hits = [GEO['sample'](p, v.co.x, v.co.y) for p in path_trees]; hits = [h for h in hits if h is not None]
            if hits: v.co.z = max(hits) + .002
        elif v.co.z < 2 and 1.9 < v.co.x < 6.7:
            h = GEO['sample'](bridge_tree, v.co.x, v.co.y)
            if h is not None: v.co.z = h + .002
    marks.data.update()
    report['lanterns_grounded'] = len(anchors)
    report['paths_draped_and_buried'] = 2
    return report


def review_contacts(scene, common, mapping, lines):
    if scene.get('Cohesion_ContactReview'): return {'status': 'already reviewed'}
    polygon = [Vector(p[:2]) for p in lines[0]] + [Vector(p[:2]) for p in reversed(lines[1])][:-1]
    removed = 0
    for name, ob in mapping.items():
        if ob.type != 'MESH' or ob.hide_render: continue
        if not any(k in name for k in ('Angular_Meadow', 'Ground_Planting', 'Grass_Accents', 'Grounded_Stream_Banks')): continue
        bm, groups = PATINA['components'](ob.data)
        for group in groups:
            center = sum((v.co for v in group), Vector()) / len(group)
            d, wz = GEO['nearest'](Vector(center[:2]), lines, polygon)
            clear = d < .20 if 'Grounded_Stream_Banks' not in name else (d < -.12 and center.y > 1.5)
            if clear: bmesh.ops.delete(bm, geom=list(group), context='VERTS'); removed += 1
        bm.to_mesh(ob.data); bm.free(); ob.data.update()
    bridge = find(mapping, 'Garden_Footbridge'); bm, groups = PATINA['components'](bridge.data)
    anchored = 0
    for group in groups:
        lo = Vector(tuple(min(v.co[i] for v in group) for i in range(3)))
        hi = Vector(tuple(max(v.co[i] for v in group) for i in range(3))); size = hi - lo
        board = size.y > 1.3 and size.x < .5 and size.z < .25
        if board: continue
        # Both handrails and their posts move inward onto the deck-bearing line.
        for v in group: v.co.y += .08 if v.co.y < -5.05 else -.08
        if size.x < .12 and size.y < .12 and size.z > .8:
            x = (lo.x + hi.x) / 2; t = max(0, min(1, (x - 2.2) / 4.16))
            bottom = .905 + .48 * math.sin(math.pi * t)
            for v in group:
                if v.co.z < lo.z + .0001: v.co.z = bottom
            anchored += 1
    bm.to_mesh(bridge.data); bm.free(); bridge.data.update()
    c = API['collection']('Bridge_Rail_Bearings', common)
    wood = bpy.data.materials['PT_LP_SS_A_wood']
    curbs = API['Batch']('CO_Bridge_Rail_Bearing_Timbers', c, [wood])
    for y in (-5.76, -4.34):
        for i in range(13):
            a = (2.2 + i * .32, y, .94 + .48 * math.sin(i / 13 * math.pi))
            b = (2.2 + (i + 1) * .32, y, .94 + .48 * math.sin((i + 1) / 13 * math.pi))
            curbs.beam(a, b, .11)
    ob = curbs.finish(); API['LP']['grain_uv'](ob)
    # Seat each actual planter-box bottom below the corresponding balcony deck top.
    props = find(mapping, 'B_Atelier_Room_Life'); bm, groups = PATINA['components'](props.data); pots = 0
    for group in groups:
        lo = Vector(tuple(min(v.co[i] for v in group) for i in range(3)))
        hi = Vector(tuple(max(v.co[i] for v in group) for i in range(3))); size = hi - lo
        if .40 < size.x < .50 and .24 < size.y < .34 and hi.y < 2:
            floor = 4.17 if lo.z < 6 else 7.32
            shift = floor + .048 - lo.z
            for v in group: v.co.z += shift
            pots += 1
    bm.to_mesh(props.data); bm.free(); props.data.update()
    scene['Cohesion_ContactReview'] = True
    return {'bridge_posts_seated_in_bearing_timbers': anchored, 'planters_seated': pots,
            'remaining_misplaced_shore_parts_removed': removed}


def build():
    if bpy.data.scenes.get('UA_B_Atelier_Cohesion'): raise RuntimeError('Cohesion scene already exists.')
    source = bpy.data.scenes['UA_B_Atelier_PondPatina']; scene = source.copy(); scene.name = 'UA_B_Atelier_Cohesion'
    scene.compositing_node_group = source.compositing_node_group.copy()
    for node in scene.compositing_node_group.nodes:
        if node.type == 'R_LAYERS': node.scene = scene
    mapping = {}
    for name in ('PT_SH_UA_B_Atelier', 'PT_SH_UA_Shared_Corrected_Island'):
        old = bpy.data.collections[name]; scene.collection.children.unlink(old); clone_tree(old, scene.collection, mapping)
    common = bpy.data.collections['CO_PT_SH_UA_Shared_Corrected_Island']; house = bpy.data.collections['CO_PT_SH_UA_B_Atelier_House']
    body = find(mapping, 'Connected_Island'); water = find(mapping, 'Pond_Stream_and_Waterfall')
    old_tree, tree, lines, polygon, shore_report = GEO['stitch_banks'](body, water)
    report = {'shoreline': shore_report, 'scene_contacts': contact_pass(common, house, mapping, old_tree, tree, lines),
              'terrain': API['audit_island'](body)}
    report['low_angle_contact_review'] = review_contacts(scene, common, mapping, lines)
    cameras = API['collection']('Cohesion_Contact_Cameras', scene.collection)
    for name, loc, target, lens in [
        ('CO_Pond_Waterline', (7.8, 1.0, 1.65), (4.9, 3.3, .62), 42),
        ('CO_Stream_Bank', (7.4, -2.5, 1.6), (4.7, -1.5, .56), 48),
        ('CO_Bridge_Contacts', (11, -10, 3.8), (4.2, -5, .9), 52),
        ('CO_House_Contacts', (6, -6, 3.5), (-1.9, 1.5, 1.4), 43)]:
        cam = API['BASE']['camera'](name, cameras, loc, target, lens); cam.data.clip_end = 6500
    scene.camera = bpy.data.objects['SS_PT_Pond']; scene.render.resolution_x=1800; scene.render.resolution_y=1300
    scene['Cohesion'] = 'Actual water-edge constraints in terrain topology; no surface-gap cover strips. Scene props grounded against final triangulated terrain.'
    if bpy.context.window: bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    path = ROOT / 'atelier_cohesion.blend'
    if path.exists(): raise FileExistsError(path)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), check_existing=False)
    report['blend'] = str(path); report['scene'] = scene.name
    (ROOT/'cohesion_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__': result = build()

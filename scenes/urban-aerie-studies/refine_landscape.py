"""Integrated faceted landform, grounded planting, and small colourful flower beds."""
from pathlib import Path
import math
import random
import runpy
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
API = runpy.run_path(str(ROOT / 'build_aeries.py'))
PATHS = API['PATHS']
STREAM = [(4, 3), (3.8, 1), (3.6, -1), (4, -3), (4.3, -5), (4.2, -7), (4.7, -9.3), (4.9, -12.5)]
TREES = [(-11, 5.5), (-12, 1), (-8.8, 8.5), (9, 6), (11, 1.5)]


def smooth(a, b, value):
    f = max(0, min(1, (value - a) / (b - a)))
    return f * f * (3 - 2 * f)


def distance_to_lines(x, y, lines):
    q = Vector((x, y)); distance = 100
    for path in lines:
        for a, b in zip(path, path[1:]):
            a, b = Vector(a), Vector(b); d = b - a
            t = max(0, min(1, (q - a).dot(d) / d.length_squared))
            distance = min(distance, (q - a - d * t).length)
    return distance


def rectangle_distance(x, y, bounds):
    x0, x1, y0, y1 = bounds
    return math.hypot(max(x0 - x, 0, x - x1), max(y0 - y, 0, y - y1))


def height(x, y):
    h = (.47 + .17 * math.sin(x * .43 + .7) * math.cos(y * .36)
         + .095 * math.sin(x * .79 - y * .53) + .045 * math.cos(x * 1.25 + y * .62))
    h += .28 * math.exp(-((x + 10.5) / 4.2) ** 2 - ((y - 3.5) / 5.3) ** 2)
    h += .18 * math.exp(-((x - 10) / 3.8) ** 2 - ((y - 4.5) / 4.4) ** 2)
    # Natural rises blend into level structural pads and a walkable path corridor.
    for bounds in [(-6.9, .7, .25, 7.1), (8.3, 11.8, -7.6, -4.7)]:
        influence = 1 - smooth(0, 1.25, rectangle_distance(x, y, bounds))
        h = h * (1 - influence) + .40 * influence
    path_d = distance_to_lines(x, y, PATHS)
    influence = 1 - smooth(.65, 1.35, path_d)
    h = h * (1 - influence) + .40 * influence
    for tx, ty in ((2.2, -5.05), (6.36, -5.05)):
        influence = 1 - smooth(.85, 1.8, math.hypot(x - tx, y - ty))
        h = h * (1 - influence) + .40 * influence
    for tx, ty in TREES:
        target = .72 if tx < 0 else .64
        influence = 1 - smooth(.55, 1.55, math.hypot(x - tx, y - ty))
        h = h * (1 - influence) + target * influence
    # Continuous channel sides, with lower ground beneath the visible water sheets.
    water_d = distance_to_lines(x, y, [STREAM])
    pond_r = math.sqrt(((x - 4) / 2.9) ** 2 + ((y - 4) / 2.5) ** 2)
    influence = max(1 - smooth(1.0, 1.65, water_d), 1 - smooth(.86, 1.24, pond_r))
    h = h * (1 - influence) + .04 * influence
    return h


def border(angle):
    r = 1 + .055 * math.sin(3 * angle + .5) + .035 * math.cos(2 * angle - .6) + .018 * math.sin(7 * angle)
    delta = math.atan2(math.sin(angle + 1.255), math.cos(angle + 1.255))
    outlet = math.exp(-(delta / .15) ** 2)
    return r * (1 - outlet) + .988 * outlet


def build_body(common, mats):
    n, nr = 96, 24
    vertices = [(0, 0, height(0, 0))]
    faces, indices = [], []
    for row in range(1, nr + 1):
        r = row / nr
        for i in range(n):
            a = i * math.tau / n
            x, y = 16 * r * border(a) * math.cos(a), 11.5 * r * border(a) * math.sin(a)
            vertices.append((x, y, height(x, y)))
    for i in range(n):
        faces.append((0, 1 + i, 1 + (i + 1) % n)); indices.append(0)
    for row in range(nr - 1):
        for i in range(n):
            a, b = 1 + row * n + i, 1 + row * n + (i + 1) % n
            d, e = a + n, b + n
            if (i + row) % 2:
                faces.extend([(a, d, b), (b, d, e)])
            else:
                faces.extend([(a, d, e), (a, e, b)])
            indices.extend([0, 0])
    previous = 1 + (nr - 1) * n
    layers = [(1.005, -1.0), (.98, -2.6), (.925, -4.5), (.85, -6.7),
              (.75, -9.1), (.62, -11.6), (.49, -13.9), (.35, -16.0), (.21, -18.0), (.075, -19.4)]
    for k, (radius, z) in enumerate(layers):
        start = len(vertices)
        for i in range(n):
            a = i * math.tau / n
            fault = 1 + .022 * math.sin(7 * a + .12 * k) + .014 * math.sin(13 * a - .06 * k)
            r = radius * border(a) * fault
            vertices.append((16 * r * math.cos(a) + .10 * k, 11.5 * r * math.sin(a) + .08 * k,
                             z + .28 * math.sin(4 * a + .23 * k) + .13 * math.sin(9 * a)))
        for i in range(n):
            a, b = previous + i, previous + (i + 1) % n
            d, e = start + i, start + (i + 1) % n
            faces.extend([(a, d, b), (b, d, e)]); indices.extend([1, 1])
        previous = start
    tip = len(vertices); vertices.append((1.2, 1.0, -20.4))
    for i in range(n):
        faces.append((previous + i, tip, previous + (i + 1) % n)); indices.append(1)
    ob = API['mesh_object']('SH_Integrated_Landform', vertices, faces, common, [mats['grass'], mats['rock']], indices)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(ob.data); bm.free()
    return ob


def settle_parts(ob, ground_offset=-.035):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    unseen = set(bm.verts); count = 0
    while unseen:
        group = {unseen.pop()}; stack = list(group)
        while stack:
            v = stack.pop()
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other in unseen:
                    unseen.remove(other); group.add(other); stack.append(other)
        center = sum((v.co for v in group), Vector()) / len(group)
        shift = height(center.x, center.y) + ground_offset - min(v.co.z for v in group)
        for v in group:
            v.co.z += shift
        count += 1
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return count


def flowers(common, mats):
    c = API['collection']('Flower_Beds', common)
    palette = [('Rose', (.73, .28, .43)), ('Lavender', (.42, .34, .74)),
               ('Butter', (.94, .69, .28)), ('Cream', (.86, .80, .62))]
    petals = [API['BASE']['material']('SH_Flower_' + name, color, .87, emission=.075) for name, color in palette]
    flower = API['Batch']('SH_Flower_Centres', c, [mats['wood_light'], mats['leaf']])
    stems = API['Batch']('SH_Flower_Stems', c, [mats['leaf_dark']])
    vertices, faces, indices = [], [], []
    leaves, leaf_faces, leaf_indices = [], [], []
    rng = random.Random(2001); count = 0
    beds = [(-5.2, -1.9, 1.05, .65, 0), (-.5, -2.2, .80, .55, 2),
            (-8.0, -5.6, 1.25, .85, 1), (7.3, -7.7, .85, .60, 0),
            (12, 3.2, 1.0, .70, 2), (-11.0, -3.3, .9, .6, 3), (7.7, 7.1, .8, .65, 1)]
    for x0, y0, sx, sy, colour in beds:
        for j in range(34):
            a = rng.uniform(0, math.tau); r = math.sqrt(rng.random())
            x, y = x0 + sx * r * math.cos(a), y0 + sy * r * math.sin(a)
            if distance_to_lines(x, y, PATHS) < .65 or distance_to_lines(x, y, [STREAM]) < 1.8:
                continue
            z = height(x, y); h = rng.uniform(.23, .52)
            center = Vector((x + rng.uniform(-.055, .055), y, z + h))
            stems.beam((x, y, z - .025), center, .018)
            flower.part('ico', center, (.045, .045, .035), 0, 1)
            spin = rng.uniform(0, math.tau)
            for k in range(5):
                a = spin + k * math.tau / 5
                u = Vector((math.cos(a), math.sin(a), .15))
                v = Vector((-math.sin(a), math.cos(a), 0))
                b = len(vertices)
                size = rng.uniform(.115, .15)
                vertices.extend([tuple(center), tuple(center + u * size * .55 + v * size * .40),
                                 tuple(center + u * size + Vector((0, 0, .025))),
                                 tuple(center + u * size * .55 - v * size * .40),
                                 tuple(center + u * size * .50 + Vector((0, 0, .038)))])
                faces.extend([(b, b + 1, b + 4), (b + 1, b + 2, b + 4),
                              (b + 2, b + 3, b + 4), (b + 3, b, b + 4)])
                indices.extend([colour if j % 7 else 3] * 4)
            for side in (-1, 1):
                u = Vector((side * .7, .3, .5)).normalized(); v = Vector((0, 1, 0))
                API['LP']['folded_leaf'](Vector((x, y, z + h * .43)), u, v, Vector((0, 0, 1)),
                                         .12, .04, leaves, leaf_faces, leaf_indices, 0)
            count += 1
    stems.finish(); flower.finish()
    API['mesh_object']('SH_Faceted_Flower_Petals', vertices, faces, c, petals, indices)
    API['mesh_object']('SH_Flower_Leaves', leaves, leaf_faces, c, [mats['leaf']], leaf_indices)
    return count


def refine(scene, common, mapping, mats):
    body = mapping['SS_UA_Connected_Island']
    new = build_body(common, mats)
    body.data = new.data; bpy.data.objects.remove(new, do_unlink=True)
    body['Continuity'] = 'One closed connected landform; naturally raised groves, level pads, continuous channel banks. Flat polygon normals throughout.'
    moved = {}
    for name, ob in mapping.items():
        if ob.type == 'MESH' and any(k in name for k in ('Tree_Branches', 'Tree_Canopies', 'Faceted_Crown_Sprays')):
            for v in ob.data.vertices:
                v.co.z += .32 if v.co.x < 0 else .24
            ob.data.update()
        elif ob.type == 'MESH' and any(k in name for k in ('Angular_Meadow', 'Grass_Accents', 'Ground_Planting')):
            moved[name] = settle_parts(ob, -.025 if 'Planting' not in name else -.08)
        elif ob.type == 'MESH' and 'Grounded_Stream_Banks' in name:
            moved[name] = settle_parts(ob, -.08)
        elif ob.type == 'MESH' and 'Path_Lanterns' in name:
            anchors = [(-3.7, -1.4), (-.6, -3.6), (1.8, -6.05), (6.9, -4.4), (10.9, -6.75)]
            for v in ob.data.vertices:
                x, y = min(anchors, key=lambda p: (p[0] - v.co.x) ** 2 + (p[1] - v.co.y) ** 2)
                v.co.z += height(x, y) - .4
            ob.data.update()
        elif ob.type == 'LIGHT':
            ob.location.z += height(ob.location.x, ob.location.y) - .4
    # The path ribbons use the same height function as the land beneath them.
    for i in range(2):
        ob = mapping['SS_UA_Connected_Path_' + str(i)]
        for v in ob.data.vertices:
            old = API['top_height'](v.co.x, v.co.y)
            v.co.z += height(v.co.x, v.co.y) - old
        ob.data.update()
    flower_count = flowers(common, mats)
    return {'terrain': API['audit_island'](body), 'flower_count': flower_count,
            'settled_plant_components': sum(moved.values()),
            'height_range_on_top': [round(min(v.co.z for v in body.data.vertices[:2305]), 3),
                                    round(max(v.co.z for v in body.data.vertices[:2305]), 3)],
            'tree_geometry': 'Accepted faceted trees retained and translated to raised grove pads.',
            'approaches': 'House, bridge and lookout pads level; paths follow the same terrain height field.'}

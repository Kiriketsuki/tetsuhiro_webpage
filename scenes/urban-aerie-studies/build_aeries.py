"""Three editable compact house studies on one connected, repaired sanctuary.

All earlier studies are retained. Shared meshes are copied before any edits.
"""
from pathlib import Path
import json
import math
import random
import runpy
import bpy
import bmesh
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parent
BASE = runpy.run_path(str(ROOT.parent / 'sanctuary-style-studies' / 'build_studies.py'))
LP = runpy.run_path(str(ROOT.parent / 'cozy-lowpoly' / 'build_faceted.py'))
Batch, mesh_object = BASE['Batch'], BASE['mesh_object']
PATHS = [[(-3, .52), (-3, -1.6), (-1.9, -3.25), (.1, -4.25), (1.45, -5.05)],
         [(7.10, -5.05), (7.5, -5.05), (8.45, -5.95)]]


def collection(name, parent):
    c = bpy.data.collections.new('UA_' + name)
    parent.children.link(c)
    return c


def top_height(x, y):
    # Nearly level inhabited plateau, with a genuine recess under the stream.
    z = .40 + .035 * math.sin(x * .5) * math.sin(y * .4)
    channel = [(4, 3), (3.8, 1), (3.6, -1), (4, -3), (4.3, -5), (4.2, -7), (4.7, -9.3), (4.9, -12.5)]
    q = Vector((x, y))
    distance = 100
    for a, b in zip(channel, channel[1:]):
        a, b = Vector(a), Vector(b); d = b - a
        t = max(0, min(1, (q - a).dot(d) / d.length_squared))
        distance = min(distance, (q - a - d * t).length)
    if distance < 1.25 or ((x - 4) / 2.9) ** 2 + ((y - 4) / 2.5) ** 2 < .9:
        z -= .35
    return z


def island(c, mats):
    n, nr = 96, 12
    vertices = [(0, 0, top_height(0, 0))]
    faces, indices = [], []
    def border(a):
        return 1 + .045 * math.sin(5 * a + .3) + .03 * math.sin(9 * a)
    for row in range(1, nr + 1):
        r = row / nr
        for i in range(n):
            a = i * math.tau / n
            x, y = 16 * r * border(a) * math.cos(a), 11.5 * r * border(a) * math.sin(a)
            vertices.append((x, y, top_height(x, y)))
    for i in range(n):
        faces.append((0, 1 + i, 1 + (i + 1) % n)); indices.append(0)
    for row in range(nr - 1):
        for i in range(n):
            a, b = 1 + row * n + i, 1 + row * n + (i + 1) % n
            d, e = a + n, b + n
            faces.extend([(a, d, e), (a, e, b)]); indices.extend([0, 0])
    previous = 1 + (nr - 1) * n
    # All layers are rings of the SAME mesh. Faults continue through adjacent rings.
    layers = [(1.015, -1.1), (.97, -3.3), (.90, -5.8), (.79, -8.5),
              (.68, -11.2), (.53, -13.6), (.39, -15.9), (.23, -18.0), (.08, -19.3)]
    for k, (radius, z) in enumerate(layers):
        start = len(vertices)
        for i in range(n):
            a = i * math.tau / n
            # Large planar ridges instead of randomly displaced pebble-like outgrowths.
            fault = 1 + .035 * math.sin(7 * a + .08 * k) + .018 * math.sin(13 * a)
            r = radius * border(a) * fault
            vertices.append((16 * r * math.cos(a) + .13 * k, 11.5 * r * math.sin(a),
                             z + .17 * math.sin(4 * a + .3 * k)))
        for i in range(n):
            a, b = previous + i, previous + (i + 1) % n
            d, e = start + i, start + (i + 1) % n
            faces.extend([(a, d, b), (b, d, e)])
            # Broad strata carry the colour; normals describe the smaller planes.
            m = 1 + ((i // 12 + k // 3) % 3)
            indices.extend([m, m])
        previous = start
    tip = len(vertices); vertices.append((1.1, .5, -20.1))
    for i in range(n):
        faces.append((previous + i, tip, previous + (i + 1) % n)); indices.append(3)
    ob = mesh_object('UA_Connected_Island', vertices, faces, c,
                     [mats['grass'], mats['rock'], mats['rock_light'], mats['rock_dark']], indices)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(ob.data); bm.free()
    ob['Mesh_Contract'] = 'One connected closed manifold: shared plateau/cliff boundary vertices, no disconnected outcrops.'
    return ob


def near_path(point, margin=.62):
    q = Vector((point.x, point.y))
    for path in PATHS:
        for a, b in zip(path, path[1:]):
            a, b = Vector(a), Vector(b); d = b - a
            t = max(0, min(1, (q - a).dot(d) / d.length_squared))
            if (q - a - d * t).length < margin:
                return True
    return False


def path_mesh(name, points, c, material, width=.92):
    vertices, faces = [], []
    for j, point in enumerate(points):
        tangent = Vector(points[min(j + 1, len(points) - 1)]) - Vector(points[max(0, j - 1)])
        tangent.normalize(); side = Vector((-tangent.y, tangent.x)) * width / 2
        for p in (Vector(point) - side, Vector(point) + side):
            vertices.append((p.x, p.y, top_height(p.x, p.y) + .075))
    # Closed thin path ribbon physically overlaps the terrain.
    length = len(vertices)
    vertices += [(x, y, z - .12) for x, y, z in vertices]
    for j in range(len(points) - 1):
        b = j * 2
        faces.extend([(b, b + 1, b + 3, b + 2), (b + length + 2, b + length + 3, b + length + 1, b + length),
                      (b, b + 2, b + length + 2, b + length),
                      (b + 1, b + length + 1, b + length + 3, b + 3)])
    faces.extend([(0, length, length + 1, 1), (length - 2, length - 1, 2 * length - 1, 2 * length - 2)])
    ob = mesh_object(name, vertices, faces, c, [material])
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(ob.data); bm.free()
    return ob


def bridge_and_garden(c, mats):
    # Foundations rise from inside the earth to the underside of the existing deck.
    stone = Batch('UA_Bridge_Abutments', c, [mats['stone'], mats['rock']])
    for x, direction in ((2.2, -1), (6.36, 1)):
        stone.box((x, -5.05, .54), (.67, 1.83, .62))
        stone.box((x + direction * .42, -5.05, .59), (.35, 1.72, .33))
        stone.box((x + direction * .71, -5.05, .47), (.33, 1.40, .15))
    stone.finish()
    step = Batch('UA_Lookout_Access_Step', c, [mats['stone']])
    step.box((8.55, -5.95, .50), (.55, 1.0, .18)); step.finish()
    beams = Batch('UA_Load_Bearing_Bridge_Beams', c, [mats['wood']])
    for y in (-5.65, -4.45):
        for i in range(13):
            x0, x1 = 2.2 + i * .32, 2.2 + (i + 1) * .32
            z0, z1 = .77 + .48 * math.sin(i / 13 * math.pi), .77 + .48 * math.sin((i + 1) / 13 * math.pi)
            beams.beam((x0, y, z0), (x1, y, z1), .14)
    beams.finish()
    for i, path in enumerate(PATHS):
        path_mesh('UA_Connected_Path_' + str(i), path, c, mats['path'])
    # Pond/stream banks are separate grounded props, never a disconnected terrain shell.
    bank = Batch('UA_Grounded_Stream_Banks', c, [mats['stone'], mats['rock_light'], mats['moss']])
    rng = random.Random(803)
    stream = [(4, 3), (3.8, 1), (3.6, -1), (4, -3), (4.3, -5), (4.2, -7), (4.7, -9.3)]
    for x, y in stream:
        for side in (-1, 1):
            if -6 < y < -4:
                continue
            bank.part('ico', (x + side * 1.35, y, .43), (.50, .73, .29), rng.randrange(3), 1)
    for i in range(11):
        a = i * math.tau / 11
        bank.part('ico', (4 + 3.05 * math.cos(a), 4 + 2.65 * math.sin(a), .43), (.57, .58, .24), 0, 1)
    bank.finish()
    look = Batch('UA_City_Lookout', c, [mats['wood'], mats['wood_light'], mats['metal']])
    for i in range(10):
        look.box((8.8 + i * .29, -6.15, .63), (.27, 2.35, .15), i % 2)
    for x in (8.8, 11.4):
        for y in (-7.25, -5.05):
            look.box((x, y, .43), (.13, .13, .48), 2)
    for x in (8.8, 9.65, 10.5, 11.4):
        look.box((x, -7.25, 1.10), (.065, .065, .95), 2)
    look.box((10.1, -7.25, 1.57), (2.7, .08, .08), 2)
    look.box((10.1, -5.35, 1.04), (1.65, .52, .13), 1)
    look.box((10.1, -5.12, 1.42), (1.65, .09, .66), 1)
    for x in (9.4, 10.8):
        look.box((x, -5.35, .80), (.10, .42, .42), 2)
    look.finish()
    lanterns = Batch('UA_Path_Lanterns', c, [mats['stone'], mats['metal'], mats['warm']])
    for x, y in [(-3.7, -1.4), (-.6, -3.6), (1.8, -6.05), (6.9, -4.4), (10.9, -6.75)]:
        lanterns.box((x, y, .68), (.25, .25, .5))
        lanterns.box((x, y, 1.0), (.22, .22, .19), 2)
        lanterns.box((x, y, 1.13), (.35, .35, .08), 1)
        BASE['light']('UA_Path_Light', c, 'POINT', (x, y, 1.0), (1, .59, .28), 7, .2)
    lanterns.finish()


class House:
    def __init__(self, label, root, mats):
        self.c = collection(label + '_House', root)
        self.m = mats
        self.wood = Batch('UA_' + label + '_Timber', self.c, [mats['wood'], mats['wood_light'], mats['metal']])
        self.walls = Batch('UA_' + label + '_Walls', self.c, [mats['plaster'], mats['stone'], mats['roof']])
        self.glass = Batch('UA_' + label + '_Glazing', self.c, [mats['glass']])
        self.props = Batch('UA_' + label + '_Room_Life', self.c, [mats['wood_light'], mats['paper'], mats['metal'], mats['screen'], mats['leaf'], mats['warm'], mats['fabric']])
        self.roof = Batch('UA_' + label + '_Roof', self.c, [mats['roof'], mats['roof_edge']])
        self.label = label

    def foundation(self, cx, cy, width, depth):
        # Embed the base in the plateau and overlap the ground-floor slab.
        self.walls.box((cx, cy, .57), (width + .20, depth + .20, .80), 1)

    def room(self, cx, cy, floor, width, depth, height, kind, cladding=False):
        x0, x1, yf, yb = cx - width / 2, cx + width / 2, cy - depth / 2, cy + depth / 2
        self.walls.box((cx, cy, floor - .12), (width + .12, depth + .12, .24), 1)
        for i in range(math.ceil(width / .25)):
            x = x0 + .13 + i * .25
            if x < x1:
                self.wood.box((x, cy, floor + .025), (.24, depth, .05), i % 2)
        self.walls.box((cx, yb, floor + height / 2), (width, .14, height))
        self.walls.box((x0, cy, floor + height / 2), (.14, depth, height))
        self.walls.box((cx, yf, floor + height - .15), (width, .17, .30))
        self.walls.box((cx, yf, floor + .22), (width, .17, .44))
        self.walls.box((x1, cy, floor + .28), (.14, depth, .56))
        self.walls.box((x1, cy, floor + height - .18), (.14, depth, .36))
        for y in (yf + .25, yb - .25):
            self.walls.box((x1, y, floor + height / 2), (.14, .5, height))
        self.glass.box((cx, yf - .01, floor + height / 2), (width - .28, .015, height - .48))
        self.glass.box((x1 + .01, cy, floor + height / 2), (.015, depth - 1.0, height - .67))
        for x in (x0, x0 + width * .29, cx + width * .15, x1):
            self.wood.box((x, yf - .07, floor + height / 2), (.10, .15, height))
        self.wood.box((cx, yf - .08, floor + .75), (width, .12, .08))
        self.wood.box((x1 + .04, cy, floor + height / 2), (.12, .09, height))
        self.wood.box((cx, yf, floor + height), (width + .18, .22, .22))
        self.wood.box((x1, cy, floor + height), (.20, depth + .15, .22))
        if cladding:
            for j in range(10):
                self.wood.box((x0 - .10, cy, floor + .25 + j * (height - .4) / 10), (.06, depth, .09), j % 2)
        p = self.props
        if kind == 'workshop':
            p.box((cx + .25, cy + .35, floor + .93), (2.1, .75, .12))
            for x in (cx - .58, cx + 1.08):
                p.box((x, cy + .35, floor + .48), (.09, .56, .9), 2)
            for x in (cx - .28, cx + .62):
                p.box((x, cy + .58, floor + 1.40), (.78, .08, .50), 2)
                p.box((x, cy + .53, floor + 1.40), (.68, .018, .40), 3)
                p.box((x, cy + .58, floor + 1.08), (.07, .07, .30), 2)
            p.box((cx + .25, cy, floor + 1.02), (.8, .24, .035), 2)
            p.box((cx + .25, cy - .56, floor + .59), (.52, .55, .11), 6)
            p.box((cx + .25, cy - .8, floor + .92), (.52, .10, .65), 6)
        elif kind == 'living':
            p.box((cx - .25, cy + .6, floor + .48), (1.9, .75, .32), 6)
            p.box((cx - .25, cy + .94, floor + .91), (1.95, .17, .80), 6)
            p.box((cx - .25, cy - .50, floor + .52), (1.3, .72, .12))
            p.box((cx - .25, cy - .50, floor + .60), (.36, .28, .035), 1)
            p.box((cx - .65, cy + .58, floor + .81), (.48, .44, .17), 1)
        else:
            p.box((cx, cy + .6, floor + .30), (1.65, 2.1, .42))
            p.box((cx, cy + .43, floor + .62), (1.53, 1.55, .22), 6)
            p.box((cx, cy + 1.26, floor + .67), (1.1, .45, .18), 1)
        # Bookcase and suspended polygonal lamp make each floor inhabitable.
        for z in (.70, 1.35, 2.0):
            p.box((cx - width * .25, yb - .30, floor + z), (1.55, .40, .07))
            for j in range(7):
                p.box((cx - width * .25 - .65 + j * .20, yb - .30, floor + z + .20), (.12, .25, .33), 1 if j % 3 else 0)
        p.box((cx, cy, floor + height - .40), (.43, .43, .12), 5)
        p.box((cx, cy, floor + height - .19), (.025, .025, .30), 2)
        BASE['light']('UA_' + self.label + '_Interior', self.c, 'AREA',
                      (cx, cy - .25, floor + height - .5), (1, .64, .34), 90, 2.3,
                      target=(cx, cy, floor))

    def balcony(self, cx, y, z, width, depth=1.05):
        w = self.wood
        for i in range(max(3, int(width / .22))):
            x = cx - width / 2 + .11 + i * .22
            w.box((x, y, z), (.20, depth, .12), i % 2)
        for x in (cx - width / 2, cx, cx + width / 2):
            w.box((x, y - depth / 2, z + .50), (.065, .065, 1.0), 2)
        w.box((cx, y - depth / 2, z + 1.02), (width, .07, .07), 2)
        for x in (cx - width / 2, cx + width / 2):
            w.box((x, y, z + 1.02), (.07, depth, .07), 2)
        for j in range(9):
            w.box((cx - width / 2 + (j + 1) * width / 10, y - depth / 2, z + .50), (.028, .04, .92), 2)
        for x in (cx - width * .32, cx + width * .32):
            self.props.box((x, y - depth * .26, z + .22), (.45, .29, .30))
            self.props.part('ico', (x, y - depth * .26, z + .48), (.38, .24, .23), 4, 1)

    def pitched_roof(self, cx, cy, z, width, depth, rise, dormer=False):
        slope = rise / (width / 2)
        for sign in (-1, 1):
            a = sign * math.atan(slope)
            surface_width = math.sqrt((width / 2) ** 2 + rise ** 2)
            self.roof.box((cx + sign * width / 4, cy, z + rise / 2),
                          (surface_width + .35, depth + .7, .14), 0, Matrix.Rotation(a, 4, 'Y'))
            for row in range(9):
                d = (row + .3) / 9 * width / 2
                h = z + rise - d * slope + .10
                for col in range(14):
                    y = cy - depth / 2 - .20 + col * (depth + .4) / 13
                    self.roof.box((cx + sign * d, y, h), (.045, .033, .045), 1)
            self.wood.beam((cx, cy - depth / 2 - .36, z + rise),
                           (cx + sign * (width / 2 + .18), cy - depth / 2 - .36, z - .12), .16)
        self.roof.box((cx, cy, z + rise + .07), (.16, depth + .85, .15), 1)
        # Gable infill with an actual glazed triangular opening.
        yf, yb = cy - depth / 2, cy + depth / 2
        v = [(cx - width / 2, yb, z), (cx + width / 2, yb, z), (cx, yb, z + rise)]
        mesh_object('UA_' + self.label + '_Rear_Gable', v, [(0, 1, 2)], self.c, [self.m['plaster']])
        v = [(cx - width / 2, yf, z), (cx + width / 2, yf, z), (cx, yf, z + rise)]
        mesh_object('UA_' + self.label + '_Glazed_Gable', v, [(0, 1, 2)], self.c, [self.m['glass']])
        self.wood.beam((cx, yf - .04, z), (cx, yf - .04, z + rise), .09)
        if dormer:
            # Small angular reading window projecting from the right roof plane.
            self.walls.box((cx + .95, cy - .3, z + 2.2), (1.2, 1.45, 1.25))
            self.glass.box((cx + 1.57, cy - .3, z + 2.3), (.01, 1.0, .85))
            self.roof.box((cx + 1.1, cy - .3, z + 2.93), (1.75, 1.75, .12), 1,
                          Matrix.Rotation(.12, 4, 'Y'))

    def entry(self, cx=-3, yf=1.6):
        # Shared path terminates at a real staircase meeting the entry landing.
        for j in range(3):
            self.walls.box((cx, yf - .22 - j * .34, .80 - j * .15), (1.45, .46, .22), 1)
        self.wood.box((cx, yf + .02, 2.0), (1.0, .12, 2.12), 0)
        self.glass.box((cx, yf - .05, 2.14), (.77, .015, 1.6))
        self.props.box((cx + .34, yf - .13, 1.96), (.045, .055, .12), 2)
        self.roof.box((cx, yf - .40, 3.28), (1.8, .9, .10), 1)

    def finish(self):
        for batch in (self.wood, self.walls, self.glass, self.props, self.roof):
            ob = batch.finish()
            LP['grain_uv'](ob)
            for f in ob.data.polygons:
                f.use_smooth = False


def townhouse(root, mats):
    h = House('A_Townhouse', root, mats)
    h.foundation(-3, 4, 4.4, 4.8)
    for i, kind in enumerate(('workshop', 'living', 'bedroom')):
        h.room(-3, 4.0, 1 + i * 3.15, 4.4, 4.8, 3.15, kind, i == 1)
    h.balcony(-3, .98, 4.17, 3.5, 1.15)
    h.pitched_roof(-3, 4.0, 10.45, 4.7, 5.0, 2.1)
    # Tall urban proportions: narrow vertical corner posts and compact brick plinth.
    for x in (-5.25, -.75):
        h.wood.box((x, 1.53, 5.72), (.17, .18, 9.65))
    h.entry(); h.finish()


def atelier(root, mats):
    h = House('B_Atelier', root, mats)
    h.foundation(-3, 3.8, 4.5, 4.4)
    h.walls.box((-.20, 1.35, .65), (.98, .45, .65), 1)
    h.walls.box((-.20, 1.02, .60), (.98, .35, .30), 1)
    h.walls.box((-.20, .72, .48), (.98, .35, .16), 1)
    specs = [(-3, 3.8, 1, 4.5, 4.4, 'workshop'),
             (-3.8, 4.1, 4.15, 4.5, 4.3, 'living'),
             (-3.15, 4.35, 7.3, 3.7, 3.9, 'bedroom')]
    for cx, cy, z, w, d, kind in specs:
        h.room(cx, cy, z, w, d, 3.15, kind, kind != 'workshop')
        h.roof.box((cx, cy, z + 3.15), (w + .40, d + .40, .18), 1)
    h.balcony(-3.8, 1.35, 4.17, 4.3, 1.2)
    h.balcony(-3.15, 1.78, 7.32, 3.45, 1.35)
    # A real two-flight outside stair, with landings and railings connected to each floor.
    for floor in range(2):
        x = -.20 if floor == 0 else -1.15
        start_y, end_y = (1.35, 5.9) if floor == 0 else (5.9, 1.85)
        for j in range(18):
            t = j / 17
            y, z = start_y + (end_y - start_y) * t, 1.0 + floor * 3.15 + 3.15 * t
            h.wood.box((x, y, z), (.86, .28, .10), 1)
        for side in (-1, 1):
            h.wood.beam((x + side * .42, start_y, 1.0 + floor * 3.15 + 1),
                        (x + side * .42, end_y, 4.15 + floor * 3.15 + 1), .055, mat=2)
            h.wood.beam((x + side * .35, start_y, .89 + floor * 3.15),
                        (x + side * .35, end_y, 4.04 + floor * 3.15), .12, mat=2)
            for t in (0, .5, 1):
                y = start_y + (end_y - start_y) * t
                z = 1 + floor * 3.15 + t * 3.15
                h.wood.box((x + side * .42, y, z + .49), (.055, .055, 1.03), 2)
        h.wood.box((x - .5, end_y, 4.15 + floor * 3.15), (1.8, .9, .12), 1)
    # Roof pergola is an open, angular cap rather than another full building level.
    for x in (-4.7, -1.6):
        for y in (2.65, 6.0):
            h.wood.box((x, y, 11.15), (.11, .11, 1.5), 2)
    for j in range(9):
        h.wood.box((-3.15, 2.65 + j * .42, 11.93), (3.5, .12, .10), 0)
    h.entry(yf=1.6); h.finish()


def cottage(root, mats):
    h = House('C_Cottage', root, mats)
    h.foundation(-3, 4, 5.3, 5.0)
    h.room(-3, 4.0, 1, 5.3, 5.0, 3.15, 'workshop')
    h.room(-3, 4.0, 4.15, 5.3, 5.0, 2.8, 'living', True)
    # Attic has a floor and furniture, framed inside the steep roof rather than a third box.
    h.walls.box((-3, 4, 7.02), (5.3, 5, .22), 1)
    h.props.box((-3, 4.6, 7.46), (1.65, 2.0, .45))
    h.props.box((-3, 4.45, 7.78), (1.55, 1.5, .2), 6)
    h.props.box((-3, 5.23, 7.84), (1.12, .4, .16), 1)
    BASE['light']('UA_C_Cottage_Attic', h.c, 'AREA', (-3, 3.4, 8.8), (1, .64, .34), 70, 1.8, target=(-3, 4, 7.1))
    h.pitched_roof(-3, 4.0, 7.10, 5.85, 5.4, 4.5, dormer=True)
    h.balcony(-3, .83, 4.18, 2.9, 1.3)
    h.entry(yf=1.5); h.finish()


def audit_island(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    unseen = set(bm.verts); components = 0
    while unseen:
        stack = [unseen.pop()]; components += 1
        while stack:
            v = stack.pop()
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other in unseen:
                    unseen.remove(other); stack.append(other)
    result = {'connected_components': components,
              'boundary_edges': sum(e.is_boundary for e in bm.edges),
              'non_manifold_edges': sum(not e.is_manifold for e in bm.edges),
              'vertices': len(bm.verts), 'faces': len(bm.faces)}
    bm.free()
    if components != 1 or result['non_manifold_edges']:
        raise RuntimeError('Island topology contract failed: ' + str(result))
    return result


def build():
    if bpy.data.scenes.get('UA_A_Townhouse'):
        raise RuntimeError('Urban aerie studies already exist.')
    ROOT.mkdir(exist_ok=True); (ROOT / 'renders').mkdir(exist_ok=True)
    common = bpy.data.collections.new('UA_Shared_Corrected_Island')
    environment = bpy.data.collections['LP_SS_Shared_Environment']
    oldroot = bpy.data.collections['LP_Faceted_World']
    mats = {key: bpy.data.materials['LP_SS_A_' + key] for key in
            ('wood', 'wood_light', 'metal', 'stone', 'rock', 'rock_light', 'rock_dark', 'grass', 'moss',
             'plaster', 'roof', 'roof_edge', 'glass', 'paper', 'screen', 'leaf', 'warm')}
    mats['fabric'] = BASE['material']('UA_Muted_Teal_Linen', (.12, .25, .25), .92)
    mats['path'] = BASE['material']('UA_Path_Sandy_Stone', (.43, .40, .31), .94, True)
    # Only reuse the accepted vegetation/water/bridge. Earlier scenes stay untouched.
    keep = ['Tree_Branches', 'Tree_Canopies', 'Ground_Planting', 'Grass_Accents', 'Spring_Pond',
            '_Stream', 'Waterfall_Ribbon', 'Garden_Footbridge', 'Faceted_Crown_Sprays', 'Angular_Meadow']
    for old in oldroot.all_objects:
        if old.hide_render or not any(key in old.name for key in keep):
            continue
        if 'Stream_Banks' in old.name:
            continue
        ob = old.copy(); ob.name = 'UA_Keep_' + old.name
        if ob.type == 'MESH':
            ob.data = old.data.copy()
            # Clear the new house/approach/lookout footprint from the meadow.
            if any(k in old.name for k in ('Meadow', 'Grass_Accents', 'Ground_Planting')):
                bm = bmesh.new(); bm.from_mesh(ob.data)
                doomed = [f for f in bm.faces if near_path(f.calc_center_median(), .66)
                          or (8.5 < f.calc_center_median().x < 11.7 and -7.5 < f.calc_center_median().y < -4.8)]
                bmesh.ops.delete(bm, geom=doomed, context='FACES'); bm.to_mesh(ob.data); bm.free()
        common.objects.link(ob)
    body = island(common, mats)
    bridge_and_garden(common, mats)
    report = {'island_topology': audit_island(body), 'studies': []}
    camera_collection = bpy.data.collections.new('UA_Shared_Cameras')
    overview = BASE['camera']('UA_Overview', camera_collection, (40, -62, 35), (0, 0, -7), 42)
    detail = BASE['camera']('UA_House', camera_collection, (13, -25, 20), (-2.6, 4, 6.2), 68)
    for cam in (overview, detail):
        cam.data.clip_end = 6500
    for label, creator in [('A_Townhouse', townhouse), ('B_Atelier', atelier), ('C_Cottage', cottage)]:
        scene = bpy.data.scenes.new('UA_' + label)
        scene.collection.children.link(common)
        scene.collection.children.link(environment)
        scene.collection.children.link(camera_collection)
        root = collection(label, scene.collection)
        creator(root, mats)
        BASE['setup'](scene, bpy.data.worlds['LP_Blue_Hour'])
        scene.eevee.use_volume_custom_range = True
        scene.eevee.volumetric_end = 2000
        scene.eevee.volumetric_samples = 96
        scene.eevee.taa_render_samples = 96
        scene.view_settings.exposure = .4
        scene.camera = overview
        scene['Comparison'] = 'Same connected island, accepted trees, supported bridge, connected path, city, lighting and cameras.'
        scene['House_Option'] = label
        report['studies'].append({'scene': scene.name, 'smooth_house_faces': sum(f.use_smooth for ob in root.all_objects if ob.type == 'MESH' for f in ob.data.polygons)})
    if bpy.context.window:
        bpy.context.window.scene = bpy.data.scenes['UA_A_Townhouse']
        for area in bpy.context.screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.shading.type = 'SOLID'
                area.spaces.active.shading.color_type = 'MATERIAL'
                area.spaces.active.overlay.show_overlays = False
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
    path = ROOT / 'urban_aerie_studies.blend'
    if path.exists():
        raise FileExistsError(path)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), check_existing=False)
    report['blend'] = str(path)
    report['bridge'] = 'Two stone abutments embed in terrain and meet deck undersides; two wooden stringers support deck.'
    report['path'] = 'Home entry stairs -> west abutment -> bridge -> east abutment -> city lookout bench.'
    (ROOT / 'build_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    result = build()

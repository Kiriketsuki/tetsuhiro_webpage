"""Collision proxy for explore on foot: src/assets/models/island_b_collide.glb.

Run it from this folder with background Blender:

    blender --factory-startup -b --python export_collision.py -- [--no-compress] [--keep-scene]

It reads the shipped island_b.glb, so the proxy matches what the site draws. It never opens
or saves a .blend, so it cannot collide with an island export.

The proxy holds one mesh, Collide, and these empties:

- Zone_Pad, Zone_Workshop, Zone_Bedroom, Zone_Telescope, Zone_Campfire, Zone_Lookout. The
  empty scale gives the half size of each zone box in metres.
- Hop_<n>, one for each low seat or ledge the walker hops onto. The scale gives the half
  size of its top.
- Spawn_Campfire, the flat spot by the fire where the walker sleeps and wakes.

The Collide mesh is built in five passes:

1. Floors: the upward faces of the lawn, the paths, the pad, the rocks and the house.
2. Stairs: each flight of treads becomes one ramp from its foot to its head. Its treads
   and risers leave the proxy, so the capsule needs no step logic.
3. Walls: horizontal slices through the house, the glass, the paths, the rocks and the
   pad, each stood up as a short vertical strip. Each tree trunk becomes a six-sided post,
   and each prop, the campfire kit included, becomes a box fitted to its footprint.
4. Rooms: the interior of each floor becomes a closed block, so the walker stops at the
   door and never walks into a room.
5. Fences: a ground scan marks where the walker may stand. A fence follows the rim of
   that area and the edge of the water.

A reach check then floods the proxy floors from Spawn_Campfire and writes into the report
whether each zone and the upper terrace can be reached. Every entry must be true.

The spec is docs/island-story-and-explore-spec.md, "Collision and the walkable area".
"""
import importlib
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collision_grid  # noqa: E402

importlib.reload(collision_grid)
from collision_grid import (  # noqa: E402
    boundary_loops, dilate, erode, largest_region, reach, simplify)

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent.parent
SOURCE = SITE / 'src/assets/models/island_b.glb'
# The site places the campfire kit at Anchor_Campfire (src/scene/aerie/campfire.js).
CAMPFIRE_KIT = SITE / 'src/assets/models/campfire_kit.glb'
OUT = SITE / 'src/assets/models/island_b_collide.glb'
REPORT = ROOT / 'island_b_collide_report.json'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLTF_TRANSFORM = '@gltf-transform/cli@4.5.1'

# A face with a normal this steep or flatter is a floor. Steeper faces are walls.
FLOOR_NZ = 0.6
# Walls lower than this never reach the walker.
WALL_MIN_Z = -0.6
# The lawn needs about 2,500 floor triangles to sit within 2 cm of the drawn ground at the
# median. At 4,000 in all, the median gap was 5 cm, which shows under the walker's paws.
TRIANGLE_LIMIT = 6000

FLOOR_MESHES = ('Island', 'Paths', 'Pad', 'Rock', 'House')
# Walls come from slices, not from their own faces. Each slice height gets a wall strip
# SLICE_HALF up and down. The ground slices cover the lawn, the porch and the house foot.
# The others stand 0.25 m over the lounge, telescope and upper terrace floors. A slice
# keeps every wall vertical. An edge collapse on the wall faces joined unrelated walls
# into slanted sheets that blocked the balconies.
SLICE_HEIGHTS = {
    'House': (0.6, 1.3, 2.0, 4.45, 7.7, 10.85),
    'Glass': (0.6, 1.3, 2.0, 4.45, 7.7, 10.85),
    'Paths': (0.6, 1.3, 2.0),
    'Rock': (0.4, 0.9),
    'Pad': (0.4, 0.9),
}
SLICE_MESHES = tuple(SLICE_HEIGHTS)
SLICE_HALF = 0.35
SLICE_SIMPLIFY = 0.07
GROUND_MESHES = ('Island', 'Paths', 'Pad', 'Rock')

# Stairs: a tread is a small flat face group. A flight is a chain of three or more treads.
TREAD_AREA = (0.05, 1.6)
TREAD_RISE = (0.09, 0.34)
TREAD_RUN = (0.12, 0.60)

# The ground scan.
CELL = 0.2
FENCE_DOWN, FENCE_UP = 0.4, 1.2
FENCE_SIMPLIFY = 0.25
MIN_HOLE_LOOP = 1.6

# Low props the walker hops onto: the top stands this high over the ground.
HOP_RISE = (0.10, 0.50)
HOP_MIN_TOP = 0.10

# A floor with a ceiling closer than this is indoors. The rooms have ceilings about 2.9 m
# up, and the telescope terrace sits 5.4 m under the roof overhang.
CEILING = 3.2

# Interiors: the floor bands of the three rooms, in metres of world height.
ROOM_BANDS = {'workshop': (0.9, 4.1), 'lounge': (4.15, 7.3), 'bedroom': (7.35, 10.4)}

ZONE_HALF = {
    'Pad': (2.4, 2.4, 1.2),
    'Workshop': (0.9, 0.9, 1.0),
    'Bedroom': (0.8, 0.8, 1.0),
    'Telescope': (0.8, 0.8, 1.0),
    'Campfire': (1.8, 1.8, 1.0),
    'Lookout': (1.2, 1.2, 1.0),
}


# Source ----------------------------------------------------------------------------------

def load_island():
    """Imports island_b.glb into a new scene and returns its objects by name."""
    scene = bpy.data.scenes.new('Collide_Build')
    before = set(bpy.data.objects)
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    objs = {}
    for ob in set(bpy.data.objects) - before:
        objs[ob.name.split('.')[0]] = ob
    before = set(bpy.data.objects)
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.import_scene.gltf(filepath=str(CAMPFIRE_KIT))
    fire = objs['Anchor_Campfire'].matrix_world.translation
    kit = [ob for ob in set(bpy.data.objects) - before if ob.type == 'MESH']
    for ob in set(bpy.data.objects) - before:
        if ob.parent is None:
            ob.location += fire
    objs['_kit'] = kit
    bpy.context.view_layer.update()
    return scene, objs


def world_bmesh(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    bm.normal_update()
    return bm


def copy_faces(dst, faces):
    """Copies faces into dst by position. dst and faces share world space."""
    for f in faces:
        verts = [dst.verts.new(v.co) for v in f.verts]
        try:
            dst.faces.new(verts)
        except ValueError:
            pass


def components(faces):
    """Splits faces into edge-connected groups."""
    left, groups = set(faces), []
    while left:
        seed = left.pop()
        group, stack = [seed], [seed]
        while stack:
            f = stack.pop()
            for e in f.edges:
                for g in e.link_faces:
                    if g in left:
                        left.remove(g)
                        group.append(g)
                        stack.append(g)
        groups.append(group)
    return groups


def points_of(faces):
    return [v.co.copy() for f in faces for v in f.verts]


# Stairs ----------------------------------------------------------------------------------

def find_treads(up_faces):
    treads = []
    for group in components(up_faces):
        zs = [f.calc_center_median().z for f in group]
        area = sum(f.calc_area() for f in group)
        if max(zs) - min(zs) > 0.03 or not TREAD_AREA[0] <= area <= TREAD_AREA[1]:
            continue
        pts = points_of(group)
        centre = sum(pts, Vector()) / len(pts)
        treads.append({'faces': group, 'centre': centre, 'z': sum(zs) / len(zs), 'area': area,
                       'pts': pts})
    return treads


def chain_flights(treads):
    """Links each tread to the nearest tread one riser above it, then follows the links."""
    by_z = sorted(treads, key=lambda t: t['z'])
    nxt = {}
    for i, a in enumerate(by_z):
        best = None
        for b in by_z[i + 1:]:
            rise = b['z'] - a['z']
            if rise > TREAD_RISE[1]:
                break
            run = (b['centre'] - a['centre']).to_2d().length
            if rise >= TREAD_RISE[0] and TREAD_RUN[0] <= run <= TREAD_RUN[1]:
                if best is None or run < best[0]:
                    best = (run, id(b), b)
        if best:
            nxt[id(a)] = best[2]
    heads = {id(t) for t in nxt.values()}
    flights = []
    for t in by_z:
        if id(t) in heads:
            continue
        chain = [t]
        while id(chain[-1]) in nxt:
            chain.append(nxt[id(chain[-1])])
        if len(chain) >= 3:
            flights.append(chain)
    return flights


def flight_ramp(chain):
    """Returns the ramp quad and the box that holds the flight's treads and risers."""
    first, last = chain[0], chain[-1]
    d = (last['centre'] - first['centre']).to_2d()
    length = d.length
    d.normalize()
    n = len(chain) - 1
    run, rise = length / n, (last['z'] - first['z']) / n
    side = Vector((-d.y, d.x))
    widths = []
    for t in chain:
        offs = [(p.to_2d() - t['centre'].to_2d()).dot(side) for p in t['pts']]
        widths.append(max(offs) - min(offs))
    half_w = sorted(widths)[len(widths) // 2] / 2
    foot = first['centre'].to_2d() - d * (run / 2 + 0.06)
    head = last['centre'].to_2d() + d * (run / 2 + 0.06)
    z_foot, z_head = first['z'] - rise - 0.06 * rise / run, last['z'] + rise + 0.06 * rise / run
    quad = [Vector((*(foot - side * half_w), z_foot)), Vector((*(head - side * half_w), z_head)),
            Vector((*(head + side * half_w), z_head)), Vector((*(foot + side * half_w), z_foot))]
    box = {'origin': first['centre'].to_2d() - d * run / 2, 'd': d, 'side': side,
           'length': length + run, 'half_w': half_w - 0.02,
           'z': (first['z'] - rise - 0.02, last['z'] + 0.02)}
    return quad, box


def in_flight(c, box):
    rel = c.to_2d() - box['origin']
    along, across = rel.dot(box['d']), rel.dot(box['side'])
    return (0 <= along <= box['length'] and abs(across) <= box['half_w']
            and box['z'][0] <= c.z <= box['z'][1])


# Props, trunks and rooms ----------------------------------------------------------------

def fitted_box(pts, z0, z1, aligned=False):
    """Returns the eight corners of a box round pts, turned to their long axis.

    aligned keeps the box on the world axes, as the house walls are.
    """
    xy = np.array([(p.x, p.y) for p in pts])
    centre = xy.mean(axis=0)
    cov = np.cov((xy - centre).T) if len(xy) > 2 else np.eye(2)
    _, vecs = np.linalg.eigh(cov)
    axis = np.array([1.0, 0.0]) if aligned else vecs[:, 1]
    perp = np.array([-axis[1], axis[0]])
    a, b = (xy - centre) @ axis, (xy - centre) @ perp
    corners = []
    for z in (z0, z1):
        for u, v in ((a.min(), b.min()), (a.max(), b.min()), (a.max(), b.max()), (a.min(), b.max())):
            p = centre + axis * u + perp * v
            corners.append(Vector((p[0], p[1], z)))
    top = (a.max() - a.min()) * (b.max() - b.min())
    return corners, top, Vector((*centre, z1)), (a.max() - a.min(), b.max() - b.min()), math.atan2(axis[1], axis[0])


def add_box(bm, corners):
    v = [bm.verts.new(c) for c in corners]
    for idx in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([v[i] for i in idx])


def add_post(bm, centre, radius, z0, z1, sides=6):
    ring = [(centre.x + radius * math.cos(2 * math.pi * k / sides),
             centre.y + radius * math.sin(2 * math.pi * k / sides)) for k in range(sides)]
    lo = [bm.verts.new((x, y, z0)) for x, y in ring]
    hi = [bm.verts.new((x, y, z1)) for x, y in ring]
    for k in range(sides):
        bm.faces.new((lo[k], lo[(k + 1) % sides], hi[(k + 1) % sides], hi[k]))
    bm.faces.new(hi)


class Ground:
    """Height of the walkable ground, from ray casts at the ground meshes."""

    def __init__(self, objs):
        self.trees = {}
        for name in (*GROUND_MESHES, 'Water'):
            bm = world_bmesh(objs[name])
            self.trees[name] = BVHTree.FromBMesh(bm)
            bm.free()

    def hit(self, x, y, top=40.0):
        best = None
        for name, tree in self.trees.items():
            loc, normal, _, dist = tree.ray_cast(Vector((x, y, top)), Vector((0, 0, -1)))
            if loc is not None and (best is None or dist < best[3]):
                best = (name, loc, normal, dist)
        return best

    def z(self, x, y, fallback=0.0):
        h = self.hit(x, y)
        return h[1].z if h else fallback


def rise_over_ground(ground, corners, top_z):
    """Height of a top over the highest ground just outside its footprint.

    The highest ground counts, so a deck board next to other boards has no rise and is
    no ledge. Only a top that stands clear on every side is one.
    """
    lo = corners[:4]
    centre = sum(lo, Vector()) / 4
    around = []
    for k, c in enumerate(lo):
        mid = (c + lo[(k + 1) % 4]) / 2
        for p in (c, mid):
            for reach in (0.12, 0.3):
                out = p + (p - centre).normalized() * reach
                around.append(ground.z(out.x, out.y, top_z))
    return top_z - max(around)


def prop_boxes(bm_out, objs, ground, report):
    """A fitted box round each prop, and a hop ledge on each low prop with a flat top."""
    hops = []
    for ob in [objs['Props'], *objs['_kit']]:
        bm = world_bmesh(ob)
        for group in components(list(bm.faces)):
            pts = points_of(group)
            z0, z1 = min(p.z for p in pts), max(p.z for p in pts)
            if z1 - z0 < 0.15:
                continue
            corners, top, centre, size, turn = fitted_box(pts, z0 - 0.05, z1)
            if top < 0.02:
                continue
            add_box(bm_out, corners)
            rise = rise_over_ground(ground, corners, z1)
            if HOP_RISE[0] <= rise <= HOP_RISE[1] and top >= HOP_MIN_TOP:
                hops.append({'at': centre, 'size': size, 'turn': turn, 'rise': round(rise, 2)})
        bm.free()
    return hops


def floor_hops(ground, faces):
    """Hop ledges on raised floor patches, such as the lookout bench seat."""
    hops = []
    for group in components(faces):
        area = sum(f.calc_area() for f in group)
        if not HOP_MIN_TOP <= area <= 3.0:
            continue
        pts = points_of(group)
        z1 = max(p.z for p in pts)
        corners, _, centre, size, turn = fitted_box(pts, z1, z1)
        rise = rise_over_ground(ground, corners, z1)
        if HOP_RISE[0] <= rise <= HOP_RISE[1]:
            hops.append({'at': centre, 'size': size, 'turn': turn, 'rise': round(rise, 2)})
    return hops


def trunk_posts(bm_out, objs, ground, keep):
    """Six-sided posts at the base of each tree trunk, from the bark faces near the ground."""
    ob = objs['Trees']
    bark = [i for i, m in enumerate(ob.data.materials) if m and 'bark' in m.name]
    bm = world_bmesh(ob)
    # Bark near the ground, grouped by position: one group per trunk.
    pts = [v.co.copy() for f in bm.faces if f.material_index in bark for v in f.verts]
    bm.free()
    pts = [p for p in pts if p.z < ground.z(p.x, p.y, p.z) + 1.0]
    clusters = []
    for p in pts:
        for c in clusters:
            if (c['sum'] / c['n'] - p.to_2d()).length < 0.5:
                c['pts'].append(p)
                c['sum'] += p.to_2d()
                c['n'] += 1
                break
        else:
            clusters.append({'pts': [p], 'sum': p.to_2d(), 'n': 1})
    count = 0
    for c in clusters:
        if c['n'] < 6:
            continue
        mid = c['sum'] / c['n']
        if not keep(Vector((*mid, 0))):
            continue
        r = max((p.to_2d() - mid).length for p in c['pts'])
        z0 = min(p.z for p in c['pts'])
        add_post(bm_out, Vector((*mid, 0)), min(max(r, 0.08), 0.45), z0 - 0.3, z0 + 1.4)
        count += 1
    return count


def room_blocks(bm_out, objs):
    """One closed block per room, fitted to the interior furniture of its floor band."""
    bm = world_bmesh(objs['Interiors'])
    rooms = {}
    for name, (z0, z1) in ROOM_BANDS.items():
        pts = [v.co.copy() for v in bm.verts if z0 <= v.co.z <= z1]
        if len(pts) < 8:
            continue
        corners, *_ = fitted_box(pts, z0 + 0.05, z1 - 0.05, aligned=True)
        add_box(bm_out, corners)
        rooms[name] = len(pts)
    bm.free()
    return rooms


# The ground scan and the fence ----------------------------------------------------------

def scan(ground, lo, hi):
    nx, ny = int((hi.x - lo.x) / CELL) + 1, int((hi.y - lo.y) / CELL) + 1
    walk = np.zeros((ny, nx), dtype=bool)
    height = np.zeros((ny, nx))
    for j in range(ny):
        for i in range(nx):
            h = ground.hit(lo.x + i * CELL, lo.y + j * CELL)
            if h and h[0] != 'Water' and h[2].z >= FLOOR_NZ:
                walk[j, i] = True
                height[j, i] = h[1].z
    return walk, height


def fence(bm_out, ground, mask, lo):
    count = 0
    for loop in boundary_loops(mask):
        pts = [(lo.x + (i - 0.5) * CELL, lo.y + (j - 0.5) * CELL) for i, j in loop]
        perimeter = len(pts) * CELL
        if perimeter < MIN_HOLE_LOOP:
            continue
        half = len(pts) // 2
        pts = simplify(pts[:half + 1], FENCE_SIMPLIFY)[:-1] + simplify(pts[half:] + pts[:1], FENCE_SIMPLIFY)[:-1]
        zs = [ground.z(x, y) for x, y in pts]
        for k in range(len(pts)):
            (x0, y0), (x1, y1) = pts[k], pts[(k + 1) % len(pts)]
            za, zb = zs[k], zs[(k + 1) % len(pts)]
            v = [bm_out.verts.new(c) for c in ((x0, y0, za - FENCE_DOWN), (x1, y1, zb - FENCE_DOWN),
                                                (x1, y1, zb + FENCE_UP), (x0, y0, za + FENCE_UP))]
            bm_out.faces.new(v)
            count += 1
    return count


# Zones -----------------------------------------------------------------------------------

def anchor(objs, name):
    return objs[name].matrix_world.translation.copy()


def zone_spots(objs, proxy, terraces):
    """Places each zone on the proxy floor next to the thing it opens.

    A ray from just over each spot drops it onto the proxy, so the porch zone lands on the
    porch and not on the lawn under it. The bedroom zone takes the outdoor terrace spot
    nearest the bedroom that stays clear of the telescope zone.
    """
    tree = BVHTree.FromBMesh(proxy)

    def drop(p, lift=0.4):
        hit = tree.ray_cast(p + Vector((0, 0, lift)), Vector((0, 0, -1)), 6.0)
        return hit[0] if hit[0] is not None else p

    telescope = anchor(objs, 'Anchor_Telescope')
    bedroom = anchor(objs, 'Anchor_Bedroom')
    deck = [c for c in terraces if abs(c.z - 7.45) < 0.15]
    scope = min(deck, key=lambda c: (c.to_2d() - telescope.to_2d()).length, default=telescope)
    clear = [c for c in deck if (c.to_2d() - scope.to_2d()).length > 1.4]
    door = min(clear, key=lambda c: (c.to_2d() - bedroom.to_2d()).length, default=bedroom)
    entry = anchor(objs, 'Anchor_Entry_Light')
    return {
        'Pad': drop(anchor(objs, 'Anchor_Pad'), 2.0),
        'Workshop': drop(entry + Vector((0, -0.9, -0.1))),
        'Bedroom': drop(door, 0.3),
        'Telescope': drop(scope, 0.3),
        'Campfire': drop(anchor(objs, 'Anchor_Campfire'), 1.0),
        'Lookout': drop(anchor(objs, 'Anchor_Lookout'), 1.0),
    }


def campfire_spawn(ground, fire, mask, lo):
    """The nearest walkable cell 1.1 to 1.6 m from the fire, on the side toward the city."""
    best = None
    for j, i in zip(*np.nonzero(mask)):
        p = Vector((lo.x + i * CELL, lo.y + j * CELL))
        d = (p - fire.to_2d()).length
        if 1.1 <= d <= 1.6:
            score = -p.y
            if best is None or score < best[0]:
                best = (score, p)
    p = best[1] if best else fire.to_2d() + Vector((1.3, 0))
    return Vector((p.x, p.y, ground.z(p.x, p.y)))


# Build -----------------------------------------------------------------------------------

def tidy(bm, angle):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(angle), verts=bm.verts, edges=bm.edges)
    bmesh.ops.triangulate(bm, faces=bm.faces)


def decimate_to(bm, target):
    """Collapses edges until bm has at most target triangles."""
    have = len(bm.faces)
    if have <= target:
        return
    me = bpy.data.meshes.new('tmp')
    bm.to_mesh(me)
    ob = bpy.data.objects.new('tmp', me)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = target / have
    mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    bm.clear()
    bm.from_mesh(ev.to_mesh())
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)


def chain_edges(edges):
    """Joins cut edges that share verts into polylines of points."""
    links = {}
    for e in edges:
        a, b = e.verts
        links.setdefault(a, []).append(b)
        links.setdefault(b, []).append(a)
    seen, lines = set(), []
    starts = [v for v, n in links.items() if len(n) != 2] + list(links)
    for start in starts:
        if start in seen:
            continue
        line, v = [start], start
        seen.add(v)
        while True:
            nxt = [n for n in links[v] if n not in seen]
            if not nxt:
                break
            v = nxt[0]
            seen.add(v)
            line.append(v)
        if start in links.get(line[-1], []) and len(line) > 2:
            line.append(start)
        lines.append([(p.co.x, p.co.y) for p in line])
    return lines


def slice_walls(bm_out, objs, boxes, on_island):
    """Wall strips from horizontal cuts through the house and its glass."""
    count = 0
    for name, heights in SLICE_HEIGHTS.items():
        for z in heights:
            bm = world_bmesh(objs[name])
            geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            cut = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1))
            edges = [e for e in cut['geom_cut'] if isinstance(e, bmesh.types.BMEdge)
                     and (name in ('House', 'Glass') or on_island(e.verts[0].co))]
            for line in chain_edges(edges):
                pts = simplify(line, SLICE_SIMPLIFY) if len(line) > 2 else line
                for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                    mid = Vector(((x0 + x1) / 2, (y0 + y1) / 2, z))
                    if (Vector((x1 - x0, y1 - y0)).length < 0.02
                            or any(in_flight(mid, b) for b in boxes)):
                        continue
                    v = [bm_out.verts.new(c) for c in ((x0, y0, z - SLICE_HALF), (x1, y1, z - SLICE_HALF),
                                                        (x1, y1, z + SLICE_HALF), (x0, y0, z + SLICE_HALF))]
                    bm_out.faces.new(v)
                    count += 1
            bm.free()
    return count


def build(objs, report):
    ground = Ground(objs)
    floors, walls, solids = bmesh.new(), bmesh.new(), bmesh.new()
    ramps, boxes, terraces, ledges = [], [], [], []
    lo, hi = Vector((-18.0, -13.5, 0)), Vector((20.0, 12.5, 0))
    walk, _ = scan(ground, lo, hi)
    region = largest_region(walk)
    near = dilate(dilate(region))

    def on_island_point(c):
        # The cliff, the lip and the underside lie outside the walkable area, and the rim
        # fence already closes it, so they stay out of the proxy.
        i, j = int(round((c.x - lo.x) / CELL)), int(round((c.y - lo.y) / CELL))
        return 0 <= j < near.shape[0] and 0 <= i < near.shape[1] and near[j, i]

    def on_island(f):
        return on_island_point(f.calc_center_median())

    for name in sorted(set(FLOOR_MESHES) | set(SLICE_MESHES)):
        bm = world_bmesh(objs[name])
        up = [f for f in bm.faces if f.normal.z >= FLOOR_NZ and f.calc_center_median().z > WALL_MIN_Z]
        if name in ('House', 'Paths'):
            for chain in chain_flights(find_treads(up)):
                quad, box = flight_ramp(chain)
                ramps.append(quad)
                boxes.append(box)
        def in_any(f):
            c = f.calc_center_median()
            return any(in_flight(c, b) for b in boxes)
        if name in FLOOR_MESHES:
            keep = [f for f in up if not in_any(f) and (name in ('House', 'Paths') or on_island(f))]
            copy_faces(floors, keep)
            if name == 'Paths':
                ledges += floor_hops(ground, keep)
            if name == 'House':
                terraces += [f.calc_center_median() for f in keep if f.calc_area() > 0.2]
        bm.free()
    report['ramps'] = len(ramps)

    house = world_bmesh(objs['House'])
    roof = BVHTree.FromBMesh(house)
    house.free()
    terraces = [c for c in terraces if roof.ray_cast(c + Vector((0, 0, 0.1)), Vector((0, 0, 1)), CEILING)[0] is None]
    hops = prop_boxes(solids, objs, ground, report) + ledges
    report['hops'] = [[round(h['at'].x, 2), round(h['at'].y, 2), h['rise']] for h in hops]
    report['trunk_posts'] = trunk_posts(solids, objs, ground, on_island_point)
    report['rooms'] = room_blocks(solids, objs)

    report['fence_quads'] = fence(solids, ground, erode(region), lo)
    report['slice_quads'] = slice_walls(walls, objs, boxes, on_island_point)

    tidy(floors, 4.0)
    tidy(walls, 6.0)
    tidy(solids, 1.0)
    report['before_decimate'] = {'floors': len(floors.faces), 'walls': len(walls.faces),
                                 'solids': len(solids.faces)}
    budget = TRIANGLE_LIMIT - 80 - 2 * len(ramps) - len(solids.faces)
    decimate_to(floors, budget - len(walls.faces))
    report['after_decimate'] = {'floors': len(floors.faces), 'walls': len(walls.faces)}
    # The ramps join after decimation, so each keeps its exact slope.
    for quad in ramps:
        solids.faces.new([solids.verts.new(c) for c in quad])

    out = bmesh.new()
    for part in (floors, walls, solids):
        me = bpy.data.meshes.new('part')
        part.to_mesh(me)
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
        part.free()
    bmesh.ops.remove_doubles(out, verts=out.verts, dist=0.005)
    bmesh.ops.triangulate(out, faces=out.faces)
    report['triangles'] = len(out.faces)
    spots = zone_spots(objs, out, terraces)
    spawn = campfire_spawn(ground, anchor(objs, 'Anchor_Campfire'), region, lo)
    # The barbecue stands on the upper terrace. The check aims 1.9 m east of it, onto the boards.
    targets = {**spots, 'Upper_Terrace': anchor(objs, 'Anchor_BBQ') + Vector((1.9, 0.4, -0.78))}
    report['reach'], report['reach_cells'] = reach(out, spawn, targets, FLOOR_NZ)
    return out, spots, hops, spawn


def write_scene(bm, spots, hops, spawn):
    scene = bpy.data.scenes.new('Collide_Export')
    coll = bpy.data.collections.new('Collide')
    scene.collection.children.link(coll)
    me = bpy.data.meshes.new('Collide')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('Collide', me)
    coll.objects.link(ob)
    empties = {}

    def empty(name, at, half, turn=0.0):
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = 'CUBE'
        e.location = at
        e.scale = half
        e.rotation_euler = (0, 0, turn)
        coll.objects.link(e)
        empties[name] = [round(x, 3) for x in at] + [round(x, 3) for x in half]

    for name, at in spots.items():
        empty(f'Zone_{name}', at, ZONE_HALF[name])
    for k, hop in enumerate(sorted(hops, key=lambda h: (h['at'].x, h['at'].y)), start=1):
        empty(f'Hop_{k}', hop['at'], (hop['size'][0] / 2, hop['size'][1] / 2, 0.05), hop['turn'])
    empty('Spawn_Campfire', spawn, (0.3, 0.3, 0.3))
    return scene, empties


def export(scene, path):
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_active_scene=True,
                                  use_selection=False, use_visible=False, use_renderable=False,
                                  export_cameras=False, export_lights=False, export_extras=False,
                                  export_yup=True, export_apply=True, export_texcoords=False,
                                  export_normals=False, export_tangents=False, export_materials='NONE',
                                  export_vertex_color='NONE', export_attributes=False,
                                  export_animations=False, export_draco_mesh_compression_enable=False)
    return path.stat().st_size


def compress(raw, out):
    """Runs gltf-transform: prune (keeping the empties), then Draco, as the island export does."""
    npx = shutil.which('npx.cmd') or shutil.which('npx')
    if not npx:
        return {'error': 'npx not found. Run gltf-transform draco by hand.'}
    tmp = Path(tempfile.mkdtemp(prefix='island_b_collide_'))
    pruned = tmp / 'prune.glb'
    steps = [['prune', str(raw), str(pruned), '--keep-leaves', 'true'],
             ['draco', str(pruned), str(out), '--method', 'edgebreaker', '--quantize-position', '14']]
    for step in steps:
        r = subprocess.run([npx, '--yes', GLTF_TRANSFORM, *step], capture_output=True, text=True)
        if r.returncode:
            return {'error': f'{step[0]} failed', 'stderr': r.stderr[-2000:]}
    shutil.rmtree(tmp, ignore_errors=True)
    return {'bytes': out.stat().st_size}


def main():
    report = {'source': str(SOURCE.relative_to(SITE)), 'out': str(OUT.relative_to(SITE))}
    scene, objs = load_island()
    bm, spots, hops, spawn = build(objs, report)
    if report['triangles'] > TRIANGLE_LIMIT:
        raise RuntimeError(f"The proxy has {report['triangles']} triangles, over {TRIANGLE_LIMIT}.")
    unreached = [name for name, ok in report['reach'].items() if not ok]
    if unreached:
        raise RuntimeError(f"The walker cannot reach {', '.join(unreached)} from Spawn_Campfire.")
    out_scene, report['empties'] = write_scene(bm, spots, hops, spawn)
    if '--no-compress' in ARGS:
        report['bytes'] = export(out_scene, OUT)
    else:
        raw = Path(tempfile.mkdtemp(prefix='island_b_collide_raw_')) / 'raw.glb'
        report['raw_bytes'] = export(out_scene, raw)
        report['compress'] = compress(raw, OUT)
    REPORT.write_text(json.dumps(report, indent=2), encoding='utf-8')
    if '--keep-scene' not in ARGS:
        bpy.data.scenes.remove(scene)
    return report


# bpy.utils.execfile also runs a file as __main__, so a session that loads this module to
# study it in the open Blender never exports by accident.
if __name__ == '__main__' and bpy.app.background:
    print(json.dumps(main(), indent=2))

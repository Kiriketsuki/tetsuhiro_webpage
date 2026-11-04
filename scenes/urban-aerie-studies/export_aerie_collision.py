"""Collision proxy for explore on foot: src/assets/models/aerie_collide.glb.

Run it from this folder with background Blender:

    blender --factory-startup -b --python export_aerie_collision.py -- [--no-compress] [--keep-scene]

It reads the shipped aerie.glb, so the proxy matches what the site draws. It never opens or saves a .blend, so it cannot collide
with an aerie export. The live model came from island_b_route_r35.blend, with the round 21
telescope.

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
    boundary_loops, clear_saddles, dilate, erode, largest_region, reach, simplify)

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent.parent
MODELS = SITE / 'src/assets/models'
SOURCE = MODELS / 'aerie.glb'
# The site places the campfire kit at Anchor_Campfire (src/scene/aerie/campfire.js).
CAMPFIRE_KIT = MODELS / 'campfire_kit.glb'
OUT = MODELS / 'aerie_collide.glb'
REPORT = ROOT / 'aerie_collide_report.json'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
GLTF_TRANSFORM = '@gltf-transform/cli@4.5.1'

# A face with a normal this steep or flatter is a floor. Steeper faces are walls.
FLOOR_NZ = 0.6
# Walls lower than this never reach the walker.
WALL_MIN_Z = -0.6
# The lawn needs about 2,500 floor triangles to sit within 2 cm of the drawn ground at the
# median. At 4,000 in all, the median gap was 5 cm, which shows under the walker's paws.
TRIANGLE_LIMIT = 6000
# The height of the guard strips along each ramp side, in metres over the ramp.
RAMP_GUARD = 0.6
# Each guard strip starts this far, in metres along the flight, past the flight's foot. A strip
# that ran to the foot of the second tower flight stood across the turn from the first flight's
# landing, so the walker never reached the telescope deck. Near the foot the flight is within
# about 0.3 m of the landing, so a side step only drops onto the landing. The strip runs to the
# head: beside the head of the third flight is the open stairwell, 5.8 m deep.
RAMP_GUARD_INSET = 0.45
# A floor face that hangs over a flight with less than this headroom over the ramp, in metres, is
# dropped. The walker capsule stands 0.35 m tall. The top of the deck edge beam, a 6 cm strip at
# 7.34 m, crossed the second tower flight 0.27 m over the ramp. Going up the walker met its one-sided
# underside and passed, but going down it met the strip as a floor and could not walk down.
RAMP_HEADROOM = 0.6
# The walker capsule radius, so a face just past a flight's side still counts as over it.
WALKER_RADIUS = 0.15
# The headroom test leaves out this much of each flight end, in metres along it. There the ramp
# dips just under its landing for one step, and the landing is a floor, not an overhang.
RAMP_END_MARGIN = 0.45
# Each ramp quad reaches this far, in metres, past its foot and its head, under the landings. A ramp
# that ended exactly at the deck edge left a hairline crack, and a ray from a slow walker slipped
# through it to the lawn 6.4 m below.
RAMP_OVERLAP = 0.03

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
    # The pad takes no slice at 0.4 m. That strip stood from 0.05 to 0.75 m, over the pad top at
    # 0.62 m, and fenced the pad in. The rim fence guards the aerie edge past the pad.
    'Pad': (0.9,),
}
SLICE_MESHES = tuple(SLICE_HEIGHTS)
# A strip of a ground slice (paths, rocks, pad) stops at the higher floor on its two sides,
# sampled this far out from the strip. A strip that stood over both floors fenced in low ledges
# such as the pad rim and the deck edge, where the walker should hop. A strip with no ground on
# one side keeps its full height, so a drop stays walled.
LEDGE_SLICES = ('Paths', 'Rock', 'Pad')
LEDGE_SIDE = 0.12
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
# The water fence reaches this far under and over the water level, in metres.
WATER_FENCE = (0.5, 1.0)
MIN_HOLE_LOOP = 1.6

# Low props the walker hops onto: the top stands this high over the ground.
HOP_RISE = (0.10, 0.50)
HOP_MIN_TOP = 0.10

# A floor with a ceiling closer than this is indoors. The rooms have ceilings about 2.9 m
# up, and the telescope terrace sits 5.4 m under the roof overhang.
CEILING = 3.2

# The door scan (find_door): the ray height over the floor, the start inside the block, the
# ray length, the step along each wall, the narrowest opening that counts as a door, and the
# widest post inside one opening.
# A zone stands `out` metres outside the door, on the terrace.
DOOR = {'lift': 0.2, 'inset': 0.3, 'reach': 0.9, 'step': 0.05, 'min_width': 0.5, 'post': 0.15, 'out': 0.7}

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

def load_aerie():
    """Imports the aerie model into a new scene and returns its objects by name."""
    scene = bpy.data.scenes.new('Collide_Build')
    before = set(bpy.data.objects)
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    objs = {}
    for ob in set(bpy.data.objects) - before:
        objs[ob.name.split('.')[0]] = ob
    # The lawn mesh is named Island in the model. A renamed model may call it Aerie.
    if 'Island' not in objs and 'Aerie' in objs:
        objs['Island'] = objs['Aerie']
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


def flight_ramp(chain, tree=None):
    """Returns the ramp quad and the box that holds the flight's treads and risers.

    tree: a BVH of the mesh, to read the floor past the last tread. When that floor stands at
    the last tread's height, the last tread is the first board of the landing. The ramp then
    ends at the riser line under it, at the landing height, and the board stays a floor. The
    ramp used to run one riser past the landing, so the walker stepped down a 0.2 m lip.
    """
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
    landing = False
    if tree is not None:
        past = last['centre'].to_2d() + d * (run * 0.8)
        hit = tree.ray_cast(Vector((past.x, past.y, last['z'] + 0.3)), Vector((0, 0, -1)), 0.6)
        landing = hit[0] is not None and abs(hit[0].z - last['z']) < 0.04
    if landing:
        head = last['centre'].to_2d() - d * (run / 2)
        z_head = last['z']
    foot_q, head_q = foot - d * RAMP_OVERLAP, head + d * RAMP_OVERLAP
    quad = [Vector((*(foot_q - side * half_w), z_foot)), Vector((*(head_q - side * half_w), z_head)),
            Vector((*(head_q + side * half_w), z_head)), Vector((*(foot_q + side * half_w), z_foot))]
    box = {'origin': first['centre'].to_2d() - d * run / 2, 'd': d, 'side': side,
           'length': length if landing else length + run, 'half_w': half_w - 0.02,
           'z': (first['z'] - rise - 0.02, last['z'] + 0.02),
           'ramp': {'foot': foot, 'head': head, 'z': (z_foot, z_head), 'half_w': half_w}}
    return quad, box


def overhangs(f, boxes):
    """True when the face hangs over a flight ramp with less than RAMP_HEADROOM over it.

    The test samples the corners, the middle and points along each edge, because a long thin
    face can cross a flight with its middle and its corners outside the flight.
    """
    pts = [v.co for v in f.verts] + [f.calc_center_median()]
    for e in f.edges:
        a, c = e.verts[0].co, e.verts[1].co
        pts += [a.lerp(c, k / 8) for k in range(1, 8)]
    for box in boxes:
        r = box['ramp']
        d = r['head'] - r['foot']
        length = d.length
        if length < 1e-6:
            continue
        d = d / length
        side = Vector((-d.y, d.x))
        for p in pts:
            rel = p.to_2d() - r['foot']
            along, across = rel.dot(d), rel.dot(side)
            if not (RAMP_END_MARGIN <= along <= length - RAMP_END_MARGIN
                    and abs(across) <= r['half_w'] + WALKER_RADIUS):
                continue
            ramp_z = r['z'][0] + (r['z'][1] - r['z'][0]) * along / length
            if 0.02 < p.z - ramp_z < RAMP_HEADROOM:
                return True
    return False


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
        centre = sum(corners[:4], Vector()) / 4
        rooms[name] = {'centre': Vector((centre.x, centre.y, z0 + 0.15)), 'floor': z0 + 0.1,
                       'min': Vector(map(min, *corners)), 'max': Vector(map(max, *corners))}
    bm.free()
    return rooms


def find_door(house, room):
    """Finds the door of a room: the widest opening in the house walls round its block.

    Rays run out through the walls from just inside the block, DOOR['lift'] over the floor.
    At that height a window still has wall under it, so only a door lets a ray through. The
    house mesh holds no door glass, so an open frame and a glass door both count. Returns the
    middle of the opening on the wall line, and the outward normal, or None.
    """
    lo, hi = room['min'], room['max']
    z = room['floor'] + DOOR['lift']
    sides = (((lo.x, lo.y), (hi.x, lo.y), (0, -1)), ((hi.x, lo.y), (hi.x, hi.y), (1, 0)),
             ((hi.x, hi.y), (lo.x, hi.y), (0, 1)), ((lo.x, hi.y), (lo.x, lo.y), (-1, 0)))
    best = None

    def close(run, n):
        nonlocal best
        width = (run[-1] - run[0]).length if len(run) > 1 else 0.0
        if width >= DOOR['min_width'] and (best is None or width > best[0]):
            best = (width, (run[0] + run[-1]) / 2, n)

    for a, b, n in sides:
        a, b, n = Vector(a), Vector(b), Vector(n)
        steps = max(1, int((b - a).length / DOOR['step']))
        run = []
        for k in range(steps + 1):
            p = a.lerp(b, k / steps)
            start = p - n * DOOR['inset']
            if house.ray_cast(Vector((start.x, start.y, z)), Vector((n.x, n.y, 0)), DOOR['reach'])[0] is not None:
                continue
            # A post up to DOOR['post'] wide, such as the stile between two door leaves,
            # stays inside one opening.
            if run and (p - run[-1]).length > DOOR['post'] + DOOR['step']:
                close(run, n)
                run = []
            run.append(p)
        close(run, n)
    if best is None:
        return None
    width, middle, n = best
    return {'at': Vector((middle.x, middle.y, room['floor'])), 'normal': Vector((n.x, n.y, 0)), 'width': round(width, 2)}


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


def fence(bm_out, mask, lo, span):
    """A fence along every outline of mask. span(x, y) gives the bottom and top of each post."""
    count = 0
    for loop in boundary_loops(mask):
        pts = [(lo.x + (i - 0.5) * CELL, lo.y + (j - 0.5) * CELL) for i, j in loop]
        perimeter = len(pts) * CELL
        if perimeter < MIN_HOLE_LOOP:
            continue
        half = len(pts) // 2
        pts = simplify(pts[:half + 1], FENCE_SIMPLIFY)[:-1] + simplify(pts[half:] + pts[:1], FENCE_SIMPLIFY)[:-1]
        posts = [span(x, y) for x, y in pts]
        for k in range(len(pts)):
            (x0, y0), (x1, y1) = pts[k], pts[(k + 1) % len(pts)]
            (a0, a1), (b0, b1) = posts[k], posts[(k + 1) % len(pts)]
            v = [bm_out.verts.new(c) for c in ((x0, y0, a0), (x1, y1, b0), (x1, y1, b1), (x0, y0, a1))]
            bm_out.faces.new(v)
            count += 1
    return count


def water_fence(bm_out, ground, lo, shape):
    """A fence on the banks of the pond and the stream, one cell out from the water.

    The rim fence follows the walkable outline, and a ray from above meets a bridge deck before
    the stream under it, so the stream under a bridge counted as walkable. The walker went
    under the bridge foot ramp into the stream bed. Under a deck each post stops just below it,
    so the walk over the bridge stays open.
    """
    tree = ground.trees['Water']
    water = np.zeros(shape, dtype=bool)
    levels = []
    for j in range(shape[0]):
        for i in range(shape[1]):
            loc = tree.ray_cast(Vector((lo.x + i * CELL, lo.y + j * CELL, 40.0)), Vector((0, 0, -1)))[0]
            if loc is not None:
                water[j, i] = True
                levels.append(loc.z)
    if not levels:
        return 0
    level = sorted(levels)[len(levels) // 2]

    def span(x, y):
        top = level + WATER_FENCE[1]
        hit = ground.hit(x, y)
        if hit and hit[0] in ('Paths', 'Pad') and hit[1].z > level + 0.3:
            top = min(top, hit[1].z - 0.08)
        return level - WATER_FENCE[0], top

    return fence(bm_out, clear_saddles(dilate(water)), lo, span)


# Zones -----------------------------------------------------------------------------------

def anchor(objs, name):
    return objs[name].matrix_world.translation.copy()


def zone_spots(objs, proxy, terraces, bedroom_door):
    """Places each zone on the proxy floor next to the thing it opens.

    A ray from just over each spot drops it onto the proxy, so the porch zone lands on the
    porch and not on the lawn under it. The bedroom zone stands on the terrace outside the
    bedroom door (find_door). The walker never enters the room, so the zone stays outside.
    """
    tree = BVHTree.FromBMesh(proxy)

    def drop(p, lift=0.4):
        hit = tree.ray_cast(p + Vector((0, 0, lift)), Vector((0, 0, -1)), 6.0)
        return hit[0] if hit[0] is not None else p

    telescope = anchor(objs, 'Anchor_Telescope')
    deck = [c for c in terraces if abs(c.z - 7.45) < 0.15]
    scope = min(deck, key=lambda c: (c.to_2d() - telescope.to_2d()).length, default=telescope)
    if bedroom_door is None:
        raise RuntimeError('The door scan found no bedroom door.')
    door = bedroom_door['at'] + bedroom_door['normal'] * DOOR['out']
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


def strip_top(ground, name, a, b, z):
    """The top of a slice strip from a to b at height z: z + SLICE_HALF, or lower at a ledge."""
    top = z + SLICE_HALF
    if name not in LEDGE_SLICES:
        return top
    mid = (a + b) / 2
    side = Vector((-(b - a).y, (b - a).x)).normalized() * LEDGE_SIDE
    floors = []
    for p in (mid + side, mid - side):
        h = ground.hit(p.x, p.y)
        if h is None or h[0] == 'Water':
            return top
        floors.append(h[1].z)
    return min(top, max(floors))


def slice_walls(bm_out, objs, boxes, on_aerie, ground):
    """Wall strips from horizontal cuts through the house, its glass and the ground meshes."""
    count = 0
    for name, heights in SLICE_HEIGHTS.items():
        for z in heights:
            bm = world_bmesh(objs[name])
            geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            cut = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1))
            edges = [e for e in cut['geom_cut'] if isinstance(e, bmesh.types.BMEdge)
                     and (name in ('House', 'Glass') or on_aerie(e.verts[0].co))]
            for line in chain_edges(edges):
                pts = simplify(line, SLICE_SIMPLIFY) if len(line) > 2 else line
                for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                    mid = Vector(((x0 + x1) / 2, (y0 + y1) / 2, z))
                    if (Vector((x1 - x0, y1 - y0)).length < 0.02
                            or any(in_flight(mid, b) for b in boxes)):
                        continue
                    top = strip_top(ground, name, Vector((x0, y0)), Vector((x1, y1)), z)
                    if top < z - SLICE_HALF + 0.03:
                        continue
                    v = [bm_out.verts.new(c) for c in ((x0, y0, z - SLICE_HALF), (x1, y1, z - SLICE_HALF),
                                                        (x1, y1, top), (x0, y0, top))]
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

    def on_aerie_point(c):
        # The cliff, the lip and the underside lie outside the walkable area, and the rim
        # fence already closes it, so they stay out of the proxy.
        i, j = int(round((c.x - lo.x) / CELL)), int(round((c.y - lo.y) / CELL))
        return 0 <= j < near.shape[0] and 0 <= i < near.shape[1] and near[j, i]

    def on_aerie(f):
        return on_aerie_point(f.calc_center_median())

    for name in sorted(set(FLOOR_MESHES) | set(SLICE_MESHES)):
        bm = world_bmesh(objs[name])
        up = [f for f in bm.faces if f.normal.z >= FLOOR_NZ and f.calc_center_median().z > WALL_MIN_Z]
        if name in ('House', 'Paths'):
            mesh_tree = BVHTree.FromBMesh(bm)
            for chain in chain_flights(find_treads(up)):
                quad, box = flight_ramp(chain, mesh_tree)
                ramps.append(quad)
                boxes.append(box)
        def in_any(f):
            c = f.calc_center_median()
            return any(in_flight(c, b) for b in boxes)
        if name in FLOOR_MESHES:
            keep = [f for f in up if not in_any(f) and (name in ('House', 'Paths') or on_aerie(f))]
            low = [f for f in keep if overhangs(f, boxes)]
            report['overhang_floors'] = report.get('overhang_floors', 0) + len(low)
            keep = [f for f in keep if f not in low]
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
    report['trunk_posts'] = trunk_posts(solids, objs, ground, on_aerie_point)
    rooms = room_blocks(solids, objs)
    report['rooms'] = list(rooms)
    door = find_door(roof, rooms['bedroom']) if 'bedroom' in rooms else None
    if door:
        report['bedroom_door'] = {'at': [round(c, 2) for c in door['at']], 'normal': [round(c, 2) for c in door['normal']], 'width': door['width']}

    rim = lambda x, y: (ground.z(x, y) - FENCE_DOWN, ground.z(x, y) + FENCE_UP)
    report['fence_quads'] = fence(solids, clear_saddles(erode(region)), lo, rim)
    report['water_fence_quads'] = water_fence(solids, ground, lo, walk.shape)
    report['slice_quads'] = slice_walls(walls, objs, boxes, on_aerie_point, ground)

    tidy(floors, 4.0)
    tidy(walls, 6.0)
    tidy(solids, 1.0)
    report['before_decimate'] = {'floors': len(floors.faces), 'walls': len(walls.faces),
                                 'solids': len(solids.faces)}
    budget = TRIANGLE_LIMIT - 80 - 6 * len(ramps) - len(solids.faces)
    decimate_to(floors, budget - len(walls.faces))
    report['after_decimate'] = {'floors': len(floors.faces), 'walls': len(walls.faces)}
    # The ramps join after decimation, so each keeps its exact slope.
    for quad in ramps:
        solids.faces.new([solids.verts.new(c) for c in quad])
        # A guard strip along each long side, as the stair stringers are. Between the slice
        # heights the stair tower had no wall at a flight's side, so the walker stepped off a
        # flight and fell out through the tower glass.
        for a, b in ((quad[0], quad[1]), (quad[3], quad[2])):
            a = a + (b - a).normalized() * RAMP_GUARD_INSET
            up = Vector((0, 0, RAMP_GUARD))
            solids.faces.new([solids.verts.new(c) for c in (a - up * 0.3, b - up * 0.3, b + up, a + up)])

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
    spots = zone_spots(objs, out, terraces, door)
    spawn = campfire_spawn(ground, anchor(objs, 'Anchor_Campfire'), region, lo)
    # The barbecue stands on the upper terrace. The check aims 1.9 m east of it, onto the boards.
    targets = {**spots, 'Upper_Terrace': anchor(objs, 'Anchor_BBQ') + Vector((1.9, 0.4, -0.78))}
    report['reach'], report['reach_cells'] = reach(out, spawn, targets, FLOOR_NZ)
    # The owner's rule: the walker never enters a room, so the low-poly interiors are never
    # seen close up. The floor inside each room must stay out of reach.
    inside, _ = reach(out, spawn, {f'inside_{k}': r['centre'] for k, r in rooms.items()}, FLOOR_NZ)
    report['rooms_closed'] = {k: not v for k, v in inside.items()}
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
    """Runs gltf-transform: prune (keeping the empties), then Draco, as the aerie export does."""
    npx = shutil.which('npx.cmd') or shutil.which('npx')
    if not npx:
        return {'error': 'npx not found. Run gltf-transform draco by hand.'}
    tmp = Path(tempfile.mkdtemp(prefix='aerie_collide_'))
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
    report = {'source': SOURCE.relative_to(SITE).as_posix(), 'out': OUT.relative_to(SITE).as_posix()}
    scene, objs = load_aerie()
    bm, spots, hops, spawn = build(objs, report)
    if report['triangles'] > TRIANGLE_LIMIT:
        raise RuntimeError(f"The proxy has {report['triangles']} triangles, over {TRIANGLE_LIMIT}.")
    unreached = [name for name, ok in report['reach'].items() if not ok]
    if unreached:
        raise RuntimeError(f"The walker cannot reach {', '.join(unreached)} from Spawn_Campfire.")
    open_rooms = [name for name, closed in report['rooms_closed'].items() if not closed]
    if open_rooms:
        raise RuntimeError(f"The walker can walk into {', '.join(open_rooms)}.")
    out_scene, report['empties'] = write_scene(bm, spots, hops, spawn)
    if '--no-compress' in ARGS:
        report['bytes'] = export(out_scene, OUT)
    else:
        raw = Path(tempfile.mkdtemp(prefix='aerie_collide_raw_')) / 'raw.glb'
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

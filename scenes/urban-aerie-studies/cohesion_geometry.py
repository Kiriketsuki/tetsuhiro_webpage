"""Terrain cap with constrained shoreline edges, stitched to the existing cliff."""
import math
from collections import Counter
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt


def bvh(ob):
    return BVHTree.FromPolygons([v.co for v in ob.data.vertices], [list(f.vertices) for f in ob.data.polygons])


def sample(tree, x, y):
    hit, normal, face, distance = tree.ray_cast(Vector((x, y, 30)), Vector((0, 0, -1)))
    return None if hit is None else hit.z


def inside(q, polygon):
    x, y = q; hit = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if (a.y > y) != (b.y > y) and x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x:
            hit = not hit
    return hit


def shorelines(water):
    # First 29 rows are the pond and stream; the later rows form the falling curtain.
    stride = 25
    tip = water.data.vertices[-1].co.copy()
    left = [tip] + [water.data.vertices[j * stride].co.copy() for j in range(29)]
    right = [tip] + [water.data.vertices[j * stride + 24].co.copy() for j in range(29)]
    return [left, right]


def dense_lines(lines, spacing=.22):
    result = []
    for points in lines:
        dense = []
        for a, b in zip(points, points[1:]):
            steps = max(1, math.ceil((Vector(b[:2]) - Vector(a[:2])).length / spacing))
            dense += [a.lerp(b, j / steps) for j in range(steps)]
        dense.append(points[-1]); result.append(dense)
    return result


def nearest(q, lines, polygon):
    best, wz = 1e20, .63
    for points in lines:
        for a, b in zip(points, points[1:]):
            av, bv = Vector(a[:2]), Vector(b[:2]); edge = bv - av
            if edge.length_squared < 1e-12:
                continue
            t = max(0, min(1, (q - av).dot(edge) / edge.length_squared))
            d = (q - av - edge * t).length_squared
            if d < best:
                best, wz = d, a.z + (b.z - a.z) * t
    return (-1 if inside(q, polygon) else 1) * math.sqrt(best), wz


def ordered_rim(bm):
    edges = [e for e in bm.edges if len(e.link_faces) == 2 and {f.material_index for f in e.link_faces} == {0, 1}]
    neighbours = {}
    for e in edges:
        for a, b in ((e.verts[0], e.verts[1]), (e.verts[1], e.verts[0])):
            neighbours.setdefault(a, []).append(b)
    if not neighbours or any(len(v) != 2 for v in neighbours.values()):
        raise RuntimeError('Expected one unbranched terrain/cliff rim.')
    start = min(neighbours, key=lambda v: (v.co.x, v.co.y)); loop = [start]
    previous, current = None, start
    while True:
        following = next(v for v in neighbours[current] if v != previous)
        if following == start:
            break
        loop.append(following); previous, current = current, following
        if len(loop) > len(neighbours):
            raise RuntimeError('Rim traversal did not close.')
    area = sum(a.co.x * b.co.y - b.co.x * a.co.y for a, b in zip(loop, loop[1:] + loop[:1]))
    return loop if area > 0 else list(reversed(loop))


def audit_shore(body_tree, lines, island_polygon):
    gaps = []; points = []
    for line in dense_lines(lines, .10):
        for p in line:
            q = Vector(p[:2])
            if not inside(q, island_polygon):
                continue  # The waterfall outlet legitimately leaves the island.
            ground = sample(body_tree, p.x, p.y)
            if ground is not None:
                gaps.append(p.z - ground); points.append((p.x, p.y, p.z - ground))
    return {'samples': len(gaps), 'exposed_samples_over_2cm': sum(g > .02 for g in gaps),
            'largest_exposed_gap_m': round(max(0, max(gaps, default=0)), 6),
            'minimum_land_overlap_m': round(-max(gaps, default=0), 6),
            'worst_points': sorted(points, key=lambda p: p[2], reverse=True)[:4]}


def stitch_banks(body, water):
    old_tree = bvh(body); bm = bmesh.new(); bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table(); bm.verts.index_update()
    rim = ordered_rim(bm); island_polygon = [Vector(v.co[:2]) for v in rim]
    lines = shorelines(water)
    water_polygon = [Vector(p[:2]) for p in lines[0]] + [Vector(p[:2]) for p in reversed(lines[1])][:-1]
    before = audit_shore(old_tree, lines, island_polygon)
    def z_at(q):
        old_z = sample(old_tree, q.x, q.y)
        if old_z is None:
            old_z = .4
        d, wz = nearest(q, lines, water_polygon)
        if d < -.70:
            return min(old_z, wz - .22)
        if d < -.35:
            t = (d + .70) / .35
            return min(old_z, wz - .22) * (1 - t) + (wz - .24) * t
        if d < 0:
            return wz - .24 + (d + .35) / .35 * .258
        if d < .35:
            return (wz + .018) * (1 - d / .35) + max(old_z, wz + .07) * (d / .35)
        if d < .80:
            t = (d - .35) / .45
            return max(old_z, wz + .07) * (1 - t) + old_z * t
        return old_z
    coords, index = [], {}
    def point(q):
        key = (round(q.x, 6), round(q.y, 6))
        if key not in index:
            index[key] = len(coords); coords.append(Vector(q[:2]))
        return index[key]
    outer = [point(v.co) for v in rim]
    cap_vertices = {v for f in bm.faces if f.material_index == 0 for v in f.verts}
    for v in cap_vertices:
        d, wz = nearest(Vector(v.co[:2]), lines, water_polygon)
        if abs(d) > .045 or v in rim:
            point(v.co)
    constraints = []
    for side, dense in enumerate(dense_lines(lines)):
        # Exact bank line plus inner basin/outer ground guide lines.
        for offset in (0, -.28, .35):
            strip = []
            for i, p in enumerate(dense):
                a, b = dense[max(0, i - 1)], dense[min(len(dense) - 1, i + 1)]
                tangent = Vector((b.x - a.x, b.y - a.y)).normalized()
                normal = Vector((tangent.y, -tangent.x)) * (1 if side == 0 else -1)
                strip.append(point(Vector(p[:2]) + normal * offset))
            constraints += [(a, b) for a, b in zip(strip, strip[1:]) if a != b]
    result = delaunay_2d_cdt(coords, constraints, [outer], 0, .000001, True)
    out_coords, out_edges, out_faces = result[:3]
    selected = [face for face in out_faces if inside(sum((out_coords[i] for i in face), Vector((0, 0))) / len(face), island_polygon)]
    edge_use = Counter(tuple(sorted((a, b))) for face in selected for a, b in zip(face, face[1:] + face[:1]))
    boundary_ids = {v for edge, count in edge_use.items() if count == 1 for v in edge}
    used_ids = {i for face in selected for i in face}
    # Keep the old cliff; only the ground cap is replaced.
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == 0], context='FACES_ONLY')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    for v in bm.verts:
        if any(e.is_boundary for e in v.link_edges):
            v.co.z = z_at(Vector(v.co[:2]))
    boundary_lookup = {(round(v.co.x, 5), round(v.co.y, 5)): v for v in bm.verts if any(e.is_boundary for e in v.link_edges)}
    split_count = 0
    for i in boundary_ids:
        q = out_coords[i]; key = (round(q.x, 5), round(q.y, 5))
        if key in boundary_lookup:
            continue
        found = None
        for edge in bm.edges:
            if not edge.is_boundary:
                continue
            a, b = edge.verts; av, bv = Vector(a.co[:2]), Vector(b.co[:2]); d = bv - av
            t = (q - av).dot(d) / d.length_squared
            if -.00001 <= t <= 1.00001 and (q - av - d * t).length < .00003:
                found = (edge, a, t); break
        if found is None:
            raise RuntimeError('New cap boundary did not match the existing cliff rim: ' + str(tuple(q)))
        edge, a, t = found
        if t < .00001:
            v = a
        elif t > .99999:
            v = edge.other_vert(a)
        else:
            new_edge, v = bmesh.utils.edge_split(edge, a, t); split_count += 1
        v.co = (q.x, q.y, z_at(q)); boundary_lookup[key] = v
    verts = {}
    for i in used_ids:
        q = out_coords[i]; key = (round(q.x, 5), round(q.y, 5))
        verts[i] = boundary_lookup[key] if i in boundary_ids else bm.verts.new((q.x, q.y, z_at(q)))
    for face in selected:
        f = bm.faces.new([verts[i] for i in face]); f.material_index = 0; f.smooth = False
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for f in bm.faces: f.smooth = False
    boundary_count = sum(e.is_boundary for e in bm.edges)
    non_manifold = sum(not e.is_manifold for e in bm.edges)
    if boundary_count or non_manifold:
        raise RuntimeError(f'Stitch failed: {boundary_count} open edges, {non_manifold} non-manifold edges.')
    bm.to_mesh(body.data); bm.free(); body.data.update()
    new_tree = bvh(body)
    after = audit_shore(new_tree, lines, island_polygon)
    if after['exposed_samples_over_2cm']:
        raise RuntimeError('Bank contact audit failed: ' + str(after))
    return old_tree, new_tree, lines, island_polygon, {'before': before, 'after': after,
             'new_top_triangles': len(selected), 'cliff_rim_splits': split_count,
             'method': 'Terrain cap constrained to both actual water edges and stitched into the existing cliff rim.'}

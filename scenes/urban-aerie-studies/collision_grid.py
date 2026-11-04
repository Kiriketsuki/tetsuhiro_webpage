"""Grid helpers for export_collision.py: masks, outlines and the reach check.

export_collision.py imports this module. Nothing here touches the scene.
"""
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def largest_region(mask):
    """Keeps the largest four-connected region of a mask."""
    labels = np.zeros(mask.shape, dtype=int)
    best, best_size, label = 0, 0, 0
    for start in zip(*np.nonzero(mask)):
        if labels[start]:
            continue
        label += 1
        stack, size = [start], 0
        labels[start] = label
        while stack:
            j, i = stack.pop()
            size += 1
            for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (j + dj, i + di)
                if 0 <= q[0] < mask.shape[0] and 0 <= q[1] < mask.shape[1] and mask[q] and not labels[q]:
                    labels[q] = label
                    stack.append(q)
        if size > best_size:
            best, best_size = label, size
    return labels == best


def erode(mask):
    out = mask.copy()
    out[1:, :] &= mask[:-1, :]
    out[:-1, :] &= mask[1:, :]
    out[:, 1:] &= mask[:, :-1]
    out[:, :-1] &= mask[:, 1:]
    return out


def dilate(mask):
    out = mask.copy()
    out[1:, :] |= mask[:-1, :]
    out[:-1, :] |= mask[1:, :]
    out[:, 1:] |= mask[:, :-1]
    out[:, :-1] |= mask[:, 1:]
    return out


def clear_saddles(mask):
    """Blocks the cells of every 2x2 square where only two diagonal cells are walkable.

    At such a square two outline edges start from one corner, and boundary_loops kept only
    one of them. Its loop then broke into short pieces, the shortest were dropped as small
    holes, and the walker slipped through the gap in the rim fence. The square is blocked
    until none is left, so every corner starts at most one edge.
    """
    out = mask.copy()
    while True:
        a, b, c, d = out[:-1, :-1], out[:-1, 1:], out[1:, :-1], out[1:, 1:]
        saddle = (a & d & ~b & ~c) | (b & c & ~a & ~d)
        if not saddle.any():
            return out
        js, is_ = np.nonzero(saddle)
        out[js, is_] = out[js, is_ + 1] = out[js + 1, is_] = out[js + 1, is_ + 1] = False


def boundary_loops(mask):
    """Traces the cell edges between walkable and blocked cells into closed loops."""
    ny, nx = mask.shape
    padded = np.zeros((ny + 2, nx + 2), dtype=bool)
    padded[1:-1, 1:-1] = mask
    edges = {}
    for j in range(ny + 1):
        for i in range(nx + 1):
            a = padded[j + 1, i + 1]
            # A directed edge keeps the walkable cell on its left.
            if a != padded[j + 1, i]:
                p, q = ((i, j + 1), (i, j)) if a else ((i, j), (i, j + 1))
                edges[p] = q
            if a != padded[j, i + 1]:
                p, q = ((i, j), (i + 1, j)) if a else ((i + 1, j), (i, j))
                edges[p] = q
    loops = []
    while edges:
        start, nxt = edges.popitem()
        loop = [start]
        while nxt != start and nxt in edges:
            loop.append(nxt)
            nxt = edges.pop(nxt)
        loops.append(loop)
    return loops


def simplify(points, tol):
    """Douglas-Peucker on an open polyline."""
    if len(points) < 3:
        return points
    a, b = np.array(points[0]), np.array(points[-1])
    ab = b - a
    norm = np.linalg.norm(ab)
    dists = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / norm if norm > 1e-9 else np.linalg.norm(np.array(p) - a)
             for p in points[1:-1]]
    k = int(np.argmax(dists)) + 1
    if dists[k - 1] <= tol:
        return [points[0], points[-1]]
    return simplify(points[:k + 1], tol)[:-1] + simplify(points[k:], tol)


# Reach check ------------------------------------------------------------------------------

REACH_CELL = 0.25
REACH_STEP = 0.24  # A rise per cell the capsule climbs: a 44 degree ramp or a 0.1 m step.


def reach(proxy, start, targets, floor_nz):
    """Floods the proxy floors from start and returns, for each target, whether it is reached.

    The flood walks a grid over every floor level. Two neighbour cells link when their
    floors differ by at most REACH_STEP and no wall stands between them at 0.15 m or
    0.28 m over the floor, the height of the walker capsule.
    """
    tree = BVHTree.FromBMesh(proxy)
    lo, hi = Vector((-18.0, -13.5, 0)), Vector((20.0, 12.5, 0))
    nx, ny = int((hi.x - lo.x) / REACH_CELL) + 1, int((hi.y - lo.y) / REACH_CELL) + 1
    levels = {}
    for j in range(ny):
        for i in range(nx):
            x, y, top, found = lo.x + i * REACH_CELL, lo.y + j * REACH_CELL, 16.0, []
            while True:
                loc, normal, _, _ = tree.ray_cast(Vector((x, y, top)), Vector((0, 0, -1)), 40.0)
                if loc is None:
                    break
                if normal.z >= floor_nz:
                    found.append(loc.z)
                top = loc.z - 0.05
            if found:
                levels[(i, j)] = found

    def clear(a, b, z):
        d = b - a
        for h in (0.15, 0.28):
            if tree.ray_cast(a + Vector((0, 0, h)), d.normalized(), d.length)[0] is not None:
                return False
        return True

    def node_at(p):
        i, j = int(round((p.x - lo.x) / REACH_CELL)), int(round((p.y - lo.y) / REACH_CELL))
        zs = levels.get((i, j), [])
        return ((i, j), min(range(len(zs)), key=lambda k: abs(zs[k] - p.z))) if zs else None

    first = node_at(start)
    if first is None:
        return {name: False for name in targets}, 0
    seen, stack = {first}, [first]
    while stack:
        (i, j), k = stack.pop()
        z = levels[(i, j)][k]
        a = Vector((lo.x + i * REACH_CELL, lo.y + j * REACH_CELL, z))
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (i + di, j + dj)
            for m, zq in enumerate(levels.get(q, [])):
                if (q, m) in seen or abs(zq - z) > REACH_STEP:
                    continue
                b = Vector((lo.x + q[0] * REACH_CELL, lo.y + q[1] * REACH_CELL, max(z, zq)))
                if clear(Vector((a.x, a.y, max(z, zq))), b, z):
                    seen.add((q, m))
                    stack.append((q, m))
    return {name: node_at(p) in seen for name, p in targets.items()}, len(seen)

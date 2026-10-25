"""Layered angular cliff ledges and folded trailing plants. No rounded normals."""
from pathlib import Path
import json
import math
import random
import runpy
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent


def add_geology(scene, root, mapping, mats):
    if scene.get('Faceted_Geology'):
        return
    api = runpy.run_path(str(ROOT / 'build_faceted.py'))
    c = bpy.data.collections.new('LP_Angular_Cliff_Strata')
    root.children.link(c)
    rng = random.Random(1973)
    vertices, faces, indices = [], [], []
    # Each piece is an irregular layered seven-sided prism, with sharp planar shoulders.
    for k in range(92):
        angle = rng.uniform(0, math.tau)
        z = rng.uniform(-12.8, -1.7)
        radius = .99 + (z + 1.7) * .027
        x, y = 16 * radius * math.cos(angle), 11.5 * radius * math.sin(angle)
        if y < -8 and 2 < x < 7:
            continue
        q = Vector((x, y, z))
        outward = Vector((math.cos(angle), math.sin(angle), 0))
        side = Vector((-math.sin(angle), math.cos(angle), 0))
        width, depth, height = rng.uniform(.65, 1.5), rng.uniform(.25, .7), rng.uniform(.35, .9)
        b = len(vertices)
        for row in range(3):
            for j in range(7):
                a = j * math.tau / 7
                r = (1, 1.12, .68)[row] * rng.uniform(.86, 1.14)
                v = q + side * math.cos(a) * width * r + outward * math.sin(a) * depth * r
                v.z += (row - 1) * height + rng.uniform(-.07, .07)
                vertices.append(tuple(v))
        for row in range(2):
            for j in range(7):
                a, d = b + row * 7 + j, b + row * 7 + (j + 1) % 7
                faces.extend([(a, d, d + 7), (a, d + 7, a + 7)])
                material = rng.choices([0, 1, 2], [6, 2, 2])[0]
                indices.extend([material, material])
        faces.extend([tuple(b + j for j in reversed(range(7))), tuple(b + 14 + j for j in range(7))])
        indices.extend([2, 1])
    api['mesh_object']('LP_Layered_Cliff_Ledges', vertices, faces, c,
                       [mats['SS_A_rock'], mats['SS_A_rock_light'], mats['SS_A_rock_dark']], indices)
    # Small sparse angular ivy sprays attach to the ledges, avoiding a rounded moss blanket.
    vertices, faces, indices = [], [], []
    for j in range(31):
        a = j * math.tau / 31 + .06
        for k in range(30):
            z = -.7 - k * .13
            r = 1.0 + min(0, z + 1.4) * .027
            q = Vector((16 * r * math.cos(a), 11.5 * r * math.sin(a), z))
            normal = Vector((math.cos(a), math.sin(a), .2)).normalized()
            u = Vector((-math.sin(a), math.cos(a), -.45)).normalized()
            v = normal.cross(u).normalized()
            q += normal * .10 + u * (.06 if k % 2 else -.06)
            api['folded_leaf'](q, u, v, normal, rng.uniform(.12, .2), .085,
                               vertices, faces, indices, rng.randrange(3))
    api['mesh_object']('LP_Faceted_Trailing_Ivy', vertices, faces, c,
                       [mats['SS_A_leaf'], mats['SS_A_leaf_light'], mats['SS_A_leaf_dark']], indices)
    # Calm the meadow height without replacing its folded, planar construction.
    meadow = bpy.data.objects['SS_LP_Angular_Meadow']
    for v in meadow.data.vertices:
        v.co.z = .46 + (v.co.z - .46) * .68
    meadow.data.update()
    scene['Faceted_Geology'] = True


def polish():
    scene = bpy.data.scenes['LP_Faceted_Sanctuary']
    root = bpy.data.collections['LP_Faceted_World']
    api = runpy.run_path(str(ROOT / 'build_faceted.py'))
    mats = {m.name.removeprefix('LP_'): m for m in bpy.data.materials if m.name.startswith('LP_SS_A_')}
    add_geology(scene, root, {}, mats)
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    report = api['counts'](scene, 'LP_SS_A_')
    added = api['counts'](scene, 'SS_LP_')
    report['base_triangles'] += added['base_triangles']
    report['render_triangles'] += added['render_triangles']
    report['objects'] += added['objects']
    report['base_ratio_to_A'] = round(report['base_triangles'] / 59962, 3)
    report['render_ratio_to_A'] = round(report['render_triangles'] / 111714, 3)
    report['smooth_hero_faces'] = sum(f.use_smooth for ob in root.all_objects if ob.type == 'MESH' and not ob.hide_render for f in ob.data.polygons)
    report['note'] = 'Foreground only; shared city/cloud geometry excluded. Compare base to base and rendered to rendered.'
    report['blend'] = bpy.data.filepath
    report['scene'] = scene.name
    (ROOT / 'geometry_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    bpy.ops.wm.save_mainfile()
    return {k: v for k, v in report.items() if k != 'objects'}


if __name__ == '__main__':
    result = polish()

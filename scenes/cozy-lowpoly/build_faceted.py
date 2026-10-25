"""A-density sanctuary refined to ~2x base triangles, with planar shading throughout.

Run build() in the connected Blender containing the original A and B studies.
Sources are copied before editing. No earlier scene or saved file is overwritten.
"""
from pathlib import Path
import json
import math
import random
import runpy
import shutil
import bpy
import bmesh
from mathutils import Vector
from mathutils.noise import noise_vector

ROOT = Path(__file__).resolve().parent
BASE = runpy.run_path(str(ROOT.parent / 'sanctuary-style-studies' / 'build_studies.py'))
Batch, mesh_object = BASE['Batch'], BASE['mesh_object']


def clone_tree(source, parent, mapping, mats):
    c = bpy.data.collections.new('LP_' + source.name)
    parent.children.link(c)
    for old in source.objects:
        ob = old.copy()
        ob.name = 'LP_' + old.name
        if old.data:
            ob.data = old.data.copy()
        c.objects.link(ob)
        mapping[old.name] = ob
        if ob.type == 'MESH':
            for i, material in enumerate(list(ob.data.materials)):
                if material and material.name.startswith('SS_A_'):
                    if material.name not in mats:
                        m = material.copy()
                        m.name = 'LP_' + material.name
                        mats[material.name] = m
                    ob.data.materials[i] = mats[material.name]
            for face in ob.data.polygons:
                face.use_smooth = False
            for mod in ob.modifiers:
                if mod.type == 'BEVEL':
                    # One plane at the edge; never a rounded chamfer.
                    mod.segments = 1
    for child in source.children:
        clone_tree(child, c, mapping, mats)
    return c


def grain_uv(ob):
    uv = ob.data.uv_layers.new(name='Drawn grain')
    for f in ob.data.polygons:
        points = [ob.data.vertices[i].co for i in f.vertices]
        edges = [points[(j + 1) % len(points)] - q for j, q in enumerate(points)]
        u = max(edges, key=lambda p: p.length).normalized()
        v = f.normal.cross(u).normalized()
        for li, vi in zip(f.loop_indices, f.vertices):
            q = ob.data.vertices[vi].co
            uv.data[li].uv = (q.dot(v) * .8, q.dot(u) * .23)


def paint(mats):
    texture_dir = ROOT / 'textures'
    texture_dir.mkdir(exist_ok=True)
    images = {}
    for key in ('wood', 'rock', 'roof', 'leaf'):
        source = ROOT.parent / 'cinematic-handdrawn' / 'textures' / ('painted_' + key + '.png')
        destination = texture_dir / source.name
        if not destination.exists():
            shutil.copy2(source, destination)
        im = bpy.data.images.load(str(destination), check_existing=True)
        im.name = 'LP_Painted_' + key
        im.pack()
        images[key] = im
    for name, mat in mats.items():
        key = name.removeprefix('SS_A_')
        material_type = ('wood' if key in ('wood', 'wood_light') else
                         'rock' if key in ('rock', 'rock_light', 'rock_dark', 'stone') else
                         'roof' if key in ('roof', 'roof_edge') else
                         'leaf' if key in ('grass', 'moss', 'leaf', 'leaf_light', 'leaf_dark', 'fern') else None)
        if not material_type:
            continue
        n, l = mat.node_tree.nodes, mat.node_tree.links
        p = n.get('Principled BSDF')
        # Painted colour is carried by albedo, never a normal map hiding the facets.
        for link in list(p.inputs['Normal'].links):
            l.remove(link)
        p.inputs['Roughness'].default_value = .88
        p.inputs['Specular IOR Level'].default_value = .14
        old = p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].links else None
        tex = n.new('ShaderNodeTexImage')
        tex.image = images[material_type]
        tex.extension = 'REPEAT'
        tc = n.new('ShaderNodeTexCoord')
        if material_type in ('wood', 'roof'):
            l.new(tc.outputs['UV'], tex.inputs['Vector'])
        else:
            scale = n.new('ShaderNodeVectorMath')
            scale.operation = 'SCALE'
            scale.inputs['Scale'].default_value = .17 if material_type == 'rock' else .22
            l.new(tc.outputs['Object'], scale.inputs[0])
            l.new(scale.outputs[0], tex.inputs[0])
            tex.projection = 'BOX'
            tex.projection_blend = .2
        mix = n.new('ShaderNodeMixRGB')
        mix.blend_type = 'MULTIPLY'
        mix.inputs[0].default_value = .62 if material_type == 'wood' else .3
        if old:
            l.new(old, mix.inputs[1])
        else:
            mix.inputs[1].default_value = p.inputs['Base Color'].default_value
        l.new(tex.outputs['Color'], mix.inputs[2])
        l.new(mix.outputs[0], p.inputs['Base Color'])


def subdivide_facets(ob, cuts, amplitude, rng):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    old = set(bm.verts)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts, use_grid_fill=True)
    bm.normal_update()
    for v in bm.verts:
        if v not in old:
            v.co += v.normal * rng.uniform(-amplitude, amplitude)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    for f in ob.data.polygons:
        f.use_smooth = False


def folded_leaf(center, u, v, normal, length, width, vertices, faces, indices, material):
    b = len(vertices)
    vertices.extend([tuple(center + normal * .045), tuple(center + u * length),
                     tuple(center + v * width), tuple(center - u * length * .85),
                     tuple(center - v * width)])
    faces.extend([(b, b + 1, b + 2), (b, b + 2, b + 3),
                  (b, b + 3, b + 4), (b, b + 4, b + 1)])
    indices.extend([material] * 4)


def vegetation(root, mapping, mats):
    rng = random.Random(1831)
    c = bpy.data.collections.new('LP_Angular_Planting')
    root.children.link(c)
    # The simpler crown cage has broad, jagged planes; folded leaf sprays add detail.
    crown = mapping['SS_A_Tree_Canopies']
    crown.data = bpy.data.objects['SS_B_Tree_Canopies'].data.copy()
    for i, key in enumerate(('leaf', 'leaf_light', 'leaf_dark')):
        crown.data.materials[i] = mats['SS_A_' + key]
    for f in crown.data.polygons:
        f.use_smooth = False
    crown.data.update()
    oldleaves = mapping['SS_A_Folded_Leaves']
    oldleaves.hide_render = True
    oldleaves.hide_viewport = True
    verts, faces, indices = [], [], []
    for f in crown.data.polygons:
        normal = f.normal.copy()
        u = normal.cross(Vector((0, 0, 1)))
        if u.length < .01:
            u = Vector((1, 0, 0))
        u.normalize()
        v = normal.cross(u).normalized()
        for j in range(6):
            angle = rng.uniform(0, math.tau)
            a = u * math.cos(angle) + v * math.sin(angle)
            b = normal.cross(a).normalized()
            point = f.center + u * rng.uniform(-.22, .22) + v * rng.uniform(-.18, .18) + normal * rng.uniform(.02, .10)
            length = rng.uniform(.13, .26)
            folded_leaf(point, a, b, normal, length, length * .48,
                        verts, faces, indices, rng.choices([0, 1, 2], [6, 2, 2])[0])
    leafm = [mats['SS_A_' + key] for key in ('leaf', 'leaf_light', 'leaf_dark')]
    mesh_object('LP_Faceted_Crown_Sprays', verts, faces, c, leafm, indices)
    # Crisp two-sided angular blades, concentrated along beds rather than carpeted everywhere.
    verts, faces, indices = [], [], []
    for i in range(3000):
        x, y = rng.uniform(-15, 15), rng.uniform(-10, 10)
        if (x / 15) ** 2 + (y / 10.5) ** 2 > .96 or (-8 < x < 6 and -.8 < y < 9) or (2 < x < 6.3 and y < 5):
            continue
        for j in range(3):
            a = rng.uniform(0, math.tau)
            u = Vector((math.cos(a), math.sin(a), 0))
            v = Vector((-u.y, u.x, 0))
            q = Vector((x, y, .46))
            h = rng.uniform(.14, .34)
            folded_leaf(q + Vector((0, 0, h * .45)), u * .3 + Vector((0, 0, 1)), v,
                        u, h * .55, .025, verts, faces, indices, rng.randrange(3))
    mesh_object('LP_Angular_Meadow', verts, faces, c, leafm, indices)
    return c


def add_crafted_details(root, mats):
    c = bpy.data.collections.new('LP_Crafted_Details')
    root.children.link(c)
    wood = mats['SS_A_wood_light']
    slate = mats['SS_A_roof_edge']
    book = mats['SS_A_paper']
    # The actual slate relief is planar; shallow bevels remain single facets.
    tiles = Batch('LP_Individual_Planar_Slates', c, [mats['SS_A_roof'], slate])
    for sign in (-1, 1):
        for j in range(22):
            y = .1 + j * .415
            for k in range(10):
                d = .25 + k * .50
                z = 8.40 - d * .69 + .30 * (d / 5.1) ** 5
                ang = sign * math.atan(.69 - 1.5 * (d / 5.1) ** 4 / 5.1)
                from mathutils import Matrix
                tiles.box((-3 + sign * d, y, z), (.53, .40, .035), (j + k) % 7 == 0,
                          Matrix.Rotation(ang, 4, 'Y'))
    tiles.finish()
    detail = Batch('LP_Joinery_and_Desk_Life', c, [wood, book, mats['SS_A_metal'], mats['SS_A_leaf']])
    for x in (-7, 1):
        for y in (1, 8.3):
            detail.beam((x, y, 4.3), (x + (.7 if x == -7 else -.7), y, 5.14), .10)
    for i in range(6):
        detail.box((-4.9 + i * .23, -.2, 1.30), (.17, .35, .15 + (i % 3) * .05), 1)
    detail.box((-5.1, .1, 1.34), (.7, .6, .08), 1)
    detail.box((-5.1, .1, 1.39), (.63, .55, .03), 0)
    for j in range(5):
        detail.box((-5.1, -.08 + j * .07, 1.41), (.39, .012, .004), 2)
    for x, y in [(-6.8, -.3), (.5, -.3), (4.5, 2.8)]:
        # Eight-sided pot, triangulated angular foliage rather than rounded topiary.
        detail.part('ico', (x, y, 1.45), (.27, .27, .31), 0, 1)
        for k in range(8):
            a = k * 2.4
            detail.beam((x, y, 1.6), (x + .23 * math.cos(a), y + .23 * math.sin(a), 2.0 + .1 * math.sin(k)), .025, mat=3)
            detail.part('ico', (x + .23 * math.cos(a), y + .23 * math.sin(a), 2.0 + .1 * math.sin(k)), (.16, .09, .08), 3, 1)
    detail.finish()


def counts(scene, prefix):
    dg = bpy.context.evaluated_depsgraph_get()
    rows = []
    for ob in scene.objects:
        if ob.type != 'MESH' or not ob.name.startswith(prefix) or ob.hide_render:
            continue
        ob.data.calc_loop_triangles()
        ev = ob.evaluated_get(dg)
        ev.data.calc_loop_triangles()
        rows.append({'object': ob.name, 'base_triangles': len(ob.data.loop_triangles),
                     'render_triangles': len(ev.data.loop_triangles)})
    return {'base_triangles': sum(r['base_triangles'] for r in rows),
            'render_triangles': sum(r['render_triangles'] for r in rows), 'objects': rows}


def build():
    if bpy.data.scenes.get('LP_Faceted_Sanctuary'):
        raise RuntimeError('Faceted study already exists; refine it in place.')
    ROOT.mkdir(exist_ok=True)
    (ROOT / 'renders').mkdir(exist_ok=True)
    scene = bpy.data.scenes.new('LP_Faceted_Sanctuary')
    root = bpy.data.collections.new('LP_Faceted_World')
    scene.collection.children.link(root)
    mapping, mats = {}, {}
    clone_tree(bpy.data.collections['SS_Shared_Environment'], scene.collection, mapping, mats)
    clone_tree(bpy.data.collections['SS_A_Sanctuary'], root, mapping, mats)
    paint(mats)
    for name, ob in mapping.items():
        if name.startswith('SS_A_') and ob.type == 'MESH':
            grain_uv(ob)
    rng = random.Random(1541)
    # Double the edge resolution in both directions, retaining deliberate non-coplanar planes.
    subdivide_facets(mapping['SS_A_Floating_Rock'], 2, .34, rng)
    subdivide_facets(mapping['SS_A_Cliff_Outcrops'], 1, .10, rng)
    # Broad canopy forms are replaced, not merely smooth-shading toggled.
    vegetation(root, mapping, mats)
    add_crafted_details(root, mats)
    polish = runpy.run_path(str(ROOT / 'polish_faceted.py'))
    polish['add_geology'](scene, root, mapping, mats)
    # Every visible hero face is planar, including water, plants, paths and furniture.
    for ob in root.all_objects:
        if ob.type == 'MESH':
            for f in ob.data.polygons:
                f.use_smooth = False
    world = bpy.data.worlds['SS_Blue_Hour_World'].copy()
    world.name = 'LP_Blue_Hour'
    BASE['setup'](scene, world)
    scene.eevee.use_volume_custom_range = True
    scene.eevee.volumetric_end = 2000
    scene.eevee.volumetric_samples = 96
    scene.view_settings.exposure = .4
    scene.render.use_freestyle = False
    scene.camera = mapping['SS_Camera_Overview']
    scene['Art_Direction'] = 'Fully faceted low-poly sanctuary; about twice original A base triangle count. Painted albedo, no smooth normals, no rounded canopy blobs.'
    scene['Reference_Baseline'] = 'Original SS_Study_A_Cinematic: 59962 base foreground triangles, 111714 rendered triangles.'
    if bpy.context.window:
        bpy.context.window.scene = scene
        for area in bpy.context.screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.shading.type = 'SOLID'
                area.spaces.active.shading.color_type = 'MATERIAL'
                area.spaces.active.overlay.show_overlays = False
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
    bpy.context.view_layer.update()
    report = counts(scene, 'LP_SS_A_')
    added = counts(scene, 'SS_LP_')
    report['base_triangles'] += added['base_triangles']
    report['render_triangles'] += added['render_triangles']
    report['objects'] += added['objects']
    report['base_ratio_to_A'] = round(report['base_triangles'] / 59962, 3)
    report['render_ratio_to_A'] = round(report['render_triangles'] / 111714, 3)
    report['smooth_hero_faces'] = sum(f.use_smooth for ob in root.all_objects if ob.type == 'MESH' and not ob.hide_render for f in ob.data.polygons)
    report['note'] = 'Foreground only. Distant city and volumetric cloud reference excluded. No browser performance claim.'
    path = ROOT / 'sanctuary_faceted.blend'
    if path.exists():
        raise FileExistsError(path)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), check_existing=False)
    report['blend'] = str(path)
    report['scene'] = scene.name
    (ROOT / 'geometry_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return {k: v for k, v in report.items() if k != 'objects'}


if __name__ == '__main__':
    result = build()

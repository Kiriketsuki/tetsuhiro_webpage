"""Irregular shallow pond and restrained hand-painted wear. Earlier scenes survive."""
from pathlib import Path
import json
import math
import random
import runpy
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
API = runpy.run_path(str(ROOT / 'build_aeries.py'))
HELP = runpy.run_path(str(ROOT / 'refine_atelier.py'))
Batch, mesh_object = API['Batch'], API['mesh_object']


def clone_tree(source, parent, mapping, materials):
    c = bpy.data.collections.new('PT_' + source.name); parent.children.link(c)
    for old in source.objects:
        ob = old.copy(); ob.name = 'PT_' + old.name
        if old.data:
            ob.data = old.data.copy()
        c.objects.link(ob); mapping[old.name] = ob
        if ob.type == 'MESH':
            for i, mat in enumerate(list(ob.data.materials)):
                if mat:
                    if mat.name not in materials:
                        new = mat.copy(); new.name = 'PT_' + mat.name; materials[mat.name] = new
                    ob.data.materials[i] = materials[mat.name]
    for child in source.children:
        clone_tree(child, c, mapping, materials)
    return c


def components(mesh):
    bm = bmesh.new(); bm.from_mesh(mesh)
    unseen = set(bm.verts); groups = []
    while unseen:
        group = {unseen.pop()}; stack = list(group)
        while stack:
            v = stack.pop()
            for edge in v.link_edges:
                other = edge.other_vert(v)
                if other in unseen:
                    unseen.remove(other); group.add(other); stack.append(other)
        groups.append(group)
    return bm, groups


def shore_shape(water):
    me = water.data; stride = 25
    left, right = [], []
    for j in range(22):
        row = [me.vertices[j * stride + i] for i in range(stride)]
        old_left, old_right = row[0].co.x, row[-1].co.x
        cx = (old_left + old_right) / 2; half = (old_right - old_left) / 2
        t = j / 21; weight = math.sin(math.pi * t)
        cx += .28 * math.sin(t * 5.3) * weight
        l = cx - half * (1 + weight * (.095 * math.sin(t * 11 + .4) + .035))
        r = cx + half * (1 + weight * .085 * math.sin(t * 9.5 + 1.4))
        for i, vertex in enumerate(row):
            vertex.co.x = l + (r - l) * i / (stride - 1)
        left.append(Vector((l, row[0].co.y))); right.append(Vector((r, row[-1].co.y)))
    me.update()
    return [Vector((4, 6.5))] + left + list(reversed(right))


def signed_distance(x, y, polygon):
    q = Vector((x, y)); d = 100; inside = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        edge = b - a
        if edge.length_squared > 1e-9:
            t = max(0, min(1, (q - a).dot(edge) / edge.length_squared))
            d = min(d, (q - a - edge * t).length)
        if (a.y > y) != (b.y > y) and x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x:
            inside = not inside
    return -d if inside else d


def bank_terrain(body, polygon):
    bm = bmesh.new(); bm.from_mesh(body.data)
    faces = [f for f in bm.faces if f.calc_center_median().z > -.1 and
             (f.calc_center_median().x - 4) ** 2 + (f.calc_center_median().y - 4) ** 2 < 4.4 ** 2]
    edges = {e for f in faces for e in f.edges}
    bmesh.ops.subdivide_edges(bm, edges=list(edges), cuts=1, use_grid_fill=True)
    for vertex in bm.verts:
        x, y, z = vertex.co
        if z < -.1 or y < 2.0 or not (-.2 < x < 8.2 and y < 7.5):
            continue
        d = signed_distance(x, y, polygon)
        if d < -.40:
            target = .06 + .035 * math.sin(x * 1.4 + y)
        elif d < 0:
            t = (d + .40) / .40
            target = .06 + .55 * t * t
        elif d < .9:
            t = d / .9; t = t * t * (3 - 2 * t)
            target = .65 * (1 - t) + z * t
        else:
            continue
        # Do not create a dam across the pond's open outlet.
        influence = max(0, min(1, (y - 2) / .55))
        vertex.co.z += (target - vertex.co.z) * influence
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for face in bm.faces:
        face.smooth = False
    bm.to_mesh(body.data); bm.free(); body.data.update()
    return BVHTree.FromPolygons([v.co for v in body.data.vertices], [list(f.vertices) for f in body.data.polygons])


def ground_z(bvh, x, y):
    point, normal, face, distance = bvh.ray_cast(Vector((x, y, 10)), Vector((0, 0, -1)))
    return point.z if point is not None else .4


def material_wash(mat, key):
    n, l = mat.node_tree.nodes, mat.node_tree.links; p = n.get('Principled BSDF')
    if not p:
        return
    old = p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].links else None
    old_color = p.inputs['Base Color'].default_value[:]
    tc = n.new('ShaderNodeTexCoord'); noise = n.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = .95 if key == 'plaster' else 3.2
    noise.inputs['Detail'].default_value = 2
    l.new(tc.outputs['Object'], noise.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (.80, .78, .73, 1)
    ramp.color_ramp.elements[1].color = (1, .98, .92, 1)
    l.new(noise.outputs['Fac'], ramp.inputs[0])
    mix = n.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = .42
    if old:
        l.new(old, mix.inputs[1])
    else:
        mix.inputs[1].default_value = old_color
    l.new(ramp.outputs[0], mix.inputs[2]); l.new(mix.outputs[0], p.inputs['Base Color'])
    if key in ('wood', 'wood_light', 'roof'):
        attr = n.new('ShaderNodeAttribute'); attr.attribute_name = 'handcrafted_wear'
        fade = n.new('ShaderNodeMixRGB'); fade.inputs[2].default_value = (.38, .28, .18, 1) if key != 'roof' else (.13, .22, .28, 1)
        l.new(attr.outputs['Fac'], fade.inputs[0]); l.new(mix.outputs[0], fade.inputs[1]); l.new(fade.outputs[0], p.inputs['Base Color'])
    for link in list(p.inputs['Normal'].links):
        l.remove(link)
    p.inputs['Roughness'].default_value = .88


def add_wear(ob, rng, warp=False):
    # Allocate the mesh attribute before collecting BMesh element references.
    # Adding a BMesh custom-data layer can invalidate existing BMVert wrappers.
    if not ob.data.attributes.get('handcrafted_wear'):
        ob.data.attributes.new('handcrafted_wear', 'FLOAT', 'POINT')
    bm, groups = components(ob.data)
    layer = bm.verts.layers.float['handcrafted_wear']
    for group in groups:
        amount = rng.uniform(.015, .12)
        for v in group:
            v[layer] = amount
        if warp:
            lo = Vector(tuple(min(v.co[i] for v in group) for i in range(3)))
            hi = Vector(tuple(max(v.co[i] for v in group) for i in range(3)))
            size = hi - lo; center = (lo + hi) / 2
            if size.y > 1.4 and size.x < .4 and size.z < .20:
                rot = Matrix.Rotation(rng.uniform(-.010, .010), 3, 'Z')
                for v in group:
                    v.co = center + rot @ (v.co - center)
    bm.to_mesh(ob.data); bm.free(); ob.data.update()


def pond_details(common, body_bvh, polygon, materials, water):
    rng = random.Random(2213); c = API['collection']('Pond_Character', common)
    stone = API['BASE']['material']('PT_Waterline_Stone', (.31, .34, .33), .82)
    n, l = stone.node_tree.nodes, stone.node_tree.links; p = n.get('Principled BSDF')
    tc = n.new('ShaderNodeTexCoord'); tex = n.new('ShaderNodeTexImage'); tex.image = bpy.data.images['LP_Painted_rock']; tex.projection = 'BOX'; tex.projection_blend = .15
    l.new(tc.outputs['Object'], tex.inputs[0])
    geo = n.new('ShaderNodeNewGeometry'); sep = n.new('ShaderNodeSeparateXYZ'); l.new(geo.outputs['Position'], sep.inputs[0])
    wet = n.new('ShaderNodeMapRange'); wet.inputs['From Min'].default_value = .60; wet.inputs['From Max'].default_value = .81
    l.new(sep.outputs['Z'], wet.inputs['Value'])
    ramp = n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (.10, .17, .15, 1); ramp.color_ramp.elements[1].color = (.38, .40, .36, 1)
    l.new(wet.outputs[0], ramp.inputs[0])
    mix = n.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = .27
    l.new(ramp.outputs[0], mix.inputs[1]); l.new(tex.outputs[0], mix.inputs[2]); l.new(mix.outputs[0], p.inputs['Base Color'])
    moss = API['BASE']['material']('PT_Bank_Moss', (.17, .28, .12), .98)
    reeds_mat = API['BASE']['material']('PT_Reed_Leaf', (.23, .34, .16), .88)
    reeds_tip = API['BASE']['material']('PT_Reed_Seed', (.32, .21, .11), .94)
    stone_batch = Batch('PT_Pond_Shore_Stones', c, [stone, moss])
    for j in [1, 3, 4, 7, 10, 13, 17, 25, 29, 32, 36, 39, 43]:
        q = polygon[j % len(polygon)]
        outward = (q - Vector((4, 4))).normalized()
        q += outward * rng.uniform(.03, .17)
        z = ground_z(body_bvh, q.x, q.y)
        size = rng.uniform(.22, .48)
        stone_batch.part('ico', (q.x, q.y, z + size * .25), (size * 1.3, size, size * .62), 0, 1,
                         Matrix.Rotation(rng.uniform(0, math.tau), 4, 'Z'))
        for k in range(rng.randrange(1, 4)):
            x, y = q.x + rng.uniform(-.45, .45), q.y + rng.uniform(-.35, .35)
            z = ground_z(body_bvh, x, y)
            stone_batch.part('ico', (x, y, z + .055), (.11, .08, .10), 0, 1)
    stones = stone_batch.finish()
    for face in stones.data.polygons:
        if face.normal.z > .45 and rng.random() < .15:
            face.material_index = 1
    stem = Batch('PT_Pond_Reed_Stems', c, [reeds_mat, reeds_tip])
    vertices, faces, indices = [], [], []
    for j in [3, 8, 14, 31, 38]:
        q = polygon[j]; direction = (q - Vector((4, 4))).normalized(); q += direction * .10
        for k in range(9):
            x, y = q.x + rng.uniform(-.18, .18), q.y + rng.uniform(-.16, .16)
            z = ground_z(body_bvh, x, y); h = rng.uniform(.40, .78)
            stem.beam((x, y, z - .03), (x + .04, y, z + h), .018)
            if k % 3 == 0:
                stem.part('ico', (x + .04, y, z + h - .04), (.035, .035, .11), 1, 1)
            for side in (-1, 1):
                base = len(vertices); bend = rng.uniform(.14, .27) * side
                vertices.extend([(x - .022, y, z), (x + .022, y, z),
                                 (x + bend, y + .07, z + h * .75),
                                 (x + bend * .50, y + .04, z + h * .53)])
                faces.extend([(base, base + 1, base + 3), (base + 1, base + 2, base + 3)]); indices.extend([0, 0])
    stem.finish(); mesh_object('PT_Reed_Blades', vertices, faces, c, [reeds_mat], indices)
    pad_mat = API['BASE']['material']('PT_Lily_Pad', (.14, .31, .17), .64)
    pad_edge = API['BASE']['material']('PT_Lily_Pad_Edge', (.30, .39, .16), .82)
    vertices, faces, indices = [], [], []
    pads = [(3.0, 4.55, .22), (3.42, 4.75, .17), (4.70, 5.15, .21), (5.08, 4.97, .15), (2.8, 3.8, .16)]
    for x, y, radius in pads:
        b = len(vertices); vertices.append((x, y, .651)); a0 = rng.uniform(0, math.tau)
        for i in range(10):
            a = a0 + i / 10 * math.tau
            r = radius * rng.uniform(.88, 1.08); vertices.append((x + r * math.cos(a), y + r * math.sin(a), .647))
        for i in range(1, 10):
            faces.append((b, b + i, b + i + 1)); indices.append(1 if i == 6 else 0)
    mesh_object('PT_Notched_Lily_Pads', vertices, faces, c, [pad_mat, pad_edge], indices)
    ripple_mat = API['BASE']['material']('PT_Painted_Ripple', (.45, .65, .60), .60, emission=.035)
    vertices, faces = [], []
    for x, y, radius in pads[:4] + [(4.6, 3.1, .75), (5.3, 4.1, .90)]:
        a0 = rng.uniform(0, math.tau); span = rng.uniform(.85, 2.1)
        for i in range(13):
            a = a0 + span * i / 12
            for r in (radius + .13, radius + .145):
                vertices.append((x + r * math.cos(a), y + r * .72 * math.sin(a), .642))
        base = len(vertices) - 26
        faces.extend([(base + i * 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2) for i in range(12)])
    mesh_object('PT_Broken_Pond_Ripples', vertices, faces, c, [ripple_mat])
    return {'lily_pads': len(pads), 'reed_tussocks': 5, 'shore_rocks': 13}


def water_material(water):
    me = water.data; attr = me.attributes.new('pond_shallows', 'FLOAT', 'POINT')
    for i, item in enumerate(attr.data):
        row, column = divmod(i, 25)
        edge = abs(column / 24 * 2 - 1)
        item.value = max(0, min(1, (edge - .55) / .45)) if row < 29 else 0
    mat = me.materials[0]; n, l = mat.node_tree.nodes, mat.node_tree.links; p = n.get('Principled BSDF')
    field = n.new('ShaderNodeAttribute'); field.attribute_name = 'pond_shallows'
    colours = n.new('ShaderNodeValToRGB'); colours.color_ramp.elements[0].color = (.065, .24, .29, 1)
    colours.color_ramp.elements[1].color = (.25, .43, .33, 1); l.new(field.outputs['Fac'], colours.inputs[0])
    old = p.inputs['Base Color'].links[0].from_socket
    mix = n.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = .18
    l.new(colours.outputs[0], mix.inputs[1]); l.new(old, mix.inputs[2]); l.new(mix.outputs[0], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = .28; p.inputs['Specular IOR Level'].default_value = .38
    return 'Painted deeper blue-green centre, olive-teal shallows, broken geometric ripples.'


def build():
    if bpy.data.scenes.get('UA_B_Atelier_PondPatina'):
        raise RuntimeError('Pond/patina scene exists; edit it in place.')
    source = bpy.data.scenes['UA_B_Atelier_Sheltered']; scene = source.copy(); scene.name = 'UA_B_Atelier_PondPatina'
    scene.compositing_node_group = source.compositing_node_group.copy()
    for node in scene.compositing_node_group.nodes:
        if node.type == 'R_LAYERS': node.scene = scene
    mapping, materials = {}, {}
    for name in ('SH_UA_B_Atelier', 'SH_UA_Shared_Corrected_Island'):
        old = bpy.data.collections[name]; scene.collection.children.unlink(old); clone_tree(old, scene.collection, mapping, materials)
    common = bpy.data.collections['PT_SH_UA_Shared_Corrected_Island']
    water = mapping['SS_SH_Pond_Stream_and_Waterfall']; body = mapping['SH_SS_UA_Connected_Island']
    polygon = shore_shape(water); bvh = bank_terrain(body, polygon)
    banks = mapping['SH_SS_UA_Grounded_Stream_Banks']
    removed = HELP['remove_parts'](banks, lambda q: q.y > 1.6 and .78 < math.sqrt(((q.x - 4) / 3.05) ** 2 + ((q.y - 4) / 2.65) ** 2) < 1.25)
    detail = pond_details(common, bvh, polygon, materials, water)
    rng = random.Random(2297)
    for name, mat in materials.items():
        key = name.removeprefix('LP_SS_A_')
        if key in ('wood', 'wood_light', 'plaster', 'roof', 'roof_edge', 'stone', 'rock', 'rock_light'):
            material_wash(mat, key)
        if name == 'SS_UA_Path_Sandy_Stone':
            material_wash(mat, 'stone')
    return complete(scene, common, mapping, detail, removed)


def complete(scene, common, mapping, detail, removed):
    water = mapping['SS_SH_Pond_Stream_and_Waterfall']; body = mapping['SH_SS_UA_Connected_Island']
    bvh = BVHTree.FromPolygons([v.co for v in body.data.vertices], [list(f.vertices) for f in body.data.polygons])
    settled = 0
    for name, ob in mapping.items():
        if ob.type == 'MESH' and any(k in name for k in ('Meadow', 'Ground_Planting', 'Grass_Accents')):
            bm, groups = components(ob.data)
            for group in groups:
                center = sum((v.co for v in group), Vector()) / len(group)
                if center.y > 2 and (center.x - 4) ** 2 + (center.y - 4) ** 2 < 4.4 ** 2:
                    shift = ground_z(bvh, center.x, center.y) - .025 - min(v.co.z for v in group)
                    for v in group: v.co.z += shift
                    settled += 1
            bm.to_mesh(ob.data); bm.free(); ob.data.update()
    rng = random.Random(2297)
    for name, ob in mapping.items():
        if ob.type != 'MESH' or ob.hide_render:
            continue
        if any(k in name for k in ('Timber', 'Roof', 'Frames_and_Shutters', 'Garden_Footbridge', 'City_Lookout')):
            add_wear(ob, rng, 'Garden_Footbridge' in name)
        if 'Connected_Path_' in name:
            for v in ob.data.vertices:
                # Keep the terminal joins exact, roughen only the intermediate corners.
                if -3.8 < v.co.y < -1.0:
                    v.co.x += rng.uniform(-.025, .025)
            ob.data.update()
    mat = water_material(water)
    cameras = API['collection']('Pond_Patina_Cameras', scene.collection)
    pondcam = API['BASE']['camera']('PT_Pond', cameras, (10, -6.5, 11), (4, 4, .65), 65); pondcam.data.clip_end = 6500
    finish_details(scene, common)
    scene.camera = bpy.data.objects['SS_UA_House']; scene.render.resolution_x = scene.render.resolution_y = 1600
    scene['Pond_Patina'] = 'Irregular fitted shoreline, shallow basin, waterline stones, reeds, lily pads, painted ripples; restrained material wear.'
    if bpy.context.window: bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    report = {'scene': scene.name, 'terrain': API['audit_island'](body), 'old_pond_rocks_removed': removed,
              'bank_plant_components_reseated': settled,
              'pond_details': detail, 'water_treatment': mat,
              'wear': 'Painted timber/plaster/stone washes, per-piece timber fading, slightly uneven bridge boards and path edges.'}
    path = ROOT / 'atelier_pond_patina.blend'
    if path.exists(): raise FileExistsError(path)
    bpy.ops.wm.save_as_mainfile(filepath=str(path), check_existing=False)
    report['blend'] = str(path)
    (ROOT / 'pond_patina_report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


def finish_details(scene, common):
    if scene.get('Patina_Reviewed'):
        return {'status': 'already finished'}
    # Quieter broken concentric arcs do not cross one another.
    old = bpy.data.objects['SS_PT_Broken_Pond_Ripples']
    mat = old.data.materials[0]; p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (.30, .46, .43, 1)
    p.inputs['Emission Strength'].default_value = .01
    vertices, faces = [], []
    for x, y, radius, a0, span in [(3.2, 4.63, .44, 2.7, 1.5), (4.9, 5.05, .39, 4.0, 1.6),
                                   (5.6, 3.6, .38, .2, 1.1), (5.6, 3.6, .63, .35, 1.2)]:
        base = len(vertices)
        for i in range(17):
            a = a0 + span * i / 16
            for r in (radius, radius + .009):
                vertices.append((x + r * math.cos(a), y + r * .72 * math.sin(a), .642))
        faces.extend([(base + i * 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2) for i in range(16)])
    temp = mesh_object('PT_Refined_Ripples', vertices, faces, common, [mat])
    old.data = temp.data; bpy.data.objects.remove(temp, do_unlink=True)
    c = API['collection']('Small_Wear_Details', common)
    ink = API['BASE']['material']('PT_Warm_Wear_Marks', (.17, .14, .10), .95)
    vertices, faces = [], []
    def line(points, width=.009, axis='XY'):
        for a, b in zip(points, points[1:]):
            a, b = Vector(a), Vector(b); d = b - a
            side = Vector((-d.y, d.x, 0)) if axis == 'XY' else Vector((d.z, 0, -d.x))
            side.normalize(); side *= width / 2
            base = len(vertices); vertices.extend([tuple(a - side), tuple(a + side), tuple(b + side), tuple(b - side)])
            faces.append((base, base + 1, base + 2, base + 3))
    line([(-3.95, 1.842, 4.96), (-4.00, 1.842, 4.84), (-3.96, 1.842, 4.77), (-4.01, 1.842, 4.65)], .007, 'XZ')
    line([(-2.97, -2.25, .48), (-2.84, -2.16, .48), (-2.71, -2.20, .48), (-2.56, -2.05, .48)], .010)
    line([(-.35, -4.0, .48), (-.23, -4.16, .48), (-.15, -4.19, .48), (-.10, -4.35, .48)], .008)
    rng = random.Random(2339)
    for i in (2, 5, 8, 11):
        x = 2.2 + i * .32; z = .9 + .48 * math.sin(i / 13 * math.pi) + .067
        for j in range(2):
            px = x + rng.uniform(-.07, .07)
            line([(px, -5.57, z), (px + .01, -5.25, z), (px - .007, -4.93, z), (px + .008, -4.61, z)], .006)
        for y in (-5.65, -4.45):
            b = len(vertices); vertices.extend([(x - .015, y, z), (x, y + .015, z), (x + .015, y, z), (x, y - .015, z)])
            faces.append((b, b + 1, b + 2, b + 3))
    mesh_object('PT_Fine_Handmade_Wear', vertices, faces, c, [ink])
    stones = bpy.data.objects['SS_PT_Pond_Shore_Stones']
    for face in stones.data.polygons:
        if face.normal.z > .45 and rng.random() < .14:
            face.material_index = 1
    cam = bpy.data.objects['SS_PT_Pond']; cam.location = (10, -6.5, 11)
    cam.rotation_euler = (Vector((4, 4, .65)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 65
    scene['Patina_Reviewed'] = True
    return {'details': 'Quiet non-crossing ripples, fine wear marks, irregular path edges and end-grain scratches.'}


def resume():
    """Finish the first interrupted attribute-allocation attempt without discarding work."""
    scene = bpy.data.scenes['UA_B_Atelier_PondPatina']; mapping = {}
    for name in ('PT_SH_UA_B_Atelier', 'PT_SH_UA_Shared_Corrected_Island'):
        for ob in bpy.data.collections[name].all_objects:
            if ob.name.startswith('PT_'):
                mapping[ob.name.removeprefix('PT_')] = ob
    return complete(scene, bpy.data.collections['PT_SH_UA_Shared_Corrected_Island'], mapping,
                    {'lily_pads': 5, 'reed_tussocks': 5, 'shore_rocks': 13}, 11)


if __name__ == '__main__':
    result = build()

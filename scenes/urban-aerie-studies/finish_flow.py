"""Close visual flow seams and seat the lookout safely within the island outline."""
from pathlib import Path
import math
import json
import runpy
import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
API = runpy.run_path(str(ROOT / 'build_aeries.py'))


def add_water(common, mapping):
    for name, ob in mapping.items():
        if any(key in name for key in ('Spring_Pond', 'Waterfall_Ribbon')) or name.endswith('_Stream'):
            ob.hide_render = True; ob.hide_viewport = True
    top = bpy.data.materials['LP_SS_A_water'].copy(); top.name = 'SH_Continuous_Water_Wash'
    n, l = top.node_tree.nodes, top.node_tree.links; p = n.get('Principled BSDF')
    tex = n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = 2.5; tex.inputs['Detail'].default_value = 1
    tc = n.new('ShaderNodeTexCoord'); scale = n.new('ShaderNodeVectorMath'); scale.operation = 'MULTIPLY'; scale.inputs[1].default_value = (1.5, .25, .25)
    l.new(tc.outputs['Object'], scale.inputs[0]); l.new(scale.outputs[0], tex.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color = (.12, .37, .42, 1); ramp.color_ramp.elements[1].color = (.26, .54, .57, 1)
    l.new(tex.outputs['Fac'], ramp.inputs[0]); l.new(ramp.outputs[0], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = .32
    fall = bpy.data.materials['LP_SS_A_fall'].copy(); fall.name = 'SH_Continuous_Falling_Water'
    for link in list(fall.node_tree.nodes.get('Principled BSDF').inputs['Normal'].links):
        fall.node_tree.links.remove(link)
    rows = []
    for j in range(22):
        y = 6.45 - j / 21 * 4.85
        width = max(2.1 if y < 2 else .25, 5.8 * math.sqrt(max(0, 1 - ((y - 4) / 2.5) ** 2)))
        if y < 2.3:
            blend = max(0, min(1, (y - 1.6) / .7))
            width = 2.1 * (1 - blend) + width * blend
        rows.append((4, y, .63, width, 0))
    for x, y, z, w in [(3.8, 1, .63, 2), (3.6, -1, .61, 1.8), (4, -3, .60, 2.2),
                        (4.3, -5, .58, 2.1), (4.2, -7, .57, 2.2), (4.7, -9.3, .52, 2.5),
                        (4.9, -10.8, .2, 2.7)]:
        rows.append((x, y, z, w, 0))
    for j in range(1, 81):
        t = j / 80
        rows.append((4.9 + .055 * math.sin(t * 13), -10.8 - 2.1 * (1 - math.exp(-6 * t)),
                     .2 - 31 * t, 2.7 + .35 * t, 1))
    nx = 24; vertices = []; faces = []; indices = []
    for x, y, z, width, material in rows:
        for i in range(nx + 1):
            u = i / nx - .5
            vertices.append((x + u * width, y, z))
    stride = nx + 1
    for j in range(len(rows) - 1):
        for i in range(nx):
            a = j * stride + i
            faces.append((a, a + stride, a + stride + 1, a + 1)); indices.append(rows[j + 1][4])
    tip = len(vertices); vertices.append((4, 6.5, .63))
    for i in range(nx):
        faces.append((tip, i, i + 1)); indices.append(0)
    ob = API['mesh_object']('SH_Pond_Stream_and_Waterfall', vertices, faces, common, [top, fall], indices)
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(ob.data); bm.free()
    ob['Continuity'] = 'Pond, stream, lip and waterfall share vertices in one continuous surface.'
    return ob


def finish(scene, common, mapping):
    if scene.get('Flow_Finished'):
        return {'status': 'already finished'}
    # Inward shift seats every lookout leg inside the land outline.
    for name in ('SS_UA_City_Lookout', 'SS_UA_Lookout_Access_Step'):
        ob = mapping[name]
        for v in ob.data.vertices:
            v.co.x -= .5; v.co.y += .25
        ob.data.update()
    ob = mapping['SS_UA_Connected_Path_1']
    points = [(7.10, -5.05), (7.5, -5.05), (7.95, -5.70)]
    temp = API['path_mesh']('SH_Revised_Lookout_Path', points, common, bpy.data.materials['SS_UA_Path_Sandy_Stone'])
    field = runpy.run_path(str(ROOT / 'refine_landscape.py'))
    for v in temp.data.vertices:
        v.co.z += field['height'](v.co.x, v.co.y) - API['top_height'](v.co.x, v.co.y)
    ob.data = temp.data; bpy.data.objects.remove(temp, do_unlink=True)
    water = add_water(common, mapping)
    garden = bpy.data.objects.get('SS_SH_Garden')
    if garden:
        garden.location.z = 13
        garden.rotation_euler = (Vector((1, -2.5, 1)) - garden.location).to_track_quat('-Z', 'Y').to_euler()
    scene['Flow_Finished'] = True
    return {'water': water.name, 'lookout': 'Deck and step moved 0.5m inward; path end rebuilt to meet the step.'}


def run():
    scene = bpy.data.scenes['UA_B_Atelier_Sheltered']; common = bpy.data.collections['SH_UA_Shared_Corrected_Island']
    mapping = {ob.name.removeprefix('SH_'): ob for ob in common.all_objects if ob.name.startswith('SH_')}
    report = finish(scene, common, mapping)
    bpy.context.view_layer.update(); bpy.ops.wm.save_mainfile()
    path = ROOT / 'sheltered_report.json'
    data = json.loads(path.read_text(encoding='utf-8')); data['flow_review'] = report
    path.write_text(json.dumps(data, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    result = run()

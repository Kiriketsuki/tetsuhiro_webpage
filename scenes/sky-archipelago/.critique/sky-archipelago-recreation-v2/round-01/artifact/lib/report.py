"""Exports scene_report.json: collections, objects, dimensions, materials, modifiers and lights."""
import json
import bpy
from mathutils import Vector
from . import util


def _r(v, n=3):
    return [round(x, n) for x in v]


def _modifier(m):
    d = {'name': m.name, 'type': m.type}
    for key in ('levels', 'render_levels', 'strength', 'thickness', 'width', 'segments', 'subdivision_type'):
        if hasattr(m, key):
            val = getattr(m, key)
            d[key] = round(val, 4) if isinstance(val, float) else val
    if m.type == 'DISPLACE' and m.texture:
        d['texture'] = m.texture.name
    if m.type == 'NODES' and m.node_group:
        d['node_group'] = m.node_group.name
    return d


def _collections(c):
    return {'name': c.name, 'objects': len(c.objects), 'hide_render': c.hide_render,
            'children': [_collections(ch) for ch in c.children]}


def landmark_centres():
    """Projected centres of the landmark objects in Cam_Reference, for the producer's own checks."""
    groups = {
        'terrace_torii': ['Terrace_Torii'],
        'terrace_floor_railing': ['Terrace_Walkway', 'Terrace_Railing'],
        'central_cliff_waterfall': ['Central_Island', 'Central_Waterfall'],
        'central_lake': ['Central_Lake'],
        'hero_towers': [o.name for o in bpy.data.objects if o.name.startswith('Hero_Tower.')],
        'lamp_bridge': ['Lamp_Bridge_Lower_Right'],
        'right_cliff': ['Right_Cliff', 'Right_Cliff_Waterfall'],
    }
    dg = bpy.context.evaluated_depsgraph_get()
    out = {}
    for key, names in groups.items():
        us, vs = [], []
        for n in names:
            o = bpy.data.objects.get(n)
            if o is None:
                continue
            for corner in o.bound_box:
                u, v, d = util.project(o.matrix_world @ Vector(corner))
                if d > 0:
                    us.append(min(max(u, 0), 1))
                    vs.append(min(max(v, 0), 1))
        if us:
            out[key] = {'u_range': [round(min(us), 3), round(max(us), 3)],
                        'v_range': [round(min(vs), 3), round(max(vs), 3)],
                        'centre': [round((min(us) + max(us)) / 2, 3), round((min(vs) + max(vs)) / 2, 3)]}
    return out


def write(path):
    s = bpy.context.scene
    objs = []
    for o in bpy.data.objects:
        d = {'name': o.name, 'type': o.type, 'collections': [c.name for c in o.users_collection],
             'location': _r(o.location), 'rotation_euler': _r(o.rotation_euler), 'scale': _r(o.scale),
             'dimensions': _r(o.dimensions), 'parent': o.parent.name if o.parent else None,
             'hide_render': o.hide_render}
        if o.type == 'MESH':
            d['data'] = o.data.name
            d['materials'] = [m.name for m in o.data.materials if m]
            d['vertices_base'] = len(o.data.vertices)
        elif o.type == 'CURVE':
            d['materials'] = [m.name for m in o.data.materials if m]
        if o.modifiers:
            d['modifiers'] = [_modifier(m) for m in o.modifiers]
        if o.type == 'LIGHT':
            d['light'] = {'type': o.data.type, 'energy': o.data.energy, 'color': _r(o.data.color)}
        if o.type == 'CAMERA':
            d['camera'] = {'lens_mm': o.data.lens, 'sensor_mm': o.data.sensor_width}
        props = {k: o[k] for k in o.keys() if not k.startswith('_')}
        if props:
            d['properties'] = {k: (v if isinstance(v, (int, float, str)) else str(v)) for k, v in props.items()}
        objs.append(d)
    mats = [{'name': m.name, 'users': m.users} for m in bpy.data.materials]
    report = {
        'blender': bpy.app.version_string,
        'render': {'engine': s.render.engine, 'resolution': [s.render.resolution_x, s.render.resolution_y],
                   'camera': s.camera.name if s.camera else None},
        'collections': _collections(s.collection),
        'materials': mats,
        'images': [{'name': i.name, 'filepath': i.filepath} for i in bpy.data.images if i.filepath],
        'home': {k: (round(v, 3) if isinstance(v, float) else v) for k, v in util.REG.get('home', {}).items()},
        'landmark_centres_cam_reference': landmark_centres(),
        'object_count': len(objs),
        'objects': objs,
    }
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(report, fh, indent=1)

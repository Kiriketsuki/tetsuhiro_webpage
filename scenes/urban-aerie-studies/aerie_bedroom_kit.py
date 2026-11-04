"""The aerie bedroom kit: a full interior for the About room, built for close views.

Run it from this folder with background Blender on an empty file:
    blender --factory-startup -b --python aerie_bedroom_kit.py -- [--preview RENDER_DIR]

The script builds the room in a new scene and writes one Draco GLB,
src/assets/models/aerie_bedroom_kit.glb, plus aerie_bedroom_kit_report.json beside this script.
It only reads aerie.glb.

--preview RENDER_DIR also imports aerie.glb for context, takes the old bedroom things out of
it, renders the layout and the tour shots into RENDER_DIR, and saves aerie_bedroom_kit_rN.blend
with the next free N, so no earlier .blend is overwritten.

The kit sits in the aerie frame: every vertex is an aerie coordinate, so the site adds the kit
with an identity transform. The room box, the openings and the layout are in
bedroom_kit_props.py. The site hides the old bedroom things of aerie.glb inside the room box.

One mesh per material, so the site swaps one material per mesh:
- Bedroom_Wood (kit_wood): floor boards, wainscot, trims, beams and the wooden furniture
- Bedroom_Plaster (kit_plaster): the walls above the rail and the ceiling
- Bedroom_Fabric (kit_fabric): bedding, cushions, curtains, the rug and the chair
- Bedroom_Metal (kit_metal): frames, the rack, brass and steel details
- Bedroom_Plain (kit_plain): plastics, ceramics and the electronics
- Bedroom_Paper (kit_paper): books, the notebook and the two painted posters
- Bedroom_Prints (kit_print): the six photo prints, with UVs into the atlas src/assets/about-prints.webp
- Bedroom_Screen (kit_screen): the monitors, the handheld and the tablet. UV 0..1 per screen
- Bedroom_Glow (kit_glow): the lamp shade, the lantern, the fairy lights and small LEDs
- Bedroom_Glass (kit_glass): the case glass, the lens and the snow globe

Colours are sRGB vertex colours that change slowly over a surface, never per face.
"""
from pathlib import Path
import sys
import json
import math

import bpy
import bmesh
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from bedroom_kit_mesh import srgb_to_linear  # noqa: E402
import bedroom_kit_props as props  # noqa: E402
from bedroom_kit_corners import build_corners  # noqa: E402

SITE = ROOT.parent.parent
ISLAND = SITE / 'src' / 'assets' / 'models' / 'aerie.glb'
ATLAS_IMAGE = SITE / 'src' / 'assets' / 'about-prints.webp'
OUT = SITE / 'src' / 'assets' / 'models' / 'aerie_bedroom_kit.glb'
REPORT = ROOT / 'aerie_bedroom_kit_report.json'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
BUDGET_TRIS = 70000
BUDGET_BYTES = 1_500_000

NAMES = {
    'kit_wood': 'Bedroom_Wood', 'kit_plaster': 'Bedroom_Plaster', 'kit_fabric': 'Bedroom_Fabric', 'kit_metal': 'Bedroom_Metal',
    'kit_plain': 'Bedroom_Plain', 'kit_paper': 'Bedroom_Paper', 'kit_print': 'Bedroom_Prints', 'kit_screen': 'Bedroom_Screen', 'kit_glow': 'Bedroom_Glow',
    'kit_glass': 'Bedroom_Glass',
}
# name: (metallic, roughness, emission strength, alpha)
LOOK = {
    'kit_wood': (0.0, 0.7, 0.0, 1.0), 'kit_plaster': (0.0, 0.95, 0.0, 1.0), 'kit_fabric': (0.0, 1.0, 0.0, 1.0),
    'kit_metal': (0.8, 0.4, 0.0, 1.0), 'kit_plain': (0.0, 0.5, 0.0, 1.0), 'kit_paper': (0.0, 0.85, 0.0, 1.0), 'kit_print': (0.0, 0.6, 0.0, 1.0),
    'kit_screen': (0.0, 0.3, 1.6, 1.0), 'kit_glow': (0.0, 0.8, 3.0, 1.0), 'kit_glass': (0.0, 0.05, 0.0, 0.12),
}


def build_parts():
    P = props.new_parts()
    props.floor(P)
    props.wall_panels(P)
    props.trims(P)
    props.ceiling(P)
    props.lantern(P)
    props.rug(P)
    props.bed(P)
    props.nightstand(P)
    props.photo_wall(P)
    build_corners(P)
    return P


def material(name):
    metallic, rough, emit, alpha = LOOK[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    attr = nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    if emit:
        links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = emit
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


def build_mesh(collection, mat_name, part):
    name = NAMES[mat_name]
    me = bpy.data.meshes.new(name)
    me.from_pydata([Vector(v) for v in part.verts], [], part.faces)
    me.materials.append(bpy.data.materials[mat_name])
    for p, s in zip(me.polygons, part.smooth):
        p.use_smooth = s
    attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    for i, c in enumerate(part.colours):
        attr.data[i].color_srgb = (*c, 1)
    me.color_attributes.active_color = attr
    if part.uv:
        layer = me.uv_layers.new(name='UVMap')
        for poly, uvs in zip(me.polygons, part.uvs):
            for li, uv in zip(poly.loop_indices, uvs):
                layer.data[li].uv = uv
    faces = len(me.polygons)
    me.validate()
    assert len(me.polygons) == faces, f'{name}: validate removed faces'
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob


def export(scene):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(
            filepath=str(OUT), export_format='GLB', use_active_scene=True, use_selection=False,
            use_visible=False, use_renderable=False, export_cameras=False, export_lights=False,
            export_extras=False, export_yup=True, export_apply=True, export_texcoords=True,
            export_normals=True, export_tangents=False, export_materials='EXPORT',
            export_vertex_color='ACTIVE', export_all_vertex_colors=False,
            export_active_vertex_color_when_no_material=False, export_attributes=True,
            export_animations=False, export_image_format='NONE',
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=10,
            export_draco_position_quantization=14, export_draco_normal_quantization=10,
            export_draco_color_quantization=8, export_draco_generic_quantization=10,
            export_draco_texcoord_quantization=12)
    return OUT.stat().st_size


# ---------------------------------------------------------------- preview

ROOM_LO = Vector((props.L, props.F, props.Z))
ROOM_HI = Vector((props.R, props.B, props.C))


def inside_room(p, pad=0.05):
    return all(ROOM_LO[i] - pad <= p[i] <= ROOM_HI[i] + pad for i in range(3))


def import_aerie(collection):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ISLAND))
    new = [o for o in bpy.data.objects if o not in before]
    for ob in new:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        collection.objects.link(ob)
    # The old bedroom things leave the aerie, as the site does at runtime.
    # The preview draws the aerie glass opaque, so it hides the room. The site draws it clear.
    for ob in new:
        if ob.name.startswith('Glass'):
            ob.hide_render = True
    for ob in new:
        if ob.type != 'MESH' or not ob.name.startswith(('Interiors', 'Props')):
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        mw = ob.matrix_world
        doomed = [f for f in bm.faces if inside_room(mw @ f.calc_center_median())]
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
        bm.to_mesh(ob.data)
        bm.free()
    return new


def cutaway(objects, collection):
    """Copies of the shell meshes without the ceiling and the front wall, for the layout views."""
    out = []
    for ob in objects:
        copy = ob.copy()
        copy.data = ob.data.copy()
        copy.name = ob.name + '_Cut'
        collection.objects.link(copy)
        bm = bmesh.new()
        bm.from_mesh(copy.data)
        doomed = [f for f in bm.faces if (c := f.calc_center_median()).z > props.C - 0.2 or c.y < props.F + 0.07
                  or (c.x > props.R - 0.07 and c.z > props.Z + 1.25)]
        bmesh.ops.delete(bm, geom=doomed, context='FACES')
        bm.to_mesh(copy.data)
        bm.free()
        out.append(copy)
    return out


def light(scene_coll, name, kind, at, energy, colour, size=0.1, aim=None):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = colour
    if kind in ('AREA',):
        data.size = size
    if kind == 'POINT':
        data.shadow_soft_size = size
    ob = bpy.data.objects.new(name, data)
    ob.location = at
    if aim is not None:
        ob.rotation_euler = (Vector(aim) - Vector(at)).to_track_quat('-Z', 'Y').to_euler()
    scene_coll.objects.link(ob)
    return ob


def camera(scene, pos, target, fov, ortho=None):
    cam = bpy.data.cameras.new('Shot')
    cam.sensor_fit = 'VERTICAL'
    cam.angle = math.radians(fov)
    cam.clip_start = 0.02
    if ortho:
        cam.type = 'ORTHO'
        cam.ortho_scale = ortho
    ob = bpy.data.objects.new('Shot', cam)
    ob.location = pos
    ob.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(ob)
    scene.camera = ob
    return ob


def g2b(p):
    """glTF (x, y, z) to Blender (x, -z, y)."""
    return (p[0], -p[2], p[1])


# The tour shots: name, camera, look point, vertical fov. Blender axes.
SHOTS = [
    ('01_hello', (-4.3, 2.0, 9.0), (-5.43, 5.2, 8.95), 62),
    ('02_desk', (-4.78, 3.05, 8.95), (-3.75, 3.6, 8.38), 50),
    ('03_notebook', (-4.45, 2.72, 8.72), (-3.96, 3.0, 8.17), 42),
    ('04_pc', (-4.62, 3.25, 8.85), (-3.76, 4.2, 8.42), 50),
    ('05_gym', (-4.55, 3.45, 8.95), (-4.05, 5.0, 8.15), 56),
    ('06_seat', (-4.85, 3.7, 8.95), (-5.43, 5.0, 8.2), 56),
    ('07_shelf', (-4.72, 4.2, 8.95), (-6.55, 5.05, 8.5), 46),
    ('08_photos', (-4.8, 2.35, 8.9), (-6.85, 3.05, 8.6), 60),
    ('09_graduation', (-5.85, 2.45, 8.85), (-6.9, 2.1, 8.88), 44),
    ('10_finale', (-4.3, 2.25, 9.0), (-5.43, 5.2, 9.0), 62),
]
CLOSE = [
    ('c_camera', (-6.25, 1.74, 8.2), (-6.63, 2.05, 7.98), 34),
    ('c_keyboard', (-4.28, 3.45, 8.42), (-3.9, 3.45, 8.17), 40),
    ('c_pc', (-4.25, 3.75, 8.55), (-3.76, 4.21, 8.38), 38),
    ('c_bed', (-4.2, 2.0, 9.1), (-5.9, 3.3, 7.9), 50),
    ('c_shelf', (-6.1, 4.05, 8.6), (-6.55, 5.05, 8.5), 50),
]
ENTRY = [
    ('00a_outside', g2b((-4.3, 9.0, 2.4)), g2b((-4.3, 9.0, -2.2)), 58),
    ('00b_porch', g2b((-4.3, 9.0, -0.6)), g2b((-4.6, 8.95, -4.0)), 60),
]


def render(scene, path, size):
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True, scene=scene.name)


def graduation_photo(collection):
    """The site sets about-2025.webp on the graduation print. The preview lays the same photo on
    a plane just in front of the print, so the review shot shows it."""
    image = bpy.data.images.load(str(SITE / 'src' / 'assets' / 'about-2025.webp'))
    m = bpy.data.materials.new('preview_photo')
    m.use_nodes = True
    tex = m.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.6
    w, h = 0.256, 0.336
    x = props.L + props.INSET + 0.014
    me = bpy.data.meshes.new('Preview_Photo')
    me.from_pydata([(x, 2.1 - w / 2, 8.92 - h / 2), (x, 2.1 + w / 2, 8.92 - h / 2), (x, 2.1 + w / 2, 8.92 + h / 2), (x, 2.1 - w / 2, 8.92 + h / 2)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for loop, value in zip(me.polygons[0].loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[loop].uv = value
    me.materials.append(m)
    ob = bpy.data.objects.new('Preview_Photo', me)
    collection.objects.link(ob)


def atlas_on_prints():
    """Shows the photo atlas on the prints in the review renders, as the site does."""
    m = bpy.data.materials['kit_print']
    tex = m.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(str(ATLAS_IMAGE))
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])


def preview(scene, kit_objects, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.eevee.taa_render_samples = 48
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 88
    scene.view_settings.exposure = 0.6
    world = bpy.data.worlds.new('Night')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*srgb_to_linear((0.1, 0.13, 0.22)), 1)
    bg.inputs['Strength'].default_value = 0.6
    scene.world = world
    lights = bpy.data.collections.new('Preview_Lights')
    scene.collection.children.link(lights)
    warm = (1.0, 0.78, 0.55)
    light(lights, 'Lamp', 'POINT', (-6.76, 2.25, 8.1), 40, warm, 0.08)
    light(lights, 'Lantern', 'POINT', (-5.65, 3.05, 9.6), 120, warm, 0.18)
    light(lights, 'Monitor', 'AREA', (-3.76, 3.6, 8.5), 12, (0.65, 0.75, 1.0), 0.5, aim=(-4.6, 3.6, 8.4))
    light(lights, 'Fairy', 'POINT', (-5.43, 5.05, 9.7), 25, warm, 0.4)
    light(lights, 'Fill', 'AREA', (-5.2, 3.42, 10.2), 90, (1.0, 0.92, 0.82), 2.4, aim=(-5.2, 3.42, 7.4))
    light(lights, 'Shelf', 'AREA', (-6.56, 4.75, 8.9), 18, (1.0, 0.85, 0.65), 0.6, aim=(-6.56, 5.2, 8.4))
    light(lights, 'Moon', 'SUN', (-5.0, 8.0, 14.0), 0.6, (0.7, 0.8, 1.0), aim=(-5.2, 3.42, 7.4))
    context = bpy.data.collections.new('Aerie_Context')
    scene.collection.children.link(context)
    import_aerie(context)
    if ATLAS_IMAGE.exists():
        atlas_on_prints()
    else:
        graduation_photo(lights)
    cut_coll = bpy.data.collections.new('Cutaway')
    scene.collection.children.link(cut_coll)
    shell = [o for o in kit_objects if o.name in ('Bedroom_Plaster', 'Bedroom_Wood')]
    cut = cutaway(shell, cut_coll)
    def show(layout):
        context.hide_render = layout
        cut_coll.hide_render = not layout
        for o in shell:
            o.hide_render = layout
    show(True)
    camera(scene, (-1.7, -1.1, 12.9), (-5.2, 3.5, 7.8), 38)
    render(scene, out_dir / 'layout_dollhouse.jpg', (1600, 1100))
    camera(scene, (-5.2, 3.42, 16.0), (-5.2, 3.4201, 7.4), 40, ortho=4.3)
    render(scene, out_dir / 'layout_plan.jpg', (1200, 1250))
    show(False)
    for name, pos, target, fov in ENTRY + SHOTS + CLOSE:
        camera(scene, pos, target, fov)
        # A soft fill from just above the lens, so the review shots show the forms. The site
        # lights the room with its own toon light, so this light is for the renders only.
        distance = (Vector(target) - Vector(pos)).length
        fill = light(lights, 'Shot_Fill', 'AREA', Vector(pos) + Vector((0, 0, 0.15)), max(3.0, min(40.0, 8.0 * distance ** 2)),
                     (1.0, 0.95, 0.88), 1.2, aim=target) if name not in ('00a_outside',) else None
        render(scene, out_dir / f'{name}.jpg', (1280, 800))
        if fill:
            bpy.data.objects.remove(fill)
    n = 1
    while (ROOT / f'aerie_bedroom_kit_r{n}.blend').exists():
        n += 1
    blend = ROOT / f'aerie_bedroom_kit_r{n}.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend), copy=True)
    return str(blend)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = 'Bedroom_Kit'
    for name in NAMES:
        material(name)
    parts = build_parts()
    kit = bpy.data.collections.new('Bedroom_Kit')
    scene.collection.children.link(kit)
    objects = [build_mesh(kit, name, part) for name, part in parts.items() if part.faces]
    size = export(scene)
    tris = {NAMES[n]: p.tris() for n, p in parts.items()}
    report = {'glb': OUT.relative_to(SITE).as_posix(), 'bytes': size, 'tris': tris, 'total_tris': sum(tris.values()),
              'budget_tris': BUDGET_TRIS, 'budget_bytes': BUDGET_BYTES,
              'room_box_gltf': {'min': [props.L, props.Z, -props.B], 'max': [props.R, props.C, -props.F]}}
    if '--preview' in ARGS:
        report['blend'] = preview(scene, objects, Path(ARGS[ARGS.index('--preview') + 1]))
    REPORT.write_text(json.dumps(report, indent=1), encoding='utf-8')
    print('BEDROOM_KIT', json.dumps({k: report[k] for k in ('bytes', 'total_tris')}))
    assert report['total_tris'] <= BUDGET_TRIS, 'over the triangle budget'
    assert size <= BUDGET_BYTES, 'over the GLB budget'


main()

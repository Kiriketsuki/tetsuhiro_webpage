"""Detective-wall corkboard kit for the Projects section.

Run it from this folder with background Blender on an empty file:
    blender --factory-startup -b --python corkboard_kit.py -- [--preview]

The script builds the kit in a new scene, Corkboard_Kit, and writes one Draco GLB,
src/assets/models/corkboard_kit.glb, plus corkboard_kit_report.json beside this script.
It saves no .blend and never touches island_b.glb or island_b_lod1.glb. --preview also builds
Corkboard_Kit_Preview: linked copies laid out on the board, a camera and two lights, for a render.

Every object sits at the origin with an identity transform, in its own local frame. The frames
below use glTF axes: +X right, +Y up, +Z out of the face toward the viewer. The script authors
points in that frame and gl() turns them into Blender axes, so the export gives back the same frame.
- Board: a 1.6 x 1.0 m frame. The cork face is the plane z = 0, centre at the origin, 1.48 x 0.88 m.
  The frame front stands 18 mm proud of the cork and the back sits 40 mm behind it.
- Pin_Push: the flange base sits on z = 0. The head rises along +Z and the needle points into -Z.
- Tape, Note, Photo, Card: the sheet centre sits at the origin and the face looks along +Z.
The code sets the colour of Pin_Push (material kit_pin) and Note (material kit_note) through the
material colour, so those two carry no vertex colour. Card, Note and the Photo window carry UVs
from 0 to 1 for a canvas atlas or a picture. The Board cork carries UVs from 0 to 1 too.
"""
from pathlib import Path
import sys, json, math
import bpy
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parent
SITE = ROOT.parent.parent
OUT = SITE / 'src' / 'assets' / 'models' / 'corkboard_kit.glb'
REPORT = ROOT / 'corkboard_kit_report.json'
SCENE = 'Corkboard_Kit'
PREVIEW = 'Corkboard_Kit_Preview'
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
KIT = ('Board', 'Pin_Push', 'Tape', 'Note', 'Photo', 'Card')

BOARD_W, BOARD_H = 1.6, 1.0
FRAME = 0.06
CORK_W, CORK_H = BOARD_W - 2 * FRAME, BOARD_H - 2 * FRAME
CORK_GRID = (12, 8)

# Colours are sRGB. The vertex colours change slowly over a surface, never per face, so the
# toon shading shows coherent facets and no checkerboard.
CORK = (0.74, 0.53, 0.33)
WOOD_FRONT = (0.56, 0.37, 0.22)
WOOD_SIDE = (0.45, 0.29, 0.17)
WOOD_BACK = (0.34, 0.21, 0.12)
TAPE = (0.93, 0.88, 0.72)
PAPER = (0.96, 0.95, 0.91)
MATERIALS = {  # name: (base colour, uses vertex colour, alpha)
    'kit_cork': ((1, 1, 1), True, 1.0),
    'kit_wood': ((1, 1, 1), True, 1.0),
    'kit_pin': ((0.78, 0.27, 0.23), False, 1.0),
    'kit_steel': ((0.62, 0.63, 0.66), False, 1.0),
    'kit_tape': ((1, 1, 1), True, 0.8),
    'kit_note': ((0.98, 0.86, 0.42), False, 1.0),
    'kit_paper': ((1, 1, 1), True, 1.0),
    'kit_photo_window': ((0.22, 0.24, 0.28), False, 1.0),
    'kit_card': ((0.96, 0.93, 0.84), False, 1.0),
}


def gl(x, y, z):
    """Turns a glTF-frame point into Blender axes. glTF +Z out of the face is Blender -Y."""
    return Vector((x, -z, y))


def srgb_to_linear(c):
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def material(name):
    if name in bpy.data.materials:
        bpy.data.materials.remove(bpy.data.materials[name])
    base, vertex, alpha = MATERIALS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(base), 1)
    bsdf.inputs['Roughness'].default_value = 0.85
    if vertex:
        attr = nodes.new('ShaderNodeVertexColor')
        attr.layer_name = 'Col'
        links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


def build_mesh(scene, name, verts, faces, mats, face_mats=None, colours=None, uvs=None, smooth=False):
    """Makes one mesh object at the origin.

    verts are glTF-frame points. colours holds one sRGB colour per vertex, so the colour field
    stays smooth across faces. uvs maps a face index to one (u, v) pair per face corner."""
    if name in bpy.data.objects:
        bpy.data.objects.remove(bpy.data.objects[name])
    me = bpy.data.meshes.new(name)
    me.from_pydata([gl(*v) for v in verts], [], faces)
    for m in mats:
        me.materials.append(bpy.data.materials[m])
    for i, p in enumerate(me.polygons):
        p.material_index = face_mats[i] if face_mats else 0
        p.use_smooth = smooth
    if colours:
        attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
        for i, c in enumerate(colours):
            attr.data[i].color_srgb = (*c, 1)
        me.color_attributes.active_color = attr
    if uvs:
        layer = me.uv_layers.new(name='UVMap')
        for fi, corners in uvs.items():
            p = me.polygons[fi]
            for li, uv in zip(p.loop_indices, corners):
                layer.data[li].uv = uv
    me.validate()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def ring(hw, hh, z):
    """Four corners of a rectangle, counter-clockwise seen from +Z, from the lower left."""
    return [(-hw, -hh, z), (hw, -hh, z), (hw, hh, z), (-hw, hh, z)]


def strip(a, b, n, reverse=False):
    """Quads between two closed loops of n vertices that start at indices a and b."""
    faces = []
    for k in range(n):
        q = (a + k, a + (k + 1) % n, b + (k + 1) % n, b + k)
        faces.append(q[::-1] if reverse else q)
    return faces


def grid(xs, ys, z_of):
    """A vertex grid, row by row from the bottom, and its quads facing +Z."""
    verts = [(x, y, z_of(x, y)) for y in ys for x in xs]
    nx = len(xs)
    faces = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i)
             for j in range(len(ys) - 1) for i in range(nx - 1)]
    return verts, faces


def grid_uvs(xs, ys, first=0):
    """UVs from 0 to 1 over a grid made by grid()."""
    x0, x1, y0, y1 = xs[0], xs[-1], ys[0], ys[-1]
    uv = lambda x, y: ((x - x0) / (x1 - x0), (y - y0) / (y1 - y0))
    out, f = {}, first
    for j in range(len(ys) - 1):
        for i in range(len(xs) - 1):
            out[f] = [uv(xs[i], ys[j]), uv(xs[i + 1], ys[j]), uv(xs[i + 1], ys[j + 1]), uv(xs[i], ys[j + 1])]
            f += 1
    return out


def steps(a, b, n):
    return [a + (b - a) * i / n for i in range(n + 1)]


def shade(c, f):
    return tuple(min(1.0, v * f) for v in c)


# ---- kit pieces -------------------------------------------------------------------------------

def board(scene):
    """The frame profile has five points: back edge, front edge, outer chamfer, front face
    inner edge and the cork edge. Four rails carry that profile and meet at mitred corners.
    Each rail has its own vertices and its own small tone shift, so the joints read as cut
    wood. The cork is a flat grid inside the frame at z = 0."""
    hw, hh = BOARD_W / 2, BOARD_H / 2
    cw, ch = CORK_W / 2, CORK_H / 2
    loops = [ring(hw, hh, -0.04), ring(hw, hh, 0.010), ring(hw - .008, hh - .008, 0.018),
             ring(cw + .012, ch + .012, 0.018), ring(cw, ch, 0.0)]
    tones = [WOOD_BACK, WOOD_SIDE, WOOD_FRONT, WOOD_FRONT, WOOD_SIDE]
    rail_shift = [1.0, 0.95, 1.03, 0.97]  # bottom, right, top, left
    verts, colours, faces = [], [], []
    for k in range(4):
        base = len(verts)
        for loop, tone in zip(loops, tones):
            for v in (loop[k], loop[(k + 1) % 4]):
                verts.append(v)
                # A slow grain shift along the rail keeps the wood from one flat tint.
                grain = 1 + 0.05 * noise.noise(Vector((v[0] * 1.7, v[1] * 1.7, 3.1 + k)))
                colours.append(shade(tone, rail_shift[k] * grain))
        faces += [(base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2) for i in range(len(loops) - 1)]
    # One back panel closes the board behind the cork.
    base = len(verts)
    verts += loops[0]
    colours += [WOOD_BACK] * 4
    faces.append((base, base + 3, base + 2, base + 1))
    wood_faces = len(faces)

    xs = steps(-cw, cw, CORK_GRID[0])
    ys = steps(-ch, ch, CORK_GRID[1])
    cverts, cfaces = grid(xs, ys, lambda x, y: 0.0)
    base = len(verts)
    for x, y, _ in cverts:
        verts.append((x, y, 0.0))
        n = noise.noise(Vector((x * 2.3, y * 2.3, 7.7)))
        edge = min(cw - abs(x), ch - abs(y))
        # The cork darkens a little toward the frame, like a soft contact shadow.
        rim = 0.86 + 0.14 * min(1.0, edge / 0.12)
        colours.append(shade(CORK, (1 + 0.07 * n) * rim))
    faces += [tuple(base + i for i in f) for f in cfaces]
    face_mats = [1] * wood_faces + [0] * len(cfaces)
    uvs = grid_uvs(xs, ys, first=wood_faces)
    return build_mesh(scene, 'Board', verts, faces, ['kit_cork', 'kit_wood'], face_mats, colours, uvs)


def pin(scene):
    """A push pin of 55 triangles: a six-sided grip that flares to a cap, a flange and a
    three-sided needle. The flange base sits on z = 0, so the code places the origin on a card."""
    n = 6
    rings = [(0.0062, 0.016), (0.0062, 0.0125), (0.0034, 0.0075), (0.0092, 0.0035), (0.0092, 0.0)]
    verts = []
    for r, z in rings:
        verts += [(r * math.cos(2 * math.pi * k / n + math.pi / 6), r * math.sin(2 * math.pi * k / n + math.pi / 6), z)
                  for k in range(n)]
    faces = [tuple(range(n))]
    for i in range(len(rings) - 1):
        faces += strip(n * i, n * (i + 1), n, reverse=True)
    tip = len(verts)
    verts += [(0.0009 * math.cos(2 * math.pi * k / 3), 0.0009 * math.sin(2 * math.pi * k / 3), 0.0005) for k in range(3)]
    verts.append((0.0, 0.0, -0.011))
    needle = [(tip + k, tip + 3, tip + (k + 1) % 3) for k in range(3)]
    faces += needle
    face_mats = [0] * (len(faces) - 3) + [1] * 3
    return build_mesh(scene, 'Pin_Push', verts, faces, ['kit_pin', 'kit_steel'], face_mats)


def tape(scene):
    """A 100 x 26 mm strip of masking tape. It bows 2 mm off the face in the middle and both
    ends have a torn, uneven edge."""
    L, W = 0.10, 0.026
    xs = steps(-L / 2, L / 2, 6)
    ys = [-W / 2, 0.0, W / 2]
    verts, faces = grid(xs, ys, lambda x, y: 0.002 * (1 - (2 * x / L) ** 2) + 0.0006 * y / W)
    # Each torn end moves its three vertices along x by these amounts, bottom row to top row.
    nx = len(xs)
    torn = {0: (0.0, 0.0028, -0.0012), nx - 1: (0.0, -0.0024, 0.0016)}

    def tear(i, v):
        col, row = i % nx, i // nx
        return (v[0] + torn[col][row], v[1], v[2]) if col in torn else v

    verts = [tear(i, v) for i, v in enumerate(verts)]
    colours = [shade(TAPE, 1 + 0.04 * noise.noise(Vector((x * 40, y * 40, 1.3)))) for x, y, _ in verts]
    return build_mesh(scene, 'Tape', verts, faces, ['kit_tape'], colours=colours, smooth=True)


def note(scene):
    """A 76 mm square sticky note. The glue strip along the top holds it flat. The lower right
    corner curls up to 15 mm off the board."""
    S = 0.076
    h = S / 2
    xs = steps(-h, h, 6)
    ys = steps(-h, h, 6)

    def lift(x, y):
        sag = 0.0015 * ((h - y) / S) ** 2
        s = (x - y) / (2 * h)
        curl = 0.015 * max(0.0, (s - 0.4) / 0.6) ** 2
        return sag + curl

    verts, faces = grid(xs, ys, lift)
    return build_mesh(scene, 'Note', verts, faces, ['kit_note'], uvs=grid_uvs(xs, ys), smooth=True)


def photo(scene):
    """A polaroid print, 88 x 107 mm and 1.2 mm thick. The window is 79 mm square with a narrow
    top border and a wide bottom border. The window has its own material and UVs, so the code
    sets the picture."""
    T = 0.0012
    hw, hh = 0.044, 0.0535
    top, side, size = 0.0045, 0.0045, 0.079
    wx0, wx1 = -hw + side, -hw + side + size
    wy1 = hh - top
    wy0 = wy1 - size
    outer = ring(hw, hh, T)
    window = [(wx0, wy0, T), (wx1, wy0, T), (wx1, wy1, T), (wx0, wy1, T)]
    back = ring(hw, hh, 0.0)
    verts = outer + window + back + [v for v in window]
    faces = strip(0, 4, 4) + strip(8, 0, 4)
    win = len(faces)
    faces.append((12, 13, 14, 15))
    face_mats = [0] * win + [1]
    # The border is lighter at the top and a touch warmer at the wide bottom.
    colours = [shade(PAPER, 0.97 + 0.03 * (v[1] + hh) / (2 * hh)) for v in verts]
    uvs = {win: [(0, 0), (1, 0), (1, 1), (0, 1)]}
    return build_mesh(scene, 'Photo', verts, faces, ['kit_paper', 'kit_photo_window'], face_mats, colours, uvs)


def card(scene):
    """A 5 x 3 inch index card. The pin holds the middle flat and both short ends lift 3 mm,
    with a small extra lift at the lower right corner."""
    W, H = 0.127, 0.076
    xs = steps(-W / 2, W / 2, 6)
    ys = steps(-H / 2, H / 2, 2)
    bend = lambda x, y: 0.003 * (2 * x / W) ** 2 + 0.0015 * max(0.0, (x / W - y / H)) ** 2
    verts, faces = grid(xs, ys, bend)
    return build_mesh(scene, 'Card', verts, faces, ['kit_card'], uvs=grid_uvs(xs, ys), smooth=True)


# ---- scene, export, report ------------------------------------------------------------------

def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def build():
    # A re-run removes the last build first, so no mesh comes back as Board.001.
    for name in (SCENE, PREVIEW):
        if name in bpy.data.scenes:
            old = bpy.data.scenes[name]
            for ob in list(old.objects):
                bpy.data.objects.remove(ob)
            bpy.data.scenes.remove(old)
    for name in KIT:
        if name in bpy.data.meshes:
            bpy.data.meshes.remove(bpy.data.meshes[name])
    scene = bpy.data.scenes.new(SCENE)
    scene.unit_settings.system = 'METRIC'
    for name in MATERIALS:
        material(name)
    return scene, [board(scene), pin(scene), tape(scene), note(scene), photo(scene), card(scene)]


def export(scene):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with bpy.context.temp_override(scene=scene, view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(
            filepath=str(OUT), export_format='GLB', use_active_scene=True, use_selection=False,
            use_visible=False, use_renderable=False, export_cameras=False, export_lights=False,
            export_extras=False, export_yup=True, export_apply=True, export_texcoords=True,
            export_normals=True, export_tangents=False, export_materials='EXPORT',
            export_vertex_color='ACTIVE', export_all_vertex_colors=False,
            export_active_vertex_color_when_no_material=False, export_animations=False,
            export_image_format='NONE', export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=10, export_draco_position_quantization=14,
            export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
            export_draco_color_quantization=8)
    return OUT.stat().st_size


def report(objs, size):
    rows = {}
    for ob in objs:
        lo = [min((ob.matrix_world @ Vector(c))[i] for c in ob.bound_box) for i in range(3)]
        hi = [max((ob.matrix_world @ Vector(c))[i] for c in ob.bound_box) for i in range(3)]
        # Blender box to glTF box: x stays, glTF y is Blender z, glTF z is minus Blender y.
        rows[ob.name] = {'tris': tris(ob), 'materials': [m.name for m in ob.data.materials],
                         'gltf_box_min': [round(lo[0], 4), round(lo[2], 4), round(-hi[1], 4)],
                         'gltf_box_max': [round(hi[0], 4), round(hi[2], 4), round(-lo[1], 4)]}
    data = {'glb': str(OUT.relative_to(SITE)).replace('\\', '/'), 'bytes': size,
            'tris': sum(r['tris'] for r in rows.values()), 'objects': rows,
            'board': {'outer_m': [BOARD_W, BOARD_H], 'cork_m': [round(CORK_W, 3), round(CORK_H, 3)],
                      'cork_plane': 'z = 0, centre at origin, faces +Z glTF',
                      'frame_front_z': 0.018, 'back_z': -0.04}}
    REPORT.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    return data


def preview(objs):
    """Linked copies on the board, a camera and two lights, for the thumbnail render only."""
    scene = bpy.data.scenes.new(PREVIEW)
    by = {o.name: o for o in objs}
    put = lambda name, x, y, z=0.0, rz=0.0: _place(scene, by[name], x, y, z, rz)
    put('Board', 0, 0)
    layout = [('Card', -0.45, 0.2, -4), ('Card', 0.05, 0.25, 3), ('Photo', -0.15, -0.12, -6),
              ('Photo', 0.48, 0.18, 5), ('Note', 0.35, -0.2, 8), ('Note', -0.55, -0.22, -3),
              ('Card', 0.15, -0.25, -2)]
    for name, x, y, rz in layout:
        put(name, x, y, 0.001, rz)
        top = {'Card': 0.03, 'Photo': 0.045, 'Note': 0.03}[name]
        put('Pin_Push', x, y + top, 0.004)
    put('Tape', 0.48, 0.23, 0.0025, 30)
    put('Tape', -0.15, -0.07, 0.0025, -20)
    cam = bpy.data.objects.new('Preview_Cam', bpy.data.cameras.new('Preview_Cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    for name, energy, loc in (('Preview_Key', 4.0, (1.2, -2.0, 2.0)), ('Preview_Fill', 1.5, (-1.5, -1.5, -0.5))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
        light.data.energy = energy
        light.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(light)
    scene.world = bpy.data.worlds.new('Preview_World')
    scene.world.color = (0.05, 0.05, 0.07)
    return scene


def _place(scene, src, x, y, z, rz):
    ob = bpy.data.objects.new(src.name + '_pv', src.data)
    ob.location = gl(x, y, z)
    ob.rotation_euler = (0, math.radians(rz), 0)
    scene.collection.objects.link(ob)
    return ob


def main():
    scene, objs = build()
    size = export(scene)
    data = report(objs, size)
    if '--preview' in ARGS:
        preview(objs)
    print(json.dumps({'bytes': data['bytes'], 'tris': data['tris']}))
    return data


if __name__ == '__main__':
    main()

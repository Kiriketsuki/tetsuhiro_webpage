# One-off patch for rubric v2: sky wash without stars, no rain, paper and wet-edge compositor,
# the upper right island landmark, and the haze constant.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


def replace_block(p, start, end, new):
    s = open(p, encoding='utf-8').read()
    a, b = s.index(start), s.index(end)
    open(p, 'w', encoding='utf-8', newline='\n').write(s[:a] + new + s[b:])


WORLD = '''def world():
    """A soft wash: deep blue-violet overhead, lighter and warmer toward the clouds. No stars."""
    w = bpy.data.worlds.new('Night_Sky')
    bpy.context.scene.world = w
    w.use_nodes = True
    t = Tree(w, w.node_tree)
    tc = t.n('ShaderNodeTexCoord')
    dirn = t.n('ShaderNodeVectorMath', _operation='NORMALIZE')
    t.l(tc.outputs['Generated'], dirn.inputs[0])
    d = dirn.outputs['Vector']
    sep = t.n('ShaderNodeSeparateXYZ')
    t.l(d, sep.inputs[0])
    grad = t.n('ShaderNodeValToRGB')
    cr = grad.color_ramp
    for pos, col in ((0.38, (0.2, 0.13, 0.17)), (0.5, (0.13, 0.1, 0.19)), (0.64, (0.05, 0.045, 0.12)),
                     (0.85, (0.018, 0.016, 0.05))):
        e = cr.elements.new(pos)
        e.color = (*col, 1)
    cr.elements.remove(cr.elements[0])
    cr.elements.remove(cr.elements[-1])
    t.l(t.math('ADD', t.math('MULTIPLY', sep.outputs['Z'], 0.5), 0.5), grad.inputs[0])
    # Gentle hue drift across the wash, like pigment settling unevenly.
    drift = t.n('ShaderNodeTexNoise', Scale=2.2, Detail=3.0, Roughness=0.5)
    t.l(d, drift.inputs['Vector'])
    col = t.mix(t.range(drift.outputs['Fac'], 0.35, 0.65, 0.0, 0.35), grad.outputs['Color'], (0.1, 0.08, 0.2))
    bg = t.n('ShaderNodeBackground', Strength=1.0)
    t.l(col, bg.inputs['Color'])
    out = t.n('ShaderNodeOutputWorld')
    t.l(bg.outputs[0], out.inputs['Surface'])


'''
replace_block('lib/sky.py', 'def world():', 'def _blob(', WORLD)
replace_block('lib/sky.py', 'def rain():', 'def _craft(', '')
patch('lib/sky.py', [
    ("from .materials import Tree\n", "from .materials import Tree\n"),
])

COMP = '''def compositor():
    """Painterly finish: Kuwahara brushwork, tinted wet edges, then paper grain over everything."""
    s = bpy.context.scene
    ng = bpy.data.node_groups.new('Watercolour_Compositor', 'CompositorNodeTree')
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    N, L = ng.nodes, ng.links

    def menu(node, name, *options):
        for o in options:
            try:
                node.inputs[name].default_value = o
                return
            except (TypeError, KeyError):
                continue

    def mix(fac, a, b, blend):
        m = N.new('ShaderNodeMix')
        m.data_type = 'RGBA'
        m.blend_type = blend
        sock(m.inputs, 'Factor').default_value = fac if isinstance(fac, float) else 1.0
        if not isinstance(fac, float):
            L.new(fac, sock(m.inputs, 'Factor'))
        for name, v in (('A', a), ('B', b)):
            if isinstance(v, tuple):
                sock(m.inputs, name).default_value = (*v, 1)
            else:
                L.new(v, sock(m.inputs, name))
        return sock(m.outputs, 'Result')

    def maprange(v, lo, hi, a, b):
        r = N.new('ShaderNodeMapRange')
        r.inputs['From Min'].default_value, r.inputs['From Max'].default_value = lo, hi
        r.inputs['To Min'].default_value, r.inputs['To Max'].default_value = a, b
        L.new(v, r.inputs['Value'])
        return r.outputs['Result']

    rl = N.new('CompositorNodeRLayers')
    kuw = N.new('CompositorNodeKuwahara')
    kuw.inputs['Size'].default_value = max(2, round(4 * s.render.resolution_x / 3840))
    menu(kuw, 'Type', 'Anisotropic', 'ANISOTROPIC')
    L.new(rl.outputs['Image'], kuw.inputs['Image'])
    # Paper grain, cropped clear of the scan's marked right edge, stretched to the frame.
    img = N.new('CompositorNodeImage')
    img.image = bpy.data.images.load(os.path.join(util.CFG['ROOT'], 'assets', 'paper', 'Paper001',
                                                  'Paper001_4K-JPG_Displacement.jpg'))
    img.image.colorspace_settings.name = 'Non-Color'
    crop = N.new('CompositorNodeCrop')
    crop.inputs['X'].default_value, crop.inputs['Y'].default_value = 0, 0
    crop.inputs['Width'].default_value, crop.inputs['Height'].default_value = 3700, 2400
    L.new(img.outputs['Image'], crop.inputs['Image'])
    sc = N.new('CompositorNodeScale')
    menu(sc, 'Type', 'Render Size', 'Scene Size', 'RENDER_SIZE')
    menu(sc, 'Frame Type', 'Stretch', 'STRETCH')
    L.new(crop.outputs['Image'], sc.inputs['Image'])
    pbw = N.new('CompositorNodeRGBToBW')
    L.new(sc.outputs['Image'], pbw.inputs['Image'])
    grain = maprange(pbw.outputs['Val'], 0.3, 0.7, 0.8, 1.1)
    # Wet edges: where one wash meets the next, the pigment gathers into a soft, tinted rim.
    sob = N.new('CompositorNodeFilter')
    menu(sob, 'Type', 'Sobel', 'SOBEL')
    L.new(kuw.outputs['Image'], sob.inputs['Image'])
    ebw = N.new('CompositorNodeRGBToBW')
    L.new(sob.outputs['Image'], ebw.inputs['Image'])
    edge = maprange(ebw.outputs['Val'], 0.04, 0.5, 0.0, 0.45)
    broken = N.new('ShaderNodeMath')
    broken.operation = 'MULTIPLY'
    L.new(edge, broken.inputs[0])
    L.new(maprange(pbw.outputs['Val'], 0.4, 0.6, 0.4, 1.2), broken.inputs[1])
    rimmed = mix(broken.outputs[0], kuw.outputs['Image'], (0.42, 0.34, 0.55), 'MULTIPLY')
    papered = mix(1.0, rimmed, grain, 'MULTIPLY') if False else None
    gmul = N.new('ShaderNodeMix')
    gmul.data_type = 'RGBA'
    gmul.blend_type = 'MULTIPLY'
    sock(gmul.inputs, 'Factor').default_value = 1.0
    L.new(rimmed, sock(gmul.inputs, 'A'))
    L.new(grain, sock(gmul.inputs, 'B'))
    glare = N.new('CompositorNodeGlare')
    for key, val in (('Type', 'Bloom'), ('Threshold', 1.0), ('Strength', 0.4), ('Size', 0.8)):
        try:
            glare.inputs[key].default_value = val
        except (KeyError, TypeError):
            pass
    L.new(sock(gmul.outputs, 'Result'), glare.inputs['Image'])
    out = N.new('NodeGroupOutput')
    L.new(glare.outputs['Image'], out.inputs[0])
    s.compositing_node_group = ng
'''
replace_block('lib/camera.py', 'def compositor():', '\x00' if False else 'def compositor():', '')
s = open('lib/camera.py', encoding='utf-8').read()
a = s.index('def compositor():')
s = s[:a] + COMP
s = s.replace('import bpy\nfrom math import radians', 'import os\nimport bpy\nfrom math import radians')
s = s.replace('from . import util\n', 'from . import util\nfrom .materials import sock\n', 1)
open('lib/camera.py', 'w', encoding='utf-8', newline='\n').write(s)

patch('build.py', [
    ("AIR_FOG_DENSITY = 0.00028          # Night air haze per metre. Sets how fast far islands fade.",
     "HAZE_DISTANCE = 2200.0             # Metres over which far planes wash into haze."),
    ("RAIN_DROP_COUNT = 3500\n", ""),
    ("        ('rain', sky.rain),\n", ""),
    ("        ('sky, stars and milky way', sky.world),", "        ('sky wash', sky.world),"),
])
patch('lib/sky.py', [
    ("""    # Thin night air: far planes lose contrast and drift toward blue, as in the reference.
    fog = t.n('ShaderNodeVolumePrincipled', Density=util.CFG['AIR_FOG_DENSITY'], Anisotropy=0.3)
    fog.inputs['Color'].default_value = (0.5, 0.56, 0.85, 1)
    t.l(fog.outputs[0], out.inputs['Volume'])""", ""),
]) if 'AIR_FOG_DENSITY' in open('lib/sky.py').read() else None

# The upper right island with towers, landmark 9 of rubric v2.
patch('lib/terrain.py', [
    ("    fixed = [(0.22, 0.27, 620), (0.29, 0.22, 900), (0.36, 0.28, 760), (0.42, 0.21, 1150), (0.25, 0.33, 480),\n"
     "             (0.33, 0.35, 560), (0.12, 0.2, 700), (0.06, 0.3, 520), (0.83, 0.2, 800), (0.9, 0.3, 560),\n"
     "             (0.78, 0.33, 640), (0.47, 0.31, 950), (0.97, 0.12, 900), (0.18, 0.11, 1300)]",
     "    fixed = [(0.22, 0.27, 620), (0.29, 0.22, 900), (0.36, 0.28, 760), (0.42, 0.21, 1150), (0.25, 0.33, 480),\n"
     "             (0.33, 0.35, 560), (0.12, 0.2, 700), (0.06, 0.3, 520), (0.78, 0.33, 640), (0.47, 0.31, 950),\n"
     "             (0.18, 0.11, 1300), (0.04, 0.12, 900)]"),
    ("        if 0.52 < u < 0.75 and v < 0.45:\n            continue",
     "        if 0.52 < u < 0.75 and v < 0.45:\n            continue\n        if u > 0.78 and v < 0.32:\n            continue"),
    ("    util.REG['distant'] = placed\n",
     "    util.REG['distant'] = placed\n"
     "    # The upper right island: larger and nearer than its neighbours, carrying a small tower cluster.\n"
     "    d = util.S(420)\n"
     "    p = util.cam_point(0.91, 0.2, d)\n"
     "    o = island('Upper_Right_Island', c, p, util.S(48), util.S(40), util.S(95), util.CFG['SEED'] + 99,\n"
     "               segments=128, ledges=3, spikes=5, mound=util.S(1.0), levels=2)\n"
     "    placed.append(dict(name=o.name, u=0.91, v=0.2, depth=d, r=util.S(44), centre=p, towers=7))\n"),
])
patch('lib/towers.py', [
    ("        n = rnd.randint(2, 7) if d['depth'] > util.S(400) else rnd.randint(1, 3)",
     "        n = d.get('towers') or (rnd.randint(2, 7) if d['depth'] > util.S(400) else rnd.randint(1, 3))"),
])
print('ok')

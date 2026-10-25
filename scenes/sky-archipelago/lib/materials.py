"""Role materials in a soft watercolour toon style.

Every lit surface runs through one shared node group, Watercolour_Paint. It splits the light into
soft bands but keeps the light's hue, tints shadows violet instead of black, adds pigment
granulation and pooling fixed to the forms, smears reflections, and washes far planes into haze.
Each material is shared by every object of its role and is named after that role."""
import os
import bpy
from . import util

BAY = 1.8      # Window bay width in metres. towers.py places fins on the same grid.
STOREY = 3.6   # Storey height in metres.
SHADOW_TINT = (0.42, 0.36, 0.72)
HAZE = (0.16, 0.16, 0.3)


def sock(sockets, name):
    """The enabled socket with this name. Mix nodes carry one socket per data type."""
    for s in sockets:
        if s.name == name and s.enabled:
            return s
    return sockets[name]


class Tree:
    """Thin wrapper that builds a node tree with short calls."""

    def __init__(self, owner, tree=None):
        self.m = owner
        if tree is None:
            owner.use_nodes = True
            tree = owner.node_tree
        self.t = tree
        self.t.nodes.clear()
        self.x = 0

    def n(self, kind, **inputs):
        node = self.t.nodes.new(kind)
        self.x += 180
        node.location = (self.x, 0)
        for k, v in inputs.items():
            if k.startswith('_'):
                setattr(node, k[1:], v)
            else:
                sock(node.inputs, k).default_value = v
        return node

    def l(self, a, b):
        self.t.links.new(a, b)

    def math(self, op, a, b=None):
        m = self.n('ShaderNodeMath', _operation=op)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                self.l(v, m.inputs[i])
        return m.outputs[0]

    def mix(self, fac, a, b, blend='MIX'):
        m = self.n('ShaderNodeMix', _data_type='RGBA', _blend_type=blend)
        for name, v in (('Factor', fac), ('A', a), ('B', b)):
            s = sock(m.inputs, name)
            if isinstance(v, (int, float)):
                s.default_value = v if name == 'Factor' else (v, v, v, 1)
            elif isinstance(v, tuple):
                s.default_value = v if len(v) == 4 else (*v, 1)
            else:
                self.l(v, s)
        return sock(m.outputs, 'Result')

    def range(self, value, lo, hi, to_lo=0.0, to_hi=1.0):
        r = self.n('ShaderNodeMapRange')
        r.inputs['From Min'].default_value, r.inputs['From Max'].default_value = lo, hi
        r.inputs['To Min'].default_value, r.inputs['To Max'].default_value = to_lo, to_hi
        self.l(value, r.inputs['Value'])
        return r.outputs['Result']

    def out(self, surface=None, volume=None):
        o = self.n('ShaderNodeOutputMaterial')
        if surface is not None:
            self.l(surface, o.inputs['Surface'])
        if volume is not None:
            self.l(volume, o.inputs['Volume'])
        return o


# ---------------------------------------------------------------- the paint group

def paint_group():
    ng = bpy.data.node_groups.get('Watercolour_Paint')
    if ng:
        return ng
    ng = bpy.data.node_groups.new('Watercolour_Paint', 'ShaderNodeTree')
    for name, kind, default in (('Color', 'NodeSocketColor', (0.5, 0.5, 0.5, 1)), ('Normal', 'NodeSocketVector', None),
                                ('Wet', 'NodeSocketFloat', 0.0), ('Gloss Roughness', 'NodeSocketFloat', 0.25),
                                ('Granulation', 'NodeSocketFloat', 1.0), ('Haze', 'NodeSocketFloat', 1.0)):
        s = ng.interface.new_socket(name, in_out='INPUT', socket_type=kind)
        if default is not None:
            s.default_value = default
    ng.interface.new_socket('Shader', in_out='OUTPUT', socket_type='NodeSocketShader')
    t = Tree(ng, ng)
    gi = t.n('NodeGroupInput')
    base = gi.outputs['Color']
    # Light, kept with its hue so lamps stay warm and moonlight stays cool.
    d = t.n('ShaderNodeBsdfDiffuse')
    d.inputs['Color'].default_value = (1, 1, 1, 1)
    t.l(gi.outputs['Normal'], d.inputs['Normal'])
    s2r = t.n('ShaderNodeShaderToRGB')
    t.l(d.outputs[0], s2r.inputs[0])
    bw = t.n('ShaderNodeRGBToBW')
    t.l(s2r.outputs['Color'], bw.inputs[0])
    lum = t.math('ADD', bw.outputs[0], 0.003)
    hue = t.mix(1.0, s2r.outputs['Color'], lum, 'DIVIDE')
    hue = t.mix(0.35, hue, (1, 1, 1))
    # Soft bands: flat plateaus joined by short ramps, so band edges blur instead of snapping.
    ramp = t.n('ShaderNodeValToRGB')
    cr = ramp.color_ramp
    cr.interpolation = 'LINEAR'
    stops = [(0.0, 0.3), (0.012, 0.3), (0.03, 0.58), (0.11, 0.58), (0.17, 0.92), (0.5, 0.92), (0.7, 1.35)]
    while len(cr.elements) < len(stops):
        cr.elements.new(0.5)
    for el, (pos, val) in zip(cr.elements, stops):
        el.position = pos
        el.color = (val, val, val, 1)
    t.l(bw.outputs[0], ramp.inputs[0])
    lit = t.mix(1.0, t.mix(1.0, base, hue, 'MULTIPLY'), ramp.outputs['Color'], 'MULTIPLY')
    # Shadows keep a violet tint and never reach black.
    shadow = t.mix(1.0, t.mix(0.55, base, SHADOW_TINT, 'MULTIPLY'), (0.3, 0.3, 0.3), 'MULTIPLY')
    col = t.mix(1.0, lit, shadow, 'LIGHTEN')
    # Pigment granulation and pooling, fixed to the form.
    tc = t.n('ShaderNodeTexCoord')
    gran = t.n('ShaderNodeTexNoise', Scale=55.0, Detail=3.0, Roughness=0.75)
    t.l(tc.outputs['Object'], gran.inputs['Vector'])
    pool = t.n('ShaderNodeTexNoise', Scale=1.1, Detail=4.0, Roughness=0.6, Distortion=0.8)
    t.l(tc.outputs['Object'], pool.inputs['Vector'])
    g = t.range(gran.outputs['Fac'], 0.3, 0.7, 0.84, 1.08)
    g = t.math('ADD', 1.0, t.math('MULTIPLY', t.math('SUBTRACT', g, 1.0), gi.outputs['Granulation']))
    p = t.range(pool.outputs['Fac'], 0.38, 0.62, 0.82, 1.06)
    col = t.mix(1.0, col, t.math('MULTIPLY', g, p), 'MULTIPLY')
    # Reflections arrive as soft smears through a rough gloss, never as sharp highlights.
    gl = t.n('ShaderNodeBsdfGlossy')
    gl.inputs['Color'].default_value = (1, 1, 1, 1)
    t.l(gi.outputs['Gloss Roughness'], gl.inputs['Roughness'])
    t.l(gi.outputs['Normal'], gl.inputs['Normal'])
    g2r = t.n('ShaderNodeShaderToRGB')
    t.l(gl.outputs[0], g2r.inputs[0])
    smear = t.mix(1.0, g2r.outputs['Color'], (0.8, 0.75, 0.85), 'MULTIPLY')
    col = t.mix(gi.outputs['Wet'], col, smear, 'ADD')
    # Far planes wash into a cool haze and lose detail.
    cam = t.n('ShaderNodeCameraData')
    f = t.math('SUBTRACT', 1.0, t.math('EXPONENT', t.math('DIVIDE', cam.outputs['View Distance'],
                                                            -util.CFG.get('HAZE_DISTANCE', 2200.0))))
    col = t.mix(t.math('MULTIPLY', t.math('MULTIPLY', f, 0.85), gi.outputs['Haze']), col, HAZE)
    em = t.n('ShaderNodeEmission', Strength=1.0)
    t.l(col, em.inputs['Color'])
    go = t.n('NodeGroupOutput')
    t.l(em.outputs[0], go.inputs['Shader'])
    return ng


def paint(t, colour, normal=None, wet=0.0, gloss=0.25, granulation=1.0, haze=1.0):
    """A Watercolour_Paint node fed with colour. Returns its shader socket."""
    g = t.n('ShaderNodeGroup')
    g.node_tree = paint_group()
    for name, v in (('Color', colour), ('Wet', wet)):
        s = g.inputs[name]
        if isinstance(v, (int, float)):
            s.default_value = v
        elif isinstance(v, tuple):
            s.default_value = v if len(v) == 4 else (*v, 1)
        else:
            t.l(v, s)
    g.inputs['Gloss Roughness'].default_value = gloss
    g.inputs['Granulation'].default_value = granulation
    g.inputs['Haze'].default_value = haze
    if normal is None:
        geo = t.n('ShaderNodeNewGeometry')
        normal = geo.outputs['Normal']
    t.l(normal, g.inputs['Normal'])
    return g.outputs['Shader']


# ---------------------------------------------------------------- textures

def tex_path(name, kind):
    return os.path.join(util.CFG['ROOT'], 'assets', 'textures', name, f'{name}_{kind}_2k.jpg')


def image(name, kind, colour=True):
    key = f'{name}_{kind}'
    img = bpy.data.images.get(key)
    if img is None:
        img = bpy.data.images.load(tex_path(name, kind))
        img.name = key
        img.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    return img


def triplanar(t, name, scale, saturation=0.5, normal_strength=0.8):
    """Box-projected texture set. Returns (colour, normal) sockets, with colour pulled toward the palette."""
    tc = t.n('ShaderNodeTexCoord')
    mp = t.n('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / scale,) * 3
    t.l(tc.outputs['Object'], mp.inputs['Vector'])
    out = []
    for kind, colour in (('diff', True), ('nor', False)):
        it = t.n('ShaderNodeTexImage', _projection='BOX', _projection_blend=0.3)
        it.image = image(name, kind, colour)
        t.l(mp.outputs[0], it.inputs['Vector'])
        out.append(it.outputs['Color'])
    hsv = t.n('ShaderNodeHueSaturation', Saturation=saturation)
    t.l(out[0], hsv.inputs['Color'])
    nm = t.n('ShaderNodeNormalMap', Strength=normal_strength)
    t.l(out[1], nm.inputs['Color'])
    return hsv.outputs['Color'], nm.outputs['Normal']


def new(name):
    return Tree(util.mat(name))


# ---------------------------------------------------------------- natural

def rock():
    t = new('Rock')
    col, nor = triplanar(t, 'cliff_side', 6.0, saturation=0.3)
    dark = t.mix(1.0, col, (0.36, 0.36, 0.46), 'MULTIPLY')
    tc = t.n('ShaderNodeTexCoord')
    mp = t.n('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.02, 0.02, 0.7)
    t.l(tc.outputs['Object'], mp.inputs['Vector'])
    strata = t.n('ShaderNodeTexNoise', Scale=1.0, Detail=4.0)
    t.l(mp.outputs[0], strata.inputs['Vector'])
    banded = t.mix(0.35, dark, strata.outputs['Color'], 'MULTIPLY')
    fmap = t.n('ShaderNodeMapping')
    fmap.inputs['Scale'].default_value = (0.45, 0.45, 0.05)
    t.l(tc.outputs['Object'], fmap.inputs['Vector'])
    frac = t.n('ShaderNodeTexVoronoi', _feature='DISTANCE_TO_EDGE', Scale=1.0)
    t.l(fmap.outputs[0], frac.inputs['Vector'])
    crack = t.range(frac.outputs['Distance'], 0.0, 0.06, 0.4, 1.0)
    banded = t.mix(1.0, banded, crack, 'MULTIPLY')
    # Moss grows where the surface faces up.
    geo = t.n('ShaderNodeNewGeometry')
    sep = t.n('ShaderNodeSeparateXYZ')
    t.l(geo.outputs['Normal'], sep.inputs[0])
    nz = t.n('ShaderNodeTexNoise', Scale=0.6, Detail=6.0)
    t.l(tc.outputs['Object'], nz.inputs['Vector'])
    up = t.math('ADD', sep.outputs['Z'], t.math('MULTIPLY', t.math('SUBTRACT', nz.outputs['Fac'], 0.5), 0.6))
    mossy = t.range(up, 0.45, 0.75)
    colour = t.mix(mossy, banded, (0.07, 0.13, 0.06))
    ao = t.n('ShaderNodeAmbientOcclusion', Distance=2.5)
    t.l(colour, ao.inputs['Color'])
    shaded = t.mix(0.5, colour, ao.outputs['Color'], 'MULTIPLY')
    t.out(paint(t, shaded, nor))


def grass():
    t = new('Grass')
    tc = t.n('ShaderNodeTexCoord')
    nz = t.n('ShaderNodeTexNoise', Scale=0.4, Detail=8.0)
    t.l(tc.outputs['Object'], nz.inputs['Vector'])
    col = t.mix(nz.outputs['Fac'], (0.05, 0.1, 0.05), (0.12, 0.18, 0.07))
    t.out(paint(t, col))


def bark():
    t = new('Bark')
    col, nor = triplanar(t, 'bark_brown_02', 1.2, saturation=0.4)
    t.out(paint(t, t.mix(1.0, col, (0.6, 0.52, 0.5), 'MULTIPLY'), nor))


def foliage(name, base, tip):
    t = new(name)
    t.m.use_backface_culling = False
    oi = t.n('ShaderNodeObjectInfo')
    geo = t.n('ShaderNodeNewGeometry')
    rnd = t.n('ShaderNodeTexWhiteNoise', _noise_dimensions='3D')
    t.l(geo.outputs['Position'], rnd.inputs['Vector'])
    fac = t.math('ADD', t.math('MULTIPLY', rnd.outputs['Value'], 0.6), t.math('MULTIPLY', oi.outputs['Random'], 0.4))
    t.out(paint(t, t.mix(fac, base, tip), granulation=0.6))


# ---------------------------------------------------------------- man-made

def textured(name, tex, scale, tint, wet=0.0, saturation=0.45):
    t = new(name)
    col, nor = triplanar(t, tex, scale, saturation)
    c = t.mix(1.0, col, tint, 'MULTIPLY')
    wetness = 0.0
    if wet:
        # Puddles: a slow noise mask darkens the stone and lets it carry painted reflections.
        tc = t.n('ShaderNodeTexCoord')
        nz = t.n('ShaderNodeTexNoise', Scale=0.25, Detail=3.0)
        t.l(tc.outputs['Object'], nz.inputs['Vector'])
        puddle = t.range(nz.outputs['Fac'], 0.4, 0.56)
        c = t.mix(t.math('MULTIPLY', puddle, 0.5), c, (0.03, 0.03, 0.05))
        wetness = t.math('ADD', t.math('MULTIPLY', puddle, wet * 0.6), wet * 0.35)
    t.out(paint(t, c, nor, wet=wetness, gloss=0.1))


def flat(name, colour, granulation=1.0):
    t = new(name)
    t.out(paint(t, colour, granulation=granulation))


def glow(name, colour, strength):
    t = new(name)
    t.out(t.n('ShaderNodeEmission', Color=(*colour, 1), Strength=strength).outputs[0])


def paper_glow():
    t = new('Shoji_Glow')
    tc = t.n('ShaderNodeTexCoord')
    nz = t.n('ShaderNodeTexNoise', Scale=3.0, Detail=2.0)
    t.l(tc.outputs['Object'], nz.inputs['Vector'])
    e = t.n('ShaderNodeEmission', Color=(1.0, 0.62, 0.32, 1))
    t.l(t.math('ADD', t.math('MULTIPLY', nz.outputs['Fac'], 0.8), 1.2), e.inputs['Strength'])
    t.out(e.outputs[0])


def windows(name, glass, lit_share, warm, strength, haze=True):
    """Window glass behind mullions. Each bay and storey cell is lit or dark at random."""
    t = new(name)
    tc = t.n('ShaderNodeTexCoord')
    sep = t.n('ShaderNodeSeparateXYZ')
    t.l(tc.outputs['Object'], sep.inputs[0])
    nsep = t.n('ShaderNodeSeparateXYZ')
    t.l(tc.outputs['Normal'], nsep.inputs[0])
    # Faces that look along x use y as their horizontal axis, and the other way round.
    along_x = t.math('GREATER_THAN', t.math('ABSOLUTE', nsep.outputs['X']), t.math('ABSOLUTE', nsep.outputs['Y']))
    h = t.math('ADD', t.math('MULTIPLY', along_x, sep.outputs['Y']),
               t.math('MULTIPLY', t.math('SUBTRACT', 1.0, along_x), sep.outputs['X']))
    cu = t.math('FLOOR', t.math('DIVIDE', h, BAY))
    cv = t.math('FLOOR', t.math('DIVIDE', sep.outputs['Z'], STOREY))
    oi = t.n('ShaderNodeObjectInfo')
    comb = t.n('ShaderNodeCombineXYZ')
    t.l(cu, comb.inputs['X'])
    t.l(cv, comb.inputs['Y'])
    t.l(t.math('ADD', t.math('MULTIPLY', oi.outputs['Random'], 97.0), t.math('MULTIPLY', along_x, 13.0)), comb.inputs['Z'])
    wn = t.n('ShaderNodeTexWhiteNoise', _noise_dimensions='3D')
    t.l(comb.outputs[0], wn.inputs['Vector'])
    # Roofs and floors carry no windows: only faces that look sideways can be lit.
    wall = t.math('LESS_THAN', t.math('ABSOLUTE', nsep.outputs['Z']), 0.5)
    lit = t.math('MULTIPLY', t.math('LESS_THAN', wn.outputs['Value'], lit_share), wall)
    tint = t.mix(wn.outputs['Color'], warm, (1.0, 0.72, 0.42))
    bright = t.math('ADD', t.math('MULTIPLY', wn.outputs['Value'], 1.0 / max(lit_share, 0.01)), 0.35)
    em = t.n('ShaderNodeEmission')
    t.l(tint, em.inputs['Color'])
    cam = t.n('ShaderNodeCameraData')
    # The ground city glows through the haze, so its windows skip the fade.
    keep = t.math('EXPONENT', t.math('DIVIDE', cam.outputs['View Distance'],
                                     -util.CFG.get('HAZE_DISTANCE', 2200.0) * (1.0 if haze else 1e6)))
    t.l(t.math('MULTIPLY', t.math('MULTIPLY', t.math('MULTIPLY', lit, bright), strength), keep), em.inputs['Strength'])
    add = t.n('ShaderNodeAddShader')
    t.l(paint(t, glass, granulation=0.5, haze=1.0 if haze else 0.15), add.inputs[0])
    t.l(em.outputs[0], add.inputs[1])
    t.out(add.outputs[0])


def water_lake():
    t = new('Water_Lake')
    tc = t.n('ShaderNodeTexCoord')
    w = t.n('ShaderNodeTexNoise', Scale=0.35, Detail=6.0, Roughness=0.6)
    t.l(tc.outputs['Object'], w.inputs['Vector'])
    bump = t.n('ShaderNodeBump', Strength=0.35, Distance=0.2)
    t.l(w.outputs['Fac'], bump.inputs['Height'])
    t.out(paint(t, (0.05, 0.06, 0.13), bump.outputs['Normal'], wet=1.8, gloss=0.08, granulation=0.6))


def waterfall():
    """Falling water: vertical streaks, pale at the lip, fading out toward the bottom. Never near white."""
    t = new('Waterfall')
    t.m.surface_render_method = 'BLENDED'
    t.m.use_backface_culling = False
    tc = t.n('ShaderNodeTexCoord')
    mp = t.n('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (30.0, 1.4, 1.0)
    t.l(tc.outputs['UV'], mp.inputs['Vector'])
    streak = t.n('ShaderNodeTexNoise', Scale=2.5, Detail=8.0, Roughness=0.7)
    t.l(mp.outputs[0], streak.inputs['Vector'])
    sep = t.n('ShaderNodeSeparateXYZ')
    t.l(tc.outputs['UV'], sep.inputs[0])
    v = sep.outputs['Y']
    fade = t.math('POWER', t.math('SUBTRACT', 1.0, v), 1.1)
    edge = t.math('POWER', t.math('SINE', t.math('MULTIPLY', sep.outputs['X'], 3.14159)), 0.6)
    s = t.math('POWER', streak.outputs['Fac'], 1.8)
    alpha = t.math('MINIMUM', t.math('MULTIPLY', t.math('MULTIPLY', fade, edge), t.math('ADD', t.math('MULTIPLY', s, 2.0), 0.2)), 0.92)
    foam = t.math('SUBTRACT', 1.0, t.math('MINIMUM', t.math('MULTIPLY', v, 9.0), 1.0))
    bright = t.math('MINIMUM', t.math('ADD', t.math('ADD', t.math('MULTIPLY', s, 0.5), 0.18), t.math('MULTIPLY', foam, 1.1)), 1.0)
    em = t.n('ShaderNodeEmission', Color=(0.62, 0.66, 0.86, 1))
    t.l(bright, em.inputs['Strength'])
    tr = t.n('ShaderNodeBsdfTransparent')
    m = t.n('ShaderNodeMixShader')
    t.l(alpha, m.inputs['Fac'])
    t.l(tr.outputs[0], m.inputs[1])
    t.l(em.outputs[0], m.inputs[2])
    t.out(m.outputs[0])


def volume(name, colour, density, scale, lo, hi, warm_under=0.0, anisotropy=0.2, rim_power=1.0, glow=0.0, top_lit=0.0):
    """Cloud-like volume on a unit sphere. warm_under adds city glow to the lower half."""
    t = new(name)
    tc = t.n('ShaderNodeTexCoord')
    nz = t.n('ShaderNodeTexNoise', Scale=scale, Detail=10.0, Roughness=0.62, Distortion=0.6)
    t.l(tc.outputs['Object'], nz.inputs['Vector'])
    dens = t.range(nz.outputs['Fac'], lo, hi)
    ln = t.n('ShaderNodeVectorMath', _operation='LENGTH')
    t.l(tc.outputs['Object'], ln.inputs[0])
    rim = t.math('POWER', t.math('MAXIMUM', t.math('SUBTRACT', 1.0, ln.outputs['Value']), 0.0), rim_power)
    dens = t.math('MULTIPLY', t.math('MULTIPLY', dens, rim), density)
    v = t.n('ShaderNodeVolumePrincipled', Color=(*colour, 1), Anisotropy=anisotropy)
    t.l(dens, v.inputs['Density'])
    if glow:
        # Mist catches the light of the falls: a faint pale glow wherever it is dense.
        v.inputs['Emission Color'].default_value = (0.7, 0.72, 0.88, 1)
        t.l(t.math('MULTIPLY', dens, glow), v.inputs['Emission Strength'])
    if warm_under or top_lit:
        # Moonlit tops glow cool, and undersides take the warm city glow from below.
        sep = t.n('ShaderNodeSeparateXYZ')
        t.l(tc.outputs['Object'], sep.inputs[0])
        under = t.range(sep.outputs['Z'], 0.2, -0.8)
        top = t.range(sep.outputs['Z'], -0.1, 0.7)
        col = t.mix(top, (1.0, 0.55, 0.28), (0.62, 0.64, 0.9))
        t.l(col, v.inputs['Emission Color'])
        amount = t.math('ADD', t.math('MULTIPLY', under, warm_under), t.math('MULTIPLY', top, top_lit))
        t.l(t.math('MULTIPLY', amount, dens), v.inputs['Emission Strength'])
    t.out(volume=v.outputs[0])


def cloud_wash():
    """Painted cloud: lavender tops, warm undersides from the city, soft transparent edges."""
    t = new('Cloud_Wash')
    t.m.surface_render_method = 'BLENDED'
    t.m.use_backface_culling = True
    tc = t.n('ShaderNodeTexCoord')
    sep = t.n('ShaderNodeSeparateXYZ')
    t.l(tc.outputs['Generated'], sep.inputs[0])
    warm = t.range(sep.outputs['Z'], 0.45, 0.0)
    col = t.mix(warm, (0.42, 0.41, 0.6), (0.5, 0.33, 0.33))
    body = paint(t, col, granulation=1.3)
    lw = t.n('ShaderNodeLayerWeight', Blend=0.35)
    edge = t.range(lw.outputs['Facing'], 0.55, 0.95, 1.0, 0.0)
    tr = t.n('ShaderNodeBsdfTransparent')
    m = t.n('ShaderNodeMixShader')
    t.l(edge, m.inputs['Fac'])
    t.l(tr.outputs[0], m.inputs[1])
    t.l(body, m.inputs[2])
    t.out(m.outputs[0])


def glass_clear():
    t = new('Home_Glass')
    t.m.surface_render_method = 'BLENDED'
    tr = t.n('ShaderNodeBsdfTransparent')
    tint = t.n('ShaderNodeEmission', Color=(0.55, 0.6, 0.8, 1), Strength=0.05)
    fr = t.n('ShaderNodeLayerWeight', Blend=0.2)
    m = t.n('ShaderNodeMixShader')
    t.l(t.math('MULTIPLY', fr.outputs['Fresnel'], 0.5), m.inputs['Fac'])
    t.l(tr.outputs[0], m.inputs[1])
    t.l(tint.outputs[0], m.inputs[2])
    t.out(m.outputs[0])


def river():
    """Dark water that carries long warm streaks of reflected city light."""
    t = new('River')
    tc = t.n('ShaderNodeTexCoord')
    mp = t.n('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (0.004, 0.08, 1.0)
    t.l(tc.outputs['Object'], mp.inputs['Vector'])
    nz = t.n('ShaderNodeTexNoise', Scale=3.0, Detail=6.0)
    t.l(mp.outputs[0], nz.inputs['Vector'])
    e = t.n('ShaderNodeEmission', Color=(1.0, 0.62, 0.32, 1))
    t.l(t.range(nz.outputs['Fac'], 0.5, 0.75, 0.0, 1.6), e.inputs['Strength'])
    add = t.n('ShaderNodeAddShader')
    t.l(paint(t, (0.04, 0.05, 0.12), wet=1.0, gloss=0.1, granulation=0.4, haze=0.15), add.inputs[0])
    t.l(e.outputs[0], add.inputs[1])
    t.out(add.outputs[0])


def city_ground():
    t = new('City_Ground')
    tc = t.n('ShaderNodeTexCoord')
    grid = t.n('ShaderNodeTexBrick', Scale=1.0, **{'Mortar Size': 1.6, 'Brick Width': 60.0, 'Row Height': 45.0}, _offset=0.0)
    t.l(tc.outputs['Object'], grid.inputs['Vector'])
    dots = t.n('ShaderNodeTexVoronoi', Scale=0.25)
    t.l(tc.outputs['Object'], dots.inputs['Vector'])
    lamp = t.math('LESS_THAN', dots.outputs['Distance'], 0.08)
    street = grid.outputs['Fac']
    light = t.math('ADD', t.math('MULTIPLY', street, 2.6), t.math('MULTIPLY', t.math('MULTIPLY', lamp, street), 7.0))
    e = t.n('ShaderNodeEmission', Color=(1.0, 0.58, 0.28, 1))
    t.l(light, e.inputs['Strength'])
    add = t.n('ShaderNodeAddShader')
    t.l(paint(t, (0.04, 0.035, 0.06), haze=0.15), add.inputs[0])
    t.l(e.outputs[0], add.inputs[1])
    t.out(add.outputs[0])


# ---------------------------------------------------------------- all

def build_all():
    paint_group()
    rock()
    grass()
    bark()
    foliage('Leaf', (0.05, 0.12, 0.06), (0.14, 0.24, 0.08))
    foliage('Leaf_Pine', (0.03, 0.08, 0.05), (0.07, 0.15, 0.07))
    foliage('Sakura', (0.82, 0.42, 0.55), (0.98, 0.7, 0.78))
    textured('Terrace_Stone', 'rock_tile_floor', 2.2, (0.42, 0.4, 0.5), wet=1.0)
    textured('Stone', 'cliff_side', 2.0, (0.55, 0.53, 0.6), saturation=0.3)
    textured('Lantern_Stone', 'concrete_tile_facade', 1.5, (0.6, 0.58, 0.62), saturation=0.3)
    textured('Wood', 'brown_planks_05', 1.6, (0.55, 0.42, 0.34))
    textured('Wood_Dark', 'brown_planks_05', 1.6, (0.22, 0.15, 0.13))
    textured('Roof_Tile', 'clay_roof_tiles_02', 2.0, (0.2, 0.2, 0.28), saturation=0.2)
    textured('Bridge_Stone', 'concrete_tile_facade', 3.0, (0.34, 0.32, 0.4), saturation=0.25)
    textured('Tower_Stone', 'concrete_tile_facade', 4.0, (0.09, 0.09, 0.14), saturation=0.2)
    textured('Tower_Concrete', 'concrete_tile_facade', 4.0, (0.18, 0.17, 0.22), saturation=0.2)
    textured('Home_Wall', 'concrete_tile_facade', 3.0, (0.86, 0.82, 0.78), saturation=0.2)
    textured('Home_Floor', 'brown_planks_05', 1.2, (0.82, 0.66, 0.52))
    flat('Torii_Red', (0.66, 0.08, 0.05))
    flat('Torii_Black', (0.05, 0.045, 0.07))
    flat('Plaster', (0.76, 0.7, 0.64))
    flat('Tower_Metal', (0.09, 0.09, 0.13), granulation=0.6)
    flat('Tower_Rib_Stone', (0.36, 0.34, 0.44))
    flat('Tower_Band_Concrete', (0.46, 0.42, 0.46))
    flat('Tower_Diagrid_Bronze', (0.42, 0.3, 0.2), granulation=0.7)
    flat('Tower_Louvre_Metal', (0.4, 0.4, 0.5), granulation=0.6)
    flat('Home_Frame', (0.07, 0.07, 0.1), granulation=0.5)
    flat('Home_Ceiling', (0.86, 0.85, 0.82), granulation=0.4)
    flat('Craft_Body', (0.16, 0.16, 0.22), granulation=0.5)
    flat('Bridge_Iron', (0.1, 0.09, 0.13), granulation=0.6)
    river()
    glow('City_Embankment', (1.0, 0.62, 0.3), 9.0)
    paper_glow()
    glow('Lantern_Fire', (1.0, 0.62, 0.3), 14.0)
    glow('Lamp_Glow', (1.0, 0.66, 0.34), 18.0)
    glow('Aircraft_Light', (1.0, 0.08, 0.04), 30.0)
    glow('Craft_Light_Red', (1.0, 0.1, 0.06), 40.0)
    glow('Craft_Light_White', (1.0, 0.86, 0.64), 30.0)
    glow('Lantern_Paper', (1.0, 0.5, 0.25), 8.0)
    windows('Tower_Window', (0.03, 0.03, 0.055), 0.16, (1.0, 0.6, 0.28), 0.8)
    windows('Tower_Curtain_Glass', (0.06, 0.08, 0.17), 0.14, (0.98, 0.7, 0.4), 0.7)
    windows('City_Block', (0.01, 0.01, 0.018), 0.22, (1.0, 0.58, 0.26), 2.4, haze=False)
    windows('Home_Window_Lit', (0.07, 0.07, 0.11), 0.6, (1.0, 0.66, 0.36), 1.0)
    water_lake()
    waterfall()
    volume('Mist', (0.7, 0.72, 0.86), 0.5, 2.6, 0.42, 0.72, warm_under=0.0, rim_power=1.6, glow=0.05)
    volume('Cloud', (0.4, 0.38, 0.54), 0.5, 1.6, 0.38, 0.66, warm_under=0.1, anisotropy=0.35, rim_power=1.5, top_lit=0.04)
    volume('Cloud_Dark', (0.3, 0.28, 0.42), 1.4, 0.9, 0.38, 0.62, warm_under=0.0)
    cloud_wash()
    glass_clear()
    city_ground()

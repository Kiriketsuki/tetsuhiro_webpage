# Round 1 fixes, ranked by the reviewer's evidence: soft foliage, a visible wet walkway, a spillway with
# foam, a lit river, glowing clouds, more distant islands, stronger haze, cliff fractures, distinct facades.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:90])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


# ---------------------------------------------------------------- foliage: rounded leaves, clump normals
patch('lib/trees.py', [
    ('''def _leaf(bm, centre, normal, size, rnd, mi):
    """A diamond leaf card. Long, thin cards stand in for pine needles."""
    u = _perp(normal)
    v = normal.cross(u).normalized()
    rot = rnd.uniform(0, 2 * pi)
    u, v = u * cos(rot) + v * sin(rot), v * cos(rot) - u * sin(rot)
    w = size * 0.42
    pts = [centre + u * size, centre + v * w, centre - u * size * 0.6, centre - v * w]
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    f.material_index = mi
    f.smooth = True''',
     '''def _leaf(bm, centre, normal, size, rnd, mi, clump_centre, store):
    """A rounded leaf card. Its normals point out from the clump centre, so a clump shades as one soft mass."""
    u = _perp(normal)
    v = normal.cross(u).normalized()
    rot = rnd.uniform(0, 2 * pi)
    u, v = u * cos(rot) + v * sin(rot), v * cos(rot) - u * sin(rot)
    w = size * 0.45
    pts = [centre + u * (size * cos(a)) + v * (w * sin(a)) for a in [2 * pi * k / 7 for k in range(7)]]
    verts = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(verts)
    f.material_index = mi
    f.smooth = True
    for vt in verts:
        store[vt] = ((vt.co - clump_centre).normalized() + Vector((0, 0, 0.35))).normalized()'''),
    ('''def _clump(bm, tip, sp, rnd):
    r = sp['clump'] * rnd.uniform(0.75, 1.2)
    for _ in range(int(sp['leaves'] * rnd.uniform(0.8, 1.2))):
        # Points concentrate toward the shell of the clump, which leaves gaps inside and between clumps.
        d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
        p = tip + Vector((d.x * r, d.y * r, d.z * r * sp['squash'])) * rnd.uniform(0.55, 1.0)
        n = (d + Vector((0, 0, 0.8))).normalized()
        _leaf(bm, p, n, sp['size'] * rnd.uniform(0.7, 1.3), rnd, 1)''',
     '''def _clump(bm, tip, sp, rnd, store, kind):
    # Sakura breaks into several small blossom clusters. Other trees keep one clump per tip.
    subs = [(tip, 1.0)]
    if kind in ('sakura', 'broadleaf'):
        subs = [(tip + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.4, 0.6))) * sp['clump'] * 0.7, 0.55)
                for _ in range(4 if kind == 'sakura' else 3)]
    for centre, scale in subs:
        r = sp['clump'] * rnd.uniform(0.75, 1.2) * scale
        for _ in range(int(sp['leaves'] * rnd.uniform(0.8, 1.2) * (0.45 if scale < 1 else 1.0))):
            # Points concentrate toward the shell of the clump, which leaves gaps inside and between clumps.
            d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1))).normalized()
            p = centre + Vector((d.x * r, d.y * r, d.z * r * sp['squash'])) * rnd.uniform(0.55, 1.0)
            n = (d + Vector((0, 0, 0.8))).normalized()
            _leaf(bm, p, n, sp['size'] * rnd.uniform(0.7, 1.3), rnd, 1, centre, store)'''),
    ("def _branch(bm, start, direction, length, radius, depth, sp, rnd, kind):",
     "def _branch(bm, start, direction, length, radius, depth, sp, rnd, kind, store):"),
    ('''        _clump(bm, pts[-1], sp, rnd)
        if kind in ('broadleaf', 'sakura'):
            _clump(bm, pts[-2], sp, rnd)''',
     '''        _clump(bm, pts[-1], sp, rnd, store, kind)
        if kind in ('broadleaf', 'sakura'):
            _clump(bm, pts[-2], sp, rnd, store, kind)'''),
    ("        _branch(bm, base, nd, ln, radius * 0.55, depth - 1, sp, rnd, kind)",
     "        _branch(bm, base, nd, ln, radius * 0.55, depth - 1, sp, rnd, kind, store)"),
    ('''    bm = bmesh.new()
    if kind == 'shrub':
        for i in range(3):
            _branch(bm, Vector((rnd.uniform(-.3, .3), rnd.uniform(-.3, .3), 0)), Vector((rnd.uniform(-.4, .4), rnd.uniform(-.4, .4), 1)),
                    sp['h'], sp['r'], sp['depth'] - 1, sp, rnd, kind)
    else:
        _branch(bm, Vector((0, 0, -0.4)), Vector((0, 0, 1)), sp['h'], sp['r'], sp['depth'], sp, rnd, kind)
    o = util.obj_from_bm(f'Tree_{kind.title()}_Source.{seed % 1000:03d}', bm, collection, ['Bark', sp['mat']])
    return o''',
     '''    bm = bmesh.new()
    store = {}
    if kind == 'shrub':
        for i in range(3):
            _branch(bm, Vector((rnd.uniform(-.3, .3), rnd.uniform(-.3, .3), 0)), Vector((rnd.uniform(-.4, .4), rnd.uniform(-.4, .4), 1)),
                    sp['h'], sp['r'], sp['depth'] - 1, sp, rnd, kind, store)
    else:
        _branch(bm, Vector((0, 0, -0.4)), Vector((0, 0, 1)), sp['h'], sp['r'], sp['depth'], sp, rnd, kind, store)
    custom = [store.get(v) for v in bm.verts]
    o = util.obj_from_bm(f'Tree_{kind.title()}_Source.{seed % 1000:03d}', bm, collection, ['Bark', sp['mat']], smooth=True)
    me = o.data
    me.normals_split_custom_set_from_vertices([n if n is not None else me.vertices[i].normal.copy()
                                               for i, n in enumerate(custom)])
    return o'''),
])

# ---------------------------------------------------------------- terrace: wider visible walkway
patch('lib/props.py', [
    ("    rail = [util.ground_point(u, v, zf) for u, v in ((-0.14, 0.76), (0.0, 0.672), (0.08, 0.636), (0.16, 0.603),\n"
     "                                                   (0.235, 0.575), (0.29, 0.557))]",
     "    rail = [util.ground_point(u, v, zf) for u, v in ((-0.04, 0.9), (0.07, 0.76), (0.15, 0.69), (0.23, 0.635),\n"
     "                                                   (0.3, 0.598), (0.35, 0.575))]"),
    ("    sdir = (fwd * 0.8 + left * 0.6).normalized()\n    start = util.frame_point(T, fwd, left, 1.6, 0.4, zf)",
     "    sdir = (fwd * 0.92 + left * 0.38).normalized()\n    start = util.frame_point(T, fwd, left, 2.2, 0.6, zf)"),
    ("        stone_lantern(f'Terrace_Lantern.{k}', c, p, rot, 1.0, light=110.0, shadow=k < 2)",
     "        stone_lantern(f'Terrace_Lantern.{k}', c, p, rot, 1.0, light=320.0, shadow=k < 2)"),
    ("    shrine('Terrace_Shrine', c, util.frame_point(T, fwd, left, 13.0, 3.5, zu), rot + 0.15, width=8.5, depth=6.5)",
     "    shrine('Terrace_Shrine', c, util.frame_point(T, fwd, left, 16.5, 3.8, zu), rot + 0.15, width=8.5, depth=6.5)"),
    ("            stone_lantern(f'Central_Lantern.{k}', c, p, th, 1.1, light=140.0)",
     "            stone_lantern(f'Central_Lantern.{k}', c, p, th, 1.1, light=520.0)"),
    ("    bridge('Lamp_Bridge_Lower_Right', c, a, b, width=3.2, rise=util.S(2.5), piers=3, pier_len=util.S(9),\n"
     "           lamp_gap=util.S(6.0), lamp_power=260.0)",
     "    bridge('Lamp_Bridge_Lower_Right', c, a, b, width=3.2, rise=util.S(2.5), piers=3, pier_len=util.S(9),\n"
     "           lamp_gap=util.S(6.0), lamp_power=1100.0)"),
    # The right cliff carries its own torii, as in the reference.
    ("    # The mid right bridge with a torii on its deck.",
     "    hit = util.drop(rc['centre'].x - rc['rx'] * 0.55, rc['centre'].y - rc['ry'] * 0.3, rc['centre'].z + 80, {rc['obj']})\n"
     "    if hit:\n"
     "        torii('Right_Cliff_Torii', c, hit[0], pi / 2 + 0.6, height=5.2, span=4.2)\n"
     "    # The mid right bridge with a torii on its deck."),
])
patch('lib/terrain.py', [
    ("    upper = island('Terrace_Upper_Rock', c, util.frame_point(T, fwd, left, 23.0, 6.0, z_walk + 3.0), 13.0, 18.0,",
     "    upper = island('Terrace_Upper_Rock', c, util.frame_point(T, fwd, left, 27.0, 8.0, z_walk + 3.0), 12.0, 16.0,"),
    # A spillway through the rim: lake water runs straight to the lip where the falls begin.
    ('''        if f > 0.9:
            z -= notch_drop(a) * (f - 0.9) / 0.1''',
     '''        if f > 0.9:
            z -= notch_drop(a) * (f - 0.9) / 0.1
        if lake and notch and f > 0.55 and _gauss_angle(a, notch[0], notch[1] * 0.9) > 0.35:
            z = min(z, -0.9)'''),
    ("    cols.noise_scale = 3.2", "    cols.noise_scale = 4.5"),
    ("                 texture_coords_object=space, strength=min(3.0, 0.6 + r * 0.03), vertex_group='cliff')",
     "                 texture_coords_object=space, strength=min(5.0, 1.0 + r * 0.05), vertex_group='cliff')"),
    ("        if 0.52 < u < 0.75 and v < 0.45:\n            continue\n        if u > 0.78 and v < 0.32:",
     "        if 0.55 < u < 0.72 and v < 0.38:\n            continue\n        if u > 0.8 and v < 0.3:"),
    ("        u, v, d = rnd.uniform(0.0, 1.0), rnd.uniform(0.08, 0.42), rnd.uniform(700, 2400)",
     "        u, v, d = rnd.uniform(0.0, 1.0), rnd.uniform(0.1, 0.4), rnd.uniform(650, 2000)"),
    ("        if any(abs(u - a) < 0.06 and abs(v - b) < 0.05 for a, b, _ in spots):",
     "        if any(abs(u - a) < 0.05 and abs(v - b) < 0.045 for a, b, _ in spots):"),
])
patch('lib/water.py', [
    ("        limit = outline(a, rx, ry, info['ph']) * 0.965\n",
     "        # Near the notch the lake reaches the lip, so the falls leave the water without a seam.\n"
     "        near = exp(-(((a - info['notch'][0] + pi) % (2 * pi) - pi) / (info['notch'][1] * 0.9)) ** 2)\n"
     "        limit = outline(a, rx, ry, info['ph']) * (0.965 + 0.04 * min(1.0, near * 1.6))\n"),
    ("from math import pi, cos, sin, atan2, sqrt", "from math import pi, cos, sin, atan2, sqrt, exp"),
    ("    falls_from_rim('Central_Waterfall', central, cc, notch_a, 6, util.S(30), util.S(95), rnd)",
     "    falls_from_rim('Central_Waterfall', central, cc, notch_a, 7, util.S(32), util.S(95), rnd, start_inset=0.99)"),
])

# ---------------------------------------------------------------- materials
patch('lib/materials.py', [
    ("HAZE = (0.12, 0.11, 0.21)", "HAZE = (0.16, 0.16, 0.3)"),
    # Vertical fractures in the rock, read from a Voronoi field stretched tall.
    ("    banded = t.mix(0.35, dark, strata.outputs['Color'], 'MULTIPLY')\n    # Moss grows",
     "    banded = t.mix(0.35, dark, strata.outputs['Color'], 'MULTIPLY')\n"
     "    fmap = t.n('ShaderNodeMapping')\n"
     "    fmap.inputs['Scale'].default_value = (0.45, 0.45, 0.05)\n"
     "    t.l(tc.outputs['Object'], fmap.inputs['Vector'])\n"
     "    frac = t.n('ShaderNodeTexVoronoi', _feature='DISTANCE_TO_EDGE', Scale=1.0)\n"
     "    t.l(fmap.outputs[0], frac.inputs['Vector'])\n"
     "    crack = t.range(frac.outputs['Distance'], 0.0, 0.06, 0.4, 1.0)\n"
     "    banded = t.mix(1.0, banded, crack, 'MULTIPLY')\n"
     "    # Moss grows"),
    ("    t.out(paint(t, t.mix(1.0, col, (0.4, 0.34, 0.34), 'MULTIPLY'), nor))",
     "    t.out(paint(t, t.mix(1.0, col, (0.6, 0.52, 0.5), 'MULTIPLY'), nor))"),
    ("    t.out(paint(t, c, nor, wet=wetness, gloss=0.22))", "    t.out(paint(t, c, nor, wet=wetness, gloss=0.1))"),
    ("    t.out(paint(t, (0.05, 0.06, 0.13), bump.outputs['Normal'], wet=1.0, gloss=0.16, granulation=0.6))",
     "    t.out(paint(t, (0.05, 0.06, 0.13), bump.outputs['Normal'], wet=1.8, gloss=0.08, granulation=0.6))"),
    ("    bright = t.math('MINIMUM', t.math('ADD', t.math('ADD', t.math('MULTIPLY', s, 0.5), 0.18), t.math('MULTIPLY', foam, 0.4)), 0.8)",
     "    bright = t.math('MINIMUM', t.math('ADD', t.math('ADD', t.math('MULTIPLY', s, 0.5), 0.18), t.math('MULTIPLY', foam, 1.1)), 1.0)"),
    ("windows('City_Block', (0.01, 0.01, 0.018), 0.06, (1.0, 0.58, 0.26), 1.6)",
     "windows('City_Block', (0.01, 0.01, 0.018), 0.12, (1.0, 0.58, 0.26), 1.8)"),
    ("windows('Tower_Curtain_Glass', (0.035, 0.04, 0.075), 0.14, (0.98, 0.7, 0.4), 0.7)",
     "windows('Tower_Curtain_Glass', (0.06, 0.08, 0.17), 0.14, (0.98, 0.7, 0.4), 0.7)"),
    ("    volume('Cloud', (0.46, 0.43, 0.6), 2.2, 1.1, 0.4, 0.62, warm_under=0.08, anisotropy=0.35)",
     "    volume('Cloud', (0.5, 0.47, 0.64), 2.6, 2.4, 0.46, 0.6, warm_under=0.3, anisotropy=0.35, rim_power=0.8)"),
    ("    nz = t.n('ShaderNodeTexNoise', Scale=scale, Detail=8.0, Roughness=0.6, Distortion=0.3)",
     "    nz = t.n('ShaderNodeTexNoise', Scale=scale, Detail=10.0, Roughness=0.62, Distortion=0.6)"),
    # Lit windows fade with the haze too, so far towers never leave floating window dots.
    ("    t.l(t.math('MULTIPLY', t.math('MULTIPLY', lit, bright), strength), em.inputs['Strength'])\n    add = t.n('ShaderNodeAddShader')\n    t.l(paint(t, glass, granulation=0.5), add.inputs[0])",
     "    cam = t.n('ShaderNodeCameraData')\n"
     "    keep = t.math('EXPONENT', t.math('DIVIDE', cam.outputs['View Distance'], -util.CFG.get('HAZE_DISTANCE', 2200.0)))\n"
     "    t.l(t.math('MULTIPLY', t.math('MULTIPLY', t.math('MULTIPLY', lit, bright), strength), keep), em.inputs['Strength'])\n"
     "    add = t.n('ShaderNodeAddShader')\n    t.l(paint(t, glass, granulation=0.5), add.inputs[0])"),
    ("    light = t.math('ADD', t.math('MULTIPLY', street, 0.9), t.math('MULTIPLY', t.math('MULTIPLY', lamp, street), 3.5))",
     "    light = t.math('ADD', t.math('MULTIPLY', street, 1.4), t.math('MULTIPLY', t.math('MULTIPLY', lamp, street), 4.5))"),
    ("    textured('River', 'rock_tile_floor', 40.0, (0.05, 0.06, 0.12), wet=1.0, saturation=0.0)",
     "    river()\n    glow('City_Embankment', (1.0, 0.62, 0.3), 3.5)"),
    ("def city_ground():",
     '''def river():
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
    t.l(paint(t, (0.04, 0.05, 0.12), wet=1.0, gloss=0.1, granulation=0.4), add.inputs[0])
    t.l(e.outputs[0], add.inputs[1])
    t.out(add.outputs[0])


def city_ground():'''),
    # Distinct frame materials, so each facade type reads at hero-tower distance.
    ("    flat('Tower_Metal', (0.09, 0.09, 0.13), granulation=0.6)",
     "    flat('Tower_Metal', (0.09, 0.09, 0.13), granulation=0.6)\n"
     "    flat('Tower_Rib_Stone', (0.36, 0.34, 0.44))\n"
     "    flat('Tower_Band_Concrete', (0.46, 0.42, 0.46))\n"
     "    flat('Tower_Diagrid_Bronze', (0.42, 0.3, 0.2), granulation=0.7)\n"
     "    flat('Tower_Louvre_Metal', (0.4, 0.4, 0.5), granulation=0.6)"),
])
patch('lib/towers.py', [
    ("MATS = ['Tower_Window', 'Tower_Curtain_Glass', 'Tower_Stone', 'Tower_Metal', 'Tower_Concrete',\n"
     "        'Aircraft_Light', 'Lamp_Glow', 'Roof_Tile', 'Neon_Sign']\n"
     "WIN, CUR, STONE, METAL, CONC, RED, GLOW, ROOF, NEON = range(9)\n"
     "FRAME = {'grid': STONE, 'ribbed': STONE, 'curtain': METAL, 'banded': CONC, 'piers': CONC,\n"
     "         'balcony': CONC, 'diagrid': METAL, 'panel': STONE, 'louvre': METAL}\n"
     "INSET = 0.45",
     "MATS = ['Tower_Window', 'Tower_Curtain_Glass', 'Tower_Stone', 'Tower_Metal', 'Tower_Concrete',\n"
     "        'Aircraft_Light', 'Lamp_Glow', 'Roof_Tile', 'Tower_Rib_Stone', 'Tower_Band_Concrete',\n"
     "        'Tower_Diagrid_Bronze', 'Tower_Louvre_Metal']\n"
     "WIN, CUR, STONE, METAL, CONC, RED, GLOW, ROOF, RIB, BAND, DIAG, LOUV = range(12)\n"
     "# Each facade type gets a frame material of its own, so the types stay apart at a distance.\n"
     "FRAME = {'grid': STONE, 'ribbed': RIB, 'curtain': METAL, 'banded': BAND, 'piers': CONC,\n"
     "         'balcony': CONC, 'diagrid': DIAG, 'panel': STONE, 'louvre': LOUV}\n"
     "INSET = 0.8"),
    ("                        util.box(bm, (x, cy + sy * (d / 2 - INSET + 0.15), z0 + k * STOREY + 0.2), (BAY - 0.22, 0.3, STOREY - 0.4), STONE)",
     "                        util.box(bm, (x, cy + sy * (d / 2 - INSET + 0.15), z0 + k * STOREY + 0.2), (BAY - 0.22, 0.3, STOREY - 0.4), BAND)"),
    ("                        util.box_between(bm, a, b, 0.45, mi=METAL)", "                        util.box_between(bm, a, b, 0.7, mi=DIAG)"),
    ("            util.box(bm, (cx, cy, z0 + k * 0.9), (w + 1.2, d + 1.2, 0.07), METAL)",
     "            util.box(bm, (cx, cy, z0 + k * 0.9), (w + 1.2, d + 1.2, 0.1), LOUV)"),
    ("        top = crown(bm, 'pyramid' if c != 'pyramid' else 'flat_plant', tw / 2 + 2 * BAY, 0, h * 0.86, tw, rnd, lights)",
     "        top = crown(bm, 'flat_plant' if c != 'flat_plant' else 'stepped', tw / 2 + 2 * BAY, 0, h * 0.86, tw, rnd, lights)"),
])

# ---------------------------------------------------------------- sky, clouds, city
patch('lib/sky.py', [
    ("    for k in range(int(count * 0.2)):\n        u, v = rnd.uniform(-0.1, 1.1), rnd.uniform(0.3, 0.46)",
     "    for k in range(int(count * 0.12)):\n        u, v = rnd.uniform(-0.1, 1.1), rnd.uniform(0.4, 0.5)"),
    ("    for k in range(int(count * 0.15)):\n        u = rnd.choice", "    for k in range(int(count * 0.06)):\n        u = rnd.choice"),
    ("    for pos, col in ((0.38, (0.12, 0.08, 0.11)), (0.5, (0.075, 0.06, 0.12)), (0.64, (0.03, 0.028, 0.08)),\n"
     "                     (0.85, (0.01, 0.01, 0.035))):",
     "    for pos, col in ((0.4, (0.24, 0.15, 0.17)), (0.5, (0.13, 0.09, 0.17)), (0.6, (0.05, 0.042, 0.11)),\n"
     "                     (0.78, (0.012, 0.012, 0.045))):"),
])
patch('lib/city.py', [
    ("    util.obj_from_bm('Ground_City_River', bm, c, ['River'], loc=(centre.x, centre.y, util.CFG['GROUND_Z']))",
     "    util.obj_from_bm('Ground_City_River', bm, c, ['River'], loc=(centre.x, centre.y, util.CFG['GROUND_Z']))\n"
     "    # Lit roads run along both banks, so the river reads as a dark ribbon outlined in light.\n"
     "    emb = bmesh.new()\n"
     "    for sgn in (1, -1):\n"
     "        prev = None\n"
     "        for _, _, p, nrm in rows:\n"
     "            q = p + nrm * sgn * 1.12 + Vector((0, 0, 1.0))\n"
     "            if prev is not None:\n"
     "                util.box_between(emb, prev, q, util.S(7))\n"
     "            prev = q\n"
     "    util.obj_from_bm('Ground_City_Embankments', emb, c, ['City_Embankment'], loc=(centre.x, centre.y, util.CFG['GROUND_Z']))"),
])
patch('lib/camera.py', [("    glow.energy = 6.0e6", "    glow.energy = 2.4e7"), ("    moon.energy = 0.75", "    moon.energy = 1.0")])
patch('build.py', [("DISTANT_ISLAND_COUNT = 34", "DISTANT_ISLAND_COUNT = 52"), ("HAZE_DISTANCE = 3200.0", "HAZE_DISTANCE = 1800.0")])
patch('credits.md', [("No other external asset is used. All geometry, the sky, the clouds, the rain and the water are procedural.",
                      "No other external asset is used. All geometry, the sky, the clouds and the water are procedural.")])
print('ok')

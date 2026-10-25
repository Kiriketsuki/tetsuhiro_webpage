# One-off patch: painted cloud billows (solid displaced clusters with soft edges) over a thin volume haze.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:90])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


BILLOW = '''def _billow(name, centre, r, rnd, collection, mat_name='Cloud_Wash'):
    """A cumulus cluster: overlapping puffs on a flat base, displaced into cauliflower edges."""
    bm = bmesh.new()
    for i in range(rnd.randint(7, 12)):
        rr = r * (rnd.uniform(0.45, 0.7) if i < 3 else rnd.uniform(0.25, 0.45))
        off = Vector((rnd.uniform(-1, 1) * r * 0.9, rnd.uniform(-1, 1) * r * 0.7, rnd.uniform(0.0, 0.35) * r))
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0,
                                   matrix=Matrix.Translation(off) @ Matrix.Diagonal((rr, rr, rr * 0.8, 1)))
    base = -0.12 * r
    for v in bm.verts:
        if v.co.z < base:
            v.co.z = base + (v.co.z - base) * 0.15
    o = util.obj_from_bm(name, bm, collection, [mat_name], smooth=True, loc=centre)
    tex = bpy.data.textures.get('Cloud_Puff') or bpy.data.textures.new('Cloud_Puff', 'CLOUDS')
    tex.noise_scale = 0.35
    tex.noise_depth = 3
    util.add_mod(o, 'DISPLACE', 'Puff', texture=tex, texture_coords='LOCAL', strength=r * 0.16)
    util.add_mod(o, 'SUBSURF', 'Subdivision', levels=1, render_levels=1)
    o.visible_shadow = False
    return o


def clouds():
    rnd = random.Random(util.CFG['SEED'] + 7)
    c = util.coll('Sky_Clouds')
    count = util.CFG['CLOUD_BLOB_COUNT']
    made = 0
    tries = 0
    # The cloud sea below the islands: painted billows with a gap over the ground city.
    while made < count * 0.65 and tries < 5000:
        tries += 1
        u, v = rnd.uniform(-0.15, 1.15), rnd.uniform(0.5, 1.15)
        gu, gv, ru, rv = GAP
        if ((u - gu) / ru) ** 2 + ((v - gv) / rv) ** 2 < 1.0:
            continue
        zc = util.S(rnd.uniform(-330, -210))
        d = depth_for_z(u, v, zc)
        if d is None or not (util.S(90) < d < util.S(3500)):
            continue
        p = util.cam_point(u, v, d)
        _billow(f'Cloud_Billow.{made:03d}', p, max(util.S(25), d * rnd.uniform(0.045, 0.08)), rnd, c)
        made += 1
    # A thin volume haze threads through the billows and softens the gap edge.
    for k in range(int(count * 0.15)):
        u, v = rnd.uniform(-0.1, 1.1), rnd.uniform(0.55, 1.1)
        gu, gv, ru, rv = GAP
        if ((u - gu) / ru) ** 2 + ((v - gv) / rv) ** 2 < 0.8:
            continue
        d = depth_for_z(u, v, util.S(rnd.uniform(-300, -220)))
        if d is None or not (util.S(90) < d < util.S(3500)):
            continue
        p = util.cam_point(u, v, d)
        r = d * rnd.uniform(0.1, 0.16)
        _blob(f'Cloud_Haze.{k:03d}', 'Cloud', p, (r, r, r * 0.4), c)
    # Banks between the far islands, and dark clouds in the top corners.
    for k in range(int(count * 0.12)):
        u, v = rnd.uniform(-0.1, 1.1), rnd.uniform(0.4, 0.5)
        d = util.S(rnd.uniform(1200, 3200))
        _billow(f'Cloud_Bank.{k:03d}', util.cam_point(u, v, d), d * rnd.uniform(0.04, 0.07), rnd, c)
    for k in range(int(count * 0.06)):
        u = rnd.choice((rnd.uniform(-0.15, 0.25), rnd.uniform(0.78, 1.15)))
        v = rnd.uniform(-0.1, 0.2)
        d = util.S(rnd.uniform(900, 2200))
        p = util.cam_point(u, v, d)
        r = d * rnd.uniform(0.1, 0.16)
        _blob(f'Cloud_High.{k:03d}', 'Cloud_Dark', p, (r * 1.5, r, r * 0.45), c)


'''
s = open('lib/sky.py', encoding='utf-8').read()
a, b = s.index('def clouds():'), s.index('def _craft(')
open('lib/sky.py', 'w', encoding='utf-8', newline='\n').write(s[:a] + BILLOW + s[b:])

patch('lib/materials.py', [
    ("def glass_clear():",
     '''def cloud_wash():
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


def glass_clear():'''),
    ("    glass_clear()\n    city_ground()", "    cloud_wash()\n    glass_clear()\n    city_ground()"),
    ("    volume('Cloud', (0.38, 0.36, 0.52), 1.3, 2.2, 0.42, 0.66, warm_under=0.14, anisotropy=0.35, rim_power=1.3, top_lit=0.08)",
     "    volume('Cloud', (0.4, 0.38, 0.54), 0.5, 1.6, 0.38, 0.66, warm_under=0.1, anisotropy=0.35, rim_power=1.5, top_lit=0.04)"),
])
patch('build.py', [("CLOUD_BLOB_COUNT = 240", "CLOUD_BLOB_COUNT = 200")])
patch('lib/camera.py', [("    moon.energy = 1.0", "    moon.energy = 1.6")])
print('ok')

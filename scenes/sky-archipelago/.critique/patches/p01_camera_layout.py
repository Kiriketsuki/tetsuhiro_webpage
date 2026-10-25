# One-off patch: steeper camera, terrace anchored on the torii, shallower cliffs.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('lib/terrain.py', [
    ("""    c = util.coll('Terrace')
    z_walk = util.CFG['TERRACE_Z']
    o = island('Terrace_Cliff', c, (-32.0, 30.0, z_walk), 27.0, 36.0, 140.0, util.CFG['SEED'] + 1,
               segments=180, ledges=4, spikes=0, mound=0.0, levels=3, roots=16, top_mat='Grass')
    o.rotation_euler.z = 0.15
    upper = island('Terrace_Upper_Rock', c, (-30.0, 43.0, z_walk + 3.0), 12.5, 16.0, 9.0, util.CFG['SEED'] + 2,
                   segments=120, ledges=1, spikes=0, mound=0.2, levels=3, top_mat='Grass')
    util.REG['terrace'] = dict(z=z_walk, upper_z=z_walk + 3.0)
    return o, upper""",
     """    c = util.coll('Terrace')
    # The torii base anchors the terrace. Everything else sits in a ground frame around it:
    # fwd points away from the camera and left points to the viewer's left.
    T = util.cam_point(0.10, 0.575, util.CFG['TORII_DEPTH'])
    z_walk = T.z
    fwd = Vector((T.x, T.y, 0)).normalized()
    left = Vector((-fwd.y, fwd.x, 0))
    rot = atan2(fwd.y, fwd.x) - pi / 2
    o = island('Terrace_Cliff', c, util.frame_point(T, fwd, left, 4.0, 16.0, z_walk), 28.0, 40.0, 150.0,
               util.CFG['SEED'] + 1, segments=180, ledges=4, spikes=0, mound=0.0, levels=3, roots=16)
    o.rotation_euler.z = rot
    upper = island('Terrace_Upper_Rock', c, util.frame_point(T, fwd, left, 18.0, 14.0, z_walk + 3.0), 12.5, 16.0,
                   9.0, util.CFG['SEED'] + 2, segments=120, ledges=1, spikes=0, mound=0.2, levels=3)
    upper.rotation_euler.z = rot
    util.REG['terrace'] = dict(z=z_walk, upper_z=z_walk + 3.0, T=T, fwd=fwd, left=left, rot=rot)
    return o, upper"""),
    ("    lake_centre = util.cam_point(0.645, 0.462, util.S(255))", "    lake_centre = util.cam_point(0.645, 0.462, util.S(290))"),
    ("    o = island('Central_Island', c, centre, rx, ry, util.S(118),", "    o = island('Central_Island', c, centre, rx, ry, util.S(82),"),
    ("    rx, ry = util.S(64), util.S(52)", "    rx, ry = util.S(70), util.S(54)"),
    ("    o = island('Right_Cliff', c, p, util.S(30), util.S(26), util.S(95),", "    o = island('Right_Cliff', c, p, util.S(30), util.S(26), util.S(52),"),
])

s = open('lib/props.py', encoding='utf-8').read()
a, b = s.index('def terrace():'), s.index('def central():')
NEW = '''def terrace():
    c = util.coll('Terrace')
    t = util.REG['terrace']
    z, zu, T, fwd, left, rot = t['z'], t['upper_z'], t['T'], t['fwd'], t['left'], t['rot']
    zf = z + 0.14
    # The railing runs along the right edge of the walkway, as in the reference.
    rail = [util.ground_point(u, v, zf) for u, v in ((-0.14, 0.76), (0.0, 0.672), (0.08, 0.636), (0.16, 0.603),
                                                   (0.235, 0.575), (0.29, 0.557))]
    edge = [p - left * 0.4 for p in rail]
    far_left = [p + left * 24.0 for p in rail]
    floor_slab('Terrace_Walkway', c, [(p.x, p.y) for p in edge + far_left[::-1]], zf)
    railing('Terrace_Railing', c, rail)
    torii('Terrace_Torii', c, Vector((T.x, T.y, zf)), rot, height=5.4, span=4.4, lanterns=True)
    sdir = (fwd * 0.8 + left * 0.6).normalized()
    start = util.frame_point(T, fwd, left, 1.6, 0.4, zf)
    stairs('Terrace_Stairs', c, start, sdir, steps=int((zu - z) / 0.16) + 1, width=3.2)
    for k in range(4):
        f = 0.15 + 0.22 * k
        i = int(f * (len(rail) - 1))
        p = rail[i].lerp(rail[i + 1], f * (len(rail) - 1) - i) + left * 1.1
        stone_lantern(f'Terrace_Lantern.{k}', c, p, rot, 1.0, light=110.0, shadow=k < 2)
    for k, side in enumerate((-2.8, 3.4)):
        stone_lantern(f'Terrace_Stair_Lantern.{k}', c, util.frame_point(T, fwd, left, 1.0, side, zf), rot, 0.9,
                      light=70.0)
    shrine('Terrace_Shrine', c, util.frame_point(T, fwd, left, 13.5, 9.5, zu), rot + 0.2, width=8.5, depth=6.5)


'''
open('lib/props.py', 'w', encoding='utf-8', newline='\n').write(s[:a] + NEW + s[b:])

patch('lib/trees.py', [
    ("""    z = util.REG['terrace']['z']
    for k, (kind, x, y, s) in enumerate([('sakura', -12.0, 6.0, 1.3), ('broadleaf', -9.2, 3.5, 1.1),
                                         ('sakura', -20.8, 24.5, 1.2), ('pine', -33.0, 34.0, 1.3),
                                         ('broadleaf', -22.5, 47.0, 1.4), ('pine', -26.5, 31.5, 1.1),
                                         ('shrub', -13.5, 22.0, 1.4), ('shrub', -11.6, 12.0, 1.3),
                                         ('cypress', -40.0, 38.0, 1.2)][:util.CFG['TERRACE_TREE_COUNT']]):
        hit = util.drop(x, y, 60.0)
        loc = hit[0] if hit else Vector((x, y, z))""",
     """    t = util.REG['terrace']
    z = t['z']
    for k, (kind, along, side, s) in enumerate([('sakura', -12.0, 4.5, 1.3), ('broadleaf', -16.0, 7.0, 1.2),
                                                ('sakura', 2.5, 6.0, 1.2), ('pine', 10.0, 18.0, 1.3),
                                                ('broadleaf', 30.0, 8.0, 1.4), ('pine', 6.0, 13.0, 1.1),
                                                ('shrub', -6.0, -2.4, 1.4), ('shrub', -1.0, -3.2, 1.3),
                                                ('cypress', 28.0, 24.0, 1.2)][:util.CFG['TERRACE_TREE_COUNT']]):
        p = util.frame_point(t['T'], t['fwd'], t['left'], along, side)
        hit = util.drop(p.x, p.y, z + 60.0)
        loc = hit[0] if hit else Vector((p.x, p.y, z))"""),
])
patch('lib/home.py', [
    ("""    zu = util.REG['terrace']['upper_z']
    cx, cy = -34.2, 50.0""", """    t = util.REG['terrace']
    zu = t['upper_z']
    hp = util.frame_point(t['T'], t['fwd'], t['left'], 24.0, 16.0)
    cx, cy = hp.x, hp.y"""),
])
patch('build.py', [
    ("CAMERA_PITCH_DEG = -4.0            # Negative tilts the view down.\nTERRACE_Z = -3.4                   # Walkway height on the foreground cliff, below the camera.\nGROUND_Z = -420.0                  # Height of the ground city under the clouds.\n",
     "CAMERA_PITCH_DEG = -12.5           # Negative tilts the view down. The reference looks down on the lake.\nTORII_DEPTH = 26.0                 # Distance to the terrace torii, which anchors the foreground.\nGROUND_Z = -900.0                  # Height of the ground city under the clouds.\n"),
    ("RAIN_DROP_COUNT = 9000", "RAIN_DROP_COUNT = 5000"),
])
patch('lib/sky.py', [
    ("        zc = util.S(rnd.uniform(-230, -150))", "        zc = util.S(rnd.uniform(-330, -210))"),
    ("        d = 3.0 + 120.0 * rnd.random() ** 1.6", "        d = 15.0 + 140.0 * rnd.random() ** 1.3"),
])
patch('lib/water.py', [
    ("falls_from_rim('Central_Waterfall', central, cc, notch_a, 6, util.S(30), util.S(150), rnd)",
     "falls_from_rim('Central_Waterfall', central, cc, notch_a, 6, util.S(30), util.S(95), rnd)"),
    ("-util.S(95) - k * util.S(22))), util.S(26 + 6 * k))", "-util.S(70) - k * util.S(18))), util.S(22 + 6 * k))"),
    ("falls_from_rim('Right_Cliff_Waterfall', right, rc, pi + 0.9, 2, util.S(8), util.S(110), rnd,",
     "falls_from_rim('Right_Cliff_Waterfall', right, rc, pi + 0.9, 2, util.S(8), util.S(70), rnd,"),
    ("    mist('Right_Cliff_Mist', rc, rp + Vector((0, 0, -util.S(80))), util.S(22))",
     "    mist('Right_Cliff_Mist', rc, rp + Vector((0, 0, -util.S(55))), util.S(18))"),
])
patch('lib/materials.py', [
    ("    bright = t.math('ADD', t.math('ADD', t.math('MULTIPLY', s, 1.8), 0.35), t.math('MULTIPLY', foam, 2.5))",
     "    bright = t.math('ADD', t.math('ADD', t.math('MULTIPLY', s, 0.9), 0.12), t.math('MULTIPLY', foam, 1.6))"),
    ("        rim = t.math('POWER', t.math('MAXIMUM', t.math('SUBTRACT', 1.0, ln.outputs['Value']), 0.0), 1.5)",
     "        rim = t.math('POWER', t.math('MAXIMUM', t.math('SUBTRACT', 1.0, ln.outputs['Value']), 0.0), 2.5)"),
    ("volume('Mist', (0.75, 0.78, 0.88), 0.05, 1.4, 0.3, 0.75, (0.6, 0.65, 0.8), 0.006)",
     "volume('Mist', (0.75, 0.78, 0.88), 0.03, 1.4, 0.3, 0.75, (0.6, 0.65, 0.8), 0.0)"),
    ("windows('Tower_Window', (0.02, 0.025, 0.035), 0.3, (1.0, 0.62, 0.3), 1.1,",
     "windows('Tower_Window', (0.02, 0.025, 0.035), 0.2, (1.0, 0.62, 0.3), 0.9,"),
])
patch('lib/camera.py', [("    glow.energy = 3.0e7", "    glow.energy = 6.0e6")])
print('ok')

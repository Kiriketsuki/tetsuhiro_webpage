# One-off patch: home tower and shrine back in frame, trees at the left edge, a darker night palette.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('lib/terrain.py', [
    ("    upper = island('Terrace_Upper_Rock', c, util.frame_point(T, fwd, left, 18.0, 14.0, z_walk + 3.0), 12.5, 16.0,",
     "    upper = island('Terrace_Upper_Rock', c, util.frame_point(T, fwd, left, 23.0, 6.0, z_walk + 3.0), 13.0, 18.0,"),
])
patch('lib/props.py', [
    ("    shrine('Terrace_Shrine', c, util.frame_point(T, fwd, left, 13.5, 9.5, zu), rot + 0.2, width=8.5, depth=6.5)",
     "    shrine('Terrace_Shrine', c, util.frame_point(T, fwd, left, 13.0, 3.5, zu), rot + 0.15, width=8.5, depth=6.5)"),
])
patch('lib/home.py', [
    ("    hp = util.frame_point(t['T'], t['fwd'], t['left'], 24.0, 16.0)",
     "    # Behind the shrine and slightly left, so the tower rises at the left edge of the frame.\n"
     "    hp = util.frame_point(t['T'], t['fwd'], t['left'], 32.0, 4.5)"),
])
patch('lib/trees.py', [
    ("""    for k, (kind, along, side, s) in enumerate([('sakura', -12.0, 4.5, 1.3), ('broadleaf', -16.0, 7.0, 1.2),
                                                ('sakura', 2.5, 6.0, 1.2), ('pine', 10.0, 18.0, 1.3),
                                                ('broadleaf', 30.0, 8.0, 1.4), ('pine', 6.0, 13.0, 1.1),
                                                ('shrub', -6.0, -2.4, 1.4), ('shrub', -1.0, -3.2, 1.3),
                                                ('cypress', 28.0, 24.0, 1.2)][:util.CFG['TERRACE_TREE_COUNT']]):""",
     """    for k, (kind, along, side, s) in enumerate([('sakura', -14.0, 2.0, 1.3), ('broadleaf', -18.0, 3.5, 1.2),
                                                ('sakura', 3.0, 3.4, 1.2), ('pine', 12.0, 8.0, 1.3),
                                                ('broadleaf', 22.0, -3.0, 1.4), ('pine', 8.0, 6.5, 1.1),
                                                ('shrub', -6.0, -3.6, 1.4), ('shrub', -1.0, -4.2, 1.3),
                                                ('cypress', 40.0, 7.0, 1.2)][:util.CFG['TERRACE_TREE_COUNT']]):"""),
])
patch('lib/materials.py', [
    ("HAZE = (0.2, 0.18, 0.33)", "HAZE = (0.12, 0.11, 0.21)"),
    ("windows('Tower_Window', (0.06, 0.06, 0.1), 0.16, (1.0, 0.6, 0.28), 0.8)",
     "windows('Tower_Window', (0.03, 0.03, 0.055), 0.16, (1.0, 0.6, 0.28), 0.8)"),
    ("windows('Tower_Curtain_Glass', (0.07, 0.08, 0.14), 0.14, (0.98, 0.7, 0.4), 0.7)",
     "windows('Tower_Curtain_Glass', (0.035, 0.04, 0.075), 0.14, (0.98, 0.7, 0.4), 0.7)"),
    ("windows('City_Block', (0.035, 0.03, 0.05), 0.35, (1.0, 0.58, 0.26), 1.1)",
     "windows('City_Block', (0.01, 0.01, 0.018), 0.3, (1.0, 0.58, 0.26), 1.3)"),
    ("textured('Tower_Stone', 'concrete_tile_facade', 4.0, (0.15, 0.15, 0.22), saturation=0.2)",
     "textured('Tower_Stone', 'concrete_tile_facade', 4.0, (0.09, 0.09, 0.14), saturation=0.2)"),
    ("textured('Tower_Concrete', 'concrete_tile_facade', 4.0, (0.28, 0.26, 0.32), saturation=0.2)",
     "textured('Tower_Concrete', 'concrete_tile_facade', 4.0, (0.18, 0.17, 0.22), saturation=0.2)"),
    ("    volume('Mist', (0.78, 0.8, 0.92), 0.35, 1.4, 0.3, 0.75, warm_under=0.0, rim_power=1.4)",
     "    volume('Mist', (0.72, 0.74, 0.88), 0.9, 1.4, 0.3, 0.75, warm_under=0.0, rim_power=1.2)"),
    ("    volume('Cloud', (0.6, 0.57, 0.74), 2.2, 1.1, 0.4, 0.62, warm_under=0.06, anisotropy=0.35)",
     "    volume('Cloud', (0.46, 0.43, 0.6), 2.2, 1.1, 0.4, 0.62, warm_under=0.08, anisotropy=0.35)"),
])
patch('lib/sky.py', [
    ("    for pos, col in ((0.38, (0.2, 0.13, 0.17)), (0.5, (0.13, 0.1, 0.19)), (0.64, (0.05, 0.045, 0.12)),\n"
     "                     (0.85, (0.018, 0.016, 0.05))):",
     "    for pos, col in ((0.38, (0.12, 0.08, 0.11)), (0.5, (0.075, 0.06, 0.12)), (0.64, (0.03, 0.028, 0.08)),\n"
     "                     (0.85, (0.01, 0.01, 0.035))):"),
])
patch('lib/camera.py', [("    moon.energy = 1.2", "    moon.energy = 0.75")])
print('ok')

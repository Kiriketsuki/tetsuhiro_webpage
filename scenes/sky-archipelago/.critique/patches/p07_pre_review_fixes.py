# One-off patch before round 1: soft mist, readable city streets and river, denser cloud sea,
# hero crowns inside the frame, and a walkway floor that sits above the grass.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('lib/materials.py', [
    ("    volume('Mist', (0.72, 0.74, 0.88), 0.6, 1.4, 0.3, 0.75, warm_under=0.0, rim_power=1.2, glow=0.25)",
     "    volume('Mist', (0.7, 0.72, 0.86), 0.5, 2.6, 0.42, 0.72, warm_under=0.0, rim_power=1.6, glow=0.05)"),
    ("windows('City_Block', (0.01, 0.01, 0.018), 0.1, (1.0, 0.58, 0.26), 1.1)",
     "windows('City_Block', (0.01, 0.01, 0.018), 0.06, (1.0, 0.58, 0.26), 1.6)"),
    ("    light = t.math('ADD', t.math('MULTIPLY', street, 0.25), t.math('MULTIPLY', t.math('MULTIPLY', lamp, street), 2.0))",
     "    light = t.math('ADD', t.math('MULTIPLY', street, 0.9), t.math('MULTIPLY', t.math('MULTIPLY', lamp, street), 3.5))"),
])
patch('lib/city.py', [("RIVER_HALF = 55.0     # Half width.", "RIVER_HALF = 95.0     # Half width.")])
patch('build.py', [
    ("CLOUD_BLOB_COUNT = 96", "CLOUD_BLOB_COUNT = 150"),
    ("HAZE_DISTANCE = 2200.0", "HAZE_DISTANCE = 3200.0"),
])
patch('lib/sky.py', [("        r = max(util.S(40), d * rnd.uniform(0.07, 0.13))",
                      "        r = max(util.S(40), d * rnd.uniform(0.1, 0.17))")])
# Hero heights keep every crown inside the frame, so massing, facade and crown can all be judged.
s = open('lib/towers.py', encoding='utf-8').read()
for old, new in (("crown='spire', w=40, h=430", "crown='spire', w=40, h=205"),
                 ("crown='lantern', w=36, h=330", "crown='lantern', w=36, h=178"),
                 ("crown='stepped', w=46, h=300", "crown='stepped', w=46, h=168"),
                 ("crown='flat_plant', w=54, h=210", "crown='flat_plant', w=54, h=132"),
                 ("crown='finials', w=40, h=370", "crown='finials', w=40, h=196"),
                 ("crown='pyramid', w=34, h=260", "crown='pyramid', w=34, h=158"),
                 ("crown='halo', w=36, h=190", "crown='halo', w=36, h=118"),
                 ("crown='mast', w=40, h=280", "crown='mast', w=40, h=150"),
                 ("crown='clock', w=40, h=240", "crown='clock', w=40, h=146"),
                 ("crown='twin_spires', w=50, h=220", "crown='twin_spires', w=50, h=150"),
                 ("crown='dome', w=40, h=350", "crown='dome', w=40, h=186"),
                 ("crown='pagoda', w=36, h=170", "crown='pagoda', w=36, h=112")):
    assert old in s, old
    s = s.replace(old, new)
open('lib/towers.py', 'w', encoding='utf-8', newline='\n').write(s)
patch('lib/props.py', [
    ("    zf = z + 0.14\n    # The railing runs", "    zf = z + 0.45\n    # The railing runs"),
    ("def floor_slab(name, collection, outline_pts, z, thickness=0.35):", "def floor_slab(name, collection, outline_pts, z, thickness=0.7):"),
])
print('ok')

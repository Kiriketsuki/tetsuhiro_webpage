# One-off patch: visible clouds, darker city blocks, no trees in the lake, slimmer hero towers.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('lib/materials.py', [
    ("def volume(name, colour, density, scale, lo, hi, emit_colour=(0, 0, 0), emit=0.0, anisotropy=0.2, sphere=True):",
     "def volume(name, colour, density, scale, lo, hi, emit_colour=(0, 0, 0), emit=0.0, anisotropy=0.2, sphere=True,\n           rim_power=1.0):"),
    ("        rim = t.math('POWER', t.math('MAXIMUM', t.math('SUBTRACT', 1.0, ln.outputs['Value']), 0.0), 2.5)",
     "        rim = t.math('POWER', t.math('MAXIMUM', t.math('SUBTRACT', 1.0, ln.outputs['Value']), 0.0), rim_power)"),
    ("volume('Mist', (0.75, 0.78, 0.88), 0.03, 1.4, 0.3, 0.75, (0.6, 0.65, 0.8), 0.0)",
     "volume('Mist', (0.75, 0.78, 0.88), 0.12, 1.4, 0.3, 0.75, (0.6, 0.65, 0.8), 0.0, rim_power=1.6)"),
    ("volume('Cloud', (0.5, 0.5, 0.64), 0.35, 0.9, 0.3, 0.65, (1.0, 0.6, 0.35), 0.0, 0.35)",
     "volume('Cloud', (0.58, 0.56, 0.72), 2.2, 1.1, 0.4, 0.62, (1.0, 0.6, 0.35), 0.0, 0.35, rim_power=1.0)"),
    ("volume('Cloud_Dark', (0.2, 0.2, 0.28), 0.25, 0.8, 0.3, 0.65, (0, 0, 0), 0.0, 0.2)",
     "volume('Cloud_Dark', (0.24, 0.24, 0.33), 1.4, 0.9, 0.38, 0.62, (0, 0, 0), 0.0, 0.2, rim_power=1.0)"),
    ("windows('City_Block', (0.02, 0.02, 0.03), 0.35, (1.0, 0.6, 0.28), 0.6,",
     "windows('City_Block', (0.006, 0.006, 0.009), 0.35, (1.0, 0.6, 0.28), 1.2,"),
    ("    a = t.math('MULTIPLY', t.math('SINE', t.math('MULTIPLY', sep.outputs['Y'], 3.14159)), 0.16)",
     "    a = t.math('MULTIPLY', t.math('SINE', t.math('MULTIPLY', sep.outputs['Y'], 3.14159)), 0.09)"),
    # Slate rock: take most of the brown out of the photo texture.
    ("    col, rough, nor = triplanar(t, 'cliff_side', 6.0)\n    dark = t.mix(1.0, col, (0.42, 0.42, 0.5), 'MULTIPLY')",
     "    col, rough, nor = triplanar(t, 'cliff_side', 6.0)\n    hsv = t.n('ShaderNodeHueSaturation', Saturation=0.3, Value=0.9)\n    t.l(col, hsv.inputs['Color'])\n    dark = t.mix(1.0, hsv.outputs['Color'], (0.4, 0.42, 0.52), 'MULTIPLY')"),
])
patch('lib/camera.py', [("    moon.energy = 0.35", "    moon.energy = 1.2")])
patch('build.py', [("CLOUD_BLOB_COUNT = 64", "CLOUD_BLOB_COUNT = 96"), ("RAIN_DROP_COUNT = 5000", "RAIN_DROP_COUNT = 3500")])
patch('lib/sky.py', [("        r = max(util.S(40), d * rnd.uniform(0.09, 0.16))", "        r = max(util.S(40), d * rnd.uniform(0.07, 0.13))")])
patch('lib/terrain.py', [
    ("    o = island('Terrace_Cliff', c, util.frame_point(T, fwd, left, 4.0, 16.0, z_walk), 28.0, 40.0, 150.0,",
     "    o = island('Terrace_Cliff', c, util.frame_point(T, fwd, left, 4.0, 23.0, z_walk), 28.0, 40.0, 150.0,"),
    ("    o = island('Hero_Tower_Island', c, p, util.S(95), util.S(70), util.S(150),",
     "    o = island('Hero_Tower_Island', c, p, util.S(120), util.S(85), util.S(150),"),
])
patch('lib/trees.py', [
    ("        if hit is None or hit[1].z < 0.75:\n            continue",
     "        # Skip steep ground, and ground under the lake surface.\n        if hit is None or hit[1].z < 0.75 or (info.get('lake') and hit[0].z < centre.z - 0.2):\n            continue"),
])
patch('lib/towers.py', [
    ("        d['w'], d['h'] = util.S(d['w']), util.S(d['h'])",
     "        # Slim footprints keep the cluster reading as separate spires at this distance.\n        d['w'], d['h'] = util.S(d['w'] * 0.62), util.S(d['h'])"),
])
print('ok')

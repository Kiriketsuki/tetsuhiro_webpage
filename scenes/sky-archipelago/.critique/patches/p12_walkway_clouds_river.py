# One-off patch: the walkway reaches the upper rock, billowing clouds, a river the city does not hide.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:90])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('lib/props.py', [
    ("    edge = [p - left * 0.4 for p in rail]\n    far_left = [p + left * 24.0 for p in rail]\n"
     "    floor_slab('Terrace_Walkway', c, [(p.x, p.y) for p in edge + far_left[::-1]], zf)",
     "    edge = [p - left * 0.4 for p in rail]\n    far_left = [p + left * 24.0 for p in rail]\n"
     "    # Past the railing's end the paving runs on to the foot of the upper rock.\n"
     "    edge.append(edge[-1] + fwd * 16.0)\n    far_left.append(far_left[-1] + fwd * 16.0)\n"
     "    floor_slab('Terrace_Walkway', c, [(p.x, p.y) for p in edge + far_left[::-1]], zf)"),
])
patch('lib/materials.py', [
    ("    volume('Cloud', (0.36, 0.34, 0.5), 2.6, 2.4, 0.46, 0.6, warm_under=0.12, anisotropy=0.35, rim_power=0.8, top_lit=0.06)",
     "    volume('Cloud', (0.38, 0.36, 0.52), 1.3, 2.2, 0.42, 0.66, warm_under=0.14, anisotropy=0.35, rim_power=1.3, top_lit=0.08)"),
])
patch('lib/sky.py', [
    ("        r = max(util.S(40), d * rnd.uniform(0.1, 0.17))\n"
     "        _blob(f'Cloud_Sea.{made:03d}', 'Cloud', p, (r, r * rnd.uniform(0.8, 1.4), r * rnd.uniform(0.3, 0.5)), c)",
     "        r = max(util.S(30), d * rnd.uniform(0.06, 0.11))\n"
     "        # Taller billows read as volume, with lit tops and shaded bases.\n"
     "        _blob(f'Cloud_Sea.{made:03d}', 'Cloud', p, (r, r * rnd.uniform(0.8, 1.3), r * rnd.uniform(0.45, 0.7)), c)"),
])
patch('build.py', [("CLOUD_BLOB_COUNT = 150", "CLOUD_BLOB_COUNT = 240")])
patch('lib/city.py', [
    ("RIVER_HALF = 95.0     # Half width.", "RIVER_HALF = 140.0    # Half width."),
    ("    tall = math('ADD', math('MULTIPLY', math('POWER', vsep.outputs['Z'], 3.0), util.S(140)), util.S(8))",
     "    tall = math('ADD', math('MULTIPLY', math('POWER', vsep.outputs['Z'], 3.0), util.S(60)), util.S(6))"),
])
print('ok')

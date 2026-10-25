# One-off patch: clear the torii, calm the ground city lights, glowing mist.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('lib/trees.py', [
    ("[('sakura', -14.0, 2.0, 1.3), ('broadleaf', -18.0, 3.5, 1.2),",
     "[('sakura', -9.0, 5.2, 0.9), ('shrub', -12.0, 3.4, 1.2),"),
])
patch('lib/materials.py', [
    ("windows('City_Block', (0.01, 0.01, 0.018), 0.3, (1.0, 0.58, 0.26), 1.3)",
     "windows('City_Block', (0.01, 0.01, 0.018), 0.1, (1.0, 0.58, 0.26), 1.1)"),
    ("def volume(name, colour, density, scale, lo, hi, warm_under=0.0, anisotropy=0.2, rim_power=1.0):",
     "def volume(name, colour, density, scale, lo, hi, warm_under=0.0, anisotropy=0.2, rim_power=1.0, glow=0.0):"),
    ("    if warm_under:\n        sep = t.n('ShaderNodeSeparateXYZ')",
     "    if glow:\n"
     "        # Mist catches the light of the falls: a faint pale glow wherever it is dense.\n"
     "        v.inputs['Emission Color'].default_value = (0.7, 0.72, 0.88, 1)\n"
     "        t.l(t.math('MULTIPLY', dens, glow), v.inputs['Emission Strength'])\n"
     "    if warm_under:\n        sep = t.n('ShaderNodeSeparateXYZ')"),
    ("    volume('Mist', (0.72, 0.74, 0.88), 0.9, 1.4, 0.3, 0.75, warm_under=0.0, rim_power=1.2)",
     "    volume('Mist', (0.72, 0.74, 0.88), 0.6, 1.4, 0.3, 0.75, warm_under=0.0, rim_power=1.2, glow=0.25)"),
    ("    light = t.math('ADD', t.math('MULTIPLY', street, 0.5), t.math('MULTIPLY', t.math('MULTIPLY', lamp, street), 2.5))",
     "    light = t.math('ADD', t.math('MULTIPLY', street, 0.25), t.math('MULTIPLY', t.math('MULTIPLY', lamp, street), 2.0))"),
])
print('ok')

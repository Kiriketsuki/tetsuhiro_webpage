# One-off patch: clouds with cool lit tops and warm undersides, a brighter ground city with a readable river.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:90])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('lib/materials.py', [
    ("def volume(name, colour, density, scale, lo, hi, warm_under=0.0, anisotropy=0.2, rim_power=1.0, glow=0.0):",
     "def volume(name, colour, density, scale, lo, hi, warm_under=0.0, anisotropy=0.2, rim_power=1.0, glow=0.0, top_lit=0.0):"),
    ("""    if warm_under:
        sep = t.n('ShaderNodeSeparateXYZ')
        t.l(tc.outputs['Object'], sep.inputs[0])
        under = t.range(sep.outputs['Z'], 0.2, -0.8)
        v.inputs['Emission Color'].default_value = (1.0, 0.55, 0.28, 1)
        t.l(t.math('MULTIPLY', t.math('MULTIPLY', under, dens), warm_under), v.inputs['Emission Strength'])""",
     """    if warm_under or top_lit:
        # Moonlit tops glow cool, and undersides take the warm city glow from below.
        sep = t.n('ShaderNodeSeparateXYZ')
        t.l(tc.outputs['Object'], sep.inputs[0])
        under = t.range(sep.outputs['Z'], 0.2, -0.8)
        top = t.range(sep.outputs['Z'], -0.1, 0.7)
        col = t.mix(top, (1.0, 0.55, 0.28), (0.62, 0.64, 0.9))
        t.l(col, v.inputs['Emission Color'])
        amount = t.math('ADD', t.math('MULTIPLY', under, warm_under), t.math('MULTIPLY', top, top_lit))
        t.l(t.math('MULTIPLY', amount, dens), v.inputs['Emission Strength'])"""),
    ("    volume('Cloud', (0.4, 0.38, 0.55), 2.6, 2.4, 0.46, 0.6, warm_under=0.1, anisotropy=0.35, rim_power=0.8)",
     "    volume('Cloud', (0.36, 0.34, 0.5), 2.6, 2.4, 0.46, 0.6, warm_under=0.12, anisotropy=0.35, rim_power=0.8, top_lit=0.06)"),
    ("windows('City_Block', (0.01, 0.01, 0.018), 0.12, (1.0, 0.58, 0.26), 1.8, haze=False)",
     "windows('City_Block', (0.01, 0.01, 0.018), 0.22, (1.0, 0.58, 0.26), 2.4, haze=False)"),
    ("    light = t.math('ADD', t.math('MULTIPLY', street, 1.4), t.math('MULTIPLY', t.math('MULTIPLY', lamp, street), 4.5))",
     "    light = t.math('ADD', t.math('MULTIPLY', street, 2.6), t.math('MULTIPLY', t.math('MULTIPLY', lamp, street), 7.0))"),
    ("    glow('City_Embankment', (1.0, 0.62, 0.3), 3.5)", "    glow('City_Embankment', (1.0, 0.62, 0.3), 9.0)"),
])
patch('lib/city.py', [("                util.box_between(emb, prev, q, util.S(7))", "                util.box_between(emb, prev, q, util.S(14))")])
print('ok')

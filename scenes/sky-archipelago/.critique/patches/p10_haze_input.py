# One-off patch: a Haze input on the paint group, so the ground city can opt out of the distance wash.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:90])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('lib/materials.py', [
    ("                                ('Granulation', 'NodeSocketFloat', 1.0)):",
     "                                ('Granulation', 'NodeSocketFloat', 1.0), ('Haze', 'NodeSocketFloat', 1.0)):"),
    ("    col = t.mix(t.math('MULTIPLY', f, 0.85), col, HAZE)",
     "    col = t.mix(t.math('MULTIPLY', t.math('MULTIPLY', f, 0.85), gi.outputs['Haze']), col, HAZE)"),
    ("def paint(t, colour, normal=None, wet=0.0, gloss=0.25, granulation=1.0):",
     "def paint(t, colour, normal=None, wet=0.0, gloss=0.25, granulation=1.0, haze=1.0):"),
    ("    g.inputs['Granulation'].default_value = granulation\n",
     "    g.inputs['Granulation'].default_value = granulation\n    g.inputs['Haze'].default_value = haze\n"),
    ("    t.l(paint(t, glass, granulation=0.5), add.inputs[0])",
     "    t.l(paint(t, glass, granulation=0.5, haze=1.0 if haze else 0.15), add.inputs[0])"),
    ("    t.l(paint(t, (0.04, 0.05, 0.12), wet=1.0, gloss=0.1, granulation=0.4), add.inputs[0])",
     "    t.l(paint(t, (0.04, 0.05, 0.12), wet=1.0, gloss=0.1, granulation=0.4, haze=0.15), add.inputs[0])"),
    ("    t.l(paint(t, (0.04, 0.035, 0.06)), add.inputs[0])",
     "    t.l(paint(t, (0.04, 0.035, 0.06), haze=0.15), add.inputs[0])"),
])
print('ok')

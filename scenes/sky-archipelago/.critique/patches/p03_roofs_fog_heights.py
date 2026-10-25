# One-off patch: no windows on roofs, world fog for depth, shorter far towers, denser mist.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:80])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('lib/materials.py', [
    ("    lit = t.math('LESS_THAN', wn.outputs['Value'], lit_share)",
     "    # Roofs and floors carry no windows: only faces that look sideways can be lit.\n"
     "    wall = t.math('LESS_THAN', t.math('ABSOLUTE', nsep.outputs['Z']), 0.5)\n"
     "    lit = t.math('MULTIPLY', t.math('LESS_THAN', wn.outputs['Value'], lit_share), wall)"),
    ("windows('Tower_Window', (0.02, 0.025, 0.035), 0.2, (1.0, 0.62, 0.3), 0.9,",
     "windows('Tower_Window', (0.02, 0.025, 0.035), 0.16, (1.0, 0.62, 0.3), 0.8,"),
    ("volume('Mist', (0.75, 0.78, 0.88), 0.12, 1.4, 0.3, 0.75, (0.6, 0.65, 0.8), 0.0, rim_power=1.6)",
     "volume('Mist', (0.78, 0.8, 0.9), 0.35, 1.4, 0.3, 0.75, (0.6, 0.65, 0.85), 0.002, rim_power=1.4)"),
])
patch('lib/sky.py', [
    ("""    bg = t.n('ShaderNodeBackground', Strength=1.0)
    t.l(col, bg.inputs['Color'])
    out = t.n('ShaderNodeOutputWorld')
    t.l(bg.outputs[0], out.inputs['Surface'])""",
     """    bg = t.n('ShaderNodeBackground', Strength=1.0)
    t.l(col, bg.inputs['Color'])
    out = t.n('ShaderNodeOutputWorld')
    t.l(bg.outputs[0], out.inputs['Surface'])
    # Thin night air: far planes lose contrast and drift toward blue, as in the reference.
    fog = t.n('ShaderNodeVolumePrincipled', Density=util.CFG['AIR_FOG_DENSITY'], Anisotropy=0.3)
    fog.inputs['Color'].default_value = (0.5, 0.56, 0.85, 1)
    t.l(fog.outputs[0], out.inputs['Volume'])"""),
])
patch('build.py', [
    ("CLOUD_BLOB_COUNT = 96", "CLOUD_BLOB_COUNT = 96\nAIR_FOG_DENSITY = 0.00028          # Night air haze per metre. Sets how fast far islands fade."),
])
patch('lib/towers.py', [
    ("            h = info['depth'] * rnd.uniform(1.0, 3.2)", "            h = info['depth'] * rnd.uniform(0.6, 1.7)"),
])
print('ok')

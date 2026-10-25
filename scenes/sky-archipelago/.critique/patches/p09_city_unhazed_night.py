# One-off patch: the ground city keeps its warm glow through the haze, and clouds and sky return to night values.
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def patch(p, R):
    s = open(p, encoding='utf-8').read()
    for a, b in R:
        assert a in s, (p, a[:90])
        s = s.replace(a, b)
    open(p, 'w', encoding='utf-8', newline='\n').write(s)


patch('lib/materials.py', [
    ("def windows(name, glass, lit_share, warm, strength):",
     "def windows(name, glass, lit_share, warm, strength, haze=True):"),
    ("    keep = t.math('EXPONENT', t.math('DIVIDE', cam.outputs['View Distance'], -util.CFG.get('HAZE_DISTANCE', 2200.0)))",
     "    # The ground city glows through the haze, so its windows skip the fade.\n"
     "    keep = t.math('EXPONENT', t.math('DIVIDE', cam.outputs['View Distance'],\n"
     "                                     -util.CFG.get('HAZE_DISTANCE', 2200.0) * (1.0 if haze else 1e6)))"),
    ("windows('City_Block', (0.01, 0.01, 0.018), 0.12, (1.0, 0.58, 0.26), 1.8)",
     "windows('City_Block', (0.01, 0.01, 0.018), 0.12, (1.0, 0.58, 0.26), 1.8, haze=False)"),
    ("    volume('Cloud', (0.5, 0.47, 0.64), 2.6, 2.4, 0.46, 0.6, warm_under=0.3, anisotropy=0.35, rim_power=0.8)",
     "    volume('Cloud', (0.4, 0.38, 0.55), 2.6, 2.4, 0.46, 0.6, warm_under=0.1, anisotropy=0.35, rim_power=0.8)"),
])
patch('lib/sky.py', [
    ("    for pos, col in ((0.4, (0.24, 0.15, 0.17)), (0.5, (0.13, 0.09, 0.17)), (0.6, (0.05, 0.042, 0.11)),\n"
     "                     (0.78, (0.012, 0.012, 0.045))):",
     "    for pos, col in ((0.4, (0.15, 0.095, 0.12)), (0.5, (0.085, 0.065, 0.13)), (0.6, (0.035, 0.03, 0.085)),\n"
     "                     (0.78, (0.01, 0.01, 0.035))):"),
])
patch('lib/camera.py', [("    glow.energy = 2.4e7", "    glow.energy = 1.2e7")])
print('ok')

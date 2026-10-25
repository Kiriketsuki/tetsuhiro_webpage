"""Render the chosen sheltered atelier and integrated island without saving settings."""
from pathlib import Path
import sys
import json
import time
import bpy

ROOT = Path(__file__).resolve().parent
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
preview = '--preview' in args
scene = bpy.data.scenes['UA_B_Atelier_Sheltered']
report = []
for shot, name, size in [('house', 'SS_UA_House', (1600, 1600)), ('overview', 'SS_UA_Overview', (1800, 1400)),
                         ('garden', 'SS_SH_Garden', (1800, 1200))]:
    scene.camera = bpy.data.objects[name]
    scene.render.resolution_x = 950 if preview else size[0]
    scene.render.resolution_y = round(scene.render.resolution_x * size[1] / size[0])
    scene.eevee.taa_render_samples = 32 if preview else 96
    scene.render.filepath = str(ROOT / 'renders' / ('Sheltered_' + shot + ('_preview' if preview else '') + '.png'))
    start = time.perf_counter(); bpy.ops.render.render(write_still=True, scene=scene.name)
    report.append({'path': scene.render.filepath, 'seconds': round(time.perf_counter() - start, 2)})
    print('SHELTERED_RENDER_COMPLETE ' + json.dumps(report[-1]), flush=True)
(ROOT / 'renders' / ('sheltered_preview_times.json' if preview else 'sheltered_times.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')

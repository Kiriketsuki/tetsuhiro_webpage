"""Pond/patina review cameras, with no changes saved to the blend."""
from pathlib import Path
import json
import sys
import time
import bpy

ROOT = Path(__file__).resolve().parent
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
preview = '--preview' in args
scene = bpy.data.scenes['UA_B_Atelier_PondPatina']; report = []
for shot, cam, size in [('pond', 'SS_PT_Pond', (1800, 1300)), ('garden', 'SS_SH_Garden', (1800, 1200)),
                        ('house', 'SS_UA_House', (1600, 1600)), ('overview', 'SS_UA_Overview', (1800, 1400))]:
    if '--pond-only' in args and shot != 'pond': continue
    scene.camera = bpy.data.objects[cam]
    scene.render.resolution_x = 1000 if preview else size[0]
    scene.render.resolution_y = round(scene.render.resolution_x * size[1] / size[0])
    scene.eevee.taa_render_samples = 32 if preview else 96
    scene.render.filepath = str(ROOT / 'renders' / ('Patina_' + shot + ('_preview' if preview else '') + '.png'))
    start = time.perf_counter(); bpy.ops.render.render(write_still=True, scene=scene.name)
    report.append({'image': scene.render.filepath, 'seconds': round(time.perf_counter() - start, 2)})
    print('PATINA_RENDER_COMPLETE ' + json.dumps(report[-1]), flush=True)
(ROOT / 'renders' / ('patina_preview_times.json' if preview else 'patina_times.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')

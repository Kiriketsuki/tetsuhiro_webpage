"""Matching cameras for the faceted refinement. Saved scene is unchanged."""
from pathlib import Path
import json
import sys
import time
import bpy

ROOT = Path(__file__).resolve().parent
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
preview = '--preview' in args
scene = bpy.data.scenes['LP_Faceted_Sanctuary']
scene.render.use_freestyle = False
report = []
for name, cam, size in [('overview', 'LP_SS_Camera_Overview', (1800, 1400)),
                        ('workshop', 'LP_SS_Camera_Workshop', (1800, 1200))]:
    if '--overview' in args and name != 'overview':
        continue
    scene.camera = bpy.data.objects[cam]
    scene.render.resolution_x = 1000 if preview else size[0]
    scene.render.resolution_y = round(scene.render.resolution_x * size[1] / size[0])
    scene.eevee.taa_render_samples = 32 if preview else 96
    scene.render.filepath = str(ROOT / 'renders' / (name + ('_preview' if preview else '') + '.png'))
    started = time.perf_counter()
    bpy.ops.render.render(write_still=True, scene=scene.name)
    report.append({'image': scene.render.filepath, 'seconds': round(time.perf_counter() - started, 2)})
    print('FACETED_RENDER_COMPLETE ' + json.dumps(report[-1]), flush=True)
(ROOT / 'renders' / ('timings_preview.json' if preview else 'timings.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')

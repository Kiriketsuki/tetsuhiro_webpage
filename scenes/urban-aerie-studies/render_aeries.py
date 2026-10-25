"""Render all three house studies with identical cameras and lighting."""
from pathlib import Path
import json
import sys
import time
import bpy

ROOT = Path(__file__).resolve().parent
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
preview = '--preview' in args
detail_only = '--house' in args
overview_only = '--overview' in args
report = []
for label in ('A_Townhouse', 'B_Atelier', 'C_Cottage'):
    scene = bpy.data.scenes['UA_' + label]
    for shot, cam, size in [('overview', 'SS_UA_Overview', (1800, 1400)), ('house', 'SS_UA_House', (1500, 1500))]:
        if (detail_only and shot != 'house') or (overview_only and shot != 'overview'):
            continue
        scene.camera = bpy.data.objects[cam]
        scene.render.resolution_x = 900 if preview else size[0]
        scene.render.resolution_y = round(scene.render.resolution_x * size[1] / size[0])
        scene.eevee.taa_render_samples = 32 if preview else 96
        scene.render.filepath = str(ROOT / 'renders' / (label + '_' + shot + ('_preview' if preview else '') + '.png'))
        start = time.perf_counter()
        bpy.ops.render.render(write_still=True, scene=scene.name)
        report.append({'scene': scene.name, 'shot': shot, 'image': scene.render.filepath,
                       'seconds': round(time.perf_counter() - start, 2)})
        print('AERIE_RENDER_COMPLETE ' + json.dumps(report[-1]), flush=True)
(ROOT / 'renders' / ('preview_timings.json' if preview else 'timings.json')).write_text(json.dumps(report, indent=2), encoding='utf-8')

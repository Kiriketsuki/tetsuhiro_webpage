from pathlib import Path
import bpy
import sys
import time
import json

ROOT=Path(__file__).resolve().parent
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
preview='--preview' in args
scene=bpy.data.scenes['Sanctuary_Handdrawn_Cinematic']
views=[('overview','SS_HD_Overview',(2000,1556)),('workshop','SS_HD_Workshop_Detail',(2000,1400)),('cliff','SS_HD_Cliff_Detail',(1800,1400))]
if '--overview' in args:views=views[:1]
if '--workshop' in args:views=views[1:2]
times={}
for name,cam,res in views:
    scene.camera=bpy.data.objects[cam]
    scene.render.resolution_x,scene.render.resolution_y=(1000,round(res[1]*1000/res[0])) if preview else res
    scene.eevee.taa_render_samples=32 if preview else 128
    path=ROOT/'renders'/(name+('_preview' if preview else '')+'.png');scene.render.filepath=str(path)
    start=time.perf_counter();bpy.ops.render.render(write_still=True,scene=scene.name)
    times[name]={'seconds':round(time.perf_counter()-start,2),'path':str(path)}
    print('HANDDRAWN_RENDER_COMPLETE '+json.dumps(times[name]),flush=True)
(ROOT/'renders'/('render_times_preview.json' if preview else 'render_times.json')).write_text(json.dumps(times,indent=2),encoding='utf-8')

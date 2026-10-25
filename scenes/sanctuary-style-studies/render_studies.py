"""Render the same two cameras in each study, without changing the saved file."""
from pathlib import Path
import bpy
import json
import sys
import time

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'renders'
OUT.mkdir(exist_ok=True)
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
preview='--preview' in args
detail='--detail' in args
only_a='--only-a' in args
only_b='--only-b' in args
times={}
for style,label in [('A','Cinematic'),('B','LowPoly')]:
    if (only_a and style!='A') or (only_b and style!='B'): continue
    scene=bpy.data.scenes['SS_Study_'+style+'_'+label]
    scene.camera=bpy.data.objects['SS_Camera_Workshop' if detail else 'SS_Camera_Overview']
    scene.render.resolution_x,scene.render.resolution_y=(1000,780) if preview else ((1800,1200) if detail else (1800,1400))
    scene.eevee.taa_render_samples=24 if preview else 96
    suffix='_detail' if detail else ('_preview' if preview else '')
    scene.render.filepath=str(OUT/(style+'_'+label.lower()+suffix+'.png'))
    start=time.perf_counter()
    bpy.ops.render.render(write_still=True,scene=scene.name)
    times[style]={'render_seconds':round(time.perf_counter()-start,2),'path':scene.render.filepath}
    print('STUDY_RENDER_COMPLETE '+json.dumps(times[style]),flush=True)
(OUT/('render_times'+('_detail' if detail else '_preview' if preview else '')+'.json')).write_text(json.dumps(times,indent=2),encoding='utf-8')

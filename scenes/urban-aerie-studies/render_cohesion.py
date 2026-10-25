from pathlib import Path
import bpy
import sys
import time
import json

ROOT=Path(__file__).resolve().parent
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
preview='--preview' in args; contacts='--contacts' in args
scene=bpy.data.scenes['UA_B_Atelier_Cohesion']; report=[]
shots=[('pond','SS_PT_Pond',(1800,1300)),('garden','SS_SH_Garden',(1800,1200)),('house','SS_UA_House',(1600,1600)),('overview','SS_UA_Overview',(1800,1400)),
       ('pond_waterline','SS_CO_Pond_Waterline',(1600,1000)),('stream_bank','SS_CO_Stream_Bank',(1600,1000)),
       ('bridge_contacts','SS_CO_Bridge_Contacts',(1600,1000)),('house_contacts','SS_CO_House_Contacts',(1600,1000))]
for shot,cam,size in shots:
    if contacts and shot not in ('pond_waterline','stream_bank','bridge_contacts','house_contacts'): continue
    scene.camera=bpy.data.objects[cam]
    scene.render.resolution_x=950 if preview else size[0];scene.render.resolution_y=round(scene.render.resolution_x*size[1]/size[0])
    scene.eevee.taa_render_samples=32 if preview else 96
    scene.render.filepath=str(ROOT/'renders'/('Cohesion_'+shot+('_preview' if preview else '')+'.png'))
    start=time.perf_counter();bpy.ops.render.render(write_still=True,scene=scene.name)
    report.append({'shot':shot,'image':scene.render.filepath,'seconds':round(time.perf_counter()-start,2)})
    print('COHESION_RENDER_COMPLETE '+json.dumps(report[-1]),flush=True)
(ROOT/'renders'/('cohesion_preview_times.json' if preview else 'cohesion_times.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')

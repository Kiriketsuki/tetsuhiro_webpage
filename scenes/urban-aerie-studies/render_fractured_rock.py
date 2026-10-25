from pathlib import Path
import bpy,sys,time,json
ROOT=Path(__file__).resolve().parent
preview='--preview' in sys.argv
scene=bpy.data.scenes['UA_B_Atelier_FracturedRock'];report=[]
shots=[('front_profile','SS_FR_Front',(1800,1400)),('side_profile','SS_FR_Side',(1800,1400)),
       ('cliff','SS_RF_Cliff',(1800,1400)),('overview','SS_UA_Overview',(1800,1400)),
       ('garden','SS_SH_Garden',(1800,1200)),('waterline','SS_CO_Pond_Waterline',(1600,1000))]
for shot,cam,size in shots:
    scene.camera=bpy.data.objects[cam]
    scene.render.resolution_x=1100 if preview else size[0]
    scene.render.resolution_y=round(scene.render.resolution_x*size[1]/size[0])
    scene.eevee.taa_render_samples=32 if preview else 96
    scene.render.filepath=str(ROOT/'renders'/('FracturedRock_'+shot+('_preview' if preview else '')+'.png'))
    start=time.perf_counter();bpy.ops.render.render(write_still=True,scene=scene.name)
    item={'shot':shot,'seconds':round(time.perf_counter()-start,2),'image':scene.render.filepath};report.append(item)
    print('FRACTURED_ROCK_RENDER '+json.dumps(item),flush=True)
(ROOT/'renders'/('fractured_rock_preview_times.json' if preview else 'fractured_rock_times.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')

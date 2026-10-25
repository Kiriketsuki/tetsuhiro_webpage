from pathlib import Path
import bpy,sys,time,json
ROOT=Path(__file__).resolve().parent
preview='--preview' in sys.argv
scene=bpy.data.scenes['UA_B_Atelier_BrokenCliff'];report=[]
shots=[('front_profile','SS_BC_Front',(1800,1400)),('side_profile','SS_BC_Side',(1800,1400)),
       ('cliff','SS_RF_Cliff',(1800,1400)),('overview','SS_UA_Overview',(1800,1400)),
       ('garden','SS_SH_Garden',(1800,1200)),('waterline','SS_CO_Pond_Waterline',(1600,1000))]
for shot,cam,size in shots:
    scene.camera=bpy.data.objects[cam]
    scene.render.resolution_x=1100 if preview else size[0]
    scene.render.resolution_y=round(scene.render.resolution_x*size[1]/size[0])
    scene.eevee.taa_render_samples=32 if preview else 96
    scene.render.filepath=str(ROOT/'renders'/('BrokenCliff_'+shot+('_preview' if preview else '')+'.png'))
    start=time.perf_counter();bpy.ops.render.render(write_still=True,scene=scene.name)
    item={'shot':shot,'seconds':round(time.perf_counter()-start,2),'image':scene.render.filepath};report.append(item)
    print('BROKEN_CLIFF_RENDER '+json.dumps(item),flush=True)
(ROOT/'renders'/('broken_cliff_preview_times.json' if preview else 'broken_cliff_times.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')

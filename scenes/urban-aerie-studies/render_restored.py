from pathlib import Path
import bpy,sys,json,time
ROOT=Path(__file__).resolve().parent
preview='--preview' in sys.argv
jagged='--jagged' in sys.argv
scene=bpy.data.scenes['UA_B_Atelier_Jagged' if jagged else 'UA_B_Atelier_FacetedRestored'];report=[]
shots=[('garden','SS_SH_Garden',(1800,1200)),('overview','SS_UA_Overview',(1800,1400)),('cliff','SS_RF_Cliff',(1600,1200)),('pond','SS_PT_Pond',(1800,1300)),('waterline','SS_CO_Pond_Waterline',(1600,1000)),('stream','SS_CO_Stream_Bank',(1600,1000))]
if jagged:shots.append(('surface','SS_JG_Surface',(1600,1100)))
for shot,camera,size in shots:
    scene.camera=bpy.data.objects[camera]
    scene.render.resolution_x=1100 if preview else size[0]
    scene.render.resolution_y=round(scene.render.resolution_x*size[1]/size[0])
    scene.eevee.taa_render_samples=32 if preview else 96
    scene.render.filepath=str(ROOT/'renders'/(('Jagged_' if jagged else 'Restored_')+shot+('_preview' if preview else '')+'.png'))
    start=time.perf_counter();bpy.ops.render.render(write_still=True,scene=scene.name)
    report.append({'shot':shot,'image':scene.render.filepath,'seconds':round(time.perf_counter()-start,2)})
    print('RESTORED_RENDER_COMPLETE '+json.dumps(report[-1]),flush=True)

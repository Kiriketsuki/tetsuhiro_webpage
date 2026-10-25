"""Cozy interiors: a coherent project workshop, lounge and top-floor bedroom inside the urban aerie house.

Run it inside the open island_b_rolling_rim.blend with scene Island_B_Rolling_Rim active, then call
save(). The build copies the scene and swaps in collection copies that leave out the old room props.
Objects stay shared, so the source scene keeps every object, and the fingerprints prove it."""
from pathlib import Path
import json,runpy
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
OPT=runpy.run_path(str(ROOT/'island_profile_options.py'))
KIT=runpy.run_path(str(ROOT/'cozy_kit.py'))
ROOMS=runpy.run_path(str(ROOT/'cozy_rooms.py'))
Kit,palette,light=KIT['Kit'],KIT['palette'],KIT['SS']['light']
SOURCE='Island_B_Rolling_Rim'
SCENE='Island_B_Cozy_Interiors'
OUTPUT=ROOT/'island_b_cozy_interiors.blend'
REPORT=ROOT/'island_b_cozy_interiors_report.json'
# The old box props, the old bedroom rug and lamp, and the old bedside light leave the new scene.
DROP=('DR_GE_MH_RA_JG_RF_CO_PT_SH_SS_UA_B_Atelier_Room_Life','SS_NA_Bedroom_Comforts','SS_NA_Bedside_Lamp')
CORK='SS_NA_Workshop_Project_Corkboard'
# Probe point (x, y), floor guess, front probe x, and the expected inner walls (L, R, F, B).
PROBES={'workshop':((-5.0,2.85),1.0,-6.5,(-7.18,-2.75,.59,4.93)),
        'living':((-5.6,3.15),4.15,-5.6,(-7.98,-3.75,1.17,5.18)),
        'bedroom':((-5.3,3.45),7.3,-5.3,(-6.93,-3.5,1.62,5.23))}
FLOOR_T=.02;CEILING_T=.015;RUG_T=.012
CONTACT_TOLERANCE=.012

def without(scene,drop):
    """Swaps each collection on the way to a dropped object for a shallow copy that leaves it out."""
    vl=scene.view_layers[0];states={};renames={}
    def snap(layer,path):
        states[path]=(layer.exclude,layer.hide_viewport,layer.holdout,layer.indirect_only)
        for c in layer.children:snap(c,path+(c.collection.name,))
    snap(vl.layer_collection,())
    def visit(coll):
        kids=[(c,visit(c)) for c in coll.children]
        if not any(o.name in drop for o in coll.objects) and not any(r for _,r in kids):return None
        new=bpy.data.collections.new('CI_'+coll.name);renames[new.name]=coll.name
        new.hide_render,new.hide_viewport,new.hide_select=coll.hide_render,coll.hide_viewport,coll.hide_select
        for o in coll.objects:
            if o.name not in drop:new.objects.link(o)
        for c,r in kids:new.children.link(r or c)
        return new
    for c in list(scene.collection.children):
        r=visit(c)
        if r:scene.collection.children.unlink(c);scene.collection.children.link(r)
    def restore(layer,path):
        s=states.get(path)
        if s and path:layer.exclude,layer.hide_viewport,layer.holdout,layer.indirect_only=s
        for c in layer.children:restore(c,path+(renames.get(c.collection.name,c.collection.name),))
    restore(vl.layer_collection,())
    return sorted(renames)

def depsgraph(scene):
    """Returns the evaluated depsgraph of this scene, whatever scene the window shows."""
    vl=scene.view_layers[0]
    with bpy.context.temp_override(scene=scene,view_layer=vl):
        vl.update();return bpy.context.evaluated_depsgraph_get()

def measure(scene):
    """Reads each room box from the house geometry, so the layout follows the real walls."""
    dg=depsgraph(scene);rooms={}
    def cast(o,d):
        hit,loc,*_=scene.ray_cast(dg,Vector(o),Vector(d),distance=6)
        assert hit,f'no surface from {o} toward {d}'
        return loc
    for name,((px,py),guess,fx,expect) in PROBES.items():
        hits=[cast((px+dx,py+dy,guess+1.2),(0,0,-1)) for dx in (-.6,0,.6) for dy in (-.6,0,.6)];zs=[h.z for h in hits]
        # The workshop boards leave 10 mm gaps down to the slab, so the highest hit is the floor.
        z0=max(zs);assert z0-min(zs)<.06,(name,zs)
        R={'Z0':z0,'C':cast((px,py,z0+1.2),(0,0,1)).z,
           'L':cast((px,py,z0+.5),(-1,0,0)).x,'R':cast((px,py,z0+.3),(1,0,0)).x,
           'B':cast((px,py,z0+.5),(0,1,0)).y,'F':cast((fx,py,z0+.5),(0,-1,0)).y}
        for k,e in zip('LRFB',expect):assert abs(R[k]-e)<.15,(name,k,R[k],e)
        R['Z']=z0+FLOOR_T;rooms[name]={k:round(v,4) for k,v in R.items()}
        rooms[name]['floor_xy']=[round(v,3) for v in max(hits,key=lambda h:h.z).xy]
    return rooms

def finishes(rooms,kit,rugs):
    """An oak floor and a warm plaster ceiling in each room, plus the three rugs."""
    for R in rooms.values():
        cx,cy,w,d=(R['L']+R['R'])/2,(R['F']+R['B'])/2,R['R']-R['L'],R['B']-R['F']
        kit.cube((cx,cy,R['Z0']+FLOOR_T/2),(w,d,FLOOR_T),'floor');kit.floor('floor finish',(*R['floor_xy'],R['Z0']))
        kit.cube((cx,cy,R['C']-CEILING_T/2),(w,d,CEILING_T),'ceiling');kit.wall('ceiling finish',(cx,cy,R['C']),(0,0,1))
    for room,c,s,key in (('workshop',(sum(ROOMS['WORKSHOP_DOOR_X'])/2,rooms['workshop']['F']+.5),(1.2,.7),'rug_clay'),
                         ('living',(-5.75,rooms['living']['B']-1.75),(2.3,1.6),'rug_oat'),
                         ('bedroom',(-4.25,3.3),(1.25,1.55),'rug_clay')):
        z=rooms[room]['Z'];rugs.cube((*c,z+RUG_T/2),(*s,RUG_T),key);rugs.floor('rug',(*c,z))

def cast_from(scene,dg,o,d,back=.25):
    hit,loc,*_=scene.ray_cast(dg,o-d*back,d,distance=back*2)
    return round((loc-(o-d*back)).length-back,4) if hit else None

def check_contacts(scene,contacts,levels):
    """Casts each recorded contact with its own level and every level above it hidden.

    So a floor finish meets the house, a rug meets the floor finish, and furniture meets either."""
    rows=[]
    for level in sorted(levels):
        hidden=[ob for lv,obs in levels.items() if lv>=level for ob in obs]
        for ob in hidden:ob.hide_viewport=True
        dg=depsgraph(scene)
        for c in contacts:
            if c['level']!=level:continue
            d=Vector((0,0,-1)) if c['kind']=='floor' else c['direction'].normalized()
            gap=cast_from(scene,dg,c['point'],d)
            rows.append({'label':c['label'],'kind':c['kind'],'point':[round(v,3) for v in c['point']],'gap':gap,
                         'ok':gap is not None and abs(gap)<CONTACT_TOLERANCE})
        for ob in hidden:ob.hide_viewport=False
    depsgraph(scene)
    return rows

def check_clearance(rooms,objects):
    """Counts furniture vertices inside each door zone, from the floor to 1.0 above it."""
    out={}
    for name,R in rooms.items():
        zones=ROOMS['CLEAR_ZONES'][name](R);hits=0
        for ob in objects[name]:
            for v in ob.data.vertices:
                p=ob.matrix_world@v.co
                hits+=any(x0<p.x<x1 and y0<p.y<y1 and R['Z']+.005<p.z<R['Z']+1.0 for x0,x1,y0,y1 in zones)
        out[name]={'zones':[[round(v,2) for v in z] for z in zones],'vertices_inside':hits}
    return out

def tris(ob):return sum(len(p.vertices)-2 for p in ob.data.polygons)

def build():
    assert not OUTPUT.exists() and bpy.data.scenes.get(SCENE) is None
    source=bpy.context.scene;assert source.name==SOURCE,source.name
    before={o.name:OPT['fingerprint'](o.data) for o in source.objects if o.type=='MESH'}
    scene=source.copy();scene.name=SCENE
    scene.compositing_node_group=source.compositing_node_group.copy()
    for n in scene.compositing_node_group.nodes:
        if n.type=='R_LAYERS':n.scene=scene
    swapped=without(scene,DROP)
    for win in bpy.context.window_manager.windows:win.scene=scene
    assert not any(o.name in DROP for o in scene.objects)
    rooms=measure(scene)
    coll=bpy.data.collections.new('CI_Cozy_Interiors');scene.collection.children.link(coll)
    contacts=[];kits={}
    def kit(name,level=2):kits[name]=Kit('CI_'+name,coll,None,contacts,level);return kits[name]
    finishes(rooms,kit('Room_Finishes',0),kit('Rugs',1))
    lights=[]
    def bedside(loc):lights.append(light('CI_Bedside_Lamp',coll,'POINT',loc,(1,.66,.38),14,.15))
    pts=[bpy.data.objects[CORK].matrix_world@Vector(c) for c in bpy.data.objects[CORK].bound_box]
    cork=(Vector(map(min,*pts)),Vector(map(max,*pts)))
    lamps=ROOMS['workshop'](rooms['workshop'],kit('Workshop_Furniture'),kit('Workshop_Interior_Detail'),cork)
    lamps+=ROOMS['lounge'](rooms['living'],kit('Lounge_Furniture'),kit('Lounge_Interior_Detail'))
    lamps+=ROOMS['bedroom'](rooms['bedroom'],kit('Bedroom_Furniture'),kit('Bedroom_Interior_Detail'),bedside)
    mats=palette(lamps);objects={}
    for name,k in kits.items():k.materials=mats;objects[name]=k.finish()
    room_objects={r:[objects[f'{p}_Furniture'],objects[f'{p}_Interior_Detail']]
                  for r,p in (('workshop','Workshop'),('living','Lounge'),('bedroom','Bedroom'))}
    furniture=[o for obs in room_objects.values() for o in obs]
    report={'scene':SCENE,'file':str(OUTPUT),'source':SOURCE,'dropped_from_scene':list(DROP),'collection_copies':swapped,
            'rooms':rooms,'lamps':[{'at':[round(v,3) for v in p],'radius':r,'strength':s} for p,r,s in lamps],
            'objects':{o.name:{'tris':tris(o),'faces':len(o.data.polygons),'smooth_faces':sum(p.use_smooth for p in o.data.polygons)}
                       for o in objects.values()},
            'materials':[m.name for m in mats],'new_lights':[l.name for l in lights]}
    report['tris_total']=sum(r['tris'] for r in report['objects'].values())
    report['tris_detail']=sum(r['tris'] for n,r in report['objects'].items() if 'Interior_Detail' in n)
    report['tris_removed']=sum(tris(bpy.data.objects[n]) for n in DROP if bpy.data.objects[n].type=='MESH')
    levels={0:[objects['Room_Finishes']],1:[objects['Rugs']],2:furniture}
    rows=check_contacts(scene,contacts,levels)
    report['contacts']={'checked':len(rows),'passed':sum(r['ok'] for r in rows),'failed':[r for r in rows if not r['ok']]}
    report['clearance']=check_clearance(rooms,room_objects)
    report['bedroom_is_highest_room']=rooms['bedroom']['Z']>max(rooms['workshop']['Z'],rooms['living']['Z'])
    cameras(scene)
    report['source_preserved']=all(OPT['fingerprint'](source.objects[n].data)==h for n,h in before.items())
    assert report['source_preserved']
    REPORT.write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
    return report

CAMERAS={  # name: (location, aim, lens)
    'CI_Workshop_Inside':((-3.15,.95,2.65),(-6.6,4.7,1.75),17),
    'CI_Workshop_Desk':((-4.6,2.2,2.55),(-5.6,4.9,1.85),22),
    'CI_Living_Inside':((-3.95,1.3,5.8),(-7.4,4.9,4.85),17),
    'CI_Lounge_Sofa':((-4.1,1.55,5.55),(-6.3,5.0,4.7),20),
    'CI_Bedroom_Inside':((-3.6,1.75,8.95),(-6.6,5.0,7.85),17),
    'CI_Bedroom_Shelf':((-4.2,2.3,8.85),(-6.6,5.2,8.4),20),
    'CI_Facade_Front':((-4.6,-15.5,6.2),(-5.3,3.2,5.6),34),
}

def cameras(scene):
    coll=bpy.data.collections.new('CI_Review_Cameras');scene.collection.children.link(coll)
    for name,(loc,aim,lens) in CAMERAS.items():
        data=bpy.data.cameras.new(name);data.lens=lens;data.clip_start=.05;data.clip_end=4000
        ob=bpy.data.objects.new(name,data);coll.objects.link(ob);ob.location=loc
        ob.rotation_euler=(Vector(aim)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
    scene.camera=bpy.data.objects['NA_Arrival_ThreeQuarter']

def save():
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)

def render(preview=False,only=None,folder='after'):
    scene=bpy.data.scenes[SCENE];out=ROOT/'renders'/'cozy-interiors'/folder;out.mkdir(parents=True,exist_ok=True)
    scene.render.resolution_x=1500;scene.render.resolution_y=1250;scene.render.resolution_percentage=50 if preview else 100
    scene.eevee.taa_render_samples=32 if preview else 96
    for cam in only or list(CAMERAS)+['NA_Corkboard_Close','NA_Bedroom_Close','NA_Hero_Wide','NA_Arrival_ThreeQuarter']:
        scene.camera=bpy.data.objects[cam];scene.render.filepath=str(out/f'{cam.lower()}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name)
    scene.eevee.taa_render_samples=96;scene.render.resolution_percentage=100;scene.camera=bpy.data.objects['NA_Arrival_ThreeQuarter']

if __name__=='__main__':result=build()

"""Small roof dining set, connected stair returns, and true rear windows."""
from pathlib import Path
import math,json,runpy
import bpy
from mathutils import Vector,Matrix

ROOT=Path(__file__).resolve().parent
TL=runpy.run_path(str(ROOT/'add_terrace_life.py'))
GE=TL['GE'];API,Batch,GEO,OPT=(TL[k] for k in ('API','Batch','GEO','OPT'))
SCENE='Island_B_Dining_Rear_Facade'
OUTPUT=ROOT/'island_b_dining_rear.blend'
REPORT=ROOT/'island_b_dining_rear_report.json'
HOUSE='DR_GE_MH_RA_JG_RF_CO_PT_SH_UA_B_Atelier'

def clone(source,parent,mapping):
    col=bpy.data.collections.new('DR_'+source.name);parent.children.link(col)
    for old in source.objects:
        ob=old.copy();ob.name='DR_'+old.name
        if old.data:ob.data=old.data.copy()
        col.objects.link(ob);mapping[old.name]=ob
    for child in source.children:clone(child,col,mapping)
    return col

def build():
    assert not OUTPUT.exists() and bpy.data.scenes.get(SCENE) is None
    source=bpy.context.scene;assert source.name=='Island_B_Terrace_Life'
    before={o.name:OPT['fingerprint'](o.data) for o in source.objects if o.type=='MESH'}
    scene=source.copy();scene.name=SCENE
    scene.compositing_node_group=source.compositing_node_group.copy()
    for n in scene.compositing_node_group.nodes:
        if n.type=='R_LAYERS':n.scene=scene
    old=bpy.data.collections['GE_MH_RA_JG_RF_CO_PT_SH_UA_B_Atelier']
    scene.collection.children.unlink(old);mapping={};house=clone(old,scene.collection,mapping)
    col=bpy.data.collections.new('DR_Dining_and_Rear_Details');house.children.link(col)
    wood=bpy.data.materials['LP_SS_A_wood_light'];metal=bpy.data.materials['LP_SS_A_metal']
    make=API['BASE']['material']
    cushion=make('DR_Sage_Linen',(.17,.26,.23),.95)
    pottery=make('DR_Warm_Ceramic',(.65,.61,.49),.7)
    leaf=bpy.data.materials['LP_SS_A_leaf']
    furniture=Batch('DR_Two_Person_Dining_Set',col,[wood,metal,cushion,pottery,leaf])
    cyl=TL['cylinder'];floor=10.66;center=Vector((-4.35,2.90,floor))
    cyl(furniture,center+Vector((0,0,.708)),center+Vector((0,0,.75)),.43,0,16)
    cyl(furniture,center+Vector((0,0,.025)),center+Vector((0,0,.71)),.045,1,10)
    for angle in (0,math.tau/3,2*math.tau/3):
        end=center+Vector((.29*math.cos(angle),.29*math.sin(angle),.018))
        furniture.beam(center+Vector((0,0,.09)),end,.032,mat=1)
    # Two light timber chairs face one another; no bulky arms or padded backs.
    chair_feet=[]
    for sign in (-1,1):
        seat=center+Vector((0,sign*.72,0));back=sign
        furniture.box(seat+Vector((0,0,.438)),(.43,.41,.035),0)
        furniture.box(seat+Vector((0,0,.465)),(.405,.38,.025),2)
        for dx in (-.17,.17):
            for dy in (-.16,.16):
                foot=seat+Vector((dx*1.1,dy*1.15,0));chair_feet.append(list(foot))
                furniture.beam(foot,seat+Vector((dx,dy,.43)),.026,mat=1)
        for dx in (-.185,.185):
            furniture.beam(seat+Vector((dx,back*.165,.42)),seat+Vector((dx,back*.22,.85)),.027,mat=1)
        for z in (.65,.76,.85):
            y=back*(.165+(z-.42)*.13)
            furniture.box(seat+Vector((0,y,z)),(.43,.035,.065),0)
    # Two cups and a tiny stem keep the tabletop useful and quiet.
    for y in (-.18,.18):
        c=center+Vector((.12,y,.75))
        cyl(furniture,c,c+Vector((0,0,.07)),.042,3,10)
        cyl(furniture,c+Vector((0,0,.071)),c+Vector((0,0,.073)),.034,1,10)
        furniture.box(c+Vector((.047,0,.037)),(.025,.037,.035),3)
    vase=center+Vector((-.18,0,.75))
    cyl(furniture,vase,vase+Vector((0,0,.10)),.035,3,8,radius2=.024)
    furniture.beam(vase+Vector((0,0,.08)),vase+Vector((.014,0,.23)),.006,mat=4)
    furniture.part('ico',vase+Vector((.039,0,.19)),(.052,.016,.025),4)
    furniture_obj=furniture.finish();API['LP']['grain_uv'](furniture_obj)

    # Replace the three solid rear wall panels with closed surrounds and true openings.
    walls=GE['find'](mapping,'Atelier_Walls')
    removed=GE['RA']['components'](walls,lambda c,d:c.y>4.9 and d.x>3 and d.y<.16 and d.z>3)
    assert removed==3,removed
    rear=Batch('DR_Rear_Window_Walls',col,[bpy.data.materials['PT_LP_SS_A_plaster']])
    frames=Batch('DR_Recessed_Rear_Window_Frames',col,[bpy.data.materials['PT_LP_SS_A_wood'],metal,wood])
    glazing=Batch('DR_Rear_Window_Glass',col,[bpy.data.materials['PT_LP_SS_A_glass']])
    windows=[(-7.25,-2.75,5.0,1.0,4.15,-6.65,-4.45,1.85,3.45),
             (-8.05,-3.55,5.25,4.15,7.30,-6.65,-4.45,5.05,6.65),
             (-7.0,-3.30,5.30,7.30,10.45,-6.25,-4.65,8.25,9.75)]
    for x0,x1,y,z0,z1,left,right,low,high in windows:
        for a,b,lo,hi in [(x0,left,z0,z1),(right,x1,z0,z1),(left,right,z0,low),(left,right,high,z1)]:
            rear.box(((a+b)/2,y,(lo+hi)/2),(b-a,.14,hi-lo))
        cx=(left+right)/2;cz=(low+high)/2;w=right-left;h=high-low
        # Deep jambs connect interior and exterior; glass sits inside the reveal.
        for x in (left+.0275,right-.0275):frames.box((x,y+.013,cz),(.055,.205,h),0)
        for z in (low+.0275,high-.0275):frames.box((cx,y+.013,z),(w,.205,.055),0)
        frames.box((cx,y+.03,cz),(.034,.065,h-.11),1)
        glazing.box((cx,y+.018,cz),(w-.105,.014,h-.105))
        frames.box((cx,y+.065,low-.025),(w+.14,.27,.055),1)
        frames.box((cx,y+.085,high+.025),(w+.12,.20,.045),1)
        # A modest interior bounce keeps the actual room visible at blue hour.
        API['BASE']['light']('DR_Rear_Window_Bounce',col,'AREA',(cx,y-.62,high-.1),(1,.73,.49),18,1.4,
                             target=(cx,y+.8,cz))
    rear_objs=[b.finish() for b in (rear,frames,glazing)]
    for ob in rear_objs:API['LP']['grain_uv'](ob)
    # Relocate rear bookcases to the left wall, so the windows are usable inside.
    life=GE['find'](mapping,'Atelier_Room_Life');moved=[]
    rot=Matrix.Rotation(math.pi/2,3,'Z')
    for lo,hi,old_xy,new_xy in [(1,4.15,(-6.125,4.7),(-6.98,3.65)),
                                (4.15,7.30,(-6.925,4.95),(-7.78,3.50)),
                                (7.30,10.45,(-6.075,5.0),(-6.73,3.65))]:
        a=Vector((*old_xy,0));b=Vector((*new_xy,0))
        count=GE['RA']['components'](life,lambda c,d:lo<c.z<hi and abs(c.y-old_xy[1])<.015,
                                    lambda v:rot@(v-a)+b)
        assert count==24,count
        moved.append(count)

    # Glazed rear returns close the staggered gap between each room and stair frame.
    structure=Batch('DR_Stair_to_House_Connections',col,[metal])
    infill=Batch('DR_Stair_Glazed_Returns',col,[bpy.data.materials['RA_Clear_Weather_Glazing']])
    joins=[]
    for x,y,z0,z1 in [(-2.75,5.07,1.05,4.15),(-3.55,5.32,4.30,7.30),(-3.30,5.37,7.45,10.51)]:
        a=Vector((x-.018,y-.018,0));b=Vector((-2.71,5.684,0));d=b-a
        angle=math.atan2(d.y,d.x);length=d.length;mid=(a+b)/2
        infill.box((mid.x,mid.y,(z0+z1)/2),(length,.014,z1-z0-.036),0,Matrix.Rotation(angle,4,'Z'))
        for p in (a,b):structure.beam((p.x,p.y,z0-.03),(p.x,p.y,z1+.03),.040,.055)
        for z in (z0,z1):structure.beam((a.x,a.y,z),(b.x,b.y,z),.045,.06)
        # Floor-level ties enter the existing slab and continue to the outer column.
        join_start=Vector((x-.14,y-.12,z1));join_end=Vector((-.49,y-.12,z1))
        structure.beam(join_start,join_end,.055,.075)
        joins.append({'house_edge':list(a),'stair_edge':list(b),'bottom':z0,'top':z1})
    # Two discreet front lintel connections reinforce the same floor rhythm.
    for x,y,z in [(-2.86,.65,4.16),(-3.66,1.20,7.30),(-3.42,1.35,10.51)]:
        structure.beam((x,y,z),(-.49,y,z),.055,.075)
    connection_objs=[structure.finish(),infill.finish()]
    for ob in [furniture_obj]+rear_objs+connection_objs:
        for f in ob.data.polygons:f.use_smooth=False
    cameras=bpy.data.collections.new('DR_Review_Cameras');scene.collection.children.link(cameras)
    for name,loc,target,scale in [
        ('DR_Dining_Close',(-9,-3,13.0),(-5.0,3.15,11.25),5.5),
        ('DR_Rear_ThreeQuarter',(15,25,16),(-4.1,3.2,6.8),17.2),
        ('DR_Rear_Straight',(-4.0,28,11),(-4.0,3.2,6.8),16.3),
        ('DR_Overall',(-19,-25,20),(-4.5,2.9,8.1),15.8)]:
        data=bpy.data.cameras.new(name);ob=bpy.data.objects.new(name,data);cameras.objects.link(ob)
        ob.location=loc;ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
        data.type='ORTHO';data.ortho_scale=scale
    assert all(OPT['fingerprint'](source.objects[n].data)==h for n,h in before.items())
    scene.camera=bpy.data.objects['DR_Rear_ThreeQuarter']
    for win in bpy.context.window_manager.windows:win.scene=scene
    report={'scene':scene.name,'file':str(OUTPUT),'source_preserved':True,'rear_windows':windows,
            'rear_wall_panels_replaced':removed,'bookcase_parts_relocated':moved,'connections':joins,
            'dining_table_diameter':.86,'chair_count':2,'chair_feet':chair_feet}
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    finish_connection()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report

def finish_connection():
    house=bpy.data.collections[HOUSE]
    assert bpy.data.objects.get('SS_DR_Open_Living_Door_and_Threshold') is None
    glass=next(o for o in house.all_objects if o.name.endswith('Recessed_Upper_Glazing'))
    frame=next(o for o in house.all_objects if o.name.endswith('Recessed_Frames_and_Shutters'))
    pivot=Vector((-3.68,5.15,0));rot=Matrix.Rotation(-math.pi/2,3,'Z')
    def turn(v):return pivot+rot@(v-pivot)
    count=GE['RA']['components'](glass,lambda c,d:-3.70<c.x<-3.65 and abs(c.y-4.825)<.02 and 4<c.z<7,turn)
    assert count==1,count
    # Remove the fixed centre bar from the original decorative door glazing.
    GE['RA']['components'](frame,lambda c,d:abs(c.x+3.65)<.02 and abs(c.y-4.825)<.02 and d.z>2 and d.y<.06)
    details=next(o for o in house.all_objects if o.name.endswith('Pergola_and_Door_Details'))
    GE['RA']['components'](details,lambda c,d:abs(c.x+3.40)<.03 and abs(c.y-4.52)<.03 and 5.3<c.z<5.6)
    batch=Batch('DR_Open_Living_Door_and_Threshold',bpy.data.collections['DR_Dining_and_Rear_Details'],
                [bpy.data.materials['LP_SS_A_metal'],bpy.data.materials['LP_SS_A_stone']])
    for y in (4.50,5.15):batch.beam(turn(Vector((-3.68,y,4.28))),turn(Vector((-3.68,y,6.60))),.025)
    for z in (4.28,6.60):batch.beam(turn(Vector((-3.68,4.50,z))),turn(Vector((-3.68,5.15,z))),.025)
    batch.beam(turn(Vector((-3.62,4.57,5.28))),turn(Vector((-3.62,4.57,5.45))),.025)
    batch.box((-3.72,4.825,4.24),(.20,.75,.12),1)
    ob=batch.finish()
    report=json.loads(REPORT.read_text(encoding='utf-8'))
    report['living_connection']='The existing rear landing meets a new stone threshold; the glazed door opens inward.'
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    return {'opened_door_panels':count,'threshold':ob.name}

def validate():
    scene=bpy.data.scenes[SCENE];house=bpy.data.collections[HOUSE]
    meshes=[o for o in house.all_objects if o.type=='MESH']
    meshes += [o for o in bpy.data.collections['TL_Terrace_Life'].objects if o.type=='MESH']
    trees=[(o.name,GEO['bvh'](o)) for o in meshes]
    routes={
        'ground_entrance':[(-4.95,-.25,1.05),(-4.95,1.20,1.05)],
        'ground_stairs':[(-4.95,-.25,1.05),(-2.15,-.25,1.05),(-2.15,.37,1.05)],
        'living_rear_entry':[(-1.05,5.18,4.30),(-3.10,5.18,4.30),(-3.10,4.825,4.30),(-3.75,4.825,4.30)],
        'second_terrace':[(-1.05,-.07,7.45),(-3.10,-.07,7.45),(-3.10,.75,7.45),(-7.60,.75,7.45),(-7.60,3.35,7.45)],
        'roof_to_grill':[(-2.15,5.18,10.66),(-4.10,5.18,10.66),(-5.35,4.0,10.66),(-5.35,3.05,10.66)],
        'roof_to_dining':[(-4.10,5.18,10.66),(-3.53,4.35,10.66),(-3.53,2.10,10.66)]}
    collisions=[];gaps=[];rays=0
    for name,points in routes.items():
        for a,b in zip(points,points[1:]):
            a,b=Vector(a),Vector(b);delta=b-a;d=delta.normalized();side=Vector((-d.y,d.x,0))
            for offset in (-.25,0,.25):
                for height in (.15,.45,.85,1.3,1.8):
                    rays+=1
                    for ob,tree in trees:
                        hit,n,i,dist=tree.ray_cast(a+side*offset+Vector((0,0,height)),d,delta.length)
                        if hit is not None:collisions.append([name,ob,list(hit)])
            for i in range(15):
                p=a.lerp(b,i/14)+Vector((0,0,.03))
                if not any(t.ray_cast(p,Vector((0,0,-1)),.075)[0] is not None for n,t in trees):gaps.append([name,list(p)])
    report=json.loads(REPORT.read_text(encoding='utf-8'))
    deck=next(o for o in house.all_objects if o.name.endswith('Decks_and_Connected_Stair_Treads'));tree=GEO['bvh'](deck)
    chair_contacts=[]
    for p in report['chair_feet']:
        chair_contacts.append(tree.ray_cast(Vector(p)+Vector((0,0,.04)),Vector((0,0,-1)),.09)[0] is not None)
    # Through-window rays must hit glass before any wall or furniture.
    windows=[]
    for x0,x1,y,z0,z1,l,r,low,high in report['rear_windows']:
        for x in ((3*l+r)/4,(l+3*r)/4):
            start=Vector((x,y+.40,(low+high)/2));hits=[]
            for name,t in trees:
                hit,n,i,d=t.ray_cast(start,Vector((0,-1,0)),.8)
                if hit is not None:hits.append((d,name))
            windows.append(min(hits)[1] if hits else None)
    report['checks']={'body_rays':rays,'sample_width':.50,'obstructions':collisions,'floor_gaps':gaps,
                      'chair_deck_contacts':chair_contacts,'window_first_surfaces':windows}
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert not collisions and not gaps and all(chair_contacts),report['checks']
    assert all(n and n.endswith('Rear_Window_Glass') for n in windows),windows
    return report['checks']

def render(preview=False):
    scene=bpy.data.scenes[SCENE];out=ROOT/'renders'/'dining-rear';out.mkdir(exist_ok=True)
    scene.render.resolution_x=1500;scene.render.resolution_y=1400;scene.render.resolution_percentage=65 if preview else 100
    scene.eevee.taa_render_samples=32 if preview else 96
    for label,cam in [('dining','DR_Dining_Close'),('rear','DR_Rear_ThreeQuarter'),('rear_straight','DR_Rear_Straight'),('overall','DR_Overall')]:
        scene.camera=bpy.data.objects[cam];scene.render.filepath=str(out/f'dining_rear_{label}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name)

if __name__=='__main__':result=build()

"""Modern recessed supports, a coherent ground entrance, and low glass edges."""
from pathlib import Path
import ast
import json
import math
import runpy
import bpy
import bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
MH=runpy.run_path(str(ROOT/'shift_house_minimal.py'))
RA,API,OPT,GEO,Batch,PARTS=(MH[k] for k in ('RA','API','OPT','GEO','Batch','PARTS'))
SCENE='Island_B_Glass_Edges_Entry'
OUTPUT=ROOT/'island_b_glass_edges_entry.blend'
REPORT=ROOT/'island_b_glass_edges_entry_report.json'
OFFSET=Vector((-2,-1,0))
APPROACH=[(-5.84,-1.64),(-1.66,-1.64),(-1.66,-2.60),(.4,-3.85),
          (1.68451,-4.65427),(1.21549,-5.44573),(-.45,-4.65),(-3.30,-3),(-5.84,-2.30)]


def clone(old,parent,mapping,select=None):
    new=bpy.data.collections.new('GE_'+old.name);parent.children.link(new)
    for ob in old.objects:
        if select is None or select(ob):
            copy=ob.copy();copy.name='GE_'+ob.name
            if ob.data:copy.data=ob.data.copy()
            mapping[ob.name]=copy
        else:copy=ob
        new.objects.link(copy)
    for child in old.children:clone(child,new,mapping,select)
    return new


def find(mapping,ending):
    matches=[o for n,o in mapping.items() if n.endswith(ending)]
    assert len(matches)==1,(ending,[o.name for o in matches])
    return matches[0]


def glass_material(name,factor,color):
    mat=bpy.data.materials['LP_SS_A_glass'].copy();mat.name=name
    mat.diffuse_color=(*color,.28)
    for node in mat.node_tree.nodes:
        if node.type=='MIX_SHADER':node.inputs[0].default_value=factor
        elif node.type=='BSDF_TRANSPARENT':node.inputs[0].default_value=(*color,1)
        elif node.type=='BSDF_GLOSSY':
            node.inputs[0].default_value=(.65,.83,.86,1)
            node.inputs['Roughness'].default_value=.10
    return mat


def build():
    assert not OUTPUT.exists() and bpy.data.scenes.get(SCENE) is None
    source=bpy.context.scene;assert source.name=='Island_B_Minimal_House'
    before={o.name:OPT['fingerprint'](o.data) for o in source.objects if o.type=='MESH'}
    scene=source.copy();scene.name=SCENE
    scene.compositing_node_group=source.compositing_node_group.copy()
    for node in scene.compositing_node_group.nodes:
        if node.type=='R_LAYERS':node.scene=scene
    original=bpy.data.collections['MH_RA_JG_RF_CO_PT_SH_UA_B_Atelier']
    scene.collection.children.unlink(original);mapping={};house=clone(original,scene.collection,mapping)
    new=bpy.data.collections.new('GE_Modern_Entry_and_Glass');house.children.link(new)
    mats={k:bpy.data.materials['LP_SS_A_'+k] for k in ('metal','stone','wood','wood_light','plaster','glass','warm')}
    barrier=glass_material('GE_Low_Glass_Clear',.10,(.91,.97,.975))
    edge=glass_material('GE_Glass_Polished_Edge',.24,(.47,.74,.77))
    frame=Batch('GE_Slender_Recessed_Structure',new,[mats['metal'],mats['stone']])
    entry=Batch('GE_Level_Entry_and_Steps',new,[mats['stone'],mats['metal']])
    facade=Batch('GE_Workshop_Opening_and_Frames',new,[mats['metal'],mats['plaster'],mats['wood']])
    glazing=Batch('GE_Workshop_Sliding_Door_and_Glass',new,[mats['glass']])
    stairs=Batch('GE_First_Flight_Aligned_to_Entry',new,[mats['wood_light'],mats['wood'],mats['metal']])
    hood=Batch('GE_Light_Entry_Canopy',new,[barrier,mats['metal']])
    body=next(o for o in scene.objects if o.type=='MESH' and 'RimIndices' in o)
    terrain=GEO['bvh'](body)
    def rect(batch,x0,x1,y0,y1,z0,z1,mat=0):
        batch.box(((x0+x1)/2,(y0+y1)/2,(z0+z1)/2),(x1-x0,y1-y0,z1-z0),mat)

    # Retire the added heavy timber frame, large feet and all conventional railings.
    removed_objects=[]
    for ending in ('Grounded_Timber_Supports','Reseated_Stone_Feet','Low_Minimal_Railings'):
        ob=find(mapping,ending);removed_objects.append(ob.name)
        key=next(n for n,v in mapping.items() if v==ob)
        bpy.data.objects.remove(ob,do_unlink=True);mapping.pop(key)
    deck=find(mapping,'Decks_and_Connected_Stair_Treads')
    removed_deck=RA['components'](deck,lambda c,d:c.z+d.z/2<=1.06)
    removed_flight=RA['components'](deck,lambda c,d:-2.71<c.x<-1.60 and .39<c.y<4.86 and
                                  c.z<4.34 and d.x<1.06)
    walls=find(mapping,'Atelier_Walls')
    # Remove the obsolete entrance steps AND the solid wall across the door opening.
    RA['components'](walls,lambda c,d:(c.z<1.1 and abs(d.x-1.45)<.02) or
                     (abs(c.y-.6)<.02 and c.z<1.6 and d.x>4))
    foundation=find(mapping,'Grounded_Foundation')
    RA['components'](foundation,lambda c,d:d.x<1.5)
    timber=find(mapping,'Atelier_Timber')
    RA['components'](timber,lambda c,d:.39<c.y<.69 and c.z<4.05 and
                     (d.z>1.0 or d.x>2.0))
    old_glass=find(mapping,'Atelier_Glazing')
    RA['components'](old_glass,lambda c,d:c.y<.70)
    old_roof=find(mapping,'Atelier_Roof')
    RA['components'](old_roof,lambda c,d:3.20<c.z<3.35)
    life=find(mapping,'Atelier_Room_Life')
    RA['components'](life,lambda c,d:abs(c.x+4.66)<.04 and abs(c.y-.47)<.04 and 1.8<c.z<2.1)

    # Slim dark columns sit back from the balcony edges; ground shoes are nearly flush.
    supports=[]
    def column(x,y,top,width=.075):
        z=[GEO['sample'](terrain,x+dx,y+dy) for dx in (-.085,.085) for dy in (-.085,.085)]
        foot_top=max(z)+.012;foot_bottom=min(z)-.16
        rect(frame,x-.08,x+.08,y-.08,y+.08,foot_bottom,foot_top,1)
        rect(frame,x-.07,x+.07,y-.07,y+.07,foot_top-.012,foot_top+.016,0)
        frame.beam((x,y,foot_top),(x,y,top),width,mat=0)
        supports.append({'xy':[x,y],'width':width,'base':foot_top,'top':top})
    for x,y,top in [(-7.86,.60,7.35),(-7.86,5.06,4.17),(-3.62,.32,7.35)]:column(x,y,top)
    # Continuous perimeter steel members replace the thick braces and apron beams.
    for z in (4.16,7.32):
        frame.beam((-8.05,-.15,z),(-3.48,-.15,z),.065,.085)
        frame.beam((-7.86,-.15,z),(-7.86,5.14 if z<5 else 1.2,z),.065,.085)
        frame.beam((-3.62,-.15,z),(-3.62,.60,z),.065,.085)
    # Four light stair-bay columns; the western front column is recessed by the wall.
    for x,y in [(-2.71,.65),(-.49,-.52),(-2.71,5.68),(-.49,5.68)]:column(x,y,12.98,.065)
    for z in (4.15,7.30,10.51,12.92):
        for x in (-2.71,-.49):frame.beam((x,-.52,z),(x,5.68,z),.055,.07)
        for y in (-.52,5.68):frame.beam((-2.71,y,z),(-.49,y,z),.055,.07)
    for y,z in [(5.30,4.13),(-.09,7.28),(5.30,10.49)]:
        frame.beam((-3.62,y,z),(-.49,y,z),.055,.08)
    for y in (1.55,3.60):frame.beam((-.485,y,1.05),(-.485,y,12.94),.025)
    for y in (-.52,5.68):frame.beam((-1.60,y,3.22),(-1.60,y,12.94),.025)
    frame.beam((-.40,5.78,.65),(-.40,5.78,12.94),.035)

    # One shared landing: door sill, front porch and foot of the exterior flight agree.
    rect(entry,-6.05,-.35,-.70,.64,.91,1.05,0)
    # A recessed plinth carries the slab without extra visible front posts.
    rect(entry,-5.90,-.50,-.57,.62,.22,.93,0)
    for j,z in enumerate((.65,.85,1.05)):
        y=-1.50+j*.32;zground=min(GEO['sample'](terrain,x,yy) for x in (-5.85,-1.65) for yy in (y-.16,y+.16))
        rect(entry,-5.85,-1.65,y-.16,y+.16,zground-.10,z,0)
    # Threshold has no raised sill or old platform crossing the doorway.
    rect(entry,-5.70,-4.35,.48,.72,1.00,1.05,1)
    # True opening through the façade; the sliding glass leaf is parked to the left.
    for x0,x1 in [(-7.25,-5.70),(-4.35,-2.75)]:
        rect(facade,x0,x1,.515,.685,1.0,1.40,1)
        rect(glazing,x0+.065,x1-.065,.575,.587,1.40,3.84,0)
        for x in (x0+.025,x1-.025):facade.beam((x,.53,1.02),(x,.53,3.89),.045)
        facade.beam((x0,.53,1.40),(x1,.53,1.40),.035)
    for x in (-5.70,-4.35):facade.beam((x,.53,1.05),(x,.53,3.19),.047)
    facade.beam((-5.73,.53,3.19),(-4.32,.53,3.19),.065)
    rect(glazing,-5.67,-4.38,.575,.587,3.23,3.84)
    # Door panel 1.2 units open, leaving a 1.2-wide passage on its right.
    x0,x1=-6.90,-5.55
    rect(glazing,x0+.04,x1-.04,.425,.438,1.10,3.12)
    for x in (x0,x1):facade.beam((x,.43,1.07),(x,.43,3.15),.035)
    for z in (1.07,3.15):facade.beam((x0,.43,z),(x1,.43,z),.035)
    facade.beam((-6.94,.45,3.21),(-4.30,.45,3.21),.045)
    facade.beam((-5.64,.38,1.85),(-5.64,.38,2.13),.023)
    # Thin glass entry canopy joins the coverage of the tall stair bay.
    rect(hood,-6.03,-3.44,-.88,.72,3.27,3.295,0)
    for y in (-.86,.70):hood.beam((-6.03,y,3.27),(-3.44,y,3.27),.035,mat=1)
    for x in (-6.03,-4.35,-3.44):hood.beam((x,-.86,3.27),(x,.70,3.27),.035,mat=1)

    # Rebuild the first flight from the shared 1.05 landing, without an uneven first rise.
    for j in range(18):
        run=4.45/18;rise=(4.30-1.05)/18;y=.40+(j+.5)*run;z=1.05+(j+1)*rise
        stairs.box((-2.15,y,z-.055),(1.0,run+.012,.11),0)
        stairs.box((-2.15,.40+j*run,z-rise/2),(.97,.032,rise),1)
    for x in (-2.60,-1.70):stairs.beam((x,.40,.95),(x,4.85,4.20),.08,.12,2)

    # Pergola posts also become slender charcoal elements, while timber slats remain.
    detail=find(mapping,'Pergola_and_Door_Details')
    bm,groups=PARTS(detail.data)
    for group in groups:
        lo=Vector(tuple(min(v.co[i] for v in group) for i in range(3)))
        hi=Vector(tuple(max(v.co[i] for v in group) for i in range(3)));d=hi-lo;c=(hi+lo)/2
        if d.z>2 and d.x<.14 and d.y<.14:
            for v in group:v.co.x=c.x+(v.co.x-c.x)*.55;v.co.y=c.y+(v.co.y-c.y)*.55
            for f in {f for v in group for f in v.link_faces}:f.material_index=1
    bm.to_mesh(detail.data);bm.free()

    objects=[b.finish() for b in (frame,entry,facade,glazing,stairs,hood)]
    for ob in (objects[0],objects[1],objects[2],objects[4]):API['LP']['grain_uv'](ob)
    glass_obj,shoes=glass_edges(new,barrier,edge,mats['metal'])

    # Replace the fork with one tidy forecourt meeting the broad entrance steps.
    common_source=next(c for c in source.collection.children if body.name in c.all_objects)
    scene.collection.children.unlink(common_source);common_map={}
    def needs_copy(o):
        return 'Connected_Entrance_Path' in o.name or any(k in o.name for k in
            ('Flower_','Grass_Accents','Angular_Meadow','Ground_Planting','Path_Lanterns')) or (
            o.type=='LIGHT' and (o.location.x+5.95)**2+(o.location.y+1.55)**2<.1)
    common=clone(common_source,scene.collection,common_map,needs_copy)
    oldpath=next(o for n,o in common_map.items() if 'Connected_Entrance_Path' in n)
    MH['path_mesh'].__globals__['PATH']=APPROACH
    path=MH['path_mesh'](oldpath.users_collection[0],terrain,oldpath.data.materials[0]);path.name='GE_One_Entrance_Approach'
    key=next(n for n,o in common_map.items() if o==oldpath)
    bpy.data.objects.remove(oldpath,do_unlink=True);common_map.pop(key)
    # Keep the path lamp clear of the left edge of the new broad steps.
    dz=GEO['sample'](terrain,-6.25,-1.80)-GEO['sample'](terrain,-5.95,-1.55)
    for name,ob in common_map.items():
        if 'Path_Lanterns' in name:
            RA['components'](ob,lambda c,d:(c.x+5.95)**2+(c.y+1.55)**2<.1,(-.3,-.25,dz))
        elif ob.type=='LIGHT':ob.location+=Vector((-.3,-.25,dz))
    def occupied(c,d):
        return (-6.2<c.x<-.25 and -1.85<c.y<.70) or GEO['inside']((c.x,c.y),[Vector(p) for p in APPROACH])
    stem=next(o for n,o in common_map.items() if 'Flower_Stems' in n)
    bm,groups=PARTS(stem.data);anchors=[]
    for g in groups:
        c=sum((v.co for v in g),Vector())/len(g);anchors.append((Vector((c.x,c.y)),occupied(c,Vector())))
    bm.free()
    for name,ob in common_map.items():
        if 'Flower_' in name:
            RA['components'](ob,lambda c,d:min(anchors,key=lambda a:(a[0]-Vector((c.x,c.y))).length_squared)[1])
        elif any(k in name for k in ('Grass_Accents','Angular_Meadow','Ground_Planting')):RA['components'](ob,occupied)

    for name,loc,target,scale in [
        ('GE_Entry_Close',(6,-15,7),(-3.7,.6,2.1),9.5),
        ('GE_Entry_Front',(-3.8,-20,5),(-3.8,.5,2.3),9.0),
        ('GE_House_Overview',(17,-28,18),(-4.4,2.4,6.3),18.6),
        ('GE_Glass_Detail',(7,-17,17),(-5.2,1.8,8.8),11.3)]:
        data=bpy.data.cameras.new(name);cam=bpy.data.objects.new(name,data);scene.collection.objects.link(cam)
        cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
        data.type='ORTHO';data.ortho_scale=scale;data.clip_end=6500
    scene.camera=bpy.data.objects['GE_House_Overview']
    for win in bpy.context.window_manager.windows:win.scene=scene
    bpy.context.view_layer.update()
    assert all(OPT['fingerprint'](bpy.data.objects[n].data)==h for n,h in before.items())
    report={'scene':SCENE,'blend':str(OUTPUT),'source_scene_unchanged':True,
            'supports':supports,'column_widths':[.075,.065],'barrier_height':.40,
            'barriers':'Clear glass; polished edges; tiny base shoes; no posts or top rail.',
            'ground_entry':'One 1.05-high continuous landing, three broad approach treads, real open sliding doorway.',
            'door_clear_opening':[-5.55,-4.35],'old_deck_parts_removed':removed_deck,
            'old_first_flight_parts_replaced':removed_flight,'island_pond_trees_unchanged':True}
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report


def glass_edges(coll,material,edge_mat,metal):
    vertices=[];faces=[];indices=[]
    mounts=Batch('GE_Glass_Recessed_Base_Shoes',coll,[metal])
    def panel(a,b):
        a,b=Vector(a),Vector(b);direction=b-a;flat=Vector((direction.x,direction.y,0));flat.normalize()
        side=Vector((-flat.y,flat.x,0))*.006
        pts=[a-side,b-side,b+side,a+side]
        i=len(vertices);vertices.extend([tuple(p) for p in pts]);vertices.extend([tuple(p+Vector((0,0,.38))) for p in pts])
        for face,mat in [((0,1,5,4),0),((3,7,6,2),0),((0,3,2,1),1),
                         ((4,5,6,7),1),((0,4,7,3),1),((1,2,6,5),1)]:
            faces.append(tuple(i+j for j in face));indices.append(mat)
        for t in (.17,.83):
            p=a.lerp(b,t);mounts.box((p.x,p.y,p.z-.005),(.04,.04,.03))
    def run(a,b):
        a,b=Vector(a),Vector(b);n=max(1,math.ceil((b-a).length/1.20))
        for j in range(n):
            p=a.lerp(b,j/n);q=a.lerp(b,(j+1)/n);d=(q-p).normalized()*.004
            panel(p+d,q-d)
    tree=ast.parse((ROOT/'improve_house_structure.py').read_text(encoding='utf-8'))
    for node in ast.walk(tree):
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='guard':
            a,b,z=[ast.literal_eval(v) for v in node.args[:3]]
            if (Vector(a)-Vector(b)).length<.20:continue
            run(Vector((*a,z+.02))+OFFSET,Vector((*b,z+.02))+OFFSET)
    levels=[1.05,4.30,7.45,10.66]
    for k,(z0,z1) in enumerate(zip(levels,levels[1:])):
        x=-.15 if k%2==0 else .95;ya,yb=(1.40,5.85) if k%2==0 else (5.85,1.40)
        for sign in (-1,1):
            run(Vector((x+sign*.46,ya,z0+.02))+OFFSET,Vector((x+sign*.46,yb,z1+.02))+OFFSET)
    ob=API['mesh_object']('GE_Short_Glass_Edges',vertices,faces,coll,[material,edge_mat],indices)
    return ob,mounts.finish()


def render():
    scene=bpy.data.scenes[SCENE];out=ROOT/'renders'/'house-glass-entry';out.mkdir(exist_ok=True)
    scene.render.resolution_x=1500;scene.render.resolution_y=1250;scene.render.resolution_percentage=100
    for view,camera in [('entry','GE_Entry_Close'),('entry_front','GE_Entry_Front'),
                        ('house','GE_House_Overview'),('glass','GE_Glass_Detail'),('island','Island_Options_ThreeQuarter')]:
        scene.camera=bpy.data.objects[camera];scene.render.filepath=str(out/f'glass_entry_{view}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name)


def validate():
    scene=bpy.data.scenes[SCENE]
    house=bpy.data.collections['GE_MH_RA_JG_RF_CO_PT_SH_UA_B_Atelier']
    meshes=[o for o in house.all_objects if o.type=='MESH']
    trees=[(o.name,GEO['bvh'](o)) for o in meshes]
    routes={
        'open_workshop_door':[(-4.95,-.25,1.05),(-4.95,1.20,1.05)],
        'door_to_stair':[(-4.95,-.25,1.05),(-2.15,-.25,1.05),(-2.15,.37,1.05)],
        'middle_terrace':[(.95,.93,7.45),(-1.10,.93,7.45),(-1.10,1.75,7.45),
                          (-5.60,1.75,7.45),(-5.60,5.80,7.45)],
        'rooftop':[(-.15,6.18,10.66),(-2.10,6.18,10.66),(-3.50,5.0,10.66)]}
    for name in ('middle_terrace','rooftop'):
        routes[name]=[tuple(Vector(p)+OFFSET) for p in routes[name]]
    collisions=[];gaps=[];rays=0
    for name,points in routes.items():
        for a,b in zip(points,points[1:]):
            a,b=Vector(a),Vector(b);direction=(b-a).normalized();length=(b-a).length
            side=Vector((-direction.y,direction.x,0))
            for offset in (-.25,0,.25):
                for h in (.15,.45,.85,1.3,1.8):
                    rays+=1;start=a+side*offset+Vector((0,0,h))
                    for obj,tree in trees:
                        hit,normal,index,distance=tree.ray_cast(start,direction,length)
                        if hit is not None:collisions.append([name,obj,list(hit)])
            for i in range(15):
                p=a.lerp(b,i/14);found=False
                for obj,tree in trees:
                    hit,normal,index,distance=tree.ray_cast(p+Vector((0,0,.03)),Vector((0,0,-1)),.07)
                    if hit is not None:found=True;break
                if not found:gaps.append([name,list(p)])
    assert not collisions,collisions
    assert not gaps,gaps
    clearances=[]
    # Sample the actual tread tops, including the newly matched first flight.
    for k,(z0,z1) in enumerate(zip((1.05,4.30,7.45),(4.30,7.45,10.66))):
        x=-2.15 if k%2==0 else -1.05
        ya,yb=(.40,4.85) if k%2==0 else (4.85,.40)
        for j in range(18):
            p=Vector((x,ya+(yb-ya)*(j+.5)/18,z0+(z1-z0)*(j+1)/18+.015));hits=[]
            for obj,tree in trees:
                hit,normal,index,d=tree.ray_cast(p,Vector((0,0,1)))
                if hit is not None:hits.append((d,obj))
            assert hits,('uncovered',list(p))
            clearances.append(min(hits)[0])
    assert min(clearances)>2.0,min(clearances)
    report=json.loads(REPORT.read_text(encoding='utf-8'))
    report['route_review']={'rays':rays,'sample_width':.50,'obstructions':0,'floor_gaps':0,
                            'routes':routes,'minimum_stair_headroom':min(clearances)}
    report['renders_reviewed']=['entry','entry_front','house','glass','island']
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    scene.camera=bpy.data.objects['GE_Entry_Close']
    for win in bpy.context.window_manager.windows:
        win.scene=scene
        for area in win.screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.region_3d.view_camera_zoom=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report['route_review']


if __name__=='__main__':result=build()

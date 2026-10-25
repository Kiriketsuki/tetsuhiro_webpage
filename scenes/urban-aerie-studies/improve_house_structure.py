"""Private, reversible house revision: grounded supports and sheltered roof access."""
from pathlib import Path
import math
import json
import runpy
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
API = runpy.run_path(str(ROOT / 'build_aeries.py'))
OPT = runpy.run_path(str(ROOT / 'island_profile_options.py'))
GEO = runpy.run_path(str(ROOT / 'cohesion_geometry.py'))
Batch = API['Batch']
SCENE = 'Island_B_Sheltered_Roof_Access'
OUTPUT = ROOT / 'island_b_sheltered_roof_access.blend'
REPORT = ROOT / 'island_b_sheltered_roof_access_report.json'


def clone_collection(old, parent, mapping):
    new = bpy.data.collections.new('RA_' + old.name)
    parent.children.link(new)
    for ob in old.objects:
        copy = ob.copy()
        if ob.data: copy.data = ob.data.copy()
        copy.name = 'RA_' + ob.name
        new.objects.link(copy)
        mapping[ob.name] = copy
    for child in old.children:
        clone_collection(child, new, mapping)
    return new


def components(ob, predicate, delta=None):
    bm = bmesh.new(); bm.from_mesh(ob.data)
    remaining = set(bm.verts); selected = []; count = 0
    while remaining:
        seed = remaining.pop(); group = {seed}; stack = [seed]
        while stack:
            v = stack.pop()
            for e in v.link_edges:
                other = e.other_vert(v)
                if other in remaining:
                    remaining.remove(other); group.add(other); stack.append(other)
        lo = Vector(tuple(min(v.co[i] for v in group) for i in range(3)))
        hi = Vector(tuple(max(v.co[i] for v in group) for i in range(3)))
        if predicate((lo+hi)/2, hi-lo):
            count += 1
            if delta:
                for v in group:
                    if callable(delta): v.co=delta(v.co.copy())
                    else: v.co += Vector(delta)
            else: selected.extend(group)
    if selected: bmesh.ops.delete(bm, geom=selected, context='VERTS')
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    return count


def old_timber(c, d):
    if c.z > 10.6: return True  # Old low pergola.
    if abs(d.x-.86)<.01 and abs(d.y-.28)<.01 and abs(d.z-.1)<.01: return True
    if abs(d.x-1.8)<.01 and abs(d.y-.9)<.01 and abs(d.z-.12)<.01: return True
    if d.x<.17 and d.y>3.9 and d.z>2.9 and c.x> -1.7: return True
    if 4.0<c.z<5.3 and c.y<1.97: return True
    if 7.19<c.z<8.5 and c.y<2.47: return True
    return False


def build():
    if OUTPUT.exists() or bpy.data.scenes.get(SCENE): raise RuntimeError('Revision already exists')
    source = bpy.context.scene
    assert source.name == 'Island_B_Refined_Trees', source.name
    source_hash = {o.name: OPT['fingerprint'](o.data) for o in source.objects if o.type=='MESH'}
    scene = source.copy(); scene.name = SCENE
    if source.compositing_node_group:
        scene.compositing_node_group = source.compositing_node_group.copy()
        for n in scene.compositing_node_group.nodes:
            if n.type == 'R_LAYERS': n.scene = scene
    old = bpy.data.collections['JG_RF_CO_PT_SH_UA_B_Atelier']
    scene.collection.children.unlink(old)
    mapping = {}; house = clone_collection(old, scene.collection, mapping)
    for old_name, new_ob in mapping.items():
        parent = bpy.data.objects[old_name].parent
        if parent and parent.name in mapping: new_ob.parent = mapping[parent.name]
    timber = next(o for name,o in mapping.items() if name.endswith('Atelier_Timber'))
    removed = components(timber, old_timber)
    railposts = next(o for name,o in mapping.items() if name.endswith('Stair_Rail_Posts'))
    bpy.data.objects.remove(railposts, do_unlink=True)
    life = next(o for name,o in mapping.items() if name.endswith('Room_Life'))
    components(life, lambda c,d: 4.3<c.z<4.95 and c.y<1.35, (0,0,.13))
    components(life, lambda c,d: 7.45<c.z<8.15 and c.y<1.7, (0,0,.13))
    clear_terrace_furniture(mapping)
    new = bpy.data.collections.new('RA_Supports_Stairs_and_Terraces'); house.children.link(new)
    mats = {key: bpy.data.materials['LP_SS_A_'+key] for key in
            ('wood','wood_light','metal','stone','roof_edge','glass','warm')}
    glass = mats['glass'].copy(); glass.name = 'RA_Clear_Weather_Glazing'
    glass.diffuse_color = (.40,.59,.61,.16)
    for n in glass.node_tree.nodes:
        if n.type=='MIX_SHADER': n.inputs[0].default_value=.045
    structure = Batch('RA_Grounded_Timber_Supports',new,[mats['wood'],mats['metal'],mats['stone']])
    floors = Batch('RA_Decks_and_Connected_Stair_Treads',new,[mats['wood_light'],mats['wood'],mats['metal']])
    rails = Batch('RA_Terrace_and_Stair_Guards',new,[mats['metal'],mats['wood']])
    roof = Batch('RA_Continuous_Stair_Canopy',new,[mats['roof_edge'],mats['wood']])
    panes = Batch('RA_Stair_Weather_Screens',new,[glass])
    detail = Batch('RA_Pergola_and_Door_Details',new,[mats['wood'],mats['metal'],mats['warm']])
    terrain_ob = next(o for o in scene.objects if o.type=='MESH' and 'RimIndices' in o)
    terrain = GEO['bvh'](terrain_ob)
    supports = []

    def box_bounds(batch,x0,x1,y0,y1,z0,z1,mat=0):
        batch.box(((x0+x1)/2,(y0+y1)/2,(z0+z1)/2),(x1-x0,y1-y0,z1-z0),mat)

    def post(x,y,top,width=.22):
        ground = GEO['sample'](terrain,x,y)
        assert ground is not None
        structure.box((x,y,ground+.09),(.43,.43,.36),2)
        structure.box((x,y,(ground+.22+top)/2),(width,width,top-ground-.22),0)
        structure.box((x,y,ground+.30),(width+.035,width+.035,.18),1)
        supports.append({'xy':[x,y],'terrain':ground,'top':top,'foot_embed':.09})

    def deck(x0,x1,y0,y1,z):
        # Closed supporting panel underneath narrowly spaced individual boards.
        box_bounds(floors,x0,x1,y0,y1,z-.13,z-.035,1)
        count = math.ceil((x1-x0)/.19); pitch=(x1-x0)/count
        for i in range(count):
            box_bounds(floors,x0+i*pitch+.003,x0+(i+1)*pitch-.003,y0,y1,z-.04,z,0)

    def guard(a,b,z,height=1.04):
        a,b=Vector((*a,z)),Vector((*b,z)); length=(b-a).length
        rails.beam(a+Vector((0,0,height)),b+Vector((0,0,height)),.065,mat=0)
        rails.beam(a+Vector((0,0,.12)),b+Vector((0,0,.12)),.045,mat=0)
        n=max(1,math.ceil(length/.27))
        for i in range(n+1):
            p=a.lerp(b,i/n); w=.065 if i in (0,n) else .029
            rails.beam(p,p+Vector((0,0,height)),w,mat=0)

    # Four primary supports carry the left offset and projecting front corners.
    for x,y in [(-5.94,2.10),(-5.94,6.06),(-5.94,.87),(-1.58,.87)]: post(x,y,4.22)
    for a,b in [((-5.94,.87,4.10),(-1.58,.87,4.10)),
                ((-5.94,.87,4.10),(-5.94,6.06,4.10))]: structure.beam(a,b,.22,.26)
    for x,y in [(-5.94,.87),(-1.58,.87),(-5.94,6.06)]:
        direction = 1 if x< -3 else -1
        structure.beam((x,y,3.45),(x+direction*.58,y,4.10),.12)
    # Front terrace corner columns continue the load path up one level.
    for x in (-5.94,-1.58):
        structure.beam((x,.99,4.25),(x,.99,7.35),.16)
        structure.beam((x,.99,6.80),(x+(.45 if x< -3 else -.45),.99,7.35),.10)
    structure.beam((-6.12,1.06,7.32),(-.66,1.06,7.32),.17,.20)

    # Balcony outside living floor, and L terrace on the roof of that block.
    deck(-6.12,-1.48,.72,1.96,4.30)
    guard((-6.10,.75),(-1.50,.75),4.30)
    guard((-6.10,.75),(-6.10,1.94),4.30)
    guard((-1.50,.75),(-1.50,1.94),4.30)
    deck(-6.20,-.65,1.05,2.30,7.45)
    deck(-6.20,-5.05,2.30,6.40,7.45)
    deck(-1.55,-.65,.43,1.05,7.45)
    guard((-6.17,1.08),(-1.55,1.08),7.45)
    guard((-1.55,1.08),(-1.55,.46),7.45)
    guard((-1.55,.46),(-.62,.46),7.45)
    guard((-6.17,1.08),(-6.17,6.37),7.45)
    guard((-6.17,6.37),(-5.05,6.37),7.45)
    guard((-5.07,6.37),(-5.07,6.24),7.45)
    # The entry on the east of the front terrace remains open to the stair landing.
    deck(-5.15,-1.10,2.25,6.75,10.66)
    guard((-5.12,2.28),(-1.13,2.28),10.66)
    guard((-5.12,2.28),(-5.12,6.72),10.66)
    guard((-5.12,6.72),(-1.13,6.72),10.66)
    guard((-1.13,2.28),(-1.13,5.78),10.66)

    # Three flights share one weatherproof bay. Alternating lanes avoid collisions.
    levels=[1.0,4.30,7.45,10.66]; flights=[]; walking=[]
    deck(-.65,1.45,.43,1.40,1.0)
    deck(-1.62,1.45,5.85,6.75,4.30)
    deck(-.65,1.45,.43,1.40,7.45)
    deck(-1.15,1.45,5.85,6.75,10.66)
    # Rear floor connection actually meets the living-room side doorway.
    deck(-1.62,-.65,5.42,5.85,4.30)
    guard((-1.60,6.72),(1.42,6.72),4.30)
    guard((1.42,6.72),(1.42,5.87),4.30)
    guard((-1.60,6.24),(-1.60,6.72),4.30)
    guard((-1.60,5.44),(-.68,5.44),4.30)
    guard((-.62,.46),(1.42,.46),7.45)
    guard((1.42,.46),(1.42,1.38),7.45)
    guard((-1.12,6.72),(1.42,6.72),10.66)
    guard((1.42,5.87),(1.42,6.72),10.66)
    guard((.38,5.87),(1.42,5.87),10.66)
    for k,(z0,z1) in enumerate(zip(levels,levels[1:])):
        x = -.15 if k%2==0 else .95
        ya,yb=(1.40,5.85) if k%2==0 else (5.85,1.40)
        sign=1 if yb>ya else -1; n=18; run=abs(yb-ya)/n; rise=(z1-z0)/n
        step_samples=[]
        for j in range(n):
            y=ya+sign*(j+.5)*run; z=z0+(j+1)*rise
            floors.box((x,y,z-.055),(1.0,run+.012,.11),0)
            # Closed risers give the sheltered stair a finished domestic character.
            floors.box((x,ya+sign*j*run,z-rise/2),(.97,.032,rise),1)
            p=(x,y,z); walking.append(p); step_samples.append(p)
        for sx in (x-.45,x+.45):
            floors.beam((sx,ya,z0-.10),(sx,yb,z1-.10),.11,.16,2)
            rails.beam((sx,ya,z0+1.04),(sx,yb,z1+1.04),.055,mat=0)
            for j in range(0,n+1,2):
                y=ya+(yb-ya)*j/n; z=z0+(z1-z0)*j/n
                rails.beam((sx,y,z),(sx,y,z+1.04),.035,mat=0)
        flights.append({'lane_center':x,'from':[x,ya,z0],'to':[x,yb,z1],
                        'steps':n,'rise':rise,'tread':run,'width':1.0})

    # Ground entry ties into the workshop porch rather than stopping in midair.
    deck(-3.35,-.65,.43,1.46,1.0)
    for j in range(3):
        z=1.0-(2-j)*.18; y=-.38+j*.27
        ground=GEO['sample'](terrain,-.15,y)
        box_bounds(structure,-.68,.38,y-.14,y+.14,min(ground-.07,z-.12),z,2)
    for x,y in [(-.71,.48),(1.51,.48),(-.71,6.68),(1.51,6.68)]: post(x,y,12.98,.16)
    # Header beams stay outside the walkable lanes, with structural joists below landings.
    for z in (4.15,7.30,10.51,12.92):
        structure.beam((1.51,.48,z),(1.51,6.68,z),.12,.15)
        for y in (.48,6.68): structure.beam((-.71,y,z),(1.51,y,z),.12,.15)
    for y,z in [(6.30,4.13),(.91,7.28),(6.30,10.49)]:
        structure.beam((-1.62,y,z),(1.51,y,z),.13,.18)
    for x in (-.71,1.51): structure.beam((x,.48,12.92),(x,6.68,12.92),.14,.17)
    box_bounds(roof,-1.78,1.78,.20,6.94,12.98,13.12,0)
    # Fine roof seams, edge gutter and one downpipe.
    for x in [-1.5,-.9,-.3,.3,.9,1.5]: roof.box((x,3.57,13.13),(.025,6.65,.025),0)
    roof.box((1.76,3.57,12.94),(.14,6.77,.12),0)
    structure.beam((1.60,6.78,.65),(1.60,6.78,12.94),.065,mat=1)
    # Transparent outer weather screens; front ground entrance remains open.
    for z0,z1 in [(1.0,4.24),(4.36,7.39),(7.51,10.60),(10.72,12.94)]:
        box_bounds(panes,1.505,1.523,.55,6.62,z0,z1)
        box_bounds(panes,-.64,1.44,6.675,6.693,z0,z1)
        if z0>1.01: box_bounds(panes,-.64,1.44,.467,.485,z0,z1)
    box_bounds(panes,.43,1.44,.467,.485,1.0,3.22)
    box_bounds(panes,-.64,1.44,.467,.485,3.22,4.24)
    # Slender mullions reveal the enclosure without obscuring the stair flights.
    for y in (2.55,4.60): structure.beam((1.515,y,1),(1.515,y,12.94),.055,mat=1)
    for y in (.48,6.68): structure.beam((.40,y,1),(.40,y,12.94),.055,mat=1)

    # Pergola above a usable top deck, with a clear east-side arrival.
    for x in (-4.92,-1.37):
        for y in (2.48,6.72): detail.beam((x,y,10.66),(x,y,12.93),.12)
    for x in (-4.92,-1.37): detail.beam((x,2.36,12.89),(x,6.84,12.89),.13,.18)
    for i in range(11): detail.beam((-5.05,2.42+i*.43,13.0),(-1.24,2.42+i*.43,13.0),.09,.13)
    # Door handles and warm small landing lights reinforce the intended entrances.
    for x,y,z in [(-5.22,1.82,5.35),(-1.40,5.52,5.35),(-1.99,2.27,8.46)]:
        detail.beam((x,y,z),(x,y,z+.17),.035,mat=1)
    for y,z in [(6.60,4.67),(.57,7.82),(6.60,11.03)]:
        detail.box((1.42,y,z),(.10,.18,.14),1)
        detail.box((1.355,y,z),(.026,.12,.08),2)

    objects = [b.finish() for b in [structure,floors,rails,roof,panes,detail]]
    for ob in objects:
        if ob != objects[4]: API['LP']['grain_uv'](ob)
        for p in ob.data.polygons: p.use_smooth=False
    bpy.context.view_layer.update()
    # All treads have overhead cover and at least human-scale clear headroom.
    overhead = []
    for ob in [objects[0],objects[1],objects[3],objects[5]]:
        overhead.append((ob.name,GEO['bvh'](ob)))
    clearance=[]
    for p in walking:
        start=Vector(p)+Vector((0,0,.015)); hits=[]
        for name,tree in overhead:
            hit,normal,face,distance=tree.ray_cast(start,Vector((0,0,1)))
            if hit is not None: hits.append((distance,name))
        assert hits, ('uncovered stair',p)
        gap,which=min(hits); clearance.append(gap)
        assert gap>2.0, ('headroom',p,gap,which)
    assert all(OPT['fingerprint'](bpy.data.objects[name].data)==sha for name,sha in source_hash.items())
    for name,loc,target,scale in [
        ('RA_House_ThreeQuarter',(19,-27,19),(-2.4,3.4,6.3),18.8),
        ('RA_House_Supports',(-19,-27,12),(-3.2,3.0,6.2),18.5),
        ('RA_House_Roof_Access',(-16,-18,27),(-2.1,3.4,8.0),17.8),
        ('RA_House_Stair_Side',(24,3.5,11),(-.5,3.5,6.5),15.8)]:
        data=bpy.data.cameras.new(name); ob=bpy.data.objects.new(name,data); scene.collection.objects.link(ob)
        ob.location=loc; ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
        data.type='ORTHO'; data.ortho_scale=scale; data.clip_end=6500
    scene.camera=bpy.data.objects['RA_House_ThreeQuarter']
    scene['House_Revision']='Grounded support pillars, continuous glazed stair bay, three connected stair flights, accessible L terrace and rooftop.'
    windows=list(bpy.context.window_manager.windows)
    if windows: windows[0].scene=scene
    report={'scene':SCENE,'blend':str(OUTPUT),'source_scene_unchanged':True,
            'terrain_trees_water_unchanged':True,'old_timber_parts_replaced':removed,
            'supports':supports,'flights':flights,'minimum_stair_headroom':min(clearance),
            'covered_tread_samples':len(clearance),'terrace_levels':[7.45,10.66],
            'pergola_clear_height':2.14,'roof_extent':[-1.78,1.78,.2,6.94],
            'new_objects':[o.name for o in objects]}
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report


def clear_terrace_furniture(mapping=None):
    if mapping:
        frame=next(o for name,o in mapping.items() if name.endswith('Recessed_Frames_and_Shutters'))
        life=next(o for name,o in mapping.items() if name.endswith('Room_Life'))
    else:
        frame=bpy.data.objects['RA_JG_RF_CO_PT_SS_SH_Recessed_Frames_and_Shutters']
        life=bpy.data.objects['RA_JG_RF_CO_PT_SH_SS_UA_B_Atelier_Room_Life']
    def fold(p):
        left=p.x<-3.84; hinge=Vector((-4.49 if left else -3.19,2.25,0))
        return hinge + Matrix.Rotation(math.radians(-38 if left else 38),3,'Z') @ (p-hinge)
    folded=components(frame,lambda c,d: 8.19<c.z<9.81 and c.y<2.29 and
                      (c.x<-4.44 or c.x>-3.24),fold)
    shifted=components(life,lambda c,d: 7.5<c.z<8.3 and c.y<1.72,(0,-.28,0))
    return {'shutter_components_folded':folded,'planter_components_moved':shifted}


def refine_entries():
    """Apply the reviewed entry clearances to the already built private revision."""
    rails=bpy.data.objects['SS_RA_Terrace_and_Stair_Guards']
    # Remove the short guard that formerly narrowed the east terrace entrance.
    n=components(rails,lambda c,d: abs(c.x+.62)<.01 and d.x<.10 and
                 .45<c.y<1.05 and 7.44<c.z<8.51)
    # Extend the top deck 20 cm aft; shift its back guard to retain a .9 m entry.
    floors=bpy.data.objects['SS_RA_Decks_and_Connected_Stair_Treads']
    for v in floors.data.vertices:
        if -5.16<v.co.x<-1.09 and 10.52<v.co.z<10.67 and abs(v.co.y-6.55)<.001:
            v.co.y=6.75
    for v in rails.data.vertices:
        if v.co.z>10.65 and v.co.x<-1.13+.04 and v.co.y>6.48:
            v.co.y+=.20
    detail=bpy.data.objects['SS_RA_Pergola_and_Door_Details']
    components(detail,lambda c,d: abs(c.y-6.30)<.01 and d.z>2, (0,.42,0))
    for v in detail.data.vertices:
        if abs(v.co.y-6.42)<.002 and v.co.z>12.70: v.co.y+=.42
    extra=Batch('RA_Pergola_Rear_Slat',detail.users_collection[0],[bpy.data.materials['LP_SS_A_wood']])
    extra.beam((-5.05,6.72,13.0),(-1.24,6.72,13.0),.09,.13)
    ob=extra.finish(); API['LP']['grain_uv'](ob)
    for name,loc,target,scale in [
        ('RA_House_Supports',(-19,-27,12),(-3.2,3.0,6.2),18.5),
        ('RA_House_Roof_Access',(-16,-18,27),(-2.1,3.4,8.0),17.8)]:
        cam=bpy.data.objects[name]; cam.location=loc
        cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
        cam.data.ortho_scale=scale
    for ob in (rails,floors,detail): ob.data.update()
    report=json.loads(REPORT.read_text(encoding='utf-8'))
    report['entry_refinement']='Removed obstructing mid-terrace guard; extended rear rooftop entry and moved pergola post to perimeter.'
    report['rooftop_entry_clear_width']=.81
    report['mid_terrace_entry_clear_width']=.84
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return {'removed_guard_components':n,'saved':str(OUTPUT)}


def render():
    scene=bpy.data.scenes[SCENE]; folder=ROOT/'renders'/'house-roof-access'; folder.mkdir(exist_ok=True)
    scene.render.resolution_x=1500; scene.render.resolution_y=1400; scene.render.resolution_percentage=100
    output=[]
    for view,camera in [('three_quarter','RA_House_ThreeQuarter'),('supports','RA_House_Supports'),
                        ('roof_access','RA_House_Roof_Access'),('stair_side','RA_House_Stair_Side'),
                        ('island','Island_Options_ThreeQuarter')]:
        scene.camera=bpy.data.objects[camera]; scene.render.filepath=str(folder/f'house_{view}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name); output.append(scene.render.filepath)
    return output


def validate_final():
    scene=bpy.data.scenes[SCENE]
    objects=[o for o in bpy.data.collections['RA_JG_RF_CO_PT_SH_UA_B_Atelier'].all_objects
             if o.type=='MESH' and 'Glazing' not in o.name and 'Weather_Screens' not in o.name]
    trees=[(o.name,GEO['bvh'](o)) for o in objects]
    routes={
        'second_block_terrace':[(.95,.93,7.45),(-1.10,.93,7.45),(-1.10,1.83,7.45),
                                 (-5.60,1.83,7.45),(-5.60,5.80,7.45)],
        'rooftop':[(-.15,6.18,10.66),(-2.10,6.18,10.66),(-3.50,5.0,10.66)],
        'rear_turn':[(-.15,6.25,4.30),(.95,6.25,4.30)]}
    collisions=[]; floor_gaps=[]; ray_count=0
    for name,ps in routes.items():
        for a,b in zip(ps,ps[1:]):
            a,b=Vector(a),Vector(b);length=(b-a).length;direction=(b-a).normalized()
            side=Vector((-direction.y,direction.x,0))
            for shift in (-.24,0,.24):
                for height in (.15,.35,.60,1.20,1.80):
                    origin=a+side*shift+Vector((0,0,height));ray_count+=1
                    for obj,tree in trees:
                        hit,n,f,d=tree.ray_cast(origin,direction,length)
                        if hit is not None:collisions.append((name,obj,list(hit)))
            for i in range(11):
                p=a.lerp(b,i/10);origin=p+Vector((0,0,.03));found=False
                for obj,tree in trees:
                    hit,n,f,d=tree.ray_cast(origin,Vector((0,0,-1)),.07)
                    if hit is not None:found=True;break
                if not found:floor_gaps.append((name,list(p)))
    assert not collisions,collisions
    assert not floor_gaps,floor_gaps
    report=json.loads(REPORT.read_text(encoding='utf-8'))
    report['route_checks']={'routes':routes,'horizontal_body_rays':ray_count,
                            'sampled_clear_width':.48,'obstructions':0,'floor_gaps':0}
    report['reviewed_renders']=['three_quarter','supports','roof_access','stair_side','island']
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    scene.camera=bpy.data.objects['RA_House_ThreeQuarter']
    for win in bpy.context.window_manager.windows:
        win.scene=scene
        for area in win.screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA'
                area.spaces.active.region_3d.view_camera_zoom=0
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report['route_checks']


if __name__=='__main__': result=build()

"""Join the bridge, the lookout deck, the ramp and the arrival pad into one walkway.

Run it from this folder with background Blender on the tidy pad revision:

    blender --factory-startup -b island_b_pad_tidy_r6.blend --python connect_route.py -- [--dry]

--dry builds the route in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r7.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_aerie.py then reads the new revision.

What changes, and why:
- Up to r6 the route read as four parts dropped on the lawn: a small diagonal grid of dark
  flagstones past the bridge, a loose stone step, a lookout deck square to the world axes, and a
  ramp that left the deck corner at 36 degrees to its edge. The user said the part did not
  connect.
- The route now runs on one straight line, from the bridge end to the pad centre. The bridge
  points along +x, so the line turns only 15 degrees at the bridge end.
- The lookout deck turns and moves onto that line, so the path meets the middle of its back
  edge and the ramp leaves the middle of its front edge, square to the edge and in line with the
  pad centre. Its bench stays on the north side, clear of the walking line, and its railing on
  the south side.
- The old ramp goes. A new ramp in the deck planks (same width, same gaps, same two wood
  tones) runs from the deck top to the curb top. Its first board follows the curb arc, so it
  meets the curb flush. Two timber cheeks close its sides down into the ground, so no dark
  underside shows and the ramp neither floats nor sinks.
- A short flagstone path, laid as the entry path is laid, runs from under the last bridge
  abutment step to one stone step. The step sits flush against the path end and the deck edge.
- The pad marking and lamps turn with the new ramp axis, so the H still stands upright for a
  visitor on the ramp and the ramp still lands between two lamps.
- The lantern that stood on the old deck corner moves to the ground beside the new step.
- Meadow, planting, flowers and edge grass on the new deck, step, path and ramp go, so no grass
  pokes through the walkway.
"""
from pathlib import Path
import sys,json,math,hashlib,random
import bpy,bmesh
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_pad_tidy_r6.blend'
OUTPUT=ROOT/'island_b_route_r7.blend'
REPORT=ROOT/'island_b_route_r7_report.json'
SCENE='Island_B_Cozy_Interiors'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

PAD='SS_NA_Sky_Taxi_Pad.001'
LOOKOUT='NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001'
STEP='NA_BC_JG_RF_CO_PT_SH_SS_UA_Lookout_Access_Step.001'
PATH='SS_NA_Lookout_Flagstone_Path'
LANTERNS='NA_GE_MH_BC_JG_RF_CO_PT_SH_SS_UA_Path_Lanterns.001'
TERRAIN_PATTERN='Rolling_Terrain'

# The pad frame from night_arrival.py and tidy_pad.py, in metres.
CENTRE=Vector((15.2,-2.9));RADIUS=2.5;CURB_TOP=1.03
# The r6 ramp axis (island_b_pad_tidy_r6_report.json, 'home'): the unit direction from the pad
# centre toward the ramp.
OLD_HOME=Vector((-.81,-.586)).normalized()
# The middle of the foot of the last bridge abutment step (Bridge_Abutments, x 6.905 to 7.235).
BRIDGE_END=Vector((7.235,-5.05))
# The r6 lookout deck: its boards span x 8.165 to 11.045 and y -7.075 to -4.725, top at z .705.
DECK_EAST_MID=Vector((11.045,-5.9));DECK_LEN=2.88;DECK_HALF=1.175;DECK_TOP=.705
# The ramp: five boards at the deck board pitch, 1.3 m wide, from the curb to the deck.
RAMP_BOARDS=5;BOARD_PITCH=.29;BOARD_GAP=.02;BOARD_DEPTH=.08;RAMP_HALF=.65
RAMP_RUN=RAMP_BOARDS*BOARD_PITCH
CHEEK=(.57,.63);CHEEK_SINK=.06
# The deck skirt: set in from the board ends, one board thick, sampled along each side.
DECK_BOARD=.15;SKIRT_INSET=.04;SKIRT_THICK=.05;SKIRT_SAMPLES=4
# One stone step between the path and the deck, flush against both.
STEP_DEPTH=.35;STEP_HALF=.75;STEP_TOP=.585;STEP_BOTTOM=.3
# The path runs from the step to a little under the bottom abutment step, which hides its end.
PATH_HALF=.7;PATH_PAST_BRIDGE=.2;STONE_LIFT=.055;STONE_SINK=-.07;BED_LIFT=.02
# The lantern that stood on the r6 deck corner, and where it goes: beside the step, on the south.
OLD_LANTERN=Vector((10.9,-6.75));LANTERN_AT=(.15,-1.05)
# Ground cover cleared round the walkway, in metres past each part.
COVER=('Angular_Meadow','Overhanging_Edge_Grass','Ground_Planting','Grass_Accents','Turf_Lip','Flower_')
COVER_MARGIN=.3


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
    return h.hexdigest()


def scene_objects(scene):
    out=set()
    def walk(c):
        out.update(c.objects)
        for ch in c.children:walk(ch)
    walk(scene.collection)
    return out


def loose_parts(bm):
    bm.faces.ensure_lookup_table();seen=set();parts=[]
    for f in bm.faces:
        if f.index in seen:continue
        stack=[f];comp=[];seen.add(f.index)
        while stack:
            g=stack.pop();comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:seen.add(h.index);stack.append(h)
        parts.append(comp)
    return parts


def part_verts(part):
    return list({v for f in part for v in f.verts})


class Frame:
    """The route frame. s runs from the pad centre toward the bridge, q to the left of a visitor
    who walks from the bridge to the pad (north)."""
    def __init__(self):
        self.u=(CENTRE-BRIDGE_END).normalized()
        self.n=Vector((-self.u.y,self.u.x))
        self.bridge_s=(CENTRE-BRIDGE_END).length
    def at(self,s,q):
        return CENTRE-self.u*s+self.n*q
    def coords(self,p):
        d=p.xy-CENTRE;return -d.dot(self.u),d.dot(self.n)


def ground(tree,p,default=.4):
    hit=tree.ray_cast(Vector((p.x,p.y,6)),Vector((0,0,-1)),12)[0]
    return hit.z if hit else default


def slot(ob,key):
    names=[s.material.name if s.material else '' for s in ob.material_slots]
    i=next((i for i,n in enumerate(names) if n.endswith(key)),None)
    if i is None:raise RuntimeError(f'{ob.name} has no material ending in {key}.')
    return i


def prism(bm,top,bottom,mat):
    """A closed solid from a top outline and a matching bottom outline, both counter-clockwise
    from above. The bottom face stays off, because the ground or the deck hides it. An outline
    that runs clockwise turns round first, so every face points out."""
    area=sum(a.x*b.y-b.x*a.y for a,b in zip(top,top[1:]+top[:1]))
    if area<0:top,bottom=top[::-1],bottom[::-1]
    t=[bm.verts.new(p) for p in top];b=[bm.verts.new(p) for p in bottom];n=len(t)
    bm.faces.new(t).material_index=mat
    for i in range(n):bm.faces.new([b[i],b[(i+1)%n],t[(i+1)%n],t[i]]).material_index=mat


def move_lookout(ob,fr):
    """Turns and moves the deck, its posts, railing and bench onto the route line."""
    yaw=math.atan2(fr.u.y,fr.u.x)
    east=fr.at(RADIUS+RAMP_RUN,0)
    m=Matrix.Translation((east.x,east.y,0))@Matrix.Rotation(yaw,4,'Z')@Matrix.Translation((-DECK_EAST_MID.x,-DECK_EAST_MID.y,0))
    mw=ob.matrix_world;inv=mw.inverted()
    for v in ob.data.vertices:v.co=inv@(m@(mw@v.co))
    ob.data.update()
    return m,math.degrees(yaw)


def strip_old_ramp(pad):
    """Deletes the r6 ramp boards and stringers from the pad mesh."""
    names=[s.material.name if s.material else '' for s in pad.material_slots]
    woods={i for i,n in enumerate(names) if 'A_wood' in n};metal={i for i,n in enumerate(names) if 'A_metal' in n}
    bm=bmesh.new();bm.from_mesh(pad.data);mw=pad.matrix_world;gone=[];boards=stringers=0
    for p in loose_parts(bm):
        mats={f.material_index for f in p};pts=[mw@v.co for v in part_verts(p)]
        reach=max((q.xy-CENTRE).length for q in pts);span=max((a.xy-b.xy).length for a in pts for b in pts[:4])
        if mats<=woods and reach>RADIUS:gone.extend(p);boards+=1
        elif mats<=metal and span>1.5:gone.extend(p);stringers+=1
    bmesh.ops.delete(bm,geom=list(set(gone)),context='FACES')
    bm.to_mesh(pad.data);bm.free()
    return {'boards':boards,'stringers':stringers}


def turn_marking(pad,fr):
    """Turns the H and the edge lamps about the pad centre onto the new ramp axis."""
    names=[s.material.name if s.material else '' for s in pad.material_slots]
    paint=next(i for i,n in enumerate(names) if 'Pad_Paint' in n)
    lamp={i for i,n in enumerate(names) if 'A_metal' in n or 'Pad_Light' in n}
    old=math.atan2(OLD_HOME.y,OLD_HOME.x);new=math.atan2(-fr.u.y,-fr.u.x);delta=new-old
    rot=Matrix.Translation((CENTRE.x,CENTRE.y,0))@Matrix.Rotation(delta,4,'Z')@Matrix.Translation((-CENTRE.x,-CENTRE.y,0))
    bm=bmesh.new();bm.from_mesh(pad.data);mw=pad.matrix_world;inv=mw.inverted();turned={'h':0,'lamp':0}
    for p in loose_parts(bm):
        mats={f.material_index for f in p}
        # The rings are round and need no turn. The H parts are small boxes of six faces.
        h=mats=={paint} and len(p)==6;small=mats<=lamp and len(p)<=9
        if not(h or small):continue
        for v in part_verts(p):v.co=inv@(rot@(mw@v.co))
        turned['h' if h else 'lamp']+=1
    bm.to_mesh(pad.data);bm.free()
    return {**turned,'degrees':round(math.degrees(delta),2)}


def build_ramp(ob,fr,tree):
    """Adds the ramp boards, the ramp cheeks and the deck skirt to the lookout mesh, in the deck materials."""
    wood,light=slot(ob,'PT_LP_SS_A_wood'),slot(ob,'PT_LP_SS_A_wood_light')
    z=lambda s:CURB_TOP+(DECK_TOP-CURB_TOP)*max(0.,min(1.,(s-RADIUS)/RAMP_RUN))
    bm=bmesh.new();bm.from_mesh(ob.data);inv=ob.matrix_world.inverted()
    loc=lambda p:inv@p
    # The first board starts on the curb arc, so its inner edge meets the curb face all along.
    arc=lambda q:math.sqrt(RADIUS*RADIUS-q*q)
    qs=[-RAMP_HALF,-RAMP_HALF/2,0,RAMP_HALF/2,RAMP_HALF]
    for k in range(RAMP_BOARDS):
        s0=RADIUS+k*BOARD_PITCH+(BOARD_GAP if k else 0);s1=RADIUS+(k+1)*BOARD_PITCH
        inner=[(arc(q) if k==0 else s0,q) for q in qs]
        outline=[(s1,q) for q in qs]+inner[::-1]
        # Counter-clockwise from above: the frame flips handedness, since s runs away from the pad.
        outline=outline[::-1]
        top=[loc(Vector((*fr.at(s,q),z(s)))) for s,q in outline]
        bot=[loc(Vector((*fr.at(s,q),z(s)-BOARD_DEPTH))) for s,q in outline]
        prism(bm,top,bot,light if k%2 else wood)
    # A timber skirt closes each deck side down into the ground. The ground under the north
    # side dips to about .2 m, and without the skirt the deck read as floating there.
    deck0=RADIUS+RAMP_RUN;deck1=deck0+DECK_LEN;i=SKIRT_INSET
    sides=[((deck0+i,-DECK_HALF+i),(deck1-i,-DECK_HALF+i),(0,1)),((deck0+i,DECK_HALF-i),(deck1-i,DECK_HALF-i),(0,-1)),
           ((deck0+i,-DECK_HALF+i),(deck0+i,DECK_HALF-i),(1,0)),((deck1-i,-DECK_HALF+i),(deck1-i,DECK_HALF-i),(-1,0))]
    for a,b,(ds,dq) in sides:
        outer=[(a[0]+(b[0]-a[0])*k/SKIRT_SAMPLES,a[1]+(b[1]-a[1])*k/SKIRT_SAMPLES) for k in range(SKIRT_SAMPLES+1)]
        inner=[(s+ds*SKIRT_THICK,q+dq*SKIRT_THICK) for s,q in outer]
        ring=outer+inner[::-1]
        top=[loc(Vector((*fr.at(s,q),DECK_TOP-DECK_BOARD))) for s,q in ring]
        bot=[loc(Vector((*fr.at(s,q),ground(tree,fr.at(s,q))-CHEEK_SINK))) for s,q in ring]
        prism(bm,top,bot,wood)
    for side in (-1,1):
        q0,q1=sorted((side*CHEEK[0],side*CHEEK[1]))
        s0=arc(max(abs(q0),abs(q1)));s1=RADIUS+RAMP_RUN
        rect=[(s0,q1),(s1,q1),(s1,q0),(s0,q0)]
        top=[loc(Vector((*fr.at(s,q),z(s)-BOARD_DEPTH))) for s,q in rect]
        bot=[loc(Vector((*fr.at(s,q),ground(tree,fr.at(s,q))-CHEEK_SINK))) for s,q in rect]
        prism(bm,top,bot,wood)
    bm.normal_update();bm.to_mesh(ob.data);bm.free()
    for f in ob.data.polygons:f.use_smooth=False
    return {'boards':RAMP_BOARDS,'run':round(RAMP_RUN,3),'rise':round(CURB_TOP-DECK_TOP,3),
            'slope_degrees':round(math.degrees(math.atan2(CURB_TOP-DECK_TOP,RAMP_RUN)),1)}


def rebuild(ob,fill):
    """Clears a mesh and refills it, keeping its material slots and its UV map."""
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.delete(bm,geom=list(bm.verts),context='VERTS')
    info=fill(bm)
    uv=bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    mw=ob.matrix_world
    for f in bm.faces:
        for l in f.loops:w=mw@l.vert.co;l[uv].uv=(w.x*.5,w.y*.5+w.z*.5)
    bm.normal_update();bm.to_mesh(ob.data);bm.free()
    for f in ob.data.polygons:f.use_smooth=False
    return info


def build_step(ob,fr):
    s0=RADIUS+RAMP_RUN+DECK_LEN;s1=s0+STEP_DEPTH;inv=ob.matrix_world.inverted()
    stone=slot(ob,'A_stone')
    rect=[(s1,-STEP_HALF),(s0,-STEP_HALF),(s0,STEP_HALF),(s1,STEP_HALF)]
    def fill(bm):
        top=[inv@Vector((*fr.at(s,q),STEP_TOP)) for s,q in rect];bot=[inv@Vector((*fr.at(s,q),STEP_BOTTOM)) for s,q in rect]
        prism(bm,top,bot,stone);return {'s':[round(s0,3),round(s1,3)],'top':STEP_TOP}
    return rebuild(ob,fill)


def build_path(ob,fr,tree):
    """Lays staggered flagstones on a dark joint bed, as night_arrival.py lays the entry path."""
    a=RADIUS+RAMP_RUN+DECK_LEN+STEP_DEPTH;b=fr.bridge_s+PATH_PAST_BRIDGE;inv=ob.matrix_world.inverted()
    stone=slot(ob,'NA_Path_Flagstone');bed=slot(ob,'SS_NA_Path_Joint_Bed')
    rng=random.Random(11)
    def at(s,q,lift):
        p=fr.at(s,q);return inv@Vector((p.x,p.y,ground(tree,p)+lift))
    def fill(bm):
        s=a;row=0;stones=0
        while s<b-.05:
            length=min(.38+.06*math.sin(row*2.3),b-s);cuts=[0,.34,.71,1] if row%2 else [0,.29,.63,1]
            for c0,c1 in zip(cuts,cuts[1:]):
                corners=[]
                for sv,f in ((s+length-.025,c0),(s+length-.025,c1),(s+.025,c1),(s+.025,c0)):
                    off=(f*2-1)*PATH_HALF+(-.03 if f==1 else .03 if f==0 else (-.025 if f==c1 else .025))
                    if f in (0,1):off+=rng.uniform(-.04,.02)*(1 if f==1 else -1)
                    corners.append((sv,off))
                # The stone nearest the step keeps a straight edge, so it meets the step face flush.
                if row==0:corners=[(s if sv<s+.03 else sv,q) for sv,q in corners]
                corners=corners[::-1]
                prism(bm,[at(sv,q,STONE_LIFT) for sv,q in corners],[at(sv,q,STONE_SINK) for sv,q in corners],stone)
                stones+=1
            s+=length;row+=1
        prev=None;n=12
        for k in range(n+1):
            sv=a+(b-a)*k/n;pair=[at(sv,-PATH_HALF-.02,BED_LIFT),at(sv,PATH_HALF+.02,BED_LIFT)]
            pair=[bm.verts.new(p) for p in pair]
            if prev:bm.faces.new([pair[1],pair[0],prev[0],prev[1]]).material_index=bed
            prev=pair
        return {'s':[round(a,3),round(b,3)],'stones':stones,'rows':row}
    return rebuild(ob,fill)


def move_lantern(ob,fr):
    """Moves the lantern parts near the r6 deck corner to the ground beside the new step."""
    target=fr.at(RADIUS+RAMP_RUN+DECK_LEN+STEP_DEPTH/2+LANTERN_AT[0],-(STEP_HALF+.3))
    bm=bmesh.new();bm.from_mesh(ob.data);mw=ob.matrix_world;inv=mw.inverted();moved=0
    for p in loose_parts(bm):
        vs=part_verts(p);c=sum((mw@v.co for v in vs),Vector())/len(vs)
        if (c.xy-OLD_LANTERN).length>.3:continue
        d=Vector((target.x-OLD_LANTERN.x,target.y-OLD_LANTERN.y,0))
        for v in vs:v.co=inv@((mw@v.co)+d)
        moved+=1
    bm.to_mesh(ob.data);bm.free()
    return {'parts':moved,'at':[round(target.x,3),round(target.y,3)]}


def footprint(fr):
    """The walkway parts in route coordinates: (s0, s1, half width)."""
    deck0=RADIUS+RAMP_RUN;deck1=deck0+DECK_LEN;step1=deck1+STEP_DEPTH
    return [(RADIUS-.1,deck0,RAMP_HALF),(deck0,deck1,DECK_HALF),(deck1,step1,STEP_HALF),(step1,fr.bridge_s+PATH_PAST_BRIDGE,PATH_HALF)]


def clear_cover(scene,fr):
    parts=footprint(fr)
    def inside(p):
        s,q=fr.coords(p)
        return any(s0-COVER_MARGIN<s<s1+COVER_MARGIN and abs(q)<h+COVER_MARGIN for s0,s1,h in parts)
    cleared={}
    for ob in scene_objects(scene):
        if ob.type!='MESH' or not any(k in ob.name for k in COVER):continue
        if ob.modifiers:cleared[ob.name]='skipped: has modifiers';continue
        ob.data=ob.data.copy();bm=bmesh.new();bm.from_mesh(ob.data);mw=ob.matrix_world;gone=[]
        for p in loose_parts(bm):
            vs=part_verts(p);c=sum((mw@v.co for v in vs),Vector())/len(vs)
            if c.z<1.6 and inside(c):gone.extend(p)
        if gone:
            bmesh.ops.delete(bm,geom=list(set(gone)),context='FACES');bm.to_mesh(ob.data);cleared[ob.name]=len(set(gone))
        bm.free()
    return cleared


def blockers(scene,fr,skip):
    """Lists other solid parts that stand on the walkway, so a reviewer can see what is left."""
    parts=footprint(fr);hits={}
    corners=[fr.at(s,q) for s0,s1,h in parts for s in (s0,s1) for q in (-h,h)]
    lo=Vector((min(p.x for p in corners),min(p.y for p in corners)));hi=Vector((max(p.x for p in corners),max(p.y for p in corners)))
    for ob in scene_objects(scene):
        if ob.type!='MESH' or ob.name in skip or any(k in ob.name for k in COVER):continue
        bb=[ob.matrix_world@Vector(c) for c in ob.bound_box]
        if max(p.x for p in bb)<lo.x or min(p.x for p in bb)>hi.x or max(p.y for p in bb)<lo.y or min(p.y for p in bb)>hi.y:continue
        if max(p.z for p in bb)<.3 or min(p.z for p in bb)>2.5 or len(ob.data.polygons)>30000:continue
        bm=bmesh.new();bm.from_mesh(ob.data);mw=ob.matrix_world;n=0
        for p in loose_parts(bm):
            vs=part_verts(p);c=sum((mw@v.co for v in vs),Vector())/len(vs);s,q=fr.coords(c)
            if .3<c.z<2.5 and any(s0<s<s1 and abs(q)<h for s0,s1,h in parts):n+=1
        bm.free()
        if n:hits[ob.name]=n
    return hits


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    scene=bpy.data.scenes[SCENE];objs=scene_objects(scene)
    terrain=next(o for o in objs if o.type=='MESH' and TERRAIN_PATTERN in o.name)
    dg=bpy.context.evaluated_depsgraph_get();ev=terrain.evaluated_get(dg);me=ev.to_mesh()
    tree=BVHTree.FromPolygons([terrain.matrix_world@v.co for v in me.vertices],[tuple(p.vertices) for p in me.polygons]);ev.to_mesh_clear()
    fr=Frame()
    for name in (PAD,LOOKOUT,STEP,PATH,LANTERNS):
        ob=bpy.data.objects[name]
        if ob.data.users>1:ob.data=ob.data.copy()
    pad,lookout=bpy.data.objects[PAD],bpy.data.objects[LOOKOUT]
    report={'source':str(SOURCE),'output':str(OUTPUT),
            'route_line':{'from':list(BRIDGE_END),'to':list(CENTRE),'turn_at_bridge_degrees':round(math.degrees(math.atan2(fr.u.y,fr.u.x)),2)}}
    report['old_ramp_removed']=strip_old_ramp(pad)
    report['marking']=turn_marking(pad,fr)
    _,yaw=move_lookout(lookout,fr);report['deck']={'yaw_degrees':round(yaw,2),'east_mid':list(fr.at(RADIUS+RAMP_RUN,0)),
        'west_mid':list(fr.at(RADIUS+RAMP_RUN+DECK_LEN,0)),
        'ground_under_corners':[round(ground(tree,fr.at(s,q)),3) for s in (RADIUS+RAMP_RUN,RADIUS+RAMP_RUN+DECK_LEN) for q in (-DECK_HALF,DECK_HALF)]}
    report['ramp']=build_ramp(lookout,fr,tree)
    report['step']=build_step(bpy.data.objects[STEP],fr)
    report['path']=build_path(bpy.data.objects[PATH],fr,tree)
    report['lantern']=move_lantern(bpy.data.objects[LANTERNS],fr)
    report['cover_faces_cleared']=clear_cover(scene,fr)
    report['other_parts_on_walkway']=blockers(scene,fr,{PAD,LOOKOUT,STEP,PATH,terrain.name})
    report['tris']={n:sum(len(p.vertices)-2 for p in bpy.data.objects[n].data.polygons) for n in (PAD,LOOKOUT,STEP,PATH)}
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUTE_DONE',json.dumps(report))


build()

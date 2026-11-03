"""Round 14 pass on the tower frame, the roof edge and the walkway.

Run it from this folder with background Blender on the round 13 revision:

    blender --factory-startup -b island_b_route_r20.blend --python round14_frame.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r21.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_aerie.py then reads the new revision.

What changes, and why (the round 10 review of the site look):
- The flat roof hovered on a pergola of bare posts. Five slim posts in the middle of the stair
  tower faces go, so only the four corner posts carry the tower. Two timber rafters run under
  the slab over the house terrace and two beams join them to the tower, so the slab reads as a
  built roof on a frame. The fascia band of the slab drops a little lower, so the roof edge
  reads as one crisp metal band.
- The three glass screens around the open tower top above the terrace read as a lighter teal
  pane under the roof (S1). They go, and the tower top stays open under the roof.
- Every post and beam of the tower frame and the pergola gets a small chamfer on each edge, so
  the timber reads as planed posts with soft lit edges and not as sharp boxes.
- The ramp boards to the pad stepped up in level boards, and the steps drew triangle seams
  on the ramp top (S10). Each board now lies on one sloped plane from the deck top to the pad
  rim, and the side skirts follow that plane.
- The bridge end stepped down in three stone blocks, and the middle block stood proud of the
  paving (S10). The middle block goes, the top block sits under the last bridge plank only, and
  the low block becomes one landing flush with the paving.
- The round 13 flare pushed the pad footing rock out of the lawn on the side toward the deck,
  where it showed as a dark angular shard (S10). The flare is undone on that side.
- Three contact shadow empties sit along the front edge of the lookout deck, so the deck sits
  on the grass and does not float (S10).
"""
from pathlib import Path
import sys,json,hashlib,math
import bpy,bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r20.blend'
OUTPUT=ROOT/'island_b_route_r21.blend'
REPORT=ROOT/'island_b_route_r21_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

CANOPY='DR_GE_MH_SS_RA_Continuous_Stair_Canopy'
FRAME='DR_SS_GE_Slender_Recessed_Structure'
PERGOLA='DR_GE_MH_SS_RA_Pergola_and_Door_Details'
SCREENS='DR_GE_MH_SS_RA_Stair_Weather_Screens'
LOOKOUT='NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001'
ABUTMENTS='NA_BC_JG_RF_CO_PT_SH_SS_UA_Bridge_Abutments.001'
PAD='SS_NA_Sky_Taxi_Pad.001'
FRAME_MATERIAL='LP_SS_A_metal'
WOOD_MATERIAL='LP_SS_A_wood'
ROOF_MATERIAL='LP_SS_A_roof_edge'

# The roof slab of round 12: footprint, eave height and thickness. The fascia band now drops
# FASCIA[1] below the slab and rises FASCIA[2] above it, FASCIA[0] deep.
ROOF_X=(-8.5,.08);ROOF_Y=(-1.12,6.25);EAVE_Z=12.88;SLAB=.16;FASCIA=(.05,.1,.03)
# The timber under the slab: a section of BEAM metres wide and BEAM_DEPTH deep, as
# (x0, y0, x1, y1). The two rafters run the full depth of the slab over the pergola posts.
# The two beams join the pergola post line to the west face of the stair tower.
BEAM=.16;BEAM_DEPTH=.22
BEAMS=((-6.92,-1.05,-6.92,6.18),(-3.37,-1.05,-3.37,6.18),(-6.92,1.48,-2.71,1.48),(-6.92,5.72,-2.71,5.72))
# The tower posts that stay: the four corners, as (x, y). A tall post elsewhere that reaches
# the roof (above TOWER_TOP) goes. The two posts under the front decks stop at 7.35 and stay.
CORNERS=((-2.71,.65),(-.49,-.52),(-2.71,5.68),(-.49,5.68))
TALL=5.0;TOWER_TOP=12.0
# The glass screens above this height go.
SCREEN_TOP=10.7
# The chamfer on each edge of a frame box, in metres. The site thickens each post about
# 3.5 times (aerie-look.js), so the chamfer reads about 4 cm on a 21 cm post.
CHAMFER=.012
# The ramp: its run direction in plan, the deck top it starts from and the pad rim it ends
# on, and the ramp parts (boards and skirts) by their box: x from RAMP_X, z above RAMP_Z.
RAMP_DIR=Vector((.966,.259));RAMP_LOW=.585;RAMP_HIGH=1.03;RAMP_X=11.1;RAMP_Z=.4
# A skirt runs longer than SKIRT_RUN along x, so the rail posts at the ramp foot stay put.
SKIRT_DROP=.03;SKIRT_RUN=1.0
# The east bridge-end blocks, by their box centre x: the top block, the middle and the low.
ABUT_TOP=6.36;ABUT_MID=6.79;ABUT_LOW=7.07
# The top block ends under the last bridge plank (x 6.51) and its top meets the plank foot.
ABUT_TOP_X=6.53;ABUT_TOP_Z=.83
# The landing: from the top block to the path, flush with the paving top.
PATH_TOP=.585
# The round 13 flare (round13_route.py), undone on the side that faces the deck.
CENTRE=Vector((15.2,-2.9));FLARE_TOP=.58;FLARE_RATE=.55;FLARE_DEPTH=1.2;FLARE_R=(.6,2.0)
UNDO_SIDE=(-.15,-.45)
# Shadows along the deck front, in Blender metres: (name, x, y, z, half length, half width).
DECK_TURN=math.atan2(RAMP_DIR.y,RAMP_DIR.x)
DECK_SHADOWS=(('Shadow_Deck_Front_1',9.35,-5.62,.57,.95,.32),('Shadow_Deck_Front_2',10.55,-5.3,.57,.95,.32),
              ('Shadow_Ramp_Side',12.2,-4.62,.6,.9,.3))


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
    return h.hexdigest()


def smooth(a,b,x):
    t=min(max((x-a)/(b-a),0.0),1.0)
    return t*t*(3-2*t)


def single(obj):
    if obj.data.users>1:obj.data=obj.data.copy()
    return obj


def parts(bm):
    """The loose parts of a bmesh, each a list of vertices."""
    seen=set();out=[]
    for v in bm.verts:
        if v in seen:continue
        stack=[v];part=[];seen.add(v)
        while stack:
            u=stack.pop();part.append(u)
            for e in u.link_edges:
                w=e.other_vert(u)
                if w not in seen:seen.add(w);stack.append(w)
        out.append(part)
    return out


def bounds(part,mw):
    ws=[mw@v.co for v in part]
    return Vector(map(min,*ws)),Vector(map(max,*ws))


def slot(obj,name):
    names=[s.material.name if s.material else '' for s in obj.material_slots]
    if name in names:return names.index(name)
    obj.data.materials.append(bpy.data.materials[name])
    return len(obj.data.materials)-1


def box(bm,lo,hi,mat,inv):
    """A box from world corner lo to world corner hi, in mesh space."""
    out=bmesh.ops.create_cube(bm,size=1)['verts']
    for v in out:
        v.co=inv@Vector((lo.x if v.co.x<0 else hi.x,lo.y if v.co.y<0 else hi.y,lo.z if v.co.z<0 else hi.z))
    for f in {f for v in out for f in v.link_faces}:f.material_index=mat
    return out


def edit(obj,fn):
    """Runs fn(bm, matrix_world) on the mesh of obj and writes the result back."""
    single(obj);bm=bmesh.new();bm.from_mesh(obj.data)
    out=fn(bm,obj.matrix_world)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
    bm.normal_update();bm.to_mesh(obj.data);bm.free();obj.data.update()
    return out


def drop_screens(bm,mw):
    gone=[p for p in parts(bm) if bounds(p,mw)[0].z>SCREEN_TOP]
    bmesh.ops.delete(bm,geom=[v for p in gone for v in p],context='VERTS')
    return len(gone)


def is_corner(lo,hi):
    c=(lo+hi)/2
    return any((c.x-x)**2+(c.y-y)**2<.01 for x,y in CORNERS)


def frame(bm,mw,mat,drop_posts):
    """Drops the slim tall posts that are not tower corners, then chamfers every frame box."""
    dropped=0;chamfered=0
    for p in parts(bm):
        lo,hi=bounds(p,mw)
        if drop_posts and hi.z-lo.z>TALL and hi.z>TOWER_TOP and not is_corner(lo,hi):
            bmesh.ops.delete(bm,geom=p,context='VERTS');dropped+=1
    for p in parts(bm):
        faces={f for v in p for f in v.link_faces}
        if len(p)!=8 or any(f.material_index!=mat for f in faces):continue
        edges=list({e for v in p for e in v.link_edges})
        bmesh.ops.bevel(bm,geom=edges,offset=CHAMFER,segments=1,profile=.5,affect='EDGES',clamp_overlap=True)
        chamfered+=1
    return {'dropped_posts':dropped,'chamfered':chamfered}


def roof(obj):
    """Rebuilds the slab with a deeper fascia band, and adds the timber frame under it."""
    single(obj)
    roof_slot=slot(obj,ROOF_MATERIAL);fascia_slot=slot(obj,FRAME_MATERIAL);wood=slot(obj,WOOD_MATERIAL)
    inv=obj.matrix_world.inverted()
    x0,x1=ROOF_X;y0,y1=ROOF_Y;top=EAVE_Z+SLAB
    bm=bmesh.new()
    box(bm,Vector((x0,y0,EAVE_Z)),Vector((x1,y1,top)),roof_slot,inv)
    d,drop,rise=FASCIA;zlo,zhi=EAVE_Z-drop,top+rise
    box(bm,Vector((x0-d,y0-d,zlo)),Vector((x1+d,y0,zhi)),fascia_slot,inv)
    box(bm,Vector((x0-d,y1,zlo)),Vector((x1+d,y1+d,zhi)),fascia_slot,inv)
    box(bm,Vector((x0-d,y0,zlo)),Vector((x0,y1,zhi)),fascia_slot,inv)
    box(bm,Vector((x1,y0,zlo)),Vector((x1+d,y1,zhi)),fascia_slot,inv)
    h=BEAM/2
    for bx0,by0,bx1,by1 in BEAMS:
        lo=Vector((min(bx0,bx1)-h,min(by0,by1)-h,EAVE_Z-BEAM_DEPTH));hi=Vector((max(bx0,bx1)+h,max(by0,by1)+h,EAVE_Z))
        box(bm,lo,hi,wood,inv)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
    bm.normal_update();bm.to_mesh(obj.data);bm.free()
    return {'fascia':[round(zlo,3),round(zhi,3)],'beams':len(BEAMS),'faces':len(obj.data.polygons)}


def ramp(bm,mw):
    """Lays every ramp board on one plane from the deck top to the pad rim."""
    inv=mw.inverted();boards=[];skirts=[]
    for p in parts(bm):
        lo,hi=bounds(p,mw)
        if lo.x<RAMP_X or hi.z<RAMP_Z:continue
        if len(p)==20:boards.append(p)
        elif hi.x-lo.x>SKIRT_RUN:skirts.append(p)
    run=lambda w:w.x*RAMP_DIR.x+w.y*RAMP_DIR.y
    ss=[run(mw@v.co) for p in boards for v in p]
    s0,s1=min(ss),max(ss)
    plane=lambda s:RAMP_LOW+(RAMP_HIGH-RAMP_LOW)*(s-s0)/(s1-s0)
    for p in boards:
        cols={}
        for v in p:
            w=mw@v.co;key=(round(w.x,3),round(w.y,3))
            cols[key]=max(cols.get(key,-1e9),w.z)
        for v in p:
            w=mw@v.co;top=cols[(round(w.x,3),round(w.y,3))]
            w.z=plane(run(w))-(top-w.z);v.co=inv@w
    for p in skirts:
        lo,hi=bounds(p,mw);mid=(lo.z+hi.z)/2
        for v in p:
            w=mw@v.co
            if w.z>mid:w.z=plane(run(w))-SKIRT_DROP;v.co=inv@w
    return {'boards':len(boards),'skirts':len(skirts),'run':[round(s0,3),round(s1,3)]}


def abutments(bm,mw):
    """Turns the east bridge-end blocks into the plank seat and one flush landing."""
    inv=mw.inverted();found={}
    for p in parts(bm):
        lo,hi=bounds(p,mw);cx=(lo.x+hi.x)/2
        for name,x in (('top',ABUT_TOP),('mid',ABUT_MID),('low',ABUT_LOW)):
            if abs(cx-x)<.05:found[name]=(p,lo,hi)
    assert set(found)=={'top','mid','low'},sorted(found)
    p,lo,hi=found['top']
    for v in p:
        w=mw@v.co
        if w.x>(lo.x+hi.x)/2:w.x=ABUT_TOP_X
        if w.z>(lo.z+hi.z)/2:w.z=ABUT_TOP_Z
        v.co=inv@w
    _,mlo,mhi=found['mid']
    p,lo,hi=found['low']
    for v in p:
        w=mw@v.co
        if w.x<(lo.x+hi.x)/2:w.x=ABUT_TOP_X
        if w.z>(lo.z+hi.z)/2:w.z=PATH_TOP
        w.y=mlo.y if w.y<(lo.y+hi.y)/2 else mhi.y
        v.co=inv@w
    bmesh.ops.delete(bm,geom=found['mid'][0],context='VERTS')
    return {'top_block_end':ABUT_TOP_X,'landing_top':PATH_TOP}


def unflare(obj):
    """Undoes the round 13 footing flare on the side of the pad that faces the deck."""
    single(obj)
    idx=[s.material.name if s.material else '' for s in obj.material_slots].index('LP_SS_A_stone')
    foot={i for p in obj.data.polygons if p.material_index==idx for i in p.vertices}
    mw=obj.matrix_world;inv=mw.inverted();moved=0;pull=0.0
    push=lambda z,r:FLARE_RATE*min(FLARE_TOP-z,FLARE_DEPTH)*smooth(FLARE_R[0],FLARE_R[1],r)
    for i in foot:
        v=obj.data.vertices[i];w=mw@v.co
        if w.z>=FLARE_TOP:continue
        d=Vector((w.x-CENTRE.x,w.y-CENTRE.y));r=d.length
        if r<1e-3:continue
        side=smooth(UNDO_SIDE[0],UNDO_SIDE[1],d.x/r)
        if side<=0:continue
        old=r
        for _ in range(12):old=r-push(w.z,old)
        new=r+(old-r)*side
        w.x=CENTRE.x+d.x/r*new;w.y=CENTRE.y+d.y/r*new;v.co=inv@w
        moved+=1;pull=max(pull,r-new)
    obj.data.update()
    return {'moved':moved,'max_pull':round(pull,3)}


def deck_shadows(scene):
    made={}
    for name,x,y,z,rx,ry in DECK_SHADOWS:
        e=bpy.data.objects.new(name,None);e.empty_display_type='CIRCLE'
        e.location=(x,y,z+.012);e.scale=(rx,ry,1);e.rotation_euler=(0,0,DECK_TURN)
        scene.collection.objects.link(e);made[name]=[x,y,z,rx,ry]
    return made


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    scene=bpy.data.scenes['Island_B_Cozy_Interiors']
    ob=bpy.data.objects
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['screens_dropped']=edit(ob[SCREENS],drop_screens)
    report['frame']=edit(ob[FRAME],lambda bm,mw:frame(bm,mw,slot(ob[FRAME],FRAME_MATERIAL),True))
    report['pergola']=edit(ob[PERGOLA],lambda bm,mw:frame(bm,mw,slot(ob[PERGOLA],FRAME_MATERIAL),False))
    report['roof']=roof(ob[CANOPY])
    report['ramp']=edit(ob[LOOKOUT],ramp)
    report['abutments']=edit(ob[ABUTMENTS],abutments)
    report['unflare']=unflare(ob[PAD])
    report['shadows']=deck_shadows(scene)
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND14_DONE',json.dumps(report))


build()

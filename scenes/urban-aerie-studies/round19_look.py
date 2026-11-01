"""Round 19 pass on the roof edge, the deck to pad ramp, the paving front and the pad wedge.

Run it from this folder with background Blender on the round 18 revision:

    blender --factory-startup -b island_b_route_r30.blend --python round19_look.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r33.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why (the round 14 review shots of the look-v2 series):
- The user asked for a flat modern roof. The review read the thin slab as a sheet that floats on
  the posts (S1, S6), and asked for a crisp continuous fascia with a parapet. The metal fascia now
  runs from the beam tops up to ROOF_FASCIA[1], so it stands a few centimetres above the membrane
  as a low parapet and closes the gap down to the beams.
- The front edge of the ramp sat a little behind the front edge of the deck, so the walkway
  showed a jog where the deck ends (S10). The ramp sides now move out to the deck sides.
- The ramp head stopped 4 cm under the top of the metal pad rim, so the boards read as if they
  ran under the rim (S9, S10). The head now meets the curb circle and rises to the rim top over
  its last HEAD_RUN metres, so the ramp lands on the rim.
- The flagstone paving stood proud of the lawn along its south side, a visible lip (S10). The
  lawn in front of it rises to just under the paving top.
- The rock wedge in the notch west of the pad lobe had a flat lawn top under the lawn on each
  side. It read as a large pale angular slab with sliver edges (S5, S9). Its top now takes the
  cliff stone and drops well under the lawn lip, sloping down and out, so it reads as a cleft
  in the cliff between the island and the pad lobe. The first pass wrote island_b_route_r31.blend
  with a level stone top at 0.3 m, and the second wrote r32 with a top that sloped from 0.25 m.
  Both tops still caught the moon as a pale slab (S9), so nothing reads r31 or r32 now.
"""
from pathlib import Path
import sys,json,hashlib,math
import bpy,bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r30.blend'
OUTPUT=ROOT/'island_b_route_r33.blend'
REPORT=ROOT/'island_b_route_r33_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

TERRAIN='RR_Island_B5_Rolling_Terrain'
ROOF='DR_GE_MH_SS_RA_Continuous_Stair_Canopy'
LOOKOUT='NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001'
PAVING=('NA_BC_JG_RF_CO_PT_SH_SS_UA_Lookout_Access_Step.001','SS_NA_Lookout_Flagstone_Path')
GRASS_PREFIX=('B4_Faceted_LP_SS_A_grass','B4_Faceted_JG_Faceted_Grass')
CLIFF='NA_B2_Unbanded_Stone_1.003'

# The roof fascia (round18_look.py set it to 12.92 to 13.04 m). Its new bottom meets the beam tops,
# and its top stands PARAPET above the membrane top at 13.03 m.
ROOF_FASCIA=(12.88,13.11)
# The ramp frame (round17_route.py): the foot of its front side, the run and the outward side.
# Ramp parts start east of RAMP_WEST. The deck boards stand at DECK_TOP.
RAMP_FOOT=Vector((11.556,-4.557));RAMP_RUN=Vector((.966,.259));RAMP_OUT=Vector((.259,-.966))
RAMP_WEST=11.15;DECK_TOP=.585;SKIRT_LOW=.3
# The pad centre in plan, its curb radius and the top of the metal rim on the curb.
PAD_CENTRE=Vector((15.2,-2.9));PAD_CURB=2.5;RIM_TOP=.69
# The ramp head rises to RIM_TOP over its last HEAD_RUN metres of run.
HEAD_RUN=.9
# The lawn under the ramp drops UNDER below the board top, so no lawn shows through the boards.
UNDER=.04;LAWN_FLOOR=.2
# The lawn south of the paving: the paving x range, its south edge, the reach of the rise and
# the most any lawn vertex rises. The lawn top ends PAVE_GAP under the paving top.
PAVE_X=(6.7,9.0);PAVE_SOUTH=-5.85;PAVE_REACH=.7;PAVE_LIFT=.22;PAVE_GAP=.012
# The rock wedge (round16_look.py): its plan outline and the height band of its lawn top.
# round17_route.py raised the lawn top to the lawn level. The new top slopes from WEDGE_TOP at
# its north edge, under the lawn lip by the ramp, down to WEDGE_LOW at its south edge.
WEDGE=((11.6,-5.45),(12.9,-5.3),(14.2,-5.45),(14.6,-6.3),(13.9,-7.1),(12.6,-7.2),(11.7,-6.6))
WEDGE_BAND=(.4,.6);WEDGE_TOP=-.5;WEDGE_LOW=-1.7;WEDGE_NORTH=-5.3;WEDGE_SOUTH=-7.2


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
    return obj.data


def parts(bm):
    """The connected face groups of a bmesh."""
    seen=set();out=[]
    for f in bm.faces:
        if f.index in seen:continue
        stack=[f];group=[];seen.add(f.index)
        while stack:
            g=stack.pop();group.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:seen.add(h.index);stack.append(h)
        out.append(group)
    return out


def frame(w):
    """The run and the side offset of a world point in the ramp frame."""
    return ((w.xy-RAMP_FOOT).dot(RAMP_RUN),(w.xy-RAMP_FOOT).dot(RAMP_OUT))


def head_reach(t,d):
    """The run distance at which a point on the ramp at side offset d meets the pad curb."""
    base=RAMP_FOOT+RAMP_OUT*d-PAD_CENTRE
    b=base.dot(RAMP_RUN);c=base.length_squared-PAD_CURB*PAD_CURB
    disc=b*b-c
    return t if disc<0 else -b-math.sqrt(disc)


def roof_parapet():
    """Stretches the metal fascia from the beam tops up past the membrane, as a low parapet."""
    o=bpy.data.objects[ROOF];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    names=[m.name if m else '' for m in me.materials]
    bm=bmesh.new();bm.from_mesh(me)
    fascia=0
    for group in parts(bm):
        if 'metal' not in names[group[0].material_index]:continue
        verts={v for f in group for v in f.verts}
        zs=[(mw@v.co).z for v in verts]
        if min(zs)<12.8:continue
        mid=(min(zs)+max(zs))/2
        for v in verts:
            w=mw@v.co;w.z=ROOF_FASCIA[0] if w.z<mid else ROOF_FASCIA[1];v.co=inv@w
        fascia+=1
    bm.to_mesh(me);bm.free();me.update()
    return {'fascia_parts':fascia,'fascia':list(ROOF_FASCIA)}


def ramp_top(t):
    """The board top of the ramp at run t (round17_route.py), before the head rise."""
    return DECK_TOP+.04232*max(t,0.0)


def ramp(terrain):
    """Moves the ramp sides out to the deck sides, lands the head on the rim and clears the lawn under it."""
    o=bpy.data.objects[LOOKOUT];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
    deck=[];ramp_verts=set()
    for group in parts(bm):
        vs={v for f in group for v in f.verts};ws=[mw@v.co for v in vs]
        if min(w.x for w in ws)>=RAMP_WEST:ramp_verts|=vs
        elif abs(max(w.z for w in ws)-DECK_TOP)<.005:deck+=[frame(w) for w in ws]
    deck_front=max(d for _,d in deck);deck_back=min(d for _,d in deck)
    ds=[frame(mw@v.co)[1] for v in ramp_verts]
    front,back=max(ds),min(ds);mid=(front+back)/2
    head=max(frame(mw@v.co)[0] for v in ramp_verts)
    moved=lifted=0
    for v in ramp_verts:
        w=mw@v.co;t,d=frame(w)
        d+=deck_front-front if d>mid else deck_back-back
        if t>head-.02:t=head_reach(t,d)
        xy=RAMP_FOOT+RAMP_RUN*t+RAMP_OUT*d
        w.x,w.y=xy.x,xy.y;moved+=1
        if w.z>SKIRT_LOW:
            w.z+=(RIM_TOP-ramp_top(head))*smooth(head-HEAD_RUN,head,t);lifted+=1
        v.co=inv@w
    bm.to_mesh(me);bm.free();me.update()
    # The lawn inside the new ramp footprint drops under the boards.
    tm=single(terrain);tw=terrain.matrix_world;ti=tw.inverted()
    grass={i for i,m in enumerate(tm.materials) if m and m.name.startswith(GRASS_PREFIX)}
    lawn={i for p in tm.polygons if p.material_index in grass for i in p.vertices}
    cleared=0
    for i in lawn:
        v=tm.vertices[i];w=tw@v.co
        if w.z<LAWN_FLOOR:continue
        t,d=frame(w)
        if t<-.05 or t>head+.05 or d<deck_back-.02 or d>deck_front+.02:continue
        z=ramp_top(t)-UNDER
        if w.z<=z:continue
        w.z=z;v.co=ti@w;cleared+=1
    tm.update()
    return {'deck_front':round(deck_front,3),'ramp_front':round(front,3),'deck_back':round(deck_back,3),'ramp_back':round(back,3),
            'head_along':round(head,3),'moved':moved,'lifted':lifted,'lawn_cleared':cleared,'rim_top':RIM_TOP}


def paving_lawn(terrain):
    """Raises the lawn along the south side of the paving to just under its top."""
    top=max((o.matrix_world@v.co).z for name in PAVING for o in [bpy.data.objects[name]] for v in o.data.vertices)
    deck=bpy.data.objects[LOOKOUT];dw=deck.matrix_world
    dx=min((dw@v.co).x for v in deck.data.vertices)
    me=single(terrain);mw=terrain.matrix_world;inv=mw.inverted()
    grass={i for i,m in enumerate(me.materials) if m and m.name.startswith(GRASS_PREFIX)}
    lawn={i for p in me.polygons if p.material_index in grass for i in p.vertices}
    raised=0;lift=0.0;level=top-PAVE_GAP
    for i in lawn:
        v=me.vertices[i];w=mw@v.co
        if w.z<LAWN_FLOOR or w.z>=level or not PAVE_X[0]<w.x<PAVE_X[1] or w.x>dx-.05:continue
        out=PAVE_SOUTH-w.y
        if out<-.08 or out>PAVE_REACH:continue
        side=smooth(PAVE_X[0],PAVE_X[0]+.3,w.x)
        z=w.z+(level-w.z)*(1-smooth(0.0,PAVE_REACH,max(out,0.0)))*side
        z=min(z,w.z+PAVE_LIFT)
        if z-w.z<1e-4:continue
        lift=max(lift,z-w.z);w.z=z;v.co=inv@w;raised+=1
    me.update()
    return {'paving_top':round(top,3),'raised':raised,'max_lift':round(lift,3)}


def inside(x,y,poly):
    """True when the plan point lies inside the polygon."""
    hit=False
    for (x0,y0),(x1,y1) in zip(poly,poly[1:]+poly[:1]):
        if (y0>y)!=(y1>y) and x<x0+(y-y0)*(x1-x0)/(y1-y0):hit=not hit
    return hit


def wedge_rock(terrain):
    """Turns the lawn top of the wedge to cliff stone and slopes it down into the cliff."""
    me=single(terrain);mw=terrain.matrix_world;inv=mw.inverted()
    if CLIFF not in me.materials:me.materials.append(bpy.data.materials[CLIFF])
    cliff=[m.name if m else '' for m in me.materials].index(CLIFF)
    faces=0;verts=set()
    poly=list(WEDGE)
    for p in me.polygons:
        ws=[mw@me.vertices[i].co for i in p.vertices]
        if len(ws)!=len(WEDGE) or not all(WEDGE_BAND[0]<w.z<WEDGE_BAND[1] for w in ws):continue
        if not all(inside(w.x*.999+sum(q[0] for q in poly)/len(poly)*.001,w.y*.999+sum(q[1] for q in poly)/len(poly)*.001,poly) for w in ws):continue
        p.material_index=cliff;faces+=1;verts|=set(p.vertices)
    for i in verts:
        v=me.vertices[i];w=mw@v.co
        w.z=WEDGE_TOP+(WEDGE_LOW-WEDGE_TOP)*smooth(WEDGE_NORTH,WEDGE_SOUTH,w.y);v.co=inv@w
    me.update()
    return {'faces':faces,'verts':len(verts),'top':WEDGE_TOP,'low':WEDGE_LOW}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    terrain=bpy.data.objects[TERRAIN]
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['roof_parapet']=roof_parapet()
    report['ramp']=ramp(terrain)
    report['paving_lawn']=paving_lawn(terrain)
    report['wedge_rock']=wedge_rock(terrain)
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND19_DONE',json.dumps(report))


build()

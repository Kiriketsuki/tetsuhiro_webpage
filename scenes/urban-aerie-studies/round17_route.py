"""Round 17 pass on the pad lobe lawn, the ramp to the pad and the bridge foot.

Run it from this folder with background Blender on the round 16 revision:

    blender --factory-startup -b island_b_route_r27.blend --python round17_route.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r29.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_aerie.py then reads the new revision. Its first pass wrote
island_b_route_r28.blend without the rim lowering, which nothing reads now.

What changes, and why (the round 12 review shots):
- West of the pad the lawn sat on two levels: the eased lawn round the pad at about 0.57 m and
  an older shelf at about 0.44 m. A dark soil sliver showed between them, and the lower shelf
  read as a separate stepped rock ledge (S9). On the east rim of the pad lobe the lawn rolled
  down just inside the turf shoulder of the pad and drew a stepped ledge seam. The lawn round
  the pad now rises to one level out to LAWN_FLAT and eases back to its own height by
  LAWN_EDGE, so the two shelves meet with no step. An open lawn vertex only ever rises, by at
  most LAWN_LIFT. A rim vertex, one that also belongs to a soil or cliff face, and every lawn
  vertex on the pad lobe east of LOBE_EAST or south of LOBE_SOUTH come down to the level too, by
  at most RIM_DROP. No tree, stone or planting stands on those parts of the lobe. A soil face
  that ends up flat at the lawn level takes the lawn material, so no dark soil patch shows in
  the lawn. A rim ridge up to 1.1 m high stood beside the turf shoulder of
  the pad and drew the ledge seam, and a rim point at 0.71 m drew the dark soil shard.
- The ramp from the deck to the pad sat 0.47 m behind the front of the deck, so the walkway
  showed a notch where the deck ends (S10). Its front side now moves out to the deck front
  line, and its head reaches out to the pad curb along the new front side.
- The plank ends of the ramp stood about 3 cm proud of the side skirts, so the ramp sides read as
  square-cut plank ends (S10). The skirt tops now rise flush with the ramp boards.
- The bridge foot landed on a stone block that stood 26 cm above the flagstone path, with its
  side face open to the lawn (S10). The flagstone slab east of it rises to half that height, so
  the path climbs to the bridge in two even flagstone steps. The block takes the flagstone
  material, and the lawn along their south side rises to their tops, so no side face shows.
"""
from pathlib import Path
import sys,json,hashlib,math
import bpy,bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r27.blend'
OUTPUT=ROOT/'island_b_route_r29.blend'
REPORT=ROOT/'island_b_route_r29_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

TERRAIN='RR_Island_B5_Rolling_Terrain'
LOOKOUT='NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001'
ABUTMENTS='NA_BC_JG_RF_CO_PT_SH_SS_UA_Bridge_Abutments.001'
FLAGSTONE='NA_Path_Flagstone'
GRASS_PREFIX=('B4_Faceted_LP_SS_A_grass','B4_Faceted_JG_Faceted_Grass')

# The pad centre in plan and its curb radius (round16_look.py).
PAD_CENTRE=Vector((15.2,-2.9));PAD_CURB=2.5
# The lawn round the pad: level at LAWN_LEVEL out to LAWN_FLAT metres from the pad centre, eased
# back to its own height by LAWN_EDGE. A lawn vertex never rises more than LAWN_LIFT, so the
# planting and the stones on the lawn stay seated. Vertices under LAWN_FLOOR belong to the cliff.
LAWN_LEVEL=.57;LAWN_FLAT=4.6;LAWN_EDGE=6.2;LAWN_LIFT=.17;LAWN_FLOOR=.2;RIM_DROP=.6;LOBE_EAST=16.2;LOBE_SOUTH=-4.5
# The ramp (round15_route.py): the foot of its front side, the run and the outward side. Ramp
# parts start east of RAMP_WEST. The deck front lies RAMP_WIDEN in front of the ramp front side.
RAMP_FOOT=Vector((11.556,-4.557));RAMP_RUN=Vector((.966,.259));RAMP_OUT=Vector((.259,-.966))
RAMP_WEST=11.15;RAMP_WIDEN=.468;RAMP_FRONT=-.1
# The ramp top runs as one plane from the deck top at its foot to the pad rim at its head.
RAMP_TOP=.585;RAMP_RISE=.04232;SKIRT_LIP=.004;SKIRT_LOW=.3
# The bridge foot: the stone block under the last bridge tread, the flagstone slab east of it,
# the new slab top, and the lawn along their south face.
BLOCK_WEST=6.0;SLAB_WEST=6.5;SLAB_TOP=.70;BLOCK_TOP=.82
FOOT_X=(6.025,7.235);FOOT_SOUTH=-5.965;FOOT_SPLIT=6.53;FOOT_REACH=.9;FOOT_FADE=.35


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


def lawn_level(terrain):
    """Raises the lawn round the pad to one level, eased back to its own height at the edge."""
    me=single(terrain);mw=terrain.matrix_world;inv=mw.inverted()
    grass={i for i,m in enumerate(me.materials) if m and m.name.startswith(GRASS_PREFIX)}
    verts={i for p in me.polygons if p.material_index in grass for i in p.vertices}
    rim={i for p in me.polygons if p.material_index not in grass for i in p.vertices}&verts
    raised=lowered=0;lift=drop=0.0
    for i in verts:
        v=me.vertices[i];w=mw@v.co
        if w.z<LAWN_FLOOR:continue
        r=(w.xy-PAD_CENTRE).length
        if r<PAD_CURB or r>LAWN_EDGE:continue
        k=1-smooth(LAWN_FLAT,LAWN_EDGE,r)
        if w.z>LAWN_LEVEL:
            if i not in rim and w.x<LOBE_EAST and w.y>LOBE_SOUTH:continue
            z=max(w.z+(LAWN_LEVEL-w.z)*k,w.z-RIM_DROP)
            if w.z-z<1e-4:continue
            drop=max(drop,w.z-z);w.z=z;v.co=inv@w;lowered+=1
            continue
        z=min(w.z+(LAWN_LEVEL-w.z)*k,w.z+LAWN_LIFT)
        if z-w.z<1e-4:continue
        lift=max(lift,z-w.z);w.z=z;v.co=inv@w;raised+=1
    lawn=min(grass);paved=0
    for p in me.polygons:
        if p.material_index in grass or p.normal.z<.9:continue
        ws=[mw@me.vertices[i].co for i in p.vertices]
        if min(w.z for w in ws)<LAWN_LEVEL-.02 or max((w.xy-PAD_CENTRE).length for w in ws)>LAWN_EDGE:continue
        p.material_index=lawn;paved+=1
    me.update()
    return {'raised':raised,'max_lift':round(lift,3),'rim_lowered':lowered,'max_drop':round(drop,3),'soil_to_lawn':paved}


def head_reach(t,d):
    """The run distance at which a point on the ramp at side offset d meets the pad curb."""
    base=RAMP_FOOT+RAMP_OUT*d-PAD_CENTRE
    b=base.dot(RAMP_RUN);c=base.length_squared-PAD_CURB*PAD_CURB
    disc=b*b-c
    if disc<0:return t
    return -b-math.sqrt(disc)


def ramp():
    """Moves the ramp front side out to the deck front, reaches its head to the curb and lifts the skirts flush."""
    o=bpy.data.objects[LOOKOUT];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
    verts=set()
    for group in parts(bm):
        if min((mw@v.co).x for f in group for v in f.verts)>=RAMP_WEST:verts|={v for f in group for v in f.verts}
    frame=lambda w:((w.xy-RAMP_FOOT).dot(RAMP_RUN),(w.xy-RAMP_FOOT).dot(RAMP_OUT))
    head=max(frame(mw@v.co)[0] for v in verts)
    widened=reached=flush=0
    for v in verts:
        w=mw@v.co;t,d=frame(w)
        if d>RAMP_FRONT:
            d+=RAMP_WIDEN;widened+=1
        if t>head-.02:
            t=max(t,head_reach(t,d));reached+=1
        xy=RAMP_FOOT+RAMP_RUN*t+RAMP_OUT*d
        w.x,w.y=xy.x,xy.y
        v.co=inv@w
    # The skirts are the ramp parts that reach down to the lawn. Their top edge rises flush with
    # the boards, a hair proud, so no plank end shows over the skirt.
    for group in parts(bm):
        vs={v for f in group for v in f.verts}
        if not vs<=verts or min((mw@v.co).z for v in vs)>SKIRT_LOW:continue
        for v in vs:
            w=mw@v.co
            if w.z<SKIRT_LOW:continue
            t,_=frame(w);w.z=RAMP_TOP+RAMP_RISE*max(t,0.0)+SKIRT_LIP;v.co=inv@w;flush+=1
    bm.to_mesh(me);bm.free();me.update()
    return {'ramp_vertices':len(verts),'widened':widened,'head_reached':reached,'skirt_flush':flush,'head_along':round(head,3)}


def bridge_foot():
    """Raises the flagstone slab to a half step and paves the block under the bridge foot."""
    o=bpy.data.objects[ABUTMENTS];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    flag=[m.name for m in me.materials].index(FLAGSTONE)
    bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
    slab=block=0
    for group in parts(bm):
        vs={v for f in group for v in f.verts}
        west=min((mw@v.co).x for v in vs)
        if west>=SLAB_WEST:
            high=max((mw@v.co).z for v in vs)
            for v in vs:
                w=mw@v.co
                if w.z>high-1e-3:w.z=SLAB_TOP;v.co=inv@w
            slab+=1
        elif west>=BLOCK_WEST:
            for f in group:f.material_index=flag
            block+=1
    bm.to_mesh(me);bm.free();me.update()
    return {'slabs':slab,'blocks':block}


def foot_lawn(terrain):
    """Raises the lawn along the south face of the bridge foot block and slab to their tops."""
    me=single(terrain);mw=terrain.matrix_world;inv=mw.inverted()
    west,east=FOOT_X;raised=0;lift=0.0
    for v in me.vertices:
        w=mw@v.co
        if w.z<LAWN_FLOOR:continue
        out=FOOT_SOUTH-w.y
        if out<-.05 or out>FOOT_REACH or w.x<west-FOOT_FADE or w.x>east+FOOT_FADE:continue
        top=BLOCK_TOP if w.x<FOOT_SPLIT else SLAB_TOP
        side=smooth(west-FOOT_FADE,west,w.x)*(1-smooth(east,east+FOOT_FADE,w.x))
        target=top+(w.z-top)*smooth(0.0,FOOT_REACH,max(out,0.0))
        z=w.z+(max(target,w.z)-w.z)*side
        if z-w.z<1e-4:continue
        lift=max(lift,z-w.z);w.z=z;v.co=inv@w;raised+=1
    me.update()
    return {'raised':raised,'max_lift':round(lift,3)}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    terrain=bpy.data.objects[TERRAIN]
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['lawn_level']=lawn_level(terrain)
    report['ramp']=ramp()
    report['bridge_foot']=bridge_foot()
    report['foot_lawn']=foot_lawn(terrain)
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND17_DONE',json.dumps(report))


build()

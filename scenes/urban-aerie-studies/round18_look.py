"""Round 18 pass on the roof edge, the entry canopy, the west wall and the bridge foot.

Run it from this folder with background Blender on the round 17 revision:

    blender --factory-startup -b island_b_route_r29.blend --python round18_look.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r30.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why (the round 13 review shots of the look-v2 series):
- The user asked for a flat modern roof. The roof slab is already flat, but its metal fascia
  stood 21 cm and read as a chunky dark edge (S1, S3 mid-move, S7). The membrane now stands
  ROOF_SLAB thick and the fascia ROOF_FASCIA tall, about half the old height. The beams under
  the slab rise to meet it, so no gap opens between the beams and the slab.
- The entry canopy over the workshop door was a clear glass pane in a thin steel frame. At
  night the pane vanished and the canopy read as a thin black wire frame (S1, S7). The pane now
  takes the roof membrane material and a little more thickness, so the canopy reads as a small
  flat graphite roof with the steel frame as its thin fascia.
- Lap boards clad the west wall of the two upper floors. They drew horizontal band steps across
  the wall and their ends stood past the corner as a row of teeth (S4). The boards go, so the
  plaster wall behind them shows as one smooth plane.
- The landing slab at the bridge foot stood 13 cm above the path and the lawn, with a thick
  raised lip (S10). The slab now sits flush with the path, and a new flagstone step at its west
  end halves the rise to the last bridge tread, so the walk from the path to the bridge climbs
  two even steps. The lawn that round 17 raised along the south face of the slab comes back
  down to the new slab top.
"""
from pathlib import Path
import sys,json,hashlib
import bpy,bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r29.blend'
OUTPUT=ROOT/'island_b_route_r30.blend'
REPORT=ROOT/'island_b_route_r30_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

TERRAIN='RR_Island_B5_Rolling_Terrain'
ROOF='DR_GE_MH_SS_RA_Continuous_Stair_Canopy'
CANOPY='DR_SS_GE_Light_Entry_Canopy'
TIMBER='DR_GE_MH_RA_JG_RF_CO_PT_SH_SS_UA_B_Atelier_Timber'
ABUTMENTS='NA_BC_JG_RF_CO_PT_SH_SS_UA_Bridge_Abutments.001'
MEMBRANE='LP_SS_A_roof_edge'
FLAGSTONE='NA_Path_Flagstone'
GRASS_PREFIX=('B4_Faceted_LP_SS_A_grass','B4_Faceted_JG_Faceted_Grass')

# The roof slab (the membrane part), the fascia and the beams under them, as world heights.
# A part counts as the membrane when it uses MEMBRANE, as fascia when it is metal, and as a beam
# when it is wood with its top at the old slab underside.
ROOF_SLAB=(12.93,13.03);ROOF_FASCIA=(12.92,13.04);BEAM_TOP_OLD=12.88
# The entry canopy pane: its new underside and top.
CANOPY_PANE=(3.25,3.305)
# A lap board on the west wall: thinner than BOARD_DEPTH across x, longer than BOARD_LONG along
# y, and above BOARD_FLOOR.
BOARD_DEPTH=.08;BOARD_LONG=3.5;BOARD_FLOOR=4.3
# The bridge foot: the landing slab (west edge SLAB_WEST), its new top, and the new step at the
# west end of the slab, from STEP_X[0] to STEP_X[1] with its top at STEP_TOP.
SLAB_WEST=6.5;SLAB_TOP=.585;STEP_X=(6.53,6.86);STEP_TOP=.775;STEP_FLOOR=.3
# The lawn band south of the slab that round 17 raised: x range, south face and reach.
FOOT_X=(6.53,7.235);FOOT_SOUTH=-5.965;FOOT_REACH=.9;FOOT_FADE=.35;LAWN_FLOOR=.2


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


def set_span(verts,mw,inv,low,high):
    """Moves the lower half of the verts to low and the upper half to high, in world z."""
    zs=[(mw@v.co).z for v in verts];mid=(min(zs)+max(zs))/2
    for v in verts:
        w=mw@v.co;w.z=low if w.z<mid else high;v.co=inv@w


def roof_edge():
    """Thins the membrane and the fascia to about half their height and lifts the beams to meet them."""
    o=bpy.data.objects[ROOF];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    names=[m.name if m else '' for m in me.materials]
    bm=bmesh.new();bm.from_mesh(me)
    slab=fascia=beams=0
    for group in parts(bm):
        verts={v for f in group for v in f.verts}
        mat=names[group[0].material_index]
        top=max((mw@v.co).z for v in verts)
        if mat==MEMBRANE:set_span(verts,mw,inv,*ROOF_SLAB);slab+=1
        elif 'metal' in mat:set_span(verts,mw,inv,*ROOF_FASCIA);fascia+=1
        elif 'wood' in mat and abs(top-BEAM_TOP_OLD)<.01:
            for v in verts:
                w=mw@v.co
                if w.z>top-1e-3:w.z=ROOF_SLAB[0];v.co=inv@w
            beams+=1
    bm.to_mesh(me);bm.free();me.update()
    return {'membrane':slab,'fascia':fascia,'beams':beams,'fascia_height':round(ROOF_FASCIA[1]-ROOF_FASCIA[0],3)}


def entry_canopy():
    """Turns the canopy pane into a graphite membrane and thickens it inside its steel frame."""
    o=bpy.data.objects[CANOPY];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    membrane=bpy.data.materials[MEMBRANE]
    if MEMBRANE not in [m.name for m in me.materials if m]:me.materials.append(membrane)
    index=[m.name if m else '' for m in me.materials].index(MEMBRANE)
    bm=bmesh.new();bm.from_mesh(me)
    panes=0
    for group in parts(bm):
        name=me.materials[group[0].material_index].name
        if 'Glass' not in name:continue
        for f in group:f.material_index=index
        set_span({v for f in group for v in f.verts},mw,inv,*CANOPY_PANE)
        panes+=1
    bm.to_mesh(me);bm.free();me.update()
    return {'panes':panes}


def west_boards():
    """Removes the lap boards on the west wall of the upper floors."""
    o=bpy.data.objects[TIMBER];me=single(o);mw=o.matrix_world
    bm=bmesh.new();bm.from_mesh(me)
    gone=[]
    for group in parts(bm):
        ws=[mw@v.co for f in group for v in f.verts]
        dx=max(w.x for w in ws)-min(w.x for w in ws);dy=max(w.y for w in ws)-min(w.y for w in ws)
        if dx<BOARD_DEPTH and dy>BOARD_LONG and min(w.z for w in ws)>BOARD_FLOOR:gone.extend(group)
    bmesh.ops.delete(bm,geom=list({v for f in gone for v in f.verts}),context='VERTS')
    bm.to_mesh(me);bm.free();me.update()
    return {'faces_removed':len(gone),'boards':len(gone)//6}


def bridge_foot():
    """Lowers the landing slab flush with the path and adds one flagstone step at its west end."""
    o=bpy.data.objects[ABUTMENTS];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    flag=[m.name for m in me.materials].index(FLAGSTONE)
    bm=bmesh.new();bm.from_mesh(me)
    south=north=None;lowered=0
    for group in parts(bm):
        verts={v for f in group for v in f.verts}
        ws=[mw@v.co for v in verts]
        if min(w.x for w in ws)<SLAB_WEST:continue
        high=max(w.z for w in ws)
        south=min(w.y for w in ws);north=max(w.y for w in ws)
        for v in verts:
            w=mw@v.co
            if w.z>high-1e-3:w.z=SLAB_TOP;v.co=inv@w
        lowered+=1
    assert lowered==1,lowered
    # The new step: a box from STEP_FLOOR up to STEP_TOP over the west end of the slab.
    corners=[(x,y) for x in STEP_X for y in (south,north)]
    low=[bm.verts.new(inv@Vector((x,y,STEP_FLOOR))) for x,y in corners]
    high=[bm.verts.new(inv@Vector((x,y,STEP_TOP))) for x,y in corners]
    # Corner order: (x0,s),(x0,n),(x1,s),(x1,n). Faces wind outward.
    quads=[(low[0],low[2],low[3],low[1]),(high[0],high[1],high[3],high[2]),
           (low[0],high[0],high[2],low[2]),(low[1],low[3],high[3],high[1]),
           (low[0],low[1],high[1],high[0]),(low[2],high[2],high[3],low[3])]
    for q in quads:bm.faces.new(q).material_index=flag
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
    bm.to_mesh(me);bm.free();me.update()
    return {'slab_top':SLAB_TOP,'step_top':STEP_TOP,'step_x':list(STEP_X)}


def foot_lawn(terrain):
    """Brings the lawn along the south face of the slab back down to the new slab top."""
    me=single(terrain);mw=terrain.matrix_world;inv=mw.inverted()
    grass={i for i,m in enumerate(me.materials) if m and m.name.startswith(GRASS_PREFIX)}
    verts={i for p in me.polygons if p.material_index in grass for i in p.vertices}
    west,east=FOOT_X;lowered=0;drop=0.0
    for i in verts:
        v=me.vertices[i];w=mw@v.co
        if w.z<LAWN_FLOOR or w.z<=SLAB_TOP:continue
        out=FOOT_SOUTH-w.y
        if out<-.05 or out>FOOT_REACH or w.x<STEP_X[1] or w.x>east+FOOT_FADE:continue
        side=smooth(STEP_X[1],STEP_X[1]+FOOT_FADE,w.x)*(1-smooth(east,east+FOOT_FADE,w.x))
        target=SLAB_TOP+(w.z-SLAB_TOP)*smooth(0.0,FOOT_REACH,max(out,0.0))
        z=w.z+(target-w.z)*side
        if w.z-z<1e-4:continue
        drop=max(drop,w.z-z);w.z=z;v.co=inv@w;lowered+=1
    me.update()
    return {'lowered':lowered,'max_drop':round(drop,3)}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['roof_edge']=roof_edge()
    report['entry_canopy']=entry_canopy()
    report['west_boards']=west_boards()
    report['bridge_foot']=bridge_foot()
    report['foot_lawn']=foot_lawn(bpy.data.objects[TERRAIN])
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND18_DONE',json.dumps(report))


build()

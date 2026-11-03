"""Round 16 pass on the pad lobe, the walkway to the pad, the bridge foot and the roof fascia.

Run it from this folder with background Blender on the round 15 revision:

    blender --factory-startup -b island_b_route_r22.blend --python round16_look.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r27.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_aerie.py then reads the new revision. Its earlier passes wrote
island_b_route_r23.blend to r26, which nothing reads now.

What changes, and why (the round 11 review shots):
- The pad sat 0.4 m over the lawn on a turf mound of its own, so the pad lobe read as a separate
  raised mound beside the island cliff (S9). The whole pad drops by PAD_DROP, so its deck sits
  just over the lawn, and the lawn under and around the curb eases to the curb height. The
  turf shoulder of the pad rises to a level top out to near its rim, so the pad lobe and the
  island lawn meet at one height.
- The ramp from the deck to the pad keeps its foot on the deck and drops its head with the pad,
  so it stays one straight plane from the deck edge to the pad rim.
- A dark notch opened between the island cliff and the pad lobe under the ramp (S9). A rock
  wedge with a level lawn top, a little under the lawn on each side, now fills it, so the ramp
  lands on solid ground. The lawn along both sides of the ramp rises to the ramp top.
- The railing along the front of the lookout deck crossed in front of the bench seat (S10). The
  deck sits flush on the lawn, so the front railing goes.
- The lawn in front of the deck had too few vertices to follow the deck front, so a lip and a
  dark band showed under the deck edge (S10). The lawn there gets finer faces and rises to just
  under the deck top. The two shadows along the deck front go, because they read as a floating
  band.
- The pale stone slab at the bridge foot stood a little proud of the flagstone path in another
  stone (S10). It drops to the path height and takes the flagstone material.
- The metal fascia of the flat roof stood 29 cm tall and read as a heavy band (S1). It now
  stands 21 cm, a thin edge to the 16 cm membrane.
- The underside of the stair flight beside the workshop showed its treads as a scalloped,
  tile-like edge over the workshop shot (S2). A flat graphite soffit now closes it.
"""
from pathlib import Path
import sys,json,hashlib,math
import bpy,bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r22.blend'
OUTPUT=ROOT/'island_b_route_r27.blend'
REPORT=ROOT/'island_b_route_r27_report.json'
SCENE='Island_B_Cozy_Interiors'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

TERRAIN='RR_Island_B5_Rolling_Terrain'
PAD='SS_NA_Sky_Taxi_Pad.001'
LOOKOUT='NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001'
ABUTMENTS='NA_BC_JG_RF_CO_PT_SH_SS_UA_Bridge_Abutments.001'
CANOPY='DR_GE_MH_SS_RA_Continuous_Stair_Canopy'
GRASS='B4_Faceted_LP_SS_A_grass.001'
CLIFF='NA_B2_Unbanded_Stone_1.003'
FLAGSTONE='NA_Path_Flagstone'
STAIRS='DR_GE_MH_SS_RA_Decks_and_Connected_Stair_Treads'
GRAPHITE='LP_SS_A_roof_edge'

# The pad centre in plan, the curb radius and the drop in metres. The pad deck top goes from
# 1.0 m to 0.62 m, the curb top from 1.03 m to 0.65 m.
PAD_CENTRE=Vector((15.2,-2.9));PAD_CURB=2.5;PAD_DROP=.38
# The lawn under the pad sinks to PAD_FLOOR, so it never shows through the deck. Out to
# PAD_BLEND the lawn eases to PAD_RIM, just under the curb top.
PAD_FLOOR=.45;PAD_RIM=.6;PAD_BLEND=3.6
# Lawn faces with every corner within PAD_HIDDEN of the pad centre lie under the pad deck, where
# no camera sees them. They go, so the finer lawn faces elsewhere stay within the triangle budget.
PAD_HIDDEN=2.35
# The turf shoulder of the pad rises to SHOULDER_TOP out to SHOULDER_FLAT and eases back to its
# own height by SHOULDER_EDGE, in metres from the pad centre.
SHOULDER_TOP=.52;SHOULDER_FLAT=3.4;SHOULDER_EDGE=4.4
# The ramp: the foot of its first board and the run direction (round15_route.py). Ramp parts
# start east of RAMP_WEST, and the deck parts start west of it.
RAMP_FOOT=Vector((11.556,-4.557));RAMP_RUN=Vector((.966,.259));RAMP_WEST=11.15
# The deck front line, as in round15_route.py, and the lawn berm along it.
DECK_FRONT=Vector((8.9,-5.81));DECK_RUN=Vector((.961,.277));DECK_OUT=Vector((.277,-.961))
DECK_LENGTH=2.9;DECK_TOP=.585
LAWN_TOP=.575;LAWN_REACH=1.0;LAWN_FADE=.45;LAWN_FLOOR=.3
# The lawn berms: (base point, run, outward normal, length, top at the start, top at the end).
# The ramp berms run along both long sides of the ramp, from its foot to the pad curb.
RAMP_LENGTH=1.6;RAMP_SIDE=1.35
BERMS=((DECK_FRONT,DECK_RUN,DECK_OUT,DECK_LENGTH,LAWN_TOP,LAWN_TOP),
       (RAMP_FOOT,RAMP_RUN,Vector((.259,-.966)),RAMP_LENGTH,.575,.6),
       (RAMP_FOOT+Vector((-.259,.966))*RAMP_SIDE,RAMP_RUN,Vector((-.259,.966)),RAMP_LENGTH,.575,.6))
# The front railing: metal parts of the lookout that stand over RAIL_LOW and lie south of RAIL_SOUTH.
RAIL_LOW=1.3;RAIL_SOUTH=-4.9
DROP_SHADOWS=('Shadow_Deck_Front_1','Shadow_Deck_Front_2')
# The slab at the bridge foot: the abutment part east of SLAB_WEST, with its top at PATH_TOP.
SLAB_WEST=6.5;PATH_TOP=.57
# The roof fascia: metal parts of the canopy whose foot sits at FASCIA_FOOT. The foot rises to FASCIA_NEW.
FASCIA_FOOT=12.78;FASCIA_NEW=12.86
# The rock wedge in the notch between the island lip and the pad lobe: its plan outline, its
# lawn top at the island side and at the pad side, and its foot.
WEDGE=((11.6,-5.45),(12.9,-5.3),(14.2,-5.45),(14.6,-6.3),(13.9,-7.1),(12.6,-7.2),(11.7,-6.6))
WEDGE_TOP_WEST=.46;WEDGE_TOP_EAST=.44;WEDGE_FOOT=-2.4;WEDGE_TAPER=.35
# The soffit under the stair flight beside the workshop: x span, the y of its foot and head,
# the z of its top at the foot, the fall in z per metre of y, and its thickness.
SOFFIT_X=(-1.56,-.55);SOFFIT_Y=(4.85,.4);SOFFIT_Z=4.195;SOFFIT_SLOPE=.7;SOFFIT_THICK=.05


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


def drop_pad():
    """Lowers the pad mesh and its glow light by PAD_DROP."""
    moved=[]
    for name in (PAD,'SS_NA_Pad_Glow.001'):
        o=bpy.data.objects.get(name)
        if o is None:continue
        o.location.z-=PAD_DROP;moved.append(name)
    return moved


def ramp():
    """Drops the ramp head with the pad. The drop grows from 0 at the foot to PAD_DROP at the head."""
    o=bpy.data.objects[LOOKOUT];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
    verts=set()
    for group in parts(bm):
        xs=[(mw@v.co).x for f in group for v in f.verts]
        if min(xs)>=RAMP_WEST:verts|={v for f in group for v in f.verts}
    along=lambda v:((mw@v.co).xy-RAMP_FOOT).dot(RAMP_RUN)
    head=max(along(v) for v in verts)
    for v in verts:
        w=mw@v.co;w.z-=PAD_DROP*min(max(along(v)/head,0.0),1.0);v.co=inv@w
    bm.to_mesh(me);bm.free();me.update()
    return {'ramp_vertices':len(verts),'head_along':round(head,3)}


def front_railing():
    """Deletes the railing along the front of the lookout deck."""
    o=bpy.data.objects[LOOKOUT];me=single(o);mw=o.matrix_world
    bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
    gone=[]
    for group in parts(bm):
        ws=[mw@v.co for f in group for v in f.verts]
        mat=me.materials[group[0].material_index].name
        if 'metal' in mat and max(w.z for w in ws)>RAIL_LOW and max(w.y for w in ws)<RAIL_SOUTH:gone.extend(group)
    count=len(gone)
    bmesh.ops.delete(bm,geom=list(set(gone)),context='FACES')
    bm.to_mesh(me);bm.free();me.update()
    return {'railing_faces':count}


def lawn_berm(terrain,base,run,out,length,top0,top1):
    """Gives the lawn along one edge finer faces, then raises it to just under the edge top."""
    me=single(terrain);mw=terrain.matrix_world;inv=mw.inverted()
    bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
    def near(p):
        rel=p.xy-base;t=rel.dot(run);d=rel.dot(out)
        return -LAWN_FADE-.15<t<length+LAWN_FADE+.15 and -.3<d<LAWN_REACH+.1 and p.z>LAWN_FLOOR
    faces=[f for f in bm.faces if near(mw@f.calc_center_median())]
    edges=list({e for f in faces for e in f.edges})
    # One cut per edge keeps the lawn under the triangle budget of the phone GLB.
    bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True)
    moved=0;lift=0.0
    for v in bm.verts:
        w=mw@v.co
        if w.z<LAWN_FLOOR:continue
        rel=w.xy-base;t=rel.dot(run);d=rel.dot(out)
        if not(-LAWN_FADE<t<length+LAWN_FADE and -.05<=d<LAWN_REACH):continue
        side=smooth(-LAWN_FADE,0.0,t)*(1-smooth(length,length+LAWN_FADE,t))
        top=top0+(top1-top0)*min(max(t/length,0.0),1.0)
        target=top*(1-smooth(0.0,LAWN_REACH,d))+w.z*smooth(0.0,LAWN_REACH,d)
        z=w.z+(max(target,w.z)-w.z)*side
        if z-w.z<1e-4:continue
        lift=max(lift,z-w.z);w.z=z;v.co=inv@w;moved+=1
    bm.to_mesh(me);bm.free();me.update()
    return {'subdivided_faces':len(faces),'moved':moved,'max_lift':round(lift,3)}


def pad_shoulder():
    """Raises the turf shoulder of the lowered pad to a level top, eased back to its own height at the rim."""
    o=bpy.data.objects[PAD];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    grass=[i for i,m in enumerate(me.materials) if m and m.name==GRASS]
    verts={i for p in me.polygons if p.material_index in grass for i in p.vertices}
    raised=0
    for i in verts:
        v=me.vertices[i];w=mw@v.co
        r=(w.xy-PAD_CENTRE).length
        if r<PAD_CURB or w.z>SHOULDER_TOP or w.z<-1.2:continue
        k=1-smooth(SHOULDER_FLAT,SHOULDER_EDGE,r)
        z=w.z+(SHOULDER_TOP-w.z)*k
        if z-w.z>1e-4:w.z=z;v.co=inv@w;raised+=1
    me.update()
    return {'raised':raised}


def soffit():
    """Closes the underside of the stair flight beside the workshop with a flat graphite soffit."""
    o=bpy.data.objects[STAIRS];me=single(o);inv=o.matrix_world.inverted()
    if GRAPHITE not in me.materials:me.materials.append(bpy.data.materials[GRAPHITE])
    slot=[m.name for m in me.materials].index(GRAPHITE)
    bm=bmesh.new();bm.from_mesh(me)
    (x0,x1),(y0,y1)=SOFFIT_X,SOFFIT_Y
    z0=SOFFIT_Z;z1=SOFFIT_Z+(y0-y1)*SOFFIT_SLOPE
    corners=[(x0,y0,z0),(x1,y0,z0),(x1,y1,z1),(x0,y1,z1)]
    top=[bm.verts.new(inv@Vector(c)) for c in corners]
    low=[bm.verts.new(inv@Vector((x,y,z-SOFFIT_THICK))) for x,y,z in corners]
    made=[bm.faces.new(top),bm.faces.new(list(reversed(low)))]
    for i in range(4):
        j=(i+1)%4;made.append(bm.faces.new((top[j],top[i],low[i],low[j])))
    for f in made:f.material_index=slot
    bmesh.ops.recalc_face_normals(bm,faces=made)
    bm.to_mesh(me);bm.free();me.update()
    return {'from':[x0,y0,round(z0,3)],'to':[x1,y1,round(z1,3)]}


def hidden_lawn(terrain):
    """Deletes the lawn faces that lie wholly under the pad deck."""
    me=single(terrain);mw=terrain.matrix_world
    bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
    gone=[f for f in bm.faces if all(((mw@v.co).xy-PAD_CENTRE).length<PAD_HIDDEN and (mw@v.co).z>-.5 for v in f.verts)]
    count=len(gone)
    bmesh.ops.delete(bm,geom=gone,context='FACES')
    bm.to_mesh(me);bm.free();me.update()
    return {'faces':count}


def pad_lawn(terrain):
    """Sinks the lawn under the lowered pad and eases the lawn around it to the curb height."""
    me=single(terrain);mw=terrain.matrix_world;inv=mw.inverted()
    sunk=eased=0
    for v in me.vertices:
        w=mw@v.co
        if w.z<.1:continue
        r=(w.xy-PAD_CENTRE).length
        if r<PAD_CURB+.05:
            if w.z>PAD_FLOOR:w.z=PAD_FLOOR;v.co=inv@w;sunk+=1
            continue
        if r<PAD_BLEND:
            k=1-smooth(PAD_CURB+.05,PAD_BLEND,r)
            z=w.z+(PAD_RIM-w.z)*k
            if abs(z-w.z)>1e-4:w.z=z;v.co=inv@w;eased+=1
    me.update()
    return {'sunk':sunk,'eased':eased}


def wedge(terrain):
    """Fills the notch between the island lip and the pad lobe with a lawn-topped rock wedge."""
    me=single(terrain);mw=terrain.matrix_world;inv=mw.inverted()
    for name in (GRASS,CLIFF):
        if name not in me.materials:me.materials.append(bpy.data.materials[name])
    slot={m.name:i for i,m in enumerate(me.materials)}
    xs=[p[0] for p in WEDGE];west,east=min(xs),max(xs)
    cx=sum(p[0] for p in WEDGE)/len(WEDGE);cy=sum(p[1] for p in WEDGE)/len(WEDGE)
    bm=bmesh.new();bm.from_mesh(me)
    top=[];foot=[]
    for x,y in WEDGE:
        z=WEDGE_TOP_WEST+(WEDGE_TOP_EAST-WEDGE_TOP_WEST)*smooth(west,east,x)
        top.append(bm.verts.new(inv@Vector((x,y,z))))
        foot.append(bm.verts.new(inv@Vector((cx+(x-cx)*WEDGE_TAPER,cy+(y-cy)*WEDGE_TAPER,WEDGE_FOOT))))
    n=len(WEDGE)
    lawn=bm.faces.new(top);lawn.material_index=slot[GRASS]
    under=bm.faces.new(list(reversed(foot)));under.material_index=slot[CLIFF]
    made=[lawn,under]
    for i in range(n):
        j=(i+1)%n
        side=bm.faces.new((top[j],top[i],foot[i],foot[j]));side.material_index=slot[CLIFF];made.append(side)
    bmesh.ops.recalc_face_normals(bm,faces=made)
    bm.to_mesh(me);bm.free();me.update()
    return {'outline':WEDGE}


def bridge_slab():
    """Drops the slab at the bridge foot to the path height and gives it the flagstone material."""
    o=bpy.data.objects[ABUTMENTS];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    if FLAGSTONE not in me.materials:me.materials.append(bpy.data.materials[FLAGSTONE])
    flag=[m.name for m in me.materials].index(FLAGSTONE)
    bm=bmesh.new();bm.from_mesh(me);bm.faces.ensure_lookup_table()
    done=0
    for group in parts(bm):
        vs={v for f in group for v in f.verts}
        if min((mw@v.co).x for v in vs)<SLAB_WEST:continue
        high=max((mw@v.co).z for v in vs)
        for v in vs:
            w=mw@v.co
            if w.z>high-1e-3:w.z=PATH_TOP;v.co=inv@w
        for f in group:f.material_index=flag
        done+=1
    bm.to_mesh(me);bm.free();me.update()
    return {'slabs':done}


def fascia():
    """Raises the foot of the roof fascia, so the edge stands 21 cm."""
    o=bpy.data.objects[CANOPY];me=single(o);mw=o.matrix_world;inv=mw.inverted()
    moved=0
    for v in me.vertices:
        w=mw@v.co
        if abs(w.z-FASCIA_FOOT)<1e-3:w.z=FASCIA_NEW;v.co=inv@w;moved+=1
    me.update()
    return {'fascia_vertices':moved}


def shadows():
    gone=[]
    for name in DROP_SHADOWS:
        o=bpy.data.objects.get(name)
        if o:bpy.data.objects.remove(o);gone.append(name)
    ramp_side=bpy.data.objects.get('Shadow_Ramp_Side')
    if ramp_side:ramp_side.location.z-=PAD_DROP*.5
    return gone


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    terrain=bpy.data.objects[TERRAIN]
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['pad_moved']=drop_pad()
    # The pad shoulder reads world positions, so the moved pad needs fresh world matrices.
    bpy.context.view_layer.update()
    report['ramp']=ramp()
    report['railing']=front_railing()
    report['lawn_berms']=[lawn_berm(terrain,*berm) for berm in BERMS]
    report['pad_lawn']=pad_lawn(terrain)
    report['pad_shoulder']=pad_shoulder()
    report['hidden_lawn']=hidden_lawn(terrain)
    report['soffit']=soffit()
    report['wedge']=wedge(terrain)
    report['bridge_slab']=bridge_slab()
    report['fascia']=fascia()
    report['shadows_removed']=shadows()
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND16_DONE',json.dumps(report))


build()

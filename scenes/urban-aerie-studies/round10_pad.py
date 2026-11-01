"""Round 10 pass on the pad, the route and the stair canopy.

Run it from this folder with background Blender on the round 9 route revision:

    blender --factory-startup -b island_b_route_r13.blend --python round10_pad.py -- [--dry]

The first round 10 pass wrote island_b_route_r14.blend with a round turf shoulder 0.4 m wide,
which still read as a round drum under the curb. The second wrote r15, where the outer edge of
the shoulder stood above the lawn by the ramp and read as a step. Nothing reads r14 or r15 now.

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r16.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why (the round 9 review):
- The pad footing still read as a stone drum on the cliff edge, with a dark rock lump under it.
  The new footing starts just under the curb lip with a broad turf shoulder that slopes gently
  out to the lawn level along an uneven outline, so grass wraps up to the rim, no vertical drum
  side shows and the outline is not round. Under the shoulder a rock mass with uneven faces
  leans in and stays above the island underside, so no lump hangs below it.
- The border stones along the deck and the ramp stuck out past the deck front and past its end
  beside the ramp. They go. A timber fascia closes the deck edge flush with the boards, and the
  ramp skirts reach deeper, so no gap shows under them.
- The flagstone landing between the bridge and the deck sat 0.12 m under the deck. Its stones
  rise to the deck level, so the bridge abutment step, the landing, the step and the deck run
  flush.
- The stair canopy was one flat slab. It becomes a low gable of slate with a ridge beam and
  thick timber fascia boards, so the house shows a pitched, overhanging roof plane.
"""
from pathlib import Path
import sys,json,math,hashlib
import bpy,bmesh
from mathutils import Vector,noise
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r13.blend'
OUTPUT=ROOT/'island_b_route_r16.blend'
REPORT=ROOT/'island_b_route_r16_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

PAD='SS_NA_Sky_Taxi_Pad.001'
LOOKOUT='NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001'
STEP='NA_BC_JG_RF_CO_PT_SH_SS_UA_Lookout_Access_Step.001'
LANDING='SS_NA_Lookout_Flagstone_Path'
CANOPY='DR_GE_MH_SS_RA_Continuous_Stair_Canopy'
GRASS='B4_Faceted_LP_SS_A_grass.001'

# The route frame from connect_route.py, in metres. s runs from the pad centre toward the
# bridge, q to the north of a visitor on the route.
CENTRE=Vector((15.2,-2.9));BRIDGE_END=Vector((7.235,-5.05))
# The footing rings: (radius, height, wobble). Ring 0 sits just under the curb lip (curb top
# 1.03, curb outer radius 2.5). Ring 0 to ring 1 is the turf shoulder. The rings below lean
# in and end above the island underside, which lies at about z -2.9 under the pad centre.
FOOT_RINGS=((2.5,.96,0),(3.45,.6,.38),(3.55,-.1,.42),(2.9,-1.0,.45),(2.0,-1.9,.35),(1.0,-2.4,.2))
FOOT_APEX=Vector((14.9,-2.6,-2.55))
FOOT_SEGMENTS=14;FOOT_SEED=Vector((2.7,6.1,4.3))
FOOT_DROP=.18
# Where the lawn lies under the outer shoulder ring, the ring tucks this far under the lawn, so
# the shoulder runs into the lawn with no step.
TUCK=.04
TERRAIN='RR_Island_B5_Rolling_Terrain'
# The deck edge, the board underside and the fascia, in the route frame.
DECK_S=(3.95,6.83);DECK_Q=1.17;BOARD_UNDER=.44;FASCIA=.05;FASCIA_FOOT=-.05
# Border stones with s below this value line the deck and the ramp. They go.
BORDER_END=6.75
# The ramp skirts hang this much deeper.
SKIRT_EXTRA=.25
# The landing stones rise by this much, to the deck top (0.585). Vertices above LIFT_FROM move.
LANDING_LIFT=.115;LIFT_FROM=.35
# The gable canopy: the footprint of the old slab, its eave height, the ridge rise, the
# overhang to the east and the north and south, the slab and trim sizes.
CANOPY_X=(-3.78,-.17);CANOPY_Y=(-.82,5.95);EAVE_Z=12.88;RISE=1.0;OVER_X=.25;OVER_Y=.22
SLAB=.14;RIDGE=.2;FASCIA_BOARD=(.08,.22)


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
    return h.hexdigest()


class Frame:
    def __init__(self):
        self.u=(CENTRE-BRIDGE_END).normalized()
        self.n=Vector((-self.u.y,self.u.x))
    def at(self,s,q):
        return CENTRE-self.u*s+self.n*q
    def coords(self,p):
        d=p.xy-CENTRE;return -d.dot(self.u),d.dot(self.n)


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


def box(bm,lo,hi,mat,inv):
    """A box from world corner lo to world corner hi, in mesh space."""
    out=bmesh.ops.create_cube(bm,size=1)['verts']
    for v in out:
        w=Vector((lo.x if v.co.x<0 else hi.x,lo.y if v.co.y<0 else hi.y,lo.z if v.co.z<0 else hi.z))
        v.co=inv@w
    for f in {f for v in out for f in v.link_faces}:f.material_index=mat


def slot(ob,name):
    names=[s.material.name if s.material else '' for s in ob.material_slots]
    if name in names:return names.index(name)
    ob.data.materials.append(bpy.data.materials[name]);return len(ob.data.materials)-1


def ground_tree():
    terrain=bpy.data.objects[TERRAIN]
    dg=bpy.context.evaluated_depsgraph_get();ev=terrain.evaluated_get(dg);me=ev.to_mesh()
    tree=BVHTree.FromPolygons([terrain.matrix_world@v.co for v in me.vertices],[tuple(p.vertices) for p in me.polygons])
    ev.to_mesh_clear();return tree


def rebuild_footing(pad):
    """Swaps the rock cone under the curb for a turf shoulder over a short rock mass."""
    ground=ground_tree();tucked=0
    names=[s.material.name if s.material else '' for s in pad.material_slots]
    stone=next(i for i,n in enumerate(names) if n.endswith('A_stone'))
    grass=slot(pad,GRASS)
    bm=bmesh.new();bm.from_mesh(pad.data);mw=pad.matrix_world;inv=mw.inverted()
    old=[]
    for p in loose_parts(bm):
        zs=[(mw@v.co).z for v in part_verts(p)]
        if {f.material_index for f in p}=={stone} and max(zs)<=.7+1e-3 and min(zs)<0:old.extend(p)
    bmesh.ops.delete(bm,geom=old,context='FACES')
    rings=[]
    for k,(r,z,wob) in enumerate(FOOT_RINGS):
        # The two top rings take twice the points, so the shoulder stays round under the curb.
        count=FOOT_SEGMENTS*(2 if k<2 else 1)
        ring=[]
        for i in range(count):
            a=2*math.pi*(i/count+(.5/FOOT_SEGMENTS if k>1 and k%2 else 0))
            d=Vector((math.cos(a),math.sin(a)))
            wobble=wob*noise.noise(FOOT_SEED+Vector((d.x*1.9,d.y*1.9,k*.8)))*2
            dz=0 if k<2 else FOOT_DROP*noise.noise(FOOT_SEED+Vector((d.x*2.4,d.y*2.4,5+k)))*2
            w=CENTRE+d*(r+wobble)
            if k==1:
                hit=ground.ray_cast(Vector((w.x,w.y,3)),Vector((0,0,-1)),3.4)[0]
                if hit is not None and hit.z<z+.5:z_here=min(z,hit.z-TUCK);tucked+=1
                else:z_here=z
                ring.append(bm.verts.new(inv@Vector((w.x,w.y,z_here))));continue
            ring.append(bm.verts.new(inv@Vector((w.x,w.y,z+dz))))
        rings.append(ring)
    n=FOOT_SEGMENTS
    top,shoulder=rings[0],rings[1]
    for i in range(2*n):
        j=(i+1)%(2*n)
        bm.faces.new([top[i],shoulder[i],top[j]]).material_index=grass
        bm.faces.new([top[j],shoulder[i],shoulder[j]]).material_index=grass
    below=rings[2]
    for i in range(n):
        a,b,c=shoulder[2*i],shoulder[2*i+1],shoulder[(2*i+2)%(2*n)]
        bm.faces.new([a,below[i],b]).material_index=stone
        bm.faces.new([b,below[i],below[(i+1)%n]]).material_index=stone
        bm.faces.new([b,below[(i+1)%n],c]).material_index=stone
    for upper,lower in zip(rings[2:],rings[3:]):
        for i in range(n):
            j=(i+1)%n
            bm.faces.new([upper[i],lower[i],upper[j]]).material_index=stone
            bm.faces.new([upper[j],lower[i],lower[j]]).material_index=stone
    apex=bm.verts.new(inv@FOOT_APEX)
    for i in range(n):bm.faces.new([rings[-1][i],apex,rings[-1][(i+1)%n]]).material_index=stone
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
    bm.normal_update();bm.to_mesh(pad.data);bm.free()
    return {'old_faces':len(old),'shoulder_points_tucked':tucked,'rings':[list(r) for r in FOOT_RINGS],'apex':list(FOOT_APEX),'grass_slot':grass}


def tidy_borders(step,landing,fr):
    """Removes the border stones along the deck and the ramp, and lifts the landing stones."""
    if step.data.users>1:step.data=step.data.copy()
    names=[s.material.name if s.material else '' for s in step.material_slots]
    flag=names.index('NA_Path_Flagstone')
    bm=bmesh.new();bm.from_mesh(step.data);mw=step.matrix_world;inv=mw.inverted()
    gone=[];lifted=0
    for p in loose_parts(bm):
        if {f.material_index for f in p}!={flag}:continue
        vs=part_verts(p);sq=[fr.coords(mw@v.co) for v in vs]
        s0=min(a for a,_ in sq);q0=min(b for _,b in sq);q1=max(b for _,b in sq)
        if s0<BORDER_END:gone.extend(p);continue
        # The step to the deck spans the path width and already sits at the deck level.
        if q1-q0>1:continue
        for v in vs:
            w=mw@v.co
            if w.z>LIFT_FROM:v.co=inv@Vector((w.x,w.y,w.z+LANDING_LIFT));lifted+=1
    bmesh.ops.delete(bm,geom=gone,context='FACES')
    bm.to_mesh(step.data);bm.free()
    if landing.data.users>1:landing.data=landing.data.copy()
    lw=landing.matrix_world;linv=lw.inverted();raised=0
    for v in landing.data.vertices:
        w=lw@v.co
        if w.z>LIFT_FROM:v.co=linv@Vector((w.x,w.y,w.z+LANDING_LIFT));raised+=1
    return {'border_faces_removed':len(gone),'border_verts_lifted':lifted,'landing_verts_lifted':raised}


def close_deck(lookout,fr):
    """Adds a timber fascia under each deck edge and deepens the ramp skirts."""
    if lookout.data.users>1:lookout.data=lookout.data.copy()
    names=[s.material.name if s.material else '' for s in lookout.material_slots]
    wood=next(i for i,n in enumerate(names) if n.endswith('A_wood'))
    bm=bmesh.new();bm.from_mesh(lookout.data);mw=lookout.matrix_world;inv=mw.inverted()
    deepened=0
    for p in loose_parts(bm):
        vs=part_verts(p);sq=[fr.coords(mw@v.co) for v in vs]
        s0=min(a for a,_ in sq);s1=max(a for a,_ in sq);q0=min(b for _,b in sq);q1=max(b for _,b in sq)
        if s0>=2.4 and s1<=4.1 and q1-q0<.12 and abs(q0)>.5:
            # The skirt follows the ramp slope, so its lower edge is the lower vertex of each
            # vertical pair, not one height.
            columns={}
            for v in vs:
                w=mw@v.co;key=(round(w.x,3),round(w.y,3))
                if key not in columns or w.z<(mw@columns[key].co).z:columns[key]=v
            for v in columns.values():
                w=mw@v.co;v.co=inv@Vector((w.x,w.y,w.z-SKIRT_EXTRA));deepened+=1
    for side in (1,-1):
        # The route frame turns about 15 degrees from the world axes, so the fascia is a prism
        # in the route frame, not an axis box.
        quad=[fr.at(DECK_S[0],side*(DECK_Q-FASCIA)),fr.at(DECK_S[1],side*(DECK_Q-FASCIA)),fr.at(DECK_S[1],side*DECK_Q),fr.at(DECK_S[0],side*DECK_Q)]
        top=[bm.verts.new(inv@Vector((c.x,c.y,BOARD_UNDER))) for c in quad]
        bot=[bm.verts.new(inv@Vector((c.x,c.y,FASCIA_FOOT))) for c in quad]
        faces=[top,bot[::-1]]+[[bot[i],bot[(i+1)%4],top[(i+1)%4],top[i]] for i in range(4)]
        for f in faces:bm.faces.new(f).material_index=wood
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
    bm.normal_update();bm.to_mesh(lookout.data);bm.free()
    return {'skirt_verts_deepened':deepened,'fascia':[DECK_S,DECK_Q,FASCIA]}


def gable_canopy(canopy):
    """Rebuilds the flat stair canopy as a low slate gable with a ridge beam and fascia boards."""
    if canopy.data.users>1:canopy.data=canopy.data.copy()
    names=[s.material.name if s.material else '' for s in canopy.material_slots]
    roof=next(i for i,n in enumerate(names) if 'roof' in n)
    wood=next(i for i,n in enumerate(names) if n.endswith('A_wood'))
    mw=canopy.matrix_world;inv=mw.inverted()
    bm=bmesh.new()
    x0,x1=CANOPY_X[0],CANOPY_X[1]+OVER_X
    y0,y1=CANOPY_Y[0]-OVER_Y,CANOPY_Y[1]+OVER_Y
    ym=(CANOPY_Y[0]+CANOPY_Y[1])/2
    ridge=EAVE_Z+SLAB+RISE
    for ye in (y0,y1):
        # One roof plane from the eave at ye up to the ridge, SLAB thick.
        top=[(x0,ye,EAVE_Z+SLAB),(x1,ye,EAVE_Z+SLAB),(x1,ym,ridge),(x0,ym,ridge)]
        bottom=[(x,y,z-SLAB) for x,y,z in top]
        t=[bm.verts.new(inv@Vector(p)) for p in top];b=[bm.verts.new(inv@Vector(p)) for p in bottom]
        faces=[t,b[::-1]]+[[b[i],b[(i+1)%4],t[(i+1)%4],t[i]] for i in range(4)]
        for f in faces:bm.faces.new(f).material_index=roof
        # A thick timber fascia board along the eave.
        dy=FASCIA_BOARD[0]*(1 if ye>ym else -1)
        lo=Vector((x0-.02,min(ye,ye+dy),EAVE_Z+SLAB-FASCIA_BOARD[1]));hi=Vector((x1+.02,max(ye,ye+dy),EAVE_Z+SLAB+.02))
        box(bm,lo,hi,wood,inv)
    box(bm,Vector((x0-.05,ym-RIDGE/2,ridge-RIDGE*.6)),Vector((x1+.05,ym+RIDGE/2,ridge+RIDGE*.4)),wood,inv)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
    bm.normal_update();bm.to_mesh(canopy.data);bm.free()
    return {'eave':EAVE_Z,'ridge':round(ridge,3),'pitch_degrees':round(math.degrees(math.atan2(RISE,ym-y0)),1)}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    fr=Frame()
    pad=bpy.data.objects[PAD]
    if pad.data.users>1:pad.data=pad.data.copy()
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['footing']=rebuild_footing(pad)
    report['borders']=tidy_borders(bpy.data.objects[STEP],bpy.data.objects[LANDING],fr)
    report['deck']=close_deck(bpy.data.objects[LOOKOUT],fr)
    report['canopy']=gable_canopy(bpy.data.objects[CANOPY])
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND10_DONE',json.dumps(report))


build()

"""Tidy the walkway from the bridge to the arrival pad, and seat the pad in the island.

Run it from this folder with background Blender on the route revision:

    blender --factory-startup -b island_b_route_r7.blend --python polish_route.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r8.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why (the round 7 review of the r7 route):
- The four dark metal posts under the deck corners go. They stood outside the timber skirt and
  read as black square feet, so the deck looked raised on stilts. The skirt already runs down
  into the ground on all four sides.
- The bench moves in from the north edge, so both legs stand on the deck. In r7 its back legs
  stood on the lawn behind the deck.
- The path between the bridge and the deck loses its dark joint bed. The bed now uses the
  flagstone material and sits just under the stone tops, so a joint reads as a shallow crease
  in the same warm grey stone and never as a black bar.
- The step between the path and the deck is rebuilt in the path flagstone. Its far face
  touches the deck skirt, its near face touches the first row of stones, and its top sits
  halfway between the path and the deck.
- The lantern that stood south of the step hid the step from the route view. It moves to the
  north side of the path.
- The lawn round the pad dropped into a notch beside the ramp, which read as a dark wedge. The
  terrain on the deck side of the pad now rises in a gentle grade to the foot of the curb, and
  the faces that turn flat on that grade take the lawn material.
- The stone footing under the pad curb was a straight drum. It now tapers inward and down into
  the cliff, so it reads as a rock root under the pad and not as a silo. The site paints it in
  the cliff colours (palette.js).
"""
from pathlib import Path
import sys,json,math,hashlib
import bpy,bmesh
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r7.blend'
OUTPUT=ROOT/'island_b_route_r8.blend'
REPORT=ROOT/'island_b_route_r8_report.json'
SCENE='Island_B_Cozy_Interiors'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

PAD='SS_NA_Sky_Taxi_Pad.001'
LOOKOUT='NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001'
STEP='NA_BC_JG_RF_CO_PT_SH_SS_UA_Lookout_Access_Step.001'
PATH='SS_NA_Lookout_Flagstone_Path'
LANTERNS='NA_GE_MH_BC_JG_RF_CO_PT_SH_SS_UA_Path_Lanterns.001'
TERRAIN='RR_Island_B5_Rolling_Terrain'
FLAGSTONE='NA_Path_Flagstone'
JOINT_BED='SS_NA_Path_Joint_Bed'

# The route frame from connect_route.py, in metres.
CENTRE=Vector((15.2,-2.9));BRIDGE_END=Vector((7.235,-5.05))
RADIUS=2.5;RAMP_RUN=1.45;DECK_LEN=2.88;DECK_HALF=1.175;DECK_TOP=.705;SKIRT_INSET=.04
DECK_WEST=RADIUS+RAMP_RUN+DECK_LEN
# The r7 step and path (island_b_route_r7_report.json).
PATH_START=7.18;PATH_HALF=.7;STONE_TOP_LIFT=.055
# The deck posts: small dark boxes from about z .19 to .67.
POST_TOP=(.6,.75);POST_WIDTH=.25
# The bench: its parts sit on the north half of the deck. It moves in until its outer edge is
# this far inside the deck edge.
BENCH_MARGIN=.3
# The new step: one stone deep, a little wider than the path.
STEP_DEPTH=.34;STEP_HALF=.78;STEP_SINK=.25
# The joint bed sits this far under the stone tops.
BED_DROP=.025
# The lantern moves from the south side of the step to the north side of the path.
LANTERN_FROM=Vector((8.566,-5.778));LANTERN_Q=PATH_HALF+.35;LANTERN_S=DECK_WEST+STEP_DEPTH+.55
# The lawn grade round the pad, on the deck side: from GRADE_TOP at the curb foot to the
# ground at GRADE_OUT metres from the pad centre, within GRADE_SECTOR degrees of the ramp axis.
GRADE_TOP=.68;GRADE_IN=2.42;GRADE_OUT=3.9;GRADE_SECTOR=95;GRADE_FLOOR=-1.4
GRASS_SLOT='B4_Faceted_LP_SS_A_grass'
FLAT=.55
# The footing taper: the bottom ring moves in to this share of its radius and down to this z.
FOOT_TOP=.7;FOOT_SHARE=.72;FOOT_BOTTOM=-.95


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
    return h.hexdigest()


class Frame:
    """s runs from the pad centre toward the bridge, q to the north of a visitor on the route."""
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


def slot(ob,key):
    names=[s.material.name if s.material else '' for s in ob.material_slots]
    i=next((i for i,n in enumerate(names) if n.startswith(key) or n.endswith(key)),None)
    if i is None:raise RuntimeError(f'{ob.name} has no material named like {key}.')
    return i


def add_slot(ob,material_name):
    """Returns the slot of a material on the object, and adds the slot if it is missing."""
    names=[s.material.name if s.material else '' for s in ob.material_slots]
    if material_name in names:return names.index(material_name)
    ob.data.materials.append(bpy.data.materials[material_name]);return len(ob.data.materials)-1


def prism(bm,top,bottom,mat):
    area=sum(a.x*b.y-b.x*a.y for a,b in zip(top,top[1:]+top[:1]))
    if area<0:top,bottom=top[::-1],bottom[::-1]
    t=[bm.verts.new(p) for p in top];b=[bm.verts.new(p) for p in bottom];n=len(t)
    bm.faces.new(t).material_index=mat
    for i in range(n):bm.faces.new([b[i],b[(i+1)%n],t[(i+1)%n],t[i]]).material_index=mat


def ground_tree(terrain):
    dg=bpy.context.evaluated_depsgraph_get();ev=terrain.evaluated_get(dg);me=ev.to_mesh()
    tree=BVHTree.FromPolygons([terrain.matrix_world@v.co for v in me.vertices],[tuple(p.vertices) for p in me.polygons])
    ev.to_mesh_clear();return tree


def ground(tree,p,default=.4):
    hit=tree.ray_cast(Vector((p.x,p.y,6)),Vector((0,0,-1)),12)[0]
    return hit.z if hit else default


def tidy_lookout(ob,fr):
    """Deletes the corner posts and moves the bench in from the north edge."""
    names=[s.material.name if s.material else '' for s in ob.material_slots]
    metal={i for i,n in enumerate(names) if n.endswith('A_metal')}
    bm=bmesh.new();bm.from_mesh(ob.data);mw=ob.matrix_world;inv=mw.inverted()
    posts=[];bench=[]
    for p in loose_parts(bm):
        vs=part_verts(p);pts=[mw@v.co for v in vs]
        lo=Vector([min(q[i] for q in pts) for i in range(3)]);hi=Vector([max(q[i] for q in pts) for i in range(3)])
        mats={f.material_index for f in p}
        small=(hi.x-lo.x)<POST_WIDTH and (hi.y-lo.y)<POST_WIDTH
        if mats<=metal and small and POST_TOP[0]<hi.z<POST_TOP[1] and lo.z<.3:posts.append(p);continue
        # The bench seat, its back and its legs: every part above the deck top on the north half,
        # except the railing on the south edge.
        c=sum(pts,Vector())/len(pts);s,q=fr.coords(c)
        if q>.2 and s>RADIUS+RAMP_RUN+.05 and hi.z>DECK_TOP+.1:bench.append((p,vs))
    bmesh.ops.delete(bm,geom=list({f for p in posts for f in p}),context='FACES')
    reach=max(fr.coords(mw@v.co)[1] for _,vs in bench for v in vs) if bench else 0
    shift=max(0.,reach-(DECK_HALF-BENCH_MARGIN))
    d=-fr.n*shift
    for _,vs in bench:
        for v in vs:v.co=inv@((mw@v.co)+Vector((d.x,d.y,0)))
    bm.to_mesh(ob.data);bm.free()
    return {'posts_removed':len(posts),'bench_parts':len(bench),'bench_reach_before':round(reach,3),'bench_moved_in':round(shift,3)}


def rebuild(ob,fill):
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


def path_top(tree,fr):
    """The mean stone top of the first path row, which the step meets."""
    zs=[ground(tree,fr.at(PATH_START+.2,q))+STONE_TOP_LIFT for q in (-.5,0,.5)]
    return sum(zs)/len(zs)


def build_step(ob,fr,tree):
    """One flagstone step: far face on the deck skirt, near face on the path."""
    s0=DECK_WEST-SKIRT_INSET;s1=PATH_START;inv=ob.matrix_world.inverted()
    stone=add_slot(ob,FLAGSTONE)
    low=path_top(tree,fr);top=(low+DECK_TOP)/2
    rect=[(s1,-STEP_HALF),(s0,-STEP_HALF),(s0,STEP_HALF),(s1,STEP_HALF)]
    def fill(bm):
        prism(bm,[inv@Vector((*fr.at(s,q),top)) for s,q in rect],[inv@Vector((*fr.at(s,q),top-STEP_SINK-.2)) for s,q in rect],stone)
        return {'s':[round(s0,3),round(s1,3)],'top':round(top,3),'path_top':round(low,3),'deck_top':DECK_TOP}
    info=rebuild(ob,fill)
    # The old stone slot stays unused. Only the flagstone slot carries faces now.
    return info


def lift_bed(ob):
    """Moves the joint bed up to just under the stone tops, in the flagstone material."""
    names=[s.material.name if s.material else '' for s in ob.material_slots]
    bed=next(i for i,n in enumerate(names) if n.startswith(JOINT_BED));stone=next(i for i,n in enumerate(names) if n.startswith(FLAGSTONE))
    bm=bmesh.new();bm.from_mesh(ob.data);mw=ob.matrix_world;inv=mw.inverted()
    tops=[(mw@v.co) for f in bm.faces if f.material_index==stone and f.normal.z>.9 for v in f.verts]
    bm.verts.ensure_lookup_table();moved=0
    bed_verts={v for f in bm.faces if f.material_index==bed for v in f.verts}
    for f in bm.faces:
        if f.material_index==bed:f.material_index=stone
    for v in bed_verts:
        w=mw@v.co
        near=min(tops,key=lambda t:(t.xy-w.xy).length_squared) if tops else None
        z=(near.z-BED_DROP) if near else w.z
        v.co=inv@Vector((w.x,w.y,z));moved+=1
    bm.to_mesh(ob.data);bm.free()
    return {'bed_vertices_lifted':moved,'bed_material':FLAGSTONE}


def move_lantern(ob,fr,tree):
    target=fr.at(LANTERN_S,LANTERN_Q)
    bm=bmesh.new();bm.from_mesh(ob.data);mw=ob.matrix_world;inv=mw.inverted();moved=0
    dz=ground(tree,target)-ground(tree,LANTERN_FROM)
    for p in loose_parts(bm):
        vs=part_verts(p);c=sum((mw@v.co for v in vs),Vector())/len(vs)
        if (c.xy-LANTERN_FROM).length>.3:continue
        d=Vector((target.x-LANTERN_FROM.x,target.y-LANTERN_FROM.y,dz))
        for v in vs:v.co=inv@((mw@v.co)+d)
        moved+=1
    bm.to_mesh(ob.data);bm.free()
    return {'parts':moved,'at':[round(target.x,3),round(target.y,3)],'dz':round(dz,3)}


def grade_lawn(terrain,fr):
    """Raises the terrain on the deck side of the pad to a gentle grade up to the curb foot."""
    mw=terrain.matrix_world;inv=mw.inverted();home=-fr.u
    bm=bmesh.new();bm.from_mesh(terrain.data);bm.verts.ensure_lookup_table();raised=set()
    for v in bm.verts:
        w=mw@v.co;d=w.xy-CENTRE;r=d.length
        if not GRADE_IN<r<GRADE_OUT or w.z<GRADE_FLOOR:continue
        if math.degrees(home.angle(d.normalized(),0))>GRADE_SECTOR:continue
        t=(r-GRADE_IN)/(GRADE_OUT-GRADE_IN);t=t*t*(3-2*t)
        grade=GRADE_TOP+(.4-GRADE_TOP)*t
        if w.z<grade:
            v.co=inv@Vector((w.x,w.y,grade));raised.add(v.index)
    bm.normal_update()
    names=[s.material.name if s.material else '' for s in terrain.material_slots]
    grass=next(i for i,n in enumerate(names) if n.startswith(GRASS_SLOT))
    to_lawn=0
    for f in bm.faces:
        if all(v.index in raised or (mw@v.co).z>.3 for v in f.verts) and any(v.index in raised for v in f.verts):
            n=(mw.to_3x3()@f.normal).normalized()
            if n.z>FLAT and f.material_index!=grass:f.material_index=grass;to_lawn+=1
    bm.to_mesh(terrain.data);bm.free()
    return {'vertices_raised':len(raised),'faces_to_lawn':to_lawn}


def taper_footing(pad):
    """Pulls the bottom ring of the stone footing in and down, so it reads as a rock root."""
    names=[s.material.name if s.material else '' for s in pad.material_slots]
    stone=next(i for i,n in enumerate(names) if n.endswith('A_stone'))
    bm=bmesh.new();bm.from_mesh(pad.data);mw=pad.matrix_world;inv=mw.inverted();moved=0;foot=None
    for p in loose_parts(bm):
        vs=part_verts(p);zs=[(mw@v.co).z for v in vs]
        if {f.material_index for f in p}=={stone} and max(zs)<=FOOT_TOP+1e-3 and min(zs)<0:foot=(p,vs,min(zs))
    if foot:
        p,vs,low=foot
        for v in vs:
            w=mw@v.co
            if w.z>low+1e-3:continue
            d=w.xy-CENTRE
            v.co=inv@Vector((*(CENTRE+d*FOOT_SHARE),FOOT_BOTTOM));moved+=1
    bm.normal_update();bm.to_mesh(pad.data);bm.free()
    return {'bottom_vertices_moved':moved,'bottom_z':FOOT_BOTTOM,'share':FOOT_SHARE}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    fr=Frame()
    for name in (PAD,LOOKOUT,STEP,PATH,LANTERNS,TERRAIN):
        ob=bpy.data.objects[name]
        if ob.data.users>1:ob.data=ob.data.copy()
    terrain=bpy.data.objects[TERRAIN]
    tree=ground_tree(terrain)
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['lookout']=tidy_lookout(bpy.data.objects[LOOKOUT],fr)
    report['path_bed']=lift_bed(bpy.data.objects[PATH])
    report['step']=build_step(bpy.data.objects[STEP],fr,tree)
    report['lantern']=move_lantern(bpy.data.objects[LANTERNS],fr,tree)
    report['lawn_grade']=grade_lawn(terrain,fr)
    report['pad_footing']=taper_footing(bpy.data.objects[PAD])
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('POLISH_DONE',json.dumps(report))


build()

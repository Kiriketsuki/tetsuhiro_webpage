"""Seat the arrival pad in the island bank and give the route from the bridge to the pad tidy edges.

Run it from this folder with background Blender on the route revision:

    blender --factory-startup -b island_b_route_r8.blend --python seat_pad_route.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r10.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why (the round 7 review of the r8 route and pad):
- The stone footing under the pad curb read as a separate drum, a tank that juts out of the
  island side. It is rebuilt as an irregular faceted bank: its top ring sits right under the
  outer edge of the curb, and the faceted rings below taper down into the island underside.
  The site paints it with the same moss to earth gradient as the island bank beside it.
- The loose turf flaps, the hanging roots and the edge grass blades on the cliff beside the pad
  stuck out of the cliff as thin flaps and spikes. The parts within FLAP_REACH of the pad go.
- The flagstone step between the path and the deck was wider than the path, so its side face
  stood out on the lawn as a dark grey block. It now takes the path width.
- A row of low border stones runs along both sides of the path and the step, round the foot of
  the deck and along both sides of the ramp. The lawn then meets one tidy stone edge, and no
  side face of the paving shows on the lawn side.
- The two ramp stringers stopped short of the lawn in places, which left a dark gap under the
  ramp. Each one is now a solid timber skirt from under the ramp boards down into the ground.
"""
from pathlib import Path
import sys,json,math,hashlib
import bpy,bmesh
from mathutils import Vector,noise
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r8.blend'
# The first round 8 pass wrote island_b_route_r9.blend with a smooth bulging footing, which
# read as a mossy bowl. That file stays as it is, and this pass writes r10 from r8.
OUTPUT=ROOT/'island_b_route_r10.blend'
REPORT=ROOT/'island_b_route_r10_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

PAD='SS_NA_Sky_Taxi_Pad.001'
LOOKOUT='NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001'
STEP='NA_BC_JG_RF_CO_PT_SH_SS_UA_Lookout_Access_Step.001'
TERRAIN='RR_Island_B5_Rolling_Terrain'
FLAGSTONE='NA_Path_Flagstone'
FLAP_OBJECTS=('Hanging_Roots','Overhanging_Turf_Lip','Overhanging_Edge_Grass')

# The route frame from connect_route.py, in metres. s runs from the pad centre toward the
# bridge, q to the north of a visitor on the route.
CENTRE=Vector((15.2,-2.9));BRIDGE_END=Vector((7.235,-5.05))
RADIUS=2.5;DECK_EAST=3.99;DECK_WEST=6.79;DECK_HALF=1.13
RAMP_EAST=2.41;RAMP_HALF=.6;RAMP_SKIRT=.06
PATH_START=7.18;PATH_HALF=.7;PATH_END=8.2;STONE_TOP_LIFT=.055
# The border stones: width across, length of one stone, the gap between stones, and how far
# the top stands above the lawn beside the deck and the ramp.
KERB_WIDTH=.14;KERB_STONE=.5;KERB_GAP=.025;KERB_RISE=.06;KERB_SINK=.32
# The footing rings under the curb: (radius, height). The top ring sits just inside the outer
# edge of the curb, and the rings below taper into the island. Few wide facets with a strong
# wobble read as broken rock. A dense smooth ring read as a mossy bowl.
FOOT_RINGS=((2.46,.7),(2.44,.3),(2.28,-.22),(1.9,-.8),(1.15,-1.45))
FOOT_SEGMENTS=16;FOOT_JITTER=.2;FOOT_SEED=Vector((3.1,7.7,1.3))
# Loose cliff flaps within this distance of the pad centre go, in metres.
FLAP_REACH=8.5


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


def add_slot(ob,material_name):
    names=[s.material.name if s.material else '' for s in ob.material_slots]
    if material_name in names:return names.index(material_name)
    ob.data.materials.append(bpy.data.materials[material_name]);return len(ob.data.materials)-1


def prism(bm,top,bottom,mat):
    """A closed prism from a top and a bottom ring of world points in the same order."""
    area=sum(a.x*b.y-b.x*a.y for a,b in zip(top,top[1:]+top[:1]))
    if area<0:top,bottom=top[::-1],bottom[::-1]
    t=[bm.verts.new(p) for p in top];b=[bm.verts.new(p) for p in bottom];n=len(t)
    bm.faces.new(t).material_index=mat
    bm.faces.new(b[::-1]).material_index=mat
    for i in range(n):bm.faces.new([b[i],b[(i+1)%n],t[(i+1)%n],t[i]]).material_index=mat


def ground_tree(terrain):
    dg=bpy.context.evaluated_depsgraph_get();ev=terrain.evaluated_get(dg);me=ev.to_mesh()
    tree=BVHTree.FromPolygons([terrain.matrix_world@v.co for v in me.vertices],[tuple(p.vertices) for p in me.polygons])
    ev.to_mesh_clear();return tree


def ground(tree,p,default=.4):
    hit=tree.ray_cast(Vector((p.x,p.y,6)),Vector((0,0,-1)),12)[0]
    return hit.z if hit else default


def finish(bm,ob):
    uv=bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    mw=ob.matrix_world
    for f in bm.faces:
        for l in f.loops:w=mw@l.vert.co;l[uv].uv=(w.x*.5,w.y*.5+w.z*.5)
    bm.normal_update();bm.to_mesh(ob.data);bm.free()
    for f in ob.data.polygons:f.use_smooth=False


def rebuild_footing(pad):
    """Swaps the straight footing for an irregular faceted bank that tapers into the island."""
    names=[s.material.name if s.material else '' for s in pad.material_slots]
    stone=next(i for i,n in enumerate(names) if n.endswith('A_stone'))
    bm=bmesh.new();bm.from_mesh(pad.data);mw=pad.matrix_world;inv=mw.inverted()
    old=[]
    for p in loose_parts(bm):
        zs=[(mw@v.co).z for v in part_verts(p)]
        if {f.material_index for f in p}=={stone} and max(zs)<=FOOT_RINGS[0][1]+1e-3 and min(zs)<0:old.extend(p)
    bmesh.ops.delete(bm,geom=old,context='FACES')
    rings=[]
    for k,(r,z) in enumerate(FOOT_RINGS):
        ring=[]
        for i in range(FOOT_SEGMENTS):
            a=2*math.pi*i/FOOT_SEGMENTS
            d=Vector((math.cos(a),math.sin(a)))
            # The top ring stays round under the curb. The lower rings wander in and out on a
            # smooth noise, so the bank reads as broken earth and not as a turned drum.
            wobble=0 if k==0 else FOOT_JITTER*noise.noise(FOOT_SEED+Vector((d.x*1.7,d.y*1.7,k*.9)))*2
            dz=0 if k==0 else .12*noise.noise(FOOT_SEED+Vector((d.x*2.3,d.y*2.3,4+k)))
            w=CENTRE+d*(r+wobble)
            ring.append(bm.verts.new(inv@Vector((w.x,w.y,z+dz))))
        rings.append(ring)
    n=FOOT_SEGMENTS
    for upper,lower in zip(rings,rings[1:]):
        for i in range(n):
            j=(i+1)%n
            # Two triangles per quad, so each facet stays flat on the uneven rings.
            bm.faces.new([upper[i],lower[i],lower[j]]).material_index=stone
            bm.faces.new([upper[i],lower[j],upper[j]]).material_index=stone
    bottom=bm.verts.new(inv@Vector((CENTRE.x,CENTRE.y,FOOT_RINGS[-1][1]-.45)))
    for i in range(n):bm.faces.new([rings[-1][i],bottom,rings[-1][(i+1)%n]]).material_index=stone
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
    bm.normal_update();bm.to_mesh(pad.data);bm.free()
    return {'old_faces':len(old),'rings':[list(r) for r in FOOT_RINGS],'segments':FOOT_SEGMENTS}


def remove_flaps():
    removed={}
    for ob in bpy.data.objects:
        if ob.type!='MESH' or not any(k in ob.name for k in FLAP_OBJECTS):continue
        if ob.data.users>1:ob.data=ob.data.copy()
        bm=bmesh.new();bm.from_mesh(ob.data);mw=ob.matrix_world;gone=[]
        for p in loose_parts(bm):
            vs=part_verts(p);c=sum((mw@v.co for v in vs),Vector())/len(vs)
            if (c.xy-CENTRE).length<FLAP_REACH:gone.extend(p)
        if gone:
            bmesh.ops.delete(bm,geom=gone,context='FACES')
            bm.to_mesh(ob.data);removed[ob.name]=len(gone)
        bm.free()
    return removed


def narrow_step(step,fr):
    """Pulls the step sides in to the path width, so no side face sticks out past the path."""
    bm=bmesh.new();bm.from_mesh(step.data);mw=step.matrix_world;inv=mw.inverted();moved=0
    for v in bm.verts:
        w=mw@v.co;s,q=fr.coords(w)
        if abs(q)>PATH_HALF:
            p=fr.at(s,math.copysign(PATH_HALF,q));v.co=inv@Vector((p.x,p.y,w.z));moved+=1
    bm.to_mesh(step.data);bm.free()
    return {'vertices_moved':moved,'half_width':PATH_HALF}


def kerb_run(bm,fr,tree,inv,mat,s0,s1,q0,q1,top_of):
    """Border stones from s0 to s1 between q0 and q1. top_of(s, q) gives the stone top."""
    count=max(1,round(abs(s1-s0)/KERB_STONE));step=(s1-s0)/count;made=0
    for k in range(count):
        a=s0+step*k+math.copysign(KERB_GAP/2,step);b=s0+step*(k+1)-math.copysign(KERB_GAP/2,step)
        rect=[(a,q0),(b,q0),(b,q1),(a,q1)]
        top=[Vector((*fr.at(s,q),top_of(s,q))) for s,q in rect]
        low=min(p.z for p in top)-KERB_SINK
        prism(bm,[inv@p for p in top],[inv@Vector((p.x,p.y,low)) for p in top],mat);made+=1
    return made


def build_kerbs(step,fr,tree):
    """Adds the border stones to the step mesh, in the path flagstone."""
    mat=add_slot(step,FLAGSTONE)
    bm=bmesh.new();bm.from_mesh(step.data);inv=step.matrix_world.inverted()
    lawn=lambda s,q:ground(tree,fr.at(s,q))+KERB_RISE
    # Along the path the stone tops sit level with the path stones beside them.
    path=lambda s,q:ground(tree,fr.at(s,math.copysign(PATH_HALF-.1,q)))+STONE_TOP_LIFT+.012
    w=KERB_WIDTH;edge=DECK_HALF+.01;ramp=RAMP_HALF+RAMP_SKIRT
    made={}
    made['path']=sum(kerb_run(bm,fr,tree,inv,mat,DECK_WEST,PATH_END,side*PATH_HALF,side*(PATH_HALF+w),path) for side in (1,-1))
    made['deck_sides']=sum(kerb_run(bm,fr,tree,inv,mat,DECK_EAST-w,DECK_WEST+w,side*edge,side*(edge+w),lawn) for side in (1,-1))
    made['deck_west']=sum(kerb_run(bm,fr,tree,inv,mat,DECK_WEST,DECK_WEST+w,side*(PATH_HALF+w),side*edge,lawn) for side in (1,-1))
    made['deck_east']=sum(kerb_run(bm,fr,tree,inv,mat,DECK_EAST-w,DECK_EAST,side*ramp,side*edge,lawn) for side in (1,-1))
    made['ramp']=sum(kerb_run(bm,fr,tree,inv,mat,RADIUS-.02,DECK_EAST-w,side*ramp,side*(ramp+w),lawn) for side in (1,-1))
    finish(bm,step)
    return made


def ramp_top(boards,s):
    """The underside height of the ramp boards at s, from the board parts of the lookout."""
    best=None
    for lo,hi,z in boards:
        if lo-.05<=s<=hi+.05:best=z if best is None else min(best,z)
    if best is None:
        near=min(boards,key=lambda b:min(abs(s-b[0]),abs(s-b[1])));best=near[2]
    return best


def skirt_ramp(lookout,fr,tree):
    """Replaces the two ramp stringers with solid timber skirts that run into the ground."""
    names=[s.material.name if s.material else '' for s in lookout.material_slots]
    wood=next(i for i,n in enumerate(names) if n.endswith('A_wood'))
    bm=bmesh.new();bm.from_mesh(lookout.data);mw=lookout.matrix_world;inv=mw.inverted()
    boards=[];stringers=[]
    for p in loose_parts(bm):
        pts=[mw@v.co for v in part_verts(p)];sq=[fr.coords(x) for x in pts]
        s0=min(a for a,_ in sq);s1=max(a for a,_ in sq);q0=min(b for _,b in sq);q1=max(b for _,b in sq)
        if s1<=DECK_EAST+.01 and s0>=RAMP_EAST-.05:
            if q1-q0>1:boards.append((s0,s1,min(x.z for x in pts)))
            elif q1-q0<.12:stringers.append(p)
    bmesh.ops.delete(bm,geom=[f for p in stringers for f in p],context='FACES')
    samples=8;made=0
    for side in (1,-1):
        q0=side*(RAMP_HALF-.03);q1=side*(RAMP_HALF+RAMP_SKIRT)
        for k in range(samples):
            a=RAMP_EAST+(DECK_EAST-RAMP_EAST)*k/samples;b=RAMP_EAST+(DECK_EAST-RAMP_EAST)*(k+1)/samples
            rect=[(a,q0),(b,q0),(b,q1),(a,q1)]
            top=[Vector((*fr.at(s,q),ramp_top(boards,s)+.005)) for s,q in rect]
            bottom=[Vector((p.x,p.y,ground(tree,p)-.25)) for p in top]
            prism(bm,[inv@p for p in top],[inv@p for p in bottom],wood);made+=1
    bm.normal_update();bm.to_mesh(lookout.data);bm.free()
    return {'stringers_removed':len(stringers),'board_parts':len(boards),'skirt_pieces':made}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    fr=Frame()
    for name in (PAD,LOOKOUT,STEP):
        ob=bpy.data.objects[name]
        if ob.data.users>1:ob.data=ob.data.copy()
    tree=ground_tree(bpy.data.objects[TERRAIN])
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['footing']=rebuild_footing(bpy.data.objects[PAD])
    report['flaps_removed']=remove_flaps()
    report['step']=narrow_step(bpy.data.objects[STEP],fr)
    report['ramp']=skirt_ramp(bpy.data.objects[LOOKOUT],fr,tree)
    report['kerbs']=build_kerbs(bpy.data.objects[STEP],fr,tree)
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('SEAT_DONE',json.dumps(report))


build()

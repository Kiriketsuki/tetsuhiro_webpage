"""Round 9 pass on the pad and the route: a rock footing, a clean ramp, a deck at path level.

Run it from this folder with background Blender on the route revision:

    blender --factory-startup -b island_b_route_r10.blend --python round9_route.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r13.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_aerie.py then reads the new revision.

What changes, and why (the round 8 review):
- The footing under the pad still read as a stone drum: its top band stood straight down for
  0.4 m under the curb. The new footing leans in from the curb at once and hangs down as a
  rough cone of rock, as the island underside does, with a strong wobble on every ring below
  the top one. The site paints it in the cliff family.
- Dark shards showed on the lawn beside the pad. They were exposed soil faces in the lawn and
  thin faces folded under the lawn that face down. Near the pad and the route, the soil faces
  that face up take the grass material, and the folded faces go.
- The ramp boards stepped down in flat treads, and the timber skirts followed the ground, so
  the ramp sides read ragged. The boards now follow one straight slope from the pad curb to the
  deck, and each side is one straight skirt with a straight lower edge.
- The deck stood 0.12 m above the path. The whole deck, with its frame, rails and bench, drops
  to the path level, so the path, the step and the deck run flush.
- Empties named Shadow_* mark the feet of the props on the terrace and along the route. The
  site lays a soft contact shadow under each one (export_aerie.py copies them).
"""
from pathlib import Path
import sys,json,math,hashlib
import bpy,bmesh
from mathutils import Vector,noise
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r10.blend'
# The first round 9 pass wrote island_b_route_r11.blend with a smooth leaning cone under the
# pad, which still read as a bowl. The second pass wrote r12, where two lantern shadows sat
# under the flagstone path, because their ground ray read the terrain alone. Both files stay
# as they are, and this pass writes r13 from r10.
OUTPUT=ROOT/'island_b_route_r13.blend'
REPORT=ROOT/'island_b_route_r13_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

PAD='SS_NA_Sky_Taxi_Pad.001'
LOOKOUT='NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001'
TERRAIN='RR_Island_B5_Rolling_Terrain'
LANTERNS='Path_Lanterns'
FOOT_ABOVE=.15
GRASS='B4_Faceted_LP_SS_A_grass.001'
SOIL='Exposed_Soil'

# The route frame from connect_route.py, in metres. s runs from the pad centre toward the
# bridge, q to the north of a visitor on the route.
CENTRE=Vector((15.2,-2.9));BRIDGE_END=Vector((7.235,-5.05))
RAMP_EAST=2.41;DECK_EAST=3.94;RAMP_HALF=.6;RAMP_SKIRT=.06
# The ramp top at the pad end sits a few millimetres over the curb top (1.03), so the two
# never fight for the same depth.
RAMP_TOP_PAD=1.035
# The path top at the step west of the deck, and the deck top it must meet.
PATH_TOP=.585
# How far each skirt hangs under the ramp top, in metres.
SKIRT_DEPTH=.3
# The footing rings under the curb: (radius, height). The top ring meets the curb foot, and
# every ring below leans in, so no band of the footing stands straight down. Few segments, a
# strong wobble and uneven ring heights break it into large jagged facets, as the island
# underside is. A dense smooth cone read as a bowl.
FOOT_RINGS=((2.47,.7),(2.22,.22),(1.85,-.5),(1.35,-1.3),(.75,-2.05))
FOOT_APEX=-2.8
FOOT_SEGMENTS=11;FOOT_SEED=Vector((5.3,2.1,8.7))
# The wobble of each ring, in metres, and the height jitter. The top ring stays round under
# the curb.
FOOT_WOBBLE=(0,.32,.45,.42,.3)
FOOT_DROP=.32
# The terrain tidy reaches this far from the pad centre and from the route line, in metres.
TIDY_REACH=7.5
# A face that looks down and has a lawn face less than FOLD_GAP above it is a fold.
FOLD_GAP=.25
# Contact shadow spots, in Blender metres: (name, x, y, z, radius along x, radius along y,
# turn about z in radians). The terrace floor sits at z 7.455. A lantern gives the foot of
# its post as z, and the shadow lands on the first surface under that foot.
SHADOWS=(
    ('Shadow_Telescope',-7.62,4.7,7.455,.62,.62,0),
    ('Shadow_Stool',-7.57,3.92,7.455,.34,.34,0),
    ('Shadow_Table',-7.2,3.28,7.455,.3,.3,0),
    ('Shadow_Lantern_1',-6.25,-1.8,('foot',.26),.34,.34,0),
    ('Shadow_Lantern_2',-.6,-3.6,('foot',.38),.34,.34,0),
    ('Shadow_Lantern_3',1.8,-6.05,('foot',.36),.34,.34,0),
    ('Shadow_Lantern_4',6.9,-4.4,('foot',.38),.34,.34,0),
    ('Shadow_Lantern_5',7.47,-3.9,('foot',.33),.34,.34,0),
)
# The bench on the deck, in the route frame: s, q and its half length and half depth.
BENCH=(5.4,.6,.95,.42)


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


def ramp_line(s):
    """The ramp top at s: one straight slope from the pad curb to the deck top."""
    t=(s-RAMP_EAST)/(DECK_EAST-RAMP_EAST)
    return RAMP_TOP_PAD+(PATH_TOP-RAMP_TOP_PAD)*min(max(t,0),1)


def prism(bm,top,bottom,mat):
    area=sum(a.x*b.y-b.x*a.y for a,b in zip(top,top[1:]+top[:1]))
    if area<0:top,bottom=top[::-1],bottom[::-1]
    t=[bm.verts.new(p) for p in top];b=[bm.verts.new(p) for p in bottom];n=len(t)
    bm.faces.new(t).material_index=mat
    bm.faces.new(b[::-1]).material_index=mat
    for i in range(n):bm.faces.new([b[i],b[(i+1)%n],t[(i+1)%n],t[i]]).material_index=mat


def rebuild_footing(pad):
    """Swaps the faceted bank under the curb for a rough cone of rock that leans in at once."""
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
        # The top ring takes twice the points, so it stays round under the round curb.
        count=FOOT_SEGMENTS*(2 if k==0 else 1)
        ring=[]
        for i in range(count):
            a=2*math.pi*(i/count+(.5/FOOT_SEGMENTS if k%2 else 0))
            d=Vector((math.cos(a),math.sin(a)))
            wobble=FOOT_WOBBLE[k]*noise.noise(FOOT_SEED+Vector((d.x*1.9,d.y*1.9,k*.8)))*2
            dz=0 if k==0 else FOOT_DROP*noise.noise(FOOT_SEED+Vector((d.x*2.4,d.y*2.4,5+k)))*2
            w=CENTRE+d*(r+wobble)
            ring.append(bm.verts.new(inv@Vector((w.x,w.y,z+dz))))
        rings.append(ring)
    n=FOOT_SEGMENTS
    top,below=rings[0],rings[1]
    for i in range(n):
        a,b,c=top[2*i],top[2*i+1],top[(2*i+2)%(2*n)]
        bm.faces.new([a,below[i],b]).material_index=stone
        bm.faces.new([b,below[i],below[(i+1)%n]]).material_index=stone
        bm.faces.new([b,below[(i+1)%n],c]).material_index=stone
    for upper,lower in zip(rings[1:],rings[2:]):
        for i in range(n):
            j=(i+1)%n
            bm.faces.new([upper[i],lower[i],upper[j]]).material_index=stone
            bm.faces.new([upper[j],lower[i],lower[j]]).material_index=stone
    apex=bm.verts.new(inv@Vector((CENTRE.x+.2,CENTRE.y-.1,FOOT_APEX)))
    for i in range(n):bm.faces.new([rings[-1][i],apex,rings[-1][(i+1)%n]]).material_index=stone
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
    bm.normal_update();bm.to_mesh(pad.data);bm.free()
    return {'old_faces':len(old),'rings':[list(r) for r in FOOT_RINGS],'segments':FOOT_SEGMENTS,'apex':FOOT_APEX}


def near_route(fr,p):
    s,q=fr.coords(p)
    return (p.xy-CENTRE).length<TIDY_REACH or (-1<s<10 and abs(q)<3)


def tidy_terrain(terrain,fr):
    """Turns soil faces that face up into grass, and deletes faces folded under the lawn."""
    if terrain.data.users>1:terrain.data=terrain.data.copy()
    names=[s.material.name if s.material else '' for s in terrain.material_slots]
    grass=names.index(GRASS)
    bm=bmesh.new();bm.from_mesh(terrain.data);bm.faces.ensure_lookup_table();mw=terrain.matrix_world
    nm=mw.to_3x3()
    bmw=bm.copy();bmw.transform(mw);tree=BVHTree.FromBMesh(bmw);bmw.faces.ensure_lookup_table()
    regrassed=0;folds=[]
    for f in bm.faces:
        c=mw@f.calc_center_median();n=(nm@f.normal).normalized()
        if not near_route(fr,c) or c.z<-.2:continue
        if SOIL in names[f.material_index] and n.z>.8:
            f.material_index=grass;regrassed+=1;continue
        if n.z<-.6:
            hit=tree.ray_cast(c+Vector((0,0,.005)),Vector((0,0,1)),FOLD_GAP)
            if hit[0] is not None and bmw.faces[hit[2]].normal.z>.5:folds.append(f)
    bmesh.ops.delete(bm,geom=folds,context='FACES')
    bm.to_mesh(terrain.data);bm.free();bmw.free()
    return {'regrassed':regrassed,'folds_removed':len(folds)}


def rework_lookout(lookout,fr):
    """Drops the deck to the path level, slopes the ramp boards and gives the ramp straight skirts."""
    if lookout.data.users>1:lookout.data=lookout.data.copy()
    names=[s.material.name if s.material else '' for s in lookout.material_slots]
    wood=next(i for i,n in enumerate(names) if n.endswith('A_wood'))
    bm=bmesh.new();bm.from_mesh(lookout.data);mw=lookout.matrix_world;inv=mw.inverted()
    deck_top=None;deck=[];boards=[];skirts=[]
    for p in loose_parts(bm):
        vs=part_verts(p);pts=[mw@v.co for v in vs];sq=[fr.coords(x) for x in pts]
        s0=min(a for a,_ in sq);s1=max(a for a,_ in sq);q0=min(b for _,b in sq);q1=max(b for _,b in sq)
        if s0>=DECK_EAST-.01:
            deck.append(vs)
            if q1-q0>2 and s1-s0<.4:deck_top=max(deck_top or -9,max(x.z for x in pts))
        elif s0>=RAMP_EAST-.05 and s1<=DECK_EAST+.06:
            if q1-q0>1:boards.append((vs,max(x.z for x in pts)))
            elif q1-q0<.12:skirts.append(p)
    drop=deck_top-PATH_TOP
    for vs in deck:
        for v in vs:w=mw@v.co;v.co=inv@Vector((w.x,w.y,w.z-drop))
    for vs,top in boards:
        for v in vs:
            w=mw@v.co;s,_=fr.coords(w)
            v.co=inv@Vector((w.x,w.y,w.z-top+ramp_line(s)))
    bmesh.ops.delete(bm,geom=[f for p in skirts for f in p],context='FACES')
    for side in (1,-1):
        q0=side*(RAMP_HALF-.03);q1=side*(RAMP_HALF+RAMP_SKIRT)
        a=RAMP_EAST+.04;b=DECK_EAST+.04
        rect=[(a,q0),(b,q0),(b,q1),(a,q1)]
        top=[Vector((*fr.at(s,q),ramp_line(s)+.005)) for s,q in rect]
        bottom=[Vector((p.x,p.y,p.z-SKIRT_DEPTH)) for p in top]
        prism(bm,[inv@p for p in top],[inv@p for p in bottom],wood)
    bm.normal_update();bm.to_mesh(lookout.data);bm.free()
    return {'deck_parts':len(deck),'deck_drop':round(drop,3),'ramp_boards':len(boards),'skirts_replaced':len(skirts)}


def ground_tree(terrain):
    dg=bpy.context.evaluated_depsgraph_get();ev=terrain.evaluated_get(dg);me=ev.to_mesh()
    tree=BVHTree.FromPolygons([terrain.matrix_world@v.co for v in me.vertices],[tuple(p.vertices) for p in me.polygons])
    ev.to_mesh_clear();return tree


def surface_tree(scene):
    """A ray tree of every visible mesh near the island top, except the lanterns, so a shadow
    lands on the path stone or the lawn under a lantern, whichever is higher."""
    dg=bpy.context.evaluated_depsgraph_get();verts=[];polys=[]
    for ob in scene.objects:
        if ob.type!='MESH' or not ob.visible_get() or LANTERNS in ob.name:continue
        pts=[ob.matrix_world@Vector(c) for c in ob.bound_box]
        if min(p.z for p in pts)>3 or max(p.z for p in pts)<-1 or max(p.x for p in pts)-min(p.x for p in pts)>200:continue
        ev=ob.evaluated_get(dg);me=ev.to_mesh();off=len(verts)
        verts+=[ob.matrix_world@v.co for v in me.vertices];polys+=[tuple(i+off for i in p.vertices) for p in me.polygons]
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts,polys)


def add_shadows(fr,terrain,scene):
    """Adds one empty per contact shadow. Its x and y scale give the shadow radii."""
    tree=surface_tree(scene);made={}
    spots=list(SHADOWS)
    s,q,half,depth=BENCH;c=fr.at(s,q)
    spots.append(('Shadow_Bench',c.x,c.y,PATH_TOP,half,depth,math.atan2(fr.u.y,fr.u.x)))
    for name,x,y,z,rx,ry,turn in spots:
        if isinstance(z,tuple):
            # The ray starts a little above the foot, so it never meets the lantern head or a
            # railing above it, and falls back to the foot when it meets nothing.
            foot=z[1];hit=tree.ray_cast(Vector((x,y,foot+FOOT_ABOVE)),Vector((0,0,-1)),1.5)[0];z=hit.z if hit else foot
        e=bpy.data.objects.new(name,None);e.empty_display_type='CIRCLE'
        e.location=(x,y,z+.012);e.scale=(rx,ry,1);e.rotation_euler=(0,0,turn)
        scene.collection.objects.link(e)
        made[name]=[round(x,3),round(y,3),round(z,3),rx,ry]
    return made


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    fr=Frame()
    pad=bpy.data.objects[PAD]
    if pad.data.users>1:pad.data=pad.data.copy()
    scene=bpy.data.scenes['Island_B_Cozy_Interiors']
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['footing']=rebuild_footing(pad)
    report['terrain']=tidy_terrain(bpy.data.objects[TERRAIN],fr)
    report['lookout']=rework_lookout(bpy.data.objects[LOOKOUT],fr)
    report['shadows']=add_shadows(fr,bpy.data.objects[TERRAIN],scene)
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND9_DONE',json.dumps(report))


build()

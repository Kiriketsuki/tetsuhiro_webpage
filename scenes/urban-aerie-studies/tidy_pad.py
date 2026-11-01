"""Tidy the arrival pad: no windsock, a clean curbed deck, a crisp marking, small edge lamps and a neat ramp join.

Run it from this folder with background Blender on the cozy interiors file:

    blender --factory-startup -b island_b_cozy_interiors.blend --python tidy_pad.py -- [--preview] [--dry]

--dry builds the pad in memory and renders the preview, but saves no .blend and no report.

The script saves a new revision, island_b_pad_tidy_r6.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why:
- The windsock (mast and sock) goes. It stood inside the deck circle beside the touchdown ring,
  right under the pad tree, and read as out of place.
- The stub posts and the two rock struts go. The new stone plinth carries the deck to the
  ground, so nothing pokes out under the overhang.
- The 12-sided deck becomes a 40-sided deck inside a warm stone curb. A plinth wall, set back
  under the curb, follows the ground, so the deck reads as one solid platform on the island.
- The marking gets a smooth touchdown ring, a thin perimeter line and a crisp H.
- The edge lights become 12 small lamps, evenly spaced on the curb: a dark metal housing with a
  small warm or red lens on top, so they read as lamps and not as bare glowing cubes.
- The four ramp lamps that hung in the air beside the ramp go. The ramp ends flush at the outer
  face of the curb, with its top board level with the curb top. Up to r4 a wider timber threshold
  plate lay over the curb at the join and read as a step, so r5 and later have no plate.
- The plinth under the curb is warm stone, the curb stone, and it reaches down into the terrain
  all round, so the pad reads as a stone platform seated in the island. Up to r4 it stopped short
  in the deck colour and read as a navy drum bolted onto a lime ledge.
- The low terrain faces under the pad overhang turn to exposed soil, so no lime grass ledge shows
  below the drum.
- Meadow, edge grass and planting parts on the deck footprint and along the ramp go, so no
  grass shows through the deck.
"""
from pathlib import Path
import sys,json,math,hashlib
import bpy,bmesh
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_cozy_interiors.blend'
# The first revision, island_b_pad_tidy.blend, had 48 sides and 10-sided lamps. It put the
# mobile GLB about 450 triangles over its budget, so r2 uses fewer sides and drops hidden caps.
# In r2 the stone plinth stood flush under the curb and read as a tall stone drum at the
# rim. r3 sets the plinth back under the curb in the deck colour, so it reads as a shadow gap.
# r3 left the mobile GLB 19 triangles over its budget, so r4 drops the plinth bottom cap,
# which only a camera under the island could see. r5 and r6 drop the threshold plate, sets the ramp
# flush with the curb, builds the plinth in stone down into the terrain and turns the grass
# ledge under the overhang to soil. r5 sank the plinth 2.5 m where the ground fell away, and
# the stone drum read as a silo, so r6 keeps it to a short footing.
OUTPUT=ROOT/'island_b_pad_tidy_r6.blend'
REPORT=ROOT/'island_b_pad_tidy_r6_report.json'
PREVIEW=ROOT/'renders'/'look-v2'/'round-6'/'pad_blender_preview.png'
SCENE='Island_B_Cozy_Interiors'
PAD_OBJECT='SS_NA_Sky_Taxi_Pad.001'
TERRAIN_PATTERN='Rolling_Terrain'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

# The pad frame from night_arrival.py: centre, outer radius and deck top, in metres.
CENTRE=Vector((15.2,-2.9));RADIUS=2.5;TOP=1.0
SEGMENTS=40
# The curb is a stone band round the deck. The lamps sit on its top.
CURB_IN=2.34;CURB_TOP=TOP+.03;CURB_BOTTOM=.7
DECK_BOTTOM=.78
# The plinth wall sits back under the curb in the curb stone and reaches PLINTH_SINK metres
# into the ground below it, down to PLINTH_LOWEST at most. Where no ground lies under it, the
# wall stops at PLINTH_OPEN, so the stone drum ends inside the rock below the rim.
PLINTH_R=2.26;PLINTH_SINK=.3;PLINTH_LOWEST=-.35;PLINTH_OPEN=-.2
# Marking: the touchdown ring, a perimeter line and the H, all in pad paint.
RING=(1.78,1.94);EDGE_LINE=(2.18,2.24);PAINT_LIFT=.004
H_LEG=(.2,1.5);H_GAP=.5
LAMPS=12;LAMP_R=(CURB_IN+RADIUS)/2;HOUSING=(.07,.045);LENS=(.05,.03)
# The ramp rises to the curb top over its full run, so its first board meets the curb flush.
RAMP_RUN=2.7
# Terrain faces under the pad overhang, inside SOIL_REACH of the centre and below SOIL_TOP,
# take the exposed soil material, so the drum stands on earth and rock, not on lime grass.
SOIL_REACH=RADIUS+.9;SOIL_TOP=.72;SOIL_MATERIAL='Exposed_Soil_0'
# Ground cover cleared from the deck footprint and the ramp corridor.
COVER=('Angular_Meadow','Overhanging_Edge_Grass','Ground_Planting','Grass_Accents','Turf_Lip')
COVER_CLEAR=RADIUS+.35;RAMP_CLEAR=.8


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


def bounds(faces,mw):
    pts=[mw@v.co for v in {v for f in faces for v in f.verts}]
    lo=Vector([min(p[i] for p in pts) for i in range(3)]);hi=Vector([max(p[i] for p in pts) for i in range(3)])
    return lo,hi,sum(pts,Vector())/len(pts)


def ramp_axis(bm,mw,parts):
    """Returns the ramp end on the curb and the unit direction from the pad centre toward the ramp."""
    boards=[bounds(p,mw)[2] for p in parts if {f.material_index for f in p}<= {6,7}]
    if not boards:raise RuntimeError('No ramp boards found on the pad mesh.')
    mid=sum(boards,Vector())/len(boards);home=(mid.xy-CENTRE).normalized()
    far=max(boards,key=lambda c:(c.xy-CENTRE).length)
    return home,Vector((far.x,far.y,far.z))


def strip_pad(ob):
    """Keeps only the ramp boards and the two ramp rails. Every other part is rebuilt or removed."""
    bm=bmesh.new();bm.from_mesh(ob.data);mw=ob.matrix_world
    parts=loose_parts(bm);home,far=ramp_axis(bm,mw,parts);kept=removed=0;gone=[];names={}
    for p in parts:
        mats={f.material_index for f in p};lo,hi,c=bounds(p,mw);span=(hi.xy-lo.xy).length
        board=mats<= {6,7};rail=mats=={2} and span>1.5
        if board or rail:kept+=1;continue
        kind=('windsock' if hi.z>1.5 else 'post or strut' if mats=={2} else
              'ramp lamp' if mats & {3,4} and (c.xy-CENTRE).length>RADIUS+.1 else 'deck, marking or lamp')
        names[kind]=names.get(kind,0)+1;gone.extend(p);removed+=1
    bmesh.ops.delete(bm,geom=list(set(gone)),context='FACES')
    bm.to_mesh(ob.data);bm.free()
    return home,{'kept_parts':kept,'removed_parts':removed,'removed_by_kind':names}


def ring_verts(bm,radius,z,n=SEGMENTS,start=0.):
    return [bm.verts.new((CENTRE.x+radius*math.cos(start+i*math.tau/n),CENTRE.y+radius*math.sin(start+i*math.tau/n),z)) for i in range(n)]


def bridge(bm,a,b,mat,flip=False):
    n=len(a)
    for i in range(n):
        q=[a[i],a[(i+1)%n],b[(i+1)%n],b[i]]
        bm.faces.new(q[::-1] if flip else q).material_index=mat


def cap(bm,ring,mat,up=True):
    f=bm.faces.new(ring if up else ring[::-1]);f.material_index=mat


def solid_cylinder(bm,base,height,radius,mat,n=8):
    """A cylinder standing on base, for the lamp housings and lenses. It has no bottom cap,
    because the curb or the housing under it hides that face."""
    lo=[bm.verts.new(base+Vector((radius*math.cos(i*math.tau/n),radius*math.sin(i*math.tau/n),0))) for i in range(n)]
    hi=[bm.verts.new(v.co+Vector((0,0,height))) for v in lo]
    bridge(bm,lo,hi,mat);cap(bm,hi,mat)


def box(bm,centre,size,mat,yaw):
    m=Matrix.Translation(centre)@Matrix.Rotation(yaw,4,'Z')@Matrix.Diagonal((*size,1))
    r=bmesh.ops.create_cube(bm,size=1.0,matrix=m)
    for f in {f for v in r['verts'] for f in v.link_faces}:f.material_index=mat


def ground_z(tree,x,y,start):
    hit=tree.ray_cast(Vector((x,y,start)),Vector((0,0,-1)),6)[0]
    return hit.z if hit else None


def build_pad(ob,tree,home,slots):
    bm=bmesh.new();bm.from_mesh(ob.data)
    deck,paint,metal,white,red,wood,stone=(slots[k] for k in ('deck','paint','metal','white','red','wood','stone'))
    # Deck: a 48-sided slab inside the curb.
    top=ring_verts(bm,CURB_IN,TOP);bot=ring_verts(bm,CURB_IN,DECK_BOTTOM)
    # The plinth closes the space under the deck, so the deck needs no bottom cap.
    cap(bm,top,deck);bridge(bm,bot,top,deck)
    # Curb: a stone band from the deck edge to the pad edge, a little proud of the deck.
    ci_t=ring_verts(bm,CURB_IN,CURB_TOP);co_t=ring_verts(bm,RADIUS,CURB_TOP)
    ci_b=ring_verts(bm,CURB_IN,TOP);co_b=ring_verts(bm,RADIUS,CURB_BOTTOM)
    bridge(bm,ci_t,co_t,stone,flip=True);bridge(bm,co_b,co_t,stone);bridge(bm,ci_b,ci_t,stone,flip=True)
    # Plinth: a wall set back under the curb that reaches into the ground all round.
    lows=[];sunk=[]
    for i in range(SEGMENTS):
        a=i*math.tau/SEGMENTS;x=CENTRE.x+PLINTH_R*math.cos(a);y=CENTRE.y+PLINTH_R*math.sin(a)
        g=ground_z(tree,x,y,CURB_BOTTOM-.05)
        z=PLINTH_OPEN if g is None else max(PLINTH_LOWEST,min(CURB_BOTTOM-.15,g-PLINTH_SINK))
        lows.append(bm.verts.new((x,y,z)));sunk.append(round(z,3))
    highs=ring_verts(bm,PLINTH_R,CURB_BOTTOM)
    bridge(bm,lows,highs,stone)
    # The soffit under the curb closes the band between the plinth and the curb face.
    bridge(bm,ring_verts(bm,PLINTH_R,CURB_BOTTOM),ring_verts(bm,RADIUS,CURB_BOTTOM),stone)
    # Marking. The H stands upright for someone who walks in from the ramp.
    def annulus(r0,r1,n=48):
        a=ring_verts(bm,r0,TOP+PAINT_LIFT,n);b=ring_verts(bm,r1,TOP+PAINT_LIFT,n);bridge(bm,a,b,paint,flip=True)
    annulus(*RING);annulus(*EDGE_LINE)
    side=Vector((-home.y,home.x));yaw=math.atan2(home.y,home.x)
    z=TOP+PAINT_LIFT+.002
    for s in (-1,1):
        c=CENTRE+side*s*H_GAP;box(bm,Vector((c.x,c.y,z)),(H_LEG[1],H_LEG[0],.004),paint,yaw)
    box(bm,Vector((CENTRE.x,CENTRE.y,z)),(H_LEG[0],2*H_GAP-H_LEG[0],.004),paint,yaw)
    # Lamps: evenly spaced, half a step off the ramp axis, so the ramp end sits between two lamps.
    for i in range(LAMPS):
        a=yaw+(i+.5)*math.tau/LAMPS;p=Vector((CENTRE.x+LAMP_R*math.cos(a),CENTRE.y+LAMP_R*math.sin(a),CURB_TOP))
        solid_cylinder(bm,p,HOUSING[1],HOUSING[0],metal)
        solid_cylinder(bm,p+Vector((0,0,HOUSING[1])),LENS[1],LENS[0],red if i%2 else white,6)
    bm.normal_update();bm.to_mesh(ob.data);bm.free()
    for f in ob.data.polygons:f.use_smooth=False
    return {'plinth_bottom_z':[min(sunk),max(sunk)],'lamps':LAMPS,'segments':SEGMENTS}


def flush_ramp(ob,home):
    """Lifts the ramp so its first board meets the curb top, and trims that board to the curb face.

    Each board moves as one piece, by RAISE at the curb and by nothing at the far end of the run,
    so the far join stays where it was. The two stringers bend with the boards, vertex by vertex.
    """
    names=[s.material.name if s.material else '' for s in ob.material_slots]
    woods={i for i,n in enumerate(names) if 'A_wood' in n};metal=next(i for i,n in enumerate(names) if 'A_metal' in n)
    bm=bmesh.new();bm.from_mesh(ob.data);mw=ob.matrix_world;inv=mw.inverted()
    axis=lambda p:(p.xy-CENTRE).dot(home)
    parts=[];stringers=[]
    for p in loose_parts(bm):
        mats={f.material_index for f in p};verts=list({v for f in p for v in f.verts})
        ax=[axis(mw@v.co) for v in verts]
        if mats<=woods and min(ax)>RADIUS-.05:parts.append((min(ax),verts))
        elif mats=={metal} and max(ax)-min(ax)>1.5:stringers.append(verts)
    if not parts:raise RuntimeError('No ramp boards found past the curb.')
    first=min(parts,key=lambda t:t[0])[1]
    raise_by=CURB_TOP-max((mw@v.co).z for v in first)
    lift=lambda a:raise_by*max(0.,min(1.,1-(a-RADIUS)/RAMP_RUN))
    for start,verts in parts:
        centre=sum((axis(mw@v.co) for v in verts))/len(verts);dz=lift(centre)
        for v in verts:
            w=mw@v.co;w.z+=dz
            if verts is first and axis(w)<RADIUS+.02:w.xy+=home*(RADIUS-axis(w))
            v.co=inv@w
    for verts in stringers:
        for v in verts:
            w=mw@v.co;w.z+=lift(axis(w));v.co=inv@w
    bm.normal_update();bm.to_mesh(ob.data);bm.free()
    return {'raised_by':round(raise_by,3),'boards':len(parts),'stringers':len(stringers)}


def soil_under(terrain):
    """Turns the low terrain faces under the pad overhang to exposed soil."""
    names=[s.material.name if s.material else '' for s in terrain.material_slots]
    soil=next((i for i,n in enumerate(names) if SOIL_MATERIAL in n),None)
    if soil is None:raise RuntimeError(f'{terrain.name} has no {SOIL_MATERIAL} material.')
    terrain.data=terrain.data.copy();mw=terrain.matrix_world;changed=0
    for p in terrain.data.polygons:
        c=mw@p.center
        if (c.xy-CENTRE).length<SOIL_REACH and c.z<SOIL_TOP and p.material_index!=soil and 'Stone' not in names[p.material_index]:
            p.material_index=soil;changed+=1
    return changed


def slot_map(ob):
    names=[s.material.name if s.material else '' for s in ob.material_slots]
    find=lambda key:next(i for i,n in enumerate(names) if key in n)
    slots={'deck':find('Pad_Deck'),'paint':find('Pad_Paint'),'metal':find('A_metal'),'white':find('Pad_Light_White'),
           'red':find('Pad_Light_Red'),'wood':find('wood_light')}
    stone=bpy.data.materials.get('LP_SS_A_stone')
    if stone is None:raise RuntimeError('LP_SS_A_stone is missing.')
    ob.data.materials.append(stone);slots['stone']=len(ob.data.materials)-1
    return slots


def drop_windsock_slot(ob):
    """Removes the windsock material slot once no face uses it."""
    idx=next((i for i,s in enumerate(ob.material_slots) if s.material and 'Windsock' in s.material.name),None)
    if idx is None or any(p.material_index==idx for p in ob.data.polygons):return False
    ob.active_material_index=idx
    with bpy.context.temp_override(object=ob,active_object=ob):bpy.ops.object.material_slot_remove()
    return True


def clear_cover(scene,home):
    """Deletes ground-cover parts on the deck footprint and along the ramp."""
    ramp_a=CENTRE+home*RADIUS;ramp_b=CENTRE+home*(RADIUS+4.6);cleared={}
    def near_ramp(p):
        d=ramp_b-ramp_a;t=max(0,min(1,(p-ramp_a).dot(d)/d.length_squared));return (p-(ramp_a+d*t)).length<RAMP_CLEAR
    for ob in scene_objects(scene):
        if ob.type!='MESH' or not any(k in ob.name for k in COVER):continue
        if ob.modifiers:raise RuntimeError(f'{ob.name} has modifiers. Clear its cover by hand.')
        ob.data=ob.data.copy();bm=bmesh.new();bm.from_mesh(ob.data);mw=ob.matrix_world;gone=[]
        for p in loose_parts(bm):
            c=bounds(p,mw)[2].xy
            if (c-CENTRE).length<COVER_CLEAR or near_ramp(c):gone.extend(p)
        if gone:
            bmesh.ops.delete(bm,geom=list(set(gone)),context='FACES');bm.to_mesh(ob.data);cleared[ob.name]=len(set(gone))
        bm.free()
    return cleared


def preview(scene):
    """Renders a quick Workbench close-up of the pad for review. It never saves the .blend."""
    cam=bpy.data.cameras.new('Pad_Tidy_Preview');ob=bpy.data.objects.new('Pad_Tidy_Preview',cam)
    scene.collection.objects.link(ob);ob.location=(CENTRE.x+6.2,CENTRE.y-5.6,4.6)
    d=Vector((CENTRE.x,CENTRE.y,.6))-ob.location;ob.rotation_euler=d.to_track_quat('-Z','Y').to_euler();cam.lens=32
    scene.camera=ob;scene.render.engine='BLENDER_WORKBENCH';scene.display.shading.color_type='MATERIAL'
    scene.display.shading.light='STUDIO';scene.render.resolution_x,scene.render.resolution_y=1280,720;scene.render.resolution_percentage=100
    scene.render.filepath=str(PREVIEW);PREVIEW.parent.mkdir(parents=True,exist_ok=True)
    with bpy.context.temp_override(scene=scene):bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(ob);bpy.data.cameras.remove(cam)


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    scene=bpy.data.scenes[SCENE];objs=scene_objects(scene)
    pad=bpy.data.objects[PAD_OBJECT];pad.data=pad.data.copy()
    terrain=next(o for o in objs if o.type=='MESH' and TERRAIN_PATTERN in o.name)
    dg=bpy.context.evaluated_depsgraph_get();ev=terrain.evaluated_get(dg);me=ev.to_mesh()
    tree=BVHTree.FromPolygons([terrain.matrix_world@v.co for v in me.vertices],[tuple(p.vertices) for p in me.polygons]);ev.to_mesh_clear()
    home,stripped=strip_pad(pad);slots=slot_map(pad)
    built=build_pad(pad,tree,home,slots);windsock_slot=drop_windsock_slot(pad)
    built['ramp']=flush_ramp(pad,home);built['soil_faces']=soil_under(terrain)
    cleared=clear_cover(scene,home)
    report={'source':str(SOURCE),'output':str(OUTPUT),'pad':pad.name,'home':[round(c,3) for c in home],
            'stripped':stripped,'built':built,'windsock_slot_removed':windsock_slot,'cover_faces_cleared':cleared,
            'pad_tris':sum(len(p.vertices)-2 for p in pad.data.polygons),
            'materials':[s.material.name for s in pad.material_slots]}
    if not dry:bpy.ops.wm.save_mainfile()
    if '--preview' in ARGS or dry:preview(scene)
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('PAD_TIDY_DONE',json.dumps(report))


build()

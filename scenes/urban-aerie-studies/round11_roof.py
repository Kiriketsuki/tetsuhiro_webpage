"""Round 11 pass on the tower roof.

Run it from this folder with background Blender on the round 10 revision:

    blender --factory-startup -b island_b_route_r16.blend --python round11_roof.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r17.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_aerie.py then reads the new revision.

What changes, and why (the round 10 review):
- The tower top read as a floating pergola of thin slats beside a small slate gable over the
  stair. The review asked for a cozy timber house with a solid pitched roof, as the cottage on
  the Leaf it Alone store page has. The slate gable now runs over the whole tower top, from the
  west wall past the stair, with thick timber fascia boards and a ridge beam. The pergola slats
  and beams under it go, so the roof terrace sits under one solid roof.
"""
from pathlib import Path
import sys,json,math,hashlib
import bpy,bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r16.blend'
OUTPUT=ROOT/'island_b_route_r17.blend'
REPORT=ROOT/'island_b_route_r17_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

CANOPY='DR_GE_MH_SS_RA_Continuous_Stair_Canopy'
PERGOLA='DR_GE_MH_SS_RA_Pergola_and_Door_Details'
REAR_SLAT='DR_GE_MH_SS_RA_Pergola_Rear_Slat'
# The pergola parts that start above this height are the slats and the beams of the top frame.
PERGOLA_TOP=12.8
# The gable: the footprint of the tower top, the eave height, the ridge rise, the overhangs, and
# the slab and trim sizes. The round 10 gable covered only x -3.78 to -0.17, over the stair.
ROOF_X=(-8.2,-.17);ROOF_Y=(-.82,5.95);EAVE_Z=12.88;RISE=1.3;OVER_X=(.3,.25);OVER_Y=.3
SLAB=.16;RIDGE=.22;FASCIA_BOARD=(.09,.24)


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
    return h.hexdigest()


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


def box(bm,lo,hi,mat,inv):
    """A box from world corner lo to world corner hi, in mesh space."""
    out=bmesh.ops.create_cube(bm,size=1)['verts']
    for v in out:
        w=Vector((lo.x if v.co.x<0 else hi.x,lo.y if v.co.y<0 else hi.y,lo.z if v.co.z<0 else hi.z))
        v.co=inv@w
    for f in {f for v in out for f in v.link_faces}:f.material_index=mat


def gable_roof(canopy):
    """Rebuilds the stair gable as one slate gable over the whole tower top."""
    if canopy.data.users>1:canopy.data=canopy.data.copy()
    names=[s.material.name if s.material else '' for s in canopy.material_slots]
    roof=next(i for i,n in enumerate(names) if 'roof' in n)
    wood=next(i for i,n in enumerate(names) if n.endswith('A_wood'))
    mw=canopy.matrix_world;inv=mw.inverted()
    bm=bmesh.new()
    x0,x1=ROOF_X[0]-OVER_X[0],ROOF_X[1]+OVER_X[1]
    y0,y1=ROOF_Y[0]-OVER_Y,ROOF_Y[1]+OVER_Y
    ym=(ROOF_Y[0]+ROOF_Y[1])/2
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
    return {'x':[round(x0,2),round(x1,2)],'eave':EAVE_Z,'ridge':round(ridge,3),'pitch_degrees':round(math.degrees(math.atan2(RISE,ym-y0)),1)}


def drop_pergola_top(pergola):
    """Deletes the pergola slats and beams, the parts that start above PERGOLA_TOP."""
    if pergola.data.users>1:pergola.data=pergola.data.copy()
    mw=pergola.matrix_world
    bm=bmesh.new();bm.from_mesh(pergola.data)
    gone=[]
    for part in loose_parts(bm):
        verts={v for f in part for v in f.verts}
        if min((mw@v.co).z for v in verts)>PERGOLA_TOP:gone.extend(part)
    count=len(gone)
    bmesh.ops.delete(bm,geom=list(set(gone)),context='FACES')
    bm.to_mesh(pergola.data);bm.free()
    return {'faces_removed':count}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['roof']=gable_roof(bpy.data.objects[CANOPY])
    report['pergola']=drop_pergola_top(bpy.data.objects[PERGOLA])
    rear=bpy.data.objects.get(REAR_SLAT)
    if rear:
        bpy.data.objects.remove(rear,do_unlink=True);report['rear_slat']='removed'
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND11_DONE',json.dumps(report))


build()

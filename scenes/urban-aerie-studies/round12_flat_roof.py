"""Round 12 pass on the tower roof: a flat modern roof in place of the slate gable.

Run it from this folder with background Blender on the round 11 revision:

    blender --factory-startup -b island_b_route_r17.blend --python round12_flat_roof.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r18.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why: the user dislikes the pitched slate gable of round 11 and asks for a flat
modern look. The gable over the tower top becomes one flat membrane slab on the same footprint
and at the same eave height, so the timber posts still meet its underside. A thin dark metal
fascia band wraps the slab edge, in place of the thick timber fascia boards and the ridge beam.
The three deck slabs of the house are flat already, so they keep their geometry. The shader
(toon-material.js) paints every roof face as a smooth graphite membrane.
"""
from pathlib import Path
import sys,json,hashlib
import bpy,bmesh
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r17.blend'
OUTPUT=ROOT/'island_b_route_r18.blend'
REPORT=ROOT/'island_b_route_r18_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

CANOPY='DR_GE_MH_SS_RA_Continuous_Stair_Canopy'
# The slab material on the canopy, and the dark metal of the house frame for the fascia.
ROOF_MATERIAL='LP_SS_A_roof_edge'
FASCIA_MATERIAL='LP_SS_A_metal'
# The footprint and the eave height of the round 11 gable, with its overhangs. The slab keeps them.
ROOF_X=(-8.2,-.17);ROOF_Y=(-.82,5.95);EAVE_Z=12.88;OVER_X=(.3,.25);OVER_Y=.3
# The slab thickness, and the fascia depth, its drop below the slab and its rise above it.
# A fascia of 5 cm by 24 cm reads as a crisp thin edge from the welcome shot.
SLAB=.16;FASCIA=(.05,.06,.02)


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
    return h.hexdigest()


def box(bm,lo,hi,mat,inv):
    """A box from world corner lo to world corner hi, in mesh space."""
    out=bmesh.ops.create_cube(bm,size=1)['verts']
    for v in out:
        w=Vector((lo.x if v.co.x<0 else hi.x,lo.y if v.co.y<0 else hi.y,lo.z if v.co.z<0 else hi.z))
        v.co=inv@w
    for f in {f for v in out for f in v.link_faces}:f.material_index=mat


def slot(obj,name):
    """The index of the material slot that holds name, added when the object lacks it."""
    names=[s.material.name if s.material else '' for s in obj.material_slots]
    if name in names:return names.index(name)
    obj.data.materials.append(bpy.data.materials[name])
    return len(obj.data.materials)-1


def flat_roof(canopy):
    """Rebuilds the canopy mesh as one flat slab with a thin metal fascia on its four edges."""
    if canopy.data.users>1:canopy.data=canopy.data.copy()
    roof=slot(canopy,ROOF_MATERIAL);fascia=slot(canopy,FASCIA_MATERIAL)
    inv=canopy.matrix_world.inverted()
    x0,x1=ROOF_X[0]-OVER_X[0],ROOF_X[1]+OVER_X[1]
    y0,y1=ROOF_Y[0]-OVER_Y,ROOF_Y[1]+OVER_Y
    top=EAVE_Z+SLAB
    bm=bmesh.new()
    box(bm,Vector((x0,y0,EAVE_Z)),Vector((x1,y1,top)),roof,inv)
    d,drop,rise=FASCIA
    zlo,zhi=EAVE_Z-drop,top+rise
    # Two long bands along y0 and y1, and two short bands between them along x0 and x1.
    box(bm,Vector((x0-d,y0-d,zlo)),Vector((x1+d,y0,zhi)),fascia,inv)
    box(bm,Vector((x0-d,y1,zlo)),Vector((x1+d,y1+d,zhi)),fascia,inv)
    box(bm,Vector((x0-d,y0,zlo)),Vector((x0,y1,zhi)),fascia,inv)
    box(bm,Vector((x1,y0,zlo)),Vector((x1+d,y1,zhi)),fascia,inv)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces[:])
    bm.normal_update();bm.to_mesh(canopy.data);bm.free()
    # The slots of the old gable stay, but no face uses the wood slot now.
    return {'x':[round(x0,2),round(x1,2)],'y':[round(y0,2),round(y1,2)],'underside':EAVE_Z,'top':round(top,3),
            'fascia_height':round(zhi-zlo,3),'fascia_depth':d,'faces':len(canopy.data.polygons)}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['roof']=flat_roof(bpy.data.objects[CANOPY])
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND12_DONE',json.dumps(report))


build()

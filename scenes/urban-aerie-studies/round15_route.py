"""Round 15 pass on the stair glass, the lawn in front of the lookout deck and the deck shadows.

Run it from this folder with background Blender on the round 14 revision:

    blender --factory-startup -b island_b_route_r21.blend --python round15_route.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The script saves a new revision, island_b_route_r22.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why (the round 14 trial shots):
- The glass screens beside the stair flights read as a lighter pane in the sky beside the tower
  (S1). Round 14 removed the screens at the open tower top. The rest of the screens now leave
  the render too, so the stair reads as an open timber stair like the others.
- The lookout deck turns about 16 degrees off the x axis, and the round 13 berm ran along a
  fixed y. So the east half of the deck front still stood proud of the lawn (S10). The lawn in
  front of the deck now rises along the turned front line, to just under the deck top.
- The round 14 shadows along the deck front sat on the deck line, so their inner half lay over
  the deck boards as a dark band. They now sit on the lawn just out from the front edge, at the
  lawn height a ray finds under each one.
"""
from pathlib import Path
import sys,json,hashlib,math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r21.blend'
OUTPUT=ROOT/'island_b_route_r22.blend'
REPORT=ROOT/'island_b_route_r22_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

SCREENS='DR_GE_MH_SS_RA_Stair_Weather_Screens'
TERRAIN='RR_Island_B5_Rolling_Terrain'
# The deck front line: a corner point, the run direction and the outward normal, in plan.
DECK_FRONT=Vector((8.9,-5.81));DECK_RUN=Vector((.961,.277));DECK_OUT=Vector((.277,-.961))
DECK_LENGTH=2.9
# The lawn rises to LAWN_TOP at the front line and eases back to its own level over
# LAWN_REACH metres. It fades in over LAWN_FADE metres at each end of the deck. Only lawn
# vertices above LAWN_FLOOR move, so the cliff underside stays put.
LAWN_TOP=.565;LAWN_REACH=.9;LAWN_FADE=.4;LAWN_FLOOR=.3
# The ramp south edge: the foot of its first board and the ramp run direction.
RAMP_FOOT=Vector((11.556,-4.557));RAMP_RUN=Vector((.966,.259));RAMP_OUT=Vector((.259,-.966))
# Shadows: (name, base point, run, outward normal, distance along, distance out, half length,
# half width). The site lifts each disc 7 cm over the lawn and widens it by 1.35 (contact-shadows.js).
SHADOWS=(('Shadow_Deck_Front_1',DECK_FRONT,DECK_RUN,DECK_OUT,.75,.42,.9,.3),
         ('Shadow_Deck_Front_2',DECK_FRONT,DECK_RUN,DECK_OUT,2.1,.42,.9,.3),
         ('Shadow_Ramp_Side',RAMP_FOOT,RAMP_RUN,RAMP_OUT,.9,.38,.85,.28))
SHADOW_ABOVE=.012


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
    return h.hexdigest()


def smooth(a,b,x):
    t=min(max((x-a)/(b-a),0.0),1.0)
    return t*t*(3-2*t)


def lawn(obj):
    """Raises the lawn in front of the turned deck front to just under the deck top."""
    if obj.data.users>1:obj.data=obj.data.copy()
    mw=obj.matrix_world;inv=mw.inverted();moved=0;lift=0.0
    for v in obj.data.vertices:
        w=mw@v.co
        if w.z<LAWN_FLOOR:continue
        rel=Vector((w.x,w.y))-DECK_FRONT
        t=rel.dot(DECK_RUN);d=rel.dot(DECK_OUT)
        if not(-LAWN_FADE<t<DECK_LENGTH+LAWN_FADE and 0.0<=d<LAWN_REACH):continue
        side=smooth(-LAWN_FADE,0.0,t)*(1-smooth(DECK_LENGTH,DECK_LENGTH+LAWN_FADE,t))
        ease=smooth(0.0,LAWN_REACH,d)
        target=LAWN_TOP*(1-ease)+w.z*ease
        z=w.z+(max(target,w.z)-w.z)*side
        if z-w.z<1e-4:continue
        lift=max(lift,z-w.z);w.z=z;v.co=inv@w;moved+=1
    obj.data.update()
    return {'moved':moved,'max_lift':round(lift,3)}


def shadows(terrain):
    """Moves each deck shadow out onto the lawn, at the lawn height under it."""
    dg=bpy.context.evaluated_depsgraph_get()
    tree=BVHTree.FromObject(terrain.evaluated_get(dg),dg)
    inv=terrain.matrix_world.inverted();mw=terrain.matrix_world
    placed={}
    for name,base,run,out,along,away,rx,ry in SHADOWS:
        p=base+run*along+out*away
        origin=inv@Vector((p.x,p.y,3.0));down=(inv.to_3x3()@Vector((0,0,-1))).normalized()
        hit=tree.ray_cast(origin,down,10.0)[0]
        assert hit is not None,name
        z=(mw@hit).z+SHADOW_ABOVE
        e=bpy.data.objects.get(name)
        if e is None:
            e=bpy.data.objects.new(name,None);e.empty_display_type='CIRCLE'
            bpy.data.scenes['Island_B_Cozy_Interiors'].collection.objects.link(e)
        e.location=(p.x,p.y,z);e.scale=(rx,ry,1);e.rotation_euler=(0,0,math.atan2(run.y,run.x))
        placed[name]=[round(p.x,3),round(p.y,3),round(z,3)]
    return placed


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    bpy.data.objects[SCREENS].hide_render=True;report['screens_hidden']=SCREENS
    terrain=bpy.data.objects[TERRAIN]
    report['lawn']=lawn(terrain)
    report['shadows']=shadows(terrain)
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND15_DONE',json.dumps(report))


build()

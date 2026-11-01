"""Round 13 pass on the walkway and the pad footing.

Run it from this folder with background Blender on the round 12 revision:

    blender --factory-startup -b island_b_route_r18.blend --python round13_route.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.

The first round 13 pass wrote island_b_route_r19.blend. It also lifted the cliff underside under
the berm box up to the lawn, so nothing reads r19 now. The berm now moves lawn vertices only.

The script saves a new revision, island_b_route_r20.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why (the round 12 review):
- The lookout deck, the flagstone path and the bridge-end step stood about 0.18 m above the lawn
  in front of them, so their front faces showed as a raised block (S10). The lawn in front of
  them now rises in a soft berm to just under the deck top, so the walkway reads flush with the
  ground and no front face shows.
- The pad footing read as a round drum with steep sides (S9). The rock under the turf shoulder
  now flares outward as it drops, so its sides slope like the island cliff around it. The
  shoulder and the curb keep their shape, so the ramp still lands on the pad rim.
"""
from pathlib import Path
import sys,json,hashlib
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r18.blend'
OUTPUT=ROOT/'island_b_route_r20.blend'
REPORT=ROOT/'island_b_route_r20_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

TERRAIN='RR_Island_B5_Rolling_Terrain'
PAD='SS_NA_Sky_Taxi_Pad.001'
FOOT_MATERIAL='LP_SS_A_stone'
# The berm: the front line of the walkway (y), the lawn top it rises to just under the deck top
# (0.585), how far out it eases back to the lawn, and the x span with a soft fade at each end.
# Only lawn vertices above BERM_FLOOR move, so the cliff underside below the box stays put.
FRONT_Y=-5.81;BERM_TOP=.565;BERM_REACH=.9;BERM_X=(6.6,12.2);BERM_FADE=.4;BERM_Y=(-7.3,-5.6);BERM_FLOOR=.3
# The pad footing flare: the pad centre, the height above which nothing moves (the shoulder ring
# sits at 0.6), the outward push per metre of drop, the most drop that counts, and the radius
# band over which the push fades in, so the vertices near the footing axis stay put.
CENTRE=Vector((15.2,-2.9));FLARE_TOP=.58;FLARE_RATE=.55;FLARE_DEPTH=1.2;FLARE_R=(.6,2.0)


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
    return h.hexdigest()


def smooth(a,b,x):
    t=min(max((x-a)/(b-a),0.0),1.0)
    return t*t*(3-2*t)


def berm(obj):
    """Raises the lawn in front of the walkway into a soft berm. Returns the count of moved vertices."""
    if obj.data.users>1:obj.data=obj.data.copy()
    mw=obj.matrix_world;inv=mw.inverted();moved=0;lift=0.0
    for v in obj.data.vertices:
        w=mw@v.co
        if not(BERM_X[0]<w.x<BERM_X[1] and BERM_Y[0]<w.y<BERM_Y[1]) or w.z<BERM_FLOOR:continue
        side=smooth(BERM_X[0],BERM_X[0]+BERM_FADE,w.x)*(1-smooth(BERM_X[1]-BERM_FADE,BERM_X[1],w.x))
        ease=smooth(0.0,BERM_REACH,max(FRONT_Y-w.y,0.0))
        target=BERM_TOP*(1-ease)+w.z*ease
        z=w.z+(max(target,w.z)-w.z)*side
        if z-w.z<1e-4:continue
        lift=max(lift,z-w.z);w.z=z;v.co=inv@w;moved+=1
    obj.data.update()
    return {'moved':moved,'max_lift':round(lift,3)}


def flare(obj):
    """Pushes the footing rock under the pad shoulder outward as it drops."""
    if obj.data.users>1:obj.data=obj.data.copy()
    slot=[s.material.name if s.material else '' for s in obj.material_slots].index(FOOT_MATERIAL)
    foot={i for p in obj.data.polygons if p.material_index==slot for i in p.vertices}
    mw=obj.matrix_world;inv=mw.inverted();moved=0;push_max=0.0
    for i in foot:
        v=obj.data.vertices[i];w=mw@v.co
        if w.z>=FLARE_TOP:continue
        d=Vector((w.x-CENTRE.x,w.y-CENTRE.y));r=d.length
        if r<1e-3:continue
        push=FLARE_RATE*min(FLARE_TOP-w.z,FLARE_DEPTH)*smooth(FLARE_R[0],FLARE_R[1],r)
        w.x+=d.x/r*push;w.y+=d.y/r*push;v.co=inv@w;moved+=1;push_max=max(push_max,push)
    obj.data.update()
    return {'moved':moved,'max_push':round(push_max,3)}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    report={'source':str(SOURCE),'output':str(OUTPUT)}
    report['berm']=berm(bpy.data.objects[TERRAIN])
    report['flare']=flare(bpy.data.objects[PAD])
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND13_DONE',json.dumps(report))


build()

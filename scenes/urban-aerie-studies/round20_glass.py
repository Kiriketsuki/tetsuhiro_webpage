"""Round 20 pass: the glass stair tower comes back.

Run it from this folder with background Blender on the round 19 revision:
    blender --factory-startup -b island_b_route_r33.blend --python round20_glass.py -- [--dry]

--dry builds the changes in memory and prints the report, but saves no .blend and no report.
The script saves a new revision, island_b_route_r34.blend, before it changes anything, and only
ever writes that new file. It refuses to run when the new file already exists, so it never
overwrites a .blend. export_island_b.py then reads the new revision.

What changes, and why: the user asked to restore the glass stairs. Rounds 14 and 15 took the
accepted tower apart. Round 14 dropped five slim steel posts, chamfered the frame boxes, cut the
glass screens above the terrace and set timber rafters and beams under the flat roof. Round 15
hid every glass screen from the render. The site then thickened the posts into honey timber.
- The frame (Slender_Recessed_Structure) takes back its round 13 mesh from
  island_b_route_r20.blend: slim charcoal steel columns of about 6 cm with thin steel rails.
- The glass screens (Stair_Weather_Screens) take back their round 13 mesh, all the way up to
  the roof, and show in the render again.
- The timber rafters and beams under the flat roof go. The flat membrane and its thin metal
  fascia stay, so the tower keeps the flat dark canopy on top. The steel columns and the
  pergola posts carry the slab.
Wood stays on the stair treads, the decks and the cladding. Nothing else moves.
"""
from pathlib import Path
import sys,json,hashlib,re
import bpy,bmesh

ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'island_b_route_r33.blend'
ACCEPTED=ROOT/'island_b_route_r20.blend'
OUTPUT=ROOT/'island_b_route_r34.blend'
REPORT=ROOT/'island_b_route_r34_report.json'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

FRAME='DR_SS_GE_Slender_Recessed_Structure'
SCREENS='DR_GE_MH_SS_RA_Stair_Weather_Screens'
CANOPY='DR_GE_MH_SS_RA_Continuous_Stair_Canopy'
WOOD_MATERIAL='LP_SS_A_wood'
# Blender gives an appended datablock a numeric suffix when the name is taken.
SUFFIX=re.compile(r'\.\d{3}$')


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
    return h.hexdigest()


def restore(names):
    """Gives each named object the mesh it had in the accepted revision.

    The appended copies bring their own materials. Each slot goes back to the material of the
    same name in this file, so the export still maps every slot to its web family.
    """
    before={m.name for m in bpy.data.materials}
    with bpy.data.libraries.load(str(ACCEPTED),link=False) as (src,dst):
        missing=[n for n in names if n not in src.objects]
        assert not missing,f'missing in {ACCEPTED.name}: {missing}'
        dst.objects=list(names)
    out={}
    for name,copy in zip(names,dst.objects):
        target=bpy.data.objects[name]
        drift=max(abs(a-b) for ra,rb in zip(copy.matrix_world,target.matrix_world) for a,b in zip(ra,rb))
        assert drift<1e-4,f'{name} moved between revisions'
        old=target.data;old_name=old.name;mesh=copy.data
        for i,m in enumerate(mesh.materials):
            if m is None:continue
            base=SUFFIX.sub('',m.name)
            mesh.materials[i]=bpy.data.materials[base] if base in before else m
        target.data=mesh
        bpy.data.objects.remove(copy)
        bpy.data.meshes.remove(old)
        mesh.name=old_name
        out[name]={'verts':len(mesh.vertices),'faces':len(mesh.polygons),'materials':[m.name if m else '' for m in mesh.materials]}
    added=[m for m in bpy.data.materials if m.name not in before]
    for m in added:
        assert m.users==0,f'{m.name} still has users'
        bpy.data.materials.remove(m)
    out['materials_dropped']=len(added)
    return out


def drop_timber(obj):
    """Deletes the timber rafters and beams under the flat roof slab."""
    names=[s.material.name if s.material else '' for s in obj.material_slots]
    if WOOD_MATERIAL not in names:return {'faces_removed':0}
    wood=names.index(WOOD_MATERIAL)
    bm=bmesh.new();bm.from_mesh(obj.data)
    faces=[f for f in bm.faces if f.material_index==wood]
    verts={v for f in faces for v in f.verts}
    bmesh.ops.delete(bm,geom=faces,context='FACES')
    loose=[v for v in verts if v.is_valid and not v.link_faces]
    bmesh.ops.delete(bm,geom=loose,context='VERTS')
    bm.to_mesh(obj.data);bm.free();obj.data.update()
    return {'faces_removed':len(faces)}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    dry='--dry' in ARGS
    assert dry or not OUTPUT.exists(),f'{OUTPUT.name} exists. This script never overwrites a .blend.'
    source_hash=sha256(SOURCE)
    if not dry:bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=True)
    report={'source':str(SOURCE),'accepted':str(ACCEPTED),'output':str(OUTPUT)}
    report['restored']=restore((FRAME,SCREENS))
    screens=bpy.data.objects[SCREENS]
    screens.hide_render=False;screens.hide_viewport=False
    report['screens_shown']=SCREENS
    report['canopy']=drop_timber(bpy.data.objects[CANOPY])
    if not dry:bpy.ops.wm.save_mainfile()
    report['source_untouched']=sha256(SOURCE)==source_hash
    if not dry:REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert report['source_untouched']
    print('ROUND20_DONE',json.dumps(report))
    return report


if __name__=='__main__':
    build()

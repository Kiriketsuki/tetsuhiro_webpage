"""Replace bead-like canopy accents with small folded leaf surfaces in study A."""
from pathlib import Path
import math
import random
import runpy
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parent


def polish():
    a=bpy.data.scenes['SS_Study_A_Cinematic']
    if a.get('Leaf_Polish'): return {'status':'already polished'}
    mod=runpy.run_path(str(ROOT/'build_studies.py'))
    canopy=bpy.data.objects['SS_A_Tree_Canopies']
    old=bpy.data.objects['SS_A_Foliage_Detail']; old.hide_render=True; old.hide_viewport=True
    rng=random.Random(827); verts=[]; faces=[]; indices=[]
    for poly in canopy.data.polygons:
        if rng.random()>.85: continue
        normal=poly.normal.copy()
        axis=normal.cross(Vector((0,0,1)))
        if axis.length<.01: axis=Vector((1,0,0))
        axis.normalize(); other=normal.cross(axis).normalized()
        angle=rng.uniform(0,math.tau)
        u=axis*math.cos(angle)+other*math.sin(angle)
        v=normal.cross(u).normalized()
        q=poly.center+normal*rng.uniform(.05,.12)
        length=rng.uniform(.18,.32); width=length*rng.uniform(.40,.65)
        base=len(verts)
        verts.extend([tuple(q+normal*.035),tuple(q+u*length),tuple(q+v*width),tuple(q-u*length),tuple(q-v*width)])
        faces.extend([(base,base+1,base+2),(base,base+2,base+3),(base,base+3,base+4),(base,base+4,base+1)])
        indices.extend([rng.choices([0,1,2],[5,3,2])[0]]*4)
    ob=mod['mesh_object']('A_Folded_Leaves',verts,faces,bpy.data.collections['SS_A_04_Grove_and_Planting'],list(canopy.data.materials),indices)
    ec=bpy.data.collections['SS_Shared_06_Clouds_and_Light']
    fill=mod['light']('Soft_Foreground_Fill',ec,'AREA',(10,-20,22),(.61,.74,1),1800,30,target=(0,0,0))
    fill.data.use_shadow=False
    a['Leaf_Polish']=True
    # Leave the connected Blender on A with an uncluttered rendered camera view.
    if bpy.context.window:
        bpy.context.window.scene=a
        for area in bpy.context.screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active; space.overlay.show_overlays=False
                space.shading.type='RENDERED'; space.region_3d.view_perspective='CAMERA'
                space.region_3d.view_camera_zoom=5
    bpy.context.view_layer.update(); bpy.ops.wm.save_mainfile()
    return {'status':'polished','leaf_faces':len(faces),'active_scene':a.name}


if __name__=='__main__':
    result=polish()

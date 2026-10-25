"""First render review: improve depth, foliage, cliff massing and waterfall framing."""
from pathlib import Path
import runpy
import math
import random
import bpy
from mathutils import Vector
from mathutils.noise import noise_vector

ROOT=Path(__file__).resolve().parent


def refine():
    a=bpy.data.scenes['SS_Study_A_Cinematic']
    b=bpy.data.scenes['SS_Study_B_LowPoly']
    if a.get('Refinement_1'):
        return {'status':'already refined'}
    mod=runpy.run_path(str(ROOT/'build_studies.py'))
    mat=mod['material']; Batch=mod['Batch']
    city=bpy.data.collections['SS_Shared_05_City_Far_Below']
    for obj in city.objects:
        obj.scale=(6,6,1.5)
        obj.location.z=-562.5
    # A distant ground plane beyond the finite city prevents a hard tabletop edge.
    base=Batch('Far_Ground_Extension',city,[bpy.data.materials['SS_City_Ground']])
    base.box((0,700,-751),(10000,10000,1)); base.finish()
    road=bpy.data.materials['SS_City_Roads'].node_tree.nodes.get('Principled BSDF')
    road.inputs['Emission Strength'].default_value=.03
    road.inputs['Base Color'].default_value=(.055,.075,.11,1)
    cam=bpy.data.objects['SS_Camera_Overview']; cam.location=(40,-62,35)
    cam.rotation_euler=(Vector((0,0,-10))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.data.lens=42; cam.data.clip_end=6000
    bpy.data.objects['SS_Camera_Workshop'].data.clip_end=6000
    bpy.data.lights['SS_Cool_Sky_Key'].energy=.85
    bpy.data.lights['SS_Warm_Horizon'].energy=1500
    bpy.data.lights['SS_Blue_Fill'].energy=2000
    bpy.data.worlds['SS_Blue_Hour_World'].node_tree.nodes.get('Background').inputs['Strength'].default_value=.38
    for s in (a,b):
        s.view_settings.exposure=.3
        s.eevee.use_volume_custom_range=True
        s.eevee.volumetric_start=.1; s.eevee.volumetric_end=2000
        s.eevee.volumetric_samples=96
        s.eevee.volumetric_sample_distribution=.8
    # Direct volume-scatter nodes avoid depending on volume-grid attribute sockets.
    cm=bpy.data.materials['SS_Cloud_Volume']; n,l=cm.node_tree.nodes,cm.node_tree.links
    vol=next(node for node in n if node.type=='PRINCIPLED_VOLUME')
    ramp=next(node for node in n if node.type=='VALTORGB')
    ramp.color_ramp.elements[1].color=(.25,.25,.25,1)
    out=next(node for node in n if node.type=='OUTPUT_MATERIAL')
    sc=n.new('ShaderNodeVolumeScatter'); sc.inputs['Color'].default_value=(.66,.74,.91,1); sc.inputs['Anisotropy'].default_value=.18
    l.new(ramp.outputs[0],sc.inputs['Density']); l.new(sc.outputs[0],out.inputs['Volume']); n.remove(vol)
    # Low density blue haze carries the city into the distance while leaving the home clear.
    fog=bpy.data.materials.new('SS_Distance_Haze'); fog.use_nodes=True
    n,l=fog.node_tree.nodes,fog.node_tree.links; n.clear()
    sc=n.new('ShaderNodeVolumeScatter'); sc.inputs['Color'].default_value=(.43,.52,.75,1); sc.inputs['Density'].default_value=.00065; sc.inputs['Anisotropy'].default_value=.1
    out=n.new('ShaderNodeOutputMaterial'); l.new(sc.outputs[0],out.inputs['Volume'])
    ec=bpy.data.collections['SS_Shared_06_Clouds_and_Light']
    foggeo=Batch('Atmospheric_Depth',ec,[fog]); foggeo.box((0,500,-500),(7000,7000,1400)); foggeo.finish()
    # Sculpt the A canopy, then add small leaves to disrupt the cushion-like silhouette.
    rng=random.Random(417)
    leafobj=bpy.data.objects['SS_A_Tree_Canopies']; mesh=leafobj.data
    for v in mesh.vertices:
        d=noise_vector(v.co*2.7)
        v.co += Vector((d.x*.17,d.y*.17,d.z*.13))
    mesh.update()
    leaves=Batch('A_Foliage_Detail',bpy.data.collections['SS_A_04_Grove_and_Planting'],list(mesh.materials))
    for poly in mesh.polygons:
        if rng.random()>.31: continue
        q=poly.center + poly.normal*.07
        rot=poly.normal.to_track_quat('Z','Y').to_matrix().to_4x4()
        leaves.part('ico',q,(rng.uniform(.11,.22),rng.uniform(.12,.26),.035),rng.randrange(3),1,rotation=rot,smooth=True)
    leaves.finish()
    # Break up the A cliff's regular triangular cone using larger sculpted outcrops.
    rc=bpy.data.collections['SS_A_01_Island']
    rockm=[bpy.data.materials['SS_A_rock'],bpy.data.materials['SS_A_rock_light'],bpy.data.materials['SS_A_rock_dark']]
    rock=Batch('A_Cliff_Outcrops',rc,rockm)
    for i in range(38):
        angle=rng.uniform(0,math.tau)
        z=rng.uniform(-10,-1.7); r=1+(z+1.7)*.025
        x=16*r*math.cos(angle); y=11.5*r*math.sin(angle)
        if y<-8 and 2<x<7: continue
        rock.part('ico',(x,y,z),(rng.uniform(1,2),rng.uniform(.7,1.25),rng.uniform(1,2.8)),rng.randrange(3),2)
    rock.finish(.13)
    # Slightly varied stream strands, with gentle lateral splay as they descend.
    for s in (a,b):
        for ob in s.objects:
            if 'Waterfall_Ribbon_' in ob.name:
                k=int(ob.name.rsplit('_',1)[1])
                for v in ob.data.vertices:
                    t=max(0,-v.co.z/31)
                    v.co.x += (k-4)*.06*t+.045*math.sin(v.co.z*2.1+k)
                    v.co.y += .075*math.sin(v.co.z*1.3+k)
                ob.data.update()
    a['Refinement_1']=True; b['Refinement_1']=True
    bpy.context.view_layer.update()
    bpy.ops.wm.save_mainfile()
    return {'status':'refined','city_ground_z':-750,'overview_target_z':-10,'distance_haze_density':.00065,'A_extra_objects':['Foliage_Detail','Cliff_Outcrops']}


if __name__=='__main__':
    result=refine()

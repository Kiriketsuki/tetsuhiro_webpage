"""Finish the comparison: cloud veil, falling-water fade, and denser distant city."""
from pathlib import Path
import random
import runpy
import bpy

ROOT=Path(__file__).resolve().parent


def finish():
    a=bpy.data.scenes['SS_Study_A_Cinematic']
    if a.get('Refinement_2'): return {'status':'already finished'}
    mod=runpy.run_path(str(ROOT/'build_studies.py')); Batch=mod['Batch']
    # Keep the city at the established elevation; use smaller buildings and finer blocks.
    obj=bpy.data.objects['SS_Distant_City_Blocks']
    cityc=bpy.data.collections['SS_Shared_05_City_Far_Below']
    cb=Batch('Distant_City_Fine_Blocks',cityc,list(obj.data.materials))
    rng=random.Random(119)
    for ix in range(-31,32):
        for iy in range(-15,53):
            x,y=ix*5,iy*5
            import math
            river_x=20+22*math.sin(y*.022)
            if abs(x-river_x)<11 or rng.random()<.19: continue
            w,d=rng.uniform(1.8,3.5),rng.uniform(1.8,3.5)
            h=rng.uniform(1.7,8.5)*(1.8 if abs(ix-8)<6 and iy>13 else 1)
            cb.box((x,y,-125+h/2),(w,d,h),rng.randrange(2))
            for z in range(2,int(h),2):
                for off in (-.24,.24):
                    if rng.random()<.60: cb.box((x+off*w,y-d/2-.02,-125+z),(.22,.025,.38),2 if rng.random()<.85 else 3)
                    if rng.random()<.35: cb.box((x+w/2+.02,y+off*d,-125+z),(.025,.22,.38),2)
    replacement=cb.finish(); replacement.scale=obj.scale; replacement.location=obj.location
    # Preserve the earlier city as a hidden iteration rather than deleting it.
    obj.hide_render=True; obj.hide_viewport=True
    # Broader banks below the island separate the foreground from the city.
    ec=bpy.data.collections['SS_Shared_06_Clouds_and_Light']; cm=bpy.data.materials['SS_Cloud_Volume']
    cloud=Batch('Sanctuary_Cloud_Sea',ec,[cm])
    for x,y,z in [(-27,-7,-35),(-18,20,-39),(31,-4,-40),(39,25,-41),(5,47,-41),(-24,60,-43)]:
        for j in range(4):
            cloud.part('ico',(x+rng.uniform(-7,7),y+rng.uniform(-7,7),z+rng.uniform(-2,2)),(rng.uniform(11,18),rng.uniform(8,13),rng.uniform(4,7)),subdivisions=2,smooth=True)
    for j in range(7):
        cloud.part('ico',(5+rng.uniform(-4,4),-13+rng.uniform(-3,3),-30+rng.uniform(-2,2)),(rng.uniform(3,5),rng.uniform(2,4),rng.uniform(2,3)),subdivisions=2,smooth=True)
    cloud.finish()
    for n in cm.node_tree.nodes:
        if n.type=='VALTORGB':
            n.color_ramp.elements[0].position=.22
            n.color_ramp.elements[1].color=(.50,.50,.50,1)
    for style in ('A','B'):
        for key in ('fall','foam'):
            mat=bpy.data.materials['SS_'+style+'_'+key]
            n,l=mat.node_tree.nodes,mat.node_tree.links; p=n.get('Principled BSDF')
            # The falling sheets become spray, avoiding a hard cut at their lower edge.
            geom=n.new('ShaderNodeNewGeometry'); sep=n.new('ShaderNodeSeparateXYZ'); l.new(geom.outputs['Position'],sep.inputs[0])
            fade=n.new('ShaderNodeMapRange'); fade.inputs['From Min'].default_value=-18; fade.inputs['From Max'].default_value=-31
            fade.inputs['To Min'].default_value=1; fade.inputs['To Max'].default_value=0; fade.clamp=True
            l.new(sep.outputs['Z'],fade.inputs['Value']); l.new(fade.outputs[0],p.inputs['Alpha'])
            mat.surface_render_method='DITHERED'
            p.inputs['Emission Strength'].default_value=.06
            if style=='A':
                tc=n.new('ShaderNodeTexCoord'); mapping=n.new('ShaderNodeVectorMath'); mapping.operation='MULTIPLY'; mapping.inputs[1].default_value=(2.5,2.5,.22); l.new(tc.outputs['Object'],mapping.inputs[0])
                tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=4; tex.inputs['Detail'].default_value=2; l.new(mapping.outputs[0],tex.inputs['Vector'])
                colors=n.new('ShaderNodeValToRGB'); colors.color_ramp.elements[0].color=(.14,.43,.53,1); colors.color_ramp.elements[1].color=(.72,.85,.87,1)
                l.new(tex.outputs['Fac'],colors.inputs[0]); l.new(colors.outputs[0],p.inputs['Base Color'])
                bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.27; bump.inputs['Distance'].default_value=.13; l.new(tex.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs[0],p.inputs['Normal'])
    # Warmth remains concentrated in the workshop, with greenery visible in cool fill.
    bpy.data.lights['SS_Cool_Sky_Key'].energy=1.05
    bpy.data.lights['SS_Warm_Horizon'].energy=2100
    bpy.data.lights['SS_Falls_Rim'].energy=1100
    for s in (a,bpy.data.scenes['SS_Study_B_LowPoly']):
        s['Refinement_2']=True
        s.render.resolution_x=1800; s.render.resolution_y=1400
        s.eevee.taa_render_samples=96
    bpy.context.view_layer.update(); bpy.ops.wm.save_mainfile()
    return {'status':'finished','city_buildings':'smaller, denser, shared by both studies','falling_water':'fades into spray and mist'}


if __name__=='__main__':
    result=finish()

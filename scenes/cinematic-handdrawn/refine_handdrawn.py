"""Review pass: quieter painted washes, physical grass, trailing plants and selective ink."""
from pathlib import Path
import math
import random
import runpy
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parent


def refine():
    s=bpy.data.scenes['Sanctuary_Handdrawn_Cinematic']
    if s.get('Illustration_Refinement'):return {'status':'already refined'}
    mod=runpy.run_path(str(ROOT/'build_handdrawn.py'))
    root=bpy.data.collections['HD_Cinematic_Sanctuary'];c=mod['coll']('06_Grasses_and_Trailing_Plants',root)
    grass=bpy.data.materials['SS_HD_Sage_Ground'];n,l=grass.node_tree.nodes,grass.node_tree.links;p=n.get('Principled BSDF')
    texture=next(node for node in n if node.type=='TEX_IMAGE')
    noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=.42;noise.inputs['Detail'].default_value=2
    tc=next(node for node in n if node.type=='TEX_COORD');l.new(tc.outputs['Object'],noise.inputs['Vector'])
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.12,.23,.105,1);ramp.color_ramp.elements[1].color=(.29,.40,.19,1);l.new(noise.outputs['Fac'],ramp.inputs[0])
    mix=n.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.15;l.new(ramp.outputs[0],mix.inputs[1]);l.new(texture.outputs[0],mix.inputs[2]);l.new(mix.outputs[0],p.inputs['Base Color']);l.new(mix.outputs[0],p.inputs['Emission Color'])
    rock=bpy.data.materials['SS_HD_Mineral_Wash'];n,l=rock.node_tree.nodes,rock.node_tree.links;p=n.get('Principled BSDF')
    oldmix=next(node for node in n if node.type=='MIX_RGB');wash=n.new('ShaderNodeMixRGB');wash.inputs[0].default_value=.38;wash.inputs[1].default_value=(.28,.33,.40,1);l.new(oldmix.outputs[0],wash.inputs[2]);l.new(wash.outputs[0],p.inputs['Base Color']);l.new(wash.outputs[0],p.inputs['Emission Color'])
    # Larger individual leaves make the layered crowns lush while retaining actual leaf geometry.
    ob=bpy.data.objects['SS_HD_Individual_Painted_Leaves']
    for base in range(0,len(ob.data.vertices),7):
        center=sum((ob.data.vertices[base+j].co for j in range(1,7)),Vector())/6
        for j in range(7):ob.data.vertices[base+j].co=center+(ob.data.vertices[base+j].co-center)*1.28
    ob.data.update()
    # Make every meadow blade a curved surface with a visible midrib.
    rng=random.Random(601);verts=[];faces=[];uv=[];indices=[]
    for i in range(6500):
        x,y=rng.uniform(-15,15),rng.uniform(-10.5,10.5)
        if (x/15)**2+(y/10.5)**2>.95 or (-8<x<5.5 and -.5<y<9) or (2.2<x<6.4 and y<5) or (-3<x<4.5 and -4.2<y<-2.5):continue
        z=.46+.03*math.sin(x+y)
        angle=rng.uniform(0,math.tau);u=Vector((math.cos(angle),math.sin(angle),0));v=Vector((-u.y,u.x,0))
        for j in range(4):
            a=angle+j*2.4;h=rng.uniform(.12,.31)
            q=Vector((x,y,z));tangent=Vector((math.cos(a),math.sin(a),0))
            for k in range(3):
                t0=k/3;t1=(k+1)/3;w0=.025*(1-t0);w1=.025*(1-t1)
                p0=q+Vector((0,0,h*t0))+tangent*h*t0*t0*.5;p1=q+Vector((0,0,h*t1))+tangent*h*t1*t1*.5
                b=len(verts);verts.extend([tuple(p0-v*w0),tuple(p0+v*w0),tuple(p1+v*w1),tuple(p1-v*w1)]);faces.append((b,b+1,b+2,b+3));indices.append(rng.randrange(3))
    leafm=[bpy.data.materials['SS_HD_Leaf_Pigment'],bpy.data.materials['SS_HD_Leaf_Light'],bpy.data.materials['SS_HD_Leaf_Shadow']]
    mod['mesh_object']('HD_Meadow_Blades',verts,faces,c,leafm,indices,smooth=True)
    # Trailing foliage follows the eroded cliff instead of floating in front of it.
    verts=[];faces=[];uv=[];indices=[]
    for j in range(22):
        a=j*math.tau/22+.07*math.sin(j)
        pts=[]
        for k in range(38):
            t=.015+k/38*rng.uniform(.17,.42)
            point=Vector(mod['cliff_point'](a+.015*math.sin(k*.35+j),t,.11));pts.append(tuple(point))
            for side in (-1,1):
                u=Vector((math.cos(a),math.sin(a),.45)).normalized();v=Vector((-math.sin(a),math.cos(a),0))
                center=point+v*.10*side
                mod['leaf_geometry'](center,u,v,.26,.20,verts,faces,uv,indices,rng.randrange(3))
        mod['stroke']('Trailing_Vine',pts,c,leafm[2],.014)
    mod['mesh_object']('HD_Trailing_Leaf_Sprays',verts,faces,c,leafm,indices,smooth=True)
    # Extend view distance past the city: there must be no clipping horizon through the scene.
    for name in ('SS_HD_Overview','SS_HD_Workshop_Detail','SS_HD_Cliff_Detail'):
        bpy.data.objects[name].data.clip_end=6500
    # Fine warm-indigo drawing on selected architecture and terrain; avoid outlining every leaf.
    lines=mod['coll']('Selective_Ink_Objects',s.collection)
    ink_names=['HD_SS_A_Timber_Structure','HD_SS_A_Deck_and_Floors','HD_SS_A_Walls','HD_SS_A_Garden_Footbridge','SS_HD_Continuous_Eroded_Cliff','SS_HD_Hand_Laid_Slates']
    for name in ink_names:
        if bpy.data.objects.get(name):lines.objects.link(bpy.data.objects[name])
    s.render.use_freestyle=True
    fs=s.view_layers[0].freestyle_settings
    ls=fs.linesets[0] if len(fs.linesets) else fs.linesets.new('Fine drawn edges')
    ls.name='Selective drawn contours';ls.select_by_collection=True;ls.collection=lines;ls.collection_negation='INCLUSIVE'
    ls.select_crease=False;ls.select_silhouette=True;ls.select_external_contour=True;ls.select_border=True;ls.select_material_boundary=False
    style=ls.linestyle;style.color=(.055,.085,.13);style.alpha=.46;style.thickness=.80
    s['Illustration_Refinement']=True
    bpy.context.view_layer.update();bpy.ops.wm.save_mainfile()
    return {'status':'refined','physical_grass_faces':len(bpy.data.objects['SS_HD_Meadow_Blades'].data.polygons),'ink_collection':lines.name,'line_thickness':style.thickness}


if __name__=='__main__':result=refine()

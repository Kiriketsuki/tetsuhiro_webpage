"""High fidelity hand-painted sanctuary. Preserve both earlier style studies.

Run build() in the connected Blender after the style-studies file is open.
The texture atlas is original imagegen material artwork; geometry is procedural.
"""
from pathlib import Path
import math
import json
import random
import runpy
import time
import bpy
import numpy as np
from mathutils import Vector, Matrix
from mathutils.noise import noise_vector, noise

ROOT=Path(__file__).resolve().parent
BASE=runpy.run_path(str(ROOT.parent/'sanctuary-style-studies'/'build_studies.py'))
Batch, mesh_object, addlight, camera = [BASE[k] for k in ('Batch','mesh_object','light','camera')]
TAU=math.tau


def coll(name,parent):
    c=bpy.data.collections.new('HD_'+name); parent.children.link(c); return c


def clone_collection(source,parent,mapping,copy_mesh=False):
    c=coll(source.name,parent)
    for ob in source.objects:
        no=ob.copy(); no.name='HD_'+ob.name
        if ob.data and (copy_mesh or ob.type in ('LIGHT','CAMERA')):
            no.data=ob.data.copy()
        c.objects.link(no); mapping[ob.name]=no
    for child in source.children:
        clone_collection(child,c,mapping,copy_mesh)
    return c


def split_atlas():
    atlas=bpy.data.images.load(str(ROOT/'textures'/'painted_atlas.png'),check_existing=True)
    atlas.name='HD_Painted_Atlas'
    w,h=atlas.size; arr=np.empty(w*h*4,dtype=np.float32); atlas.pixels.foreach_get(arr)
    arr=arr.reshape(h,w,4); hw,hh=w//2,h//2
    regions={'wood':arr[hh:hh*2,:hw], 'rock':arr[hh:hh*2,hw:hw*2],
             'roof':arr[:hh,:hw], 'leaf':arr[:hh,hw:hw*2]}
    images={}
    for key,pixels in regions.items():
        im=bpy.data.images.new('HD_Painted_'+key,hw,hh,alpha=False)
        im.pixels.foreach_set(np.ascontiguousarray(pixels).ravel())
        im.filepath_raw=str(ROOT/'textures'/('painted_'+key+'.png')); im.file_format='PNG'; im.save(); im.pack()
        images[key]=im
    atlas.pack()
    return images


def paint_material(name,color,image=None,scale=.3,uv=False,roughness=.78):
    m=BASE['material']('HD_'+name,color,roughness)
    n,l=m.node_tree.nodes,m.node_tree.links; p=n.get('Principled BSDF')
    p.inputs['Specular IOR Level'].default_value=.22
    if image:
        tc=n.new('ShaderNodeTexCoord'); tex=n.new('ShaderNodeTexImage'); tex.image=image
        if uv:
            l.new(tc.outputs['UV'],tex.inputs['Vector'])
        else:
            sc=n.new('ShaderNodeVectorMath'); sc.operation='SCALE'; sc.inputs['Scale'].default_value=scale
            l.new(tc.outputs['Object'],sc.inputs[0]); l.new(sc.outputs[0],tex.inputs['Vector'])
            tex.projection='BOX'; tex.projection_blend=.3
        tex.interpolation='Cubic'; tex.extension='REPEAT'
        mix=n.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=.23
        mix.inputs[2].default_value=(*color,1); l.new(tex.outputs['Color'],mix.inputs[1])
        l.new(mix.outputs[0],p.inputs['Base Color']); l.new(mix.outputs[0],p.inputs['Emission Color'])
        bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.12
        bump.inputs['Distance'].default_value=.055
        l.new(tex.outputs['Color'],bump.inputs['Height']); l.new(bump.outputs[0],p.inputs['Normal'])
    else:
        p.inputs['Emission Color'].default_value=(*color,1)
    p.inputs['Emission Strength'].default_value=.075
    return m


def brush_uv(ob):
    if ob.type!='MESH':return
    me=ob.data; uv=me.uv_layers.new(name='Painted grain')
    for face in me.polygons:
        points=[me.vertices[i].co for i in face.vertices]
        edges=[points[(i+1)%len(points)]-points[i] for i in range(len(points))]
        along=max(edges,key=lambda e:e.length).normalized()
        across=face.normal.cross(along).normalized()
        for li,vi in zip(face.loop_indices,face.vertices):
            q=me.vertices[vi].co
            uv.data[li].uv=(q.dot(across)*.72,q.dot(along)*.20)


def outline_profile(a,t):
    # Broad massing is coherent; narrow sinuous faults describe erosion rather than triangles.
    keys=[(0,1),(.08,1.015),(.25,.94),(.44,.80),(.63,.62),(.82,.39),(1,.055)]
    for i in range(len(keys)-1):
        lo,r0=keys[i]; hi,r1=keys[i+1]
        if t<=hi:
            f=(t-lo)/(hi-lo); f=f*f*(3-2*f); radius=r0+(r1-r0)*f; break
    border=1+.045*math.sin(3*a+.6)+.025*math.sin(7*a-1.2)
    ridges=(.045*math.sin(9*a+1.4*t)+.026*math.sin(17*a-2.2*t))*math.sin(math.pi*t)
    return radius*border+ridges


def cliff_point(a,t,offset=0):
    r=outline_profile(a,t)
    x=16*r*math.cos(a); y=11.5*r*math.sin(a); z=.33-20*t
    warp=noise_vector(Vector((x*.23,y*.23,z*.19)))
    strength=math.sin(math.pi*t)*.65
    return (x+warp.x*strength+offset*math.cos(a),y+warp.y*strength+offset*math.sin(a),z+warp.z*strength)


def stroke(name,pts,collection,mat,radius=.018):
    data=bpy.data.curves.new('HD_'+name,'CURVE'); data.dimensions='3D'; data.resolution_u=2
    data.bevel_depth=radius; data.bevel_resolution=2
    s=data.splines.new('POLY'); s.points.add(len(pts)-1)
    for p,q in zip(s.points,pts):p.co=(*q,1)
    ob=bpy.data.objects.new('HD_'+name,data);collection.objects.link(ob);data.materials.append(mat)
    return ob


def terrain(parent,mats):
    c=coll('01_Eroded_Island',parent); n=192; rings=72
    verts=[cliff_point(i*TAU/n,k/(rings-1)) for k in range(rings) for i in range(n)]
    faces=[(k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i) for k in range(rings-1) for i in range(n)]
    ob=mesh_object('HD_Continuous_Eroded_Cliff',verts,faces,c,[mats['rock']],smooth=True)
    sub=ob.modifiers.new('Continuous sculpted surface','SUBSURF'); sub.levels=1; sub.render_levels=2
    # A continuous plateau with a channel recessed below the stream.
    path=[(4,3),(3.8,1),(3.6,-1),(4,-3),(4.3,-5),(4.2,-7),(4.7,-9.3),(4.9,-10.8)]
    def height(x,y):
        z=.45+.12*noise(Vector((x*.45,y*.45,1)))
        d=100
        p=Vector((x,y))
        for a,b in zip(path,path[1:]):
            a,b=Vector(a),Vector(b); v=b-a; f=max(0,min(1,(p-a).dot(v)/v.length_squared))
            d=min(d,(p-(a+v*f)).length)
        pond=((x-4)/2.9)**2+((y-4)/2.5)**2
        if d<1.1 or pond<1:z-=.35
        return z
    verts=[(0,0,height(0,0))]
    nr=54
    for k in range(1,nr+1):
        r=k/nr
        for i in range(n):
            a=i*TAU/n; border=outline_profile(a,0)
            x=16*r*border*math.cos(a);y=11.5*r*border*math.sin(a)
            verts.append((x,y,height(x,y)))
    faces=[(0,1+i,1+(i+1)%n) for i in range(n)]
    for k in range(nr-1):
        faces.extend([(1+k*n+i,1+k*n+(i+1)%n,1+(k+1)*n+(i+1)%n,1+(k+1)*n+i) for i in range(n)])
    top=mesh_object('HD_Continuous_Garden_Ground',verts,faces,c,[mats['grass']],smooth=True)
    sub=top.modifiers.new('Rounded earthen surface','SUBSURF');sub.levels=1;sub.render_levels=1
    # Drawn mineral faults follow the sculpted surface, with quiet irregular line weight.
    rng=random.Random(521)
    for i in range(23):
        a=i*TAU/23+rng.uniform(-.06,.06)
        pts=[cliff_point(a+.015*math.sin(t*18+i),t,.035) for t in np.linspace(.12,rng.uniform(.60,.92),64)]
        stroke('Mineral_Trace',pts,c,mats['ink'],rng.uniform(.010,.022))
    return c


def leaf_geometry(center,u,v,length,width,verts,faces,uvcoords,mat_indices,mi):
    center=Vector(center);u=Vector(u);v=Vector(v);normal=u.cross(v).normalized()
    start=len(verts)
    # Pointed, gently curved leaf with a raised midrib and six boundary points.
    points=[center+normal*length*.07,center-u*length*.50,
            center-u*length*.20+v*width*.52,center+u*length*.25+v*width*.44,
            center+u*length*.55,center+u*length*.25-v*width*.44,center-u*length*.20-v*width*.52]
    verts.extend([tuple(p) for p in points])
    for k in range(6):
        faces.append((start,start+1+k,start+1+(k+1)%6));mat_indices.append(mi)
        uvcoords.extend([(.5,.5),((points[1+k]-center).dot(v)/width+.5,(points[1+k]-center).dot(u)/length+.5),((points[1+(k+1)%6]-center).dot(v)/width+.5,(points[1+(k+1)%6]-center).dot(u)/length+.5)])


def branch_mesh(name,points,radii,c,mat):
    verts=[];faces=[];n=12
    for j,p in enumerate(points):
        direction=Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])
        rot=direction.to_track_quat('Z','Y').to_matrix()
        for i in range(n):
            a=i*TAU/n; off=rot@Vector((math.cos(a)*radii[j],math.sin(a)*radii[j],0))
            verts.append(tuple(Vector(p)+off))
    for j in range(len(points)-1):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    ob=mesh_object(name,verts,faces,c,[mat],smooth=True);brush_uv(ob)
    return ob


def garden(parent,mats):
    c=coll('02_Leafy_Grove',parent);rng=random.Random(531)
    verts=[];faces=[];uv=[];indices=[]
    for ti,(x,y,s) in enumerate([(-11,5.5,1.05),(-12,1,.73),(-8.8,8.5,.8),(9,6,.8),(11,1.5,.62)]):
        trunk=[(x,y,.4),(x+.13*s,y-.1*s,2*s),(x+.32*s,y,4*s),(x+.18*s,y+.3*s,5.7*s)]
        branch_mesh('HD_Swept_Trunk',trunk,[.27*s,.22*s,.14*s,.055*s],c,mats['bark'])
        for j in range(8):
            a=j*2.40+ti*.6
            root=Vector((x+.2*s,y,(2.5+j*.27)*s))
            end=Vector((x+math.cos(a)*2.3*s,y+math.sin(a)*1.8*s,(4.4+j*.28)*s))
            mid=root.lerp(end,.55)+Vector((0,0,.25*s))
            branch_mesh('HD_Canopy_Branch',[root,mid,end],[.12*s,.075*s,.025*s],c,mats['bark'])
            for twig in range(3):
                q=end+Vector((rng.uniform(-.7,.7)*s,rng.uniform(-.7,.7)*s,rng.uniform(-.2,.6)*s))
                branch_mesh('HD_Fine_Twig',[mid,end,q],[.045*s,.025*s,.008*s],c,mats['bark'])
                for k in range(95):
                    theta=rng.uniform(0,TAU); zz=rng.uniform(-1,1); rr=math.sqrt(max(0,1-zz*zz))
                    radial=rng.uniform(.45,1)
                    off=Vector((math.cos(theta)*rr*1.25*s,math.sin(theta)*rr*1.05*s,zz*.65*s))*radial
                    pos=q+off
                    u=Vector((math.cos(theta+.6),math.sin(theta+.6),rng.uniform(-.25,.45))).normalized()
                    v=Vector((-u.y,u.x,rng.uniform(-.3,.3))).normalized()
                    leaf_geometry(pos,u,v,rng.uniform(.24,.46)*s,rng.uniform(.13,.25)*s,verts,faces,uv,indices,rng.choices([0,1,2],[5,3,2])[0])
    foliage=mesh_object('HD_Individual_Painted_Leaves',verts,faces,c,[mats['leaf'],mats['leaf_light'],mats['leaf_dark']],indices,smooth=True)
    layer=foliage.data.uv_layers.new(name='Leaf paint')
    # Global projection gives each small leaf an original patch of the painted pigment.
    for poly in foliage.data.polygons:
        for li,vi in zip(poly.loop_indices,poly.vertices):
            p=foliage.data.vertices[vi].co;layer.data[li].uv=(p.x*.47,p.y*.47+p.z*.12)
    # Fern beds, with arched fronds and individual paired pinnae.
    fv=[];ff=[];fu=[];fi=[]
    for x,y in [(-9,-1),(-9,1),(-10,-3),(7,-3),(8,-5),(6.5,7),(10,0),(-6,9)]:
        for j in range(9):
            a=j*TAU/9;u=Vector((math.cos(a),math.sin(a),0));v=Vector((-math.sin(a),math.cos(a),0))
            for k in range(1,9):
                t=k/9; pos=Vector((x,y,.5))+u*t*.95+Vector((0,0,math.sin(t*math.pi)*.58))
                for sign in (-1,1):
                    q=pos+v*sign*(1-t)*.16
                    leaf_geometry(q,v*sign,u,.20*(1-t)+.05,.08,fv,ff,fu,fi,0)
    mesh_object('HD_Fern_Pinnae',fv,ff,c,[mats['leaf_light']],fi,smooth=True)


def crafted_roof(parent,mats):
    c=coll('03_Individual_Roof_Slates',parent);rng=random.Random(543)
    vertices=[];faces=[]
    for side in (-1,1):
        for row in range(10):
            d0=row*.51;d1=d0+.57
            for column in range(23):
                y0=-.14+column*.42+(row%2)*.10;y1=y0+.41
                z0=8.40-d0*.69+.30*(d0/5.1)**5
                z1=8.40-d1*.69+.30*(d1/5.1)**5
                wobble=rng.uniform(-.018,.018);base=len(vertices)
                for t in (0,.5,1):
                    for f in (0,.5,1):
                        d=d0+(d1-d0)*t;y=y0+(y1-y0)*f
                        z=z0+(z1-z0)*t+.025*math.sin(f*math.pi)+wobble
                        vertices.append((-3+side*d,y,z))
                for k in range(2):
                    for j in range(2):faces.append((base+k*3+j,base+k*3+j+1,base+(k+1)*3+j+1,base+(k+1)*3+j))
    roof=mesh_object('HD_Hand_Laid_Slates',vertices,faces,c,[mats['roof']],smooth=True);brush_uv(roof)
    sol=roof.modifiers.new('Visible slate thickness','SOLIDIFY');sol.thickness=.045
    bevel=roof.modifiers.new('Soft drawn tile edges','BEVEL');bevel.width=.025;bevel.segments=3
    # Genuine rafters, ridge caps and small timber joinery details.
    detail=Batch('HD_Rafters_and_Joinery',c,[mats['wood'],mats['roof'],mats['ink']])
    for side in (-1,1):
        for j in range(18):
            y=-.10+j*.55
            detail.beam((-3,y,8.11),(-3+side*5.05,y,5.0),.12,.14)
    for i in range(22):
        y=-.15+i*.45
        branch_mesh('HD_Ceramic_Ridge',[(-3,y,8.47),(-3,y+.43,8.47)],[.15,.15],c,mats['roof'])
    for y in (1,8.3):
        for x in (-7,-3,1):
            detail.part('ico',(x,y-.13,5.1),(.065,.035,.065),2,2,smooth=True)
    detail.finish(.025)


def home_details(parent,mats):
    c=coll('04_Workshop_Objects',parent);rng=random.Random(547)
    b=Batch('HD_Lived_In_Objects',c,[mats['wood'],mats['paper'],mats['ceramic'],mats['ink'],mats['warm']])
    # Stone foundation courses replace the unsupported slab impression.
    for row in range(3):
        for j in range(13):
            x=-7.3+j*.70+(row%2)*.16
            b.box((x,.1,.35+row*.25),(.67,.65,.23),1)
    for j in range(4):b.box((-.3+j*.05,2.75,2.13+j*.045),(.65,.36,.045),1)
    b.box((-.4,2.75,2.33),(.70,.40,.03),0)
    for y in (4.2,5.0,5.8):
        b.box((3.6,y,2.17),(.5,.4,.07),1)
    # Plant containers on the terrace and a detailed workbench.
    for x,y in [(-5.8,.1),(.15,.1),(4.4,2.5)]:
        branch_mesh('HD_Plant_Pot',[(x,y,1.25),(x,y,1.7)],[.22,.30],c,mats['ceramic'])
        for j in range(7):
            a=j*TAU/7
            stroke('Plant_Stem',[(x,y,1.62),(x+.2*math.cos(a),y+.2*math.sin(a),2.0),(x+.35*math.cos(a),y+.35*math.sin(a),2.13)],c,mats['leaf'],.012)
            leaf=Batch('HD_Pot_Leaf',c,[mats['leaf']]); leaf.part('ico',(x+.27*math.cos(a),y+.27*math.sin(a),2.05),(.09,.20,.035),0,2,smooth=True);leaf.finish()
    # Mug, pencil holder, and hand-drawn technical notes.
    branch_mesh('HD_Desk_Mug',[(-.65,3,2.08),(-.65,3,2.30)],[.10,.11],c,mats['ceramic'])
    stroke('Mug_Handle',[(-.54,3,2.25),(-.44,3,2.24),(-.43,3,2.16),(-.54,3,2.13)],c,mats['ceramic'],.022)
    for i in range(6):
        b.beam((3.5+i*.035,4.8,2.1),(3.51+i*.035,4.83,2.40+rng.uniform(-.04,.04)),.017,mat=0)
    b.finish(.035)
    # Subtle notebook sketch lines, actual geometry visible on the work surface.
    for i in range(7):
        pts=[(3.4+j*.045,5.8+i*.025,2.212+.002*math.sin(j+i)) for j in range(7)]
        stroke('Workbench_Pencil_Mark',pts,c,mats['ink'],.0025)


def water(parent,mats,mapping):
    c=coll('05_Painted_Water_and_Spray',parent);rng=random.Random(563)
    old_points=[(4,3,.63),(3.8,1,.63),(3.6,-1,.61),(4,-3,.60),(4.3,-5,.58),(4.2,-7,.57),(4.7,-9.3,.52),(4.9,-10.8,.20)]
    BASE['ribbon']('HD_Flowing_Stream',old_points,[2.2,2,1.8,2.2,2.1,2.2,2.5,2.7],c,mats['water'],segments=20)
    pond=[(4+2.9*math.cos(i*TAU/128),4+2.5*math.sin(i*TAU/128),.63) for i in range(128)]
    mesh_object('HD_Spring_Pool',pond,[tuple(range(128))],c,[mats['water']],smooth=True)
    for j in range(8):
        a0=rng.uniform(0,TAU);r=rng.uniform(.5,2.1)
        pts=[(4+r*math.cos(a0+t),4+r*.7*math.sin(a0+t),.642) for t in np.linspace(0,rng.uniform(.45,1.3),22)]
        stroke('Drawn_Pond_Ripple',pts,c,mats['waterline'],.009)
    # A continuous curved curtain with multiple thin illustrated streaks.
    verts=[];faces=[];nx=44;nz=180
    for j in range(nz):
        t=j/(nz-1)
        for i in range(nx):
            u=i/(nx-1)-.5
            x=4.9+u*(2.7+.5*t)+.055*math.sin(t*28+u*18)
            y=-10.8-2.0*(1-math.exp(-t*10))+.065*math.sin(u*30+t*50)
            z=.2-33*t+.035*math.sin(u*43+t*12)
            verts.append((x,y,z))
    for j in range(nz-1):
        for i in range(nx-1):faces.append((j*nx+i,j*nx+i+1,(j+1)*nx+i+1,(j+1)*nx+i))
    mesh_object('HD_Falling_Water_Curtain',verts,faces,c,[mats['fall']],smooth=True)
    for i in range(26):
        u=rng.uniform(-1.25,1.25);end=rng.uniform(.25,.92)
        pts=[(4.9+u*(1+t*.2)+.04*math.sin(t*25+i),-10.83-2*(1-math.exp(-t*10))-.025,.2-33*t) for t in np.linspace(.01,end,90)]
        stroke('Water_Ink_Streak',pts,c,mats['waterline'],rng.uniform(.008,.018))
    spray=Batch('HD_Light_Spray',c,[mats['waterline']])
    for i in range(260):
        t=rng.uniform(.05,1); z=.2-31*t
        x=4.9+rng.choice([-1,1])*rng.uniform(1.4,2.0)*(.8+t*.4)
        spray.part('ico',(x,-12.2+rng.uniform(-.7,.7),z),(rng.uniform(.008,.035),.018,rng.uniform(.03,.09)),0,1,smooth=True)
    spray.finish()


def build():
    start=time.perf_counter()
    if bpy.data.scenes.get('Sanctuary_Handdrawn_Cinematic'):raise RuntimeError('Scene already exists; refine it instead of overwriting.')
    ROOT.mkdir(parents=True,exist_ok=True);(ROOT/'renders').mkdir(exist_ok=True)
    scene=bpy.data.scenes.new('Sanctuary_Handdrawn_Cinematic')
    mapping={};root=coll('Cinematic_Sanctuary',scene.collection)
    clone_collection(bpy.data.collections['SS_Shared_Environment'],scene.collection,mapping,False)
    clone_collection(bpy.data.collections['SS_A_Sanctuary'],root,mapping,True)
    images=split_atlas()
    mats={
        'wood':paint_material('Cedar',(.65,.40,.22),images['wood'],uv=True),
        'bark':paint_material('Painted_Bark',(.46,.32,.21),images['wood'],uv=True),
        'rock':paint_material('Mineral_Wash',(.62,.67,.76),images['rock'],.16),
        'stone':paint_material('Garden_Stone',(.70,.71,.69),images['rock'],.35),
        'roof':paint_material('Ink_Blue_Slate',(.43,.58,.72),images['roof'],uv=True),
        'grass':paint_material('Sage_Ground',(.44,.62,.34),images['leaf'],.11),
        'leaf':paint_material('Leaf_Pigment',(.54,.68,.37),images['leaf'],uv=True),
        'leaf_light':paint_material('Leaf_Light',(.73,.78,.46),images['leaf'],uv=True),
        'leaf_dark':paint_material('Leaf_Shadow',(.32,.47,.30),images['leaf'],uv=True),
        'ink':paint_material('Quiet_Indigo_Line',(.10,.15,.23)),
        'paper':paint_material('Cream_Paper',(.73,.68,.52)),
        'ceramic':paint_material('Terracotta_Ceramic',(.39,.21,.17)),
        'warm':BASE['material']('HD_Lamp',(1,.58,.25),emission=2.4),
        'water':paint_material('Water_Wash',(.24,.55,.59),roughness=.22),
        'waterline':BASE['material']('HD_Water_Pencil',(.61,.79,.81),roughness=.4,emission=.15),
    }
    # Retain the approved house layout; replace the whole landscape and vegetation.
    keep={'Timber_Structure','Deck_and_Floors','Walls','Glazing','Roof_Tile_Seams','Swept_Pitched_Roof','Workshop_Furniture','Stream_Banks_and_Path','Garden_Footbridge','Terrace_Details'}
    for name,ob in list(mapping.items()):
        if name.startswith('SS_A_') and ob.type=='MESH':
            kind=name[len('SS_A_'):]
            if kind not in keep:ob.hide_render=True;ob.hide_viewport=True;continue
            for i,old in enumerate(list(ob.data.materials)):
                key=old.name.removeprefix('SS_A_')
                target=mats['wood'] if key in ('wood','wood_light') else mats['roof'] if key in ('roof','roof_edge') else mats['stone'] if key in ('stone','rock','rock_light') else mats['grass'] if key=='moss' else mats['paper'] if key=='plaster' else None
                if target:ob.data.materials[i]=target
            brush_uv(ob)
            for modifier in ob.modifiers:
                if modifier.type=='BEVEL':modifier.segments=3;modifier.width=max(.045,modifier.width)
    for name,ob in mapping.items():
        if name.startswith('SS_A_') and ob.type=='LIGHT':ob.data.energy*=1.18
    terrain(root,mats);garden(root,mats);crafted_roof(root,mats);home_details(root,mats)
    # Reuse the earlier transparent water fade, with new brush-like streaks.
    fall=bpy.data.materials['SS_A_fall'].copy();fall.name='HD_Fall_Wash';mats['fall']=fall
    p=fall.node_tree.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.28
    water(root,mats,mapping)
    world=bpy.data.worlds['SS_Blue_Hour_World'].copy();world.name='HD_Blue_Hour_World'
    BASE['setup'](scene,world);scene.view_settings.exposure=.55
    scene.eevee.use_volume_custom_range=True;scene.eevee.volumetric_end=2000;scene.eevee.volumetric_samples=128
    scene.eevee.taa_render_samples=128
    camcoll=coll('Cinematic_Cameras',scene.collection)
    overview=camera('HD_Overview',camcoll,(39,-61,33),(0,0,-9),43)
    detail=camera('HD_Workshop_Detail',camcoll,(15.5,-25,13.0),(-1,3,2.8),53)
    cliff=camera('HD_Cliff_Detail',camcoll,(31,-43,11),(1,0,-5),53)
    scene.camera=overview
    scene['Art_Direction']='Original cozy hand-painted cinematic 3D, smooth eroded terrain, detailed foliage and painted cedar/slate/minerals. Blue hour; warm windows; city below.'
    scene['Reference']='Leaf it Alone: surface drawing language and lived-in charm; palette remains original blue hour.'
    if bpy.context.window:
        bpy.context.window.scene=scene
        for area in bpy.context.screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.overlay.show_overlays=False
                area.spaces.active.shading.type='SOLID';area.spaces.active.shading.color_type='MATERIAL'
    bpy.context.view_layer.update()
    path=ROOT/'sanctuary_handdrawn.blend'
    if path.exists():raise FileExistsError(path)
    bpy.ops.wm.save_as_mainfile(filepath=str(path),check_existing=False)
    report={'file':str(path),'scene':scene.name,'build_seconds':round(time.perf_counter()-start,2),'objects':len(scene.objects),'cameras':[overview.name,detail.name,cliff.name],'textures':'Original imagegen-painted atlas split into four material maps; packed in blend.','note':'Earlier A/B studies retained.'}
    (ROOT/'build_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report


if __name__=='__main__':result=build()

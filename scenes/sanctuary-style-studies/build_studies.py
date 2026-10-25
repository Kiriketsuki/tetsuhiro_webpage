"""Two comparable, editable Blender studies. Run build() in the connected Blender.

Existing scenes are never cleared. This module owns only SS_* data blocks.
All geometry and materials are procedural; no external assets are required.
"""
from pathlib import Path
import json
import math
import random
import time
import bpy
import bmesh
from mathutils import Vector, Matrix
from mathutils.noise import noise_vector

ROOT = Path(__file__).resolve().parent
TAU = math.tau


def collection(name, parent):
    c = bpy.data.collections.new('SS_' + name)
    parent.children.link(c)
    return c


def mesh_object(name, vertices, faces, coll, materials, indices=None, smooth=False):
    mesh = bpy.data.meshes.new('SS_' + name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('SS_' + name, mesh)
    coll.objects.link(obj)
    for mat in materials:
        mesh.materials.append(mat)
    for i, face in enumerate(mesh.polygons):
        face.use_smooth = smooth
        if indices:
            face.material_index = indices[i % len(indices)] % len(materials)
    return obj


class Batch:
    def __init__(self, name, coll, materials):
        self.name, self.coll, self.materials = name, coll, materials
        self.bm = bmesh.new()

    def part(self, kind, location, scale, mat=0, subdivisions=1, rotation=None, smooth=False):
        tr = Matrix.Translation(Vector(location))
        if rotation is not None:
            tr = tr @ rotation
        tr = tr @ Matrix.Diagonal((*scale, 1))
        if kind == 'box':
            vs = bmesh.ops.create_cube(self.bm, size=1, matrix=tr)['verts']
        elif kind == 'ico':
            vs = bmesh.ops.create_icosphere(self.bm, subdivisions=subdivisions, radius=1, matrix=tr)['verts']
        else:
            raise ValueError(kind)
        for f in {f for v in vs for f in v.link_faces}:
            f.material_index = mat
            f.smooth = smooth

    def box(self, location, scale, mat=0, rotation=None):
        self.part('box', location, scale, mat, rotation=rotation)

    def beam(self, a, b, width, depth=None, mat=0):
        a, b = Vector(a), Vector(b)
        d = b - a
        self.box((a + b) / 2, (width, depth or width, d.length), mat,
                 d.to_track_quat('Z', 'Y').to_matrix().to_4x4())

    def finish(self, bevel=0):
        mesh = bpy.data.meshes.new('SS_' + self.name)
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new('SS_' + self.name, mesh)
        self.coll.objects.link(obj)
        for mat in self.materials:
            mesh.materials.append(mat)
        if bevel:
            mod = obj.modifiers.new('Soft crafted edges', 'BEVEL')
            mod.width, mod.segments = bevel, 2
        return obj


def material(name, color, roughness=.65, texture=False, emission=0, metallic=0):
    m = bpy.data.materials.new('SS_' + name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    if emission:
        p.inputs['Emission Color'].default_value = (*color, 1)
        p.inputs['Emission Strength'].default_value = emission
    if texture:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = 2.8
        n.inputs['Detail'].default_value = 3
        n.inputs['Roughness'].default_value = .7
        nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = .12
        ramp.color_ramp.elements[0].color = (*(v * .72 for v in color), 1)
        ramp.color_ramp.elements[1].position = .88
        ramp.color_ramp.elements[1].color = (*(min(v * 1.2, 1) for v in color), 1)
        nt.links.new(n.outputs['Fac'], ramp.inputs[0])
        nt.links.new(ramp.outputs[0], p.inputs['Base Color'])
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = .16
        bump.inputs['Distance'].default_value = .11
        nt.links.new(n.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs[0], p.inputs['Normal'])
    return m


def palette(style):
    soft = style == 'A'
    colors = {
        'grass':(.16,.29,.095), 'moss':(.21,.34,.13),
        'rock':(.21,.24,.31), 'rock_light':(.32,.36,.40), 'rock_dark':(.12,.16,.23),
        'stone':(.43,.43,.40), 'wood':(.27,.115,.045), 'wood_light':(.45,.24,.095),
        'plaster':(.64,.59,.45), 'roof':(.055,.11,.17), 'roof_edge':(.10,.18,.24),
        'leaf':(.12,.27,.15), 'leaf_light':(.25,.39,.15), 'leaf_dark':(.065,.16,.11),
        'fern':(.24,.43,.20), 'water':(.12,.44,.49), 'fall':(.48,.73,.79),
        'foam':(.77,.89,.86), 'metal':(.065,.09,.11), 'soil':(.14,.12,.10),
        'warm':(1,.53,.18), 'paper':(.84,.75,.52), 'screen':(.08,.39,.47),
    }
    out = {}
    for key, color in colors.items():
        tex = soft and key in ('rock','rock_light','rock_dark','wood','wood_light','grass','stone','roof')
        emission = {'warm':3.5,'screen':1.3,'water':.10,'fall':.24,'foam':.20}.get(key,0)
        rough = .2 if key in ('water','fall') else .72
        out[key] = material(style + '_' + key,color,rough,tex,emission)
    glass = material(style + '_glass',(.50,.66,.68),.16)
    nodes, links = glass.node_tree.nodes, glass.node_tree.links
    nodes.clear()
    tr = nodes.new('ShaderNodeBsdfTransparent')
    tr.inputs[0].default_value = (.86,.93,.95,1)
    gl = nodes.new('ShaderNodeBsdfGlossy')
    gl.inputs['Color'].default_value = (.65,.75,.79,1)
    gl.inputs['Roughness'].default_value = .16
    mx = nodes.new('ShaderNodeMixShader')
    mx.inputs[0].default_value = .08
    links.new(tr.outputs[0],mx.inputs[1]); links.new(gl.outputs[0],mx.inputs[2])
    o = nodes.new('ShaderNodeOutputMaterial'); links.new(mx.outputs[0],o.inputs['Surface'])
    glass.surface_render_method = 'DITHERED'
    out['glass'] = glass
    return out


def island(style, parent, p):
    c = collection(style + '_01_Island',parent)
    rng = random.Random(34)
    n = 48 if style == 'A' else 20
    # Shared footprint, with additional intermediate rings in the sculpted study.
    rings = [(1, .35), (1.01,-1.4),(.90,-4.6),(.76,-8.5),(.53,-13.0),(.21,-17.7)]
    vertices = []
    for k,(radius,z) in enumerate(rings):
        for i in range(n):
            a = i * TAU / n + (.045 * (k % 2))
            wave = 1 + .045 * math.sin(5*a+.3) + .03 * math.sin(9*a)
            v = (16*radius*wave*math.cos(a),11.5*radius*wave*math.sin(a),z + rng.uniform(-.6,.6)*(k > 0))
            vertices.append(v)
    faces, mi = [], []
    for k in range(len(rings)-1):
        for i in range(n):
            a,b,c0,d = k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i
            faces.extend([(a,b,d),(b,c0,d)])
            mi.extend([rng.choices([0,1,2],[6,2,2])[0],rng.choices([0,1,2],[6,2,2])[0]])
    vertices.append((0,1,-20))
    faces.extend([(len(vertices)-1,(len(rings)-1)*n+i,(len(rings)-1)*n+(i+1)%n) for i in range(n)])
    mesh_object(style+'_Floating_Rock',vertices,faces,c,[p['rock'],p['rock_light'],p['rock_dark']],mi)
    # Irregular plateau and radial grass patches, all at a common readable surface.
    top = [(0,0,.39)]
    for radius in (.42,.72,1):
        for i in range(n):
            a = i*TAU/n
            wave = 1 + .045*math.sin(5*a+.3)+.03*math.sin(9*a)
            top.append((16*radius*wave*math.cos(a),11.5*radius*wave*math.sin(a),.39+.08*math.sin(4*a)))
    f = [(0,1+i,1+(i+1)%n) for i in range(n)]
    for k in range(2):
        f += [(1+k*n+i,1+k*n+(i+1)%n,1+(k+1)*n+(i+1)%n,1+(k+1)*n+i) for i in range(n)]
    mesh_object(style+'_Grassy_Plateau',top,f,c,[p['grass'],p['moss']],[rng.randrange(2) for _ in f],style=='A')
    rocks = Batch(style+'_Rim_Boulders',c,[p['rock_light'],p['rock'],p['moss']])
    for i in range(55):
        a = rng.uniform(0,TAU)
        # Keep the waterfall lip open.
        if -1.38 < math.atan2(math.sin(a),math.cos(a)) < -1.08:
            continue
        r = rng.uniform(.9,1)
        rocks.part('ico',(16*r*math.cos(a),11.5*r*math.sin(a),.35),
                   (rng.uniform(.6,1.5),rng.uniform(.5,1.0),rng.uniform(.4,1)),rng.randrange(3),2 if style=='A' else 1,smooth=style=='A')
    rocks.finish()


def house(style,parent,p):
    c = collection(style+'_02_Home_and_Workshop',parent)
    structure = Batch(style+'_Timber_Structure',c,[p['wood'],p['wood_light'],p['metal']])
    floor = Batch(style+'_Deck_and_Floors',c,[p['wood'],p['wood_light'],p['stone']])
    walls = Batch(style+'_Walls',c,[p['plaster'],p['stone']])
    # Main dwelling: eight metres across, one quarter of the island width.
    floor.box((-3,4.5,.87),(9.3,9.5,.55),2)
    for i in range(31):
        floor.box((-7.5+i*.30,4.3,1.18),(.285,10.2,.13),i%2)
    for i in range(4):
        floor.box((-3,-1.2-i*.38,.95-i*.15),(4,.48,.25),2)
    walls.box((-3,8.25,3),(8,.20,3.5))
    walls.box((-6.98,4.7,2.15),(.16,7.2,1.8))
    for x in (-7,-3,1):
        for y in (1,4.5,8.3):
            structure.box((x,y,3.14),(.20,.22,4.05))
    for y in (1,8.3):
        structure.box((-3,y,5.18),(8.4,.26,.27))
        structure.beam((-7,y,5.2),(-3,y,8.1),.24)
        structure.beam((-3,y,8.1),(1,y,5.2),.24)
        structure.beam((-3,y,5.15),(-3,y,8.1),.18)
    for x in (-7,1):
        structure.box((x,4.6,5.18),(.22,8.1,.27))
    # Glazed front: frames and separate transparent panels reveal the workshop.
    glass = Batch(style+'_Glazing',c,[p['glass']])
    for x in (-6.35,-5.05,-3.75,-2.45,-1.15,.15):
        glass.box((x,.98,3.15),(1.18,.018,3.7))
    for x in (-5.7,-4.4,-3.1,-1.8,-.5):
        structure.box((x,.95,3.1),(.065,.10,3.85))
    structure.box((-3,.94,2.3),(8,.10,.075))
    for i in range(6):
        x = -6.2+i*1.3
        ztop = 8.1-abs(x+3)*.725
        if ztop > 5.28:
            glass.box((x,1.01,(5.28+ztop)/2),(1.14,.018,ztop-5.28))
    # A glazed side extension makes the home visibly a place of work.
    floor.box((3,5,1.06),(4,6,.22),1)
    for x in (1.2,4.8):
        for y in (2.1,7.9):
            structure.box((x,y,2.8),(.15,.15,3.4))
    structure.box((3,2.1,4.52),(4.1,.19,.20))
    structure.box((4.85,5,4.52),(.18,6.2,.20))
    glass.box((4.84,5,2.85),(.015,5.65,3.1))
    glass.box((3,2.1,2.85),(3.6,.015,3.1))
    walls.box((3,8,2.85),(4,.18,3.5))
    roof = Batch(style+'_Roof_Tile_Seams',c,[p['roof'],p['roof_edge']])
    verts,faces = [],[]
    strips = 16 if style=='A' else 5
    # Slightly swept eaves, two pitches, solid edge fascia.
    for sign in (-1,1):
        base = len(verts)
        for j in range(strips+1):
            d = j/strips*5.1
            z = 8.35-d*.69+.30*(d/5.1)**5
            verts.extend([(-3+sign*d,-.1,z),(-3+sign*d,9.35,z)])
        faces += [(base+j*2,base+j*2+1,base+j*2+3,base+j*2+2) for j in range(strips)]
        for j in range(1,18):
            y = -.1+j*.52
            for k in range(7):
                d0,d1=k*5.1/7,(k+1)*5.1/7
                z0,z1=8.39-d0*.69+.30*(d0/5.1)**5,8.39-d1*.69+.30*(d1/5.1)**5
                roof.beam((-3+sign*d0,y,z0),(-3+sign*d1,y,z1),.045,mat=j%2)
        for y in (-.14,9.38):
            for k in range(7):
                d0,d1=k*5.1/7,(k+1)*5.1/7
                roof.beam((-3+sign*d0,y,8.32-d0*.69+.30*(d0/5.1)**5),(-3+sign*d1,y,8.32-d1*.69+.30*(d1/5.1)**5),.17,mat=1)
    mesh_object(style+'_Swept_Pitched_Roof',verts,faces,c,[p['roof']],smooth=style=='A')
    roof.box((-3,4.6,8.4),(.22,10,.18),1)
    roof.box((3.1,5,4.8),(4.5,6.7,.20),1)
    # Deck railing only at the sides; preserve the view into the home.
    for x in (-7.4,5.25):
        for y in (-.2,1,2.2,3.4,4.6,5.8):
            structure.box((x,y,1.9),(.10,.10,1.35))
        structure.box((x,2.8,2.55),(.12,6.2,.12))
    for x in (-7.1,-3,1,4.8):
        structure.box((x,.5,.0),(.22,.22,1.9))
    structure.finish(.035 if style=='A' else 0)
    floor.finish(.035 if style=='A' else 0)
    walls.finish(.04 if style=='A' else 0)
    glass.finish(); roof.finish(.025 if style=='A' else 0)
    interior = Batch(style+'_Workshop_Furniture',c,[p['wood_light'],p['metal'],p['warm'],p['screen'],p['paper'],p['leaf']])
    # Desk, two monitors, keyboard, task lamp and a side workbench.
    interior.box((-2,3,2),(3.4,1.15,.15))
    for x in (-3.4,-.6):
        interior.box((x,3,1.58),(.12,.85,.8),1)
    for x in (-2.65,-1.35):
        interior.box((x,3.28,2.66),(1.04,.10,.68),1)
        interior.box((x,3.21,2.66),(.94,.025,.57),3)
        interior.box((x,3.28,2.18),(.10,.10,.40),1)
    interior.box((-2,2.7,2.1),(1,.32,.04),1)
    interior.box((-2,1.92,1.7),(.7,.65,.12),1)
    interior.box((-2,1.65,2.07),(.72,.14,.78),1)
    interior.box((3.7,5,2.0),(1.0,4.2,.15))
    for y in (3.3,6.8):
        interior.box((3.7,y,1.55),(.8,.10,.9),1)
    for z in (2,3,4):
        interior.box((-5.8,7.8,z),(2.0,.5,.13))
        for j in range(8):
            interior.box((-6.6+j*.19,7.75,z+.25),(.12,.26,.4),4 if j%3 else 0)
    for x in (-4.4,-1.1):
        interior.box((x,4.7,4.65),(.55,.55,.12),2)
        interior.box((x,4.7,5.0),(.035,.035,.65),1)
    interior.finish(.02 if style=='A' else 0)
    for loc in [(-4,3.5,4.4),(0,5.5,4.4),(3.4,5.2,4.0)]:
        light(style+'_Interior',c,'AREA',loc,(1,.60,.29),210,3.3,target=(loc[0],loc[1],1))


def ribbon(name, points, widths, coll, mat, across=(1,0,0), segments=1, smooth=True):
    verts=[]
    for j,pt in enumerate(points):
        for i in range(segments+1):
            d=(i/segments-.5)*widths[j]
            verts.append(tuple(Vector(pt)+Vector(across)*d))
    stride=segments+1
    faces=[(j*stride+i,j*stride+i+1,(j+1)*stride+i+1,(j+1)*stride+i) for j in range(len(points)-1) for i in range(segments)]
    return mesh_object(name,verts,faces,coll,[mat],smooth=smooth)


def water_and_paths(style,parent,p):
    c=collection(style+'_03_Water_and_Garden',parent)
    rng=random.Random(71)
    pond=[(4+2.9*math.cos(i*TAU/48),4+2.5*math.sin(i*TAU/48),.62) for i in range(48)]
    mesh_object(style+'_Spring_Pond',pond,[tuple(range(48))],c,[p['water']])
    stream=[(4,3,.63),(3.8,1,.63),(3.6,-1,.61),(4.0,-3,.60),(4.3,-5,.58),(4.2,-7,.57),(4.7,-9.3,.52),(4.9,-10.8,.20)]
    ribbon(style+'_Stream',stream,[2.2,2,1.8,2.2,2.1,2.2,2.5,2.7],c,p['water'],segments=8 if style=='A' else 2)
    bank=Batch(style+'_Stream_Banks_and_Path',c,[p['stone'],p['rock_light'],p['moss']])
    for x,y,z in stream[:-1]:
        for side in (-1,1):
            bank.part('ico',(x+side*1.35,y,.52),(.55,.75,.38),rng.randrange(3),2 if style=='A' else 1,smooth=style=='A')
    for i in range(15):
        x=-2+i*.48
        y=-3.3-.4*math.sin(i/3)
        bank.part('ico',(x,y,.48),(.40,.52,.13),0,2 if style=='A' else 1,smooth=style=='A')
    for i in range(9):
        a=i*TAU/9
        bank.part('ico',(4+3.1*math.cos(a),4+2.65*math.sin(a),.56),(.7,.65,.3),1,2 if style=='A' else 1,smooth=style=='A')
    bank.finish()
    # Multiple uneven ribbons form a single flowing waterfall, with a broad lip.
    for k in range(9):
        points=[]
        for j in range(23 if style=='A' else 9):
            t=j/(22 if style=='A' else 8)
            points.append((4.9+(k-4)*.31+.09*math.sin(t*15+k),-10.8-2.1*(1-math.exp(-t*6)),.20-31*t))
        ribbon(style+f'_Waterfall_Ribbon_{k:02d}',points,[.35+.07*math.sin(j*.9+k) for j in range(len(points))],c,p['foam'] if k%4==0 else p['fall'],segments=2,smooth=style=='A')
    bridge=Batch(style+'_Garden_Footbridge',c,[p['wood'],p['wood_light']])
    for i in range(14):
        x=2.2+i*.32
        z=.9+.48*math.sin(i/13*math.pi)
        bridge.box((x,-5.05,z),(.29,1.55,.13),i%2)
    for y in (-5.84,-4.26):
        for i in range(5):
            x=2.2+i*1.04
            z=1.1+.48*math.sin(i/4*math.pi)
            bridge.box((x,y,z+.4),(.075,.075,.9))
            if i:
                xp=2.2+(i-1)*1.04; zp=1.1+.48*math.sin((i-1)/4*math.pi)
                bridge.beam((xp,y,zp+.85),(x,y,z+.85),.07)
    bridge.finish(.02 if style=='A' else 0)


def vegetation(style,parent,p):
    c=collection(style+'_04_Grove_and_Planting',parent)
    rng=random.Random(89)
    trunk=Batch(style+'_Tree_Branches',c,[p['wood']])
    leaves=Batch(style+'_Tree_Canopies',c,[p['leaf'],p['leaf_light'],p['leaf_dark']])
    trees=[(-11,5.5,1.05),(-12,1,.73),(-8.8,8.5,.8),(9,6,.8),(11,1.5,.62)]
    for ti,(x,y,s) in enumerate(trees):
        trunk.beam((x,y,.4),(x+.3*s,y,5.4*s),.32*s)
        for j in range(7):
            a=j*2.4+ti
            end=Vector((x+math.cos(a)*2.1*s,y+math.sin(a)*1.7*s,(4.4+j*.30)*s))
            trunk.beam((x+.1,y,(2.9+j*.25)*s),end,.16*s)
            for k in range(3):
                d=Vector((rng.uniform(-1,1)*s,rng.uniform(-1,1)*s,rng.uniform(-.2,.7)*s))
                leaves.part('ico',end+d,(rng.uniform(1,1.8)*s,rng.uniform(.9,1.6)*s,rng.uniform(.5,.85)*s),rng.randrange(3),2 if style=='A' else 1,smooth=style=='A')
    trunk.finish(.04 if style=='A' else 0); leaves.finish()
    planting=Batch(style+'_Ground_Planting',c,[p['fern'],p['grass'],p['moss'],p['leaf_light']])
    for i in range(120):
        x,y=rng.uniform(-14,14),rng.uniform(-9,10)
        if (x/15)**2+(y/10.5)**2>.94 or (-8<x<6 and 0<y<9) or (2<x<6 and y<5):
            continue
        planting.part('ico',(x,y,.57),(.3,.38,.23),rng.randrange(4),2 if style=='A' else 1,smooth=style=='A')
    planting.finish()
    # Sparse planted blades break up broad surfaces without hiding architecture.
    verts,faces=[],[]
    for i in range(550):
        x,y=rng.uniform(-14.5,14.5),rng.uniform(-10,10.5)
        if (x/15)**2+(y/10.7)**2>.93 or (-8<x<6 and 0<y<9) or (2<x<6 and y<5):
            continue
        z=.44; h=rng.uniform(.12,.45); w=rng.uniform(.025,.06)
        n=len(verts); verts.extend([(x-w,y,z),(x+w,y,z),(x+.12,y+.05,z+h)])
        faces.append((n,n+1,n+2))
    mesh_object(style+'_Grass_Accents',verts,faces,c,[p['moss'],p['fern']],[i%2 for i in range(len(faces))])
    props=Batch(style+'_Terrace_Details',c,[p['stone'],p['wood_light'],p['warm'],p['metal']])
    for x,y in [(-8,-1),(-1,-5),(7,-6),(7.4,1)]:
        props.box((x,y,.66),(.36,.36,.35),0)
        props.box((x,y,1.1),(.12,.12,.65),3)
        props.box((x,y,1.48),(.24,.24,.24),2)
        props.box((x,y,1.64),(.46,.46,.10),3)
        light(style+'_Path_Lantern',c,'POINT',(x,y,1.48),(1,.55,.20),12,.3)
    props.box((-8,-4,1.05),(2.2,.65,.14),1)
    props.box((-8,-3.72,1.45),(2.2,.10,.65),1)
    for x in (-8.8,-7.2):
        props.box((x,-4,.75),(.13,.55,.55),3)
    props.finish(.035 if style=='A' else 0)


def light(name,c,kind,loc,color,energy,size=1,target=None):
    data=bpy.data.lights.new('SS_'+name,kind)
    data.color, data.energy=color,energy
    if kind=='AREA': data.shape='DISK'; data.size=size
    if kind=='POINT': data.shadow_soft_size=size
    if kind=='SUN': data.angle=math.radians(8)
    obj=bpy.data.objects.new('SS_'+name,data); c.objects.link(obj); obj.location=loc
    if target is not None: obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    return obj


def world():
    w=bpy.data.worlds.new('SS_Blue_Hour_World'); w.use_nodes=True
    n,l=w.node_tree.nodes,w.node_tree.links; n.clear()
    tc=n.new('ShaderNodeTexCoord'); sep=n.new('ShaderNodeSeparateXYZ'); l.new(tc.outputs['Normal'],sep.inputs[0])
    mp=n.new('ShaderNodeMapRange'); mp.inputs['From Min'].default_value=-.5; mp.inputs['From Max'].default_value=.7
    l.new(sep.outputs['Z'],mp.inputs['Value'])
    ramp=n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color=(.065,.12,.27,1)
    ramp.color_ramp.elements[1].color=(.30,.30,.45,1)
    l.new(mp.outputs[0],ramp.inputs[0])
    bg=n.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value=.65; l.new(ramp.outputs[0],bg.inputs[0])
    out=n.new('ShaderNodeOutputWorld'); l.new(bg.outputs[0],out.inputs['Surface'])
    return w


def city(parent):
    c=collection('Shared_05_City_Far_Below',parent)
    mats=[material('City_Buildings',(.07,.10,.16)),material('City_Rooftops',(.12,.16,.22)),material('City_Windows',(1,.57,.22),emission=2.0),material('City_Cool_Windows',(.25,.54,.72),emission=1.1)]
    city=Batch('Distant_City_Blocks',c,mats)
    rng=random.Random(97)
    # Actual city geometry lies 125 metres below the island.
    for ix in range(-18,20):
        for iy in range(-5,25):
            x,y=ix*9,iy*9
            river_x=20+22*math.sin(y*.022)
            if abs(x-river_x)<11 or rng.random()<.17: continue
            w,d=rng.uniform(3,6.5),rng.uniform(3,6.5)
            h=rng.uniform(2,13)*(1.7 if abs(ix-5)<5 and iy>8 else 1)
            city.box((x,y,-125+h/2),(w,d,h),rng.randrange(2))
            # Tiny real emissive windows, batched with the city mesh.
            for z in range(2,int(h),3):
                for off in (-.24,.24):
                    if rng.random()<.55:
                        city.box((x+off*w,y-d/2-.02,-125+z),(.45,.035,.65),2 if rng.random()<.8 else 3)
                    if rng.random()<.40:
                        city.box((x+w/2+.02,y+off*d,-125+z),(.035,.45,.65),2)
    city.finish()
    ground=material('City_Ground',(.035,.06,.105))
    roads=material('City_Roads',(.29,.27,.26),emission=.30)
    watermat=material('City_River',(.045,.15,.22),.22,emission=.05,metallic=.35)
    b=Batch('City_Ground_and_Roads',c,[ground,roads])
    b.box((0,70,-125.4),(540,440,.6))
    for i in range(-21,24):
        b.box((i*9,70,-125.03),(.17,440,.025),1)
    for i in range(-8,28):
        b.box((0,i*9,-125.02),(540,.17,.025),1)
    b.finish()
    pts=[(20+22*math.sin(y*.022),y,-124.95) for y in range(-150,300,5)]
    ribbon('City_River',pts,[17]*len(pts),c,watermat,segments=2)


def cloud_material():
    m=bpy.data.materials.new('SS_Cloud_Volume'); m.use_nodes=True
    n,l=m.node_tree.nodes,m.node_tree.links; n.clear()
    tc=n.new('ShaderNodeTexCoord'); no=n.new('ShaderNodeTexNoise'); no.inputs['Scale'].default_value=3.6; no.inputs['Detail'].default_value=3
    l.new(tc.outputs['Generated'],no.inputs[0])
    ramp=n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position=.32; ramp.color_ramp.elements[0].color=(0,0,0,1); ramp.color_ramp.elements[1].position=.72; ramp.color_ramp.elements[1].color=(.085,.085,.085,1)
    l.new(no.outputs['Fac'],ramp.inputs[0])
    vol=n.new('ShaderNodeVolumePrincipled'); vol.inputs['Color'].default_value=(.48,.58,.80,1); vol.inputs['Anisotropy'].default_value=.15
    l.new(ramp.outputs[0],vol.inputs['Density'])
    out=n.new('ShaderNodeOutputMaterial'); l.new(vol.outputs[0],out.inputs['Volume'])
    return m


def environment(parent):
    c=collection('Shared_06_Clouds_and_Light',parent)
    cm=cloud_material(); clouds=Batch('Cloud_Banks',c,[cm]); rng=random.Random(101)
    spots=[(-36,5,-27),(30,16,-35),(-37,58,-37),(50,65,-43),(-56,-22,-30),(11,110,-45),(-65,110,-43)]
    for x,y,z in spots:
        for j in range(5):
            clouds.part('ico',(x+rng.uniform(-9,9),y+rng.uniform(-9,9),z+rng.uniform(-2,2)),(rng.uniform(10,16),rng.uniform(7,13),rng.uniform(3,6)),subdivisions=2,smooth=True)
    for i in range(4):
        clouds.part('ico',(5+rng.uniform(-3,3),-13+rng.uniform(-2,2),-31+rng.uniform(-2,2)),(4,3,2),subdivisions=2,smooth=True)
    clouds.finish()
    light('Cool_Sky_Key',c,'SUN',(0,0,30),(.59,.70,1),2.0, target=(12,10,0))
    light('Warm_Horizon',c,'AREA',(-24,-25,28),(1,.72,.47),2600,24,target=(0,0,0))
    light('Blue_Fill',c,'AREA',(5,18,26),(.42,.59,1),3800,25,target=(0,0,0))
    light('Falls_Rim',c,'AREA',(18,-22,2),(.47,.72,1),1800,15,target=(4,-12,-10))


def camera(name,c,loc,target,lens):
    d=bpy.data.cameras.new('SS_'+name); d.lens=lens; d.clip_end=1800
    o=bpy.data.objects.new('SS_'+name,d); c.objects.link(o); o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o


def setup(scene,w):
    scene.world=w; r=scene.render
    r.engine='BLENDER_EEVEE'; r.resolution_x=1800; r.resolution_y=1400; r.resolution_percentage=100
    r.image_settings.file_format='PNG'; r.image_settings.color_depth='8'
    e=scene.eevee; e.taa_render_samples=64; e.taa_samples=16; e.use_raytracing=True
    e.volumetric_tile_size='8'; e.volumetric_samples=64; e.volumetric_start=.1; e.volumetric_end=600
    e.use_volumetric_shadows=True; e.volumetric_shadow_samples=8
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'; scene.view_settings.exposure=.4
    ng=bpy.data.node_groups.new('SS_'+scene.name+'_Compositor','CompositorNodeTree')
    ng.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor')
    rl=ng.nodes.new('CompositorNodeRLayers'); rl.scene=scene
    glare=ng.nodes.new('CompositorNodeGlare'); glare.inputs['Type'].default_value='Bloom'; glare.inputs['Threshold'].default_value=1.7; glare.inputs['Strength'].default_value=.16
    ng.links.new(rl.outputs['Image'],glare.inputs['Image'])
    out=ng.nodes.new('NodeGroupOutput'); ng.links.new(glare.outputs['Image'],out.inputs[0])
    scene.compositing_node_group=ng


def build():
    started=time.perf_counter()
    if any(s.name.startswith('SS_Study_') for s in bpy.data.scenes):
        raise RuntimeError('Studies already exist; edit them in place instead of rebuilding over them.')
    ROOT.mkdir(parents=True,exist_ok=True); (ROOT/'renders').mkdir(exist_ok=True)
    shared=bpy.data.collections.new('SS_Shared_Environment')
    city(shared); environment(shared)
    cc=collection('Shared_Cameras',shared)
    hero=camera('Camera_Overview',cc,(42,-64,35),(0,0,-5),45)
    detail=camera('Camera_Workshop',cc,(17,-27,16),(-1,3,2.4),52)
    w=world(); scenes=[]; report={}
    for style,label in [('A','Cinematic'),('B','LowPoly')]:
        s=bpy.data.scenes.new('SS_Study_'+style+'_'+label)
        s.collection.children.link(shared); root=collection(style+'_Sanctuary',s.collection)
        p=palette(style)
        island(style,root,p); house(style,root,p); water_and_paths(style,root,p); vegetation(style,root,p)
        setup(s,w); s.camera=hero
        s['Study']=label; s['Design']='Compact floating timber-and-glass sanctuary at blue hour; city far below.'
        s['Comparison']='Same footprint, house, camera, lights and city; material, topology and shading treatment vary.'
        scenes.append(s)
        report[style]={'scene':s.name,'objects':len(s.objects),'base_mesh_faces':sum(len(o.data.polygons) for o in s.objects if o.type=='MESH')}
    if bpy.context.window:
        bpy.context.window.scene=scenes[0]
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type=='VIEW_3D':
                    area.spaces.active.region_3d.view_perspective='CAMERA'
                    area.spaces.active.shading.color_type='MATERIAL'
    bpy.context.view_layer.update()
    path=ROOT/'sanctuary_style_studies.blend'
    if path.exists(): raise FileExistsError(path)
    bpy.ops.wm.save_as_mainfile(filepath=str(path),check_existing=False)
    report.update(path=str(path),build_seconds=round(time.perf_counter()-started,2),cameras=[hero.name,detail.name],external_assets=[])
    (ROOT/'study_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report


if __name__=='__main__':
    result=build()

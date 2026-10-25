"""Night grade, soft island colour fields, a sky-taxi arrival pad and room story props."""
from pathlib import Path
import math,json,random,runpy
import bpy,bmesh
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
DR=runpy.run_path(str(ROOT/'refine_dining_rear.py'))
API,Batch,GEO,OPT,TL=(DR[k] for k in ('API','Batch','GEO','OPT','TL'))
cylinder=TL['cylinder']
SOURCE='Island_B_Dining_Rear_Facade'
SCENE='Island_B_Night_Arrival'
OUTPUT=ROOT/'island_b_night_arrival.blend'
REPORT=ROOT/'island_b_night_arrival_report.json'
ISLAND='GE_MH_Trees_B5_B4_B3_B2_OPT_B_BC_JG_RF_CO_PT_SH_UA_Shared_Corrected_Island.001'
ENVIRONMENT='LP_SS_Shared_Environment'
TERRAIN='Island_B5_Connected_Terrain'
LOOKOUT='BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001'
# The pad sits on the front-right corner. Its outer half hangs past the rim above the blunt spike.
PAD=Vector((15.2,-2.9));PAD_R=2.5;PAD_TOP=1.0;PAD_DEPTH=.2
RAMP_START=Vector((11.05,-5.9,.705))
WORKSHOP_FLOOR=1.0;BEDROOM_FLOOR=7.30

def clone(source,parent,mapping,share=lambda ob:False):
    col=bpy.data.collections.new('NA_'+source.name);parent.children.link(col)
    for old in source.objects:
        if share(old):
            col.objects.link(old);mapping[old.name]=old;continue
        ob=old.copy();ob.name='NA_'+old.name
        if old.data:ob.data=old.data.copy()
        col.objects.link(ob);mapping[old.name]=ob
    for child in source.children:clone(child,col,mapping,share)
    return col

def reparent(mapping):
    for old,ob in mapping.items():
        if ob.parent and ob.parent.name in mapping:ob.parent=mapping[ob.parent.name]

def node(nt,kind,**inputs):
    n=nt.nodes.new(kind)
    for k,v in inputs.items():n.inputs[k].default_value=v
    return n

def ramp(nt,stops):
    r=nt.nodes.new('ShaderNodeValToRGB');els=r.color_ramp.elements
    while len(els)<len(stops):els.new(.5)
    for e,(pos,col) in zip(els,stops):e.position=pos;e.color=(*col,1)
    return r

def weighted(nt,terms):
    """Adds weighted scalar sockets into one smooth field."""
    total=None
    for socket,weight in terms:
        m=node(nt,'ShaderNodeMath');m.operation='MULTIPLY';m.inputs[1].default_value=weight
        nt.links.new(socket,m.inputs[0])
        if total is None:total=m.outputs[0];continue
        a=node(nt,'ShaderNodeMath');a.operation='ADD'
        nt.links.new(total,a.inputs[0]);nt.links.new(m.outputs[0],a.inputs[1]);total=a.outputs[0]
    return total

def multiply_into(nt,colour,tint,target):
    mix=node(nt,'ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs['Fac'].default_value=1
    nt.links.new(colour,mix.inputs['Color1']);nt.links.new(tint,mix.inputs['Color2'])
    nt.links.new(mix.outputs['Color'],target)

def stone_material(src):
    # Height, slope and a very large noise drive the tint. None of them varies per face.
    m=src.copy();m.name='NA_'+src.name;nt=m.node_tree
    bsdf=nt.nodes['Principled BSDF'];base=bsdf.inputs['Base Color'].links[0].from_socket
    tc=node(nt,'ShaderNodeTexCoord');geo=node(nt,'ShaderNodeNewGeometry')
    height=node(nt,'ShaderNodeSeparateXYZ');nt.links.new(tc.outputs['Generated'],height.inputs[0])
    normal=node(nt,'ShaderNodeSeparateXYZ');nt.links.new(geo.outputs['Normal'],normal.inputs[0])
    slope=node(nt,'ShaderNodeMapRange');slope.inputs['From Min'].default_value=-1
    nt.links.new(normal.outputs['Z'],slope.inputs['Value'])
    noise=node(nt,'ShaderNodeTexNoise',Scale=1.6,Detail=1.0,Roughness=.35)
    nt.links.new(tc.outputs['Generated'],noise.inputs['Vector'])
    field=weighted(nt,[(height.outputs['Z'],.5),(slope.outputs['Result'],.3),(noise.outputs['Fac'],.2)])
    tint=ramp(nt,[(.12,(.62,.72,1.0)),(.42,(.90,.94,1.0)),(.68,(1.06,1.03,1.0)),(.86,(1.30,1.13,.95))])
    nt.links.new(field,tint.inputs['Fac'])
    multiply_into(nt,base,tint.outputs['Color'],bsdf.inputs['Base Color'])
    return m

def soil_material(src,low,high):
    # The soil fades from a rich brown under the turf to a grey brown that meets the warm rock top.
    m=src.copy();m.name='NA_'+src.name;nt=m.node_tree
    mix=next(n for n in nt.nodes if n.type=='MIX_RGB')
    tc=node(nt,'ShaderNodeTexCoord');xyz=node(nt,'ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'],xyz.inputs[0])
    band=node(nt,'ShaderNodeMapRange');band.inputs['From Min'].default_value=low;band.inputs['From Max'].default_value=high
    nt.links.new(xyz.outputs['Z'],band.inputs['Value'])
    noise=node(nt,'ShaderNodeTexNoise',Scale=.18,Detail=1.0,Roughness=.4)
    nt.links.new(tc.outputs['Object'],noise.inputs['Vector'])
    field=weighted(nt,[(band.outputs['Result'],.85),(noise.outputs['Fac'],.3)])
    colour=ramp(nt,[(.12,(.19,.165,.155)),(.42,(.215,.14,.085)),(.95,(.15,.095,.058))])
    nt.links.new(field,colour.inputs['Fac']);nt.links.new(colour.outputs['Color'],mix.inputs['Color1'])
    return m

def crown_material():
    # One crown gradient replaces five per-lobe tints that alternated light and dark.
    tones=sorted((tuple(bpy.data.materials[f'Trees_Leaf_{i}'].node_tree.nodes['Mix (Legacy)'].inputs['Color1'].default_value[:3])
                  for i in range(5)),key=sum)
    m=bpy.data.materials.new('NA_Crown_Gradient');m.use_nodes=True;nt=m.node_tree
    bsdf=nt.nodes['Principled BSDF'];bsdf.inputs['Roughness'].default_value=.88
    tc=node(nt,'ShaderNodeTexCoord');xyz=node(nt,'ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'],xyz.inputs[0])
    ao=node(nt,'ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=1.4
    noise=node(nt,'ShaderNodeTexNoise',Scale=1.2,Detail=1.0,Roughness=.3)
    nt.links.new(tc.outputs['Generated'],noise.inputs['Vector'])
    field=weighted(nt,[(xyz.outputs['Z'],.55),(ao.outputs['AO'],.3),(noise.outputs['Fac'],.15)])
    colour=ramp(nt,[(.18+i*.16,t) for i,t in enumerate(tones)])
    nt.links.new(field,colour.inputs['Fac'])
    paint=nt.nodes.new('ShaderNodeTexImage');paint.image=bpy.data.images['LP_Painted_leaf']
    scale=node(nt,'ShaderNodeVectorMath');scale.operation='SCALE';scale.inputs['Scale'].default_value=.4
    nt.links.new(tc.outputs['Object'],scale.inputs[0]);nt.links.new(scale.outputs[0],paint.inputs['Vector'])
    mix=node(nt,'ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs['Fac'].default_value=.23
    nt.links.new(colour.outputs['Color'],mix.inputs['Color1']);nt.links.new(paint.outputs['Color'],mix.inputs['Color2'])
    nt.links.new(mix.outputs['Color'],bsdf.inputs['Base Color'])
    return m

def soften_island(mapping):
    terrain=mapping[TERRAIN];me=terrain.data
    soil_z=[terrain.matrix_world@me.vertices[v].co for p in me.polygons
            if 'Soil' in me.materials[p.material_index].name for v in p.vertices]
    low,high=min(v.z for v in soil_z),max(v.z for v in soil_z)
    for i,mat in enumerate(me.materials):
        if 'Unbanded_Stone' in mat.name:me.materials[i]=stone_material(mat)
        elif 'Exposed_Soil' in mat.name:me.materials[i]=soil_material(mat,low,high)
    crown=crown_material();trees=[]
    for old,ob in mapping.items():
        if old.startswith('Grove_') and ('Leaves' in old or 'Crown' in old):
            for i in range(len(ob.data.materials)):ob.data.materials[i]=crown
            trees.append(ob.name)
    values=[a.value for a in me.attributes['RockFacetValue'].data]
    return {'soil_band_z':[round(low,3),round(high,3)],'crown_gradient_objects':trees,
            'rock_facet_value_range':[round(min(values),3),round(max(values),3)]}

def night_grade(scene,env):
    scene.view_settings.exposure=.05
    world=scene.world.copy();world.name='NA_Night_Blue_Hour';scene.world=world
    r=world.node_tree.nodes['Color Ramp'].color_ramp;els=r.elements
    els[0].position=0;els[0].color=(.040,.062,.13,1)
    els[1].position=1;els[1].color=(.016,.026,.066,1)
    mid=els.new(.42);mid.color=(.085,.088,.15,1)
    # The cool fills flattened the frame. The cloud bounce stays because it lights the underside.
    energy={'LP_SS_Blue_Fill':.45,'LP_SS_Soft_Foreground_Fill':.45,'LP_SS_Cool_Sky_Key':.8,'LP_SS_Falls_Rim':.7}
    for name,f in energy.items():env[name].data.energy*=f
    rim=env['LP_SS_Warm_Horizon'];rim.data.energy*=.8
    rim.location=(30,22,9);rim.rotation_euler=(Vector((0,0,-2))-rim.location).to_track_quat('-Z','Y').to_euler()
    # A strong warm underglow turned the rock to mud. A soft glow plus a cool back rim keeps it blue grey.
    sky=env['LP_SS_Cloud_Banks'].users_collection[0]
    under=bpy.data.lights.new('NA_City_Underglow','AREA');under.energy=1600;under.color=(.92,.74,.64)
    under.shape='DISK';under.size=40
    ob=bpy.data.objects.new('NA_City_Underglow',under);ob.location=(2,-2,-34);ob.rotation_euler=(math.pi,0,0)
    sky.objects.link(ob)
    back=bpy.data.lights.new('NA_Rock_Rim','AREA');back.energy=6000;back.color=(.55,.68,1.0);back.shape='DISK';back.size=24
    ob=bpy.data.objects.new('NA_Rock_Rim',back);ob.location=(-6,38,-10)
    ob.rotation_euler=(Vector((2,0,-7))-ob.location).to_track_quat('-Z','Y').to_euler();sky.objects.link(ob)
    # Long, low mist layers read as altitude better than round puffs.
    # Each layer scales about its own centre, so the cloud heights stay where they were.
    for name,s in (('LP_SS_Cloud_Banks',(1.55,1.25,.55)),('LP_SS_Sanctuary_Cloud_Sea',(1.4,1.2,.6))):
        cloud=env[name];c=sum((cloud.matrix_world@Vector(b) for b in cloud.bound_box),Vector())/8
        cloud.matrix_world=Matrix.Translation(c)@Matrix.Diagonal(s).to_4x4()@Matrix.Translation(-c)@cloud.matrix_world
    return {'exposure':scene.view_settings.exposure,'light_scale':energy,'underglow_w':under.energy}

def clear_under(mapping,keep,inside):
    """Deletes loose planting parts whose centre falls inside the new footprint."""
    removed={}
    for old,ob in mapping.items():
        if ob.type!='MESH' or any(k.lower() in old.lower() for k in keep):continue
        bm=bmesh.new();bm.from_mesh(ob.data);seen=set();doomed=[]
        for f in bm.faces:
            if f in seen:continue
            stack=[f];part=[];seen.add(f)
            while stack:
                g=stack.pop();part.append(g)
                for e in g.edges:
                    for h in e.link_faces:
                        if h not in seen:seen.add(h);stack.append(h)
            c=sum((ob.matrix_world@v.co for g in part for v in g.verts),Vector())/sum(len(g.verts) for g in part)
            if inside(c):doomed+=part
        if doomed:
            bmesh.ops.delete(bm,geom=list(set(doomed)),context='FACES');bm.to_mesh(ob.data);removed[ob.name]=len(doomed)
        bm.free()
    return removed

def ray_down(tree,p,length=6):
    hit=tree.ray_cast(Vector(p)+Vector((0,0,3)),Vector((0,0,-1)),length)[0]
    return hit

def arrival_pad(scene,mapping,coll):
    terrain=mapping[TERRAIN];tree=GEO['bvh'](terrain)
    make=API['BASE']['material']
    deck=make('NA_Pad_Deck',(.15,.165,.18),.82)
    paint=make('NA_Pad_Paint',(.74,.69,.56),.7)
    white=make('NA_Pad_Light_White',(1,.86,.66),.4,emission=7)
    red=make('NA_Pad_Light_Red',(1,.07,.04),.4,emission=6)
    sock=make('NA_Windsock_Orange',(.86,.33,.09),.8)
    metal=bpy.data.materials['LP_SS_A_metal'];wood=bpy.data.materials['LP_SS_A_wood'];wood_light=bpy.data.materials['LP_SS_A_wood_light']
    pad=Batch('NA_Sky_Taxi_Pad',coll,[deck,paint,metal,white,red,sock,wood,wood_light])
    top=Vector((PAD.x,PAD.y,PAD_TOP))
    bmesh.ops.create_cone(pad.bm,cap_ends=True,segments=12,radius1=PAD_R,radius2=PAD_R,depth=PAD_DEPTH,
                          matrix=Matrix.Translation(top-Vector((0,0,PAD_DEPTH/2))))
    # A painted ring and an H read as a landing pad from any distance.
    def ring(r0,r1,z,mat,n=24):
        inner=[pad.bm.verts.new(top+Vector((r0*math.cos(i*math.tau/n),r0*math.sin(i*math.tau/n),z))) for i in range(n)]
        outer=[pad.bm.verts.new(top+Vector((r1*math.cos(i*math.tau/n),r1*math.sin(i*math.tau/n),z))) for i in range(n)]
        for i in range(n):pad.bm.faces.new([inner[i],outer[i],outer[(i+1)%n],inner[(i+1)%n]]).material_index=mat
    ring(1.86,2.02,.004,1)
    home=(RAMP_START.xy-PAD).normalized();side=Vector((-home.y,home.x))
    def stroke(a,b):pad.beam(Vector((*a,PAD_TOP+.006)),Vector((*b,PAD_TOP+.006)),.2,.008,mat=1)
    # The H stands upright for someone who walks in from the ramp.
    for s in (-1,1):stroke(PAD+side*s*.48-home*.72,PAD+side*s*.48+home*.72)
    stroke(PAD-side*.48,PAD+side*.48)
    for i in range(12):
        a=i*math.tau/12+math.tau/24;p=top+Vector((2.38*math.cos(a),2.38*math.sin(a),.03))
        pad.box(p,(.11,.11,.06),3 if i%2 else 4)
    # Stub posts carry the inland half. Two struts reach from the overhang back into the rock face.
    posts=[];struts=[]
    for a in range(12):
        ang=a*math.tau/12;p=PAD+Vector((1.7*math.cos(ang),1.7*math.sin(ang)))
        hit=ray_down(tree,(p.x,p.y,PAD_TOP))
        if hit is not None and hit.z<PAD_TOP-PAD_DEPTH:
            pad.beam(Vector((p.x,p.y,hit.z-.12)),Vector((p.x,p.y,PAD_TOP-PAD_DEPTH)),.09,mat=2);posts.append(round(hit.z,3))
    out=Vector((1,.25)).normalized()
    for s in (-1,1):
        p=PAD+out*1.9+Vector((-out.y,out.x))*s*1.1;start=Vector((p.x,p.y,PAD_TOP-PAD_DEPTH))
        # The rim curves, so a steeper strut finds the rock where a shallow one misses.
        for reach,drop in ((.62,.78),(1.5,1.1),(1.0,.78),(1.5,.78),(.6,.4)):
            d=Vector((-out.x*reach,-out.y*reach,-drop)).normalized();hit=tree.ray_cast(start,d,14)[0]
            if hit is not None:break
        if hit is not None:pad.beam(start,hit+d*.15,.08,mat=2);struts.append([round(c,2) for c in hit])
    # Windsock on the inland edge, away from the touchdown circle.
    base=PAD+Vector((-1.55,1.45));g=ray_down(tree,(base.x,base.y,PAD_TOP))
    mast_foot=Vector((base.x,base.y,PAD_TOP))
    cylinder(pad,mast_foot,mast_foot+Vector((0,0,2.35)),.035,2,8)
    head=mast_foot+Vector((0,0,2.3));wind=Vector((-.9,-.42,-.12)).normalized()
    for k in range(4):
        a=head+wind*(.05+k*.24);b=head+wind*(.05+(k+1)*.24)
        cylinder(pad,a,b,.17-k*.025,5 if k%2==0 else 1,10,radius2=.17-(k+1)*.025)
    # A short timber ramp joins the open east edge of the city lookout to the pad rim.
    end2=PAD+home*PAD_R;end=Vector((end2.x,end2.y,PAD_TOP));start=RAMP_START.copy()
    run=end-start;along=Vector((run.x,run.y,0)).normalized();across=Vector((-along.y,along.x,0))
    n=max(8,int(run.length/.28))
    for i in range(n):
        p=start.lerp(end,(i+.5)/n)
        pad.box(p-Vector((0,0,.04)),(1.1,.26,.06),6 if i%2 else 7,
                Matrix.Rotation(math.atan2(along.y,along.x)-math.pi/2,4,'Z')@Matrix.Rotation(math.atan2(run.z,run.xy.length),4,'X'))
    for s in (-1,1):
        pad.beam(start+across*s*.48-Vector((0,0,.12)),end+across*s*.48-Vector((0,0,.12)),.08,.12,mat=2)
        for t in (.3,.7):
            q=start.lerp(end,t)+across*s*.6;hit=ray_down(tree,(q.x,q.y,q.z))
            pad.box(q+Vector((0,0,.03)),(.07,.07,.05),3)
    ob=pad.finish();API['LP']['grain_uv'](ob)
    for f in ob.data.polygons:f.use_smooth=False
    API['BASE']['light']('NA_Pad_Glow',coll,'POINT',(PAD.x,PAD.y,PAD_TOP+.35),(1,.78,.55),18,.6)
    def inside(c):
        if (c.xy-PAD).length<PAD_R+.25 and c.z<PAD_TOP+.2:return True
        rel=c.xy-start.xy;t=rel.dot(along.xy)/run.xy.length;off=abs(rel.dot(across.xy))
        return 0<t<1 and off<.75 and c.z<start.z+run.z*t+.15
    cleared=clear_under(mapping,('Terrain','Grove_','Water','Pond','Bridge','Lookout','Path','Lantern','Stream'),inside)
    return {'pad_centre':list(PAD),'pad_radius':PAD_R,'pad_top':PAD_TOP,'post_ground_z':posts,'strut_rock_hits':struts,
            'ramp':[list(start),list(end)],'cleared_parts':cleared,'object':ob.name}

# Centrelines run from the bottom entry step round the lanterns to the bridge, then on to the lookout step.
ROUTES={'NA_Entry_Flagstone_Path':([(-3.75,-1.58),(-3.55,-2.75),(-2.35,-4.1),(-.5,-4.85),(1.0,-5.05),(1.75,-5.05)],1.3,2.2),
        'NA_Lookout_Flagstone_Path':([(7.05,-5.05),(7.45,-5.4),(7.86,-5.7)],1.1,1.2)}
OLD_PATHS=('GE_One_Entrance_Approach','BC_JG_RF_CO_PT_SH_SS_UA_Connected_Path_1.001')

def spline(points,step=.05):
    """Samples a Catmull-Rom curve through 2D control points at a near-even spacing."""
    p=[Vector(points[0])*2-Vector(points[1])]+[Vector(q) for q in points]+[Vector(points[-1])*2-Vector(points[-2])]
    out=[]
    for i in range(1,len(p)-2):
        a,b,c,d=p[i-1],p[i],p[i+1],p[i+2];n=max(2,int((c-b).length/step))
        for k in range(n):
            t=k/n;out.append(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t))
    out.append(p[-2]);return out

def paved_path(batch,tree,points,width,flare,seed):
    """Lays staggered flagstones on a dark joint bed. Each stone follows the ground below it."""
    line=spline(points);dist=[0]
    for a,b in zip(line,line[1:]):dist.append(dist[-1]+(b-a).length)
    total=dist[-1]
    def at(s):
        s=min(max(s,0),total);i=max(1,next((k for k,d in enumerate(dist) if d>=s),len(dist)-1))
        t=(s-dist[i-1])/max(dist[i]-dist[i-1],1e-6);p=line[i-1].lerp(line[i],t)
        tan=(line[i]-line[i-1]).normalized();return p,Vector((-tan.y,tan.x))
    def half(s):
        # The path flares where it meets the steps and breathes slowly along its length.
        f=max(0,1-s/1.6);return (width+(flare-width)*f*f)/2*(1+.05*math.sin(s*1.9+seed))
    def ground(p,lift):
        hit=tree.ray_cast(Vector((p.x,p.y,6)),Vector((0,0,-1)),12)[0]
        return Vector((p.x,p.y,(hit.z if hit else .4)+lift))
    rng=random.Random(seed);stones=0;s=0;row=0
    while s<total-.05:
        length=min(.36+.08*math.sin(row*2.3+seed),total-s);cuts=[0,.34,.71,1] if row%2 else [0,.29,.63,1]
        if half(s)*2<1.15:cuts=[0,.5,1] if row%2 else [0,.42,1]
        for a,b in zip(cuts,cuts[1:]):
            corners=[]
            for sv,f in ((s+.025,a),(s+.025,b),(s+length-.025,b),(s+length-.025,a)):
                p,n=at(sv);w=half(sv);edge=f in (0,1)
                off=(f*2-1)*w+(-.03 if f==1 else .03 if f==0 else (-.025 if f==b else .025))
                if edge:off+=(rng.uniform(-.05,.03)*(1 if f==1 else -1))
                corners.append(p+n*off)
            top=[batch.bm.verts.new(ground(c,.055)) for c in corners]
            bot=[batch.bm.verts.new(ground(c,-.07)) for c in corners]
            batch.bm.faces.new(top).material_index=0
            for i in range(4):batch.bm.faces.new([bot[i],bot[(i+1)%4],top[(i+1)%4],top[i]]).material_index=0
            stones+=1
        s+=length;row+=1
    # The joint bed sits just under the stones, so the gaps read as dark mortar lines.
    prev=None
    for k in range(0,len(line),2):
        p,n=at(dist[k]);w=half(dist[k])+.02
        pair=[batch.bm.verts.new(ground(p-n*w,.02)),batch.bm.verts.new(ground(p+n*w,.02))]
        if prev:batch.bm.faces.new([prev[0],prev[1],pair[1],pair[0]]).material_index=1
        prev=pair
    return {'length':round(total,2),'stones':stones,'line':[list(q) for q in line[::8]]}

def paths(mapping,coll):
    terrain=mapping[TERRAIN];tree=GEO['bvh'](terrain);make=API['BASE']['material']
    stone=bpy.data.materials['B2_Unbanded_Stone_1.003'].copy();stone.name='NA_Path_Flagstone'
    nt=stone.node_tree;r=nt.nodes['Color Ramp'].color_ramp
    r.elements[0].color=(.30,.28,.24,1);r.elements[1].color=(.46,.42,.35,1)
    nt.nodes['Noise Texture'].inputs['Scale'].default_value=.35
    # The path mesh has no RockFacetValue attribute, so the stone skips that multiply.
    nt.links.new(nt.nodes['Mix (Legacy).001'].outputs['Color'],nt.nodes['Principled BSDF'].inputs['Base Color'])
    grout=make('NA_Path_Joint_Bed',(.075,.07,.065),.98)
    report={};lines=[]
    for i,(name,(points,width,flare)) in enumerate(ROUTES.items()):
        batch=Batch(name,coll,[stone,grout]);report[name]=paved_path(batch,tree,points,width,flare,7+i*5)
        ob=batch.finish();API['LP']['grain_uv'](ob)
        for f in ob.data.polygons:f.use_smooth=False
        lines.append(([Vector(q) for q in report[name].pop('line')],width,flare))
    for old in OLD_PATHS:
        ob=mapping.pop(old);bpy.data.objects.remove(ob,do_unlink=True)
    def inside(c):
        if c.z>.95:return False
        for line,width,flare in lines:
            if min((c.xy-q).length for q in line)<flare/2+.15:return True
        return False
    report['cleared_parts']=clear_under(mapping,('Terrain','Grove_','Water','Pond','Bridge','Lookout','Lantern','Stream','Shore','Stepping'),inside)
    return report

def corkboard(coll):
    """Builds the project corkboard on the free workshop back wall beside the rear window."""
    make=API['BASE']['material']
    cork=make('NA_Cork',(.47,.32,.18),.95)
    cards=[bpy.data.materials['PT_LP_SS_A_paper'],make('NA_Card_Sage',(.36,.45,.35),.9),
           make('NA_Card_Sky',(.40,.50,.60),.9),make('NA_Card_Butter',(.78,.67,.40),.9)]
    pin=make('NA_Pin_Red',(.72,.07,.05),.5)
    board=Batch('NA_Workshop_Project_Corkboard',coll,[cork,bpy.data.materials['PT_LP_SS_A_wood'],pin,*cards])
    # The rear wall mesh has an identity transform, so its local BVH is in world space.
    hit=GEO['bvh'](bpy.data.objects['SS_DR_Rear_Window_Walls']).ray_cast(Vector((-3.62,4.0,2.55)),Vector((0,1,0)),3)[0]
    assert hit is not None,'workshop rear wall not found'
    wall_y=hit.y
    cx,cz,w,h=-3.62,WORKSHOP_FLOOR+1.55,1.22,.86;y=wall_y-.025
    board.box((cx,y,cz),(w,.04,h),0)
    for dz,dw,dh in ((h/2,w+.08,.05),(-h/2,w+.08,.05)):board.box((cx,y-.01,cz+dz),(dw,.06,dh),1)
    for dx in (-w/2,w/2):board.box((cx+dx,y-.01,cz),(.05,.06,h+.08),1)
    rng=random.Random(2026);pins=[]
    for row in range(3):
        for col in range(4):
            if (row,col) in ((0,3),(2,0)):continue
            x=cx-w/2+.17+col*.29+rng.uniform(-.03,.03);z=cz+h/2-.17-row*.27+rng.uniform(-.02,.02)
            size=(rng.uniform(.13,.2),.008,rng.uniform(.1,.16))
            board.box((x,y-.026,z),size,3+(row*4+col)%4,Matrix.Rotation(rng.uniform(-.12,.12),4,'Y'))
            p=Vector((x,y-.035,z+size[2]/2-.025));board.part('ico',p,(.018,.018,.018),2);pins.append(p)
    # A red thread links four project cards, a quiet cue that they connect.
    for a,b in zip(pins[0:7:2],pins[2:9:2]):board.beam(a,b,.006,mat=2)
    ob=board.finish()
    for f in ob.data.polygons:f.use_smooth=False
    return {'wall_y':round(wall_y,3),'centre':[cx,round(y,3),cz],'size':[w,h],'cards':len(pins)}

def bedroom(coll):
    """Adds a bedside lamp and a rug so the top room reads as the bedroom."""
    make=API['BASE']['material']
    rug=make('NA_Rug_Terracotta',(.36,.19,.13),.98)
    room=Batch('NA_Bedroom_Comforts',coll,[bpy.data.materials['PT_LP_SS_A_wood_light'],bpy.data.materials['PT_LP_SS_A_warm'],
                                           bpy.data.materials['PT_LP_SS_A_metal'],rug])
    f=BEDROOM_FLOOR+.05
    room.box((-5.15,2.45,f+.008),(2.1,1.25,.016),3)
    t=Vector((-3.98,4.55,f))
    room.box(t+Vector((0,0,.25)),(.42,.38,.5),0)
    cylinder(room,t+Vector((0,0,.5)),t+Vector((0,0,.75)),.025,2,8)
    cylinder(room,t+Vector((0,0,.72)),t+Vector((0,0,.92)),.16,1,10,radius2=.1)
    ob=room.finish()
    for p in ob.data.polygons:p.use_smooth=False
    API['BASE']['light']('NA_Bedside_Lamp',coll,'POINT',tuple(t+Vector((0,0,.82))),(1,.66,.38),14,.15)
    return {'lamp':list(t),'rug_floor_z':f}

def entry_canopy(coll):
    metal=bpy.data.materials['LP_SS_A_metal']
    edge=Batch('NA_Entry_Canopy_Steel_Edge',coll,[metal])
    x0,x1,y0,y1,z=-6.05,-3.42,-.88,.72,3.275
    for a,b in (((x0,y0),(x1,y0)),((x0,y0),(x0,y1)),((x1,y0),(x1,y1))):
        edge.beam(Vector((*a,z)),Vector((*b,z)),.06,.09)
    ob=edge.finish()
    for p in ob.data.polygons:p.use_smooth=False
    API['BASE']['light']('NA_Entry_Downlight',coll,'POINT',(-4.75,-.25,3.1),(1,.7,.45),10,.1)

def cameras(scene,coll):
    specs={'NA_Arrival_ThreeQuarter':((34,-36,12),(6,-1,-2),30),'NA_Arrival_Low':((44,-34,4),(5,-1,-4),34),
           'NA_Pad_Close':((25,-14,7),(14,-3,0.5),32),'NA_Corkboard_Close':((-3.9,-3.2,2.4),(-3.62,4.9,2.5),40),
           'NA_Bedroom_Close':((-1.2,-4.6,9.3),(-4.8,3.6,7.8),38),'NA_Hero_Wide':((62,-70,22),(2,0,-3),40)}
    for name,(loc,aim,lens) in specs.items():
        data=bpy.data.cameras.new(name);data.lens=lens;data.clip_end=4000
        ob=bpy.data.objects.new(name,data);coll.objects.link(ob);ob.location=loc
        ob.rotation_euler=(Vector(aim)-Vector(loc)).to_track_quat('-Z','Y').to_euler()
    scene.camera=bpy.data.objects['NA_Arrival_ThreeQuarter']

def build():
    assert not OUTPUT.exists() and bpy.data.scenes.get(SCENE) is None
    source=bpy.context.scene;assert source.name==SOURCE,source.name
    before={o.name:OPT['fingerprint'](o.data) for o in source.objects if o.type=='MESH'}
    scene=source.copy();scene.name=SCENE
    scene.compositing_node_group=source.compositing_node_group.copy()
    for n in scene.compositing_node_group.nodes:
        if n.type=='R_LAYERS':n.scene=scene
    island_map={};env_map={}
    for name,mapping,share in ((ISLAND,island_map,lambda ob:False),
                               (ENVIRONMENT,env_map,lambda ob:ob.type=='CAMERA' or 'City' in ob.name and ob.type=='MESH')):
        old=bpy.data.collections[name];scene.collection.children.unlink(old)
        clone(old,scene.collection,mapping,share);reparent(mapping)
    coll=bpy.data.collections.new('NA_Arrival_and_Room_Story');scene.collection.children.link(coll)
    cams=bpy.data.collections.new('NA_Review_Cameras');scene.collection.children.link(cams)
    report={'scene':SCENE,'file':str(OUTPUT),'source':SOURCE}
    report['night']=night_grade(scene,env_map)
    report['island']=soften_island(island_map)
    report['pad']=arrival_pad(scene,island_map,coll)
    report['paths']=paths(island_map,coll)
    report['corkboard']=corkboard(coll)
    report['bedroom']=bedroom(coll)
    entry_canopy(coll);cameras(scene,cams)
    report['source_preserved']=all(OPT['fingerprint'](source.objects[n].data)==h for n,h in before.items())
    assert report['source_preserved']
    for win in bpy.context.window_manager.windows:win.scene=scene
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report

def save():
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)

def render(preview=False,only=None):
    scene=bpy.data.scenes[SCENE];out=ROOT/'renders'/'night-arrival';out.mkdir(parents=True,exist_ok=True)
    scene.render.resolution_x=1500;scene.render.resolution_y=1250;scene.render.resolution_percentage=50 if preview else 100
    scene.eevee.taa_render_samples=32 if preview else 96
    for cam in only or [o.name for o in bpy.data.collections['NA_Review_Cameras'].objects]:
        scene.camera=bpy.data.objects[cam];scene.render.filepath=str(out/f'{cam.lower()}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name)
    scene.eevee.taa_render_samples=96;scene.render.resolution_percentage=100

if __name__=='__main__':result=build()

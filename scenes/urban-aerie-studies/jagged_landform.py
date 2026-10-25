"""Coarse uneven ground and fractured cliffs, welded along a shared rim."""
from pathlib import Path
import bpy,bmesh,runpy,math,json,random
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

ROOT=Path(__file__).resolve().parent
RF=runpy.run_path(str(ROOT/'restore_faceted.py'))
API,GEO,CO=RF['API'],RF['GEO'],RF['CO']
FIELD=CO['FIELD']


def clone(source,parent,mapping):
    c=bpy.data.collections.new('JG_'+source.name);parent.children.link(c)
    for old in source.objects:
        ob=old.copy();ob.name='JG_'+old.name
        if old.data:ob.data=old.data.copy()
        c.objects.link(ob);mapping[old.name]=ob
    for child in source.children:clone(child,c,mapping)
    return c


def height(x,y):
    original=FIELD['height'](x,y)
    knolls=[(-10.6,5.0,2.0,5.2,5.1),(-11,-4,1.15,4.4,4.0),
            (10.5,4.5,1.65,4.6,4.7),(-1,9,1.25,5.0,3.5),(-5,-8,1.0,4.8,3.5)]
    rough=.35+.55*sum(h*max(0,1-abs(x-cx)/sx-abs(y-cy)/sy) for cx,cy,h,sx,sy in knolls)
    rough+=.065*math.sin(x*5.3+y*8.7)+.04*math.cos(x*9.1-y*3.7)
    rough=max(.12,rough)
    # The rolling ground reaches the skyline. Its outer profile is not a
    # horizontal cut through otherwise uneven ground.
    angle=math.atan2(y/11.5,x/16)
    radius=math.sqrt((x/16)**2+(y/11.5)**2)
    edge=max(.25,.95+.60*math.sin(3*angle+.5)+.32*math.sin(7*angle-.8)+.12*math.cos(11*angle))
    blend=FIELD['smooth'](.62,1.01,radius)
    rough=rough*(1-blend)+edge*blend
    d=FIELD['distance_to_lines'](x,y,[FIELD['STREAM']])
    pond=math.sqrt(((x-4)/2.9)**2+((y-4)/2.5)**2)
    protect=max(1-FIELD['smooth'](1.7,2.8,d),1-FIELD['smooth'](1.08,1.50,pond))
    for bounds in [(-6.9,1.9,.05,7.1),(7.2,12.0,-8.3,-4.5)]:
        protect=max(protect,1-FIELD['smooth'](0,1.4,FIELD['rectangle_distance'](x,y,bounds)))
    dpath=FIELD['distance_to_lines'](x,y,API['PATHS'])
    protect=max(protect,1-FIELD['smooth'](.72,1.5,dpath))
    for px,py in ((2.2,-5.05),(6.36,-5.05)):
        protect=max(protect,1-FIELD['smooth'](.85,1.65,math.hypot(x-px,y-py)))
    value=rough*(1-protect)+original*protect
    for tx,ty in FIELD['TREES']:
        w=1-FIELD['smooth'](.35,.70,math.hypot(x-tx,y-ty))
        target=1.15 if tx<0 else 1.05
        value=value*(1-w)+target*w
    return value


def body_mesh(body):
    original=bpy.data.objects['SH_SS_UA_Connected_Island'];source=original.data
    count=48
    controls=[]
    for i in range(count):
        factor=1+.015*math.sin(i*2.4)+.011*math.cos(i*4.1)
        v=source.vertices[2209+i*2].co.copy();v.x*=factor;v.y*=factor;v.z=height(v.x,v.y);controls.append(v)
    rim=[v.copy() for v in controls]
    polygon=[Vector(v[:2]) for v in rim];points=[];lookup={}
    def add(q):
        q=Vector(q[:2]);key=(round(q.x,6),round(q.y,6))
        if key not in lookup:lookup[key]=len(points);points.append(q)
        return lookup[key]
    outer=[add(v) for v in rim]
    rng=random.Random(27801)
    for i in range(41):
        for j in range(30):
            q=Vector((-17+i*.85+rng.uniform(-.22,.22),-12+j*.85+rng.uniform(-.22,.22)))
            if GEO['inside'](q,polygon):add(q)
    # Keep sufficient vertices in the recessed basin and at structural contacts.
    for v in source.vertices[:2305]:
        q=Vector(v.co[:2]);d=FIELD['distance_to_lines'](q.x,q.y,[FIELD['STREAM']])
        pond=math.sqrt(((q.x-4)/2.9)**2+((q.y-4)/2.5)**2)
        if (d<2.05 or pond<1.28) and GEO['inside'](q,polygon):add(q)
    for tx,ty in FIELD['TREES']:
        add((tx,ty))
        for dx,dy in ((.3,.3),(.3,-.3),(-.3,.3),(-.3,-.3)):add((tx+dx,ty+dy))
    for path in API['PATHS']:
        for a,b in zip(path,path[1:]):
            a,b=Vector(a),Vector(b)
            for j in range(max(2,math.ceil((b-a).length/.65))):
                t=j/max(1,math.ceil((b-a).length/.65)-1);q=a.lerp(b,min(1,t));normal=Vector((-(b-a).y,(b-a).x)).normalized()
                for shift in (-.65,0,.65):add(q+normal*shift)
    output=delaunay_2d_cdt(points,[],[outer],0,.000001,True)
    coords,edges,triangles=output[:3]
    selected=[f for f in triangles if len(f)==3 and abs((coords[f[1]]-coords[f[0]]).cross(coords[f[2]]-coords[f[0]]))>1e-7 and GEO['inside'](sum((coords[i] for i in f),Vector((0,0)))/len(f),polygon)]
    vertices=[Vector((q.x,q.y,height(q.x,q.y))) for q in coords]
    coord_map={(round(q.x,5),round(q.y,5)):i for i,q in enumerate(coords)}
    rim_ids=[coord_map[(round(v.x,5),round(v.y,5))] for v in rim]
    for i,v in zip(rim_ids,rim):vertices[i].z=v.z
    faces=[tuple(f) for f in selected]
    indices=[rng.choice((0,0,0,4,5)) for _ in faces]
    top_faces=len(faces);top_count=len(vertices)
    previous=rim_ids
    # A welded turf-and-soil cap spills irregularly over the rock. These bands
    # share vertices with the meadow and with the lower cliff rings.
    turf_depths=[];soil_depths=[]
    for band in range(2):
        base=len(vertices)
        for i,v in enumerate(controls):
            angle=i*math.tau/count
            turf=.50+.22*(.5+.5*math.sin(i*2.1))+.28*(i%9 in (0,1))
            soil=1.18+.35*math.sin(i*1.3)+.38*(.5+.5*math.cos(i*2.7))+.24*(i%13 in (3,4))
            depth=turf if band==0 else turf+soil
            flare=(.014+.010*math.sin(i*1.7)) if band==0 else (.008+.012*math.cos(i*1.2))
            vertices.append(Vector((v.x*(1+flare),v.y*(1+flare),v.z-depth)))
            if band==0:turf_depths.append(turf)
            else:soil_depths.append(soil)
        for i in range(count):
            a,b=previous[i],previous[(i+1)%count];c,d=base+i,base+(i+1)%count
            faces.extend([(a,c,b),(b,c,d)])
            indices.extend([rng.choice((0,0,4)),rng.choice((0,0,4))] if band==0 else [6+i%3,6+(i+1)%3])
        previous=list(range(base,base+count))
    layers=[(1.0,-.9),(.985,-2.5),(.935,-4.3),(.86,-6.4),(.77,-8.7),(.66,-11.0),(.54,-13.1),(.40,-15.3),(.24,-17.6),(.095,-19.4)]
    for k,(radius,z) in enumerate(layers):
        base=len(vertices)
        for i,v in enumerate(controls):
            a=i*math.tau/count
            macro=(1.04,.94,1.03,.95,1.05,.93,1.04,.96)[i//6]
            fracture=1+(macro-1)*(.5+.5*math.sin(math.pi*(k+1)/11))
            radial=radius*fracture*(1+.018*math.sin(7*a+k*.31)+.012*math.cos(11*a-k*.5)+rng.uniform(-.014,.014))
            if k in (2,5) and i//6 in (1,5):radial-=.05
            if i in (36,37,38,39) and k<2:radial=min(radial,.965 if k==0 else .93)
            spin=.012*math.sin(k*.9+i*.7)
            cliff_z=z+.35*math.sin(5*a+k*.5)+rng.uniform(-.22,.22)
            if k==0:cliff_z=min(cliff_z,vertices[previous[i]].z-.22)
            if k==9:cliff_z=-19.0+.28*math.sin(5*a+.7)
            vertices.append(Vector(((v.x*math.cos(spin)-v.y*math.sin(spin))*radial+.11*k+.025*k*k+.12*math.sin(4*a+k),
                                    (v.x*math.sin(spin)+v.y*math.cos(spin))*radial+.06*k+.12*math.cos(6*a-k),
                                    cliff_z)))
        for i in range(count):
            a,b=previous[i],previous[(i+1)%count];c,d=base+i,base+(i+1)%count
            faces.extend([(a,c,b),(b,c,d)] if (i+k)%2 else [(a,c,d),(a,d,b)])
            tone=1+((i//6+k//3)%3);indices.extend([tone,1+tone%3 if (i+k)%7==0 else tone])
        previous=list(range(base,base+count))
    tip=len(vertices);vertices.append(Vector((3.0,.54,-20.15)))
    for i in range(count):faces.append((previous[i],tip,previous[(i+1)%count]));indices.append(3)
    mats=[bpy.data.materials['LP_SS_A_'+k] for k in ('grass','rock','rock_light','rock_dark')]
    for label,factor in (('Dusk',.94),('Light',1.055)):
        m=mats[0].copy();m.name='JG_Faceted_Grass_'+label;n=m.node_tree.nodes;l=m.node_tree.links;p=n.get('Principled BSDF')
        old=p.inputs['Base Color'].links[0].from_socket
        mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(factor,factor,factor,1)
        l.new(old,mix.inputs[1]);l.new(mix.outputs[0],p.inputs['Base Color']);mats.append(m)
    for i,color in enumerate(((.21,.13,.073),(.255,.165,.095),(.16,.095,.052))):
        mat=API['BASE']['material']('JG_Exposed_Soil_'+str(i),color,.96)
        mats.append(mat)
    temp=API['mesh_object']('JG_Fractured_Landform',vertices,faces,body.users_collection[0],mats,indices)
    body.data=temp.data;bpy.data.objects.remove(temp,do_unlink=True)
    body['RimIndices']=rim_ids
    bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for f in bm.faces:f.smooth=False
    bm.to_mesh(body.data);bm.free();body.data.update()
    return {'top_triangles':top_faces,'cliff_and_edge_triangles':len(faces)-top_faces,
            'ground_height_range_m':[round(min(v.z for v in vertices[:top_count]),3),round(max(v.z for v in vertices[:top_count]),3)],
            'turf_depth_m':[round(min(turf_depths),2),round(max(turf_depths),2)],
            'exposed_soil_depth_m':[round(min(soil_depths),2),round(max(soil_depths),2)],
            'shape':'Dense small facets; thick turf and soil tongues, uneven skyline, stepped fractures, offset taper and irregular underside; protected structural pads and basin.'}


def edge_grass(body,common):
    verts=[];faces=[];indices=[];rng=random.Random(2891)
    rim=list(body['RimIndices']);points=[body.data.vertices[i].co.copy() for i in rim]
    for i,p in enumerate(points):
        if 35<=i<=40:continue
        normal=Vector((p.x,p.y,0)).normalized();side=Vector((-normal.y,normal.x,0))
        for j in range(6):
            root=p-normal*.035+side*rng.uniform(-.10,.10);root.z-=.025
            if j in (0,1):
                bend=root+normal*.20+Vector((0,0,.05));tip=root+normal*.45+Vector((0,0,-.48-rng.uniform(0,.16)))
            else:
                h=rng.uniform(.24,.45);bend=root+normal*.055+Vector((0,0,h*.65));tip=root+normal*.11+Vector((0,0,h))
            b=len(verts);verts.extend((root-side*.025,root+side*.025,bend+side*.014,bend-side*.014,tip))
            faces.extend(((b,b+1,b+2),(b,b+2,b+3),(b+3,b+2,b+4)));indices.extend((j%2,)*3)
    mats=[bpy.data.materials['LP_SS_A_leaf'],bpy.data.materials['LP_SS_A_leaf_dark']]
    old=next((o for o in common.objects if 'Overhanging_Edge_Grass' in o.name),None)
    ob=API['mesh_object']('JG_Overhanging_Edge_Grass',verts,faces,common,mats,indices)
    if old:
        old.data=ob.data;bpy.data.objects.remove(ob,do_unlink=True);ob=old
    return ob.name


def ground_scene(common,house,mapping,old,new):
    anchors=FIELD['TREES'];tree_shifts={q:GEO['sample'](new,*q)-GEO['sample'](old,*q) for q in anchors}
    for name,ob in mapping.items():
        if ob.type!='MESH' or ob.hide_render:continue
        if any(k in name for k in ('Tree_Branches','Tree_Canopies','Faceted_Crown_Sprays')):
            ending=next(k for k in ('Tree_Branches','Tree_Canopies','Faceted_Crown_Sprays') if k in name)
            source=next(o for o in bpy.data.collections['SH_UA_Shared_Corrected_Island'].all_objects if o.name.endswith(ending))
            ob.data=source.data.copy()
            for v in ob.data.vertices:v.co.z+=.43 if v.co.x<0 else .41
            ob.data.update()
        elif any(k in name for k in ('Angular_Meadow','Ground_Planting','Grass_Accents','Grounded_Stream_Banks','Pond_Shore_Stones')):
            CO['ground_parts'](ob,new,.035 if 'Meadow' in name or 'Grass' in name else .10)
        elif any(k in name for k in ('Flower_','Faceted_Flower_Petals','Grounded_Reeds','Rooted_Reed_Blades','Connected_Path_')):
            for v in ob.data.vertices:
                a,b=GEO['sample'](old,v.co.x,v.co.y),GEO['sample'](new,v.co.x,v.co.y)
                if a is not None and b is not None:v.co.z+=b-a
            ob.data.update()
        elif any(k in name for k in ('Grounded_Foundation','Bridge_Abutments','Lookout_Access_Step')):CO['extend_feet'](ob,new)
        elif name.endswith('City_Lookout'):CO['extend_feet'](ob,new,True)
    lanterns=[(-3.7,-1.4),(-.6,-3.6),(1.8,-6.05),(6.9,-4.4),(10.9,-6.75)]
    delta={q:GEO['sample'](new,*q)-GEO['sample'](old,*q) for q in lanterns}
    lantern=RF['find'](mapping,'Path_Lanterns')
    for v in lantern.data.vertices:
        q=min(lanterns,key=lambda q:(v.co.x-q[0])**2+(v.co.y-q[1])**2);v.co.z+=delta[q]
    lantern.data.update()
    for ob in common.all_objects:
        if ob.type=='LIGHT':
            q=min(lanterns,key=lambda q:(ob.location.x-q[0])**2+(ob.location.y-q[1])**2);ob.location.z+=delta[q]
    return {'tree_geometry':'Accepted sheltered tree geometry restored exactly; all left trees translated 0.43m, all right trees 0.41m to matching root pads.','lanterns_reseated':5}


def build():
    if bpy.data.scenes.get('UA_B_Atelier_Jagged'):raise RuntimeError('Jagged scene exists.')
    source=bpy.data.scenes['UA_B_Atelier_FacetedRestored'];scene=source.copy();scene.name='UA_B_Atelier_Jagged'
    scene.compositing_node_group=source.compositing_node_group.copy()
    for node in scene.compositing_node_group.nodes:
        if node.type=='R_LAYERS':node.scene=scene
    mapping={}
    for cname in ('RF_CO_PT_SH_UA_Shared_Corrected_Island','RF_CO_PT_SH_UA_B_Atelier'):
        c=bpy.data.collections[cname];scene.collection.children.unlink(c);clone(c,scene.collection,mapping)
    common=bpy.data.collections['JG_RF_CO_PT_SH_UA_Shared_Corrected_Island'];house=bpy.data.collections['JG_RF_CO_PT_SH_UA_B_Atelier']
    body=RF['find'](mapping,'Connected_Island');water=RF['find'](mapping,'Pond_Stream_and_Waterfall')
    old=GEO['bvh'](body);shape=body_mesh(body);new=GEO['bvh'](body)
    contact=ground_scene(common,house,mapping,old,new)
    edge_grass(body,common)
    rows,cols=RF['make_water'](water,new,body);shore=RF['bury_boundary'](water,new,rows,cols,body)
    cameras=API['collection']('JG_Review_Cameras',scene.collection)
    cam=API['BASE']['camera']('JG_Surface',cameras,(-21,-13,7),(-6,2,1.2),40);cam.data.clip_end=6500
    scene.camera=bpy.data.objects['SS_SH_Garden'];scene.render.resolution_x=1800;scene.render.resolution_y=1200
    if bpy.context.window:bpy.context.window.scene=scene
    bpy.context.view_layer.update()
    path=ROOT/'atelier_jagged.blend'
    if path.exists():raise FileExistsError(path)
    report={'scene':scene.name,'blend':str(path),'landform':shape,'terrain':API['audit_island'](body),'shoreline':shore,'contacts':contact}
    bpy.ops.wm.save_as_mainfile(filepath=str(path),check_existing=False)
    (ROOT/'jagged_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report


if __name__=='__main__':result=build()

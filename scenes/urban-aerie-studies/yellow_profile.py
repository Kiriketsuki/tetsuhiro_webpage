"""Wide rock slab and an off-centre hanging root, following the yellow outline."""
from pathlib import Path
import bpy,bmesh,runpy,math,random,json,heapq
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

ROOT=Path(__file__).resolve().parent
FR=runpy.run_path(str(ROOT/'fractured_rock.py'))
BC,RF,API,GEO=FR['BC'],FR['RF'],FR['API'],FR['GEO']

# Projected rock underside, left to right. A thin upper mass bridges over a
# deep bay; the principal hanging section is left of the waterfall.
YELLOW=[(-17,4.7),(-15.0,5.7),(-14.7,6.4),(-12.5,6.7),(-12.2,7.5),
        (-10.8,6.9),(-10.4,5.7),(-9.6,6.0),(-8.7,8.0),(-8.45,9.8),
        (-7.4,10.4),(-7.3,11.8),(-5.8,14.1),(-3.7,13.7),(-1.5,13.85),
        (-.8,11.2),(-.3,9.3),(.8,7.3),(1.3,6.9),(1.5,5.0),
        (4.3,4.9),(5.6,6.8),(6.4,7.6),(7.5,5.6),(8.3,4.2),
        (10.5,4.0),(11.4,3.0),(14.2,2.5),(17,1.8)]


def interp(points,x):
    if x<=points[0][0]:return points[0][1]
    for (a,y),(b,z) in zip(points,points[1:]):
        if x<=b:return y+(z-y)*(x-a)/(b-a)
    return points[-1][1]


def underside(x,y):
    base=interp([(-17,4.6),(-10,4.5),(-5,4.0),(0,3.9),(5,3.1),(10,2.9),(17,1.8)],x)
    axis=-1.2+.14*x
    # A real three-dimensional rock root, rather than a silhouette extruded as
    # a curtain across the island's complete depth.
    d=abs(y-axis)
    strength=max(0,min(1,(7.1-d)/5.2))
    depth=base+strength*(interp(YELLOW,x)-base)
    variation=.085*math.sin(x*12.3+y*8.7)*math.cos(x*5.1-y*11.9)
    return -depth+variation


def make_rock(body):
    me=body.data;before=API['audit_island'](body)
    rim_positions=[me.vertices[i].co.copy() for i in body['RimIndices']]
    bm=bmesh.new();bm.from_mesh(me)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index in {1,2,3}],context='FACES_ONLY')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    boundary={v for e in bm.edges if e.is_boundary for v in e.verts}
    start=min(boundary,key=lambda v:math.atan2(v.co.y,v.co.x));loop=[start];last=None;current=start
    while True:
        nxt=next(e.other_vert(current) for e in current.link_edges if e.is_boundary and e.other_vert(current)!=last)
        if nxt==start:break
        loop.append(nxt);last,current=current,nxt
        if len(loop)>len(boundary):raise RuntimeError('Collar traversal failed.')
    area=sum(a.co.x*b.co.y-b.co.x*a.co.y for a,b in zip(loop,loop[1:]+loop[:1]))
    if area<0:loop=[loop[0]]+list(reversed(loop[1:]))
    polygon=[Vector(v.co[:2]) for v in loop]
    points=[];lookup={}
    def add(q):
        q=Vector(q[:2]);key=(round(q.x,6),round(q.y,6))
        if key not in lookup:lookup[key]=len(points);points.append(q)
        return lookup[key]
    outer=[add(p) for p in polygon];rng=random.Random(46911)
    for i in range(2900):
        q=Vector((rng.uniform(-17,17),rng.uniform(-12,12)))
        if GEO['inside'](q,polygon):add(q)
    constraints=[]
    # Creases pass through the actual inflections of the user's profile.
    for x,depth in YELLOW:
        ys=sorted(set([-9,-7,-5,5,7,9]+[-1.2+.14*x+d for d in (-7.1,-5.2,-1.9,0,1.9,5.2,7.1)]))
        line=[add((x,y)) for y in ys if GEO['inside'](Vector((x,y)),polygon)]
        constraints.extend(zip(line,line[1:]))
    profile=[add((x,-1.2+.14*x)) for x,depth in YELLOW if GEO['inside'](Vector((x,-1.2+.14*x)),polygon)]
    constraints.extend(zip(profile,profile[1:]))
    coords,edges,triangles,*_=delaunay_2d_cdt(points,list(constraints),[outer],0,.000001,True)
    vertices={};boundary_table={(round(v.co.x,5),round(v.co.y,5)):i for i,v in enumerate(loop)}
    bottom=[]
    for n,q in enumerate(coords):
        key=(round(q.x,5),round(q.y,5));z=underside(q.x,q.y)
        if key in boundary_table:z=min(z,loop[boundary_table[key]].co.z-.65)
        vertices[n]=bm.verts.new((q.x,q.y,z))
    index={(round(q.x,5),round(q.y,5)):n for n,q in enumerate(coords)}
    for v in loop:bottom.append(vertices[index[(round(v.co.x,5),round(v.co.y,5))]])
    for tri in triangles:
        if len(tri)!=3 or abs((coords[tri[1]]-coords[tri[0]]).cross(coords[tri[2]]-coords[tri[0]]))<1e-7:continue
        center=sum((coords[i] for i in tri),Vector((0,0)))/3
        if not GEO['inside'](center,polygon):continue
        f=bm.faces.new([vertices[i] for i in tri]);f.material_index=1+(int(center.x*.18+center.y*.12)%3)
    for i in range(len(loop)):
        a,b=loop[i],loop[(i+1)%len(loop)];c,d=bottom[i],bottom[(i+1)%len(loop)]
        for tri in ((a,c,b),(b,c,d)):
            f=bm.faces.new(tri);f.material_index=1+(i//6)%3
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
    def category(f):
        if f.material_index in {1,2,3}:return 'rock'
        if f.material_index in {6,7,8}:return 'soil'
        return 'grass_top' if f.normal.z>.45 else 'turf'
    density_before={}
    for label in ('rock','grass_top','turf','soil'):
        fs=[f for f in bm.faces if category(f)==label]
        density_before[label]={'triangles':len(fs),'area':sum(f.calc_area() for f in fs)}
    target_density=max(8.0,density_before['rock']['triangles']/density_before['rock']['area'])
    # Face-centre triangulation preserves every shared edge and contact. Each
    # layer receives the same triangle count per unit of actual surface area.
    counter=0
    for label in ('rock','grass_top','turf','soil'):
        fs=[f for f in bm.faces if category(f)==label]
        target=round(density_before[label]['area']*target_density)
        heap=[]
        for f in fs:
            counter+=1;heapq.heappush(heap,(-f.calc_area(),counter,f))
        count=len(fs)
        while count+1<target:
            area,serial,f=heapq.heappop(heap)
            vs=list(f.verts);mat=f.material_index
            center=sum((v.co for v in vs),Vector())/len(vs)
            amount=.020 if label in ('soil','turf') else .025 if label=='rock' else 0
            center+=f.normal*rng.uniform(-amount,amount)
            mid=bm.verts.new(center);bm.faces.remove(f)
            for a,b in zip(vs,vs[1:]+vs[:1]):
                new=bm.faces.new((a,b,mid));new.material_index=mat;new.smooth=False;new.normal_update()
                counter+=1;heapq.heappush(heap,(-new.calc_area(),counter,new))
            count+=2
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for f in bm.faces:f.smooth=False
    bm.to_mesh(me);bm.free();me.update()
    table={tuple(round(c,5) for c in v.co):v.index for v in me.vertices}
    body['RimIndices']=[table[tuple(round(c,5) for c in p)] for p in rim_positions]
    # Small per-face painted value shifts, privately copied materials.
    attr=me.attributes.get('facet_value') or me.attributes.new('facet_value','FLOAT','FACE')
    for i,p in enumerate(me.polygons):attr.data[i].value=1+rng.uniform(-.052,.052)
    for i,source in enumerate(list(me.materials)):
        mat=source.copy();mat.name='YP_'+source.name;me.materials[i]=mat
        nodes,links=mat.node_tree.nodes,mat.node_tree.links;p=nodes.get('Principled BSDF')
        if not p:continue
        old=p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].links else None
        field=nodes.new('ShaderNodeAttribute');field.attribute_name='facet_value'
        mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
        if old:links.new(old,mix.inputs[1])
        else:mix.inputs[1].default_value=p.inputs['Base Color'].default_value
        links.new(field.outputs['Fac'],mix.inputs[2]);links.new(mix.outputs[0],p.inputs['Base Color'])
    after=API['audit_island'](body)
    densities={}
    for label in ('rock','grass_top','turf','soil'):
        fs=[p for p in me.polygons if ('rock' if p.material_index in {1,2,3} else 'soil' if p.material_index in {6,7,8} else 'grass_top' if p.normal.z>.45 else 'turf')==label]
        area=sum(p.area for p in fs);densities[label]={'triangles':len(fs),'area_m2':round(area,2),'triangles_per_m2':round(len(fs)/area,2)}
    return {'before':before,'after':after,'density_target_per_m2':round(target_density,2),'layer_densities':densities,
            'rock_bottom_z_m':round(min(v.co.z for v in me.vertices),3),
            'shape':'Yellow outline: wide thin slab, deep bay to the right, one long off-centre left rock root and a short right tooth.',
            'variance':'Fine geometric facet height 0.085m; per-face painted value variation ±5.2%. Existing meadow contact positions retained.'}


def build():
    name='UA_B_Atelier_YellowProfile';path=ROOT/'atelier_yellow_profile.blend'
    if bpy.data.scenes.get(name) or path.exists():raise RuntimeError('Yellow-profile study already exists.')
    source=bpy.data.scenes['UA_B_Atelier_FracturedRock'];scene=source.copy();scene.name=name
    scene.compositing_node_group=source.compositing_node_group.copy()
    for n in scene.compositing_node_group.nodes:
        if n.type=='R_LAYERS':n.scene=scene
    old_body=next(o for o in source.objects if o.type=='MESH' and 'RimIndices' in o)
    old=old_body.users_collection[0];mapping={};scene.collection.children.unlink(old)
    common=BC['clone'](old,scene.collection,mapping)
    return finish(scene,common)


def finish(scene,common):
    path=ROOT/'atelier_yellow_profile.blend'
    body=next(o for o in common.all_objects if o.type=='MESH' and 'RimIndices' in o)
    water=next(o for o in common.all_objects if o.type=='MESH' and any(m and 'RF_Faceted_Water' in m.name for m in o.data.materials))
    report=make_rock(body);tree=GEO['bvh'](body)
    rows,cols=RF['make_water'](water,tree,body);report['shoreline']=RF['bury_boundary'](water,tree,rows,cols,body)
    cameras=API['collection']('YP_Profile_Cameras',scene.collection)
    for label,loc in [('Front',(0,-68,0)),('Side',(68,0,0))]:
        cam=API['BASE']['camera']('YP_'+label,cameras,loc,(0,0,0),50);cam.data.type='ORTHO';cam.data.ortho_scale=44;cam.data.clip_end=6500
    cam=API['BASE']['camera']('YP_Hero',cameras,(34,-52,1),(0,0,-1.5),48);cam.data.clip_end=6500
    scene.camera=bpy.data.objects['SS_YP_Front'];scene.render.resolution_x=1800;scene.render.resolution_y=1400
    if bpy.context.window:bpy.context.window.scene=scene
    report.update({'scene':scene.name,'blend':str(path),'drawing':r'C:\Users\Kidriel\AppData\Local\Temp\codex-clipboard-414a5074-2508-47f5-85d0-d400b0cebfab.png'})
    (ROOT/'yellow_profile_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(path),check_existing=False)
    return report


if __name__=='__main__':result=build()

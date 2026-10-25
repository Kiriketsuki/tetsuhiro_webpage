"""Move the whole atelier away from the pond and simplify its railings."""
from pathlib import Path
import ast
import json
import math
import runpy
import bpy
import bmesh
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

ROOT=Path(__file__).resolve().parent
RA=runpy.run_path(str(ROOT/'improve_house_structure.py'))
API,OPT,GEO,Batch=RA['API'],RA['OPT'],RA['GEO'],RA['Batch']
PARTS=runpy.run_path(str(ROOT/'refine_pond_patina.py'))['components']
OFFSET=Vector((-2.0,-1.0,0))
SCENE='Island_B_Minimal_House'
OUTPUT=ROOT/'island_b_minimal_house.blend'
REPORT=ROOT/'island_b_minimal_house_report.json'
PATH=[(-2.62,-1.47),(-1.68,-1.47),(-1.68,-2.60),(.4,-3.85),
      (1.68451,-4.65427),(1.21549,-5.44573),(-.45,-4.65),(-3.30,-3.0),
      (-5.46,-1.7),(-5.46,-.50),(-4.54,-.50),(-4.54,-1.30),(-2.62,-2.32)]


def clone(old,parent,mapping,select=None):
    coll=bpy.data.collections.new('MH_'+old.name);parent.children.link(coll)
    for ob in old.objects:
        if select is None or select(ob):
            n=ob.copy();n.name='MH_'+ob.name
            if ob.data:n.data=ob.data.copy()
            mapping[ob.name]=n
        else:n=ob
        coll.objects.link(n)
    for child in old.children:clone(child,coll,mapping,select)
    return coll


def path_mesh(coll,terrain,material):
    coords=[];faces=[];lookup={}
    def vertex(p):
        key=(round(p.x,6),round(p.y,6))
        if key not in lookup:
            lookup[key]=len(coords)
            z=GEO['sample'](terrain,*key)
            assert z is not None
            coords.append((key[0],key[1],z+.045))
        return lookup[key]
    def split(a,b,c,depth):
        if not depth:
            faces.append(tuple(vertex(p) for p in (a,b,c)));return
        ab,bc,ca=(a+b)/2,(b+c)/2,(c+a)/2
        for tri in [(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)]:split(*tri,depth-1)
    boundary=[Vector((*p,0)) for p in PATH]
    for tri in tessellate_polygon([boundary]):
        pts=[boundary[i] if isinstance(i,int) else i for i in tri]
        split(*pts,3)
    counts={}
    for face in faces:
        for a,b in zip(face,face[1:]+face[:1]):
            edge=tuple(sorted((a,b)));counts[edge]=counts.get(edge,0)+1
    n=len(coords);coords += [(x,y,z-.14) for x,y,z in coords]
    faces += [tuple(i+n for i in reversed(f)) for f in list(faces)]
    for (a,b),count in counts.items():
        if count==1:faces.append((a,b,b+n,a+n))
    ob=API['mesh_object']('MH_Connected_Entrance_Path',coords,faces,coll,[material])
    bm=bmesh.new();bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
    return ob


def minimal_guards(coll):
    material=bpy.data.materials['LP_SS_A_metal']
    batch=Batch('MH_Low_Minimal_Railings',coll,[material]);posts=set();count=0
    height=.76
    def post(p,z,h):
        nonlocal count
        key=tuple(round(v,3) for v in (*p,z,h))
        if key in posts:return
        posts.add(key);count+=1
        batch.beam((p[0],p[1],z),(p[0],p[1],z+h),.027)
    # Reuse the exact reviewed perimeter openings, including both roof entrances.
    tree=ast.parse((ROOT/'improve_house_structure.py').read_text(encoding='utf-8'))
    runs=[]
    for node in ast.walk(tree):
        if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='guard':
            a,b,z=[ast.literal_eval(v) for v in node.args[:3]];runs.append((a,b,z))
    for a,b,z in runs:
        a,b=Vector(a),Vector(b);length=(b-a).length
        if length<.20:continue
        batch.beam((*a,z+height),(*b,z+height),.045)
        n=max(1,math.ceil(length/.58))
        for i in range(n+1):post(a.lerp(b,i/n),z,height)
    levels=[1,4.30,7.45,10.66]
    for k,(z0,z1) in enumerate(zip(levels,levels[1:])):
        x=-.15 if k%2==0 else .95
        ya,yb=(1.40,5.85) if k%2==0 else (5.85,1.40)
        for side in (-.45,.45):
            sx=x+side
            batch.beam((sx,ya,z0+height),(sx,yb,z1+height),.042)
            for j in range(0,19,3):
                t=j/18;post(Vector((sx,ya+(yb-ya)*t)),z0+(z1-z0)*t,height)
    ob=batch.finish()
    for v in ob.data.vertices:v.co+=OFFSET
    return ob,{'height':height,'previous_height':1.04,'reduction_percent':26.923,
               'uprights':count,'horizontal_guard_segments':len(runs),
               'finish':'slim dark metal; no lower rail; wider-spaced uprights'}


def build():
    assert not OUTPUT.exists() and bpy.data.scenes.get(SCENE) is None
    source=bpy.context.scene;assert source.name=='Island_B_Sheltered_Roof_Access'
    source_hash={o.name:OPT['fingerprint'](o.data) for o in source.objects if o.type=='MESH'}
    source_matrices={o.name:[list(row) for row in o.matrix_world] for o in source.objects}
    scene=source.copy();scene.name=SCENE
    scene.compositing_node_group=source.compositing_node_group.copy()
    for n in scene.compositing_node_group.nodes:
        if n.type=='R_LAYERS':n.scene=scene
    old=bpy.data.collections['RA_JG_RF_CO_PT_SH_UA_B_Atelier'];scene.collection.children.unlink(old)
    mapping={};house=clone(old,scene.collection,mapping)
    for name,ob in mapping.items():
        assert ob.parent is None
        if ob.type=='MESH':
            for v in ob.data.vertices:v.co+=OFFSET
            ob.data.update()
        else:ob.location+=OFFSET
    guards=mapping['SS_RA_Terrace_and_Stair_Guards'];guard_coll=guards.users_collection[0]
    old_rail_vertices=len(guards.data.vertices)
    bpy.data.objects.remove(guards,do_unlink=True)
    mapping.pop('SS_RA_Terrace_and_Stair_Guards')
    rails,rail_report=minimal_guards(guard_coll)
    rail_report['previous_vertices']=old_rail_vertices;rail_report['new_vertices']=len(rails.data.vertices)
    body=next(o for o in source.objects if o.type=='MESH' and 'RimIndices' in o)
    terrain=GEO['bvh'](body)

    # Rebuild stone shoes at the new grade; keep all upper structural joints fixed.
    structural=mapping['SS_RA_Grounded_Timber_Supports']
    RA['components'](structural,lambda c,d: abs(d.x-.43)<.01 and abs(d.y-.43)<.01 and c.z<1.0)
    RA['components'](structural,lambda c,d: .18<d.x<.27 and .18<d.y<.27 and d.z<.2 and c.z<1.05)
    feet=Batch('MH_Reseated_Stone_Feet',guard_coll,[bpy.data.materials['LP_SS_A_stone'],bpy.data.materials['LP_SS_A_metal']])
    bm,groups=PARTS(structural.data);support_records=[]
    for group in groups:
        lo=Vector(tuple(min(v.co[i] for v in group) for i in range(3)))
        hi=Vector(tuple(max(v.co[i] for v in group) for i in range(3)));size=hi-lo;c=(hi+lo)/2
        if .12<size.x<.26 and .12<size.y<.26 and lo.z<1.0 and hi.z>4:
            samples=[GEO['sample'](terrain,c.x+dx,c.y+dy) for dx in (-.22,.22) for dy in (-.22,.22)]
            bottom=min(samples)-.08;top=max(samples)+.23
            feet.box((c.x,c.y,(bottom+top)/2),(.43,.43,top-bottom),0)
            feet.box((c.x,c.y,top+.03),(size.x+.025,size.y+.025,.13),1)
            for v in group:
                if abs(v.co.z-lo.z)<.001:v.co.z=top-.035
            support_records.append({'xy':[c.x,c.y],'foot_bottom':bottom,'foot_top':top})
        elif hi.z<=1.01:
            for v in group:
                if abs(v.co.z-lo.z)<.001:
                    v.co.z=min(v.co.z,GEO['sample'](terrain,v.co.x,v.co.y)-.08)
    bm.to_mesh(structural.data);bm.free();feet.finish()
    for name,ob in mapping.items():
        if ob.type!='MESH' or not any(k in name for k in ('Grounded_Foundation','Atelier_Walls')):continue
        bm,groups=PARTS(ob.data)
        for group in groups:
            bottom=min(v.co.z for v in group);top=max(v.co.z for v in group)
            if top>1.05:continue
            for v in group:
                if abs(v.co.z-bottom)<.001:v.co.z=min(v.co.z,GEO['sample'](terrain,v.co.x,v.co.y)-.08)
        bm.to_mesh(ob.data);bm.free()

    # Local approach edits are private; terrain, pond and all five trees stay shared.
    original=next(c for c in source.collection.children if body.name in c.all_objects)
    scene.collection.children.unlink(original);common_map={}
    def needed(o):
        return any(k in o.name for k in ('Connected_Path_0','Path_Lanterns','Flower_',
                   'Ground_Planting','Grass_Accents','Angular_Meadow')) or (
                   o.type=='LIGHT' and (o.location.x+3.7)**2+(o.location.y+1.4)**2<.1)
    common=clone(original,scene.collection,common_map,needed)
    old_path=next(o for name,o in common_map.items() if 'Connected_Path_0' in name)
    path=path_mesh(old_path.users_collection[0],terrain,old_path.data.materials[0])
    old_path_key=next(name for name,o in common_map.items() if o==old_path)
    bpy.data.objects.remove(old_path,do_unlink=True)
    common_map.pop(old_path_key)
    # Move the entrance lantern alongside the new approach, including its light.
    old_xy=Vector((-3.7,-1.4));new_xy=Vector((-5.95,-1.55))
    dz=GEO['sample'](terrain,*new_xy)-GEO['sample'](terrain,*old_xy)
    for name,ob in common_map.items():
        if 'Path_Lanterns' in name:
            RA['components'](ob,lambda c,d:(Vector((c.x,c.y))-old_xy).length<.3,
                             (new_xy.x-old_xy.x,new_xy.y-old_xy.y,dz))
        elif ob.type=='LIGHT':ob.location+=Vector((new_xy.x-old_xy.x,new_xy.y-old_xy.y,dz))
    polygon=[Vector(p) for p in PATH]
    def clear_xy(x,y,margin=.15):
        if -7.4-margin<x<-2.6+margin and .45-margin<y<5.15+margin:return True
        if -5.4-margin<x<-.5+margin and -.63-margin<y<.48+margin:return True
        if GEO['inside']((x,y),polygon):return True
        p=Vector((x,y))
        for a,b in zip(polygon,polygon[1:]+polygon[:1]):
            d=b-a;t=max(0,min(1,(p-a).dot(d)/d.length_squared))
            if (p-a-d*t).length<margin:return True
        return False
    stem=next(o for name,o in common_map.items() if 'Flower_Stems' in name)
    bm,groups=PARTS(stem.data);flower_centres=[]
    for g in groups:
        c=sum((v.co for v in g),Vector())/len(g);flower_centres.append((Vector((c.x,c.y)),clear_xy(c.x,c.y,.22)))
    bm.free();cleared={}
    for name,ob in common_map.items():
        if any(k in name for k in ('Flower_','Ground_Planting','Grass_Accents','Angular_Meadow')):
            if 'Flower_' in name:
                pred=lambda c,d:min(flower_centres,key=lambda a:(a[0]-Vector((c.x,c.y))).length_squared)[1]
            else:pred=lambda c,d:clear_xy(c.x,c.y,max(.12,min(.4,max(d.x,d.y)/2)))
            cleared[name]=RA['components'](ob,pred)

    # Review cameras retain familiar angles; close-ups follow the moved building.
    for old_name in ['RA_House_ThreeQuarter','RA_House_Supports','RA_House_Roof_Access']:
        original_cam=bpy.data.objects[old_name];cam=original_cam.copy();cam.data=original_cam.data.copy()
        cam.name='MH_'+old_name;cam.location+=OFFSET;scene.collection.objects.link(cam)
    data=bpy.data.cameras.new('MH_Pond_Spacing');cam=bpy.data.objects.new('MH_Pond_Spacing',data)
    scene.collection.objects.link(cam);cam.location=(22,-31,24);target=Vector((-1,1,5))
    cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=24;data.clip_end=6500
    scene.camera=bpy.data.objects['MH_RA_House_ThreeQuarter']
    for win in bpy.context.window_manager.windows:win.scene=scene
    bpy.context.view_layer.update()
    # Verify geometry preservation and all tree-to-house clearance after the move.
    assert all(OPT['fingerprint'](bpy.data.objects[n].data)==h for n,h in source_hash.items())
    assert all([list(row) for row in bpy.data.objects[n].matrix_world]==m for n,m in source_matrices.items())
    tree_hits=[];trees=[(o.name,GEO['bvh'](o)) for o in scene.objects if o.type=='MESH' and o.name.startswith('Grove_')]
    for ob in house.all_objects:
        if ob.type!='MESH':continue
        bvh=GEO['bvh'](ob)
        for name,tree in trees:
            if bvh.overlap(tree):tree_hits.append((ob.name,name))
    assert not tree_hits,tree_hits
    bm=bmesh.new();bm.from_mesh(path.data);path_boundary=sum(e.is_boundary for e in bm.edges);bm.free()
    assert path_boundary==0
    report={'scene':SCENE,'blend':str(OUTPUT),'building_translation':list(OFFSET),
            'railings':rail_report,'reseated_supports':support_records,'cleared_plant_parts':cleared,
            'source_scene_unchanged':True,'terrain_pond_trees_unchanged':True,
            'tree_house_intersections':tree_hits,'new_path_boundary_edges':path_boundary,
            'path':'Single closed connected Y-shaped approach to workshop porch and stair entrance.',
            'previous_roof_routes':'All decks, doors and stairs translated together; reviewed entry openings retained.'}
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report


def render():
    scene=bpy.data.scenes[SCENE];folder=ROOT/'renders'/'house-minimal';folder.mkdir(exist_ok=True)
    scene.render.resolution_x=1500;scene.render.resolution_y=1400;scene.render.resolution_percentage=100
    for view,name in [('detail','MH_RA_House_ThreeQuarter'),('pond','MH_Pond_Spacing'),
                      ('roof','MH_RA_House_Roof_Access'),('island','Island_Options_ThreeQuarter')]:
        scene.camera=bpy.data.objects[name];scene.render.filepath=str(folder/f'minimal_{view}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name)


if __name__=='__main__':result=build()

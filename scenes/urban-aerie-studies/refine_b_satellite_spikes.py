"""Offset tapered main point, small attached spurs, and equally fine upper facets."""
from pathlib import Path
import bpy, bmesh, math, random, runpy, json, statistics
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
OPT = runpy.run_path(str(ROOT/'island_profile_options.py'))
JG = runpy.run_path(str(ROOT/'jagged_landform.py'))
FIELD, GEO = JG['FIELD'], JG['GEO']
NOISE = runpy.run_path(str(ROOT/'refine_b_fractures.py'))['noise']
SCENE = 'Island_B_Offset_Spurs'
OUTPUT = ROOT/'island_b_offset_spurs.blend'
ROCK, GRASS, SOIL = {1,2,3}, {0,4,5}, {6,7,8}
SPURS = [(-12.75,2.88,1.55,2.65),(.70,-2.54,1.45,2.15),
         (-9.0,5.1,1.6,2.3),(-7.0,-6.0,1.45,2.5)]


def clamp(x): return max(0., min(1., x))


def free_ground(x,y):
    d=FIELD['distance_to_lines'](x,y,[FIELD['STREAM']])
    pond=math.hypot((x-4)/2.9,(y-4)/2.5)
    protect=max(1-FIELD['smooth'](1.8,2.8,d),1-FIELD['smooth'](1.15,1.55,pond))
    for bounds in [(-7.2,2.3,-.4,7.5),(7.0,12.5,-8.5,-4.2)]:
        protect=max(protect,1-FIELD['smooth'](0,1.1,FIELD['rectangle_distance'](x,y,bounds)))
    protect=max(protect,1-FIELD['smooth'](.9,1.6,FIELD['distance_to_lines'](x,y,FIELD['PATHS'])))
    for tx,ty in FIELD['TREES']+[(2.2,-5.05),(6.36,-5.05)]:
        protect=max(protect,1-FIELD['smooth'](1.1,1.8,math.hypot(x-tx,y-ty)))
    return 1-protect


def refine_rock(mesh):
    protected={i for p in mesh.polygons if p.material_index not in ROCK for i in p.vertices}
    changed=0
    for v in mesh.vertices:
        if v.index in protected or v.co.z >= -4: continue
        x,y,z=v.co
        main=clamp((7-x)/5)
        depth=clamp((-z-4)/12.65)*main
        taper=1-.31*depth**1.25
        v.co.x=-4.8+(x+4.8)*taper-2.6*depth**1.65
        v.co.y=.3+(y-.3)*taper+.8*depth**1.6
        # Compact polygonal protrusions grow out of existing rock vertices.
        bump=0; splay=Vector((0,0,0))
        for sx,sy,radius,length in SPURS:
            a,b=x-sx,y-sy
            q=max(abs(a)/radius,abs(b)/(radius*.86),abs(.7*a+.7*b)/(radius*.92))
            weight=max(0,1-q)**.82
            if length*weight>bump:
                bump=length*weight
                direction=Vector((sx+4.8,sy-.3,0)).normalized()
                splay=direction*(.65*weight)
        v.co+=splay*main
        v.co.z=z-bump*clamp((-z-5)/3)*main
        changed+=1
    mesh.update()
    return changed


def facet_cap(body):
    mesh=body.data
    rim=[mesh.vertices[i].co.copy() for i in body['RimIndices']]
    bm=bmesh.new();bm.from_mesh(mesh)
    rim_set={tuple(round(c,5) for c in p) for p in rim}
    rng=random.Random(45612)
    for _ in range(4):
        edges={e for f in bm.faces if f.material_index not in ROCK and f.calc_area()>.24
               for e in f.edges if e.calc_length()>1.0}
        if not edges: break
        bmesh.ops.subdivide_edges(bm,edges=list(edges),cuts=1,smooth=0,
                                 edge_percents={e:rng.uniform(.39,.61) for e in edges},
                                 use_grid_fill=True,use_single_edge=True)
        bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3],
                              quad_method='BEAUTY',ngon_method='BEAUTY')
    bm.normal_update()
    for v in bm.verts:
        if tuple(round(c,5) for c in v.co) in rim_set: continue
        mats={f.material_index for f in v.link_faces}
        if mats&ROCK: continue
        x,y,z=v.co
        # Keep the entire waterfall lip and channel bank geometry in place.
        if FIELD['distance_to_lines'](x,y,[FIELD['STREAM']]) < 1.55: continue
        if mats&SOIL or v.normal.z<.55:
            direction=Vector((x/16,y/11.5,0)).normalized()
            shift=.17*NOISE(x+.7*z,y-.9*z,.8,132)+.055*NOISE(x,y,.31,87)
            v.co+=direction*shift
            v.co.z+=.065*NOISE(x,y,.7,64)
        elif mats<=GRASS:
            v.co.z+=free_ground(x,y)*(.13*NOISE(x,y,.72,113)+.045*NOISE(x,y,.31,74))
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for f in bm.faces:
        f.smooth=False
        if f.material_index in SOIL:
            p=f.calc_center_median();q=NOISE(p.x+.5*p.z,p.y,.78,144)
            f.material_index=7 if q>.30 else 8 if q<-.30 else 6
    bm.to_mesh(mesh);bm.free();mesh.update()
    lookup={tuple(round(c,5) for c in v.co):v.index for v in mesh.vertices}
    body['RimIndices']=[lookup[tuple(round(c,5) for c in p)] for p in rim]


def face_materials(mesh):
    attribute=mesh.attributes.get('RockFacetValue') or mesh.attributes.new('RockFacetValue','FLOAT','FACE')
    values=[]
    for p in mesh.polygons:
        n=p.normal
        jitter=(((p.index*668265263+374761393)&65535)/32767.5-1)
        if p.material_index in ROCK:
            value=1+.24*(.83*n.x-.48*n.y+.27*n.z)+jitter*.065
        else:
            value=1+.24*(.83*n.x-.48*n.y)+jitter*.13
        values.append(value)
    attribute.data.foreach_set('value',values)
    for index in sorted(GRASS|SOIL):
        base=mesh.materials[index];mat=base.copy();mat.name=f'B4_Faceted_{base.name}'
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
        socket=shader.inputs['Base Color']
        original=socket.links[0].from_socket if socket.links else None
        mult=nodes.new('ShaderNodeMixRGB');mult.blend_type='MULTIPLY';mult.inputs[0].default_value=1
        if original: links.new(original,mult.inputs[1])
        else: mult.inputs[1].default_value=socket.default_value
        attr=nodes.new('ShaderNodeAttribute');attr.attribute_name='RockFacetValue'
        links.new(attr.outputs['Fac'],mult.inputs[2]);links.new(mult.outputs[0],socket)
        mesh.materials[index]=mat


def follow_ground(collection,old_tree,new_tree):
    count=0
    for old in list(collection.all_objects):
        if old.type!='MESH' or not any(t in old.name for t in
          ['Ground_Planting','Grass_Accents','Angular_Meadow','Flower_','Faceted_Flower','Overhanging_Edge_Grass']):
            continue
        new=old.copy();new.data=old.data.copy();new.name='B4_'+old.name
        for c in list(old.users_collection):
            if c==collection or c.name.startswith('B4_'):
                c.objects.unlink(old);c.objects.link(new)
        cache={}
        for v in new.data.vertices:
            key=(round(v.co.x,5),round(v.co.y,5))
            if key not in cache:
                a,b=GEO['sample'](old_tree,*key),GEO['sample'](new_tree,*key)
                cache[key]=b-a if a is not None and b is not None and abs(b-a)<.4 else 0
            v.co.z+=cache[key]
        new.data.update();count+=1
    return count


def stats(mesh):
    out={}
    for name,indices in [('rock',ROCK),('grass',GRASS),('soil',SOIL)]:
        ps=[p for p in mesh.polygons if p.material_index in indices]
        out[name]={'triangles':len(ps),'median_face_area':round(statistics.median(p.area for p in ps),4)}
    return out


def build(replace=False):
    if not replace and (OUTPUT.exists() or bpy.data.scenes.get(SCENE)): raise RuntimeError('Revision already exists')
    source=bpy.data.scenes['Island_B_Spike_Proportions']
    original=next(o for o in source.objects if o.type=='MESH' and 'RimIndices' in o)
    source_hash=OPT['fingerprint'](original.data);before=stats(original.data)
    old_tree=GEO['bvh'](original)
    if replace:
        scene=bpy.data.scenes[SCENE];body=bpy.data.objects['Island_B4_Connected_Terrain']
        body.data=original.data.copy();common=body.users_collection[0]
        body['RimIndices']=list(original['RimIndices'])
        for new in list(common.all_objects):
            if not new.name.startswith('B4_'):continue
            old=bpy.data.objects.get(new.name[3:])
            if old:
                for c in list(new.users_collection):
                    if c==common or c.name.startswith('B4_'):
                        c.objects.unlink(new);c.objects.link(old)
                bpy.data.objects.remove(new)
    else:
        scene=source.copy();scene.name=SCENE
        scene.compositing_node_group=source.compositing_node_group.copy()
        for n in scene.compositing_node_group.nodes:
            if n.type=='R_LAYERS': n.scene=scene
        body=original.copy();body.data=original.data.copy();body.name='Island_B4_Connected_Terrain'
        old=original.users_collection[0];scene.collection.children.unlink(old)
        common=OPT['clone_collection'](old,scene.collection,original,body,'B4_')
    rock_vertices=refine_rock(body.data)
    facet_cap(body);face_materials(body.data)
    props=follow_ground(common,old_tree,GEO['bvh'](body))
    report=OPT['API']['audit_island'](body)
    assert all(p.area>1e-9 for p in body.data.polygons),'Degenerate triangle'
    assert all(len(p.vertices)==3 and not p.use_smooth for p in body.data.polygons)
    assert OPT['fingerprint'](original.data)==source_hash
    tip=min(body.data.vertices,key=lambda v:v.co.z)
    report.update(scene=scene.name,blend=str(OUTPUT),before=before,after=stats(body.data),
                  main_tip=list(tip.co),small_spurs=SPURS,source_unchanged=True,
                  rock_vertices_adjusted=rock_vertices,plant_objects_following_ground=props,
                  all_triangles_flat=True)
    scene.camera=bpy.data.objects['Island_Options_Front']
    scene['IslandOption']='Offset tapered main point with four small attached spurs; fine faceted soil and grass.'
    windows=list(bpy.context.window_manager.windows)
    if windows: windows[0].scene=scene
    (ROOT/'island_b_offset_spurs_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report


def render():
    scene=bpy.data.scenes[SCENE];folder=ROOT/'renders'/'island-b-offset-spurs';folder.mkdir(exist_ok=True)
    paths=[]
    for view,camera in [('front','Island_Options_Front'),('three_quarter','Island_Options_ThreeQuarter'),('side','Island_Options_Side')]:
        scene.camera=bpy.data.objects[camera];scene.render.filepath=str(folder/f'B4_{view}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name);paths.append(scene.render.filepath)
    return paths


if __name__=='__main__':result=build()

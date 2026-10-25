"""B5: stronger asymmetric tips and 1.5x terrain facet density, without smoothing."""
from pathlib import Path
import bpy, bmesh, random, runpy, json
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
B4=runpy.run_path(str(ROOT/'refine_b_satellite_spikes.py'))
OPT,GEO,FIELD=B4['OPT'],B4['GEO'],B4['FIELD']
ROCK,GRASS,SOIL=B4['ROCK'],B4['GRASS'],B4['SOIL']
SCENE='Island_B_Final_Facets'
OUTPUT=ROOT/'island_b_final_facets.blend'


def clamp(x):return max(0.,min(1.,x))


def tips(mesh):
    return {'main':list(min((v for v in mesh.vertices if v.co.x<4),key=lambda v:v.co.z).co),
            'overhang':list(min((v for v in mesh.vertices if v.co.x>7),key=lambda v:v.co.z).co)}


def offset_tips(mesh):
    protected={i for p in mesh.polygons if p.material_index not in ROCK for i in p.vertices}
    for v in mesh.vertices:
        if v.index in protected:continue
        x,y,z=v.co
        small=clamp((x-3)/5)
        main_depth=clamp((-z-4)/12.65)**1.5*(1-small)
        small_depth=clamp((-z-3)/4.35)**1.5*small
        v.co.x+=-2.2*main_depth+1.9*small_depth
        v.co.y+=1.1*main_depth-1.2*small_depth
    mesh.update()


def add_facets(body):
    mesh=body.data
    rim=[mesh.vertices[i].co.copy() for i in body['RimIndices']]
    bm=bmesh.new();bm.from_mesh(mesh);bm.edges.index_update()
    original_coords={tuple(round(c,6) for c in v.co) for v in bm.verts}
    target_added=round(len(bm.faces)*.25)
    chosen=[];counts={}
    # Shared-edge subdivision adds two triangles per edge. Each material region
    # receives 50% more triangles; seams keep their existing welded vertices.
    for name,indices in [('rock',ROCK),('grass',GRASS),('soil',SOIL)]:
        faces=sum(1 for f in bm.faces if f.material_index in indices)
        wanted=round(faces*.25) if name!='soil' else target_added-len(chosen)
        candidates=[e for e in bm.edges if len(e.link_faces)==2 and
                    all(f.material_index in indices for f in e.link_faces)]
        candidates.sort(key=lambda e:(-e.calc_length(),e.index))
        assert len(candidates)>=wanted
        chosen.extend(candidates[:wanted]);counts[name]=wanted
    chosen.sort(key=lambda e:e.index)
    rng=random.Random(95213)
    bmesh.ops.subdivide_edges(bm,edges=chosen,cuts=1,smooth=0,use_grid_fill=True,
                             use_single_edge=True,
                             edge_percents={e:rng.uniform(.43,.57) for e in chosen})
    bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3],
                          quad_method='BEAUTY',ngon_method='BEAUTY')
    bm.normal_update()
    for v in bm.verts:
        if tuple(round(c,6) for c in v.co) in original_coords:continue
        x,y,z=v.co;indices={f.material_index for f in v.link_faces}
        value=B4['NOISE'](x+.37*z,y-.51*z,.53,164)
        if indices<=ROCK:
            amplitude=min(.075,min(e.calc_length() for e in v.link_edges)*.16)
            v.co+=v.normal*(value*amplitude)
        elif FIELD['distance_to_lines'](x,y,[FIELD['STREAM']])>=1.65:
            if indices<=GRASS and v.normal.z>.6:
                v.co.z+=value*.05*B4['free_ground'](x,y)
            else:
                v.co+=v.normal*(value*.04)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for f in bm.faces:f.smooth=False
    bm.to_mesh(mesh);bm.free();mesh.update()
    lookup={tuple(round(c,5) for c in v.co):v.index for v in mesh.vertices}
    body['RimIndices']=[lookup[tuple(round(c,5) for c in p)] for p in rim]
    attr=mesh.attributes['RockFacetValue'];values=[]
    for p in mesh.polygons:
        n=p.normal;jitter=(((p.index*668265263+374761393)&65535)/32767.5-1)
        values.append(1+.24*(.83*n.x-.48*n.y+.27*n.z)+jitter*.065 if p.material_index in ROCK
                      else 1+.24*(.83*n.x-.48*n.y)+jitter*.13)
    attr.data.foreach_set('value',values)
    return counts


def plant_follow(common,old_tree,new_tree):
    owned=set()
    def visit(c):
        owned.add(c)
        for child in c.children:visit(child)
    visit(common);changed=0
    for old in list(common.all_objects):
        if old.type!='MESH' or not any(t in old.name for t in
          ['Ground_Planting','Grass_Accents','Angular_Meadow','Flower_','Faceted_Flower','Overhanging_Edge_Grass']):continue
        new=old.copy();new.data=old.data.copy();new.name='B5_'+old.name
        for c in list(old.users_collection):
            if c in owned:c.objects.unlink(old);c.objects.link(new)
        cache={}
        for v in new.data.vertices:
            key=(round(v.co.x,5),round(v.co.y,5))
            if key not in cache:
                a,b=GEO['sample'](old_tree,*key),GEO['sample'](new_tree,*key)
                cache[key]=b-a if a is not None and b is not None and abs(b-a)<.2 else 0
            v.co.z+=cache[key]
        new.data.update();changed+=1
    return changed


def build(retry=False):
    if OUTPUT.exists() or (bpy.data.scenes.get(SCENE) and not retry):raise RuntimeError('Final facet revision already exists')
    source=bpy.data.scenes['Island_B_Offset_Spurs']
    original=next(o for o in source.objects if o.type=='MESH' and 'RimIndices' in o)
    source_hash=OPT['fingerprint'](original.data)
    before=B4['stats'](original.data);old_tips=tips(original.data);old_tree=GEO['bvh'](original)
    source_props={o.name:OPT['fingerprint'](o.data) for o in original.users_collection[0].all_objects if o.type=='MESH'}
    if retry:
        scene=bpy.data.scenes[SCENE];body=bpy.data.objects['Island_B5_Connected_Terrain']
        body.data=original.data.copy();body['RimIndices']=list(original['RimIndices'])
        common=body.users_collection[0]
    else:
        scene=source.copy();scene.name=SCENE
        scene.compositing_node_group=source.compositing_node_group.copy()
        for n in scene.compositing_node_group.nodes:
            if n.type=='R_LAYERS':n.scene=scene
        body=original.copy();body.data=original.data.copy();body.name='Island_B5_Connected_Terrain'
        old=original.users_collection[0];scene.collection.children.unlink(old)
        common=OPT['clone_collection'](old,scene.collection,original,body,'B5_')
    offset_tips(body.data);split_counts=add_facets(body)
    new_tree=GEO['bvh'](body)
    plant_count=plant_follow(common,old_tree,new_tree)
    report=OPT['API']['audit_island'](body)
    assert len(body.data.polygons)==round(len(original.data.polygons)*1.5)
    assert all(len(p.vertices)==3 and not p.use_smooth and p.area>1e-9 for p in body.data.polygons)
    assert OPT['fingerprint'](original.data)==source_hash
    assert all(OPT['fingerprint'](bpy.data.objects[name].data)==sha for name,sha in source_props.items())
    points=[(-4,3),(-2,0),(2.2,-5.05),(6.36,-5.05),(10,-6),(4,4),(4.8,-10.8)]+FIELD['TREES']
    deltas=[GEO['sample'](new_tree,x,y)-GEO['sample'](old_tree,x,y) for x,y in points]
    assert max(map(abs,deltas))<.001
    report.update(scene=scene.name,blend=str(OUTPUT),before=before,after=B4['stats'](body.data),
                  facet_multiplier=len(body.data.polygons)/len(original.data.polygons),
                  tips_before=old_tips,tips_after=tips(body.data),edge_splits=split_counts,
                  source_terrain_and_props_unchanged=True,all_triangles_flat=True,
                  max_critical_contact_delta=max(map(abs,deltas)),plants_following_ground=plant_count)
    scene.camera=bpy.data.objects['Island_Options_Front']
    scene['IslandOption']='Final B proportions: farther offset tips, 1.5x terrain facets, four smaller attached spurs.'
    windows=list(bpy.context.window_manager.windows)
    if windows:windows[0].scene=scene
    (ROOT/'island_b_final_facets_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report


def render():
    scene=bpy.data.scenes[SCENE];folder=ROOT/'renders'/'island-b-final';folder.mkdir(exist_ok=True)
    paths=[]
    for view,camera in [('front','Island_Options_Front'),('three_quarter','Island_Options_ThreeQuarter'),('side','Island_Options_Side')]:
        scene.camera=bpy.data.objects[camera];scene.render.filepath=str(folder/f'B5_{view}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name);paths.append(scene.render.filepath)
    return paths


if __name__=='__main__':result=build()

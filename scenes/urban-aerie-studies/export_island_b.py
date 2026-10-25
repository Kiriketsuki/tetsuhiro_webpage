"""Web export of Island_B_Rolling_Rim: baked vertex colours, about 24 web materials, a dozen joined meshes and a Draco GLB.

Run it from this folder with background Blender. Never run it inside the open source file.

    blender --factory-startup -b island_b_rolling_rim.blend --python export_island_b.py -- [--replace] [--no-compress]

The script saves a copy first and only ever writes that copy. The source .blend stays untouched.
"""
from pathlib import Path
import sys,json,math,hashlib,shutil,subprocess,tempfile
import bpy,bmesh
import numpy as np
from mathutils import Vector,Matrix,noise
from mathutils.bvhtree import BVHTree

ROOT=Path(__file__).resolve().parent
SITE=ROOT.parent.parent
SOURCE=ROOT/'island_b_rolling_rim.blend'
SCENE='Island_B_Rolling_Rim'
WEB_SCENE='Island_B_Web'
WORK=ROOT/'island_b_web_export.blend'
REPORT=ROOT/'island_b_web_export_report.json'
# The site imports its models from src/assets/models with a ?url import, so the GLBs sit beside island.glb.
MODELS=SITE/'src'/'assets'/'models'
OUT_DESKTOP=MODELS/'island_b.glb'
OUT_LOD1=MODELS/'island_b_lod1.glb'
CITY_JSON=MODELS/'island_b_city.json'
GLTF_TRANSFORM='@gltf-transform/cli@4.5.1'
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []

# Left out on purpose. The city comes back as instanced boxes from CITY_JSON, the sky and the
# waterfall are redone in three.js, and every light becomes emissive or a site light.
DROP=('Distant_City','City_Ground_and_Roads','City_River','Far_Ground_Extension','Cloud_Banks','Cloud_Sea','Atmospheric_Depth','Waterfall_Ribbon')
CITY='LP_SS_Distant_City_Fine_Blocks'
WATERFALL_MATERIAL='Falling_Water'
BAKE_SAMPLES=16
SMOOTH_PASSES=2
BUDGET={'desktop':{'tris':120000,'draws':100},'lod1':{'tris':70000,'draws':100}}

# Web materials. Each source material maps to the first family whose pattern it contains.
# 'vc' families take their albedo from COLOR_0, so their base colour stays white.
WEB=[
    ('glass_edge',   ('Glass_Polished_Edge',),'glass',dict(color=(.62,.78,.76),alpha=.42,rough=.06)),
    ('glass_clear',  ('glass','Glazing','Glass_Clear'),'glass',dict(color=(.78,.88,.92),alpha=.2,rough=.08)),
    ('emit_pad_white',('Pad_Light_White',),'emit',dict(color=(1,.86,.66),strength=7)),
    ('emit_pad_red', ('Pad_Light_Red',),'emit',dict(color=(1,.07,.04),strength=6)),
    ('emit_warm',    ('A_warm',),'emit',dict(color=(1,.53,.18),strength=3.5)),
    ('emit_screen',  ('A_screen',),'emit',dict(color=(.08,.39,.47),strength=1.3)),
    ('emit_ember',   ('Ember','Red_Reading_Light'),'emit',dict(color=(.65,.07,.02),strength=1.2)),
    ('metal_bright', ('Brushed_Steel','Aged_Brass','Chalk_Enamel','TL_Lens'),'vc',dict(rough=.35,metal=.5)),
    ('metal_dark',   ('A_metal',),'vc',dict(rough=.72,metal=.2)),
    ('crown',        ('Crown_Gradient',),'vc',dict(rough=.88)),
    ('bark',         ('Trees_Bark','Hanging_Roots'),'vc',dict(rough=.9)),
    ('flowers',      ('Flower_',),'vc',dict(rough=.8)),
    ('water',        ('Faceted_Water',),'vc',dict(rough=.3)),
    ('soil',         ('Exposed_Soil',),'vc',dict(rough=.96)),
    ('flagstone',    ('Path_Flagstone',),'vc',dict(rough=.85)),
    ('rock',         ('Unbanded_Stone','A_stone','rock_light','Waterline_Stone'),'vc',dict(rough=.88)),
    ('grass',        ('grass','Grass','moss','Moss'),'vc',dict(rough=.92)),
    ('plants',       ('leaf','fern','Reed_','Lily_Pad'),'vc',dict(rough=.88)),
    ('roof',         ('roof_edge','A_roof'),'vc',dict(rough=.8)),
    ('plaster',      ('plaster',),'vc',dict(rough=.85)),
    ('wood',         ('wood',),'vc',dict(rough=.88)),
    ('dark_matte',   ('Charcoal','Pad_Deck','Path_Joint_Bed','Wear_Marks','Chart_Navy'),'vc',dict(rough=.95)),
    ('soft_goods',   ('paper','Linen','Ceramic','Chart_Ink','Cork','Card_','Pin_','Rug_','Windsock','Pad_Paint'),'vc',dict(rough=.9)),
]
ROCK_WEB=('rock',)

# Mesh families. The first rule whose pattern appears in the source object name wins.
# Glass faces always go to Glass. Terrain faces split into Rock and Island by material.
FAMILY=[
    ('Trees',('Grove_',)),
    ('Flowers',('Flower_',)),
    ('Pad',('Sky_Taxi_Pad',)),
    ('Island',('Rolling_Terrain',)),
    ('Turf',('Turf_Lip','Hanging_Roots','Overhanging_Edge_Grass','Angular_Meadow','Ground_Planting','Grass_Accents','Reed','Lily_Pads')),
    ('Water',('Pond_Stream_and_Waterfall',)),
    ('Rock',('Shore_Stones','Stream_Banks','Bridge_Abutments')),
    ('Paths',('Flagstone','Footbridge','Bridge_Beams','Rail_Bearing','Lookout_Access_Step','City_Lookout')),
    ('Props',('SS_TL_','Path_Lanterns','Handmade_Wear')),
    ('House',('DR_','SS_NA_')),
]

# Thinning groups. Each loose part gets a rank from a smooth noise field, so parts leave in
# coherent patches, never as per-part random speckle. 'desktop' and 'lod1' give the fraction each stage keeps.
THIN={1:('Folded_Leaves',dict(desktop=.55,lod1=.08)),2:('Angular_Meadow',dict(desktop=1,lod1=.35)),3:('Ground_Planting',dict(desktop=1,lod1=.5))}
THIN_FREQUENCY=1.1;THIN_SEED=Vector((5.3,1.9,8.1))

CAMERAS=[  # (name, source camera, aim object or None)
    ('Cam_01_Hero','NA_Hero_Wide',None),
    ('Cam_02_Workshop','NA_Corkboard_Close',None),
    ('Cam_03_Telescope','TL_Astronomy_Close','SS_TL_Telescope'),
    ('Cam_04_Bedroom','NA_Bedroom_Close',None),
    ('Cam_05_Pad','NA_Pad_Close',None),
]
ANCHORS={  # name: source object whose world bounding-box centre marks the spot
    'Anchor_Workshop':'SS_NA_Workshop_Project_Corkboard','Anchor_Telescope':'SS_TL_Telescope',
    'Anchor_Bedroom':'SS_NA_Bedroom_Comforts','Anchor_Pad':'SS_NA_Sky_Taxi_Pad.001','Anchor_BBQ':'SS_TL_BBQ_Pit',
    'Anchor_Lookout':'NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001',
}
LIGHT_ANCHORS={'Anchor_Entry_Light':'SS_NA_Entry_Downlight','Anchor_Warm_Rim':'NA_LP_SS_Warm_Horizon','Anchor_Cool_Rim':'NA_Rock_Rim'}
MOON='NA_LP_SS_Cool_Sky_Key';MOON_DISTANCE=80


def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1<<20),b''):h.update(block)
    return h.hexdigest()

def tris(me):return sum(len(p.vertices)-2 for p in me.polygons)

def used_slots(me):return sorted({p.material_index for p in me.polygons})

def principled(m):
    return next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if m and m.use_nodes else None

def web_family(name):
    for fam,pats,kind,_ in WEB:
        if any(p in name for p in pats):return fam
    return None

def mesh_family(name):
    for fam,pats in FAMILY:
        if any(p in name for p in pats):return fam
    return None

def renderable_objects(scene):
    """Returns the objects that render: not hidden, in a render-visible and non-excluded collection."""
    out=set()
    def walk(layer,coll):
        if layer.exclude or coll.hide_render:return
        out.update(o for o in coll.objects if not o.hide_render)
        for child in layer.children:walk(child,child.collection)
    vl=scene.view_layers[0];walk(vl.layer_collection,scene.collection)
    return out

def world_bbox(ob):
    pts=[ob.matrix_world@Vector(c) for c in ob.bound_box]
    lo=Vector(map(min,*pts));hi=Vector(map(max,*pts));return lo,hi

def loose_parts(bm):
    seen=set();parts=[]
    for v in bm.verts:
        if v in seen:continue
        stack=[v];part=[];seen.add(v)
        while stack:
            u=stack.pop();part.append(u)
            for e in u.link_edges:
                w=e.other_vert(u)
                if w not in seen:seen.add(w);stack.append(w)
        parts.append(part)
    return parts

def delete_faces(ob,keep):
    """Deletes every face whose index fails keep(index), with the vertices and slots it leaves unused."""
    bm=bmesh.new();bm.from_mesh(ob.data);bm.faces.ensure_lookup_table()
    gone=[f for f in bm.faces if not keep(f.index)]
    if gone:bmesh.ops.delete(bm,geom=gone,context='FACES')
    bm.to_mesh(ob.data);bm.free();compact_slots(ob.data)
    return len(gone)


# ---- copy -------------------------------------------------------------------------------------

def web_copies(scene,coll):
    """Copies each kept mesh with its modifiers applied and its texture space locked to the source."""
    dg=bpy.context.evaluated_depsgraph_get();keep=renderable_objects(scene);copies=[];dropped=[]
    for ob in sorted(keep,key=lambda o:o.name):
        if ob.type!='MESH':continue
        if any(d in ob.name for d in DROP):
            dropped.append({'object':ob.name,'tris':tris(ob.data)});continue
        me=bpy.data.meshes.new_from_object(ob.evaluated_get(dg),preserve_all_data_layers=True,depsgraph=dg)
        me.name='WEB_'+ob.name
        # Slots are set in place. materials.clear() would reset every face to slot 0.
        for i,s in enumerate(ob.material_slots):
            if i<len(me.materials):me.materials[i]=s.material
            else:me.materials.append(s.material)
        # Generated coordinates drive the crown and rock fields. Thinning must not move them.
        me.use_auto_texspace=False;me.texspace_location=ob.data.texspace_location;me.texspace_size=ob.data.texspace_size
        compact_slots(me)
        copy=bpy.data.objects.new('WEB_'+ob.name,me);copy.matrix_world=ob.matrix_world;coll.objects.link(copy)
        copy['source']=ob.name;copies.append(copy)
    return copies,dropped

def strip_waterfall(copies):
    """Removes the falling-water faces and returns where the waterfall starts and ends."""
    for ob in copies:
        me=ob.data;idx=[i for i,m in enumerate(me.materials) if m and WATERFALL_MATERIAL in m.name]
        if not idx:continue
        pts=[ob.matrix_world@me.vertices[v].co for p in me.polygons if p.material_index in idx for v in p.vertices]
        if not pts:continue
        top=max(p.z for p in pts);bottom=min(p.z for p in pts)
        lip=[p for p in pts if p.z>top-.3];base=[p for p in pts if p.z<bottom+.6]
        removed=delete_faces(ob,lambda i,me=me,idx=idx:me.polygons[i].material_index not in idx)
        return {'object':ob['source'],'faces_removed':removed,
                'Anchor_Waterfall_Top':sum(lip,Vector())/len(lip),'Anchor_Waterfall_Base':sum(base,Vector())/len(base)}
    raise RuntimeError('No falling-water faces found')

def thin_score(c,lo,hi):
    # One smooth noise field plus a lean toward the top of the tree, which catches the moon.
    up=(c.z-lo.z)/max(hi.z-lo.z,1e-4)
    return noise.noise(c*THIN_FREQUENCY+THIN_SEED)+.6*up

def rank_parts(copies,crowns):
    """Stores a per-face thinning group and rank, and deletes leaves buried inside their crown."""
    buried=0
    for ob in copies:
        group=next((g for g,(pat,_) in THIN.items() if pat in ob.name),0)
        me=ob.data
        g_attr=me.attributes.new('web_thin_group','INT','FACE');r_attr=me.attributes.new('web_thin_rank','FLOAT','FACE')
        if not group:
            for a in r_attr.data:a.value=1.0
            continue
        bm=bmesh.new();bm.from_mesh(me);bm.transform(ob.matrix_world);bm.faces.ensure_lookup_table()
        crown=crowns.get(ob.name.replace('Folded_Leaves','Faceted_Crown'))
        parts=loose_parts(bm);lo,hi=world_bbox(ob);scored=[];inside=set()
        for k,part in enumerate(parts):
            c=sum((v.co for v in part),Vector())/len(part);scored.append((thin_score(c,lo,hi),k))
            if crown and all(inside_mesh(crown,v.co) for v in part):inside.add(k)
        order={k:r/len(parts) for r,(s,k) in enumerate(sorted(scored))}
        face_part={}
        for k,part in enumerate(parts):
            for v in part:
                for f in v.link_faces:face_part[f.index]=k
        bm.free()
        for i,a in enumerate(r_attr.data):a.value=order[face_part[i]]
        for a in g_attr.data:a.value=group
        buried+=delete_faces(ob,lambda i:face_part[i] not in inside)
    return buried

def inside_mesh(tree,p):
    hits=0;o=p.copy()
    for _ in range(24):
        hit=tree.ray_cast(o,Vector((0,0,1)))
        if hit[0] is None:break
        hits+=1;o=hit[0]+Vector((0,0,1e-4))
    return hits%2==1

def crown_trees(copies):
    out={}
    for ob in copies:
        if 'Faceted_Crown' in ob.name:
            bm=bmesh.new();bm.from_mesh(ob.data);bm.transform(ob.matrix_world);out[ob.name]=BVHTree.FromBMesh(bm);bm.free()
    return out

def thin(objs,stage):
    """Deletes the parts whose rank falls under the cut for this stage."""
    removed=0
    for ob in objs:
        me=ob.data;g=me.attributes.get('web_thin_group');r=me.attributes.get('web_thin_rank')
        if not g:continue
        gs=[a.value for a in g.data];rs=[a.value for a in r.data]
        cut=lambda i:gs[i] and rs[i]<1-THIN[gs[i]][1][stage]
        removed+=delete_faces(ob,lambda i:not cut(i))
    return removed


# ---- colour bake ------------------------------------------------------------------------------

def bake_kind(m):
    """Returns 'bake' for a colour to bake, 'white' for glass and emissive faces that keep a flat colour."""
    fam=web_family(m.name) if m else None
    if fam is None:raise RuntimeError(f'No web material for {m.name if m else None}')
    return 'bake' if next(k for f,_,k,_ in WEB if f==fam)=='vc' else 'white'

def emission_copy(m):
    """Copies a material and routes its base colour field into an emission shader for the bake."""
    c=m.copy();c.name='BAKE_'+m.name;nt=c.node_tree;b=principled(c)
    out=nt.get_output_node('CYCLES') or next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL')
    em=nt.nodes.new('ShaderNodeEmission');em.inputs['Strength'].default_value=1
    src=b.inputs['Base Color']
    if src.links:nt.links.new(src.links[0].from_socket,em.inputs['Color'])
    else:em.inputs['Color'].default_value=src.default_value
    nt.links.new(em.outputs[0],out.inputs['Surface'])
    return c

def bake_colours(scene,objs):
    swaps={}
    for ob in objs:
        me=ob.data;attr=me.color_attributes.new('Col','BYTE_COLOR','CORNER')
        me.color_attributes.active_color=attr;me.color_attributes.render_color_index=me.color_attributes.find('Col')
        for i,m in enumerate(me.materials):
            if bake_kind(m)=='bake':
                if m.name not in swaps:swaps[m.name]=emission_copy(m)
                me.materials[i]=swaps[m.name]
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=BAKE_SAMPLES
    scene.render.bake.target='VERTEX_COLORS'
    vl=scene.view_layers[0]
    for o in vl.objects:o.select_set(False)
    for o in objs:o.select_set(True)
    vl.objects.active=objs[0]
    with bpy.context.temp_override(scene=scene,view_layer=vl,active_object=objs[0],object=objs[0],
                                   selected_objects=objs,selected_editable_objects=objs):
        bpy.ops.object.bake(type='EMIT',target='VERTEX_COLORS')
    # Put the source materials back so the web remap reads their real names.
    back={v.name:bpy.data.materials[k] for k,v in swaps.items()}
    for ob in objs:
        for i,m in enumerate(ob.data.materials):
            if m and m.name in back:ob.data.materials[i]=back[m.name]
    for c in swaps.values():bpy.data.materials.remove(c)
    return len(swaps)

def settle_colours(ob):
    """Averages the baked colour per vertex and material, then relaxes it over neighbours.

    The bake reads each corner with its own face normal and the painted texture at a single point,
    so neighbouring faces can disagree. Averaging per vertex keeps only the smooth field, and the
    relax passes take out what remains of the texture speckle. Material borders stay sharp."""
    me=ob.data;attr=me.color_attributes['Col'];n=len(me.loops)
    col=np.empty(n*4,np.float32);attr.data.foreach_get('color',col);col=col.reshape(-1,4)
    cv=np.empty(n,np.int64);me.loops.foreach_get('vertex_index',cv)
    np_=len(me.polygons);pm=np.empty(np_,np.int64);ls=np.empty(np_,np.int64);lt=np.empty(np_,np.int64)
    me.polygons.foreach_get('material_index',pm);me.polygons.foreach_get('loop_start',ls);me.polygons.foreach_get('loop_total',lt)
    cm=np.repeat(pm,lt);key=cv*1024+cm
    uk,inv=np.unique(key,return_inverse=True)
    kc=np.zeros((len(uk),3));np.add.at(kc,inv,col[:,:3]);kc/=np.bincount(inv)[:,None]
    nxt=np.arange(n)+1;nxt[ls+lt-1]=ls;a=inv;b=inv[nxt]
    for _ in range(SMOOTH_PASSES):
        acc=np.zeros_like(kc);cnt=np.zeros(len(uk))
        np.add.at(acc,a,kc[b]);np.add.at(acc,b,kc[a]);np.add.at(cnt,a,1);np.add.at(cnt,b,1)
        kc=.5*kc+.5*acc/np.maximum(cnt,1)[:,None]
    out=kc[inv]
    white=np.array([bake_kind(m)=='white' for m in me.materials])
    out[white[cm]]=1.0
    col[:,:3]=out;col[:,3]=1.0;attr.data.foreach_set('color',col.ravel())


# ---- web materials and families ---------------------------------------------------------------

def web_materials():
    mats={}
    for fam,_,kind,p in WEB:
        m=bpy.data.materials.new('web_'+fam);m.use_nodes=True;nt=m.node_tree;b=principled(m)
        b.inputs['Roughness'].default_value=p.get('rough',.5);b.inputs['Metallic'].default_value=p.get('metal',0)
        if kind=='vc':
            vc=nt.nodes.new('ShaderNodeVertexColor');vc.layer_name='Col'
            nt.links.new(vc.outputs['Color'],b.inputs['Base Color'])
        else:
            b.inputs['Base Color'].default_value=(*p['color'],1)
        if kind=='emit':
            b.inputs['Emission Color'].default_value=(*p['color'],1);b.inputs['Emission Strength'].default_value=p['strength']
        if kind=='glass':
            b.inputs['Alpha'].default_value=p['alpha'];m.surface_render_method='BLENDED';m.use_backface_culling=False
        mats[fam]=m
    return mats

def remap_materials(objs,web):
    mapping={}
    for ob in objs:
        me=ob.data
        for i,m in enumerate(me.materials):
            fam=web_family(m.name);mapping[m.name]=fam;me.materials[i]=web[fam]
    return mapping

def compact_slots(me):
    """Merges duplicate material slots and drops unused ones, so one material makes one draw call."""
    used=used_slots(me);order=[];remap={}
    for i in used:
        m=me.materials[i]
        if m not in order:order.append(m)
        remap[i]=order.index(m)
    idx=np.empty(len(me.polygons),np.int32);me.polygons.foreach_get('material_index',idx)
    idx=np.vectorize(remap.get)(idx).astype(np.int32) if len(idx) else idx
    me.materials.clear()
    for m in order:me.materials.append(m)
    me.polygons.foreach_set('material_index',idx);me.update()

def face_family(ob):
    base=mesh_family(ob['source'])
    if base is None:raise RuntimeError(f'No mesh family for {ob["source"]}')
    me=ob.data;names=[web_family(m.name) if not m.name.startswith('web_') else m.name[4:] for m in me.materials]
    out=[]
    for p in me.polygons:
        fam=names[p.material_index]
        if fam.startswith('glass'):out.append('Glass')
        elif base=='Island' and fam in ROCK_WEB:out.append('Rock')
        else:out.append(base)
    return out

def bake_transform(ob):
    """Moves the mesh into world space, so every joined family sits at the origin."""
    m=ob.matrix_world.copy();ob.data.transform(m)
    if m.determinant()<0:ob.data.flip_normals()
    ob.matrix_world=Matrix.Identity(4)

def build_families(scene,objs,coll):
    buckets={}
    for ob in objs:
        fams=face_family(ob);bake_transform(ob)
        for fam in sorted(set(fams)):
            part=ob.copy();part.data=ob.data.copy();coll.objects.link(part)
            delete_faces(part,lambda i,fams=fams,fam=fam:fams[i]==fam)
            buckets.setdefault(fam,[]).append(part)
        me=ob.data;bpy.data.objects.remove(ob);bpy.data.meshes.remove(me)
    out=[]
    for fam,parts in sorted(buckets.items()):
        with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0],active_object=parts[0],object=parts[0],
                                       selected_objects=parts,selected_editable_objects=parts):
            bpy.ops.object.join()
        ob=parts[0];ob.name=fam;ob.data.name=fam;compact_slots(ob.data);out.append(ob)
        # Older colour layers from the source meshes ride along in the join. Only the bake leaves the file.
        for a in [a.name for a in ob.data.color_attributes if a.name!='Col']:ob.data.color_attributes.remove(ob.data.color_attributes[a])
        ob.data.color_attributes.active_color=ob.data.color_attributes['Col']
    return out


# ---- markers ----------------------------------------------------------------------------------

def add_cameras(scene,coll):
    out={}
    for name,src_name,aim in CAMERAS:
        src=bpy.data.objects[src_name];data=src.data.copy();data.name=name
        ob=bpy.data.objects.new(name,data);coll.objects.link(ob);ob.matrix_world=src.matrix_world.copy()
        if data.type=='ORTHO':
            # The site reads camera.fov, so an orthographic review camera turns into a perspective one
            # on the same line of sight, far enough back to frame the same width.
            lo,hi=world_bbox(bpy.data.objects[aim]);target=(lo+hi)/2
            forward=(src.matrix_world.to_3x3()@Vector((0,0,-1))).normalized()
            data.type='PERSP';data.lens=50
            back=data.ortho_scale/2/math.tan(math.atan(data.sensor_width/2/data.lens))
            ob.matrix_world=Matrix.Translation(target-forward*back)@src.matrix_world.to_3x3().to_4x4()
        out[name]={'from':src_name,'location':[round(x,2) for x in ob.matrix_world.translation],'lens':round(data.lens,1)}
    scene.camera=bpy.data.objects[CAMERAS[0][0]]
    return out

def add_anchors(coll,waterfall,city_centre):
    spots={k:sum(world_bbox(bpy.data.objects[v]),Vector())/2 for k,v in ANCHORS.items()}
    spots.update({k:bpy.data.objects[v].matrix_world.translation.copy() for k,v in LIGHT_ANCHORS.items()})
    moon=bpy.data.objects[MOON];spots['Anchor_Moon']=(moon.matrix_world.to_3x3()@Vector((0,0,1))).normalized()*MOON_DISTANCE
    spots['Anchor_Waterfall_Top']=waterfall['Anchor_Waterfall_Top'];spots['Anchor_Waterfall_Base']=waterfall['Anchor_Waterfall_Base']
    spots['Anchor_City']=city_centre
    for name,p in spots.items():
        e=bpy.data.objects.new(name,None);e.empty_display_type='PLAIN_AXES';e.location=p;coll.objects.link(e)
    return {k:[round(x,3) for x in v] for k,v in spots.items()}

def city_boxes():
    """Writes the distant city as box transforms in the GLB frame (glTF Y-up), for instancing."""
    ob=bpy.data.objects[CITY];me=ob.data;mw=ob.matrix_world
    bm=bmesh.new();bm.from_mesh(me);groups={0:'buildings',1:'buildings',2:'windows_warm',3:'windows_cool'};out={}
    for part in loose_parts(bm):
        faces={f for v in part for f in v.link_faces}
        counts={}
        for f in faces:counts[f.material_index]=counts.get(f.material_index,0)+1
        group=groups[max(counts,key=counts.get)]
        pts=[mw@v.co for v in part];lo=Vector(map(min,*pts));hi=Vector(map(max,*pts));c=(lo+hi)/2;s=hi-lo
        out.setdefault(group,[]).append(((c.x,c.z,-c.y),(s.x,s.z,s.y)))
    bm.free()
    data={'note':'Distant city from LP_SS_Distant_City_Fine_Blocks, left out of island_b.glb. Metres, glTF Y-up, '
                 'same frame as island_b.glb. Each box is axis aligned. Instance one unit BoxGeometry per group with '
                 'InstancedMesh: position = centre, scale = size. Groups that share a few sizes store a size table and '
                 'one index per box.','source_tris':tris(me),'groups':{}}
    colours={'buildings':[m.name for m in me.materials[:2]],'windows_warm':me.materials[2].name,'windows_cool':me.materials[3].name}
    for group,boxes in out.items():
        sizes=sorted({tuple(round(x,1) for x in s) for _,s in boxes})
        entry={'count':len(boxes),'source_material':colours[group]}
        if len(sizes)<=64:
            lookup={s:i for i,s in enumerate(sizes)};entry['sizes']=[list(s) for s in sizes]
            entry['boxes']=[v for c,s in boxes for v in (*[round(x,1) for x in c],lookup[tuple(round(x,1) for x in s)])]
            entry['layout']='cx,cy,cz,size_index'
        else:
            entry['boxes']=[round(v,1) for c,s in boxes for v in (*c,*s)];entry['layout']='cx,cy,cz,sx,sy,sz'
        data['groups'][group]=entry
    lo,hi=world_bbox(ob);centre=(lo+hi)/2
    CITY_JSON.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
    return centre,{g:e['count'] for g,e in data['groups'].items()}


# ---- export -----------------------------------------------------------------------------------

def stats(objs):
    rows={ob.name:{'tris':tris(ob.data),'draws':len(used_slots(ob.data)),'materials':[ob.data.materials[i].name for i in used_slots(ob.data)],
                   'smooth_faces':sum(p.use_smooth for p in ob.data.polygons),'custom_normals':ob.data.has_custom_normals} for ob in objs}
    return {'meshes':rows,'tris':sum(r['tris'] for r in rows.values()),'draws':sum(r['draws'] for r in rows.values()),
            'materials':len({m for r in rows.values() for m in r['materials']})}

def export(scene,path):
    with bpy.context.temp_override(scene=scene,view_layer=scene.view_layers[0]):
        bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_active_scene=True,use_selection=False,
            use_visible=False,use_renderable=False,export_cameras=True,export_lights=False,export_extras=False,
            export_yup=True,export_apply=True,export_texcoords=False,export_normals=True,export_tangents=False,
            export_materials='EXPORT',export_vertex_color='ACTIVE',export_all_vertex_colors=False,
            export_active_vertex_color_when_no_material=False,export_attributes=False,export_animations=False,
            export_draco_mesh_compression_enable=False,export_image_format='NONE')
    return path.stat().st_size

def compress(raw,out):
    """Runs gltf-transform: dedup, prune (keeping the empty anchors), then Draco with quantisation.

    Dedup leaves materials alone. It would fold web materials that look alike into one, and the site
    tunes materials by name."""
    npx=shutil.which('npx.cmd') or shutil.which('npx')
    if not npx:return {'error':'npx not found. Run the commands in the report by hand.'}
    tmp=Path(tempfile.mkdtemp(prefix='island_b_'));a=tmp/'dedup.glb';b=tmp/'prune.glb'
    steps=[['dedup',str(raw),str(a),'--materials','false'],['prune',str(a),str(b),'--keep-leaves','true','--keep-attributes','true'],
           ['draco',str(b),str(out),'--method','edgebreaker','--quantize-position','14','--quantize-normal','10','--quantize-color','8']]
    for step in steps:
        r=subprocess.run([npx,'--yes',GLTF_TRANSFORM,*step],capture_output=True,text=True)
        if r.returncode:return {'error':f'{step[0]} failed','stderr':r.stderr[-2000:]}
    shutil.rmtree(tmp,ignore_errors=True)
    return {'bytes':out.stat().st_size,'steps':[s[0] for s in steps]}


def build():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    assert '--replace' in ARGS or not WORK.exists(),f'{WORK.name} exists. Pass --replace to rebuild it.'
    source_hash=sha256(SOURCE)
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK),check_existing=False)
    src=bpy.data.scenes[SCENE]
    scene=bpy.data.scenes.new(WEB_SCENE);coll=bpy.data.collections.new('Island_B_Web_Export');scene.collection.children.link(coll)
    scene.render.resolution_x,scene.render.resolution_y=src.render.resolution_x,src.render.resolution_y
    for w in bpy.context.window_manager.windows:w.scene=scene

    copies,dropped=web_copies(src,coll)
    waterfall=strip_waterfall(copies)
    buried=rank_parts(copies,crown_trees(copies))
    thinned=thin(copies,'desktop')
    swapped=bake_colours(scene,copies)
    for ob in copies:settle_colours(ob)
    mapping=remap_materials(copies,web_materials())
    families=build_families(scene,copies,coll)
    city_centre,city_counts=city_boxes()
    cameras=add_cameras(scene,coll);anchors=add_anchors(coll,waterfall,city_centre)
    desktop=stats(families)

    raw=Path(tempfile.mkdtemp(prefix='island_b_raw_'))
    report={'scene':SCENE,'source':str(SOURCE),'work_copy':str(WORK),'web_scene':WEB_SCENE,
            'dropped_objects':dropped,'dropped_tris':sum(d['tris'] for d in dropped),
            'waterfall_faces_removed':waterfall['faces_removed'],'buried_leaf_faces_removed':buried,'desktop_thinned_faces':thinned,
            'baked_materials':swapped,'material_map':mapping,'source_materials':len(mapping),
            'web_materials':sorted({m for r in desktop['meshes'].values() for m in r['materials']}),
            'cameras':cameras,'anchors':anchors,'city_json':str(CITY_JSON),'city_boxes':city_counts,
            'lights':'none exported. Emissive materials carry windows, lanterns, screens and pad lights.',
            'desktop':desktop,'budget':BUDGET}
    report['desktop']['raw_bytes']=export(scene,raw/'island_b.glb')
    bpy.ops.wm.save_as_mainfile(filepath=str(WORK),check_existing=False)

    # Mobile LOD: no flowers, far fewer leaves, thinner meadow and planting.
    flowers=bpy.data.objects.get('Flowers')
    if flowers:bpy.data.objects.remove(flowers)
    lod=[o for o in coll.objects if o.type=='MESH']
    report['lod1_thinned_faces']=thin(lod,'lod1')
    for ob in lod:compact_slots(ob.data)
    report['lod1']=stats(lod);report['lod1']['raw_bytes']=export(scene,raw/'island_b_lod1.glb')
    if '--no-compress' not in ARGS:
        report['desktop']['glb']=str(OUT_DESKTOP);report['desktop']['compress']=compress(raw/'island_b.glb',OUT_DESKTOP)
        report['lod1']['glb']=str(OUT_LOD1);report['lod1']['compress']=compress(raw/'island_b_lod1.glb',OUT_LOD1)
    report['raw_dir']=str(raw)
    for k in ('desktop','lod1'):
        report[k]['within_budget']=report[k]['tris']<BUDGET[k]['tris'] and report[k]['draws']<BUDGET[k]['draws']
    report['source_untouched']=sha256(SOURCE)==source_hash
    REPORT.write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
    assert report['source_untouched']
    return report

if __name__=='__main__':
    result=build()
    print('EXPORT_DONE',json.dumps({k:{'tris':result[k]['tris'],'draws':result[k]['draws']} for k in ('desktop','lod1')}))

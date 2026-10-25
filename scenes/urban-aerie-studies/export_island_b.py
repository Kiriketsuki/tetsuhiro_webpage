"""Web export of Island_B_Cozy_Interiors: baked vertex colours, about 24 web materials, a dozen joined meshes and a Draco GLB.

Run it from this folder with background Blender. Never run it inside the open source file.

    blender --factory-startup -b island_b_cozy_interiors.blend --python export_island_b.py -- [--replace] [--no-compress]

The painted city layers for the site come from a second mode, which also works on a copy:

    blender --factory-startup -b island_b_cozy_interiors.blend --python export_island_b.py -- --city-layers

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
# The 25 October 2026 export read island_b_rolling_rim.blend. Its work copy and report keep their names.
SOURCE=ROOT/'island_b_cozy_interiors.blend'
SCENE='Island_B_Cozy_Interiors'
WEB_SCENE='Island_B_Web'
WORK=ROOT/'island_b_cozy_web_export.blend'
REPORT=ROOT/'island_b_cozy_web_export_report.json'
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
    ('Interiors',('SS_CI_',)),
    ('House',('DR_','SS_NA_')),
]

# Thinning groups. Each loose part gets a rank from a smooth noise field, so parts leave in
# coherent patches, never as per-part random speckle. 'desktop' and 'lod1' give the fraction each stage keeps.
# The interior detail meshes hold books, tools and small desk items. The mobile GLB drops all of them.
THIN={1:('Folded_Leaves',dict(desktop=.55,lod1=.08)),2:('Angular_Meadow',dict(desktop=1,lod1=.35)),3:('Ground_Planting',dict(desktop=1,lod1=.5)),
      4:('Interior_Detail',dict(desktop=1,lod1=0))}
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
    'Anchor_Bedroom':'SS_CI_Bedroom_Furniture','Anchor_Lounge':'SS_CI_Lounge_Furniture','Anchor_Pad':'SS_NA_Sky_Taxi_Pad.001','Anchor_BBQ':'SS_TL_BBQ_Pit',
    'Anchor_Lookout':'NA_BC_JG_RF_CO_PT_SH_SS_UA_City_Lookout.001',
}
LIGHT_ANCHORS={'Anchor_Entry_Light':'SS_NA_Entry_Downlight','Anchor_Warm_Rim':'NA_LP_SS_Warm_Horizon','Anchor_Cool_Rim':'NA_Rock_Rim'}
MOON='NA_LP_SS_Cool_Sky_Key';MOON_DISTANCE=80
# Anchors on the front face of a board or a pane: (source object, material pattern, world box of
# face centres). Both faces look toward Blender -Y. The empties keep an identity rotation, so their
# local -Y points out of the face, which is local +Z in the glTF frame.
FACE_ANCHORS={
    'Anchor_Corkboard':('SS_NA_Workshop_Project_Corkboard','Cork',None),
    'Anchor_Bedroom_Window':('DR_GE_MH_RA_JG_RF_CO_PT_SS_SH_Recessed_Upper_Glazing',None,((-6.6,-5.0),(1.2,1.9),(8.2,9.8))),
}
# The campfire spot is the grass point with the most open ground around it. Meadow and grass
# accents do not count as obstacles. Every other mesh from z -3 to 9 does, trees and rim lip included.
# The ground at the clear radius must stay within CAMPFIRE_FLAT of the centre, because the lawn rolls.
CAMPFIRE_CLEAR=1.2;CAMPFIRE_FLAT=.2;CAMPFIRE_STEP=.25;CAMPFIRE_SOFT=('Angular_Meadow','Grass_Accents')


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

def face_anchor(name,material,box):
    """Returns the centre and size of the front face of a board or pane that looks toward -Y."""
    ob=bpy.data.objects[name];me=ob.data;M=ob.matrix_world;pts=[]
    for p in me.polygons:
        if material and material not in me.materials[p.material_index].name:continue
        c=M@p.center
        if box and not all(lo<v<hi for v,(lo,hi) in zip(c,box)):continue
        pts+=[M@me.vertices[i].co for i in p.vertices]
    if not pts:raise RuntimeError(f'No face for the anchor on {name}')
    lo=Vector(map(min,*pts));hi=Vector(map(max,*pts))
    return {'at':Vector(((lo.x+hi.x)/2,lo.y,(lo.z+hi.z)/2)),'size':[round(hi.x-lo.x,3),round(hi.z-lo.z,3)],'faces_toward':'-Y Blender, +Z glTF'}

def campfire_anchor(scene):
    """Scans the lawn on a grid and returns the grass point with the most open ground around it."""
    from mathutils.kdtree import KDTree
    objs=[o for o in renderable_objects(scene) if o.type=='MESH' and not any(d in o.name for d in DROP)]
    terrain=next(o for o in objs if 'Rolling_Terrain' in o.name)
    bm=bmesh.new();bm.from_mesh(terrain.data);bm.transform(terrain.matrix_world);bm.faces.ensure_lookup_table()
    tree=BVHTree.FromBMesh(bm);names=[m.name for m in terrain.data.materials]
    pts=[]
    for o in objs:
        if o is terrain or any(s in o.name for s in CAMPFIRE_SOFT):continue
        pts+=[p for p in (o.matrix_world@v.co for v in o.data.vertices) if -3<p.z<9]
    kd=KDTree(len(pts))
    for i,p in enumerate(pts):kd.insert((p.x,p.y,0),i)
    kd.balance();best=None;lo,hi=world_bbox(terrain)
    for i in range(int(lo.x/CAMPFIRE_STEP),int(hi.x/CAMPFIRE_STEP)+1):
        for j in range(int(lo.y/CAMPFIRE_STEP),int(hi.y/CAMPFIRE_STEP)+1):
            x,y=i*CAMPFIRE_STEP,j*CAMPFIRE_STEP
            hit=tree.ray_cast(Vector((x,y,hi.z+5)),Vector((0,0,-1)),hi.z-lo.z+10)
            if hit[0] is None or hit[1].z<.97 or 'rass' not in names[bm.faces[hit[2]].material_index]:continue
            clear=kd.find((x,y,0))[2]
            if clear<CAMPFIRE_CLEAR or best and clear<=best[1]:continue
            ring=[tree.ray_cast(hit[0]+Vector((CAMPFIRE_CLEAR*math.cos(a/8*math.tau),CAMPFIRE_CLEAR*math.sin(a/8*math.tau),5)),Vector((0,0,-1)),10)[0] for a in range(8)]
            if None in ring or max(abs(r.z-hit[0].z) for r in ring)>CAMPFIRE_FLAT:continue
            best=(hit[0],clear,[min(r.z for r in ring),max(r.z for r in ring)])
    bm.free()
    if best is None:raise RuntimeError('No flat lawn spot with enough clear ground')
    return {'at':best[0],'clear_radius':round(best[1],3),'ground_z_at_1_2m':[round(z,3) for z in best[2]]}

def add_anchors(coll,waterfall,city_centre,extra):
    spots={k:sum(world_bbox(bpy.data.objects[v]),Vector())/2 for k,v in ANCHORS.items()}
    spots.update({k:v['at'] for k,v in extra.items()})
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
    details={k:face_anchor(*v) for k,v in FACE_ANCHORS.items()};details['Anchor_Campfire']=campfire_anchor(src)
    cameras=add_cameras(scene,coll);anchors=add_anchors(coll,waterfall,city_centre,details)
    desktop=stats(families)

    raw=Path(tempfile.mkdtemp(prefix='island_b_raw_'))
    report={'scene':SCENE,'source':str(SOURCE),'work_copy':str(WORK),'web_scene':WEB_SCENE,
            'dropped_objects':dropped,'dropped_tris':sum(d['tris'] for d in dropped),
            'waterfall_faces_removed':waterfall['faces_removed'],'buried_leaf_faces_removed':buried,'desktop_thinned_faces':thinned,
            'baked_materials':swapped,'material_map':mapping,'source_materials':len(mapping),
            'web_materials':sorted({m for r in desktop['meshes'].values() for m in r['materials']}),
            'cameras':cameras,'anchors':anchors,'anchor_details':{k:{**v,'at':[round(x,3) for x in v['at']]} for k,v in details.items()},
            'renames':'none. Cam_01 to Cam_05, every earlier Anchor_* and every web_* name are unchanged.','city_json':str(CITY_JSON),'city_boxes':city_counts,
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

# ---- painted city layers ------------------------------------------------------------------------
# The site fakes the distant city with a few pre-blurred images on planes under the island.
# This stage renders them from the city meshes that the GLB leaves out.

CITY_WORK=ROOT/'island_b_city_layers.blend'
CITY_DIR=SITE/'src'/'assets'/'city'
CITY_MANIFEST=CITY_DIR/'city_layers.json'
CITY_OBJECTS=('LP_SS_City_Ground_and_Roads','LP_SS_City_River','LP_SS_Distant_City_Fine_Blocks','NA_LP_SS_Far_Ground_Extension')
CITY_GROUND_Z=-750.0
# The shear leans every wall back by 45 degrees, so a top-down camera sees the south faces and their
# windows. A camera that looks north and down at 45 degrees sees a rooftop exactly where the
# shear paints it on the ground plane.
CITY_SHEAR=1.0
CITY_SAMPLES=32
# Each layer: name, centre (Blender x, y), size in metres, output pixels, blur sigma in output
# pixels, WebP quality, plane height in the three.js frame. Farther layers cover more ground, at
# fewer metres per pixel and with more blur.
CITY_LAYERS=(
    ('far',(0.0,900.0),8000.0,512,3.0,85,-790.0),
    ('mid',(0.0,600.0),2800.0,768,2.0,72,-764.0),
    ('near',(0.0,420.0),1400.0,1024,1.4,76,-750.0),
)
# Window light field. Each window is about a metre, so at these scales it averages away. The
# stage lifts the warm window light and adds a wide soft halo, so the streets read as a carpet
# of light. CITY_GLOW_M is the halo radius in metres. The halo is baked into the image, so the
# site needs no bloom pass for it.
CITY_WINDOW_LIFT=2.0
CITY_GLOW=3.0
CITY_GLOW_M=9.0
# Made-up outer districts on the far layer: their brightness relative to the real city and the
# distance over which they fade. CITY_BUILT is the ground rectangle of the real blocks (Blender x, y).
CITY_SUBURBS=1.6
CITY_SUBURB_FALLOFF_M=3500.0
CITY_BUILT=((-940.0,-460.0),(940.0,1570.0))
# The road slab and the river end in hard rectangles that show at the far scale, so the far
# layer leaves them out. At 15 m per pixel the roads between blocks do not show anyway.
CITY_FAR_HIDE=('LP_SS_City_Ground_and_Roads','LP_SS_City_River')
# The river reads too cyan at night next to the toon island, so the copy darkens it.
CITY_RIVER=('SS_City_River',(0.016,0.04,0.065),0.02)
# The soft clip keeps the bright windows in 8 bits. The site undoes it with -log(1 - v) / gain.
# One fixed gain puts the night ground near the middle of the 8-bit range in every layer.
CITY_GAIN=6.0
MIST=('mist',512,6,70)

def gaussian(px,sigma):
    """Blurs an (H, W, C) array with a separable Gaussian. Edges repeat, so the border stays dark."""
    if sigma<=0:return px
    r=max(1,int(math.ceil(sigma*3)));k=np.exp(-0.5*(np.arange(-r,r+1)/sigma)**2);k/=k.sum()
    for axis in (0,1):
        pad=[(0,0)]*px.ndim;pad[axis]=(r,r);p=np.pad(px,pad,mode='edge');out=np.zeros_like(px)
        n=px.shape[axis]
        for i,w in enumerate(k):out+=w*np.take(p,range(i,i+n),axis=axis)
        px=out
    return px

def window_light(px,metres_per_px):
    """Lifts the warm windows and adds a soft halo around them. Warm windows have far more red
    than blue, and the night ground is the other way round, so red minus blue finds them."""
    warm=np.clip(px[...,0]-px[...,2],0,None)[...,None]*np.array([1.0,0.57,0.22],np.float32)
    halo=gaussian(warm,max(1.2,CITY_GLOW_M/metres_per_px))
    return px+warm*CITY_WINDOW_LIFT+halo*CITY_GLOW

def save_webp(scene,px,path,quality):
    """Writes a linear (H, W, 3) array as an sRGB WebP through the Standard view transform."""
    h,w,_=px.shape;img=bpy.data.images.new(path.stem,w,h,alpha=False,float_buffer=True)
    rgba=np.ones((h,w,4),np.float32);rgba[...,:3]=px;img.pixels.foreach_set(rgba.ravel())
    s=scene.render.image_settings;s.file_format='WEBP';s.color_mode='RGB';s.quality=quality
    img.save_render(str(path),scene=scene);bpy.data.images.remove(img)
    return path.stat().st_size

def city_camera(scene,centre,size,px):
    cam=bpy.data.objects.get('City_Layer_Camera')
    if not cam:
        cam=bpy.data.objects.new('City_Layer_Camera',bpy.data.cameras.new('City_Layer_Camera'));scene.collection.objects.link(cam)
    cam.data.type='ORTHO';cam.data.ortho_scale=size;cam.data.clip_start=1;cam.data.clip_end=2000
    cam.location=(centre[0],centre[1],CITY_GROUND_Z+400);cam.rotation_euler=(0,0,0)
    scene.camera=cam;scene.render.resolution_x=scene.render.resolution_y=px*2;scene.render.resolution_percentage=100

def render_linear(scene,path):
    """Renders the scene to a half-float EXR and returns the pixels at half size, top row first."""
    s=scene.render.image_settings;s.file_format='OPEN_EXR';s.color_depth='16';s.color_mode='RGB'
    scene.render.filepath=str(path)
    with bpy.context.temp_override(scene=scene):bpy.ops.render.render(write_still=True,scene=scene.name)
    img=bpy.data.images.load(str(path));w,h=img.size;px=np.empty(w*h*4,np.float32);img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    px=px.reshape(h,w,4)[...,:3]
    # Box filter 2x2. The windows are about a metre across, so the supersample keeps them as dots.
    return px.reshape(h//2,2,w//2,2,3).mean(axis=(1,3))[::-1]

def layer_rect(layer,lo,hi):
    """Returns the pixel rows and columns of a Blender ground rectangle in one layer image (top row is north)."""
    _,(cx,cy),size,px,*_=layer;mpp=size/px
    c0,c1=int((lo[0]-cx+size/2)/mpp),int((hi[0]-cx+size/2)/mpp)
    r0,r1=int((cy+size/2-hi[1])/mpp),int((cy+size/2-lo[1])/mpp)
    return slice(max(r0,0),min(r1,px)),slice(max(c0,0),min(c1,px))

def suburbs(far,far_layer,mid,mid_layer,seed=3):
    """Fills the far ground with dim copies of the real city light, so lights reach toward the horizon.

    Each copy is the light above the ground level of the built area in the mid render, shrunk to the
    far scale and turned by a random quarter turn. A slow noise field thins the copies out, and their
    weight falls off with distance from the real city."""
    rows,cols=layer_rect(mid_layer,CITY_BUILT[0],CITY_BUILT[1]);crop=mid[rows,cols]
    light=np.clip(crop-np.median(crop.reshape(-1,3),axis=0),0,None)
    scale=(mid_layer[2]/mid_layer[3])/(far_layer[2]/far_layer[3])
    light=gaussian(light,0.5/scale);side=int(min(light.shape[:2])*scale)
    idx=(np.arange(side)/scale).astype(int);tile=light[idx][:,idx]
    rng=np.random.default_rng(seed);px=far.shape[0]
    mask=0.35+0.65*mist_field(px,24,seed=seed+1)
    city_rows,city_cols=layer_rect(far_layer,CITY_BUILT[0],CITY_BUILT[1])
    inside=np.zeros((px,px,1),np.float32);inside[city_rows,city_cols]=1
    keep_out=1-np.clip(gaussian(inside,side*0.12)*1.4,0,1)
    centre=np.array([(city_rows.start+city_rows.stop)/2,(city_cols.start+city_cols.stop)/2])
    metres=far_layer[2]/far_layer[3]
    # Copies overlap by half a tile under a Hann window. The windows sum to one, so no seam shows.
    hann=np.sin(np.pi*(np.arange(side)+0.5)/side)**2;window=(hann[:,None]*hann[None,:])[...,None]
    pad=side;acc=np.zeros((px+2*pad,px+2*pad,3),np.float32);step=side//2
    for r in range(-step,px,step):
        for c in range(-step,px,step):
            d=np.linalg.norm(np.array([r+side/2,c+side/2])-centre)*metres
            piece=np.rot90(tile,rng.integers(4))*window*math.exp(-d/CITY_SUBURB_FALLOFF_M)
            acc[r+pad:r+pad+side,c+pad:c+pad+side]+=piece
    out=far+acc[pad:pad+px,pad:pad+px]*CITY_SUBURBS*mask[...,None]*keep_out
    return out

def mist_field(px,sigma,seed=7):
    """Returns a tileable cloud mask in 0..1. Filtered white noise in the frequency domain wraps by construction."""
    rng=np.random.default_rng(seed);f=np.fft.fftfreq(px)[:,None]**2+np.fft.fftfreq(px)[None,:]**2
    # A Gaussian blur of sigma pixels is exp(-2 pi^2 sigma^2 f^2) in the frequency domain.
    amp=np.where(f>0,1/np.maximum(f,1e-9)**0.9,0)*np.exp(-2*math.pi**2*sigma**2*f)
    n=np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((px,px)))*amp));n=(n-n.mean())/n.std()
    t=np.clip((n+0.5)/2.6,0,1);return t*t*(3-2*t)

def city_layers():
    assert Path(bpy.data.filepath).resolve()==SOURCE.resolve(),bpy.data.filepath
    source_hash=sha256(SOURCE)
    bpy.ops.wm.save_as_mainfile(filepath=str(CITY_WORK),check_existing=False)
    scene=bpy.data.scenes[SCENE];CITY_DIR.mkdir(parents=True,exist_ok=True)
    keep=set(CITY_OBJECTS)
    # Only the sun and the world light the city. The area lights of the island scene light hard
    # rectangles of ground, and those show as boxes once the layers are blurred and laid out.
    for ob in scene.objects:
        ob.hide_render=ob.name not in keep and not (ob.type=='LIGHT' and ob.data.type=='SUN')
        # Sun shadows change precision across an orthographic view and leave light bands on the ground.
        if ob.type=='LIGHT':ob.data.use_shadow=False
    shear=Matrix(((1,0,0,0),(0,1,CITY_SHEAR,-CITY_SHEAR*CITY_GROUND_Z),(0,0,1,0),(0,0,0,1)))
    for name in CITY_OBJECTS:
        ob=bpy.data.objects[name];ob.matrix_world=shear@ob.matrix_world
    river=bpy.data.materials[CITY_RIVER[0]];bsdf=principled(river)
    bsdf.inputs['Base Color'].default_value=(*CITY_RIVER[1],1);bsdf.inputs['Emission Color'].default_value=(*CITY_RIVER[1],1)
    bsdf.inputs['Emission Strength'].default_value=CITY_RIVER[2]
    v=scene.view_settings;v.view_transform='Standard';v.look='None';v.exposure=0;v.gamma=1
    scene.eevee.taa_render_samples=CITY_SAMPLES;scene.render.film_transparent=False
    tmp=Path(tempfile.mkdtemp(prefix='city_layers_'));layers=[]
    renders={}
    for name,centre,size,px,sigma,quality,height in CITY_LAYERS:
        for hidden in CITY_FAR_HIDE:bpy.data.objects[hidden].hide_render=name=='far'
        city_camera(scene,centre,size,px);renders[name]=window_light(render_linear(scene,tmp/f'{name}.exr'),size/px)
    spec={l[0]:l for l in CITY_LAYERS}
    # The bare far ground still shows wide horizontal bands of light. The median of each row is the
    # ground there, because the city covers less than a quarter of each row, so the stage swaps it
    # for one flat ground value.
    far=renders['far'];rows=np.median(far,axis=1,keepdims=True)
    renders['far']=suburbs(far-rows+np.median(rows,axis=0,keepdims=True),spec['far'],renders['mid'],spec['mid'])
    for name,centre,size,px,sigma,quality,height in CITY_LAYERS:
        lin=gaussian(renders[name],sigma)
        peak=float(np.percentile(lin.max(axis=2),99.7));gain=CITY_GAIN
        path=CITY_DIR/f'city_{name}.webp';bytes_=save_webp(scene,1-np.exp(-lin*gain),path,quality)
        layers.append({'name':name,'file':path.name,'centre':[centre[0],height,-centre[1]],'size':size,'px':px,
                       'blur_px':sigma,'metres_per_px':round(size/px,3),'gain':round(gain,4),'peak':round(peak,5),'bytes':bytes_})
    name,px,sigma,quality=MIST;m=mist_field(px,sigma)
    path=CITY_DIR/'city_mist.webp';bytes_=save_webp(scene,np.repeat(m[...,None],3,axis=2)**2.2,path,quality)
    mist={'file':path.name,'px':px,'bytes':bytes_,'tileable':True}
    manifest={'note':'Painted city layers from export_island_b.py --city-layers. Positions are in the GLB frame (metres, Y up). '
                     'Each image is a top-down orthographic render of a sheared city, soft clipped as 1 - exp(-radiance * gain). '
                     'Decode with radiance = -log(1 - v) / gain.','shear':CITY_SHEAR,'layers':layers,'mist':mist,
              'total_bytes':sum(l['bytes'] for l in layers)+mist['bytes']}
    CITY_MANIFEST.write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    shutil.rmtree(tmp,ignore_errors=True)
    manifest['source_untouched']=sha256(SOURCE)==source_hash
    assert manifest['source_untouched']
    return manifest

if __name__=='__main__':
    if '--city-layers' in ARGS:
        result=city_layers()
        print('CITY_LAYERS_DONE',json.dumps({l['name']:l['bytes'] for l in result['layers']}),result['total_bytes'])
    else:
        result=build()
        print('EXPORT_DONE',json.dumps({k:{'tris':result[k]['tris'],'draws':result[k]['draws']} for k in ('desktop','lod1')}))

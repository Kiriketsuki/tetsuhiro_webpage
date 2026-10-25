"""Three reversible rock-shape studies from the saved FracturedRock scene."""
from pathlib import Path
import bpy, bmesh, math, random, json, hashlib, runpy, time
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

ROOT = Path(__file__).resolve().parent
FR = runpy.run_path(str(ROOT / 'fractured_rock.py'))
API = FR['API']
SOURCE = 'UA_B_Atelier_FracturedRock'
OUTPUT = ROOT / 'island_profile_options.blend'
ROCK = {1, 2, 3}

OPTIONS = [
    dict(key='A', name='Broken Wedge', depth=18.2, drift=(-2.0, .7), base=.85,
         seed=64231, amplitude=.15, grooves=.72,
         description='Chunky, irregular wedge with several diagonal breaks and a broad offset base.',
         outlines=[
             [(0,1),(.12,.98),(.25,.92),(.34,.74),(.46,.78),(.53,.58),(.68,.62),(.80,.38),(1,.26)],
             [(0,1),(.17,.98),(.29,.82),(.39,.88),(.60,.59),(.75,.63),(.86,.44),(1,.30)],
             [(0,1),(.18,1.03),(.30,.87),(.38,.94),(.57,.72),(.64,.75),(.85,.44),(1,.29)],
             [(0,1),(.10,.97),(.29,.92),(.42,.65),(.53,.71),(.66,.53),(.80,.59),(1,.27)],
         ]),
    dict(key='B', name='Undercut Shelf', depth=12.6, drift=(-4.0, .7), base=.8,
         seed=78251, amplitude=.14, grooves=.8,
         description='A shallow upper shelf with a pronounced right-hand undercut and an offset hanging core.',
         outlines=[
             [(0,1),(.20,1.01),(.36,.85),(.45,.88),(.54,.51),(.69,.58),(.82,.32),(1,.24)],
             [(0,1),(.30,.97),(.44,.76),(.62,.84),(.75,.52),(1,.30)],
             [(0,1),(.27,1.01),(.45,.91),(.57,.65),(.69,.70),(.85,.45),(1,.24)],
             [(0,1),(.15,.98),(.28,.94),(.38,.64),(.52,.71),(.67,.48),(.78,.55),(1,.29)],
         ]),
    dict(key='C', name='Leaning Shard', depth=21.0, drift=(-6.1, -.4), base=1.2,
         seed=82731, amplitude=.17, grooves=.9,
         description='A taller diagonal rock mass with a single blunt off-centre tip and strong slanted fractures.',
         outlines=[
             [(0,1),(.14,.95),(.27,.98),(.35,.67),(.50,.73),(.64,.41),(.72,.47),(.84,.23),(1,.13)],
             [(0,1),(.20,.94),(.33,.77),(.45,.82),(.60,.57),(.74,.65),(.90,.27),(1,.19)],
             [(0,1),(.14,.98),(.28,.81),(.36,.91),(.54,.69),(.63,.75),(.85,.39),(1,.16)],
             [(0,1),(.18,.95),(.31,.81),(.46,.86),(.58,.59),(.70,.65),(.84,.34),(1,.15)],
         ]),
]


def fingerprint(mesh):
    h = hashlib.sha256()
    for v in mesh.vertices:
        h.update((','.join(f'{c:.6f}' for c in v.co)+';').encode())
    for p in mesh.polygons:
        h.update((str(tuple(p.vertices))+str(p.material_index)).encode())
    return h.hexdigest()


def cap_fingerprint(mesh):
    faces = []
    for p in mesh.polygons:
        if p.material_index not in ROCK:
            faces.append((p.material_index, tuple(sorted(tuple(round(c,5) for c in mesh.vertices[i].co) for i in p.vertices))))
    return hashlib.sha256(repr(sorted(faces)).encode()).hexdigest()


def clone_collection(old, parent, old_body, new_body, prefix):
    new = bpy.data.collections.new(prefix + old.name)
    parent.children.link(new)
    for ob in old.objects:
        new.objects.link(new_body if ob == old_body else ob)
    for child in old.children:
        clone_collection(child, new, old_body, new_body, prefix)
    return new


def remake_rock(body, spec):
    mesh = body.data
    cap_before = cap_fingerprint(mesh)
    rim_positions = [mesh.vertices[i].co.copy() for i in body['RimIndices']]
    bm = bmesh.new(); bm.from_mesh(mesh)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in ROCK], context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    boundary = {v for e in bm.edges if e.is_boundary for v in e.verts}
    if len(boundary) != 48:
        raise RuntimeError(f'Expected the saved 48-vertex soil/rock seam, found {len(boundary)}.')
    start = min(boundary, key=lambda v:math.atan2(v.co.y,v.co.x))
    loop = [start]; last = None; cur = start
    while True:
        nxt = next(e.other_vert(cur) for e in cur.link_edges if e.is_boundary and e.other_vert(cur) != last)
        if nxt == start: break
        loop.append(nxt); last, cur = cur, nxt
        if len(loop)>48: raise RuntimeError('Collar traversal did not close.')
    if sum(a.co.x*b.co.y-b.co.x*a.co.y for a,b in zip(loop,loop[1:]+loop[:1])) < 0:
        loop = [loop[0]]+list(reversed(loop[1:]))
    collar = [v.co.copy() for v in loop]
    rng = random.Random(spec['seed'])
    params=[]; indices={}
    # Parametric distances approximate physical circumference and cliff depth.
    # Isotropic irregular triangles avoid the stretched face-centre fans of the rejected study.
    width = 100.0
    height = spec['depth'] - sum(p.z for p in collar)/48
    def point(u,v):
        key = (round(u/48*width,6),round(v*height,6))
        if key not in indices:
            indices[key]=len(params); params.append(Vector(key))
        return indices[key]
    top=[point(i,0) for i in range(49)]
    edge_steps=42
    right=[point(48,j/edge_steps) for j in range(1,edge_steps)]
    bottom=[point(i,1) for i in range(48,-1,-1)]
    left=[point(0,j/edge_steps) for j in range(edge_steps-1,0,-1)]
    perimeter=top+right+bottom+left
    # Random samples with a small exclusion radius: no repeated rows or columns.
    cell=.32; grid={}; count=0; attempts=0
    target=3100 if spec['key']=='B' else 3900
    while count<target and attempts<target*60:
        attempts+=1
        x,y=rng.uniform(.03,width-.03),rng.uniform(.035,height-.035)
        gx,gy=int(x/cell),int(y/cell)
        if any((x-a)**2+(y-b)**2<cell**2 for dx in (-1,0,1) for dy in (-1,0,1) for a,b in grid.get((gx+dx,gy+dy),[])):
            continue
        grid.setdefault((gx,gy),[]).append((x,y))
        point(x/width*48,y/height); count+=1
    constraints=[]
    faults=[(5.8,-4.6),(16.6,5.2),(28.5,-3.4),(40.2,3.3)]
    for u0,slope in faults:
        line=[point(u0+slope*v,v) for v in [j/28 for j in range(1,28)]]
        constraints.extend(zip(line,line[1:]))
    coords,edges,triangles,*_=delaunay_2d_cdt(params,list(constraints),[perimeter],0,.000001,True)

    def surface(u,v):
        u=u%48; i=int(u); f=u-i
        p=collar[i].lerp(collar[(i+1)%48],f)
        angle=math.atan2(p.y,p.x)%math.tau
        quadrant=angle/(math.pi/2); q=int(quadrant); t=quadrant-q
        radial=FR['interpolate'](spec['outlines'][q%4],v)*(1-t)+FR['interpolate'](spec['outlines'][(q+1)%4],v)*t
        envelope=min(1,v/.055,(1-v)/.05)
        cut=0
        for u0,slope in faults:
            du=(u-(u0+slope*v)+24)%48-24
            cut-=spec['grooves']*max(0,1-abs(du)/1.25)*math.sin(math.pi*v)
        # Triangle-wave displacement gives sharply changing local planes.
        def tri(x): return 1-4*abs((x%1)-.5)
        chips=spec['amplitude']*(.65*tri(u*1.71+v*21.3)+.35*tri(u*2.23-v*17.1))*envelope
        out=Vector((p.x,p.y,0)).normalized()
        driftx,drifty=spec['drift']
        # Shear increases unevenly with depth so there is no central cone.
        shear=v*(.6+.4*v)
        x=p.x*radial+driftx*shear+out.x*(cut+chips)
        y=p.y*radial+drifty*shear+out.y*(cut+chips)
        basal=spec['base']*(.55*tri(angle/math.tau*3+.18)+.45*tri(angle/math.tau*5+.53))
        z=p.z*(1-v)+(-spec['depth']+basal)*v
        z+=.38*math.sin(2*angle+v*4.7)*math.sin(math.pi*v)
        return Vector((x,y,z))

    new_verts={}; spatial={}; base_lookup={}
    for n,coord in enumerate(coords):
        u,v=coord.x/width*48,coord.y/height
        if abs(u-round(u))<1e-5: u=float(round(u))
        if abs(v-1)<1e-5: v=1.0
        if abs(v)<1e-7:
            new_verts[n]=loop[round(u)%48]; continue
        p=surface(u,v); key=tuple(round(c,5) for c in p)
        if key not in spatial: spatial[key]=bm.verts.new(p)
        new_verts[n]=spatial[key]
        if v==1.0: base_lookup[round(u)%48]=new_verts[n]
    rock_faces=[]
    for tri in triangles:
        if len(tri)!=3 or abs((coords[tri[1]]-coords[tri[0]]).cross(coords[tri[2]]-coords[tri[0]]))<1e-7:continue
        vs=[new_verts[i] for i in tri]
        if len(set(vs))<3:continue
        face=bm.faces.new(vs); face.smooth=False
        u=sum(coords[i].x for i in tri)/3/width*48
        v=sum(coords[i].y for i in tri)/3/height
        # Keep the restored scene's stone palette and broad material distribution.
        face.material_index=1+(int((u+v*8)/6)%3)
        rock_faces.append(face)
    base_verts=[]
    for i in range(48):
        base_verts.append(base_lookup[i])
    centre=bm.verts.new((spec['drift'][0]-.3,spec['drift'][1]+.15,-spec['depth']-spec['base']*.9))
    for a,b in zip(base_verts,base_verts[1:]+base_verts[:1]):
        face=bm.faces.new((a,centre,b));face.material_index=3;face.smooth=False
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for f in bm.faces:f.smooth=False
    bm.to_mesh(mesh);bm.free();mesh.update()
    table={tuple(round(c,5) for c in v.co):v.index for v in mesh.vertices}
    body['RimIndices']=[table[tuple(round(c,5) for c in p)] for p in rim_positions]
    assert cap_fingerprint(mesh)==cap_before, 'The existing grass/soil surface changed.'
    topology=API['audit_island'](body)
    topology.update({'rock_triangles':len(rock_faces)+48,'flat_shaded':all(not p.use_smooth for p in mesh.polygons),
                     'cap_unchanged':True,'bottom_z':round(min(v.co.z for v in mesh.vertices),3)})
    return topology


def camera(collection,name,location,target,scale=50):
    data=bpy.data.cameras.new(name)
    ob=bpy.data.objects.new(name,data); collection.objects.link(ob)
    ob.location=location; ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    data.type='ORTHO';data.ortho_scale=scale;data.clip_end=6500
    return ob


def build():
    source=bpy.data.scenes[SOURCE]
    original=next(o for o in source.objects if o.type=='MESH' and 'RimIndices' in o)
    original_hash=fingerprint(original.data)
    if OUTPUT.exists() or bpy.data.scenes.get('Island_A_Broken_Wedge'):
        raise RuntimeError('Options already exist; inspect them before editing.')
    shared_cameras=bpy.data.collections.new('Island_Options_Cameras')
    front=camera(shared_cameras,'Island_Options_Front',(0,-68,-3),(0,0,-3))
    angle=camera(shared_cameras,'Island_Options_ThreeQuarter',(35,-65,15),(0,0,-3),51)
    side=camera(shared_cameras,'Island_Options_Side',(68,0,-3),(0,0,-3))
    reports=[]
    for spec in OPTIONS:
        scene=source.copy();scene.name='Island_'+spec['key']+'_'+spec['name'].replace(' ','_')
        scene.compositing_node_group=source.compositing_node_group.copy()
        for node in scene.compositing_node_group.nodes:
            if node.type=='R_LAYERS':node.scene=scene
        body=original.copy();body.data=original.data.copy();body.name='Island_'+spec['key']+'_Connected_Terrain'
        old=original.users_collection[0]
        scene.collection.children.unlink(old)
        clone_collection(old,scene.collection,original,body,'OPT_'+spec['key']+'_')
        scene.collection.children.link(shared_cameras)
        topology=remake_rock(body,spec)
        scene.camera=front
        scene.render.resolution_x=1500;scene.render.resolution_y=1250;scene.render.resolution_percentage=100
        scene.eevee.taa_render_samples=64
        scene['IslandOption']=spec['description']
        scene['Baseline']=SOURCE
        reports.append({'key':spec['key'],'name':spec['name'],'scene':scene.name,'body':body.name,'description':spec['description'],'audit':topology})
    assert fingerprint(original.data)==original_hash, 'Saved source changed.'
    return save_report(reports,original_hash)


def save_report(reports=None,original_hash=None):
    original=next(o for o in bpy.data.scenes[SOURCE].objects if o.type=='MESH' and 'RimIndices' in o)
    if original_hash is None: original_hash=fingerprint(original.data)
    if reports is None:
        reports=[]
        for spec in OPTIONS:
            scene=bpy.data.scenes['Island_'+spec['key']+'_'+spec['name'].replace(' ','_')]
            body=bpy.data.objects['Island_'+spec['key']+'_Connected_Terrain']
            audit=API['audit_island'](body)
            audit.update({'rock_triangles':sum(p.material_index in ROCK for p in body.data.polygons),
                          'flat_shaded':all(not p.use_smooth for p in body.data.polygons),
                          'cap_unchanged':cap_fingerprint(body.data)==cap_fingerprint(original.data),
                          'bottom_z':round(min(v.co.z for v in body.data.vertices),3)})
            assert audit['cap_unchanged']
            reports.append({'key':spec['key'],'name':spec['name'],'scene':scene.name,'body':body.name,'description':spec['description'],'audit':audit})
    windows=list(bpy.context.window_manager.windows)
    if windows:
        windows[0].scene=bpy.data.scenes[reports[0]['scene']]
        for area in windows[0].screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
    report={'source':SOURCE,'source_unchanged':True,'source_sha256':original_hash,'blend':str(OUTPUT),'options':reports,
            'cameras':{'front':'Island_Options_Front','three_quarter':'Island_Options_ThreeQuarter','side':'Island_Options_Side'}}
    (ROOT/'island_profile_options_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report


def render():
    folder=ROOT/'renders'/'island-options';folder.mkdir(exist_ok=True)
    shots=[('front','Island_Options_Front'),('three_quarter','Island_Options_ThreeQuarter'),('side','Island_Options_Side')]
    rendered=[]
    for spec in OPTIONS:
        scene=bpy.data.scenes['Island_'+spec['key']+'_'+spec['name'].replace(' ','_')]
        for shot,cam in shots:
            scene.camera=bpy.data.objects[cam]
            scene.render.filepath=str(folder/f'{spec["key"]}_{shot}.png')
            t=time.perf_counter();bpy.ops.render.render(write_still=True,scene=scene.name)
            rendered.append({'key':spec['key'],'shot':shot,'image':scene.render.filepath,'seconds':round(time.perf_counter()-t,2)})
        scene.camera=bpy.data.objects['Island_Options_Front']
    (folder/'renders.json').write_text(json.dumps(rendered,indent=2),encoding='utf-8')
    return rendered


if __name__=='__main__':result=build()

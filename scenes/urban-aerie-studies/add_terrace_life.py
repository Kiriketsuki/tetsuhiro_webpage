"""Add a compact rooftop barbecue and an open-sky observing nook, privately."""
from pathlib import Path
import json, math, random, runpy
import bpy
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parent
GE=runpy.run_path(str(ROOT/'refine_house_entry_glass.py'))
API,Batch,GEO,OPT=(GE[k] for k in ('API','Batch','GEO','OPT'))
SCENE='Island_B_Terrace_Life'
OUTPUT=ROOT/'island_b_terrace_life.blend'
REPORT=ROOT/'island_b_terrace_life_report.json'

def cylinder(batch,a,b,radius,mat=0,n=12,radius2=None):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized()
    u=axis.cross(Vector((0,0,1)))
    if u.length<.001:u=axis.cross(Vector((0,1,0)))
    u.normalize();v=axis.cross(u).normalized();r2=radius if radius2 is None else radius2
    rings=[[batch.bm.verts.new(c+r*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v))
            for i in range(n)] for c,r in ((a,radius),(b,r2))]
    faces=[list(reversed(rings[0])),rings[1]]
    faces += [[rings[0][i],rings[0][(i+1)%n],rings[1][(i+1)%n],rings[1][i]] for i in range(n)]
    for face in faces:batch.bm.faces.new(face).material_index=mat

def polygon(batch,coords,mat=0):
    batch.bm.faces.new([batch.bm.verts.new(Vector(p)) for p in coords]).material_index=mat

def build():
    assert not OUTPUT.exists() and bpy.data.scenes.get(SCENE) is None
    source=bpy.context.scene;assert source.name=='Island_B_Glass_Edges_Entry'
    before={o.name:OPT['fingerprint'](o.data) for o in source.objects if o.type=='MESH'}
    scene=source.copy();scene.name=SCENE
    scene.compositing_node_group=source.compositing_node_group.copy()
    for node in scene.compositing_node_group.nodes:
        if node.type=='R_LAYERS':node.scene=scene
    coll=bpy.data.collections.new('TL_Terrace_Life');scene.collection.children.link(coll)
    make=API['BASE']['material']
    mats=[bpy.data.materials['LP_SS_A_metal'],
          make('TL_Brushed_Steel',(.32,.40,.42),.3,metallic=.78),
          make('TL_Chalk_Enamel',(.80,.79,.68),.42),
          bpy.data.materials['LP_SS_A_wood_light'],
          make('TL_Charcoal',(.018,.023,.027),.95),
          make('TL_Lens',(.025,.13,.18),.12,metallic=.7),
          make('TL_Aged_Brass',(.42,.27,.10),.3,metallic=.7),
          make('TL_Ember',(.62,.11,.025),.9,emission=.45),
          make('TL_Chart_Navy',(.025,.06,.10),.9),
          make('TL_Chart_Ink',(.55,.66,.65),.8),
          make('TL_Red_Reading_Light',(.65,.025,.008),.6,emission=.7)]
    # Local grill axis: its open cooking face points east, into the clear deck.
    grill=Batch('TL_BBQ_Pit',coll,mats)
    grate=Batch('TL_Grill_and_Prep_Details',coll,mats)
    base=Vector((-6.38,3.05,10.66));rot=Matrix.Rotation(math.pi/2,4,'Z')
    def p(v):return base+rot.to_3x3()@Vector(v)
    def box(c,d,m=0,rotation=None,batch=grill):batch.box(p(c),d,m,rot@(rotation or Matrix.Identity(4)))
    def beam(a,b,w,m=0,batch=grill):batch.beam(p(a),p(b),w,mat=m)
    def cyl(a,b,r,m=0,n=12,batch=grill):cylinder(batch,p(a),p(b),r,m,n)
    for x in (-.40,.40):
        for y in (-.24,.24):
            beam((x,y,.015),(x,y,.75),.035)
            box((x,y,.013),(.065,.065,.026),4)
    # Tapered steel firebox with actual open top, dark inset and exposed grate.
    box((0,0,.67),(.83,.43,.045))
    lower=[(-.415,-.215,.67),(.415,-.215,.67),(.415,.215,.67),(-.415,.215,.67)]
    upper=[(-.51,-.32,.93),(.51,-.32,.93),(.51,.32,.93),(-.51,.32,.93)]
    for i in range(4):polygon(grill,[p(lower[i]),p(lower[(i+1)%4]),p(upper[(i+1)%4]),p(upper[i])])
    box((0,0,.72),(.78,.39,.025),4)
    rng=random.Random(41)
    for ix in range(6):
        for iy in range(3):
            q=(-.33+ix*.13+rng.uniform(-.02,.02),-.12+iy*.12,.77)
            grate.part('ico',p(q),(.068,.055,.04),7 if (ix+iy)%5==0 else 4)
    for y in (-.285,.285):beam((-.48,y,.935),(.48,y,.935),.021,1,batch=grate)
    for i in range(18):
        x=-.46+i*.054
        cyl((x,-.285,.935),(x,.285,.935),.0085,1,8,batch=grate)
    # Raised angular hood, insulated wood handle and two understated vent slots.
    hinge=Vector((0,.32,.95));tilt=Matrix.Rotation(math.radians(-68),4,'X')
    def hp(q):return hinge+tilt.to_3x3()@Vector(q)
    box(hp((0,-.30,.055)),(1.04,.63,.11),0,tilt)
    box(hp((0,-.30,-.004)),(.94,.53,.015),4,tilt)
    for x in (-.19,.19):beam(hp((x,-.56,.08)),hp((x,-.56,.17)),.023,1)
    beam(hp((-.22,-.56,.17)),hp((.22,-.56,.17)),.038,3)
    for x in (-.15,.15):box(hp((x,-.18,.113)),(.20,.018,.006),4,tilt)
    cyl((-.57,.25,.93),(.57,.25,.93),.022,1)
    box((0,0,.25),(.79,.43,.035))
    box((0,-.252,.54),(.40,.03,.11),1)
    for i in range(5):box((-.14+i*.07,-.27,.54),(.034,.008,.045),4)
    # Prep shelf is at the side; its legs, board and utensils form one compact set.
    box((.88,0,.92),(.65,.59,.045),1,batch=grate)
    for y in (-.23,.23):
        beam((1.15,y,0),(1.15,y,.92),.028,batch=grate)
    box((.87,0,.956),(.43,.37,.025),3,batch=grate)
    beam((.72,-.055,.983),(1.03,.035,.983),.015,1,batch=grate)
    beam((.72,-.03,.983),(1.03,.058,.983),.015,1,batch=grate)
    # Telescope on the exposed west wing of the second-block roof terrace.
    scope=Batch('TL_Telescope',coll,mats);access=Batch('TL_Observing_Stool_and_Chart',coll,mats)
    origin=Vector((-7.65,4.70,7.45));axis=Vector((-.80,.35,.68)).normalized()
    feet=[origin+Vector((-.36,-.30,0)),origin+Vector((.34,-.27,0)),origin+Vector((.02,.43,0))]
    hub=origin+Vector((0,0,.87))
    for foot in feet:
        mid=foot.lerp(hub,.50)
        cylinder(scope,foot+Vector((0,0,.02)),mid,.021,1,8)
        cylinder(scope,mid,hub,.033,0,8)
        scope.box(foot+Vector((0,0,.014)),(.075,.075,.028),4)
        cylinder(scope,foot.lerp(hub,.42),origin+Vector((0,0,.41)),.009,0,8)
    cylinder(scope,origin+Vector((0,0,.81)),origin+Vector((0,0,1.13)),.065,0)
    cylinder(scope,origin+Vector((0,-.085,1.13)),origin+Vector((0,.085,1.13)),.10,0)
    tube=origin+Vector((0,0,1.30))
    cylinder(scope,tube-axis*.44,tube+axis*.42,.13,2,12)
    for t in (-.21,.18):
        cylinder(scope,tube+axis*(t-.027),tube+axis*(t+.027),.144,0,12)
    scope.beam(origin+Vector((0,0,1.08)),tube,.08,mat=0)
    cylinder(scope,tube+axis*.42,tube+axis*.64,.151,2,12)
    cylinder(scope,tube+axis*.637,tube+axis*.655,.158,0,12)
    cylinder(scope,tube+axis*.657,tube+axis*.660,.133,4,12)
    cylinder(scope,tube+axis*.661,tube+axis*.663,.116,5,12)
    cylinder(scope,tube-axis*.44,tube-axis*.57,.071,0,12)
    rear=tube-axis*.57
    cylinder(scope,rear,rear+Vector((0,0,.12)),.046,1,10)
    cylinder(scope,rear+Vector((0,0,.09)),rear+Vector((0,0,.19)),.055,0,10)
    # Small finder scope and brass focus wheel keep the silhouette legible.
    finder=tube+Vector((0,0,.205))
    for t in (-.13,.14):scope.beam(tube+axis*t,finder+axis*t,.022)
    cylinder(scope,finder-axis*.22,finder+axis*.25,.035,2,10)
    cylinder(scope,finder+axis*.25,finder+axis*.27,.041,0,10)
    cylinder(scope,rear+Vector((0,-.06,0)),rear+Vector((0,-.10,0)),.045,6,10)
    seat=Vector((-7.57,3.92,7.45))
    for dx,dy in ((-.13,-.13),(.13,-.13),(0,.14)):
        access.beam(seat+Vector((dx,dy,0)),seat+Vector((dx*.55,dy*.55,.57)),.026)
    cylinder(access,seat+Vector((0,0,.56)),seat+Vector((0,0,.60)),.20,3,10)
    # A wall-side narrow tray leaves the approach clear, with a quiet star chart.
    tray=Vector((-7.19,3.28,8.16))
    access.box(tray,(.25,.53,.026),0)
    access.beam((-7.19,3.28,7.45),(-7.19,3.28,8.15),.028)
    access.box((-7.19,3.28,7.465),(.17,.28,.03),0)
    access.box(tray+Vector((0,0,.018)),(.214,.455,.012),8)
    points=[(-.07,-.13),(-.035,-.04),(.045,-.01),(.072,.09),(-.02,.16)]
    for x,y in points:cylinder(access,tray+Vector((x,y,.025)),tray+Vector((x,y,.027)),.007,9,8)
    for a,b in zip(points,points[1:]):access.beam(tray+Vector((*a,.026)),tray+Vector((*b,.026)),.002,mat=9)
    access.box(tray+Vector((.03,.17,.05)),(.055,.075,.03),0)
    access.box(tray+Vector((.03,.13,.05)),(.035,.006,.018),10)
    objects=[b.finish() for b in (grill,grate,scope,access)]
    for ob in objects:
        API['LP']['grain_uv'](ob)
        for face in ob.data.polygons:face.use_smooth=False
    # Lighting is contained in the new scene, as are all additions and cameras.
    cameras=bpy.data.collections.new('TL_Review_Cameras');scene.collection.children.link(cameras)
    for name,loc,target,scale in [
        ('TL_BBQ_Close',(-3.2,-2,12.8),(-6.30,3.40,11.35),3.7),
        ('TL_Astronomy_Close',(-15,-6,13),(-7.55,4.10,8.35),4.0),
        ('TL_Terraces_Overview',(-19,-25,20),(-4.5,2.9,8.1),15.8)]:
        data=bpy.data.cameras.new(name);cam=bpy.data.objects.new(name,data);cameras.objects.link(cam)
        cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler()
        data.type='ORTHO';data.ortho_scale=scale;data.lens=50
    assert all(OPT['fingerprint'](source.objects[n].data)==h for n,h in before.items())
    scene.camera=bpy.data.objects['TL_Terraces_Overview']
    for win in bpy.context.window_manager.windows:win.scene=scene
    report={'scene':scene.name,'file':str(OUTPUT),'source_preserved':True,
            'objects':[o.name for o in objects],
            'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),
            'grill_floor':10.66,'telescope_floor':7.45,
            'tripod_feet':[list(p) for p in feet],
            'optical_origin':list(tube+axis*.67),'optical_axis':list(axis)}
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report

def validate():
    scene=bpy.data.scenes[SCENE]
    meshes=[o for o in scene.objects if o.type=='MESH' and
            (any('Atelier' in c.name for c in o.users_collection) or o.name.startswith('SS_GE_') or
             o.name.startswith('SS_TL_') or 'RA_' in o.name)]
    trees=[(o.name,GEO['bvh'](o)) for o in meshes]
    routes={
        'second_terrace_approach':[(-1.05,-.07,7.45),(-3.10,-.07,7.45),(-3.10,.75,7.45),
                                    (-7.60,.75,7.45),(-7.60,3.35,7.45)],
        'rooftop_arrival':[(-2.15,5.18,10.66),(-4.10,5.18,10.66),(-5.35,4.0,10.66),(-5.35,3.05,10.66)]}
    collisions=[];gaps=[];rays=0
    for name,points in routes.items():
        for a,b in zip(points,points[1:]):
            a,b=Vector(a),Vector(b);delta=b-a;d=delta.normalized();side=Vector((-d.y,d.x,0))
            for offset in (-.25,0,.25):
                for height in (.15,.45,.85,1.3,1.8):
                    rays+=1
                    for ob,tree in trees:
                        hit,n,i,dist=tree.ray_cast(a+side*offset+Vector((0,0,height)),d,delta.length)
                        if hit is not None:collisions.append([name,ob,list(hit)])
            for i in range(15):
                p=a.lerp(b,i/14)+Vector((0,0,.03))
                if not any(t.ray_cast(p,Vector((0,0,-1)),.075)[0] is not None for n,t in trees):gaps.append([name,list(p)])
    report=json.loads(REPORT.read_text(encoding='utf-8'))
    # Check tripod feet on actual deck and the outward optical axis against the environment.
    deck=GEO['bvh'](bpy.data.objects['GE_MH_SS_RA_Decks_and_Connected_Stair_Treads'])
    contacts=[]
    for p in report['tripod_feet']:
        hit,n,i,d=deck.ray_cast(Vector(p)+Vector((0,0,.04)),Vector((0,0,-1)),.09)
        contacts.append(hit is not None)
    sky=[]
    for ob in scene.objects:
        if ob.type!='MESH' or ob.name.startswith('SS_TL_'):continue
        hit,n,i,d=GEO['bvh'](ob).ray_cast(Vector(report['optical_origin']),Vector(report['optical_axis']),60)
        if hit is not None:sky.append([ob.name,d])
    report['checks']={'route_rays':rays,'route_width':.50,'obstructions':collisions,'floor_gaps':gaps,
                      'tripod_deck_contacts':contacts,'optical_axis_obstructions':sky}
    REPORT.write_text(json.dumps(report,indent=2),encoding='utf-8')
    assert not collisions and not gaps and all(contacts) and not sky,report['checks']
    return report['checks']

def render(preview=False):
    s=bpy.data.scenes[SCENE];out=ROOT/'renders'/'terrace-life';out.mkdir(exist_ok=True)
    s.render.resolution_x=1500;s.render.resolution_y=1300;s.render.resolution_percentage=65 if preview else 100
    s.eevee.taa_render_samples=32 if preview else 96
    for label,cam in [('bbq','TL_BBQ_Close'),('astronomy','TL_Astronomy_Close'),('terraces','TL_Terraces_Overview')]:
        s.camera=bpy.data.objects[cam];s.render.filepath=str(out/f'terrace_{label}.png')
        bpy.ops.render.render(write_still=True,scene=s.name)

if __name__=='__main__':result=build()

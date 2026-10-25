"""Reshape the island top: a promontory under the pad, a gently rolling top and an overhanging grass rim with roots."""
from pathlib import Path
import math,json,random,runpy
import bpy,bmesh
from mathutils import Vector,Matrix,noise
from mathutils.kdtree import KDTree

ROOT=Path(__file__).resolve().parent
NA=runpy.run_path(str(ROOT/'night_arrival.py'))
API,Batch,GEO,OPT,cylinder=NA['API'],NA['Batch'],NA['GEO'],NA['OPT'],NA['cylinder']
PAD,PAD_R,PAD_TOP,PAD_DEPTH=NA['PAD'],NA['PAD_R'],NA['PAD_TOP'],NA['PAD_DEPTH']
SOURCE='Island_B_Night_Arrival'
SCENE='Island_B_Rolling_Rim'
OUTPUT=ROOT/'island_b_rolling_rim.blend'
REPORT=ROOT/'island_b_rolling_rim_report.json'
ISLAND='NA_'+NA['ISLAND']
STORY='NA_Arrival_and_Room_Story'
TERRAIN='NA_Island_B5_Connected_Terrain'
# Only loose ground cover rides the new surface. Every structure keeps its ground exactly.
MOVABLE=('Ground_Planting','Grass_Accents','Angular_Meadow','Overhanging_Edge_Grass','Flower_')
GRASS,SOIL=('grass','Grass'),('Soil',)
CENTRE=Vector((.5,-.75))
ROLL_AMPLITUDE=.6;ROLL_SEED=Vector((3.1,7.7,1.3))
PAD_LIP=.35;PAD_BED=PAD_TOP-PAD_DEPTH-.1
SPILL=Vector((4.5,-11.0))

def clone(source,parent,mapping,share):
    col=bpy.data.collections.new('RR_'+source.name[3:]);parent.children.link(col)
    for old in source.objects:
        if share(old):
            col.objects.link(old);mapping[old.name]=old;continue
        ob=old.copy();ob.name='RR_'+old.name[3:]
        if old.data:ob.data=old.data.copy()
        col.objects.link(ob);mapping[old.name]=ob
    for child in source.children:clone(child,col,mapping,share)
    return col

def smooth(a,b,x):
    t=min(max((x-a)/(b-a),0),1);return t*t*(3-2*t)

def kind(me,p):
    name=me.materials[p.material_index].name
    return 'grass' if any(g in name for g in GRASS) else 'soil' if any(s in name for s in SOIL) else 'rock'

def rim_vertices(me):
    """Returns the indices of vertices that join a grass face to a soil face."""
    kinds=[kind(me,p) for p in me.polygons];touch={}
    for p,k in zip(me.polygons,kinds):
        for v in p.vertices:touch.setdefault(v,set()).add(k)
    return [v for v,s in touch.items() if 'grass' in s and 'soil' in s]

class Reshape:
    """Holds one smooth displacement field so terrain and ground cover move the same way."""
    def __init__(self,terrain,protected):
        me=terrain.data;self.rim=[me.vertices[i].co.copy() for i in rim_vertices(me)]
        bins=[None]*360
        for v in self.rim:
            d=v.xy-CENTRE;b=int(math.degrees(math.atan2(d.y,d.x)))%360
            bins[b]=max(bins[b] or 0,d.length)
        known=[i for i,r in enumerate(bins) if r]
        for i in range(360):
            if bins[i] is None:
                lo=max((k for k in known if k<i),default=known[-1]-360);hi=min((k for k in known if k>i),default=known[0]+360)
                t=(i-lo)/(hi-lo);bins[i]=bins[lo%360]*(1-t)+bins[hi%360]*t
        self.rho=[sum(bins[(i+k)%360] for k in range(-3,4))/7 for i in range(360)]
        # The promontory pushes the rim out until it sits PAD_LIP inside the pad edge, ray by ray from the centre.
        target=[]
        for i in range(360):
            a=math.radians(i+.5);d=Vector((math.cos(a),math.sin(a)));m=PAD-CENTRE;t=m.dot(d)
            h2=(PAD_R-PAD_LIP)**2-(m-d*t).length_squared
            target.append(max(0,t+math.sqrt(h2)-self.rho[i]) if h2>0 else 0)
        self.push=[sum(target[(i+k)%360]*(1-abs(k)/7) for k in range(-6,7))/7 for i in range(360)]
        self.kd=KDTree(len(protected))
        for i,p in enumerate(protected):self.kd.insert((p.x,p.y,0),i)
        self.kd.balance();self.bias=0
        # The raw noise leans negative over this island, so its mean over the open lawn is removed.
        lawn=[]
        for x in range(-16,18):
            for y in range(-12,12):
                p=Vector((x,y,0));d=p.xy-CENTRE
                if d.length<self.lookup(self.rho,math.atan2(d.y,d.x))-1 and self.mask(p)>.5:lawn.append(self.raw(p))
        self.bias=sum(lawn)/len(lawn)

    def raw(self,p):
        q=Vector((p.x,p.y,0))
        return noise.noise(q*.085+ROLL_SEED)+.35*noise.noise(q*.19+ROLL_SEED*2)

    def mask(self,p):
        return smooth(.6,2.8,self.kd.find((p.x,p.y,0))[2])

    def lookup(self,table,angle):
        f=math.degrees(angle)%360;i=int(f);t=f-i
        return table[i]*(1-t)+table[(i+1)%360]*t

    def roll(self,p):
        # Two low octaves of Perlin noise make broad swells, never a per-face value.
        return ROLL_AMPLITUDE*(self.raw(p)-self.bias)*self.mask(p)

    def __call__(self,p):
        d=p.xy-CENTRE;a=math.atan2(d.y,d.x);rho=d.length
        rim=self.lookup(self.rho,a);push=self.lookup(self.push,a)
        out=p.copy()
        if push>1e-4:
            grow=push*smooth(rim-6,rim,rho)*smooth(-5,-.4,p.z)
            out.xy=CENTRE+d.normalized()*(rho+grow)
        out.z+=self.roll(out)*smooth(-2.3,-.2,p.z)
        bed=smooth(PAD_R+.9,PAD_R+.15,(out.xy-PAD).length)
        if bed>0 and out.z>PAD_BED-.4:out.z-=max(0,out.z-PAD_BED)*bed
        return out

def protected_points(scene,island,story):
    pts=[]
    for ob in list(island.all_objects)+list(story.all_objects):
        if ob.type!='MESH' or 'Terrain' in ob.name or any(m in ob.name for m in MOVABLE):continue
        if 'Grove_' in ob.name and 'Trunk' not in ob.name:continue
        top=2.0 if 'Trunk' not in ob.name else ob.matrix_world.translation.z+min(v.co.z for v in ob.data.vertices)+.6
        vs=[ob.matrix_world@v.co for v in ob.data.vertices];vs=[v for v in vs if v.z<top]
        pts+=vs[::max(1,len(vs)//400)]
    # The house footprint, steps and stair tower stand on the ground inside this box.
    for x in range(-17,0):
        for y in range(-4,13):pts.append(Vector((x*.5,y*.5,0)))
    pts+=[Vector((PAD.x+PAD_R*math.cos(a/8),PAD.y+PAD_R*math.sin(a/8),0)) for a in range(50)]
    return pts

def ride(ob,field):
    """Moves each loose part of a ground-cover mesh with the ground under its centre."""
    bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table();seen=set();moved=0
    for v in bm.verts:
        if v in seen:continue
        stack=[v];part=[];seen.add(v)
        while stack:
            u=stack.pop();part.append(u)
            for e in u.link_edges:
                w=e.other_vert(u)
                if w not in seen:seen.add(w);stack.append(w)
        c=sum((ob.matrix_world@u.co for u in part),Vector())/len(part);shift=field(c)-c
        if shift.length>1e-5:
            for u in part:u.co+=ob.matrix_world.inverted().to_3x3()@shift
            moved+=1
    bm.to_mesh(ob.data);bm.free();return moved

def rim_loops(me):
    kinds=[kind(me,p) for p in me.polygons];edges={}
    for p,k in zip(me.polygons,kinds):
        for e in p.edge_keys:edges.setdefault(e,[]).append(k)
    rim=[e for e,k in edges.items() if sorted(k)==['grass','soil']]
    nbr={}
    for a,b in rim:nbr.setdefault(a,[]).append(b);nbr.setdefault(b,[]).append(a)
    loops=[];used=set()
    for start in nbr:
        if start in used:continue
        loop=[start];used.add(start);cur=start
        while True:
            nxt=[n for n in nbr[cur] if n not in used]
            if not nxt:break
            cur=nxt[0];loop.append(cur);used.add(cur)
        if len(loop)>20:loops.append(loop)
    return loops

def lip_and_roots(terrain,coll):
    """Builds a grass lip that spills over the rim, with root clusters hanging under it."""
    me=terrain.data;grass=next(m for m in me.materials if 'LP_SS_A_grass' in m.name)
    roots_mat=API['BASE']['material']('RR_Hanging_Roots',(.17,.115,.08),.92)
    lip=Batch('RR_Overhanging_Turf_Lip',coll,[grass]);roots=Batch('RR_Hanging_Roots',coll,[roots_mat])
    rng=random.Random(41);segments=0;strands=0
    for loop in rim_loops(me):
        pts=[me.vertices[i].co.copy() for i in loop];n=len(pts);s=0;prev=None
        for i in range(n):
            p,a,b=pts[i],pts[i-1],pts[(i+1)%n];s+=(p-a).length
            tangent=(b-a);out=Vector((tangent.y,-tangent.x,0)).normalized()
            if out.xy.dot(p.xy-CENTRE)<0:out=-out
            amount=.5*noise.noise(Vector((s*.32,1.7,0)))+.12
            skip=(p.xy-SPILL).length<3.0 or (p.xy-PAD).length<PAD_R+.3 or amount<0
            if skip:prev=None;continue
            reach=.14+amount*.55;droop=.18+amount*.7
            # The inner edge tucks onto the turf, the outer edge spills, and the fringe hangs in teeth.
            inner=lip.bm.verts.new(p-out*.18+Vector((0,0,.03)))
            edge=lip.bm.verts.new(p+out*reach+Vector((0,0,-droop*.35)))
            tooth=lip.bm.verts.new(p+out*reach*.85+Vector((0,0,-droop*(1.0 if i%2 else .6))))
            if prev:
                pi,pe,pt=prev
                lip.bm.faces.new([pi,inner,edge,pe]);lip.bm.faces.new([pe,edge,tooth]);lip.bm.faces.new([pe,tooth,pt])
                segments+=1
            prev=(inner,edge,tooth)
            if amount>.16 and i%4==0:
                for k in range(rng.choice((2,3,4))):
                    side=Vector((-out.y,out.x,0))*rng.uniform(-.3,.3);length=rng.uniform(.6,1.5)
                    q=p+out*(reach*.6)+side+Vector((0,0,-droop*.5))
                    path=[q,q+out*.16+Vector((0,0,-.3*length)),q+out*.12+side*.3+Vector((0,0,-.65*length)),
                          q+out*.04+side*.5+Vector((0,0,-length))]
                    r=.08
                    for j in range(3):
                        cylinder(roots,path[j],path[j+1],r,0,4,radius2=r*.62);r*=.62
                    strands+=1
    out=[]
    for batch in (lip,roots):
        ob=batch.finish()
        for f in ob.data.polygons:f.use_smooth=False
        out.append(ob)
    # The grass material multiplies by RockFacetValue, so the lip carries a constant 1.0, never a per-face value.
    attr=out[0].data.attributes.new('RockFacetValue','FLOAT','FACE')
    for a in attr.data:a.value=1.0
    return {'lip_segments':segments,'root_strands':strands,'objects':[o.name for o in out]}

def ground_samples(terrain,points):
    tree=GEO['bvh'](terrain);out=[]
    for p in points:
        hit=tree.ray_cast(Vector((p.x,p.y,8)),Vector((0,0,-1)),20)[0];out.append(hit.z if hit else None)
    return out

def topology(me):
    bm=bmesh.new();bm.from_mesh(me)
    r=(sum(1 for e in bm.edges if e.is_boundary),sum(1 for e in bm.edges if not e.is_manifold));bm.free();return r

def build():
    assert not OUTPUT.exists() and bpy.data.scenes.get(SCENE) is None
    source=bpy.context.scene;assert source.name==SOURCE,source.name
    before={o.name:OPT['fingerprint'](o.data) for o in source.objects if o.type=='MESH'}
    scene=source.copy();scene.name=SCENE
    scene.compositing_node_group=source.compositing_node_group.copy()
    for n in scene.compositing_node_group.nodes:
        if n.type=='R_LAYERS':n.scene=scene
    island_map={};story_map={}
    def movable(ob):return ob.name==TERRAIN or any(m in ob.name for m in MOVABLE)
    old=bpy.data.collections[ISLAND];scene.collection.children.unlink(old)
    island=clone(old,scene.collection,island_map,lambda ob:not movable(ob))
    # Story props stay shared. The pad is rebuilt so its posts and struts meet the new ground.
    old=bpy.data.collections[STORY];scene.collection.children.unlink(old)
    story=bpy.data.collections.new('RR_Arrival_and_Room_Story');scene.collection.children.link(story)
    for ob in old.objects:
        if 'Sky_Taxi_Pad' not in ob.name and 'Pad_Glow' not in ob.name:story.objects.link(ob)
    terrain=island_map[TERRAIN];terrain.name='RR_Island_B5_Rolling_Terrain'
    me=terrain.data;topo_before=topology(me)
    guard=protected_points(scene,island,story);field=Reshape(terrain,guard)
    # The pad bed and promontory move the ground under the pad on purpose, and the pad is rebuilt after.
    probe=[p for p in guard[::7] if (p.xy-PAD).length>PAD_R+1.2];z_before=ground_samples(terrain,probe)
    originals=[v.co.copy() for v in me.vertices]
    for v,c in zip(me.vertices,originals):v.co=field(c)
    me.update()
    z_after=ground_samples(terrain,probe)
    drift=[abs(a-b) for a,b in zip(z_before,z_after) if a is not None and b is not None]
    moved={ob.name:ride(ob,field) for ob in island_map.values() if ob.type=='MESH' and ob!=terrain and movable(ob)}
    rim=lip_and_roots(terrain,island)
    alias={k[3:] if k.startswith('NA_') else k:v for k,v in island_map.items()}
    alias[NA['TERRAIN']]=terrain
    pad=NA['arrival_pad'](scene,alias,story)
    shifts=[(field(c)-c) for c in originals]
    report={'scene':SCENE,'file':str(OUTPUT),'source':SOURCE,
            'topology_boundary_nonmanifold':{'before':topo_before,'after':topology(me)},
            'max_promontory_push':round(max(s.xy.length for s in shifts),3),
            'roll_z_range':[round(min(s.z for s in shifts),3),round(max(s.z for s in shifts),3)],
            'protected_ground_drift_max':round(max(drift),4),'protected_samples':len(drift),
            'ground_cover_parts_moved':moved,'rim':rim,'pad':{k:pad[k] for k in ('post_ground_z','strut_rock_hits','cleared_parts')}}
    report['source_preserved']=all(OPT['fingerprint'](source.objects[n].data)==h for n,h in before.items())
    assert report['source_preserved'] and topology(me)==topo_before
    cameras(scene)
    for win in bpy.context.window_manager.windows:win.scene=scene
    REPORT.write_text(json.dumps(report,indent=2,default=str),encoding='utf-8')
    return report

def cameras(scene):
    coll=bpy.data.collections.new('RR_Review_Cameras');scene.collection.children.link(coll)
    specs={'RR_Promontory_Low':((32,-24,-5),(14,-3,-1.5),34,None),'RR_Rim_Close':((-15,-24,2.5),(-9,-8,-.6),36,None),
           'RR_Roots_Close':((-24,-12,-.5),(-15,-4,-1.0),40,None),
           'RR_Skyline_Front':((4,-48,3),(2,0,-1),38,None),'RR_Plan':((.5,-.75,60),(.5,-.75,0),30,38)}
    for name,(loc,aim,lens,ortho) in specs.items():
        data=bpy.data.cameras.new(name);data.lens=lens;data.clip_end=4000
        if ortho:data.type='ORTHO';data.ortho_scale=ortho
        ob=bpy.data.objects.new(name,data);coll.objects.link(ob);ob.location=loc
        ob.rotation_euler=(Vector(aim)-Vector(loc)).to_track_quat('-Z','Y').to_euler() if not ortho else (0,0,0)
    scene.camera=bpy.data.objects['NA_Arrival_ThreeQuarter']

def save():
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)

def render(preview=False,only=None):
    scene=bpy.data.scenes[SCENE];out=ROOT/'renders'/'rolling-rim';out.mkdir(parents=True,exist_ok=True)
    scene.render.resolution_x=1500;scene.render.resolution_y=1250;scene.render.resolution_percentage=50 if preview else 100
    scene.eevee.taa_render_samples=32 if preview else 96
    names=only or [o.name for o in bpy.data.collections['RR_Review_Cameras'].objects]+['NA_Arrival_ThreeQuarter','NA_Pad_Close','NA_Arrival_Low']
    for cam in names:
        scene.camera=bpy.data.objects[cam];scene.render.filepath=str(out/f'{cam.lower()}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name)
    scene.eevee.taa_render_samples=96;scene.render.resolution_percentage=100;scene.camera=bpy.data.objects['NA_Arrival_ThreeQuarter']

if __name__=='__main__':result=build()

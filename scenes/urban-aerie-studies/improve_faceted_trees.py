"""Distinct branching grove with angular leaf pads and folded foliage."""
from pathlib import Path
import bpy,bmesh,math,random,runpy,json
from mathutils import Vector,Matrix

ROOT=Path(__file__).resolve().parent
BASE=runpy.run_path(str(ROOT/'finalize_b_island.py'))
OPT,GEO=BASE['OPT'],BASE['GEO']
SCENE='Island_B_Refined_Trees'
OUTPUT=ROOT/'island_b_refined_trees.blend'
TREE_KEYS=('Tree_Branches','Tree_Canopies','Faceted_Crown_Sprays')
SPECS=[(-11,5.5,6.7,2.45,.29,17),(-12,1,4.65,2.1,.24,38),
       (-8.8,8.5,5.75,2.15,.25,67),(9,6,5.5,2.25,.26,91),
       (11,1.5,4.8,2.2,.245,124)]


class Geometry:
    def __init__(self):self.vertices=[];self.faces=[];self.mats=[]
    def face(self,indices,mat):self.faces.append(tuple(indices));self.mats.append(mat)
    def obj(self,name,collection,materials):
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(self.vertices,[],self.faces);mesh.update()
        obj=bpy.data.objects.new(name,mesh);collection.objects.link(obj)
        for mat in materials:mesh.materials.append(mat)
        for p,i in zip(mesh.polygons,self.mats):p.material_index=i;p.use_smooth=False
        bm=bmesh.new();bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm,faces=list(bm.faces))
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
        bm.to_mesh(mesh);bm.free();mesh.update()
        return obj


def materials():
    if all(bpy.data.materials.get(f'Trees_Leaf_{i}') for i in range(5)) and all(bpy.data.materials.get(f'Trees_Bark_{i}') for i in range(3)):
        return [bpy.data.materials[f'Trees_Leaf_{i}'] for i in range(5)],[bpy.data.materials[f'Trees_Bark_{i}'] for i in range(3)]
    foliage=[]
    palette=[(.057,.139,.091),(.104,.235,.133),(.156,.300,.151),
             (.218,.353,.158),(.285,.375,.158)]
    painted=bpy.data.images.get('LP_Painted_leaf')
    for i,color in enumerate(palette):
        mat=bpy.data.materials.new(f'Trees_Leaf_{i}');mat.diffuse_color=(*color,1);mat.use_nodes=True
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        p=nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
        p.inputs['Roughness'].default_value=.88;p.inputs['Specular IOR Level'].default_value=.16
        if painted:
            tex=nodes.new('ShaderNodeTexImage');tex.image=painted;tex.projection='BOX';tex.projection_blend=.1
            tc=nodes.new('ShaderNodeTexCoord');scale=nodes.new('ShaderNodeVectorMath');scale.operation='SCALE'
            scale.inputs['Scale'].default_value=.4;links.new(tc.outputs['Object'],scale.inputs[0]);links.new(scale.outputs[0],tex.inputs[0])
            mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=.23
            mix.inputs[1].default_value=(*color,1);links.new(tex.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],p.inputs['Base Color'])
        foliage.append(mat)
    bark=[]
    for i,gain in enumerate((.75,1.,1.28)):
        mat=bpy.data.materials['LP_SS_A_wood'].copy();mat.name=f'Trees_Bark_{i}'
        nodes,links=mat.node_tree.nodes,mat.node_tree.links;p=nodes.get('Principled BSDF');socket=p.inputs['Base Color']
        src=socket.links[0].from_socket if socket.links else None
        mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
        mix.inputs[2].default_value=(gain,gain,gain,1)
        if src:links.new(src,mix.inputs[1])
        else:mix.inputs[1].default_value=socket.default_value
        links.new(mix.outputs[0],socket);bark.append(mat)
    return foliage,bark


def tube(geo,points,radii,rng,sides=7):
    base=len(geo.vertices)
    phase=rng.uniform(0,math.tau)
    for k,(p,r) in enumerate(zip(points,radii)):
        axis=(points[min(k+1,len(points)-1)]-points[max(0,k-1)]).normalized()
        u=axis.cross(Vector((0,1,0))).normalized();v=axis.cross(u).normalized()
        for j in range(sides):
            a=phase+math.tau*j/sides
            q=p+(u*math.cos(a)+v*math.sin(a))*r
            geo.vertices.append(tuple(q))
    geo.face([base+j for j in reversed(range(sides))],0)
    for k in range(len(points)-1):
        for j in range(sides):
            a=base+k*sides+j;b=base+k*sides+(j+1)%sides
            geo.face([a,b,b+sides,a+sides],2 if j in (1,2) else 0 if j==5 else 1)
    end=base+(len(points)-1)*sides;geo.face([end+j for j in range(sides)],1)


def leaf(geo,p,u,v,n,length,width,mat):
    base=len(geo.vertices)
    geo.vertices.extend(tuple(q) for q in [p+n*length*.13,p+u*length,
                                         p+v*width,p-u*length*.8,p-v*width])
    for a,b in ((1,2),(2,3),(3,4),(4,1)):geo.face((base,base+a,base+b),mat)


def canopy(cages,leaves,center,radii,angle,rng,tone):
    """Irregular convex wedge, populated by flat folded leaves on its facets."""
    points=[];rotation=Matrix.Rotation(angle,3,'Z')
    for row,(z,scale) in enumerate([(-.38,.74),(.18,1.),(.65,.52)]):
        count=7 if row<2 else 4
        for j in range(count):
            a=math.tau*j/count+row*.39+rng.uniform(-.15,.15)
            p=Vector((math.cos(a)*scale*rng.uniform(.85,1.15),
                      math.sin(a)*scale*rng.uniform(.83,1.16),z+rng.uniform(-.20,.20)))
            p=Vector(tuple(p[i]*radii[i] for i in range(3)))
            points.append(center+rotation@p)
    bm=bmesh.new();vs=[bm.verts.new(p) for p in points]
    bmesh.ops.convex_hull(bm,input=vs,use_existing_faces=False)
    bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    bm.verts.ensure_lookup_table();bm.verts.index_update()
    base=len(cages.vertices);cages.vertices.extend(tuple(center+(v.co-center)*.88) for v in bm.verts)
    weights=[];tris=[]
    for f in bm.faces:
        value=(2 if f.normal.z>.25 else 1)+tone
        value=max(0,min(4,value))
        cages.face([base+v.index for v in f.verts],value)
        tris.append(([v.co.copy() for v in f.verts],f.normal.copy()))
        weights.append(f.calc_area()*(.85 if f.normal.z<-.3 else 1.6))
    for _ in range(int(175*radii[0]*radii[1])):
        coords,n=rng.choices(tris,weights=weights)[0]
        a,b=rng.random(),rng.random()
        if a+b>1:a,b=1-a,1-b
        p=coords[0]*(1-a-b)+coords[1]*a+coords[2]*b+n*rng.uniform(-.015,.17)
        normal=(n*.50+Vector((rng.uniform(-.2,.2),rng.uniform(-.2,.2),.6))).normalized()
        u=normal.cross(Vector((0,1,0))).normalized();v=normal.cross(u).normalized()
        rot=rng.uniform(0,math.tau);u,v=u*math.cos(rot)+v*math.sin(rot),v*math.cos(rot)-u*math.sin(rot)
        length=rng.uniform(.13,.24)
        value=rng.choices([0,1,2,3,4],[1,4,5,3,1 if tone else .35])[0]
        leaf(leaves,p,u,v,normal,length,length*rng.uniform(.38,.55),value)
    bm.free()


def make_tree(index,spec,collection,terrain,foliage,bark):
    x,y,h,spread,radius,seed=spec;rng=random.Random(seed+8841)
    ground=GEO['sample'](terrain,x,y);base=Vector((x,y,ground-.10))
    trunk,clusters,sprays=Geometry(),Geometry(),Geometry()
    wind=Vector((-.38 if x<0 else .28,-.13,0))
    p0=base
    p1=base+Vector((rng.uniform(-.12,.12),rng.uniform(-.12,.12),h*.23))
    p2=base+wind*.8+Vector((rng.uniform(-.15,.15),rng.uniform(-.15,.15),h*.46))
    p3=base+wind*1.4+Vector((rng.uniform(-.12,.12),rng.uniform(-.12,.12),h*.68))
    p4=base+wind*1.8+Vector((-.12,.05,h*.91))
    tube(trunk,[p0,p1,p2,p3,p4],[radius*1.55,radius,radius*.81,radius*.52,.055],rng)
    # Angular roots overlap the buried trunk and end within the existing ground.
    for j in range(5):
        angle=j*math.tau/5+rng.uniform(-.20,.20);reach=rng.uniform(.65,1.02)
        q=base+Vector((math.cos(angle)*reach,math.sin(angle)*reach,0))
        z=GEO['sample'](terrain,q.x,q.y);q.z=(z if z is not None else ground)-.045
        start=base+Vector((0,0,.4))
        mid=start.lerp(q,.58);mid.z=max(q.z+.06,mid.z-.10)
        tube(trunk,[start,mid,q],[radius*.70,.10,.022],rng,6)
    centers=[]
    # Uneven heights and directions keep the crowns from forming repeated tiers.
    for j,(t,az) in enumerate([(0.40,.10),(.52,2.45),(.61,4.65),(.72,1.55),(.78,3.50)]):
        az+=rng.uniform(-.5,.5)+seed*.07
        start=(p1.lerp(p2,(t-.23)/.23) if t<.46 else
               p2.lerp(p3,(t-.46)/.22) if t<.68 else p3.lerp(p4,(t-.68)/.23))
        direction=Vector((math.cos(az),math.sin(az),0))
        extent=spread*rng.uniform(.64,.96)*(1.05-.20*t)
        tip=base+wind+direction*extent+Vector((0,0,h*(t+.10)+rng.uniform(-.15,.20)))
        bend=start.lerp(tip,.57)+Vector((0,0,-.12))
        tube(trunk,[start,bend,tip],[radius*(.57-.13*t),.075,.022],rng,6)
        for k in range(2):
            split=az+(-.62 if k==0 else .65)+rng.uniform(-.18,.18)
            step=Vector((math.cos(split),math.sin(split),0))*rng.uniform(.48,.85)
            end=tip+step+Vector((0,0,rng.uniform(.24,.54)))
            tube(trunk,[bend.lerp(tip,.78),tip,end],[.052,.033,.008],rng,5)
            c=end+Vector((0,0,.13));r=rng.uniform(.78,1.11)
            centers.append((c,(r,r*rng.uniform(.68,.98),rng.uniform(.53,.86)),split,j%3==0))
        # A smaller inner cluster gives depth but leaves the fork visible below.
        if j in (0,2,4):
            c=bend.lerp(tip,.67)+Vector((0,0,.33))
            centers.append((c,(.78,.61,.62),az,0))
    centers.extend([(p4+Vector((-.18,.02,.18)),(1.0,.83,.78),.3,1),
                    (p3+Vector((.35,-.38,.48)),(.83,.66,.66),1.5,0)])
    subclusters=0
    for c,radii,angle,tone in centers:
        if x<0 and c.x>-7.6 and c.y<8.1:c.x=-7.6
        # Several smaller lobes replace each solid pad; varied depth keeps the
        # outline broken and lets folded leaves bridge across the canopy cores.
        rotation=Matrix.Rotation(angle,3,'Z')
        for dx,dy,dz,scale in [(-.34,.04,.08,.69),(.29,.19,.22,.70),(.09,-.31,-.10,.63)]:
            q=c+rotation@Vector((dx*radii[0],dy*radii[1],dz))
            r=(radii[0]*scale,radii[1]*scale,radii[2]*rng.uniform(.78,.96))
            canopy(clusters,sprays,q,r,angle+rng.uniform(-.6,.6),rng,tone)
            subclusters+=1
    objects=[trunk.obj(f'Grove_{index:02d}_Angular_Trunk',collection,bark),
             clusters.obj(f'Grove_{index:02d}_Faceted_Crown',collection,foliage),
             sprays.obj(f'Grove_{index:02d}_Folded_Leaves',collection,foliage)]
    for obj in objects:obj['Tree_Anchor']=(x,y,ground);obj['Tree_Seed']=seed
    return {'anchor':[x,y,ground],'crown_clusters':subclusters,'objects':[o.name for o in objects],
            'triangles':sum(len(o.data.polygons) for o in objects),
            'height':max(v.co.z for o in objects for v in o.data.vertices)-ground}


def copy_without_trees(old,parent):
    c=bpy.data.collections.new('Trees_'+old.name);parent.children.link(c)
    for obj in old.objects:
        if not any(k in obj.name for k in TREE_KEYS):c.objects.link(obj)
    for child in old.children:copy_without_trees(child,c)
    return c


def build():
    if OUTPUT.exists() or bpy.data.scenes.get(SCENE):raise RuntimeError('Tree revision already exists')
    source=bpy.data.scenes['Island_B_Final_Facets']
    body=next(o for o in source.objects if o.type=='MESH' and 'RimIndices' in o)
    original=next(c for c in source.collection.children if body.name in c.all_objects)
    source_hash={o.name:OPT['fingerprint'](o.data) for o in source.objects if o.type=='MESH'}
    scene=source.copy();scene.name=SCENE
    scene.compositing_node_group=source.compositing_node_group.copy()
    for n in scene.compositing_node_group.nodes:
        if n.type=='R_LAYERS':n.scene=scene
    scene.collection.children.unlink(original);common=copy_without_trees(original,scene.collection)
    grove=bpy.data.collections.new('Refined_Faceted_Grove');common.children.link(grove)
    foliage,bark=materials();terrain=GEO['bvh'](body)
    trees=[make_tree(i,spec,grove,terrain,foliage,bark) for i,spec in enumerate(SPECS,1)]
    assert all(OPT['fingerprint'](bpy.data.objects[name].data)==sha for name,sha in source_hash.items())
    assert all(not p.use_smooth and p.area>1e-10 for o in grove.objects for p in o.data.polygons)
    for name,loc,target,scale in [('Grove_Left_Detail',(-27,-23,13),(-10.3,4,4.7),15),
                                  ('Grove_Right_Detail',(25,-21,12),(10,3.4,3.5),12)]:
        data=bpy.data.cameras.new(name);camera=bpy.data.objects.new(name,data);scene.collection.objects.link(camera)
        camera.location=loc;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler()
        data.type='ORTHO';data.ortho_scale=scale;data.clip_end=6500
    scene.camera=bpy.data.objects['Island_Options_ThreeQuarter']
    scene['Tree_Design']='Five distinct faceted trees: bent tapered trunks, anchored roots, visible branching and irregular leaf pads.'
    windows=list(bpy.context.window_manager.windows)
    if windows:windows[0].scene=scene
    report={'scene':scene.name,'blend':str(OUTPUT),'trees':trees,'all_faces_flat':True,
            'source_scene_unchanged':True,'island_and_other_props_unchanged':True,
            'total_tree_triangles':sum(t['triangles'] for t in trees)}
    (ROOT/'island_b_refined_trees_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report


def refine_foliage():
    scene=bpy.data.scenes[SCENE];grove=bpy.data.collections['Refined_Faceted_Grove']
    body=next(o for o in scene.objects if o.type=='MESH' and 'RimIndices' in o)
    source_hash=OPT['fingerprint'](body.data)
    for obj in list(grove.objects):bpy.data.objects.remove(obj,do_unlink=True)
    foliage,bark=materials();terrain=GEO['bvh'](body)
    trees=[make_tree(i,spec,grove,terrain,foliage,bark) for i,spec in enumerate(SPECS,1)]
    assert OPT['fingerprint'](body.data)==source_hash
    assert all(not p.use_smooth and p.area>1e-10 for o in grove.objects for p in o.data.polygons)
    report=json.loads((ROOT/'island_b_refined_trees_report.json').read_text(encoding='utf-8'))
    report.update(trees=trees,total_tree_triangles=sum(t['triangles'] for t in trees),
                  foliage='Three irregular smaller lobes per branch pad; inset cores with a dense folded-leaf shell.')
    (ROOT/'island_b_refined_trees_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    scene.camera=bpy.data.objects['Island_Options_ThreeQuarter']
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report


def render():
    scene=bpy.data.scenes[SCENE];folder=ROOT/'renders'/'island-refined-trees';folder.mkdir(exist_ok=True)
    output=[]
    for view,camera in [('front','Island_Options_Front'),('three_quarter','Island_Options_ThreeQuarter'),
                        ('left_detail','Grove_Left_Detail'),('right_detail','Grove_Right_Detail')]:
        scene.camera=bpy.data.objects[camera];scene.render.filepath=str(folder/f'trees_{view}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name);output.append(scene.render.filepath)
    return output


if __name__=='__main__':result=build()

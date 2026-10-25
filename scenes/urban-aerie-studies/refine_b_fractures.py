"""Replace B's repeating terraces with one irregular underside and an eastern spur."""
from pathlib import Path
import bpy, bmesh, math, random, runpy, json, time
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

ROOT=Path(__file__).resolve().parent
OPT=runpy.run_path(str(ROOT/'island_profile_options.py'))
API=OPT['API']
SCENE='Island_B_Fractured_Overhang'
OUTPUT=ROOT/'island_b_fractured_overhang.blend'


def tri(t): return 1-4*abs(t%1-.5)


def noise(x,y,scale=3,seed=17):
    """Continuous triangular planes with hashed corner heights."""
    u=(.923*x+.385*y)/scale;v=(-.385*x+.923*y)/scale
    i,j=math.floor(u),math.floor(v);a,b=u-i,v-j
    def value(i,j):
        n=(i*374761393+j*668265263+seed*700001)&0xffffffff
        n=((n^(n>>13))*1274126177)&0xffffffff
        return ((n^(n>>16))&65535)/32767.5-1
    p,q,r,s=value(i,j),value(i+1,j),value(i,j+1),value(i+1,j+1)
    return p*(1-a-b)+q*a+r*b if a+b<1 else s*(a+b-1)+q*(1-b)+r*(1-a)


def underside(x,y):
    # Several oblique support planes, with a small blunt region at the main base.
    rx=.97*(x+4.5)+.24*(y-.5);ry=-.24*(x+4.5)+.97*(y-.5)
    main=13.2-max(.84*max(0,-rx-1.3),1.15*max(0,rx-1.6),
                 1.08*max(0,ry-.8),1.28*max(0,-ry-1.2),
                 .96*max(0,.64*rx+.77*ry-1.7))
    sx=x-11.3;sy=y-.8
    spur=10.1-max(1.72*abs(sx),1.68*abs(sy),1.49*abs(.67*sx+.74*sy))
    shelf=3.0+.35*noise(x,y,6,58)
    depth=max(shelf,main,spur)
    macro=1.35*noise(x,y,3.8,24)+.68*noise(x,y,1.65,65)
    fine=.19*noise(x,y,.57,31)
    return -depth+macro+fine


def rebuild(body):
    mesh=body.data;cap_hash=OPT['cap_fingerprint'](mesh)
    rim=[mesh.vertices[i].co.copy() for i in body['RimIndices']]
    bm=bmesh.new();bm.from_mesh(mesh)
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index in {1,2,3}],context='FACES_ONLY')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    boundary={v for e in bm.edges if e.is_boundary for v in e.verts}
    assert len(boundary)==48
    start=min(boundary,key=lambda v:math.atan2(v.co.y,v.co.x));loop=[start];last=None;cur=start
    while True:
        nxt=next(e.other_vert(cur) for e in cur.link_edges if e.is_boundary and e.other_vert(cur)!=last)
        if nxt==start:break
        loop.append(nxt);last,cur=cur,nxt
        assert len(loop)<=48
    if sum(a.co.x*b.co.y-b.co.x*a.co.y for a,b in zip(loop,loop[1:]+loop[:1]))<0:
        loop=[loop[0]]+list(reversed(loop[1:]))
    collar=[v.co.copy() for v in loop]
    # The side-to-underside seam follows an uneven three-dimensional contour.
    lower=[]
    for p in collar:
        angle=math.atan2(p.y,p.x)
        inset=.875+.032*tri(angle/math.tau*5+.21)+.022*tri(angle/math.tau*3+.73)
        x=p.x*inset-.25;y=p.y*inset+.12
        lower.append(Vector((x,y,underside(x,y))))
    bottom_loop=[bm.verts.new(p) for p in lower]
    rng=random.Random(90131)
    params=[];lookup={}
    def point(u,v):
        key=(round(u/48*100,6),round(v*7,6))
        if key not in lookup:lookup[key]=len(params);params.append(Vector(key))
        return lookup[key]
    outer=[point(i,0) for i in range(49)]
    outer += [point(48,j/16) for j in range(1,16)]
    outer += [point(i,1) for i in range(48,-1,-1)]
    outer += [point(0,j/16) for j in range(15,0,-1)]
    # Randomly spaced vertices, with no rows at shared physical heights.
    grid={};spacing=.36;count=0
    while count<1300:
        x,y=rng.uniform(.01,99.99),rng.uniform(.015,6.985)
        gx,gy=int(x/spacing),int(y/spacing)
        if any((x-a)**2+(y-b)**2<spacing**2 for dx in (-1,0,1) for dy in (-1,0,1) for a,b in grid.get((gx+dx,gy+dy),[])):continue
        grid.setdefault((gx,gy),[]).append((x,y));point(x/100*48,y/7);count+=1
    coords,edges,faces,*_=delaunay_2d_cdt(params,[],[outer],0,.000001,True)
    vmap={};seam={}
    for idx,q in enumerate(coords):
        u,v=q.x/100*48,q.y/7
        if abs(u-round(u))<1e-5:u=float(round(u))
        if v<1e-6:vmap[idx]=loop[round(u)%48];continue
        if v>1-1e-6:vmap[idx]=bottom_loop[round(u)%48];continue
        u%=48;i=int(u);t=u-i
        top=collar[i].lerp(collar[(i+1)%48],t)
        low=lower[i].lerp(lower[(i+1)%48],t)
        p=top.lerp(low,v)
        fade=min(1,v/.12,(1-v)/.12)
        ridge=(.38*tri(u*.22+v*.73)+.23*tri(u*.47-v*1.21)+.10*tri(u*2.7+v*5.7))*fade
        out=Vector((top.x,top.y,0)).normalized()
        p+=out*ridge;p.z+=.18*tri(u*.63+v*2.4)*fade
        key=tuple(round(c,5) for c in p)
        if key not in seam:seam[key]=bm.verts.new(p)
        vmap[idx]=seam[key]
    for face in faces:
        if len(face)!=3:continue
        verts=[vmap[i] for i in face]
        if len(set(verts))==3:
            f=bm.faces.new(verts);f.material_index=1;f.smooth=False
    # The underside is a single triangulated surface, carrying both rock masses.
    points=[Vector((p.x,p.y)) for p in lower]
    xmin,xmax=min(p.x for p in lower),max(p.x for p in lower)
    ymin,ymax=min(p.y for p in lower),max(p.y for p in lower)
    def inside(x,y):
        hit=False
        for a,b in zip(lower,lower[1:]+lower[:1]):
            if (a.y>y)!=(b.y>y) and x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x:hit=not hit
        return hit
    grid={};count=0;spacing=.31
    while count<2500:
        x,y=rng.uniform(xmin,xmax),rng.uniform(ymin,ymax)
        if not inside(x,y):continue
        gx,gy=math.floor(x/spacing),math.floor(y/spacing)
        if any((x-a)**2+(y-b)**2<spacing**2 for dx in (-1,0,1) for dy in (-1,0,1) for a,b in grid.get((gx+dx,gy+dy),[])):continue
        grid.setdefault((gx,gy),[]).append((x,y));points.append(Vector((x,y)));count+=1
    # Exact summit points retain a definite angular secondary spike.
    points.extend([Vector((-4.5,.5)),Vector((11.3,.8))])
    coords,edges,faces,*_=delaunay_2d_cdt(points,[],[list(range(48))],1,.000001,True)
    vmap={}
    for idx,p in enumerate(coords):
        near=next((i for i,b in enumerate(lower) if abs(p.x-b.x)<1e-4 and abs(p.y-b.y)<1e-4),None)
        vmap[idx]=bottom_loop[near] if near is not None else bm.verts.new((p.x,p.y,underside(p.x,p.y)))
    for face in faces:
        if len(face)!=3:continue
        verts=[vmap[i] for i in face]
        if len(set(verts))==3:
            f=bm.faces.new(verts);f.material_index=1;f.smooth=False
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for face in bm.faces:
        face.smooth=False
        if face.material_index in {1,2,3}:
            p=face.calc_center_median()
            shade=noise(p.x+.28*p.z,p.y-.4*p.z,4.8,70)
            face.material_index=2 if shade>.36 else 3 if shade<-.36 else 1
    bm.to_mesh(mesh);bm.free();mesh.update()
    positions={tuple(round(c,5) for c in v.co):v.index for v in mesh.vertices}
    body['RimIndices']=[positions[tuple(round(c,5) for c in p)] for p in rim]
    assert OPT['cap_fingerprint'](mesh)==cap_hash
    facet_attribute=mesh.attributes.get('RockFacetValue') or mesh.attributes.new('RockFacetValue','FLOAT','FACE')
    values=[]
    for p in mesh.polygons:
        n=p.normal
        variation=(((p.index*668265263+374761393)&65535)/32767.5-1)*.065
        values.append(1+.24*(.83*n.x-.48*n.y+.27*n.z)+variation)
    facet_attribute.data.foreach_set('value',values)
    # Keep the same painted stone while avoiding large banded material regions.
    base=mesh.materials[1]
    for index,gain in ((1,1.0),(2,1.10),(3,.90)):
        mat=base.copy();mat.name=f'B2_Unbanded_Stone_{index}'
        mat.diffuse_color=tuple(c*gain for c in base.diffuse_color[:3])+(1,)
        nodes,links=mat.node_tree.nodes,mat.node_tree.links
        shader=nodes.get('Principled BSDF')
        if shader:
            socket=shader.inputs['Base Color']
            if socket.links:
                old=socket.links[0].from_socket
                mul=nodes.new('ShaderNodeMixRGB');mul.blend_type='MULTIPLY';mul.inputs[0].default_value=1
                mul.inputs[2].default_value=(gain,gain,gain,1)
                links.new(old,mul.inputs[1]);links.new(mul.outputs[0],socket)
            else:socket.default_value=tuple(c*gain for c in socket.default_value[:3])+(1,)
            old=socket.links[0].from_socket if socket.links else None
            attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='RockFacetValue'
            planes=nodes.new('ShaderNodeMixRGB');planes.blend_type='MULTIPLY';planes.inputs[0].default_value=1
            if old:links.new(old,planes.inputs[1])
            else:planes.inputs[1].default_value=socket.default_value
            links.new(attribute.outputs['Fac'],planes.inputs[2]);links.new(planes.outputs[0],socket)
        mesh.materials[index]=mat
    audit=API['audit_island'](body)
    audit.update({'all_faces_flat':all(not p.use_smooth for p in mesh.polygons),'cap_unchanged':True,
                  'secondary_tip':[11.3,.8,round(underside(11.3,.8),3)],
                  'source':'B Undercut Shelf','method':'Irregular side patches and one continuous underside; two joined rock masses; no repeated ledge heights.'})
    return audit


def build():
    if bpy.data.scenes.get(SCENE) or OUTPUT.exists():raise RuntimeError('B refinement already exists.')
    source=bpy.data.scenes['Island_B_Undercut_Shelf']
    original=next(o for o in source.objects if o.type=='MESH' and 'RimIndices' in o)
    source_hash=OPT['fingerprint'](original.data)
    scene=source.copy();scene.name=SCENE
    scene.compositing_node_group=source.compositing_node_group.copy()
    for node in scene.compositing_node_group.nodes:
        if node.type=='R_LAYERS':node.scene=scene
    body=original.copy();body.data=original.data.copy();body.name='Island_B2_Connected_Terrain'
    old=original.users_collection[0];scene.collection.children.unlink(old)
    OPT['clone_collection'](old,scene.collection,original,body,'B2_')
    return finish(scene,body,original,source_hash)


def finish(scene,body,original,source_hash=None):
    if source_hash is None:source_hash=OPT['fingerprint'](original.data)
    report=rebuild(body)
    assert OPT['fingerprint'](original.data)==source_hash
    scene.camera=bpy.data.objects['Island_Options_Front']
    scene['IslandOption']='B refined: no repeated quarry terraces, integrated right-hand downward spur.'
    # A low cloud bounce reveals downward-facing facets in the blue-hour light.
    bounce=bpy.data.objects.get('B2_Cloud_Bounce')
    if bounce is None:
        data=bpy.data.lights.new('B2_Cloud_Bounce','AREA')
        bounce=bpy.data.objects.new('B2_Cloud_Bounce',data);scene.collection.objects.link(bounce)
    bounce.location=(-26,-14,-12)
    bounce.rotation_euler=(Vector((-1,0,-6))-bounce.location).to_track_quat('-Z','Y').to_euler()
    bounce.data.energy=2300;bounce.data.shape='DISK';bounce.data.size=7
    bounce.data.color=(.68,.77,1.0)
    windows=list(bpy.context.window_manager.windows)
    if windows:windows[0].scene=scene
    scene.eevee.taa_render_samples=96
    report.update({'scene':scene.name,'body':body.name,'blend':str(OUTPUT),'source_unchanged':True})
    (ROOT/'island_b_fractured_overhang_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT),check_existing=False)
    return report


def render():
    scene=bpy.data.scenes[SCENE];folder=ROOT/'renders'/'island-b-refined';folder.mkdir(exist_ok=True)
    result=[]
    for name,cam in [('front','Island_Options_Front'),('three_quarter','Island_Options_ThreeQuarter'),('side','Island_Options_Side')]:
        scene.camera=bpy.data.objects[cam];scene.render.filepath=str(folder/f'B2_{name}.png')
        bpy.ops.render.render(write_still=True,scene=scene.name)
        result.append({'view':name,'path':scene.render.filepath})
    return result


if __name__=='__main__':result=build()

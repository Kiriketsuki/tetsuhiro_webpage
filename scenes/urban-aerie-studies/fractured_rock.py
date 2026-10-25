"""One irregular rock mass with oblique fractures and independent side outlines."""
from pathlib import Path
import bpy,bmesh,runpy,math,random,json
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

ROOT=Path(__file__).resolve().parent
BC=runpy.run_path(str(ROOT/'broken_cliff.py'))
RF,API,GEO=BC['RF'],BC['API'],BC['GEO']

# Independent cardinal outlines. The changes in direction occur at different
# depths; no complete ledge or horizontal tier runs around the island.
OUTLINES=[
    [(0,1),(.12,.97),(.22,.84),(.40,.90),(.48,.68),(.69,.70),(.82,.45),(1,.31)], # east
    [(0,1),(.15,1),(.30,.85),(.55,.90),(.74,.55),(.87,.60),(1,.30)],          # north
    [(0,1),(.25,1.05),(.32,.88),(.49,.90),(.65,.58),(.74,.61),(1,.31)],       # west
    [(0,1),(.20,.93),(.35,.99),(.56,.66),(.70,.70),(.92,.33),(1,.35)],        # south
]


def interpolate(points,t):
    for (a,x),(b,y) in zip(points,points[1:]):
        if t<=b:return x+(y-x)*(t-a)/(b-a)
    return points[-1][1]


def replace(body):
    me=body.data;before=API['audit_island'](body)
    rim_positions=[me.vertices[i].co.copy() for i in body['RimIndices']]
    bm=bmesh.new();bm.from_mesh(me)
    rock={1,2,3}
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index in rock],context='FACES_ONLY')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    boundary={v for e in bm.edges if e.is_boundary for v in e.verts}
    if len(boundary)!=48:raise RuntimeError('Unexpected source collar boundary.')
    start=min(boundary,key=lambda v:math.atan2(v.co.y,v.co.x));loop=[start];last=None;current=start
    while True:
        nxt=next(e.other_vert(current) for e in current.link_edges if e.is_boundary and e.other_vert(current)!=last)
        if nxt==start:break
        loop.append(nxt);last,current=current,nxt
        if len(loop)>48:raise RuntimeError('Collar traversal failed.')
    area=sum(a.co.x*b.co.y-b.co.x*a.co.y for a,b in zip(loop,loop[1:]+loop[:1]))
    if area<0:loop=[loop[0]]+list(reversed(loop[1:]))
    collar=[v.co.copy() for v in loop]
    params=[];lookup={}
    def point(u,v):
        q=(round(u,6),round(v*20,6))
        if q not in lookup:lookup[q]=len(params);params.append(Vector(q))
        return lookup[q]
    top=[point(i,0) for i in range(49)]
    right=[point(48,j/40) for j in range(1,40)]
    bottom=[point(i,1) for i in range(48,-1,-1)]
    left=[point(0,j/40) for j in range(39,0,-1)]
    outer=top+right+bottom+left
    rng=random.Random(45109)
    for i in range(3900):point(rng.uniform(.001,47.999),rng.uniform(.0001,.9999))
    faults=[(6,-3),(17,4),(31,-2.5),(41,2)]
    constraints=[]
    for u0,slope in faults:
        line=[point(u0+slope*v,v) for v in [j/25 for j in range(1,25)]]
        constraints.extend(zip(line,line[1:]))
    coords,edges,triangles,*_=delaunay_2d_cdt(params,list(constraints),[outer],0,.000001,True)

    def surface(u,v):
        u=u%48;i=int(u);f=u-i
        p=collar[i].lerp(collar[(i+1)%48],f)
        a=math.atan2(p.y,p.x)%(math.tau)
        quadrant=a/(math.pi/2);q=int(quadrant);t=quadrant-q
        radial=interpolate(OUTLINES[q%4],v)*(1-t)+interpolate(OUTLINES[(q+1)%4],v)*t
        # Long slanted cracks and ridges break the rock face into interlocking
        # planes. Their lines run obliquely, rather than circling the island.
        crack=0
        for u0,slope in faults:
            du=(u-(u0+slope*v)+24)%48-24
            crack-=.55*max(0,1-abs(du)/1.15)*math.sin(math.pi*v)
        small=.065*math.sin(u*17.1+v*182)*math.cos(u*7.3-v*139)
        small*=min(1,v/.035,(1-v)/.025)
        out=Vector((p.x,p.y,0)).normalized()
        x=p.x*radial-2.6*v+.9*math.sin(math.pi*v)+out.x*(crack+small)
        y=p.y*radial+.9*v+out.y*(crack+small)
        z=p.z*(1-v)+(-20.10+.18*math.cos(2*a))*v
        return Vector((x,y,z))

    verts={};spatial={};top_coords={tuple(round(c,5) for c in v.co):v for v in loop}
    for n,q in enumerate(coords):
        u,v=q.x,q.y/20
        if abs(v)<1e-7:
            verts[n]=loop[round(u)%48];continue
        p=surface(u,v);key=tuple(round(c,5) for c in p)
        if key not in spatial:spatial[key]=bm.verts.new(p)
        verts[n]=spatial[key]
    added=0
    for tri in triangles:
        if len(tri)!=3 or abs((coords[tri[1]]-coords[tri[0]]).cross(coords[tri[2]]-coords[tri[0]]))<1e-7:continue
        vs=[verts[i] for i in tri]
        if len(set(vs))<3:continue
        f=bm.faces.new(vs)
        u=sum(coords[i].x for i in tri)/3;v=sum(coords[i].y for i in tri)/60
        f.material_index=1+(int((u+v*8)/6)%3);f.smooth=False;added+=1
    # Bottom rim has one broad chisel-shaped closure, not a peak cluster.
    bottom_verts=[]
    for i in range(48):
        p=surface(i,1);key=tuple(round(c,5) for c in p)
        bottom_verts.append(spatial[key])
    center=bm.verts.new((-2.6,.9,-20.32))
    for a,b in zip(bottom_verts,bottom_verts[1:]+bottom_verts[:1]):
        f=bm.faces.new((a,center,b));f.material_index=3;f.smooth=False
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for f in bm.faces:f.smooth=False
    bm.to_mesh(me);bm.free();me.update()
    table={tuple(round(c,5) for c in v.co):v.index for v in me.vertices}
    body['RimIndices']=[table[tuple(round(c,5) for c in p)] for p in rim_positions]
    after=API['audit_island'](body)
    return {'before':before,'after':after,'new_rock_triangles':added+48,
            'shape':'Independent east/north/west/south broken outlines; irregular triangulation, oblique fractures and broad base. No encircling shelves.',
            'top':'Existing meadow, turf and soil preserved at their original positions.'}


def build():
    name='UA_B_Atelier_FracturedRock';path=ROOT/'atelier_fractured_rock.blend'
    if bpy.data.scenes.get(name) or path.exists():raise RuntimeError('Fractured-rock study already exists.')
    source=bpy.data.scenes['UA_B_Atelier_Jagged'];scene=source.copy();scene.name=name
    scene.compositing_node_group=source.compositing_node_group.copy()
    for node in scene.compositing_node_group.nodes:
        if node.type=='R_LAYERS':node.scene=scene
    mapping={};old=bpy.data.collections['JG_RF_CO_PT_SH_UA_Shared_Corrected_Island']
    scene.collection.children.unlink(old);common=BC['clone'](old,scene.collection,mapping)
    body=RF['find'](mapping,'Connected_Island');water=RF['find'](mapping,'Pond_Stream_and_Waterfall')
    shape=replace(body);tree=GEO['bvh'](body)
    rows,cols=RF['make_water'](water,tree,body);shore=RF['bury_boundary'](water,tree,rows,cols,body)
    cameras=API['collection']('FR_Profile_Cameras',scene.collection)
    for label,loc in [('Front',(0,-68,-3)),('Side',(68,0,-3))]:
        cam=API['BASE']['camera']('FR_'+label,cameras,loc,(0,0,-3),50)
        cam.data.type='ORTHO';cam.data.ortho_scale=50;cam.data.clip_end=6500
    scene.camera=bpy.data.objects['SS_RF_Cliff'];scene.render.resolution_x=1800;scene.render.resolution_y=1400
    if bpy.context.window:bpy.context.window.scene=scene
    bpy.context.view_layer.update()
    report={'scene':scene.name,'blend':str(path),'rock':shape,'shoreline':shore,
            'reference':'User drawing and Gunes Ozcan floating-island cliff forms, excluding multiple bottom peaks.'}
    (ROOT/'fractured_rock_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(path),check_existing=False)
    return report


if __name__=='__main__':result=build()

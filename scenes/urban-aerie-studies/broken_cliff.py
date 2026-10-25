"""Replace the conical underside with a stepped, asymmetric cliff section."""
from pathlib import Path
import bpy,bmesh,math,random,json,runpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
JG=runpy.run_path(str(ROOT/'jagged_landform.py'))
RF,API,GEO=JG['RF'],JG['API'],JG['GEO']

# z, left, right, front, back. Deliberate cuts and protruding shelves, rather
# than a monotonically shrinking series of circular radii.
PROFILE=[
    (-3.15,-16.8,16.7,-12.0,11.8),
    (-4.80,-16.7,16.2,-12.0,11.5),
    (-5.25,-14.4,14.6,-10.5,10.0),
    (-7.20,-14.9,14.1,-10.7,10.2),
    (-7.65,-15.6,14.0,-11.4,10.4),
    (-9.60,-14.8,13.6,-10.8,10.0),
    (-10.05,-12.4,10.2,-8.9,8.4),
    (-12.90,-12.3,10.5,-8.8,8.5),
    (-13.35,-12.9,11.2,-9.3,8.6),
    (-15.70,-11.0,9.1,-8.0,7.9),
    (-16.15,-8.4,6.5,-6.0,5.9),
    (-18.50,-8.5,6.7,-5.9,5.7),
    (-19.15,-6.2,3.6,-4.3,4.9),
    (-20.00,-5.6,3.1,-3.9,4.2),
]


def clone(source,parent,mapping):
    c=bpy.data.collections.new('BC_'+source.name);parent.children.link(c)
    for old in source.objects:
        ob=old.copy();ob.name='BC_'+old.name
        if old.data:ob.data=old.data.copy()
        c.objects.link(ob);mapping[old.name]=ob
    for child in source.children:clone(child,c,mapping)
    return c


def replace_cliff(body):
    me=body.data
    rim_positions=[me.vertices[i].co.copy() for i in body['RimIndices']]
    top_polygon=[Vector(p[:2]) for p in rim_positions]
    before=API['audit_island'](body)
    bm=bmesh.new();bm.from_mesh(me)
    rock={1,2,3}
    bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.material_index in rock],context='FACES_ONLY')
    bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
    boundary={v for e in bm.edges if e.is_boundary for v in e.verts}
    if len(boundary)!=48:raise RuntimeError(f'Expected 48 collar vertices, got {len(boundary)}')
    start=min(boundary,key=lambda v:math.atan2(v.co.y,v.co.x))
    loop=[start];last=None;current=start
    while True:
        candidates=[e.other_vert(current) for e in current.link_edges if e.is_boundary and e.other_vert(current)!=last]
        if not candidates:raise RuntimeError('Broken collar boundary.')
        nxt=candidates[0]
        if nxt==start:break
        loop.append(nxt);last,current=current,nxt
        if len(loop)>48:raise RuntimeError('Collar traversal did not close.')
    area=sum(a.co.x*b.co.y-b.co.x*a.co.y for a,b in zip(loop,loop[1:]+loop[:1]))
    if area<0:loop=[loop[0]]+list(reversed(loop[1:]))
    angles=[math.atan2(v.co.y,v.co.x) for v in loop]
    collar=[v.co.copy() for v in loop]
    fixed_vertices=set(bm.verts)
    previous=loop;new_faces=[];rng=random.Random(44037)
    macro=(1.02,.98,1.05,.97,1.01,1.03,.96,1.02,1.0,.95,1.04,.98,1.03,.96,1.0,.99)

    def target_ring(row,level):
        z,left,right,front,back=row;cx=(left+right)/2;cy=(front+back)/2
        halfx=(right-left)/2;halfy=(back-front)/2
        major=[]
        for j in range(16):
            a=angles[j*3];fault=1+(macro[j]-1)*(.65+.25*math.sin(level*.7+j*.4))
            zz=z+(.25 if level==len(PROFILE)-1 else 1)*(.38*math.sin(3*a+.7)+.21*math.cos(5*a-.2)+.06*math.sin(level*.4+2*a))
            major.append(Vector((cx+halfx*math.cos(a)*fault,cy+halfy*math.sin(a)*fault,zz)))
        result=[]
        for i in range(48):
            j,t=divmod(i,3);v=major[j].lerp(major[(j+1)%16],t/3)
            if i%3:
                out=Vector((v.x-cx,v.y-cy,0)).normalized();v+=out*rng.uniform(-.045,.045)
                v.z+=rng.uniform(-.035,.035)
            if level==0:v.z=min(v.z,collar[i].z-.28)
            # The falling stream must clear the outward rock shelf at its lip.
            if 1.8<v.x<8 and v.y<-7:
                lip=RF['front_y'](v.x,top_polygon)
                t=max(0,(.2-v.z)/31)
                water_y=lip-2.1*(1-math.exp(-6*t))
                v.y=max(v.y,water_y+.18)
            result.append(v)
        return result

    rings=0
    for level,row in enumerate(PROFILE):
        target=target_ring(row,level)
        old=[v.co.copy() for v in previous]
        steps=2 if level and abs(row[0]-PROFILE[level-1][0])>1.4 else 1
        for step in range(1,steps+1):
            ring=[bm.verts.new(old[i].lerp(target[i],step/steps)) for i in range(48)]
            for i in range(48):
                a,b=previous[i],previous[(i+1)%48];c,d=ring[i],ring[(i+1)%48]
                triangles=((a,c,b),(b,c,d)) if (i+level+step)%2 else ((a,c,d),(a,d,b))
                tone=1+((i//6+level//3)%3)
                for tri in triangles:
                    f=bm.faces.new(tri);f.material_index=tone;f.smooth=False;new_faces.append(f)
            previous=ring;rings+=1
    # A broad, slightly oblique base replaces the old single pointed tip.
    floor=bm.verts.new((-1.25,.15,-20.24))
    for i in range(48):
        f=bm.faces.new((previous[i],floor,previous[(i+1)%48]));f.material_index=3;new_faces.append(f)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.normal_update()
    pre_subdivision=set(bm.verts)
    edges={e for f in new_faces for e in f.edges}
    bmesh.ops.subdivide_edges(bm,edges=list(edges),cuts=1,use_grid_fill=True)
    bm.normal_update();displaced=0
    for v in bm.verts:
        if v in pre_subdivision or any(f.material_index not in rock for f in v.link_faces):continue
        v.co+=v.normal*rng.uniform(-.060,.085);displaced+=1
    bmesh.ops.triangulate(bm,faces=[f for f in bm.faces if len(f.verts)>3])
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for f in bm.faces:f.smooth=False
    bm.to_mesh(me);bm.free();me.update()
    coords={tuple(round(c,5) for c in v.co):v.index for v in me.vertices}
    body['RimIndices']=[coords[tuple(round(c,5) for c in p)] for p in rim_positions]
    # All accepted meadow/turf/soil vertices must remain exactly in place.
    remaining={tuple(round(c,5) for c in v.co) for v in me.vertices}
    if any(tuple(round(c,5) for c in p) not in remaining for p in rim_positions):raise RuntimeError('Top rim changed.')
    after=API['audit_island'](body)
    return {'before':before,'after':after,'profile_stations':len(PROFILE),'cliff_rows':rings,
            'new_facet_vertices_displaced':displaced,'bottom':'Wide chisel base, no cone point or hanging peak cluster.',
            'shape':'Offset cliff walls, deep cut-ins, outward shelves and a broad asymmetric base. Ground, turf, soil and their contacts preserved.'}


def build():
    name='UA_B_Atelier_BrokenCliff';path=ROOT/'atelier_broken_cliff.blend'
    if bpy.data.scenes.get(name) or path.exists():raise RuntimeError('Broken-cliff study already exists.')
    source=bpy.data.scenes['UA_B_Atelier_Jagged'];scene=source.copy();scene.name=name
    scene.compositing_node_group=source.compositing_node_group.copy()
    for node in scene.compositing_node_group.nodes:
        if node.type=='R_LAYERS':node.scene=scene
    mapping={};old=bpy.data.collections['JG_RF_CO_PT_SH_UA_Shared_Corrected_Island']
    scene.collection.children.unlink(old);common=clone(old,scene.collection,mapping)
    body=RF['find'](mapping,'Connected_Island');water=RF['find'](mapping,'Pond_Stream_and_Waterfall')
    shape=replace_cliff(body);tree=GEO['bvh'](body)
    rows,cols=RF['make_water'](water,tree,body);shore=RF['bury_boundary'](water,tree,rows,cols,body)
    cameras=API['collection']('BC_Profile_Cameras',scene.collection)
    for label,loc in [('Front',(0,-68,-3)),('Side',(68,0,-3))]:
        cam=API['BASE']['camera']('BC_'+label,cameras,loc,(0,0,-3),50)
        cam.data.type='ORTHO';cam.data.ortho_scale=44;cam.data.clip_end=6500
    scene.camera=bpy.data.objects['SS_BC_Front'];scene.render.resolution_x=1800;scene.render.resolution_y=1400
    if bpy.context.window:bpy.context.window.scene=scene
    bpy.context.view_layer.update()
    report={'scene':scene.name,'blend':str(path),'cliff':shape,'shoreline':shore,
            'references':['User drawn island side profile','https://dribbble.com/shots/1929856-1st-Low-Poly-Floating-Island'],
            'scope':'Replace the entire underside profile and increase facet density. Earlier top, planted props and structure contacts retained.'}
    (ROOT/'broken_cliff_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(path),check_existing=False)
    return report


if __name__=='__main__':result=build()

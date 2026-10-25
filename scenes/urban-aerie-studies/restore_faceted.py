"""Restore the accepted terrain, bury water boundaries, and recover broad rock strata."""
from pathlib import Path
import bpy
import bmesh
import runpy
import math
import json
import random
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
CO = runpy.run_path(str(ROOT / 'improve_cohesion.py'))
API, GEO, PATINA = CO['API'], CO['GEO'], CO['PATINA']


def clone(source, parent, mapping):
    c = bpy.data.collections.new('RF_' + source.name)
    parent.children.link(c)
    for old in source.objects:
        ob = old.copy(); ob.name = 'RF_' + old.name
        if old.data: ob.data = old.data.copy()
        c.objects.link(ob); mapping[old.name] = ob
    for child in source.children: clone(child, c, mapping)
    return c


def find(mapping, end):
    return CO['find'](mapping, end)


def restore_body(body):
    original = bpy.data.objects['SH_SS_UA_Connected_Island']
    source=original.data; n=96; nr=24; rim_start=1+(nr-1)*n
    vertices=[v.co.copy() for v in source.vertices[:2305]]
    faces=[tuple(f.vertices) for f in source.polygons if f.material_index==0]
    indices=[0]*len(faces)
    # Sixteen real silhouette corners, not a dense surface shaded as a cone.
    factors=(1.0,.98,1.025,.97,1.0,.955,1.01,.96,1.0,1.015,.97,.995,1.025,.965,1.02,.975)
    controls=[]
    for i in range(16):
        v=vertices[rim_start+i*6].copy();v.x*=factors[i];v.y*=factors[i];controls.append(v)
    for i in range(n):
        sector,t=divmod(i,6)
        edge=controls[sector].lerp(controls[(sector+1)%16],t/6)
        delta=edge-vertices[rim_start+i];delta.z=0
        for row in range(1,nr+1):vertices[1+(row-1)*n+i]+=delta*(row/nr)**4
    previous=list(range(rim_start,rim_start+n));ring_starts=[]
    layers=[(1.015,-1.5),(.94,-4.7),(.77,-8.1),(.59,-11.7),(.34,-15.2),(.13,-18.4)]
    for k,(radius,z) in enumerate(layers):
        base=len(vertices);ring_starts.append(base)
        for i,control in enumerate(controls):
            a=i*math.tau/16
            fault=1+.065*math.sin(3*a+k*.44)+.035*math.cos(5*a-k*.31)
            radial=radius*fault
            # Leave the waterfall outlet clear beneath the grassy lip.
            if i in (12,13) and k<2:radial=min(radial,.96 if k==0 else .87)
            spin=.027*math.sin(k*.9)
            x,y=control.x,control.y
            vertices.append(Vector(((x*math.cos(spin)-y*math.sin(spin))*radial+.19*k,
                                    (x*math.sin(spin)+y*math.cos(spin))*radial+.06*k,
                                    z+.52*math.sin(3*a+k*.7)+.24*math.cos(5*a-k*.3))))
        if k==0:
            for i in range(16):
                a=previous[i*6];lo=base+i;next_lo=base+(i+1)%16
                for j in range(6):
                    b=previous[(i*6+j+1)%n]
                    faces.append((previous[i*6+j],lo,b));indices.append(1+(i//3)%3)
                faces.append((previous[((i+1)*6)%n],lo,next_lo));indices.append(1+(i//3)%3)
        else:
            for i in range(16):
                a,b=previous[i],previous[(i+1)%16];c,d=base+i,base+(i+1)%16
                faces.extend([(a,c,b),(b,c,d)])
                tone=1+((i//3+k//2)%3)
                indices.extend([tone,tone if (i+k)%4 else 1+(tone%3)])
        previous=list(range(base,base+16))
    tip=len(vertices);vertices.append(Vector((1.6,.65,-20.3)))
    for i in range(16):faces.append((previous[i],tip,previous[(i+1)%16]));indices.append(3)
    mats=[bpy.data.materials['LP_SS_A_'+name] for name in ('grass','rock','rock_light','rock_dark')]
    temp=API['mesh_object']('RF_Angular_Landform',vertices,faces,body.users_collection[0],mats,indices)
    body.data=temp.data;bpy.data.objects.remove(temp,do_unlink=True);me=body.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    for face in bm.faces: face.smooth = False
    bm.to_mesh(me); bm.free(); me.update()
    return {'ground_height_source': original.name, 'ground_height_changes':0,
            'rock_tones':3,'cliff_silhouette_corners':16,'cliff_rings':6,
            'cliff_triangles':len(faces)-4512,'outline':'Outer ground rings meet the angular cliff through shared rim vertices.'}


def rim_polygon(body):
    ids=list(body.get('RimIndices',range(2209,2305)))
    return [Vector(body.data.vertices[i].co[:2]) for i in ids]


def front_y(x, polygon):
    hits=[]
    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
        if min(a.x,b.x)<=x<=max(a.x,b.x) and abs(a.x-b.x)>1e-7:
            hits.append(a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x))
    return min(hits) if hits else -10.7


def make_water(water, terrain, body):
    source = bpy.data.objects['PT_SS_SH_Pond_Stream_and_Waterfall']
    old = source.data
    polygon=rim_polygon(body)
    rows = list(range(0, 21, 2)) + list(range(21, 32)) + list(range(34, 109, 3))
    if rows[-1] != 108: rows.append(108)
    cols = 8; vertices = []; bounds = []
    for j in rows:
        left, right = old.vertices[j * 25].co.copy(), old.vertices[j * 25 + 24].co.copy()
        y = left.y
        z = .24 if j < 22 else .24 - (j - 21) / 7 * .04 if j < 29 else left.z
        if j < 29:
            # Hide actual sheet boundaries underneath the existing dry ground.
            # The visible shoreline is the intersection with the original basin.
            for sign in (-1, 1):
                edge = left if sign < 0 else right
                x = edge.x
                edge_y=front_y(x,polygon)+.035 if j==28 else y
                h = GEO['sample'](terrain, x, edge_y) if GEO['inside'](Vector((x,edge_y)),polygon) else None
                for step in range(50):
                    if h is None or h > z + .065: break
                    x += sign * .10
                    edge_y=front_y(x,polygon)+.035 if j==28 else y
                    h=GEO['sample'](terrain,x,edge_y) if GEO['inside'](Vector((x,edge_y)),polygon) else None
                edge.x = x + sign * .30
            bounds.append((j, left.copy(), right.copy(), z))
        for i in range(cols + 1):
            t = i / cols; x = left.x * (1 - t) + right.x * t
            # Very low polygon waves, meeting exactly at shared vertices.
            wave = (.004 * math.sin(x * 2.1 + y * 1.3) * math.cos(y * 1.9)) if j < 28 else 0
            offset=.07*math.sin(i*4.7+j*6.3) if j<28 and 0<i<cols else 0
            vy=y+offset*.7
            if j==28:vy=front_y(x+offset,polygon)+.035
            elif j>=29:
                t=(j-28)/80
                vy=front_y(x,polygon)-2.1*(1-math.exp(-6*t))
                hit,normal,face,distance=terrain.ray_cast(Vector((x,-40,z)),Vector((0,1,0)))
                if hit is not None:vy=min(vy,hit.y-.085)
            vertices.append((x+offset,vy,z+wave))
    mats = []
    for i, color in enumerate(((.115,.365,.405),(.119,.373,.413),(.112,.359,.400),(.122,.379,.417))):
        m = API['BASE']['material']('RF_Faceted_Water_' + str(i), color, .36)
        p = m.node_tree.nodes.get('Principled BSDF'); p.inputs['Specular IOR Level'].default_value=.28
        mats.append(m)
    fall = bpy.data.materials['SH_Continuous_Falling_Water'].copy();fall.name='RF_Falling_Water'
    mats.append(fall)
    faces, indices = [], []
    for r in range(len(rows)-1):
        for i in range(cols):
            a = r * (cols+1) + i; b=a+1; c=a+cols+1; d=c+1
            faces.extend([(a,c,d),(a,d,b)] if (r+i)%2 else [(a,c,b),(b,c,d)])
            tone = (r * 3 + i // 2) % 4
            indices.extend([4,4] if rows[r+1]>=29 else [tone,tone if i%3 else (tone+1)%4])
    tip=len(vertices);vertices.append((4,6.65,.24))
    for i in range(cols): faces.append((tip,i,i+1));indices.append(0)
    c = water.users_collection[0]
    temp=API['mesh_object']('RF_Water_Surface',vertices,faces,c,mats,indices)
    water.data=temp.data;bpy.data.objects.remove(temp,do_unlink=True)
    bm=bmesh.new();bm.from_mesh(water.data)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
    for f in bm.faces:f.smooth=False
    bm.to_mesh(water.data);bm.free();water.data.update()
    return rows,cols


def bury_boundary(water, tree, rows, cols, body):
    # Check every boundary segment, not merely the row endpoints. Widen hidden
    # edge vertices when the underlying faceted ground dips between samples.
    polygon=rim_polygon(body)
    for attempt in range(12):
        move=set();worst=0;tested=0
        for side in (0,cols):
            for r in range(len(rows)-1):
                if rows[r+1]>=29:continue
                a=water.data.vertices[r*(cols+1)+side]
                b=water.data.vertices[(r+1)*(cols+1)+side]
                for k in range(11):
                    p=a.co.lerp(b.co,k/10)
                    if not GEO['inside'](Vector(p[:2]),polygon):continue
                    h=GEO['sample'](tree,p.x,p.y)
                    if h is None:continue
                    tested+=1;worst=max(worst,p.z-h)
                    if h<p.z+.025:move.update((a.index,b.index))
        if not move:break
        for i in move:
            side=i%(cols+1);water.data.vertices[i].co.x+=-.12 if side==0 else .12
            if rows[i//(cols+1)]==28:
                v=water.data.vertices[i];v.co.y=front_y(v.co.x,polygon)+.035
        water.data.update()
    # The top tip lies underneath land. The fall outlet is intentionally open.
    return {'sheet_boundary_samples':tested,'largest_exposed_gap_m':round(max(0,worst),5),
            'boundary_widening_passes':attempt,'method':'Water recessed into the protected faceted basin; sheet edges extend underneath dry ground.'}


def settle_scene(common, house, mapping, old_tree, tree):
    report={}
    # Keep the already repaired rail/deck contacts. Reseat only terrain objects.
    for name,ob in mapping.items():
        if ob.type!='MESH' or ob.hide_render:continue
        if any(k in name for k in ('Angular_Meadow','Ground_Planting','Grass_Accents','Grounded_Stream_Banks','Pond_Shore_Stones')):
            report[name]=CO['ground_parts'](ob,tree,.035 if 'Meadow' in name or 'Grass' in name else .10)
        elif any(k in name for k in ('Grounded_Foundation','Bridge_Abutments','Lookout_Access_Step')):
            CO['extend_feet'](ob,tree)
        elif name.endswith('City_Lookout'):CO['extend_feet'](ob,tree,True)
        elif 'Flower_' in name or name.endswith('Faceted_Flower_Petals') or 'Grounded_Reeds' in name or 'Rooted_Reed_Blades' in name:
            bm,groups=PATINA['components'](ob.data)
            for group in groups:
                q=sum((v.co for v in group),Vector())/len(group)
                a,b=GEO['sample'](old_tree,q.x,q.y),GEO['sample'](tree,q.x,q.y)
                if a is not None and b is not None:
                    for v in group:v.co.z+=b-a
            bm.to_mesh(ob.data);bm.free();ob.data.update()
        elif 'Broken_Pond_Ripples' in name:
            ob.hide_render=True;ob.hide_viewport=True
        elif 'Lily_Pads' in name:
            for v in ob.data.vertices:v.co.z-=.39
            ob.data.update()
    # Keep the accepted planted terraces and house geometry unchanged.
    return report


def build():
    name='UA_B_Atelier_FacetedRestored'
    if bpy.data.scenes.get(name):raise RuntimeError('Restored scene already exists.')
    source=bpy.data.scenes['UA_B_Atelier_Cohesion'];scene=source.copy();scene.name=name
    scene.compositing_node_group=source.compositing_node_group.copy()
    for n in scene.compositing_node_group.nodes:
        if n.type=='R_LAYERS':n.scene=scene
    mapping={}
    for cname in ('CO_PT_SH_UA_Shared_Corrected_Island','CO_PT_SH_UA_B_Atelier'):
        old=bpy.data.collections[cname];scene.collection.children.unlink(old);clone(old,scene.collection,mapping)
    common=bpy.data.collections['RF_CO_PT_SH_UA_Shared_Corrected_Island']
    house=bpy.data.collections['RF_CO_PT_SH_UA_B_Atelier']
    body=find(mapping,'Connected_Island');water=find(mapping,'Pond_Stream_and_Waterfall')
    old_tree=GEO['bvh'](body)
    body_report=restore_body(body);tree=GEO['bvh'](body)
    rows,cols=make_water(water,tree,body)
    water_report=bury_boundary(water,tree,rows,cols,body)
    contact_report=settle_scene(common,house,mapping,old_tree,tree)
    scene.camera=bpy.data.objects['SS_SH_Garden'];scene.render.resolution_x=1800;scene.render.resolution_y=1200
    cameras=API['collection']('RF_Review_Cameras',scene.collection)
    cam=API['BASE']['camera']('RF_Cliff',cameras,(34,-52,-2),(0,0,-4),48);cam.data.clip_end=6500
    if bpy.context.window:bpy.context.window.scene=scene
    # Use the scene's own light and sky, so the viewport matches the render.
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                space=area.spaces.active;space.shading.type='RENDERED'
                space.overlay.show_overlays=False
                space.region_3d.view_perspective='CAMERA'
    bpy.context.view_layer.update()
    path=ROOT/'atelier_faceted_restored.blend'
    if path.exists():raise FileExistsError(path)
    bpy.ops.wm.save_as_mainfile(filepath=str(path),check_existing=False)
    report={'scene':scene.name,'blend':str(path),'restoration':body_report,'terrain':API['audit_island'](body),
            'water':water_report,'terrain_contacts':contact_report,
            'changes':'Ground heights retained; angular sixteen-corner silhouette with six irregular cliff rings and original rock tones. Water recessed into basin with hidden boundaries and an outlet following the actual cliff rim. Soft depth gradient and floating ripple strokes removed.'}
    (ROOT/'faceted_restored_report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report


if __name__=='__main__':result=build()

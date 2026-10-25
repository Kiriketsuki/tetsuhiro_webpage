"""Shape kit and palette for the cozy interiors: flat-shaded, large-faceted furniture parts.

Every shape is a few clean facets. Colour comes from one flat palette colour per part plus one smooth
room-glow field, never from a per-face value."""
from pathlib import Path
import math,runpy
import bpy,bmesh
from mathutils import Vector,Matrix

ROOT=Path(__file__).resolve().parent
SS=runpy.run_path(str(ROOT.parent/'sanctuary-style-studies'/'build_studies.py'))
Batch=SS['Batch']

# One palette for the whole house. The wood, sage, ceramic, brass and charcoal values match the
# rooftop dining set and the telescope, so the interiors speak the same language as the terraces.
# Each name hits one export_island_b.py web family by pattern, so no new web material appears.
PALETTE={
    'oak':('CI_Oak_wood',(.40,.235,.12),.8,0),
    'walnut':('CI_Walnut_wood',(.18,.095,.05),.8,0),
    'floor':('CI_Floor_wood',(.17,.10,.06),.85,0),
    'ceiling':('CI_Ceiling_plaster',(.62,.55,.43),.9,0),
    'sage':('CI_Sage_Linen',(.17,.26,.23),.95,0),
    'oat':('CI_Oat_Linen',(.60,.52,.39),.95,0),
    'clay':('CI_Clay_Linen',(.34,.12,.07),.95,0),
    'dusk':('CI_Dusk_Linen',(.07,.11,.17),.95,0),
    'pine':('CI_Pine_Linen',(.05,.11,.06),.95,0),
    'rug_clay':('CI_Rug_Clay',(.30,.13,.08),.98,0),
    'rug_oat':('CI_Rug_Oat',(.46,.38,.27),.98,0),
    'ceramic':('CI_Warm_Ceramic',(.65,.61,.49),.7,0),
    'leaf':('CI_Plant_leaf',(.09,.20,.10),.88,0),
    'charcoal':('CI_Charcoal',(.018,.023,.027),.9,0),
    'brass':('CI_Aged_Brass',(.42,.27,.10),.3,.7),
    'steel':('CI_Blade_Brushed_Steel',(.50,.52,.53),.35,.8),
    'mustard':('CI_Mustard_paper',(.60,.40,.09),.8,0),
    'teal':('CI_Teal_paper',(.08,.22,.24),.8,0),
    'plum':('CI_Plum_paper',(.22,.08,.12),.8,0),
    'cream':('CI_Cream_paper',(.80,.72,.52),.8,0),
    'straw':('CI_Straw_paper',(.55,.42,.20),.9,0),
    'peg':('CI_Pegboard_Cork',(.50,.36,.21),.95,0),
}
# Shared materials that keep their own look: dark steel, the warm lamp glow and the screen glow.
SHARED={'metal':'LP_SS_A_metal','warm':'LP_SS_A_warm','screen':'LP_SS_A_screen'}
KEYS=list(PALETTE)+list(SHARED)
GLOW_TINT=(1.30,1.12,.92)

def node(nt,kind,**inputs):
    n=nt.nodes.new(kind)
    for k,v in inputs.items():n.inputs[k].default_value=v
    return n

def glow_group(lamps):
    """Builds one node group: a smooth warm falloff around each lamp, the strongest one wins.

    The export bakes base colour into COLOR_0, so this field carries the room light to the web."""
    g=bpy.data.node_groups.new('CI_Room_Glow','ShaderNodeTree')
    g.interface.new_socket('Factor',in_out='OUTPUT',socket_type='NodeSocketFloat')
    out=g.nodes.new('NodeGroupOutput');geo=g.nodes.new('ShaderNodeNewGeometry');total=None
    for p,radius,strength in lamps:
        d=node(g,'ShaderNodeVectorMath');d.operation='DISTANCE';d.inputs[1].default_value=p
        g.links.new(geo.outputs['Position'],d.inputs[0])
        r=node(g,'ShaderNodeMapRange');r.interpolation_type='SMOOTHSTEP'
        r.inputs['From Min'].default_value=0;r.inputs['From Max'].default_value=radius
        r.inputs['To Min'].default_value=strength;r.inputs['To Max'].default_value=0
        g.links.new(d.outputs['Value'],r.inputs['Value'])
        if total is None:total=r.outputs['Result'];continue
        m=node(g,'ShaderNodeMath');m.operation='MAXIMUM'
        g.links.new(total,m.inputs[0]);g.links.new(r.outputs['Result'],m.inputs[1]);total=m.outputs[0]
    g.links.new(total,out.inputs['Factor'])
    return g

def material(key,group):
    name,colour,rough,metal=PALETTE[key]
    m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*colour,1);nt=m.node_tree
    b=nt.nodes['Principled BSDF'];b.inputs['Roughness'].default_value=rough;b.inputs['Metallic'].default_value=metal
    warm=node(nt,'ShaderNodeMixRGB',Fac=1.0);warm.blend_type='MULTIPLY'
    warm.inputs['Color1'].default_value=(*colour,1);warm.inputs['Color2'].default_value=(*GLOW_TINT,1)
    mix=node(nt,'ShaderNodeMixRGB');mix.inputs['Color1'].default_value=(*colour,1)
    glow=nt.nodes.new('ShaderNodeGroup');glow.node_tree=group
    nt.links.new(glow.outputs['Factor'],mix.inputs['Fac']);nt.links.new(warm.outputs['Color'],mix.inputs['Color2'])
    nt.links.new(mix.outputs['Color'],b.inputs['Base Color'])
    return m

def palette(lamps):
    group=glow_group(lamps)
    mats={k:material(k,group) for k in PALETTE}
    mats.update({k:bpy.data.materials[v] for k,v in SHARED.items()})
    return [mats[k] for k in KEYS]

def rot_z(deg):return Matrix.Rotation(math.radians(deg),4,'Z')
def rot_x(deg):return Matrix.Rotation(math.radians(deg),4,'X')
def rot_y(deg):return Matrix.Rotation(math.radians(deg),4,'Y')

class Kit(Batch):
    """A Batch that names materials by palette key and records the contacts that the build checks.

    The level orders the checks: floors and ceilings (0) rest on the house, rugs (1) on the floors,
    and furniture (2) on either."""
    def __init__(self,name,coll,mats,contacts,level=2):
        super().__init__(name,coll,mats);self.contacts=contacts;self.level=level

    def k(self,key):return KEYS.index(key)

    def cube(self,c,s,key,rot=None):
        self.box(c,s,self.k(key),rot)

    def rod(self,a,b,w,key,d=None):
        self.beam(a,b,w,d,self.k(key))

    def faces(self,rings,key,cap=True):
        """Bridges equal-length vertex rings into side quads and caps both ends."""
        mat=self.k(key);n=len(rings[0])
        for r0,r1 in zip(rings,rings[1:]):
            for i in range(n):self.bm.faces.new((r0[i],r0[(i+1)%n],r1[(i+1)%n],r1[i])).material_index=mat
        if cap:
            self.bm.faces.new(list(reversed(rings[0]))).material_index=mat
            self.bm.faces.new(rings[-1]).material_index=mat

    def soft(self,c,s,key,ch=None,rot=None,both=False):
        """A cushion: a box whose top edges (and bottom edges with both=True) are chamfered."""
        sx,sy,sz=(v/2 for v in s);ch=min(sx,sy,sz)*.5 if ch is None else ch
        M=Matrix.Translation(Vector(c))@(rot if rot is not None else Matrix.Identity(4))
        prof=[(-sz,sx-ch,sy-ch),(-sz+ch,sx,sy)] if both else [(-sz,sx,sy)]
        prof+=[(sz-ch,sx,sy),(sz,sx-ch,sy-ch)]
        rings=[[self.bm.verts.new(M@Vector((x*a,y*b,z))) for x,y in ((-1,-1),(1,-1),(1,1),(-1,1))] for z,a,b in prof]
        self.faces(rings,key)

    def prism(self,a,b,r,key,n=8,r2=None,spin=0.0):
        """An n-sided prism or frustum from a to b."""
        a,b=Vector(a),Vector(b);axis=(b-a).normalized()
        u=axis.cross(Vector((0,0,1)))
        if u.length<.001:u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u).normalized();r2=r if r2 is None else r2
        ring=lambda c,rad:[self.bm.verts.new(c+rad*(math.cos(spin+i*math.tau/n)*u+math.sin(spin+i*math.tau/n)*v)) for i in range(n)]
        self.faces([ring(a,r),ring(b,r2)],key)

    def cone(self,a,b,r,key,n=8):
        """A cone from a base of radius r at a to a point at b."""
        a,b=Vector(a),Vector(b);axis=(b-a).normalized()
        u=axis.cross(Vector((0,0,1)))
        if u.length<.001:u=axis.cross(Vector((0,1,0)))
        u.normalize();v=axis.cross(u).normalized();mat=self.k(key)
        ring=[self.bm.verts.new(a+r*(math.cos(i*math.tau/n)*u+math.sin(i*math.tau/n)*v)) for i in range(n)]
        tip=self.bm.verts.new(b)
        for i in range(n):self.bm.faces.new((ring[i],ring[(i+1)%n],tip)).material_index=mat
        self.bm.faces.new(list(reversed(ring))).material_index=mat

    def leaf(self,base,tip,w,key,t=.012):
        """A flat diamond leaf: eight facets from base to tip, w wide."""
        base,tip=Vector(base),Vector(tip);d=tip-base;mid=base+d*.42
        side=d.cross(Vector((0,0,1)))
        if side.length<.001:side=Vector((1,0,0))
        side=side.normalized()*w/2;up=side.cross(d).normalized()*t
        b,p=self.bm.verts.new(base),self.bm.verts.new(tip)
        ring=[self.bm.verts.new(mid+o) for o in (side,up,-side,-up)];mat=self.k(key)
        for i in range(4):
            self.bm.faces.new((b,ring[(i+1)%4],ring[i])).material_index=mat
            self.bm.faces.new((p,ring[i],ring[(i+1)%4])).material_index=mat

    def slab(self,pts,z0,z1,key):
        """Extrudes a convex outline (xy pairs, counter-clockwise) from z0 to z1."""
        rings=[[self.bm.verts.new((x,y,z)) for x,y in pts] for z in (z0,z1)]
        self.faces(rings,key)

    def floor(self,label,*pts):
        for p in pts:self.contacts.append({'label':label,'kind':'floor','point':Vector(p),'level':self.level})

    def wall(self,label,p,direction):
        self.contacts.append({'label':label,'kind':'wall','point':Vector(p),'direction':Vector(direction),'level':self.level})

    def finish(self):
        bmesh.ops.recalc_face_normals(self.bm,faces=self.bm.faces)
        ob=super().finish()
        for p in ob.data.polygons:p.use_smooth=False
        return ob

def octagon(cx,cy,hx,hy,cut):
    """A rectangle outline with its four corners cut, counter-clockwise."""
    return [(cx-hx+cut,cy-hy),(cx+hx-cut,cy-hy),(cx+hx,cy-hy+cut),(cx+hx,cy+hy-cut),
            (cx+hx-cut,cy+hy),(cx-hx+cut,cy+hy),(cx-hx,cy+hy-cut),(cx-hx,cy-hy+cut)]

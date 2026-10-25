"""Room layouts for the cozy interiors: the project workshop, the lounge and the top-floor bedroom.

Each builder takes the measured room box R (inner wall planes L, R, F, B, finished floor Z and
ceiling C) and fills a main kit and a detail kit. The detail kit holds small items that the mobile
GLB leaves out. Each builder returns its lamp points for the baked room glow."""
from pathlib import Path
import math,random,runpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
KIT=runpy.run_path(str(ROOT/'cozy_kit.py'))
rot_x,rot_y,rot_z,octagon=KIT['rot_x'],KIT['rot_y'],KIT['rot_z'],KIT['octagon']

# Openings from the 25 October 2026 wall probe of Island_B_Rolling_Rim. Furniture keeps them clear.
WORKSHOP_DOOR_X=(-5.6,-4.4)
LIVING_FRONT_DOOR_X=(-7.3,-6.5)
LIVING_REAR_DOOR=(-4.55,1.0)    # the door zone starts at this x and runs 1.0 in from the rear wall
BEDROOM_FRONT_DOOR_X=(-4.7,-3.9)
REAR_WINDOW_X={'workshop':(-6.6,-4.5),'living':(-6.6,-4.5),'bedroom':(-6.1,-4.6)}
CLEAR_ZONES={  # (x0, x1, y0, y1) in world space, kept free of furniture from floor to head height
    'workshop':lambda R:[(WORKSHOP_DOOR_X[0],WORKSHOP_DOOR_X[1],R['F'],R['F']+1.3)],
    'living':lambda R:[(LIVING_FRONT_DOOR_X[0]-.15,LIVING_FRONT_DOOR_X[1]+.15,R['F'],R['F']+.9),
                       (LIVING_REAR_DOOR[0],R['R'],R['B']-LIVING_REAR_DOOR[1],R['B'])],
    'bedroom':lambda R:[(BEDROOM_FRONT_DOOR_X[0]-.25,BEDROOM_FRONT_DOOR_X[1]+.3,R['F'],R['F']+1.0)],
}

def box(R):return (R[k] for k in ('L','R','F','B','Z','C'))

def plant(kit,base,pot_r,pot_h,stem_h,leaves,length,seed,droop=False):
    """A potted plant. Leaves spread on the golden angle, so the crown reads as one even mass."""
    x,y,z=base;rng=random.Random(seed)
    kit.prism((x,y,z),(x,y,z+pot_h),pot_r*.8,'ceramic',n=8,r2=pot_r)
    kit.prism((x,y,z+pot_h-.03),(x,y,z+pot_h-.012),pot_r*.93,'walnut',n=8)
    if stem_h>.05:kit.rod((x,y,z+pot_h-.03),(x,y,z+pot_h+stem_h),.028,'walnut')
    for i in range(leaves):
        a=i*2.39996+rng.uniform(-.15,.15);t=i/max(leaves-1,1)
        h=z+pot_h+stem_h*(.35+.65*t) if stem_h>.05 else z+pot_h-.015
        lift=rng.uniform(-.75,-.35) if droop else rng.uniform(.25,.75)*(1.1-.5*t)
        d=Vector((math.cos(a),math.sin(a),lift)).normalized()*length*rng.uniform(.85,1.1)
        kit.leaf(Vector((x,y,h)),Vector((x,y,h))+d,length*.42,'leaf')

def books(kit,start,axis,face,z,depth,specs):
    """Stands a row of books from start along axis. specs holds (thickness, height, key) per book."""
    p=Vector(start);a=Vector(axis);f=Vector(face)
    for t,h,key in specs:
        size=Vector((abs(a.x)*t+abs(f.x)*depth,abs(a.y)*t+abs(f.y)*depth,h))
        kit.cube(p+a*(t/2)+Vector((0,0,z+h/2-p.z)),tuple(size),key);p+=a*(t+.004)
    return p

SPINES=('plum','mustard','teal','cream','clay','dusk','oat','sage')
def spines(n,seed,lo=.22,hi=.29,t=(.03,.05)):
    rng=random.Random(seed)
    return [(rng.uniform(*t),rng.uniform(lo,hi),SPINES[(i*3+seed)%len(SPINES)]) for i in range(n)]

def tapered(kit,top,bottom,top_half,bottom_half,key):
    """A four-sided frustum between two horizontal rectangles, for the hanging cloak."""
    rings=[]
    for c,(hx,hy) in ((Vector(bottom),bottom_half),(Vector(top),top_half)):
        rings.append([kit.bm.verts.new(c+Vector((x*hx,y*hy,0))) for x,y in ((-1,-1),(1,-1),(1,1),(-1,1))])
    kit.faces(rings,key)

def ceiling_cord(kit,x,y,C,z,label):
    # The ceiling plate is 15 mm thick, so the canopy overlaps it by 3 mm and never shares a face.
    kit.cube((x,y,C-.022),(.09,.09,.02),'walnut');kit.rod((x,y,C-.03),(x,y,z),.01,'charcoal')
    kit.wall(label,(x,y,C-.012),(0,0,1))

def office_chair(kit,x,y,Z):
    """A five-star office chair that faces +y, toward the desk."""
    for i in range(5):
        a=i*math.tau/5+.3;end=(x+.3*math.cos(a),y+.3*math.sin(a))
        kit.rod((x,y,Z+.08),(*end,Z+.06),.04,'charcoal');kit.cube((*end,Z+.025),(.05,.05,.05),'charcoal')
        kit.floor('chair caster',(*end,Z))
    kit.prism((x,y,Z+.06),(x,y,Z+.42),.03,'charcoal',n=6);kit.soft((x,y,Z+.46),(.5,.48,.08),'sage',ch=.03)
    kit.rod((x,y-.2,Z+.44),(x,y-.27,Z+.66),.04,'charcoal');kit.soft((x,y-.28,Z+.83),(.44,.07,.4),'sage',ch=.03,rot=rot_x(8))
    for s in (-1,1):
        kit.rod((x+s*.24,y-.05,Z+.46),(x+s*.24,y-.02,Z+.64),.025,'charcoal');kit.cube((x+s*.24,y,Z+.65),(.06,.24,.025),'charcoal')


# ---- workshop: projects ------------------------------------------------------------------------

def workshop(R,kit,det,cork):
    """One built-in oak worktop runs along the rear wall: a computer desk under the window and a
    maker bench under the project corkboard. A tool wall and open shelves stand on the left wall."""
    L,Rx,F,B,Z,C=box(R);top=Z+.74;x0,x1=L+.2,Rx-.05;y0=B-.64;yc=(y0+B)/2
    kit.cube(((x0+x1)/2,yc,top-.02),(x1-x0,.64,.04),'oak');kit.wall('worktop',((x0+x1)/2,B,top-.02),(0,1,0))
    px=x0+.23
    kit.cube((px,yc+.01,Z+.35),(.46,.6,.7),'oak');kit.floor('drawer pedestal',(px-.2,y0+.05,Z),(px+.2,y0+.05,Z))
    for i in range(3):
        kit.cube((px,y0+.02,Z+.13+i*.22),(.42,.02,.19),'walnut');det.cube((px,y0+.005,Z+.17+i*.22),(.12,.015,.018),'brass')
    xm=x0+2.46
    for y in (y0+.06,B-.06):kit.cube((xm,y,Z+.35),(.05,.05,.7),'metal');kit.floor('desk leg',(xm,y,Z))
    kit.cube((xm,yc,Z+.015),(.05,.58,.03),'metal');kit.cube((xm,yc,top-.065),(.05,.58,.05),'metal')
    # The right end is an open cabinet with two storage bins.
    rc=x1-.3
    for x in (x1-.59,x1-.01):kit.cube((x,yc,Z+.35),(.02,.62,.7),'oak');kit.floor('bench cabinet',(x,y0+.03,Z))
    kit.cube((rc,yc,Z+.06),(.56,.62,.04),'oak');kit.cube((rc,yc,Z+.36),(.56,.6,.025),'oak')
    kit.cube((rc,B-.01,Z+.35),(.56,.02,.7),'walnut')
    kit.cube((rc,yc,Z+.17),(.46,.48,.18),'clay');kit.cube((rc,yc,Z+.4625),(.46,.48,.18),'dusk')
    # Cables: one tray under the top, one riser down the leg and one strip on the floor.
    t0,t1=px+.25,xm-.05
    det.cube(((t0+t1)/2,B-.08,top-.065),(t1-t0,.1,.05),'charcoal')
    det.rod((xm-.06,B-.05,top-.09),(xm-.06,B-.05,Z+.04),.025,'charcoal')
    det.cube((xm-.25,B-.05,Z+.02),(.3,.06,.04),'charcoal');det.floor('power strip',(xm-.25,B-.05,Z))
    # Two monitors on one arm, angled in, under the window sill line.
    mx=(px+.23+xm)/2
    kit.prism((mx,B-.07,top),(mx,B-.07,top+.5),.022,'metal',n=6);kit.cube((mx,B-.07,top+.02),(.07,.09,.04),'metal')
    for side in (-1,1):
        r=rot_z(-side*8);c=Vector((mx+side*.3,B-.3,top+.3))
        kit.cube(c,(.56,.035,.33),'charcoal',r);kit.cube(c+r.to_3x3()@Vector((0,-.019,0)),(.52,.004,.29),'screen',r)
        kit.rod((mx,B-.07,top+.46),(c.x,B-.28,top+.32),.025,'metal')
        det.rod((c.x,B-.27,top+.2),(c.x-side*.05,B-.1,top-.04),.012,'charcoal')
    kit.cube((mx,y0+.22,top+.002),(.86,.32,.004),'dusk')
    kit.cube((mx-.06,y0+.21,top+.015),(.4,.14,.022),'charcoal')
    for dy in (-.045,-.015,.015,.045):det.cube((mx-.07,y0+.21+dy,top+.031),(.34,.022,.012),'cream')
    det.cube((mx-.255,y0+.255,top+.031),(.024,.022,.012),'clay');det.cube((mx+.12,y0+.195,top+.031),(.04,.05,.012),'mustard')
    det.soft((mx+.27,y0+.2,top+.019),(.06,.1,.03),'charcoal')
    office_chair(kit,mx,y0-.45,Z)
    # The brass desk lamp leans over the keyboard.
    lx,ly=xm-.2,B-.14;head=Vector((lx-.12,ly-.3,top+.47))
    kit.prism((lx,ly,top),(lx,ly,top+.025),.075,'brass',n=8)
    kit.rod((lx,ly,top+.02),(lx+.02,ly-.04,top+.4),.022,'brass');kit.rod((lx+.02,ly-.04,top+.4),head,.02,'brass')
    kit.prism(head,head-Vector((0,0,.11)),.035,'brass',n=8,r2=.08)
    kit.prism(head-Vector((0,0,.112)),head-Vector((0,0,.118)),.074,'warm',n=8)
    det.prism((x0+.62,y0+.16,top),(x0+.62,y0+.16,top+.09),.04,'ceramic',n=8)
    det.cube((x0+.86,y0+.2,top+.006),(.15,.21,.012),'cream',rot_z(-8))
    plant(det,(x0+.15,B-.17,top),.06,.11,0,6,.17,11)
    # Maker bench under the corkboard: everything stays below the board edge.
    bx=(xm+x1)/2
    kit.cube((bx-.15,y0+.25,top+.002),(.6,.4,.004),'sage')
    det.cube((bx-.22,y0+.25,top+.009),(.12,.08,.01),'teal');det.cube((bx-.02,y0+.27,top+.034),(.16,.11,.06),'oat')
    det.cube((x1-.2,B-.11,top+.1),(.32,.18,.2),'oak')
    for i in range(3):det.cube((x1-.2,B-.205,top+.04+i*.06),(.28,.012,.045),'cream')
    det.prism((x1-.56,B-.15,top+.083),(x1-.56,B-.06,top+.083),.09,'clay',n=8,spin=math.pi/8)
    det.prism((x1-.82,B-.1,top),(x1-.82,B-.1,top+.1),.04,'ceramic',n=8)
    for i,key in enumerate(('mustard','teal','clay')):det.rod((x1-.83+i*.012,B-.1,top+.05),(x1-.84+i*.02,B-.09,top+.17),.01,key)
    # A brass picture light above the corkboard keeps the projects lit.
    lo,hi=cork;cx=(lo.x+hi.x)/2;bar=Vector((cx,lo.y-.1,hi.z+.09))
    kit.cube(bar,(.72,.05,.035),'brass');kit.cube(bar-Vector((0,0,.021)),(.68,.035,.006),'warm')
    for dx in (-.25,.25):kit.rod((cx+dx,B,bar.z+.01),(cx+dx,bar.y,bar.z+.01),.018,'brass')
    kit.wall('picture light',(cx,B,bar.z),(0,1,0))
    # Linear pendant over the desk.
    pz=Z+2.15
    kit.cube((mx,B-.42,pz),(1.0,.1,.05),'walnut');kit.cube((mx,B-.42,pz-.028),(.94,.06,.006),'warm')
    for dx in (-.4,.4):ceiling_cord(kit,mx+dx,B-.42,C,pz+.025,'desk pendant')
    workshop_left_wall(L,F,B,Z,kit,det)
    plant(kit,(Rx-.33,F+.38,Z),.2,.38,.7,11,.38,5);kit.floor('floor plant',(Rx-.33,F+.38,Z))
    return [(head-Vector((0,0,.16)),1.7,.55),(Vector((mx,B-.42,pz-.1)),2.2,.32),(bar-Vector((0,0,.2)),1.1,.3)]

def workshop_left_wall(L,F,B,Z,kit,det):
    by=(F+B)/2
    kit.cube((L+.27,by,Z+.88),(.52,1.7,.04),'oak')
    for dx in (.05,.49):
        for dy in (-.8,.8):kit.cube((L+dx,by+dy,Z+.43),(.045,.045,.86),'metal');kit.floor('tool bench leg',(L+dx,by+dy,Z))
    kit.cube((L+.27,by,Z+.2),(.46,1.62,.025),'oak')
    det.cube((L+.27,by+.35,Z+.3025),(.22,.4,.18),'clay');det.rod((L+.27,by+.2,Z+.41),(L+.27,by+.5,Z+.41),.02,'charcoal')
    kit.cube((L+.008,by,Z+1.45),(.016,1.7,.94),'peg');kit.wall('pegboard',(L,by,Z+1.45),(-1,0,0))
    kit.cube((L+.07,by,Z+1.9325),(.14,1.7,.025),'oak')
    for i in range(4):det.prism((L+.07,by-.6+i*.4,Z+1.945),(L+.07,by-.6+i*.4,Z+2.03),.035,'ceramic',n=8)
    # Tools hang flat on the pegboard face.
    det.cube((L+.03,by-.6,Z+1.4),(.025,.03,.3),'oak');det.cube((L+.035,by-.6,Z+1.56),(.035,.12,.04),'steel')
    det.cube((L+.026,by-.4,Z+1.42),(.012,.035,.26),'steel');det.cube((L+.026,by-.33,Z+1.44),(.012,.03,.22),'steel')
    for i,key in enumerate(('mustard','clay','teal')):
        y=by-.15+i*.08;det.cube((L+.035,y,Z+1.6),(.03,.03,.1),key);det.cube((L+.03,y,Z+1.46),(.008,.008,.18),'steel')
    det.cube((L+.022,by+.35,Z+1.4),(.006,.36,.12),'steel');det.cube((L+.03,by+.58,Z+1.42),(.025,.1,.11),'walnut')
    det.rod((L+.03,by+.15,Z+1.2),(L+.03,by+.19,Z+1.42),.018,'clay');det.rod((L+.03,by+.23,Z+1.2),(L+.03,by+.19,Z+1.42),.018,'clay')
    det.soft((L+.045,by+.78,Z+1.7),(.05,.09,.09),'mustard')
    # Stool at the tool bench.
    sx,sy=L+.85,by+.2
    det.prism((sx,sy,Z+.6),(sx,sy,Z+.64),.17,'oak',n=8)
    for i in range(3):
        a=i*math.tau/3+.5;foot=(sx+.21*math.cos(a),sy+.21*math.sin(a),Z)
        det.rod((sx+.09*math.cos(a),sy+.09*math.sin(a),Z+.61),foot,.03,'walnut');det.floor('stool leg',foot)
    # Tall open shelves by the front glass.
    y0,y1=F+.2,F+1.25;ym=(y0+y1)/2
    for y in (y0+.01,y1-.01):kit.cube((L+.18,y,Z+.925),(.36,.02,1.85),'oak');kit.floor('open shelf',(L+.34,y,Z))
    for zb in (.03,.42,.82,1.22,1.62,1.835):kit.cube((L+.18,ym,Z+zb),(.36,y1-y0-.04,.025),'oak')
    kit.cube((L+.01,ym,Z+.94),(.02,y1-y0-.04,1.8),'walnut')
    kit.cube((L+.19,y0+.25,Z+.1425),(.3,.36,.2),'dusk');kit.cube((L+.19,y0+.68,Z+.1425),(.3,.36,.2),'oat')
    # A small 3D printer on the second shelf.
    pc=Vector((L+.19,y0+.36,Z+.4325))
    for dx in (-.13,.13):
        for dy in (-.13,.13):det.cube(pc+Vector((dx,dy,.15)),(.025,.025,.3),'charcoal')
    for dx,dy,sx_,sy_ in ((0,-.13,.29,.025),(0,.13,.29,.025),(-.13,0,.025,.29),(.13,0,.025,.29)):
        det.cube(pc+Vector((dx,dy,.3)),(sx_,sy_,.025),'charcoal')
    det.cube(pc+Vector((0,0,.08)),(.24,.24,.01),'metal');det.prism(pc+Vector((0,0,.085)),pc+Vector((0,0,.16)),.04,'clay',n=6)
    books(det,(L+.2,y0+.05,0),(0,1,0),(1,0,0),Z+.8325,.22,spines(12,3))
    for i,key in enumerate(('mustard','teal','cream')):det.cube((L+.2,y0+.1+i*.09,Z+1.2325+.15),(.26,.07,.3),key)
    plant(kit,(L+.18,ym,Z+1.8475),.08,.12,0,7,.2,19,droop=True)


# ---- lounge: living floor -------------------------------------------------------------------------

def lounge(R,kit,det):
    """A sage sofa under the rear window faces the front glass across a clay rug. A clay armchair, a
    reading lamp and a record console complete the room."""
    L,Rx,F,B,Z,C=box(R);sx=-5.75;sy=B-.44
    for dx in (-.97,.97):
        for dy in (-.36,.36):kit.cube((sx+dx,sy+dy,Z+.04),(.05,.05,.08),'walnut');kit.floor('sofa leg',(sx+dx,sy+dy,Z))
    kit.cube((sx,sy,Z+.18),(2.1,.88,.2),'sage')
    for s in (-1,1):kit.soft((sx+s*.97,sy,Z+.45),(.16,.88,.34),'sage',ch=.05)
    kit.cube((sx,B-.07,Z+.48),(1.78,.14,.4),'sage');kit.wall('sofa back',(sx,B,Z+.48),(0,1,0))
    for s in (-1,1):
        kit.soft((sx+s*.445,B-.52,Z+.34),(.88,.7,.12),'sage',ch=.04)
        kit.soft((sx+s*.445,B-.24,Z+.58),(.86,.16,.36),'sage',ch=.05,rot=rot_x(-10))
    kit.soft((sx-.62,B-.37,Z+.58),(.36,.12,.34),'clay',both=True,ch=.04,rot=rot_z(10)@rot_x(-18))
    kit.soft((sx+.66,B-.37,Z+.58),(.34,.12,.32),'oat',both=True,ch=.04,rot=rot_z(-12)@rot_x(-18))
    det.cube((sx+.97,B-.4,Z+.625),(.2,.5,.02),'oat');det.cube((sx+1.062,B-.4,Z+.47),(.02,.5,.32),'oat')
    # Coffee table on the rug. The rug is 12 mm thick.
    tx,ty=sx,B-1.7;rz=Z+.012
    for dx in (-.38,.38):
        for dy in (-.17,.17):kit.cube((tx+dx,ty+dy,rz+.17),(.045,.045,.34),'walnut');kit.floor('table leg',(tx+dx,ty+dy,rz))
    tt=rz+.38;kit.slab(octagon(tx,ty,.5,.28,.1),tt-.04,tt,'oak')
    det.cube((tx-.22,ty,tt+.015),(.22,.16,.03),'plum');det.cube((tx-.21,ty+.01,tt+.045),(.2,.15,.03),'mustard')
    det.prism((tx+.12,ty+.07,tt),(tx+.12,ty+.07,tt+.09),.04,'ceramic',n=8)
    det.prism((tx+.3,ty-.07,tt),(tx+.3,ty-.07,tt+.08),.035,'cream',n=8);det.cone((tx+.3,ty-.07,tt+.08),(tx+.3,ty-.07,tt+.115),.012,'warm',n=4)
    # Clay armchair on the left wall, turned to the table.
    ax,ay=L+.45,B-1.85
    for dx in (-.32,.32):
        for dy in (-.32,.32):kit.cube((ax+dx,ay+dy,Z+.05),(.05,.05,.1),'walnut');kit.floor('armchair leg',(ax+dx,ay+dy,Z))
    kit.cube((ax,ay,Z+.19),(.8,.8,.18),'clay');kit.soft((ax+.06,ay,Z+.34),(.6,.56,.12),'oat',ch=.04)
    kit.soft((ax-.3,ay,Z+.56),(.18,.78,.56),'clay',ch=.05,rot=rot_y(-8))
    for s in (-1,1):kit.soft((ax+.04,ay+s*.33,Z+.43),(.72,.14,.3),'clay',ch=.04)
    # Reading lamp with a glowing drum shade in the rear-left corner.
    lx,ly=L+.32,B-.42
    kit.prism((lx,ly,Z),(lx,ly,Z+.03),.14,'charcoal',n=8);kit.floor('reading lamp',(lx,ly,Z))
    kit.prism((lx,ly,Z+.03),(lx,ly,Z+1.32),.016,'brass',n=6);kit.prism((lx,ly,Z+1.3),(lx,ly,Z+1.58),.21,'warm',n=8,r2=.16)
    lounge_console(Rx,F,Z,kit,det)
    plant(kit,(Rx-.3,F+.32,Z),.19,.36,.6,10,.36,23);kit.floor('floor plant',(Rx-.3,F+.32,Z))
    # A small painted landscape above the armchair, in flat colour fields.
    kit.cube((L+.012,ay,Z+1.55),(.024,.74,.54),'walnut');kit.cube((L+.026,ay,Z+1.55),(.006,.66,.46),'cream')
    det.cube((L+.031,ay,Z+1.66),(.006,.66,.24),'dusk');det.cube((L+.032,ay-.1,Z+1.4),(.006,.46,.16),'sage')
    det.cube((L+.033,ay+.16,Z+1.42),(.006,.3,.12),'clay');det.cube((L+.034,ay+.18,Z+1.68),(.006,.08,.08),'mustard')
    kit.wall('painting',(L,ay,Z+1.55),(-1,0,0))
    # Woven pendant over the table.
    ceiling_cord(kit,tx,ty,C,Z+2.02,'lounge pendant')
    kit.prism((tx,ty,Z+2.02),(tx,ty,Z+1.82),.07,'oat',n=8,r2=.26);kit.prism((tx,ty,Z+1.818),(tx,ty,Z+1.812),.24,'warm',n=8)
    return [(Vector((lx,ly,Z+1.3)),2.1,.62),(Vector((tx,ty,Z+1.6)),2.4,.38),(Vector((tx+.3,ty-.07,tt+.1)),.7,.2)]

def lounge_console(Rx,F,Z,kit,det):
    """A low record console under the right window: books, records and a turntable for the music."""
    cx=Rx-.18;y0,y1=F+.8,F+2.55;cy=(y0+y1)/2;n=y1-y0
    for y in (y0+.04,y1-.04):
        for x in (cx-.14,cx+.14):kit.cube((x,y,Z+.04),(.04,.04,.08),'walnut');kit.floor('console leg',(x,y,Z))
    kit.cube((cx,cy,Z+.1),(.36,n,.04),'oak');kit.cube((cx,cy,Z+.6),(.36,n,.04),'oak')
    for y in (y0+.01,y0+n/3,y0+2*n/3,y1-.01):kit.cube((cx,y,Z+.35),(.36,.02,.46),'oak')
    kit.cube((Rx-.01,cy,Z+.35),(.02,n-.04,.46),'walnut');kit.wall('record console',(Rx,cy,Z+.35),(1,0,0))
    books(det,(cx-.02,y0+.03,0),(0,1,0),(1,0,0),Z+.12,.26,spines(9,7,.26,.36))
    books(det,(cx-.02,y0+2*n/3+.02,0),(0,1,0),(1,0,0),Z+.12,.26,spines(9,9,.26,.36))
    rng=random.Random(4)
    for i in range(8):det.cube((cx-.01,y0+n/3+.05+i*.06,Z+.12+.155),(.31,.012,.31),SPINES[rng.randrange(len(SPINES))])
    pz=Z+.62;pc=Vector((cx,cy,pz))
    kit.cube(pc+Vector((0,0,.035)),(.3,.38,.07),'walnut');kit.prism(pc+Vector((0,.03,.07)),pc+Vector((0,.03,.082)),.13,'charcoal',n=10)
    det.prism(pc+Vector((0,.03,.082)),pc+Vector((0,.03,.086)),.04,'mustard',n=8);det.rod(pc+Vector((.1,-.14,.1)),pc+Vector((.03,-.01,.09)),.012,'brass')
    for y in (y0+.11,y1-.11):kit.cube((cx,y,pz+.12),(.18,.15,.24),'charcoal')


# ---- bedroom: personal space --------------------------------------------------------------------

def bedroom(R,kit,det,light):
    """The bed sits against the left wall, a window seat under the rear window and a keepsake shelf in
    the rear-left corner, where the site's bedroom camera looks in through the front window. Stylised
    keepsakes stand for the interests that the dodecahedron showed."""
    L,Rx,F,B,Z,C=box(R);Yc=3.42
    for dx in (.06,1.94):
        for dy in (-.72,.72):kit.cube((L+dx,Yc+dy,Z+.05),(.06,.06,.1),'walnut');kit.floor('bed leg',(L+dx,Yc+dy,Z))
    kit.cube((L+1,Yc,Z+.2),(2,1.56,.2),'oak');kit.soft((L+1,Yc,Z+.4),(1.94,1.48,.2),'oat',ch=.05)
    kit.soft((L+1.31,Yc,Z+.525),(1.38,1.6,.09),'dusk',ch=.03)
    for s in (-1,1):kit.cube((L+1.31,Yc+s*.79,Z+.43),(1.38,.02,.2),'dusk')
    kit.soft((L+1.78,Yc,Z+.595),(.36,1.64,.05),'clay',ch=.015)
    for s in (-1,1):kit.soft((L+.27,Yc+s*.36,Z+.57),(.32,.62,.14),'cream',both=True,ch=.04,rot=rot_y(-14))
    kit.cube((L+.025,Yc,Z+.525),(.05,1.66,1.05),'oak');kit.floor('headboard',(L+.025,Yc,Z));kit.wall('headboard',(L,Yc,Z+.5),(-1,0,0))
    kit.soft((L+.08,Yc,Z+.78),(.06,1.48,.5),'sage',ch=.02)
    # Nightstand and bedside lamp on the front side of the bed, so the lamp glows at the front window.
    nx,ny=L+.24,Yc-1.08
    kit.cube((nx,ny,Z+.02),(.4,.38,.04),'walnut');kit.cube((nx,ny,Z+.28),(.44,.42,.48),'oak')
    kit.floor('nightstand',(nx-.18,ny-.17,Z),(nx+.18,ny+.17,Z))
    kit.cube((nx+.225,ny,Z+.38),(.01,.36,.16),'walnut');det.cube((nx+.235,ny,Z+.38),(.015,.1,.015),'brass')
    lamp=Vector((nx-.03,ny-.07,Z+.52))
    kit.prism(lamp,lamp+Vector((0,0,.22)),.07,'ceramic',n=8,r2=.045);kit.prism(lamp+Vector((0,0,.2)),lamp+Vector((0,0,.38)),.16,'warm',n=8,r2=.11)
    light(tuple(lamp+Vector((0,0,.3))))
    det.cube((nx+.06,ny+.1,Z+.535),(.22,.16,.03),'teal');det.soft((nx+.06,ny+.1,Z+.57),(.15,.1,.04),'charcoal',both=True,ch=.012)
    window_seat(R,kit,det);keepsake_shelf(R,kit,det);bedroom_walls(R,Yc,kit,det)
    # Music and gym in the rear-right corner: a guitar on its stand and a pair of dumbbells.
    gx,gy=Rx-.42,B-.3
    for dx in (-.12,.12):kit.rod((gx+dx,gy+.05,Z),(gx,gy,Z+.2),.025,'charcoal');kit.floor('guitar stand',(gx+dx,gy+.05,Z))
    kit.cube((gx,gy,Z+.2),(.2,.08,.03),'charcoal')
    kit.prism((gx,gy-.045,Z+.4),(gx,gy+.045,Z+.4),.19,'straw',n=8,spin=math.pi/8);kit.prism((gx,gy-.04,Z+.65),(gx,gy+.04,Z+.65),.14,'straw',n=8,spin=math.pi/8)
    det.prism((gx,gy-.05,Z+.53),(gx,gy-.046,Z+.53),.05,'charcoal',n=8)
    kit.rod((gx,gy,Z+.76),(gx,B-.08,Z+1.28),.05,'walnut',.025);kit.cube((gx,B-.065,Z+1.36),(.07,.03,.16),'walnut',rot_x(-8))
    for dy in (-.62,-.82):
        y=B+dy;r=.06;z=Z+r*.866
        kit.rod((-4.95,y,z),(-4.63,y,z),.025,'steel')
        for x in (-4.9,-4.68):kit.prism((x-.025,y,z),(x+.025,y,z),r,'charcoal',n=6)
        kit.floor('dumbbell',(-4.9,y,Z),(-4.68,y,Z))
    ceiling_cord(kit,-5.0,3.6,C,Z+2.3,'paper lantern')
    kit.prism((-5.0,3.6,Z+2.3),(-5.0,3.6,Z+2.16),.06,'cream',n=8,r2=.17);kit.prism((-5.0,3.6,Z+2.16),(-5.0,3.6,Z+1.98),.17,'cream',n=8,r2=.07)
    kit.prism((-5.0,3.6,Z+1.978),(-5.0,3.6,Z+1.972),.065,'warm',n=8)
    return [(lamp+Vector((0,0,.28)),1.9,.62),(Vector((-5.0,3.6,Z+1.9)),2.4,.3)]

def window_seat(R,kit,det):
    L,Rx,F,B,Z,C=box(R);wx0,wx1=REAR_WINDOW_X['bedroom'][0]-.05,REAR_WINDOW_X['bedroom'][1]+.05;wc=(wx0+wx1)/2;w=wx1-wx0
    kit.cube((wc,B-.22,Z+.04),(w,.42,.08),'walnut');kit.floor('window seat',(wx0+.05,B-.4,Z),(wx1-.05,B-.4,Z))
    kit.cube((wc,B-.23,Z+.38),(w,.46,.04),'oak');kit.wall('window seat',(wc,B,Z+.2),(0,1,0))
    for x in (wx0+.01,wc,wx1-.01):kit.cube((x,B-.23,Z+.22),(.02,.44,.28),'oak')
    kit.cube((wc,B-.01,Z+.22),(w-.04,.02,.28),'walnut');kit.cube((wc-w/4,B-.45,Z+.22),(w/2-.04,.02,.28),'walnut')
    det.prism((wc-w/4,B-.46,Z+.22),(wc-w/4,B-.48,Z+.22),.018,'brass',n=6)
    books(det,(wc+.04,B-.25,0),(1,0,0),(0,1,0),Z+.08,.17,spines(14,5,.18,.24,(.025,.035)))
    kit.soft((wc,B-.24,Z+.44),(w-.04,.44,.08),'sage',ch=.03)
    kit.soft((wx0+.24,B-.12,Z+.62),(.34,.12,.3),'clay',both=True,ch=.04,rot=rot_z(8)@rot_x(-12))
    kit.soft((wx1-.24,B-.12,Z+.62),(.34,.12,.3),'dusk',both=True,ch=.04,rot=rot_z(-8)@rot_x(-12))
    # Headphones for the music, and a handheld console.
    for x in (wc+.05,wc+.25):det.prism((x,B-.28,Z+.48),(x,B-.28,Z+.515),.045,'teal',n=8)
    pts=[(wc+.05,B-.28),(wc+.09,B-.19),(wc+.21,B-.19),(wc+.25,B-.28)]
    for a,b in zip(pts,pts[1:]):det.rod((*a,Z+.5),(*b,Z+.5),.02,'charcoal')
    det.soft((wc-.35,B-.26,Z+.491),(.22,.09,.022),'charcoal',both=True,ch=.008);det.cube((wc-.35,B-.26,Z+.503),(.1,.06,.003),'screen')

def keepsake_shelf(R,kit,det):
    """Tall shelf of keepsakes, one or two interests per shelf. Each piece is a plain stylised object,
    never a logo or game art."""
    L,Rx,F,B,Z,C=box(R);x0=L;x1=REAR_WINDOW_X['bedroom'][0]-.07;xc=(x0+x1)/2;w=x1-x0;y=B-.17
    levels=(.04,.4,.74,1.08,1.42,1.86,2.13)
    for x in (x0+.01,x1-.01):kit.cube((x,B-.16,Z+1.075),(.02,.32,2.15),'oak');kit.floor('keepsake shelf',(x,B-.3,Z))
    for zb in levels:kit.cube((xc,B-.16,Z+zb),(w-.04,.32,.025),'oak')
    kit.cube((xc,B-.17,Z+.014),(w-.04,.3,.028),'walnut');kit.cube((xc,B-.008,Z+1.08),(w-.04,.016,2.1),'walnut')
    kit.wall('keepsake shelf',(xc,B,Z+1.08),(0,1,0))
    S=[Z+zb+.0125 for zb in levels];a,b=x0+w*.3,x0+w*.73
    # The Greatest Estate Developer: manhwa volumes. Games: four cases.
    p=books(det,(x0+.04,y,0),(1,0,0),(0,1,0),S[0],.18,spines(10,2,.24,.3,(.028,.036)))
    books(det,(p.x+.03,y,0),(1,0,0),(0,1,0),S[0],.17,[(.016,.21,k) for k in ('mustard','teal','plum','clay')])
    # TFT: a hex board with a knight and a pawn.
    hx=xc;kit.prism((hx,y,S[1]),(hx,y,S[1]+.03),.18,'teal',n=6)
    kit.prism((hx-.04,y,S[1]+.03),(hx-.04,y,S[1]+.055),.045,'cream',n=8);kit.cone((hx-.04,y,S[1]+.055),(hx-.04,y,S[1]+.18),.04,'cream',n=6)
    kit.cube((hx-.04,y-.02,S[1]+.19),(.04,.09,.06),'cream',rot_x(-25));kit.cone((hx+.09,y+.05,S[1]+.03),(hx+.09,y+.05,S[1]+.11),.03,'mustard',n=6)
    # Nergigante: a dark spiked dragon head. Crusader Kings: a crown on a cushion.
    dx=a;kit.cube((dx,y,S[2]+.015),(.15,.15,.03),'walnut');kit.soft((dx,y,S[2]+.1),(.13,.26,.13),'charcoal',ch=.04,rot=rot_x(12))
    for sxy,tip in (((-.04,.08),(-.08,.18,.27)),((.04,.08),(.08,.18,.27)),((-.033,.0),(-.09,.06,.23)),((.033,.0),(.09,.06,.23))):
        kit.cone((dx+sxy[0],y+sxy[1],S[2]+.14),(dx+tip[0],y+tip[1],S[2]+tip[2]),.02,'cream',n=4)
    cx=b;kit.soft((cx,y,S[2]+.035),(.2,.2,.07),'plum',both=True,ch=.025);kit.prism((cx,y,S[2]+.065),(cx,y,S[2]+.13),.075,'brass',n=8)
    for i in range(5):
        t=i*math.tau/5+.3;q=(cx+.068*math.cos(t),y+.068*math.sin(t))
        kit.cone((*q,S[2]+.125),(*q,S[2]+.185),.022,'brass',n=4)
    det.cube((cx,y-.076,S[2]+.1),(.026,.008,.026),'clay')
    # Anno 1800: a paddle steamer on a stand.
    bx=xc;kit.cube((bx,y,S[3]+.015),(.08,.04,.03),'brass');kit.slab(octagon(bx,y,.24,.065,.06),S[3]+.03,S[3]+.09,'walnut')
    kit.cube((bx,y,S[3]+.107),(.32,.085,.035),'cream')
    for d in (-.04,.06):kit.prism((bx+d,y,S[3]+.12),(bx+d,y,S[3]+.25),.026,'clay',n=8)
    for s in (-1,1):kit.prism((bx,y+s*.07,S[3]+.085),(bx,y+s*.11,S[3]+.085),.055,'charcoal',n=8)
    # Elden Ring: a golden tree. Tears of the Kingdom: a floating island model.
    gx=a;kit.prism((gx,y,S[4]),(gx,y,S[4]+.02),.07,'walnut',n=8);kit.rod((gx,y,S[4]+.02),(gx,y,S[4]+.17),.025,'brass')
    kit.cone((gx,y,S[4]+.13),(gx,y,S[4]+.31),.14,'brass',n=8);kit.cone((gx,y,S[4]+.24),(gx,y,S[4]+.36),.095,'brass',n=8)
    fx=b;kit.prism((fx,y,S[4]),(fx,y,S[4]+.015),.06,'walnut',n=8);kit.rod((fx,y,S[4]+.015),(fx,y,S[4]+.13),.014,'brass')
    kit.cone((fx,y,S[4]+.28),(fx,y,S[4]+.11),.12,'metal',n=7);kit.prism((fx,y,S[4]+.28),(fx,y,S[4]+.305),.125,'sage',n=7)
    kit.cone((fx+.04,y,S[4]+.305),(fx+.04,y,S[4]+.4),.045,'leaf',n=6)
    # The Greatest Estate Developer again: a small castle. Victoria 3: a top hat, on the top board.
    kx=a-.02;top=S[6];kit.cube((kx,y,top+.09),(.14,.12,.18),'cream')
    for s in (-1,1):
        kit.prism((kx+s*.1,y,top),(kx+s*.1,y,top+.24),.042,'cream',n=6);kit.cone((kx+s*.1,y,top+.24),(kx+s*.1,y,top+.33),.055,'clay',n=6)
    tx=b+.02;kit.prism((tx,y,top),(tx,y,top+.014),.14,'charcoal',n=10);kit.prism((tx,y,top+.014),(tx,y,top+.18),.085,'charcoal',n=10,r2=.09)
    kit.prism((tx,y,top+.024),(tx,y,top+.06),.089,'plum',n=10)

def bedroom_walls(R,Yc,kit,det):
    L,Rx,F,B,Z,C=box(R)
    # God of War and Breath of the Wild: a round shield with a crossed sword and axe above the bed.
    c=Vector((L+.015,Yc,Z+1.62));s,k=math.sin(math.radians(38)),math.cos(math.radians(38))
    a=Vector((0,-s,k));kit.cube(c+a*.14,(.012,.065,.84),'steel',rot_x(38));kit.cube(c-a*.29,(.02,.2,.035),'brass',rot_x(38))
    kit.cube(c-a*.4,(.025,.04,.18),'teal',rot_x(38));kit.cube(c-a*.51,(.045,.045,.045),'brass',rot_x(38))
    b=Vector((0,s,k));p=Vector((0,k,-s))
    kit.cube(c-b*.04,(.03,.04,1.0),'walnut',rot_x(-38));kit.cube(c+b*.38+p*.09,(.02,.22,.18),'steel',rot_x(-38))
    kit.prism((L+.024,Yc,Z+1.62),(L+.054,Yc,Z+1.62),.27,'walnut',n=10);kit.prism((L+.054,Yc,Z+1.62),(L+.074,Yc,Z+1.62),.06,'brass',n=8)
    kit.cube((L+.056,Yc,Z+1.62),(.008,.5,.035),'brass');kit.cube((L+.056,Yc,Z+1.62),(.008,.035,.5),'brass')
    kit.wall('shield and blades',(L,Yc,Z+1.62),(-1,0,0))
    # Where Winds Meet: a bamboo hat and a slim jian on pegs by the door.
    hy=F+.65
    kit.cube((Rx-.03,hy,Z+1.78),(.06,.03,.03),'walnut');kit.cone((Rx-.012,hy,Z+1.55),(Rx-.15,hy,Z+1.55),.25,'straw',n=10)
    for d in (-.2,.2):kit.cube((Rx-.02,hy+d,Z+1.155),(.04,.02,.02),'walnut')
    kit.cube((Rx-.03,hy,Z+1.18),(.012,.62,.03),'steel');kit.cube((Rx-.03,hy-.33,Z+1.18),(.025,.03,.1),'brass')
    kit.cube((Rx-.03,hy-.42,Z+1.18),(.025,.16,.03),'plum');det.cube((Rx-.03,hy-.52,Z+1.12),(.02,.02,.1),'clay')
    kit.wall('bamboo hat',(Rx,hy,Z+1.55),(1,0,0))
    # Attack on Titan: a dark green cloak on a hook.
    cy=B-.66
    kit.cube((Rx-.03,cy,Z+1.78),(.06,.03,.03),'walnut');kit.soft((Rx-.07,cy,Z+1.66),(.12,.24,.18),'pine',ch=.04)
    tapered(kit,(Rx-.05,cy,Z+1.62),(Rx-.08,cy,Z+.78),(.04,.13),(.07,.24),'pine');kit.wall('cloak',(Rx,cy,Z+1.3),(1,0,0))

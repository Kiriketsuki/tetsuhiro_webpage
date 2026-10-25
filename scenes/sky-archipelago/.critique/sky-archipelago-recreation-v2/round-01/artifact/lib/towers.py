"""Towers: twelve hero designs with their own massing, facade and crown, plus a kit for far towers.

Window cells in the shader sit on a BAY by STOREY grid in object space. Fins, bands and panels
use the same grid, so every lit window sits between real frames."""
import random
from math import pi, cos, sin, atan2, sqrt
import bpy
import bmesh
from mathutils import Vector
from . import util
from .materials import BAY, STOREY

MATS = ['Tower_Window', 'Tower_Curtain_Glass', 'Tower_Stone', 'Tower_Metal', 'Tower_Concrete',
        'Aircraft_Light', 'Lamp_Glow', 'Roof_Tile', 'Neon_Sign']
WIN, CUR, STONE, METAL, CONC, RED, GLOW, ROOF, NEON = range(9)
FRAME = {'grid': STONE, 'ribbed': STONE, 'curtain': METAL, 'banded': CONC, 'piers': CONC,
         'balcony': CONC, 'diagrid': METAL, 'panel': STONE, 'louvre': METAL}
INSET = 0.45


def snap(x):
    return round(x / (2 * BAY)) * 2 * BAY


# ---------------------------------------------------------------- facades

def facade_box(bm, cx, cy, z0, w, d, h, kind, rnd):
    fr = FRAME[kind]
    glass = CUR if kind in ('curtain', 'diagrid', 'louvre') else WIN
    util.box(bm, (cx, cy, z0), (w - 2 * INSET, d - 2 * INSET, h), glass)
    for sx in (-1, 1):
        for sy in (-1, 1):
            util.box(bm, (cx + sx * (w / 2 - 0.5), cy + sy * (d / 2 - 0.5), z0), (1.0, 1.0, h), fr)
    storeys = max(1, int(h / STOREY))
    fin_step = {'ribbed': 1, 'grid': 1, 'curtain': 1, 'panel': 1, 'piers': 3, 'banded': 2}.get(kind)
    fin_t = {'ribbed': 0.42, 'grid': 0.22, 'curtain': 0.08, 'panel': 0.2, 'piers': 1.1, 'banded': 0.1}.get(kind)
    fin_d = {'ribbed': INSET + 0.75, 'piers': INSET + 0.55}.get(kind, INSET + 0.06)
    if fin_step:
        nx, ny = int(round(w / BAY)), int(round(d / BAY))
        for i in range(fin_step, nx, fin_step):
            x = cx - w / 2 + i * BAY
            for sy in (-1, 1):
                util.box(bm, (x, cy + sy * (d / 2 - INSET + fin_d / 2 - 0.02), z0), (fin_t, fin_d, h), fr)
        for j in range(fin_step, ny, fin_step):
            y = cy - d / 2 + j * BAY
            for sx in (-1, 1):
                util.box(bm, (cx + sx * (w / 2 - INSET + fin_d / 2 - 0.02), y, z0), (fin_d, fin_t, h), fr)
    band = {'grid': (1, 0.4, 0.05), 'ribbed': (3, 0.6, 0.15), 'curtain': (1, 0.14, 0.02), 'banded': (1, 1.25, 0.1),
            'piers': (1, 0.3, 0.05), 'balcony': (1, 0.35, 0.05), 'diagrid': (4, 0.3, 0.05), 'panel': (1, 0.35, 0.04),
            'louvre': (1, 0.2, 0.02)}[kind]
    every, bh, bp = band
    for k in range(every, storeys, every):
        util.box(bm, (cx, cy, z0 + k * STOREY - bh / 2), (w + 2 * bp, d + 2 * bp, bh), fr)
    if kind == 'balcony':
        for k in range(1, storeys):
            z = z0 + k * STOREY
            for sy in (-1, 1):
                util.box(bm, (cx, cy + sy * (d / 2 + 0.7), z - 0.1), (w * 0.86, 1.4, 0.22), CONC)
                util.box(bm, (cx, cy + sy * (d / 2 + 1.38), z + 0.1), (w * 0.86, 0.05, 1.0), METAL)
            for sx in (-1, 1):
                util.box(bm, (cx + sx * (w / 2 + 0.7), cy, z - 0.1), (1.4, d * 0.86, 0.22), CONC)
                util.box(bm, (cx + sx * (w / 2 + 1.38), cy, z + 0.1), (0.05, d * 0.86, 1.0), METAL)
    if kind == 'louvre':
        for k in range(int(h / 0.9)):
            util.box(bm, (cx, cy, z0 + k * 0.9), (w + 1.2, d + 1.2, 0.07), METAL)
    if kind == 'panel':
        nx, ny = int(round(w / BAY)), int(round(d / BAY))
        for k in range(storeys):
            for i in range(nx):
                if rnd.random() < 0.28:
                    x = cx - w / 2 + (i + 0.5) * BAY
                    for sy in (-1, 1):
                        util.box(bm, (x, cy + sy * (d / 2 - INSET + 0.15), z0 + k * STOREY + 0.2), (BAY - 0.22, 0.3, STOREY - 0.4), STONE)
    if kind == 'diagrid':
        mod_h, mod_w = 4 * STOREY, 4 * BAY
        for face in range(4):
            fw = w if face < 2 else d
            sgn = 1 if face % 2 == 0 else -1
            for zz in range(int(h / mod_h)):
                for i in range(int(fw / mod_w)):
                    u0 = -fw / 2 + i * mod_w
                    pts = [(u0, zz * mod_h), (u0 + mod_w / 2, (zz + 1) * mod_h), (u0 + mod_w, zz * mod_h)]
                    for (ua, za), (ub, zb) in zip(pts, pts[1:]):
                        if face < 2:
                            a = (cx + ua, cy + sgn * (d / 2 + 0.15), z0 + za)
                            b = (cx + ub, cy + sgn * (d / 2 + 0.15), z0 + zb)
                        else:
                            a = (cx + sgn * (w / 2 + 0.15), cy + ua, z0 + za)
                            b = (cx + sgn * (w / 2 + 0.15), cy + ub, z0 + zb)
                        util.box_between(bm, a, b, 0.45, mi=METAL)


def facade_round(bm, cx, cy, z0, r, h, kind, sides=48):
    fr = FRAME.get(kind, METAL)
    util.cylinder(bm, (cx, cy, z0), r - INSET, h, segments=sides, mi=CUR if kind == 'curtain' else WIN)
    storeys = max(1, int(h / STOREY))
    for k in range(1, storeys):
        util.cylinder(bm, (cx, cy, z0 + k * STOREY - 0.17), r + 0.05, 0.34, segments=sides, mi=fr)
    fins = sides if sides <= 12 else max(12, int(2 * pi * r / (BAY * (2 if kind == 'curtain' else 1))))
    for i in range(fins):
        a = 2 * pi * i / fins + (pi / sides if sides <= 12 else 0)
        rr = r - INSET / 2 + 0.05
        util.box(bm, (cx + cos(a) * rr, cy + sin(a) * rr, z0), (INSET + 0.1, 0.2 if sides > 12 else 0.6, h), fr, rot=a)


# ---------------------------------------------------------------- crowns

def crown(bm, kind, cx, cy, z, w, rnd, lights):
    """Adds the crown. Returns the top height. Appends aircraft light points to lights."""
    top = z
    if kind == 'spire':
        util.box(bm, (cx, cy, z), (w * 0.6, w * 0.6, 4), STONE)
        util.cylinder(bm, (cx, cy, z + 4), w * 0.25, w * 2.6, segments=8, mi=METAL, radius_top=0.15)
        top = z + 4 + w * 2.6
    elif kind == 'lantern':
        util.cylinder(bm, (cx, cy, z), w * 0.42, 2.5, segments=8, mi=STONE)
        util.cylinder(bm, (cx, cy, z + 2.5), w * 0.36, w * 0.5, segments=8, mi=GLOW)
        for i in range(8):
            a = 2 * pi * i / 8 + pi / 8
            util.box(bm, (cx + cos(a) * w * 0.36, cy + sin(a) * w * 0.36, z + 2.5), (0.5, 0.5, w * 0.5), METAL, rot=a)
        util.cylinder(bm, (cx, cy, z + 2.5 + w * 0.5), w * 0.42, w * 0.35, segments=8, mi=METAL, radius_top=0.4)
        top = z + 2.5 + w * 0.85
    elif kind == 'stepped':
        s = w
        for k in range(4):
            util.box(bm, (cx, cy, z + k * 3.0), (s, s, 3.0), STONE)
            s *= 0.72
        top = z + 12
    elif kind == 'flat_plant':
        for _ in range(5):
            util.box(bm, (cx + rnd.uniform(-.3, .3) * w, cy + rnd.uniform(-.3, .3) * w, z), (rnd.uniform(2, 5),) * 2 + (rnd.uniform(1.5, 4),), CONC)
        util.cylinder(bm, (cx + w * 0.3, cy - w * 0.25, z), 1.5, 3.5, segments=16, mi=METAL)
        top = z + 4
    elif kind == 'finials':
        for sx in (-1, 1):
            for sy in (-1, 1):
                util.cylinder(bm, (cx + sx * w * 0.42, cy + sy * w * 0.42, z), 0.9, 9.0, segments=8, mi=STONE, radius_top=0.1)
        util.cylinder(bm, (cx, cy, z), w * 0.22, 16, segments=8, mi=STONE, radius_top=0.1)
        top = z + 16
    elif kind == 'pyramid':
        util.cylinder(bm, (cx, cy, z), w * 0.72, w * 0.8, segments=4, mi=METAL, radius_top=0.2)
        top = z + w * 0.8
    elif kind == 'dome':
        util.sphere(bm, (cx, cy, z), w * 0.42, mi=METAL, subdiv=3, scale=(1, 1, 0.8))
        for i in range(12):
            a = 2 * pi * i / 12
            util.box(bm, (cx + cos(a) * w * 0.4, cy + sin(a) * w * 0.4, z), (0.4, 0.6, w * 0.2), STONE, rot=a)
        util.cylinder(bm, (cx, cy, z + w * 0.33), 0.4, 6, segments=8, mi=METAL, radius_top=0.05)
        top = z + w * 0.33 + 6
    elif kind == 'mast':
        util.box(bm, (cx, cy, z), (w * 0.5, w * 0.5, 3), CONC)
        util.cylinder(bm, (cx, cy, z + 3), 0.9, 38, segments=8, mi=METAL, radius_top=0.25)
        for k in range(3):
            util.cylinder(bm, (cx, cy, z + 10 + k * 8), 2.2 - k * 0.5, 0.4, segments=12, mi=METAL)
        top = z + 41
    elif kind == 'clock':
        util.box(bm, (cx, cy, z), (w * 0.55, w * 0.55, w * 0.5), STONE)
        for sx, sy, rot in ((0, -1, 0), (0, 1, 0), (-1, 0, pi / 2), (1, 0, pi / 2)):
            util.cylinder(bm, (cx + sx * w * 0.28, cy + sy * w * 0.28, z + w * 0.12), w * 0.15, 0.2, segments=24, mi=GLOW)
        util.cylinder(bm, (cx, cy, z + w * 0.5), w * 0.38, w * 0.4, segments=4, mi=ROOF, radius_top=0.2)
        top = z + w * 0.9
    elif kind == 'twin_spires':
        for sx in (-1, 1):
            util.box(bm, (cx + sx * w * 0.25, cy, z), (w * 0.3, w * 0.3, 6), STONE)
            util.cylinder(bm, (cx + sx * w * 0.25, cy, z + 6), w * 0.15, w * 1.8, segments=8, mi=STONE, radius_top=0.1)
        top = z + 6 + w * 1.8
    elif kind == 'halo':
        util.cylinder(bm, (cx, cy, z), w * 0.3, 8, segments=24, mi=METAL)
        for i in range(32):
            a = 2 * pi * i / 32
            util.box(bm, (cx + cos(a) * w * 0.55, cy + sin(a) * w * 0.55, z + 6), (1.2, 0.5, 0.8), GLOW if i % 2 else METAL, rot=a)
        top = z + 8
    elif kind == 'pagoda':
        s = w * 0.9
        zz = z
        for k in range(3):
            util.box(bm, (cx, cy, zz), (s * 0.6, s * 0.6, 3.2), STONE)
            util.cylinder(bm, (cx, cy, zz + 3.2), s * 0.62, 1.4, segments=4, mi=ROOF, radius_top=s * 0.35)
            zz += 4.6
            s *= 0.75
        util.cylinder(bm, (cx, cy, zz), 0.3, 6, segments=8, mi=METAL, radius_top=0.05)
        top = zz + 6
    lights.append(Vector((cx, cy, top + 0.4)))
    return top


# ---------------------------------------------------------------- massing

def build_tower(name, collection, loc, design, rnd):
    bm = bmesh.new()
    lights = []
    m, f, c, w, h = design['massing'], design['facade'], design['crown'], snap(design['w']), design['h']
    z = 0.0
    if m == 'slab':
        d = snap(w * 0.45)
        facade_box(bm, 0, 0, 0, w, d, h, f, rnd)
        top = crown(bm, c, 0, 0, h, d, rnd, lights)
    elif m == 'setback3':
        tiers = [(w, h * 0.5), (snap(w * 0.76), h * 0.3), (snap(w * 0.52), h * 0.2)]
        for tw, th in tiers:
            facade_box(bm, 0, 0, z, tw, tw, th, f, rnd)
            z += th
        top = crown(bm, c, 0, 0, z, tiers[-1][0], rnd, lights)
    elif m == 'cylinder':
        facade_round(bm, 0, 0, 0, w / 2, h, f)
        top = crown(bm, c, 0, 0, h, w * 0.8, rnd, lights)
    elif m == 'twin':
        tw = snap(w * 0.45)
        for sx in (-1, 1):
            facade_box(bm, sx * (tw / 2 + 2 * BAY), 0, 0, tw, tw, h * (1 if sx < 0 else 0.86), f, rnd)
        for k in (0.35, 0.62):
            util.box(bm, (0, 0, h * k), (4 * BAY + 1, tw * 0.5, 2 * STOREY), CONC)
        crown(bm, c, -(tw / 2 + 2 * BAY), 0, h, tw, rnd, lights)
        top = crown(bm, 'pyramid' if c != 'pyramid' else 'flat_plant', tw / 2 + 2 * BAY, 0, h * 0.86, tw, rnd, lights)
    elif m == 'octagon':
        r = w / 2
        for k, frac in enumerate((0.55, 0.3, 0.15)):
            th = h * frac
            facade_round(bm, 0, 0, z, r, th, f, sides=8)
            z += th
            r *= 0.8
        top = crown(bm, c, 0, 0, z, r * 2, rnd, lights)
    elif m == 'stacked':
        tw = w
        for k in range(5):
            th = h / 5
            off = (BAY * 2) * (1 if k % 2 else -1)
            facade_box(bm, off, 0, z, tw, snap(tw * 0.8), th, f, rnd)
            z += th
        top = crown(bm, c, 0, 0, z, tw * 0.7, rnd, lights)
    elif m == 'needle':
        facade_round(bm, 0, 0, 0, w * 0.22, h * 0.82, f, sides=24)
        util.sphere(bm, (0, 0, h * 0.82), w * 0.55, mi=CUR, subdiv=3, scale=(1, 1, 0.55))
        util.cylinder(bm, (0, 0, h * 0.82 - w * 0.05), w * 0.58, 1.0, segments=48, mi=GLOW)
        top = crown(bm, c, 0, 0, h * 0.82 + w * 0.3, w * 0.4, rnd, lights)
    elif m == 'l_stepped':
        facade_box(bm, 0, 0, 0, w, snap(w * 0.5), h * 0.7, f, rnd)
        facade_box(bm, -w / 4, snap(w * 0.5), 0, snap(w * 0.5), snap(w * 0.5), h, f, rnd)
        crown(bm, 'flat_plant' if c != 'flat_plant' else 'stepped', w / 4, 0, h * 0.7, w * 0.4, rnd, lights)
        top = crown(bm, c, -w / 4, snap(w * 0.5), h, snap(w * 0.5), rnd, lights)
    elif m == 'cluster3':
        tw = snap(w * 0.42)
        for k, (ox, oy, fh) in enumerate(((-tw * 0.55, 0, 1.0), (tw * 0.55, 0, 0.82), (0, tw * 0.95, 0.68))):
            facade_box(bm, snap(ox), snap(oy), 0, tw, tw, h * fh, f, rnd)
            crown(bm, c, snap(ox), snap(oy), h * fh, tw, rnd, lights)
        top = h
    elif m == 'hexagon':
        facade_round(bm, 0, 0, 0, w / 2, h, f, sides=6)
        top = crown(bm, c, 0, 0, h, w * 0.85, rnd, lights)
    elif m == 'wedding':
        tw = w
        for k in range(7):
            th = h * (0.3 if k == 0 else 0.7 / 6)
            facade_box(bm, 0, 0, z, tw, tw, th, f, rnd)
            z += th
            tw = max(snap(tw * 0.86), 4 * BAY)
        top = crown(bm, c, 0, 0, z, tw, rnd, lights)
    else:  # taper: a box that loses a bay on each side every quarter of its height
        tw = w
        for k in range(4):
            th = h / 4
            facade_box(bm, 0, 0, z, tw, snap(tw * 0.7), th, f, rnd)
            z += th
            tw = max(tw - 2 * BAY, 4 * BAY)
        top = crown(bm, c, 0, 0, z, tw, rnd, lights)
    for p in lights:
        util.sphere(bm, p, 0.9, mi=RED, subdiv=2)
    o = util.obj_from_bm(name, bm, collection, MATS, loc=loc)
    util.bevel(o, 0.06, 1)
    o['tower_massing'], o['tower_facade'], o['tower_crown'] = m, f, c
    o['tower_height_m'] = round(top, 1)
    return o


HERO_DESIGNS = [
    dict(massing='setback3', facade='ribbed', crown='spire', w=40, h=205),
    dict(massing='cylinder', facade='curtain', crown='lantern', w=36, h=178),
    dict(massing='twin', facade='grid', crown='stepped', w=46, h=168),
    dict(massing='slab', facade='banded', crown='flat_plant', w=54, h=132),
    dict(massing='octagon', facade='piers', crown='finials', w=40, h=196),
    dict(massing='hexagon', facade='diagrid', crown='pyramid', w=34, h=158),
    dict(massing='stacked', facade='balcony', crown='halo', w=36, h=118),
    dict(massing='needle', facade='louvre', crown='mast', w=40, h=150),
    dict(massing='l_stepped', facade='panel', crown='clock', w=40, h=146),
    dict(massing='cluster3', facade='grid', crown='twin_spires', w=50, h=150),
    dict(massing='wedding', facade='ribbed', crown='dome', w=40, h=186),
    dict(massing='taper', facade='curtain', crown='pagoda', w=36, h=112),
]

# Footprint positions on the hero island, as fractions of its radii.
HERO_SPOTS = [(0.0, 0.25), (-0.42, 0.05), (0.4, 0.1), (-0.2, -0.35), (0.22, 0.45), (0.62, -0.2),
              (-0.62, -0.25), (0.15, -0.1), (-0.7, 0.35), (0.72, 0.4), (-0.35, 0.55), (0.42, -0.55)]


def hero_cluster():
    rnd = random.Random(util.CFG['SEED'] + 71)
    c = util.coll('Hero_Towers')
    info = util.REG['Hero_Tower_Island']
    count = util.CFG['HERO_TOWER_COUNT']
    for k, (design, (fx, fy)) in enumerate(list(zip(HERO_DESIGNS, HERO_SPOTS))[:count]):
        x = info['centre'].x + fx * info['rx']
        y = info['centre'].y + fy * info['ry']
        hit = util.drop(x, y, info['centre'].z + 300, {info['obj']})
        z = hit[0].z - 1.0 if hit else info['centre'].z
        d = dict(design)
        # Slim footprints keep the cluster reading as separate spires at this distance.
        d['w'], d['h'] = util.S(d['w'] * 0.62), util.S(d['h'])
        build_tower(f'Hero_Tower.{k:02d}_{design["massing"]}', c, (x, y, z), d, rnd)


def distant():
    """Two to seven towers per distant island, from a simpler mix."""
    rnd = random.Random(util.CFG['SEED'] + 81)
    c = util.coll('Distant_Towers', util.coll('Distant_Islands'))
    kinds = ['setback3', 'slab', 'cylinder', 'taper', 'wedding', 'octagon', 'twin']
    facades = ['grid', 'curtain', 'banded', 'ribbed', 'piers']
    crowns = ['spire', 'flat_plant', 'stepped', 'pyramid', 'mast', 'finials', 'pagoda']
    for d in util.REG['distant']:
        info = util.REG[d['name']]
        n = d.get('towers') or (rnd.randint(2, 7) if d['depth'] > util.S(400) else rnd.randint(1, 3))
        for k in range(n):
            a = rnd.uniform(0, 2 * pi)
            f = rnd.uniform(0, 0.45)
            x = info['centre'].x + cos(a) * info['rx'] * f
            y = info['centre'].y + sin(a) * info['ry'] * f
            hit = util.drop(x, y, info['centre'].z + 400, {info['obj']})
            if hit is None:
                continue
            w = max(4 * BAY, info['rx'] * rnd.uniform(0.18, 0.32))
            h = info['depth'] * rnd.uniform(0.6, 1.7)
            design = dict(massing=rnd.choice(kinds), facade=rnd.choice(facades), crown=rnd.choice(crowns), w=w, h=h)
            build_tower(f'Distant_Tower.{d["name"][-2:]}_{k}', c, (x, y, hit[0].z - 0.5), design, rnd)

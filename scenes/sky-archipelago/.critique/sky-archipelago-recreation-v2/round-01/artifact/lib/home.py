"""The user's home tower on the left foreground cliff, with a furnish-ready corner room."""
from math import radians, atan2, pi
import bpy
import bmesh
from mathutils import Vector
from . import util
from .props import _curved_roof, point_light

STOREY_H = 3.3     # Floor to floor.
SLAB = 0.3         # Clear height is STOREY_H minus SLAB: 3.0 m.
SIDE = 14.4        # Footprint, square.
ROOM = 7.2         # Corner room, square.
BAY_H = 1.8


def _face_panels(bm, cx, cy, z, side, axis, sign, skip_range=None):
    """Lit window panels and mullions on one face of one storey.

    axis 'x' means the face looks along x. skip_range leaves a gap for the real glass of the room."""
    clear = STOREY_H - SLAB
    n = int(side / BAY_H)
    for i in range(n):
        u = -side / 2 + (i + 0.5) * BAY_H
        if skip_range and skip_range[0] <= u <= skip_range[1]:
            continue
        if axis == 'x':
            util.box(bm, (cx + sign * (side / 2 - 0.25), cy + u, z + 0.25), (0.05, BAY_H - 0.16, clear - 0.5), mi=1)
        else:
            util.box(bm, (cx + u, cy + sign * (side / 2 - 0.25), z + 0.25), (BAY_H - 0.16, 0.05, clear - 0.5), mi=1)
    for i in range(n + 1):
        u = -side / 2 + i * BAY_H
        if axis == 'x':
            util.box(bm, (cx + sign * (side / 2 - 0.15), cy + u, z), (0.3, 0.12, clear), mi=2)
        else:
            util.box(bm, (cx + u, cy + sign * (side / 2 - 0.15), z), (0.12, 0.3, clear), mi=2)


def build():
    hb = util.coll('Home_Building')
    hi = util.coll('Home_Interior', hb)
    t = util.REG['terrace']
    zu = t['upper_z']
    # Behind the shrine and slightly left, so the tower rises at the left edge of the frame.
    hp = util.frame_point(t['T'], t['fwd'], t['left'], 32.0, 4.5)
    cx, cy = hp.x, hp.y
    base_z = zu - 0.2
    floors = util.CFG['HOME_FLOORS']
    room_floor = util.CFG['HOME_ROOM_FLOOR']
    bm = bmesh.new()
    util.box(bm, (cx, cy, base_z - 1.0), (SIDE + 1.6, SIDE + 1.6, 1.4), mi=0)
    # Room spans the +x, +y quarter of its storey: x and y from the centre to the faces.
    room_u = (0.0, SIDE / 2)
    for k in range(floors):
        z = base_z + 0.4 + k * STOREY_H
        if k in (room_floor, room_floor + 1):
            # The room owns its quarter of these two slabs, so the exterior leaves that quarter out.
            q = (SIDE + 0.5) / 2
            for qx, qy in ((-1, -1), (1, -1), (-1, 1)):
                util.box(bm, (cx + qx * q / 2, cy + qy * q / 2, z - SLAB), (q, q, SLAB), mi=0)
        else:
            util.box(bm, (cx, cy, z - SLAB), (SIDE + 0.5, SIDE + 0.5, SLAB), mi=0)
        for sx in (-1, 1):
            for sy in (-1, 1):
                util.box(bm, (cx + sx * (SIDE / 2 - 0.35), cy + sy * (SIDE / 2 - 0.35), z), (0.7, 0.7, STOREY_H - SLAB), mi=0)
        skip = room_u if k == room_floor else None
        _face_panels(bm, cx, cy, z, SIDE, 'x', 1, skip)
        _face_panels(bm, cx, cy, z, SIDE, 'x', -1)
        _face_panels(bm, cx, cy, z, SIDE, 'y', 1, skip)
        _face_panels(bm, cx, cy, z, SIDE, 'y', -1)
        if k % 2 == 1 and k != room_floor:
            # Deep balconies on the side that faces the city.
            util.box(bm, (cx + SIDE / 2 + 0.9, cy, z - SLAB), (1.8, SIDE * 0.8, 0.25), mi=0)
            util.box(bm, (cx + SIDE / 2 + 1.75, cy, z - 0.05), (0.06, SIDE * 0.8, 1.05), mi=3)
            util.box(bm, (cx + SIDE / 2 + 1.75, cy, z + 1.0), (0.1, SIDE * 0.8, 0.06), mi=2)
    top = base_z + 0.4 + floors * STOREY_H
    util.box(bm, (cx, cy, top - SLAB), (SIDE + 0.8, SIDE + 0.8, 0.5), mi=0)
    # Crown: a glazed roof pavilion under a curved tiled roof, set back from the edge.
    util.box(bm, (cx - 1.8, cy - 1.8, top + 0.2), (7.4, 7.4, 3.0), mi=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            util.box(bm, (cx - 1.8 + sx * 3.6, cy - 1.8 + sy * 3.6, top + 0.2), (0.3, 0.3, 3.0), mi=2)
    roof = bmesh.new()
    _curved_roof(roof, 5.4, 5.4, 0.0, 2.6, mi=4)
    util.merge_bm(bm, roof, matrix=__import__('mathutils').Matrix.Translation((cx - 1.8, cy - 1.8, top + 3.2)))
    util.box(bm, (cx + 4.0, cy + 4.0, top + 0.2), (3.6, 3.6, 0.6), mi=0)
    o = util.obj_from_bm('Home_Tower_Exterior', bm, hb, ['Tower_Concrete', 'Home_Window_Lit', 'Home_Frame', 'Home_Glass', 'Roof_Tile'])
    util.bevel(o, 0.03, 1)
    util.add_mod(o, 'SOLIDIFY', 'Roof_Thickness', thickness=0.16, offset=-1.0)
    o['height_m'] = round(top + 6 - base_z, 1)
    point_light('Home_Roof_Lamp', hb, (cx + 4.0, cy + 4.0, top + 1.5), 150.0, (1.0, 0.6, 0.3), 0.3)
    _room(hi, cx, cy, base_z + 0.4 + room_floor * STOREY_H)


def _room(hi, cx, cy, z):
    """The corner room: slabs, walls with thickness, framed glass on two sides, one light, no furniture."""
    clear = STOREY_H - SLAB
    x0, x1 = cx, cx + SIDE / 2
    y0, y1 = cy, cy + SIDE / 2
    mid = Vector(((x0 + x1) / 2, (y0 + y1) / 2, z))

    bm = bmesh.new()
    util.box(bm, (mid.x, mid.y, z), (ROOM, ROOM, 0.03))
    util.obj_from_bm('Home_Room_Floor_Finish', bm, hi, ['Home_Floor'])
    bm = bmesh.new()
    util.box(bm, (mid.x, mid.y, z - SLAB), (ROOM, ROOM, SLAB))
    util.obj_from_bm('Home_Room_Floor_Slab', bm, hi, ['Tower_Concrete'])
    bm = bmesh.new()
    util.box(bm, (mid.x, mid.y, z + clear), (ROOM, ROOM, SLAB))
    util.obj_from_bm('Home_Room_Ceiling_Slab', bm, hi, ['Home_Ceiling'])
    # Two inner walls, 0.2 m thick, close the room. The west wall has a doorway.
    bm = bmesh.new()
    util.box(bm, (mid.x, y0 + 0.1, z), (ROOM, 0.2, clear))
    util.box(bm, (x0 + 0.1, y0 + ROOM * 0.25 + 0.6, z), (0.2, ROOM * 0.5 - 1.2, clear))
    util.box(bm, (x0 + 0.1, y0 + ROOM * 0.85, z), (0.2, ROOM * 0.3, clear))
    util.box(bm, (x0 + 0.1, y0 + ROOM * 0.6, z + 2.2), (0.2, 1.2, clear - 2.2))
    util.obj_from_bm('Home_Room_Walls', bm, hi, ['Home_Wall'])
    # Frames on the +x and +y faces, with separate panes of real thickness between them.
    fr = bmesh.new()
    panes = 0
    for axis in ('x', 'y'):
        n = int(ROOM / BAY_H)
        for i in range(n + 1):
            u = i * BAY_H
            if axis == 'x':
                util.box(fr, (x1 - 0.1, y0 + u, z), (0.14, 0.1, clear))
            else:
                util.box(fr, (x0 + u, y1 - 0.1, z), (0.1, 0.14, clear))
        for zz, hh in ((z, 0.12), (z + clear - 0.12, 0.12), (z + 2.3, 0.07)):
            if axis == 'x':
                util.box(fr, (x1 - 0.1, mid.y, zz), (0.14, ROOM, hh))
            else:
                util.box(fr, (mid.x, y1 - 0.1, zz), (ROOM, 0.14, hh))
        for i in range(n):
            for zz, hh in ((z + 0.12, 2.18), (z + 2.37, clear - 2.49)):
                pane = bmesh.new()
                u = (i + 0.5) * BAY_H
                if axis == 'x':
                    util.box(pane, (x1 - 0.1, y0 + u, zz), (0.024, BAY_H - 0.1, hh))
                else:
                    util.box(pane, (x0 + u, y1 - 0.1, zz), (BAY_H - 0.1, 0.024, hh))
                g = util.obj_from_bm(f'Home_Window_Glass.{axis}{i}{"lo" if hh > 1 else "hi"}', pane, hi, ['Home_Glass'])
                g.visible_shadow = False
                panes += 1
    util.obj_from_bm('Home_Window_Frames', fr, hi, ['Home_Frame'])
    lt = bpy.data.lights.new('Home_Room_Ceiling_Light', 'AREA')
    lt.shape = 'SQUARE'
    lt.size = 1.6
    lt.energy = 260.0
    lt.color = (1.0, 0.78, 0.55)
    lo = bpy.data.objects.new('Home_Room_Ceiling_Light', lt)
    lo.location = (mid.x, mid.y, z + clear - 0.05)
    hi.objects.link(lo)
    # Cam_Home stands in the back of the room at eye height and looks out through the glass corner.
    cd = bpy.data.cameras.new('Cam_Home')
    cd.lens = 18.0
    cd.sensor_width = 36.0
    cd.clip_start = 0.1
    cd.clip_end = 20000
    cam = bpy.data.objects.new('Cam_Home', cd)
    cam.location = (x0 + 1.0, y0 + 1.1, z + 1.55)
    target = util.REG['Central_Island']['centre']
    d = target - cam.location
    cam.rotation_euler = (radians(88), 0.0, atan2(d.y, d.x) - pi / 2)
    util.coll('Cameras').objects.link(cam)
    util.REG['home'] = dict(room_floor_z=z, clear_height=clear, panes=panes)

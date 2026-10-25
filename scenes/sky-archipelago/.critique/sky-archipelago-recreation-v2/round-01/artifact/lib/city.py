"""The ground city far below the clouds: lit blocks, streets and a winding river."""
from math import pi
import bpy
import bmesh
from mathutils import Vector
from . import util
from .sky import depth_for_z

RIVER_A = 260.0       # Meander amplitude in metres.
RIVER_L = 520.0       # Meander wavelength over 2 pi, in metres.
RIVER_SLOPE = 0.35    # Overall drift of the river across the city.
RIVER_HALF = 95.0     # Half width.


def _centre():
    gz = util.CFG['GROUND_Z']
    d = depth_for_z(0.42, 0.74, gz)
    return util.cam_point(0.42, 0.74, d)


def _gn(density):
    ng = bpy.data.node_groups.new('Ground_City_Blocks', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links

    def math(op, a, b=None):
        m = N.new('ShaderNodeMath')
        m.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                L.new(v, m.inputs[i])
        return m.outputs[0]

    grid = N.new('GeometryNodeMeshGrid')
    grid.inputs['Size X'].default_value = grid.inputs['Size Y'].default_value = util.S(5200)
    dist = N.new('GeometryNodeDistributePointsOnFaces')
    dist.inputs['Density'].default_value = density
    L.new(grid.outputs['Mesh'], dist.inputs['Mesh'])
    pos = N.new('GeometryNodeInputPosition')
    sep = N.new('ShaderNodeSeparateXYZ')
    L.new(pos.outputs[0], sep.inputs[0])
    curve = math('ADD', math('MULTIPLY', math('SINE', math('DIVIDE', sep.outputs['X'], util.S(RIVER_L))), util.S(RIVER_A)),
                 math('MULTIPLY', sep.outputs['X'], RIVER_SLOPE))
    off = math('ABSOLUTE', math('SUBTRACT', sep.outputs['Y'], curve))
    on_river = math('LESS_THAN', off, util.S(RIVER_HALF) + util.S(18))
    dele = N.new('GeometryNodeDeleteGeometry')
    dele.domain = 'POINT'
    L.new(dist.outputs['Points'], dele.inputs['Geometry'])
    L.new(on_river, dele.inputs['Selection'])
    cube = N.new('GeometryNodeMeshCube')
    lift = N.new('GeometryNodeTransform')
    lift.inputs['Translation'].default_value = (0, 0, 0.5)
    L.new(cube.outputs['Mesh'], lift.inputs['Geometry'])
    rw = N.new('FunctionNodeRandomValue')
    rw.data_type = 'FLOAT_VECTOR'
    rw.inputs['Min'].default_value = (14, 14, 0)
    rw.inputs['Max'].default_value = (38, 38, 1)
    vsep = N.new('ShaderNodeSeparateXYZ')
    L.new(rw.outputs['Value'], vsep.inputs[0])
    tall = math('ADD', math('MULTIPLY', math('POWER', vsep.outputs['Z'], 3.0), util.S(140)), util.S(8))
    comb = N.new('ShaderNodeCombineXYZ')
    L.new(vsep.outputs['X'], comb.inputs['X'])
    L.new(vsep.outputs['Y'], comb.inputs['Y'])
    L.new(tall, comb.inputs['Z'])
    inst = N.new('GeometryNodeInstanceOnPoints')
    L.new(dele.outputs['Geometry'], inst.inputs['Points'])
    L.new(lift.outputs['Geometry'], inst.inputs['Instance'])
    L.new(comb.outputs[0], inst.inputs['Scale'])
    real = N.new('GeometryNodeRealizeInstances')
    L.new(inst.outputs['Instances'], real.inputs['Geometry'])
    mat = N.new('GeometryNodeSetMaterial')
    mat.inputs['Material'].default_value = util.mat('City_Block')
    L.new(real.outputs['Geometry'], mat.inputs['Geometry'])
    out = N.new('NodeGroupOutput')
    L.new(mat.outputs['Geometry'], out.inputs[0])
    return ng


def _river(c, centre):
    bm = bmesh.new()
    rows = []
    span = util.S(5000)
    n = 240
    from math import sin, cos, atan
    for k in range(n + 1):
        x = -span / 2 + span * k / n
        y = util.S(RIVER_A) * sin(x / util.S(RIVER_L)) + x * RIVER_SLOPE
        dy = util.S(RIVER_A) / util.S(RIVER_L) * cos(x / util.S(RIVER_L)) + RIVER_SLOPE
        nrm = Vector((-dy, 1, 0)).normalized() * util.S(RIVER_HALF)
        p = Vector((x, y, 0.3))
        rows.append((bm.verts.new(p - nrm), bm.verts.new(p + nrm), p, nrm))
    for (a0, b0, _, _), (a1, b1, _, _) in zip(rows, rows[1:]):
        bm.faces.new((a0, a1, b1, b0))
    util.obj_from_bm('Ground_City_River', bm, c, ['River'], loc=(centre.x, centre.y, util.CFG['GROUND_Z']))
    # Lit road bridges cross the river at intervals.
    br = bmesh.new()
    for k in range(10, n, 22):
        _, _, p, nrm = rows[k]
        a, b = p - nrm * 1.25 + Vector((0, 0, 3)), p + nrm * 1.25 + Vector((0, 0, 3))
        util.box_between(br, a, b, util.S(9), mi=0)
        util.box_between(br, a + Vector((0, 0, 4.6)), b + Vector((0, 0, 4.6)), util.S(1.2), mi=1)
    util.obj_from_bm('Ground_City_River_Bridges', br, c, ['Bridge_Stone', 'Lamp_Glow'],
                     loc=(centre.x, centre.y, util.CFG['GROUND_Z']))


def ground_city():
    c = util.coll('Ground_City')
    centre = _centre()
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=util.S(4000))
    util.obj_from_bm('Ground_City_Streets', bm, c, ['City_Ground'], loc=(centre.x, centre.y, util.CFG['GROUND_Z']))
    me = bpy.data.meshes.new('Ground_City_Blocks_Base')
    o = bpy.data.objects.new('Ground_City_Blocks', me)
    o.location = (centre.x, centre.y, util.CFG['GROUND_Z'])
    c.objects.link(o)
    o.modifiers.new('City_Blocks', 'NODES').node_group = _gn(util.CFG['CITY_BLOCK_DENSITY'] / util.S(1) ** 2)
    _river(c, centre)
    util.REG['city_centre'] = centre

"""Scene reset, cameras, render settings, the key lights and the compositor."""
import os
import bpy
from math import radians
from mathutils import Vector
from . import util
from .materials import sock


def reset_scene():
    """Clears every object and data block, so the build starts from an empty file."""
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.lights,
                   bpy.data.cameras, bpy.data.node_groups, bpy.data.textures, bpy.data.images):
        for b in list(blocks):
            blocks.remove(b)


def setup():
    s = bpy.context.scene
    cams = util.coll('Cameras')
    data = bpy.data.cameras.new(util.CFG['CAMERA_NAME'])
    data.lens = util.CFG['CAMERA_LENS']
    data.sensor_width = 36.0
    data.sensor_fit = 'HORIZONTAL'
    data.clip_start = 0.5
    data.clip_end = 20000
    cam = bpy.data.objects.new(util.CFG['CAMERA_NAME'], data)
    cam.location = (0.0, 0.0, 0.0)
    cam.rotation_euler = (radians(90 + util.CFG['CAMERA_PITCH_DEG']), 0.0, 0.0)
    cams.objects.link(cam)
    s.camera = cam
    bpy.context.view_layer.update()

    r = s.render
    r.engine = 'BLENDER_EEVEE'
    r.resolution_x, r.resolution_y = util.CFG['RES']
    r.resolution_percentage = 100
    r.film_transparent = False
    r.image_settings.file_format = 'PNG'
    r.image_settings.color_depth = '8'
    e = s.eevee
    e.taa_render_samples = 64
    e.use_raytracing = True
    e.ray_tracing_options.resolution_scale = '2'
    e.use_shadows = True
    e.volumetric_start = 2.0
    e.volumetric_end = 6000.0
    e.volumetric_tile_size = '4'
    e.volumetric_samples = 128
    e.volumetric_sample_distribution = 0.9
    e.use_volumetric_shadows = True
    e.volumetric_shadow_samples = 16
    e.volumetric_ray_depth = 8
    e.light_threshold = 0.002
    s.view_settings.view_transform = 'AgX'
    try:
        s.view_settings.look = 'AgX - Medium High Contrast'
    except TypeError:
        s.view_settings.look = 'None'
    s.view_settings.exposure = 0.0


def lights():
    """Moonlight from the upper right, and a warm city glow under the cloud gap."""
    lc = util.coll('Lights')
    moon = bpy.data.lights.new('Moonlight', 'SUN')
    moon.energy = 1.6
    moon.color = (0.55, 0.62, 1.0)
    moon.angle = radians(1.5)
    o = bpy.data.objects.new('Moonlight', moon)
    o.rotation_euler = (radians(52), radians(-18), radians(-35))
    lc.objects.link(o)

    glow = bpy.data.lights.new('City_Glow_Under_Clouds', 'AREA')
    glow.shape = 'DISK'
    glow.size = util.S(1800)
    glow.energy = 1.2e7
    glow.color = (1.0, 0.58, 0.3)
    glow.use_shadow = False
    p = util.cam_point(0.42, 0.78, util.S(1400))
    g = bpy.data.objects.new('City_Glow_Under_Clouds', glow)
    g.location = (p.x, p.y, util.CFG.get('GROUND_Z', util.S(-420)) + util.S(10))
    # Area lights shine down their -Z axis. A half turn points this one up at the cloud undersides.
    g.rotation_euler = (3.14159, 0, 0)
    lc.objects.link(g)


def compositor():
    """Painterly finish: Kuwahara brushwork, tinted wet edges, then paper grain over everything."""
    s = bpy.context.scene
    ng = bpy.data.node_groups.new('Watercolour_Compositor', 'CompositorNodeTree')
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    N, L = ng.nodes, ng.links

    def menu(node, name, *options):
        for o in options:
            try:
                node.inputs[name].default_value = o
                return
            except (TypeError, KeyError):
                continue

    def mix(fac, a, b, blend):
        m = N.new('ShaderNodeMix')
        m.data_type = 'RGBA'
        m.blend_type = blend
        sock(m.inputs, 'Factor').default_value = fac if isinstance(fac, float) else 1.0
        if not isinstance(fac, float):
            L.new(fac, sock(m.inputs, 'Factor'))
        for name, v in (('A', a), ('B', b)):
            if isinstance(v, tuple):
                sock(m.inputs, name).default_value = (*v, 1)
            else:
                L.new(v, sock(m.inputs, name))
        return sock(m.outputs, 'Result')

    def maprange(v, lo, hi, a, b):
        r = N.new('ShaderNodeMapRange')
        r.inputs['From Min'].default_value, r.inputs['From Max'].default_value = lo, hi
        r.inputs['To Min'].default_value, r.inputs['To Max'].default_value = a, b
        L.new(v, r.inputs['Value'])
        return r.outputs['Result']

    rl = N.new('CompositorNodeRLayers')
    kuw = N.new('CompositorNodeKuwahara')
    kuw.inputs['Size'].default_value = max(2, round(4 * s.render.resolution_x / 3840))
    menu(kuw, 'Type', 'Anisotropic', 'ANISOTROPIC')
    L.new(rl.outputs['Image'], kuw.inputs['Image'])
    # Paper grain, cropped clear of the scan's marked right edge, stretched to the frame.
    img = N.new('CompositorNodeImage')
    img.image = bpy.data.images.load(os.path.join(util.CFG['ROOT'], 'assets', 'paper', 'Paper001',
                                                  'Paper001_4K-JPG_Displacement.jpg'))
    img.image.colorspace_settings.name = 'Non-Color'
    crop = N.new('CompositorNodeCrop')
    crop.inputs['X'].default_value, crop.inputs['Y'].default_value = 0, 0
    crop.inputs['Width'].default_value, crop.inputs['Height'].default_value = 3700, 2400
    L.new(img.outputs['Image'], crop.inputs['Image'])
    sc = N.new('CompositorNodeScale')
    menu(sc, 'Type', 'Render Size', 'Scene Size', 'RENDER_SIZE')
    menu(sc, 'Frame Type', 'Stretch', 'STRETCH')
    L.new(crop.outputs['Image'], sc.inputs['Image'])
    pbw = N.new('CompositorNodeRGBToBW')
    L.new(sc.outputs['Image'], pbw.inputs['Image'])
    grain = maprange(pbw.outputs['Val'], 0.3, 0.7, 0.8, 1.1)
    # Wet edges: where one wash meets the next, the pigment gathers into a soft, tinted rim.
    sob = N.new('CompositorNodeFilter')
    menu(sob, 'Type', 'Sobel', 'SOBEL')
    L.new(kuw.outputs['Image'], sob.inputs['Image'])
    ebw = N.new('CompositorNodeRGBToBW')
    L.new(sob.outputs['Image'], ebw.inputs['Image'])
    edge = maprange(ebw.outputs['Val'], 0.04, 0.5, 0.0, 0.45)
    broken = N.new('ShaderNodeMath')
    broken.operation = 'MULTIPLY'
    L.new(edge, broken.inputs[0])
    L.new(maprange(pbw.outputs['Val'], 0.4, 0.6, 0.4, 1.2), broken.inputs[1])
    rimmed = mix(broken.outputs[0], kuw.outputs['Image'], (0.42, 0.34, 0.55), 'MULTIPLY')
    gmul = N.new('ShaderNodeMix')
    gmul.data_type = 'RGBA'
    gmul.blend_type = 'MULTIPLY'
    sock(gmul.inputs, 'Factor').default_value = 1.0
    L.new(rimmed, sock(gmul.inputs, 'A'))
    L.new(grain, sock(gmul.inputs, 'B'))
    glare = N.new('CompositorNodeGlare')
    for key, val in (('Type', 'Bloom'), ('Threshold', 1.0), ('Strength', 0.4), ('Size', 0.8)):
        try:
            glare.inputs[key].default_value = val
        except (KeyError, TypeError):
            pass
    L.new(sock(gmul.outputs, 'Result'), glare.inputs['Image'])
    out = N.new('NodeGroupOutput')
    L.new(glare.outputs['Image'], out.inputs[0])
    s.compositing_node_group = ng

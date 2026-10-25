"""Renders the evidence for one round: final.png, home_interior.png and compare.png.

Run in Blender after build.py. Call main() for the full set, or preview() for a quick check."""
import json
import os
import time
import bpy
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
OUT = os.path.join(ROOT, 'renders')
# Crop centres as fractions of the frame, in the order the rubric names them.
CROPS = [
    ('foreground_terrace', 0.125, 0.60),
    ('central_waterfall_lip', 0.625, 0.53),
    ('hero_tower_tops', 0.63, 0.16),
    ('lamp_bridge', 0.815, 0.85),
    ('ground_city_cloud_gap', 0.42, 0.74),
    ('distant_islands', 0.32, 0.25),
]
CROP_FRAC = 0.25   # Each crop covers a quarter of the frame width and height: 960 x 540 at 4K.


def _render(camera, path, res, samples=None):
    s = bpy.context.scene
    s.camera = bpy.data.objects[camera]
    s.render.resolution_x, s.render.resolution_y = res
    if samples:
        s.eevee.taa_render_samples = samples
    s.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    return time.time() - t


def _load(path, size=None):
    img = bpy.data.images.load(path, check_existing=False)
    if size:
        img.scale(*size)
    w, h = img.size
    arr = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    bpy.data.images.remove(img)
    return arr.reshape(h, w, 4)[::-1]   # Rows top to bottom.


def _crop(arr, cu, cv, frac):
    h, w = arr.shape[:2]
    cw, ch = int(w * frac), int(h * frac)
    x0 = int(min(max(cu * w - cw / 2, 0), w - cw))
    y0 = int(min(max(cv * h - ch / 2, 0), h - ch))
    return arr[y0:y0 + ch, x0:x0 + cw], (x0, y0, cw, ch)


def _resize(arr, size):
    img = bpy.data.images.new('_resize', arr.shape[1], arr.shape[0], alpha=True)
    img.pixels.foreach_set(arr[::-1].ravel())
    img.scale(*size)
    w, h = img.size
    out = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(out)
    bpy.data.images.remove(img)
    return out.reshape(h, w, 4)[::-1]


def compare():
    final = _load(os.path.join(OUT, 'final.png'))
    ref = _load(os.path.join(ROOT, 'reference.webp'), (3840, 2160))
    W, H = 3840, 1080 + 3 * 540
    canvas = np.zeros((H, W, 4), dtype=np.float32)
    canvas[..., 3] = 1.0
    canvas[0:1080, 0:1920] = _resize(ref, (1920, 1080))
    canvas[0:1080, 1920:3840] = _resize(final, (1920, 1080))
    rects = []
    for k, (name, cu, cv) in enumerate(CROPS):
        rc, rect = _crop(final, cu, cv, CROP_FRAC)
        fc, _ = _crop(ref, cu, cv, CROP_FRAC)
        row, col = divmod(k, 2)
        y = 1080 + row * 540
        x = col * 1920
        canvas[y:y + 540, x:x + 960] = fc[:540, :960]
        canvas[y:y + 540, x + 960:x + 1920] = rc[:540, :960]
        # A thin white rule separates each reference crop from its render crop.
        canvas[y:y + 540, x + 958:x + 962, :3] = 1.0
        rects.append({'index': k + 1, 'name': name, 'render_rect_px': rect,
                      'layout': {'reference_crop_at': [x, y], 'render_crop_at': [x + 960, y], 'size': [960, 540]}})
    canvas[1078:1082, :, :3] = 1.0
    canvas[1080:, 1918:1922, :3] = 1.0
    img = bpy.data.images.new('compare', W, H, alpha=False)
    img.pixels.foreach_set(canvas[::-1].ravel())
    img.filepath_raw = os.path.join(OUT, 'compare.png')
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    with open(os.path.join(OUT, 'crops.json'), 'w') as fh:
        json.dump({'layout': 'Top row: reference left, render right, each at 1920x1080. Below: three rows of two '
                             'pairs. Each pair shows the reference crop (upscaled) on the left and the render crop at '
                             '100% on the right.', 'crops': rects}, fh, indent=1)


def preview(res=(1280, 720), samples=16, name='preview.png'):
    os.makedirs(OUT, exist_ok=True)
    return _render('Cam_Reference', os.path.join(OUT, name), res, samples)


def main():
    os.makedirs(OUT, exist_ok=True)
    times = {}
    times['final_render_s'] = round(_render('Cam_Reference', os.path.join(OUT, 'final.png'), (3840, 2160), 64), 1)
    times['home_render_s'] = round(_render('Cam_Home', os.path.join(OUT, 'home_interior.png'), (1920, 1080), 64), 1)
    bpy.context.scene.camera = bpy.data.objects['Cam_Reference']
    bpy.context.scene.render.resolution_x, bpy.context.scene.render.resolution_y = 3840, 2160
    t = time.time()
    compare()
    times['compare_s'] = round(time.time() - t, 1)
    with open(os.path.join(OUT, 'times.json'), 'w') as fh:
        json.dump(times, fh, indent=1)
    return times


if __name__ == '__main__':
    main()

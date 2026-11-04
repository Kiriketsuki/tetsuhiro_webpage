"""Turns the gate Kinako lab frames into the gate sprite sheets and the first paint picture.

lab/gate-kinako.html renders each frame twice, on a dark and on a light flat background, and
an empty frame the same way. This script takes the alpha matte from each pair with the matte of
scripts/gate-matte.py, crops every frame to one shared box so the frames swap in place, and
writes:

- public/gate/kinako-nap.webp: the two nap frames side by side. Frame 0 is Kinako asleep in the
  moonlight, frame 1 the same pose in the lamp light. The gate fades frame 1 in with the load.
- public/gate/kinako-walk.webp: the frames of the walk in, in one row, in the order of WALK.
  The gate steps a window along the row with a transform.
- a small picture of the unlit branch, lantern and Kinako, which the script writes into
  index.html as the data URL of .ga-first. It sits under the art, so the first paint shows the
  whole picture at once, soft, and the sharp layers fade in over it when their files arrive.

Usage: python scripts/gate-kinako.py <frame dir> <frame width>
The frame dir holds <name>-bg<0|1>.png for every name in NAP and WALK, and empty-bg<0|1>.png.
Render them with these lab queries, all with up=0.5&dist=2.6&size=896 added:

  empty    pose=empty
  sleep0   pose=sleep&yaw=140&warm=0&breath=0
  sleep1   pose=sleep&yaw=140&warm=0.35&breath=0
  wake1    pose=wake&t=0.10&yaw=130&warm=0.35
  wake2    pose=wake&t=0.22&yaw=115&warm=0.35
  stand    pose=wake&t=0.45&yaw=100&warm=0.35
  airup    pose=air&vy=1.2&yaw=90&warm=0.35
  airdown  pose=air&vy=-1.2&yaw=90&warm=0.35
  walk0-7  pose=walk&t=<2 + k * 0.075>&speed=0.7&yaw=90&warm=0.35
  sit      pose=sit&yaw=55&warm=0.35

The script prints the box in pixels of the 896 frame and the sheet sizes. The placement of
Kinako in the art (KINAKO_BOX) must match .ga-kinako in index.html.
Needs numpy and Pillow.
"""
import base64
import importlib.util
import re
import sys
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GATE = ROOT / 'public' / 'gate'

spec = importlib.util.spec_from_file_location('gate_matte', Path(__file__).with_name('gate-matte.py'))
gate_matte = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate_matte)

NAP = ['sleep0', 'sleep1']
WALK = ['wake1', 'wake2', 'stand', 'airup', 'airdown', *[f'walk{k}' for k in range(8)], 'sit']
# Kinako's box in the art frame, in percent of its width and height: left, top, width. The
# height follows from the box shape. index.html places .ga-kinako with the same numbers.
KINAKO_BOX = (-6, -22.85, 47.7)
# The art frame shape, 1024 by 784, as in index.html.
ART = (1024, 784)
# The first paint picture width, in pixels. It shows soft, for the moment before the layers.
FIRST_WIDTH = 256


def shared_box(mattes, pad=6):
    alpha = np.max([m[..., 3] for m in mattes], axis=0)
    ys, xs = np.nonzero(alpha > 0.02)
    h, w = alpha.shape
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), min(w, xs.max() + pad), min(h, ys.max() + pad))


def to_image(matte):
    return Image.fromarray((np.clip(matte, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def row(frames):
    w, h = frames[0].size
    sheet = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.paste(frame, (i * w, 0))
    return sheet


def first_paint(nap):
    """The unlit art at FIRST_WIDTH: branch, lantern and the sleeping Kinako."""
    w = FIRST_WIDTH
    h = round(w * ART[1] / ART[0])
    picture = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    branch = Image.open(GATE / 'branch-s0.webp').convert('RGBA').resize((w, h), Image.LANCZOS)
    picture.alpha_composite(branch)
    # The lantern crop box of .ga-paper in index.html, in percent of the art frame.
    left, top, width, height = 37.38, 20.51, 25.23, 74.08
    lantern = Image.open(GATE / 'lantern-s0.webp').convert('RGBA')
    box = (round(w * left / 100), round(h * top / 100), round(w * width / 100), round(h * height / 100))
    picture.alpha_composite(lantern.resize(box[2:], Image.LANCZOS), box[:2])
    kx, ky, kw = KINAKO_BOX
    size = (round(w * kw / 100), round(w * kw / 100 * nap.height / nap.width))
    sprite = nap.resize(size, Image.LANCZOS)
    # A sprite may stand out of the frame at the top left, so paste it through a larger canvas.
    canvas = Image.new('RGBA', (w * 2, h * 2), (0, 0, 0, 0))
    canvas.alpha_composite(picture, (w // 2, h // 2))
    canvas.alpha_composite(sprite, (w // 2 + round(w * kx / 100), h // 2 + round(h * ky / 100)))
    return canvas.crop((w // 2, h // 2, w // 2 + w, h // 2 + h))


def save(image, target, colours):
    """Saves a sheet as lossless WebP on a palette. The toon frames hold few flat tones, but the
    grade pass dithers each pixel. A lossy file keeps that noise and grows three times. A
    palette of a few dozen colours drops it and keeps the flat fields flat."""
    palette = image.quantize(colors=colours, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    palette.convert('RGBA').save(target, 'WEBP', lossless=True, method=6, quality=100)
    return target.stat().st_size


def main(frames, width):
    frames = Path(frames)
    load = gate_matte.load
    empty = load(frames / 'empty-bg0.png'), load(frames / 'empty-bg1.png')
    names = NAP + WALK
    mattes = {n: gate_matte.matte(load(frames / f'{n}-bg0.png'), load(frames / f'{n}-bg1.png'), *empty) for n in names}
    box = shared_box(list(mattes.values()))
    print('box', [int(v) for v in box], 'shape', box[2] - box[0], 'x', box[3] - box[1])
    scale = width / (box[2] - box[0])
    size = (width, round((box[3] - box[1]) * scale))
    sprites = {n: to_image(m).crop(box).resize(size, Image.LANCZOS) for n, m in mattes.items()}
    nap = row([sprites[n] for n in NAP])
    walk = row([sprites[n] for n in WALK])
    print('frame', size)
    print('kinako-nap.webp', save(nap, GATE / 'kinako-nap.webp', 64), 'bytes')
    print('kinako-walk.webp', save(walk, GATE / 'kinako-walk.webp', 64), 'bytes')
    first = first_paint(sprites['sleep0'])
    buffer = BytesIO()
    first.save(buffer, 'WEBP', quality=60, method=6, alpha_quality=70)
    data = base64.b64encode(buffer.getvalue()).decode('ascii')
    html = ROOT / 'index.html'
    text, count = re.subn(r'url\(data:image/webp;base64,[A-Za-z0-9+/=]+\)', f'url(data:image/webp;base64,{data})', html.read_text(encoding='utf-8'))
    if count != 1:
        sys.exit('index.html must hold exactly one .ga-first data URL.')
    html.write_bytes(text.encode('utf-8'))
    print('first paint picture', len(buffer.getvalue()), 'bytes,', len(data), 'in index.html')


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]))

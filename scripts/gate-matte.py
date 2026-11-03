"""Turns the gate lantern lab frames into transparent WebP layers for index.html.

lab/gate-lantern.html renders each layer twice, on a dark and on a light flat background,
and the empty scene the same way. The grade pass of the island look changes the background
colour too, so this script compares each pair against the empty pair: where the layer
covers the background fully, the dark and light frames match. Where it does not, they
differ as much as the empty frames do.

Usage: python scripts/gate-matte.py <frame dir> <out dir> <branch width> <lantern width>
The frame dir holds <layer>-s<state>-bg<0|1>.png and empty-s0-bg<0|1>.png, rendered at 2x.
The branch layers keep the whole frame at <branch width>. The lantern layers keep only the
box around the lantern, at the scale of a frame <lantern width> wide, because the lantern is
the sharp middle of the picture. The script prints that box in percent of the frame, for the
.ga-paper rule in index.html.
Needs numpy and Pillow.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

LAYERS = ['branch-s0', 'branch-s1', 'lantern-s0', 'lantern-s1', 'sprites-s1']


def load(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255.0


def matte(dark, light, empty_dark, empty_light):
    spread = np.maximum((empty_light - empty_dark).mean(axis=2), 1e-3)
    alpha = 1.0 - ((light - dark).mean(axis=2) / spread)
    # The grade pass dithers each pixel by up to half a step. Without this cut the dither
    # reads as a faint alpha noise over the whole frame, and the WebP files grow four times.
    alpha = np.clip((alpha - 0.04) / 0.92, 0.0, 1.0)
    # The dark frame is the layer over the empty dark frame. Take that background out.
    a = alpha[..., None]
    colour = (dark - (1.0 - a) * empty_dark) / np.maximum(a, 1e-3)
    colour = np.where(a > 0.004, np.clip(colour, 0.0, 1.0), 0.0)
    return np.dstack([colour, alpha])


def pack_sprites(image, slot):
    """Packs the single leaves into square slots of equal size, one leaf in the middle of each.
    The gate picks a leaf with background-position, so each slot must hold exactly one."""
    columns = np.asarray(image)[..., 3].max(axis=0) > 8
    edges = np.flatnonzero(np.diff(np.concatenate([[0], columns.astype(np.int8), [0]])))
    leaves = [image.crop((start, 0, end, image.height)) for start, end in zip(edges[::2], edges[1::2])]
    leaves = [leaf.crop(leaf.getbbox()) for leaf in leaves]
    side = max(max(leaf.size) for leaf in leaves)
    sheet = Image.new('RGBA', (side * len(leaves), side))
    for i, leaf in enumerate(leaves):
        sheet.paste(leaf, (i * side + (side - leaf.width) // 2, (side - leaf.height) // 2))
    return sheet.resize((slot * len(leaves), slot), Image.LANCZOS)


def lantern_box(images, margin=8):
    """The box that holds the lantern in every state, with a small margin."""
    boxes = [image.getbbox() for image in images]
    width, height = images[0].size
    return (
        max(0, min(b[0] for b in boxes) - margin),
        max(0, min(b[1] for b in boxes) - margin),
        min(width, max(b[2] for b in boxes) + margin),
        min(height, max(b[3] for b in boxes) + margin),
    )


def save(image, target, quality):
    image.save(target, 'WEBP', quality=quality, alpha_quality=90, method=6)
    print(f'{target.name}: {image.size[0]}x{image.size[1]}, {target.stat().st_size / 1000:.1f} kB')


def main(frames, out, branch_width, lantern_width):
    frames, out = Path(frames), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    empty_dark = load(frames / 'empty-s0-bg0.png')
    empty_light = load(frames / 'empty-s0-bg1.png')
    layers = {}
    for name in LAYERS:
        rgba = matte(load(frames / f'{name}-bg0.png'), load(frames / f'{name}-bg1.png'), empty_dark, empty_light)
        layers[name] = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')
    full_width, full_height = layers['branch-s0'].size

    for name in ['branch-s0', 'branch-s1']:
        image = layers[name].resize((branch_width, round(full_height * branch_width / full_width)), Image.LANCZOS)
        save(image, out / f'{name}.webp', 78)

    box = lantern_box([layers['lantern-s0'], layers['lantern-s1']])
    scale = lantern_width / full_width
    size = (round((box[2] - box[0]) * scale), round((box[3] - box[1]) * scale))
    for name in ['lantern-s0', 'lantern-s1']:
        save(layers[name].crop(box).resize(size, Image.LANCZOS), out / f'{name}.webp', 88)
    left, top = 100 * box[0] / full_width, 100 * box[1] / full_height
    print(f'lantern box: left {left:.2f}%, top {top:.2f}%, width {100 * (box[2] - box[0]) / full_width:.2f}%, height {100 * (box[3] - box[1]) / full_height:.2f}%')

    save(pack_sprites(layers['sprites-s1'], 128), out / 'sprites-s1.webp', 82)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]))

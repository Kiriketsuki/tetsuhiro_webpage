"""Turns the gate lantern lab frames into transparent WebP layers for index.html.

lab/gate-lantern.html renders each layer twice, on a dark and on a light flat background,
and the empty scene the same way. The grade pass of the island look changes the background
colour too, so this script compares each pair against the empty pair: where the layer
covers the background fully, the dark and light frames match. Where it does not, they
differ as much as the empty frames do.

Usage: python scripts/gate-matte.py <frame dir> <out dir> <width>
The frame dir holds <layer>-s<state>-bg<0|1>.png and empty-s0-bg<0|1>.png.
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


def main(frames, out, width):
    frames, out = Path(frames), Path(out)
    out.mkdir(parents=True, exist_ok=True)
    empty_dark = load(frames / 'empty-s0-bg0.png')
    empty_light = load(frames / 'empty-s0-bg1.png')
    for name in LAYERS:
        rgba = matte(load(frames / f'{name}-bg0.png'), load(frames / f'{name}-bg1.png'), empty_dark, empty_light)
        image = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')
        if name.startswith('sprites'):
            image = pack_sprites(image, 96)
        else:
            image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
        target = out / f'{name}.webp'
        image.save(target, 'WEBP', quality=75, alpha_quality=80, method=6)
        print(f'{target.name}: {image.size[0]}x{image.size[1]}, {target.stat().st_size / 1000:.1f} kB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]))

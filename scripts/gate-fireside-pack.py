"""The pack step of scripts/gate-fireside.py: grades, crops and encodes the fireside layers.

scripts/gate-fireside.py runs this module when it runs outside Blender. It reads the linear
frames and layout.json from the work folder, and writes:

- public/gate/fireside/<layer>-d.webp and <layer>-p.webp, for a desktop and a phone.
- The CSS block between the fireside markers in index.html: the layer boxes, the lap, the
  pawprint ring, the dawn keyframes and the first paint pictures as data URLs.

The dawn keyframes play the tracks of src/components/Name.vue on the dawn share curve before
the bundle arrives. Each track here must match its frame function there.
"""
import base64
import io
import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# The grade of src/scene/aerie/grade-pass.js (GRADE).
EXPOSURE, SATURATION, CONTRAST = 1.15, 1.24, 0.16
LIFT = np.array([0.0095, 0.006, 0.0125])
# The encoded sizes, in pixels of the master square: desktop and phone.
SIZES = {'d': 1600, 'p': 960}
QUALITY = {'scene': 82, 'glow': 80, 'pit': 84, 'fire': 82, 'k': 86}
# The first paint: a soft copy of the whole picture, this many pixels wide.
FIRST_WIDTH = 240
# The dawn share curve of index.html: (offset in percent, share). gate-meter.js reads it from
# the ga-dawn-lit animation and goes on from the value it shows.
DAWN = ((0, 0.0), (8, 0.05), (20, 0.09), (40, 0.12), (70, 0.15), (100, 0.16))
DAWN_S = 24
# The lap: seconds a lap, and the pawprints round it.
LAP_S = 5.0
PAWS = 24
STAGES = 4
FLICKER = 4
RUN_FRAMES = 8
MARK = ('/* fireside:begin */', '/* fireside:end */')


def neutral(c):
    """three.js NeutralToneMapping with the exposure of the grade."""
    c = c * EXPOSURE
    x = c.min(-1, keepdims=True)
    c = c - np.where(x < 0.08, x - 6.25 * x * x, 0.04)
    peak = c.max(-1, keepdims=True)
    start = 0.76
    d = 1 - start
    new_peak = 1 - d * d / (peak + d - start)
    g = 1 - 1 / (0.15 * (peak - new_peak) + 1)
    squeezed = c * (new_peak / np.maximum(peak, 1e-6))
    squeezed = squeezed * (1 - g) + new_peak * g
    return np.where(peak < start, c, squeezed)


def grade(rgba):
    """Linear premultiplied RGBA to graded sRGB RGBA in 0..1."""
    alpha = np.clip(rgba[..., 3:4], 0, 1)
    rgb = np.where(alpha > 1e-4, rgba[..., :3] / np.maximum(alpha, 1e-4), 0)
    hdr = rgb / (1 + 0.15 * np.maximum(rgb - 0.8, 0))
    c = neutral(hdr)
    v = (c * [0.2126, 0.7152, 0.0722]).sum(-1, keepdims=True)
    c = v + (c - v) * SATURATION
    c = np.clip(c + CONTRAST * (c - 0.5) * (1 - np.abs(c - 0.5) * 2), 0, 1)
    c = np.clip(c + LIFT * (1 - v) ** 2, 0, 1)
    c = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
    return np.concatenate([c, alpha], -1)


def to_image(rgba):
    return Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def scaled(image, factor):
    """Scales with the alpha premultiplied, so no dark fringe forms at the edges."""
    w, h = max(1, round(image.width * factor)), max(1, round(image.height * factor))
    return image.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')


def webp(image, path, quality):
    image.save(path, 'WEBP', quality=quality, method=6, alpha_quality=90, exact=False)
    return path.stat().st_size


def data_url(image, quality):
    buf = io.BytesIO()
    image.save(buf, 'WEBP', quality=quality, method=6, alpha_quality=80)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()


def pct(v):
    return f'{round(v * 100, 3)}%'


def box_css(box):
    x0, y0, x1, y1 = box
    return f'left: {pct(x0)}; top: {pct(y0)}; width: {pct(x1 - x0)}; height: {pct(y1 - y0)};'


def alpha_box(images, pad=4):
    """The box round every pixel with alpha in any of the images, in pixels."""
    a = np.zeros(images[0].shape[:2], bool)
    for img in images:
        a |= img[..., 3] > 0.004
    ys, xs = np.nonzero(a)
    h, w = a.shape
    return (max(0, xs.min() - pad), max(0, ys.min() - pad), min(w, xs.max() + 1 + pad), min(h, ys.max() + 1 + pad))


# The tracks of Name.vue. Each takes the share p and gives the opacity of one element.
def stage(p, s):
    """A fire stage fades in over the stage below it, and the stage below drops out only once
    this one is fully in, so the fire never turns see-through between two stages."""
    step = 1 / (STAGES - 1)
    rise = 1.0 if s == 0 else min(1.0, max(0.0, (p - (s - 1) * step) / step))
    fall = 1.0 if s == STAGES - 1 else min(1.0, max(0.0, 1 - (p - (s + 1) * step) * 20))
    return min(rise, fall)


def tracks():
    out = {'.ga-glow': lambda p: p}
    for s in range(STAGES):
        out[f'.ga-fire-{s}'] = lambda p, s=s: stage(p, s)
    for i in range(PAWS):
        out[f'.ga-paw:nth-child({i + 1})'] = lambda p, i=i: min(1.0, max(0.0, p * PAWS - i))
    for g in range(3):
        out[f'.ga-rise-{g}'] = lambda p, g=g: min(1.0, max(0.0, p * 3 - g))
    return out


def count(p):
    return min(100, int(math.floor(p * 100 + 1e-6)))


def digit_tracks():
    out = {}
    for d in range(10):
        out[f'.ga-ones i:nth-child({d + 1})'] = lambda p, d=d: 1.0 if count(p) % 10 == d else 0.0
        out[f'.ga-tens i:nth-child({d + 1})'] = lambda p, d=d: 1.0 if count(p) >= 10 and (count(p) // 10) % 10 == d else 0.0
    out['.ga-hund i'] = lambda p: 1.0 if count(p) == 100 else 0.0
    return out


def dawn_share(offset):
    for (o0, p0), (o1, p1) in zip(DAWN, DAWN[1:]):
        if o0 <= offset <= o1:
            return p0 + (p1 - p0) * (offset - o0) / (o1 - o0)
    return DAWN[-1][1]


def dawn_offset(share):
    for (o0, p0), (o1, p1) in zip(DAWN, DAWN[1:]):
        if p0 <= share <= p1 and p1 > p0:
            return o0 + (o1 - o0) * (share - p0) / (p1 - p0)
    return None


def dawn_css(name, fn, steps=False):
    """Keyframes that play fn along the dawn: the dawn offsets, plus every share where fn
    turns a corner, so the CSS matches the meter's frames where it takes over."""
    marks = {o for o, _ in DAWN}
    corners = [k / 300 for k in range(0, 49)]
    for c in corners:
        o = dawn_offset(c)
        if o is not None:
            marks.add(round(o, 3))
    marks = sorted(marks)
    frames = []
    last = None
    for o in marks:
        v = round(fn(dawn_share(o)), 4)
        if steps:
            if v != last:
                frames.append(f'{o}% {{ opacity: {v}; animation-timing-function: step-end; }}')
                last = v
        else:
            frames.append(f'{o}% {{ opacity: {v}; }}')
    if steps:
        frames.append(f'100% {{ opacity: {last}; }}')
    return f'@keyframes {name} {{ ' + ' '.join(frames) + ' }'


def slug(selector):
    return re.sub(r'[^a-z0-9]+', '-', selector.lower()).strip('-')


def main(work, out, root):
    out.mkdir(parents=True, exist_ok=True)
    layout = json.loads((work / 'layout.json').read_text())
    master = layout['master']
    load = lambda name: grade(np.load(work / f'{name}.npy'))  # noqa: E731
    sizes = {}
    css = []

    # The scene and its first paint copy.
    scene = load('scene')
    pit = load('pit')
    scene_img = to_image(scene)
    for key, size in SIZES.items():
        sizes[f'scene-{key}'] = webp(scaled(scene_img, size / master), out / f'scene-{key}.webp', QUALITY['scene'])

    # The glow pool: the blaze picture where it is warmer than the embers picture.
    glow_lin = np.load(work / 'glow.npy')
    base_lin = np.load(work / 'scene.npy')
    lum = lambda a: (a[..., :3] * [0.2126, 0.7152, 0.0722]).sum(-1)  # noqa: E731
    diff = lum(glow_lin) - lum(base_lin)
    mask = np.clip((diff - 0.006) / 0.04, 0, 1)
    mask = mask * mask * (3 - 2 * mask)
    glow = load('glow')
    glow[..., 3] *= mask
    gx0, gy0, gx1, gy1 = alpha_box([glow], pad=8)
    glow_img = to_image(glow[gy0:gy1, gx0:gx1])
    # The pool is soft light, so it encodes at half the size and the browser scales it up.
    for key, size in SIZES.items():
        sizes[f'glow-{key}'] = webp(scaled(glow_img, size / master / 2), out / f'glow-{key}.webp', QUALITY['glow'])
    css.append(f'.ga-glow {{ {box_css((gx0 / master, gy0 / master, gx1 / master, gy1 / master))} }}')

    # The fire pit, which lies over Kinako on the far side of the lap.
    px0, py0, px1, py1 = alpha_box([pit])
    pit_img = to_image(pit[py0:py1, px0:px1])
    for key, size in SIZES.items():
        sizes[f'pit-{key}'] = webp(scaled(pit_img, size / master), out / f'pit-{key}.webp', QUALITY['pit'])
    css.append(f'.ga-pit {{ {box_css((px0 / master, py0 / master, px1 / master, py1 / master))} }}')

    # The fire stages: a row of flicker frames each.
    fb = layout['fire_box']
    css.append(f'.ga-fire {{ {box_css(fb)} }}')
    first_fire = None
    for s in range(STAGES):
        row = [to_image(load(f'fire-{s}-{f}')) for f in range(FLICKER)]
        strip = Image.new('RGBA', (row[0].width * FLICKER, row[0].height))
        for f, img in enumerate(row):
            strip.paste(img, (f * img.width, 0))
        for key, size in SIZES.items():
            img = scaled(strip, size / master)
            # The embers paint with the first paint, from a data URL, so they need no file.
            if s == 0:
                if key == 'd':
                    first_fire = data_url(img, 70)
                continue
            sizes[f'fire-{s}-{key}'] = webp(img, out / f'fire-{s}-{key}.webp', QUALITY['fire'])

    # Kinako's sheets.
    sheets = {'nap': 1, 'wake': 4, 'run': RUN_FRAMES, 'sit': 3}
    first_nap = None
    for sheet, n in sheets.items():
        row = [to_image(load(f'k-{sheet}-{k}')) for k in range(n)]
        strip = Image.new('RGBA', (row[0].width * n, row[0].height))
        for k, img in enumerate(row):
            strip.paste(img, (k * img.width, 0))
        for key, size in SIZES.items():
            img = scaled(strip, size / master)
            if sheet == 'nap':
                if key == 'd':
                    first_nap = data_url(img, 82)
                continue
            sizes[f'k-{sheet}-{key}'] = webp(img, out / f'k-{sheet}-{key}.webp', QUALITY['k'])
        x0, y0, x1, y1 = layout['boxes'][sheet]
        css.append(f'.ga-k-{sheet} {{ --kw: {round(x1 - x0, 4)}; --kh: {round(y1 - y0, 4)}; }}')

    # The first paint copy: the scene, the pit, the embers and the nap, small and soft.
    first = scene_img.copy()
    first.alpha_composite(pit_img, (px0, py0))
    nap = to_image(load('k-nap-0'))
    nx0, ny0, _, _ = layout['boxes']['nap']
    first.alpha_composite(nap, (round(nx0 * master), round(ny0 * master)))
    first = scaled(first, FIRST_WIDTH / master).filter(ImageFilter.GaussianBlur(0.6))
    first_url = data_url(first, 50)

    # The horizon: the median top of the lawn across the middle of the picture. The haze and
    # the city bokeh sit on it.
    alpha = scene[..., 3]
    cols = range(master // 5, master * 4 // 5, 8)
    tops = sorted(int(np.argmax(alpha[:, c] > 0.5)) for c in cols)
    hz = tops[len(tops) // 2] / master
    rng = np.random.default_rng(11)
    discs = []
    for _ in range(64):
        x = rng.uniform(0, 100)
        y = rng.uniform(-13, 1.5)
        r = rng.uniform(0.35, 1.5)
        colour = ('#ffc478', '#ffaa5a', '#aac8ff', '#ffe2aa')[rng.integers(4)]
        a = int(rng.uniform(0.18, 0.42) * 255)
        discs.append(f'{x:.2f}cqw {y:.2f}cqw 0 {r:.2f}cqw {colour}{a:02x}')
    css.append(f'#gate-art {{ --hz: {round(hz, 4)}; }}')
    css.append('.ga-bokeh { box-shadow: ' + ', '.join(discs) + '; }')

    # The lap and the pawprint ring.
    e = layout['ellipse']
    k = e['ry'] / e['rx']
    nap_at, sit_at = layout['nap_at'], layout['sit_at']
    on = lambda deg: (e['cx'] + e['rx'] * math.cos(math.radians(deg)), e['cy'] + e['ry'] * math.sin(math.radians(deg)))  # noqa: E731
    depth = layout['depth'] + [layout['depth'][0]]
    depth_at = lambda deg: np.interp(deg % 360, np.arange(0, 361, 30), depth)  # noqa: E731
    nap_xy, sit_xy = on(nap_at), on(sit_at)
    css.append(
        f'#gate-art {{ --fx: {round(layout["fire"][0], 4)}; --fy: {round(layout["fire"][1], 4)}; '
        f'--lap: {round(2 * e["rx"], 4)}; --lap-s: {LAP_S}s; --lap-delay: {round(-(nap_at - sit_at) / 360 * LAP_S, 3)}s; }}'
    )
    css.append(f'.ga-lap {{ left: {pct(e["cx"] - e["rx"])}; top: {pct(e["cy"] - e["rx"])}; width: {pct(2 * e["rx"])}; transform: scaleY({round(k, 4)}); }}')
    css.append(f'.ga-unsquash {{ transform: scaleY({round(1 / k, 4)}); }}')
    css.append(f'.ga-at-nap {{ left: {pct(nap_xy[0])}; top: {pct(nap_xy[1])}; }}')
    css.append(f'.ga-at-sit {{ left: {pct(sit_xy[0])}; top: {pct(sit_xy[1])}; }}')
    # The lap keyframes run from the sit point round to it again, so a lap that stops at the end
    # of an iteration stops where Kinako sits.
    frames = []
    for step in range(13):
        deg = sit_at + step * 30
        frames.append(f'{round(step / 12 * 100, 3)}% {{ transform: scale({round(float(depth_at(deg)), 4)}); }}')
    css.append('@keyframes ga-lap-depth { ' + ' '.join(frames) + ' }')
    css.append(f'@keyframes ga-spin {{ from {{ transform: rotate({sit_at}deg); }} to {{ transform: rotate({sit_at + 360}deg); }} }}')
    css.append(f'@keyframes ga-unspin {{ from {{ transform: rotate({-sit_at}deg); }} to {{ transform: rotate({-sit_at - 360}deg); }} }}')
    # The near copy shows from the sit point to the left end and from the right end back. The
    # far copy shows between. The swap lands at the ends, where both copies stand at one depth.
    half = (180 - sit_at) / 360 * 100
    css.append(f'@keyframes ga-near {{ 0% {{ opacity: 1; animation-timing-function: step-end; }} {round(half, 3)}% {{ opacity: 0; animation-timing-function: step-end; }} {round(half + 50, 3)}% {{ opacity: 1; }} 100% {{ opacity: 1; }} }}')
    css.append(f'@keyframes ga-far {{ 0% {{ opacity: 0; animation-timing-function: step-end; }} {round(half, 3)}% {{ opacity: 1; animation-timing-function: step-end; }} {round(half + 50, 3)}% {{ opacity: 0; }} 100% {{ opacity: 0; }} }}')
    for i in range(PAWS):
        deg = nap_at + i * 360 / PAWS
        x, y = on(deg)
        a = math.radians(deg)
        tangent = math.degrees(math.atan2(e['ry'] * math.cos(a), -e['rx'] * math.sin(a)))
        side = 1 if i % 2 else -1
        nx, ny = -math.sin(math.radians(tangent)), math.cos(math.radians(tangent))
        x, y = x + nx * 0.008 * side, y + ny * 0.008 * side
        s = float(depth_at(deg))
        css.append(f'.ga-paw:nth-child({i + 1}) {{ left: {pct(x)}; top: {pct(y)}; transform: translate(-50%, -50%) scale({round(s, 3)}) scaleY({round(k * 1.3, 3)}) rotate({round(tangent, 1)}deg); }}')

    # The dawn keyframes, one per track, and the rule that runs each.
    for selector, fn in tracks().items():
        name = 'ga-dawn-lit' if selector == '.ga-glow' else f'ga-dawn-{slug(selector)}'
        css.append(dawn_css(name, fn))
        css.append(f'#gate-art {selector} {{ opacity: {round(fn(0), 4)}; animation: {name} {DAWN_S}s linear forwards; }}')
    for selector, fn in digit_tracks().items():
        name = f'ga-dawn-{slug(selector)}'
        css.append(dawn_css(name, fn, steps=True))
        css.append(f'#gate-art {selector} {{ opacity: {round(fn(0), 4)}; animation: {name} {DAWN_S}s linear forwards; }}')

    css.append(f'.ga-first {{ background-image: url({first_url}); }}')
    css.append(f'.ga-k-nap .ga-k-still {{ background-image: url({first_nap}); }}')
    css.append(f'.ga-fire-0 .ga-strip {{ background-image: url({first_fire}); }}')

    html_path = root / 'index.html'
    raw = html_path.read_bytes().decode('utf-8')
    crlf = '\r\n' in raw
    text = raw.replace('\r\n', '\n')
    start, end = text.index(MARK[0]), text.index(MARK[1])
    indent = '      '
    block = MARK[0] + '\n' + '\n'.join(indent + line for line in css) + '\n' + indent + MARK[1]
    text = text[:start] + block + text[end + len(MARK[1]):]
    html_path.write_bytes((text.replace('\n', '\r\n') if crlf else text).encode('utf-8'))

    first_bytes = sum(len(u) for u in (first_url, first_nap, first_fire))
    print('PACK', json.dumps({'files': sizes, 'first_paint_base64': first_bytes}, indent=1))

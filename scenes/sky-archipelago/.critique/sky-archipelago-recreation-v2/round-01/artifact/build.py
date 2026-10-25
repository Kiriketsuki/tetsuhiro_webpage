"""Builds the sky archipelago scene from an empty Blender 5.2 file.

Run it in Blender with `blender --python build.py`, or execute it from the Text Editor.
It loads only the CC0 textures listed in credits.md. Everything else is procedural.
"""
import os
import sys
import time

# ---------------------------------------------------------------- tweakable constants

SEED = 20261022
WORLD_SCALE = 1.0                  # Multiplies every world-space length except human-sized props.
RES = (3840, 2160)                 # Final render size, fixed by the rubric.
CAMERA_NAME = 'Cam_Reference'
CAMERA_LENS = 24.0                 # mm on a 36 mm sensor.
CAMERA_PITCH_DEG = -12.5           # Negative tilts the view down. The reference looks down on the lake.
TORII_DEPTH = 26.0                 # Distance to the terrace torii, which anchors the foreground.
GROUND_Z = -900.0                  # Height of the ground city under the clouds.

HERO_TOWER_COUNT = 12              # Towers in the cluster behind the central island.
DISTANT_ISLAND_COUNT = 34          # Floating islands beyond the central island.
DISTANT_FALLS_SHARE = 0.4          # Share of distant islands with a waterfall.
CENTRAL_TREE_COUNT = 70
TERRACE_TREE_COUNT = 9
RIGHT_CLIFF_TREE_COUNT = 14
CITY_BLOCK_DENSITY = 0.0016        # Blocks per square metre in the ground city.
CLOUD_BLOB_COUNT = 150
HAZE_DISTANCE = 3200.0             # Metres over which far planes wash into haze.
FLYING_CRAFT_COUNT = 6
HOME_FLOORS = 11                   # Storeys in the user's home tower.
HOME_ROOM_FLOOR = 8                # Storey of the furnish-ready corner room, counted from 0.

ROOT = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()

CONFIG = {k: v for k, v in globals().items() if k.isupper()}


def log(line, _start=[time.time()]):
    msg = f'[{time.time() - _start[0]:7.1f}s] {line}'
    print(msg)
    with open(os.path.join(ROOT, 'build_log.txt'), 'a', encoding='utf-8') as fh:
        fh.write(msg + '\n')


def main():
    if ROOT not in sys.path:
        sys.path.insert(0, ROOT)
    import importlib
    import random
    from lib import util, materials, camera, sky, terrain, water, props, trees, towers, home, city, report
    for m in (util, materials, camera, sky, terrain, water, props, trees, towers, home, city, report):
        importlib.reload(m)
    open(os.path.join(ROOT, 'build_log.txt'), 'w').close()
    util.CFG.clear()
    util.CFG.update(CONFIG)
    random.seed(SEED)
    t0 = time.time()
    steps = [
        ('reset scene', camera.reset_scene),
        ('cameras and render settings', camera.setup),
        ('materials', materials.build_all),
        ('sky wash', sky.world),
        ('terrace cliff', terrain.terrace_cliff),
        ('central island', terrain.central_island),
        ('right cliff', terrain.right_cliff),
        ('hero tower island', terrain.hero_island),
        ('distant islands', terrain.distant_islands),
        ('lake, waterfalls and mist', water.build),
        ('terrace props', props.terrace),
        ('central island props', props.central),
        ('bridges', props.bridges),
        ('trees', trees.build),
        ('hero towers', towers.hero_cluster),
        ('distant towers', towers.distant),
        ('home tower and interior', home.build),
        ('ground city', city.ground_city),
        ('clouds', sky.clouds),
        ('flying craft', sky.flying_craft),
        ('lights', camera.lights),
        ('compositor', camera.compositor),
    ]
    for label, fn in steps:
        t = time.time()
        fn()
        log(f'{label}: {time.time() - t:.1f}s')
    report.write(os.path.join(ROOT, 'scene_report.json'))
    log(f'BUILD COMPLETE in {time.time() - t0:.1f}s')
    return time.time() - t0


if __name__ == '__main__':
    main()

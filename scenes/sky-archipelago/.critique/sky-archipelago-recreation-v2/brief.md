# Brief: sky archipelago 3D recreation

## Artifact

A Blender 5.2 scene, built from an empty file by `scenes/sky-archipelago/build.py`. It recreates the composition and contents of `scenes/sky-archipelago/reference.webp` in true 3D, in a soft watercolour painted toon style at high detail. It is not photorealism.

## Audience and task

The user is the owner of a personal portfolio site. They want this scene as the base for a new 3D hero scene. They will tweak it later, and they will style the interior of their own home building.

## Evidence produced each round

All paths are relative to `scenes/sky-archipelago/`.

- `renders/final.png`: 3840x2160, rendered from the camera `Cam_Reference`.
- `renders/compare.png`: the reference beside the render, plus six matched 100% crops. The crops show the foreground terrace, the central waterfall lip, the hero tower tops, a lamp bridge, the ground city through the cloud gap, and the distant islands.
- `renders/home_interior.png`: rendered from `Cam_Home` inside the home tower's corner room.
- `scene_report.json`: exported from the built scene. It lists collections, objects, dimensions, materials, modifiers and lights.
- `build.py` and its supporting modules in `lib/`, plus `build_log.txt` from a rebuild in an empty file.
- `checklist.md`: build time and render time.
- `credits.md`: every downloaded asset, with its source URL and licence.
- `git_status.txt`: git status and git log output.

## Constraints

- Night, and waterfalls that fade into mist. Stars and rain are out of scope.
- The home island sits at a modest height. The home tower stands on the left foreground cliff.
- Only procedural geometry and materials, plus CC0 textures and paper scans from Poly Haven or ambientCG.
- Work stays inside `scenes/sky-archipelago/`. Nothing under `src/` changes, and no commit is made.

## Excluded scope

Web export, real-time performance and animation.

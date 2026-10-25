# Sanctuary style studies

Open `sanctuary_style_studies.blend`. The original default scene is retained.

Use the Scene selector at the top of Blender to compare:

- `SS_Study_A_Cinematic`: textured materials, softened edges, shaped cliff outcrops, rounded canopies and folded leaf details.
- `SS_Study_B_LowPoly`: faceted rocks and foliage, simpler materials and fewer foreground faces.

The studies share the overview camera, workshop camera, lighting, atmosphere and city. The home, stream, bridge and island footprint have the same layout. These are editable design studies; browser export and runtime performance have not been tested.

The city lies 750 scene metres below the island. Its geometry and the volumetric clouds are render references, to be simplified or replaced when preparing the web scene.

## Renders

- `renders/A_cinematic.png` and `renders/B_lowpoly.png`: matching overview renders.
- `renders/A_cinematic_detail.png` and `renders/B_lowpoly_detail.png`: matching workshop close-ups.

## Reproduction

Run `build()` from `build_studies.py` in a fresh Blender file, then `refine()` from `refine_studies.py`, `finish()` from `finish_studies.py`, and `polish()` from `polish_foliage.py`. The builders do not clear unrelated scenes. Refinement scripts edit only their own `SS_*` study objects and are guarded against repeated application.

Render a saved file in background Blender with `--python render_studies.py`. Add `-- --detail` for workshop close-ups, or `-- --preview` for quick overview checks.

All geometry and materials are procedural. No external models or textures are required.

# Faceted sanctuary study

Open `sanctuary_faceted.blend` and select `LP_Faceted_Sanctuary`.

This revision follows the latest direction: the original A study's fidelity, approximately double its base polygon budget, with faceted geometry throughout. The compact timber-and-glass workshop, blue hour, waterfall and city below retain the earlier composition.

- All visible foreground mesh polygons use flat shading. There are zero smooth-shaded foreground faces.
- Trees use broad angular crown cages and folded planar leaf sprays. The previous rounded canopy forms are replaced.
- The main island mesh increases from 528 to 4,752 triangles. Outcrops, layered ledges and sparse angular ivy add cliff detail.
- Cedar, slate, foliage and stone use restrained painted colour maps. No normal-map smoothing is applied to these materials.
- Architecture has single-plane edge chamfers; no rounded bevel segments or subdivision smoothing.

## Geometry accounting

| Foreground | Original A | This revision | Ratio |
| --- | ---: | ---: | ---: |
| Base triangles | 59,962 | 119,170 | 1.99x |
| Evaluated triangles, including modifiers | 111,714 | 151,826 | 1.36x |

Base counts are the comparison used for the doubled modelling budget. Evaluated counts grow less because rounded bevels were reduced to single-plane chamfers. The distant city and volumetric cloud reference geometry are excluded from both foreground counts. The detailed object ledger is in `geometry_report.json`.

## Images

- `renders/overview.png`: 1800 x 1400.
- `renders/workshop.png`: 1800 x 1200.

Both were rendered in Blender EEVEE at 96 samples and visually inspected. Web export and runtime performance remain untested.

## Reproduction

Run `build()` from `build_faceted.py` in a Blender file containing the earlier A/B studies. It clones source data before editing and saves to this directory. It calls `add_geology()` from `polish_faceted.py` during the build. The scripts refuse to rebuild over the existing scene/file.

For the saved blend, run background Blender with `--python render_faceted.py`. Add `-- --preview` for quick camera checks. The renderer does not save changes to the blend.

Earlier scene studies and their saved files are preserved. Textures are packed in this blend and copied into `textures/`; see `texture-provenance.md`.

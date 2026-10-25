# Urban aerie house studies

## Watercolour lab and painted city: 25 October 2026

The dev server serves a lab at `/lab/watercolour.html`. It loads `island_b.glb` (or `island_b_lod1.glb` on a phone or with `?lod=1`) in the Phase 6 look. `vite.config.js` does not list the lab as a build input, so the live site never contains it. Other options are `?tier=0..3`, `?still` and `?cam=hero|workshop|telescope|bedroom|pad|arrival`.

The look lives in `src/scene/aerie/`, ready for Phase 4:

- `toon-material.js`: one MeshLambertMaterial patch with one `customProgramCacheKey`. It replaces the light loop with a fixed rig in uniforms: a 4-step moon ramp on NearestFilter, a cool hemisphere and up to four warm bounce spots at the workshop, entry, bedroom and barbecue anchors. Each facet has one normal, so it gets one moon step. Colour comes only from the baked vertex colours, the smooth bounce field and the pigment pools. The pools are a world-space noise a few metres wide that deepens or lifts the shadow steps, so they move with the island.
- `composite-pass.js`: replaces OutputPass. It does Neutral tone mapping, luminance Sobel edge darkening, a paper grain multiply, a 1.6 px screen-UV wobble and a vignette, in 11 texture fetches. The grain shows only where there is paint. An earlier version put the pigment pools here, in screen space, and they read as a texture over the whole frame, sky included. `paper-texture.js` builds its noise at startup. No tier has bloom.
- `glow-sprites.js`: one `THREE.Points` call of soft additive sprites over the emissive windows, lanterns and pad lights.
- `city-backdrop.js` and `sky.js`: the painted city and a gradient night dome.
- `quality.js`: the ladder drops MSAA, then the pixel ratio. A governor steps down when the median frame time stays over budget. Reduced motion renders one frame.

`export_island_b.py -- --city-layers` renders the city that the GLB leaves out. It saves `island_b_city_layers.blend` first and checks that the source hash does not change. A shear leans every wall back by 45 degrees, so a top-down orthographic camera sees the south faces and their windows. Only the sun and the world light the city, with no shadows. The stage lifts the warm windows, adds a 9 m halo and blurs each layer more with distance. The far layer leaves out the road slab and the river, flattens the ground rows, and gains dim made-up districts copied from the real city light. Each image is soft clipped as `1 - exp(-radiance * 6)` and the site decodes it.

| Layer | Ground | Pixels | Blur | Plane height | Size |
| --- | --- | --- | --- | --- | --- |
| far | 8000 m | 512 | 3.0 px | -790 | 3.2 kB |
| mid | 2800 m | 768 | 2.0 px | -764 | 16.2 kB |
| near | 1400 m | 1024 | 1.4 px | -750 | 72.1 kB |
| mist (tileable) | two veils at -430 and -70 | 512 | | | 4.3 kB |

All four files total 95.8 kB. The manifest is `src/assets/city/city_layers.json`. The near layer twinkles its warm windows in a cheap shader.

Measured in the app's Chromium pane on an RTX 4070 (ANGLE D3D11), with the GPU timer query:

| View | GLB | Tier | Buffer | GPU ms | Calls | Tris | Programs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Arrival, desktop | desktop | msaa4, dpr 1 | 1024 x 768 | 2.84 | 53 | 114,215 | 9 |
| Arrival, desktop | desktop | no-msaa, dpr 1 | 1024 x 768 | 2.13 | 53 | 114,215 | 9 |
| Arrival, phone emulation | lod1 | no-msaa, dpr 2 | 750 x 1624 | 3.41 | 50 | 68,752 | 9 |

Screenshots: `renders/watercolour-lab/`. Not done yet: shadows, the waterfall, stars, a phone-friendly camera framing and a Kuwahara pass.

## Current web export: 25 October 2026

`export_island_b.py` turns `Island_B_Rolling_Rim` into web GLBs for the three.js site. Run it with background Blender from this folder:

```
blender --factory-startup -b island_b_rolling_rim.blend --python export_island_b.py -- [--replace] [--no-compress]
```

The script saves a copy, `island_b_web_export.blend` (scene `Island_B_Web`), before it changes anything, and it checks the SHA-256 of the source before and after. It keeps only meshes that render in this scene. It applies modifiers, moves every mesh into world space and joins the meshes into 11 named meshes: Island, Rock, Turf, Flowers, House, Glass, Trees, Water, Pad, Paths and Props. The 84 source materials in use become 23 web materials (`web_rock`, `web_crown`, `web_glass_clear`, `web_emit_warm` and so on). The report lists the full map.

Cycles bakes every base-colour field into one colour attribute, COLOR_0, as an emission bake per face corner. This covers the rock height, slope and noise tint, the soil band, the crown gradient and the painted textures. The script then averages each vertex per material and relaxes it twice over its neighbours. The per-face `RockFacetValue` jitter and the single-point texture samples therefore drop out, and only the smooth fields stay. Material borders stay sharp. Glass and emissive faces carry white and keep their own colour in the material. The script never welds a vertex. Flat shading stays, with no smooth faces and no custom normals.

Budgets, as three.js r180 draws them:

| GLB | Triangles | Primitives | three.js draw calls | Size |
| --- | --- | --- | --- | --- |
| `src/assets/models/island_b.glb` | 111,936 | 43 | 45 | 900 KB (10.8 MB raw) |
| `src/assets/models/island_b_lod1.glb` | 66,473 | 40 | 42 | 494 KB (6.0 MB raw) |

Double-sided glass draws twice, so the draw-call column is two higher than the primitive count. gltf-transform 4.5.1 compresses in three steps. Dedup keeps materials by name, and prune keeps the empty anchors. Draco edgebreaker then quantises position to 14 bits, normal to 10 bits and colour to 8 bits. No textures remain, so no WebP step runs.

The export leaves out the distant city (163,752 triangles), the city ground, roads and river, and the far ground. It also leaves out both cloud layers, the haze volume, the 464 falling-water faces and every light. Trees lose the 3,944 leaf faces that sit fully inside their crown. A smooth noise field with a lean toward the crown top then ranks each leaf, and the desktop GLB keeps the top 55 %. LOD1 has no flowers, keeps 8 % of the leaves, 35 % of the meadow and 50 % of the ground planting, by the same ranking.

The GLB holds five perspective cameras for the stops, `Cam_01_Hero`, `Cam_02_Workshop`, `Cam_03_Telescope`, `Cam_04_Bedroom` (top floor) and `Cam_05_Pad`. `src/scene/island.js` reads `gltf.cameras`, so these are cameras, not empties. The telescope review camera was orthographic, so the export rebuilds it as a 50 mm perspective camera on the same line of sight. Empties mark the rooms and the light rig: `Anchor_Workshop`, `Anchor_Telescope`, `Anchor_Bedroom`, `Anchor_Pad`, `Anchor_BBQ`, `Anchor_Lookout`, `Anchor_Entry_Light`, `Anchor_Warm_Rim`, `Anchor_Cool_Rim`, `Anchor_Moon`, `Anchor_Waterfall_Top`, `Anchor_Waterfall_Base` and `Anchor_City`.

`src/assets/models/island_b_city.json` holds the city as 3,200 building boxes and 10,446 window boxes in the GLB frame (metres, Y up). Windows store a centre and an index into a short size table. Instance one unit box per group with `InstancedMesh`. The file is 345 KB, or 80 KB gzipped.

A three.js check loaded both GLBs with the planned rig of one hemisphere, one moon, one warm rim and one entry point light. Colours, glass, emissive windows, lanterns and pad lights all read as in the Blender renders, and the rock shows no checkerboard. Screenshots: `renders/web-export/`. Evidence: `island_b_web_export_report.json`. The site does not load these files yet.

## Current rolling rim — 25 October 2026

Working file: `island_b_rolling_rim.blend`, scene `Island_B_Rolling_Rim`. A promontory now carries the sky-taxi pad. Ray by ray from the island centre, the rim moves out until it sits 0.35 inside the pad edge, so the pad keeps a small lip. The push fades over 6 units inland and from z -0.4 down to z -5. The soil band therefore leans out as a shelf, and its underside slopes back into the rock above the blunt spike. The largest push is 1.88. Under the pad, the turf drops to a bed 0.1 below the deck. The pad was rebuilt on the new ground: twelve posts and two struts now meet the terrain.

The top rolls gently by -0.30 to +0.29. Two low octaves of Perlin noise make broad swells, and the mean over the open lawn is removed. The roll fades to zero within 0.6 to 2.8 of the house, water, banks, reeds, bridge, lookout, lanterns, paths, pad and tree trunks. At 761 sample points under those structures, the ground moved at most 0.0005. The rim rises and falls with the swells, so the skyline and the soil band thickness vary. Meadow, grass accents, planting, flowers and edge grass ride the new ground part by part.

A turf lip spills over the rim in 76 segments. Each segment has an inner edge tucked onto the turf, an outer edge that droops, and a hanging fringe of teeth. Smooth noise along the rim sets its reach and opens gaps. The lip skips the waterfall spill and the pad. It uses the terrain grass material with a constant RockFacetValue of 1.0, never a per-face value. Below the lip, 42 tapered root strands hang in clusters of 2 to 4, from 0.6 to 1.5 long.

The terrain stays one closed manifold, with no boundary or non-manifold edges. The vertex count is unchanged, because the build only moves vertices. Every source mesh fingerprint in `Island_B_Night_Arrival` matches. Renders: `renders/rolling-rim/`. Build: `rolling_rim.py`; render: `render_rolling_rim.py`; evidence: `island_b_rolling_rim_report.json`.

## Current night arrival — 25 October 2026

Working file: `island_b_night_arrival.blend`, scene `Island_B_Night_Arrival`. The island now has a story. A sky-taxi pad, 5.0 across, sits on the front-right corner. Its outer half hangs past the rim above the blunt spike. Slim posts carry the inland half, and two steel struts reach back into the rock face. A painted ring and an H mark the deck. Twelve edge lights alternate warm white and aircraft red, and an orange windsock stands on the inland edge. A timber ramp joins the open east side of the city lookout to the pad. The arrival route now runs from the pad over the ramp, lookout, bridge and flagstone path to the workshop, then up the stairs to the bedroom on the top floor.

Both walking paths are rebuilt as curved flagstone paths. Each path follows a Catmull-Rom curve, flares where it meets the entry steps and passes beside the lanterns. Staggered stones sit on a dark joint bed and follow the ground. The straight concrete approach and the small sandy slab are removed from this scene only.

The night grade lowers exposure to 0.05, darkens the zenith and halves the cool fills. A soft underglow and a cool back rim keep the rock blue grey. The rock takes a tint from height, slope and a very large noise, so the top near the soil is warmer and the deep tip is cooler. The soil fades from rich brown under the turf to grey brown at its base. One crown gradient (height, AO and a large noise) replaces the five alternating leaf tints on every tree. The cloud layers are stretched flat, and the entry canopy has a steel edge and a downlight. The workshop has a project corkboard beside the rear window, with ten cards and a red thread. The bedroom has a bedside lamp and a rug.

The island, sky and light collections were cloned before editing, and every source mesh fingerprint matches. The city and waterfall are unchanged, because the waterfall will be rebuilt in three.js. Renders: `renders/night-arrival/`. Build: `night_arrival.py`; render: `render_night_arrival.py`; evidence: `island_b_night_arrival_report.json`.

## Current dining terrace and connected rear façade — 24 October 2026

Working file: `island_b_dining_rear.blend`, scene `Island_B_Dining_Rear_Facade`. An 0.86-diameter faceted timber dining table and two slender chairs with muted green seat pads furnish the top terrace beside the barbecue. Two cups and a small stem vase keep the setting minimal. The stair arrival, cooking space and route alongside the dining set remain clear.

Three recessed rear windows replace the blank wall panels, with actual openings, slender timber frames, charcoal sills and warm views into the rooms. The three bookcases moved to their respective side walls. Glazed returns close the stepped rear interfaces between the house and staircase, with slender steel jambs, floor ties and front lintel connections. The living-floor landing meets a new stone threshold and its glazed door opens inward.

The previous scene/file remains intact, and island, trees, water, telescope and barbecue retain their geometry. Clearance checks passed 225 body rays across 0.50 width with no obstructions or floor gaps, covering the ground entry, stair approach, living rear entrance, second terrace and roof routes. All eight chair feet contact the deck, and six window sightline checks hit glazing before any wall. Renders: `renders/dining-rear/`. Build: `refine_dining_rear.py`; render: `render_dining_rear.py`; evidence: `island_b_dining_rear_report.json`.

## Current terrace activities — 24 October 2026

Working file: `island_b_terrace_life.blend`, scene `Island_B_Terrace_Life`. The top terrace now has a compact charcoal barbecue with an open angular hood, steel cooking grate, small embers, lower shelf and an attached prep surface with a timber board and tongs. Its cooking face points into the open deck. The second-block roof terrace has a cream faceted refractor telescope on a slim tripod, a small observing stool and a narrow star-chart tray with a red reading-light detail. The telescope occupies the exposed outer end of the west terrace and points above the trees into unobstructed sky.

All additions use flat shading and live in their own collection. The source scene, building, glass boundaries, island, water and trees retain their geometry. Both terrace approaches passed 105 body-clearance rays across 0.50 width, with no collisions or floor gaps. All three tripod feet meet the deck, and the optical axis clears the scene geometry over a 60-unit ray. Three final renders were visually inspected in `renders/terrace-life/`. Build: `add_terrace_life.py`; render: `render_terrace_life.py`; evidence: `island_b_terrace_life_report.json`.

## Current glass edges and corrected entrance — 24 October 2026

Working file: `island_b_glass_edges_entry.blend`, scene `Island_B_Glass_Edges_Entry`. The exposed timber support frame, knee braces and large concrete shoes were replaced by seven slender charcoal columns (0.065–0.075 wide) with nearly flush feet. Balcony members are shallow steel sections, and the pergola posts are slimmer. Balcony, landing and stair barriers are now 0.40-high clear glass panels with polished edges and small base shoes; there are no railing posts or top rails.

The ground entrance was rebuilt instead of retaining the overlapping platform and old steps. One continuous landing at z=1.05 now meets the workshop floor and the first exterior flight. Three broad approach treads rise to it. The original wall and glazing across the doorway, obsolete door, old entrance steps and platform were removed. A real 1.2-wide opening has a sliding glass door parked to its left. The first flight was rebuilt to match the landing height. A light glass canopy covers the doorway, and one approach path meets the broad steps.

The source scene and the island, pond and trees are preserved. The workshop entrance, door-to-stair route and both roof routes passed 135 sampled body-clearance rays across 0.50 width, with no obstructions or floor gaps. All 54 stair tread centres have overhead cover with at least 2.305 headroom. Five renders were inspected in `renders/house-glass-entry/`. Build: `refine_house_entry_glass.py`; render: `render_glass_entry.py`; evidence: `island_b_glass_edges_entry_report.json`.

## Current placement and minimal railings — 24 October 2026

Working file: `island_b_minimal_house.blend`, scene `Island_B_Minimal_House`. The entire building, including lights, sheltered stairs and rooftop structures, moved 2 units left and 1 unit forward. The small forward adjustment keeps the house clear of the existing tree canopies. All eight support feet were reseated on the actual terrain. House railings are now 0.76 units high instead of 1.04 (27% lower), with thinner uprights at wider spacing and no bottom rail; railing geometry reduced from 2,560 to 1,344 vertices.

One connected closed path now branches to the workshop porch and stair entrance. The entrance lantern moved with the approach, and planting beneath the new footprint/path was cleared. Terrain, pond, water and all five trees retain their geometry and placement. The preceding house scene/file remains intact. Geometry checks found no tree/house intersections and no boundary edges in the new path. Detail, pond-side, rooftop and full-island renders were reviewed in `renders/house-minimal/`. Build: `shift_house_minimal.py`; render: `render_minimal_house.py`; evidence: `island_b_minimal_house_report.json`.

## Current house structure and roof access — 24 October 2026

Working file: `island_b_sheltered_roof_access.blend`, scene `Island_B_Sheltered_Roof_Access`. Timber pillars on stone feet support the projecting living block and balconies. Three rebuilt switchback flights connect the ground porch, living-floor rear door, second-block L-shaped roof terrace and full rooftop deck. A continuous metal canopy and transparent weather screens shelter the stairs. Railings leave actual entry openings; the rooftop pergola is raised, its rear post sits outside the arrival route, and upper shutters and planters leave room to pass.

The house collection and mesh data were copied before editing. The previous tree scene/file, accepted terrain, trees and water are preserved. All new geometry uses flat shading. Geometry checks found overhead cover above all 54 treads, with a minimum sampled stair headroom of 2.305 m. Terrace and landing route samples have no floor gaps or obstructions at five body heights across a 0.48 m sampled width. These are scene geometry checks, not construction specifications. Five review renders are in `renders/house-roof-access/`. Build: `improve_house_structure.py`; render: `render_house_structure.py`; evidence: `island_b_sheltered_roof_access_report.json`.

## Current tree refinement — 24 October 2026

Working file: `island_b_refined_trees.blend`, scene `Island_B_Refined_Trees`. Five trees now have different heights, bent tapered trunks, grounded root flares, visible forks and uneven layered crowns. Each crown uses 45 small irregular lobes with folded planar leaves and five muted green tones. All tree faces remain flat shaded (59,704 triangles across the five trees). The finalized B5 terrain and other props reuse their unchanged geometry; the original scene and file are preserved. Front and three-quarter overview renders plus both grove close-ups were inspected in `renders/island-refined-trees/`. A mesh intersection check found no tree intersections with the house wall/foundation meshes. Build: `improve_faceted_trees.py`; evidence: `island_b_refined_trees_report.json`. Awaiting visual feedback on the new trees.

## Final B island — 24 October 2026

Working file: `island_b_final_facets.blend`, scene `Island_B_Final_Facets`. This completes the requested final proportion/facet pass. The main tip is farther left/back at (-10.07, 1.56, -16.65), and the short blunt overhang tip is farther right/front at (13.24, -0.63, -7.35). The four smaller attached spurs remain. Terrain triangles increased exactly 1.5x, from 13,700 to 20,550: 11,794 rock, 7,442 grass and 1,314 soil. Facet size stays comparable between the three materials, with flat shading and no smoothing. The terrain is one closed manifold component with 10,277 vertices; key ground contact heights agree within 0.000006 m, and planting follows the refined free ground. B4 terrain and props are unchanged in their source scene. Front, three-quarter and side renders were inspected in `renders/island-b-final/`. Build: `finalize_b_island.py`; report: `island_b_final_facets_report.json`. Previous revision files remain available.

## Previous B offset spurs — 24 October 2026

Working file: `island_b_offset_spurs.blend`, scene `Island_B_Offset_Spurs`. The main point tapers farther and leans left, with its tip at (-7.87, 0.46, -16.65). Four small unequal attached spurs interrupt the surrounding rock. Grass and soil now use facets comparable in size to the rock (median triangle areas 0.128, 0.142 and 0.127 respectively). All 13,700 triangles are flat shaded; the terrain remains a single closed manifold component. The rim is preserved, sampled house/tree/bridge/path/water contact heights agree with B3 within 0.000004 m, and eight planting objects follow the revised free ground. Front, three-quarter and side renders were reviewed in `renders/island-b-offset-spurs/`. The prior B3 file is preserved. Build: `refine_b_satellite_spikes.py`; evidence: `island_b_offset_spurs_report.json`. Awaiting visual feedback.

## Previous B proportions — 24 October 2026

Working file: `island_b_spike_proportions.blend`, scene `Island_B_Spike_Proportions`. The main hanging mass is longer (lowest z -13.11 to -16.65), and the overhang spike is shorter (lowest z -10.44 to -7.35) with a broader angular end. This is a local deformation of B2 with identical topology: one closed component, 5,327 vertices and 10,650 flat triangles. Grass, soil and props retain their geometry; the B2 source is preserved. Front, three-quarter and side views were rendered and inspected in `renders/island-b-proportions/`. Build script: `refine_b_spike_proportions.py`; report: `island_b_spike_proportions_report.json`. Awaiting visual feedback.

## Previous B refinement — 24 October 2026

The user chose **B / Undercut Shelf** from `island_profile_options.blend` and requested removal of its quarry-like rows plus a downward spike beneath the overhang. The working revision is `island_b_fractured_overhang.blend`, scene `Island_B_Fractured_Overhang`; it is awaiting visual feedback.

The repeating terrace profiles are replaced by irregular cliff patches and a single triangulated underside. A broad main mass and a smaller eastern spike meet through an undercut. The terrain remains one closed component, with 5,327 vertices, 10,650 triangles, zero boundary edges and zero non-manifold edges. All faces use flat shading. The grass/soil cap is identical to B, and the house, vegetation, paths, bridge and water reuse their existing geometry. The original A/B/C study scenes and the reverted `atelier_fractured_rock.blend` are preserved.

The stone has modest face-value variation and a low cool light that reveals downward-facing facets. Review images are `renders/island-b-refined/B2_front.png`, `B2_three_quarter.png` and `B2_side.png`. Build with `refine_b_fractures.py` from the saved options file; render with `render_b_fractures.py`. Topology evidence is in `island_b_fractured_overhang_report.json`.

## Earlier jagged refinement

The latest scene is `atelier_jagged.blend`, scene `UA_B_Atelier_Jagged`. The landform has a rolling skyline, a thick irregular turf-and-soil cap, smaller rock facets and stepped fractures. Its underside finishes in one broad off-centre taper. The house, accepted tree shapes, flowers and bridge design are retained. Earlier scenes/files are preserved.

The terrain has 2,682 ground triangles and 1,200 cliff/edge triangles. It remains one closed manifold component: 1,943 vertices, 3,882 triangles, zero boundary edges and zero non-manifold edges. Ground heights range from 0.04 m in the recessed water basin to 1.799 m on the raised rim. Turf thickness varies from 0.50 to 0.98 m; exposed soil beneath it varies from 0.88 to 2.09 m. Both layers share actual vertices with the ground and cliff. Faceted grass blades root into the rim and hang over it.

House/stair pads, paths, bridge approaches and the lookout remain grounded. The five tree root pads match intact copies of the accepted tree geometry; tree assemblies move vertically as whole left/right groups. The water sits inside the protected basin, with its outer sheet boundaries buried under the bank. Its soft depth gradient and floating ripple strokes have been removed. Pond, stream and waterfall are one connected water surface; 396 sampled sheet-boundary positions inside the island show no exposed gap. All visible foreground mesh faces remain flat-shaded.

Art direction follows the user's drawn side profile: uneven ground reaches the skyline, with grass and soil spilling over rock. Visual references inspected online are [Gunes Ozcan's floating island](https://dribbble.com/shots/1929856-1st-Low-Poly-Floating-Island) for the thick green overhang and fractured underlying mass, and [HakanBacon's Floating Islands](https://hakanbacon.itch.io/floating-islands) for varied ground outlines and edge vegetation. The reference's many hanging bottom peaks are excluded. No external meshes or image assets were imported for this pass.

Final views are `renders/Jagged_cliff.png`, `Jagged_garden.png`, `Jagged_surface.png`, `Jagged_overview.png`, `Jagged_pond.png`, `Jagged_waterline.png` and `Jagged_stream.png`. They use EEVEE at 96 samples. Geometry/contact evidence is in `jagged_report.json`.

Reproduce by opening `atelier_faceted_restored.blend` and calling `build()` in `jagged_landform.py`. The builder clones edited collections/data and refuses to overwrite an existing jagged scene/file. Render with `render_restored.py -- --jagged`; add `--preview` for smaller images. Web export and performance remain untested.

## Earlier contact refinement

The preceding contact study is `atelier_cohesion.blend`, scene `UA_B_Atelier_Cohesion`. Its dense smooth-looking cap treatment is superseded by the art direction above.

The ground cap is triangulated with both actual water edges as constraints, then stitched into the existing cliff rim. The bank rises 18 mm above the water boundary and slopes below the water inside the basin. This replaces the approximate vertex-height fitting that left exposed dark gaps in the preceding pond pass. At 436 sampled shoreline positions inside the island, the repaired terrain overlaps the water edge by at least 17.995 mm; no exposed gap was found. The terrain is one closed manifold component with 4,873 vertices, 9,742 triangular faces, zero boundary edges and zero non-manifold edges. The separate pond, stream and waterfall remain one connected water surface.

Paths follow the final ground and embed their lower edges in it. House/stair footings, bridge abutments, lookout posts and the access step extend into the terrain. Stones, grass, flowers, five lanterns and five reed beds were reseated; misplaced shore fragments were cleared from the water. Ten bridge railing posts now seat in arch-following timber bearing strips, and four balcony planters meet their decks.

Final renders are `renders/Cohesion_pond.png`, `Cohesion_garden.png`, `Cohesion_house.png` and `Cohesion_overview.png`. Four additional low-angle checks are `Cohesion_pond_waterline.png`, `Cohesion_stream_bank.png`, `Cohesion_bridge_contacts.png` and `Cohesion_house_contacts.png`. All use EEVEE at 96 samples. See `cohesion_report.json` for the geometry/contact audit.

To reproduce, open `atelier_pond_patina.blend` and run `build()` in `improve_cohesion.py`. It clones edited collections and meshes before rebuilding the terrain using `cohesion_geometry.py`, and refuses to overwrite an existing cohesion scene/file. `render_cohesion.py` renders all eight views without saving camera changes; `-- --preview` renders smaller previews and `-- --contacts` selects the four contact cameras.

## Previous pond and material pass

The preceding material/pond pass is `atelier_pond_patina.blend`, scene `UA_B_Atelier_PondPatina`. It preserves the sheltered-house design and all preceding comparison scenes/files. Its approximate bank fitting is superseded by the cohesion pass above.

The pond has an asymmetric shoreline, a locally refined sloping basin and fitted grassy banks. Its painted water shade distinguishes the deeper centre from the shallows. Wet-line stones, sparse reeds, five notched lily pads and quiet broken ripple arcs add natural detail. Pond, stream and waterfall remain one connected water surface.

The terrain remains one closed manifold component after local shore refinement: 4,257 vertices, 8,510 triangular faces, no open or non-manifold edges. Nearby planting was reseated against the actual terrain surface. The accepted tree shapes and overall scene composition are retained.

Timber, plaster, slate and stone have restrained painted colour variation. Individual timber pieces fade slightly differently; bridge boards have tiny construction variations and fine end-grain marks. Path edges and a few hairline marks add wear without changing the route or its terminal joins. All foreground mesh faces remain flat-shaded. No new image assets were generated; existing packed painted maps are reused.

Latest renders: `renders/Patina_pond.png`, `renders/Patina_garden.png`, `renders/Patina_house.png`, and `renders/Patina_overview.png`. They use EEVEE at 96 samples. Build/review records are in `pond_patina_report.json`.

Reproduce by opening `atelier_sheltered.blend` and running `build()` from `refine_pond_patina.py`. It clones the editable scene/geometry/materials before making changes. Use `render_pond_patina.py` to render without saving camera settings. `resume()` in the refinement script exists solely to finish the first interrupted attribute-allocation attempt and is not needed for a new build.

The previous structural/landscape pass is `atelier_sheltered.blend`, scene `UA_B_Atelier_Sheltered`. The earlier A/B/C comparison file is also preserved.

The ground-floor workshop remains glazed. The upper rooms now have solid plaster/timber fronts, recessed frames, real openings, balcony doors and open timber shutters. The two offset upper volumes retain their outside stairs and planted balconies.

The island has a mildly uneven faceted surface, raised grove pads, blended stream banks and level structural/path approaches. The plateau and cliff remain one connected closed mesh: 3,266 vertices, 6,528 triangular faces, zero boundary edges and zero non-manifold edges. Existing planting was settled onto the revised terrain, while the accepted trees retain their geometry and are translated to meet the raised grove pads.

There are 238 faceted flowers in small pink, lavender, cream and yellow beds. Pond, stream and waterfall share vertices in one continuous water surface. The lookout and its entry step were shifted inward, with a revised path ending at the step.

Latest renders are `renders/Sheltered_house.png`, `renders/Sheltered_garden.png`, and `renders/Sheltered_overview.png`. Final images use EEVEE at 96 samples. All visible foreground faces use flat shading.

To reproduce this refinement, open the preceding `urban_aerie_studies.blend` and run `build()` from `refine_atelier.py`. It clones the selected scene and privately copies all edited geometry, calls `refine_landscape.py`, and finishes the water/approach connections using `finish_flow.py`. It refuses to overwrite the existing refined scene/file. `render_sheltered.py` renders the three views without saving changes. `sheltered_report.json` records the build and review checks.

Open `urban_aerie_studies.blend`. Select one of these scenes:

| Scene | House concept |
| --- | --- |
| `UA_A_Townhouse` | Narrow three-storey townhouse, pitched roof, projecting planted balcony. Workshop, living room, then bedroom. |
| `UA_B_Atelier` | Three offset volumes, two external stair flights, planted balconies and an open roof pergola. |
| `UA_C_Cottage` | Two storeys and a tall attic under a steep roof, small balcony and dormer. |

These are editable architectural studies for comparison, using identical island geometry, trees, lighting, atmosphere, cameras and material palette. All house faces use flat shading. Earlier study scenes and their saved files are preserved.

## Shared island and approach repairs

- The terrain is one connected closed manifold mesh, `SS_UA_Connected_Island`: 2,018 vertices, 4,032 triangular faces, one connected component, zero boundary edges and zero non-manifold edges.
- The grassy plateau and cliff rings share actual boundary vertices. There are no separate cliff outcrops or attached rock lumps. Stream banks and vegetation remain separate grounded scene props.
- Two stone abutments embed in the terrain and overlap the bridge deck undersides. Two timber stringers support the deck. The approaches have intermediate steps.
- A continuous route links each front entry staircase to the west bridge landing, crosses the bridge, then follows the east path to a raised city lookout with a bench. A grounded step joins the path to the lookout deck.
- All three houses have stone plinths embedded in the plateau and overlapping their ground-floor slabs.

`build_report.json` records the terrain topology audit and approach repairs. The two path meshes were also checked: each is one closed manifold component.

## Renders

`renders/` contains matching `A_Townhouse`, `B_Atelier`, and `C_Cottage` overview and house images. Final house images are 1500 x 1500; overviews are 1800 x 1400. Final images use Blender EEVEE at 96 samples.

## Reproduction

Run `build()` in `build_aeries.py` from the preceding faceted-sanctuary file. The builder creates new scenes and refuses to overwrite an existing urban-aerie scene/file. It contains the final foundation, path-join, camera and dormer corrections.

`repair_approaches.py` records the one-off review pass applied to the first urban-aerie build. It is guarded and is not needed when running the current builder.

Render the saved blend using background Blender and `--python render_aeries.py`. Add `-- --preview`, `-- --house`, or `-- --overview` as needed. Rendering does not save camera changes back to the blend.

Painted maps are packed in the blend. Their original generation prompt and source are recorded in `../cozy-lowpoly/texture-provenance.md`. No new image assets were generated for this comparison. Web export/performance are not evaluated in these architectural studies.

# Sky archipelago 3D recreation rubric

Rubric `sky-archipelago-recreation`, version 1. This file matches `rubric.json`.

## Scope

A Blender 5.2 scene that recreates scenes/sky-archipelago/reference.webp in 3D at painterly-realistic fidelity, judged from the frozen renders, crops, checklist, build script and scene report of one round. It covers the still frame from Cam_Reference and the home interior frame from Cam_Home. It does not cover web export, real-time performance or animation.

## Assumptions

- The reference image is saved at `scenes/sky-archipelago/reference.webp`.
- The goal adds one artifact the reviewers need: `scene_report.json`, exported from the built scene. Without it, the props, facade, home and structure criteria score null.
- "Dozens of distant islands" means at least 24 visible islands.
- The landmark boxes come from the 1672x941 reference, measured by eye. They allow 0.05 of the frame on every side.
- The home tower sits on the left foreground cliff. The reference does not mark the user's building.
- The rubric follows the reference on torii and the central lake island, even though earlier notes asked for few torii and no central park island.

## Weights

| Dimension | Weight | Why |
|---|---|---|
| Match to the reference image | 30 | The goal is a recreation of one image. |
| Natural and prop detail | 30 | The user rejected low poly. This dimension measures the fidelity of rock, trees, water and props. |
| Architecture | 30 | The user asked for varied towers and stressed their own building. The home building carries 40 of the 100 points here, with a floor of 8. |
| Scene structure for later tweaks | 10 | The user wants to tweak the scene next. Structure matters, but less than the image itself. |

## Scoring instructions

- Scores are whole numbers from 0 to 10. Higher is better.
- Five-condition criteria award 2 points per met condition, so only 0, 2, 4, 6, 8 and 10 are allowed.
- Ten-item criteria award 1 point per passing item.
- Missing evidence gives a null score, not 0. A null score or an unknown gate blocks a pass.
- Gates are pass or fail. A high score cannot make up for a failed gate.
- Every reviewer scores every criterion and checks every gate.

## Match to the reference image (30)

### Composition and landmark placement (`composition`, weight 40)

**Question:** How many of the ten reference landmarks sit in the same place in the render?

**Procedure:**

1. Open renders/final.png and the reference. Express positions as fractions of frame width (x) and height (y), measured from the top left.
2. Landmark 1: the foreground torii on the left terrace. Reference box: x 0.04 to 0.16, y 0.34 to 0.57.
3. Landmark 2: the foreground terrace floor and railing. Reference box: x 0.00 to 0.30, y 0.50 to 0.78.
4. Landmark 3: the central island cliff face and waterfall. Reference box: x 0.44 to 0.77, y 0.40 to 0.82.
5. Landmark 4: the central lake surface. Reference box: x 0.54 to 0.74, y 0.41 to 0.51.
6. Landmark 5: the hero spire tower cluster. Reference box: x 0.53 to 0.73, y 0.00 to 0.40.
7. Landmark 6: the ground city and river in the cloud gap. Reference box: x 0.28 to 0.56, y 0.55 to 0.92.
8. Landmark 7: the lower right lamp bridge. Reference box: x 0.71 to 0.92, y 0.80 to 0.90.
9. Landmark 8: the right cliff with torii and waterfall. Reference box: x 0.87 to 1.00, y 0.33 to 0.67.
10. Landmark 9: the Milky Way band. Reference box: x 0.28 to 0.58, y 0.00 to 0.16.
11. Landmark 10: the distant islands with waterfalls, upper left of centre. Reference box: x 0.18 to 0.46, y 0.14 to 0.36.
12. Find the visual centre of each landmark in the render. It passes when that centre lies inside its reference box expanded by 0.05 on every side.
13. Record one row per landmark with the measured centre in pixels, the fractional position and the pass or fail result.
14. Count the passing items. Award 1 point per passing item. This count defines every intermediate score.
15. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- renders/final.png at 3840x2160 from Cam_Reference.
- The reference image.
- A ten-row landmark table with measured pixel centres.

| Score | Anchor |
|---|---|
| 0 | No landmark passes. |
| 4 | At least four of the ten landmarks pass. |
| 6 | At least six of the ten landmarks pass. |
| 8 | At least eight of the ten landmarks pass. |
| 10 | All ten landmarks pass. |

### Lighting and colour (`light-colour`, weight 35)

**Question:** Does the render reproduce the reference's warm-against-cool night lighting?

**Procedure:**

1. Inspect renders/final.png and the six crops in renders/compare.png. Sample pixels with an image tool where a condition names a hue.
2. Condition 1: The brightest large areas are lamplit surfaces and the city glow in the cloud gap, not the sky.
3. Condition 2: Five sampled pixels on lamps, windows or city lights fall in hue 15 to 55 degrees, and five sampled pixels in cloud shadow or open sky fall in hue 210 to 290 degrees.
4. Condition 3: Lanterns, bridge lamps and windows cast visible light pools on nearby surfaces in all three of these crops: terrace, lamp bridge, central island.
5. Condition 4: The wet terrace floor reflects the lanterns, and the lake reflects the tower lights.
6. Condition 5: Red aircraft lights show on the tops of at least five towers, and the flying craft carry lights.
7. Record one row per condition with the file, crop or pixel location, and a met or unmet result.
8. Count the met conditions. Award 2 points per met condition, so the only allowed scores are 0, 2, 4, 6, 8 and 10. Do not award odd scores.
9. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- renders/final.png at 3840x2160 from Cam_Reference.
- renders/compare.png with the reference beside the render and the six matched 100% crops.
- A five-row condition table with locations and results.

| Score | Anchor |
|---|---|
| 0 | No condition is met. |
| 4 | At least two of the five conditions are met. |
| 6 | At least three of the five conditions are met. |
| 8 | At least four of the five conditions are met. |
| 10 | All five conditions are met. |

### Atmosphere and depth (`atmosphere`, weight 25)

**Question:** Does the air between objects read as deep, wet and cloudy, as in the reference?

**Procedure:**

1. Inspect renders/final.png and the crops of the distant islands and the cloud gap.
2. Condition 1: Four depth planes (foreground terrace, central island, tower cluster, far islands) step down in contrast and shift toward blue with distance.
3. Condition 2: Clouds have lit tops and shaded undersides with volume, not a flat uniform haze.
4. Condition 3: Mist at the base of each foreground and midground waterfall blends the falling water into the clouds.
5. Condition 4: Rain streaks show over dark areas and do not hide any landmark.
6. Condition 5: Stars fill the clear sky and a coloured Milky Way band crosses the top of the frame.
7. Record one row per condition with the file, crop or pixel location, and a met or unmet result.
8. Count the met conditions. Award 2 points per met condition, so the only allowed scores are 0, 2, 4, 6, 8 and 10. Do not award odd scores.
9. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- renders/final.png at 3840x2160 from Cam_Reference.
- renders/compare.png with the reference beside the render and the six matched 100% crops.
- A five-row condition table with locations and results.

| Score | Anchor |
|---|---|
| 0 | No condition is met. |
| 4 | At least two of the five conditions are met. |
| 6 | At least three of the five conditions are met. |
| 8 | At least four of the five conditions are met. |
| 10 | All five conditions are met. |

## Natural and prop detail (30)

### Rock and cliffs (`rock`, weight 30)

**Question:** Do the cliffs read as detailed rock at 100% crop?

**Procedure:**

1. Inspect the foreground terrace crop and the central waterfall lip crop at 100% scale.
2. Condition 1: Silhouettes and shading show no straight polygon segments or flat-shaded facets where the reference shows curves.
3. Condition 2: Vertical columns or fractures divide the cliff faces.
4. Condition 3: Horizontal ledges or strata break up the columns.
5. Condition 4: Moss, grass or plants grow on the ledges and along the island lips.
6. Condition 5: Island undersides overhang and taper, with hanging spikes, roots or debris.
7. Record one row per condition with the file, crop or pixel location, and a met or unmet result.
8. Count the met conditions. Award 2 points per met condition, so the only allowed scores are 0, 2, 4, 6, 8 and 10. Do not award odd scores.
9. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- renders/compare.png with the reference beside the render and the six matched 100% crops.
- A five-row condition table with locations and results.

| Score | Anchor |
|---|---|
| 0 | No condition is met. |
| 4 | At least two of the five conditions are met. |
| 6 | At least three of the five conditions are met. |
| 8 | At least four of the five conditions are met. |
| 10 | All five conditions are met. |

### Trees and plants (`vegetation`, weight 25)

**Question:** Do trees read as real trees, not blobs?

**Procedure:**

1. Inspect the terrace and central island crops at 100% scale.
2. Condition 1: At least three tree species with different silhouettes appear, one of them sakura.
3. Condition 2: The foreground trees show visible branches and trunks.
4. Condition 3: Leaf masses break into separate clumps with gaps, not single smooth shapes.
5. Condition 4: Sakura blossom shows pink clusters with internal breakup.
6. Condition 5: Trees vary in size and grow along cliff edges, the terrace and the lake shore.
7. Record one row per condition with the file, crop or pixel location, and a met or unmet result.
8. Count the met conditions. Award 2 points per met condition, so the only allowed scores are 0, 2, 4, 6, 8 and 10. Do not award odd scores.
9. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- renders/compare.png with the reference beside the render and the six matched 100% crops.
- A five-row condition table with locations and results.

| Score | Anchor |
|---|---|
| 0 | No condition is met. |
| 4 | At least two of the five conditions are met. |
| 6 | At least three of the five conditions are met. |
| 8 | At least four of the five conditions are met. |
| 10 | All five conditions are met. |

### Lake and waterfalls (`water`, weight 25)

**Question:** Does the water match the reference's lake and waterfall?

**Procedure:**

1. Inspect the central waterfall lip crop and renders/final.png.
2. Condition 1: The central waterfall falls as several separate strands with gaps between them.
3. Condition 2: Each strand shows vertical streak detail and widens or fades as it falls.
4. Condition 3: White water or foam shows at the lip where the lake spills over.
5. Condition 4: The falls connect without a seam to the lake surface at the lip.
6. Condition 5: The lake surface shows ripples and reflected lights.
7. Record one row per condition with the file, crop or pixel location, and a met or unmet result.
8. Count the met conditions. Award 2 points per met condition, so the only allowed scores are 0, 2, 4, 6, 8 and 10. Do not award odd scores.
9. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- renders/final.png at 3840x2160 from Cam_Reference.
- renders/compare.png with the reference beside the render and the six matched 100% crops.
- A five-row condition table with locations and results.

| Score | Anchor |
|---|---|
| 0 | No condition is met. |
| 4 | At least two of the five conditions are met. |
| 6 | At least three of the five conditions are met. |
| 8 | At least four of the five conditions are met. |
| 10 | All five conditions are met. |

### Shrines, lanterns, railings and bridges (`props`, weight 20)

**Question:** Are the man-made props built at the reference's level of detail?

**Procedure:**

1. Inspect the terrace and lamp bridge crops at 100% scale, and use scene_report.json to confirm object parts.
2. Condition 1: Each torii has two pillars, an upper beam with upturned ends and a lower tie beam.
3. Condition 2: Each stone lantern has a base, a post, a glowing firebox and a roof.
4. Condition 3: The railing has separate posts and a top rail.
5. Condition 4: The stairs have individual treads.
6. Condition 5: The bridges have arches or piers and lamp posts along the deck.
7. Record one row per condition with the file, crop or pixel location, and a met or unmet result.
8. Count the met conditions. Award 2 points per met condition, so the only allowed scores are 0, 2, 4, 6, 8 and 10. Do not award odd scores.
9. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- renders/compare.png with the reference beside the render and the six matched 100% crops.
- scene_report.json exported from the built scene: collections, object names, dimensions, materials and modifiers.
- A five-row condition table with locations and results.

| Score | Anchor |
|---|---|
| 0 | No condition is met. |
| 4 | At least two of the five conditions are met. |
| 6 | At least three of the five conditions are met. |
| 8 | At least four of the five conditions are met. |
| 10 | All five conditions are met. |

## Architecture (30)

### Varied tower architecture (`variety`, weight 30)

**Question:** How many of the ten tallest hero towers have their own architecture?

**Procedure:**

1. In renders/final.png, select the ten tallest towers in the hero cluster. Number them left to right.
2. For each tower, record its massing (for example slab, setback tiers, cylinder, twin shafts), its facade (for example ribbed stone, curtain glass, window grid, banded) and its crown (for example spire, lantern top, flat with plant, stepped).
3. A tower passes when no other tower in the ten shares two or more of its three attributes.
4. Record one row per tower with its crop location, the three attributes and the pass or fail result.
5. Count the passing items. Award 1 point per passing item. This count defines every intermediate score.
6. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- renders/final.png at 3840x2160 from Cam_Reference.
- A ten-row tower table with attributes and crop locations.

| Score | Anchor |
|---|---|
| 0 | No tower passes. |
| 4 | At least four of the ten towers pass. |
| 6 | At least six of the ten towers pass. |
| 8 | At least eight of the ten towers pass. |
| 10 | All ten towers pass. |

### Facade detail (`facade`, weight 30)

**Question:** Do tower facades carry real architectural detail at 100% crop?

**Procedure:**

1. Inspect the hero tower crop at 100% scale and the matching objects in scene_report.json.
2. Condition 1: Windows have frames or mullions that cast shadow lines, so they read as recessed.
3. Condition 2: Floor bands or spandrels separate the storeys.
4. Condition 3: Towers step back in tiers or change section as they rise.
5. Condition 4: Crowns carry detail: a spire, a lantern top, finials or a ribbed cap.
6. Condition 5: Facades carry fixtures: antennas, aircraft lights, signs or balconies.
7. Record one row per condition with the file, crop or pixel location, and a met or unmet result.
8. Count the met conditions. Award 2 points per met condition, so the only allowed scores are 0, 2, 4, 6, 8 and 10. Do not award odd scores.
9. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- renders/compare.png with the reference beside the render and the six matched 100% crops.
- scene_report.json exported from the built scene: collections, object names, dimensions, materials and modifiers.
- A five-row condition table with locations and results.

| Score | Anchor |
|---|---|
| 0 | No condition is met. |
| 4 | At least two of the five conditions are met. |
| 6 | At least three of the five conditions are met. |
| 8 | At least four of the five conditions are met. |
| 10 | All five conditions are met. |

### The user's home building, outside and inside (`home`, weight 40, floor 8)

**Question:** Is the home building ready for the user to style its interior?

**Procedure:**

1. Inspect renders/final.png, renders/home_interior.png and scene_report.json.
2. Item 1: the home tower stands on the left foreground cliff.
3. Item 2: the home tower is shorter than every tower in the hero cluster.
4. Item 3: its exterior has an architecture of its own, with balconies, frames or a distinct crown, and lit windows.
5. Item 4: a Home_Interior collection exists, and its objects belong to the home tower.
6. Item 5: the interior has floor slabs, a ceiling and walls with real thickness.
7. Item 6: the window glass is a separate object with thickness, set in frames.
8. Item 7: one corner room has window walls on two sides.
9. Item 8: the corner room's floor-to-ceiling height lies between 2.4 m and 3.2 m, measured in scene_report.json.
10. Item 9: renders/home_interior.png comes from Cam_Home inside the corner room and shows the city through the glass.
11. Item 10: the room has at least one interior light, and holds no furniture or placeholder objects, so it is ready to furnish.
12. Record one row per item with the evidence location and the pass or fail result.
13. Count the passing items. Award 1 point per passing item. This count defines every intermediate score.
14. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- renders/final.png at 3840x2160 from Cam_Reference.
- renders/home_interior.png from Cam_Home.
- scene_report.json exported from the built scene: collections, object names, dimensions, materials and modifiers.
- A ten-row item table with evidence locations.

| Score | Anchor |
|---|---|
| 0 | No item passes. |
| 4 | At least four of the ten items pass. |
| 6 | At least six of the ten items pass. |
| 8 | At least eight of the ten items pass. |
| 10 | All ten items pass. |

## Scene structure for later tweaks (10)

### Organised, adjustable scene (`structure`, weight 100)

**Question:** Can the user find and tweak each part of the scene without reading all of build.py?

**Procedure:**

1. Inspect build.py and scene_report.json.
2. Condition 1: Each major part (terrace, central island, hero towers, distant islands, bridges, ground city, sky and clouds, home building) has its own collection.
3. Condition 2: Object names say what the object is. No object keeps a default name such as Cube.001.
4. Condition 3: Materials are shared by role and named by role, for example Rock, Tower_Glass, Lantern.
5. Condition 4: build.py exposes the seed, the world scale and the main counts as named constants near the top of the file.
6. Condition 5: checklist.md records the build time and the render time of the reviewed version.
7. Record one row per condition with the file, crop or pixel location, and a met or unmet result.
8. Count the met conditions. Award 2 points per met condition, so the only allowed scores are 0, 2, 4, 6, 8 and 10. Do not award odd scores.
9. If a required file is missing or unreadable, report null and name the missing evidence. Do not score it as a failure.

**Evidence:**

- build.py.
- scene_report.json exported from the built scene: collections, object names, dimensions, materials and modifiers.
- checklist.md.
- A five-row condition table with locations and results.

| Score | Anchor |
|---|---|
| 0 | No condition is met. |
| 4 | At least two of the five conditions are met. |
| 6 | At least three of the five conditions are met. |
| 8 | At least four of the five conditions are met. |
| 10 | All five conditions are met. |

## Gates

### Required artifacts exist and open (`artifacts`)

**Procedure:**

1. Open each required file: renders/final.png, renders/compare.png, renders/home_interior.png, checklist.md, credits.md, build.py and scene_report.json.
2. Pass only when every file opens and renders/final.png measures exactly 3840x2160.

**Evidence:**

- A file list with each path, its open result and the pixel size of renders/final.png.

### Every reference element is present (`elements`)

**Procedure:**

1. Check each element in renders/final.png. Use the crops and scene_report.json where an element is small.
2. Element 1: Foreground cliff terrace on the left.
3. Element 2: Shrine building on the terrace.
4. Element 3: Red torii on the terrace.
5. Element 4: Lit stone lanterns.
6. Element 5: Stairs.
7. Element 6: Wooden railing.
8. Element 7: Wet reflective terrace floor.
9. Element 8: Central floating island with a lake.
10. Element 9: Multi-strand waterfall from the island lip.
11. Element 10: Trees and sakura on the central island.
12. Element 11: Small shrine buildings and torii on the central island.
13. Element 12: Dark spire tower cluster behind the central island.
14. Element 13: At least 24 distant floating islands with towers, some with waterfalls.
15. Element 14: Arched bridges with lamps.
16. Element 15: Ground city with a river and lights, seen through a cloud gap.
17. Element 16: Volumetric clouds.
18. Element 17: Mist below the waterfalls.
19. Element 18: Stars and a Milky Way band.
20. Element 19: Rain streaks.
21. Element 20: Red aircraft lights on tower tops.
22. Element 21: Small flying craft.
23. Element 22: The user's home tower on the left foreground cliff.
24. Pass only when all 22 elements are visible in the render.

**Evidence:**

- renders/final.png at 3840x2160 from Cam_Reference.
- renders/compare.png with the reference beside the render and the six matched 100% crops.
- scene_report.json exported from the built scene: collections, object names, dimensions, materials and modifiers.
- A 22-row table with the location of each element in the render.

### No low-poly faceting in the foreground and midground (`no-faceting`)

**Procedure:**

1. Inspect the six crops in renders/compare.png at 100% scale.
2. Fail when any foreground or midground silhouette or shading shows straight polygon segments or flat-shaded facets where the subject is curved.

**Evidence:**

- renders/compare.png with the reference beside the render and the six matched 100% crops.
- A result per crop, with the location of any facet found.

### The scene rebuilds from an empty file (`rebuild`)

**Procedure:**

1. Run build.py in a new empty Blender 5.2 file.
2. Pass only when it completes without error and produces a scene whose Cam_Reference render matches renders/final.png in composition and elements.

**Evidence:**

- The run log of build.py from an empty file.
- The rebuilt render, or a recorded comparison against renders/final.png.

### Assets are CC0 and credited (`licensing`)

**Procedure:**

1. Compare every external file that build.py loads with credits.md.
2. Pass only when each external asset comes from Poly Haven or ambientCG under CC0, and credits.md lists it with its source URL.

**Evidence:**

- The list of external files that build.py loads.
- credits.md.

### Work stayed in scope (`scope`)

**Procedure:**

1. Run git status and git log in the repository.
2. Pass only when changes are limited to scenes/sky-archipelago/, nothing under src/ changed, and no new commit exists.

**Evidence:**

- git status output.
- git log output for the most recent commits.

## Evidence checklist

- `renders/final.png` at 3840x2160 from `Cam_Reference`
- `renders/compare.png` with the reference beside the render and six matched 100% crops
- `renders/home_interior.png` from `Cam_Home`
- `scene_report.json`
- `build.py` and its run log from an empty file
- `checklist.md` with build and render times
- `credits.md`
- `git status` and `git log` output

## Limits

A passing score shows that one still frame matches the reference. It does not show web readiness, real-time performance or animation quality.

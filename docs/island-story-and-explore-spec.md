# Island story path and free exploration: spec (November 2026)

Status: draft for approval, 2 November 2026. Nothing in this spec is built yet.

This spec covers two linked features of the urban aerie island:

1. **Story path.** Home tells one journey across the island, in the order a visitor would walk it.
2. **Explore on foot.** A visitor leaves the story and walks a small animal round the island, in the spirit of Bruno Simon's portfolio.

It extends `docs/site-rewrite-plan.md`. The budgets, the no-bloom rule, the smooth SPA and the DOM fallback for every room stay as that plan sets them.

## Decisions (2 November 2026, with the owner)

| Question | Decision |
|---|---|
| Story order | The island route: pad, workshop, bedroom, telescope, campfire |
| Scroll feel | Snap, then travel. Scroll snaps to a section, then the camera follows the route to the next stop |
| Explore mode | Option B: walk the island with a kinematic capsule and a follow camera. No physics engine |
| Walker | A stylised animal, a mix of a cat and a fox. It need not be true to life. The model comes later, so a placeholder walks first |
| Walk reach | The ground and both roof terraces, by the stair tower |
| Explore entry | The Welcome button and the Contact card at the campfire |

## Part 1: story path

### Chapters

| # | Chapter | Section | Stop | Text side | Lens focus |
|---|---|---|---|---|---|
| 01 | Arrival: the sky-taxi lands on the pad | `welcome` | `arrival` (new) | none | `Anchor_Pad` |
| 02 | Over the bridge to the workshop | `projects` | `workshop` | left | `Anchor_Corkboard` |
| 03 | Up the glass stair tower to the bedroom | `about` | `bedroom` | left | `Anchor_Bedroom` |
| 04 | Out onto the terrace and the telescope | `skills` | `telescope` | right | `Anchor_Telescope` |
| 05 | Down to the campfire | `contact` | `campfire` (new) | right | `Anchor_Campfire` |

- `src/data/waypoints.js` takes this order. `sections`, the keys 1 to 5 and the snap points follow from it, as they do now.
- The nav (`src/components/Navbar.vue`) lists Welcome, Projects, About, Skills, Contact. The middle item, under the mark, becomes About, the bedroom, which is the highest room of the house.
- `arrival` is a new stop. It looks west from beyond the pad along the walkway: the pad in front, then the ramp, the deck, the bridge and the house. The portrait `tallView` of `pad` already frames this view, so `arrival` starts from it on both orientations and gets its own landscape shot.
- `hero` and `pad` stay in `stops.js`, because the lab and the round notes use them. Delete them only when nothing reads them.
- `campfire` is a new stop. It looks across the lawn fire toward the house, with the crowns and the night sky behind. The shot is tuned in the lab.
- The focus column fills the `focus` key that commit 816a791 added. Each value is a first guess, and the owner tunes it in the lab with the shots.

### The gate and the first move

The gate lift flies from `overview` to `arrival`, not to `hero`. The move reads as the sky-taxi coming down onto the pad. The duration stays 2.4 s.

### Moves between stops

**A move to a neighbour follows the route.** Each pair of neighbouring stops has one leg. A leg is a walk spline along the real path:

| Leg | Route |
|---|---|
| `arrival` to `workshop` | the ramp, the deck, the bridge, the path, the workshop porch |
| `workshop` to `bedroom` | the porch, then up and round the outside of the stair tower to the top floor |
| `bedroom` to `telescope` | out through the balcony door onto the L-shaped terrace |
| `telescope` to `campfire` | back past the tower, down to the lawn, across to the fire |

- The camera rides behind and above the walk spline (a drone follow, about 4 m up and 5 m back) and looks at a point about 3 m ahead on it.
- Over the first 20 percent of a leg, the camera blends from the start stop's shot into the follow frame. Over the last 25 percent it blends into the end stop's shot.
- The leg duration grows with its length, from 2.0 s to a cap of 3.2 s. The ease stays the rig's `ease`.
- A scroll up plays the same leg in reverse.
- The `workshop` to `bedroom` leg keeps the rain on the glass and the fade (`fade` in `scene-manager.js`). The leg stays outside the tower, so the camera never passes through a wall.
- The lens fades out during a leg, as `rig.travel` already does for a move. The focus point blends from one stop's focus to the next.

**A jump of two or more stops keeps the lifted arc.** A nav click or a number key that skips a stop uses today's move, with `LIFT_PER_METRE` and `MAX_LIFT`. The full route from the pad to the fire runs about 12 s, which is too long for a jump.

**A new section in the middle of a leg starts a new move from where the camera is.** The rig already starts every move from the current camera. If the new target is a neighbour of the leg's end stop, the move takes that leg. Otherwise it takes the arc.

**A direct visit still cuts.** `setRoute(name, { cut: true })` opens the route's room without a move.

### Where the route data lives

- The route points come from Blender. One empty per point, named `Route_<from>_<to>_NN`, goes into the main GLB. An empty adds no triangles.
- `src/data/route.js` holds a fallback list of points for each leg, in the same form as the `fallback` shots in `stops.js`. The rig uses it until the GLB arrives, or if the GLB lacks the empties.
- `shotsFromStops` gains a sibling, `legsFromRoute(route, anchorAt)`, that builds one `THREE.CatmullRomCurve3` per leg.
- `rig.goTo(id, duration)` gains an optional leg: `rig.goTo(id, { leg })`. Without a leg it keeps the arc.

### Story text

- Each section heading carries its chapter number and a short line, for example "02, over the bridge". The DOM stays the accessible version of the story, as the plan requires.
- The Contact card at the campfire ends the story. It carries the second explore button: "wander the island".

### Story acceptance checks

1. Scroll from 01 to 05 and back. Each move follows its leg, and no camera passes through geometry.
2. Click Contact from Welcome. The camera takes the arc, under 2.4 s.
3. Open `/projects` directly. The scene opens at `workshop` with no move.
4. With reduced motion, each section change cuts.
5. The frame time stays under 16.7 ms (desktop) and 22 ms (mid Android) during a leg, measured in the lab.

## Part 2: explore on foot

### Research summary

| Site | Control | Physics | Notes |
|---|---|---|---|
| Bruno Simon, 2019 | Drive a car | cannon.js | `package.json` of `brunosimon/folio-2019` |
| Bruno Simon, 2025 | Drive a car. Clicks, scroll, keys, touch and a gamepad | Rapier (`@dimforge/rapier3d`) | Blender object names and empties set the physics bodies, the collision shapes and the zones. A phone drops the water blur, the depth of field and shadow resolution. three.js TSL runs on WebGPU when available. Little HTML UI and no fallback for visitors who do not want to drive |

Sources: [Awwwards case study](https://www.awwwards.com/brunos-portfolio-case-study.html), [folio-2025](https://github.com/brunosimon/folio-2025), [folio-2019](https://github.com/brunosimon/folio-2019).

What this spec takes from them:

- **Blender names drive the game data.** Collision shapes and zones come from named objects and empties, as in folio-2025.
- **A phone gets a lower preset.** Here the existing quality ladder in `quality.js` does that job.
- **The fallback stays.** This site keeps the story and the DOM sections as the default path. Exploring is an option, never a gate.

What this spec does not take:

- **No physics engine.** One review puts the Rapier WASM at about 1.1 MB ([learnwithhasan](https://learnwithhasan.com/js-libraries/rapier/)). The scene chunk sits at about 199 of its 200 kB. A walker needs collision and sliding, not rigid bodies.
- **No vehicle.** A sky-taxi option was weighed and dropped, because the island is 36 by 24 m and a flight there feels cramped.

### Options weighed

| | A. Diorama orbit | **B. Walk the island (chosen)** | C. Fly the sky-taxi |
|---|---|---|---|
| Control | Orbit, zoom, tap markers | Keys, joystick, gamepad | Arcade hover |
| Collision | none | Capsule against an Octree | Sphere against an Octree |
| Lazy JS, estimate | about 4 kB | about 12 kB | about 10 kB |
| New assets | none | walker and collision GLB | taxi model |
| Frame cost, estimate | +0 ms | about +0.3 ms CPU, +2 to 3 draws | about +0.2 ms, +2 draws |

The JS sizes are estimates. `Octree.js` and `Capsule.js` from three (r180) come to 4,753 B gzip before minify. A minified build fixes the real figure before E2 merges.

### Budget rules for explore

- **Every explore file loads lazily.** The explore code goes into its own chunk, `explore-*.js`, through `import()`, when the visitor presses an explore button. The scene chunk does not grow beyond a few lines of glue.
- **The collision mesh is its own file.** The main GLB holds 118,274 triangles of its 120k budget, so the collision proxy cannot live there.

| Item | Budget |
|---|---|
| `explore-*.js` | at most 20 kB gzip |
| `island_b_collide.glb` | at most 60 kB |
| `walker.glb` (the animal, later) | at most 80 kB, under 3k triangles |
| Draw calls added | at most 4 (walker parts and its contact shadow) |
| CPU per frame for the walker, camera and zones | at most 0.5 ms on a mid Android |
| Frame time while walking | 16.7 ms desktop, 22 ms mid Android, as the plan sets |

`scripts/size-budget.mjs` gains a line for `explore-*.js` and the two GLBs.

### The walker

- **Placeholder first.** A capsule body with two ear cones and a tail, in the toon material, walks until the real model exists. It uses the same size as the final animal.
- **The final animal** is a stylised cat-fox: low-poly, faceted, autumn colours that sit with the rust crowns. The owner designs it later. It is a brief, not a likeness of any real pet.
- **Rigid parts, no skinning.** The model is a body, a head, four legs and a tail as separate meshes in one GLB. Code swings the legs, bobs the body and sways the tail. This avoids a `SkinnedMesh` program and an animation mixer.
- **Size:** about 0.55 m long and 0.35 m to the shoulder. The capsule radius is 0.2 m. The stair and terrace routes passed body-clearance checks at 0.50 m wide (README, 24 October 2026), so a 0.4 m capsule fits.
- **Speed:** walk 2.2 m/s, run 4.5 m/s. A walk across the island takes about 15 s.
- **Shadow:** a soft contact disc from `contact-shadows.js`, never the moon shadow map. The shadow map has `autoUpdate` off, and a moving caster would force a shadow pass every frame.

### Collision and the walkable area

- **A low-poly proxy from Blender.** A new script, `scenes/urban-aerie-studies/export_collision.py`, writes `src/assets/models/island_b_collide.glb`. It holds:
  - the walkable floors: the lawn, the paths, the pad, the ramp, the deck, the bridge, the porch, the landings and both roof terraces.
  - every stair flight as a smooth ramp, so the capsule needs no step logic.
  - walls, railings, glass barriers, tree trunks and large props as boxes.
  - an invisible fence round the island rim, so the walker cannot fall off.
- **Target size:** under 4,000 triangles.
- **Octree and capsule.** The explore chunk builds an `Octree` from the proxy once, then moves a `Capsule` each frame with gravity and slide, as the three `games_fps` example does.
- **The interiors stay closed.** Each room is a portal zone at its door. The walker never walks into the workshop, the lounge or the bedroom.

### Zones and portals

Blender empties named `Zone_<name>` mark each zone. Their scale gives the zone size. They go into the collision GLB.

| Zone | Where | What happens |
|---|---|---|
| `Zone_Pad` | the pad | Prompt "back to the story". The walker leaves, and the story resumes at `arrival` |
| `Zone_Workshop` | the workshop door | Prompt "look inside". The `workshop` shot plays with the Projects card |
| `Zone_Bedroom` | the top-floor balcony door | Prompt "look inside". The `bedroom` shot plays with the About card |
| `Zone_Telescope` | beside the telescope | Prompt "look through". The eyepiece opens the skill sky with the Skills card |
| `Zone_Campfire` | at the fire | Prompt "sit by the fire". The `campfire` shot plays with the Contact card |
| `Zone_Lookout` | the city lookout bench | Prompt "sit". The camera turns to the painted city. No card |

- A zone never fires on its own. The walker stops, and a small prompt shows the key (E, Enter, A on a gamepad) or a tap target. A visitor who walks past is not pulled out of the walk.
- Every card that a zone opens has a "back to walking" action. It returns the camera to the walker where it stood.
- The telescope zone uses the same eyepiece as the story. The eyepiece code belongs to the telescope work, so this zone calls it and does not copy it.

### Controls

| Input | Move | Camera | Use a zone | Leave |
|---|---|---|---|---|
| Keyboard | WASD or arrow keys, Shift to run | Q and E turn by 45 degrees | E or Enter | Escape |
| Mouse | none | Wheel zooms, right-drag turns | Click the prompt | The leave button |
| Touch | A floating joystick where the thumb lands on the left 60 percent of the screen. A far push runs | Two-finger drag turns, pinch zooms | Tap the prompt | The leave button |
| Gamepad | Left stick, a far push runs | Right stick turns, triggers zoom | A | B |

- Movement follows the camera: up on the stick or W walks away from the camera.
- The Gamepad API needs no library. The joystick is about 1 kB of own code, not a package.

### Camera

- **Fixed three-quarter follow.** The default view looks from the south-west, about 35 degrees down, 7 m from the walker. This is close to the welcome view, so the island reads as the same place.
- **Zoom** runs from 4 to 12 m. **Turn** comes in 45 degree steps from keys, or freely from a drag or the right stick, eased back toward the nearest step.
- **The camera follows with a short lag**, about 0.15 s, so the walk reads smoothly.
- **The lens focuses on the walker.** The rig's `focusPoint` takes the walker position, so the tilt-shift look stays on the animal.
- **Cutaway.** When a crown, the stair canopy, the tower frame or the roof stands between the camera and the walker, those meshes open a soft round hole round the walker on screen. The toon shader discards those fragments when they are nearer than the walker. The meshes come from a tag list, and one uniform carries the walker's screen position and the hole radius.
  - The cutaway define compiles once, during the move from the story into the walk, with `renderer.compileAsync`. The scene never compiles a program mid-walk.
  - On the stair tower, the camera also swings to a fixed view of the tower face, so the climb stays readable.

### The loop and quality

- The walk draws every frame while the walker or the camera moves, like a camera move today. At rest it falls back to the ambient clock.
- The quality governor samples walk frames, as it samples camera moves.
- **Reduced motion:** the explore buttons still show. Frames draw only while an input moves the walker. The camera follows with no lag and no bob, and the leaves do not scatter.
- **No WebGL:** the explore buttons do not show.

### Leaf it Alone touches

- **Leaves scatter.** When the walker crosses a leaf pile or the leaf carpet, the loose leaf cards near it lift and settle (`leaf-cards.js`). One uniform carries the walker position, so the effect costs no extra draw.
- **Footfall sound and music are out of scope.** The site has no audio today.

### Entry and exit

- **Entry.** The Welcome button "just the island" becomes "explore on foot". The Contact card at the campfire gets "wander the island".
- **The move in.** The words fade as they do for `sceneOnly`. The explore chunk and the collision GLB load, and the camera moves from the current stop down to the walker in about 1.2 s. The walker appears at `Zone_Pad` from the Welcome button, and at the fire from the Contact card. The cutaway programs compile during this move.
- **Exit.** Escape, the leave button or `Zone_Pad` returns to the story. The camera moves back to the stop the visitor left from, and the words fade in.
- **No URL.** Exploring is a state of Home, as `sceneOnly` is now. A route change ends the walk.
- **ExplorePad stays** for the drag and pinch round the skill sky. It is not the walk mode.

### Explore acceptance checks

1. From Welcome, press "explore on foot". The walker appears on the pad and walks to the fire, the lookout and up both terraces with keys only.
2. On a phone, the joystick walks the same route. Pinch and two-finger drag change the camera.
3. A gamepad walks the same route.
4. Each zone opens its card only after the prompt. "Back to walking" returns to the same spot.
5. The walker cannot leave the island, enter a room or pass through a wall or railing.
6. Behind a crown or on the stair tower, the walker stays visible through the cutaway.
7. `npm run check` passes with the new budget lines. The scene chunk does not cross 200 kB.
8. The lab shows the frame time under 16.7 ms on desktop and 22 ms on a mid Android with the walker on the top terrace.

## Build order

Each step ships on its own, as the plan requires.

| Step | Work |
|---|---|
| S1 | New order in `waypoints.js` and the nav. New `arrival` and `campfire` stops. Focus values per stop. The gate lands at `arrival` |
| S2 | Route empties in Blender, `src/data/route.js`, and `rig.goTo` with a leg |
| E1 | `export_collision.py`, `island_b_collide.glb` with the zones, and the budget lines |
| E2 | The explore chunk: placeholder walker, Octree and capsule, controls, follow camera, zones, entry and exit |
| E3 | The cutaway and the leaf scatter |
| E4 | The cat-fox model with rigid-part animation |

## Open items

- The cat-fox design: shape, colours and face. The owner decides before E4.
- The `arrival` and `campfire` shots, and the focus values, are tuned in the lab during S1.
- The telescope eyepiece may change in the parallel telescope work. The skills chapter and `Zone_Telescope` follow whatever that work ships.

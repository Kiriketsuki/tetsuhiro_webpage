# Island story path and free exploration: spec (November 2026)

Status: approved 2 November 2026. Revised 3 November 2026: the story now ends at the campfire on the north rim, looking out over the city and the night sky. Nothing in this spec is built yet.

This spec covers two linked features of the urban aerie island:

1. **Story path.** Home tells one journey across the island, in the order a visitor would walk it.
2. **Explore on foot.** A visitor leaves the story and walks a small animal round the island, in the spirit of Bruno Simon's portfolio.

It extends `docs/site-rewrite-plan.md`. The budgets, the no-bloom rule, the smooth SPA and the DOM fallback for every room stay as that plan sets them.

## Decisions (2 November 2026, with the owner)

| Question | Decision |
|---|---|
| Story order | The island route: pad, workshop, bedroom, telescope, campfire |
| Ending (3 November) | The story ends at the campfire on the north rim. The camera looks out past the fire, over the rim, to the city far below and the night sky. It is the closing shot and the most composed frame on the site |
| Scroll feel | Snap, then travel. Scroll snaps to a section, then the camera follows the route to the next stop |
| Explore mode | Option B: walk the island with a kinematic capsule and a follow camera. No physics engine |
| Walker | A stylised animal, a mix of a cat and a fox. It need not be true to life. The model comes later, so a placeholder walks first |
| Walker design (3 November) | Kinako, a fox-leaning cat-fox kit with a soft face. Kit size, an automatic hop up low steps, asleep by the campfire in the story views. See "Walker design" |
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
| 05 | Down to the fire on the rim, over the city | `contact` | `campfire` (new) | right | `Anchor_Campfire` |

- `src/data/waypoints.js` takes this order. `sections`, the keys 1 to 5 and the snap points follow from it, as they do now.
- The nav (`src/components/Navbar.vue`) lists Welcome, Projects, About, Skills, Contact. The middle item, under the mark, becomes About, the bedroom, which is the highest room of the house.
- `arrival` is a new stop and the hero shot (revised 3 November 2026). It looks at the whole aerie from the south-east: the house and its tower, the lawn, the stream and its bridge, the pad and the waterfall off the rim, with the city below. A portrait phone takes its own `tallView` on the same line. The move to `workshop` follows the walk over the bridge (`src/data/walks.js`, `docs/smooth-camera.md`, fourth pass).
- `hero` and `pad` stay in `stops.js`, because the lab and the round notes use them. Delete them only when nothing reads them.
- `campfire` is a new stop and the closing shot. The fire (`Anchor_Campfire`) already sits about 2.4 m from the north rim, and the city lies north and far below (`Anchor_City`), so the fire stays where it is. The camera stands about 6 m above the lawn south of the fire and looks north-north-east, about 20 degrees down, past the fire and over the rim. The owner picked this framing ("above the fire") from three on 3 November 2026:
  - the fire, its logs and its glow in the foreground, sharp under the lens.
  - the rim of the aerie in the middle ground, where the grass ends.
  - the bokeh city far below, which fills the middle band of the frame, and the night sky with its stars above it.
  - a rust crown at the right edge, and the leaf carpet in the lower right.
  - the house and the glass stair tower stay out of the frame, so nothing pulls the eye back. The fire sits in the lower left, away from the Contact card.
- A portrait phone takes its own `tallView` of the same composition, with the fire, the rim and the city in the top of the screen above the card. Its fov widens to 50 degrees and the view aims a little west, so the fire stays on screen.
- The focus column fills the `focus` key that commit 816a791 added. Each value is a first guess, and the owner tunes it in the lab with the shots.

### The gate and the first move

The gate lift flies from `overview` to `arrival`, not to `hero`. The move reads as the sky-taxi coming down onto the pad. The duration stays 2.4 s.

### Moves between stops

**Every move flies one planned path (owner, 3 November 2026).** "I want the camera path to be smart and avoid obstacles and be natural", and "especially for going up the tower, it needs to be smooth instead of trying to follow the stairs". The walk splines and the drone follow are gone (`docs/smooth-camera.md`, "Third pass").

- A planner (`src/scene/aerie/path-plan.js`) flies each move through the free space round the aerie. It keeps about 4 m from the house, the trees and the props where it can, and comes as close as a shot is near its two ends.
- A move between neighbours and a jump of two or more stops plan the same way. The jump arcs and the crane are gone.
- The view blends from the start view to the end view, and in the middle of a move it leans toward the way the camera flies.
- A move takes 1.8 s to 4.4 s, from its distance and its view turn together. The view turns at most 60 degrees a second.
- The `workshop` to `bedroom` move keeps the rain on the glass and the fade (`fade` in `scene-manager.js`). It rises up the front of the house in one curve.
- The lens fades out during a move, as `rig.travel` already does. The focus point blends from one stop's focus to the next.
- A move into or out of the board view still passes through the workshop doorway.

**A new section in the middle of a move starts a new move from where the camera is.** It plans from the camera's position and keeps the camera's speed.

**A direct visit still cuts.** `setRoute(name, { cut: true })` opens the route's room without a move.

### Where the route data lives

- The route points come from Blender. One empty per point, named `Route_<from>_<to>_NN`, goes into the main GLB. An empty adds no triangles.
- `src/data/route.js` holds a fallback list of points for each leg, in the same form as the `fallback` shots in `stops.js`. The rig uses it until the GLB arrives, or if the GLB lacks the empties.
- `shotsFromStops` gains a sibling, `legsFromRoute(route, anchorAt)`, that builds one `THREE.CatmullRomCurve3` per leg.
- `rig.goTo(id, duration)` gains an optional leg: `rig.goTo(id, { leg })`. Without a leg it keeps the arc.

### Story text

- Each section heading carries its chapter number and a short line, for example "02, over the bridge". The DOM stays the accessible version of the story, as the plan requires.
- The Contact card at the campfire ends the story. The last line looks out with the visitor, over the city and the sky. The card carries the second explore button: "wander the aerie".
- The chapter lines: "01, arrival", "02, over the bridge", "03, up the tower", "04, out to the telescope", "05, by the fire". Visitor-facing text says "aerie", never "island".

### Story acceptance checks

1. Scroll from 01 to 05 and back. Each move flies one smooth curve, and no camera passes through geometry.
2. Click Contact from Welcome. The camera flies a planned path, in at most 4.4 s, clear of the house.
3. Open `/projects` directly. The scene opens at `workshop` with no move.
4. With reduced motion, each section change cuts.
5. The frame time stays under 16.7 ms (desktop) and 22 ms (mid Android) during a leg, measured in the lab.
6. At 05 the frame holds the fire in the foreground, the rim, the city far below and the night sky, at desktop size and at 412 by 915. The fire stays clear of the Contact card, and the house stays out of the frame.
7. On desktop, the lens keeps the fire sharp at 05. The city and the sky stay soft behind it.

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
| `aerie_collide.glb` | at most 60 kB and 6,000 triangles |
| `walker.glb` (Kinako: the walk mesh and the sleep mesh) | at most 80 kB with quantized attributes. The walk mesh has at most 8k triangles |
| Draw calls added | at most 4 (Kinako, its contact shadow, and the sleeping Kinako in the story views) |
| CPU per frame for the walker, camera and zones | at most 0.5 ms on a mid Android |
| Frame time while walking | 16.7 ms desktop, 22 ms mid Android, as the plan sets |

`scripts/size-budget.mjs` gains a line for `explore-*.js` and the two GLBs.

### The walker

- **Placeholder first.** A capsule body with two ear cones and a tail, in the toon material, walked in E2 and E3. E4 replaced it with Kinako from `walker.glb` (`scenes/urban-aerie-studies/export_walker.py`), behind the same body interface in `src/scene/explore/body.js`.
- **The final animal** is Kinako, a cat-fox kit. "Walker design" below sets its look, its rig and its behaviour.
- **Size:** 0.25 m to the shoulder, about 0.55 m from nose to rump and 0.85 m from nose to tail tip. The capsule radius is 0.15 m and its height is 0.30 m. The stair and terrace routes passed body-clearance checks at 0.50 m wide (README, 24 October 2026), so a 0.30 m capsule fits with room to spare.
- **Speed:** walk 2.2 m/s, run 4.5 m/s. A walk across the island takes about 15 s.
- **Shadow:** a soft contact disc from `contact-shadows.js`, never the moon shadow map. The shadow map has `autoUpdate` off, and a moving caster would force a shadow pass every frame.

### Walker design

The owner locked this design on 3 November 2026 after five rounds of Blender concepts. The concept script is `scenes/urban-aerie-studies/walker_concepts.py`, with `walker_kit_geometry.py` beside it. The concept script saved its last round as `walker_concepts_r4.blend`.

#### Look

- **Name:** Kinako, after roasted soybean flour, the colour of its coat. Visible text may use the name, for example on a zone prompt.
- **Shape:** the body leans fox: large pointed ears, a short fox snout, a slim body and a long brush tail. The face is soft and simple, in the mood of the mofusand illustrations, and copies no character. It has small wide-set bead eyes with one glint each, a tiny rose nose, a small three-arc mouth, a pink blush and chubby low cheeks. The cheeks end in small pointed ruffs.
- **Joins:** the body and the tail are one surface, so the rump narrows into the tail root with no crease. Each ear rises from a low mound inside the skull. The neck is as wide as the chest at its foot and as wide as the jaw at its top. Shoulder and haunch masses on the body take the legs.
- **Colour fields.** Each colour is one coherent field, set by a plane cut or a ring band. No face takes a colour of its own.

| Field | Colour | Where |
|---|---|---|
| Oat | `#D9C59C` | the coat |
| Cream | `#F1E8D4` | chest, belly, jaw, cheeks, lower muzzle, tail tip |
| Rust | `#A8461C` | saddle patch on the back, patch over the left eye, left ear, right ear tip, socks, tail band |
| Umber | `#5A2C1A` | tip of the rust left ear |
| Rose | `#C07A66` | nose, inner ears |
| Blush | `#E59C8A` | one oval on each cheek |
| Ink | `#17151B` | eyes, mouth |

- **Night look.** Kinako takes a warm rim from the nearest lamp or the fire. Its shadow side stays a warm grey, not the moon blue. It stays the warmest thing on the lawn, so the eye finds it from the follow camera. The rim is one uniform on the walker material, set from the nearest warm light each frame.
- **Toon bands.** Kinako takes the two-band toon of the concept sheets: one flat night tone where the moon reaches and one cool shade band, with a flat warm glow from the spill at its feet. The aerie light shaded each part as its own rounded tube.
- **Ink.** The walker takes the silhouette-only ink mask (the 0.5 value in `toon-material.js`). The depth ink in `grade-pass.js` then draws its outline but no line where one part enters another.

#### Rig and mesh

- **One skin, one draw.** `walker.glb` holds one continuous skin. `export_walker.py` joins the posed body, neck, head, muzzle, ears, legs and paws in one exact boolean union and softens a band along each joint seam, so no part pokes through another. Each face keeps its concept colour, so the colour fields keep their straight plane cuts. The neck takes the chest plane of the body, so the cream bib runs from the chest up the neck as one field. Neck and upper-leg faces next to the body take the body colour there. The face details (eyes, glints, nose, mouth, blush and inner ears) stay small parts on the skin.
- **Soft joints.** Each vertex stores its part and a blend toward that part. The rest of the weight goes to the parent part, over 2.5 cm each side of the joint pivot. The parts are the body, the neck, the head, two ears, two eyes, and an upper leg, a lower leg and a paw for each leg. The walker material blends the two part matrices of each vertex in the vertex shader, from a small uniform array. Kinako costs one draw call and its contact shadow one more, inside the four-draw budget.
- **The tail bends.** Each tail vertex stores its distance along the tail. The shader bends the tail over three joints, and each joint spreads its bend over 8 cm, so the tail curves and never kinks. This is a fixed bend in the walker shader, not a `SkinnedMesh`.
- **Eyes close** by a scale on the eye parts. The glints hide while the eyes are closed.
- **Triangles:** 8,000 at most, for a close view at 1.5 m (Camera). The export builds the kit at a finer resolution than the concept sheets: the walk skin has 6,440 triangles and the sleep skin 6,064.
- **Sleep mesh.** `walker.glb` also holds the sleep pose as a second, plain mesh for the story views. It needs no walker shader, so the scene chunk only places it. See "Outside explore".

#### Movement

- **Gaits.** The walk is a four-beat gait, and the run is a gallop with a short flight phase. The leg cycle follows the ground speed, so the paws do not slide. The body bobs a little at a walk and stretches at a run. At a run the ears lie back and the tail streams out.
- **Turning.** The body turns toward the move direction at up to 540 degrees per second. The head leads the turn by up to 25 degrees.
- **Steps and ledges.** There is no jump button. The capsule steps up any rise under 0.10 m. A rise of 0.10 to 0.50 m plays an automatic hop of about 0.35 s: crouch, spring, land. The collision proxy marks the hop ledges, such as the lookout bench, whose seat stands 0.40 m over the deck. A rise over 0.50 m is a wall. Stairs stay smooth ramps.

#### Idle habits

The habits run in this order while the visitor gives no input:

1. **At once:** ear flicks and a slow tail sway.
2. **After about 4 s:** Kinako sits and looks around, toward the city or the camera.
3. **Now and then while it sits:** Kinako lifts a front paw to its muzzle and grooms it.
4. **After about 30 s:** Kinako curls up in the sleep pose until the visitor moves.

Any input wakes Kinako, and the walk starts at once. The idle habits run on the ambient clock, so a resting walker does not force a full frame rate. Under reduced motion, Kinako holds a still sit pose and plays no idle habit.

#### Outside explore

- **Asleep by the fire.** In the story views, Kinako sleeps curled by the campfire. The scene chunk loads `walker.glb` after the island is on screen and shows the sleep mesh. It adds one draw call and no new shader.
- **Waking.** "Explore on foot" and "wander the aerie" both start the walk at the fire. The camera moves down to Kinako, Kinako wakes and stretches, and the walk starts. This replaces the start at `Zone_Pad` from the Welcome button.
- **Exit.** When the walk ends, Kinako trots back to the fire and curls up again while the camera returns to the story.
- **Greeter.** Kinako is the mascot of the gate (4 November 2026, the owner's pick: "lantern nap + walk us in"). Kinako naps on the lantern branch while the aerie loads and warms with the lamp. Once the load is done, Kinako wakes, hops down onto the way in and sits on it. On enter, Kinako trots on ahead. The gate shows pre-rendered frames from `lab/gate-kinako.html` (`scripts/gate-kinako.py`), so the shell loads no three.js and no model. It does not change this spec.

### Collision and the walkable area

- **A low-poly proxy from Blender.** A new script, `scenes/urban-aerie-studies/export_aerie_collision.py`, writes `src/assets/models/aerie_collide.glb`. It reads the shipped `aerie.glb` and `campfire_kit.glb`, so the proxy matches what the site draws, and it never opens or saves a `.blend`. It holds:
  - the walkable floors: the lawn, the paths, the pad, the ramp, the deck, the bridge, the porch, the landings and both roof terraces.
  - every stair flight as a smooth ramp, so the capsule needs no step logic. The script finds each flight from its treads.
  - walls from horizontal slices through the house, the glass, the paths, the rocks and the pad, each stood up as a short vertical strip.
  - tree trunks as six-sided posts, and props as boxes fitted to their footprints.
  - one closed block per room, so the walker stops at each door.
  - an invisible fence round the island rim and round the water, so the walker cannot fall off or wade in. The water fence follows the water itself, so it also stands under the bridge, and it stops just below each deck.
  - a guard strip along each side of each ramp, as the stair stringers are, so the walker cannot step off a flight inside the stair tower.
  - the hop ledges, such as the lookout bench, each an empty named `Hop_<n>`, so the walker hops onto them.
  - `Spawn_Campfire`, the spot by the fire where Kinako sleeps and wakes.
- **Target size:** under 6,000 triangles and 60 kB. The lawn needs about 2,500 floor triangles to sit within 2 cm of the drawn ground at the median. At 4,000 triangles in all, the median gap was 5 cm, which shows under the paws.
- **Reach check.** The export floods the proxy floors from `Spawn_Campfire` and fails unless every zone and the upper terrace can be reached. It also fails if the floor inside the workshop, the lounge or the bedroom can be reached. The owner's rule is that the walker never enters a room, so nobody sees the low-poly interiors close up.
- **Octree and capsule.** The explore chunk builds an `Octree` from the proxy once, then moves a `Capsule` each frame with gravity and slide, as the three `games_fps` example does. The explore chunk carries its own copy of three's `Octree.js` (`src/scene/explore/octree.js`) with every triangle two-sided. The proxy's wall strips and rim fence face whichever way their slice came out, and three's one-sided test let the capsule walk through a strip from behind.
- **The interiors stay closed.** Each room is a portal zone at its door. The walker never walks into the workshop, the lounge or the bedroom.
- **Update, 3 November 2026.** The owner opened the bedroom as the About room (`/about`, `src/views/AboutRoom.vue`, `src/scene/aerie/room.js`). The camera goes in through the balcony door and looks round, the way `/projects` goes into the workshop. The walker still stops at the door, and `Zone_Bedroom` can open `/about`.

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
| Mouse | none | Wheel zooms, a drag with either button orbits round Kinako | Click the prompt | The leave button |
| Touch | A fixed touch pad in the lower left. A far push runs | A one-finger drag anywhere else orbits, pinch zooms | Tap the prompt | The leave button |
| Gamepad | Left stick, a far push runs | Right stick turns, triggers zoom | A | B |

- Movement follows the camera: up on the stick or W walks away from the camera.
- The Gamepad API needs no library. The touch pad is about 1 kB of own code, not a package.

### Camera

- **Chase follow.** While Kinako moves, the camera eases round behind Kinako's travel, like a drone that follows it, with a time constant of 0.6 s. The steering stays camera-relative, so a held left curves Kinako round. The walk starts from the south-west, 3.5 m from Kinako.
- **Rest orbit.** Once Kinako stops, the camera holds still, and a drag orbits it round Kinako, sideways and up or down. Q and E turn it by 45 degrees. After a drag the chase waits 1.5 s, so the player can look round on the move.
- **Zoom** runs from 1.5 to 12 m. Under 5 m the pitch eases down, to 14 degrees at 1.5 m, so a close view looks at Kinako and not down on Kinako. A drag tilts on top of that pitch.
- **Focal point.** While Kinako walks, Kinako is the one focal point. The hover focus of the lens pulls no focus toward the cursor.
- **The camera follows with a short lag**, about 0.15 s, so the walk reads smoothly.
- **The lens focuses on the walker.** The rig's `focusPoint` takes the walker position, so the tilt-shift look stays on the animal.
- **Cutaway.** When a crown, the stair canopy, the tower frame or the roof stands between the camera and the walker, those meshes open a soft round hole round the walker on screen. The toon shader discards those fragments when they are nearer than the walker. The meshes come from a tag list, and one uniform carries the walker's screen position and the hole radius.
  - The cutaway define compiles once, during the move from the story into the walk, with `renderer.compileAsync`. The scene never compiles a program mid-walk.
  - On the stair tower, the camera also swings to a fixed view of the tower face, so the climb stays readable.
  - **Built (E3).** `src/scene/explore/cutaway.js` wraps the onBeforeCompile of the two toon materials, `aerie.toon` and `aerie.leaf`, from the explore chunk, behind a `WALK_CUT` define. The scene chunk does not change. The hole is a cone from the camera to Kinako, 0.95 m wide at Kinako. A fragment more than 0.45 m nearer than Kinako opens. The lawn, soil, paving and stone families and the litter cards never open.
  - **Camera clamp (E3).** A ray from Kinako toward the camera, against the collision proxy, keeps the camera in front of any wall or room block, so it never stands inside the house. A camera squeezed under 2.5 m for half a second swings to the nearest 45 degree step with 5 m clear. This swing also serves the stair tower.

### The loop and quality

- The walk draws every frame while the walker or the camera moves, like a camera move today. At rest it falls back to the ambient clock.
- The quality governor samples walk frames, as it samples camera moves.
- **Reduced motion:** the explore buttons still show. Frames draw only while an input moves the walker. The camera follows with no lag and no bob, and the leaves do not scatter.
- **No WebGL:** the explore buttons do not show.

### Leaf it Alone touches

- **Leaves scatter.** When the walker crosses a leaf pile or the leaf carpet, the loose leaf cards near it lift and settle (`leaf-cards.js`). One uniform carries the walker position, so the effect costs no extra draw. Built in E3 by the same wrap as the cutaway: litter cards within 0.9 m of the feet lift up to 0.14 m and slide 0.12 m aside while Kinako walks, and settle as Kinako walks on. The painted carpet stays still.
- **Footfall sound and music are out of scope.** The site has no audio today.

### Entry and exit

- **Entry.** The Welcome button "just the aerie" becomes "explore on foot". The Contact card at the campfire gets "wander the aerie".
- **The move in.** The words fade as they do for `sceneOnly`. The explore chunk and the collision GLB load, and the camera moves from the current stop down to the walker in about 1.2 s. From either entry, Kinako wakes by the fire, as "Outside explore" sets. The cutaway programs compile during this move.
- **Exit.** Escape, the leave button or `Zone_Pad` returns to the story. The camera moves back to the stop the visitor left from, and the words fade in.
- **No URL.** Exploring is a state of Home, as `sceneOnly` is now. A route change ends the walk.
- **ExplorePad stays** for the drag and pinch round the skill sky. It is not the walk mode.

### Explore acceptance checks

1. From Welcome, press "explore on foot". Kinako wakes by the fire and walks to the pad, the lookout and up both terraces with keys only.
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
| E1 | `export_aerie_collision.py`, `aerie_collide.glb` with the zones, and the budget lines |
| E2 | The explore chunk: placeholder walker, Octree and capsule, controls, follow camera, zones, entry and exit |
| E3 | The cutaway and the leaf scatter |
| E4 | Kinako: `walker.glb` from the concept script, the walker shader (part rotations and the tail bend), the gaits, the hop, the idle habits and the sleeping Kinako by the fire |

## Open items

- The greeter mascot: built in the gate (see Greeter above). Re-render its frames after any change to `walker.glb`.
- The sleeping Kinako by the fire in the story views. The walk shows Kinako asleep at the spawn until the first move, but the story views draw no Kinako. That needs glue in the scene chunk, which has 1.1 kB of its budget left.
- The hop also fires when Kinako walks into a hop top from outside, not only when it pushes against a ledge. The lookout bench seat is a slab with open space under it, so a walker from the deck passed under it and never pushed against it.
- The `arrival` and `campfire` shots, and the focus values, are tuned in the lab during S1.
- The telescope eyepiece may change in the parallel telescope work. The skills chapter and `Zone_Telescope` follow whatever that work ships.

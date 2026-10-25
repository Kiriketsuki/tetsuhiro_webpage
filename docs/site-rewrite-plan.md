# Site rewrite plan: urban aerie island (Oct 2026)

This plan merges two research runs from 25 October 2026. One studied how to load the rooms and move between them. The other audited the current site and set an architecture for the rewrite. A fact-check pass reviewed both runs (124 claims confirmed, 11 corrected). Spot checks against the code also passed.

## Verdict

Refactor the Vue shell and rewrite the scene layer. Vue 3, the router, the data files, Tailwind 4 and the camera rig maths stay. The scene layer gets a new `SceneManager` behind a dynamic import. Stay on `WebGLRenderer` with three 0.180. WebGPU costs about 240 kB more JS, and every custom shader hook in the repo is WebGL only.

Do not make three room GLBs. Split by what each piece is:

| Piece | Form | Why |
|---|---|---|
| Island, house, workshop room, corkboard frame, telescope body, pad | Main island GLB | The workshop is the first room on the route, so it must be ready first. |
| Project cards on the corkboard | Generated from `src/data/projects.js` | A new project needs no Blender edit. Text stays in the DOM for SEO and screen readers. |
| Constellation skill sky | Generated from `src/data/skills.js` in its own `THREE.Scene` | Points, lines and badges cost about 3 draw calls. A GLB would freeze the layout. |
| Bedroom detail | Hidden group in the main GLB, or one lazy GLB only if it breaks the budget | The island export is only 0.90 MB (desktop) and 0.49 MB (mobile), so a split probably saves little. |
| Write-ups, galleries, links | DOM routes | They load as lazy route chunks already. |

## Baseline today (measured)

- Entry JS is one chunk: 926,791 B raw, 289 kB gzip. three.js is 154 kB gzip of it, gsap 49 kB.
- `index.html` loads `src/three.js` as a second module script, so every route pays for the scene and the 2.38 MB `island.glb`.
- The render loop never stops (`src/three.js:85-96`). It keeps the full bloom and MSAA chain running on hidden routes.
- `firebase.json` has no headers block, so all assets cache for about 1 hour. A `**` rewrite returns HTTP 200 HTML for any missing file.
- A device without WebGL keeps the enter button disabled forever.
- The dodecahedron uses about 50 MB of GPU memory for 12 canvas textures.
- Home first visit: about 3.5 MB before fonts.

## How a room transition stays smooth

1. Hide the swap behind a moment the story already has: the rainy-window dolly into the bedroom, or the telescope eyepiece closing to a small circle.
2. Prepare the GPU before the reveal. Add the room hidden while the camera rests at the previous stop. Await `renderer.compileAsync(group, camera, scene)` and call `renderer.initTexture` one texture per frame.
3. Never wait on the network. A cheap version of each room is always present. A late file swaps in under a 200 ms dip to dark.
4. Create every room light at startup with intensity 0. A light that appears later recompiles every lit material.
5. Set `renderer.shadowMap.needsUpdate = true` on each reveal, because `autoUpdate` is false (`src/scene/renderer.js:58-59`).
6. Late files use their own `LoadingManager` and share the one `DRACOLoader`. A late file on the gate manager would fire the gate's `onLoad` and `onError` again.
7. Fetch late files with `fetch(url, { priority: 'low' })` on `requestIdleCallback` (with a `setTimeout` fallback for Safari). Skip early fetches when `navigator.connection.saveData` is set.

Telescope, frame by frame: the camera tweens to the eyepiece and narrows the FOV. A DOM radial mask closes. At full mask, the `RenderPass` swaps to the sky scene and camera. The mask opens, and the stars light up in order along the parent links. The way back is the same in reverse.

## Phases

Every push to master deploys. Each phase must ship on its own.

**Phase 0: guard rails.** Record the baseline. Add `scripts/size-budget.mjs` and `npm run check`. Confirm GitHub Actions minutes and the PR preview channel.

**Phase 1: delivery fixes, no visual change.**
- `firebase.json` headers: `/assets/**` immutable for a year, `index.html` no-cache, Draco under a versioned path.
- Real route rewrites with a styled 404.
- Meta description and og tags.
- Self-hosted woff2 fonts.
- Remove `draco_decoder.js`, the unused `vanilla-tilt` and the empty `postcss.config.cjs` from the build.

**Phase 2: boot order and loop control, old island still live.**
- Mount Vue first, then `import()` the scene from the Home route on idle.
- `manualChunks` for three, gsap and vue. The shell drops to about 97 kB gzip.
- `renderer.setAnimationLoop` with pause and resume on route change and `visibilitychange`.
- A WebGL failure falls back to a CSS night gradient and still opens the gate.
- Reduced motion renders once and stops.

**Phase 3: SceneManager seam.**
- `SceneManager` with `init`, `goTo`, `setQuality`, `pause`, `resume` and `dispose`. It has no Vue import.
- One `useScene()` composable.
- `src/data/stops.js` keyed by stop id and Blender anchor.
- Match `Cam_` shots by name, not index.
- Render on demand with a dirty flag.
- A quality tier object.

Status, 25 October 2026: done. `src/scene/scene-manager.js` holds the API, `src/three.js` is the Vue bridge, `src/data/stops.js` keys the stops by Blender camera name, and `src/data/waypoints.js` maps each Home section to a stop. The loop renders on demand with a 30 fps ambient clock on Home and none on text pages.

**Phase 4: new island swap.**
- Load `island_b.glb` or the lite file by tier, with one shared flat toon material and a fixed light set.
- Remove the dodecahedron, campfire, triplanar terrain, tree growth and skill badges from the import graph. The files stay in the tree as era record.
- Point the stops at the pad, workshop, telescope and bedroom anchors.

Status, 25 October 2026: done. The site loads `island_b.glb` (or the lite file on a phone) with the watercolour look from `src/scene/aerie/`. The era scene code, `island.glb`, the dodecahedron faces, the terrain textures and other unused images are deleted. The campfire is a new prop on the lawn.

**Phase 5: rooms carry the story.**
- Sky-taxi arrival.
- Corkboard cards from `projects.js`.
- Constellation sky from `skills.js`.
- Bedroom stop with the rainy-window reveal.
- A DOM equivalent for every room.

**Phase 6: watercolour look and quality ladder.**
- One composite pass replaces `OutputPass`: tone mapping, Sobel edge darkening, paper grain, pigment pooling and a screen-UV wobble.
- Bloom on the desktop tier only.
- The ladder drops Kuwahara, then bloom resolution, then bloom, then MSAA, then DPR.

**Phase 7: content layer and prerender.** Real headings in every section, a poster image, prerendered routes, and per-route meta tags.

## Budgets

| Item | Budget |
|---|---|
| Shell JS | at most 100 kB gzip |
| Scene JS, lazy | at most 200 kB gzip |
| Island GLB, desktop | under 120k tris, under 100 draw calls, at most 1.5 MB |
| Island GLB, mobile | under 70k tris, at most 900 kB |
| Home first visit before the gate opens | 1.8 MB desktop, 1.2 MB mobile |
| GPU texture memory | at most 32 MB |
| Frame time | 16.7 ms mid desktop, 22 ms mid Android |
| Idle | 0 frames when hidden or off Home |

## Decisions (25 October 2026)

- The site is a smooth SPA. A direct visit to any route opens the 3D scene at that room. The canvas stays mounted across routes, and a route change becomes a camera move. The loop pauses only on a hidden tab, on context loss and for reduced motion. This replaces the earlier idea that `/projects` loads no GLB.
- 2022 and 2025 era code is deleted once the Oct 2026 work starts (Phase 4), so the site serves less. The era tags keep the history.
- Unused files are deleted outright: `lake_mountain.glb`, `wave.glb`, `wave.blend`, `dodecahedron.glb`, the legacy face PNGs, `vanilla-tilt` and the unused `public/` files.
- The campfire stays, as a prop on the new island. The dodecahedron retires, because the bedroom replaces it.
- Oct 2026 commits use the real date and go to master. The tag is `era/2026-10`.
- `MOONSETHDRI.hdr` (368 MB, gitignored) is deleted with the other unused files.
- No bloom on any tier. Windows, lanterns and pad lights glow through emissive colour and soft glow sprites. This drops the bloom steps from the Phase 6 quality ladder.
- The city below is faked with layered, pre-blurred images that simulate depth, not geometry.

Full research output: the two workflow results from this session (`wyand22cf`, `wc3kkiqc7`).

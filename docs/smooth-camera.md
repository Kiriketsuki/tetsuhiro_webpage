# Smooth camera moves (3 November 2026)

The owner found the camera moves "too janky" on the live site. This note records where the
jank came from, what changed, and the measurements before and after. The code is in
`src/scene/aerie/camera-move.js` and `src/scene/aerie/camera-rig.js`.

## Where the jank came from

A probe stepped the real rig at a fixed 1/60 s and measured each move. Frame drops were not
the cause: headless Chromium drew every move at 5.6 ms (p95) at 1440x900 and at 412x915,
and the quality governor never changed tier.

| Cause | Evidence on master |
|---|---|
| A leg blended in from the start shot, followed the walk, and blended out into the end shot. Each blend added its own speed. | 3 or 4 speed surges per leg. Peak speed 2.3 to 4.7 times the mean. |
| The follow frame looked along the walk, so the view swung back and forth. | Turn rate up to 480 degrees a second, and turn changes up to 7,600 degrees a second squared. |
| A new section during a move restarted the move from rest. | The camera stopped dead from about 19 m/s, then started again. |
| A scroll back up restarted the move in the other direction. | A whip turn of 433 degrees a second. |
| The quadratic ease has a step in acceleration at its middle. | One kink in every move. |
| The pointer drift was off during a move and came back at its end. | A small snap at the end of a move on a desktop. |
| The governor could rebuild the pipeline in the middle of a move. | A possible stall of a frame or more on a slow phone. |

## What changed

1. **One path per move.** The start shot, the follow frame at the middle of the walk and the
   end shot are control points of one camera spline and one look spline. Both run on one
   spline parameter, so the view turns in step with the camera.
2. **One speed curve.** The camera speeds up over the first 35 percent of the move, cruises,
   and slows over the last 40 percent. The ramps are smootherstep, so the speed has no step
   and the acceleration has no step.
3. **An even pace.** The speed curve runs along camera distance and view turn together: each
   radian of turn counts as 6 m, and the two add in quadrature. The camera slows where the
   view turns, so the view never whips round.
4. **Durations from the pace.** A move takes 1.2 s plus one second for each 12 m of pace,
   between 1.8 s and 3.6 s.
5. **Take-over.** A move that starts during another one keeps the speed the camera has along
   the new path. The rest of the old motion fades out over 0.6 s. A move that heads back
   the way the camera came coasts to a stop over 0.6 s, then starts from there. A move that
   starts in mid-air skips a follow frame that would be a detour.
6. **Arcs clear the house.** A jump of two or more stops still rises in an arc. A box test on
   the house meshes raises the arc until it clears. When a lift does not clear, the arc backs
   away behind the start shot and comes in from behind the end shot. The test takes about
   1 ms. A ray test on the house triangles took up to 200 ms, which was a visible hitch.
7. **Small fixes.** The pointer drift applies during a move. The lens fade keeps its level
   when a move takes over. The governor waits for the end of a move to change tier.
8. **Its own chunk.** The move code (`camera-move.js` and `walk-curve.js`, 1.96 kB gzip)
   loads beside the aerie, like the skill sky. The new city had left the scene chunk 0.6 kB
   under its 200 kB budget. Until the chunk arrives, a move cuts, and the loading gate
   still covers the scene then.

## Through the workshop doorway (owner, 3 November 2026)

"Especially for the projects, the camera should enter and leave through the door way."

- The workshop doorway is 1.2 m wide (x -5.5 to -4.3) in the front wall at z -0.5, with
  its sill at y 1.0 and its head frame at y 3.15 (a raycast scan of the front wall).
- `doorway` in `src/data/route.js` puts three points on its centre line at eye height,
  y 2.4: one 4.7 m out in front, one on the porch, and one just in the room.
- Every move into the board view, the Projects wall, flies to the outside point, then in
  through the door to the board. An arc from a far stop comes down in front of the house.
- Every move out of the board view backs out through the same door, still facing the room,
  then turns in the open on its way to the next stop. A move that starts anywhere in the
  workshop room leaves the same way.
- `enterWall` keeps its dissolve onto the wall. The in-move is now one move from wherever the
  camera is, and the swap waits for it to come to rest on the board.
- A move asked for on the way out replaces the out leg that has not started. The page that
  comes back can pick another section, and the camera now follows the page.

| Check | Result |
|---|---|
| All 10 moves into and out of the board view, at 1440x900 and 412x915 | Each crosses the front wall at x -4.91, y 2.4, about 0.6 m from each post |
| Mesh crossings on those moves | 0 |
| Nearest mesh inside the house | 0.55 m or more |
| Peak turn rate | 13 to 123 degrees a second |
| The real flow: the Projects card link, then the back button | In and out through the door at both sizes, no console errors |

## Measurements

Per-frame camera speed and turn rate at 1/60 s, on master and on this branch. The
acceleration and the turn change are vector values, so a turn that reverses does not count
as a jump.

| Case | Peak speed (m/s) | Peak acceleration (m/s2) | Peak turn (deg/s) | Peak turn change (deg/s2) |
|---|---|---|---|---|
| workshop to bedroom (leg) | 56.2 to 9.8 | 1,123 to 112 | 477 to 88 | 7,581 to 1,408 |
| arrival to workshop (leg) | 61.1 to 20.6 | 606 to 41 | 267 to 135 | 1,815 to 326 |
| scroll on at 1.3 s: arrival to workshop, then bedroom | 61.1 to 20.8 | 1,123 to 115 | 739 to 128 | 7,581 to 743 |
| scroll back at 1.1 s: workshop to bedroom, then workshop | 52.0 to 8.9 | 1,171 to 38 | 433 to 54 | 10,172 to 148 |

Every story leg, in both directions, now has one speed peak. A raycast check on all 20 pairs
of story stops and the eyepiece move finds no camera path through a mesh.

The largest value left is the turn change on the leg round the stair tower, where the view
turns one way and then the other at the follow frame. The turn rate there stays under 90
degrees a second.

## Limits of the measurements

- The frame times come from headless Chromium on a desktop GPU at phone size. They do not
  show a real phone. The governor change matters most there.
- The probe stepped the rig at a fixed 1/60 s. A real frame of 33 ms moves the camera twice
  as far in one step, on the same smooth path.

## Second pass: frame clock and planned shots (3 November 2026, evening)

After PR #28 the owner still saw jank: "camera is still janky instead of smooth and planned".
The first pass stepped the rig at a fixed 1/60 s, so it could not see what the real frame loop
did. This pass measured the real page.

### How it was measured

- A harness drove the dev build with real input: a wheel notch, a touch swipe, keys 1 to 5,
  a scroll back up during a move, a smooth scroll from the campfire to the top, and the
  Projects link and the back button. It recorded every rendered frame: the rAF time, the
  step the rig got, the camera pose and the scroll position.
- Two sizes: desktop 1440x900, and phone 390x844 with 4x CPU throttle. Headless Chromium on
  an RTX 4070, at about 180 frames a second.
- A survey stepped all 30 moves between the six stops (the five story stops and the board)
  at a fixed 1/120 s. It measured acceleration, turn rate, path corners and mesh crossings.
  The same survey ran on master (9622367) for the before numbers.
- The orchestrator's diagnosis report found the same causes on its own probes, plus the
  crane, door and take-over faults below.

### Where the jank came from

| Cause | Evidence on master |
|---|---|
| The rig stepped by `clock.getDelta()`, read late in the frame. GSAP and other rAF callbacks run first for a different time each frame. | The step was up to 8.7 ms off the frame time on the phone. The planned path had 1 speed peak, the screen showed up to 27. Speed changed up to 79 percent from one frame to the next. |
| The follow frame looked along the walk, so most of the turn waited for the last stretch. | The view turned at 140 degrees a second at the end of the leg from the pad to the workshop. |
| The crane backed away behind the start and end shots, and the path reversed there. | Corners of 117 to 145 degrees, 2,226 m/s2. |
| The uniform spline overshot where a short segment met a long one. | Out of the door, the path bulged 1.5 m off the door axis. |
| The workshop shot stands 1 m inside the outside door point. | The move to the board backed out 1 m and came back in: a 149 degree corner. |
| The inside door frame looked at the board's subject, past the board view. | The view turned past the end view and back, and the camera surged where the turn stopped. |
| A scroll back early in a leg kept the follow frame ahead of the camera. | The path ran on and came back through a cusp: the speed fell to 1 m/s and jumped back to 9 m/s. |
| A take-over started the look path 10 m out, wherever the old look point was. | The turn rate halved in one frame. |

### What changed

1. **Frame clock.** The rig steps by the time between two rAF timestamps
   (`scene-manager.js`). `THREE.Clock` is gone, and the scene chunk is 0.17 kB smaller.
2. **Turn limit.** Each move picks the lightest turn weight that keeps its view turn under 60
   degrees a second. The camera slows where the view turns, as an operator slows the dolly
   for a pan. The move time stretches with it, up to 4.4 s, so the camera keeps its speed in
   the open.
3. **Lead the pan.** A follow frame looks half way from the walk ahead to the end subject,
   when that turns the view less in all.
4. **Centripetal spline.** `walk-curve.js` uses a centripetal Catmull-Rom spline. The look
   path takes the knot gaps of the camera path, so the two keep one parameter.
5. **Flat-topped arcs and a vertical crane.** An arc has two points at full lift, not one
   peak. A crane rises straight up from the start and comes straight down onto the end.
6. **Through the door.** A move skips the door frames behind its start or past its end. The
   inside frame looks half way from the door axis to the board view. The camera runs three
   times slower near the porch and eases back to full speed 9 m out, so it brakes over
   several metres and dollies through the door.
7. **Reversal.** A take-over drops a follow frame where its path folds back. A new path more
   than 60 degrees off the camera's motion brakes along smootherstep to rest, then starts.
   The brake stops in the same distance as before.
8. **Take-over look.** A move that takes over starts its look path at the look point in use.

A fast scroll still sends one move for each section it crosses. Each take-over now keeps its
speed, so the smooth scroll from the campfire to the top shows 1 speed peak and no stall.
The proposal to merge them in `three.js` stays open.

### Measurements with real input

Speed peaks on screen, before and after. The planned path has 1 peak for one move and 2 for a
move and its reversal.

| Case | Desktop | Phone, 4x CPU |
|---|---|---|
| Wheel or swipe, pad to workshop | 3 to 1 | 8 to 1 |
| Wheel or swipe, workshop to bedroom | 1 to 1 | 19 to 1 |
| Three quick swipes down | 1 to 1 | 27 to 1 |
| Scroll down, then back up | 3 to 2 | 17 to 2 |
| Key 5 from the pad | 3 to 1 | 23 to 1 |
| Key 3 from the workshop | 2 to 1 | 8 to 1 |
| Projects link, then back | 4 to 3 | 34 to 3 |

| Worst case over all runs | Desktop | Phone, 4x CPU |
|---|---|---|
| Rig step off the frame time, during moves | 2.3 ms to 0 | 8.7 ms to 0 |
| Speed change from one frame to the next, share of peak | 25 to 4 percent | 79 to 4 percent |
| Peak turn | 140 to 59 degrees/s | 226 to 58 degrees/s |
| Stall frames | 0 to 0 | 0 to 0 |

### Measurements of all 30 moves

| Worst case | Desktop | Phone |
|---|---|---|
| Peak acceleration | 2,226 to 336 m/s2 | 1,830 to 295 m/s2 |
| Moves over 150 m/s2 | 12 to 4 | 16 to 12 |
| Peak turn | 140 to 59 degrees/s | 102 to 60 degrees/s |
| Moves over 80 degrees/s | 7 to 0 | 7 to 0 |
| Turn-rate change in one 1/120 s step | 26.6 to 4.4 degrees/s | 21.3 to 4.0 degrees/s |
| Sharpest corner within 2 m | 149 to 101 degrees | 149 to 105 degrees |
| Mesh crossings | 0 to 0 | 0 to 0 |
| Longest move | 3.6 to 4.4 s | 3.6 to 4.4 s |

Selected moves on the phone, acceleration before and after: the pad to the telescope 1,830
to 164 m/s2, the workshop to the board 588 to 9 m/s2, the workshop to the campfire 755 to
172 m/s2.

### Left open

- Seven phone moves and four desktop moves stay over 150 m/s2. All are arcs between the
  workshop or the board and the back of the aerie (the telescope and the campfire). The
  worst is the campfire to the board, 295 to 336 m/s2. Each is lower than on master.
- The long moves take up to 4.4 s, against 3.6 s before. The workshop to the board on a phone
  takes 3.1 s against 2.1 s: the camera now dollies through the door.
- The camera starts when the scroll snap passes half way to the next section, 0.3 s to 0.8
  s after the input. This follows the spec ("Snap, then travel").
- The back button from `/projects` flies to the pad, not to the Projects section
  (`Home.vue`). The corkboard work owns that fix.
- On the phone, the frame that mounts the Projects page takes up to 128 ms. The camera is at
  rest then, so it does not show as a jump.
- The numbers come from headless Chromium on a desktop GPU. The throttle slows the CPU, not
  the GPU, so no real phone GPU was measured.

## Third pass: planned paths (3 November 2026, night)

The owner: "i want the camera path to be smart and avoid obstacles and be natural as well",
then "especially for going up the tower, it needs to be smooth instead of trying to follow the
stairs". The story legs rode a drone follow along the walk splines, so the move to the bedroom
traced the stair flights. Jumps rose in arcs over a box round the house.

### What changed

1. **Clearance field** (`clearance.js`). After the aerie loads, the meshes of the aerie (the
   aerie, the house, the trees and their leaf crowns, the props and the campfire kit) mark a
   1 m grid, and an exact distance transform gives the distance to the nearest surface. The
   build runs in slices of at most 4 ms behind the gate: 78 ms in all on a desktop, 290 ms on
   a phone at 4x CPU throttle.
2. **Planner** (`path-plan.js`). A move keeps the straight line when it stays as clear as its
   two ends. Otherwise A* runs on a 2 m grid with a cost for low clearance, line-of-sight
   cuts drop the corners, and an elastic band relaxes the path smooth while it pushes out to
   4 m of clearance. Near its ends a path may come as close as the shot is.
3. **Plans ahead.** The flights between every two stops, and to and from the workshop door,
   plan after the field builds. A move from rest reads its plan. A take-over plans at once:
   at most 4.6 ms on a desktop and 26 ms on the throttled phone.
4. **View.** The view blends from the start view to the end view along the distance flown.
   In the middle of a move it leans toward the way the camera flies, up to 60 percent, and
   only where the camera flies forward.
5. **Removed.** The walk legs, the follow frames, the lifted arcs, the crane and the house
   box test. `route.js` keeps the doorway. The doorway entry, the turn limit and the pace
   stay.

### Measurements

All 30 moves between the six stops, stepped at 1/120 s, at 1440x900. The mesh check covers all
78 meshes of the aerie.

| Worst case | Second pass | Planned paths |
|---|---|---|
| Mesh crossings | 0 (house and props only) | 0 (all 78 meshes) |
| Peak acceleration | 336 m/s2 | 136 m/s2 |
| Peak turn | 59 degrees/s | 58 degrees/s |
| Moves with more than one speed peak | 4 | 3 |
| Workshop to bedroom: corner within 2 m | 89 degrees | 27 degrees |
| Longest move | 4.4 s | 4.4 s |

The three moves with a second speed peak are the pad to the board and the bedroom to the
board, where the camera slows for the door, and the pad to the telescope.

Real input, with the frame clock from the second pass, at desktop and phone with 4x CPU
throttle: every run shows on screen the speed peaks the path has, no stall frame, at most 3
percent speed change from one frame to the next, and a peak turn of 60 degrees/s. The move up
the tower turns at 24 degrees/s, against 53 before.

### Left open

- The pad to the board peaks at 136 m/s2 where the flight meets the door axis.
- A take-over on a slow phone plans for up to 26 ms in its first frame.
- The back button from `/projects` still flies to the pad (corkboard work).

## Fourth pass: the hero shot and the bridge walk (3 November 2026, late)

The owner: "welcome to projects doesnt have a nice following from the heli pad over the bridge
feel anymore. and we no longer have a hero shot where we see the building and island and river
and water fall. and my CTA is a bit weird when the screen is so wide".

### What changed

1. **Hero shot.** `arrival` looks at the whole aerie from about 44 m to the south-east, 15
   degrees down, with a 50 degree lens. The house and its tower, the lawn, the stream and its
   bridge, the pad and the waterfall off the south rim show, with the rock below and the city
   behind. The old shot east of the pad cropped the tower, the pad and the trees on a wide
   screen. A portrait phone stands further back on the same line. The lens focuses on the
   bridge.
2. **Hero words.** The chapter readout and "just the aerie" sit under "Lim", flush with its right
   edge, and the role line sits under "Jovian". The column cap grows with the screen height
   (`max(92rem, 170svh)`), as the aerie does, so "Lim" stays clear of the rock at 2560x1080.
3. **Story walk.** `src/data/walks.js` holds guide frames for `arrival>workshop`: a camera point,
   a look point and a slow-down. The planner flies frame to frame and keeps 2 m from every
   surface (`GUIDE_CLEAR`). The camera comes down behind the pad, then tracks west about 3 m
   above the walkway on its south side, past the bridge, to the workshop door. It runs at a third
   of its cruise on the walkway. A move the other way plays the frames backward. A move that
   takes over does not follow a walk.
4. **Walk into the board.** A move between `arrival` and `board` takes the same walk, then the
   doorway frames. From the new hero it met the door axis at 28 m/s and peaked at 206 m/s2.
5. **Walk time.** A walk move takes its time from its pace with the slow-down, up to 6 s.

### Measurements

The 30 moves between the six stops, stepped at 1/120 s. Mesh crossings use the same mesh set as
the second pass.

| Move | Desktop 1440x900 | Phone 390x844 |
|---|---|---|
| arrival>workshop | 6.0 s, 75 m/s2, 45 deg/s, 1 peak, 0 crossings | 6.0 s, 76 m/s2, 47 deg/s, 1 peak, 0 crossings |
| workshop>arrival | 6.0 s, 72 m/s2, 47 deg/s, 1 peak, 0 crossings | 6.0 s, 77 m/s2, 49 deg/s, 1 peak, 0 crossings |
| arrival>board | 6.0 s, 93 m/s2, 58 deg/s, 2 peaks, 0 crossings | 6.0 s, 107 m/s2, 51 deg/s, 2 peaks, 0 crossings |
| board>arrival | 6.0 s, 91 m/s2, 58 deg/s, 2 peaks, 0 crossings | 6.0 s, 104 m/s2, 52 deg/s, 2 peaks, 0 crossings |

| Worst case, all 30 moves | Desktop | Phone |
|---|---|---|
| Mesh crossings | 0 | 0 |
| Peak turn | 59 deg/s | 58 deg/s |
| Peak acceleration | 113 m/s2 (telescope>board) | 298 m/s2 (telescope>arrival) |

- The walk speed along the walkway is 13 to 14 m/s at 1440x900. The walk from the pad to the
  porch takes about 2 s of the 6 s move.
- The least clearance on the walk is 1.6 m, at the workshop shot itself.
- Real wheel input at 1440x900, pad to workshop: 1 speed peak on screen, a peak turn of 45
  deg/s, no rig step off the frame time, no stall, no console error.

### Left open

- On a phone, flights into and out of the telescope view end with a hook round the house corner
  at x -12.3. On master the same hook gives 140 to 212 m/s2 on five phone moves. The new hero is
  further out, so `arrival>telescope` rises from 129 to 223 m/s2 and `telescope>arrival` from
  192 to 298 m/s2. A planner fix for that hook is a separate change.
- A walk move takes 6 s, against 4.4 s for the longest other move.
- The gate lift from `overview` to `arrival` is now a short dolly in, since both shots look at
  the whole aerie from the south-east.

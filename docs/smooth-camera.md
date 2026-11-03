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
   loads beside the island, like the skill sky. The new city had left the scene chunk 0.6 kB
   under its 200 kB budget. Until the chunk arrives, a move cuts, and the loading gate
   still covers the scene then.

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

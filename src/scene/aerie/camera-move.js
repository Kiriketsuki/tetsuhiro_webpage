import * as THREE from 'three'
import { createWalkCurve, tableIndex } from './walk-curve.js'

// One camera move between two stops as two smooth paths: one for the camera and one for the
// point it looks at. The rig (camera-rig.js) runs along both paths with one speed curve.
//
// The old moves eased a straight line or a drone follow, then blended in from the start shot
// and out into the end shot. Each blend added its own speed, so a leg had three or four
// speed surges and turned at up to 480 degrees a second. Here the shots and the follow
// frames are control points of one spline, so the path has no seams.

// Long moves rise over the aerie instead of cutting through it. An arc that still meets the
// aerie rises by LIFT_STEP metres at a time until it clears, up to MAX_LIFT. The test runs on
// ARC_CHECKS straight pieces of the arc.
const LIFT_PER_METRE = 0.18
const MAX_LIFT = 40
const LIFT_STEP = 2
const ARC_CHECKS = 12
// An arc that a lift of LIFT_TRIES more metres does not clear becomes a crane move: it backs
// away CRANE metres behind the start shot, rises, and comes in from CRANE metres behind the end
// shot. A stop low beside the house, such as the telescope, needs the camera to come in from
// behind it, as a lift in the middle cannot clear the last stretch.
const LIFT_TRIES = 10
const CRANE = 5
// The look points sit this far ahead of their camera points, in metres. A look point far
// away from its camera point would swing the view faster than the camera moves.
const LOOK_DISTANCE = 10
// A story leg: the camera rides `up` metres above and `back` metres behind the walk spline
// and looks LOOK_AHEAD metres ahead on it. LEG_SAMPLES are the shares of the walk that give
// the follow frames between the two shots.
const LOOK_AHEAD = 3
const LEG_SAMPLES = [0.5]
// A move that starts in mid-air, when it takes over from another one, skips a follow frame
// that is a detour of more than DETOUR times the straight distance. A scroll back up passes
// the follow frame of the leg it reverses, and the path doubled back on itself through it.
const DETOUR = 1.4
// A move runs at an even pace along a mix of camera distance and view turn: each radian the
// view turns counts as TURN_METRES metres, and the two add in quadrature, so the pace bends
// smoothly where the view starts or stops turning. Without the turn, the view whipped round
// where the camera moved least, such as on the short leg round the stair tower.
const TURN_METRES = 6
// Samples of that pace for each spline segment.
const PACE_SAMPLES = 64
// A move takes MOVE_TIME.base seconds plus one second for each MOVE_TIME.speed metres of pace,
// held between MOVE_TIME.min and MOVE_TIME.max. So a long move runs faster, but never rushes,
// and a short move never crawls.
const MOVE_TIME = { base: 1.2, speed: 12, min: 1.8, max: 3.6 }
// The speed curve: the camera speeds up over the first RAMP.in of the move, cruises, and
// slows over the last RAMP.out. The slow-down is the longer one, so the camera settles.
const RAMP = { in: 0.35, out: 0.4 }
// The highest start speed, in path lengths per move. Above about 2 the cruise speed would
// fall below the start speed, and the camera would brake in the middle of the move.
const MAX_START = 2
// The area under smootherstep from 0 to x. Smootherstep has no speed or acceleration step
// at either end, so the speed curve below has none.
const rampArea = (x) => x ** 4 * (x * (x - 3) + 2.5)

// The share of the path the camera has covered at share tau of the move. v0 is the start
// speed, in path lengths per move, so a move that takes over keeps the speed the camera has.
// The speed blends from v0 to a cruise speed over RAMP.in, holds, and eases to zero over
// RAMP.out. The cruise speed makes the whole path take exactly the move: from rest, 1.6
// times the mean speed.
export function moveProgress(tau, v0 = 0) {
    const { in: a, out: b } = RAMP
    const cruise = (1 - (a * v0) / 2) / (a / 2 + (1 - a - b) + b / 2)
    if (tau <= 0) return 0
    if (tau >= 1) return 1
    if (tau < a) return a * (v0 * (tau / a) + (cruise - v0) * rampArea(tau / a))
    if (tau <= 1 - b) return (a * (v0 + cruise)) / 2 + (tau - a) * cruise
    return 1 - b * cruise * rampArea((1 - tau) / b)
}

// The look point LOOK_DISTANCE metres from `position` toward `target`.
const aim = (position, target) => target.clone().sub(position).setLength(LOOK_DISTANCE).add(position)

// The follow frames of a story leg (legsFromRoute in camera-rig.js), in the order of the move.
// A reverse leg replays the forward camera path backward.
function followFrames(leg) {
    const { curve, length, back, up, reverse } = leg
    const heading = new THREE.Vector3()
    const fallback = curve.points.at(-1).clone().sub(curve.points[0]).setY(0).normalize()
    const shares = reverse ? [...LEG_SAMPLES].reverse() : LEG_SAMPLES
    return shares.map((u) => {
        const at = curve.pointAt(u, new THREE.Vector3())
        const ahead = curve.pointAt(Math.min(1, u + LOOK_AHEAD / length), new THREE.Vector3())
        curve.tangentAt(u, heading).setY(0)
        if (heading.lengthSq() < 1e-6) heading.copy(fallback)
        const position = at.addScaledVector(heading.normalize(), -back)
        position.y += up
        return { position, look: aim(position, ahead) }
    })
}

// True if blocked(a, b, ends) finds the aerie on any of ARC_CHECKS straight pieces along path.
// ends are the two ends of the whole path.
function meets(path, blocked) {
    const a = new THREE.Vector3()
    const b = path.pointAt(0, new THREE.Vector3())
    const ends = [b.clone(), path.pointAt(1, new THREE.Vector3())]
    for (let i = 1; i <= ARC_CHECKS; i += 1) {
        a.copy(b)
        path.pointAt(i / ARC_CHECKS, b)
        if (blocked(a, b, ends)) return true
    }
    return false
}

// The point `distance` metres behind and half as far above `position`, against the view to
// `look`, and the look point from there.
function behind(position, look, distance) {
    const point = position.clone().addScaledVector(look.clone().sub(position).setY(0).normalize(), -distance)
    point.y += distance / 2
    return { cam: point, look: aim(point, look) }
}

// The control points of an arc from position to shot, lifted `lift` metres in the middle. A
// crane arc also backs away from the start and comes in from behind the end.
function arcPoints(position, look, shot, lift, crane) {
    const end = aim(shot.position, shot.target)
    if (lift <= 0.5 && !crane) return { cams: [position.clone(), shot.position.clone()], looks: [look, end] }
    const middle = position.clone().lerp(shot.position, 0.5)
    middle.y += lift
    const middleLook = look.clone().lerp(end, 0.5)
    middleLook.y += lift / 2
    if (!crane) return { cams: [position.clone(), middle, shot.position.clone()], looks: [look, middleLook, end] }
    const away = behind(position, look, CRANE)
    const back = behind(shot.position, end, CRANE)
    return {
        cams: [position.clone(), away.cam, middle, back.cam, shot.position.clone()],
        looks: [look, away.look, middleLook, back.look, end],
    }
}

// Builds a move from the camera as it is now to `shot`. With a leg the path runs through the
// leg's follow frames. Without one it rises in an arc, high enough that blocked(a, b, ends),
// which says if the aerie lies between two points, finds nothing. duration is in seconds, or null
// for a duration from the path length. midway is true for a move that takes over from another
// one. The two paths have the same number of points, so the rig runs both on one spline
// parameter and the view turns in step with the camera.
export function createMove({ position, target, shot, leg = null, duration = null, blocked = () => false, midway = false }) {
    let cams = [position.clone()]
    let looks = [aim(position, target)]
    let camPath = null
    if (leg) {
        const straight = position.distanceTo(shot.position)
        followFrames(leg)
            .filter((frame) => !midway || position.distanceTo(frame.position) + frame.position.distanceTo(shot.position) <= DETOUR * straight)
            .forEach((frame) => {
                cams.push(frame.position)
                looks.push(frame.look)
            })
        cams.push(shot.position.clone())
        looks.push(aim(shot.position, shot.target))
        camPath = createWalkCurve(cams)
    } else {
        const start = Math.min(MAX_LIFT, position.distanceTo(shot.position) * LIFT_PER_METRE)
        const look = looks[0]
        let lift = start
        let crane = false
        for (;;) {
            ;({ cams, looks } = arcPoints(position, look, shot, lift, crane))
            camPath = createWalkCurve(cams)
            if (lift >= MAX_LIFT || !meets(camPath, blocked)) break
            if (!crane && lift >= start + LIFT_TRIES) {
                crane = true
                lift = start
            } else lift = Math.min(MAX_LIFT, Math.max(lift, 0.5) + LIFT_STEP)
        }
    }
    const lookPath = createWalkCurve(looks)
    // The running pace along the shared spline parameter: camera metres plus view turn.
    const segments = cams.length - 1
    const count = segments * PACE_SAMPLES
    const pace = new Float32Array(count + 1)
    const cam = cams[0].clone()
    const view = looks[0].clone().sub(cam)
    const nextCam = new THREE.Vector3()
    const nextView = new THREE.Vector3()
    for (let k = 1; k <= count; k += 1) {
        const p = k / PACE_SAMPLES
        camPath.pointAtParameter(p, nextCam)
        lookPath.pointAtParameter(p, nextView).sub(nextCam)
        pace[k] = pace[k - 1] + Math.hypot(nextCam.distanceTo(cam), TURN_METRES * nextView.angleTo(view))
        cam.copy(nextCam)
        view.copy(nextView)
    }
    const time = duration ?? THREE.MathUtils.clamp(MOVE_TIME.base + pace[count] / MOVE_TIME.speed, MOVE_TIME.min, MOVE_TIME.max)
    // The spline parameter at share s of the pace, for both paths.
    const parameterAt = (s) => tableIndex(pace, s) / PACE_SAMPLES
    // The start speed v0 (moveProgress) that sends the camera along the path at `speed`
    // metres a second, held between 0 and MAX_START.
    const first = camPath.pointAtParameter(1 / PACE_SAMPLES, new THREE.Vector3()).distanceTo(cams[0])
    const metresPerPace = pace[1] > 0 ? first / pace[1] : 0
    const startFor = (speed) => (metresPerPace > 0 && pace[count] > 0 ? THREE.MathUtils.clamp((speed * time) / (pace[count] * metresPerPace), 0, MAX_START) : 0)
    return { camPath, lookPath, parameterAt, startFor, duration: time }
}

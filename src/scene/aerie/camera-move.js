import * as THREE from 'three'
import { createWalkCurve, tableIndex } from './walk-curve.js'
import { plannedPath } from './path-plan.js'

export { createClearance } from './clearance.js'
export { warmPlans } from './path-plan.js'

// One camera move between two stops as two smooth paths: one for the camera and one for the
// point it looks at. The rig (camera-rig.js) runs along both paths with one speed curve.
//
// The camera path comes from a planner (path-plan.js) that flies one smooth curve through the
// free space round the aerie, clear of the house, the trees and the props. The view eases from
// the start shot's direction to the end shot's direction along the way. The old moves rode a
// drone follow along the walk spline of each story leg, so the camera traced the stair flights
// up the tower, and jumps rose in arcs over a box round the house.

// The look points sit this far ahead of their camera points, in metres. A look point far
// away from its camera point would swing the view faster than the camera moves.
const LOOK_DISTANCE = 10
// How far the view leans toward the way the camera flies, at most, in the middle of a flight,
// and how much of the climb or dive of the path it follows.
const TRAVEL_LEAN = 0.6
const TRAVEL_TILT = 0.4
// How far from the door axis, in metres, the start or end of a move counts as in the doorway.
const DOOR_CORRIDOR = 1.5
// A move through a doorway runs DOOR_SLOW times slower than its cruise within DOOR_ZONE.near
// metres of the porch point, and at full cruise beyond DOOR_ZONE.far. It eases between the
// two, so the camera brakes over several metres and dollies through the door. Without it the
// camera reached the door at 33 m/s and braked to 10 m/s in a tenth of a second.
const DOOR_SLOW = 3
const DOOR_ZONE = { near: 2.5, far: 9 }
// A move runs at an even pace along a mix of camera distance and view turn: each radian the
// view turns counts as a number of metres, and the two add in quadrature, so the pace bends
// smoothly where the view starts or stops turning. Without the turn, the view whipped round
// where the camera moved least, such as on the short leg round the stair tower.
// A move takes the first weight in TURN_METRES that keeps its fastest view turn under
// TURN_RATE radians (60 degrees) a second. A heavier weight slows the camera where the view
// turns, as an operator slows the dolly for a pan. With one weight of 6 m, the view turned at
// up to 140 degrees a second at the end of the leg from the pad to the workshop.
const TURN_METRES = [6, 9, 13, 18, 26, 38]
const TURN_RATE = 1.05
// Samples of that pace for each spline segment.
const PACE_SAMPLES = 64
// A move takes MOVE_TIME.base seconds plus one second for each MOVE_TIME.speed metres of pace,
// held between MOVE_TIME.min and MOVE_TIME.max. So a long move runs faster, but never rushes,
// and a short move never crawls. A move whose view turns a long way (TURN_METRES), or that
// passes a doorway (DOOR_SLOW), may take up to MOVE_TIME.turn seconds.
const MOVE_TIME = { base: 1.2, speed: 12, min: 1.8, max: 3.6, turn: 4.4 }
// The speed curve: the camera speeds up over the first RAMP.in of the move, cruises, and
// slows over the last RAMP.out. The slow-down is the longer one, so the camera settles.
const RAMP = { in: 0.35, out: 0.4 }
// The highest start speed, in path lengths per move. Above about 2 the cruise speed would
// fall below the start speed, and the camera would brake in the middle of the move.
const MAX_START = 2
// The area under smootherstep from 0 to x. Smootherstep has no speed or acceleration step
// at either end, so the speed curve below has none.
const rampArea = (x) => x ** 4 * (x * (x - 3) + 2.5)
// The cruise speed of a move from rest, in path lengths per move (moveProgress).
const CRUISE = 1 / (1 - (RAMP.in + RAMP.out) / 2)

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

// The direction share w of the way from unit vector a to unit vector b, along the great
// circle. Two views that face almost apart turn round the vertical.
function blendView(a, b, w) {
    const angle = a.angleTo(b)
    if (angle < 1e-4) return a.clone()
    const axis = new THREE.Vector3().crossVectors(a, b)
    if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0)
    return a.clone().applyAxisAngle(axis.normalize(), angle * w)
}

// One flight from `from` to `to`, each { position, look }. The camera points come from the
// planner when a clearance field is in, and are the two ends without one. The view turns
// evenly along the distance flown, from the start view to the end view, and the look distance
// blends in the same way. Returns the camera and look control points, ends included.
function flight(from, to, field) {
    const cams = field ? plannedPath(field, from.position, to.position) : [from.position.clone(), to.position.clone()]
    const views = [from, to].map((end) => end.look.clone().sub(end.position))
    const [near, far] = views.map((view) => view.length())
    const [start, end] = views.map((view) => view.normalize())
    const lengths = [0]
    for (let i = 1; i < cams.length; i += 1) lengths.push(lengths[i - 1] + cams[i].distanceTo(cams[i - 1]))
    const total = lengths.at(-1) || 1
    const travel = new THREE.Vector3()
    const looks = cams.map((cam, i) => {
        if (i === 0) return from.look.clone()
        if (i === cams.length - 1) return to.look.clone()
        const w = lengths[i] / total
        const view = blendView(start, end, w)
        // In the middle of the flight the view leans toward the way the camera flies, flatter
        // than the path, as a pilot looks ahead. A view that only blended the two shots stared
        // at the workshop wall from 2 m on the way from the pad to the telescope. The lean
        // fades out where the camera flies away from the view, so a pull-back never turns round.
        travel.subVectors(cams[i + 1], cams[i - 1])
        travel.y *= TRAVEL_TILT
        travel.normalize()
        const lean = TRAVEL_LEAN * Math.sin(Math.PI * w) ** 2 * Math.max(0, view.dot(travel))
        view.multiplyScalar(1 - lean).addScaledVector(travel, lean).normalize()
        return cam.clone().addScaledVector(view, THREE.MathUtils.lerp(near, far, w))
    })
    return { cams, looks }
}

// The doorway frames of a move through a door, in the order of the move. door.side is 'in' or
// 'out', and door.outside, door.porch and door.inside are points on the door's centre line.
// The camera faces into the room the whole way: it looks in along the door axis, and from the
// inside point at the board on the way in. So the way out backs out through the door, the
// way in played backward, and the camera turns round in the open, not in the room.
// A move that starts close to the door axis skips the frames it has passed, and a move that
// ends close to it skips the frames past its end. The workshop shot stands 1 m inside the
// outside point, and the move from it to the board backed out 1 m and came back in.
function doorFrames(door, position, shot) {
    const outward = door.outside.clone().sub(door.inside).normalize()
    const along = (point) => point.clone().sub(door.inside).dot(outward)
    const onAxis = (point) => point.clone().sub(door.inside).projectOnPlane(outward).length() < DOOR_CORRIDOR
    const [start, end] = [along(position), along(shot.position)]
    const passed = (frame) => {
        const at = along(frame.position)
        if (door.side === 'in') return onAxis(position) && at > start - 0.1
        return (onAxis(position) && at < start + 0.1) || (onAxis(shot.position) && at > end - 0.1)
    }
    const frames = [door.outside, door.porch].map((point) => ({ position: point.clone(), look: point.clone().addScaledVector(outward, -LOOK_DISTANCE) }))
    // On the way in, the inside frame looks half way from the door axis to the end shot's view.
    // A look at the end shot's subject from there turned the view past the end view and back,
    // and the camera surged where the turn stopped.
    const inward = outward.clone().negate()
    const lead = door.side === 'in' ? inward.clone().lerp(shot.target.clone().sub(shot.position).normalize(), 0.5).normalize() : inward
    frames.push({ position: door.inside.clone(), look: door.inside.clone().addScaledVector(lead, LOOK_DISTANCE) })
    return (door.side === 'in' ? frames : frames.reverse()).filter((frame) => !passed(frame))
}

// The view turns at most MAX_TURN radians between two control points. A larger turn gets a
// control point half way, with the view half way round. Without it, the look path between two
// views that face apart passes close to the camera, and the view flips in one frame: the move
// out of the board view, which faces the wall, to the doorway behind it did that.
const MAX_TURN = 1.4
function splitTurns(cams, looks) {
    for (let i = 0; i < cams.length - 1; i += 1) {
        const from = looks[i].clone().sub(cams[i]).normalize()
        const to = looks[i + 1].clone().sub(cams[i + 1]).normalize()
        const angle = from.angleTo(to)
        if (angle <= MAX_TURN) continue
        // Two views that face almost apart turn round the vertical, toward the way the camera goes.
        const axis = new THREE.Vector3().crossVectors(from, to)
        if (axis.lengthSq() < 1e-6) {
            const travel = cams[i + 1].clone().sub(cams[i])
            axis.set(0, 1, 0)
            if (from.clone().applyAxisAngle(axis, Math.PI / 2).dot(travel) < 0) axis.negate()
        }
        const middle = cams[i].clone().lerp(cams[i + 1], 0.5)
        cams.splice(i + 1, 0, middle)
        looks.splice(i + 1, 0, middle.clone().addScaledVector(from.applyAxisAngle(axis.normalize(), angle / 2), LOOK_DISTANCE))
        i -= 1
    }
}

// Builds a move from the camera as it is now to `shot`. field is the clearance field
// (clearance.js), or null until it is built. duration is in seconds, or null for a duration
// from the path length. midway is true for a move that takes over from another one. door, if
// given, sends the move through a doorway (doorFrames). The two paths have the same number of
// points and the same knots, so the rig runs both on one spline parameter.
export function createMove({ position, target, shot, duration = null, field = null, midway = false, door = null }) {
    // A move that takes over starts its look path at the look point in use, at its distance.
    // The rig keeps the speed of that point, and a jump to LOOK_DISTANCE halved the turn rate
    // in one frame.
    const start = { position: position.clone(), look: midway ? target.clone() : aim(position, target) }
    const end = { position: shot.position.clone(), look: aim(shot.position, shot.target) }
    let cams = null
    let looks = null
    const frames = door ? doorFrames(door, position, shot) : []
    if (!frames.length) ({ cams, looks } = flight(start, end, field))
    else if (door.side === 'in') {
        // A flight to the first doorway frame, then through the door to the shot.
        ;({ cams, looks } = flight(start, frames[0], field))
        frames.slice(1).forEach((frame) => {
            cams.push(frame.position)
            looks.push(frame.look)
        })
        cams.push(end.position)
        looks.push(end.look)
    } else {
        // Through the door from the shot inside, then a flight to the end shot.
        cams = [start.position, ...frames.map((frame) => frame.position)]
        looks = [start.look, ...frames.map((frame) => frame.look)]
        const out = flight(frames.at(-1), end, field)
        cams.push(...out.cams.slice(1))
        looks.push(...out.looks.slice(1))
    }
    if (door) splitTurns(cams, looks)
    const camPath = createWalkCurve(cams)
    const lookPath = createWalkCurve(looks, camPath.gaps)
    // The camera metres and the view turn in radians of each pace sample along the shared
    // spline parameter.
    const segments = cams.length - 1
    const count = segments * PACE_SAMPLES
    const metres = new Float32Array(count + 1)
    const turns = new Float32Array(count + 1)
    // How much slower than its cruise the camera runs at each sample: DOOR_SLOW times slower
    // near the porch of a doorway, easing back to 1 in the open.
    const slow = new Float32Array(count + 1).fill(1)
    const cam = cams[0].clone()
    const view = looks[0].clone().sub(cam)
    const nextCam = new THREE.Vector3()
    const nextView = new THREE.Vector3()
    let plainPace = 0
    for (let k = 1; k <= count; k += 1) {
        const p = k / PACE_SAMPLES
        camPath.pointAtParameter(p, nextCam)
        lookPath.pointAtParameter(p, nextView).sub(nextCam)
        metres[k] = nextCam.distanceTo(cam)
        turns[k] = nextView.angleTo(view)
        plainPace += Math.hypot(metres[k], TURN_METRES[0] * turns[k])
        if (door) slow[k] = 1 + (DOOR_SLOW - 1) * (1 - THREE.MathUtils.smoothstep(nextCam.distanceTo(door.porch), DOOR_ZONE.near, DOOR_ZONE.far))
        cam.copy(nextCam)
        view.copy(nextView)
    }
    // The running pace for one turn weight. The weight rises until the fastest turn of the
    // view, at cruise speed, stays under TURN_RATE. The move time comes from the plain pace:
    // the first weight, with no door slow-down. A heavier weight and the slow-down stretch it in
    // step with the pace, up to MOVE_TIME.turn, so the camera keeps its speed in the open and
    // slows only where the view turns or the doorway is close.
    const plainTime = duration ?? THREE.MathUtils.clamp(MOVE_TIME.base + plainPace / MOVE_TIME.speed, MOVE_TIME.min, MOVE_TIME.max)
    let pace = null
    let time = 0
    for (const weight of TURN_METRES) {
        pace = new Float32Array(count + 1)
        let share = 0
        for (let k = 1; k <= count; k += 1) {
            const step = Math.hypot(metres[k], weight * turns[k]) * slow[k]
            pace[k] = pace[k - 1] + step
            if (step > 0) share = Math.max(share, turns[k] / step)
        }
        time = duration ?? Math.max(plainTime, Math.min(MOVE_TIME.turn, plainTime * Math.sqrt(pace[count] / plainPace)))
        if ((share * CRUISE * pace[count]) / time <= TURN_RATE) break
    }
    // The spline parameter at share s of the pace, for both paths.
    const parameterAt = (s) => tableIndex(pace, s) / PACE_SAMPLES
    // The start speed v0 (moveProgress) that sends the camera along the path at `speed`
    // metres a second, held between 0 and MAX_START.
    const first = camPath.pointAtParameter(1 / PACE_SAMPLES, new THREE.Vector3()).distanceTo(cams[0])
    const metresPerPace = pace[1] > 0 ? first / pace[1] : 0
    const startFor = (speed) => (metresPerPace > 0 && pace[count] > 0 ? THREE.MathUtils.clamp((speed * time) / (pace[count] * metresPerPace), 0, MAX_START) : 0)
    return { camPath, lookPath, parameterAt, startFor, duration: time }
}

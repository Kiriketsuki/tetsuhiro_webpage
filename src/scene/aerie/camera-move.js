import * as THREE from 'three'
import { createWalkCurve, tableIndex } from './walk-curve.js'
import { plannedPath, GUIDE_CLEAR } from './path-plan.js'
import { walks } from '../../data/walks.js'

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
// Where the path bends, the camera slows so that its sideways acceleration at cruise speed
// stays under BEND.lateral m/s2: a bend of radius r allows sqrt(lateral * r) m/s. The bend
// counts over BEND.span metres each way. Every slow-down (bends, doors and walks) then changes
// the cruise speed by at most BEND.brake m/s2 along the path, in a pass each way, so the camera
// brakes before a bend and speeds up after it with no surge. On a phone the flights into the
// telescope view bend hard round the house corner: the camera took that bend at 12 to 17 m/s
// and reached up to 298 m/s2.
const BEND = { lateral: 60, span: 1.5, brake: 40 }
// Samples of that pace for each spline segment.
const PACE_SAMPLES = 64
// A move takes MOVE_TIME.base seconds plus one second for each MOVE_TIME.speed metres of pace,
// held between MOVE_TIME.min and MOVE_TIME.max. So a long move runs faster, but never rushes,
// and a short move never crawls. A move whose view turns a long way (TURN_METRES), or that
// passes a doorway (DOOR_SLOW), may take up to MOVE_TIME.turn seconds.
// A move along a story walk (walkFlight) takes its time from its pace with the walk's
// slow-down, up to MOVE_TIME.walk seconds, and MOVE_TIME.door seconds more through a doorway.
// The owner found a 6 s walk too long. A cap under 5 s only sped the camera up on the walkway.
const MOVE_TIME = { base: 1.2, speed: 12, min: 1.8, max: 3.6, turn: 4.4, walk: 5, door: 1 }
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
function flight(from, to, field, least) {
    const cams = field ? plannedPath(field, from.position, to.position, least) : [from.position.clone(), to.position.clone()]
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

// The guide frames of the story walk of `leg`, `<from>><to>` (src/data/walks.js), each as
// { position, look, slow }, or null. A move the other way plays its walk backward. The board
// view sits behind the workshop door, so a move to or from it takes the walk of the workshop,
// and the walk then hands over to the doorway frames. Without the walk, the camera met the door
// axis from the hero shot at 28 m/s and turned onto it at 206 m/s2.
function walkFrames(leg) {
    const [from, to] = leg?.split('>').map((id) => (id === 'board' ? 'workshop' : id)) ?? []
    const frames = walks[`${from}>${to}`] ?? walks[`${to}>${from}`]?.slice().reverse()
    return (
        frames?.map(({ position, look, slow = 1 }) => {
            const point = new THREE.Vector3(...position)
            return { position: point, look: aim(point, new THREE.Vector3(...look)), slow }
        }) ?? null
    )
}

// A flight along the guide frames of a story walk: one planned flight from frame to frame,
// each with the frame's own view at its ends. The planner keeps GUIDE_CLEAR from every surface,
// so the camera flies low along the walkway and still clears the lamps and the bridge rails.
// Returns the camera and look control points, ends included, and the slow-down at each point.
// The two ends take the slow-down of the frame next to them.
function walkFlight(start, end, frames, field) {
    const keys = [{ ...start, slow: frames[0].slow }, ...frames, { ...end, slow: frames.at(-1).slow }]
    const cams = [start.position.clone()]
    const looks = [start.look.clone()]
    const slows = [keys[0].slow]
    for (let i = 1; i < keys.length; i += 1) {
        const part = flight(keys[i - 1], keys[i], field, GUIDE_CLEAR)
        const span = part.cams.length - 1
        for (let j = 1; j <= span; j += 1) {
            cams.push(part.cams[j])
            looks.push(part.looks[j])
            slows.push(THREE.MathUtils.lerp(keys[i - 1].slow, keys[i].slow, j / span))
        }
    }
    return { cams, looks, slows }
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
function splitTurns(cams, looks, slows = null) {
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
        slows?.splice(i + 1, 0, (slows[i] + slows[i + 1]) / 2)
        i -= 1
    }
}

// Builds a move from the camera as it is now to `shot`. field is the clearance field
// (clearance.js), or null until it is built. duration is in seconds, or null for a duration
// from the path length. midway is true for a move that takes over from another one. door, if
// given, sends the move through a doorway (doorFrames). leg, `<from>><to>`, names the stops of
// the move. A move from rest on a leg with a story walk follows the walk (walkFlight). A move
// that takes over starts off the walk, so it flies one planned flight to its shot. The two paths have
// the same number of points and the same knots, so the rig runs both on one spline parameter.
export function createMove({ position, target, shot, duration = null, field = null, midway = false, door = null, leg = null }) {
    // A move that takes over starts its look path at the look point in use, at its distance.
    // The rig keeps the speed of that point, and a jump to LOOK_DISTANCE halved the turn rate
    // in one frame.
    const start = { position: position.clone(), look: midway ? target.clone() : aim(position, target) }
    const end = { position: shot.position.clone(), look: aim(shot.position, shot.target) }
    let cams = null
    let looks = null
    // The walk slow-down at each control point, or null for a move without a walk.
    let slows = null
    const frames = door ? doorFrames(door, position, shot) : []
    const walk = midway ? null : walkFrames(leg)
    const fly = (from, to) => (walk ? walkFlight(from, to, walk, field) : { ...flight(from, to, field), slows: null })
    if (!frames.length) ({ cams, looks, slows } = fly(start, end))
    else if (door.side === 'in') {
        // A flight to the first doorway frame, then through the door to the shot.
        ;({ cams, looks, slows } = fly(start, frames[0]))
        ;[...frames.slice(1), end].forEach((frame) => {
            cams.push(frame.position)
            looks.push(frame.look)
            slows?.push(slows.at(-1))
        })
    } else {
        // Through the door from the shot inside, then a flight to the end shot.
        const out = fly(frames.at(-1), end)
        cams = [start.position, ...frames.map((frame) => frame.position), ...out.cams.slice(1)]
        looks = [start.look, ...frames.map((frame) => frame.look), ...out.looks.slice(1)]
        slows = out.slows && [...frames.map(() => out.slows[0]), ...out.slows]
    }
    if (door) splitTurns(cams, looks, slows)
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
    // The distance flown and the bend of the path in radians, both running totals.
    const flown = new Float32Array(count + 1)
    const bent = new Float32Array(count + 1)
    const stepNow = new THREE.Vector3()
    const stepBefore = new THREE.Vector3()
    let plainPace = 0
    for (let k = 1; k <= count; k += 1) {
        const p = k / PACE_SAMPLES
        camPath.pointAtParameter(p, nextCam)
        lookPath.pointAtParameter(p, nextView).sub(nextCam)
        metres[k] = nextCam.distanceTo(cam)
        turns[k] = nextView.angleTo(view)
        plainPace += Math.hypot(metres[k], TURN_METRES[0] * turns[k])
        stepNow.subVectors(nextCam, cam)
        flown[k] = flown[k - 1] + metres[k]
        bent[k] = bent[k - 1] + (k > 1 && metres[k] > 0 && stepBefore.lengthSq() > 0 ? stepNow.angleTo(stepBefore) : 0)
        stepBefore.copy(stepNow)
        if (door) slow[k] = 1 + (DOOR_SLOW - 1) * (1 - THREE.MathUtils.smoothstep(nextCam.distanceTo(door.porch), DOOR_ZONE.near, DOOR_ZONE.far))
        // A walk eases from the slow-down of one control point to the next, flat at each point,
        // so the speed changes with no step in acceleration. Near a door the larger one holds.
        if (slows) {
            const i = Math.min(segments - 1, Math.floor(p))
            slow[k] = Math.max(slow[k], THREE.MathUtils.lerp(slows[i], slows[i + 1], THREE.MathUtils.smootherstep(p - i, 0, 1)))
        }
        cam.copy(nextCam)
        view.copy(nextView)
    }
    const plainTime = duration ?? THREE.MathUtils.clamp(MOVE_TIME.base + plainPace / MOVE_TIME.speed, MOVE_TIME.min, MOVE_TIME.max)
    // The slow-down of the doors and the walk alone, before the bends.
    const base = slow.slice()
    // Shapes slow for a cruise speed in metres a second: the slow-down for each bend, then a pass
    // forward and a pass back that cap the change of speed squared over each step at
    // 2 * BEND.brake * metres. The speed at a sample is cruise / slow.
    const shape = (cruise) => {
        slow.set(base)
        for (let k = 0, low = 0, high = 0; k <= count; k += 1) {
            while (flown[k] - flown[low] > BEND.span) low += 1
            while (high < count && flown[high + 1] - flown[k] <= BEND.span) high += 1
            const span = flown[high] - flown[low]
            if (span > 0) slow[k] = Math.max(slow[k], cruise * Math.sqrt((bent[high] - bent[low]) / span / BEND.lateral))
        }
        const capSpeed = (k, from, gap) => {
            const reach = Math.sqrt((cruise / slow[from]) ** 2 + 2 * BEND.brake * gap)
            if (cruise / slow[k] > reach) slow[k] = cruise / reach
        }
        for (let k = 1; k <= count; k += 1) capSpeed(k, k - 1, metres[k])
        for (let k = count - 1; k >= 0; k -= 1) capSpeed(k, k + 1, metres[k + 1])
    }
    // The running pace for one turn weight. The weight rises until the fastest turn of the
    // view, at cruise speed, stays under TURN_RATE. The move time comes from the plain pace:
    // the first weight, with no slow-down. A heavier weight and the slow-down stretch it in
    // step with the pace, up to MOVE_TIME.turn, so the camera keeps its speed in the open and
    // slows only where the view turns, the path bends or the doorway is close.
    const paceMove = () => {
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
            // A walk takes its time from the whole pace, slow-down included, so the camera keeps
            // the walkway pace and does not rush the walk to fit MOVE_TIME.max.
            const stretched = slows ? MOVE_TIME.base + pace[count] / MOVE_TIME.speed : plainTime * Math.sqrt(pace[count] / plainPace)
            time = duration ?? Math.max(plainTime, Math.min(slows ? MOVE_TIME.walk + (door ? MOVE_TIME.door : 0) : MOVE_TIME.turn, stretched))
            if ((share * CRUISE * pace[count]) / time <= TURN_RATE) break
        }
        return { pace, time }
    }
    // A move that a time cap or a set duration holds short cruises faster than the plain
    // estimate, so its bends are shaped again at the speed it reaches, at most twice more. With
    // the estimate alone, the move from the board to the telescope on a phone still took a
    // 1.5 m bend at 15 m/s.
    let cruise = (CRUISE * plainPace) / plainTime
    let pace = null
    let time = 0
    for (let round = 0; round < 3; round += 1) {
        shape(cruise)
        ;({ pace, time } = paceMove())
        const reached = (CRUISE * pace[count]) / time
        if (reached <= cruise * 1.05) break
        cruise = reached
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

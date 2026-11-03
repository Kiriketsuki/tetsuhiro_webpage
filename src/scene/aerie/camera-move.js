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
// An arc that a lift of LIFT_TRIES more metres does not clear becomes a crane move: it rises
// CRANE metres straight up from the start shot, crosses, and comes straight down CRANE metres
// onto the end shot. A stop low beside the house, such as the telescope, needs the camera to
// come down onto it, as a lift in the middle cannot clear the last stretch.
const LIFT_TRIES = 10
const CRANE = 5
// The look points sit this far ahead of their camera points, in metres. A look point far
// away from its camera point would swing the view faster than the camera moves.
const LOOK_DISTANCE = 10
// A story leg (src/data/route.js): the camera rides FOLLOW_UP metres above and FOLLOW_BACK
// metres behind the walk spline, a drone follow, unless the leg sets `up` and `back`. It
// looks LOOK_AHEAD metres ahead on the spline. LEG_SAMPLES are the shares of the walk that give
// the follow frames between the two shots.
const FOLLOW_BACK = 5
const FOLLOW_UP = 4
const LOOK_AHEAD = 3
const FOLLOW_LEAD = 0.5
// The most route empties one leg can have in the GLB.
const MAX_ROUTE_POINTS = 99
const LEG_SAMPLES = [0.5]
// A move that starts in mid-air, when it takes over from another one, skips a follow frame
// that is a detour of more than DETOUR times the straight distance. A scroll back up passes
// the follow frame of the leg it reverses, and the path doubled back on itself through it.
const DETOUR = 1.4
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

// The points of one leg from the GLB empties Route_<from>_<to>_01, _02 and on, or null when
// the GLB has fewer than two of them.
function routeEmpties(from, to, anchorAt) {
    const points = []
    for (let i = 1; i <= MAX_ROUTE_POINTS; i += 1) {
        const point = anchorAt(`Route_${from}_${to}_${String(i).padStart(2, '0')}`)
        if (!point) break
        points.push(point)
    }
    return points.length >= 2 ? points : null
}

// Builds one leg per direction for each pair of neighbouring stops in `route`, keyed
// `<from>><to>`. anchorAt(name) returns the world position of a GLB node, or null. The
// Blender empties of a leg win over its fallback points. The leg the other way plays the
// same camera path backward, so a scroll up retraces the scroll down. A follow camera that
// walked the spline backward would sit on the other side of the walker, where the house
// stands on some legs.
export function legsFromRoute(route, anchorAt = () => null) {
    return Object.fromEntries(
        Object.entries(route).flatMap(([key, leg]) => {
            const [from, to] = key.split('>')
            const points = routeEmpties(from, to, anchorAt) ?? leg.points.map((point) => new THREE.Vector3(...point))
            const curve = createWalkCurve(points)
            const forward = { curve, length: curve.length, back: leg.back ?? FOLLOW_BACK, up: leg.up ?? FOLLOW_UP, reverse: false }
            return [
                [key, forward],
                [`${to}>${from}`, { ...forward, reverse: true }],
            ]
        })
    )
}

// The look point LOOK_DISTANCE metres from `position` toward `target`.
const aim = (position, target) => target.clone().sub(position).setLength(LOOK_DISTANCE).add(position)

// The follow frames of a story leg (legsFromRoute in camera-rig.js), in the order of the move.
// A reverse leg replays the forward camera path backward. Each frame has two looks: `look`
// along the walk, and `lead`, FOLLOW_LEAD of the way from there toward the end shot's subject,
// as an operator leads a pan. The look along the walk alone left most of the turn for the last
// stretch of the move. createMove takes the one that turns the view less.
function followFrames(leg, shot) {
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
        const view = ahead.sub(position).normalize()
        const subject = shot.target.clone().sub(position).normalize()
        const lead = view.clone().lerp(subject, FOLLOW_LEAD).normalize()
        return { position, look: position.clone().addScaledVector(view, LOOK_DISTANCE), lead: position.clone().addScaledVector(lead, LOOK_DISTANCE) }
    })
}

// The sum of the view turns, in radians, between neighbouring control points.
function viewTurn(cams, looks) {
    let sum = 0
    for (let i = 1; i < cams.length; i += 1) sum += looks[i - 1].clone().sub(cams[i - 1]).angleTo(looks[i].clone().sub(cams[i]))
    return sum
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

// The point `distance` metres straight above `position`, and the look point from there, still
// on the subject at `look`. The crane once backed away behind the shot, and the path reversed
// there at corners of up to 145 degrees.
function above(position, look, distance) {
    const point = position.clone()
    point.y += distance
    return { cam: point, look: aim(point, look) }
}

// The control points of an arc from position to shot, lifted `lift` metres in the middle. A
// crane arc also rises straight up from the start and comes straight down onto the end.
function arcPoints(position, look, shot, lift, crane) {
    const end = aim(shot.position, shot.target)
    if (lift <= 0.5 && !crane) return { cams: [position.clone(), shot.position.clone()], looks: [look, end] }
    // The top of the arc is flat: two points at full lift, a third and two thirds of the way.
    // One point at the top made a peak that the centripetal spline turned in about 0.5 m.
    const lifted = [1 / 3, 2 / 3].map((k) => {
        const cam = position.clone().lerp(shot.position, k)
        cam.y += lift
        const at = look.clone().lerp(end, k)
        at.y += lift / 2
        return { cam, look: at }
    })
    const middle = { cams: lifted.map((point) => point.cam), looks: lifted.map((point) => point.look) }
    if (!crane) return { cams: [position.clone(), ...middle.cams, shot.position.clone()], looks: [look, ...middle.looks, end] }
    const away = above(position, look, CRANE)
    const back = above(shot.position, end, CRANE)
    return {
        cams: [position.clone(), away.cam, ...middle.cams, back.cam, shot.position.clone()],
        looks: [look, away.look, ...middle.looks, back.look, end],
    }
}

// Builds a move from the camera as it is now to `shot`. With a leg the path runs through the
// leg's follow frames. Without one it rises in an arc, high enough that blocked(a, b, ends),
// which says if the aerie lies between two points, finds nothing. duration is in seconds, or null
// for a duration from the path length. midway is true for a move that takes over from another
// one. door, if given, sends the move through a doorway (doorFrames). The two paths have the same number of points, so the rig runs both on one spline
// parameter and the view turns in step with the camera.
// An arc from position, looking at look, to shot, raised until blocked finds nothing. It
// returns the control points, start and end included.
function arcTo(position, look, shot, blocked) {
    const start = Math.min(MAX_LIFT, position.distanceTo(shot.position) * LIFT_PER_METRE)
    let lift = start
    let crane = false
    for (;;) {
        const arc = arcPoints(position, look, shot, lift, crane)
        if (lift >= MAX_LIFT || !meets(createWalkCurve(arc.cams), blocked)) return arc
        if (!crane && lift >= start + LIFT_TRIES) {
            crane = true
            lift = start
        } else lift = Math.min(MAX_LIFT, Math.max(lift, 0.5) + LIFT_STEP)
    }
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

export function createMove({ position, target, shot, leg = null, duration = null, blocked = () => false, midway = false, door = null }) {
    let cams = [position.clone()]
    // A move that takes over starts its look path at the look point in use, at its distance.
    // The rig keeps the speed of that point, and a jump to LOOK_DISTANCE halved the turn rate
    // in one frame.
    let looks = [midway ? target.clone() : aim(position, target)]
    let camPath = null
    if (door) {
        // In: an arc to the first doorway frame, then through the door to the shot. Out:
        // through the door from the shot inside, then an arc to the end shot.
        const frames = doorFrames(door, position, shot)
        const frameShot = (frame) => ({ position: frame.position, target: frame.look })
        if (!frames.length) ({ cams, looks } = arcTo(position, looks[0], shot, blocked))
        else if (door.side === 'in') {
            ;({ cams, looks } = arcTo(position, looks[0], frameShot(frames[0]), blocked))
            frames.slice(1).forEach((frame) => {
                cams.push(frame.position)
                looks.push(frame.look)
            })
            cams.push(shot.position.clone())
            looks.push(aim(shot.position, shot.target))
        } else {
            frames.forEach((frame) => {
                cams.push(frame.position)
                looks.push(frame.look)
            })
            const last = frames.at(-1)
            const arc = arcTo(last.position, last.look, shot, blocked)
            cams.push(...arc.cams.slice(1))
            looks.push(...arc.looks.slice(1))
        }
        splitTurns(cams, looks)
        camPath = createWalkCurve(cams)
    } else if (leg) {
        const straight = position.distanceTo(shot.position)
        // A move that takes over also skips a follow frame where the path folds back. A scroll
        // back up early in a leg left the frame ahead of the camera: the path ran on to it and
        // came back through a cusp, and the brake (camera-rig.js) never started.
        const foldsBack = (frame) => frame.position.clone().sub(position).dot(shot.position.clone().sub(frame.position)) < 0
        const frames = followFrames(leg, shot).filter((frame) => !midway || (position.distanceTo(frame.position) + frame.position.distanceTo(shot.position) <= DETOUR * straight && !foldsBack(frame)))
        cams.push(...frames.map((frame) => frame.position), shot.position.clone())
        const end = aim(shot.position, shot.target)
        const along = [looks[0], ...frames.map((frame) => frame.look), end]
        const lead = [looks[0], ...frames.map((frame) => frame.lead), end]
        // The lead wins when it turns the view less in all. On a leg that walks away from the
        // end subject, as a reverse leg can, the lead turned the view out and back.
        looks = viewTurn(cams, lead) < viewTurn(cams, along) ? lead : along
        camPath = createWalkCurve(cams)
    } else {
        ;({ cams, looks } = arcTo(position, looks[0], shot, blocked))
        camPath = createWalkCurve(cams)
    }
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

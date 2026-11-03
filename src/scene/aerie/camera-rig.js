import * as THREE from 'three'
import { fitFov, MAX_FOV } from './framing.js'

// Moves the camera between named stops. It owns no loop: the scene manager calls update()
// each frame and reads `moving` to decide whether the frame needs a render.

// Degrees past MAX_FOV per unit of zoom past 1.
const ZOOM_HEADROOM = 35
// Look-around limits, as shares of the distance from the camera to its target.
const PAN_LIMIT = 0.35
const DOLLY_IN = 0.75
const DOLLY_OUT = 0.6
const LOOK_RETURN = 0.8
const PARALLAX = 0.012
// Wide screens put the text in side panels, the same test as the .stop layout in index.css.
const SIDE_PANELS = '(orientation: landscape) and (min-width: 768px)'
// A move that takes over from another one starts at the speed the camera has along the new
// path. The rest of the old motion, the part across the new path, fades out over TAKE_OVER
// seconds, so the camera never jerks. A move that heads back the way the camera came first
// coasts to a stop over TAKE_OVER seconds, then starts from there, so a scroll back up brakes
// and turns round in one smooth motion.
const TAKE_OVER = 0.6
// The shape of the fading part: it leaves at full speed and comes back to rest at TAKE_OVER.
const fadeOut = (t) => (t >= TAKE_OVER ? 0 : t * (1 - t / TAKE_OVER) ** 2)

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

// Builds one shot per stop from the GLB cameras, matched by name. A stop with a `tallView`
// takes that view on a screen without side panels (a portrait phone), where the text sits
// under the picture and the landscape view cannot hold its subject.
// anchorAt(name) returns the world position of a GLB anchor, or null. A stop's `focus` names
// an anchor or gives a point, and the lens keeps that point sharp. Without it the lens
// focuses on the look-at point.
export function shotsFromStops(stops, cameras = [], anchorAt = () => null) {
    const byName = new Map(cameras.map((camera) => [camera.name, camera]))
    const portrait = !window.matchMedia(SIDE_PANELS).matches
    return Object.fromEntries(
        Object.entries(stops).map(([id, stop]) => {
            const fallback = portrait && stop.tallView ? stop.tallView : stop.fallback
            const camera = stop.camera && !(portrait && stop.tallView) ? byName.get(stop.camera) : null
            const frame = { shift: stop.shift ?? [0, 0], tall: stop.tall ?? [0, 0], zoom: stop.zoom ?? 1, tallZoom: stop.tallZoom ?? stop.zoom ?? 1 }
            const focusOf = (target) => (Array.isArray(stop.focus) ? new THREE.Vector3(...stop.focus) : (stop.focus && anchorAt(stop.focus)) || target.clone())
            if (!camera) {
                const target = new THREE.Vector3(...fallback.target)
                return [id, { position: new THREE.Vector3(...fallback.position), target, focus: focusOf(target), fov: fallback.fov, ...frame }]
            }
            camera.updateMatrixWorld(true)
            const position = camera.getWorldPosition(new THREE.Vector3())
            const direction = camera.getWorldDirection(new THREE.Vector3())
            // The look-at point sits along the view line, at the fallback distance.
            const distance = new THREE.Vector3(...fallback.position).distanceTo(new THREE.Vector3(...fallback.target))
            const target = position.clone().addScaledVector(direction, distance)
            return [id, { position, target, focus: focusOf(target), fov: camera.fov, ...frame }]
        })
    )
}

// blocked(a, b, ends) says if the aerie lies on the straight line from a to b, for a move
// between the two points `ends`. An arc between two stops rises until it finds nothing
// (camera-move.js).
export function createCameraRig({ camera, shots, start = 'overview', blocked = () => false }) {
    let all = shots
    let current = start
    let tween = null
    let lookReturn = null
    const target = new THREE.Vector3()
    // The point the lens keeps sharp. It stays on the subject while the view pans.
    const focusPoint = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const frame = { sx: 0, sy: 0, tx: 0, ty: 0, zoom: 1, tzoom: 1, fov: 35 }
    const look = { x: 0, y: 0, dolly: 0 }
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
    const sidePanels = window.matchMedia(SIDE_PANELS)
    // The camera and look points of the move without the pointer drift, and their speeds in
    // metres a second. A move that takes over from another one coasts on at these speeds.
    const base = new THREE.Vector3()
    const baseLook = new THREE.Vector3()
    const velocity = new THREE.Vector3()
    const lookVelocity = new THREE.Vector3()
    // The pointer drift in force, and the camera distance it scales with.
    const drift = new THREE.Vector3()
    let driftDistance = 1
    const scratch = { right: new THREE.Vector3(), up: new THREE.Vector3(), dir: new THREE.Vector3(), last: new THREE.Vector3(), lastLook: new THREE.Vector3() }
    // createMove and moveProgress from camera-move.js. The scene manager loads that module as
    // its own chunk beside the island and hands it over with setMoves. Until then a move cuts.
    let moves = null

    const frameOf = (shot) => ({ sx: shot.shift[0], sy: shot.shift[1], tx: shot.tall[0], ty: shot.tall[1], zoom: shot.zoom, tzoom: shot.tallZoom, fov: shot.fov })

    const applyLens = () => {
        const side = sidePanels.matches
        const [x, y, zoom] = side ? [frame.sx, frame.sy, frame.zoom] : [frame.tx, frame.ty, frame.tzoom]
        const aspect = camera.aspect
        camera.fov = Math.min(MAX_FOV + Math.max(0, zoom - 1) * ZOOM_HEADROOM, fitFov(frame.fov, aspect) * zoom)
        camera.setViewOffset(aspect, 1, -x * aspect, y, aspect, 1)
    }

    const axes = () => {
        const shot = all[current]
        const forward = shot.target.clone().sub(shot.position)
        const distance = forward.length()
        forward.normalize()
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
        const up = new THREE.Vector3().crossVectors(right, forward)
        return { shot, forward, right, up, distance }
    }

    // The pointer drift for a view along `dir` at `distance` metres, written into drift. The
    // drift applies during a move too, so the end of a move never snaps to the pointer.
    const setDrift = (right, up, distance) => {
        driftDistance = distance
        drift.copy(right).multiplyScalar(pointer.sx * distance * PARALLAX).addScaledVector(up, -pointer.sy * distance * PARALLAX)
    }

    const place = () => {
        const { shot, forward, right, up, distance } = axes()
        setDrift(right, up, distance)
        const offset = right.clone().multiplyScalar(look.x).addScaledVector(up, look.y)
        target.copy(shot.target).add(offset).add(drift)
        camera.position.copy(shot.position).add(offset).add(drift).addScaledVector(forward, look.dolly)
        camera.lookAt(target)
        velocity.set(0, 0, 0)
        lookVelocity.set(0, 0, 0)
    }

    const jump = (id) => {
        current = id
        tween = null
        Object.assign(look, { x: 0, y: 0, dolly: 0 })
        Object.assign(frame, frameOf(all[id]))
        focusPoint.copy(all[id].focus)
        applyLens()
        place()
    }

    // The speed of a point on `path` at the start of `move` with start speed v0, in metres a
    // second, from one small step.
    const startVelocity = (move, v0, path, start) => {
        const tau = 1e-3
        const point = path.pointAtParameter(move.parameterAt(moves.moveProgress(tau, v0)), new THREE.Vector3())
        return point.sub(start).divideScalar(tau * move.duration)
    }

    // Starts a move from wherever the camera is now, at the speed it moves now. A zero
    // duration cuts. The second argument is the duration in seconds, or { duration, leg, door }.
    // door sends the move through a doorway (camera-move.js).
    // Without a duration the move takes one from its path length (camera-move.js). With a leg
    // (legsFromRoute) the path runs through the leg's follow frames. Without one it rises in
    // an arc.
    const goTo = (id, options = {}) => {
        const { duration = null, leg = null, door = null } = typeof options === 'number' ? { duration: options } : options
        if (!all[id]) return
        if (!moves || (duration !== null && duration <= 0)) {
            jump(id)
            return
        }
        const shot = all[id]
        const position = camera.position.clone().sub(drift)
        const from = target.clone().sub(drift)
        // A move that takes over keeps the lens fade where the old one had it, and coasts on
        // from where the camera is, at the speed it has.
        const travelFrom = tween ? Math.sin(Math.PI * tween.s) : 0
        const coast = velocity.lengthSq() + lookVelocity.lengthSq() > 1e-6 ? { position, look: baseLook.clone(), velocity: velocity.clone(), lookVelocity: lookVelocity.clone(), brake: false } : null
        const midway = Boolean(coast)
        let move = moves.createMove({ position, target: from, shot, leg, duration, blocked, midway, door })
        let v0 = 0
        const along = move.camPath.tangentAt(0, new THREE.Vector3()).dot(velocity)
        if (coast && along < 0) {
            // The coast covers half its start speed times TAKE_OVER before it stops.
            const stop = position.clone().addScaledVector(velocity, TAKE_OVER / 2)
            const stopLook = coast.look.clone().addScaledVector(lookVelocity, TAKE_OVER / 2)
            move = moves.createMove({ position: stop, target: stopLook, shot, leg, duration, blocked, midway, door })
            coast.brake = true
        } else if (coast) {
            // The new path takes the speed along it, and the rest of the motion fades out.
            v0 = move.startFor(along)
            const lookStart = move.lookPath.pointAtParameter(0, new THREE.Vector3())
            coast.across = velocity.clone().sub(startVelocity(move, v0, move.camPath, position))
            coast.lookAcross = lookVelocity.clone().sub(startVelocity(move, v0, move.lookPath, lookStart))
        }
        tween = {
            id,
            tau: 0,
            s: 0,
            age: 0,
            delay: coast?.brake ? TAKE_OVER : 0,
            v0,
            travelFrom,
            coast,
            ...move,
            focus: focusPoint.clone(),
            frame: { ...frame },
            to: frameOf(shot),
            distance: { from: driftDistance, to: shot.position.distanceTo(shot.target) },
        }
        current = id
        Object.assign(look, { x: 0, y: 0, dolly: 0 })
    }

    // The old motion of a move that took over, for the first TAKE_OVER seconds. A braking
    // coast runs on at the old speed and slows evenly to a stop where the new path starts. A
    // coast that goes on the same way adds only the part of the old speed across the new path,
    // and that part fades out to nothing.
    const blendCoast = (coast, age) => {
        if (!coast.brake) {
            base.addScaledVector(coast.across, fadeOut(age))
            baseLook.addScaledVector(coast.lookAcross, fadeOut(age))
            return
        }
        const t = Math.min(age, TAKE_OVER)
        const along = t - (t * t) / (2 * TAKE_OVER)
        base.copy(coast.position).addScaledVector(coast.velocity, along)
        baseLook.copy(coast.look).addScaledVector(coast.lookVelocity, along)
    }

    // One step of the move: the camera and look points at share s of the paths, then the
    // pointer drift, then the speeds for a move that may take over.
    const step = (delta) => {
        tween.age += delta
        tween.tau = THREE.MathUtils.clamp((tween.age - tween.delay) / tween.duration, 0, 1)
        const s = moves.moveProgress(tween.tau, tween.v0)
        tween.s = s
        const shot = all[tween.id]
        Object.keys(frame).forEach((key) => {
            frame[key] = THREE.MathUtils.lerp(tween.frame[key], tween.to[key], s)
        })
        applyLens()
        const lastBase = scratch.last.copy(base)
        const lastLook = scratch.lastLook.copy(baseLook)
        const parameter = tween.parameterAt(s)
        tween.camPath.pointAtParameter(parameter, base)
        tween.lookPath.pointAtParameter(parameter, baseLook)
        if (tween.coast && tween.age < TAKE_OVER) blendCoast(tween.coast, tween.age)
        if (delta > 0) {
            velocity.subVectors(base, lastBase).divideScalar(delta)
            lookVelocity.subVectors(baseLook, lastLook).divideScalar(delta)
        }
        const { right, up, dir } = scratch
        dir.subVectors(baseLook, base).normalize()
        right.crossVectors(dir, camera.up).normalize()
        up.crossVectors(right, dir)
        setDrift(right, up, THREE.MathUtils.lerp(tween.distance.from, tween.distance.to, s))
        camera.position.copy(base).add(drift)
        target.copy(baseLook).add(drift)
        focusPoint.lerpVectors(tween.focus, shot.focus, s)
        camera.lookAt(target)
        if (tween.tau >= 1 && (!tween.coast || tween.age >= TAKE_OVER)) {
            tween = null
            place()
        }
    }

    const update = (delta) => {
        pointer.sx += (pointer.x - pointer.sx) * Math.min(1, delta * 4)
        pointer.sy += (pointer.y - pointer.sy) * Math.min(1, delta * 4)
        if (lookReturn) {
            lookReturn.t = Math.min(1, lookReturn.t + delta / LOOK_RETURN)
            const k = 1 - ease(lookReturn.t)
            look.x = lookReturn.from.x * k
            look.y = lookReturn.from.y * k
            look.dolly = lookReturn.from.dolly * k
            if (lookReturn.t >= 1) lookReturn = null
        }
        if (!tween) {
            place()
            base.copy(camera.position).sub(drift)
            baseLook.copy(target).sub(drift)
            return
        }
        step(delta)
    }

    // dx and dy are screen pixels. The scene follows the finger.
    const pan = (dx, dy) => {
        if (tween) return
        lookReturn = null
        const { distance } = axes()
        const perPixel = (2 * (distance - look.dolly) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / window.innerHeight
        const limit = distance * PAN_LIMIT
        look.x = THREE.MathUtils.clamp(look.x - dx * perPixel, -limit, limit)
        look.y = THREE.MathUtils.clamp(look.y + dy * perPixel, -limit, limit)
    }

    // A factor above 1 moves in, below 1 moves out.
    const zoom = (factor) => {
        if (tween || !factor) return
        lookReturn = null
        const { distance } = axes()
        const along = (distance - look.dolly) / factor
        look.dolly = THREE.MathUtils.clamp(distance - along, -distance * DOLLY_OUT, distance * DOLLY_IN)
    }

    const release = () => {
        if (look.x || look.y || look.dolly) lookReturn = { t: 0, from: { ...look } }
    }

    // A small drift toward the pointer on a desktop. x and y run -1 to 1.
    const setPointer = (x, y) => {
        pointer.x = x
        pointer.y = y
    }

    const setShots = (next) => {
        all = next
        jump(current)
    }

    // Adds or replaces one shot without a jump, so a move that runs now keeps going.
    const addShot = (id, shot) => {
        all = { ...all, [id]: shot }
    }

    const resize = () => applyLens()
    // module: the camera-move.js module.
    const setMoves = (module) => {
        moves = module
    }
    sidePanels.addEventListener('change', applyLens)
    jump(start)

    return {
        goTo,
        jump,
        update,
        pan,
        zoom,
        release,
        setPointer,
        setShots,
        addShot,
        setMoves,
        resize,
        get current() {
            return current
        },
        // The time from the start of the move that runs now to its end, in seconds, or 0 at
        // rest. A move that brakes first ends later than its duration.
        get moveDuration() {
            return tween ? Math.max(tween.delay + tween.duration, tween.coast ? TAKE_OVER : 0) : 0
        },
        // 0 at rest, rising to 1 in the middle of a move between stops, for the lens fade. It
        // follows the share of the path, so it rises and falls with the speed curve.
        get travel() {
            return tween ? Math.max(Math.sin(Math.PI * tween.s), tween.travelFrom * (1 - tween.s)) : 0
        },
        // The view depth of the stop's focus point, in metres, for the lens.
        get focus() {
            return Math.max(0.5, focusPoint.clone().sub(camera.position).dot(camera.getWorldDirection(forward)))
        },
        // True while anything moves the camera, so the frame needs a render.
        get moving() {
            const drifting = Math.abs(pointer.x - pointer.sx) + Math.abs(pointer.y - pointer.sy) > 1e-4
            return Boolean(tween || lookReturn || drifting)
        },
        dispose: () => {
            sidePanels.removeEventListener('change', applyLens)
            camera.clearViewOffset()
        },
    }
}

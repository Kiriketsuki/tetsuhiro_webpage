import * as THREE from 'three'
import { fitFov, MAX_FOV } from './framing.js'

// Moves the camera between named stops. It owns no loop: the scene manager calls update()
// each frame and reads `moving` to decide whether the frame needs a render.

// Long moves rise over the island instead of cutting through it.
const LIFT_PER_METRE = 0.18
const MAX_LIFT = 40
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
// A story leg (src/data/route.js). The camera rides FOLLOW_UP metres above and FOLLOW_BACK
// metres behind the walk spline, a drone follow, and looks LOOK_AHEAD metres ahead on it.
const FOLLOW_BACK = 5
const FOLLOW_UP = 4
const LOOK_AHEAD = 3
// The shares of a leg that blend in from the start shot and out into the end shot.
const LEG_IN = 0.2
const LEG_OUT = 0.25
// A leg takes LEG_TIME.base seconds plus LEG_TIME.perMetre for each metre of spline, held
// between LEG_TIME.min and LEG_TIME.max.
const LEG_TIME = { base: 1.4, perMetre: 0.06, min: 2.0, max: 3.2 }
// The most route empties one leg can have in the GLB.
const MAX_ROUTE_POINTS = 99

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
            const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
            const length = curve.getLength()
            const duration = THREE.MathUtils.clamp(LEG_TIME.base + LEG_TIME.perMetre * length, LEG_TIME.min, LEG_TIME.max)
            const forward = { curve, length, duration, back: leg.back ?? FOLLOW_BACK, up: leg.up ?? FOLLOW_UP, reverse: false }
            return [
                [key, forward],
                [`${to}>${from}`, { ...forward, reverse: true }],
            ]
        })
    )
}

export function createCameraRig({ camera, shots, start = 'overview' }) {
    let all = shots
    let current = start
    let tween = null
    let lookReturn = null
    const target = new THREE.Vector3()
    // The point the lens keeps sharp. It stays on the subject while the view pans.
    const focusPoint = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const frame = { sx: 0, sy: 0, tx: 0, ty: 0, zoom: 1, tzoom: 1, fov: 35 }
    // Scratch vectors for the follow frame of a leg. heading keeps the last level direction
    // along the spline, for a point where the spline runs straight up.
    const legAt = new THREE.Vector3()
    const legAhead = new THREE.Vector3()
    const legTangent = new THREE.Vector3()
    const heading = new THREE.Vector3()
    const look = { x: 0, y: 0, dolly: 0 }
    const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
    const sidePanels = window.matchMedia(SIDE_PANELS)

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

    const place = () => {
        const { shot, forward, right, up } = axes()
        const offset = right.clone().multiplyScalar(look.x + pointer.sx * axes().distance * PARALLAX)
            .add(up.clone().multiplyScalar(look.y - pointer.sy * axes().distance * PARALLAX))
        target.copy(shot.target).add(offset)
        camera.position.copy(shot.position).add(offset).addScaledVector(forward, look.dolly)
        camera.lookAt(target)
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

    // Sets heading to the level direction of the leg at u, if the spline is not vertical there.
    const steer = (curve, u) => {
        curve.getTangentAt(u, legTangent).setY(0)
        if (legTangent.lengthSq() > 1e-6) heading.copy(legTangent.normalize())
    }

    // Starts a move from wherever the camera is now. A zero duration cuts. The second
    // argument is the duration in seconds, or { duration, leg }. With a leg (legsFromRoute)
    // the camera follows the walk spline and takes the leg's duration. Without one it takes
    // a lifted arc.
    const goTo = (id, options = 1.6) => {
        const { duration = 1.6, leg = null } = typeof options === 'number' ? { duration: options } : options
        if (!all[id]) return
        if (duration <= 0) {
            jump(id)
            return
        }
        const shot = all[id]
        if (leg) {
            heading.subVectors(leg.curve.points.at(-1), leg.curve.points[0]).setY(0).normalize()
            steer(leg.curve, leg.reverse ? 1 : 0)
        }
        tween = {
            id,
            t: 0,
            duration: leg ? leg.duration : duration,
            leg,
            from: { position: camera.position.clone(), target: target.clone(), focus: focusPoint.clone(), frame: { ...frame } },
            to: frameOf(shot),
            lift: leg ? 0 : Math.min(MAX_LIFT, camera.position.distanceTo(shot.position) * LIFT_PER_METRE),
        }
        current = id
        Object.assign(look, { x: 0, y: 0, dolly: 0 })
    }

    // The drone follow along a leg at eased time t. It blends in from where the move started
    // over the first LEG_IN of the leg, and out into the end shot over the last LEG_OUT. A
    // reverse leg runs the spline from its end, with the camera where the forward leg had it.
    const follow = ({ leg, from }, t, shot) => {
        const { curve, length, back, up } = leg
        const u = leg.reverse ? 1 - t : t
        curve.getPointAt(u, legAt)
        curve.getPointAt(Math.min(1, u + LOOK_AHEAD / length), legAhead)
        steer(curve, u)
        const into = 1 - THREE.MathUtils.smoothstep(t, 0, LEG_IN)
        const out = THREE.MathUtils.smoothstep(t, 1 - LEG_OUT, 1)
        camera.position.copy(legAt).addScaledVector(heading, -back)
        camera.position.y += up
        camera.position.lerp(from.position, into).lerp(shot.position, out)
        target.copy(legAhead).lerp(from.target, into).lerp(shot.target, out)
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
            return
        }
        tween.t = Math.min(1, tween.t + delta / tween.duration)
        const t = ease(tween.t)
        const shot = all[tween.id]
        Object.keys(frame).forEach((key) => {
            frame[key] = THREE.MathUtils.lerp(tween.from.frame[key], tween.to[key], t)
        })
        applyLens()
        if (tween.leg) {
            follow(tween, t, shot)
        } else {
            camera.position.lerpVectors(tween.from.position, shot.position, t)
            camera.position.y += Math.sin(Math.PI * t) * tween.lift
            target.lerpVectors(tween.from.target, shot.target, t)
        }
        focusPoint.lerpVectors(tween.from.focus, shot.focus, t)
        camera.lookAt(target)
        if (tween.t >= 1) {
            tween = null
            place()
        }
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

    const resize = () => applyLens()
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
        resize,
        get current() {
            return current
        },
        // 0 at rest, rising to 1 in the middle of a move between stops, for the lens fade.
        get travel() {
            return tween ? Math.sin(Math.PI * ease(tween.t)) : 0
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

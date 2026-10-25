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

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

// Builds one shot per stop from the GLB cameras, matched by name.
export function shotsFromStops(stops, cameras = []) {
    const byName = new Map(cameras.map((camera) => [camera.name, camera]))
    return Object.fromEntries(
        Object.entries(stops).map(([id, stop]) => {
            const camera = stop.camera ? byName.get(stop.camera) : null
            const { fallback } = stop
            const frame = { shift: stop.shift ?? [0, 0], tall: stop.tall ?? [0, 0], zoom: stop.zoom ?? 1, tallZoom: stop.tallZoom ?? stop.zoom ?? 1 }
            if (!camera) {
                return [id, { position: new THREE.Vector3(...fallback.position), target: new THREE.Vector3(...fallback.target), fov: fallback.fov, ...frame }]
            }
            camera.updateMatrixWorld(true)
            const position = camera.getWorldPosition(new THREE.Vector3())
            const direction = camera.getWorldDirection(new THREE.Vector3())
            // The look-at point sits along the view line, at the fallback distance.
            const distance = new THREE.Vector3(...fallback.position).distanceTo(new THREE.Vector3(...fallback.target))
            return [id, { position, target: position.clone().addScaledVector(direction, distance), fov: camera.fov, ...frame }]
        })
    )
}

export function createCameraRig({ camera, shots, start = 'overview' }) {
    let all = shots
    let current = start
    let tween = null
    let lookReturn = null
    const target = new THREE.Vector3()
    const frame = { sx: 0, sy: 0, tx: 0, ty: 0, zoom: 1, tzoom: 1, fov: 35 }
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
        applyLens()
        place()
    }

    // Starts a move from wherever the camera is now. A zero duration cuts.
    const goTo = (id, duration = 1.6) => {
        if (!all[id]) return
        if (duration <= 0) {
            jump(id)
            return
        }
        const shot = all[id]
        tween = {
            id,
            t: 0,
            duration,
            from: { position: camera.position.clone(), target: target.clone(), frame: { ...frame } },
            to: frameOf(shot),
            lift: Math.min(MAX_LIFT, camera.position.distanceTo(shot.position) * LIFT_PER_METRE),
        }
        current = id
        Object.assign(look, { x: 0, y: 0, dolly: 0 })
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
        camera.position.lerpVectors(tween.from.position, shot.position, t)
        camera.position.y += Math.sin(Math.PI * t) * tween.lift
        target.lerpVectors(tween.from.target, shot.target, t)
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

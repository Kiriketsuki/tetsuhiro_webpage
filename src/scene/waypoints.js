import * as THREE from 'three'
import gsap from 'gsap'
import { watch } from 'vue'
import { waypoints } from '../data/waypoints.js'

// Blender cameras use a 36 mm sensor. The shots were framed at 16:9.
const SENSOR = 36
const FRAMED_ASPECT = 16 / 9
const MAX_FOV = 75
// Degrees past MAX_FOV per unit of zoom past 1.
const ZOOM_HEADROOM = 35
const vfovFromLens = (mm) => THREE.MathUtils.radToDeg(2 * Math.atan(SENSOR / FRAMED_ASPECT / (2 * mm)))

// The same five shots as the Cam_* objects in island.glb. These are only used
// until the gltf arrives, or if it has no cameras.
const FALLBACK = [
    { position: [32, 32, 128], target: [2, 15, 0], lens: 38 }, // welcome, the portal
    { position: [-128, 9, 36], target: [-150, 3, 20], lens: 35 }, // about, the campfire
    { position: [199.4, 47.8, -15.4], target: [143.9, 23.5, -25.2], lens: 70 }, // skills, the tree
    { position: [150, 34, -18], target: [222, 20, -100], lens: 28 }, // projects, the volcano
    { position: [300, 290, 250], target: [50, 0, -30], lens: 30 }, // contact, the whole thing
].map(({ position, target, lens }) => toShot(position, target, lens))

function toShot(position, target, lens) {
    return {
        position: new THREE.Vector3(...position),
        target: new THREE.Vector3(...target),
        fov: vfovFromLens(lens),
    }
}

// Composition from the waypoint data: where the subject sits on screen and how
// much wider the lens goes. See src/data/waypoints.js.
const framing = waypoints.map(({ shift = [0, 0], tall = [0, 0], zoom = 1, tallZoom = zoom }) => ({ shift, tall, zoom, tallZoom }))
const FLAT = { shift: [0, 0], tall: [0, 0], zoom: 1, tallZoom: 1 }
// The same test as the .stop layout in index.css. Side panels on landscape
// screens, a panel at the bottom everywhere else.
const SIDE_PANELS = '(orientation: landscape) and (min-width: 768px)'

// Long moves rise over the island instead of cutting through it.
const LIFT_PER_METRE = 0.18
const MAX_LIFT = 60
const PARALLAX = 3

// Keeps the width of a 16:9 shot on narrow screens, so a phone still sees the
// thing the camera points at. Wide screens keep the vertical fov as framed.
export function fitFov(fov, aspect) {
    if (aspect >= FRAMED_ASPECT) return fov
    const half = THREE.MathUtils.degToRad(fov / 2)
    const wide = Math.atan(Math.tan(half) * FRAMED_ASPECT)
    const tall = 2 * Math.atan(Math.tan(wide) / aspect)
    return Math.min(MAX_FOV, THREE.MathUtils.radToDeg(tall))
}

// Turns the gltf cameras into shots. The look-at point sits along the camera's
// view direction, as far out as the fallback target for that shot.
export function shotsFromCameras(cameras) {
    if (cameras.length < FALLBACK.length) return FALLBACK
    return FALLBACK.map((fallback, i) => {
        const override = waypoints[i]?.shot
        if (override) return toShot(override.position, override.target, override.lens)
        const camera = cameras[i]
        const distance = fallback.position.distanceTo(fallback.target)
        return {
            position: camera.position.clone(),
            target: camera.position.clone().addScaledVector(camera.direction, distance),
            fov: camera.fov,
        }
    })
}

// Owns the camera group, the look-at target and the parallax. `active` is the
// shared section index from useWaypoints. The camera starts on the wide shot.
export function createWaypoints({ scene, camera, active, reducedMotion, onResize }) {
    let shots = FALLBACK
    let tween = null
    let fov = shots[4].fov
    // The frame tweens with the camera, so the subject slides across as it moves.
    const frame = { sx: 0, sy: 0, tx: 0, ty: 0, zoom: 1, tzoom: 1 }
    const sidePanels = window.matchMedia(SIDE_PANELS)

    const group = new THREE.Group()
    group.add(camera)
    scene.add(group)

    const target = new THREE.Object3D()
    scene.add(target)

    // setViewOffset slides the picture without moving the camera, so the
    // subject sits away from the text. Its units here are shares of the screen.
    const applyFov = () => {
        const [x, y, zoom] = sidePanels.matches ? [frame.sx, frame.sy, frame.zoom] : [frame.tx, frame.ty, frame.tzoom]
        const aspect = camera.aspect
        // A wider stop may pass the phone cap, so the whole island still fits.
        camera.fov = Math.min(MAX_FOV + Math.max(0, zoom - 1) * ZOOM_HEADROOM, fitFov(fov, aspect) * zoom)
        camera.setViewOffset(aspect, 1, -x * aspect, y, aspect, 1)
    }

    const frameOf = (section) => {
        const { shift, tall, zoom, tallZoom } = framing[section] ?? FLAT
        return { sx: shift[0], sy: shift[1], tx: tall[0], ty: tall[1], zoom, tzoom: tallZoom }
    }

    const jump = (section) => {
        const shot = shots[section]
        camera.position.copy(shot.position)
        target.position.copy(shot.target)
        fov = shot.fov
        Object.assign(frame, frameOf(section))
        applyFov()
    }
    jump(4)

    // One tween per move. Reduced motion gets an instant cut.
    const move = (section, duration = 1.4) => {
        tween?.kill()
        if (reducedMotion.value || duration === 0) {
            jump(section)
            return
        }
        const shot = shots[section]
        const from = { position: camera.position.clone(), target: target.position.clone(), fov, frame: { ...frame } }
        const to = frameOf(section)
        const lift = Math.min(MAX_LIFT, from.position.distanceTo(shot.position) * LIFT_PER_METRE)
        const progress = { t: 0 }
        tween = gsap.to(progress, {
            t: 1,
            duration,
            ease: 'power2.inOut',
            onUpdate: () => {
                const t = progress.t
                camera.position.lerpVectors(from.position, shot.position, t)
                camera.position.y += Math.sin(Math.PI * t) * lift
                target.position.lerpVectors(from.target, shot.target, t)
                fov = THREE.MathUtils.lerp(from.fov, shot.fov, t)
                Object.keys(frame).forEach((key) => {
                    frame[key] = THREE.MathUtils.lerp(from.frame[key], to[key], t)
                })
                applyFov()
            },
        })
    }

    const setShots = (next) => {
        shots = next
        jump(4)
    }

    const onMouseMove = (e) => {
        if (reducedMotion.value) return
        const x = (e.clientX / window.innerWidth) * 2 - 1
        const y = (e.clientY / window.innerHeight) * 2 - 1
        gsap.to(group.position, { x: -x * PARALLAX, y: -y * PARALLAX, duration: 0.6, ease: 'power2.out', overwrite: true })
    }
    window.addEventListener('mousemove', onMouseMove)

    const stopResize = onResize ? onResize(applyFov) : () => {}
    sidePanels.addEventListener('change', applyFov)
    const stop = watch(active, (section) => move(section))

    const stopFrame = () => sidePanels.removeEventListener('change', applyFov)

    return { group, target, move, jump, setShots, stop, stopResize, stopFrame, onMouseMove, getTween: () => tween }
}

export function disposeWaypoints(scene, { group, target, stop, stopResize, stopFrame, onMouseMove, getTween }, camera) {
    stop()
    stopResize()
    stopFrame()
    camera.clearViewOffset()
    getTween()?.kill()
    window.removeEventListener('mousemove', onMouseMove)
    gsap.killTweensOf([camera.position, target.position, group.position])
    scene.remove(group)
    scene.remove(target)
}

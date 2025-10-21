import * as THREE from 'three'
import gsap from 'gsap'
import { watch } from 'vue'

// Blender cameras use a 36 mm sensor. The shots were framed at 16:9.
const SENSOR = 36
const FRAMED_ASPECT = 16 / 9
const MAX_FOV = 75
const vfovFromLens = (mm) => THREE.MathUtils.radToDeg(2 * Math.atan(SENSOR / FRAMED_ASPECT / (2 * mm)))

// The same five shots as the Cam_* objects in island.glb. These are only used
// until the gltf arrives, or if it has no cameras.
const FALLBACK = [
    { position: [32, 32, 128], target: [2, 15, 0], lens: 38 }, // welcome, the portal
    { position: [-128, 9, 36], target: [-150, 3, 20], lens: 35 }, // about, the campfire
    { position: [116, 15, 22], target: [146, 16, -18], lens: 28 }, // skills, the tree
    { position: [150, 34, -18], target: [222, 20, -100], lens: 28 }, // projects, the volcano
    { position: [300, 290, 250], target: [50, 0, -30], lens: 30 }, // contact, the whole thing
].map(({ position, target, lens }) => ({
    position: new THREE.Vector3(...position),
    target: new THREE.Vector3(...target),
    fov: vfovFromLens(lens),
}))

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

    const group = new THREE.Group()
    group.add(camera)
    scene.add(group)

    const target = new THREE.Object3D()
    scene.add(target)

    const applyFov = () => {
        camera.fov = fitFov(fov, camera.aspect)
        camera.updateProjectionMatrix()
    }

    const jump = (section) => {
        const shot = shots[section]
        camera.position.copy(shot.position)
        target.position.copy(shot.target)
        fov = shot.fov
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
        const from = { position: camera.position.clone(), target: target.position.clone(), fov }
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
    const stop = watch(active, (section) => move(section))

    return { group, target, move, jump, setShots, stop, stopResize, onMouseMove, getTween: () => tween }
}

export function disposeWaypoints(scene, { group, target, stop, stopResize, onMouseMove, getTween }, camera) {
    stop()
    stopResize()
    getTween()?.kill()
    window.removeEventListener('mousemove', onMouseMove)
    gsap.killTweensOf([camera.position, target.position, group.position])
    scene.remove(group)
    scene.remove(target)
}

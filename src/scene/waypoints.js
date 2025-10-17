import * as THREE from 'three'
import gsap from 'gsap'
import { watch } from 'vue'

// Camera positions for the five sections, in scroll order.
const POSITIONS = [
    new THREE.Vector3(18.1, 6.8, -35), // dodecahedron
    new THREE.Vector3(-27.6, 12.178, -40), // about
    new THREE.Vector3(-57, 23.7, -60), // skill tree
    new THREE.Vector3(-129, 34, -100), // projects
    new THREE.Vector3(-126, 94.3, -100), // contact
]

// Owns the camera group, the look-at target and the parallax. `active` is the
// shared section index from useWaypoints.
export function createWaypoints({ scene, camera, active, reducedMotion }) {
    const group = new THREE.Group()
    group.add(camera)
    scene.add(group)
    camera.position.set(-100, 200, 200)

    const target = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), new THREE.PointsMaterial())
    target.position.set(0, 0, 0)
    scene.add(target)

    // One tween per move. Reduced motion gets an instant cut.
    const move = (section, duration = 1.4) => {
        const position = POSITIONS[section]
        const ratio = section / (POSITIONS.length - 1)
        const time = reducedMotion.value ? 0 : duration
        const ease = 'power2.inOut'
        gsap.to(camera.position, { x: position.x, y: position.y, z: position.z, duration: time, ease, overwrite: 'auto' })
        gsap.to(target.position, {
            x: position.x + Math.cos(ratio * Math.PI) * 20,
            y: position.y - 30,
            z: 300,
            duration: time,
            ease,
            overwrite: 'auto',
        })
    }

    const onMouseMove = (e) => {
        if (reducedMotion.value) return
        const x = (e.clientX / window.innerWidth) * 2 - 1
        const y = (e.clientY / window.innerHeight) * 2 - 1
        gsap.to(group.position, { x: -x * 4, y: -y * 4, duration: 0.6, ease: 'power2.out', overwrite: true })
    }
    window.addEventListener('mousemove', onMouseMove)

    const stop = watch(active, (section) => move(section))

    return { group, target, move, stop, onMouseMove }
}

export function disposeWaypoints(scene, { group, target, stop, onMouseMove }, camera) {
    stop()
    window.removeEventListener('mousemove', onMouseMove)
    gsap.killTweensOf([camera.position, target.position, group.position])
    scene.remove(group)
    scene.remove(target)
    target.geometry.dispose()
    target.material.dispose()
}

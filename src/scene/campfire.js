import * as THREE from 'three'

const FIRE = 0xfca942
const EMBER_COUNT = 36
const EMBER_HEIGHT = 3.2
// Colours above 1 so the bloom picks the flame up.
const FLAME_LAYERS = [
    { color: 0xec4e2f, glow: 3, radius: 0.42, height: 1.25 },
    { color: 0xfca942, glow: 4, radius: 0.3, height: 0.95 },
    { color: 0xfff1c9, glow: 5, radius: 0.16, height: 0.6 },
]

// Cheap smooth noise, enough to make the flicker look less like a sine wave.
const wobble = (t, seed) => Math.sin(t * 7.3 + seed) * 0.5 + Math.sin(t * 13.1 + seed * 2.1) * 0.3 + Math.sin(t * 23.7 + seed * 0.7) * 0.2

function createFlame() {
    const group = new THREE.Group()
    const layers = FLAME_LAYERS.map(({ color, glow, radius, height }, i) => {
        const geometry = new THREE.ConeGeometry(radius, height, 6, 1, true)
        geometry.translate(0, height / 2, 0)
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(color).multiplyScalar(glow),
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
            fog: false,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.y = i * 0.6
        group.add(mesh)
        return mesh
    })
    return { group, layers }
}

function createEmbers() {
    const position = new Float32Array(EMBER_COUNT * 3)
    const speed = new Float32Array(EMBER_COUNT)
    const reset = (i, height = 0) => {
        position[i * 3] = (Math.random() - 0.5) * 0.6
        position[i * 3 + 1] = height
        position[i * 3 + 2] = (Math.random() - 0.5) * 0.6
        speed[i] = 0.6 + Math.random() * 0.9
    }
    for (let i = 0; i < EMBER_COUNT; i++) reset(i, Math.random() * EMBER_HEIGHT)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    const material = new THREE.PointsMaterial({
        color: new THREE.Color(FIRE).multiplyScalar(4),
        size: 0.09,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
    })
    const points = new THREE.Points(geometry, material)

    const update = (delta, time) => {
        for (let i = 0; i < EMBER_COUNT; i++) {
            position[i * 3] += Math.sin(time * 2 + i) * 0.25 * delta
            position[i * 3 + 1] += speed[i] * delta
            if (position[i * 3 + 1] > EMBER_HEIGHT) reset(i)
        }
        geometry.attributes.position.needsUpdate = true
    }

    return { points, update }
}

// A small fire at Anchor_Campfire: three cones of flame, a few embers and a
// warm light that flickers with them.
export function createCampfire(scene, anchor, { reducedMotion } = {}) {
    const group = new THREE.Group()
    group.name = 'campfire'
    group.position.copy(anchor)

    const flame = createFlame()
    const embers = createEmbers()
    const light = new THREE.PointLight(FIRE, 60, 40, 2)
    light.position.y = 1.2
    group.add(flame.group, embers.points, light)
    scene.add(group)

    const update = (delta, time) => {
        if (reducedMotion?.value) return
        flame.layers.forEach((mesh, i) => {
            mesh.scale.y = 1 + wobble(time, i * 1.7) * 0.18
            mesh.scale.x = mesh.scale.z = 1 + wobble(time, i * 3.1 + 4) * 0.08
            mesh.rotation.y += delta * (0.6 + i * 0.3)
        })
        light.intensity = 60 + wobble(time, 9) * 14
        embers.update(delta, time)
    }

    return { group, light, update }
}

export function disposeCampfire(scene, { group }) {
    scene.remove(group)
    group.traverse((node) => {
        node.geometry?.dispose()
        node.material?.dispose()
        if (node.isLight) node.dispose()
    })
}

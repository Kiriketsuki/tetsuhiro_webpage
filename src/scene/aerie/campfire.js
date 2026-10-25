import * as THREE from 'three'

// The campfire from the earlier island, kept as a prop on the urban aerie lawn. It has no
// three.js light: its warmth reaches the toon island through one warm bounce spot, so no
// lit material recompiles. A glow sprite stands in for bloom.

const EMBER_COUNT = 28
const EMBER_HEIGHT = 2.4
// Linear colours a little above 1, so the flame stays orange after tone mapping.
const FLAME_LAYERS = [
    { color: 0xec4e2f, glow: 1.3, radius: 0.3, height: 0.9 },
    { color: 0xfca942, glow: 1.6, radius: 0.21, height: 0.68 },
    { color: 0xfff1c9, glow: 1.9, radius: 0.11, height: 0.42 },
]
const STONES = 7
const BOUNCE_RADIUS = 2.6
// Lawn search: candidate spots around this centre (GLB frame), in metres.
const SEARCH_CENTRE = new THREE.Vector2(4, -2)
const SEARCH_RADIUS = 9
const CLEAR_RADIUS = 1.1

const wobble = (t, seed) => Math.sin(t * 7.3 + seed) * 0.5 + Math.sin(t * 13.1 + seed * 2.1) * 0.3 + Math.sin(t * 23.7 + seed * 0.7) * 0.2

// island-look.js tags each mesh with the name of its web material.
const isGrass = (hit) => hit.object.userData.webMaterial === 'web_grass'

// Finds an open patch of lawn: a downward ray must hit grass first, on a gentle slope, at the
// centre and on a ring around it. Returns null when no spot passes.
export function findCampfireSpot(root) {
    const raycaster = new THREE.Raycaster()
    const down = new THREE.Vector3(0, -1, 0)
    const meshes = []
    root.traverse((node) => {
        if (node.isMesh) meshes.push(node)
    })
    const probe = (x, z) => {
        raycaster.set(new THREE.Vector3(x, 40, z), down)
        const hit = raycaster.intersectObjects(meshes, false)[0]
        if (!hit || !isGrass(hit)) return null
        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld)
        return Math.abs(normal.y) > 0.92 ? hit.point : null
    }
    for (let r = 0; r <= SEARCH_RADIUS; r += 1) {
        for (let a = 0; a < 12; a += 1) {
            const angle = (a / 12) * Math.PI * 2
            const x = SEARCH_CENTRE.x + Math.cos(angle) * r
            const z = SEARCH_CENTRE.y + Math.sin(angle) * r
            const centre = probe(x, z)
            if (!centre) continue
            const ring = [0, 1, 2, 3, 4, 5].every((k) => {
                const b = (k / 6) * Math.PI * 2
                const p = probe(x + Math.cos(b) * CLEAR_RADIUS, z + Math.sin(b) * CLEAR_RADIUS)
                return p && Math.abs(p.y - centre.y) < 0.35
            })
            if (ring) return centre
            if (r === 0) break
        }
    }
    return null
}

function createFlame() {
    const group = new THREE.Group()
    const layers = FLAME_LAYERS.map(({ color, glow, radius, height }, i) => {
        const geometry = new THREE.ConeGeometry(radius, height, 6, 1, true)
        geometry.translate(0, height / 2 + 0.08, 0)
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(color).multiplyScalar(glow),
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
        const mesh = new THREE.Mesh(geometry, material)
        mesh.rotation.y = i * 0.6
        group.add(mesh)
        return mesh
    })
    return { group, layers }
}

// A ring of stones and two crossed logs. They use flat basic colours, so they share the
// glow program and need no light. Their low-poly shapes give each face one tone.
function createHearth() {
    const group = new THREE.Group()
    const stone = new THREE.MeshBasicMaterial({ color: 0x2b303d })
    const wood = new THREE.MeshBasicMaterial({ color: 0x3a2418 })
    const rock = new THREE.DodecahedronGeometry(0.16, 0)
    for (let i = 0; i < STONES; i += 1) {
        const mesh = new THREE.Mesh(rock, stone)
        const angle = (i / STONES) * Math.PI * 2
        mesh.position.set(Math.cos(angle) * 0.45, 0.06, Math.sin(angle) * 0.45)
        mesh.rotation.set(i * 1.3, i * 0.7, i * 2.1)
        mesh.scale.set(1, 0.7, 1)
        group.add(mesh)
    }
    const log = new THREE.CylinderGeometry(0.06, 0.07, 0.8, 5)
    log.rotateZ(Math.PI / 2)
    ;[0.5, -0.6].forEach((turn) => {
        const mesh = new THREE.Mesh(log, wood)
        mesh.position.y = 0.08
        mesh.rotation.y = turn
        group.add(mesh)
    })
    return group
}

function createEmbers() {
    const position = new Float32Array(EMBER_COUNT * 3)
    const speed = new Float32Array(EMBER_COUNT)
    const reset = (i, height = 0.2) => {
        position[i * 3] = (Math.random() - 0.5) * 0.4
        position[i * 3 + 1] = height
        position[i * 3 + 2] = (Math.random() - 0.5) * 0.4
        speed[i] = 0.5 + Math.random() * 0.7
    }
    for (let i = 0; i < EMBER_COUNT; i += 1) reset(i, Math.random() * EMBER_HEIGHT)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    const material = new THREE.PointsMaterial({
        color: new THREE.Color(0xfca942).multiplyScalar(1.8),
        size: 0.05,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    const update = (delta, time) => {
        for (let i = 0; i < EMBER_COUNT; i += 1) {
            position[i * 3] += Math.sin(time * 2 + i) * 0.2 * delta
            position[i * 3 + 1] += speed[i] * delta
            if (position[i * 3 + 1] > EMBER_HEIGHT) reset(i)
        }
        geometry.attributes.position.needsUpdate = true
    }
    return { points, update }
}

// bounce: a Vector4 from the toon uniforms. The fire writes its position and reach into it.
export function createCampfire({ position, bounce }) {
    const group = new THREE.Group()
    group.name = 'Campfire'
    group.position.copy(position)
    const flame = createFlame()
    const embers = createEmbers()
    group.add(createHearth(), flame.group, embers.points)
    const glowSpot = { position: position.clone().add(new THREE.Vector3(0, 0.45, 0)), color: new THREE.Color(0xfca942).multiplyScalar(0.35), size: 1.6 }
    bounce?.set(position.x, position.y + 0.6, position.z, BOUNCE_RADIUS)

    const update = (delta, time) => {
        flame.layers.forEach((mesh, i) => {
            mesh.scale.y = 1 + wobble(time, i * 1.7) * 0.18
            mesh.scale.x = mesh.scale.z = 1 + wobble(time, i * 3.1 + 4) * 0.08
            mesh.rotation.y += delta * (0.6 + i * 0.3)
        })
        if (bounce) bounce.w = BOUNCE_RADIUS * (1 + wobble(time, 9) * 0.08)
        embers.update(delta, time)
    }
    const dispose = () => {
        group.traverse((node) => {
            node.geometry?.dispose()
            node.material?.dispose()
        })
    }
    return { group, glowSpot, update, dispose }
}

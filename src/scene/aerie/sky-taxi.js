import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { softenGeometry } from './soft-normals.js'

// The sky-taxi that brings the visitor in. It flies over the city and lands on the pad
// while the camera follows, then stays parked there as a prop. The body uses the shared
// toon material, so it compiles no new program. Each part has one flat colour per face.

const PARTS = [
    // [geometry, colour, position, scale]
    ['box', 0xd9a441, [0, 0.42, 0], [2.3, 0.5, 1.1]],
    ['box', 0x2a3346, [0.15, 0.78, 0], [1.25, 0.34, 0.95]],
    ['box', 0x1b2130, [-1.05, 0.5, 0], [0.25, 0.3, 1.0]],
    ['duct', 0x3a4152, [0.95, 0.42, 0.85], [1, 1, 1]],
    ['duct', 0x3a4152, [0.95, 0.42, -0.85], [1, 1, 1]],
    ['duct', 0x3a4152, [-0.95, 0.42, 0.85], [1, 1, 1]],
    ['duct', 0x3a4152, [-0.95, 0.42, -0.85], [1, 1, 1]],
    ['skid', 0x1b2130, [0, 0.08, 0.42], [2.0, 1, 1]],
    ['skid', 0x1b2130, [0, 0.08, -0.42], [2.0, 1, 1]],
]
const LIGHTS = [
    [0xfff1c9, [1.16, 0.45, 0.32]],
    [0xfff1c9, [1.16, 0.45, -0.32]],
    [0xff3a2a, [-1.18, 0.55, 0.42]],
    [0xff3a2a, [-1.18, 0.55, -0.42]],
]
const FLIGHT = [
    [150, 46, 150],
    [80, 30, 80],
    [36, 14, 26],
]
const HOVER = 3.2

function partGeometry(kind) {
    if (kind === 'duct') return new THREE.CylinderGeometry(0.38, 0.38, 0.14, 8)
    if (kind === 'skid') return new THREE.BoxGeometry(1, 0.06, 0.08)
    return new THREE.BoxGeometry(1, 1, 1)
}

// Merges the parts into one flat-shaded mesh with a colour per part.
function bodyGeometry() {
    const pieces = PARTS.map(([kind, hex, position, scale]) => {
        const geometry = partGeometry(kind).toNonIndexed()
        geometry.scale(...scale)
        geometry.translate(...position)
        const color = new THREE.Color(hex).convertSRGBToLinear()
        const colors = new Float32Array(geometry.attributes.position.count * 3)
        for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i)
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        geometry.deleteAttribute('uv')
        return geometry
    })
    const merged = mergeGeometries(pieces)
    merged.computeVertexNormals()
    pieces.forEach((piece) => piece.dispose())
    return softenGeometry(merged)
}

function lightMeshes() {
    const geometry = new THREE.BoxGeometry(0.08, 0.08, 0.14)
    return LIGHTS.map(([hex, position]) => {
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.8) }))
        mesh.position.set(...position)
        return mesh
    })
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

// deck: the landing point on the pad. material: the shared toon material.
export function createSkyTaxi({ deck, material }) {
    const group = new THREE.Group()
    group.name = 'SkyTaxi'
    const body = new THREE.Mesh(bodyGeometry(), material)
    body.userData.webMaterial = 'taxi'
    group.add(body, ...lightMeshes())

    const points = [...FLIGHT.map((p) => new THREE.Vector3(...p)), deck.clone().add(new THREE.Vector3(4, HOVER + 2, 3)), deck.clone().add(new THREE.Vector3(0, HOVER, 0)), deck.clone()]
    const path = new THREE.CatmullRomCurve3(points, false, 'centripetal')
    const heading = new THREE.Vector3()
    let flight = null

    const park = () => {
        flight = null
        group.position.copy(deck)
        group.rotation.set(0, Math.PI * 0.75, 0)
    }

    const placeAt = (t) => {
        const u = ease(t)
        group.position.copy(path.getPointAt(u))
        path.getTangentAt(Math.min(0.999, u), heading)
        heading.y = 0
        // The last stretch is a straight drop, so the heading holds its last value there.
        if (heading.lengthSq() > 0.02 && u < 0.92) {
            const yaw = Math.atan2(-heading.z, heading.x)
            const bank = Math.sin(t * Math.PI) * 0.18
            group.rotation.set(bank, yaw, 0)
        }
    }

    // Starts a flight that lasts `duration` seconds. update() moves it.
    const fly = (duration) => {
        flight = { t: 0, duration }
        placeAt(0)
    }

    const update = (delta) => {
        if (!flight) return false
        flight.t = Math.min(1, flight.t + delta / flight.duration)
        placeAt(flight.t)
        if (flight.t >= 1) park()
        return true
    }

    park()
    const dispose = () => {
        body.geometry.dispose()
        group.children.forEach((child) => child !== body && child.material.dispose())
        group.children[1]?.geometry.dispose()
    }
    return {
        group,
        fly,
        park,
        update,
        dispose,
        get flying() {
            return Boolean(flight)
        },
    }
}

// Finds the deck top under the pad anchor with a downward ray.
export function findDeck(root, anchor) {
    const raycaster = new THREE.Raycaster(anchor.clone().add(new THREE.Vector3(0, 20, 0)), new THREE.Vector3(0, -1, 0))
    const meshes = []
    root.traverse((node) => {
        if (node.isMesh) meshes.push(node)
    })
    const hit = raycaster.intersectObjects(meshes, false)[0]
    return hit ? hit.point : anchor.clone()
}

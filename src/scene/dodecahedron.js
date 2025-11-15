import * as THREE from 'three'
import { interests } from '../data/interests.js'
import { createFaceTexture } from './face-texture.js'

// The geometry keeps the old dodecahedron.glb size. The group scales it down to
// about 6 m across, which reads well from the welcome shot.
const RADIUS = 3.817
const SIZE = 6
// Anchor_Dodecahedron in island.glb, over the channel into the lake.
const HOME = new THREE.Vector3(17, 12, 56)

// Old per frame steps at 60fps, as units per second.
const BOB_HEIGHT = 0.6
const BOB_PERIOD = 4 * Math.PI
const SPIN_Y = -0.06
const SPIN_X = -0.12

const keyOf = (v) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`

// Reads the 12 pentagons out of DodecahedronGeometry. Each face is 3 triangles,
// 9 vertices in a row, that share 5 unique corners.
function readPentagons(radius) {
    const source = new THREE.DodecahedronGeometry(radius, 0)
    const position = source.getAttribute('position')
    const faces = []
    for (let f = 0; f < 12; f++) {
        const unique = new Map()
        for (let i = 0; i < 9; i++) {
            const v = new THREE.Vector3().fromBufferAttribute(position, f * 9 + i)
            unique.set(keyOf(v), v)
        }
        faces.push([...unique.values()])
    }
    source.dispose()
    return faces
}

// Puts a vertex on top and fits the pentagon into the square texture.
function buildFace(corners) {
    const centre = corners.reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(corners.length)
    const normal = centre.clone().normalize()
    const worldUp = Math.abs(normal.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
    const up = worldUp.clone().sub(normal.clone().multiplyScalar(worldUp.dot(normal))).normalize()
    const right = new THREE.Vector3().crossVectors(up, normal)

    let local = corners.map((v) => {
        const d = v.clone().sub(centre)
        return { v, x: d.dot(right), y: d.dot(up) }
    })

    // Turn the face so one vertex points up.
    const circumradius = Math.hypot(local[0].x, local[0].y)
    const topAngle = Math.atan2(local[0].y, local[0].x)
    const turn = Math.PI / 2 - topAngle
    local = local.map(({ v, x, y }) => ({
        v,
        x: x * Math.cos(turn) - y * Math.sin(turn),
        y: x * Math.sin(turn) + y * Math.cos(turn),
    }))

    // Counter-clockwise seen from outside.
    local.sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x))

    // The texture frame has the pentagon inscribed: 1.95 circumradii across.
    const scale = 1 / (1.95 * circumradius)
    const middle = (Math.max(...local.map((p) => p.y)) + Math.min(...local.map((p) => p.y))) / 2
    const uv = local.map((p) => [0.5 + p.x * scale, 0.5 + (p.y - middle) * scale])

    const positions = []
    const uvs = []
    const normals = []
    for (let i = 1; i < 4; i++) {
        for (const k of [0, i, i + 1]) {
            positions.push(local[k].v.x, local[k].v.y, local[k].v.z)
            uvs.push(uv[k][0], uv[k][1])
            normals.push(normal.x, normal.y, normal.z)
        }
    }
    return { positions, uvs, normals }
}

function buildGeometry() {
    const geometry = new THREE.BufferGeometry()
    const positions = []
    const uvs = []
    const normals = []
    readPentagons(RADIUS).forEach((corners, index) => {
        const face = buildFace(corners)
        positions.push(...face.positions)
        uvs.push(...face.uvs)
        normals.push(...face.normals)
        geometry.addGroup(index * 9, 9, index)
    })
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    return geometry
}

function buildMaterial(interest) {
    const map = createFaceTexture(interest)
    // The emissive map keeps the icons readable on the dark side of the island.
    return new THREE.MeshStandardMaterial({
        map,
        emissiveMap: map,
        emissive: 0xffffff,
        emissiveIntensity: 0.8,
        roughness: 0.6,
        metalness: 0,
    })
}

export function createDodecahedron({ scene, loadingManager, position = HOME, size = SIZE }) {
    const home = position.clone()
    const geometry = buildGeometry()
    const materials = interests.map(buildMaterial)
    const mesh = new THREE.Mesh(geometry, materials)

    const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x66cfe1 })
    )

    const light = new THREE.PointLight(0xab85f4, 30, 40, 2)

    const group = new THREE.Group()
    group.add(mesh, edges, light)
    group.position.copy(home)
    group.scale.setScalar(size / (2 * RADIUS))
    scene.add(group)

    // The anchor in the gltf wins over HOME once the island has loaded.
    const place = (anchor) => {
        home.copy(anchor)
        group.position.copy(anchor)
    }

    // time and delta are in seconds. The sine gives the soft ends of the bob.
    const update = (delta, time) => {
        group.position.y = home.y + Math.sin((time * 2 * Math.PI) / BOB_PERIOD) * BOB_HEIGHT
        group.rotation.y += SPIN_Y * delta
        group.rotation.x += SPIN_X * delta
        light.intensity = 30 + Math.sin(time * 1.3) * 10
    }

    return { group, mesh, update, place }
}

export function disposeDodecahedron(scene, { group, mesh }) {
    scene.remove(group)
    group.traverse((child) => {
        if (child.geometry) child.geometry.dispose()
        const list = Array.isArray(child.material) ? child.material : [child.material]
        list.forEach((material) => {
            if (!material) return
            material.map?.dispose()
            material.dispose()
        })
    })
    mesh.geometry.dispose()
}

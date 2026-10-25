import * as THREE from 'three'
import { createToonMaterial, createToonUniforms } from './toon-material.js'
import { softenGeometry } from './soft-normals.js'
import { applyAutumn } from './autumn.js'

// Puts the soft stylized night look on a loaded island_b GLB. Opaque parts share one toon material.
// Glass gets a see-through toon material. Emissive parts become flat bright colour, and
// their faces turn into glow sprites.

// Glow per emissive web material. `gain` scales the exported emissive strength before the
// tone mapper. `glow` is the sprite colour scale and `size` the sprite size in metres.
// The screen and the ember get no sprite.
const EMISSIVE = {
    web_emit_warm: { gain: 0.52, glow: 0.11, size: 1.0 },
    web_emit_pad_white: { gain: 0.3, glow: 0.09, size: 0.7 },
    web_emit_pad_red: { gain: 0.32, glow: 0.12, size: 0.7 },
    web_emit_screen: { gain: 0.6, glow: 0, size: 0 },
    web_emit_ember: { gain: 0.9, glow: 0.4, size: 0.5 },
}
const GLASS = /^web_glass/
// Glow sprites merge the emissive faces in cells of this size, in metres.
const GLOW_CELL = 0.9
const MAX_GLOWS = 600

// Warm bounce spots: the anchor name and the reach in metres.
const BOUNCES = [
    ['Anchor_Workshop', 5.2],
    ['Anchor_Entry_Light', 3.8],
    ['Anchor_Bedroom', 4.2],
    ['Anchor_BBQ', 2.8],
]

function emissiveColor(material) {
    const strength = material.emissiveIntensity ?? 1
    return material.emissive ? material.emissive.clone().multiplyScalar(strength) : new THREE.Color(0, 0, 0)
}

// Groups the triangles of one emissive mesh into grid cells and returns one spot per cell.
function glowSpots(mesh, color, size) {
    const position = mesh.geometry.attributes.position
    const index = mesh.geometry.index
    const triangles = (index ? index.count : position.count) / 3
    const cells = new Map()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const vertex = (i) => (index ? index.getX(i) : i)
    for (let t = 0; t < triangles; t += 1) {
        a.fromBufferAttribute(position, vertex(t * 3)).applyMatrix4(mesh.matrixWorld)
        b.fromBufferAttribute(position, vertex(t * 3 + 1)).applyMatrix4(mesh.matrixWorld)
        c.fromBufferAttribute(position, vertex(t * 3 + 2)).applyMatrix4(mesh.matrixWorld)
        const centre = a.add(b).add(c).divideScalar(3)
        const key = `${Math.floor(centre.x / GLOW_CELL)},${Math.floor(centre.y / GLOW_CELL)},${Math.floor(centre.z / GLOW_CELL)}`
        const cell = cells.get(key) ?? { sum: new THREE.Vector3(), count: 0 }
        cell.sum.add(centre)
        cell.count += 1
        cells.set(key, cell)
    }
    return [...cells.values()].map((cell) => ({
        position: cell.sum.divideScalar(cell.count),
        color,
        size,
    }))
}

function anchorPosition(gltf, name) {
    const node = gltf.scene.getObjectByName(name)
    return node ? node.getWorldPosition(new THREE.Vector3()) : null
}

export function applyIslandLook(gltf) {
    gltf.scene.updateMatrixWorld(true)
    const moon = anchorPosition(gltf, 'Anchor_Moon') ?? new THREE.Vector3(-28, 71, 24)
    const bounces = BOUNCES.map(([name, radius]) => {
        const p = anchorPosition(gltf, name)
        return p ? { x: p.x, y: p.y, z: p.z, radius } : null
    }).filter(Boolean)

    const uniforms = createToonUniforms({ moonDirection: moon, bounces })
    const opaque = createToonMaterial(uniforms)
    opaque.name = 'aerie.toon'
    const replaced = new Map()
    const spots = []
    const old = new Set()

    const swap = (mesh, source) => {
        old.add(source)
        mesh.userData.webMaterial = source.name
        const glow = EMISSIVE[source.name]
        if (glow) {
            if (!replaced.has(source.name)) {
                replaced.set(
                    source.name,
                    new THREE.MeshBasicMaterial({
                        name: `aerie.${source.name}`,
                        color: emissiveColor(source).multiplyScalar(glow.gain),
                        side: THREE.DoubleSide,
                    })
                )
            }
            if (glow.glow > 0) spots.push(...glowSpots(mesh, emissiveColor(source).multiplyScalar(glow.glow), glow.size))
            return replaced.get(source.name)
        }
        if (GLASS.test(source.name)) {
            if (!replaced.has(source.name)) {
                const glass = createToonMaterial(uniforms, {
                    color: source.color.clone(),
                    transparent: true,
                    opacity: source.opacity,
                    depthWrite: false,
                })
                glass.name = `aerie.${source.name}`
                replaced.set(source.name, glass)
            }
            return replaced.get(source.name)
        }
        return opaque
    }

    gltf.scene.traverse((child) => {
        if (!child.isMesh) return
        child.material = Array.isArray(child.material)
            ? child.material.map((m) => swap(child, m))
            : swap(child, child.material)
        if (child.material === opaque) {
            const soft = softenGeometry(child.geometry)
            if (soft !== child.geometry) child.geometry.dispose()
            child.geometry = soft
        }
    })
    old.forEach((material) => material.dispose())

    const meshes = []
    gltf.scene.traverse((child) => {
        if (child.isMesh) meshes.push(child)
    })
    applyAutumn(meshes)

    const materials = [opaque, ...replaced.values()]
    const dispose = () => {
        materials.forEach((material) => material.dispose())
    }
    return { uniforms, materials, glowSpots: spots.slice(0, MAX_GLOWS), dispose }
}

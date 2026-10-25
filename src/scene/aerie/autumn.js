import * as THREE from 'three'

// Autumn for the island, after the warm palette of Leaf it Alone. It runs once at load on
// the baked vertex colours of the tree crowns, the lawn and the planting. A slow noise in
// world space picks each region's tone, so a crown turns as one patch of red, orange or
// gold, never as single faces. The original brightness of each vertex carries through, so
// the baked shading and the crown gradient stay. Leaf litter gathers on the lawn under the
// crowns.

const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear()
const CROWN = [srgb(0xb3401f), srgb(0xd8692a), srgb(0xe39a35), srgb(0xd9b24c)]
const LAWN = [srgb(0x7f8a3a), srgb(0x9a9440), srgb(0xb59545)]
const LITTER = [srgb(0xd06a2c), srgb(0xe08a36), srgb(0xb84a26)]
// How far each family moves toward its palette.
const AMOUNT = { web_crown: 0.92, web_grass: 0.62, web_plants: 0.45 }
// Noise scales in cycles per metre: crowns change tree by tree, the lawn in broad patches.
const SCALE = { web_crown: 0.2, web_grass: 0.06, web_plants: 0.08 }
const LITTER_CELL = 1
const LITTER_BLUR = 2
const LITTER_STRENGTH = 0.85

function hash(x, y, z) {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const smooth = (t) => t * t * (3 - 2 * t)

function noise3(x, y, z) {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const fx = smooth(x - xi)
    const fy = smooth(y - yi)
    const fz = smooth(z - zi)
    const lerp = (a, b, t) => a + (b - a) * t
    const corner = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz)
    return lerp(
        lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), fx), lerp(corner(0, 1, 0), corner(1, 1, 0), fx), fy),
        lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), fx), lerp(corner(0, 1, 1), corner(1, 1, 1), fx), fy),
        fz
    )
}

// Picks a colour along a palette for t in 0..1.
function along(palette, t, out) {
    const x = THREE.MathUtils.clamp(t, 0, 0.999) * (palette.length - 1)
    const i = Math.floor(x)
    return out.copy(palette[i]).lerp(palette[i + 1], x - i)
}

const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

// A coarse map of where the crowns hang, blurred, so litter fades out from under each tree.
function litterMap(crowns) {
    const cells = new Map()
    const p = new THREE.Vector3()
    crowns.forEach((mesh) => {
        const position = mesh.geometry.attributes.position
        for (let i = 0; i < position.count; i += 3) {
            p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
            const key = `${Math.floor(p.x / LITTER_CELL)},${Math.floor(p.z / LITTER_CELL)}`
            cells.set(key, 1)
        }
    })
    const blurred = new Map()
    cells.forEach((_, key) => {
        const [cx, cz] = key.split(',').map(Number)
        for (let dx = -LITTER_BLUR; dx <= LITTER_BLUR; dx += 1) {
            for (let dz = -LITTER_BLUR; dz <= LITTER_BLUR; dz += 1) {
                const weight = Math.max(0, 1 - Math.hypot(dx, dz) / (LITTER_BLUR + 1))
                const k = `${cx + dx},${cz + dz}`
                blurred.set(k, Math.min(1, (blurred.get(k) ?? 0) + weight * 0.35))
            }
        }
    })
    return (x, z) => blurred.get(`${Math.floor(x / LITTER_CELL)},${Math.floor(z / LITTER_CELL)}`) ?? 0
}

function recolour(mesh, family, litterAt) {
    const color = mesh.geometry.attributes.color
    if (!color) return
    const position = mesh.geometry.attributes.position
    const p = new THREE.Vector3()
    const c = new THREE.Color()
    const target = new THREE.Color()
    const spot = new THREE.Color()
    const palette = family === 'web_crown' ? CROWN : LAWN
    const scale = SCALE[family]
    const amount = AMOUNT[family]
    // The mean palette brightness, so each vertex keeps its own brightness relative to it.
    const paletteLuma = palette.reduce((sum, col) => sum + luma(col), 0) / palette.length
    for (let i = 0; i < color.count; i += 1) {
        p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
        c.fromBufferAttribute(color, i)
        const n = noise3(p.x * scale, p.y * scale * 0.5, p.z * scale) * 0.75 + noise3(p.x * scale * 2.3, 0.5, p.z * scale * 2.3) * 0.25
        along(palette, n, target)
        if (family !== 'web_crown' && litterAt) {
            const litter = litterAt(p.x, p.z) * LITTER_STRENGTH
            if (litter > 0) target.lerp(along(LITTER, noise3(p.x * 0.4, 1.7, p.z * 0.4), spot), litter)
        }
        target.multiplyScalar(THREE.MathUtils.clamp(luma(c) / paletteLuma, 0.35, 1.6))
        c.lerp(target, amount)
        color.setXYZ(i, c.r, c.g, c.b)
    }
    color.needsUpdate = true
}

// meshes: island meshes tagged with userData.webMaterial by island-look.js.
export function applyAutumn(meshes) {
    const crowns = meshes.filter((mesh) => mesh.userData.webMaterial === 'web_crown')
    const litterAt = crowns.length ? litterMap(crowns) : null
    meshes.forEach((mesh) => {
        const family = mesh.userData.webMaterial
        if (family in AMOUNT) recolour(mesh, family, litterAt)
    })
}

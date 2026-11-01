import * as THREE from 'three'

// Shared helpers for the colour fields that palette.js and autumn.js paint into the baked
// vertex colours. Every field comes from a slow world-space noise, so a colour changes only
// across areas of a metre or more, never from one face to the next.

// THREE.Color reads a hex number as sRGB and stores it in the linear working space, because
// three turns colour management on by default. Up to round 4 this helper converted the
// result to linear a second time. Every palette tone then landed darker and more saturated
// than its hex, which turned the cream plaster tan and the whole frame a murky brown.
export const srgb = (hex) => new THREE.Color(hex)

export function hash3(x, y, z) {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const smooth = (t) => t * t * (3 - 2 * t)
const lerp = (a, b, t) => a + (b - a) * t

export function noise3(x, y, z) {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const fx = smooth(x - xi)
    const fy = smooth(y - yi)
    const fz = smooth(z - zi)
    const corner = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz)
    return lerp(
        lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), fx), lerp(corner(0, 1, 0), corner(1, 1, 0), fx), fy),
        lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), fx), lerp(corner(0, 1, 1), corner(1, 1, 1), fx), fy),
        fz
    )
}

// Two octaves of noise3 at `scale` cycles per metre, in 0..1.
export function field(p, scale, seed = 0) {
    return (
        noise3(p.x * scale + seed, p.y * scale * 0.5, p.z * scale) * 0.75 +
        noise3(p.x * scale * 2.3, 0.5 + seed, p.z * scale * 2.3) * 0.25
    )
}

// Picks a colour along a palette for t in 0..1.
export function along(palette, t, out) {
    if (palette.length === 1) return out.copy(palette[0])
    const x = THREE.MathUtils.clamp(t, 0, 0.999) * (palette.length - 1)
    const i = Math.floor(x)
    return out.copy(palette[i]).lerp(palette[i + 1], x - i)
}

export const luma = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

// The mean luma of the baked colours of a set of meshes, so each vertex can keep its own
// brightness relative to that mean when it takes a palette colour.
export function meanLuma(meshes) {
    let sum = 0
    let count = 0
    const c = new THREE.Color()
    meshes.forEach((mesh) => {
        const color = mesh.geometry.attributes.color
        if (!color) return
        for (let i = 0; i < color.count; i += 1) {
            sum += luma(c.fromBufferAttribute(color, i))
            count += 1
        }
    })
    return count ? sum / count : 1
}

// Keeps the baked brightness of a vertex as a ratio to the family mean, clamped, so the
// baked shading and gradients carry through the new palette.
export const lumaRatio = (c, mean) => THREE.MathUtils.clamp(luma(c) / Math.max(mean, 1e-4), 0.6, 1.4)

// Walks every vertex of a mesh in world space and writes back the colour `paint` returns.
export function paintVertices(mesh, paint) {
    const color = mesh.geometry.attributes.color
    if (!color) return
    const position = mesh.geometry.attributes.position
    const p = new THREE.Vector3()
    const c = new THREE.Color()
    for (let i = 0; i < color.count; i += 1) {
        p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
        c.fromBufferAttribute(color, i)
        paint(p, c, i)
        color.setXYZ(i, c.r, c.g, c.b)
    }
    color.needsUpdate = true
}

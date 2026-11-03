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

// The reference noise3. It stays as the path for a cell index that is too large or not finite.
function noise3Reference(x, y, z) {
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

const K1 = 374761393
const K2 = 668265263
const K3 = 1274126177
// A cell index below this limit keeps every product and sum in hash3 exact in a double. The
// largest product is 2^21 * K3, which is below 2^52, and the sum of three is below 2^53.
// Exact integer sums do not depend on the order of addition, so the corner hashes below match
// the ones that hash3 computes from the separate indices.
const CELL_LIMIT = 2097152

// The hash3 steps that follow the sum of the three products.
const finish = (sum) => {
    const h = sum | 0
    const g = Math.imul(h ^ (h >>> 13), K3)
    return ((g ^ (g >>> 16)) >>> 0) / 4294967295
}

// Same value as noise3Reference, without the closure and with the cell hash split into one
// base sum and seven exact offsets. The three-level lerp keeps its order: x, then y, then z.
export function noise3(x, y, z) {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    // A NaN or an infinite index fails these tests too, so it takes the reference path.
    if (!(Math.abs(xi) < CELL_LIMIT && Math.abs(yi) < CELL_LIMIT && Math.abs(zi) < CELL_LIMIT)) {
        return noise3Reference(x, y, z)
    }
    const tx = x - xi
    const ty = y - yi
    const tz = z - zi
    const fx = tx * tx * (3 - 2 * tx)
    const fy = ty * ty * (3 - 2 * ty)
    const fz = tz * tz * (3 - 2 * tz)
    const base = xi * K1 + yi * K2 + zi * K3
    const c000 = finish(base)
    const c100 = finish(base + K1)
    const c010 = finish(base + K2)
    const c110 = finish(base + K1 + K2)
    const c001 = finish(base + K3)
    const c101 = finish(base + K1 + K3)
    const c011 = finish(base + K2 + K3)
    const c111 = finish(base + K1 + K2 + K3)
    const x00 = c000 + (c100 - c000) * fx
    const x10 = c010 + (c110 - c010) * fx
    const x01 = c001 + (c101 - c001) * fx
    const x11 = c011 + (c111 - c011) * fx
    const y0 = x00 + (x10 - x00) * fy
    const y1 = x01 + (x11 - x01) * fy
    return y0 + (y1 - y0) * fz
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

// True for the colour layout the baked islands use: a plain, normalized Uint16 attribute. The
// fast loops below read and write the raw array and repeat what getX and setXYZ do for this
// layout, which is a divide or a Math.round by 65535. Any other layout takes the slow path. A
// Float16BufferAttribute also keeps a Uint16Array, but its getX decodes half floats, so it
// takes the slow path too.
function isPlainUint16Color(color) {
    return (
        color.array.constructor === Uint16Array &&
        !color.isFloat16BufferAttribute &&
        color.normalized === true &&
        !color.isInterleavedBufferAttribute &&
        color.itemSize >= 3
    )
}

// The mean luma of the baked colours of a set of meshes, so each vertex can keep its own
// brightness relative to that mean when it takes a palette colour.
export function meanLuma(meshes) {
    let sum = 0
    let count = 0
    const c = new THREE.Color()
    meshes.forEach((mesh) => {
        const color = mesh.geometry.attributes.color
        if (!color) return
        if (isPlainUint16Color(color)) {
            const ca = color.array
            const size = color.itemSize
            // The sum stays sequential, so the rounding matches the slow path.
            for (let i = 0; i < color.count; i += 1) {
                const o = i * size
                c.r = ca[o] / 65535
                c.g = ca[o + 1] / 65535
                c.b = ca[o + 2] / 65535
                sum += luma(c)
                count += 1
            }
            return
        }
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
    if (
        isPlainUint16Color(color) &&
        !position.isInterleavedBufferAttribute &&
        !position.isFloat16BufferAttribute &&
        !position.normalized &&
        position.itemSize === 3 &&
        position.count >= color.count
    ) {
        const ca = color.array
        const pa = position.array
        const size = color.itemSize
        const matrix = mesh.matrixWorld
        for (let i = 0; i < color.count; i += 1) {
            const o = i * size
            const q = i * 3
            p.set(pa[q], pa[q + 1], pa[q + 2]).applyMatrix4(matrix)
            c.r = ca[o] / 65535
            c.g = ca[o + 1] / 65535
            c.b = ca[o + 2] / 65535
            paint(p, c, i)
            // Math.round and no clamp, as normalize does in setXYZ. The typed array wraps it.
            ca[o] = Math.round(c.r * 65535)
            ca[o + 1] = Math.round(c.g * 65535)
            ca[o + 2] = Math.round(c.b * 65535)
        }
        color.needsUpdate = true
        return
    }
    for (let i = 0; i < color.count; i += 1) {
        p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
        c.fromBufferAttribute(color, i)
        paint(p, c, i)
        color.setXYZ(i, c.r, c.g, c.b)
    }
    color.needsUpdate = true
}

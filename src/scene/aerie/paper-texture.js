import * as THREE from 'three'

// A small tileable noise texture for the watercolour pass, built at startup so the site
// downloads no image for it. The pass reads each channel at its own scale:
//   R: paper grain, a few octaves of fine noise.
//   G, B: a slow 2D field for the screen-UV wobble.
//   A: a mid-size field for the pigment pools in dark areas.
const SIZE = 256

// Integer hash to 0..1. Wrapping the lattice coordinates by the period makes the noise tile.
function hash(x, y, period, seed) {
    const xi = ((x % period) + period) % period
    const yi = ((y % period) + period) % period
    let h = (xi * 374761393 + yi * 668265263 + seed * 2147483647) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const smooth = (t) => t * t * (3 - 2 * t)

// Value noise over a lattice of `period` cells across the texture, so it tiles.
function valueNoise(u, v, period, seed) {
    const x = u * period
    const y = v * period
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = smooth(x - x0)
    const fy = smooth(y - y0)
    const a = hash(x0, y0, period, seed)
    const b = hash(x0 + 1, y0, period, seed)
    const c = hash(x0, y0 + 1, period, seed)
    const d = hash(x0 + 1, y0 + 1, period, seed)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

function octaves(u, v, base, count, seed) {
    let sum = 0
    let weight = 0
    for (let i = 0; i < count; i += 1) {
        const amp = 0.5 ** i
        sum += valueNoise(u, v, base * 2 ** i, seed + i) * amp
        weight += amp
    }
    return sum / weight
}

export function createPaperTexture() {
    const data = new Uint8Array(SIZE * SIZE * 4)
    for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
            const u = x / SIZE
            const v = y / SIZE
            const i = (y * SIZE + x) * 4
            data[i] = octaves(u, v, 32, 3, 11) * 255
            data[i + 1] = octaves(u, v, 3, 2, 23) * 255
            data[i + 2] = octaves(u, v, 3, 2, 37) * 255
            data[i + 3] = octaves(u, v, 5, 3, 51) * 255
        }
    }
    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.name = 'aerie.paper'
    texture.needsUpdate = true
    return texture
}

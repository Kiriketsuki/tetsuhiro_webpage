import * as THREE from 'three'

// The painted leaf carpet on the lawn, after the leaf piles of Leaf it Alone: hundreds of
// small pointed leaves that overlap so densely that little ground shows between them. A
// few thousand leaf cards cannot cover a lawn that densely, so the toon shader paints the
// carpet into the lawn from this tile, and the leaf cards (leaf-cards.js) add the loose
// leaves on top that catch the light.
//
// The tile is rasterised once at load, in plain arrays, with no download. Every leaf is a
// whole shape with one colour of its own, never a face of the mesh. The leaf texture holds
// data, not colour, and the shader turns it into the litter tones:
// R: the tone of the leaf along the litter palette, 0 gold to 1 rust.
// G: the value of the leaf. Each leaf folds along its midrib, as the curled leaves of the
//    reference do: one half catches the light, the other half sits in its own shade, a
//    light vein runs down the fold and the rim darkens a little.
// B: the rank of the leaf, 0 to 1. The shader shows a leaf where the litter amount of the
//    lawn passes its rank, so a thin carpet shows a few whole leaves and a thick one shows
//    them all. A leaf never shows only in part.
// A: cover, 1 inside a leaf.
// The shadow texture holds the contact shadow that each leaf throws on the leaves and the
// ground under it: R is the shadow strength and G the rank of the leaf that throws it, so
// a shadow shows only while its leaf shows.
// Leaves that cross the tile edge wrap to the far side, so the tile repeats with no seam.

const SIZE = 512
// The tile spans this many metres of lawn. A leaf is about 0.15 to 0.26 m long, a little
// larger than a real leaf, so it still reads from the overview.
export const CARPET_TILE = 2.0
const LEAVES = 820
// The leaves painted per slice of a sliced build. A slice takes about 10 ms on a phone.
const LEAVES_PER_SLICE = 40
const SEED = 9137
// The contact shadow falls down and to the right of each leaf, in pixels, and its edge
// softens over SHADOW_SOFT pixels.
const SHADOW_OFFSET = [3.5, 4.5]
const SHADOW_SOFT = 3

function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// The half width of a pointed oval leaf at t along its length, from -1 (stem) to 1 (tip):
// narrow at the stem, widest a third of the way up, and pointed at the tip.
function halfWidth(leaf, t) {
    const s = Math.sqrt(Math.max(0, 1 - t * t))
    return leaf.width * s * (0.55 + 0.45 * s) * (1 - 0.18 * t)
}

// Signed distance in pixels from a leaf-local point to the leaf rim, negative inside.
function rimDistance(leaf, x, y) {
    const t = y / leaf.length
    if (Math.abs(t) >= 1) return Math.hypot(Math.abs(t) - 1, x / leaf.width) * leaf.length
    return Math.abs(x) - halfWidth(leaf, t)
}

// Visits every tile pixel within `reach` of the leaf centre plus an offset, with the point
// in leaf-local coordinates. The pixel index wraps across the tile edges.
function forPixels(leaf, offset, reach, visit) {
    const cos = Math.cos(leaf.angle)
    const sin = Math.sin(leaf.angle)
    const cx = leaf.x + offset[0]
    const cy = leaf.y + offset[1]
    for (let py = Math.floor(cy - reach); py <= Math.ceil(cy + reach); py += 1) {
        for (let px = Math.floor(cx - reach); px <= Math.ceil(cx + reach); px += 1) {
            const dx = px + 0.5 - cx
            const dy = py + 0.5 - cy
            const x = dx * cos + dy * sin
            const y = -dx * sin + dy * cos
            const index = ((py + SIZE) % SIZE) * SIZE + ((px + SIZE) % SIZE)
            visit(index, x, y)
        }
    }
}

// The value of the leaf at a local point: the fold, the vein and the rim.
function leafValue(leaf, x, y) {
    const t = y / leaf.length
    const u = THREE.MathUtils.clamp(x / Math.max(halfWidth(leaf, t), 1e-3), -1, 1)
    const lit = u * leaf.side
    let shade = lit >= 0 ? 1.04 - 0.1 * lit : 0.74 + 0.08 * (1 + lit)
    if (Math.abs(u) < 0.09) shade += 0.1
    if (Math.abs(u) > 0.82) shade *= 0.88
    // The tip curls up a little and catches more light than the stem end.
    shade *= 0.94 + 0.08 * (t * 0.5 + 0.5)
    return THREE.MathUtils.clamp(leaf.value * shade, 0, 1)
}

// Paints the leaves from `from` up to `to`, in order, into the arrays of `state`.
function paintLeaves(state, from, to) {
    const { leaves, leafData, shadowData, strength } = state
    for (let n = from; n < to; n += 1) {
        const leaf = leaves[n]
        const reach = leaf.length + SHADOW_SOFT + 2
        // The shadow first, so the leaf itself then clears the part of its shadow it covers.
        forPixels(leaf, SHADOW_OFFSET, reach, (index, x, y) => {
            const s = 1 - THREE.MathUtils.smoothstep(rimDistance(leaf, x, y), -SHADOW_SOFT * 0.5, SHADOW_SOFT)
            if (s <= 0.04 || s < strength[index] * 0.6) return
            strength[index] = s
            shadowData[index * 4] = Math.round(s * 255)
            shadowData[index * 4 + 1] = Math.round(leaf.rank * 255)
        })
        forPixels(leaf, [0, 0], leaf.length + 2, (index, x, y) => {
            if (rimDistance(leaf, x, y) > 0) return
            const o = index * 4
            leafData[o] = Math.round(leaf.tone * 255)
            leafData[o + 1] = Math.round(leafValue(leaf, x, y) * 255)
            leafData[o + 2] = Math.round(leaf.rank * 255)
            leafData[o + 3] = 255
            strength[index] = 0
            shadowData[o] = 0
        })
    }
}

function texture(data, name, anisotropy) {
    const out = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
    out.name = name
    out.colorSpace = THREE.NoColorSpace
    out.wrapS = THREE.RepeatWrapping
    out.wrapT = THREE.RepeatWrapping
    out.generateMipmaps = true
    out.minFilter = THREE.LinearMipmapLinearFilter
    out.magFilter = THREE.LinearFilter
    out.anisotropy = anisotropy
    out.needsUpdate = true
    return out
}

// Starts the paint in small slices between frames, so it overlaps the island download and
// never blocks the page for more than a slice. The leaves paint in the same order as one
// whole pass, so the tile comes out the same. finish() paints the leaves that remain at
// once, so the island can always use the tile the moment it loads. Pass { sliced: false }
// to paint it all at once.
// Returns the leaf texture, the shadow texture, finish and a dispose.
export function createLeafCarpet({ anisotropy = 1, sliced = false } = {}) {
    const random = mulberry32(SEED)
    const pxPerMetre = SIZE / CARPET_TILE
    const leaves = Array.from({ length: LEAVES }, () => {
        const length = (0.075 + random() * 0.055) * pxPerMetre
        return {
            x: random() * SIZE,
            y: random() * SIZE,
            angle: random() * Math.PI * 2,
            length,
            width: length * (0.42 + random() * 0.16),
            // Most leaves sit near the amber middle of the palette, with fewer at the gold and
            // rust ends, as the piles of the reference do.
            tone: Math.min(1, Math.max(0, 0.5 + (random() + random() - 1) * 0.6)),
            value: 0.66 + random() * 0.26,
            rank: random(),
            // Which half of the fold faces the light.
            side: random() < 0.5 ? -1 : 1,
        }
    })
    // Leaves with a low rank show first, so they lie on top: draw them last.
    leaves.sort((a, b) => b.rank - a.rank)
    const state = {
        leaves,
        leafData: new Uint8Array(SIZE * SIZE * 4),
        shadowData: new Uint8Array(SIZE * SIZE * 4),
        strength: new Float32Array(SIZE * SIZE),
        next: 0,
        done: false,
        timer: null,
    }
    const leaf = texture(state.leafData, 'aerie.carpet', anisotropy)
    const shadow = texture(state.shadowData, 'aerie.carpet.shadow', anisotropy)
    const out = {
        texture: leaf,
        shadow,
        finish: () => {
            if (state.timer !== null) clearTimeout(state.timer)
            state.timer = null
            if (!state.done) {
                paintLeaves(state, state.next, LEAVES)
                state.next = LEAVES
                state.done = true
                for (let i = 0; i < SIZE * SIZE; i += 1) state.shadowData[i * 4 + 3] = 255
                state.strength = null
                leaf.needsUpdate = true
                shadow.needsUpdate = true
            }
            return out
        },
        dispose: () => {
            if (state.timer !== null) clearTimeout(state.timer)
            leaf.dispose()
            shadow.dispose()
        },
    }
    const slice = () => {
        state.timer = null
        const to = Math.min(LEAVES, state.next + LEAVES_PER_SLICE)
        paintLeaves(state, state.next, to)
        state.next = to
        if (to < LEAVES) state.timer = setTimeout(slice, 0)
        else out.finish()
    }
    if (sliced) state.timer = setTimeout(slice, 0)
    else out.finish()
    return out
}

import * as THREE from 'three'

// The painted surface detail for the toon aerie, built at load in plain JS. Nothing
// downloads, so it costs no asset bytes and carries no licence. Every pattern wraps at the
// tile edge, so the tiles join without a seam. Each channel centres on 0.5 grey, and the
// toon shader multiplies the albedo by twice the value, so the detail changes only the
// value of a surface, never its hue.
//
// The patterns follow the hand-painted surfaces of Leaf it Alone: boards with their own
// tone, streaked grain and dark seams, soft trowel blotches on plaster, and paving stones
// of mixed value set in lighter mortar.
//
// R: wood. Six boards across the tile (v), each with its own value, grain streaks along the
//    board (u), a few knots and dark seams. Each board starts at its own place along u, so
//    its two end joints fall at random places and never line up with the next board. The
//    shader stretches the tile along u, so the boards read as long staggered planks.
// G: mottle. Soft blotches in three octaves, for plaster, roof, soil, cliff and fabric.
// B: paving. Rounded stones of mixed value, a dark rim inside each stone and light mortar.
// A: leaf clumps. Small rounded blobs packed together, for crowns, shrubs and the lawn.
//
// The build stays under the 15 ms load budget: the noise reads precomputed lattices, the
// loops write bytes directly, and each channel mean comes from a cheap first pass.

const SIZE = 256
const SEED = 7177
const BOARDS = 6
// Round 16 takes five stones across the tile, so each stone is smaller.
const STONE_CELLS = 5

function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

const smooth = (t) => t * t * (3 - 2 * t)
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)

// A lattice of random values that repeats every px by py cells. Both periods are powers of
// two, so a bit mask wraps them.
function lattice(px, py, seed) {
    const values = new Float32Array(px * py)
    for (let y = 0; y < py; y += 1) {
        for (let x = 0; x < px; x += 1) values[y * px + x] = hash2(x, y, seed)
    }
    return { px, py, values }
}

// Smooth value noise from a lattice. u and v are in 0..1.
function sample(grid, u, v) {
    const x = u * grid.px
    const y = v * grid.py
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = smooth(x - xi)
    const fy = smooth(y - yi)
    const mx = grid.px - 1
    const values = grid.values
    const x0 = xi & mx
    const x1 = (xi + 1) & mx
    const y0 = (yi & (grid.py - 1)) * grid.px
    const y1 = ((yi + 1) & (grid.py - 1)) * grid.px
    const top = values[y0 + x0] + (values[y0 + x1] - values[y0 + x0]) * fx
    const bottom = values[y1 + x0] + (values[y1 + x1] - values[y1 + x0]) * fx
    return top + (bottom - top) * fy
}

// The grain streaks: few cells along the board and many across it.
const STREAK = lattice(4, 128, SEED)
const STREAK_FINE = lattice(8, 256, SEED + 3)
const MOTTLE = [lattice(4, 4, SEED + 20), lattice(8, 8, SEED + 21), lattice(16, 16, SEED + 22)]

// Per board: a value, an end joint position and a few knots.
const BOARD_INFO = Array.from({ length: BOARDS * 2 }, (_, i) => ({
    value: hash2(i, 0, SEED + 60) - 0.5,
    joint: hash2(i, 1, SEED + 60),
    // A second value for the board piece past the joint.
    value2: hash2(i, 2, SEED + 60) - 0.5,
    knot: hash2(i, 3, SEED + 60),
    knotU: hash2(i, 4, SEED + 60),
    // Where this board starts along the tile, so the end joints stagger board by board.
    offset: hash2(i, 5, SEED + 60),
}))

function wood(tileU, v) {
    const bv = v * BOARDS
    const board = Math.floor(bv)
    const across = bv - board
    const info = BOARD_INFO[board]
    // The board runs from its own start, so u = 0 is a joint on this board only.
    const u = (tileU + info.offset) % 1
    const past = u > info.joint
    let value = 0.5 + (past ? info.value2 : info.value) * 0.2
    // Streaked grain along the board.
    // Round 11 strengthens the grain and puts a knot on more boards, so the plank texture
    // reads at a 300 px crop of the tower walls.
    value += (sample(STREAK, tileU, v) - 0.5) * 0.34 + (sample(STREAK_FINE, tileU, v) - 0.5) * 0.14
    // A knot on some boards: a small dark ellipse with a lighter ring.
    if (info.knot > 0.42) {
        let du = Math.abs(u - info.knotU)
        if (du > 0.5) du = 1 - du
        const d = Math.sqrt((du * 14) ** 2 + ((across - 0.5) * 2.2) ** 2)
        if (d < 1) value -= (1 - d) * 0.3
    }
    // A dark seam between boards, and at the end joint.
    const seam = Math.min(across, 1 - across)
    value -= (1 - clamp01(seam / 0.06)) * 0.32
    // The board start is a joint too, because the board takes its first value again there.
    // The joint line is thin, because the shader stretches the tile three times along u.
    const joint = Math.min(Math.abs(u - info.joint), u, 1 - u)
    value -= (1 - clamp01(joint / 0.0025)) * 0.28
    return value
}

function mottle(u, v) {
    const f = sample(MOTTLE[0], u, v) * 0.55 + sample(MOTTLE[1], u, v) * 0.3 + sample(MOTTLE[2], u, v) * 0.15
    return 0.5 + (f - 0.5) * 0.95
}

// Worley cells on a wrapping grid: one jittered point and one value per cell.
const STONES = Array.from({ length: STONE_CELLS * STONE_CELLS }, (_, i) => {
    const cx = i % STONE_CELLS
    const cy = Math.floor(i / STONE_CELLS)
    return {
        x: 0.08 + hash2(cx, cy, SEED + 30) * 0.84,
        y: 0.08 + hash2(cx, cy, SEED + 39) * 0.84,
        value: hash2(cx, cy, SEED + 47) - 0.5,
    }
})

// Round 16 bends the cell lookup by a smooth noise, so the joints wander and the stones read
// as irregular flagstones, not as a regular cell pattern. The noise wraps with the tile.
function paving(u, v) {
    const x = u * STONE_CELLS + (sample(MOTTLE[1], u, v) - 0.5) * 1.1
    const y = v * STONE_CELLS + (sample(MOTTLE[1], u + 0.37, v + 0.61) - 0.5) * 1.1
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    let f1 = Infinity
    let f2 = Infinity
    let value = 0
    for (let dy = -1; dy <= 1; dy += 1) {
        const row = ((yi + dy + STONE_CELLS) % STONE_CELLS) * STONE_CELLS
        for (let dx = -1; dx <= 1; dx += 1) {
            const stone = STONES[row + ((xi + dx + STONE_CELLS) % STONE_CELLS)]
            const ox = xi + dx + stone.x - x
            const oy = yi + dy + stone.y - y
            const d = ox * ox + oy * oy
            if (d < f1) {
                f2 = f1
                f1 = d
                value = stone.value
            } else if (d < f2) {
                f2 = d
            }
        }
    }
    const edge = Math.sqrt(f2) - Math.sqrt(f1)
    // Light mortar in the narrow joint, a dark rim just inside the stone, so each stone
    // reads as a rounded block set in the bed.
    // Round 16 softens the joint to a faint line, a little lighter than the stones.
    const mortar = 1 - clamp01(edge / 0.05)
    const rim = clamp01(edge / 0.05) * (1 - clamp01((edge - 0.05) / 0.1))
    return 0.5 + value * 0.2 - rim * 0.05 + mortar * 0.12
}

// Packs soft rounded blobs into the tile. Each blob is a dome, lighter at its top edge,
// so the clumps read as small leaf masses.
function leafClumps(out) {
    const blobs = 115
    for (let i = 0; i < blobs; i += 1) {
        const cx = hash2(i, 1, SEED + 50) * SIZE
        const cy = hash2(i, 2, SEED + 50) * SIZE
        const radius = (0.04 + hash2(i, 3, SEED + 50) * 0.042) * SIZE
        const r = Math.ceil(radius)
        const inv = 1 / (radius * radius)
        for (let dy = -r; dy <= r; dy += 1) {
            const y = (Math.round(cy + dy) + SIZE) & (SIZE - 1)
            const tilt = 1 - 0.35 * (dy / radius)
            for (let dx = -r; dx <= r; dx += 1) {
                const d2 = (dx * dx + dy * dy) * inv
                if (d2 >= 1) continue
                const dome = Math.sqrt(1 - d2) * tilt
                const index = y * SIZE + ((Math.round(cx + dx) + SIZE) & (SIZE - 1))
                if (dome > out[index]) out[index] = dome
            }
        }
    }
}

const toByte = (value) => (value <= 0 ? 0 : value >= 1 ? 255 : (value * 255 + 0.5) | 0)

// Rows built per slice of work. One slice takes about 2 ms on a desktop.
const ROWS_PER_SLICE = 32

function buildRows(state, rows) {
    const { channels, sums } = state
    const [r, g, b, a] = channels
    const end = Math.min(SIZE, state.row + rows)
    for (let y = state.row; y < end; y += 1) {
        const v = y / SIZE
        for (let x = 0; x < SIZE; x += 1) {
            const u = x / SIZE
            const i = y * SIZE + x
            r[i] = wood(u, v)
            g[i] = mottle(u, v)
            b[i] = paving(u, v)
            a[i] = 0.36 + a[i] * 0.26
            sums[0] += r[i]
            sums[1] += g[i]
            sums[2] += b[i]
            sums[3] += a[i]
        }
    }
    state.row = end
}

// Each channel shifts so its mean sits on 0.5, so the detail never darkens a surface
// overall. Then the bytes go to the texture.
function writeBytes(state, texture) {
    const count = SIZE * SIZE
    const [r, g, b, a] = state.channels
    const shift = state.sums.map((sum) => 0.5 - sum / count)
    const data = texture.image.data
    for (let i = 0; i < count; i += 1) {
        data[i * 4] = toByte(r[i] + shift[0])
        data[i * 4 + 1] = toByte(g[i] + shift[1])
        data[i * 4 + 2] = toByte(b[i] + shift[2])
        data[i * 4 + 3] = toByte(a[i] + shift[3])
    }
    texture.needsUpdate = true
}

// Starts the build in small slices between frames, so it overlaps the aerie download and
// never blocks the page for more than a slice. finish() builds the rows that remain at
// once and returns the texture, so the aerie can always use it the moment it loads.
// Pass { sliced: false } to build it all at once.
export function createDetailTexture({ anisotropy = 1, sliced = true } = {}) {
    const count = SIZE * SIZE
    const texture = new THREE.DataTexture(new Uint8Array(count * 4), SIZE, SIZE, THREE.RGBAFormat, THREE.UnsignedByteType)
    texture.name = 'aerie.detail'
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = anisotropy
    texture.colorSpace = THREE.NoColorSpace

    const state = {
        channels: [new Float32Array(count), new Float32Array(count), new Float32Array(count), new Float32Array(count)],
        sums: [0, 0, 0, 0],
        row: 0,
        done: false,
        timer: null,
    }
    const finish = () => {
        if (state.timer !== null) clearTimeout(state.timer)
        state.timer = null
        if (!state.done) {
            buildRows(state, SIZE)
            writeBytes(state, texture)
            state.done = true
            state.channels = null
        }
        return texture
    }
    const slice = () => {
        state.timer = null
        if (state.done) return
        buildRows(state, ROWS_PER_SLICE)
        if (state.row >= SIZE) finish()
        else state.timer = setTimeout(slice, 0)
    }
    leafClumps(state.channels[3])
    if (sliced) state.timer = setTimeout(slice, 0)
    else finish()
    return { texture, finish }
}

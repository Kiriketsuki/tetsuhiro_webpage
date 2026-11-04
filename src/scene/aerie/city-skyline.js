import { GRID } from './city-map.js'

// The plan of the skyline: every tower as a stack of parts, each part one prism. The towers
// mix the shapes of the cities the plan draws on: plain slabs, New York setbacks with a
// spire, round Tokyo towers, tapered towers with a pointed cap, and twin towers. Two invented
// landmarks stand out of them. A lattice tower in warm orange stands by the river, between a
// Paris tower and a Tokyo tower. A tall round broadcast spindle with two lit rings stands at
// the edge of the big cluster, after a Tokyo sky tower. Both are built from the same soft
// parts as the towers round them, so neither reads as a sharp model in a field of lights.
// The towers stand where the overview frames of the desktop and the phone see them, never
// under the aerie, where they read as pillars that hold it up.

export const GROUND = -780

// A prism shape: its side count and its top width as a share of its bottom width.
export const SHAPES = {
    box: { sides: 4, taper: 1 },
    round: { sides: 12, taper: 1 },
    tapered: { sides: 4, taper: 0.62 },
    cap: { sides: 4, taper: 0 },
    roundCap: { sides: 12, taper: 0 },
    lattice: { sides: 4, taper: 0.5 },
    needle: { sides: 4, taper: 0.25 },
    spindle: { sides: 12, taper: 0.62 },
    mast: { sides: 12, taper: 0.25 },
}

// A part draws in one of three ways. A building has lit windows and a crown band on its top
// part. A light is a solid glow in its colour, for spires, decks and rings. A frame is a
// landmark structure: a dim glow in its colour, dense with lit points.
export const KIND = { building: 0, light: 1, frame: 2 }

// One cluster each: centre (world XZ), radius, tower count, the height range in metres, and
// true when the towers line up with the avenue grid. The count follows the towers share of
// the look, or its skyline share for the big cluster right of the aerie.
const CLUSTERS = [
    { at: [-420, -760], radius: 300, count: 24, height: [70, 240], grid: true },
    { at: [-1240, -1460], radius: 220, count: 10, height: [55, 180], grid: false },
    { at: [300, -1560], radius: 260, count: 9, height: [55, 160], grid: false },
    { at: [-1850, -900], radius: 200, count: 6, height: [45, 130], grid: false },
    { at: [-75, -3300], radius: 420, count: 16, height: [80, 250], grid: true },
    { at: [-200, -1380], radius: 300, count: 26, height: [90, 300], grid: true, skyline: true },
]
const COLOURS = {
    warm: [1.0, 0.72, 0.42],
    gold: [1.0, 0.6, 0.26],
    white: [0.9, 0.9, 0.98],
    cyan: [0.35, 0.9, 1.0],
    orange: [1.0, 0.42, 0.16],
    pearl: [0.86, 0.84, 1.0],
}

// The landmarks: a place, a colour and their parts from the ground up, each part a shape,
// a height, a bottom width (all in metres) and a kind. Each part starts where the last ends.
const LANDMARKS = [
    {
        at: [-1200, -450],
        colour: 'orange',
        parts: [
            ['lattice', 62, 72, 'frame'],
            ['box', 5, 40, 'light'],
            ['lattice', 72, 34, 'frame'],
            ['box', 6, 19, 'light'],
            ['needle', 70, 15, 'frame'],
            ['needle', 42, 4, 'light'],
        ],
    },
    {
        at: [0, -1700],
        colour: 'pearl',
        parts: [
            ['spindle', 330, 46, 'frame'],
            ['round', 22, 46, 'light'],
            ['spindle', 70, 24, 'frame'],
            ['round', 10, 26, 'light'],
            ['mast', 72, 9, 'frame'],
        ],
    },
]
// No tower stands closer than this to a landmark, so each landmark keeps a clear silhouette.
const LANDMARK_CLEAR = 140

// A small seeded random, so every load builds the same skyline.
function random(seed) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// The parts of one tower of height h and footprint w by d, in one of the five shapes.
function towerParts(rand, h, w, d) {
    const pick = rand()
    if (pick < 0.32) return [{ shape: 'box', y: 0, h, w, d, top: true }]
    if (pick < 0.56) {
        const parts = []
        let y = 0
        let s = 1
        const steps = 2 + Math.floor(rand() * 2)
        for (let i = 0; i < steps; i++) {
            const ph = (i === 0 ? 0.55 : 0.45 / (steps - 1)) * h
            parts.push({ shape: 'box', y, h: ph, w: w * s, d: d * s, top: i === steps - 1 })
            y += ph
            s *= 0.72
        }
        if (rand() < 0.6) parts.push({ shape: 'needle', y, h: 0.16 * h, w: 3, d: 3, kind: 'light' })
        return parts
    }
    if (pick < 0.72) {
        const r = Math.max(w, d)
        const parts = [{ shape: 'round', y: 0, h, w: r, d: r, top: true }]
        if (rand() < 0.5) parts.push({ shape: 'roundCap', y: h, h: 0.12 * r, w: r, d: r, top: true })
        return parts
    }
    if (pick < 0.88) {
        return [
            { shape: 'tapered', y: 0, h, w, d, top: true },
            { shape: 'cap', y: h, h: 0.5 * w * 0.62, w: w * 0.62, d: d * 0.62, top: true },
        ]
    }
    const gap = 0.35 * w
    return [-1, 1].map((side) => ({ shape: 'box', y: 0, h: h * (side < 0 ? 1 : 0.92), w: w * 0.45, d, top: true, dx: side * (gap / 2 + w * 0.225) }))
}

// Every part of the skyline as a plain record: shape, centre XZ, base height, size, turn,
// colour, lit share, kind, seed, and whether it carries the crown band. isOpen(x, z) is true
// on the water and the parks, where no tower stands.
export function planSkyline(look, isOpen) {
    const rand = random(20261103)
    const parts = []
    const gridTurn = Math.atan2(-GRID.y, GRID.x)
    const footprints = []
    for (const landmark of LANDMARKS) {
        let y = 0
        const colour = COLOURS[landmark.colour]
        for (const [shape, h, w, kind] of landmark.parts) {
            parts.push({ shape, x: landmark.at[0], z: landmark.at[1], y, h, w, d: w, turn: gridTurn, colour, lit: 0.75, kind: KIND[kind], seed: rand(), top: false })
            y += h
        }
    }
    for (const cluster of CLUSTERS) {
        const count = Math.round(cluster.count * (cluster.skyline ? look.skyline : look.towers))
        let placed = 0
        for (let attempt = 0; attempt < count * 12 && placed < count; attempt++) {
            const r = cluster.radius * Math.sqrt(rand())
            const a = rand() * Math.PI * 2
            const x = cluster.at[0] + r * Math.cos(a)
            const z = cluster.at[1] + r * Math.sin(a)
            const w = 16 + 20 * rand()
            const d = 16 + 20 * rand()
            const size = Math.max(w, d)
            if (isOpen(x, z)) continue
            if (LANDMARKS.some(({ at }) => Math.hypot(at[0] - x, at[1] - z) < LANDMARK_CLEAR)) continue
            if (footprints.some((f) => Math.hypot(f.x - x, f.z - z) < 0.62 * (f.size + size))) continue
            footprints.push({ x, z, size })
            const centre = 1 - r / cluster.radius
            const [h0, h1] = cluster.height
            const h = (h0 + (h1 - h0) * Math.pow(centre, 1.2) * (0.45 + 0.55 * rand())) * look.height
            const turn = gridTurn + (cluster.grid ? 0 : (rand() - 0.5) * 0.9)
            const colour = COLOURS[look.crowns[Math.floor(rand() * look.crowns.length)]]
            const lit = 0.22 + 0.3 * rand()
            const seed = rand()
            const cos = Math.cos(turn)
            const sin = Math.sin(turn)
            for (const part of towerParts(rand, h, w, d)) {
                const dx = part.dx ?? 0
                parts.push({ ...part, x: x + dx * cos, z: z - dx * sin, turn, colour, lit, seed, kind: KIND[part.kind ?? 'building'], top: Boolean(part.top) })
            }
            placed += 1
        }
    }
    return parts
}

import * as THREE from 'three'

// Plans a smooth camera path from one point to another through the free space of a
// clearance field (clearance.js). The path keeps CLEAR metres from every surface where it
// can. Close to its two ends it may come as close as the ends are, plus one metre for each
// metre away from them, so a shot that sits near a wall still starts and ends where it is.
//
// The old moves followed the walk splines of the story legs, so the camera traced the stair
// flights up the tower. A planned path ignores the stairs and flies one smooth curve.

// The clearance a path keeps where it can, and the least it accepts in the middle.
const CLEAR = 4
const PASS = 2
// The coarse grid for the search, in field cells. HASTE weighs the straight distance left in
// the search score above 1, so the search heads for the goal and visits far fewer nodes, for a
// way at most that much longer. The band smooths the way after.
const COARSE = 2
const HASTE = 2
// How much a coarse step costs per metre of missing clearance, on top of its length.
const CROWD_COST = 3
// The spacing of the relaxed path, and of the control points taken from it, in metres.
const SPACING = 1
const CONTROL = 5
// The elastic band: rounds of relaxation, the pull toward the neighbours (smoothness) and the
// push away from surfaces (clearance).
const ROUNDS = 160
const PULL = 0.5
const PUSH = 0.6
// The finest step for a clearance check along a segment, in metres.
const CHECK = 0.5
// An end closer than this to a surface, in metres, counts as inside it.
const BURIED = 0.6

// The clearance needed at `point` on a path from ends.a to ends.b: CLEAR (or `least` in the
// middle), eased down near each end to that end's own clearance, ends.from or ends.to.
function needAt(ends, point, least = CLEAR) {
    return Math.min(least, ends.from + point.distanceTo(ends.a), ends.to + point.distanceTo(ends.b))
}

// True if the straight segment a to b keeps the needed clearance.
function clearSegment(field, ends, a, b, least) {
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / CHECK))
    const p = new THREE.Vector3()
    for (let i = 0; i <= steps; i += 1) {
        p.lerpVectors(a, b, i / steps)
        if (field.at(p) < needAt(ends, p, least) - 0.05) return false
    }
    return true
}

// A binary heap of node indices ordered by score, on a typed array that grows as needed.
function heap(score) {
    let items = new Int32Array(1024)
    let size = 0
    const less = (i, j) => score[items[i]] < score[items[j]]
    const swap = (i, j) => {
        const t = items[i]
        items[i] = items[j]
        items[j] = t
    }
    return {
        get size() {
            return size
        },
        push(node) {
            if (size === items.length) {
                const grown = new Int32Array(size * 2)
                grown.set(items)
                items = grown
            }
            items[size] = node
            let i = size
            size += 1
            while (i > 0) {
                const up = (i - 1) >> 1
                if (!less(i, up)) break
                swap(i, up)
                i = up
            }
        },
        pop() {
            const top = items[0]
            size -= 1
            items[0] = items[size]
            let i = 0
            for (;;) {
                const l = 2 * i + 1
                const r = l + 1
                let low = i
                if (l < size && less(l, low)) low = l
                if (r < size && less(r, low)) low = r
                if (low === i) break
                swap(i, low)
                i = low
            }
            return top
        },
    }
}

// The 26 neighbour offsets of a grid cell, and their lengths in cells.
const NEIGHBOURS = []
for (let n = 0; n < 27; n += 1) {
    const offset = [(n % 3) - 1, (Math.floor(n / 3) % 3) - 1, Math.floor(n / 9) - 1]
    if (n !== 13) NEIGHBOURS.push({ offset, length: Math.hypot(...offset) })
}

// A* on a coarse grid over the field, from a to b. Returns the centres of the cells on the
// way, without the two ends, or null when no way exists. It works in whole cells and reads
// the field once a node, so a plan across the island takes a few milliseconds.
function search(field, ends, a, b) {
    const step = field.cell * COARSE
    const [nx, ny, nz] = field.size.map((n) => Math.ceil(n / COARSE))
    const count = nx * ny * nz
    const { origin } = field
    const cellOf = (p) => [p.x - origin.x, p.y - origin.y, p.z - origin.z].map((v, axis) => THREE.MathUtils.clamp(Math.floor(v / step), 0, [nx, ny, nz][axis] - 1))
    const centre = (i, j, k, target) => target.set((i + 0.5) * step + origin.x, (j + 0.5) * step + origin.y, (k + 0.5) * step + origin.z)
    const [si, sj, sk] = cellOf(a)
    const [gi, gj, gk] = cellOf(b)
    const start = si + nx * (sj + ny * sk)
    const goal = gi + nx * (gj + ny * gk)
    const cost = new Float32Array(count).fill(Infinity)
    const score = new Float32Array(count).fill(Infinity)
    const from = new Int32Array(count).fill(-1)
    const done = new Uint8Array(count)
    // Whether a node is open to the path, and its cost per metre: 0 unread, -1 shut.
    const toll = new Float32Array(count)
    const q = new THREE.Vector3()
    const left = (i, j, k) => step * HASTE * Math.hypot(i - gi, j - gj, k - gk)
    cost[start] = 0
    score[start] = left(si, sj, sk)
    const open = heap(score)
    open.push(start)
    while (open.size) {
        const node = open.pop()
        if (node === goal) break
        if (done[node]) continue
        done[node] = 1
        const i = node % nx
        const j = Math.floor(node / nx) % ny
        const k = Math.floor(node / (nx * ny))
        for (const { offset, length } of NEIGHBOURS) {
            const x = i + offset[0]
            const y = j + offset[1]
            const z = k + offset[2]
            if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue
            const next = x + nx * (y + ny * z)
            if (done[next]) continue
            if (toll[next] === 0) {
                centre(x, y, z, q)
                const room = field.at(q)
                toll[next] = room < needAt(ends, q, PASS) && next !== goal ? -1 : 1 + CROWD_COST * Math.max(0, CLEAR - room)
            }
            if (toll[next] < 0) continue
            const total = cost[node] + length * step * toll[next]
            if (total >= cost[next]) continue
            cost[next] = total
            from[next] = node
            score[next] = total + left(x, y, z)
            open.push(next)
        }
    }
    if (from[goal] === -1 && goal !== start) return null
    const way = []
    for (let node = from[goal]; node !== -1 && node !== start; node = from[node]) way.unshift(centre(node % nx, Math.floor(node / nx) % ny, Math.floor(node / (nx * ny)), new THREE.Vector3()))
    return way
}

// Drops every point that a straight segment with the needed clearance can skip.
function shortcut(field, ends, points) {
    const kept = [points[0]]
    let i = 0
    while (i < points.length - 1) {
        let j = points.length - 1
        while (j > i + 1 && !clearSegment(field, ends, points[i], points[j], PASS)) j -= 1
        kept.push(points[j])
        i = j
    }
    return kept
}

// Points every `spacing` metres along a polyline, the two ends included.
function resample(points, spacing) {
    const lengths = [0]
    for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]))
    const total = lengths.at(-1)
    const count = Math.max(1, Math.round(total / spacing))
    const out = []
    let segment = 0
    for (let n = 0; n <= count; n += 1) {
        const s = (total * n) / count
        while (segment < points.length - 2 && lengths[segment + 1] < s) segment += 1
        const span = lengths[segment + 1] - lengths[segment]
        out.push(points[segment].clone().lerp(points[segment + 1], span > 0 ? (s - lengths[segment]) / span : 0))
    }
    return out
}

// Relaxes a polyline as an elastic band: each inside point moves toward the middle of its
// neighbours, and out of any surface it is closer to than it needs. The ends stay put.
function relax(field, ends, points) {
    let band = points.map((p) => p.clone())
    const push = new THREE.Vector3()
    const pull = new THREE.Vector3()
    for (let round = 0; round < ROUNDS; round += 1) {
        band = band.map((p, i) => {
            if (i === 0 || i === band.length - 1) return p
            pull.addVectors(band[i - 1], band[i + 1]).multiplyScalar(0.5).sub(p)
            const short = needAt(ends, p) - field.at(p)
            if (short > 0) field.gradient(p, push).normalize().multiplyScalar(short)
            else push.set(0, 0, 0)
            return p.clone().addScaledVector(pull, PULL).addScaledVector(push, PUSH)
        })
        if (round % 40 === 39) band = resample(band, SPACING)
    }
    return band
}

// The control points of a smooth path from a to b, the two ends included.
export function planPath(field, a, b) {
    const ends = { a, b, from: Math.max(0, field.at(a)), to: Math.max(0, field.at(b)) }
    // An end inside a surface cell, such as the eyepiece in the telescope, has no free way to
    // it, and the search would visit the whole grid before it gave up.
    if (Math.min(ends.from, ends.to) < BURIED || clearSegment(field, ends, a, b)) return [a.clone(), b.clone()]
    const way = search(field, ends, a, b)
    if (!way) return [a.clone(), b.clone()]
    const rough = shortcut(field, ends, [a.clone(), ...way, b.clone()])
    const band = relax(field, ends, resample(rough, SPACING))
    const keep = Math.max(1, Math.round(CONTROL / SPACING))
    return band.filter((_, i) => i === band.length - 1 || (i % keep === 0 && band.length - 1 - i >= keep / 2))
}

const keyOf = (a, b) => [a, b].map((p) => p.toArray().map((v) => v.toFixed(2)).join(',')).join('|')

// The plan from a to b, from the plans made ahead (warmPlans) or made now. A plan takes up
// to 30 ms on a desktop and 120 ms on a slow phone, so a move from rest reads it ahead.
export function plannedPath(field, a, b) {
    const key = keyOf(a, b)
    if (!field.plans.has(key)) field.plans.set(key, planPath(field, a, b))
    return field.plans.get(key).map((p) => p.clone())
}

// Plans the flights between every two of `points`, one plan a task, after the field builds.
export async function warmPlans(field, points) {
    for (const a of points) {
        for (const b of points) {
            if (a.distanceTo(b) < 1e-3) continue
            plannedPath(field, a, b)
            await new Promise((resolve) => setTimeout(resolve, 0))
        }
    }
}

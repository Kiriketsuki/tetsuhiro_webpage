import * as THREE from 'three'
import { SURFACE } from './toon-material.js'

// Turns the crown and planting meshes into soft rounded masses.
//
// The GLB builds each tree crown from a few dozen round lumps, with thousands of small
// diamond leaf quads stuck on them. Shaded one by one, the lumps read as separate faceted
// balls and the diamonds as flat cut paper. This module groups the lumps of one tree into
// one crown, gives every vertex a bent normal that points out from the crown centre, so
// the whole crown shades as one blob, and lifts the diamonds out of the mesh. It also
// shrinks each lump a little toward its own centre and keeps the full-size surface in
// userData. leaf-cards.js covers that full-size surface with leaf cards, so the leaves,
// not the faceted lumps, make the outline of the crown.
//
// The geometry is non-indexed after soft-normals.js, so triangles join where their corners
// share a position.

// A part with at most this many triangles is a diamond leaf quad, not a lump.
const LEAF_TRIANGLES = 4
// Two lumps belong to one tree when their gap is under this share of their summed radii.
const LINK = 1.15
// Each lump shrinks to this share of its size, under its cover of leaf cards. Round 7 shrinks
// it further, so the smaller cards still hide the faceted lump outline.
// Round 8 shrinks the lumps less, because the rounded lumps now carry the crown mass.
// Round 11 shrinks the lumps a little more, so the leaf cards cover their straight edges at the
// crown outline.
// Round 13 shrinks them again, because the straight lump edges still cut the crown outline in S5.
// Round 14 moves the lumps whole (see moves in shapeTreeCrowns), so they keep their round
// form. A lump near the crown rim shrinks to LUMP_SHRINK[0], so the cards hide its edges, and a
// lump deep in the crown keeps LUMP_SHRINK[1] of its size, so it fills the holes between the
// outer lumps. The share eases between the two over LUMP_DEPTH of crown depth.
const LUMP_SHRINK = [0.25, 0.82]
const LUMP_DEPTH = [0.1, 0.4]
// A planting part lower than TUFT_HEIGHT metres is a grass tuft, not a shrub.
const TUFT_HEIGHT = 0.45
// A planting mass wider than MAX_SPAN, where shrubs touch, splits into CLUSTER metre cells.
const MAX_SPAN = 7
const CLUSTER = 2.5
const KEY_SCALE = 1000
// Each tree leans to its own band of the crown palette, as the trees of Leaf it Alone do:
// one rust-orange, one amber, one gold. The shift moves the whole tree along the palette
// (autumn.js crownColor). Trees take the shifts in turn, sorted by their position, so the
// order does not change from one load to the next.
// Round 8 lifts the low shifts. The rust shift made the left crown in S1 read crimson.
// Round 9 sets the first tree well down the band, so it reads mostly rust and amber, and
// keeps one gold tree. The round 8 trees all read gold-yellow.
// Round 10 spreads the shifts wider, so one tree reads rust-red and one reads gold. The round 9
// crowns all read one orange.
// Round 11 spreads them again, because the S6 trees still read as one orange.
// Round 12 spreads them once more, with the shader ramp now neutral in the middle, so one tree
// reads rust, one amber-orange and one gold-yellow in every wide shot.
// Round 18 lifts the rust tree a little and turns the last tree from orange to amber-gold, so
// the big rust crown in S1 shows amber tips and gold reads beside the rust in every wide shot.
const TREE_SHIFTS = [-0.26, 0.4, 0.1, 0.5, 0.22]
// The number of shrub tones in autumn.js PLANTS, and the reach in metres within which two
// shrubs count as neighbours and take different tones.
const PLANT_VARIANTS = 4
const PLANT_NEIGHBOUR = 4
// Each lump moves this share of the way out to the shell of its crown ellipsoid, at
// ROUND_SHELL of the ellipsoid radius. The GLB stacks the lumps of a crown in flat tiers with
// gaps of sky between them, and the review read the crowns as stacked cut-paper slabs. Pulled
// toward one shared shell, the lumps close the gaps and the crown reads as one rounded mass.
// Round 20 pulls them further, so the separate lobes of one crown merge into one rounded mass
// (S1, S5).
const ROUND_PULL = 0.92
const ROUND_SHELL = 0.9

function find(parent, i) {
    let root = i
    while (parent[root] !== root) root = parent[root]
    while (parent[i] !== root) {
        const next = parent[i]
        parent[i] = root
        i = next
    }
    return root
}

// Returns the connected parts, each with its triangles, bounding box and centre.
// palette.js also reads it, to find each laid stone.
//
// This runs in the look worker on every mesh, so it avoids per-vertex allocation. A position
// that is not interleaved, not normalized and has three components reads straight from its
// array. Any other layout copies through getX, getY and getZ first, so both paths see the
// same numbers. The corner keys sit in three Float64 arrays and an open-addressing table
// finds the first corner at the same key. The table compares the Float64 keys, not the
// hash, so a hash clash never merges two parts. A key with a NaN coordinate merges with
// nothing. The old string key merged NaN keys, but the GLB has no NaN coordinate.
export function connectedParts(position) {
    const count = position.count
    const triangles = count / 3
    const src = readPositions(position)
    const parent = new Int32Array(triangles)
    for (let t = 0; t < triangles; t += 1) parent[t] = t
    const kx = new Float64Array(count)
    const ky = new Float64Array(count)
    const kz = new Float64Array(count)
    let size = 2
    while (size < count * 2) size *= 2
    const mask = size - 1
    const slots = new Int32Array(size).fill(-1)
    for (let v = 0; v < count; v += 1) {
        const x = Math.round(src[v * 3] * KEY_SCALE)
        const y = Math.round(src[v * 3 + 1] * KEY_SCALE)
        const z = Math.round(src[v * 3 + 2] * KEY_SCALE)
        kx[v] = x
        ky[v] = y
        kz[v] = z
        let h = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(z | 0, 83492791)
        h = (h ^ (h >>> 15)) & mask
        for (;;) {
            const other = slots[h]
            if (other < 0) {
                slots[h] = v
                break
            }
            if (kx[other] === x && ky[other] === y && kz[other] === z) {
                parent[find(parent, (v / 3) | 0)] = find(parent, (other / 3) | 0)
                break
            }
            h = (h + 1) & mask
        }
    }
    // A group takes its number in first-seen triangle order, as the old Map took its insertion order.
    const groupOf = new Int32Array(triangles).fill(-1)
    const groups = []
    for (let t = 0; t < triangles; t += 1) {
        const root = find(parent, t)
        let g = groupOf[root]
        if (g < 0) {
            g = groups.length
            groupOf[root] = g
            groups.push({ triangles: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })
        }
        const group = groups[g]
        group.triangles.push(t)
        for (let k = 0; k < 3; k += 1) {
            const i = (t * 3 + k) * 3
            // Math.min and Math.max, as Box3 uses, are required here. A < or > test keeps the
            // first zero it meets, and the sign of that zero flows on into the crown centres.
            for (let a = 0; a < 3; a += 1) {
                group.min[a] = Math.min(group.min[a], src[i + a])
                group.max[a] = Math.max(group.max[a], src[i + a])
            }
        }
    }
    // Each part gets its own Box3 and Vector3 objects, because callers move the centre.
    return groups.map(({ triangles: members, min, max }) => {
        const box = new THREE.Box3(new THREE.Vector3(min[0], min[1], min[2]), new THREE.Vector3(max[0], max[1], max[2]))
        return {
            box,
            triangles: members,
            centre: box.getCenter(new THREE.Vector3()),
            radius: box.getSize(new THREE.Vector3()).length() * 0.5,
        }
    })
}

// The position values as one flat x, y, z array. A plain three-component attribute gives its
// own array, which this module only reads. Another layout copies through the getters.
function readPositions(position) {
    if (!position.isInterleavedBufferAttribute && !position.normalized && position.itemSize === 3) return position.array
    const out = new Float64Array(position.count * 3)
    for (let v = 0; v < position.count; v += 1) {
        out[v * 3] = position.getX(v)
        out[v * 3 + 1] = position.getY(v)
        out[v * 3 + 2] = position.getZ(v)
    }
    return out
}

// Joins lumps that touch or overlap into trees. Returns one tree id per lump.
function linkLumps(lumps) {
    const parent = Int32Array.from({ length: lumps.length }, (_, i) => i)
    for (let i = 0; i < lumps.length; i += 1) {
        for (let j = i + 1; j < lumps.length; j += 1) {
            const reach = (lumps[i].radius + lumps[j].radius) * LINK
            if (lumps[i].centre.distanceToSquared(lumps[j].centre) < reach * reach) parent[find(parent, i)] = find(parent, j)
        }
    }
    return lumps.map((_, i) => find(parent, i))
}

function nearestLump(lumps, point) {
    const { x, y, z } = point
    let best = 0
    let bestDistance = Infinity
    for (let i = 0; i < lumps.length; i += 1) {
        const centre = lumps[i].centre
        const dx = centre.x - x
        const dy = centre.y - y
        const dz = centre.z - z
        // The lump centre is the minuend and the sum keeps its order, so each distance equals
        // Vector3.distanceToSquared. The strict test keeps the first lump on a tie.
        const d = dx * dx + dy * dy + dz * dz
        if (d < bestDistance) {
            bestDistance = d
            best = i
        }
    }
    return best
}

// A crown as an ellipsoid: its centre sits a little low, so the upper faces turn up toward
// the sky, and the bent normal is the ellipsoid normal at each point.
function crownShape(box) {
    const centre = box.getCenter(new THREE.Vector3())
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(new THREE.Vector3(0.2, 0.2, 0.2))
    centre.y -= half.y * 0.25
    const span = Math.max(box.max.y - box.min.y, 1e-3)
    const scratch = new THREE.Vector3()
    return {
        centre,
        half,
        // Moves p a share of the way to the crown shell, along the line from the centre.
        round: (p) => {
            const length = scratch.copy(p).sub(centre).divide(half).length()
            if (length < 1e-3) return p
            return p.lerp(scratch.copy(p).sub(centre).multiplyScalar(ROUND_SHELL / length).add(centre), ROUND_PULL)
        },
        height: (p) => (p.y - box.min.y) / span,
        depth: (p) => 1 - Math.min(1, scratch.copy(p).sub(centre).divide(half).length()),
        bent: (p, out) => {
            out.copy(p).sub(centre).divide(half).divide(half)
            if (out.lengthSq() < 1e-10) out.set(0, 1, 0)
            return out.normalize()
        },
    }
}

// Moves each lump toward its own centre, in the order keepTriangles wrote the lumps.
// shrinks holds one share per lump.
function shrinkLumps(position, lumps, shrinks) {
    const p = new THREE.Vector3()
    let v = 0
    lumps.forEach((lump, i) => {
        const end = v + lump.triangles.length * 3
        for (; v < end; v += 1) {
            p.fromBufferAttribute(position, v).sub(lump.centre).multiplyScalar(shrinks[i]).add(lump.centre)
            position.setXYZ(v, p.x, p.y, p.z)
        }
    })
    position.needsUpdate = true
}

// Keeps only the listed triangles of a non-indexed geometry.
function keepTriangles(geometry, triangles) {
    const out = new THREE.BufferGeometry()
    Object.entries(geometry.attributes).forEach(([name, attribute]) => {
        const size = attribute.itemSize
        const array = new attribute.array.constructor(triangles.length * 3 * size)
        triangles.forEach((t, i) => {
            array.set(attribute.array.subarray(t * 3 * size, (t * 3 + 3) * size), i * 3 * size)
        })
        out.setAttribute(name, new THREE.BufferAttribute(array, size, attribute.normalized))
    })
    return out
}

// The tree crowns. Writes mesh.userData.crownHeight (0 at the base of the crown, 1 at its
// top) and crownDepth (0 at the rim, 1 at the centre) per vertex, and crownLeaves: one
// entry per diamond leaf quad, in world space, for leaf-cards.js. The mesh loses its
// diamonds and its normals become bent normals.
function shapeTreeCrowns(mesh) {
    const geometry = mesh.geometry
    const position = geometry.attributes.position
    const all = connectedParts(position)
    const lumps = all.filter((part) => part.triangles.length > LEAF_TRIANGLES)
    const leaves = all.filter((part) => part.triangles.length <= LEAF_TRIANGLES)
    if (!lumps.length) return
    const treeOf = linkLumps(lumps)
    const boxes = new Map()
    lumps.forEach((lump, i) => {
        const box = boxes.get(treeOf[i]) ?? new THREE.Box3()
        boxes.set(treeOf[i], box.union(lump.box))
    })
    const leafTree = leaves.map((leaf) => treeOf[nearestLump(lumps, leaf.centre)])
    leaves.forEach((leaf, i) => boxes.get(leafTree[i]).union(leaf.box))
    const shapes = new Map([...boxes].map(([id, box]) => [id, crownShape(box)]))
    const order = [...boxes].sort(([, a], [, b]) => a.min.x + a.min.z * 0.37 - (b.min.x + b.min.z * 0.37)).map(([id]) => id)
    const shiftOf = new Map(order.map((id, i) => [id, TREE_SHIFTS[i % TREE_SHIFTS.length]]))

    const kept = lumps.flatMap((lump) => lump.triangles)
    const owner = new Int32Array(position.count / 3)
    const lumpOf = new Int32Array(position.count / 3)
    lumps.forEach((lump, i) =>
        lump.triangles.forEach((t) => {
            owner[t] = treeOf[i]
            lumpOf[t] = i
        })
    )
    // Round 14 moves each lump as one piece toward the crown shell. The earlier pull moved every
    // vertex toward the shell on its own line from the centre, which pressed each round lump
    // flat onto the shell, and the crowns read as flat polygon panels with holes between them
    // (S5). A lump moved whole keeps its round form, and the round lumps overlap and close the
    // gaps.
    const moves = lumps.map((lump, i) => shapes.get(treeOf[i]).round(lump.centre.clone()).sub(lump.centre))
    const trimmed = keepTriangles(geometry, kept)
    const count = trimmed.attributes.position.count
    const height = new Float32Array(count)
    const depth = new Float32Array(count)
    const shift = new Float32Array(count)
    const centres = new Float32Array(count * 3)
    const halves = new Float32Array(count * 3)
    const normal = new Float32Array(count * 3)
    const p = new THREE.Vector3()
    const n = new THREE.Vector3()
    kept.forEach((t, i) => {
        const shape = shapes.get(owner[t])
        for (let k = 0; k < 3; k += 1) {
            const v = i * 3 + k
            p.fromBufferAttribute(trimmed.attributes.position, v).add(moves[lumpOf[t]])
            trimmed.attributes.position.setXYZ(v, p.x, p.y, p.z)
            height[v] = shape.height(p)
            depth[v] = shape.depth(p)
            shift[v] = shiftOf.get(owner[t])
            shape.centre.toArray(centres, v * 3)
            shape.half.toArray(halves, v * 3)
            // Round 11 shades each lump with the line from the crown centre, as the leaf cards
            // are (leaf-cards.js). The ellipsoid normal lit the lumps a step brighter than the
            // cards beside them, and the crown read as flat patches of two tones.
            n.copy(p).sub(shape.centre).normalize().toArray(normal, v * 3)
        }
    })
    trimmed.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
    trimmed.setAttribute('flatNormal', new THREE.BufferAttribute(normal.slice(), 3))
    mesh.userData.crownSurface = trimmed.attributes.position.array.slice()
    // The lump centres move with their lumps, so each lump still shrinks about its own middle.
    lumps.forEach((lump, i) => lump.centre.add(moves[i]))
    const shrinks = lumps.map((lump, i) =>
        THREE.MathUtils.lerp(LUMP_SHRINK[0], LUMP_SHRINK[1], THREE.MathUtils.smoothstep(shapes.get(treeOf[i]).depth(lump.centre), LUMP_DEPTH[0], LUMP_DEPTH[1]))
    )
    shrinkLumps(trimmed.attributes.position, lumps, shrinks)
    geometry.dispose()
    mesh.geometry = trimmed

    // Each leaf card keeps the size and the facing of its diamond, and the bent normal and
    // the place in the crown of the point where it sits.
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    mesh.userData.crownLeaves = leaves.map((leaf, i) => {
        const shape = shapes.get(leafTree[i])
        const t = leaf.triangles[0]
        a.fromBufferAttribute(position, t * 3)
        b.fromBufferAttribute(position, t * 3 + 1)
        c.fromBufferAttribute(position, t * 3 + 2)
        const face = b.sub(a).cross(c.sub(a)).normalize()
        const bent = shape.bent(leaf.centre, new THREE.Vector3())
        if (face.dot(bent) < 0) face.negate()
        return {
            position: leaf.centre.clone().applyMatrix4(mesh.matrixWorld),
            facing: face.applyMatrix3(normalMatrix).normalize(),
            bent: bent.applyMatrix3(normalMatrix).normalize(),
            size: leaf.box.getSize(a).length(),
            height: shape.height(leaf.centre),
            depth: shape.depth(leaf.centre),
        }
    })
    mesh.userData.crownHeight = height
    mesh.userData.crownDepth = depth
    mesh.userData.crownShift = shift
    // The crown centre per vertex, in mesh space. leaf-cards.js shades each card with the
    // line from this centre, so the light runs across all the cards of a crown as one field.
    mesh.userData.crownCentre = centres
    // The half size of the crown per vertex, in mesh space. leaf-cards.js pulls the cards onto
    // one crown shell with it and shades them with one sphere.
    mesh.userData.crownHalf = halves
    // One entry per tree, in world space: the crown centre and its half size. leaf-piles.js
    // heaps the leaf piles round the foot of each tree.
    mesh.userData.crownTrees = [...boxes.values()].map((box) => ({
        centre: box.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),
        radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5,
    }))
}

// The planting: each shrub mass gets its crown height, so it can darken toward its base.
// Low parts are grass tufts. userData.plantTuft marks their vertices, so autumn.js can
// paint them as lawn, not as dark shrub.
function shapePlanting(mesh) {
    const position = mesh.geometry.attributes.position
    const height = new Float32Array(position.count)
    const tuft = new Uint8Array(position.count)
    const p = new THREE.Vector3()
    const masses = connectedParts(position).flatMap((part) => {
        const size = part.box.getSize(p)
        if (Math.max(size.x, size.z) <= MAX_SPAN) return [part]
        const cells = new Map()
        part.triangles.forEach((t) => {
            p.fromBufferAttribute(position, t * 3)
            const key = `${Math.floor(p.x / CLUSTER)},${Math.floor(p.z / CLUSTER)}`
            const cell = cells.get(key) ?? { box: new THREE.Box3(), triangles: [] }
            for (let k = 0; k < 3; k += 1) cell.box.expandByPoint(p.fromBufferAttribute(position, t * 3 + k))
            cell.triangles.push(t)
            cells.set(key, cell)
        })
        return [...cells.values()]
    })
    const variant = new Uint8Array(position.count)
    const placed = []
    // Round 19 bends the normals of each shrub out from the middle of its mass, as the tree
    // crowns do, so a shrub shades as one soft mass from a lit top to a darker base. The facet
    // normals of the shrub lumps drew a camouflage spot pattern (S5, S9, S2 phone).
    const normals = ['normal', 'flatNormal'].map((name) => mesh.geometry.attributes[name]).filter(Boolean)
    const half = new THREE.Vector3()
    const out = new THREE.Vector3()
    masses.forEach(({ box, triangles }, index) => {
        const span = Math.max(box.max.y - box.min.y, 1e-3)
        const low = span < TUFT_HEIGHT ? 1 : 0
        // Each shrub takes the first tone, counted from its own place in the list, that no
        // shrub within PLANT_NEIGHBOUR metres already holds.
        const centre = box.getCenter(new THREE.Vector3())
        const taken = new Set(placed.filter((other) => other.centre.distanceTo(centre) < PLANT_NEIGHBOUR).map((other) => other.tone))
        let tone = index % PLANT_VARIANTS
        for (let k = 0; k < PLANT_VARIANTS && taken.has(tone); k += 1) tone = (tone + 1) % PLANT_VARIANTS
        if (!low) placed.push({ centre, tone })
        box.getSize(half).multiplyScalar(0.5).max(new THREE.Vector3(0.05, 0.05, 0.05))
        triangles.forEach((t) => {
            for (let k = 0; k < 3; k += 1) {
                const v = t * 3 + k
                height[v] = (p.fromBufferAttribute(position, v).y - box.min.y) / span
                if (!low) {
                    out.subVectors(p, centre).divide(half).divide(half).normalize()
                    normals.forEach((attribute) => attribute.setXYZ(v, out.x, out.y, out.z))
                }
                tuft[v] = low
                variant[v] = tone
            }
        })
    })
    mesh.userData.crownHeight = height
    mesh.userData.plantTuft = tuft
    mesh.userData.plantVariant = variant
    // A tuft shades with an upward normal and takes the lawn family, as the lawn under it
    // does. Its thin upright blades would otherwise turn their dark side to the moon and
    // read as dark specks.
    const geometry = mesh.geometry
    const surface = geometry.attributes.aSurface
    if (surface) {
        for (let v = 0; v < tuft.length; v += 1) if (tuft[v]) surface.setX(v, SURFACE.lawn)
        surface.needsUpdate = true
    }
    ;['normal', 'flatNormal'].forEach((name) => {
        const attribute = geometry.attributes[name]
        if (!attribute) return
        for (let v = 0; v < tuft.length; v += 1) if (tuft[v]) attribute.setXYZ(v, 0, 1, 0)
        attribute.needsUpdate = true
    })
}

// bend: true for the tree crowns, false for the planting.
export function shapeCrowns(mesh, { bend = false } = {}) {
    if (bend) shapeTreeCrowns(mesh)
    else shapePlanting(mesh)
}

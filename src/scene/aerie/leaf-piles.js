import * as THREE from 'three'
import { noise3 } from './field-noise.js'
import { SURFACE } from './toon-material.js'

// Leaf piles round the foot of each tree, after the raked heaps of Leaf it Alone. A pile is
// a low soft mound in the lawn family with a full litter amount, so the toon shader paints
// the leaf carpet over it (leaf-carpet.js), with its folded leaves and contact shadows. The
// mound turns its top to the sky and its sides away, so the pile reads as a heap with depth
// and not as flat decals on the grass. leaf-cards.js then drops loose leaf cards on top.
//
// The piles take the shared opaque island material, so they add one draw and no program.

// Piles per tree, and how far from the trunk, as a share of the crown radius.
const PER_TREE = 3
const REACH = [0.3, 0.75]
// The pile size in metres: radius and height.
const RADIUS = [0.55, 0.95]
const HEIGHT = [0.16, 0.28]
// The base sinks this far into the lawn, so the pile grows out of it with no visible edge.
const SINK = 0.06
const SEGMENTS = 14
const RINGS = 4
// The litter amount on a pile: above every leaf rank, so the carpet covers it fully.
const PILE_LITTER = 1.6
// A pile only goes where the lawn is near flat and where the litter field shows a crown.
const FLAT = 0.85
const UNDER = 0.55
// Piles keep this far apart and this far from the trunk, in metres.
const SPACING = 1.1
const TRUNK_CLEAR = 0.65
// The ground between the leaves of a pile: the dark umber of the carpet gaps.
const UMBER = new THREE.Color(0x3a2a18)

function mulberry32(seed) {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// The mound height at a share f of its radius, 0 at the centre and 1 at the rim.
const profile = (f) => Math.pow(Math.max(0, 1 - f * f), 1.4)

// One mound as a list of triangles, each a list of three { p, n } corners in world space.
function mound(centre, radius, height, seed) {
    const point = (ring, segment) => {
        const f = ring / RINGS
        const a = (segment / SEGMENTS) * Math.PI * 2
        const wobble = 1 + 0.18 * (noise3(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3, seed * 0.7) - 0.5)
        const r = radius * f * wobble
        const y = height * profile(f) * (1 + 0.2 * (noise3(Math.cos(a) * 2.1, Math.sin(a) * 2.1 + seed, f) - 0.5)) - SINK * f
        // The slope of the profile gives the smooth normal, so the light rolls over the heap.
        const slope = (height / radius) * 2.8 * f * Math.pow(Math.max(0, 1 - f * f), 0.4)
        return {
            p: new THREE.Vector3(centre.x + Math.cos(a) * r, centre.y + y, centre.z + Math.sin(a) * r),
            n: new THREE.Vector3(Math.cos(a) * slope, 1, Math.sin(a) * slope).normalize(),
        }
    }
    const triangles = []
    for (let ring = 0; ring < RINGS; ring += 1) {
        for (let segment = 0; segment < SEGMENTS; segment += 1) {
            const a = point(ring, segment)
            const b = point(ring + 1, segment)
            const c = point(ring + 1, segment + 1)
            const d = point(ring, segment + 1)
            if (ring > 0) triangles.push([a, c, b], [a, d, c])
            else triangles.push([a, c, b])
        }
    }
    return triangles
}

function geometryOf(triangles) {
    const count = triangles.length * 3
    const position = new Float32Array(count * 3)
    const normal = new Float32Array(count * 3)
    const flat = new Float32Array(count * 3)
    const color = new Float32Array(count * 3)
    const e1 = new THREE.Vector3()
    const e2 = new THREE.Vector3()
    triangles.forEach((corners, t) => {
        e1.subVectors(corners[1].p, corners[0].p)
        e2.subVectors(corners[2].p, corners[0].p)
        const face = new THREE.Vector3().crossVectors(e1, e2).normalize()
        if (face.y < 0) face.negate()
        corners.forEach(({ p, n }, k) => {
            const v = t * 3 + k
            p.toArray(position, v * 3)
            n.toArray(normal, v * 3)
            face.toArray(flat, v * 3)
            UMBER.toArray(color, v * 3)
        })
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
    geometry.setAttribute('flatNormal', new THREE.BufferAttribute(flat, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3))
    geometry.setAttribute('aSurface', new THREE.Uint8BufferAttribute(new Uint8Array(count).fill(SURFACE.lawn), 1))
    geometry.setAttribute('aLitter', new THREE.BufferAttribute(new Float32Array(count).fill(PILE_LITTER), 1))
    geometry.setAttribute('aoBake', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    return geometry
}

// meshes: the island meshes after island-look.js has tagged them. litterAt: the litter field
// from autumn.js. blocked(x, z): true on the path, the water and the pad (leaf-cards.js).
// Returns the pile mesh, or null when no tree has room for a pile.
export function createLeafPiles({ meshes, material, litterAt, blocked, seed = 2207 }) {
    const random = mulberry32(seed)
    const trees = meshes.flatMap((mesh) => mesh.userData.crownTrees ?? [])
    const solid = meshes.filter((mesh) => mesh.material === material)
    const raycaster = new THREE.Raycaster()
    const down = new THREE.Vector3(0, -1, 0)
    const placed = []
    const triangles = []
    trees.forEach((tree) => {
        let made = 0
        for (let tries = 0; made < PER_TREE && tries < PER_TREE * 8; tries += 1) {
            const angle = random() * Math.PI * 2
            const reach = Math.max(TRUNK_CLEAR, tree.radius * THREE.MathUtils.lerp(REACH[0], REACH[1], random()))
            const x = tree.centre.x + Math.cos(angle) * reach
            const z = tree.centre.z + Math.sin(angle) * reach
            if (blocked(x, z) || litterAt(x, z) < UNDER) continue
            if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < SPACING)) continue
            raycaster.set(new THREE.Vector3(x, tree.centre.y + 2, z), down)
            const hit = raycaster.intersectObjects(solid, false).find((h) => h.object.userData.webMaterial !== 'web_crown')
            // The first surface under the crown must be the lawn itself, near flat, and not a
            // trunk, a deck or a roof.
            if (!hit || hit.object.userData.webMaterial !== 'web_grass') continue
            const normal = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld)
            if (!normal || Math.abs(normal.y) < FLAT) continue
            const radius = THREE.MathUtils.lerp(RADIUS[0], RADIUS[1], random())
            const height = THREE.MathUtils.lerp(HEIGHT[0], HEIGHT[1], random())
            triangles.push(...mound(hit.point, radius, height, random() * 50))
            placed.push(hit.point)
            made += 1
        }
    })
    if (!triangles.length) return null
    const mesh = new THREE.Mesh(geometryOf(triangles), material)
    mesh.name = 'LeafPiles'
    mesh.userData.webMaterial = 'web_grass'
    mesh.userData.piles = placed.length
    return mesh
}

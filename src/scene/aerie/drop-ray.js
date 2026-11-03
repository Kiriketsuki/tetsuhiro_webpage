import * as THREE from 'three'

// Rays cast at a fixed set of meshes, with the same hits as
// THREE.Raycaster.intersectObjects(meshes, false)[0]. A Raycaster tests every triangle of
// every mesh for each ray. contact-shadows.js and leaf-piles.js cast a few thousand rays down
// at load, and on a phone that took about 2.4 s of the load. This sorts the triangles into
// cells on the ground plane once, so each ray tests only the triangles in the cells it can
// reach. A vertical ray reaches one cell. A ray in any other direction needs a finite far,
// and reaches the cells under its whole length. aerie-look.js casts short wall rays that way.
// The test itself follows the Raycaster path in Mesh.raycast: the same bounds checks, the
// same ray in the mesh frame, the same triangle test and the same distance. So each hit is
// the same to the last bit. The meshes must not move or change after createDropRay.

// The cell size in metres.
const CELL = 0.5
// Each triangle box grows by this margin in metres, so rounding never drops a hit on a
// triangle edge out of its cell. The box under a ray grows by the same margin.
const MARGIN = 1e-4
const DOWN = new THREE.Vector3(0, -1, 0)
// The cell index offset, so the key of a negative cell stays positive.
const SHIFT = 1e6
const NONE = []

const cellOf = (value) => Math.floor(value / CELL)
const keyOf = (ix, iz) => (ix + SHIFT) * 2 * SHIFT + (iz + SHIFT)

// The cells that a set of boxes on the ground plane cover, padded by one cell on each side.
// boxes: a list of [minX, maxX, minZ, maxZ] in world space. createDropRay files triangles
// only in these cells, so a caller that casts only inside the boxes skips the work of the
// other cells. Returns null when there is no box.
export function cellMask(boxes) {
    if (!boxes.length) return null
    const rects = boxes.map(([minX, maxX, minZ, maxZ]) => [cellOf(minX) - 1, cellOf(maxX) + 1, cellOf(minZ) - 1, cellOf(maxZ) + 1])
    const x0 = Math.min(...rects.map((rect) => rect[0]))
    const x1 = Math.max(...rects.map((rect) => rect[1]))
    const z0 = Math.min(...rects.map((rect) => rect[2]))
    const z1 = Math.max(...rects.map((rect) => rect[3]))
    const nz = z1 - z0 + 1
    // A Uint8Array marks the covered cells. A Set of cell keys measured no faster.
    const bits = new Uint8Array((x1 - x0 + 1) * nz)
    rects.forEach(([ax, bx, az, bz]) => {
        for (let ix = ax; ix <= bx; ix += 1) bits.fill(1, (ix - x0) * nz + (az - z0), (ix - x0) * nz + (bz - z0) + 1)
    })
    return { x0, x1, z0, z1, nz, bits }
}

// The triangle range that Mesh.raycast visits for a geometry with no groups.
function triangleRange(geometry) {
    const { index, drawRange } = geometry
    const count = index ? index.count : geometry.attributes.position.count
    return [Math.max(0, drawRange.start), Math.min(count, drawRange.start + drawRange.count)]
}

// The grid handles a plain mesh: one material, no groups, no morph targets, no skin and no
// instances. Every aerie mesh is one. Any other mesh goes to a Raycaster.
const plain = (mesh) =>
    mesh.isMesh &&
    !mesh.isSkinnedMesh &&
    !mesh.isInstancedMesh &&
    !Array.isArray(mesh.material) &&
    mesh.geometry.groups.length === 0 &&
    !mesh.geometry.morphAttributes.position

// The bin loop reads the arrays directly when getX would return the array value as it is:
// a Float32 position with three values per vertex, and an index with one, neither of them
// normalized or interleaved.
const direct = (attribute, size) => !attribute.isInterleavedBufferAttribute && !attribute.normalized && attribute.itemSize === size
const directPosition = (position) => position.array instanceof Float32Array && direct(position, 3)

// The x and z bounds of each triangle in world space, as [minX, maxX, minZ, maxZ] in `box`.
// The direct path runs the float operations of Vector3.applyMatrix4 in the same order, w
// included, so each bound is the same number as the Vector3 path gives.
function binBounds(entry, matrixWorld) {
    const { position, index } = entry
    const box = [0, 0, 0, 0]
    if (directPosition(position) && (!index || direct(index, 1))) {
        const p = position.array
        const ia = index ? index.array : null
        const e = matrixWorld.elements
        return (i) => {
            let minX = Infinity
            let maxX = -Infinity
            let minZ = Infinity
            let maxZ = -Infinity
            for (let k = 0; k < 3; k += 1) {
                const o = (ia ? ia[i + k] : i + k) * 3
                const x = p[o]
                const y = p[o + 1]
                const z = p[o + 2]
                const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15])
                const wx = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w
                const wz = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
                minX = Math.min(minX, wx)
                maxX = Math.max(maxX, wx)
                minZ = Math.min(minZ, wz)
                maxZ = Math.max(maxZ, wz)
            }
            box[0] = minX
            box[1] = maxX
            box[2] = minZ
            box[3] = maxZ
            return box
        }
    }
    const v = new THREE.Vector3()
    return (i) => {
        let minX = Infinity
        let maxX = -Infinity
        let minZ = Infinity
        let maxZ = -Infinity
        for (let k = 0; k < 3; k += 1) {
            v.fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(matrixWorld)
            minX = Math.min(minX, v.x)
            maxX = Math.max(maxX, v.x)
            minZ = Math.min(minZ, v.z)
            maxZ = Math.max(maxZ, v.z)
        }
        box[0] = minX
        box[1] = maxX
        box[2] = minZ
        box[3] = maxZ
        return box
    }
}

// Joins cell lists into one list in ascending (slot, triangle) order, each pair once. Every
// cell list is in that order already, because the bin loop fills the cells mesh by mesh and
// triangle by triangle. So the cast meets the triangles in Raycaster order, and a tie still
// keeps the first triangle.
function mergeLists(lists) {
    if (lists.length === 0) return NONE
    if (lists.length === 1) return lists[0]
    const out = []
    const at = new Array(lists.length).fill(0)
    for (;;) {
        let slot = Infinity
        let triangle = Infinity
        for (let l = 0; l < lists.length; l += 1) {
            const list = lists[l]
            if (at[l] >= list.length) continue
            const s = list[at[l]]
            const t = list[at[l] + 1]
            if (s < slot || (s === slot && t < triangle)) {
                slot = s
                triangle = t
            }
        }
        if (slot === Infinity) return out
        out.push(slot, triangle)
        for (let l = 0; l < lists.length; l += 1) {
            if (lists[l][at[l]] === slot && lists[l][at[l] + 1] === triangle) at[l] += 2
        }
    }
}

// meshes: the meshes to cast at. mask: an optional cellMask. Without it, every cell gets its
// triangles. With it, a ray that leaves the masked cells misses triangles.
export function createDropRay(meshes, mask = null) {
    const entries = []
    const others = []
    const cells = new Map()
    meshes.forEach((mesh) => {
        if (!mesh.material) return
        if (!plain(mesh)) {
            others.push(mesh)
            return
        }
        const { geometry } = mesh
        const entry = {
            mesh,
            position: geometry.attributes.position,
            index: geometry.index,
            inverse: mesh.matrixWorld.clone().invert(),
            stamp: -1,
            open: false,
            ray: new THREE.Ray(),
        }
        const slot = entries.push(entry) - 1
        const bounds = binBounds(entry, mesh.matrixWorld)
        const [start, end] = triangleRange(geometry)
        for (let i = start; i < end - 2; i += 3) {
            const box = bounds(i)
            let ix0 = cellOf(box[0] - MARGIN)
            let ix1 = cellOf(box[1] + MARGIN)
            let iz0 = cellOf(box[2] - MARGIN)
            let iz1 = cellOf(box[3] + MARGIN)
            if (mask) {
                ix0 = Math.max(ix0, mask.x0)
                ix1 = Math.min(ix1, mask.x1)
                iz0 = Math.max(iz0, mask.z0)
                iz1 = Math.min(iz1, mask.z1)
            }
            for (let ix = ix0; ix <= ix1; ix += 1) {
                for (let iz = iz0; iz <= iz1; iz += 1) {
                    if (mask && !mask.bits[(ix - mask.x0) * mask.nz + (iz - mask.z0)]) continue
                    const key = keyOf(ix, iz)
                    const list = cells.get(key)
                    if (list) list.push(slot, i)
                    else cells.set(key, [slot, i])
                }
            }
        }
    })

    const ray = new THREE.Ray()
    const sphere = new THREE.Sphere()
    const sphereHit = new THREE.Vector3()
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const point = new THREE.Vector3()
    const world = new THREE.Vector3()
    const end = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    const everything = [...entries.map((entry) => entry.mesh), ...others]
    let query = 0

    // The bounds checks of Mesh.raycast, with near at 0. A mesh that fails them gives no hit.
    const opens = (entry, far) => {
        const { geometry, matrixWorld } = entry.mesh
        if (geometry.boundingSphere === null) geometry.computeBoundingSphere()
        sphere.copy(geometry.boundingSphere).applyMatrix4(matrixWorld)
        if (!sphere.containsPoint(ray.origin)) {
            if (ray.intersectSphere(sphere, sphereHit) === null) return false
            if (ray.origin.distanceToSquared(sphereHit) > far ** 2) return false
        }
        entry.ray.copy(ray).applyMatrix4(entry.inverse)
        return geometry.boundingBox === null || entry.ray.intersectsBox(geometry.boundingBox)
    }

    const corners = (entry, i) => {
        const { position, index } = entry
        a.fromBufferAttribute(position, index ? index.getX(i) : i)
        b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1)
        c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2)
    }

    // The triangles a ray can hit. A vertical ray keeps its x and z, so its own cell holds
    // them all. Any other ray reaches every cell under the box from its origin to its far
    // end, grown by MARGIN.
    const candidates = (origin, far, direction) => {
        if (direction.x === 0 && direction.z === 0) return cells.get(keyOf(cellOf(origin.x), cellOf(origin.z))) ?? NONE
        end.copy(direction).multiplyScalar(far).add(origin)
        const lists = []
        for (let ix = cellOf(Math.min(origin.x, end.x) - MARGIN); ix <= cellOf(Math.max(origin.x, end.x) + MARGIN); ix += 1) {
            for (let iz = cellOf(Math.min(origin.z, end.z) - MARGIN); iz <= cellOf(Math.max(origin.z, end.z) + MARGIN); iz += 1) {
                const list = cells.get(keyOf(ix, iz))
                if (list) lists.push(list)
            }
        }
        return mergeLists(lists)
    }

    // origin: the ray start in world space. far: the longest hit distance, as Raycaster.far.
    // direction: a unit vector, straight down when absent.
    // Returns the nearest hit as { distance, point, object, face: { a, b, c, normal } }, or null.
    const cast = (origin, far = Infinity, direction = DOWN) => {
        query += 1
        ray.set(origin, direction)
        // A ray with no far end that is not vertical can cross any cell, so a Raycaster takes it.
        if (far === Infinity && !(direction.x === 0 && direction.z === 0)) {
            raycaster.set(origin, direction)
            raycaster.far = far
            return raycaster.intersectObjects(everything, false)[0] ?? null
        }
        let best = null
        const list = candidates(origin, far, direction)
        for (let k = 0; k < list.length; k += 2) {
            const entry = entries[list[k]]
            if (entry.stamp !== query) {
                entry.stamp = query
                entry.open = opens(entry, far)
            }
            if (!entry.open) continue
            corners(entry, list[k + 1])
            const side = entry.mesh.material.side
            const hit =
                side === THREE.BackSide
                    ? entry.ray.intersectTriangle(c, b, a, true, point)
                    : entry.ray.intersectTriangle(a, b, c, side === THREE.FrontSide, point)
            if (hit === null) continue
            world.copy(point).applyMatrix4(entry.mesh.matrixWorld)
            const distance = ray.origin.distanceTo(world)
            if (distance > far) continue
            // A tie keeps the first triangle, as the stable sort in Raycaster does.
            if (best && distance >= best.distance) continue
            best = { distance, point: world.clone(), object: entry.mesh, entry, i: list[k + 1] }
        }
        if (others.length) {
            raycaster.set(origin, direction)
            raycaster.far = far
            const hit = raycaster.intersectObjects(others, false)[0]
            if (hit && (!best || hit.distance < best.distance)) return hit
        }
        if (!best) return null
        corners(best.entry, best.i)
        const { index } = best.entry
        const at = (k) => (index ? index.getX(best.i + k) : best.i + k)
        const face = { a: at(0), b: at(1), c: at(2), normal: THREE.Triangle.getNormal(a, b, c, new THREE.Vector3()), materialIndex: 0 }
        return { distance: best.distance, point: best.point, object: best.object, face }
    }

    return { cast }
}

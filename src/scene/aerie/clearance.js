import * as THREE from 'three'

// A distance field over the aerie for the camera planner (path-plan.js): for each cell of a
// 1 m grid, the distance in metres to the nearest surface of the island, the house, the trees
// and the props. It builds once after the island loads, behind the loading gate, in slices of
// at most SLICE_MS, so the gate's frames do not stall.

const CELL = 1
// Free space round the island that the planner may use, in metres.
const MARGIN = 14
// The largest object that counts as part of the aerie, and its greatest distance from the
// centre. The sky and the city are far larger, and the stars far away.
const MAX_SIZE = 80
// Meshes that move or that the camera may pass through: the drifting leaves and the haze.
const SKIP = /^(DriftingLeaves|Sky)/
const SLICE_MS = 4
// The squared distance of a cell with no surface in reach. It stays finite so the transform
// can do sums with it.
const FAR = 1e20

const channel = typeof MessageChannel === 'undefined' ? null : new MessageChannel()
// Yields to the browser for one task. setTimeout waits at least 4 ms once nested.
const nextTask = () =>
    new Promise((resolve) => {
        if (!channel) return setTimeout(resolve, 0)
        channel.port1.onmessage = () => resolve()
        channel.port2.postMessage(0)
    })

// The meshes that the camera must keep clear of.
function obstacles(scene) {
    const list = []
    const box = new THREE.Box3()
    const size = new THREE.Vector3()
    const centre = new THREE.Vector3()
    scene.updateMatrixWorld(true)
    scene.traverse((node) => {
        if (!node.isMesh || !node.visible || SKIP.test(node.name) || SKIP.test(node.parent?.name ?? '')) return
        box.setFromObject(node).getSize(size)
        if (box.isEmpty() || Math.max(size.x, size.y, size.z) > MAX_SIZE || box.getCenter(centre).length() > MAX_SIZE) return
        list.push(node)
    })
    return list
}

// The squared distance transform of one row of f, in place (Felzenszwalb and Huttenlocher).
// v, z and d are scratch arrays at least as long as the row.
function transformRow(f, n, v, z, d) {
    const meet = (q, p) => (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p)
    let k = 0
    v[0] = 0
    z[0] = -Infinity
    z[1] = Infinity
    for (let q = 1; q < n; q += 1) {
        let s = meet(q, v[k])
        while (s <= z[k]) {
            k -= 1
            s = meet(q, v[k])
        }
        k += 1
        v[k] = q
        z[k] = s
        z[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < n; q += 1) {
        while (z[k + 1] < q) k += 1
        d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
    }
    for (let q = 0; q < n; q += 1) f[q] = d[q]
}

// Builds the field from the meshes in `scene`. Resolves to the field API.
export async function createClearance(scene) {
    let clock = performance.now()
    const breathe = async () => {
        if (performance.now() - clock < SLICE_MS) return
        await nextTask()
        clock = performance.now()
    }
    const meshes = obstacles(scene)
    const bounds = new THREE.Box3()
    meshes.forEach((mesh) => bounds.expandByObject(mesh))
    bounds.expandByScalar(MARGIN)
    const origin = bounds.min.clone()
    const [nx, ny, nz] = bounds.getSize(new THREE.Vector3()).divideScalar(CELL).toArray().map((v) => Math.ceil(v) + 1)
    const index = (i, j, k) => i + nx * (j + ny * k)
    const squared = new Float32Array(nx * ny * nz).fill(FAR)

    // Every surface marks the cells it passes through. A large triangle is sampled at half a
    // cell, so a long sloped roof marks its own cells and not the box round it.
    const mark = (p) => {
        const i = Math.floor((p.x - origin.x) / CELL)
        const j = Math.floor((p.y - origin.y) / CELL)
        const k = Math.floor((p.z - origin.z) / CELL)
        if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) squared[index(i, j, k)] = 0
    }
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const p = new THREE.Vector3()
    const matrix = new THREE.Matrix4()
    const instance = new THREE.Matrix4()
    const markTriangle = () => {
        const edge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a))
        const n = Math.max(1, Math.ceil(edge / (CELL / 2)))
        for (let u = 0; u <= n; u += 1) {
            for (let v = 0; u + v <= n; v += 1) {
                const w = n - u - v
                p.set(0, 0, 0).addScaledVector(a, u / n).addScaledVector(b, v / n).addScaledVector(c, w / n)
                mark(p)
            }
        }
    }
    for (const mesh of meshes) {
        const position = mesh.geometry.attributes.position
        const order = mesh.geometry.index
        const triangles = (order ? order.count : position.count) / 3
        const copies = mesh.isInstancedMesh ? mesh.count : 1
        for (let copy = 0; copy < copies; copy += 1) {
            matrix.copy(mesh.matrixWorld)
            if (mesh.isInstancedMesh) {
                mesh.getMatrixAt(copy, instance)
                matrix.multiply(instance)
            }
            for (let t = 0; t < triangles; t += 1) {
                const at = (corner) => (order ? order.getX(3 * t + corner) : 3 * t + corner)
                a.fromBufferAttribute(position, at(0)).applyMatrix4(matrix)
                b.fromBufferAttribute(position, at(1)).applyMatrix4(matrix)
                c.fromBufferAttribute(position, at(2)).applyMatrix4(matrix)
                markTriangle()
                if ((t & 63) === 0) await breathe()
            }
        }
    }

    // The exact distance transform, one axis at a time.
    const longest = Math.max(nx, ny, nz)
    const row = new Float64Array(longest)
    const out = new Float64Array(longest)
    const v = new Int32Array(longest)
    const z = new Float64Array(longest + 1)
    const axes = [
        [nx, (r, q) => index(q, r % ny, Math.floor(r / ny)), ny * nz],
        [ny, (r, q) => index(r % nx, q, Math.floor(r / nx)), nx * nz],
        [nz, (r, q) => index(r % nx, Math.floor(r / nx), q), nx * ny],
    ]
    for (const [n, cell, rows] of axes) {
        for (let r = 0; r < rows; r += 1) {
            for (let q = 0; q < n; q += 1) row[q] = squared[cell(r, q)]
            transformRow(row, n, v, z, out)
            for (let q = 0; q < n; q += 1) squared[cell(r, q)] = row[q]
            if ((r & 15) === 0) await breathe()
        }
    }
    const distance = new Float32Array(squared.length)
    for (let i = 0; i < squared.length; i += 1) distance[i] = squared[i] >= FAR / 10 ? MAX_SIZE : Math.sqrt(squared[i]) * CELL
    return fieldFrom({ distance, origin, cell: CELL, size: [nx, ny, nz] })
}

// The field API over a distance grid. Outside the grid every point counts as clear.
export function fieldFrom({ distance, origin, cell, size: [nx, ny, nz] }) {
    const valueAt = (i, j, k) => {
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return MAX_SIZE
        return distance[i + nx * (j + ny * k)]
    }
    // The distance at a point, in metres, blended from the eight cells round it. A cell value
    // holds for the cell centre. The planner calls this some hundred thousand times a plan,
    // so it allocates nothing.
    const at = (point) => {
        const x = (point.x - origin.x) / cell - 0.5
        const y = (point.y - origin.y) / cell - 0.5
        const z = (point.z - origin.z) / cell - 0.5
        const i = Math.floor(x)
        const j = Math.floor(y)
        const k = Math.floor(z)
        const u = x - i
        const v = y - j
        const w = z - k
        const low = (1 - v) * (valueAt(i, j, k) * (1 - u) + valueAt(i + 1, j, k) * u) + v * (valueAt(i, j + 1, k) * (1 - u) + valueAt(i + 1, j + 1, k) * u)
        const high = (1 - v) * (valueAt(i, j, k + 1) * (1 - u) + valueAt(i + 1, j, k + 1) * u) + v * (valueAt(i, j + 1, k + 1) * (1 - u) + valueAt(i + 1, j + 1, k + 1) * u)
        return low * (1 - w) + high * w
    }
    const probe = new THREE.Vector3()
    // The direction in which the distance grows fastest, written into target.
    const gradient = (point, target) => {
        const h = cell / 2
        const along = (axis) => {
            probe.copy(point).setComponent(axis, point.getComponent(axis) + h)
            const up = at(probe)
            probe.copy(point).setComponent(axis, point.getComponent(axis) - h)
            return (up - at(probe)) / (2 * h)
        }
        return target.set(along(0), along(1), along(2))
    }
    // plans: the flights planned ahead (path-plan.js), keyed by their two ends.
    return { at, gradient, cell, origin, size: [nx, ny, nz], plans: new Map() }
}

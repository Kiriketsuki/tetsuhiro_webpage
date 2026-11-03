import { BufferAttribute } from 'three'

// Soft shading that keeps the low-poly look. The geometry keeps its exported flat normals
// in `flatNormal`, and gets creased normals in `normal`: smooth across gentle bends, hard at
// corners sharper than CREASE. The toon shader blends the two, so a facet still reads, but
// its tone eases into its neighbours like a painted, rounded form.
const CREASE = (44 * Math.PI) / 180

// The position hash of toCreasedNormals in three/examples/jsm/utils/BufferGeometryUtils.js:
// each coordinate in whole centimetres, cut toward zero.
const HASH_SCALE = (1 + 1e-10) * 1e2
// A hash coordinate under this size packs into one number key. Any other vertex takes a
// string key. Both keys name the same cell, so the two kinds never mix up.
const PACK = 65536

// The same normals as toCreasedNormals, to the last bit, in a fraction of the time. That
// function keys each vertex with a string and keeps a Vector3 per face corner, and on a phone
// it took about half a second of the load. This one packs the key into a number and keeps the
// face normals in one typed array. Each sum runs in the same order with the same float
// operations, so the result does not change. geometry must have no index.
function creasedNormals(geometry, creaseAngle) {
    const creaseDot = Math.cos(creaseAngle)
    const position = geometry.attributes.position
    const count = position.count
    // A plain attribute reads straight from its array, which gives the same numbers as getX.
    const raw = position.isInterleavedBufferAttribute || position.normalized || position.itemSize !== 3 ? null : position.array
    const coords = new Float64Array(count * 3)
    for (let v = 0; v < count; v += 1) {
        coords[v * 3] = raw ? raw[v * 3] : position.getX(v)
        coords[v * 3 + 1] = raw ? raw[v * 3 + 1] : position.getY(v)
        coords[v * 3 + 2] = raw ? raw[v * 3 + 2] : position.getZ(v)
    }
    const faces = Math.ceil(count / 3)
    const face = new Float64Array(faces * 3)
    const cellOf = new Int32Array(count)
    const cells = new Map()
    const key = (x, y, z) => (Math.abs(x) < PACK && Math.abs(y) < PACK && Math.abs(z) < PACK ? ((x + PACK) * 2 * PACK + (y + PACK)) * 2 * PACK + (z + PACK) : `${x},${y},${z}`)
    for (let f = 0; f < count / 3; f += 1) {
        const i = 3 * f
        const ax = coords[i * 3]
        const ay = coords[i * 3 + 1]
        const az = coords[i * 3 + 2]
        const bx = coords[i * 3 + 3]
        const by = coords[i * 3 + 4]
        const bz = coords[i * 3 + 5]
        const cx = coords[i * 3 + 6]
        const cy = coords[i * 3 + 7]
        const cz = coords[i * 3 + 8]
        // (c - b) cross (a - b), then Vector3.normalize.
        const ux = cx - bx
        const uy = cy - by
        const uz = cz - bz
        const vx = ax - bx
        const vy = ay - by
        const vz = az - bz
        const nx = uy * vz - uz * vy
        const ny = uz * vx - ux * vz
        const nz = ux * vy - uy * vx
        const inverse = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1)
        face[i] = nx * inverse
        face[i + 1] = ny * inverse
        face[i + 2] = nz * inverse
        for (let n = 0; n < 3; n += 1) {
            const p = (i + n) * 3
            const k = key(~~(coords[p] * HASH_SCALE), ~~(coords[p + 1] * HASH_SCALE), ~~(coords[p + 2] * HASH_SCALE))
            let cell = cells.get(k)
            if (cell === undefined) {
                cell = cells.size
                cells.set(k, cell)
            }
            cellOf[i + n] = cell
        }
    }
    // The corners of each cell, in the order toCreasedNormals pushes them.
    const start = new Int32Array(cells.size + 1)
    for (let v = 0; v < count; v += 1) start[cellOf[v] + 1] += 1
    for (let c = 0; c < cells.size; c += 1) start[c + 1] += start[c]
    const fill = start.slice(0, cells.size)
    const corners = new Int32Array(count)
    for (let v = 0; v < count; v += 1) corners[fill[cellOf[v]]++] = v

    const normal = new Float32Array(count * 3)
    for (let v = 0; v < count; v += 1) {
        const f = v - (v % 3)
        const tx = face[f]
        const ty = face[f + 1]
        const tz = face[f + 2]
        let sx = 0
        let sy = 0
        let sz = 0
        for (let k = start[cellOf[v]]; k < start[cellOf[v] + 1]; k += 1) {
            const o = corners[k] - (corners[k] % 3)
            if (tx * face[o] + ty * face[o + 1] + tz * face[o + 2] > creaseDot) {
                sx += face[o]
                sy += face[o + 1]
                sz += face[o + 2]
            }
        }
        const inverse = 1 / (Math.sqrt(sx * sx + sy * sy + sz * sz) || 1)
        normal[v * 3] = sx * inverse
        normal[v * 3 + 1] = sy * inverse
        normal[v * 3 + 2] = sz * inverse
    }
    geometry.setAttribute('normal', new BufferAttribute(normal, 3, false))
    return geometry
}

// crease: the angle in radians above which an edge stays hard. Round metal parts pass a
// wider angle, so a low-poly tube shades as one smooth cylinder and can carry a sheen.
export function softenGeometry(geometry, crease = CREASE) {
    if (geometry.attributes.flatNormal) return geometry
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    if (!flat.attributes.normal) flat.computeVertexNormals()
    const flatNormal = flat.attributes.normal.clone()
    const soft = creasedNormals(flat, crease)
    soft.setAttribute('flatNormal', flatNormal)
    return soft
}

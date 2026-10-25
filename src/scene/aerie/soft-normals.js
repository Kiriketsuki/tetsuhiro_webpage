import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Soft shading that keeps the low-poly look. The geometry keeps its exported flat normals
// in `flatNormal`, and gets creased normals in `normal`: smooth across gentle bends, hard at
// corners sharper than CREASE. The toon shader blends the two, so a facet still reads, but
// its tone eases into its neighbours like a painted, rounded form.
const CREASE = (34 * Math.PI) / 180

export function softenGeometry(geometry, crease = CREASE) {
    if (geometry.attributes.flatNormal) return geometry
    const flat = geometry.index ? geometry.toNonIndexed() : geometry
    if (!flat.attributes.normal) flat.computeVertexNormals()
    const flatNormal = flat.attributes.normal.clone()
    const soft = toCreasedNormals(flat, crease)
    soft.setAttribute('flatNormal', flatNormal)
    return soft
}

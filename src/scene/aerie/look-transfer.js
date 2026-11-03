import * as THREE from 'three'

// Moves island meshes between the page and the look worker (look-worker.js). A message keeps
// plain data only, so each three.js value goes out as a tagged list of its numbers and comes
// back as the same class with the same numbers. The typed arrays of the geometry move as
// transferred buffers, so no copy is made.

// Tags a value for postMessage. Typed arrays, numbers, strings, booleans, null and Maps of
// plain values pass through. A value of any other class throws, so a new kind of data shows up
// at once and never arrives as a broken copy.
export function pack(value) {
    if (value === null || typeof value !== 'object') {
        if (typeof value === 'function') throw new Error('look-transfer: a function cannot cross to the worker')
        return value
    }
    if (ArrayBuffer.isView(value) || value instanceof Map) return value
    if (value.isVector3) return { $v3: [value.x, value.y, value.z] }
    if (value.isColor) return { $c: [value.r, value.g, value.b] }
    if (value.isMatrix4) return { $m4: [...value.elements] }
    if (value.isBox3) return { $b3: [value.min.x, value.min.y, value.min.z, value.max.x, value.max.y, value.max.z] }
    if (value.isSphere) return { $s: [value.center.x, value.center.y, value.center.z, value.radius] }
    if (Array.isArray(value)) return value.map(pack)
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new Error('look-transfer: an unknown class cannot cross to the worker')
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = pack(item)
    return out
}

export function unpack(value) {
    if (value === null || typeof value !== 'object' || ArrayBuffer.isView(value) || value instanceof Map) return value
    if (Array.isArray(value)) return value.map(unpack)
    if (value.$v3) return new THREE.Vector3(...value.$v3)
    // The fields are set directly, so no colour space step can touch the numbers.
    if (value.$c) return Object.assign(new THREE.Color(), { r: value.$c[0], g: value.$c[1], b: value.$c[2] })
    if (value.$m4) return new THREE.Matrix4().fromArray(value.$m4)
    if (value.$b3) return new THREE.Box3(new THREE.Vector3(...value.$b3.slice(0, 3)), new THREE.Vector3(...value.$b3.slice(3)))
    if (value.$s) return new THREE.Sphere(new THREE.Vector3(...value.$s.slice(0, 3)), value.$s[3])
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = unpack(item)
    return out
}

// An interleaved attribute turns plain first. Its values stay the same.
const plainAttribute = (attribute) => (attribute.isInterleavedBufferAttribute ? attribute.clone() : attribute)

export function packGeometry(geometry) {
    const attributes = Object.entries(geometry.attributes).map(([name, attribute]) => {
        const plain = plainAttribute(attribute)
        return { name, array: plain.array, itemSize: plain.itemSize, normalized: plain.normalized }
    })
    return {
        name: geometry.name,
        attributes,
        index: geometry.index ? geometry.index.array : null,
        groups: geometry.groups.map((group) => ({ ...group })),
        drawRange: { ...geometry.drawRange },
        boundingBox: pack(geometry.boundingBox),
        boundingSphere: pack(geometry.boundingSphere),
        userData: pack(geometry.userData),
    }
}

export function unpackGeometry(packed) {
    const geometry = new THREE.BufferGeometry()
    geometry.name = packed.name
    packed.attributes.forEach(({ name, array, itemSize, normalized }) => geometry.setAttribute(name, new THREE.BufferAttribute(array, itemSize, normalized)))
    if (packed.index) geometry.setIndex(new THREE.BufferAttribute(packed.index, 1))
    packed.groups.forEach(({ start, count, materialIndex }) => geometry.addGroup(start, count, materialIndex))
    geometry.setDrawRange(packed.drawRange.start, packed.drawRange.count)
    geometry.boundingBox = unpack(packed.boundingBox)
    geometry.boundingSphere = unpack(packed.boundingSphere)
    geometry.userData = unpack(packed.userData)
    return geometry
}

// The buffers under the typed arrays of a packed message, each one once, for the transfer list.
export function buffersOf(value, found = new Set()) {
    if (value === null || typeof value !== 'object') return found
    if (ArrayBuffer.isView(value)) {
        found.add(value.buffer)
        return found
    }
    if (value instanceof Map) return found
    Object.values(value).forEach((item) => buffersOf(item, found))
    return found
}

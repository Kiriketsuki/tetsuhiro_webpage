import * as THREE from 'three'
import { shapeIsland } from './island-look.js'
import { pack, unpack, packGeometry, unpackGeometry, buffersOf } from './look-transfer.js'

// The look worker. It takes the island meshes from look-client.js, runs shapeIsland on them
// and sends the shaped geometry back. shapeIsland only reads a material to tell the toon
// meshes apart and to read its side for the ray tests, so each mesh gets a stand-in material
// with that side. The world matrix comes from the page and must not change here, so the
// meshes keep it as it is. Meshes that share a geometry on the page share it here too, and
// each mesh hangs under its nearest mesh ancestor, as on the page.

function meshOf(packed, geometries, opaque) {
    const material = packed.kind === 'opaque' ? opaque : Array.isArray(packed.sides) ? packed.sides.map((side) => ({ side })) : { side: packed.sides }
    const mesh = new THREE.Mesh(geometries[packed.geometry], material)
    mesh.name = packed.name
    mesh.userData = unpack(packed.userData)
    mesh.matrixAutoUpdate = false
    mesh.matrixWorldAutoUpdate = false
    mesh.matrixWorld.fromArray(packed.matrixWorld)
    return mesh
}

// Packs each distinct geometry once, and gives each mesh the slot of its geometry.
function packMeshes(meshes) {
    const geometries = []
    const slotOf = new Map()
    const packed = meshes.map((mesh) => {
        if (!slotOf.has(mesh.geometry)) slotOf.set(mesh.geometry, geometries.push(packGeometry(mesh.geometry)) - 1)
        return { userData: pack(mesh.userData), geometry: slotOf.get(mesh.geometry) }
    })
    return { packed, geometries }
}

self.onmessage = ({ data }) => {
    try {
        const opaque = { side: data.opaqueSide }
        const geometries = data.geometries.map(unpackGeometry)
        const meshes = data.meshes.map((packed) => meshOf(packed, geometries, opaque))
        data.meshes.forEach((packed, i) => {
            if (packed.ancestor >= 0) meshes[packed.ancestor].children.push(meshes[i])
        })
        const water = meshes.filter((_, i) => data.meshes[i].kind === 'water')
        const count = meshes.length
        const shaped = shapeIsland({
            meshes,
            opaque,
            water,
            lip: unpack(data.lip),
            telescope: unpack(data.telescope),
            bounces: data.bounces,
            spots: unpack(data.spots),
        })
        const island = packMeshes(meshes.slice(0, count))
        const reply = {
            meshes: island.packed,
            geometries: island.geometries,
            piles: shaped.piles ? { name: shaped.piles.name, userData: pack(shaped.piles.userData), geometry: packGeometry(shaped.piles.geometry) } : null,
            aoMeshes: shaped.aoMeshes,
            pond: shaped.pond,
            waterMouth: pack(shaped.waterMouth),
            glows: pack(shaped.glows),
            cells: shaped.litterAt.cells ?? null,
            shrubShadows: pack(shaped.shrubShadows),
        }
        self.postMessage(reply, [...buffersOf(reply)])
    } catch (error) {
        self.postMessage({ error: `${error.message}\n${error.stack ?? ''}` })
    }
}

// The page sends the job only after this, so a worker that fails to load costs no data.
self.postMessage({ ready: true })

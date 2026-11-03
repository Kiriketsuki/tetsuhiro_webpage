import * as THREE from 'three'
import { shapeIsland } from './island-look.js'
import { pack, unpack, packGeometry, unpackGeometry, buffersOf } from './look-transfer.js'

// The look worker. It takes the island meshes from look-client.js, runs shapeIsland on them
// and sends the shaped geometry back. shapeIsland only reads a material to tell the toon
// meshes apart and to read its side for the ray tests, so each mesh gets a stand-in material
// with that side. The world matrix comes from the page and must not change here, so the
// meshes keep it as it is.

function meshOf(packed, opaque) {
    const material = packed.kind === 'opaque' ? opaque : Array.isArray(packed.sides) ? packed.sides.map((side) => ({ side })) : { side: packed.sides }
    const mesh = new THREE.Mesh(unpackGeometry(packed.geometry), material)
    mesh.name = packed.name
    mesh.userData = unpack(packed.userData)
    mesh.matrixAutoUpdate = false
    mesh.matrixWorldAutoUpdate = false
    mesh.matrixWorld.fromArray(packed.matrixWorld)
    return mesh
}

self.onmessage = ({ data }) => {
    try {
        const opaque = { side: data.opaqueSide }
        const meshes = data.meshes.map((packed) => meshOf(packed, opaque))
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
        const reply = {
            meshes: meshes.slice(0, count).map((mesh) => ({ userData: pack(mesh.userData), geometry: packGeometry(mesh.geometry) })),
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

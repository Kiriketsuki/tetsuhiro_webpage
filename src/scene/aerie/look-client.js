import * as THREE from 'three'
import { litterLookup } from './autumn.js'
import { pack, unpack, packGeometry, unpackGeometry, buffersOf } from './look-transfer.js'

// The page side of the look worker (look-worker.js). scene-manager.js starts the worker with
// the scene, so it loads and parses beside the island download. shape() sends the island
// meshes to it, and puts the shaped geometry and userData back on the same meshes. The page
// stays free for the loading screen while the worker runs shapeIsland, about 2.5 s of work
// on a 4x throttled phone.

// The page meshes as plain data. Each typed array moves to the worker, so the page geometry
// is empty until the reply comes back. The island is not in the scene until then.
function packJob({ meshes, opaque, water, lip, telescope, bounces, spots }) {
    const kind = (mesh) => (mesh.material === opaque ? 'opaque' : water.includes(mesh) ? 'water' : 'other')
    const side = (material) => material.side
    return {
        meshes: meshes.map((mesh) => ({
            name: mesh.name,
            kind: kind(mesh),
            sides: Array.isArray(mesh.material) ? mesh.material.map(side) : side(mesh.material),
            matrixWorld: [...mesh.matrixWorld.elements],
            userData: pack(mesh.userData),
            geometry: packGeometry(mesh.geometry),
        })),
        opaqueSide: opaque.side,
        lip: pack(lip),
        telescope: pack(telescope),
        bounces,
        spots: pack(spots),
    }
}

// Puts the reply on the page meshes. The leaf piles come back as a new mesh in the toon
// material, and the litter lookup is built again from its cells.
function applyReply(reply, { meshes, opaque }) {
    reply.meshes.forEach((shaped, i) => {
        const mesh = meshes[i]
        mesh.geometry.dispose()
        mesh.geometry = unpackGeometry(shaped.geometry)
        mesh.userData = unpack(shaped.userData)
    })
    let piles = null
    if (reply.piles) {
        piles = new THREE.Mesh(unpackGeometry(reply.piles.geometry), opaque)
        piles.name = reply.piles.name
        piles.userData = unpack(reply.piles.userData)
    }
    return {
        aoMeshes: reply.aoMeshes,
        pond: reply.pond,
        waterMouth: unpack(reply.waterMouth),
        glows: unpack(reply.glows),
        litterAt: reply.cells ? litterLookup(reply.cells) : () => 0,
        piles,
        shrubShadows: unpack(reply.shrubShadows),
    }
}

export function createLookWorker() {
    const worker = new Worker(new URL('./look-worker.js', import.meta.url), { type: 'module' })
    const shape = (job) =>
        new Promise((resolve, reject) => {
            worker.onmessage = ({ data }) => {
                if (data.error) reject(new Error(`The look worker failed: ${data.error}`))
                else resolve(applyReply(data, job))
            }
            worker.onerror = (event) => {
                event.preventDefault?.()
                reject(new Error(`The look worker failed to run: ${event.message ?? 'no message'}`))
            }
            worker.onmessageerror = () => reject(new Error('The look worker sent a reply the page cannot read.'))
            const message = packJob(job)
            worker.postMessage(message, [...buffersOf(message)])
        })
    return { shape, dispose: () => worker.terminate() }
}

import * as THREE from 'three'
import workerUrl from './look-worker.js?worker&url'
import { litterLookup } from './autumn.js'
import { pack, unpack, packGeometry, unpackGeometry, buffersOf } from './look-transfer.js'

// The page side of the look worker (look-worker.js). scene-manager.js starts the worker with
// the scene, so it loads and parses beside the aerie download. shape() sends the aerie
// meshes to it, and puts the shaped geometry and userData back on the same meshes. The page
// stays free for the loading screen while the worker runs shapeAerie, about 2.5 s of work
// on a 4x throttled phone.
//
// The worker sends { ready: true } once its script has run. The job goes out only after that,
// because its buffers move to the worker and the page copies are empty from then on. A worker
// that fails or stays silent before that point costs nothing: the page then runs the same
// worker script itself (shapeOnPage), so the aerie still loads.

// How long the worker may take to say it is ready, and to answer the job, in milliseconds. A
// cold dev server builds the worker modules on first request, which can take longer.
const READY_WAIT_MS = import.meta.env.DEV ? 120000 : 20000
const REPLY_WAIT_MS = 60000

// The page meshes as plain data. Each typed array moves to the worker, so the page geometry
// is empty until the reply comes back. The aerie is not in the scene until then. Meshes that
// share one geometry send it once, and `ancestor` names the nearest mesh above each mesh, so
// Box3.setFromObject in the worker sees the same mesh tree as the page.
function packJob({ meshes, opaque, water, lip, telescope, bounces, spots }) {
    const kind = (mesh) => (mesh.material === opaque ? 'opaque' : water.includes(mesh) ? 'water' : 'other')
    const side = (material) => material.side
    const geometries = []
    const slotOf = new Map()
    const geometrySlot = (geometry) => {
        if (!slotOf.has(geometry)) slotOf.set(geometry, geometries.push(packGeometry(geometry)) - 1)
        return slotOf.get(geometry)
    }
    const indexOf = new Map(meshes.map((mesh, i) => [mesh, i]))
    const ancestorOf = (mesh) => {
        for (let node = mesh.parent; node; node = node.parent) if (indexOf.has(node)) return indexOf.get(node)
        return -1
    }
    return {
        meshes: meshes.map((mesh) => ({
            name: mesh.name,
            kind: kind(mesh),
            sides: Array.isArray(mesh.material) ? mesh.material.map(side) : side(mesh.material),
            matrixWorld: [...mesh.matrixWorld.elements],
            userData: pack(mesh.userData),
            geometry: geometrySlot(mesh.geometry),
            ancestor: ancestorOf(mesh),
        })),
        geometries,
        opaqueSide: opaque.side,
        lip: pack(lip),
        telescope: pack(telescope),
        bounces,
        spots: pack(spots),
    }
}

// Puts the reply on the page meshes. Meshes that came back with one shared geometry share it
// again. The leaf piles come back as a new mesh in the toon material, and the litter lookup is
// built again from its cells.
function applyReply(reply, { meshes, opaque }) {
    const geometries = reply.geometries.map(unpackGeometry)
    const old = new Set(meshes.map((mesh) => mesh.geometry))
    reply.meshes.forEach((shaped, i) => {
        meshes[i].geometry = geometries[shaped.geometry]
        meshes[i].userData = unpack(shaped.userData)
    })
    old.forEach((geometry) => geometry.dispose())
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

// Runs the built worker script on the page, with a stand-in for its global scope. The script
// uses only self.onmessage and self.postMessage. The dev server serves the worker as an ES
// module, which this cannot run, so in dev a failed worker stays an error.
async function shapeOnPage(message) {
    if (import.meta.env.DEV) throw new Error('The look worker did not start, and the dev server has no page fallback.')
    const response = await fetch(workerUrl)
    if (!response.ok) throw new Error(`The look worker script did not load (${response.status}).`)
    const code = await response.text()
    return new Promise((resolve, reject) => {
        const scope = {
            onmessage: null,
            postMessage: (data) => {
                if (data.ready) return
                if (data.error) reject(new Error(`The look script failed on the page: ${data.error}`))
                else resolve(data)
            },
        }
        new Function('self', code)(scope)
        scope.onmessage({ data: message })
    })
}

// The page fallback, with a note in the console that names the worker failure.
function shapeLocally(message, failure) {
    console.warn('The look worker is not running, so the page shapes the aerie itself.', failure)
    return shapeOnPage(message)
}

export function createLookWorker() {
    let worker = null
    let failed = null
    let onReply = null
    const stop = () => {
        worker?.terminate()
        worker = null
    }
    const fail = (error) => {
        failed ??= error
        stop()
        onReply?.(null, failed)
    }
    // The ready message, or the first failure, whichever comes first. A failure that comes
    // after the job went out goes to onReply.
    const ready = new Promise((resolve) => {
        try {
            // The build emits a classic script, which every browser with workers can run. The dev
            // server serves an ES module, which needs a module worker.
            worker = new Worker(workerUrl, { type: import.meta.env.DEV ? 'module' : 'classic' })
        } catch (error) {
            failed = error
            resolve(false)
            return
        }
        const timer = setTimeout(() => {
            fail(new Error('The look worker did not start in time.'))
            resolve(false)
        }, READY_WAIT_MS)
        worker.onmessage = ({ data }) => {
            if (data.ready) {
                clearTimeout(timer)
                resolve(true)
            } else onReply?.(data, null)
        }
        worker.onerror = (event) => {
            event.preventDefault?.()
            clearTimeout(timer)
            fail(new Error(`The look worker failed: ${event.message || 'its script did not load'}`))
            resolve(false)
        }
        worker.onmessageerror = () => fail(new Error('The look worker sent a reply the page cannot read.'))
    })

    const shape = async (job) => {
        const message = packJob(job)
        const reply = (await ready) && !failed
            ? await new Promise((resolve, reject) => {
                  const timer = setTimeout(() => fail(new Error('The look worker did not answer in time.')), REPLY_WAIT_MS)
                  onReply = (data, error) => {
                      clearTimeout(timer)
                      onReply = null
                      if (error) reject(error)
                      else if (data.error) reject(new Error(`The look worker failed: ${data.error}`))
                      else resolve(data)
                  }
                  worker.postMessage(message, [...buffersOf(message)])
              })
            : await shapeLocally(message, failed)
        return applyReply(reply, job)
    }
    return { shape, dispose: stop }
}

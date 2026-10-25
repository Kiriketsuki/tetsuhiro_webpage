import * as THREE from 'three'
import { createSceneManager } from '../scene/scene-manager.js'
import { stops } from '../data/stops.js'
import { TIERS } from '../scene/aerie/quality.js'
import { createGpuTimer } from './gpu-timer.js'

// Dev-only lab for the watercolour look on the urban aerie island. Open
// /lab/watercolour.html on the dev server. The live site does not load this file.
// Query options: ?lod=0|1 picks the GLB, ?tier=0..3 pins a tier, ?still renders one frame,
// ?cam=<stop id> picks the start stop.

const params = new URLSearchParams(location.search)
const reducedMotion = params.has('still') || window.matchMedia('(prefers-reduced-motion: reduce)').matches
const pinned = params.has('tier') ? THREE.MathUtils.clamp(Number(params.get('tier')), 0, TIERS.length - 1) : null
const startStop = stops[params.get('cam')] ? params.get('cam') : 'overview'

const canvas = document.getElementById('lab')
const hud = document.getElementById('hud')
const controlsBar = document.getElementById('controls')

let gpu = null
let frames = 0
const manager = createSceneManager({
    canvas,
    reducedMotion,
    lod: params.has('lod') ? Number(params.get('lod')) : null,
    tier: pinned,
    start: startStop,
    hooks: {
        before: () => gpu?.begin(),
        after: () => {
            gpu?.end()
            frames += 1
        },
    },
})
gpu = createGpuTimer(manager.renderer.getContext())
manager.resume()

let currentStop = startStop
function button(label, pressed, onClick) {
    const el = document.createElement('button')
    el.textContent = label
    el.setAttribute('aria-pressed', String(pressed))
    el.addEventListener('click', onClick)
    return el
}

function buildControls() {
    const tier = manager.tier.index
    controlsBar.replaceChildren(
        ...Object.keys(stops).map((id) =>
            button(id, currentStop === id, () => {
                currentStop = id
                manager.goTo(id)
                buildControls()
            })
        ),
        ...TIERS.map((t, i) =>
            button(t.name, tier === i, () => {
                manager.setQuality(i)
                buildControls()
            })
        ),
        button(`lod${manager.lod === 1 ? 0 : 1}`, false, () => {
            params.set('lod', manager.lod === 1 ? '0' : '1')
            location.search = params.toString()
        })
    )
}

let last = performance.now()
let gpuMs = null
function writeHud() {
    const now = performance.now()
    const info = manager.renderer.info
    gpuMs = gpu.poll() ?? gpuMs
    const tier = manager.tier
    hud.textContent = [
        `watercolour lab  ${manager.lod === 1 ? 'island_b_lod1.glb' : 'island_b.glb'}  ${currentStop}`,
        `tier ${tier.name}  msaa ${tier.samples}  dpr ${tier.pixelRatio}  ${reducedMotion ? 'still' : 'on demand'}`,
        `renders ${((frames * 1000) / (now - last)).toFixed(0)}/s  cpu submit ${manager.submitMs.toFixed(2)} ms  gpu ${gpuMs === null ? 'n/a' : gpuMs.toFixed(2) + ' ms'}`,
        `calls ${info.render.calls}  tris ${info.render.triangles}  points ${info.render.points}`,
        `programs ${info.programs.length}  textures ${info.memory.textures}  geometries ${info.memory.geometries}`,
    ].join('\n')
    frames = 0
    last = now
}
// Drag to look around, wheel to zoom, release to ease back. Pointer drift on a desktop.
let dragging = null
canvas.addEventListener('pointerdown', (e) => {
    dragging = { x: e.clientX, y: e.clientY }
    canvas.setPointerCapture(e.pointerId)
})
canvas.addEventListener('pointermove', (e) => {
    if (dragging) {
        manager.pan(e.clientX - dragging.x, e.clientY - dragging.y)
        dragging = { x: e.clientX, y: e.clientY }
        return
    }
    manager.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1)
})
canvas.addEventListener('pointerup', () => {
    dragging = null
    manager.release()
})
canvas.addEventListener('wheel', (e) => manager.zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08), { passive: true })

manager.ready
    .then(() => {
        buildControls()
        writeHud()
        setInterval(writeHud, 500)
        window.lab = { manager }
    })
    .catch((error) => {
        hud.textContent = `lab failed to start: ${error.message}`
        throw error
    })

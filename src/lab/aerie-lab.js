import * as THREE from 'three'
import { createSceneManager } from '../scene/scene-manager.js'
import { stops } from '../data/stops.js'
import { TIERS } from '../scene/aerie/quality.js'
import { createGpuTimer } from './gpu-timer.js'

// Dev-only lab for the cozy night look on the urban aerie island, after the art style of
// Leaf it Alone. Open /lab/aerie.html on the dev server. The live site does not load this file.
// Query options: ?lod=0|1 picks the GLB, ?tier=0..3 pins a tier, ?still renders one frame,
// ?cam=<stop id> picks the start stop.

const params = new URLSearchParams(location.search)
const reducedMotion = params.has('still') || window.matchMedia('(prefers-reduced-motion: reduce)').matches
const pinned = params.has('tier') ? THREE.MathUtils.clamp(Number(params.get('tier')), 0, TIERS.length - 1) : null

// Lab-only acceptance shots, which the site never shows. padclose is the close look at the
// arrival pad: the deck, its curb and lamps, the marking and the ramp join. The lab adds a
// shot only when ?cam names it, so the crown cards (placed for the camera stops) match the
// site in every other shot.
const LAB_STOPS = {
    padclose: {
        camera: null,
        anchor: 'Anchor_Pad',
        fallback: { position: [21.2, 5.0, 8.8], target: [14.6, 0.8, 2.7], fov: 40 },
        shift: [0, 0],
        tall: [0, 0],
    },
    // The close look at the walkway from the bridge to the pad: the bridge end, the path,
    // the step, the lookout deck, the ramp and the pad rim in one frame (connect_route.py).
    route: {
        camera: null,
        anchor: null,
        fallback: { position: [11.0, 3.4, 10.2], target: [9.2, 0.6, 4.6], fov: 46 },
        shift: [0, 0],
        tall: [0, 0],
    },
    // The water flow pair: the pond outlet, the stream, the lip and the top of the ribbon.
    water: {
        camera: null,
        anchor: null,
        fallback: { position: [12.5, 5.5, 17.5], target: [4.6, -0.6, 8.0], fov: 42 },
        shift: [0, 0],
        tall: [0, 0],
    },
}
// ?pose=x,y,z,tx,ty,tz,fov adds a trial shot, so a framing search can render a candidate
// view without an edit to stops.js.
const pose = params.get('pose')?.split(',').map(Number)
if (pose?.length === 7 && pose.every(Number.isFinite)) {
    LAB_STOPS.trial = { camera: null, anchor: null, fallback: { position: pose.slice(0, 3), target: pose.slice(3, 6), fov: pose[6] }, shift: [0, 0], tall: [0, 0] }
    params.set('cam', 'trial')
}
if (LAB_STOPS[params.get('cam')]) stops[params.get('cam')] = LAB_STOPS[params.get('cam')]
const startStop = stops[params.get('cam')] ? params.get('cam') : 'overview'

const canvas = document.getElementById('lab')
const hud = document.getElementById('hud')
const controlsBar = document.getElementById('controls')

let gpu = null
let frames = 0
// A pending still capture. The canvas keeps no drawing buffer, so the PNG must be read
// right after the render that drew it.
let capture = null
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
            if (capture) {
                capture(canvas.toDataURL('image/png'))
                capture = null
            }
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
        `aerie lab  ${manager.lod === 1 ? 'island_b_lod1.glb' : 'island_b.glb'}  ${currentStop}`,
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
        // lab.capture() resolves with a PNG data URL of the next frame, without the HUD.
        window.lab = {
            manager,
            capture: (advance = 0) =>
                new Promise((resolve) => {
                    capture = resolve
                    manager.renderNow(advance)
                }),
        }
    })
    .catch((error) => {
        hud.textContent = `lab failed to start: ${error.message}`
        throw error
    })

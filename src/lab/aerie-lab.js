import * as THREE from 'three'
import { createSceneManager } from '../scene/scene-manager.js'
import { stops } from '../data/stops.js'
import { TIERS } from '../scene/aerie/quality.js'
import { LOOK_OPTIONS, SITE_LOOK } from '../scene/aerie/look-options.js'
import { NIGHT_SKY } from '../scene/aerie/sky.js'
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
// True while the lab shows the skill sky through the telescope.
let skyOn = false

// Look options (look-options.js). ?look=ink,bands picks the mix at load, and without it the
// lab starts on the site look. ?look=none starts on the base night look.
const looks = params.has('look')
    ? new Set(params.get('look').split(',').filter((name) => LOOK_OPTIONS.includes(name)))
    : new Set(SITE_LOOK)
// Sets the look uniforms for one set of options. It draws nothing.
function setLooks(set) {
    const control = manager.lookControl
    if (!control) return false
    control.apply(set, manager.pipeline.grade.uniforms)
    return true
}
// Void colour trials for the sky, the haze and the space under the island. ?void=<name>
// picks one at load. plum is the site colour. The lab writes the shared NIGHT_SKY colours, so
// the sky, the haze, the city veil and the fog all follow.
const VOIDS = {
    plum: { zenith: 0x0f1440, horizon: 0x342f60, haze: 0x4e3f4c, cityGlow: 0x66545c, hazeBand: 0x6e5c64, hazeDeep: 0x18152e },
    indigo: { zenith: 0x0a1238, horizon: 0x1f2a5c, haze: 0x2e3556, cityGlow: 0x4a4a6a, hazeBand: 0x4c5578, hazeDeep: 0x0c1028 },
    teal: { zenith: 0x07162a, horizon: 0x143a4e, haze: 0x1f3c48, cityGlow: 0x3c5a5e, hazeBand: 0x3f6268, hazeDeep: 0x081620 },
    ember: { zenith: 0x1a1438, horizon: 0x4a2f52, haze: 0x5a3a40, cityGlow: 0x7a4e48, hazeBand: 0x8a5a50, hazeDeep: 0x1c1220 },
    ink: { zenith: 0x05070f, horizon: 0x151a2c, haze: 0x1a1c26, cityGlow: 0x2e2c34, hazeBand: 0x30303c, hazeDeep: 0x06070c },
}
let currentVoid = VOIDS[params.get('void')] ? params.get('void') : 'plum'
function applyVoid(name) {
    currentVoid = name
    Object.entries(VOIDS[name]).forEach(([key, hex]) => NIGHT_SKY[key].set(hex))
    manager.scene.fog.color.copy(NIGHT_SKY.haze)
    manager.requestRender()
}

// ?compare splits the frame: the site look left of the bar, the picked mix right of it.
// ?compare&left=none puts the base night look on the left.
// The wrapped pipeline draws the frame twice under two scissors. A render target keeps its own
// scissor, so only the last pass to the screen takes the cut, and the passes before it draw in full.
const compare = params.has('compare')
let cut = 0.5
const LEFT = params.get('left') === 'none' ? new Set() : SITE_LOOK
function wrapPipeline() {
    const pipeline = manager.pipeline
    if (!compare || pipeline.split) return
    const draw = pipeline.render
    pipeline.split = true
    pipeline.render = () => {
        const renderer = manager.renderer
        const size = renderer.getSize(new THREE.Vector2())
        const left = Math.round(size.x * cut)
        renderer.setScissorTest(true)
        if (setLooks(LEFT)) {
            renderer.setScissor(0, 0, left, size.y)
            draw()
        }
        setLooks(looks)
        renderer.setScissor(left, 0, size.x - left, size.y)
        draw()
        renderer.setScissorTest(false)
    }
}
function applyLooks() {
    wrapPipeline()
    manager.setLook(looks)
}
if (compare) {
    hud.style.display = 'none'
    const bar = document.createElement('div')
    bar.style.cssText = 'position:fixed;top:0;bottom:0;width:14px;margin-left:-7px;cursor:ew-resize;z-index:5;touch-action:none;'
    bar.innerHTML = '<div style="position:absolute;left:6px;top:0;bottom:0;width:2px;background:#ffb36b"></div>' +
        `<div style="position:absolute;top:8px;right:16px;font:11px ui-monospace,monospace;color:#ffd8b0;background:rgba(3,12,26,.7);padding:2px 6px;border-radius:4px;white-space:nowrap">${LEFT.size ? 'site' : 'base'}</div>` +
        '<div id="mixtag" style="position:absolute;top:8px;left:16px;font:11px ui-monospace,monospace;color:#ffd8b0;background:rgba(3,12,26,.7);padding:2px 6px;border-radius:4px;white-space:nowrap">mix</div>'
    const place = () => (bar.style.left = `${cut * 100}%`)
    place()
    bar.addEventListener('pointerdown', (e) => {
        bar.setPointerCapture(e.pointerId)
        e.stopPropagation()
    })
    bar.addEventListener('pointermove', (e) => {
        if (!bar.hasPointerCapture(e.pointerId)) return
        cut = Math.min(0.98, Math.max(0.02, e.clientX / innerWidth))
        place()
        manager.requestRender()
    })
    document.body.appendChild(bar)
}
function button(label, pressed, onClick) {
    const el = document.createElement('button')
    el.textContent = label
    el.setAttribute('aria-pressed', String(pressed))
    el.addEventListener('click', onClick)
    return el
}

function buildControls() {
    const tag = document.getElementById('mixtag')
    if (tag) tag.textContent = [...looks].join(' + ') || 'pick options below'
    const tier = manager.tier.index
    controlsBar.replaceChildren(
        ...Object.keys(stops).map((id) =>
            button(id, currentStop === id, () => {
                currentStop = id
                manager.goTo(id)
                buildControls()
            })
        ),
        // Plays the move through the eyepiece to the skill sky, and back to the current stop.
        button('look through', skyOn, () => {
            skyOn = !skyOn
            manager.lookThrough(skyOn, currentStop)
            buildControls()
        }),
        ...TIERS.map((t, i) =>
            button(t.name, tier === i, () => {
                manager.setQuality(i)
                applyLooks()
                buildControls()
            })
        ),
        ...Object.keys(VOIDS).map((name) =>
            button(`void:${name}`, currentVoid === name, () => {
                applyVoid(name)
                buildControls()
            })
        ),
        ...LOOK_OPTIONS.map((name) =>
            button(`+${name}`, looks.has(name), () => {
                if (looks.has(name)) looks.delete(name)
                else looks.add(name)
                applyLooks()
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
        `aerie lab  ${manager.lod === 1 ? 'island_b_lod1.glb' : 'island_b.glb'}  ${currentStop}  look ${[...looks].join('+') || 'base'}`,
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
canvas.addEventListener('pointerleave', () => manager.clearPointer())
canvas.addEventListener('wheel', (e) => manager.zoom(e.deltaY < 0 ? 1.08 : 1 / 1.08), { passive: true })

manager.ready
    .then(() => {
        applyLooks()
        if (currentVoid !== 'plum') applyVoid(currentVoid)
        buildControls()
        writeHud()
        setInterval(writeHud, 500)
        // lab.capture() resolves with a PNG data URL of the next frame, without the HUD.
        window.lab = {
            manager,
            setLooks: (names) => {
                looks.clear()
                names.filter((name) => LOOK_OPTIONS.includes(name)).forEach((name) => looks.add(name))
                applyLooks()
                buildControls()
            },
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

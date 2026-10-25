import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import desktopUrl from '../assets/models/island_b.glb?url'
import mobileUrl from '../assets/models/island_b_lod1.glb?url'
import { createLoaders } from '../scene/loaders.js'
import { applyIslandLook } from '../scene/aerie/island-look.js'
import { createGlowSprites } from '../scene/aerie/glow-sprites.js'
import { createCityBackdrop } from '../scene/aerie/city-backdrop.js'
import { createSky, NIGHT_SKY } from '../scene/aerie/sky.js'
import { TIERS, BUDGET_MS, startTier, createPipeline, createGovernor } from '../scene/aerie/quality.js'
import { createGpuTimer } from './gpu-timer.js'

// Dev-only lab for the watercolour look on the urban aerie island. Open
// /lab/watercolour.html on the dev server. The live site does not load this file.
// Query options: ?lod=0|1 picks the GLB, ?tier=0..3 pins a tier, ?still renders one frame,
// ?cam=<name> picks the start camera.

const params = new URLSearchParams(location.search)
const mobile = window.matchMedia('(max-width: 767px)').matches
const lod = params.has('lod') ? Number(params.get('lod')) : mobile ? 1 : 0
const reducedMotion = params.has('still') || window.matchMedia('(prefers-reduced-motion: reduce)').matches
const pinnedTier = params.has('tier') ? THREE.MathUtils.clamp(Number(params.get('tier')), 0, TIERS.length - 1) : null

const canvas = document.getElementById('lab')
const hud = document.getElementById('hud')
const controlsBar = document.getElementById('controls')

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
renderer.setSize(window.innerWidth, window.innerHeight, false)
// The watercolour pass tone maps and encodes sRGB itself, so the renderer does neither.
renderer.toneMapping = THREE.NoToneMapping
renderer.info.autoReset = false
const gpu = createGpuTimer(renderer.getContext())

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 12000)
const orbit = new OrbitControls(camera, canvas)
orbit.enableDamping = !reducedMotion

// The arrival view from island_b_rolling_rim.blend (NA_Arrival_ThreeQuarter), turned from
// Blender Z-up to the glTF Y-up frame. It looks down far enough to show the city.
const ARRIVAL = {
    name: 'Arrival',
    position: new THREE.Vector3(34, 12, 36),
    forward: new THREE.Vector3(-0.596, -0.298, -0.745),
    fov: 50,
}

let tierIndex = pinnedTier ?? startTier(mobile)
let pipeline = null
let glow = null
let city = null
let presets = []

const setTier = (index) => {
    tierIndex = index
    pipeline?.dispose()
    pipeline = createPipeline({ renderer, scene, camera, tier: TIERS[index] })
    glow?.resize(renderer.getDrawingBufferSize(new THREE.Vector2()).y, camera)
    buildControls()
    requestRender()
}

const governor = createGovernor({
    budgetMs: mobile ? BUDGET_MS.mobile : BUDGET_MS.desktop,
    tier: tierIndex,
    onStep: (next, median) => {
        stats.lastStep = `stepped to ${TIERS[next].name} at median ${median.toFixed(1)} ms`
        setTier(next)
    },
})

function applyPreset(preset) {
    camera.position.copy(preset.position)
    camera.fov = preset.fov
    camera.updateProjectionMatrix()
    // Orbit around the point where the view line passes closest to the island centre.
    const along = Math.max(3, -preset.position.dot(preset.forward))
    orbit.target.copy(preset.position).addScaledVector(preset.forward, along)
    camera.lookAt(orbit.target)
    orbit.update()
    glow?.resize(renderer.getDrawingBufferSize(new THREE.Vector2()).y, camera)
    stats.camera = preset.name
    buildControls()
    requestRender()
}

function presetsFrom(gltf) {
    const fromGltf = gltf.cameras.map((cam) => ({
        name: cam.name.replace(/^Cam_\d+_/, ''),
        position: cam.getWorldPosition(new THREE.Vector3()),
        forward: new THREE.Vector3(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion())),
        fov: cam.fov,
    }))
    return [ARRIVAL, ...fromGltf]
}

function button(label, pressed, onClick) {
    const el = document.createElement('button')
    el.textContent = label
    el.setAttribute('aria-pressed', String(pressed))
    el.addEventListener('click', onClick)
    return el
}

function buildControls() {
    controlsBar.replaceChildren(
        ...presets.map((preset) => button(preset.name, stats.camera === preset.name, () => applyPreset(preset))),
        ...TIERS.map((tier, i) => button(tier.name, tierIndex === i, () => setTier(i))),
        button(`lod${lod === 1 ? 0 : 1}`, false, () => {
            params.set('lod', lod === 1 ? '0' : '1')
            location.search = params.toString()
        })
    )
}

const stats = { camera: '', frames: 0, cpu: 0, gpu: null, lastStep: '', frameMs: 0, info: null }
const clock = new THREE.Clock()
let accumulated = 0
let lastHud = 0

function drawFrame() {
    const delta = clock.getDelta()
    const seconds = reducedMotion ? 0 : clock.elapsedTime
    if (orbit.enableDamping) orbit.update()
    city?.update(seconds)
    glow?.update(seconds)

    renderer.info.reset()
    const start = performance.now()
    gpu.begin()
    pipeline.render()
    gpu.end()
    stats.cpu = performance.now() - start
    stats.info = {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
        programs: renderer.info.programs.length,
        textures: renderer.info.memory.textures,
        geometries: renderer.info.memory.geometries,
    }
    stats.gpu = gpu.poll()

    if (!reducedMotion) {
        const frameMs = delta * 1000
        stats.frames += 1
        accumulated += frameMs
        if (pinnedTier === null && stats.frames > 30) governor.sample(frameMs, performance.now())
    }
    const now = performance.now()
    if (now - lastHud > 500 || reducedMotion) {
        stats.frameMs = stats.frames ? accumulated / stats.frames : 0
        stats.frames = 0
        accumulated = 0
        lastHud = now
        writeHud()
    }
}

function writeHud() {
    const tier = TIERS[tierIndex]
    const info = stats.info ?? {}
    hud.textContent = [
        `watercolour lab  ${lod === 1 ? 'island_b_lod1.glb' : 'island_b.glb'}  ${stats.camera}`,
        `tier ${tier.name}  msaa ${tier.samples}  dpr ${pipeline.pixelRatio}  ${reducedMotion ? 'still' : 'loop'}`,
        `frame ${stats.frameMs.toFixed(2)} ms  cpu submit ${stats.cpu.toFixed(2)} ms  gpu ${stats.gpu === null ? 'n/a' : stats.gpu.toFixed(2) + ' ms'}`,
        `calls ${info.calls}  tris ${info.triangles}  points ${info.points}`,
        `programs ${info.programs}  textures ${info.textures}  geometries ${info.geometries}`,
        `glows ${glow?.count ?? 0}  city ${city ? (city.bytes / 1000).toFixed(1) : 0} kB`,
        stats.lastStep,
    ]
        .filter(Boolean)
        .join('\n')
}

let pending = false
function requestRender() {
    if (!reducedMotion || pending || !pipeline) return
    pending = true
    requestAnimationFrame(() => {
        pending = false
        drawFrame()
    })
}

function resize() {
    const width = window.innerWidth
    const height = window.innerHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    pipeline?.resize(width, height)
    glow?.resize(renderer.getDrawingBufferSize(new THREE.Vector2()).y, camera)
    requestRender()
}

async function start() {
    const { gltf: gltfLoader, texture: textureLoader } = createLoaders()
    const gltf = await gltfLoader.loadAsync(lod === 1 ? mobileUrl : desktopUrl)
    const look = applyIslandLook(gltf)
    scene.add(gltf.scene)

    const sky = createSky()
    scene.add(sky.mesh)
    city = createCityBackdrop({
        textureLoader,
        haze: NIGHT_SKY.haze,
        maxAnisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()),
    })
    scene.add(city.group)
    glow = createGlowSprites(look.glowSpots, { reducedMotion })
    scene.add(glow.points)

    presets = presetsFrom(gltf)
    setTier(tierIndex)
    const wanted = params.get('cam')
    applyPreset(presets.find((p) => p.name.toLowerCase() === wanted?.toLowerCase()) ?? presets[0])

    window.addEventListener('resize', resize)
    orbit.addEventListener('change', requestRender)
    if (reducedMotion) {
        // Textures arrive after the first frame, so draw once more when they land.
        textureLoader.manager.onLoad = requestRender
        requestRender()
    } else {
        renderer.setAnimationLoop(drawFrame)
        document.addEventListener('visibilitychange', () => {
            renderer.setAnimationLoop(document.hidden ? null : drawFrame)
            clock.getDelta()
        })
    }
    // The lab exposes its parts for console checks.
    window.lab = { renderer, scene, camera, look, city, glow, stats, setTier, applyPreset, presets }
}

start().catch((error) => {
    hud.textContent = `lab failed to start: ${error.message}`
    throw error
})

import * as THREE from 'three'
import desktopUrl from '../assets/models/island_b.glb?url'
import mobileUrl from '../assets/models/island_b_lod1.glb?url'
import { stops } from '../data/stops.js'
import { createLoaders, disposeLoaders } from './loaders.js'
import { applyIslandLook } from './aerie/island-look.js'
import { createGlowSprites } from './aerie/glow-sprites.js'
import { createCityBackdrop } from './aerie/city-backdrop.js'
import { createSky, NIGHT_SKY } from './aerie/sky.js'
import { createStars } from './aerie/stars.js'
import { createWaterfall } from './aerie/waterfall.js'
import { createCampfire, findCampfireSpot } from './aerie/campfire.js'
import { createMoonShadow, markShadows, configureShadows } from './aerie/moon-shadow.js'
import { createCameraRig, shotsFromStops } from './aerie/camera-rig.js'
import { TIERS, BUDGET_MS, startTier, createPipeline, createGovernor } from './aerie/quality.js'

// The scene layer behind one small API: init, goTo, setQuality, pause, resume and dispose.
// It has no Vue import, so the site shell and the lab both drive it.
//
// It renders on demand. A frame draws when the camera moves, when something asks for one,
// or on the ambient clock (twinkle, mist and water) at AMBIENT_FPS. Reduced motion draws
// single frames only.

const AMBIENT_FPS = 30
const MOBILE = '(max-width: 767px)'
// A moon direction for the shadow and the toon ramp until the GLB anchor is read.
const MOON_FALLBACK = new THREE.Vector3(-28, 71, 24)

// hooks.before and hooks.after run around each render, for the lab's GPU timer.
export function createSceneManager({ canvas, reducedMotion = false, lod = null, tier = null, onProgress = () => {}, start = 'overview', hooks = {} }) {
    const small = window.matchMedia(MOBILE).matches
    const useLod = lod ?? (small ? 1 : 0)
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    renderer.toneMapping = THREE.NoToneMapping
    // The scene draws into a linear half-float target, and the composite pass encodes sRGB
    // itself. A linear output space makes compileAsync build the same programs the target
    // uses, instead of a second set for the screen.
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    renderer.info.autoReset = false
    configureShadows(renderer)
    const size = () => [canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight]
    renderer.setSize(...size(), false)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, size()[0] / size()[1], 0.1, 12000)
    const rig = createCameraRig({ camera, shots: shotsFromStops(stops), start })

    const state = { wanted: false, hidden: document.hidden, lost: false, ready: false, reduced: reducedMotion, dirty: true }
    const parts = { glow: null, waterfall: null, stars: null, city: null, sky: null, campfire: null, look: null }
    const loaders = createLoaders()
    const clock = new THREE.Clock(false)
    let seconds = 0
    let ambient = 0
    let tierIndex = tier ?? startTier(small)
    let pipeline = null
    let submits = []

    const bufferHeight = () => renderer.getDrawingBufferSize(new THREE.Vector2()).y
    const resizeSprites = () => {
        parts.glow?.resize(bufferHeight(), camera)
        parts.waterfall?.resize(bufferHeight(), camera)
        parts.stars?.setPixelRatio(renderer.getPixelRatio())
    }

    const buildPipeline = (index) => {
        tierIndex = index
        pipeline?.dispose()
        pipeline = createPipeline({ renderer, scene, camera, tier: TIERS[index] })
        resizeSprites()
        state.dirty = true
    }

    const governor = createGovernor({
        budgetMs: small ? BUDGET_MS.mobile : BUDGET_MS.desktop,
        tier: tierIndex,
        onStep: (next) => buildPipeline(next),
    })

    const render = () => {
        renderer.info.reset()
        hooks.before?.()
        const begin = performance.now()
        pipeline.render()
        submits.push(performance.now() - begin)
        if (submits.length > 120) submits = submits.slice(-60)
        hooks.after?.()
        state.dirty = false
    }

    const running = () => state.ready && state.wanted && !state.hidden && !state.lost && !state.reduced

    // One frame on the next animation frame, for reduced motion and single changes.
    let pending = false
    const requestRender = () => {
        state.dirty = true
        if (running() || pending || !state.ready || state.hidden || state.lost) return
        pending = true
        requestAnimationFrame(() => {
            pending = false
            rig.update(0)
            render()
        })
    }

    const tick = () => {
        const delta = Math.min(clock.getDelta(), 0.1)
        seconds += delta
        ambient += delta
        rig.update(delta)
        const tickAmbient = ambient >= 1 / AMBIENT_FPS
        if (!rig.moving && !state.dirty && !tickAmbient) return
        if (tickAmbient) {
            parts.city?.update(seconds)
            parts.glow?.update(seconds)
            parts.waterfall?.update(seconds)
            parts.stars?.update(seconds)
            parts.campfire?.update(ambient, seconds)
            ambient = 0
        }
        const moving = rig.moving
        render()
        // Only frames the camera drives count toward the governor. They draw on every
        // animation frame, so the time between them is the real frame time. The 30 fps
        // ambient clock would read as a slow device.
        if (moving && tier === null) governor.sample(delta * 1000, performance.now())
    }

    const update = () => {
        if (running()) {
            clock.start()
            renderer.setAnimationLoop(tick)
        } else {
            renderer.setAnimationLoop(null)
            clock.stop()
            if (state.reduced) requestRender()
        }
    }

    const resize = () => {
        const [width, height] = size()
        if (!width || !height) return
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height, false)
        pipeline?.resize(width, height)
        rig.resize()
        resizeSprites()
        requestRender()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const onVisibility = () => {
        state.hidden = document.hidden
        update()
    }
    document.addEventListener('visibilitychange', onVisibility)
    const onLost = (event) => {
        event.preventDefault()
        state.lost = true
        update()
    }
    const onRestored = () => {
        state.lost = false
        renderer.shadowMap.needsUpdate = true
        update()
        requestRender()
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    const anchor = (root, name) => root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()) ?? null

    // The parts that need no download draw first, so the night sky shows at once.
    parts.sky = createSky()
    parts.stars = createStars({ small, pixelRatio: renderer.getPixelRatio() })
    parts.city = createCityBackdrop({
        textureLoader: loaders.texture,
        haze: NIGHT_SKY.haze,
        maxAnisotropy: Math.min(4, renderer.capabilities.getMaxAnisotropy()),
    })
    scene.add(parts.sky.mesh, parts.stars.points, parts.city.group)
    buildPipeline(tierIndex)

    let islandBytes = 0
    const report = (files) => onProgress(Math.min(1, 0.7 * islandBytes + 0.3 * files))
    loaders.manager.onProgress = (url, loaded, total) => report(total ? loaded / total : 0)

    const ready = loaders.gltf
        .loadAsync(useLod === 1 ? mobileUrl : desktopUrl, (event) => {
            if (event.lengthComputable) islandBytes = event.loaded / event.total
            report(0)
        })
        .then(async (gltf) => {
            const look = applyIslandLook(gltf)
            parts.look = look
            markShadows(gltf.scene)
            const root = gltf.scene
            const moon = anchor(root, 'Anchor_Moon') ?? MOON_FALLBACK
            const shadow = createMoonShadow({ direction: moon, small })
            scene.add(root, shadow, shadow.target)

            const spot = anchor(root, 'Anchor_Campfire') ?? findCampfireSpot(root)
            if (spot) {
                parts.campfire = createCampfire({ position: spot, bounce: look.uniforms.uToonBounce.value[4] })
                scene.add(parts.campfire.group)
            }
            const glows = parts.campfire ? [...look.glowSpots, parts.campfire.glowSpot] : look.glowSpots
            parts.glow = createGlowSprites(glows, { reducedMotion: state.reduced })
            scene.add(parts.glow.points)

            const top = anchor(root, 'Anchor_Waterfall_Top')
            const base = anchor(root, 'Anchor_Waterfall_Base')
            if (top && base) {
                parts.waterfall = createWaterfall({ top, base, haze: NIGHT_SKY.haze })
                scene.add(parts.waterfall.group)
            }

            rig.setShots(shotsFromStops(stops, gltf.cameras))
            resizeSprites()
            // Compile every program before the reveal, so the first moves do not stall.
            await renderer.compileAsync(scene, camera)
            renderer.shadowMap.needsUpdate = true
            state.ready = true
            onProgress(1)
            update()
            requestRender()
            return { anchors: (name) => anchor(root, name), root, gltf }
        })

    const api = {
        ready,
        renderer,
        scene,
        camera,
        rig,
        parts,
        loaders,
        goTo: (id, { duration = 1.6 } = {}) => {
            rig.goTo(id, state.reduced ? 0 : duration)
            requestRender()
        },
        setQuality: (index) => buildPipeline(THREE.MathUtils.clamp(index, 0, TIERS.length - 1)),
        setReducedMotion: (value) => {
            state.reduced = value
            update()
        },
        pause: () => {
            state.wanted = false
            update()
        },
        resume: () => {
            state.wanted = true
            update()
        },
        pan: (dx, dy) => {
            rig.pan(dx, dy)
            requestRender()
        },
        zoom: (factor) => {
            rig.zoom(factor)
            requestRender()
        },
        release: () => {
            rig.release()
            requestRender()
        },
        setPointer: (x, y) => {
            if (!state.reduced) rig.setPointer(x, y)
        },
        requestRender,
        get tier() {
            return { index: tierIndex, ...TIERS[tierIndex], pixelRatio: pipeline.pixelRatio }
        },
        // CPU time to submit one frame, averaged over the recent frames.
        get submitMs() {
            return submits.length ? submits.reduce((a, b) => a + b, 0) / submits.length : 0
        },
        get lod() {
            return useLod
        },
        dispose: () => {
            renderer.setAnimationLoop(null)
            observer.disconnect()
            document.removeEventListener('visibilitychange', onVisibility)
            canvas.removeEventListener('webglcontextlost', onLost)
            canvas.removeEventListener('webglcontextrestored', onRestored)
            rig.dispose()
            Object.values(parts).forEach((part) => part?.dispose?.())
            pipeline?.dispose()
            disposeLoaders(loaders)
            renderer.dispose()
        },
    }
    return api
}

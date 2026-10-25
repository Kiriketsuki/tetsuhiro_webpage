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
import { createSkyTaxi, findDeck } from './aerie/sky-taxi.js'
import { createCorkboard, findBoard } from './aerie/corkboard.js'
import { createConstellation } from './aerie/constellation.js'
import { projects } from '../data/projects.js'
import { createCameraRig, shotsFromStops } from './aerie/camera-rig.js'
import { TIERS, BUDGET_MS, startTier, createPipeline, createGovernor } from './aerie/quality.js'

// The scene layer behind one small API: init, goTo, setQuality, pause, resume and dispose.
// It has no Vue import, so the site shell and the lab both drive it.
//
// It renders on demand. A frame draws when the camera moves, when something asks for one,
// or on the ambient clock (twinkle, mist and water) at AMBIENT_FPS. Reduced motion draws
// single frames only.

const AMBIENT_FPS = 30
// The sky-taxi flight, and the move from the pad to the first stop after it lands.
const ARRIVAL_FLIGHT = 4.2
const ARRIVAL_SETTLE = 2.2
// The rain on the bedroom window lasts for the move plus this long after it.
const RAIN_LINGER = 1.4
// The board size when Anchor_Corkboard gives a position but no size, in metres.
const BOARD_SIZE = { width: 1.0, height: 0.7 }
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
    const parts = { glow: null, waterfall: null, stars: null, city: null, sky: null, campfire: null, look: null, taxi: null, cards: null, constellation: null }
    let arrival = null
    let rain = null
    // 'island' or 'sky'. The sky is the telescope's view of the skills.
    let view = 'island'
    const loaders = createLoaders()
    const clock = new THREE.Clock(false)
    let seconds = 0
    let ambient = 0
    let ambientFps = AMBIENT_FPS
    let tierIndex = tier ?? startTier(small)
    let pipeline = null
    let submits = []

    const bufferHeight = () => renderer.getDrawingBufferSize(new THREE.Vector2()).y
    const resizeSprites = () => {
        parts.glow?.resize(bufferHeight(), camera)
        parts.waterfall?.resize(bufferHeight(), camera)
        parts.stars?.setPixelRatio(renderer.getPixelRatio())
        parts.constellation?.setPixelRatio(renderer.getPixelRatio())
    }

    const buildPipeline = (index) => {
        tierIndex = index
        pipeline?.dispose()
        pipeline = createPipeline({ renderer, scene, camera, tier: TIERS[index] })
        if (view === 'sky' && parts.constellation) pipeline.setView(parts.constellation.scene, parts.constellation.camera)
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

    // The taxi flight, the arrival hand-off and the rain envelope. Returns true while any of
    // them needs frames.
    const advanceEffects = (delta) => {
        const flying = parts.taxi?.update(delta) ?? false
        const revealing = view === 'sky' ? parts.constellation.update(delta, seconds) : false
        if (arrival) {
            arrival.t += delta
            if (arrival.t >= ARRIVAL_FLIGHT) {
                rig.goTo(arrival.next, ARRIVAL_SETTLE)
                arrival = null
            }
        }
        let wet = false
        if (rain) {
            rain.t += delta
            const k = rain.t / rain.duration
            // Up fast, a long hold, then the glass clears as the camera settles in the room.
            const amount = k >= 1 ? 0 : Math.min(1, k * 5) * (1 - THREE.MathUtils.smoothstep(k, 0.6, 1))
            pipeline.watercolour.uniforms.uRain.value = amount
            pipeline.watercolour.uniforms.uTime.value = seconds
            if (k >= 1) rain = null
            wet = true
        }
        return flying || revealing || Boolean(arrival) || wet
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
        const effects = advanceEffects(delta)
        const tickAmbient = ambientFps > 0 && ambient >= 1 / ambientFps
        if (!rig.moving && !effects && !state.dirty && !tickAmbient) return
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
        parts.constellation?.resize(width / height)
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

    // Anchor_Corkboard faces out along its local +Z in the glTF frame. Without the anchor,
    // a ray from the workshop camera finds the board.
    const boardFrom = (root, cameras) => {
        const node = root.getObjectByName('Anchor_Corkboard')
        if (node) {
            const normal = new THREE.Vector3(0, 0, 1).transformDirection(node.matrixWorld)
            const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize()
            return { centre: node.getWorldPosition(new THREE.Vector3()), normal, right, up: new THREE.Vector3().crossVectors(normal, right), ...BOARD_SIZE }
        }
        const camera = cameras.find((c) => c.name === stops.workshop.camera)
        return camera ? findBoard(root, camera) : null
    }

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

            const padAnchor = anchor(root, 'Anchor_Pad')
            if (padAnchor) {
                parts.taxi = createSkyTaxi({ deck: findDeck(root, padAnchor), material: look.materials[0] })
                scene.add(parts.taxi.group)
            }

            const board = boardFrom(root, gltf.cameras)
            if (board) {
                // The card atlas uses the site fonts, so it waits for them.
                await Promise.all([document.fonts.load('52px "Instrument Serif"'), document.fonts.load('22px "JetBrains Mono"')]).catch(() => {})
                parts.cards = createCorkboard({ board, projects })
                scene.add(parts.cards.mesh)
            }

            await document.fonts.load('30px "JetBrains Mono"').catch(() => {})
            parts.constellation = createConstellation({ pixelRatio: renderer.getPixelRatio(), small })
            parts.constellation.resize(camera.aspect)

            rig.setShots(shotsFromStops(stops, gltf.cameras))
            resizeSprites()
            // Compile every program before the reveal, so the first moves and the first look
            // through the telescope do not stall.
            await renderer.compileAsync(scene, camera)
            await renderer.compileAsync(parts.constellation.scene, parts.constellation.camera)
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
            arrival = null
            const time = state.reduced ? 0 : duration
            if (id === 'bedroom' && time > 0 && rig.current !== 'bedroom') rain = { t: 0, duration: time + RAIN_LINGER }
            rig.goTo(id, time)
            requestRender()
        },
        // The gate lift: the taxi flies in and lands on the pad while the camera follows,
        // then the camera moves on to `next`. Reduced motion parks the taxi and cuts.
        arrive: (next) => {
            if (state.reduced || !parts.taxi) {
                parts.taxi?.park()
                rig.goTo(next, 0)
                requestRender()
                return
            }
            parts.taxi.fly(ARRIVAL_FLIGHT)
            rig.goTo('pad', ARRIVAL_FLIGHT)
            arrival = { t: 0, next }
            requestRender()
        },
        // 0 stops the ambient clock: frames then draw only for camera moves and requests.
        setAmbientFps: (fps) => {
            ambientFps = fps
            ambient = 0
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
            if (view === 'sky') parts.constellation.pan(dx, dy)
            else rig.pan(dx, dy)
            requestRender()
        },
        zoom: (factor) => {
            if (view === 'sky') parts.constellation.zoom(factor)
            else rig.zoom(factor)
            requestRender()
        },
        // Swaps the picture between the island and the skill sky. `reveal` lights the stars
        // up in order. Without it they all show at once.
        showSky: (on, { reveal = true } = {}) => {
            if (!parts.constellation) return
            view = on ? 'sky' : 'island'
            if (on) {
                parts.constellation.open()
                if (!reveal || state.reduced) parts.constellation.showAll()
                pipeline.setView(parts.constellation.scene, parts.constellation.camera)
            } else {
                pipeline.setView(scene, camera)
            }
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

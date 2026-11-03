import * as THREE from 'three'
import desktopUrl from '../assets/models/island_b.glb?url'
import mobileUrl from '../assets/models/island_b_lod1.glb?url'
import { stops } from '../data/stops.js'
import { createLoaders, disposeLoaders } from './loaders.js'
import { applyIslandLook } from './aerie/island-look.js'
import { createDetailTexture } from './aerie/detail-texture.js'
import { createLeafCarpet } from './aerie/leaf-carpet.js'
import { createGlowSprites } from './aerie/glow-sprites.js'
import { createCityBackdrop } from './aerie/city-backdrop.js'
import { createSky, NIGHT_SKY, ISLAND_HAZE_DENSITY } from './aerie/sky.js'
import { CAMPFIRE_BOUNCE } from './aerie/toon-material.js'
import { createLeafCards } from './aerie/leaf-cards.js'
import { createStars } from './aerie/stars.js'
import { createWaterfall } from './aerie/waterfall.js'
import { createCampfire, findCampfireSpot } from './aerie/campfire.js'
import { createMoonShadow, markShadows, configureShadows } from './aerie/moon-shadow.js'
import { createCorkboard, findBoard } from './aerie/corkboard.js'
import { createConstellation } from './aerie/constellation.js'
import { projects } from '../data/projects.js'
import { createCameraRig, shotsFromStops } from './aerie/camera-rig.js'
import { TIERS, BUDGET_MS, startTier, createPipeline, createGovernor } from './aerie/quality.js'
import { createLookControl, SITE_LOOK } from './aerie/look-options.js'

// The scene layer behind one small API: init, goTo, setQuality, pause, resume and dispose.
// It has no Vue import, so the site shell and the lab both drive it.
//
// It renders on demand. A frame draws when the camera moves, when something asks for one,
// or on the ambient clock (twinkle and water) at AMBIENT_FPS. Reduced motion draws
// single frames only.

const AMBIENT_FPS = 30
// The share of the bedroom move that the fade takes to rise, and again to fall.
const FADE_EDGE = 0.35
// The look through the telescope, in seconds: the flight from the terrace to the eyepiece,
// the iris close and open, and how early the iris starts to close before the camera stops.
const SCOPE = { fly: 1.9, close: 0.5, open: 0.8, overlap: 0.3 }
// The board size when Anchor_Corkboard gives a position but no size, in metres.
const BOARD_SIZE = { width: 1.0, height: 0.7 }
const MOBILE = '(max-width: 767px)'
// A moon direction for the shadow and the toon ramp until the GLB anchor is read.
const MOON_FALLBACK = new THREE.Vector3(-28, 71, 24)
// The city haze density: the city loses about a fifth of its colour at the bottom of the
// overview frame and about two thirds at its centre.
const CITY_HAZE_DENSITY = 1 / 2400

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
    // The island haze matches the sky haze below the horizon and the city haze.
    scene.fog = new THREE.FogExp2(NIGHT_SKY.haze, ISLAND_HAZE_DENSITY)
    const camera = new THREE.PerspectiveCamera(35, size()[0] / size()[1], 0.1, 12000)
    const rig = createCameraRig({ camera, shots: shotsFromStops(stops), start })

    const state = { wanted: false, hidden: document.hidden, lost: false, ready: false, reduced: reducedMotion, dirty: true }
    const parts = { glow: null, waterfall: null, stars: null, city: null, sky: null, campfire: null, look: null, leaves: null, cards: null, constellation: null }
    // The even darkening during the move into the bedroom: { t, duration } while it runs.
    let fade = null
    // 'island' or 'sky'. The sky is the telescope's view of the skills.
    let view = 'island'
    // The move through the eyepiece while it runs: { t, on, legs, close, swap, end }.
    let scope = null
    const loaders = createLoaders()
    const clock = new THREE.Clock(false)
    let seconds = 0
    let ambient = 0
    let ambientFps = AMBIENT_FPS
    let tierIndex = tier ?? startTier(small)
    let pipeline = null
    // The look options in force (look-options.js). A new pipeline takes them again.
    // A phone has no cursor, and the lens costs too much at a phone pixel ratio.
    let lookSet = small ? new Set([...SITE_LOOK].filter((name) => name !== 'lens')) : SITE_LOOK
    // The pointer in uv, or null without one. The lens clears its blur a little around it.
    let cursor = null
    const lensCursor = { uv: new THREE.Vector2(0.5, 0.5), clear: 0, last: performance.now(), shown: -1 }
    let lookControl = null
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
        pipeline = createPipeline({ renderer, scene, camera, tier: TIERS[index], small })
        if (view === 'sky' && parts.constellation) pipeline.setView(parts.constellation.scene, parts.constellation.camera)
        lookControl?.apply(lookSet, pipeline.grade.uniforms)
        resizeSprites()
        state.dirty = true
    }

    const governor = createGovernor({
        budgetMs: small ? BUDGET_MS.mobile : BUDGET_MS.desktop,
        tier: tierIndex,
        onStep: (next) => buildPipeline(next),
    })

    // The lens follows the stop's focus point. It fades out during a move between stops, so the
    // flight stays clear. The cursor patch and the vignette centre ease after the pointer, so
    // they drift and never jump. --aerie-lens tells the focus ring in the shell how strong the
    // lens is, so the ring fades with it.
    const updateLens = () => {
        const now = performance.now()
        const k = state.reduced ? 1 : 1 - Math.exp(-Math.min(0.25, (now - lensCursor.last) / 1000) / 0.18)
        lensCursor.last = now
        const uniforms = pipeline.grade.uniforms
        const dof = lookSet.has('lens') && uniforms.uDepthOn.value && !scope ? 1 - Math.min(1, rig.travel * 1.6) : 0
        uniforms.uDof.value = dof
        uniforms.uFocus.value = rig.focus
        if (cursor) lensCursor.uv.lerp(cursor, k)
        lensCursor.clear += ((cursor ? 0.4 : 0) - lensCursor.clear) * k
        uniforms.uCursor.value.copy(lensCursor.uv)
        uniforms.uCursorClear.value = lensCursor.clear
        uniforms.uVignetteCentre.value.set(0.5 + 0.12 * (lensCursor.uv.x - 0.5) * lensCursor.clear * 2.5, 0.5 + 0.12 * (lensCursor.uv.y - 0.5) * lensCursor.clear * 2.5)
        uniforms.uVignette.value = (lookSet.has('split') ? 0.27 : 0.22) + 0.04 * dof
        const shown = Math.round(dof * 20) / 20
        if (shown !== lensCursor.shown) {
            lensCursor.shown = shown
            document.documentElement.style.setProperty('--aerie-lens', String(shown))
        }
    }

    const render = () => {
        renderer.info.reset()
        hooks.before?.()
        const begin = performance.now()
        updateLens()
        pipeline.render()
        submits.push(performance.now() - begin)
        if (submits.length > 120) submits = submits.slice(-60)
        hooks.after?.()
        state.dirty = false
    }

    // Swaps the picture between the island and the skill sky. `reveal` lights the stars up in
    // order. Without it they all show at once.
    const showSky = (on, { reveal = true } = {}) => {
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
    }

    // Steps the move through the eyepiece. Each leg starts the camera on its way when its time
    // comes. The iris closes, the picture swaps while it is shut, and the iris opens again.
    const stepScope = (delta) => {
        const s = scope
        s.t += delta
        while (s.legs.length && s.t >= s.legs[0][0]) {
            const [, id, duration] = s.legs.shift()
            rig.goTo(id, duration)
        }
        if (!s.swapped && s.t >= s.swap) {
            s.swapped = true
            showSky(s.on)
        }
        const k = s.t < s.swap ? (s.t - s.close) / SCOPE.close : 1 - (s.t - s.swap) / SCOPE.open
        pipeline.grade.uniforms.uIris.value = THREE.MathUtils.smoothstep(k, 0, 1)
        if (s.t >= s.swap + SCOPE.open && !s.legs.length) scope = null
        return true
    }

    // The eyepiece move, the skill sky reveal and the bedroom fade. Returns true while any of
    // them needs frames.
    const advanceEffects = (delta) => {
        const scoping = scope ? stepScope(delta) : false
        const revealing = view === 'sky' ? parts.constellation.update(delta, seconds) || scoping : scoping
        if (!fade) return revealing
        fade.t += delta
        const k = fade.t / fade.duration
        // It rises over the first part of the move, holds, and falls over the last part.
        const amount = k >= 1 ? 0 : THREE.MathUtils.smoothstep(k, 0, FADE_EDGE) * (1 - THREE.MathUtils.smoothstep(k, 1 - FADE_EDGE, 1))
        pipeline.grade.uniforms.uFade.value = amount
        if (k >= 1) fade = null
        return true
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
            parts.look?.update(seconds)
            parts.leaves?.update(seconds)
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
    parts.city = createCityBackdrop({ haze: NIGHT_SKY.haze, hazeDensity: CITY_HAZE_DENSITY, pixelRatio: () => renderer.getPixelRatio() })
    scene.add(parts.sky.mesh, parts.stars.points, parts.city.group)
    buildPipeline(tierIndex)

    // The painted detail texture and the leaf carpet build in small slices while the island
    // downloads.
    const detailBuild = createDetailTexture({ anisotropy: small ? 1 : Math.min(4, renderer.capabilities.getMaxAnisotropy()) })
    const carpetBuild = createLeafCarpet({ sliced: true })

    let islandBytes = 0
    const report = (files) => onProgress(Math.min(1, 0.7 * islandBytes + 0.3 * files))
    loaders.manager.onProgress = (url, loaded, total) => report(total ? loaded / total : 0)

    const ready = loaders.gltf
        .loadAsync(useLod === 1 ? mobileUrl : desktopUrl, (event) => {
            if (event.lengthComputable) islandBytes = event.loaded / event.total
            report(0)
        })
        .then(async (gltf) => {
            const look = applyIslandLook(gltf, { sky: NIGHT_SKY, detail: detailBuild, carpet: carpetBuild })
            parts.look = look
            lookControl = createLookControl(look.uniforms)
            lookControl.apply(lookSet, pipeline.grade.uniforms)
            markShadows(gltf.scene)
            const root = gltf.scene
            const moon = anchor(root, 'Anchor_Moon') ?? MOON_FALLBACK
            const shadow = createMoonShadow({ direction: moon, small })
            scene.add(root, shadow, shadow.target)
            const shots = shotsFromStops(stops, gltf.cameras, (name) => anchor(root, name))
            // The eyepiece looks only at the sky, so its shot places no crown cards.
            const viewpoints = Object.entries(shots).filter(([id]) => id !== 'eyepiece').map(([, shot]) => shot.position)
            parts.leaves = createLeafCards({
                meshes: look.meshes,
                litterAt: look.litterAt,
                uniforms: look.uniforms,
                small,
                viewpoints,
                maxAnisotropy: small ? 1 : renderer.capabilities.getMaxAnisotropy(),
            })
            scene.add(parts.leaves.group)

            const spot = anchor(root, 'Anchor_Campfire') ?? findCampfireSpot(root)
            if (spot) {
                parts.campfire = createCampfire({ position: spot, bounce: look.uniforms.uToonBounce.value[CAMPFIRE_BOUNCE] })
                scene.add(parts.campfire.group)
            }
            const glows = parts.campfire ? [...look.glowSpots, parts.campfire.glowSpot] : look.glowSpots
            parts.glow = createGlowSprites(glows, { reducedMotion: state.reduced })
            scene.add(parts.glow.points)

            const top = anchor(root, 'Anchor_Waterfall_Top')
            const base = anchor(root, 'Anchor_Waterfall_Base')
            // The ribbon starts on the stream mouth that applyIslandLook found. The two anchors
            // only build a fallback mouth when the water mesh gave none.
            if (look.waterMouth || (top && base)) {
                parts.waterfall = createWaterfall({ mouth: look.waterMouth, top, base })
                scene.add(parts.waterfall.group)
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

            rig.setShots(shots)
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
            const time = state.reduced ? 0 : duration
            fade = id === 'bedroom' && time > 0 && rig.current !== 'bedroom' ? { t: 0, duration: time } : null
            pipeline.grade.uniforms.uFade.value = 0
            rig.goTo(id, time)
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
        showSky,
        // The look through the telescope. The camera flies up to the eyepiece (by way of the
        // terrace from any other stop), the iris closes, and it opens on the skill sky. Off
        // plays it in reverse and flies on to the stop `back`. Reduced motion swaps at once,
        // and src/three.js crossfades the frame.
        lookThrough: (on, back = 'telescope') => {
            const iris = pipeline.grade.uniforms.uIris
            // A visitor who leaves while the iris still opens on the sky gets a close from
            // where the blades are, not a jump back to fully open.
            const from = iris.value
            iris.value = 0
            scope = null
            if (on === (view === 'sky') || state.reduced) {
                if (on !== (view === 'sky')) showSky(on)
                if (!on) api.goTo(back)
                return
            }
            const { fly, close } = SCOPE
            if (on) {
                const lead = ['telescope', 'eyepiece'].includes(rig.current) ? 0 : 1.6
                const shut = lead + fly - SCOPE.overlap
                scope = { t: 0, on, close: shut, swap: shut + close, legs: [[0, 'telescope', lead], [lead, 'eyepiece', fly]].slice(lead ? 0 : 1) }
            } else {
                const legs = [[close, 'eyepiece', 0], [close, 'telescope', fly]]
                if (back !== 'telescope') legs.push([close + fly, back, 1.6])
                scope = { t: close * from, on, close: 0, swap: close, legs }
            }
            requestRender()
        },
        release: () => {
            rig.release()
            requestRender()
        },
        setPointer: (x, y) => {
            if (!state.reduced) rig.setPointer(x, y)
            cursor = new THREE.Vector2((x + 1) / 2, 1 - (y + 1) / 2)
            requestRender()
        },
        // The pointer left the page: the cursor patch fades out.
        clearPointer: () => {
            cursor = null
            requestRender()
        },
        requestRender,
        // Draws one frame at once, even in a hidden tab, for the lab's still captures.
        // advance moves the effect and ambient clocks by that many seconds first.
        renderNow: (advance = 0) => {
            if (!state.ready) return
            if (advance > 0) {
                seconds += advance
                advanceEffects(advance)
                parts.city?.update(seconds)
                parts.waterfall?.update(seconds)
                parts.look?.update(seconds)
                parts.leaves?.update(seconds)
            }
            rig.update(advance)
            render()
        },
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
        get pipeline() {
            return pipeline
        },
        get lookControl() {
            return lookControl
        },
        // set: a Set of option names from look-options.js. The lab uses it to compare looks.
        setLook: (set) => {
            lookSet = set
            lookControl?.apply(lookSet, pipeline.grade.uniforms)
            requestRender()
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

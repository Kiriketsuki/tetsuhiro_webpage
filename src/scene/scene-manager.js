import * as THREE from 'three'
import { islandUrl, islandLod, isSmallScreen } from './assets.js'
import { stops } from '../data/stops.js'
import { route, doorway } from '../data/route.js'
import { createLoaders, disposeLoaders } from './loaders.js'
import { nextTask } from './next-task.js'
import { applyIslandLook } from './aerie/island-look.js'
import { createLookWorker } from './aerie/look-client.js'
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
import { createCameraRig, shotsFromStops } from './aerie/camera-rig.js'
import { fitFov } from './aerie/framing.js'
import { TIERS, BUDGET_MS, startTier, createPipeline, createGovernor } from './aerie/quality.js'
import { createLookControl, SITE_LOOK } from './aerie/look-options.js'

// The scene layer behind one small API: init, goTo, setQuality, pause, resume and dispose.
// It has no Vue import, so the site shell and the lab both drive it.
//
// It renders on demand. A frame draws when the camera moves, when something asks for one,
// or on the ambient clock (twinkle and water) at AMBIENT_FPS. Reduced motion draws
// single frames only.

const AMBIENT_FPS = 30
// The frames the governor judges a tier on, and how long after a drag, pinch or tap a frame still
// counts as steered, in milliseconds.
const GOVERNOR_FRAMES = { desktop: 90, mobile: 30 }
const STEER_MS = 250
// The longest the reveal waits for compileAsync, in milliseconds. compileAsync polls each
// program until the driver reports it ready, and a lost WebGL context never reports, so the
// gate stayed at 100 percent. Any program that is not ready by then compiles on first use.
const COMPILE_WAIT_MS = 8000
// How far a camera arc keeps clear of the house, in metres.
const HOUSE_MARGIN = 0.5
// The share of the bedroom move that the fade takes to rise, and again to fall.
const FADE_EDGE = 0.35
// The look through the telescope, in seconds: the flight from the terrace to the eyepiece,
// the iris close and open, and how early the iris starts to close before the camera stops.
const SCOPE = { fly: 1.9, close: 0.5, open: 0.8, overlap: 0.3 }
// The dissolve from the room board to the lit wall, in seconds.
const WALL = { dissolve: 0.55 }
// The workshop doorway as THREE vectors, and the side of the door a move between two stops
// takes: 'in' to the board view, 'out' from it, or none.
const DOOR = { outside: new THREE.Vector3(...doorway.outside), porch: new THREE.Vector3(...doorway.porch), inside: new THREE.Vector3(...doorway.inside) }
const ROOM = new THREE.Box3(new THREE.Vector3(...doorway.room[0]), new THREE.Vector3(...doorway.room[1]))
// position is the camera now. A move that starts in the room heads out, whatever stop the rig
// was at, so a move that takes over on the way out never cuts through the front wall.
const doorFor = (from, to, position) => {
    if (to === 'board' && from !== 'board') return { side: 'in', ...DOOR }
    if (to !== 'board' && (from === 'board' || ROOM.containsPoint(position))) return { side: 'out', ...DOOR }
    return null
}
// The kit board hangs a little in front of the old board, which stays in the island GLB
// (corkboard-kit.md, case 1). Offsets along the anchor's right and normal, in metres.
const BOARD_OFFSET = { right: 0.02, out: 0.073 }
// A moon direction for the shadow and the toon ramp until the GLB anchor is read.
const MOON_FALLBACK = new THREE.Vector3(-28, 71, 24)
// The city haze density: the city loses about a fifth of its colour at the bottom of the
// overview frame and about two thirds at its centre.
const CITY_HAZE_DENSITY = 1 / 2400
// The faces of the skill sky overlay. A canvas draws with a fallback font while its face is
// still loading, so each font names the weight the canvas asks for.
const SKY_FONTS = ['30px "JetBrains Mono"', 'italic 42px "Instrument Serif"']

// hooks.before and hooks.after run around each render, for the lab's GPU timer. lensTarget: an
// optional function that returns the element that reads --aerie-lens. Without it, or while it
// returns null, the value goes on the root element. wall: true when the first view is the
// evidence wall, so `ready` waits for it.
export function createSceneManager({ canvas, reducedMotion = false, lod = null, tier = null, onProgress = () => {}, start = 'overview', wall = false, hooks = {}, lensTarget = null }) {
    const small = isSmallScreen()
    const useLod = lod ?? islandLod()
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
    // The boxes round the house that a camera arc must not pass through. They fill in once the
    // GLB loads. A ray test on the house triangles took up to 200 ms at the start of a move, a
    // visible hitch, and a box test takes microseconds. A box that holds either end of the move
    // (ends) does not count, so a move to a stop inside the house, such as the eyepiece, still
    // works.
    let solids = []
    const ray = new THREE.Ray()
    const hit = new THREE.Vector3()
    const blocked = (a, b, ends = [a, b]) => {
        const length = a.distanceTo(b)
        if (length < 1e-3) return false
        ray.set(a, b.clone().sub(a).divideScalar(length))
        return solids.some((box) => !ends.some((end) => box.containsPoint(end)) && ray.intersectBox(box, hit) && a.distanceTo(hit) <= length)
    }
    const rig = createCameraRig({ camera, shots: shotsFromStops(stops), start, blocked })
    // The story legs between neighbouring stops (camera-move.js). They build once the move
    // chunk and the GLB with its route empties are in. Until then every move cuts.
    let legs = {}

    const state = { wanted: false, hidden: document.hidden, lost: false, ready: false, reduced: reducedMotion, dirty: true }
    const parts = { glow: null, waterfall: null, stars: null, city: null, sky: null, campfire: null, look: null, leaves: null, constellation: null, wall: null, roomBoard: null }
    // The even darkening during the move into the bedroom: { t, duration } while it runs.
    let fade = null
    // 'island', 'sky' or 'wall'. The sky is the telescope's view of the skills, and the wall is
    // the corkboard in the workshop, the Projects view.
    let view = 'island'
    // The move to or from the wall while it runs: { t, on, legs, swap, swapped }.
    let boardMove = null
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
        parts.wall?.setPixelRatio(renderer.getPixelRatio())
    }

    const buildPipeline = (index) => {
        tierIndex = index
        pipeline?.dispose()
        pipeline = createPipeline({ renderer, scene, camera, tier: TIERS[index], small })
        if (view === 'sky' && parts.constellation) pipeline.setView(parts.constellation.scene, parts.constellation.camera)
        if (view === 'wall' && parts.wall) pipeline.setView(parts.wall.scene, parts.wall.camera)
        lookControl?.apply(lookSet, pipeline.grade.uniforms)
        resizeSprites()
        state.dirty = true
    }

    // A phone judges its tier on a shorter run of frames, so a slow phone steps down within about
    // a second of a drag, not after three seconds of lag.
    // A new tier rebuilds the pipeline, and the rebuild stalls a frame or more. A step that the
    // governor asks for during a camera move waits in pendingTier until the move ends.
    let pendingTier = null
    const governor = createGovernor({
        budgetMs: small ? BUDGET_MS.mobile : BUDGET_MS.desktop,
        tier: tierIndex,
        window: small ? GOVERNOR_FRAMES.mobile : GOVERNOR_FRAMES.desktop,
        onStep: (next) => {
            if (rig.moving) pendingTier = next
            else buildPipeline(next)
        },
    })
    // The time of the last drag, pinch or tap. A drag moves the camera through look offsets, which
    // rig.moving does not report, so the governor also counts the frames drawn just after one.
    let steeredAt = -Infinity

    // The lens follows the stop's focus point. It fades out during a move between stops, so the
    // flight stays clear. The cursor patch and the vignette centre ease after the pointer, so
    // they drift and never jump. --aerie-lens tells the focus ring in the shell how strong the
    // lens is, so the ring fades with it.
    // A custom property on the root restyles every element of the page, so the shell names the
    // ring through lensTarget, and only the ring restyles. lensElement asks lensTarget again for
    // a ring that has left the document.
    let lensRing = null
    const lensElement = () => {
        if (!lensRing?.isConnected) lensRing = lensTarget?.() ?? null
        return lensRing ?? document.documentElement
    }
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
            lensElement().style.setProperty('--aerie-lens', String(shown))
        }
    }

    const render = () => {
        renderer.info.reset()
        hooks.before?.()
        const begin = performance.now()
        updateLens()
        // The wall renders its shadow map only after a pin lifts.
        if (view === 'wall' && parts.wall.takeShadowDirty()) renderer.shadowMap.needsUpdate = true
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
        // Off leaves any other view alone, so it never drops the wall.
        if (!on && view !== 'sky') return
        view = on ? 'sky' : 'island'
        if (on) {
            parts.constellation.open()
            if (!reveal || state.reduced) parts.constellation.showAll()
            pipeline.setView(parts.constellation.scene, parts.constellation.camera)
        } else {
            parts.constellation.close()
            pipeline.setView(scene, camera)
        }
        // A context restore during another view leaves this view's shadow map to redraw.
        renderer.shadowMap.needsUpdate = true
        requestRender()
    }

    // Ends the eyepiece move and the board move at once. A new move of either kind, or a route
    // that drops the sky or the wall at once, starts from rest.
    const settle = () => {
        // The promise of an eyepiece move resolves here too, so nothing waits on it for ever.
        scope?.done?.()
        scope = null
        boardMove = null
        pipeline.grade.uniforms.uIris.value = 0
        pipeline.grade.uniforms.uFade.value = 0
    }

    // Turning on reduced motion mid move finishes the move: the camera cuts to its last stop,
    // and a swap that has not run yet runs now.
    const finishMoves = () => {
        const move = scope ?? boardMove
        if (!move) return
        const last = move.legs.at(-1)?.[1]
        if (!move.swapped) {
            if (move === scope) showSky(move.on)
            else showWall(move.on)
        }
        settle()
        rig.jump(last ?? rig.current)
    }

    // Swaps the picture between the island and the evidence wall. A call before the wall has
    // built waits for it, and runs only if no later call has turned the wall off.
    const showWall = (on) => {
        wallWanted = on
        if (!parts.wall) {
            if (on && !wallFailed) wallReady.then(() => wallWanted && showWall(true), () => {})
            return
        }
        if (on === (view === 'wall')) return
        view = on ? 'wall' : 'island'
        pipeline.setView(on ? parts.wall.scene : scene, on ? parts.wall.camera : camera)
        // Each scene keeps the shadow map of its own light, but a swap needs one fresh render.
        renderer.shadowMap.needsUpdate = true
        requestRender()
    }

    // Swaps the picture under a still of the frame before it, and the still fades out. The
    // canvas keeps no drawing buffer, so the still copies a frame drawn just now. The page CSS
    // places every canvas where the scene canvas sits.
    const dissolve = (swap) => {
        render()
        const still = document.createElement('canvas')
        Object.assign(still, { width: canvas.width, height: canvas.height })
        still.className = canvas.className
        still.setAttribute('aria-hidden', 'true')
        still.style.cssText = `visibility:visible;opacity:${getComputedStyle(canvas).opacity};pointer-events:none;transition:opacity ${WALL.dissolve}s ease`
        still.getContext('2d').drawImage(canvas, 0, 0)
        canvas.after(still)
        swap()
        render()
        requestAnimationFrame(() => requestAnimationFrame(() => (still.style.opacity = '0')))
        setTimeout(() => still.remove(), WALL.dissolve * 1000 + 120)
    }

    // Steps the move to or from the wall, like the eyepiece move. The swap waits for the wall
    // to build, so the camera holds at the board until it can dissolve.
    const stepBoard = (delta) => {
        const b = boardMove
        b.t += delta
        while (b.legs.length && b.t >= b.legs[0][0]) {
            const [, id, duration] = b.legs.shift()
            rig.goTo(id, { duration, door: doorFor(rig.current, id, camera.position) })
            // The dissolve onto the wall waits for the camera to come to rest on the board.
            if (b.on && id === 'board') b.swap = b.t + rig.moveDuration
        }
        if (!b.swapped && b.t >= b.swap && (!b.on || parts.wall || wallFailed)) {
            b.swapped = true
            dissolve(() => showWall(b.on))
        }
        if (b.swapped && !b.legs.length && !rig.moving) boardMove = null
        return true
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
        if (s.t >= s.swap + SCOPE.open && !s.legs.length) {
            scope = null
            s.done()
        }
        return true
    }

    // The eyepiece move, the skill sky reveal and the bedroom fade. Returns true while any of
    // them needs frames.
    const advanceEffects = (delta) => {
        const scoping = Boolean((scope ? stepScope(delta) : false) | (boardMove ? stepBoard(delta) : false))
        const walling = view === 'wall' ? parts.wall.update(delta) : false
        const revealing = view === 'sky' ? parts.constellation.update(delta, seconds) || scoping : scoping || walling
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
            if (view === 'wall') parts.wall.update(0)
            render()
        })
    }

    const tick = () => {
        const delta = Math.min(clock.getDelta(), 0.1)
        seconds += delta
        ambient += delta
        rig.update(delta)
        const effects = advanceEffects(delta)
        // The wall has nothing that twinkles, so its frames draw only when something moves.
        const tickAmbient = view !== 'wall' && ambientFps > 0 && ambient >= 1 / ambientFps
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
        const moving = rig.moving || performance.now() - steeredAt < STEER_MS
        if (pendingTier !== null && !rig.moving) {
            buildPipeline(pendingTier)
            pendingTier = null
        }
        render()
        // Only frames the camera drives count toward the governor: a move between stops, the ease
        // back after a drag, and a drag or pinch itself. They draw on every animation frame, so
        // the time between them is the real frame time. The 30 fps ambient clock would read as a
        // slow device.
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
        parts.wall?.resize(width, height)
        if (parts.wall && parts.roomBoard) boardShot(parts.wall)
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

    // Anchor_Corkboard faces out along its local +Z in the glTF frame. The kit board hangs in
    // front of it, and the wall's room copy hangs on the kit board.
    let boardFrame = null
    const boardFrom = (root) => {
        const node = root.getObjectByName('Anchor_Corkboard')
        if (!node) return null
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(node.matrixWorld)
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize()
        const up = new THREE.Vector3().crossVectors(normal, right)
        const centre = node.getWorldPosition(new THREE.Vector3()).addScaledVector(right, BOARD_OFFSET.right).addScaledVector(normal, BOARD_OFFSET.out)
        return { centre, normal, right, up }
    }

    const anchor = (root, name) => root.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()) ?? null

    // The parts that need no download draw first, so the night sky shows at once.
    parts.sky = createSky()
    parts.stars = createStars({ small, pixelRatio: renderer.getPixelRatio() })
    parts.city = createCityBackdrop({ renderer, haze: NIGHT_SKY.haze, hazeDensity: CITY_HAZE_DENSITY, pixelRatio: () => renderer.getPixelRatio() })
    scene.add(parts.sky.mesh, parts.stars.points, parts.city.group)
    buildPipeline(tierIndex)

    // The painted detail texture and the leaf carpet build in small slices while the island
    // downloads. The fonts and the skill sky chunk load at the same time, so the build after
    // the download does not wait on them one after the other.
    const detailBuild = createDetailTexture({ anisotropy: small ? 1 : Math.min(4, renderer.capabilities.getMaxAnisotropy()) })
    const carpetBuild = createLeafCarpet({ sliced: true })
    // The look worker loads beside the island, so it is ready when the island arrives.
    const lookWorker = createLookWorker()
    const skyFonts = Promise.all(SKY_FONTS.map((font) => document.fonts.load(font))).catch(() => {})
    const skyModule = import('./aerie/constellation.js')
    skyModule.catch(() => {})
    // The camera moves sit in their own chunk too, so the scene chunk stays in its budget. They
    // arrive long before the island, and the rig cuts until they do, behind the loading gate.
    const moveModule = import('./aerie/camera-move.js').then((module) => {
        rig.setMoves(module)
        return module
    })
    moveModule.catch(() => {})

    // Compiles the programs of a scene, but never waits past COMPILE_WAIT_MS.
    const compiled = (target, view) => Promise.race([renderer.compileAsync(target, view), new Promise((resolve) => setTimeout(resolve, COMPILE_WAIT_MS))])

    // The evidence wall sits in its own chunk too. It builds after the island reveal, or before the
    // reveal on a direct visit to /projects. A failed wall leaves Projects on its list page.
    let wallBuild = null
    let wallFailed = false
    let wallWanted = false
    const buildWall = () =>
        (wallBuild ??= import('./aerie/wall.js')
            .then(async ({ createWall }) => {
                const built = await createWall({
                    loaders,
                    small,
                    reducedMotion: state.reduced,
                    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
                    pixelRatio: renderer.getPixelRatio(),
                    request: () => requestRender(),
                })
                built.resize(...size())
                if (boardFrame) placeRoomBoard(built)
                await compiled(built.scene, built.camera)
                // The room copy joins the island scene, so its programs and its atlas get ready
                // before its first frame too.
                if (parts.roomBoard) {
                    await compiled(scene, camera)
                    parts.roomBoard.group.traverse((node) => node.material?.map && renderer.initTexture(node.material.map))
                }
                parts.wall = built
            })
            .catch((error) => {
                wallFailed = true
                console.error('The evidence wall did not load.', error)
            }))

    // Hangs the wall's room copy on the workshop board, and adds the board stop: square in front
    // of the copy, at the distance where the copy fills the frame as the wall's overview does.
    const placeRoomBoard = (built) => {
        const { centre, normal, right, up } = boardFrame
        const room = built.roomCopy()
        room.group.position.copy(centre)
        room.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal))
        scene.add(room.group)
        parts.roomBoard = room
        boardShot(built)
        renderer.shadowMap.needsUpdate = true
    }

    // The board stop depends on the wall's overview, which depends on the screen, so a resize
    // places it again. addShot keeps a move that runs now going.
    const boardShot = (built) => {
        const { centre, normal, right, up } = boardFrame
        const home = built.home
        const k = parts.roomBoard.group.scale.x
        // A narrow screen widens the rig's lens (fitFov), so the stop comes closer by as much.
        const lens = Math.tan(THREE.MathUtils.degToRad(15)) / Math.tan(THREE.MathUtils.degToRad(fitFov(30, camera.aspect) / 2))
        const target = centre.clone().addScaledVector(right, home.x * k).addScaledVector(up, home.y * k)
        const position = target.clone().addScaledVector(normal, home.d * k * lens)
        shots.board = { position, target, focus: target.clone(), fov: 30, shift: [0, 0], tall: [0, 0], zoom: 1, tallZoom: 1 }
        rig.addShot('board', shots.board)
    }

    let shots = null
    let islandBytes = 0
    const report = (files) => onProgress(Math.min(1, 0.7 * islandBytes + 0.3 * files))
    loaders.manager.onProgress = (url, loaded, total) => report(total ? loaded / total : 0)

    const ready = loaders.gltf
        .loadAsync(islandUrl(useLod), (event) => {
            if (event.lengthComputable) islandBytes = event.loaded / event.total
            report(0)
        })
        .then(async (gltf) => {
            const look = await applyIslandLook(gltf, { sky: NIGHT_SKY, detail: detailBuild, carpet: carpetBuild, worker: lookWorker }).finally(() => lookWorker.dispose())
            parts.look = look
            lookControl = createLookControl(look.uniforms)
            lookControl.apply(lookSet, pipeline.grade.uniforms)
            markShadows(gltf.scene)
            const root = gltf.scene
            const moon = anchor(root, 'Anchor_Moon') ?? MOON_FALLBACK
            const shadow = createMoonShadow({ direction: moon, small })
            scene.add(root, shadow, shadow.target)
            shots = shotsFromStops(stops, gltf.cameras, (name) => anchor(root, name))
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
            await nextTask()

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

            boardFrame = boardFrom(root)

            // The skill sky is its own chunk, so it stays out of the scene budget.
            await skyFonts
            const { createConstellation } = await skyModule
            parts.constellation = createConstellation({ pixelRatio: renderer.getPixelRatio(), small, canvas })
            parts.constellation.resize(camera.aspect)

            // Without the move chunk, a failed download, every move cuts.
            const moves = await moveModule.catch(() => null)
            rig.setShots(shots)
            legs = moves ? moves.legsFromRoute(route, (name) => anchor(root, name)) : {}
            solids = []
            root.traverse((node) => {
                if (node.isMesh && /^(House|Glass)/.test(node.name)) solids.push(new THREE.Box3().setFromObject(node).expandByScalar(HOUSE_MARGIN))
            })
            resizeSprites()
            // Compile every program before the reveal, so the first moves and the first look
            // through the telescope do not stall.
            await compiled(scene, camera)
            await compiled(parts.constellation.scene, parts.constellation.camera)
            if (wall) await buildWall()
            renderer.shadowMap.needsUpdate = true
            state.ready = true
            onProgress(1)
            update()
            requestRender()
            return { anchors: (name) => anchor(root, name), root, gltf }
        })

    // A failed island never needs the look worker.
    ready.catch(() => lookWorker.dispose())
    const wallReady = ready.then(buildWall)
    wallReady.catch(() => {})

    const api = {
        ready,
        renderer,
        scene,
        camera,
        rig,
        parts,
        loaders,
        // A move into or out of the board view goes through the workshop doorway.
        // A move to a neighbouring story stop follows its leg. Any other move takes the
        // lifted arc, and a zero duration cuts. Without a duration the move takes one from its
        // path length. A move that starts in the middle of a leg starts from the camera at its
        // speed, and rig.current is already that leg's end stop.
        goTo: (id, { duration = null } = {}) => {
            // A move asked for on the way out of the wall replaces the out leg that has not
            // started yet. The page that comes back can pick a new section after the route
            // change has picked its stop, and the camera follows the page.
            if (boardMove && !boardMove.on) boardMove.legs.length = 0
            const cut = state.reduced || (duration !== null && duration <= 0)
            const leg = cut ? null : (legs[`${rig.current}>${id}`] ?? null)
            const from = rig.current
            rig.goTo(id, { duration: cut ? 0 : duration, leg, door: doorFor(from, id, camera.position) })
            const time = rig.moveDuration
            fade = id === 'bedroom' && time > 0 && from !== 'bedroom' ? { t: 0, duration: time } : null
            pipeline.grade.uniforms.uFade.value = 0
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
            if (value) finishMoves()
            parts.wall?.setReducedMotion(value)
            update()
        },
        settle,
        pause: () => {
            state.wanted = false
            update()
        },
        resume: () => {
            state.wanted = true
            update()
        },
        pan: (dx, dy) => {
            steeredAt = performance.now()
            if (view === 'sky') parts.constellation.pan(dx, dy)
            else if (view === 'wall') parts.wall.pan(dx, dy)
            else rig.pan(dx, dy)
            requestRender()
        },
        // x and y are client pixels. A tap on the skill sky flies to the constellation
        // under it, or back out to the whole sky. A tap on the wall returns the pin under it.
        tap: (x, y) => {
            if (view === 'wall') return parts.wall.tap(x, y)
            if (view !== 'sky') return null
            steeredAt = performance.now()
            parts.constellation.focus((x / window.innerWidth) * 2 - 1, 1 - (y / window.innerHeight) * 2, state.reduced)
            requestRender()
            return null
        },
        // x and y: the client point that the zoom keeps still. Only the wall uses it.
        zoom: (factor, x, y) => {
            steeredAt = performance.now()
            if (view === 'sky') parts.constellation.zoom(factor)
            else if (view === 'wall') parts.wall.zoom(factor, x, y)
            else rig.zoom(factor)
            requestRender()
        },
        showSky,
        showWall,
        // The pins on the wall. Each call does nothing until the wall has built.
        wall: {
            highlight: (id, reveal = true) => {
                parts.wall?.highlight(id, reveal)
                requestRender()
            },
            focus: (id) => {
                parts.wall?.focus(id, { instant: state.reduced })
                requestRender()
            },
            unfocus: () => {
                parts.wall?.unfocus({ instant: state.reduced })
                requestRender()
            },
            peek: () => {
                parts.wall?.peek({ instant: state.reduced })
                requestRender()
            },
            // A group id lights that group and frames it. null shows the whole board.
            filter: (id) => {
                parts.wall?.filter(id)
                requestRender()
            },
            // The pin under a client point on the wall, or null. The pointer tag uses it.
            pinAt: (x, y) => (view === 'wall' ? parts.wall.tap(x, y) : null),
            screenOf: (id) => parts.wall?.screenOf(id) ?? null,
            // Resolves true once the wall has built, false when it failed.
            // A build that has started already, as on a direct visit, does not wait for the sky.
            built: () => (wallBuild ?? wallReady).then(() => Boolean(parts.wall)),
            // Back to the overview with no pin marked, so the dissolve from the room copy lines up.
            reset: () => {
                parts.wall?.reset()
                requestRender()
            },
        },
        // The move to the evidence wall: the camera flies in through the workshop doorway to
        // the board stop in front of the room board, and the room board dissolves into the
        // lit wall. Off dissolves back and flies out through the doorway to the stop `back`.
        // Reduced motion cuts the camera and keeps only the dissolve, which is a fade and not a motion.
        enterWall: (on, back = 'workshop') => {
            settle()
            // The room copy shows the overview, so the wall starts there too.
            if (on) parts.wall?.reset()
            if (on === (view === 'wall') || !shots?.board || wallFailed) {
                if (!on) api.goTo(back)
                return
            }
            if (state.reduced) {
                rig.jump(on ? 'board' : back)
                if (parts.wall) dissolve(() => showWall(on))
                else showWall(on)
                return
            }
            // One move in through the workshop doorway to the board, or out through it from the
            // board. A null duration takes the duration from the path, and the swap time comes
            // from the move once it starts (stepBoard).
            if (on) {
                boardMove = { t: 0, on, legs: [[0, 'board', null]], swap: Infinity, swapped: false }
            } else {
                rig.jump('board')
                boardMove = { t: 0, on, legs: [[0, back, null]], swap: 0, swapped: false }
            }
            requestRender()
        },
        // The look through the telescope. The camera flies up to the eyepiece (by way of the
        // terrace from any other stop), the iris closes, and it opens on the skill sky. Off
        // plays it in reverse and flies on to the stop `back`. Reduced motion swaps at once,
        // and src/three.js crossfades the frame. The promise resolves once the iris is fully
        // open again, so the page can hold its words back until then.
        lookThrough: (on, back = 'telescope') => {
            const iris = pipeline.grade.uniforms.uIris
            // A visitor who leaves while the iris still opens on the sky gets a close from
            // where the blades are, not a jump back to fully open.
            const from = iris.value
            iris.value = 0
            scope?.done()
            scope = null
            boardMove = null
            if (on === (view === 'sky') || state.reduced) {
                if (on !== (view === 'sky')) showSky(on)
                if (!on) api.goTo(back)
                return Promise.resolve()
            }
            let done
            const finished = new Promise((resolve) => {
                done = resolve
            })
            const { fly, close } = SCOPE
            if (on) {
                const lead = ['telescope', 'eyepiece'].includes(rig.current) ? 0 : 1.6
                const shut = lead + fly - SCOPE.overlap
                scope = { t: 0, on, close: shut, swap: shut + close, legs: [[0, 'telescope', lead], [lead, 'eyepiece', fly]].slice(lead ? 0 : 1), done }
            } else {
                const legs = [[close, 'eyepiece', 0], [close, 'telescope', fly]]
                if (back !== 'telescope') legs.push([close + fly, back, 1.6])
                scope = { t: close * from, on, close: 0, swap: close, legs, done }
            }
            requestRender()
            return finished
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
        // 'island', 'sky' or 'wall': the scene the pipeline draws now.
        get view() {
            return view
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
            // A dispose during the load stops the worker and the carpet slices too.
            lookWorker.dispose()
            carpetBuild.dispose()
            Object.values(parts).forEach((part) => part?.dispose?.())
            pipeline?.dispose()
            disposeLoaders(loaders)
            renderer.dispose()
        },
    }
    return api
}

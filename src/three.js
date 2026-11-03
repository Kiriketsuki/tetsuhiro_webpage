import { watch } from 'vue'
import gsap from 'gsap'
import { useWaypoints } from './composables/useWaypoints.js'
import { useExplore } from './composables/useExplore.js'
import { useWall } from './composables/useWall.js'
import { createSceneManager } from './scene/scene-manager.js'
import { stopForRoute } from './data/stops.js'
import { bedroomDoor } from './data/route.js'
import { waypoints } from './data/waypoints.js'

// The Vue side of the scene. useScene() in App.vue imports this module on idle, after the
// first paint on any route, and calls resume(). The canvas and the loop stay alive across
// route changes, so a route change is a camera move. The scene itself lives behind
// createSceneManager, which knows nothing about Vue.

const { active, ready, reducedMotion, progress, entered, loadError, jumping } = useWaypoints()
const canvas = document.getElementById('webgl')
history.scrollRestoration = 'manual'

let manager = null
let route = 'Home'
let wanted = false
let inSky = false
let inWall = false
let wallBuilt = false
const wall = useWall()
// The routes that show the evidence wall: the board, and the board with one pin open.
const WALL_ROUTES = ['Projects', 'Project']

// A still of the frame drawn just now, over the canvas, that fades out. It hides a cut.
// The canvas keeps no drawing buffer, so the still copies a frame drawn just now.
function crossfade() {
    manager.renderNow()
    const still = document.createElement('canvas')
    still.className = canvas.className
    Object.assign(still, { width: canvas.width, height: canvas.height })
    still.style.cssText = `visibility:visible;opacity:${getComputedStyle(canvas).opacity}`
    still.getContext('2d').drawImage(canvas, 0, 0)
    canvas.after(still)
    gsap.to(still, { opacity: 0, duration: 0.6, onComplete: () => still.remove() })
}

// The telescope eyepiece: the camera flies up to the eyepiece, an iris closes, and it opens
// on the skill sky (scene-manager.js lookThrough). Leaving plays it in reverse, on to `back`.
// Reduced motion swaps at once, under a still of the old frame that fades out. `looking`
// stays true until the iris is open again, so Home shows no card over the blades.
let moves = 0
function eyepiece(toSky, back) {
    if (toSky === inSky) return
    inSky = toSky
    const { looking } = useExplore()
    const move = ++moves
    looking.value = true
    if (reducedMotion.value) crossfade()
    manager.lookThrough(toSky, back).then(() => {
        if (move === moves) looking.value = false
    })
}

// The workshop board: the camera flies to the board, the room light dims, and the wall lamp
// warms up (scene-manager.js enterWall). Leaving plays it in reverse, on to `back`. Before
// the wall has built, the camera goes to the workshop and moves on to the board once it can.
function board(toWall, back) {
    if (toWall === inWall) return
    inWall = toWall
    wall.shown.value = toWall && wallBuilt
    if (!toWall) {
        manager.enterWall(false, back)
        return
    }
    if (wallBuilt) {
        manager.enterWall(true)
        return
    }
    manager.goTo('workshop')
    manager.wall.built().then((ok) => {
        if (!ok || !inWall) return
        wall.shown.value = true
        manager.enterWall(true)
    })
}

// Leaves the sky or the wall at once, under a crossfade, so the next move starts from the
// island. A route from the sky to the wall, or back, takes this path.
function leaveViewNow() {
    if (!inSky && !inWall) return
    crossfade()
    // A move that still runs would swap its view back in later, so it ends here.
    manager.settle()
    manager.showSky(false)
    manager.showWall(false)
    inSky = false
    inWall = false
    wall.shown.value = false
}

// The bedroom, the About room (/about). Its part of the scene (scene/aerie/room.js) loads as its
// own chunk on the first visit. From a home section the camera walks in through the balcony
// door, and the move home walks out through it (scene-manager.js doorFor). Any other page swaps
// in or out at once, under a crossfade, from the bedroom stop outside the door. cut goes
// straight in, for a direct visit.
let inRoom = false
let room = null
function bedroom(on, other, cut = false) {
    if (on === inRoom) return
    inRoom = on
    if (!cut && other !== 'Home') {
        if (inSky || inWall) leaveViewNow()
        else crossfade()
        manager.rig.jump('bedroom')
    }
    room ??= import('./scene/aerie/room.js').then((module) => module.createRoom(manager, bedroomDoor))
    room.then((r) => r.show(on, { cut })).catch((error) => console.error('The About room did not load.', error))
}

// No WebGL, or the scene failed to build. The canvas shows a CSS night sky instead, and
// the gate still opens, so the pages stay usable.
function fallBack(error) {
    console.error('The island cannot render here.', error)
    canvas?.classList.add('scene-fallback')
    loadError.value = 'This browser cannot draw the aerie. The pages still work.'
    progress.value = 1
    ready.value = true
}

// Text pages dim the scene, so its twinkle and water are not worth the frames there. Behind the
// gate the lantern art covers the scene, so the scene draws only the frames that change it, and
// the lantern keeps the GPU and the main thread.
const ambientFps = () => ((route === 'Home' && entered.value) || route === 'About' ? 30 : 0)

// The stop for the current route and section. Home waits on the wide view until the
// visitor goes through the gate.
function currentStop() {
    const routeStop = stopForRoute(route)
    if (routeStop) return routeStop
    if (!entered.value) return 'overview'
    return waypoints[active.value]?.stop ?? 'arrival'
}

function boot() {
    // A debug switch to try the fallback in the dev server. Not in the build.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('nowebgl')) {
        throw new Error('WebGL turned off by ?nowebgl')
    }
    manager = createSceneManager({
        canvas,
        reducedMotion: reducedMotion.value,
        start: currentStop(),
        // Only the focus ring reads the lens strength, so only the ring restyles when it moves.
        lensTarget: () => document.querySelector('.focus-ring'),
        // A direct visit to Projects, or to one project, opens on the wall, so the reveal waits
        // for it. The two older project pages are text pages.
        wall: /^\/projects(\/(?!dancing_tables$|placeholders$)[^/]+)?$/.test(location.pathname.replace(/\/+$/, '').toLowerCase()),
        onProgress: (value) => {
            progress.value = Math.max(progress.value, value)
        },
    })
    if (wanted) manager.resume()

    manager.ready
        .then(() => {
            progress.value = 1
            ready.value = true
        })
        .catch((error) => {
            console.error('island_b.glb failed to load', error)
            loadError.value = 'The aerie did not load. A reload usually sorts it out.'
            progress.value = 1
            ready.value = true
        })

    // The gate lift is a long move. Section and route changes are shorter ones. The nav lantern
    // brings the gate back: the camera cuts to the wide view under the art, and the twinkle stops
    // until the visitor goes in again.
    // A link back to a home section (useWaypoints.js land) sets the section, and can lift the
    // gate, before the route changes. The camera then waits for the route change, which makes
    // the move home from the room the visitor is in.
    watch(entered, (value) => {
        manager.setAmbientFps(ambientFps())
        if (route === 'Home') manager.goTo(currentStop(), { duration: value ? 2.4 : 0 })
    })
    // During a jump the camera waits for the target section, then takes one move there.
    watch(active, (index) => {
        if (route !== 'Home') return
        if (jumping.value !== null && index !== jumping.value) return
        jumping.value = null
        manager.goTo(currentStop())
    })
    // A jump that timed out leaves the camera short of the section in view.
    watch(jumping, (index) => {
        if (index === null && currentStop() !== manager.rig.current) manager.goTo(currentStop())
    })
    watch(reducedMotion, (value) => manager.setReducedMotion(value))

    // Drag and pinch from ExplorePad.vue look around the current stop.
    const explore = useExplore()
    // A tap on the wall tells the page which pin it hit, or null for the cork.
    const tap = (x, y, type = 'mouse') => {
        // Every tap is a new value, so a second tap on the same pin reaches the page too.
        wall.picked.value = { id: manager.tap(x, y), touch: type !== 'mouse', at: performance.now() }
    }
    // A mouse over the wall names the pin under it. The test runs once per frame at most.
    let hoverAt = null
    const hover = (x, y) => {
        if (!wall.shown.value) return
        if (!hoverAt) requestAnimationFrame(() => {
            wall.hovered.value = manager.wall.pinAt(hoverAt.x, hoverAt.y)
            hoverAt = null
        })
        hoverAt = { x, y }
    }
    explore.connect({ pan: manager.pan, zoom: manager.zoom, tap, hover })
    wall.connect(manager.wall)
    manager.wall.built().then((ok) => {
        wallBuilt = ok
        if (ok && inWall) wall.shown.value = true
    })
    // At the telescope, looking around means looking through it at the skill sky.
    watch(explore.exploring, (value) => {
        if (value && currentStop() === 'telescope') eyepiece(true)
        if (!value) {
            if (route === 'Home') eyepiece(false, currentStop())
            manager.release()
        }
    })

    // A small drift toward the pointer on devices with a mouse.
    if (window.matchMedia('(pointer: fine)').matches) {
        window.addEventListener('mousemove', (e) => {
            manager.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1)
        })
        document.documentElement.addEventListener('mouseleave', () => manager.clearPointer())
    }

    // Handy in the console while tuning shots. Not in the build.
    if (import.meta.env.DEV) window.__scene = manager
}

export function resume() {
    wanted = true
    manager?.resume()
}

export function pause() {
    wanted = false
    manager?.pause()
}

// useScene() calls this on every route change. The first call cuts, so a direct visit
// opens at the route's room instead of flying there.
export function setRoute(name, { cut = false } = {}) {
    if (name === route && !cut) return
    const previous = route
    route = name
    manager?.setAmbientFps(ambientFps())
    // The skills page sits over the skill sky. A direct visit opens on it with every star lit.
    // A route change into or out of it is the move through the eyepiece. Projects sits over
    // the evidence wall in the same way, and its move is the flight to the workshop board.
    const sky = name === 'Skills'
    const onWall = WALL_ROUTES.includes(name)
    if (!manager) return
    if (cut) {
        manager.goTo(currentStop(), { duration: 0 })
        inSky = sky
        inWall = onWall
        manager.ready.then(() => manager.showSky(sky, { reveal: false }))
        if (name === 'About') manager.ready.then(() => bedroom(true, previous, true))
        if (onWall) {
            manager.wall.built().then((ok) => {
                if (!ok || !inWall) return
                manager.rig.jump('board')
                manager.wall.reset()
                manager.showWall(true)
                wall.shown.value = true
            })
        }
        return
    }
    manager.ready.then(() => {
        // Into or out of the About room. The room makes the move in, and the move out is the
        // move to the new route's stop below.
        bedroom(name === 'About', name === 'About' ? previous : name)
        if (inRoom) return
        // From the sky to the wall, or back: drop the old view at once, then make the move.
        if ((sky && inWall) || (onWall && inSky)) leaveViewNow()
        if (sky !== inSky) eyepiece(sky, currentStop())
        else if (onWall !== inWall) board(onWall, currentStop())
        else if (!onWall) manager.goTo(currentStop())
    })
}

try {
    boot()
} catch (error) {
    manager = null
    fallBack(error)
}

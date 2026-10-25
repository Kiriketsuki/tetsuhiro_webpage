import { watch } from 'vue'
import { useWaypoints } from './composables/useWaypoints.js'
import { useExplore } from './composables/useExplore.js'
import { createSceneManager } from './scene/scene-manager.js'
import { stopForRoute } from './data/stops.js'
import { waypoints } from './data/waypoints.js'

// The Vue side of the scene. useScene() in App.vue imports this module on idle, after the
// first paint on any route, and calls resume(). The canvas and the loop stay alive across
// route changes, so a route change is a camera move. The scene itself lives behind
// createSceneManager, which knows nothing about Vue.

const { active, ready, reducedMotion, progress, entered, loadError } = useWaypoints()
const canvas = document.getElementById('webgl')
history.scrollRestoration = 'manual'

let manager = null
let route = 'Home'
let wanted = false

// No WebGL, or the scene failed to build. The canvas shows a CSS night sky instead, and
// the gate still opens, so the pages stay usable.
function fallBack(error) {
    console.error('The island cannot render here.', error)
    canvas?.classList.add('scene-fallback')
    loadError.value = 'This browser cannot draw the island. The pages still work.'
    progress.value = 1
    ready.value = true
}

// The stop for the current route and section. Home waits on the wide view until the
// visitor goes through the gate.
function currentStop() {
    const routeStop = stopForRoute(route)
    if (routeStop) return routeStop
    if (!entered.value) return 'overview'
    return waypoints[active.value]?.stop ?? 'hero'
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
            loadError.value = 'The island did not load. A reload usually sorts it out.'
            progress.value = 1
            ready.value = true
        })

    // The gate lift is a long move. Section and route changes are shorter ones.
    watch(entered, (value) => {
        if (value) manager.goTo(currentStop(), { duration: 2.4 })
    })
    watch(active, () => manager.goTo(currentStop()))
    watch(reducedMotion, (value) => manager.setReducedMotion(value))

    // Drag and pinch from ExplorePad.vue look around the current stop.
    const explore = useExplore()
    explore.connect({ pan: manager.pan, zoom: manager.zoom })
    watch(explore.exploring, (value) => {
        if (!value) manager.release()
    })

    // A small drift toward the pointer on devices with a mouse.
    if (window.matchMedia('(pointer: fine)').matches) {
        window.addEventListener('mousemove', (e) => {
            manager.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1)
        })
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
    route = name
    // Text pages dim the scene, so its twinkle and water are not worth the frames there.
    manager?.setAmbientFps(name === 'Home' ? 30 : 0)
    manager?.goTo(currentStop(), cut ? { duration: 0 } : undefined)
}

try {
    boot()
} catch (error) {
    manager = null
    fallBack(error)
}

import { onMounted } from 'vue'
import { useWaypoints } from './useWaypoints.js'

// One import for the whole visit. The module builds the scene when it first
// runs, and the canvas stays mounted in App.vue across every route.
let scene = null
const loadScene = () => {
    scene ??= import('../three.js')
    return scene
}

// Safari has no requestIdleCallback. A short timeout stands in for it.
const whenIdle = (callback) =>
    'requestIdleCallback' in window ? requestIdleCallback(callback, { timeout: 1500 }) : setTimeout(callback, 200)

// App.vue calls this once. The scene loads after the first paint on every
// route, so a direct visit to any page gets the island. A route change does
// not pause it. src/three.js pauses on its own for a hidden tab, a lost
// context and reduced motion.
export function useScene() {
    onMounted(() => {
        whenIdle(() => {
            loadScene()
                .then((module) => module.resume())
                .catch((error) => {
                    // A failed chunk must not lock the gate. The visitor gets
                    // the pages without the island.
                    console.error('The scene module did not load.', error)
                    const { ready, progress, loadError } = useWaypoints()
                    loadError.value = 'The island did not load. A reload usually sorts it out.'
                    progress.value = 1
                    ready.value = true
                })
        })
    })
}

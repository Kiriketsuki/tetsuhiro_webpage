import { ref } from 'vue'

// Look-around mode. The Skills card turns it on at the telescope, the pad in
// ExplorePad.vue turns gestures into pan, zoom and tap, and the scene manager moves the
// camera or the skill sky. three.js connects them.
const exploring = ref(false)
let rig = null

export function useExplore() {
    const connect = (next) => {
        rig = next
        return () => {
            if (rig === next) rig = null
        }
    }

    const pan = (dx, dy) => rig?.pan(dx, dy)
    // x and y: the client point that the zoom keeps still, where the view supports it.
    const zoom = (factor, x, y) => rig?.zoom(factor, x, y)
    const tap = (x, y) => rig?.tap?.(x, y)

    return { exploring, connect, pan, zoom, tap }
}

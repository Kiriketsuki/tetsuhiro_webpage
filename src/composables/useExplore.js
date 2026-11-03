import { ref } from 'vue'

// Look-around mode. The Skills card turns it on at the telescope, the pad in
// ExplorePad.vue turns gestures into pan, zoom and tap, and the scene manager moves the
// camera or the skill sky. three.js connects them.
const exploring = ref(false)
// True while the move through the eyepiece and its iris run. Home holds its words back.
const looking = ref(false)
let rig = null

export function useExplore() {
    const connect = (next) => {
        rig = next
        return () => {
            if (rig === next) rig = null
        }
    }

    const pan = (dx, dy) => rig?.pan(dx, dy)
    const zoom = (factor) => rig?.zoom(factor)
    const tap = (x, y) => rig?.tap?.(x, y)

    return { exploring, looking, connect, pan, zoom, tap }
}

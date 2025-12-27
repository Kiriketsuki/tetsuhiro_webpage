import { ref } from 'vue'

// Look-around mode for the skill tree. The Skills card turns it on, the pad in
// ExplorePad.vue turns gestures into pan and zoom, and the camera rig in
// src/scene/waypoints.js does the moving. three.js connects the rig.
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
    const zoom = (factor) => rig?.zoom(factor)

    return { exploring, connect, pan, zoom }
}

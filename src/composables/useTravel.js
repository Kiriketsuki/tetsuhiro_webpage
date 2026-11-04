import { ref, watch, onBeforeUnmount } from 'vue'

// Where the camera rests, so the 2D pages show their words after a scene move and never during
// it. src/three.js sets `at` from the scene manager (onSettle). undefined: the scene has not
// reported, as with no WebGL or before the scene loads, so the pages show at once. null: a move
// between stops, the eyepiece or the board move runs, or a route change has just asked for one.
// A stop id from src/data/stops.js: the camera rests at that stop.
const at = ref(undefined)
// The longest a page waits for the camera, in milliseconds. A room or a view that fails to load
// never reports its rest, and its page must not stay empty.
const WAIT_MS = 6000

export function useTravel() {
    return { at }
}

// For a page that the camera moves into: true from the first time the camera rests after the
// page mounts, and it stays true. Moves inside the page, such as a visit to a story point in the
// About room, do not hide the words again.
export function useArrival() {
    const arrived = ref(at.value !== null)
    const timer = setTimeout(() => {
        arrived.value = true
    }, WAIT_MS)
    const stop = watch(at, (value) => {
        if (value === null) return
        arrived.value = true
        clearTimeout(timer)
        stop()
    })
    onBeforeUnmount(() => {
        clearTimeout(timer)
        stop()
    })
    return arrived
}

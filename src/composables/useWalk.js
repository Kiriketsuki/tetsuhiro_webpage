import { ref } from 'vue'

// Explore on foot (docs/island-story-and-explore-spec.md, part 2). The visitor walks Kinako
// round the aerie. The Welcome button and the Contact card start the walk, src/three.js
// connects it to the scene, and the walk itself lives in the lazy explore chunk
// (src/scene/explore). Walking is a state of Home, not a route. three.js connects start, and the
// explore chunk connects resume and end once it has loaded.
// True once the scene can walk: WebGL works and the aerie has loaded.
const available = ref(false)
// True from the move down to Kinako until the walk ends.
const walking = ref(false)
// The home section a zone opened, while the walk waits behind its card, or null.
const visiting = ref(null)
let hooks = {}

export function useWalk() {
    const connect = (next) => {
        hooks = { ...hooks, ...next }
        available.value = true
    }
    // from: 'welcome' or 'contact', the place the visitor left the story.
    const start = (from) => hooks.start?.(from)
    // Back to walking from a zone card.
    const resume = () => hooks.resume?.()
    // Ends the walk at once, with no camera move, as a route change does.
    const end = () => hooks.end?.()

    return { available, walking, visiting, connect, start, resume, end }
}

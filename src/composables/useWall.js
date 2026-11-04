import { ref } from 'vue'

// The evidence wall in the workshop, the Projects view. three.js connects the scene's wall
// controls once the wall has built and sets `shown`. Projects.vue reads `shown` to pick the
// wall over the list page, marks and focuses pins, and follows `picked` when a tap on the
// scene lands on a pin, a group label or the list post-it.
const shown = ref(false)
// True while the camera moves to or from the wall. The Projects page and the Home words wait
// for the move to end, so the owner sees the move first and the words after it.
const settling = ref(false)
const picked = ref(null)
// The pin under the mouse, for its tag. Touch has no hover: a first tap names a pin instead.
const hovered = ref(null)
let controls = null

export function useWall() {
    const connect = (next) => {
        controls = next
        return () => {
            if (controls === next) controls = null
        }
    }

    const highlight = (id, reveal = true) => controls?.highlight(id, reveal)
    const focus = (id) => controls?.focus(id)
    const unfocus = () => controls?.unfocus()
    const filter = (id) => controls?.filter(id)
    const peek = () => controls?.peek()
    const screenOf = (id) => controls?.screenOf(id) ?? null

    return { shown, settling, picked, hovered, connect, highlight, focus, unfocus, filter, screenOf, peek }
}

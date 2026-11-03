import { ref } from 'vue'

// The evidence wall in the workshop, the Projects view. three.js connects the scene's wall
// controls once the wall has built and sets `shown`. Projects.vue reads `shown` to pick the
// wall over the list page, marks and focuses pins, and follows `picked` when a tap on the
// scene lands on a pin.
const shown = ref(false)
const picked = ref(null)
let controls = null

export function useWall() {
    const connect = (next) => {
        controls = next
        return () => {
            if (controls === next) controls = null
        }
    }

    const highlight = (id) => controls?.highlight(id)
    const focus = (id) => controls?.focus(id)
    const unfocus = () => controls?.unfocus()

    return { shown, picked, connect, highlight, focus, unfocus }
}

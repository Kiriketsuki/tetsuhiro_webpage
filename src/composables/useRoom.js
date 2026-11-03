import { ref } from 'vue'

// The About room in the bedroom (/about). three.js loads the room part of the scene
// (scene/aerie/room.js), which connects its controls here and sets `shown` once the camera
// stands in the room. AboutRoom.vue reads `shown` to pick the room over the plain page, and
// drives the view through the calls below. Each call does nothing until the room connects.
const shown = ref(false)
// The story point whose note is open, or null for the view from the stand.
const opened = ref(null)
let controls = null

export function useRoom() {
    const connect = (next) => {
        controls = next
        return () => {
            if (controls === next) controls = null
        }
    }

    // dx and dy are screen pixels. The view turns with the finger.
    const look = (dx, dy) => controls?.look(dx, dy)
    // Turns the view by whole steps from the keyboard: dx and dy are -1, 0 or 1.
    const nudge = (dx, dy) => controls?.nudge(dx, dy)
    // Moves the camera to a story point, or back to the stand for null.
    const visit = (id) => controls?.visit(id)
    // Turns the view from the stand toward a story point, without a move.
    const face = (id) => controls?.face(id)
    // Client pixels of a story point, with `ahead` false when it lies behind the camera.
    const screenOf = (id) => controls?.screenOf(id) ?? null

    return { shown, opened, connect, look, nudge, visit, face, screenOf }
}

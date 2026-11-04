import { ref } from 'vue'

// The About room in the bedroom (/about). three.js loads the room part of the scene
// (scene/aerie/room.js), which connects its controls here, sets `shown` once the camera is in
// the room, and sets `arrived` each time the camera comes to rest at a stop. AboutRoom.vue reads
// them and drives the tour through the calls below. Each call does nothing until the room connects.
const shown = ref(false)
// The index of the stop the camera is at, or flies to, in data/room.js stops.
const stop = ref(0)
// True while the camera rests at `stop`, so its note shows.
const arrived = ref(false)
let controls = null

export function useRoom() {
    const connect = (next) => {
        controls = next
        return () => {
            if (controls === next) controls = null
        }
    }

    // Flies the camera to stop `index`.
    const go = (index) => controls?.go(index)
    // dx and dy are screen pixels. The view sways with the finger, and settles back on release.
    const pan = (dx, dy) => controls?.pan(dx, dy)
    const release = () => controls?.release()

    return { shown, stop, arrived, connect, go, pan, release }
}

import * as THREE from 'three'

// The follow camera (spec, Camera). It writes the rig's live `walk` shot each frame, and the rig
// places the camera from it, with the lens focus on Kinako. The default view looks from the
// south-west, 35 degrees down, from 7 m. Zoom runs from 4 to 12 m. Turns come in 45 degree
// steps from keys, or freely from a drag, eased back to the nearest step on release. The
// look point follows Kinako with a 0.15 s lag. Reduced motion follows with no lag.
//
// In the glTF frame +Z is south and -Z is north, toward the city. A yaw of 0 sets the camera
// south of Kinako, looking north.
const PITCH = THREE.MathUtils.degToRad(35)
const DISTANCE = { start: 7, min: 4, max: 12 }
const LAG = 0.15
const STEP = Math.PI / 4
const SOUTH_WEST = -Math.PI / 4
// The lookout view: the camera behind Kinako, low, looking north over the rim at the city.
const LOOKOUT = { yaw: 0, pitch: THREE.MathUtils.degToRad(12), distance: 4.5 }
// The look point sits this high over the feet, about the middle of the kit.
const LIFT = 0.22

export function createFollow() {
    const shot = { position: new THREE.Vector3(), target: new THREE.Vector3(), focus: new THREE.Vector3(), fov: 35, shift: [0, 0], tall: [0, 0], zoom: 1, tallZoom: 1 }
    const look = new THREE.Vector3()
    const goal = new THREE.Vector3()
    const view = { yaw: SOUTH_WEST, pitch: PITCH, distance: DISTANCE.start }
    const want = { ...view }
    let dragging = false
    let lookout = false

    const place = () => {
        const flat = Math.cos(view.pitch) * view.distance
        shot.target.copy(look)
        shot.focus.copy(look)
        shot.position.set(look.x + Math.sin(view.yaw) * flat, look.y + Math.sin(view.pitch) * view.distance, look.z + Math.cos(view.yaw) * flat)
    }

    const snap = (feet) => {
        look.copy(feet).y += LIFT
        Object.assign(view, want)
        place()
    }

    // Returns true while the camera still eases toward its goal.
    const update = (dt, feet, reduced) => {
        goal.copy(feet).y += LIFT
        const k = reduced ? 1 : 1 - Math.exp(-dt / LAG)
        look.lerp(goal, k)
        const ease = reduced ? 1 : 1 - Math.exp(-dt / 0.25)
        let busy = look.distanceToSquared(goal) > 1e-6
        for (const key of ['yaw', 'pitch', 'distance']) {
            if (dragging && key === 'yaw') continue
            view[key] += (want[key] - view[key]) * ease
            if (Math.abs(want[key] - view[key]) > 1e-4) busy = true
            else view[key] = want[key]
        }
        place()
        return busy
    }

    const leaveLookout = () => {
        if (!lookout) return
        lookout = false
        want.pitch = PITCH
        want.distance = DISTANCE.start
    }

    // steps: +1 or -1, one 45 degree turn.
    const turn = (steps) => {
        leaveLookout()
        want.yaw = Math.round(want.yaw / STEP) * STEP + steps * STEP
    }

    // A drag turns freely. Release eases to the nearest step.
    const drag = (radians) => {
        leaveLookout()
        dragging = true
        view.yaw += radians
        want.yaw = view.yaw
    }
    const release = () => {
        if (!dragging) return
        dragging = false
        want.yaw = Math.round(view.yaw / STEP) * STEP
    }

    // A factor above 1 moves in, below 1 moves out.
    const zoom = (factor) => {
        if (!factor) return
        want.distance = THREE.MathUtils.clamp(want.distance / factor, DISTANCE.min, DISTANCE.max)
    }

    // The lookout zone turns the view to the city, and a second use turns it back.
    const toggleLookout = () => {
        if (lookout) {
            leaveLookout()
            return
        }
        lookout = true
        Object.assign(want, LOOKOUT)
        want.yaw = Math.round((view.yaw - LOOKOUT.yaw) / (Math.PI * 2)) * Math.PI * 2 + LOOKOUT.yaw
    }

    // The ground directions of the view: forward runs from the camera to Kinako.
    const forward = (out) => out.set(-Math.sin(view.yaw), 0, -Math.cos(view.yaw))
    const right = (out) => out.set(Math.cos(view.yaw), 0, -Math.sin(view.yaw))

    return { shot, snap, update, turn, drag, release, zoom, toggleLookout, leaveLookout, forward, right }
}

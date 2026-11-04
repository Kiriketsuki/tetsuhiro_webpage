import * as THREE from 'three'

// The follow camera (spec, Camera). It writes the rig's live `walk` shot each frame, and the rig
// places the camera from it, with the lens focus on Kinako. The default view looks from the
// south-west, 35 degrees down, from 7 m. Zoom runs from 1.5 to 12 m, so a player can come close
// and see Kinako. The camera lowers its pitch as it closes in, to 14 degrees at 1.5 m, so a
// close view looks at Kinako and not down on Kinako. Turns come in 45 degree
// steps from keys, or freely from a drag, eased back to the nearest step on release. The
// look point follows Kinako with a 0.15 s lag. Reduced motion follows with no lag.
//
// In the glTF frame +Z is south and -Z is north, toward the city. A yaw of 0 sets the camera
// south of Kinako, looking north.
const PITCH = THREE.MathUtils.degToRad(35)
const DISTANCE = { start: 7, min: 1.5, max: 12 }
// The close view: under `from` metres the pitch eases down to `pitch` at DISTANCE.min.
const CLOSE = { from: 5, pitch: THREE.MathUtils.degToRad(14) }
const LAG = 0.15
const STEP = Math.PI / 4
const SOUTH_WEST = -Math.PI / 4
// The lookout view: the camera behind Kinako, low, looking north over the rim at the city.
const LOOKOUT = { yaw: 0, pitch: THREE.MathUtils.degToRad(12), distance: 4.5 }
// The look point sits this high over the feet, about the middle of the kit.
const LIFT = 0.22
// The camera keeps this far in front of a wall or room block between it and Kinako, and comes
// no closer to Kinako than NEAR. It pulls in at once and eases back out.
const CLEAR = { gap: 0.35, near: 1.2, out: 0.6 }
// A camera squeezed closer than `tight` for `wait` seconds swings to the nearest 45 degree step
// with at least `open` metres clear, as on the stair tower or behind the house.
const SWING = { tight: 2.5, wait: 0.5, open: 5 }

// reach(look, dir, distance): how far the camera may stand from the look point along dir, from
// a ray against the collision proxy. It keeps the camera out of the house and the rooms.
export function createFollow({ reach = null } = {}) {
    const shot = { position: new THREE.Vector3(), target: new THREE.Vector3(), focus: new THREE.Vector3(), fov: 35, shift: [0, 0], tall: [0, 0], zoom: 1, tallZoom: 1 }
    const look = new THREE.Vector3()
    const goal = new THREE.Vector3()
    const view = { yaw: SOUTH_WEST, pitch: PITCH, distance: DISTANCE.start }
    const want = { ...view }
    let dragging = false
    let lookout = false
    const dir = new THREE.Vector3()
    const probe = new THREE.Vector3()
    let held = DISTANCE.start
    let squeezed = 0

    const clearAt = (yaw) => {
        probe.set(Math.sin(yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(yaw) * Math.cos(view.pitch))
        return reach(look, probe, view.distance)
    }

    // Swings the camera once it has stayed squeezed for a moment, unless a drag holds it.
    const swing = (dt) => {
        if (!reach || dragging || lookout) return
        // A close zoom is not a squeeze: only a wall that holds the camera nearer than asked.
        squeezed = held < Math.min(SWING.tight, view.distance * 0.8) ? squeezed + dt : 0
        if (squeezed < SWING.wait) return
        squeezed = 0
        const base = Math.round(want.yaw / STEP) * STEP
        for (const k of [1, -1, 2, -2, 3, -3, 4]) {
            if (clearAt(base + k * STEP) >= Math.min(SWING.open, view.distance)) {
                want.yaw = base + k * STEP
                return
            }
        }
    }

    const place = (dt = 0) => {
        dir.set(Math.sin(view.yaw) * Math.cos(view.pitch), Math.sin(view.pitch), Math.cos(view.yaw) * Math.cos(view.pitch))
        const free = reach ? Math.max(CLEAR.near, Math.min(view.distance, reach(look, dir, view.distance) - CLEAR.gap)) : view.distance
        held = free < held || dt === 0 ? free : held + (free - held) * (1 - Math.exp(-dt / CLEAR.out))
        shot.target.copy(look)
        shot.focus.copy(look)
        shot.position.copy(look).addScaledVector(dir, held)
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
        place(reduced ? 0 : dt)
        swing(dt)
        return busy || Math.abs(held - view.distance) > 1e-3
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

    // The pitch for a zoom distance: the default pitch from CLOSE.from out, easing down below it.
    const pitchFor = (distance) => {
        const t = THREE.MathUtils.smoothstep(distance, DISTANCE.min, CLOSE.from)
        return THREE.MathUtils.lerp(CLOSE.pitch, PITCH, t)
    }

    // A factor above 1 moves in, below 1 moves out.
    const zoom = (factor) => {
        if (!factor) return
        want.distance = THREE.MathUtils.clamp(want.distance / factor, DISTANCE.min, DISTANCE.max)
        if (!lookout) want.pitch = pitchFor(want.distance)
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

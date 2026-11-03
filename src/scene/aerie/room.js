import * as THREE from 'three'
import { useRoom } from '../../composables/useRoom.js'
import { useWaypoints } from '../../composables/useWaypoints.js'
import { points, stand, LOOK_LIMIT } from '../../data/room.js'
import { addRoomProps } from './room-props.js'

// The About room: the camera walks in through the bedroom's balcony door, stands just inside,
// and looks round. A story point moves the camera close to its thing. src/three.js loads this
// module as its own chunk on the first visit to /about, and calls show() on each way in and out.
// The way out is a plain manager.goTo: scene-manager.js sends a move that starts in the bedroom
// out through the same door.
//
// The camera has one rig shot, 'room'. Each frame the view eases toward its goal, and the
// shot is replaced and jumped to. A jump draws the shot at once, and the easing here makes
// the motion. The door move in belongs to the rig, so the easing waits for it to end.

const SHOT = 'room'
// The look point sits this far ahead of the camera. A short distance keeps the rig's pointer
// drift, which scales with it, to a few millimetres in the room.
const LOOK_AHEAD = 1.5
// How fast the view closes on its goal, per second. 3.5 takes about a second to settle.
const EASE = 3.5
// Degrees of turn per pixel of drag, and per arrow key.
const DRAG = 0.16
const NUDGE = 18
// The lens on the way to a story point, in degrees.
const VISIT_FOV = 50
// With a note open, the thing moves clear of the note: right on a wide screen, where the note
// sits on the left, and up on a phone, where it sits at the bottom (camera-rig.js shift, tall).
const NOTE_SHIFT = { shift: [0.16, 0], tall: [0, 0.22] }
// The grade inside the room. The island light makes the cream walls a flat orange at close
// range, so the room takes some colour out and darkens a little (uFade darkens by 28 percent
// at 1). The grade fades in over the first metre past the door, and out again on the way out.
const ROOM_GRADE = { saturation: 0.64, lift: -0.02, fade: 1, depth: 1 }
// The share of that grade depth at which the tags show on the way in.
const SHOW_DEPTH = 0.5
// How close the door move must come to the first view before the room takes the camera.
const ARRIVED = { distance: 0.04, degrees: 2 }

const toRadians = THREE.MathUtils.degToRad
// The way a yaw and pitch look, in degrees. Yaw 0 looks straight back (-z), positive to the left.
const direction = (yaw, pitch) => {
    const y = toRadians(yaw)
    const p = toRadians(pitch)
    return new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p))
}

// The yaw and pitch, in degrees, from one point toward another.
const aimOf = (from, to) => {
    const d = to.clone().sub(from)
    return { yaw: THREE.MathUtils.radToDeg(Math.atan2(-d.x, -d.z)), pitch: THREE.MathUtils.radToDeg(Math.atan2(d.y, Math.hypot(d.x, d.z))) }
}

const clampLook = (view) => ({
    ...view,
    yaw: THREE.MathUtils.clamp(view.yaw, ...LOOK_LIMIT.yaw),
    pitch: THREE.MathUtils.clamp(view.pitch, ...LOOK_LIMIT.pitch),
})

const STAND = {
    position: new THREE.Vector3(...stand.position),
    yaw: stand.yaw,
    pitch: stand.pitch,
    fov: stand.fov,
    focus: new THREE.Vector3(...stand.position).addScaledVector(direction(stand.yaw, stand.pitch), 2.5),
    note: false,
}

// The view from a story point's `from`, looking at its `at`.
const VISITS = Object.fromEntries(
    points.map((point) => {
        const position = new THREE.Vector3(...point.from)
        const focus = new THREE.Vector3(...point.at)
        return [point.id, { position, ...aimOf(position, focus), fov: VISIT_FOV, focus, note: true }]
    }),
)
const copyOf = (v) => ({ ...v, position: v.position.clone(), focus: v.focus.clone() })
const AT = Object.fromEntries(points.map((point) => [point.id, new THREE.Vector3(...point.at)]))

// door is bedroomDoor from src/data/route.js. src/three.js hands it over, because an import of
// route.js here would tie this chunk to the scene chunk, and Rollup would then merge the scene
// chunk into a shared one.
export function createRoom(manager, door) {
    const { rig, camera } = manager
    const DOOR = { side: 'in', ...Object.fromEntries(['outside', 'porch', 'inside'].map((key) => [key, new THREE.Vector3(...door[key])])) }
    // The front wall plane, where the grade starts.
    const FRONT = door.room[1][2]
    const room = useRoom()
    const { reducedMotion } = useWaypoints()
    let props = null
    let inside = false
    // goal: where the view eases to. view: where it is now. Both hold position, yaw, pitch,
    // fov, focus and note. frame is the animation frame of the loop, or 0 when it is idle.
    let goal = { ...STAND }
    let view = null
    let frame = 0
    let last = 0
    let base = null
    // True while the view has not reached its goal.
    let pending = false
    // The goal turned to a new yaw and pitch. The lens focus moves with the view, at the
    // distance it had, so a turn never leaves the thing in front of the camera out of focus.
    const turned = (angles) => {
        const next = clampLook({ ...goal, ...angles })
        const distance = goal.focus.distanceTo(goal.position)
        return { ...next, focus: goal.position.clone().addScaledVector(direction(next.yaw, next.pitch), distance) }
    }
    const aim = (next) => {
        goal = next
        pending = true
        wake()
    }

    const shotOf = (v) => ({
        position: v.position.clone(),
        target: v.position.clone().addScaledVector(direction(v.yaw, v.pitch), LOOK_AHEAD),
        focus: v.focus.clone(),
        fov: v.fov,
        shift: v.note ? NOTE_SHIFT.shift : [0, 0],
        tall: v.note ? NOTE_SHIFT.tall : [0, 0],
        zoom: 1,
        tallZoom: 1,
    })

    // How far the camera stands in the room, from 0 at the front wall to 1 a metre in.
    const depth = () => {
        const p = camera.position
        const box = door.room
        if (p.x < box[0][0] || p.x > box[1][0] || p.y < box[0][1] || p.y > box[1][1]) return 0
        return THREE.MathUtils.clamp((FRONT - p.z) / ROOM_GRADE.depth, 0, 1)
    }

    // Writes the room grade for depth k. The base values come from the pipeline in force,
    // which a quality change can rebuild.
    const grade = (k) => {
        const uniforms = manager.pipeline.grade.uniforms
        if (!base || base.uniforms !== uniforms) {
            base = { uniforms, saturation: uniforms.uSaturation.value, lift: uniforms.uLift.value.clone() }
        }
        const saturation = base.saturation * THREE.MathUtils.lerp(1, ROOM_GRADE.saturation, k)
        if (Math.abs(uniforms.uSaturation.value - saturation) < 1e-4 && uniforms.uFade.value === ROOM_GRADE.fade * k) return false
        uniforms.uSaturation.value = saturation
        uniforms.uLift.value.copy(base.lift).addScalar(ROOM_GRADE.lift * k)
        uniforms.uFade.value = ROOM_GRADE.fade * k
        return true
    }

    // One step of the view toward the goal. Returns true when it moved the camera.
    const ease = (delta) => {
        if (!pending) return false
        const k = reducedMotion.value ? 1 : 1 - Math.exp(-EASE * delta)
        const next = {
            position: view.position.clone().lerp(goal.position, k),
            yaw: THREE.MathUtils.lerp(view.yaw, goal.yaw, k),
            pitch: THREE.MathUtils.lerp(view.pitch, goal.pitch, k),
            fov: THREE.MathUtils.lerp(view.fov, goal.fov, k),
            focus: view.focus.clone().lerp(goal.focus, k),
            note: goal.note,
        }
        const near = next.position.distanceTo(goal.position) < 1e-3 && Math.abs(next.yaw - goal.yaw) < 0.05 && Math.abs(next.pitch - goal.pitch) < 0.05 && Math.abs(next.fov - goal.fov) < 0.05
        view = near ? copyOf(goal) : next
        pending = !near
        rig.addShot(SHOT, shotOf(view))
        rig.jump(SHOT)
        return true
    }

    // True once the camera stands within ARRIVED.distance metres of the stand and looks within
    // ARRIVED.degrees of its first view.
    const arrived = () =>
        camera.position.distanceTo(STAND.position) < ARRIVED.distance &&
        camera.getWorldDirection(new THREE.Vector3()).angleTo(direction(STAND.yaw, STAND.pitch)) < toRadians(ARRIVED.degrees)

    // The loop runs while the camera is in the room or the grade still has to fade out.
    const loop = (now) => {
        const delta = Math.min(0.1, last ? (now - last) / 1000 : 0)
        last = now
        frame = 0
        const k = depth()
        let dirty = grade(k)
        // The tags show once the camera is half way through the grade, so they never float over
        // the walls outside. The door move eases out slowly at its end.
        if (inside && k >= SHOW_DEPTH && !room.shown.value) room.shown.value = true
        // The door move in belongs to the rig. The view takes over once it ends, or once the
        // camera stands at the stand and faces the first view, because a long move eases out
        // over its last seconds. rig.moving is also true while the mouse drift settles, so the
        // test reads the move itself.
        if (inside && (!rig.moveDuration || arrived())) {
            view ??= copyOf(STAND)
            if (!room.shown.value) room.shown.value = true
            dirty = ease(delta) || dirty
        }
        if (dirty) manager.requestRender()
        if (inside || depth() > 0) frame = requestAnimationFrame(loop)
    }
    const wake = () => {
        if (frame) return
        last = 0
        frame = requestAnimationFrame(loop)
    }

    const controls = {
        look: (dx, dy) => {
            if (view) aim(turned({ yaw: goal.yaw + dx * DRAG, pitch: goal.pitch + dy * DRAG }))
        },
        nudge: (dx, dy) => {
            if (view) aim(turned({ yaw: goal.yaw - dx * NUDGE, pitch: goal.pitch - dy * NUDGE * 0.5 }))
        },
        visit: (id) => aim(copyOf(VISITS[id] ?? STAND)),
        // Turns the view from the stand toward a story point, for a tag that takes keyboard focus.
        face: (id) => {
            if (view && AT[id] && !goal.note) aim(clampLook({ ...copyOf(STAND), ...aimOf(STAND.position, AT[id]), focus: AT[id].clone() }))
        },
        screenOf: (id) => {
            const at = AT[id]
            if (!at) return null
            const ahead = at.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) > 0
            const p = at.clone().project(camera)
            return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight, ahead }
        },
    }
    room.connect(controls)

    // on: in through the balcony door, or at once with cut. Off: the room lets go of the
    // camera and src/three.js moves it out. The grade fades with the camera's depth.
    const show = (on, { cut = false } = {}) => {
        inside = on
        if (!on) {
            room.shown.value = false
            room.opened.value = null
            view = null
            wake()
            return
        }
        props ??= addRoomProps(manager.scene)
        goal = copyOf(STAND)
        pending = false
        rig.addShot(SHOT, shotOf(goal))
        if (cut || reducedMotion.value) rig.jump(SHOT)
        else rig.goTo(SHOT, { door: DOOR })
        manager.requestRender()
        wake()
    }

    return { show }
}

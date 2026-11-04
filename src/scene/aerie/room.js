import * as THREE from 'three'
import { useRoom } from '../../composables/useRoom.js'
import { useWaypoints } from '../../composables/useWaypoints.js'
import { stops } from '../../data/room.js'
import { hideOldRoom, loadRoomKit } from './room-kit.js'

// The About room: a guided tour of the bedroom. The camera flies in through the balcony door to
// the first stop in one planned move, then from stop to stop each time the visitor asks for the
// next one. Every move is a rig move (camera-rig.js, camera-move.js), so it keeps the smootherstep
// speed curve, one speed peak and the turn limit of docs/smooth-camera.md. src/three.js loads
// this module as its own chunk, creates the room once, and calls show() on each way in and out.
// The way out is a plain manager.goTo: scene-manager.js sends a move that starts in the bedroom
// out through the same door.
//
// The room is the bedroom kit (room-kit.js). It loads as soon as the room is created, which
// src/three.js does while the scene extras load, so the new bedroom shows through its windows
// before the first visit.

// The look point of each stop sits this far ahead of the lens. A short distance keeps the rig's
// pointer drift, which scales with it, to a few millimetres in the room.
const LOOK_AHEAD = 1.5
// The thing moves clear of the note: right on a wide screen, where the note sits on the left, and
// up on a phone, where it sits at the bottom (camera-rig.js shift, tall).
const NOTE_SHIFT = { shift: [0.16, 0], tall: [0, 0.22] }
// The grade inside the room. The aerie light makes the room a flat orange at close range, so the
// room takes some colour out and darkens a little (uFade darkens by 28 percent at 1). The grade
// fades in over the first metre past the door, and out again on the way out. The asanoha paper
// and the honey wainscot read orange under the aerie light, so the grade still takes a third of
// the colour out.
const ROOM_GRADE = { saturation: 0.7, lift: -0.015, fade: 0.6, depth: 1 }
// The share of that grade depth at which the tour UI shows on the way in.
const SHOW_DEPTH = 0.5
const shotId = (index) => `room-${stops[index].id}`

// One rig shot for a stop: the lens at `from`, looking at `at`.
function shotOf(stop) {
    const position = new THREE.Vector3(...stop.camera.from)
    const focus = new THREE.Vector3(...stop.camera.at)
    const ahead = focus.clone().sub(position).normalize().multiplyScalar(LOOK_AHEAD)
    return {
        position,
        target: position.clone().add(ahead),
        focus,
        fov: stop.camera.fov,
        shift: NOTE_SHIFT.shift,
        tall: NOTE_SHIFT.tall,
        zoom: 1,
        tallZoom: 1,
    }
}

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
    let inside = false
    let frame = 0
    let base = null

    // The kit replaces the old bedroom things only once it has loaded, so a failed load leaves
    // the old room in place and the tour still runs.
    const kit = manager.ready
        .then(() => {
            if (!manager.toon) throw new Error('the aerie look is not built')
            return loadRoomKit(manager.loaders.gltf, manager.toon)
        })
        .then((loaded) => {
            hideOldRoom(manager.scene)
            manager.scene.add(loaded.root)
            manager.requestRender()
            return loaded
        })
    kit.catch((error) => console.error('The About room kit did not load.', error))
    stops.forEach((stop, index) => rig.addShot(shotId(index), shotOf(stop)))

    // How far the camera stands in the room, from 0 at the front wall to 1 a metre in.
    const depth = () => {
        const p = camera.position
        const box = door.room
        if (p.x < box[0][0] || p.x > box[1][0] || p.y < box[0][1] || p.y > box[1][1]) return 0
        return THREE.MathUtils.clamp((FRONT - p.z) / ROOM_GRADE.depth, 0, 1)
    }

    // Writes the room grade for depth k. The base values come from the pipeline in force, which
    // a quality change can rebuild.
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

    // The loop runs while the camera is in the room or the grade still has to fade out. The UI
    // shows once the camera is half way through the grade, so it never floats over the walls
    // outside. A stop counts as reached when the rig has no move left (rig.moveDuration is 0).
    const loop = () => {
        frame = 0
        const k = depth()
        if (grade(k)) manager.requestRender()
        if (inside) {
            if (k >= SHOW_DEPTH && !room.shown.value) room.shown.value = true
            if (room.shown.value && !rig.moveDuration && !room.arrived.value) room.arrived.value = true
        }
        if (inside || depth() > 0) frame = requestAnimationFrame(loop)
    }
    const wake = () => {
        if (!frame) frame = requestAnimationFrame(loop)
    }

    const go = (index) => {
        const next = THREE.MathUtils.clamp(index, 0, stops.length - 1)
        if (!inside) return
        room.stop.value = next
        room.arrived.value = false
        if (reducedMotion.value) rig.jump(shotId(next))
        else rig.goTo(shotId(next))
        manager.requestRender()
        wake()
    }

    room.connect({
        go,
        pan: (dx, dy) => {
            if (inside && room.arrived.value) {
                rig.pan(dx, dy)
                manager.requestRender()
            }
        },
        release: () => {
            rig.release()
            manager.requestRender()
        },
    })

    // on: in through the balcony door to the first stop, or at once with cut. Off: the room lets
    // go of the camera and src/three.js moves it out. The grade fades with the camera's depth.
    const show = (on, { cut = false } = {}) => {
        inside = on
        room.arrived.value = false
        if (!on) {
            room.shown.value = false
            wake()
            return
        }
        room.stop.value = 0
        if (cut || reducedMotion.value) rig.jump(shotId(0))
        else rig.goTo(shotId(0), { door: DOOR })
        manager.requestRender()
        wake()
    }

    // loaded resolves once the kit is in the scene, or has failed and left the old room.
    return { show, loaded: kit.then(() => {}).catch(() => {}) }
}

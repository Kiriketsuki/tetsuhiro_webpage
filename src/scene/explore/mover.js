import * as THREE from 'three'
import { Capsule } from 'three/examples/jsm/math/Capsule.js'
import { insideBox } from './world.js'

// Kinako's body for the physics: a kinematic capsule against the proxy Octree, as the three.js
// games_fps example moves its player. Gravity pulls it down, and each overlap pushes it out
// along the contact normal. The capsule slides along walls and stands on floors and ramps.
//
// Sizes from the spec (Walker design): a 0.15 m radius and a 0.35 m height, for a kit that
// stands 0.25 m at the shoulder.
const RADIUS = 0.15
const HEIGHT = 0.35
const GRAVITY = 20
// Four short steps a frame keep a fast walker from passing through a thin wall strip.
const SUBSTEPS = 4
// A contact normal this upright or more is a floor.
const FLOOR_NY = 0.5
// On the way down a slope or off a low step, the capsule drops back onto a floor this close
// under it, so it walks down and does not float off each edge.
const STEP_DOWN = 0.22
// The automatic hop (spec, Walker design): onto a Hop_ top that rises this much over the feet.
const HOP = { min: 0.1, max: 0.5, ahead: 0.35, lift: 0.08 }
// A walker below this far under its spawn has left the aerie, so it goes back to the spawn.
const LOST = 8

export function createMover(world) {
    const capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), RADIUS)
    const velocity = new THREE.Vector3()
    const feet = new THREE.Vector3()
    const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
    const ahead = new THREE.Vector3()
    let onFloor = false

    const place = (p) => {
        capsule.start.set(p.x, p.y + RADIUS, p.z)
        capsule.end.set(p.x, p.y + HEIGHT - RADIUS, p.z)
        velocity.set(0, 0, 0)
        onFloor = false
    }

    const collide = () => {
        const hit = world.octree.capsuleIntersect(capsule)
        onFloor = false
        if (!hit) return
        onFloor = hit.normal.y >= FLOOR_NY
        if (!onFloor) velocity.addScaledVector(hit.normal, -hit.normal.dot(velocity))
        else if (velocity.y < 0) velocity.y = 0
        if (hit.depth > 1e-10) capsule.translate(hit.normal.multiplyScalar(hit.depth))
    }

    const snapDown = () => {
        ray.origin.copy(capsule.start)
        const hit = world.octree.rayIntersect(ray)
        if (!hit || hit.distance > RADIUS + STEP_DOWN) return
        capsule.translate(ahead.set(0, RADIUS - hit.distance, 0))
        onFloor = true
    }

    // wish: the horizontal velocity the controls ask for, in metres a second.
    const step = (dt, wish) => {
        const h = dt / SUBSTEPS
        for (let i = 0; i < SUBSTEPS; i += 1) {
            const k = 1 - Math.exp(-h * (onFloor ? 14 : 3))
            velocity.x += (wish.x - velocity.x) * k
            velocity.z += (wish.z - velocity.z) * k
            if (!onFloor) velocity.y -= GRAVITY * h
            capsule.translate(ahead.copy(velocity).multiplyScalar(h))
            const wasOnFloor = onFloor
            collide()
            if (wasOnFloor && !onFloor && velocity.y <= 0) snapDown()
        }
        if (capsule.start.y < world.spawn.y - LOST) place(world.spawn)
    }

    // Hops onto a Hop_ top ahead along dir when the walker pushes against it. Returns true on a hop.
    const tryHop = (dir, pushing) => {
        if (!onFloor || !pushing) return false
        const at = position()
        ahead.copy(at).addScaledVector(dir, HOP.ahead)
        const hop = world.hops.find((h) => insideBox(h.node, ahead, true) && h.top - at.y >= HOP.min && h.top - at.y <= HOP.max)
        if (!hop) return false
        velocity.y = Math.sqrt(2 * GRAVITY * (hop.top - at.y + HOP.lift))
        onFloor = false
        return true
    }

    // The point on the ground under the capsule.
    const position = () => feet.set(capsule.start.x, capsule.start.y - RADIUS, capsule.start.z)

    place(world.spawn)
    return {
        place,
        step,
        tryHop,
        position,
        velocity,
        get onFloor() {
            return onFloor
        },
    }
}

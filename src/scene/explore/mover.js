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
// A ledge the probe finds must be this flat (the up share of its normal) to stand on. The probe
// samples the ground at these distances ahead of the capsule middle, from just past its front to
// HOP.ahead, so it finds a thin lip as well as a broad step.
const LEDGE_FLAT = 0.8
const LEDGE_SAMPLES = [0.18, 0.23, 0.28, 0.35]
// The landing check: the floor this far past the highest top must lie within DROP of that top.
// A thin wall strip or a rail has open air past it, and a hop over one fell 3 m off the landing.
const LEDGE_LANDING = 0.3
// The round foot of the capsule climbs a rise up to about RADIUS * (1 - cos 60 degrees), 0.075 m.
// A probed ledge from LEDGE_MIN up takes a small hop, so no rise sits between a climb and a hop.
// The pad rim is such a lip: 0.08 m over the lawn on the diagonals.
const LEDGE_MIN = 0.05
// A standing walker never steps off an edge with more than DROP metres of fall below it. Stairs
// are ramps and hops only go up, so no path needs a deeper drop. The first tower landing has open
// sides with 3.9 m down to the lawn, and the proxy has no wall there.
const DROP = 1.0
// A walker whose foot is this close over the proxy stands, though the collide step read a wall.
// On a 38 degree flight the gap straight down from the foot middle is already 0.04 m.
const STANDING_GAP = 0.08
// A walker below this far under its spawn has left the aerie, so it goes back to the spawn.
const LOST = 8

export function createMover(world) {
    const capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), RADIUS)
    const velocity = new THREE.Vector3()
    const feet = new THREE.Vector3()
    const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
    const ahead = new THREE.Vector3()
    const probe = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
    const up = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 1, 0))
    const normal = new THREE.Vector3()
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
    // The distance from the capsule foot down to the proxy, or Infinity.
    const floorGap = () => {
        ray.origin.copy(capsule.start)
        const hit = world.octree.rayIntersect(ray)
        return hit ? hit.distance - RADIUS : Infinity
    }
    const before = { start: new THREE.Vector3(), end: new THREE.Vector3() }

    const step = (dt, wish) => {
        const h = dt / SUBSTEPS
        for (let i = 0; i < SUBSTEPS; i += 1) {
            const k = 1 - Math.exp(-h * (onFloor ? 14 : 3))
            velocity.x += (wish.x - velocity.x) * k
            velocity.z += (wish.z - velocity.z) * k
            if (!onFloor) velocity.y -= GRAVITY * h
            // A walker against a wall reads the wall contact, so standing also counts a floor right
            // under the foot (see standing).
            const grounded = velocity.y <= 0.5 && (onFloor || floorGap() <= STANDING_GAP)
            before.start.copy(capsule.start)
            before.end.copy(capsule.end)
            capsule.translate(ahead.copy(velocity).multiplyScalar(h))
            const wasOnFloor = onFloor
            collide()
            if (wasOnFloor && !onFloor && velocity.y <= 0) snapDown()
            if (grounded && !onFloor && velocity.y <= 0 && floorGap() > DROP) {
                capsule.start.copy(before.start)
                capsule.end.copy(before.end)
                velocity.set(0, 0, 0)
                onFloor = true
            }
        }
        if (capsule.start.y < world.spawn.y - LOST) place(world.spawn)
    }

    // The top of a low ledge ahead along dir, or null. Rays drop from over the highest hop onto
    // the proxy at each sample, and the highest flat top counts. It must sit in the hop range over
    // the feet and leave room for the capsule over it. This finds a ledge the export marks with no
    // Hop_ box, such as the rim of the landing pad: a lip 0.11 to 0.15 m high round a pad that
    // stands only 0.05 m over the lawn.
    const ledgeTop = (at, dir) => {
        let top = -Infinity
        let past = 0
        for (const d of LEDGE_SAMPLES) {
            probe.origin.set(at.x + dir.x * d, at.y + HOP.max + 0.3, at.z + dir.z * d)
            const hit = world.octree.rayIntersect(probe)
            if (!hit || Math.abs(hit.triangle.getNormal(normal).y) < LEDGE_FLAT) continue
            if (hit.position.y > top) {
                top = hit.position.y
                past = d + LEDGE_LANDING
                up.origin.set(probe.origin.x, top + 0.02, probe.origin.z)
            }
        }
        const rise = top - at.y
        if (rise < LEDGE_MIN || rise > HOP.max) return null
        probe.origin.set(at.x + dir.x * past, top + 0.3, at.z + dir.z * past)
        const landing = world.octree.rayIntersect(probe)
        if (!landing || landing.distance - 0.3 > DROP) return null
        const roof = world.octree.rayIntersect(up)
        return roof && roof.distance < HEIGHT ? null : top
    }

    // Hops onto a low top ahead along dir. A Hop_ top fires when the walker pushes against it,
    // or when it walks into the top from outside. The lookout bench seat is a slab with open
    // space under it, so a walker from the deck passes under the seat and never pushes against
    // it. Any other low ledge fires when the walker pushes against it. Returns true on a hop.
    // True when the walker stands, or presses on a wall with the floor right under its foot. The
    // collide step keeps one contact, so a walker pushed against a lip reads the wall and not the
    // floor, and onFloor turns false while it stands still.
    const standing = () => onFloor || (velocity.y <= 0.5 && floorGap() <= STANDING_GAP)

    const tryHop = (dir, pushing) => {
        if (!standing()) return false
        const at = position()
        ahead.copy(at).addScaledVector(dir, HOP.ahead)
        const rises = (h) => h.top - at.y >= HOP.min && h.top - at.y <= HOP.max
        const hop = world.hops.find((h) => insideBox(h.node, ahead, true) && (pushing || !insideBox(h.node, at, true)) && rises(h))
        const top = hop ? hop.top : pushing ? ledgeTop(at, dir) : null
        if (top === null) return false
        velocity.y = Math.sqrt(2 * GRAVITY * (top - at.y + HOP.lift))
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

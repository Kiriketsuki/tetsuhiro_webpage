import * as THREE from 'three'
import { loadWorld, insideBox } from './world.js'
import { createMover } from './mover.js'
import { createWalkerBody } from './body.js'
import { createFollow } from './follow.js'
import { createControls } from './controls.js'
import { createOverlay } from './overlay.js'
import { createCutaway } from './cutaway.js'

// Explore on foot: one walk session over the scene manager (docs/island-story-and-explore-spec.md,
// part 2). src/three.js loads this chunk on the first walk and hands in `story`: the useWalk
// state, the active home section, goToSection and currentStop. The session moves the story
// itself, so the scene chunk carries only a few lines of glue. A zone card sets `visiting`, and
// that section takes the camera as usual. Leaving ends the walk on a section, or on the one the
// walk left.
//
// The session steps once a frame through manager.setWalker, before the rig places the camera.
// Under reduced motion the manager runs no loop, so the session runs its own while input moves
// Kinako, and draws each of those frames with manager.renderNow.
// It moves the capsule, poses Kinako (body.js), writes the follow shot, and opens a zone prompt
// once Kinako stops in a zone. A zone never fires on its own. While Kinako rests, the step
// reports no motion, so the manager draws the idle habits on its ambient clock and not at the
// full frame rate. Under reduced motion, Kinako holds a still sit.

// Walk and run speeds in metres a second (spec, The walker).
const SPEED = { walk: 2.2, run: 4.5 }
// A walker slower than this, in metres a second, has stopped, so a zone prompt may open.
const STOPPED = 0.25
// The share of the asked speed under which a push against a ledge counts as blocked. It counts
// the speed along the asked direction only: on a round rim the capsule slides sideways along the
// lip and keeps its speed, but makes no progress.
const BLOCKED = 0.35

// Each zone: its prompt, and what it opens. section: the home section a card shows.
const ZONES = {
    Pad: { label: 'back to the story', leave: 0 },
    Workshop: { label: 'look inside', section: 1 },
    Bedroom: { label: 'look inside', section: 2 },
    Telescope: { label: 'look through', section: 3 },
    Campfire: { label: 'sit by the fire', section: 4 },
    Lookout: { label: 'sit', lookout: true },
}

export function createExplore(manager, story) {
    const { rig, scene } = manager
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let world = null
    let mover = null
    let body = null
    let cutaway = null
    let mode = 'off'
    let zone = null
    let lastAt = null
    // The camera stays on Kinako's side of any wall: a ray from Kinako toward the camera.
    const ray = new THREE.Ray()
    const reach = (from, dir, far) => {
        if (!world) return far
        ray.origin.copy(from)
        ray.direction.copy(dir)
        const hit = world.octree.rayIntersect(ray)
        return hit && hit.distance < far ? hit.distance : far
    }
    const follow = createFollow({ reach })
    const wish = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const right = new THREE.Vector3()
    const travel = new THREE.Vector3()

    let still = 0
    const stillFrame = (time) => {
        const busy = step(lastAt === null ? 0 : (time - lastAt) / 1000, time)
        manager.renderNow()
        still = busy && mode === 'walking' ? requestAnimationFrame(stillFrame) : 0
    }
    // Input wakes the loop. Under reduced motion it starts the session's own frames.
    const wake = () => {
        if (reduced() && !still && mode === 'walking') still = requestAnimationFrame(stillFrame)
        manager.requestRender()
    }
    const controls = createControls({ onInput: wake, padCentre: () => overlay.padCentre() })
    const overlay = createOverlay({ onUse: () => controls.use(), onLeave: () => controls.leave() })

    const built = (async () => {
        world = await loadWorld(manager.loaders)
        mover = createMover(world)
        body = await createWalkerBody(manager)
        cutaway = createCutaway(manager)
        // Kinako and the shadow disc bring the walk's new programs. They compile in a holder
        // outside the scene before the first walk frame, because compile skips hidden objects.
        const holder = new THREE.Group().add(body.group, body.shadow)
        await manager.renderer.compileAsync(holder, manager.camera, scene)
        scene.add(body.group, body.shadow)
        body.group.visible = body.shadow.visible = false
    })()

    const { walk, active, goToSection, currentStop } = story
    // Opens the home section `index` behind a zone card. The walk waits.
    const visit = (index) => {
        walk.visiting.value = index
        if (active.value === index) manager.goTo(currentStop())
        else goToSection(index)
    }
    // Ends the walk on the section `index`, or on the section it left.
    const leave = (index = null) => {
        stop()
        if (index !== null && index !== active.value) goToSection(index)
        else manager.goTo(currentStop())
    }

    const zoneAt = (feet) => world.zones.find((z) => ZONES[z.id] && insideBox(z.node, feet))

    const use = () => {
        const action = zone && ZONES[zone.id]
        if (!action) return
        if (action.lookout) {
            follow.toggleLookout()
            return
        }
        if (action.leave !== undefined) {
            leave(action.leave)
            return
        }
        mode = 'visiting'
        controls.enable(false)
        overlay.show(false)
        cutaway.enable(false)
        visit(action.section)
    }

    // One frame of the walk. delta: seconds since the last frame. time: the frame time of the
    // session's own loop under reduced motion. Returns true while anything moves.
    const step = (delta, time = null) => {
        if (mode !== 'walking') return false
        lastAt = time
        const dt = Math.min(0.1, delta)
        if (dt <= 0) return true
        const input = controls.read(dt)
        if (input.leave) {
            leave()
            return false
        }
        // The camera flies down to Kinako first. The walk starts once it rests on the follow
        // shot. From then on each frame jumps the rig to the updated shot, which also moves the
        // lens focus onto Kinako.
        const arrived = rig.moveDuration === 0
        if (input.turnSteps) follow.turn(input.turnSteps)
        if (input.turn || input.tilt) follow.drag(input.turn, input.tilt)
        else if (!input.dragging) follow.release()
        if (input.zoom !== 1) follow.zoom(input.zoom)
        follow.forward(forward)
        follow.right(right)
        const speed = arrived ? (input.run ? SPEED.run : SPEED.walk) * Math.min(1, input.push) : 0
        wish.copy(forward).multiplyScalar(input.y).addScaledVector(right, input.x)
        if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed)
        if (wish.lengthSq() > 0) follow.leaveLookout()
        mover.step(dt, wish)
        travel.set(mover.velocity.x, 0, mover.velocity.z)
        const moved = travel.length()
        if (wish.lengthSq() > 0) {
            const dir = wish.clone().normalize()
            mover.tryHop(dir, mover.velocity.x * dir.x + mover.velocity.z * dir.z < BLOCKED * speed)
        }
        const feet = mover.position()
        body.update(dt, feet, travel, mover.onFloor, reduced())
        const easing = follow.update(dt, feet, reduced(), travel)
        if (arrived) rig.jump('walk')
        cutaway.update(feet, Math.min(1, moved / SPEED.walk))
        zone = moved < STOPPED && mover.onFloor ? zoneAt(feet) : null
        const label = zone ? ZONES[zone.id].label : null
        overlay.setPrompt(label)
        controls.setPrompt(Boolean(label))
        overlay.setStick(controls.stick, 56)
        if (input.use) use()
        return moved > 0.01 || !mover.onFloor || easing || controls.stick.shown || input.push > 0 || !arrived
    }

    // from: 'welcome' or 'contact'. Kinako wakes by the fire in both cases.
    const start = async () => {
        if (walk.walking.value) return
        walk.walking.value = true
        try {
            await built
        } catch (error) {
            walk.walking.value = false
            throw error
        }
        mover.place(world.spawn)
        body.setHeading(Math.PI)
        body.rest(reduced())
        const feet = mover.position()
        body.update(0, feet, travel.set(0, 0, 0), true, true)
        body.group.visible = body.shadow.visible = true
        follow.snap(feet)
        rig.addShot('walk', follow.shot)
        resume()
    }

    // The walk after its start, or back from a zone card: the camera flies to Kinako.
    const resume = () => {
        walk.visiting.value = null
        mode = 'walking'
        lastAt = null
        controls.enable(true)
        overlay.show(true)
        manager.setWalker(step)
        // The walk programs compile during the move down to Kinako.
        cutaway.enable(true).catch((error) => console.error('The cutaway did not compile.', error))
        manager.goTo('walk')
        wake()
    }

    // Ends the walk with no camera move. leave and a route change move the camera.
    const stop = () => {
        walk.walking.value = false
        walk.visiting.value = null
        mode = 'off'
        zone = null
        controls.enable(false)
        overlay.setPrompt(null)
        overlay.show(false)
        manager.setWalker(null)
        cutaway?.enable(false)
        if (body) body.group.visible = body.shadow.visible = false
    }

    walk.connect({ resume, end: stop })
    return { start, resume, stop }
}

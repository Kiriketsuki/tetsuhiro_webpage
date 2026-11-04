import * as THREE from 'three'
import walkerUrl from '../../assets/models/walker.glb?url'
import { createWalkerMaterial } from './walker-material.js'
import { createPoses, addGait, GAITS, SIT, SLEEP, GROOM, AIR_UP, AIR_DOWN, LEGS, smoothstep } from './pose.js'

// Kinako (spec, Walker design): walker.glb on the walker material, with its gaits and idle
// habits. The walk mesh turns its parts in the vertex shader (walker-material.js). This file
// picks a pose each frame, solves the part matrices and stands the lowest paw on the ground.
// The sleep mesh takes over once Kinako has curled up.
//
// Model space: +Z is forward, +Y is up and +X is Kinako's left. The origin sits on the ground
// under the body.

const deg = THREE.MathUtils.degToRad
// SURFACE.plain in toon-material.js.
const PLAIN = 0
// The body turns toward its travel at up to 540 degrees a second (spec, Movement).
const TURN = deg(540)
// The head leads a turn by up to 25 degrees: the turn rate in radians a second times LEAD.gain.
// The neck takes a share of it and the head the rest.
const LEAD = { max: 25, gain: 0.12, neck: 0.4, ease: 10 }
// Speeds in metres a second. Under MOVING[0] Kinako stands, over MOVING[1] it walks fully.
// Between GALLOP[0] and GALLOP[1] the walk turns into the gallop.
const MOVING = [0.05, 0.4]
const GALLOP = [2.8, 4.0]
// Idle times in seconds: sit, sleep, the gap between grooms, the groom length, the gap between
// ear flicks and between blinks, and each flick and blink.
const IDLE = { sit: 4, sleep: 30, groomGap: [7, 12], groom: 2.6, flickGap: [2.5, 6], flick: 0.2, blinkGap: [3, 6.5], blink: 0.14 }
// The rates at which the sit, the lie down, the wake and the hop pose ease in, per second.
const EASE = { sit: 1 / 0.6, stand: 1 / 0.25, lie: 1 / 1.2, wake: 1 / 0.35, air: 1 / 0.06 }
// Off the floor for this long, in seconds, Kinako takes the hop pose. A short gap on a stair
// edge does not.
const AIR_AFTER = 0.05
// The eye flattens to this height when it closes, and widens a little (walker_concepts.py).
const CLOSED = { height: 0.14, width: 1.15 }
// A ground point under the knee or the hock: the leg radius in metres (walker_concepts.py).
const LEG_RADIUS = 0.024
// The sleep breath: its period in seconds and its depth as a share of the body height.
const BREATH = { period: 3.2, depth: 0.018 }
// The warm rim: its strength next to a lamp, and the reach of a lamp glow in metres. A window
// or the fire reaches as far as its warm spill.
const RIM = { strength: 0.6, reach: 3.2, near: 0.6 }
// The disc of the contact shadow: its radius in metres and the darkness at its centre.
const SHADOW = { radius: 0.3, dark: 0.42, lift: 0.012 }

const between = ([a, b]) => a + Math.random() * (b - a)
const towards = (value, goal, rate) => (goal > value ? Math.min(goal, value + rate) : Math.max(goal, value - rate))

// A flat disc whose darkness falls off smoothly from the centre, in a warm dark brown, as the
// prop shadows in contact-shadows.js do.
function shadowDisc() {
    const material = new THREE.ShaderMaterial({
        name: 'walker.shadow',
        transparent: true,
        depthWrite: false,
        uniforms: { uDark: { value: SHADOW.dark }, uColour: { value: new THREE.Color(0x24160d) } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
        fragmentShader:
            'uniform float uDark; uniform vec3 uColour; varying vec2 vUv; void main() { float r = length( vUv - 0.5 ) * 2.0; gl_FragColor = vec4( uColour, uDark * ( 1.0 - smoothstep( 0.15, 1.0, r ) ) ); }',
    })
    const disc = new THREE.Mesh(new THREE.CircleGeometry(SHADOW.radius, 20).rotateX(-Math.PI / 2), material)
    disc.renderOrder = 1
    return disc
}

// The toon material reads aoBake and aSurface. Kinako takes no AO and the plain family.
function prepare(geometry) {
    const count = geometry.attributes.position.count
    geometry.setAttribute('aoBake', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1))
    geometry.setAttribute('aSurface', new THREE.Uint8BufferAttribute(new Uint8Array(count).fill(PLAIN), 1))
    return geometry
}

async function loadKinako(loaders) {
    const gltf = await loaders.gltf.loadAsync(walkerUrl)
    const walk = gltf.scene.getObjectByName('Kinako_Walk')
    const sleep = gltf.scene.getObjectByName('Kinako_Sleep')
    if (!walk?.isMesh || !sleep?.isMesh) throw new Error('walker.glb has no Kinako_Walk or Kinako_Sleep mesh.')
    const rig = JSON.parse(walk.userData.kinako ?? 'null')
    const ok = rig && rig.parts?.length === rig.pivots?.length && rig.parents?.length === rig.parts.length && rig.tail?.joints?.length === 3
    if (!ok) throw new Error('walker.glb carries no valid Kinako rig.')
    for (const name of ['_part', '_tail']) {
        if (!walk.geometry.getAttribute(name)) throw new Error(`Kinako_Walk has no ${name} attribute.`)
    }
    // The sleep mesh shares the walker material, so it reads _part and _tail too. Zeros keep it on
    // the body part with no tail bend. A missing attribute would read whatever value WebGL last
    // held for that slot.
    const count = sleep.geometry.attributes.position.count
    for (const name of ['_part', '_tail']) sleep.geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count), 1))
    return { rig, walk: prepare(walk.geometry), sleep: prepare(sleep.geometry) }
}

// The lowest body points in front of and behind the middle, for the ground test. The tail lies
// on the ground in the sit and the sleep, so it is left out.
function bodyLows(geometry) {
    const position = geometry.attributes.position
    const part = geometry.getAttribute('_part')
    const tail = geometry.getAttribute('_tail')
    const lows = [null, null]
    for (let i = 0; i < position.count; i += 1) {
        if (Math.round(part.getX(i)) !== 0 || tail.getX(i) > 0) continue
        const side = position.getZ(i) > 0 ? 0 : 1
        if (!lows[side] || position.getY(i) < lows[side].y) lows[side] = new THREE.Vector3().fromBufferAttribute(position, i)
    }
    return lows.filter(Boolean)
}

// Every lamp that can warm the rim: the outdoor lamp glows and the warm spill spots (the two
// lit windows and the fire), each with its reach in metres.
function lampsOf(look) {
    const glows = (look?.glowSpots ?? []).map((spot) => ({ at: spot.position, reach: RIM.reach }))
    const spills = (look?.uniforms?.uToonBounce?.value ?? []).filter((spot) => spot.w > 0).map((spot) => ({ at: new THREE.Vector3(spot.x, spot.y, spot.z), reach: spot.w * 0.8 }))
    return [...glows, ...spills]
}

export async function createWalkerBody(manager) {
    const { rig, walk, sleep } = await loadKinako(manager.loaders)
    const { material, uniforms } = createWalkerMaterial(manager.parts.look.materials[0], rig)
    const poses = createPoses(rig.parts)
    const at = poses.index
    const pivots = rig.pivots.map((p) => new THREE.Vector3(...p))
    const matrices = uniforms.uKinakoPart.value
    const lamps = lampsOf(manager.parts.look)

    const group = new THREE.Group()
    group.name = 'walker'
    const walkMesh = new THREE.Mesh(walk, material)
    const sleepMesh = new THREE.Mesh(sleep, material)
    for (const mesh of [walkMesh, sleepMesh]) {
        mesh.castShadow = false
        mesh.receiveShadow = true
        // The vertex shader moves the parts past the rest bounds, and Kinako is always in view.
        mesh.frustumCulled = false
        group.add(mesh)
    }
    const shadow = shadowDisc()

    // The ground points: under each paw, under each knee and hock, and the low chest and rump.
    const ground = [
        ...LEGS.map((leg) => ({ part: at[`paw_${leg}`], point: pivots[at[`paw_${leg}`]].clone().setY(pivots[at[`paw_${leg}`]].y - rig.pawDrop[leg]) })),
        ...LEGS.map((leg) => ({ part: at[`leg_l_${leg}`], point: pivots[at[`leg_l_${leg}`]].clone().setY(pivots[at[`leg_l_${leg}`]].y - LEG_RADIUS) })),
        ...bodyLows(walk).map((point) => ({ part: at.body, point })),
    ]
    const fixed = {
        sit: poses.fromConcept(SIT),
        groom: poses.fromConcept(GROOM),
        lie: poses.fromConcept(SLEEP),
        up: poses.fromConcept(AIR_UP),
        down: poses.fromConcept(AIR_DOWN),
    }
    fixed.lie.blink = 1
    const carriage = { walk: poses.fromConcept(GAITS.walk.carriage), gallop: poses.fromConcept(GAITS.gallop.carriage) }
    const pose = poses.blank()

    // The state of the habits. idle: seconds at rest. sit and lie: 0 to 1.
    const state = {
        heading: 0, phase: 0, turnRate: 0, lead: 0, lastY: null, vy: 0, airTime: 0, air: 0,
        idle: 0, sit: 0, lie: 0, asleep: false, time: 0,
        groomIn: between(IDLE.groomGap), groomAt: -1,
        flickIn: between(IDLE.flickGap), flickAt: -1, flickEar: 'ear_L',
        blinkIn: between(IDLE.blinkGap), blinkAt: -1,
    }

    const euler = new THREE.Euler(0, 0, 0, 'YXZ')
    const turn = new THREE.Matrix4()
    const moved = new THREE.Vector3()
    const point = new THREE.Vector3()

    // Solves each part matrix from the pose: a turn about the part pivot, after its parent.
    // Parents come before their children in rig.parts.
    const solve = () => {
        const a = pose.angles
        for (const leg of LEGS) {
            // Each paw stays flat on the ground: it cancels the pitch of its leg chain.
            a[at[`paw_${leg}`] * 3 + 1] = -(a[at.body * 3 + 1] + a[at[`leg_u_${leg}`] * 3 + 1] + a[at[`leg_l_${leg}`] * 3 + 1])
        }
        for (let i = 0; i < rig.parts.length; i += 1) {
            euler.set(deg(a[i * 3 + 1]), deg(a[i * 3 + 2]), deg(a[i * 3]), 'YXZ')
            turn.makeRotationFromEuler(euler)
            if (i === at.eye_L || i === at.eye_R) {
                const b = pose.blink
                turn.scale(moved.set(1 + (CLOSED.width - 1) * b, 1 + (CLOSED.height - 1) * b, 1))
            }
            const p = pivots[i]
            moved.copy(p).applyMatrix4(turn)
            turn.setPosition(p.x - moved.x, p.y - moved.y, p.z - moved.z)
            if (rig.parents[i] >= 0) matrices[i].multiplyMatrices(matrices[rig.parents[i]], turn)
            else matrices[i].copy(turn)
        }
        // The lowest ground point stands on the ground, then the gallop flight lifts the body.
        let low = Infinity
        for (const g of ground) low = Math.min(low, point.copy(g.point).applyMatrix4(matrices[g.part]).y)
        const lift = -low + pose.lift
        for (const m of matrices) m.elements[13] += lift
        rig.tail.joints.forEach((joint, j) => uniforms.uKinakoTail.value[j].set(deg(joint.rest[0] + pose.tail[j * 2]), deg(joint.rest[1] + pose.tail[j * 2 + 1])))
    }

    // Counts down a habit timer and returns the age of the running habit, or -1 when none runs.
    const habit = (dt, inKey, atKey, gap, length, allowed) => {
        if (state[atKey] >= 0) {
            state[atKey] += dt
            if (state[atKey] < length) return state[atKey]
            state[atKey] = -1
            state[inKey] = between(gap)
        }
        if (!allowed) return -1
        state[inKey] -= dt
        if (state[inKey] > 0) return -1
        state[atKey] = 0
        return 0
    }

    const habits = (dt, speed, onFloor, reduced) => {
        const resting = speed < MOVING[0] && onFloor
        state.idle = resting ? state.idle + dt : 0
        const lieGoal = !reduced && state.idle > IDLE.sleep ? 1 : 0
        const sitGoal = state.idle > (reduced ? 0 : IDLE.sit) ? 1 : 0
        // Under reduced motion Kinako sits at once and holds still.
        state.sit = reduced ? sitGoal : towards(state.sit, sitGoal, dt * (sitGoal ? EASE.sit : EASE.stand))
        state.lie = towards(state.lie, lieGoal, dt * (lieGoal ? EASE.lie : EASE.wake))
        state.asleep = lieGoal === 1 && state.lie >= 1
        const calm = !reduced && !state.asleep
        const groom = habit(dt, 'groomIn', 'groomAt', IDLE.groomGap, IDLE.groom, calm && state.sit >= 1 && state.lie === 0)
        const flick = habit(dt, 'flickIn', 'flickAt', IDLE.flickGap, IDLE.flick, calm && state.lie === 0)
        if (flick === 0) state.flickEar = Math.random() < 0.5 ? 'ear_L' : 'ear_R'
        const blink = habit(dt, 'blinkIn', 'blinkAt', IDLE.blinkGap, IDLE.blink, calm)
        return { groom, flick, blink }
    }

    const compose = (speed, reduced, { groom, flick, blink }) => {
        poses.clear(pose)
        const moving = smoothstep(MOVING[0], MOVING[1], speed)
        const gallop = smoothstep(GALLOP[0], GALLOP[1], speed)
        addGait(poses, pose, GAITS.walk, state.phase, moving * (1 - gallop))
        addGait(poses, pose, GAITS.gallop, state.phase, moving * gallop)
        poses.addScaled(pose, carriage.walk, moving * (1 - gallop))
        poses.addScaled(pose, carriage.gallop, moving * gallop)
        poses.mix(pose, fixed.sit, state.sit)
        if (groom >= 0) poses.mix(pose, fixed.groom, smoothstep(0, 0.4, groom) * smoothstep(IDLE.groom, IDLE.groom - 0.4, groom))
        poses.mix(pose, fixed.lie, state.lie)
        const up = smoothstep(-1.5, 1.5, state.vy)
        poses.mix(pose, fixed.up, state.air * up)
        poses.mix(pose, fixed.down, state.air * (1 - up))
        // A groom licks: the head nods three times a second.
        if (groom >= 0) poses.add(pose, 'head', 0, 6 * Math.sin(groom * Math.PI * 6), 0)
        const lead = THREE.MathUtils.clamp(state.lead, -LEAD.max, LEAD.max) * (1 - state.lie)
        poses.add(pose, 'neck', 0, 0, lead * LEAD.neck)
        poses.add(pose, 'head', 0, 0, lead * (1 - LEAD.neck))
        pose.tail[5] += lead * 0.5
        if (flick >= 0) poses.add(pose, state.flickEar, 0, -35 * Math.sin((Math.PI * flick) / IDLE.flick), 0)
        if (!reduced && !state.asleep) {
            const sway = Math.sin((state.time * Math.PI * 2) / 2.8) * (1 - moving) * (1 - state.lie)
            pose.tail[3] += 10 * sway
            pose.tail[5] += 14 * sway
        }
        if (blink >= 0) pose.blink = Math.max(pose.blink, Math.sin((Math.PI * blink) / IDLE.blink))
    }

    // feet: the ground point under the capsule. travel: the horizontal velocity.
    const update = (dt, feet, travel, onFloor, reduced) => {
        const speed = Math.hypot(travel.x, travel.z)
        const before = state.heading
        if (speed > 0.05) {
            const goal = Math.atan2(travel.x, travel.z)
            const delta = THREE.MathUtils.euclideanModulo(goal - state.heading + Math.PI, Math.PI * 2) - Math.PI
            state.heading += THREE.MathUtils.clamp(delta, -TURN * dt, TURN * dt)
        }
        if (dt > 0) {
            state.time += dt
            const rate = (state.heading - before) / dt
            state.turnRate += (rate - state.turnRate) * Math.min(1, dt * LEAD.ease)
            state.lead = THREE.MathUtils.radToDeg(state.turnRate) * LEAD.gain
            if (state.lastY !== null) state.vy = (feet.y - state.lastY) / dt
            const stride = THREE.MathUtils.lerp(GAITS.walk.stride, GAITS.gallop.stride, smoothstep(GALLOP[0], GALLOP[1], speed))
            state.phase = (state.phase + (dt * speed) / stride) % 1
        }
        state.lastY = feet.y
        state.airTime = onFloor ? 0 : state.airTime + dt
        state.air = towards(state.air, state.airTime > AIR_AFTER ? 1 : 0, dt * EASE.air)
        compose(speed, reduced, habits(dt, speed, onFloor, reduced))

        walkMesh.visible = !state.asleep
        sleepMesh.visible = state.asleep
        if (state.asleep) {
            // The sleep mesh holds the curl itself, so its part (the body) takes no turn.
            matrices[at.body].identity()
            const breath = reduced ? 0 : Math.sin((state.time * Math.PI * 2) / BREATH.period) * BREATH.depth
            sleepMesh.scale.set(1, 1 + breath, 1 + breath * 0.5)
        } else {
            solve()
        }
        group.position.set(feet.x, feet.y, feet.z)
        group.rotation.y = state.heading
        shadow.position.set(feet.x, feet.y + SHADOW.lift, feet.z)
        warm(feet)
    }

    // Lights the rim from the nearest lamp, fading out at its reach.
    const warm = (feet) => {
        let best = null
        let strength = 0
        for (const lamp of lamps) {
            const d = lamp.at.distanceTo(feet)
            const s = RIM.strength * (1 - smoothstep(RIM.near, lamp.reach, d))
            if (s > strength) {
                strength = s
                best = lamp
            }
        }
        if (best) uniforms.uKinakoRim.value.set(best.at.x, best.at.y, best.at.z, strength)
        else uniforms.uKinakoRim.value.w = 0
    }

    const setHeading = (angle) => {
        state.heading = angle
        state.turnRate = 0
        group.rotation.y = angle
    }

    // Puts Kinako back to sleep by the fire for a new walk. Under reduced motion Kinako sits.
    const rest = (reduced) => {
        state.idle = reduced ? IDLE.sit : IDLE.sleep + 1
        state.lie = reduced ? 0 : 1
        state.sit = reduced ? 1 : 0
        state.air = 0
        state.airTime = 0
        state.lastY = null
    }

    const dispose = () => {
        walk.dispose()
        sleep.dispose()
        material.dispose()
        shadow.geometry.dispose()
        shadow.material.dispose()
    }

    return { group, shadow, update, setHeading, rest, dispose }
}

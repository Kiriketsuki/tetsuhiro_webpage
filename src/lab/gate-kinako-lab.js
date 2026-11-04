import * as THREE from 'three'
import { createToonMaterial, createToonUniforms } from '../scene/aerie/toon-material.js'
import { createPipeline, TIERS } from '../scene/aerie/quality.js'
import { createLookControl, SITE_LOOK } from '../scene/aerie/look-options.js'
import { createLoaders } from '../scene/loaders.js'
import { createWalkerBody } from '../scene/explore/body.js'

// Dev-only lab that renders Kinako for the gate with the aerie look: walker.glb on the walker
// material, the ink and the lens of the site pipeline, and the warm rim from a fire in front.
// The gate in index.html shows the frames as images, so the shell loads no three.js and no
// model. The lab drives the real walker body (src/scene/explore/body.js) with fixed steps, so
// the poses are the poses of the 3D Kinako.
//
// Query options:
//   pose=sleep|wake|walk|air|stand|sit|empty
//                               sleep: the curled sleep mesh. wake: seconds t into the wake
//                               from the curl. walk: seconds t into a walk at speed m/s.
//                               air: the hop pose, rising for vy=1 and falling for vy=-1.
//                               stand, sit: the idle poses. empty: no Kinako.
//   t=<seconds>                 the time into the pose.
//   breath=<0..1>               the sleep breath, 0 out and 1 in.
//   bg=0|1                      a dark or a light flat background, for the alpha matte that
//                               scripts/gate-matte.py takes from the pair.
//   yaw=<degrees>               Kinako's heading. 0 faces the camera.
//   size=<pixels>               the square frame size. The view widens with it, so Kinako
//                               keeps the same size in pixels.
//   dist=<metres>               the camera distance. The camera looks down a little.
//   up=<ratio>                  the camera height over its distance.
//   warm=<0..1>                 how much the fire in front warms Kinako.
// The page sets window.gateReady once the frame is on the canvas.

const params = new URLSearchParams(location.search)
const pose = params.get('pose') ?? 'sleep'
const seconds = Number(params.get('t') ?? 0)
const breath = Number(params.get('breath') ?? 0.5)
const light = params.get('bg') === '1'
const yaw = THREE.MathUtils.degToRad(Number(params.get('yaw') ?? 35))
const size = Number(params.get('size') ?? 768)
const dist = Number(params.get('dist') ?? 2.2)
const up = Number(params.get('up') ?? 0.3)
// The warmth of the fire on Kinako: 0 is moonlight only.
const warmth = Number(params.get('warm') ?? 0.6)

// The walker habits draw random gaps. A seeded random gives every render the same frame.
let seed = 20261104
Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647

// The fire sits in front of Kinako and a little to its right, as at the campfire stop.
const FIRE = new THREE.Vector3(0.35, 0.12, 0.7)

const canvas = document.getElementById('lab')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true })
renderer.toneMapping = THREE.NoToneMapping
renderer.outputColorSpace = THREE.LinearSRGBColorSpace
renderer.setPixelRatio(1)
renderer.setSize(size, size)

const scene = new THREE.Scene()
scene.background = light ? new THREE.Color(0.18, 0.18, 0.18) : new THREE.Color(0, 0, 0)
// A 22 degree view on a 768 pixel frame. A larger frame sees more at the same pixel scale.
const fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(11)) * (size / 768)))
const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 40)
camera.position.set(0, up * dist, dist)
camera.lookAt(0, 0.12, 0)

const uniforms = createToonUniforms({
    moonDirection: new THREE.Vector3(-0.45, 0.8, 0.35),
    bounces: warmth > 0 ? [{ x: FIRE.x, y: FIRE.y, z: FIRE.z, radius: 1.4 }] : [],
    warmStrength: 2.2 * warmth,
})
const toon = createToonMaterial(uniforms)
// The msaa4 tier: the ink and the lens, but no glow pass, as the lantern lab uses.
const pipeline = createPipeline({ renderer, scene, camera, tier: TIERS[1] })
createLookControl(uniforms).apply(SITE_LOOK, pipeline.grade.uniforms)
pipeline.grade.uniforms.uVignette.value = 0
pipeline.grade.uniforms.uFocus.value = camera.position.length()
pipeline.grade.uniforms.uLensBand.value = 0.4

// The walker body reads its loaders and the aerie look from the scene manager. The lab hands
// it the same pieces: one lamp (the fire) for the rim and the warm spill.
const manager = {
    loaders: createLoaders(),
    parts: { look: { materials: [toon], glowSpots: warmth > 0 ? [{ position: FIRE }] : [], uniforms } },
}
const body = await createWalkerBody(manager)
scene.add(body.group)
body.setHeading(yaw)

const STEP = 1 / 120
const feet = new THREE.Vector3()
const still = new THREE.Vector3()
// A drift just over the rest speed (MOVING[0] in body.js) resets the idle time, so Kinako wakes.
const nudge = new THREE.Vector3(0.06 * Math.sin(yaw), 0, 0.06 * Math.cos(yaw))
const run = (time, travel) => {
    for (let t = 0; t < time; t += STEP) body.update(STEP, feet, travel, true, false)
}
if (pose === 'sleep') {
    body.rest(false)
    run(STEP, still)
    // The breath scale of body.js, set straight from the query.
    const sleep = body.group.children.find((mesh) => mesh.visible)
    const lift = (breath * 2 - 1) * 0.018
    sleep.scale.set(1, 1 + lift, 1 + lift * 0.5)
} else if (pose === 'wake') {
    body.rest(false)
    run(STEP, still)
    run(seconds, nudge)
    run(STEP, still)
} else if (pose === 'walk') {
    // A walk at speed metres a second. The heading follows the travel, so it stays at yaw.
    const speed = Number(params.get('speed') ?? 0.7)
    run(seconds, nudge.clone().setLength(speed))
} else if (pose === 'air') {
    // Off the ground, rising when vy is above 0 and falling when it is below. The body takes
    // its hop pose from the vertical speed of the feet.
    const vy = Number(params.get('vy') ?? 1)
    for (let t = 0; t < 0.4; t += STEP) {
        feet.y += vy * STEP
        body.update(STEP, feet, nudge.clone().setLength(1), false, false)
    }
    body.group.position.set(0, 0, 0)
} else if (pose === 'sit') {
    run(5 + seconds, still)
} else {
    run(seconds + STEP, still)
}
body.group.rotation.y = yaw
// The empty frame holds no Kinako. scripts/gate-matte.py compares each frame with it.
body.group.visible = pose !== 'empty'

renderer.compileAsync(scene, camera).then(() => {
    pipeline.render()
    window.gateReady = true
})

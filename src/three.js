import * as THREE from 'three'
import gsap from 'gsap'
import { useWaypoints } from './composables/useWaypoints.js'
import { createRenderer } from './scene/renderer.js'
import { createLights, createAnchorLights } from './scene/lights.js'
import { createStars } from './scene/stars.js'
import { createWaypoints, shotsFromCameras } from './scene/waypoints.js'
import { createDodecahedron } from './scene/dodecahedron.js'
import { createLoaders } from './scene/loaders.js'
import { createIsland } from './scene/island.js'
import { createSea } from './scene/sea.js'
import { createPost } from './scene/post.js'
import { createCampfire } from './scene/campfire.js'
import { createSkillBadges } from './scene/skills.js'

const { active, ready, reducedMotion } = useWaypoints()

//? Set up
const canvas = document.getElementById('webgl')
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.5, 2500)
history.scrollRestoration = 'manual'

const { renderer, onResize } = createRenderer({ canvas, scene, camera })
const { moon } = createLights(scene)
const sea = createSea(scene, { moonDirection: moon.position.clone().sub(moon.target.position) })
const stars = createStars(scene, renderer.getPixelRatio())
const rig = createWaypoints({ scene, camera, active, reducedMotion, onResize })
const post = createPost({ renderer, scene, camera, onResize })

//? Models
const loaders = createLoaders()
const island = createIsland({ scene, loaders })
const dodeca = createDodecahedron({ scene, loadingManager: loaders.manager })

// Filled in once the gltf anchors are known.
const extras = []

island.ready.then(({ anchors, shots, slots }) => {
    if (anchors.dodecahedron) dodeca.place(anchors.dodecahedron)
    extras.push(createAnchorLights(scene, anchors, { reducedMotion }))
    if (anchors.campfire) extras.push(createCampfire(scene, anchors.campfire, { reducedMotion }))
    const views = shotsFromCameras(shots)
    rig.setShots(views)
    extras.push(createSkillBadges(scene, slots, { camera, view: views[2], anisotropy: renderer.capabilities.getMaxAnisotropy(), reducedMotion }))
    renderer.shadowMap.needsUpdate = true
})

//? Animation
const clock = new THREE.Clock()

function loop() {
    const delta = Math.min(clock.getDelta(), 0.1)
    const uTime = clock.elapsedTime
    stars.update(uTime)
    sea.update(uTime)
    dodeca.update(delta, uTime)
    extras.forEach((extra) => extra.update(delta, uTime))

    camera.lookAt(rig.target.position)
    post.render(delta)
    requestAnimationFrame(loop)
}

//? Onload
loaders.manager.onLoad = () => {
    renderer.compile(scene, camera)
    ready.value = true
    loop()

    const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } })
    if (reducedMotion.value) tl.timeScale(20)
    tl.to('#spinner', { opacity: 0, duration: 0.6 })
        .to('#ready', { opacity: 1, duration: 0.6 }, '<')
        .add(() => rig.move(active.value, 2.4), '>')
        .to('.name', { opacity: 0, duration: 1 }, '+=0.4')
        .set('.name', { visibility: 'hidden' })
        .to('#home', { autoAlpha: 1, duration: 1 }, '<')
        .to('.nav_stagger', { autoAlpha: 1, duration: 0.8 }, '>-0.4')
}

// Handy in the console while tuning shots. Not in the build.
if (import.meta.env.DEV) window.__scene = { scene, camera, renderer, rig, island, post }

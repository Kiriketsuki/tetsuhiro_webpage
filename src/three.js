import * as THREE from 'three'
import { watch } from 'vue'
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

const { active, ready, reducedMotion, progress, entered, loadError } = useWaypoints()

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

// Real progress for the gate. The gltf is most of the bytes, so its download
// counts for most of the bar. The rest is the share of files the manager has
// finished: the decoder, the dodecahedron faces and the terrain textures.
const ISLAND_SHARE = 0.6
let islandBytes = 0
let files = 0
const report = () => {
    const next = ISLAND_SHARE * islandBytes + (1 - ISLAND_SHARE) * files
    progress.value = Math.max(progress.value, Math.min(1, next))
}
loaders.manager.onProgress = (url, loaded, total) => {
    files = total ? loaded / total : 0
    report()
}
loaders.manager.onError = (url) => {
    console.error('Failed to load', url)
    loadError.value = 'Something did not load. Reload the page to try again.'
}
const onIslandProgress = (event) => {
    if (!event.lengthComputable) return
    islandBytes = event.loaded / event.total
    report()
}

const island = createIsland({ scene, loaders, onProgress: onIslandProgress })
const dodeca = createDodecahedron({ scene, loadingManager: loaders.manager })

// Filled in once the gltf anchors are known.
const extras = []

island.ready.then(({ anchors, shots, slots }) => {
    if (anchors.dodecahedron) dodeca.place(anchors.dodecahedron)
    extras.push(createAnchorLights(scene, anchors, { reducedMotion }))
    if (anchors.campfire) extras.push(createCampfire(scene, anchors.campfire, { reducedMotion }))
    const views = shotsFromCameras(shots)
    rig.setShots(views)
    extras.push(createSkillBadges(scene, slots, { camera, anisotropy: renderer.capabilities.getMaxAnisotropy(), reducedMotion }))
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
// onLoad can fire again if something loads late. Only one loop runs.
let running = false
loaders.manager.onLoad = () => {
    progress.value = 1
    ready.value = true
    if (running) return
    running = true
    renderer.compile(scene, camera)
    loop()
}

// The camera leaves the wide shot when the gate lifts.
watch(entered, (value) => {
    if (value) rig.move(active.value, 2.4)
})

// Handy in the console while tuning shots. Not in the build.
if (import.meta.env.DEV) window.__scene = { scene, camera, renderer, rig, island, post }

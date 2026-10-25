import * as THREE from 'three'
import { watch } from 'vue'
import { useWaypoints } from './composables/useWaypoints.js'
import { useExplore } from './composables/useExplore.js'
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

// useScene() in App.vue imports this module on idle, after the first paint on
// any route, and calls resume(). The canvas and the loop stay alive across
// route changes, so the site moves like one page. pause() is there for a
// caller that wants the loop off.

const { active, ready, reducedMotion, progress, entered, loadError } = useWaypoints()

const canvas = document.getElementById('webgl')
history.scrollRestoration = 'manual'

// The loop runs only while all of these hold. `wanted` turns on with resume().
// A hidden tab or a lost context stops the loop. Reduced motion draws single
// frames on demand instead.
const state = { loaded: false, wanted: false, hidden: document.hidden, lost: false }
let frame = null
let drawFrame = null

const looping = () => state.loaded && state.wanted && !state.hidden && !state.lost && !reducedMotion.value

// Starts or stops the loop to match the state. setAnimationLoop(null) stops
// the bloom and MSAA chain completely, so a hidden tab or another route costs
// no frames.
const update = () => {
    if (!drawFrame) return
    const renderer = scene3d.renderer
    if (looping()) {
        if (frame) return
        frame = drawFrame
        scene3d.clock.getDelta()
        renderer.setAnimationLoop(frame)
        return
    }
    if (frame) {
        frame = null
        renderer.setAnimationLoop(null)
    }
    if (reducedMotion.value) requestFrame()
}

// One frame on the next animation frame. Reduced motion uses this after the
// load, a section change, a resize and each look-around step.
let pending = false
function requestFrame() {
    if (pending || frame || !drawFrame) return
    if (!state.loaded || !state.wanted || state.hidden || state.lost) return
    pending = true
    requestAnimationFrame(() => {
        pending = false
        if (!frame) drawFrame()
    })
}

export function resume() {
    state.wanted = true
    update()
}

export function pause() {
    state.wanted = false
    update()
}

// No WebGL, or the scene failed to build. The canvas shows a CSS night sky
// instead, and the gate still opens, so the pages stay usable.
function fallBack(error) {
    console.error('The island cannot render here.', error)
    canvas?.classList.add('scene-fallback')
    loadError.value = 'This browser cannot draw the island. The pages still work.'
    progress.value = 1
    ready.value = true
}

const scene3d = {}

function boot() {
    // A debug switch to try the fallback in the dev server. Not in the build.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('nowebgl')) {
        throw new Error('WebGL turned off by ?nowebgl')
    }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.5, 2500)

    const { renderer, onResize } = createRenderer({ canvas, scene, camera })
    const { moon } = createLights(scene)
    const sea = createSea(scene, { moonDirection: moon.position.clone().sub(moon.target.position) })
    const stars = createStars(scene, renderer.getPixelRatio())
    const rig = createWaypoints({ scene, camera, active, reducedMotion, onResize })
    const post = createPost({ renderer, scene, camera, onResize })
    const clock = new THREE.Clock()
    Object.assign(scene3d, { scene, camera, renderer, clock })

    // Drag and pinch from ExplorePad.vue move the rig. Leaving eases back to the shot.
    const explore = useExplore()
    explore.connect({
        pan: (dx, dy) => {
            rig.pan(dx, dy)
            requestFrame()
        },
        zoom: (factor) => {
            rig.zoom(factor)
            requestFrame()
        },
    })
    watch(explore.exploring, (value) => {
        if (!value) {
            rig.release()
            requestFrame()
        }
    })

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
        loadError.value = 'Part of the island did not load. A reload usually sorts it out.'
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
        extras.push(createSkillBadges(scene, slots, { camera, anisotropy: renderer.capabilities.getMaxAnisotropy(), reducedMotion, tree: island.root?.getObjectByName('SkillTree') }))
        renderer.shadowMap.needsUpdate = true
        requestFrame()
    })

    //? Animation
    // The time only moves while frames draw, so the sea does not jump after a pause.
    let uTime = 0
    drawFrame = () => {
        const delta = Math.min(clock.getDelta(), 0.1)
        uTime += delta
        stars.update(uTime)
        sea.update(uTime)
        dodeca.update(delta, uTime)
        extras.forEach((extra) => extra.update(delta, uTime))

        camera.lookAt(rig.target.position)
        post.render(delta)
    }

    //? Onload
    // onLoad can fire again if something loads late. The loop state only
    // changes once, and a late file asks for one more still frame.
    loaders.manager.onLoad = () => {
        progress.value = 1
        ready.value = true
        if (!state.loaded) {
            renderer.compile(scene, camera)
            state.loaded = true
            update()
        }
        requestFrame()
    }

    // The camera leaves the wide shot when the gate lifts.
    watch(entered, (value) => {
        if (value) rig.move(active.value, 2.4)
    })

    // Reduced motion cuts the camera, so each new section needs one new frame.
    watch(active, () => requestFrame(), { flush: 'post' })
    onResize(() => requestFrame())
    watch(reducedMotion, update)

    // three restores its own GL state. The shadow map and the frames are ours.
    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault()
        console.warn('The WebGL context was lost. The island waits for it to come back.')
        state.lost = true
        update()
    })
    canvas.addEventListener('webglcontextrestored', () => {
        state.lost = false
        renderer.shadowMap.needsUpdate = true
        update()
        requestFrame()
    })

    // Handy in the console while tuning shots. Not in the build.
    if (import.meta.env.DEV) window.__scene = { scene, camera, renderer, rig, island, post, state }
}

document.addEventListener('visibilitychange', () => {
    state.hidden = document.hidden
    update()
})

try {
    boot()
} catch (error) {
    drawFrame = null
    fallBack(error)
}

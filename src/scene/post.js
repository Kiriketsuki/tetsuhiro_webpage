import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// Soft bloom. The threshold sits above anything the moon lights, so only the
// emissive bits glow: lava, the portal core, the lanterns, the fire, a bit of coral.
const STRENGTH = 0.28
const RADIUS = 0.45
const THRESHOLD = 0.92
// MSAA on the half float target. The composer skips the canvas antialias.
const SAMPLES = 4

export function createPost({ renderer, scene, camera, onResize }) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2())
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
        type: THREE.HalfFloatType,
        samples: SAMPLES,
    })
    target.texture.name = 'post.main'

    const composer = new EffectComposer(renderer, target)
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), STRENGTH, RADIUS, THRESHOLD)
    // OutputPass does the ACES tone mapping and the sRGB step for the whole frame.
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(bloom)
    composer.addPass(new OutputPass())

    const resize = (width, height) => {
        composer.setPixelRatio(renderer.getPixelRatio())
        composer.setSize(width, height)
    }
    const canvas = renderer.domElement
    resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight)
    const stopResize = onResize(resize)

    const render = (delta) => composer.render(delta)

    return { composer, bloom, render, stopResize }
}

export function disposePost({ composer, bloom, stopResize }) {
    stopResize()
    bloom.dispose()
    composer.dispose()
}

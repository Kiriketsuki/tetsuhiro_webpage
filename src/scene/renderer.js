import * as THREE from 'three'

const FOG_COLOR = 0x03111e

// Sets up the renderer and the fog. The ResizeObserver replaces the old window
// resize handler, so the canvas size is the only thing that drives the viewport.
export function createRenderer({ canvas, scene, camera }) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setClearColor(0x000000)
    renderer.setClearAlpha(0)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ReinhardToneMapping
    renderer.toneMappingExposure = 0.8
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.needsUpdate = true
    renderer.shadowMap.autoUpdate = false

    scene.fog = new THREE.Fog(FOG_COLOR, 50, 200)

    const observer = new ResizeObserver(() => {
        const width = canvas.clientWidth
        const height = canvas.clientHeight
        if (!width || !height) return
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
        renderer.setSize(width, height, false)
    })
    observer.observe(canvas)

    return { renderer, observer }
}

export function disposeRenderer(scene, { renderer, observer }) {
    observer.disconnect()
    scene.fog = null
    renderer.dispose()
}

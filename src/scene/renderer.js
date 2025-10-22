import * as THREE from 'three'

// bg-base from tokens.css. The fog fades the island into the page colour.
const BG_BASE = 0x03111e
const EXPOSURE = 1.1
// The world is about 500 m across and the contact shot sits 450 m out.
const FOG_NEAR = 260
const FOG_FAR = 1150

// three's ACES fit, as row major matrices (the GLSL ones are column major).
const ACES_IN = new THREE.Matrix3().set(
    0.59719, 0.35458, 0.04823,
    0.076, 0.90834, 0.01566,
    0.0284, 0.13383, 0.83777
)
const ACES_OUT = new THREE.Matrix3().set(
    1.60475, -0.53108, -0.07367,
    -0.10208, 1.10813, -0.00605,
    -0.00327, -0.07276, 1.07602
)

// Solves RRTAndODTFit backwards for one channel. The fit is a ratio of two
// quadratics, so the inverse is the positive root of one quadratic.
function invertFit(y) {
    const a = 0.983729 * y - 1
    const b = 0.432951 * y - 0.0245786
    const c = 0.238081 * y + 0.000090537
    if (Math.abs(a) < 1e-6) return -c / b
    const root = Math.sqrt(Math.max(0, b * b - 4 * a * c))
    return Math.max((-b - root) / (2 * a), (-b + root) / (2 * a))
}

// ACES crushes a colour this dark to black. This returns the linear colour that
// comes out of the tone mapper as `hex`, so the fog still matches the page.
export function toneMappedColor(hex, exposure = EXPOSURE) {
    const target = new THREE.Color(hex)
    const fitted = new THREE.Vector3(target.r, target.g, target.b).applyMatrix3(ACES_OUT.clone().invert())
    const input = new THREE.Vector3(invertFit(fitted.x), invertFit(fitted.y), invertFit(fitted.z))
        .applyMatrix3(ACES_IN.clone().invert())
        .multiplyScalar(0.6 / exposure)
    return new THREE.Color().setRGB(input.x, input.y, input.z, THREE.LinearSRGBColorSpace)
}

// Sets up the renderer and the fog. The ResizeObserver replaces the old window
// resize handler, so the canvas size is the only thing that drives the viewport.
export function createRenderer({ canvas, scene, camera }) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    renderer.setClearColor(0x000000)
    renderer.setClearAlpha(0)
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = EXPOSURE
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.shadowMap.needsUpdate = true
    renderer.shadowMap.autoUpdate = false

    // three adds the fog after tone mapping when it draws straight to the screen,
    // so the plain page colour matches here.
    scene.fog = new THREE.Fog(BG_BASE, FOG_NEAR, FOG_FAR)

    const listeners = new Set()
    const observer = new ResizeObserver(() => {
        const width = canvas.clientWidth
        const height = canvas.clientHeight
        if (!width || !height) return
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
        renderer.setSize(width, height, false)
        listeners.forEach((listener) => listener(width, height))
    })
    observer.observe(canvas)

    // Other modules (the camera rig, post) hook in here instead of adding
    // their own resize handlers.
    const onResize = (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
    }

    return { renderer, observer, onResize }
}

export function disposeRenderer(scene, { renderer, observer }) {
    observer.disconnect()
    scene.fog = null
    renderer.dispose()
}

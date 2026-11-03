import * as THREE from 'three'

// Draws the city layers at a lower resolution on a dense screen. The city is a field of
// soft out-of-focus discs far behind the focus, so it has no sharp detail to lose, and a
// phone at a pixel ratio of 2 then shades a quarter of the city pixels. The layers draw into
// their own target, cleared to transparent, with the usual normal blending. That leaves the
// colour premultiplied by the alpha, so one screen quad adds the target over the frame with
// premultiplied blending. The quad sits at the far plane, so the depth test keeps it behind
// the aerie, as the city plane was. The layers keep their own depth buffer, so the towers
// still cut the cloud layers.

// The target holds about one texel to a CSS pixel, and never more than the screen.
const MIN_SCALE = 0.34
export const offscreenScale = (pixelRatio) => Math.min(1, Math.max(MIN_SCALE, 1 / pixelRatio))

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4( position.xy, 1.0, 1.0 );
}
`
const fragmentShader = /* glsl */ `
uniform sampler2D tCity;
varying vec2 vUv;
void main() {
    gl_FragColor = texture2D( tCity, vUv );
}
`

export function createCityOffscreen(layers) {
    const scene = new THREE.Scene()
    scene.name = 'CityLayers'
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true })
    target.texture.name = 'city.layers'
    const material = new THREE.ShaderMaterial({
        name: 'city.composite',
        uniforms: { tCity: { value: target.texture } },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
    quad.name = 'CityComposite'
    quad.frustumCulled = false
    quad.renderOrder = -8
    quad.visible = false
    let scale = 1
    const size = new THREE.Vector2()
    const clearColor = new THREE.Color()

    // The layers draw into the target before the quad reads it. The same pattern as the
    // three.js Reflector: save the target and the clear state, draw, then restore them.
    quad.onBeforeRender = (renderer, _scene, camera) => {
        const current = renderer.getRenderTarget()
        if (current) size.set(current.width, current.height)
        else renderer.getDrawingBufferSize(size)
        target.setSize(Math.max(1, Math.round(size.x * scale)), Math.max(1, Math.round(size.y * scale)))
        renderer.getClearColor(clearColor)
        const clearAlpha = renderer.getClearAlpha()
        const autoClear = renderer.autoClear
        renderer.setRenderTarget(target)
        renderer.setClearColor(0x000000, 0)
        renderer.autoClear = true
        renderer.render(scene, camera)
        renderer.autoClear = autoClear
        renderer.setClearColor(clearColor, clearAlpha)
        renderer.setRenderTarget(current)
    }

    // Moves the layers into the target, or back into the frame when the screen is not
    // dense. It returns the scale, so the disc sizes can follow the target pixels.
    const sync = (group, pixelRatio) => {
        scale = offscreenScale(pixelRatio)
        const offscreen = scale < 0.99
        if (offscreen !== quad.visible) {
            const to = offscreen ? scene : group
            layers.forEach((layer) => to.add(layer))
            quad.visible = offscreen
        }
        return offscreen ? scale : 1
    }

    const dispose = () => {
        target.dispose()
        material.dispose()
        quad.geometry.dispose()
    }
    return { quad, sync, dispose }
}

import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

// A soft glow for the desktop tier only. The bright parts of the frame go to a quarter-size
// target, a separable blur runs twice at growing radius, and the grade pass adds the result.
// It does not change the composer's buffers, so the grade pass still reads the scene.

const THRESHOLD = 0.85
const KNEE = 0.45
const SCALE = 4

const vertexShader = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`

// Four taps around each quarter-size texel, then a soft knee above the threshold.
const prefilterShader = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main() {
    vec3 c = texture2D( tSource, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb
        + texture2D( tSource, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb
        + texture2D( tSource, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb
        + texture2D( tSource, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
    c *= 0.25;
    float bright = max( c.r, max( c.g, c.b ) );
    float soft = clamp( bright - uThreshold + uKnee, 0.0, 2.0 * uKnee );
    soft = soft * soft / ( 4.0 * uKnee + 1e-4 );
    float weight = max( soft, bright - uThreshold ) / max( bright, 1e-4 );
    gl_FragColor = vec4( c * weight, 1.0 );
}
`

// A 9-tap Gaussian in 5 fetches, using the linear filter between texel pairs.
const blurShader = /* glsl */ `
precision highp float;
uniform sampler2D tSource;
uniform vec2 uStep;
varying vec2 vUv;
void main() {
    vec3 c = texture2D( tSource, vUv ).rgb * 0.227027;
    c += texture2D( tSource, vUv + uStep * 1.384615 ).rgb * 0.316216;
    c += texture2D( tSource, vUv - uStep * 1.384615 ).rgb * 0.316216;
    c += texture2D( tSource, vUv + uStep * 3.230769 ).rgb * 0.070270;
    c += texture2D( tSource, vUv - uStep * 3.230769 ).rgb * 0.070270;
    gl_FragColor = vec4( c, 1.0 );
}
`

const target = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })

export class GlowPass extends Pass {
    constructor() {
        super()
        this.needsSwap = false
        this.a = target()
        this.b = target()
        this.prefilter = new THREE.RawShaderMaterial({
            uniforms: { tSource: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: THRESHOLD }, uKnee: { value: KNEE } },
            vertexShader,
            fragmentShader: prefilterShader,
            depthTest: false,
            depthWrite: false,
        })
        this.blur = new THREE.RawShaderMaterial({
            uniforms: { tSource: { value: null }, uStep: { value: new THREE.Vector2() } },
            vertexShader,
            fragmentShader: blurShader,
            depthTest: false,
            depthWrite: false,
        })
        this.quad = new FullScreenQuad(this.prefilter)
        this.texel = new THREE.Vector2()
    }

    get texture() {
        return this.a.texture
    }

    setSize(width, height) {
        const w = Math.max(1, Math.round(width / SCALE))
        const h = Math.max(1, Math.round(height / SCALE))
        this.a.setSize(w, h)
        this.b.setSize(w, h)
        this.texel.set(1 / w, 1 / h)
        this.prefilter.uniforms.uTexel.value.set(0.5 / width, 0.5 / height).multiplyScalar(SCALE)
    }

    pass(renderer, material, output) {
        this.quad.material = material
        renderer.setRenderTarget(output)
        this.quad.render(renderer)
    }

    render(renderer, writeBuffer, readBuffer) {
        this.prefilter.uniforms.tSource.value = readBuffer.texture
        this.pass(renderer, this.prefilter, this.a)
        for (const radius of [1, 2]) {
            this.blur.uniforms.tSource.value = this.a.texture
            this.blur.uniforms.uStep.value.set(this.texel.x * radius, 0)
            this.pass(renderer, this.blur, this.b)
            this.blur.uniforms.tSource.value = this.b.texture
            this.blur.uniforms.uStep.value.set(0, this.texel.y * radius)
            this.pass(renderer, this.blur, this.a)
        }
    }

    dispose() {
        this.a.dispose()
        this.b.dispose()
        this.prefilter.dispose()
        this.blur.dispose()
        this.quad.dispose()
    }
}

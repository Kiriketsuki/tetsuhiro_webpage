import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

// The final pass. It replaces OutputPass, so it does the tone mapping and the sRGB step.
// On top of that it grades the cozy night: a soft highlight shoulder, so only lamps and
// flames reach the top values, a gentle S curve, warm brown lifted shadows and a soft
// vignette. A slight saturation lift keeps the autumn colour vivid under the night light.
// It adds the desktop glow when glow-pass.js runs, and an even darkening (uFade) during
// the move into the bedroom. It has no film grain, no paper texture and no outline.
//
// Texture fetches per pixel: 1 scene colour, plus 1 glow on the desktop tier.

// Round 5 makes the lift a near-neutral warm grey, because the red lift pulled the olive
// lawn and the cream plaster toward brown. The frame no longer reads dim: the palette fix
// in field-noise.js lifted the albedo itself.
export const GRADE = {
    // Round 11 lowers the exposure, so only the windows, the lamps and the campfire read bright.
    exposure: 1.15,
    // Round 10 lifts the saturation, because the review read the frame as muddy brown-olive.
    // Round 12 lifts it again, toward the saturated store page shots.
    saturation: 1.24,
    contrast: 0.16,
    // Round 12 cuts the lift to a trace of brown-indigo. A lift of 0.02 in linear light encodes
    // to about 40 of 255 in sRGB, and the review read it as a grey veil over every dark area.
    // Round 14 raises it a little, so the darkest exterior areas read warm brown-indigo and
    // not near black, still well under the round 11 veil.
    lift: new THREE.Color(0.0095, 0.006, 0.0125),
    vignette: 0.22,
    glow: 0.2,
}

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

const fragmentShader = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tGlow;
uniform float uGlow;
uniform vec2 uAspect;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform float uVignette;
uniform float uFade;
varying vec2 vUv;

#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>

void main() {
    vec3 hdr = texture2D( tDiffuse, vUv ).rgb;
    if ( uGlow > 0.0 ) hdr += texture2D( tGlow, vUv ).rgb * uGlow;
    // A gentle shoulder above 0.8, so lit walls stay in the mid band and only the lamps
    // reach the top of the range.
    hdr = hdr / ( 1.0 + 0.15 * max( hdr - 0.8, 0.0 ) );

    vec3 color = NeutralToneMapping( hdr );
    float value = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = mix( vec3( value ), color, uSaturation );
    // A gentle S curve around the middle grey.
    color = clamp( color + uContrast * ( color - 0.5 ) * ( 1.0 - abs( color - 0.5 ) * 2.0 ), 0.0, 1.0 );
    // Lift the blacks toward a warm brown indigo, so the night stays soft, not crushed.
    color += uLift * ( 1.0 - value ) * ( 1.0 - value );

    vec2 centred = ( vUv - 0.5 ) * uAspect / uAspect.x;
    color *= 1.0 - uVignette * smoothstep( 0.08, 0.42, dot( centred, centred ) );
    // The bedroom move darkens the frame evenly, with no colour shift.
    color *= 1.0 - 0.28 * uFade;

    gl_FragColor = sRGBTransferOETF( vec4( max( color, 0.0 ), 1.0 ) );
    // A dither of 1/255 on the encoded value stops the banding in the dark sky gradient.
    float dither = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    gl_FragColor.rgb += ( dither - 0.5 ) / 255.0;
}
`

export class GradePass extends Pass {
    constructor(grade = GRADE) {
        super()
        this.uniforms = {
            tDiffuse: { value: null },
            tGlow: { value: null },
            uGlow: { value: 0 },
            uAspect: { value: new THREE.Vector2(1, 1) },
            toneMappingExposure: { value: grade.exposure },
            uSaturation: { value: grade.saturation },
            uContrast: { value: grade.contrast },
            uLift: { value: grade.lift.clone() },
            uVignette: { value: grade.vignette },
            uFade: { value: 0 },
        }
        this.glowStrength = grade.glow
        this.material = new THREE.RawShaderMaterial({
            name: 'GradeComposite',
            uniforms: this.uniforms,
            vertexShader,
            fragmentShader,
            depthTest: false,
            depthWrite: false,
        })
        this.quad = new FullScreenQuad(this.material)
    }

    // texture: the blurred glow, or null when the tier has no glow.
    setGlow(texture) {
        this.uniforms.tGlow.value = texture
        this.uniforms.uGlow.value = texture ? this.glowStrength : 0
    }

    setSize(width, height) {
        this.uniforms.uAspect.value.set(width / height, 1)
    }

    render(renderer, writeBuffer, readBuffer) {
        this.uniforms.tDiffuse.value = readBuffer.texture
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
        this.quad.render(renderer)
    }

    dispose() {
        this.material.dispose()
        this.quad.dispose()
    }
}

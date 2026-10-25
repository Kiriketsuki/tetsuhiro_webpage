import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

// The final pass. It replaces OutputPass, so it does the tone mapping and the sRGB step.
// On top of that it grades the night for a soft stylized look: a little more colour, a
// gentle S curve, violet-blue lifted shadows and a soft vignette. It adds the desktop glow
// when glow-pass.js runs, and the rain on the bedroom window.
//
// Texture fetches per pixel: 1 scene colour and 1 glow. The rain only moves the UV.

export const GRADE = {
    exposure: 1.2,
    saturation: 1.12,
    contrast: 0.12,
    lift: new THREE.Color(0.014, 0.012, 0.03),
    vignette: 0.32,
    glow: 0.55,
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
uniform float uRain;
uniform float uTime;
varying vec2 vUv;

#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>

float rainHash( vec2 p ) {
    return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

// Rain on the window glass for the bedroom reveal. Each cell may hold one drop that slides
// down and leaves a short trail. The drops bend the picture like lenses. Returns the UV
// offset in xy and a highlight in z.
vec3 rainOnGlass( vec2 uv, float scale, float speed ) {
    vec2 grid = uv * uAspect * scale;
    vec2 cell = floor( grid );
    float seed = rainHash( cell );
    if ( seed < 0.6 ) return vec3( 0.0 );
    vec2 local = fract( grid ) - 0.5;
    float fall = fract( uTime * speed * ( 0.4 + seed ) + seed * 7.0 );
    vec2 drop = vec2( ( seed - 0.5 ) * 0.5, 0.45 - fall * 0.9 );
    vec2 toDrop = ( local - drop ) * vec2( 1.0, 1.4 );
    float d = length( toDrop );
    float lens = smoothstep( 0.16, 0.06, d );
    float trail = smoothstep( 0.025, 0.0, abs( local.x - drop.x ) ) * ( 1.0 - smoothstep( drop.y, drop.y + 0.3, local.y ) ) * step( drop.y, local.y ) * 0.4;
    return vec3( -toDrop * lens * 0.6 / scale, lens * 0.1 + trail * 0.05 );
}

void main() {
    vec2 uv = vUv;
    float rainLight = 0.0;
    if ( uRain > 0.001 ) {
        vec3 near = rainOnGlass( vUv, 9.0, 0.35 );
        vec3 far = rainOnGlass( vUv + 0.37, 17.0, 0.5 );
        uv += ( near.xy + far.xy * 0.6 ) * uRain;
        rainLight = ( near.z + far.z * 0.6 ) * uRain;
    }

    vec3 hdr = texture2D( tDiffuse, uv ).rgb;
    if ( uGlow > 0.0 ) hdr += texture2D( tGlow, uv ).rgb * uGlow;

    vec3 color = NeutralToneMapping( hdr );
    float value = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
    color = mix( vec3( value ), color, uSaturation );
    // A gentle S curve around the middle grey.
    color = clamp( color + uContrast * ( color - 0.5 ) * ( 1.0 - abs( color - 0.5 ) * 2.0 ), 0.0, 1.0 );
    // Lift the blacks toward violet blue, so the night stays soft instead of crushed.
    color += uLift * ( 1.0 - value ) * ( 1.0 - value );

    color = mix( color, color * vec3( 0.86, 0.92, 1.0 ), uRain * 0.5 ) + rainLight * vec3( 0.55, 0.62, 0.72 );

    vec2 centred = ( vUv - 0.5 ) * uAspect / uAspect.x;
    color *= 1.0 - uVignette * smoothstep( 0.08, 0.42, dot( centred, centred ) );

    gl_FragColor = sRGBTransferOETF( vec4( max( color, 0.0 ), 1.0 ) );
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
            uRain: { value: 0 },
            uTime: { value: 0 },
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

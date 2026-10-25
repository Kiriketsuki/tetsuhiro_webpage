import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { createPaperTexture } from './paper-texture.js'

// The watercolour composite. It replaces OutputPass, so it also does the tone mapping and
// the sRGB step. There is no bloom on any tier. Lights glow through emissive colour and
// glow sprites before this pass.
//
// Texture fetches per pixel: 1 wobble field, 1 centre colour, 8 Sobel neighbours and
// 1 paper grain. That is 11.
//
// The pigment pools live in the toon material, in world space. In screen space they read
// as a texture laid over the whole frame, because they stayed put while the scene moved.

export const LOOK = {
    exposure: 1.15,
    // Screen-UV wobble in pixels. Edges and facets drift a little, like a loose brush.
    wobble: 1.6,
    // Sobel edge darkening. Pigment gathers where the value changes.
    edge: 0.6,
    edgeLow: 0.025,
    edgeHigh: 0.2,
    edgeTint: new THREE.Color(0.38, 0.4, 0.55),
    // Paper grain multiply, and the size of one grain texel in CSS pixels. The grain shows
    // only where there is paint, so the dark sky and haze stay clean.
    grain: 0.1,
    grainScale: 1.2,
    vignette: 0.38,
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
uniform sampler2D tPaper;
uniform vec2 uTexel;
uniform vec2 uAspect;
uniform float uPixelRatio;
uniform float uWobble;
uniform float uEdge;
uniform vec2 uEdgeRange;
uniform vec3 uEdgeTint;
uniform float uGrain;
uniform float uGrainScale;
uniform float uVignette;
varying vec2 vUv;

#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>

// Luma of the linear HDR colour, squashed to 0..1, so the edge test works at any exposure.
float squashedLuma( vec3 c ) {
    float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ) * toneMappingExposure;
    return l / ( 1.0 + l );
}

float lumaAt( vec2 uv ) {
    return squashedLuma( texture2D( tDiffuse, uv ).rgb );
}

void main() {
    // Paper space: one unit is the screen height, so the fields keep their shape on any aspect.
    vec2 paper = vUv * uAspect;

    vec2 wobble = texture2D( tPaper, paper * 0.8 ).gb - 0.5;
    vec2 uv = vUv + wobble * 2.0 * uWobble * uPixelRatio * uTexel;

    vec3 hdr = texture2D( tDiffuse, uv ).rgb;

    vec2 t = uTexel;
    float tl = lumaAt( uv + vec2( -t.x, t.y ) );
    float tc = lumaAt( uv + vec2( 0.0, t.y ) );
    float tr = lumaAt( uv + vec2( t.x, t.y ) );
    float ml = lumaAt( uv + vec2( -t.x, 0.0 ) );
    float mr = lumaAt( uv + vec2( t.x, 0.0 ) );
    float bl = lumaAt( uv + vec2( -t.x, -t.y ) );
    float bc = lumaAt( uv + vec2( 0.0, -t.y ) );
    float br = lumaAt( uv + vec2( t.x, -t.y ) );
    float gx = ( tr + 2.0 * mr + br ) - ( tl + 2.0 * ml + bl );
    float gy = ( tl + 2.0 * tc + tr ) - ( bl + 2.0 * bc + br );
    float edge = smoothstep( uEdgeRange.x, uEdgeRange.y, length( vec2( gx, gy ) ) );

    vec3 color = NeutralToneMapping( hdr );
    float value = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );

    color *= mix( vec3( 1.0 ), uEdgeTint, edge * uEdge );

    // Paper grain stays fixed to the screen, like the sheet under the paint.
    float grain = texture2D( tPaper, gl_FragCoord.xy / ( 256.0 * uGrainScale * uPixelRatio ) ).r;
    color *= 1.0 + uGrain * smoothstep( 0.04, 0.3, value ) * ( grain - 0.55 );

    vec2 centred = ( vUv - 0.5 ) * uAspect / uAspect.x;
    color *= 1.0 - uVignette * smoothstep( 0.08, 0.42, dot( centred, centred ) );

    gl_FragColor = sRGBTransferOETF( vec4( max( color, 0.0 ), 1.0 ) );
}
`

export class WatercolourPass extends Pass {
    constructor(look = LOOK) {
        super()
        this.paper = createPaperTexture()
        this.uniforms = {
            tDiffuse: { value: null },
            tPaper: { value: this.paper },
            uTexel: { value: new THREE.Vector2(1, 1) },
            uAspect: { value: new THREE.Vector2(1, 1) },
            uPixelRatio: { value: 1 },
            toneMappingExposure: { value: look.exposure },
            uWobble: { value: look.wobble },
            uEdge: { value: look.edge },
            uEdgeRange: { value: new THREE.Vector2(look.edgeLow, look.edgeHigh) },
            uEdgeTint: { value: look.edgeTint.clone() },
            uGrain: { value: look.grain },
            uGrainScale: { value: look.grainScale },
            uVignette: { value: look.vignette },
        }
        this.material = new THREE.RawShaderMaterial({
            name: 'WatercolourComposite',
            uniforms: this.uniforms,
            vertexShader,
            fragmentShader,
            depthTest: false,
            depthWrite: false,
        })
        this.quad = new FullScreenQuad(this.material)
    }

    setSize(width, height) {
        this.uniforms.uTexel.value.set(1 / width, 1 / height)
        this.uniforms.uAspect.value.set(width / height, 1)
    }

    setPixelRatio(ratio) {
        this.uniforms.uPixelRatio.value = ratio
    }

    render(renderer, writeBuffer, readBuffer) {
        this.uniforms.tDiffuse.value = readBuffer.texture
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
        this.quad.render(renderer)
    }

    dispose() {
        this.paper.dispose()
        this.material.dispose()
        this.quad.dispose()
    }
}

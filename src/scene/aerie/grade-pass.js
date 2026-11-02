import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

// The final pass. It replaces OutputPass, so it does the tone mapping and the sRGB step.
// On top of that it grades the cozy night: a soft highlight shoulder, so only lamps and
// flames reach the top values, a gentle S curve, warm brown lifted shadows and a soft
// vignette. A slight saturation lift keeps the autumn colour vivid under the night light.
// It adds the desktop glow when glow-pass.js runs, and an even darkening (uFade) during
// the move into the bedroom. It has no film grain and no paper texture. The ink
// outline, the lens blur and the split toning are look options, off by default.
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
// Look options, all off by default. They need the scene depth (createPipeline depth: true).
uniform sampler2D tDepth;
uniform float uDepthOn;
uniform float uNear;
uniform float uFar;
uniform vec2 uTexel;
uniform float uPixel;
uniform float uInk;
uniform vec3 uInkColor;
uniform float uDof;
// The focus distance in metres from the camera rig. 0 reads the depth at the frame middle.
uniform float uFocus;
uniform float uSplit;
varying vec2 vUv;

#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>

float viewDepth( vec2 uv ) {
    // The packing chunk needs GLSL 3, so this is its perspectiveDepthToViewZ written out.
    return uNear * uFar / ( uFar - ( uFar - uNear ) * texture2D( tDepth, uv ).x );
}

// Ink lines from the depth alone. A silhouette line sits on the near side of a depth step.
// A crease line comes from the Laplacian of the inverse depth, which is zero on any plane,
// so flat ground seen at a grazing angle draws no line. The alpha of the scene target is the
// inverted ink mask from toon-material.js: under 0.5 takes ink.
float inkLine( vec2 uv ) {
    float mask = texture2D( tDiffuse, uv ).a;
    if ( mask > 0.5 ) return 0.0;
    float dc = viewDepth( uv );
    if ( dc > 90.0 ) return 0.0;
    vec2 o = uTexel * uPixel * 1.5;
    float l = viewDepth( uv - vec2( o.x, 0.0 ) );
    float r = viewDepth( uv + vec2( o.x, 0.0 ) );
    float d = viewDepth( uv - vec2( 0.0, o.y ) );
    float u = viewDepth( uv + vec2( 0.0, o.y ) );
    float far = max( max( l, r ), max( d, u ) );
    float sil = smoothstep( 0.025, 0.1, ( far - dc ) / dc );
    float lap = ( 1.0 / l + 1.0 / r + 1.0 / d + 1.0 / u - 4.0 / dc ) * dc;
    float crease = smoothstep( 0.012, 0.05, abs( lap ) ) * ( 1.0 - smoothstep( 0.04, 0.1, lap ) );
    return max( sil, crease * 0.75 ) * ( 1.0 - smoothstep( 40.0, 85.0, dc ) );
}

// The depth texture has no MSAA, so one line sample aliases. A small tent over the pixel and
// its four neighbours gives a soft, anti-aliased line. It costs 25 depth reads per pixel.
float ink( vec2 uv ) {
    vec2 o = uTexel * uPixel;
    return min( 1.0, 0.7 * inkLine( uv ) + 0.16 * ( inkLine( uv + vec2( o.x, 0.0 ) ) + inkLine( uv - vec2( o.x, 0.0 ) ) + inkLine( uv + vec2( 0.0, o.y ) ) + inkLine( uv - vec2( 0.0, o.y ) ) ) );
}

// A miniature lens: the blur grows with the depth ratio to the focus. The focus is the rig
// target distance. The frame middle is a poor focus: in the workshop it is a near column. Twelve taps on a golden-angle spiral. A tap in front of the
// pixel counts by its own blur, so a sharp edge does not smear over its own background.
// Everything within about 12 percent of the focus depth stays sharp, so a whole room reads
// clearly at the workshop stop. Only the near frame and the far background soften.
float blurAt( float focus, float depth ) {
    return clamp( ( abs( 1.0 - focus / depth ) - 0.12 ) * 2.0, 0.0, 1.0 );
}

float focusDepth() {
    return uFocus > 0.0 ? uFocus : min( viewDepth( vec2( 0.5 ) ), 120.0 );
}

vec3 lens( vec2 uv, vec3 sharp, float dc ) {
    float focus = focusDepth();
    float coc = blurAt( focus, dc );
    float radius = coc * 8.0 * uPixel;
    if ( radius < 0.5 ) return sharp;
    vec3 sum = sharp;
    float weight = 1.0;
    for ( int i = 0; i < 12; i ++ ) {
        float k = ( float( i ) + 0.5 ) / 12.0;
        float a = float( i ) * 2.39996;
        vec2 tap = uv + vec2( cos( a ), sin( a ) ) * sqrt( k ) * radius * uTexel;
        float td = viewDepth( tap );
        float w = td < dc * 0.92 ? blurAt( focus, td ) : 1.0;
        sum += texture2D( tDiffuse, tap ).rgb * w;
        weight += w;
    }
    return sum / weight;
}

void main() {
    vec4 scene = texture2D( tDiffuse, vUv );
    vec3 hdr = scene.rgb;
    float dc = uDepthOn > 0.5 && uDof > 0.0 ? viewDepth( vUv ) : 0.0;
    if ( uDepthOn > 0.5 && uDof > 0.0 ) hdr = mix( hdr, lens( vUv, hdr, dc ), uDof );
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
    // Split toning: the shade leans indigo and the lit values lean amber.
    color += uSplit * mix( vec3( -0.008, -0.002, 0.012 ), vec3( 0.03, 0.01, -0.016 ), smoothstep( 0.08, 0.6, value ) );
    // Ink fades where the lens blurs, so a soft near frame shows no crisp line.
    float inkFade = uDof > 0.0 && dc > 0.0 ? 1.0 - 0.85 * uDof * blurAt( focusDepth(), dc ) : 1.0;
    if ( uDepthOn > 0.5 && uInk > 0.0 ) color = mix( color, color * uInkColor, uInk * inkFade * ink( vUv ) );

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
            tDepth: { value: null },
            uDepthOn: { value: 0 },
            uNear: { value: 0.1 },
            uFar: { value: 1000 },
            uTexel: { value: new THREE.Vector2(1, 1) },
            uPixel: { value: 1 },
            uInk: { value: 0 },
            uInkColor: { value: new THREE.Color(0.2, 0.14, 0.17) },
            uDof: { value: 0 },
            uFocus: { value: 0 },
            uSplit: { value: 0 },
        }
        this.camera = null
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
        this.uniforms.uTexel.value.set(1 / width, 1 / height)
    }

    // camera: the perspective camera of the island view, or null to turn the depth looks off.
    setCamera(camera, pixelRatio = 1) {
        this.camera = camera
        this.uniforms.uPixel.value = pixelRatio
    }

    render(renderer, writeBuffer, readBuffer) {
        this.uniforms.tDiffuse.value = readBuffer.texture
        const depth = this.camera && readBuffer.depthTexture
        this.uniforms.tDepth.value = depth ? readBuffer.depthTexture : null
        this.uniforms.uDepthOn.value = depth ? 1 : 0
        if (depth) {
            this.uniforms.uNear.value = this.camera.near
            this.uniforms.uFar.value = this.camera.far
        }
        renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
        this.quad.render(renderer)
    }

    dispose() {
        this.material.dispose()
        this.quad.dispose()
    }
}

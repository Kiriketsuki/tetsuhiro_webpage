import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

// The final pass. It replaces OutputPass, so it does the tone mapping and the sRGB step.
// On top of that it grades the cozy night: a soft highlight shoulder, so only lamps and
// flames reach the top values, a gentle S curve, warm brown lifted shadows and a soft
// vignette. A slight saturation lift keeps the autumn colour vivid under the night light.
// It adds the desktop glow when glow-pass.js runs, and an even darkening (uFade) during
// the move into the bedroom, and the six-blade iris (uIris) of the look through the telescope.
// It has no film grain and no paper texture. The ink
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
// A phone GPU reads a sampler at low or medium precision unless the shader asks for more. The
// depth of the aerie sits near 1 with this near and far plane, so a half-float read stepped
// the depth into bands, and the ink drew those bands as contour lines across the lawn, the
// cliff and the walls. Desktop GPUs ignore the qualifier, so the lab never showed it.
precision highp sampler2D;
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
// The focus depth in metres, from the stop's focus point (camera-rig.js).
uniform float uFocus;
// The sharp slab, the ramp after it (shares of the depth) and the blur cap in CSS pixels.
uniform float uLensBand;
uniform float uLensRamp;
uniform float uLensMax;
// The hover focus in metres, its weight and its cap (hover-focus.js).
uniform float uHoverFocus;
uniform float uHover;
uniform float uHoverCap;
// The eased cursor in uv and how much it clears the blur around it.
uniform vec2 uCursor;
uniform float uCursorClear;
// The vignette centre in uv. It leans a little toward the cursor.
uniform vec2 uVignetteCentre;
uniform float uSplit;
// The telescope iris: 0 open, 1 closed.
uniform float uIris;
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
// inverted ink mask from toon-material.js. Under 0.25 takes full ink: the silhouette and the
// creases. Anything above takes the silhouette only, the outline of the shape as this camera
// sees it: about 0.5 is the ground, and 1 is the crowns and every other layer. A crown is a
// cloud of leaf cards with small depth steps inside it, so near 1 the silhouette needs a
// larger step, and only the crown outline draws.
float inkLine( vec2 uv ) {
    float dc = viewDepth( uv );
    if ( dc > 90.0 ) return 0.0;
    // The mask fetch comes after the far-depth early out, so a far pixel skips the read.
    // The target has no mipmaps, so the fetch does not depend on a derivative.
    float mask = texture2D( tDiffuse, uv ).a;
    vec2 o = uTexel * uPixel * 1.5;
    float l = viewDepth( uv - vec2( o.x, 0.0 ) );
    float r = viewDepth( uv + vec2( o.x, 0.0 ) );
    float d = viewDepth( uv - vec2( 0.0, o.y ) );
    float u = viewDepth( uv + vec2( 0.0, o.y ) );
    float far = max( max( l, r ), max( d, u ) );
    float silStep = mix( 0.025, 0.12, smoothstep( 0.6, 0.95, mask ) );
    float sil = smoothstep( silStep, silStep * 3.5, ( far - dc ) / dc );
    float lap = ( 1.0 / l + 1.0 / r + 1.0 / d + 1.0 / u - 4.0 / dc ) * dc;
    float crease = smoothstep( 0.012, 0.05, abs( lap ) ) * ( 1.0 - smoothstep( 0.04, 0.1, lap ) );
    if ( mask > 0.25 ) crease = 0.0;
    return max( sil, crease * 0.75 ) * ( 1.0 - smoothstep( 40.0, 85.0, dc ) );
}

// The depth texture has no MSAA, so one line sample aliases. A small tent over the pixel and
// its four neighbours gives a soft, anti-aliased line. It costs 25 depth reads per pixel.
float ink( vec2 uv ) {
    vec2 o = uTexel * uPixel;
    return min( 1.0, 0.7 * inkLine( uv ) + 0.16 * ( inkLine( uv + vec2( o.x, 0.0 ) ) + inkLine( uv - vec2( o.x, 0.0 ) ) + inkLine( uv + vec2( 0.0, o.y ) ) + inkLine( uv - vec2( 0.0, o.y ) ) ) );
}

// A miniature lens. Each stop names the point it keeps sharp (stops.js focus), so the frame
// is composed and the blur never hunts. The blur reads the depth step from that focus as a
// share of the depth, x = |depth - focus| / depth. A slab of uLensBand around the focus stays
// fully sharp, so the whole house reads as one sharp unit, and a smoothstep ramp then eases
// the blur up to uLensMax. The old thin-lens ramp crossed its sharp cut 0.8 m from the focus,
// so one wall of the house read crisp and the porch beside it soft (lens research,
// 2026-11-02: Godot tilt-shift, pmndrs focusRange, GPU Gems 3 ch. 28).
//
// The hover focus adds a second focal plane at the depth under the resting cursor. It blurs
// what the stop's focus keeps sharp by up to uHoverCap, so the stop's subject never goes fully
// soft. The cursor can also clear the blur in a soft patch around it (uCursorClear). The gather is depth aware: a tap counts only if its own disc reaches this pixel, and a
// tap behind this pixel counts by the smaller disc, so a blurred background never spreads over
// a sharp edge in front of it. A per-pixel spin of the spiral turns banding into fine grain.
const float LENS_TAPS = 16.0;
float blurPx( float depth, vec2 uv ) {
    float s = smoothstep( uLensBand, uLensBand + uLensRamp, abs( depth - uFocus ) / depth );
    float h = smoothstep( uLensBand, uLensBand + uLensRamp, abs( depth - uHoverFocus ) / depth );
    s = mix( s, h * mix( s, 1.0, uHoverCap ), uHover );
    vec2 d = ( uv - uCursor ) * uAspect / uAspect.y;
    float clear = 1.0 - uCursorClear * exp( -dot( d, d ) / 0.018 );
    return uLensMax * s * clear * uPixel;
}

vec3 lens( vec2 uv, vec3 sharp, float dc ) {
    float own = blurPx( dc, uv );
    // The footprint: this pixel's disc, or a nearer neighbour's disc that reaches it.
    float reach = own;
    float far = uLensMax * uPixel;
    for ( int i = 0; i < 4; i ++ ) {
        vec2 dir = vec2( i == 0 ? 1.0 : i == 1 ? -1.0 : 0.0, i == 2 ? 1.0 : i == 3 ? -1.0 : 0.0 );
        vec2 tap = uv + dir * far * uTexel;
        float td = viewDepth( tap );
        if ( td < dc ) reach = max( reach, blurPx( td, tap ) );
    }
    if ( reach < 0.5 ) return sharp;
    float spin = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) * 6.2832;
    vec3 sum = sharp;
    float weight = 1.0;
    for ( int i = 0; i < int( LENS_TAPS ); i ++ ) {
        float k = ( float( i ) + 0.5 ) / LENS_TAPS;
        float a = float( i ) * 2.39996 + spin;
        float dist = sqrt( k ) * reach;
        vec2 tap = uv + vec2( cos( a ), sin( a ) ) * dist * uTexel;
        float td = viewDepth( tap );
        float disc = blurPx( td, tap );
        if ( td > dc ) disc = min( disc, own );
        float w = clamp( disc - dist + 1.0, 0.0, 1.0 );
        sum += texture2D( tDiffuse, tap ).rgb * w;
        weight += w;
    }
    // The gather fades in over half a pixel to a pixel and a half, so no edge switches.
    return mix( sharp, sum / weight, smoothstep( 0.5, 1.5, reach ) );
}

// A camera-shutter iris of six blades, for the look through the telescope. Each blade is a
// half-plane whose edge lies uR from the frame centre, so the opening is a hexagon that
// shrinks and turns as uIris rises. Each blade lies on the one before it, so the visible blade
// is the last of a run of covering blades, and the blade on top casts a soft shadow along its
// edge. The blades are a warm near-black with a thin lit rim on the inner edge.
vec3 iris( vec3 color ) {
    vec2 p = ( vUv - 0.5 ) * uAspect;
    // Open, the hexagon clears the frame corners.
    float r = ( 1.0 - uIris ) * 0.5 * length( uAspect );
    float aa = uTexel.y * 1.5;
    vec3 blade = color;
    for ( int i = 0; i < 6; i ++ ) {
        float a = float( i ) * 1.0472 + uIris * 1.6;
        float s = dot( p, vec2( cos( a ), sin( a ) ) ) - r;
        float next = dot( p, vec2( cos( a + 1.0472 ), sin( a + 1.0472 ) ) ) - r;
        if ( s > 0.0 && next <= 0.0 ) {
            vec3 shade = vec3( 0.028, 0.02, 0.022 ) * ( 0.8 + 0.12 * float( i - i / 2 * 2 ) ) * ( 0.55 + 0.45 * smoothstep( 0.0, 0.05, -next ) );
            shade += vec3( 0.2, 0.12, 0.05 ) * ( 1.0 - smoothstep( aa, aa * 2.5, s ) );
            blade = mix( color, shade, smoothstep( 0.0, aa, s ) );
        }
    }
    return blade;
}

void main() {
    vec4 scene = texture2D( tDiffuse, vUv );
    vec3 hdr = scene.rgb;
    bool lensOn = uDepthOn > 0.5 && uDof > 0.0;
    float dc = lensOn ? viewDepth( vUv ) : 0.0;
    if ( lensOn ) hdr = mix( hdr, lens( vUv, hdr, dc ), uDof );
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
    float inkFade = uDof > 0.0 && dc > 0.0 ? 1.0 - 0.55 * uDof * smoothstep( 1.0, 5.0, blurPx( dc, vUv ) / uPixel ) : 1.0;
    if ( uDepthOn > 0.5 && uInk > 0.0 ) color = mix( color, color * uInkColor, uInk * inkFade * ink( vUv ) );

    vec2 centred = ( vUv - uVignetteCentre ) * uAspect / uAspect.x;
    color *= 1.0 - uVignette * smoothstep( 0.08, 0.42, dot( centred, centred ) );
    // The bedroom move darkens the frame evenly, with no colour shift.
    color *= 1.0 - 0.28 * uFade;
    if ( uIris > 0.0 ) color = iris( color );

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
            uFocus: { value: 10 },
            uLensBand: { value: 0.12 },
            uLensRamp: { value: 0.45 },
            uLensMax: { value: 6 },
            uHoverFocus: { value: 10 },
            uHover: { value: 0 },
            uHoverCap: { value: 0.8 },
            uCursor: { value: new THREE.Vector2(0.5, 0.5) },
            uCursorClear: { value: 0 },
            uVignetteCentre: { value: new THREE.Vector2(0.5, 0.5) },
            uSplit: { value: 0 },
            uIris: { value: 0 },
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

    // camera: the perspective camera of the aerie view, or null to turn the depth looks off.
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

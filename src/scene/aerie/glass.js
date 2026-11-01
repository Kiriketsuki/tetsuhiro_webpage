import * as THREE from 'three'

// Clear window glass for the night island. It is unlit. It adds a faint cool tint and a
// fresnel reflection of the sky gradient toward the edges of view on top of what lies
// behind, and it dims that only a little. It takes no warm lamp term. Four panes stack in
// most views of the tower, and a normal blend toward a tint colour turned that stack into
// a milky grey film, so the glass uses a premultiplied blend: the walls behind keep their
// colour, and the lit rooms show through. The frames (web_glass_edge) are thin dark lines.

// Round 6 makes the cool tint visible. At 0.03 the review saw no tint at all. A stronger
// tint turned four stacked panes into a milky film, so each pane adds only a little.
// Round 20 cools it a step, so the panes read as clear glass with a faint cool tint and not
// as absent panes (S2, S3, S7 phone).
const TINT = 0x8eb0d4
// How much each pane dims what lies behind it, and how much tint it adds.
const OPACITY = 0.035
// Round 11 tints what lies behind each pane through a constant blend colour, per channel, so
// the panes read cool blue-teal glass without any added milky film. Four stacked panes keep
// about two thirds of the warm red behind them.
// Round 12 moves the filter closer to neutral. Four stacked panes at the round 11 filter
// dimmed the warm room behind them by a third, and the review read the S2 and S7 glass as a
// milky grey-blue film over the shelves.
// Round 13 cools the filter a step, so each pane reads as clear glass with a faint cool tint
// and not as an empty frame (S2).
// Round 14 moves it closer to neutral again. Where two balustrade panes overlap on screen, the
// filter applied twice and the pair read as a greyer pane than its neighbours (S3).
// Round 20 cools it a little again, with a stronger edge reflection in the shader.
const FILTER = new THREE.Color(0.93, 0.96, 0.985)
const FRAME = 0x2b2a26
const FRAME_OPACITY = 0.85

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    vNormal = normalize( mat3( modelMatrix ) * normal );
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
}
`

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uTint;
uniform float uOpacity;
uniform vec3 uHorizon;
uniform vec3 uZenith;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
    vec3 view = normalize( cameraPosition - vWorld );
    vec3 n = normalize( vNormal );
    n *= sign( dot( n, view ) + 1e-4 );
    // Round 9 cuts the edge reflection from a quarter to a few percent. The workshop canopy and
    // the side panes meet the S2 view at a grazing angle, and the full reflection of the grey-blue
    // horizon laid a milky grey-white film over the ceiling and the bookshelf behind them.
    // Round 12 cuts it again, to a trace. Stacked panes seen edge-on read as an opaque
    // blue-violet slab beside the stair (S1).
    float fresnel = 0.01 + pow( 1.0 - clamp( dot( n, view ), 0.0, 1.0 ), 4.0 ) * 0.08;
    vec3 bounce = reflect( -view, n );
    vec3 sky = mix( uHorizon, uZenith, clamp( bounce.y, 0.0, 1.0 ) );
    // Premultiplied: rgb is added, alpha only dims what lies behind.
    // Round 9 cuts the added tint to a fifth. The output is linear light, so a tint that small
    // still lifted the dark warm ceiling behind the canopy panes toward a cool grey after the
    // sRGB encode, and several stacked panes read as a milky film. The panes now keep the cool
    // cast mainly by dimming the warm light behind them a little.
    // Round 12 drops the diagonal sheen of round 11. On stacked panes it added up to the blue
    // band that the review read as milky glass.
    vec3 color = uTint * 0.06 * uOpacity + sky * fresnel * 1.6;
    gl_FragColor = vec4( color, uOpacity + fresnel * 0.15 );
    // The haze fades the added colour toward the haze times the pane's own alpha, so a far
    // pane does not glow in the haze colour.
    #ifdef USE_FOG
        float glassFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
        gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * gl_FragColor.a, glassFog );
    #endif
}
`

export function createGlassMaterial({ horizon, zenith }) {
    return new THREE.ShaderMaterial({
        name: 'aerie.glass',
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
                uTint: { value: new THREE.Color(TINT) },
                uOpacity: { value: OPACITY },
                uHorizon: { value: horizon.clone() },
                uZenith: { value: zenith.clone() },
            },
        ]),
        vertexShader,
        fragmentShader,
        transparent: true,
        premultipliedAlpha: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.ConstantColorFactor,
        blendColor: FILTER,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: true,
    })
}

export function createFrameMaterial() {
    return new THREE.MeshBasicMaterial({
        name: 'aerie.glass_edge',
        color: FRAME,
        transparent: true,
        opacity: FRAME_OPACITY,
        side: THREE.DoubleSide,
    })
}

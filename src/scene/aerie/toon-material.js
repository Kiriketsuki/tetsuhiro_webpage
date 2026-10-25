import * as THREE from 'three'

// One flat toon look for the whole urban aerie island. Every opaque part shares one
// material, so the island compiles one program. The baked vertex colours carry all the
// colour, and they are smooth fields, so no per-face jitter enters here.
//
// The patch replaces the light loop of MeshLambertMaterial with a fixed rig in uniforms.
// The scene needs no three.js lights, so a late light can never recompile the island.

const CACHE_KEY = 'aerie-toon-v1'
// At most this many warm bounce spots, near the lit windows and the entry light.
export const TOON_BOUNCES = 4

// Moon light steps over half-Lambert (n.l * 0.5 + 0.5). Nearest filtering keeps each step
// hard, and a flat facet has one normal, so each facet gets exactly one step.
const RAMP = [0.06, 0.24, 0.58, 1.0]

function rampTexture(steps) {
    const data = new Uint8Array(steps.length * 4)
    steps.forEach((value, i) => data.set([value * 255, value * 255, value * 255, 255], i * 4))
    const texture = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true
    return texture
}

// Night colours in linear light. The sky side is a cool blue, the ground side a deep navy,
// and the moon a pale blue white.
const NIGHT = {
    sky: new THREE.Color(0x3e5a86),
    ground: new THREE.Color(0x0d1830),
    moon: new THREE.Color(0x9fb8dc),
    warm: new THREE.Color(0xff9a52),
}

export function createToonUniforms({ moonDirection, bounces = [], warmStrength = 0.8 }) {
    const spots = Array.from({ length: TOON_BOUNCES }, (_, i) => {
        const spot = bounces[i]
        return spot ? new THREE.Vector4(spot.x, spot.y, spot.z, spot.radius) : new THREE.Vector4(0, -1e4, 0, 0)
    })
    return {
        uToonRamp: { value: rampTexture(RAMP) },
        uToonMoonDir: { value: moonDirection.clone().normalize() },
        uToonMoon: { value: NIGHT.moon.clone().multiplyScalar(0.9) },
        uToonSky: { value: NIGHT.sky.clone().multiplyScalar(0.55) },
        uToonGround: { value: NIGHT.ground.clone().multiplyScalar(0.5) },
        uToonWarm: { value: NIGHT.warm.clone().multiplyScalar(warmStrength) },
        uToonBounce: { value: spots },
        uToonSaturation: { value: 0.78 },
        uToonPool: { value: 0.3 },
        uToonPoolScale: { value: 0.32 },
    }
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vToonWorld;
`
const VERTEX_MAIN = /* glsl */ `
#include <project_vertex>
vToonWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
`

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vToonWorld;
uniform sampler2D uToonRamp;
uniform vec3 uToonMoonDir;
uniform vec3 uToonMoon;
uniform vec3 uToonSky;
uniform vec3 uToonGround;
uniform vec3 uToonWarm;
uniform vec4 uToonBounce[ ${TOON_BOUNCES} ];
uniform float uToonSaturation;
uniform float uToonPool;
uniform float uToonPoolScale;

// Value noise in world space for the pigment pools. It moves with the island, so it reads as
// paint on the surface. One blotch spans a few metres, far wider than a facet, so each facet
// still reads as one tone.
float toonHash( vec3 p ) {
    p = fract( p * 0.3183099 + 0.1 );
    p *= 17.0;
    return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float toonNoise( vec3 x ) {
    vec3 i = floor( x );
    vec3 f = x - i;
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
        mix( mix( toonHash( i ), toonHash( i + vec3( 1, 0, 0 ) ), f.x ),
             mix( toonHash( i + vec3( 0, 1, 0 ) ), toonHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
        mix( mix( toonHash( i + vec3( 0, 0, 1 ) ), toonHash( i + vec3( 1, 0, 1 ) ), f.x ),
             mix( toonHash( i + vec3( 0, 1, 1 ) ), toonHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
`

// The normal is in view space. Multiplying by viewMatrix from the left side applies the
// transpose, which turns a view-space direction back into world space.
const FRAGMENT_LIGHT = /* glsl */ `
vec3 toonN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
float toonStep = texture2D( uToonRamp, vec2( dot( toonN, uToonMoonDir ) * 0.5 + 0.5, 0.5 ) ).r;
vec3 toonLight = mix( uToonGround, uToonSky, toonN.y * 0.5 + 0.5 ) + uToonMoon * toonStep;
vec3 toonWarm = vec3( 0.0 );
for ( int i = 0; i < ${TOON_BOUNCES}; i ++ ) {
    vec3 toLight = uToonBounce[ i ].xyz - vToonWorld;
    float r2 = uToonBounce[ i ].w * uToonBounce[ i ].w;
    float near = r2 / ( r2 + dot( toLight, toLight ) );
    toonWarm += near * near * ( 0.55 + 0.45 * dot( toonN, normalize( toLight ) ) );
}
toonLight += uToonWarm * toonWarm;
// Night mutes the baked colours a little. This acts on the smooth colour field, never per face.
vec3 toonAlbedo = mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, uToonSaturation );
// Pigment pools gather in the shadow steps: some patches deepen and others lift.
float toonPool = toonNoise( vToonWorld * uToonPoolScale ) - 0.5;
toonAlbedo *= 1.0 - uToonPool * ( 1.0 - toonStep ) * toonPool * 2.0;
reflectedLight.indirectDiffuse += toonAlbedo * toonLight;
`

function patch(uniforms) {
    return (shader) => {
        Object.assign(shader.uniforms, uniforms)
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
            .replace('#include <project_vertex>', VERTEX_MAIN)
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
            .replace('#include <lights_fragment_begin>', FRAGMENT_LIGHT)
            .replace('#include <lights_fragment_maps>', '')
            .replace('#include <lights_fragment_end>', '')
    }
}

// Builds a toon material. All toon materials share the uniforms object and the cache key,
// so the glass and the opaque parts reuse one program.
export function createToonMaterial(uniforms, options = {}) {
    const material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        ...options,
    })
    material.onBeforeCompile = patch(uniforms)
    material.customProgramCacheKey = () => CACHE_KEY
    return material
}

import * as THREE from 'three'

// One toon look for the whole urban aerie island, after the soft stylized 3D of Leaf it
// Alone, at night. Every opaque part shares one material, so the island compiles one
// program. The baked vertex colours carry all the colour, as smooth fields, so no per-face
// jitter enters here.
//
// The light blends each facet's flat normal with a creased smooth normal (soft-normals.js),
// so the low-poly facets still read while the tones ease across gentle bends. The moon
// light has a soft cel terminator, and a cool rim outlines the forms.
//
// The patch replaces the light loop of MeshLambertMaterial with a fixed rig in uniforms.
// The scene needs no three.js lights, so a late light can never recompile the island.

const CACHE_KEY = 'aerie-toon-v2'
// At most this many warm bounce spots: lit windows, the entry light and the campfire.
export const TOON_BOUNCES = 5

// Night colours in linear light: a cool blue sky side, a violet navy ground side, a pale
// blue moon and a warm lamp orange.
const NIGHT = {
    sky: new THREE.Color(0x46619a),
    ground: new THREE.Color(0x1a1838),
    moon: new THREE.Color(0xb4c8ec),
    warm: new THREE.Color(0xff9142),
    rim: new THREE.Color(0x7f9fd8),
}

export function createToonUniforms({ moonDirection, bounces = [], warmStrength = 1.7 }) {
    const spots = Array.from({ length: TOON_BOUNCES }, (_, i) => {
        const spot = bounces[i]
        return spot ? new THREE.Vector4(spot.x, spot.y, spot.z, spot.radius) : new THREE.Vector4(0, -1e4, 0, 0)
    })
    return {
        uToonMoonDir: { value: moonDirection.clone().normalize() },
        uToonMoon: { value: NIGHT.moon.clone().multiplyScalar(0.95) },
        uToonSky: { value: NIGHT.sky.clone().multiplyScalar(0.5) },
        uToonGround: { value: NIGHT.ground.clone().multiplyScalar(0.55) },
        uToonWarm: { value: NIGHT.warm.clone().multiplyScalar(warmStrength) },
        uToonRim: { value: NIGHT.rim.clone().multiplyScalar(0.35) },
        uToonBounce: { value: spots },
        uToonSaturation: { value: 1.0 },
        // 0 keeps pure flat facets, 1 is fully smooth. Three quarters keeps a hint of the facets.
        uToonSoftness: { value: 0.78 },
    }
}

const VERTEX_PARS = /* glsl */ `
attribute vec3 flatNormal;
varying vec3 vToonWorld;
varying vec3 vToonFlat;
`
const VERTEX_MAIN = /* glsl */ `
#include <project_vertex>
vToonWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vToonFlat = mat3( modelMatrix ) * flatNormal;
`

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vToonWorld;
varying vec3 vToonFlat;
uniform vec3 uToonMoonDir;
uniform vec3 uToonMoon;
uniform vec3 uToonSky;
uniform vec3 uToonGround;
uniform vec3 uToonWarm;
uniform vec3 uToonRim;
uniform vec4 uToonBounce[ ${TOON_BOUNCES} ];
uniform float uToonSaturation;
uniform float uToonSoftness;
`

// The normal is in view space. Multiplying by viewMatrix from the left side applies the
// transpose, which turns a view-space direction back into world space.
//
// The moon casts the only shadow. The scene holds one DirectionalLight for it, so three.js
// sets up the shadow map, and this block reads that map directly.
//
// A mesh without a flatNormal attribute reads zeros there, so it falls back to the smooth
// normal alone.
const FRAGMENT_LIGHT = /* glsl */ `
vec3 toonSmooth = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
vec3 toonFlat = vToonFlat;
float toonFlatLength = length( toonFlat );
toonFlat = toonFlatLength > 0.5 ? toonFlat / toonFlatLength : toonSmooth;
toonFlat *= sign( dot( toonFlat, toonSmooth ) + 1e-4 );
vec3 toonN = normalize( mix( toonFlat, toonSmooth, uToonSoftness ) );

float toonShadow = 1.0;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow toonMoonShadow = directionalLightShadows[ 0 ];
    toonShadow = getShadow( directionalShadowMap[ 0 ], toonMoonShadow.shadowMapSize, toonMoonShadow.shadowIntensity,
        toonMoonShadow.shadowBias, toonMoonShadow.shadowRadius, vDirectionalShadowCoord[ 0 ] );
#endif
// A soft cel terminator, and a small lift on the faces that look straight at the moon.
float toonNL = dot( toonN, uToonMoonDir );
float toonStep = ( 0.1 + 0.62 * smoothstep( -0.12, 0.18, toonNL ) + 0.28 * smoothstep( 0.45, 0.8, toonNL ) ) * toonShadow;
vec3 toonLight = mix( uToonGround, uToonSky, toonN.y * 0.5 + 0.5 ) + uToonMoon * toonStep;

vec3 toonWarm = vec3( 0.0 );
for ( int i = 0; i < ${TOON_BOUNCES}; i ++ ) {
    vec3 toLight = uToonBounce[ i ].xyz - vToonWorld;
    float r2 = uToonBounce[ i ].w * uToonBounce[ i ].w;
    float near = r2 / ( r2 + dot( toLight, toLight ) );
    toonWarm += near * near * ( 0.55 + 0.45 * dot( toonN, normalize( toLight ) ) );
}
toonLight += uToonWarm * toonWarm;

vec3 toonAlbedo = mix( vec3( dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ), diffuseColor.rgb, uToonSaturation );
reflectedLight.indirectDiffuse += toonAlbedo * toonLight;

// A cool rim on the smooth normal, so the silhouettes read soft and rounded.
vec3 toonView = normalize( cameraPosition - vToonWorld );
float toonRim = pow( 1.0 - clamp( dot( toonSmooth, toonView ), 0.0, 1.0 ), 3.0 );
reflectedLight.indirectDiffuse += uToonRim * toonRim * ( 0.4 + 0.6 * toonAlbedo );
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
